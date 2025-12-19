import pool from '../config/db.js';

// Obtener todas las mesas de un evento
export const obtenerMesasPorEvento = async (req, res) => {
  try {
    const { eventoId } = req.params;

    const [mesas] = await pool.execute(
      `SELECT m.id, m.evento_id, m.numero_mesa, m.capacidad_sillas, m.tipo_precio_id, 
              m.activo, m.posicion_x, m.posicion_y, m.ancho, m.alto, m.area_id, m.created_at, m.updated_at,
              tp.nombre as tipo_precio_nombre, tp.precio as tipo_precio_precio,
              a.nombre as area_nombre
       FROM mesas m
       LEFT JOIN tipos_precio_evento tp ON m.tipo_precio_id = tp.id
       LEFT JOIN areas_layout a ON m.area_id = a.id
       WHERE m.evento_id = ? AND m.activo = 1
       ORDER BY m.numero_mesa ASC`,
      [eventoId]
    );

    res.json({
      success: true,
      data: mesas
    });
  } catch (error) {
    console.error('Error al obtener mesas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las mesas',
      error: error.message
    });
  }
};

// Obtener una mesa por ID
export const obtenerMesaPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const [mesas] = await pool.execute(
      `SELECT m.id, m.evento_id, m.numero_mesa, m.capacidad_sillas, m.tipo_precio_id, 
              m.activo, m.posicion_x, m.posicion_y, m.area_id, m.created_at, m.updated_at,
              tp.nombre as tipo_precio_nombre, tp.precio as tipo_precio_precio,
              a.nombre as area_nombre
       FROM mesas m
       LEFT JOIN tipos_precio_evento tp ON m.tipo_precio_id = tp.id
       LEFT JOIN areas_layout a ON m.area_id = a.id
       WHERE m.id = ?`,
      [id]
    );

    if (mesas.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mesa no encontrada'
      });
    }

    res.json({
      success: true,
      data: mesas[0]
    });
  } catch (error) {
    console.error('Error al obtener mesa:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la mesa',
      error: error.message
    });
  }
};

// Crear una nueva mesa
export const crearMesa = async (req, res) => {
  try {
    const { evento_id, numero_mesa, capacidad_sillas, tipo_precio_id, area_id, posicion_x, posicion_y, ancho, alto } = req.body;

    // Validaciones
    if (!evento_id || !numero_mesa || !capacidad_sillas || !tipo_precio_id) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: evento_id, numero_mesa, capacidad_sillas, tipo_precio_id'
      });
    }

    // Validar que el evento existe y es especial
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

    if (eventos[0].tipo_evento !== 'especial') {
      return res.status(400).json({
        success: false,
        message: 'Solo los eventos especiales pueden tener mesas'
      });
    }

    // Validar que el tipo de precio existe y pertenece al evento
    const [tiposPrecio] = await pool.execute(
      'SELECT id FROM tipos_precio_evento WHERE id = ? AND evento_id = ?',
      [tipo_precio_id, evento_id]
    );

    if (tiposPrecio.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tipo de precio no encontrado o no pertenece a este evento'
      });
    }

    // Validar capacidad
    if (isNaN(capacidad_sillas) || capacidad_sillas < 1) {
      return res.status(400).json({
        success: false,
        message: 'La capacidad de sillas debe ser un número válido mayor a 0'
      });
    }

    // Validar que el número de mesa no esté duplicado para este evento
    const [mesasExistentes] = await pool.execute(
      'SELECT id FROM mesas WHERE evento_id = ? AND numero_mesa = ?',
      [evento_id, numero_mesa]
    );

    if (mesasExistentes.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una mesa con ese número para este evento'
      });
    }

    // Validar area_id si se proporciona
    let areaIdFinal = null;
    if (area_id) {
      const [areas] = await pool.execute(
        'SELECT id FROM areas_layout WHERE id = ? AND evento_id = ?',
        [area_id, evento_id]
      );
      if (areas.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Área no encontrada o no pertenece a este evento'
        });
      }
      areaIdFinal = area_id;
    }

    // Insertar nueva mesa
    const [result] = await pool.execute(
      `INSERT INTO mesas (evento_id, numero_mesa, capacidad_sillas, tipo_precio_id, area_id, posicion_x, posicion_y, ancho, alto)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [evento_id, numero_mesa, capacidad_sillas, tipo_precio_id, areaIdFinal, posicion_x || null, posicion_y || null, ancho || null, alto || null]
    );

    // Obtener la mesa creada
    const [mesas] = await pool.execute(
      `SELECT m.id, m.evento_id, m.numero_mesa, m.capacidad_sillas, m.tipo_precio_id, 
              m.activo, m.posicion_x, m.posicion_y, m.ancho, m.alto, m.area_id, m.created_at, m.updated_at,
              tp.nombre as tipo_precio_nombre, tp.precio as tipo_precio_precio,
              a.nombre as area_nombre
       FROM mesas m
       LEFT JOIN tipos_precio_evento tp ON m.tipo_precio_id = tp.id
       LEFT JOIN areas_layout a ON m.area_id = a.id
       WHERE m.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Mesa creada exitosamente',
      data: mesas[0]
    });
  } catch (error) {
    console.error('Error al crear mesa:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear la mesa',
      error: error.message
    });
  }
};

