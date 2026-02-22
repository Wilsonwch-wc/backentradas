import pool from '../config/db.js';

// Obtener todos los tipos de precio de un evento (incluye vendidos y disponibles para admin/Cartelera)
export const obtenerTiposPrecioPorEvento = async (req, res) => {
  try {
    const { eventoId } = req.params;

    const [tipos] = await pool.execute(
      `SELECT id, evento_id, nombre, precio, color, descripcion, activo, limite, created_at, updated_at
       FROM tipos_precio_evento
       WHERE evento_id = ? AND activo = 1
       ORDER BY precio ASC`,
      [eventoId]
    );

    // Vendidos por tipo: confirmados (compras_entradas_generales) + reservados (compras_detalle_general PAGO_PENDIENTE)
    let egPorTipo = {};
    let dgPorTipo = {};
    if (tipos.length > 0) {
      try {
        const [egRows] = await pool.execute(
          `SELECT eg.tipo_precio_id, COUNT(*) AS total
           FROM compras_entradas_generales eg
           INNER JOIN compras c ON eg.compra_id = c.id
           WHERE c.evento_id = ? AND c.estado IN ('PAGO_REALIZADO','ENTRADA_USADA')
           GROUP BY eg.tipo_precio_id`,
          [eventoId]
        );
        egRows.forEach((r) => { egPorTipo[r.tipo_precio_id] = parseInt(r.total || 0, 10); });
        const [dgRows] = await pool.execute(
          `SELECT cdg.tipo_precio_id, COALESCE(SUM(cdg.cantidad), 0) AS total
           FROM compras_detalle_general cdg
           INNER JOIN compras c ON cdg.compra_id = c.id
           WHERE c.evento_id = ? AND c.estado = 'PAGO_PENDIENTE'
           GROUP BY cdg.tipo_precio_id`,
          [eventoId]
        );
        dgRows.forEach((r) => { dgPorTipo[r.tipo_precio_id] = parseInt(r.total || 0, 10); });
      } catch (_) {}
    }

    const tiposConVentas = tipos.map((tp) => {
      const vendidos = (egPorTipo[tp.id] || 0) + (dgPorTipo[tp.id] || 0);
      const disponibles = tp.limite != null ? Math.max(0, parseInt(tp.limite, 10) - vendidos) : null;
      return { ...tp, vendidos, disponibles };
    });

    res.json({
      success: true,
      data: tiposConVentas
    });
  } catch (error) {
    console.error('Error al obtener tipos de precio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los tipos de precio',
      error: error.message
    });
  }
};

// Obtener un tipo de precio por ID
export const obtenerTipoPrecioPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const [tipos] = await pool.execute(
      `SELECT id, evento_id, nombre, precio, color, descripcion, activo, limite, created_at, updated_at
       FROM tipos_precio_evento
       WHERE id = ?`,
      [id]
    );

    if (tipos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tipo de precio no encontrado'
      });
    }

    res.json({
      success: true,
      data: tipos[0]
    });
  } catch (error) {
    console.error('Error al obtener tipo de precio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el tipo de precio',
      error: error.message
    });
  }
};

// Crear un nuevo tipo de precio
export const crearTipoPrecio = async (req, res) => {
  try {
    const { evento_id, nombre, precio, color, descripcion, limite } = req.body;

    // Validaciones
    if (!evento_id || !nombre || precio === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: evento_id, nombre, precio'
      });
    }

    // Validar que el evento existe (general o especial pueden tener tipos de precio)
    const [eventos] = await pool.execute(
      'SELECT id, tipo_evento FROM eventos WHERE id = ?',
      [evento_id]
    );

    if (eventos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    // Validar precio
    if (isNaN(precio) || precio < 0) {
      return res.status(400).json({
        success: false,
        message: 'El precio debe ser un número válido mayor o igual a 0'
      });
    }

    // Determinar color por defecto si no se proporciona
    let colorFinal = color || '#CCCCCC';
    if (!color) {
      const nombreUpper = nombre.toUpperCase();
      if (nombreUpper.includes('VIP')) {
        colorFinal = '#4CAF50'; // Verde
      } else if (nombreUpper.includes('BALCON') || nombreUpper.includes('BALCÓN')) {
        colorFinal = '#F44336'; // Rojo
      } else if (nombreUpper.includes('GENERAL')) {
        colorFinal = '#9E9E9E'; // Gris
      }
    }

    const limiteNum = (limite !== undefined && limite !== null && limite !== '') ? parseInt(limite, 10) : null;
    if (limiteNum !== null && (isNaN(limiteNum) || limiteNum < 0)) {
      return res.status(400).json({
        success: false,
        message: 'El límite debe ser un número entero mayor o igual a 0, o vacío (sin límite)'
      });
    }

    // Insertar nuevo tipo de precio
    const [result] = await pool.execute(
      `INSERT INTO tipos_precio_evento (evento_id, nombre, precio, color, descripcion, limite)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [evento_id, nombre, parseFloat(precio), colorFinal, descripcion || null, limiteNum]
    );

    // Obtener el tipo de precio creado
    const [tipos] = await pool.execute(
      `SELECT id, evento_id, nombre, precio, color, descripcion, activo, limite, created_at, updated_at
       FROM tipos_precio_evento
       WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Tipo de precio creado exitosamente',
      data: tipos[0]
    });
  } catch (error) {
    console.error('Error al crear tipo de precio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear el tipo de precio',
      error: error.message
    });
  }
};

