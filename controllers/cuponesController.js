import pool from '../config/db.js';

// Obtener todos los cupones de un evento
export const obtenerCupones = async (req, res) => {
  try {
    const { evento_id } = req.query;

    let query = `
      SELECT c.*, e.titulo as evento_titulo
      FROM cupones c
      INNER JOIN eventos e ON c.evento_id = e.id
      WHERE 1=1
    `;
    const params = [];

    if (evento_id) {
      query += ' AND c.evento_id = ?';
      params.push(evento_id);
    }

    query += ' ORDER BY c.created_at DESC';

    const [cupones] = await pool.execute(query, params);

    res.json({
      success: true,
      data: cupones
    });
  } catch (error) {
    console.error('Error al obtener cupones:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los cupones',
      error: error.message
    });
  }
};

// Obtener un cupón por ID
export const obtenerCuponPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const [cupones] = await pool.execute(
      `SELECT c.*, e.titulo as evento_titulo
       FROM cupones c
       INNER JOIN eventos e ON c.evento_id = e.id
       WHERE c.id = ?`,
      [id]
    );

    if (cupones.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cupón no encontrado'
      });
    }

    res.json({
      success: true,
      data: cupones[0]
    });
  } catch (error) {
    console.error('Error al obtener cupón:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el cupón',
      error: error.message
    });
  }
};

// Crear un nuevo cupón
export const crearCupon = async (req, res) => {
  try {
    const {
      evento_id,
      codigo,
      porcentaje_descuento,
      limite_usos,
      limite_por_cliente,
      fecha_inicio,
      fecha_fin,
      descripcion
    } = req.body;

    // Validaciones
    if (!evento_id || !codigo || porcentaje_descuento === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: evento_id, codigo, porcentaje_descuento'
      });
    }

    // Validar porcentaje (debe estar entre 0 y 100)
    const porcentaje = parseFloat(porcentaje_descuento);
    if (porcentaje < 0 || porcentaje > 100) {
      return res.status(400).json({
        success: false,
        message: 'El porcentaje de descuento debe estar entre 0 y 100'
      });
    }

    // Validar que el evento existe
    const [eventos] = await pool.execute(
      'SELECT id FROM eventos WHERE id = ?',
      [evento_id]
    );

    if (eventos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    // Validar que el código no exista para este evento
    const [cuponesExistentes] = await pool.execute(
      'SELECT id FROM cupones WHERE evento_id = ? AND codigo = ?',
      [evento_id, codigo.toUpperCase()]
    );

    if (cuponesExistentes.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un cupón con este código para este evento'
      });
    }

    // limite_por_cliente: 1 = una vez por cliente, 2 = dos veces, 0 o null = sin límite por cliente
    const limitePorCliente = limite_por_cliente != null ? parseInt(limite_por_cliente, 10) : 1;

    // Crear el cupón
    const [result] = await pool.execute(
      `INSERT INTO cupones 
       (evento_id, codigo, porcentaje_descuento, limite_usos, limite_por_cliente, fecha_inicio, fecha_fin, descripcion, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        evento_id,
        codigo.toUpperCase().trim(),
        porcentaje,
        limite_usos || 1,
        limitePorCliente < 0 ? 0 : limitePorCliente,
        fecha_inicio || null,
        fecha_fin || null,
        descripcion || null
      ]
    );

    // Obtener el cupón creado
    const [cupones] = await pool.execute(
      `SELECT c.*, e.titulo as evento_titulo
       FROM cupones c
       INNER JOIN eventos e ON c.evento_id = e.id
       WHERE c.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Cupón creado exitosamente',
      data: cupones[0]
    });
  } catch (error) {
    console.error('Error al crear cupón:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear el cupón',
      error: error.message
    });
  }
};

