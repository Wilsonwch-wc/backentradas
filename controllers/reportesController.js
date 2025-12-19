import pool from '../config/db.js';

const buildDetalleCompraEspecial = (asientos = [], mesas = [], totalEntradas = 0) => {
  const partes = [];

  if (mesas.length > 0) {
    const totalSillasMesas = mesas.reduce((acc, mesa) => acc + (mesa.cantidad_sillas || 0), 0);
    const mesasLista = mesas
      .map((mesa) => `M${mesa.numero_mesa || mesa.mesa_id || mesa.id || ''}`)
      .join(', ');
    partes.push(
      `${mesas.length > 1 ? 'Mesas' : 'Mesa'} ${mesasLista} (${totalSillasMesas} ${totalSillasMesas === 1 ? 'silla' : 'sillas'})`
    );
  }

  if (asientos.length > 0) {
    const asientosLista = asientos
      .map((asiento) => {
        const mesaLabel = asiento.numero_mesa || asiento.mesa_id ? `M${asiento.numero_mesa || asiento.mesa_id}-` : '';
        return `${mesaLabel}S${asiento.numero_asiento || asiento.asiento_id || asiento.id || ''}`;
      })
      .join(', ');
    partes.push(`Sillas: ${asientosLista}`);
  }

  if (partes.length === 0 && totalEntradas > 0) {
    partes.push(`${totalEntradas} entrada(s)`);
  }

  return partes.join(' | ');
};

export const obtenerEventosParaReportes = async (_req, res) => {
  try {
    const [eventos] = await pool.execute(`
      SELECT 
        id,
        titulo,
        hora_inicio,
        tipo_evento,
        limite_entradas,
        capacidad_maxima,
        CASE WHEN hora_inicio >= NOW() THEN 1 ELSE 0 END AS habilitado
      FROM eventos
      ORDER BY hora_inicio DESC
    `);

    res.json({
      success: true,
      data: eventos
    });
  } catch (error) {
    console.error('Error al obtener eventos para reportes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los eventos',
      error: error.message
    });
  }
};

export const obtenerReportePorEvento = async (req, res) => {
  try {
    const { id } = req.params;

    const [eventos] = await pool.execute(
      `
        SELECT 
          id,
          titulo,
          hora_inicio,
          tipo_evento,
          limite_entradas,
          capacidad_maxima,
          CASE WHEN hora_inicio >= NOW() THEN 1 ELSE 0 END AS habilitado
        FROM eventos
        WHERE id = ?
      `,
      [id]
    );

    if (eventos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    const evento = eventos[0];

    const [compras] = await pool.execute(
      `
        SELECT 
          c.id,
          c.codigo_unico,
          c.cliente_nombre,
          c.cliente_email,
          c.cliente_telefono,
          c.cantidad,
          c.total,
          c.estado,
          c.fecha_compra,
          c.fecha_pago,
          c.fecha_confirmacion
        FROM compras c
        WHERE c.evento_id = ?
        ORDER BY c.fecha_compra DESC
      `,
      [id]
    );

    const compraIds = compras.map((c) => c.id);
    let asientos = [];
    let mesas = [];

    if (compraIds.length > 0) {
      [asientos] = await pool.query(
        `
          SELECT 
            ca.id,
            ca.compra_id,
            ca.estado,
            ca.precio,
            a.id AS asiento_id,
            a.numero_asiento,
            a.mesa_id,
            a.area_id,
            m.numero_mesa
          FROM compras_asientos ca
          INNER JOIN asientos a ON ca.asiento_id = a.id
          LEFT JOIN mesas m ON a.mesa_id = m.id
          WHERE ca.compra_id IN (?)
          ORDER BY m.numero_mesa, a.numero_asiento
        `,
        [compraIds]
      );

      [mesas] = await pool.query(
        `
          SELECT 
            cm.id,
            cm.compra_id,
            cm.estado,
            cm.cantidad_sillas,
            cm.precio_total,
            cm.mesa_id,
            m.numero_mesa
          FROM compras_mesas cm
          INNER JOIN mesas m ON cm.mesa_id = m.id
          WHERE cm.compra_id IN (?)
          ORDER BY m.numero_mesa
        `,
        [compraIds]
      );
    }

    const asientosPorCompra = asientos.reduce((acc, asiento) => {
      if (!acc[asiento.compra_id]) acc[asiento.compra_id] = [];
      acc[asiento.compra_id].push(asiento);
      return acc;
    }, {});

    const mesasPorCompra = mesas.reduce((acc, mesa) => {
      if (!acc[mesa.compra_id]) acc[mesa.compra_id] = [];
      acc[mesa.compra_id].push(mesa);
      return acc;
    }, {});

    const comprasConDetalle = compras.map((compra) => {
      const detalleAsientos = asientosPorCompra[compra.id] || [];
      const detalleMesas = mesasPorCompra[compra.id] || [];

      const totalEntradasEspecial =
        detalleAsientos.length +
        detalleMesas.reduce((acc, mesa) => acc + (mesa.cantidad_sillas || 0), 0);

      const totalEntradas =
        evento.tipo_evento === 'especial'
          ? totalEntradasEspecial || compra.cantidad
          : compra.cantidad;

      return {
        ...compra,
        asientos: detalleAsientos,
        mesas: detalleMesas,
        total_entradas: totalEntradas,
        detalle_compra:
          evento.tipo_evento === 'especial'
            ? buildDetalleCompraEspecial(detalleAsientos, detalleMesas, totalEntradas)
            : `${totalEntradas} entrada(s) general`
      };
    });

    const resumen = comprasConDetalle.reduce(
      (acc, compra) => {
        acc.total_compras += 1;
        const entradas = compra.total_entradas || 0;
        acc.entradas_totales += entradas;

        if (compra.estado === 'PAGO_REALIZADO' || compra.estado === 'ENTRADA_USADA') {
          acc.pagos_realizados += 1;
          acc.entradas_confirmadas += entradas;
        } else if (compra.estado === 'PAGO_PENDIENTE') {
          acc.pagos_pendientes += 1;
          acc.entradas_pendientes += entradas;
        } else if (compra.estado === 'CANCELADO') {
          acc.canceladas += 1;
        }

        return acc;
      },
      {
        total_compras: 0,
        pagos_realizados: 0,
        pagos_pendientes: 0,
        canceladas: 0,
        entradas_totales: 0,
        entradas_confirmadas: 0,
        entradas_pendientes: 0
      }
    );

    res.json({
      success: true,
      data: {
        evento,
        resumen,
        compras: comprasConDetalle
      }
    });
  } catch (error) {
    console.error('Error al obtener reporte del evento:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el reporte del evento',
      error: error.message
    });
  }
};


