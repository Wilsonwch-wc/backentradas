import pool from "../config/db.js";

/**
 * Guarda el layout completo de un evento en una sola petición atómica.
 * Reemplaza la lógica de guardar mesas/asientos/áreas uno por uno desde el frontend.
 */
export const guardarLayoutCompleto = async (req, res) => {
  const { eventoId } = req.params;
  const {
    forma_espacio,
    escenario,
    hoja_ancho,
    hoja_alto,
    mesas = [],
    asientos = [],
    areas = [],
    modo_layout = 'grid',
  } = req.body;

  const modoLayout = ['grid', 'libre'].includes(modo_layout) ? modo_layout : 'grid';

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Función helper: ¿es un ID real de BD? (no un ID temporal del frontend)
    const isRealId = (id) => id && typeof id === "number" && id <= 1_000_000;

    // ── PASO 1: Actualizar configuración del evento ─────────────────────────
    await connection.execute(
      `UPDATE eventos SET
         forma_espacio    = ?,
         escenario_x      = ?,
         escenario_y      = ?,
         escenario_width  = ?,
         escenario_height = ?,
         escenario_celdas = ?,
         hoja_ancho       = ?,
         hoja_alto        = ?,
         layout_bloqueado = 1
       WHERE id = ?`,
      [
        forma_espacio || null,
        escenario?.x ?? null,
        escenario?.y ?? null,
        escenario?.width ?? null,
        escenario?.height ?? null,
        req.body.escenario_celdas ? JSON.stringify(req.body.escenario_celdas) : null,
        hoja_ancho ?? null,
        hoja_alto ?? null,
        eventoId,
      ],
    );

    // ── PASO 2: Áreas ───────────────────────────────────────────────────────
    const [areasExistentes] = await connection.execute(
      "SELECT id FROM areas_layout WHERE evento_id = ?",
      [eventoId],
    );
    const idsAreasEnLayout = areas
      .filter((a) => isRealId(a.id))
      .map((a) => a.id);

    // Eliminar áreas que ya no están en el nuevo layout
    for (const areaExist of areasExistentes) {
      if (!idsAreasEnLayout.includes(areaExist.id)) {
        await connection.execute("DELETE FROM areas_layout WHERE id = ?", [
          areaExist.id,
        ]);
      }
    }

    // Mapa: id-frontend → id-real-en-BD
    const areaIdMap = {};

    for (const area of areas) {
      const esNueva = !isRealId(area.id);
      const tipoArea = ["SILLAS", "MESAS", "PERSONAS"].includes(area.tipo_area)
        ? area.tipo_area
        : "SILLAS";
      const formaArea = ["rectangulo", "circulo"].includes(area.forma)
        ? area.forma
        : "rectangulo";

      if (esNueva) {
        const [result] = await connection.execute(
          `INSERT INTO areas_layout
             (evento_id, nombre, posicion_x, posicion_y, ancho, alto,
              color, tipo_area, capacidad_personas, forma, tipo_precio_id, celdas_excluidas)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            eventoId,
            area.nombre,
            Math.round(area.x),
            Math.round(area.y),
            Math.round(area.width),
            Math.round(area.height),
            area.color || "#CCCCCC",
            tipoArea,
            area.capacidad_personas ?? null,
            formaArea,
            area.tipo_precio_id ?? null,
            area.celdas_excluidas ? JSON.stringify(area.celdas_excluidas) : null,
          ],
        );
        areaIdMap[area.id] = result.insertId;
      } else {
        await connection.execute(
          `UPDATE areas_layout
           SET nombre=?, posicion_x=?, posicion_y=?, ancho=?, alto=?, color=?,
               tipo_area=?, capacidad_personas=?, forma=?, tipo_precio_id=?, celdas_excluidas=?, updated_at=NOW()
           WHERE id = ?`,
          [
            area.nombre,
            Math.round(area.x),
            Math.round(area.y),
            Math.round(area.width),
            Math.round(area.height),
            area.color || "#CCCCCC",
            tipoArea,
            area.capacidad_personas ?? null,
            formaArea,
            area.tipo_precio_id ?? null,
            area.celdas_excluidas ? JSON.stringify(area.celdas_excluidas) : null,
            area.id,
          ],
        );
        areaIdMap[area.id] = area.id;
      }
    }

    // Helper para resolver area_id (real o temporal)
    const resolveAreaId = (rawId) => {
      if (!rawId) return null;
      return areaIdMap[rawId] ?? (isRealId(rawId) ? rawId : null);
    };

    // ── PASO 3: Mesas ───────────────────────────────────────────────────────
    // Mesas que tienen compras activas (no se pueden eliminar)
    const [comprasMesasRows] = await connection.execute(
      `SELECT DISTINCT m.id
       FROM mesas m
       INNER JOIN compras_mesas cm ON cm.mesa_id = m.id
       WHERE m.evento_id = ?`,
      [eventoId],
    );
    const idsProtegidosMesas = new Set(comprasMesasRows.map((r) => r.id));

    // Mesas actualmente en la BD para este evento
    const [mesasExistentes] = await connection.execute(
      "SELECT id FROM mesas WHERE evento_id = ?",
      [eventoId],
    );
    const setMesasExistentes = new Set(mesasExistentes.map((m) => m.id));

    // IDs de mesas con ID real que siguen en el nuevo layout
    const idsMesasEnLayout = mesas
      .filter((m) => isRealId(m.id))
      .map((m) => m.id);

    // Eliminar mesas que ya no están en el layout y no tienen compras
    for (const mesaExist of mesasExistentes) {
      if (
        !idsMesasEnLayout.includes(mesaExist.id) &&
        !idsProtegidosMesas.has(mesaExist.id)
      ) {
        // Primero eliminar sus sillas que no tengan compras
        await connection.execute(
          `DELETE a FROM asientos a
           LEFT JOIN compras_asientos ca ON ca.asiento_id = a.id
           WHERE a.mesa_id = ? AND ca.asiento_id IS NULL`,
          [mesaExist.id],
        );
        await connection.execute("DELETE FROM mesas WHERE id = ?", [
          mesaExist.id,
        ]);
      }
    }

    // Offset temporal para evitar conflictos de numero_mesa durante el upsert
    // (evita el error "Ya existe una mesa con ese número")
    await connection.execute(
      "UPDATE mesas SET numero_mesa = id + 100000 WHERE evento_id = ?",
      [eventoId],
    );

    // Ordenar mesas por posición para asignar numero_mesa secuencial
    const mesasOrdenadas = [...mesas].sort((a, b) => {
      const ay = a.y ?? 0;
      const by = b.y ?? 0;
      if (Math.abs(ay - by) > 5) return ay - by;
      return (a.x ?? 0) - (b.x ?? 0);
    });

    // Mapa: id-frontend-mesa → id-real-en-BD
    const mesaIdMap = {};

    for (let i = 0; i < mesasOrdenadas.length; i++) {
      const mesa = mesasOrdenadas[i];
      const numeroMesa = i + 1;
      const esExistente = isRealId(mesa.id) && setMesasExistentes.has(mesa.id);
      const capacidad = Math.max(1, parseInt(mesa.capacidad_sillas) || 1);
      const codigo = mesa.codigo_mesa?.trim()
        ? String(mesa.codigo_mesa).trim().toUpperCase()
        : null;
      const areaId = resolveAreaId(mesa.area_id);

      if (esExistente) {
        await connection.execute(
          `UPDATE mesas
           SET numero_mesa=?, codigo_mesa=?, capacidad_sillas=?, tipo_precio_id=?,
               area_id=?, posicion_x=?, posicion_y=?, ancho=?, alto=?,
               precio_mesa_completa=?, precio_silla_individual=?, venta_solo_mesa=?,
               grid_col=?, grid_row=?,
               updated_at=NOW()
           WHERE id = ?`,
          [
            numeroMesa,
            codigo,
            capacidad,
            mesa.tipo_precio_id,
            areaId,
            Math.round(mesa.x),
            Math.round(mesa.y),
            Math.round(mesa.width),
            Math.round(mesa.height),
            mesa.precio_mesa_completa ?? null,
            mesa.precio_silla_individual ?? null,
            mesa.venta_solo_mesa ? 1 : 0,
            mesa.grid_col ?? null,
            mesa.grid_row ?? null,
            mesa.id,
          ],
        );
        mesaIdMap[mesa.id] = mesa.id;
      } else {
        const [result] = await connection.execute(
          `INSERT INTO mesas
             (evento_id, numero_mesa, codigo_mesa, capacidad_sillas, tipo_precio_id,
              area_id, posicion_x, posicion_y, ancho, alto,
              precio_mesa_completa, precio_silla_individual, venta_solo_mesa,
              grid_col, grid_row)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            eventoId,
            numeroMesa,
            codigo,
            capacidad,
            mesa.tipo_precio_id,
            areaId,
            Math.round(mesa.x),
            Math.round(mesa.y),
            Math.round(mesa.width),
            Math.round(mesa.height),
            mesa.precio_mesa_completa ?? null,
            mesa.precio_silla_individual ?? null,
            mesa.venta_solo_mesa ? 1 : 0,
            mesa.grid_col ?? null,
            mesa.grid_row ?? null,
          ],
        );
        mesaIdMap[mesa.id] = result.insertId;
      }
    }

    // ── PASO 4: Asientos ────────────────────────────────────────────────────
    // Identificar asientos que tienen compras activas (no se pueden re-insertar)
    const [protectedAsientoRows] = await connection.execute(
      `SELECT DISTINCT a.id
       FROM asientos a
       INNER JOIN compras_asientos ca ON ca.asiento_id = a.id
       WHERE a.evento_id = ?`,
      [eventoId],
    );
    const idsProtegidosAsientos = new Set(
      protectedAsientoRows.map((r) => r.id),
    );

    // Eliminar solo los asientos que NO tienen compras (los protegidos se actualizan)
    await connection.execute(
      `DELETE a FROM asientos a
       LEFT JOIN compras_asientos ca ON ca.asiento_id = a.id
       WHERE a.evento_id = ? AND ca.asiento_id IS NULL`,
      [eventoId],
    );

    // Procesar cada asiento del nuevo layout:
    // - Si tiene compra activa (protegido): UPDATE su posición y datos
    // - Si es nuevo o sin compras: INSERT normal
    for (const asiento of asientos) {
      let mesaId = null;
      if (asiento.mesa_id) {
        mesaId =
          mesaIdMap[asiento.mesa_id] ??
          (isRealId(asiento.mesa_id) ? asiento.mesa_id : null);
      }
      const areaId = resolveAreaId(asiento.area_id);
      const esProtegido =
        isRealId(asiento.id) && idsProtegidosAsientos.has(asiento.id);

      if (esProtegido) {
        await connection.execute(
          `UPDATE asientos
           SET numero_asiento=?, codigo_asiento=?, tipo_precio_id=?,
               posicion_x=?, posicion_y=?, area_id=?, mesa_id=?,
               grid_col=?, grid_row=?
           WHERE id = ?`,
          [
            asiento.numero_asiento,
            asiento.codigo_asiento || null,
            asiento.tipo_precio_id,
            asiento.x != null ? Math.round(asiento.x) : null,
            asiento.y != null ? Math.round(asiento.y) : null,
            areaId,
            mesaId,
            asiento.grid_col ?? null,
            asiento.grid_row ?? null,
            asiento.id,
          ],
        );
      } else {
        await connection.execute(
          `INSERT INTO asientos
             (evento_id, mesa_id, numero_asiento, codigo_asiento, tipo_precio_id,
              posicion_x, posicion_y, area_id, grid_col, grid_row)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            eventoId,
            mesaId,
            asiento.numero_asiento,
            asiento.codigo_asiento || null,
            asiento.tipo_precio_id,
            asiento.x != null ? Math.round(asiento.x) : null,
            asiento.y != null ? Math.round(asiento.y) : null,
            areaId,
            asiento.grid_col ?? null,
            asiento.grid_row ?? null,
          ],
        );
      }
    }

    await connection.execute(
        "UPDATE eventos SET modo_layout = ? WHERE id = ?",
        [modoLayout, eventoId]
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Layout guardado exitosamente",
      data: {
        mesas_guardadas: mesasOrdenadas.length,
        asientos_guardados: asientos.length,
        areas_guardadas: areas.length,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("❌ Error al guardar layout completo:", error);
    res.status(500).json({
      success: false,
      message: "Error al guardar el layout: " + error.message,
    });
  } finally {
    connection.release();
  }
};