// Actualizar un cupón
export const actualizarCupon = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      codigo,
      porcentaje_descuento,
      limite_usos,
      limite_por_cliente,
      fecha_inicio,
      fecha_fin,
      descripcion,
      activo
    } = req.body;

    // Verificar que el cupón existe
    const [cuponesExistentes] = await pool.execute(
      'SELECT id, evento_id FROM cupones WHERE id = ?',
      [id]
    );

    if (cuponesExistentes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cupón no encontrado'
      });
    }

    const cuponExistente = cuponesExistentes[0];

    // Si se cambia el código, verificar que no exista otro con ese código para el mismo evento
    if (codigo && codigo.toUpperCase().trim() !== cuponExistente.codigo) {
      const [codigoExiste] = await pool.execute(
        'SELECT id FROM cupones WHERE evento_id = ? AND codigo = ? AND id != ?',
        [cuponExistente.evento_id, codigo.toUpperCase().trim(), id]
      );

      if (codigoExiste.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe otro cupón con este código para este evento'
        });
      }
    }

    // Validar porcentaje si se proporciona
    if (porcentaje_descuento !== undefined) {
      const porcentaje = parseFloat(porcentaje_descuento);
      if (porcentaje < 0 || porcentaje > 100) {
        return res.status(400).json({
          success: false,
          message: 'El porcentaje de descuento debe estar entre 0 y 100'
        });
      }
    }

    // Construir la consulta de actualización dinámicamente
    const updates = [];
    const values = [];

    if (codigo !== undefined) {
      updates.push('codigo = ?');
      values.push(codigo.toUpperCase().trim());
    }
    if (porcentaje_descuento !== undefined) {
      updates.push('porcentaje_descuento = ?');
      values.push(parseFloat(porcentaje_descuento));
    }
    if (limite_usos !== undefined) {
      updates.push('limite_usos = ?');
      values.push(parseInt(limite_usos, 10));
    }
    if (limite_por_cliente !== undefined) {
      const val = parseInt(limite_por_cliente, 10);
      updates.push('limite_por_cliente = ?');
      values.push(val < 0 ? 0 : val);
    }
    if (fecha_inicio !== undefined) {
      updates.push('fecha_inicio = ?');
      values.push(fecha_inicio || null);
    }
    if (fecha_fin !== undefined) {
      updates.push('fecha_fin = ?');
      values.push(fecha_fin || null);
    }
    if (descripcion !== undefined) {
      updates.push('descripcion = ?');
      values.push(descripcion || null);
    }
    if (activo !== undefined) {
      updates.push('activo = ?');
      values.push(activo ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay campos para actualizar'
      });
    }

    values.push(id);

    await pool.execute(
      `UPDATE cupones SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
      values
    );

    // Obtener el cupón actualizado
    const [cupones] = await pool.execute(
      `SELECT c.*, e.titulo as evento_titulo
       FROM cupones c
       INNER JOIN eventos e ON c.evento_id = e.id
       WHERE c.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Cupón actualizado exitosamente',
      data: cupones[0]
    });
  } catch (error) {
    console.error('Error al actualizar cupón:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el cupón',
      error: error.message
    });
  }
};

// Eliminar un cupón
export const eliminarCupon = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el cupón existe
    const [cupones] = await pool.execute(
      'SELECT id FROM cupones WHERE id = ?',
      [id]
    );

    if (cupones.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cupón no encontrado'
      });
    }

    // Eliminar el cupón (los usos se eliminarán en cascada)
    await pool.execute('DELETE FROM cupones WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Cupón eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar cupón:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el cupón',
      error: error.message
    });
  }
};