// Actualizar un tipo de precio (incluye aumentar o reducir límite; no puede bajar de lo ya vendido)
export const actualizarTipoPrecio = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, precio, color, descripcion, activo, limite } = req.body;

    // Verificar si el tipo de precio existe
    const [tiposExistentes] = await pool.execute(
      'SELECT id, evento_id FROM tipos_precio_evento WHERE id = ?',
      [id]
    );

    if (tiposExistentes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tipo de precio no encontrado'
      });
    }

    if (limite !== undefined && limite !== null && limite !== '') {
      const limiteNum = parseInt(limite, 10);
      if (isNaN(limiteNum) || limiteNum < 0) {
        return res.status(400).json({
          success: false,
          message: 'El límite debe ser un número entero mayor o igual a 0, o vacío (sin límite)'
        });
      }
      // No permitir bajar el límite por debajo de lo ya vendido/reservado para este tipo
      const [egCount] = await pool.execute(
        `SELECT COUNT(*) AS total FROM compras_entradas_generales eg
         INNER JOIN compras c ON eg.compra_id = c.id
         WHERE eg.tipo_precio_id = ? AND c.estado IN ('PAGO_REALIZADO','ENTRADA_USADA')`,
        [id]
      );
      const [dgSum] = await pool.execute(
        `SELECT COALESCE(SUM(cdg.cantidad), 0) AS total FROM compras_detalle_general cdg
         INNER JOIN compras c ON cdg.compra_id = c.id
         WHERE cdg.tipo_precio_id = ? AND c.estado = 'PAGO_PENDIENTE'`,
        [id]
      );
      const yaVendidas = parseInt(egCount[0]?.total || 0, 10) + parseInt(dgSum[0]?.total || 0, 10);
      if (limiteNum < yaVendidas) {
        return res.status(400).json({
          success: false,
          message: `No se puede reducir el límite a ${limiteNum}: ya hay ${yaVendidas} entradas vendidas o reservadas para este tipo. Use al menos ${yaVendidas}.`
        });
      }
    }

    // Construir la consulta de actualización dinámicamente
    const campos = [];
    const valores = [];

    if (nombre) {
      campos.push('nombre = ?');
      valores.push(nombre);
    }
    if (precio !== undefined) {
      if (isNaN(precio) || precio < 0) {
        return res.status(400).json({
          success: false,
          message: 'El precio debe ser un número válido mayor o igual a 0'
        });
      }
      campos.push('precio = ?');
      valores.push(parseFloat(precio));
    }
    if (color !== undefined) {
      campos.push('color = ?');
      valores.push(color || '#CCCCCC');
    }
    if (descripcion !== undefined) {
      campos.push('descripcion = ?');
      valores.push(descripcion || null);
    }
    if (activo !== undefined) {
      campos.push('activo = ?');
      valores.push(activo ? 1 : 0);
    }
    if (limite !== undefined) {
      const limiteVal = (limite === null || limite === '') ? null : parseInt(limite, 10);
      campos.push('limite = ?');
      valores.push(limiteVal);
    }

    if (campos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay campos para actualizar'
      });
    }

    valores.push(id);

    await pool.execute(
      `UPDATE tipos_precio_evento SET ${campos.join(', ')}, updated_at = NOW() WHERE id = ?`,
      valores
    );

    // Obtener el tipo de precio actualizado
    const [tipos] = await pool.execute(
      `SELECT id, evento_id, nombre, precio, color, descripcion, activo, limite, created_at, updated_at
       FROM tipos_precio_evento
       WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Tipo de precio actualizado exitosamente',
      data: tipos[0]
    });
  } catch (error) {
    console.error('Error al actualizar tipo de precio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el tipo de precio',
      error: error.message
    });
  }
};

// Eliminar un tipo de precio
export const eliminarTipoPrecio = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si el tipo de precio existe
    const [tipos] = await pool.execute(
      'SELECT id FROM tipos_precio_evento WHERE id = ?',
      [id]
    );

    if (tipos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tipo de precio no encontrado'
      });
    }

    // Verificar si hay asientos que referencian este tipo de precio
    const [asientosRef] = await pool.execute(
      'SELECT COUNT(*) as total FROM asientos WHERE tipo_precio_id = ?',
      [id]
    );
    if (asientosRef[0].total > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar: hay asientos que usan este tipo de precio'
      });
    }

    // Eliminar el tipo de precio (seguro, sin referencias)
    await pool.execute('DELETE FROM tipos_precio_evento WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Tipo de precio eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar tipo de precio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el tipo de precio',
      error: error.message
    });
  }
};