// Actualizar una mesa
export const actualizarMesa = async (req, res) => {
  try {
    const { id } = req.params;
    const { numero_mesa, capacidad_sillas, tipo_precio_id, activo, posicion_x, posicion_y, ancho, alto, area_id } = req.body;

    // Verificar si la mesa existe
    const [mesasExistentes] = await pool.execute(
      'SELECT id, evento_id FROM mesas WHERE id = ?',
      [id]
    );

    if (mesasExistentes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mesa no encontrada'
      });
    }

    const eventoId = mesasExistentes[0].evento_id;

    // Construir la consulta de actualización dinámicamente
    const campos = [];
    const valores = [];

    if (numero_mesa !== undefined) {
      // Validar que el número de mesa no esté duplicado
      const [mesasDuplicadas] = await pool.execute(
        'SELECT id FROM mesas WHERE evento_id = ? AND numero_mesa = ? AND id != ?',
        [eventoId, numero_mesa, id]
      );

      if (mesasDuplicadas.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe una mesa con ese número para este evento'
        });
      }
      campos.push('numero_mesa = ?');
      valores.push(numero_mesa);
    }
    if (capacidad_sillas !== undefined) {
      if (isNaN(capacidad_sillas) || capacidad_sillas < 1) {
        return res.status(400).json({
          success: false,
          message: 'La capacidad de sillas debe ser un número válido mayor a 0'
        });
      }
      campos.push('capacidad_sillas = ?');
      valores.push(capacidad_sillas);
    }
    if (tipo_precio_id !== undefined) {
      // Validar que el tipo de precio existe y pertenece al evento
      const [tiposPrecio] = await pool.execute(
        'SELECT id FROM tipos_precio_evento WHERE id = ? AND evento_id = ?',
        [tipo_precio_id, eventoId]
      );

      if (tiposPrecio.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Tipo de precio no encontrado o no pertenece a este evento'
        });
      }
      campos.push('tipo_precio_id = ?');
      valores.push(tipo_precio_id);
    }
    if (activo !== undefined) {
      campos.push('activo = ?');
      valores.push(activo ? 1 : 0);
    }
    if (posicion_x !== undefined) {
      campos.push('posicion_x = ?');
      valores.push(posicion_x || null);
    }
    if (posicion_y !== undefined) {
      campos.push('posicion_y = ?');
      valores.push(posicion_y || null);
    }
    if (ancho !== undefined) {
      campos.push('ancho = ?');
      valores.push(ancho || null);
    }
    if (alto !== undefined) {
      campos.push('alto = ?');
      valores.push(alto || null);
    }
    if (area_id !== undefined) {
      let areaIdFinal = null;
      if (area_id) {
        // Validar que el área existe y pertenece al evento
        const [areas] = await pool.execute(
          'SELECT id FROM areas_layout WHERE id = ? AND evento_id = ?',
          [area_id, eventoId]
        );
        if (areas.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Área no encontrada o no pertenece a este evento'
          });
        }
        areaIdFinal = area_id;
      }
      campos.push('area_id = ?');
      valores.push(areaIdFinal);
    }

    if (campos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay campos para actualizar'
      });
    }

    valores.push(id);

    await pool.execute(
      `UPDATE mesas SET ${campos.join(', ')}, updated_at = NOW() WHERE id = ?`,
      valores
    );

    // Obtener la mesa actualizada
    const [mesas] = await pool.execute(
      `SELECT m.id, m.evento_id, m.numero_mesa, m.capacidad_sillas, m.tipo_precio_id, 
              m.activo, m.posicion_x, m.posicion_y, m.area_id, m.created_at, m.updated_at,
              tp.nombre as tipo_precio_nombre, tp.precio as tipo_precio_precio,
              a.nombre as area_nombre
       FROM mesas m
       LEFT JOIN tipos_precio_evento tp ON m.tipo_precio_id = tp.id
       LEFT JOIN areas_layout a ON m.area_id = a.id
       WHERE m.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Mesa actualizada exitosamente',
      data: mesas[0]
    });
  } catch (error) {
    console.error('Error al actualizar mesa:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la mesa',
      error: error.message
    });
  }
};

// Eliminar una mesa
export const eliminarMesa = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si la mesa existe
    const [mesas] = await pool.execute(
      'SELECT id FROM mesas WHERE id = ?',
      [id]
    );

    if (mesas.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mesa no encontrada'
      });
    }

    // Eliminar la mesa
    await pool.execute('DELETE FROM mesas WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Mesa eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar mesa:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar la mesa',
      error: error.message
    });
  }
};