// Validar y obtener información de un cupón (para uso en compras)
export const validarCupon = async (req, res) => {
  try {
    const { codigo, evento_id, cliente_email } = req.body;

    if (!codigo || !evento_id) {
      return res.status(400).json({
        success: false,
        message: 'Código y evento_id son requeridos'
      });
    }

    // Buscar el cupón
    const [cupones] = await pool.execute(
      `SELECT c.*, e.titulo as evento_titulo
       FROM cupones c
       INNER JOIN eventos e ON c.evento_id = e.id
       WHERE c.codigo = ? AND c.evento_id = ?`,
      [codigo.toUpperCase().trim(), evento_id]
    );

    if (cupones.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cupón no encontrado para este evento'
      });
    }

    const cupon = cupones[0];

    // Validar que esté activo
    if (!cupon.activo) {
      return res.status(400).json({
        success: false,
        message: 'Este cupón no está activo'
      });
    }

    // Validar límite de usos (total)
    if (cupon.usos_actuales >= cupon.limite_usos) {
      return res.status(400).json({
        success: false,
        message: 'Este cupón ha alcanzado su límite de usos'
      });
    }

    // Validar usos por cliente: si el cupón tiene límite por cliente y se envía email, comprobar aquí
    const limitePorCliente = cupon.limite_por_cliente != null ? parseInt(cupon.limite_por_cliente, 10) : 0;
    const emailCliente = cliente_email ? String(cliente_email).trim() : '';
    if (limitePorCliente > 0 && emailCliente) {
      const [usosCliente] = await pool.execute(
        `SELECT COUNT(*) as total FROM cupones_usados u
         INNER JOIN compras c ON c.id = u.compra_id
         WHERE u.cupon_id = ? AND LOWER(TRIM(IFNULL(c.cliente_email, ''))) = LOWER(?)`,
        [cupon.id, emailCliente]
      );
      const usosDelCliente = parseInt(usosCliente[0]?.total || 0, 10);
      if (usosDelCliente >= limitePorCliente) {
        return res.status(400).json({
          success: false,
          message: `Este cupón solo puede usarse ${limitePorCliente} vez${limitePorCliente > 1 ? 'ces' : ''} por cliente. Ya lo utilizaste.`
        });
      }
    }

    // Validar fechas
    const ahora = new Date();
    if (cupon.fecha_inicio && new Date(cupon.fecha_inicio) > ahora) {
      return res.status(400).json({
        success: false,
        message: 'Este cupón aún no está disponible'
      });
    }

    if (cupon.fecha_fin && new Date(cupon.fecha_fin) < ahora) {
      return res.status(400).json({
        success: false,
        message: 'Este cupón ha expirado'
      });
    }

    // Retornar información del cupón válido
    res.json({
      success: true,
      data: {
        id: cupon.id,
        codigo: cupon.codigo,
        porcentaje_descuento: parseFloat(cupon.porcentaje_descuento),
        usos_disponibles: cupon.limite_usos - cupon.usos_actuales,
        descripcion: cupon.descripcion
      }
    });
  } catch (error) {
    console.error('Error al validar cupón:', error);
    res.status(500).json({
      success: false,
      message: 'Error al validar el cupón',
      error: error.message
    });
  }
};

// Obtener estadísticas de uso de un cupón
export const obtenerEstadisticasCupon = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener el cupón
    const [cupones] = await pool.execute(
      'SELECT * FROM cupones WHERE id = ?',
      [id]
    );

    if (cupones.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cupón no encontrado'
      });
    }

    const cupon = cupones[0];

    // Obtener compras que usaron este cupón
    const [compras] = await pool.execute(
      `SELECT c.id, c.codigo_unico, c.cliente_nombre, c.total, c.descuento_cupon, c.fecha_compra
       FROM compras c
       WHERE c.cupon_id = ?
       ORDER BY c.fecha_compra DESC`,
      [id]
    );

    // Calcular estadísticas
    const totalDescuentoAplicado = compras.reduce((sum, c) => sum + parseFloat(c.descuento_cupon || 0), 0);
    const totalVentas = compras.reduce((sum, c) => sum + parseFloat(c.total || 0), 0);

    res.json({
      success: true,
      data: {
        cupon: cupon,
        estadisticas: {
          usos_actuales: cupon.usos_actuales,
          limite_usos: cupon.limite_usos,
          usos_disponibles: cupon.limite_usos - cupon.usos_actuales,
          total_compras: compras.length,
          total_descuento_aplicado: totalDescuentoAplicado,
          total_ventas: totalVentas
        },
        compras: compras
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas del cupón:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las estadísticas',
      error: error.message
    });
  }
};
