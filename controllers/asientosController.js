import pool from '../config/db.js';

// Obtener todos los asientos de un evento
export const obtenerAsientosPorEvento = async (req, res) => {
  try {
    const { eventoId } = req.params;

    const [asientos] = await pool.execute(
      `SELECT a.id, a.evento_id, a.mesa_id, a.numero_asiento, a.tipo_precio_id, 
              a.estado, a.posicion_x, a.posicion_y, a.area_id, a.created_at, a.updated_at,
              tp.nombre as tipo_precio_nombre, tp.precio as tipo_precio_precio,
              m.numero_mesa, m.capacidad_sillas,
              ar.nombre as area_nombre
       FROM asientos a
       LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
       LEFT JOIN mesas m ON a.mesa_id = m.id
       LEFT JOIN areas_layout ar ON a.area_id = ar.id
       WHERE a.evento_id = ?
       ORDER BY a.mesa_id ASC, a.numero_asiento ASC`,
      [eventoId]
    );

    res.json({
      success: true,
      data: asientos
    });
  } catch (error) {
    console.error('Error al obtener asientos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los asientos',
      error: error.message
    });
  }
};

// Obtener asientos disponibles de un evento
export const obtenerAsientosDisponibles = async (req, res) => {
  try {
    const { eventoId } = req.params;
    const { tipo_precio_id, mesa_id } = req.query;

    let query = `SELECT a.id, a.evento_id, a.mesa_id, a.numero_asiento, a.tipo_precio_id, 
                        a.estado, a.created_at, a.updated_at,
                        tp.nombre as tipo_precio_nombre, tp.precio as tipo_precio_precio,
                        m.numero_mesa, m.capacidad_sillas
                 FROM asientos a
                 LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
                 LEFT JOIN mesas m ON a.mesa_id = m.id
                 WHERE a.evento_id = ? AND a.estado = 'disponible'`;
    
    const params = [eventoId];

    if (tipo_precio_id) {
      query += ' AND a.tipo_precio_id = ?';
      params.push(tipo_precio_id);
    }

    if (mesa_id) {
      query += ' AND a.mesa_id = ?';
      params.push(mesa_id);
    }

    query += ' ORDER BY a.mesa_id ASC, a.numero_asiento ASC';

    const [asientos] = await pool.execute(query, params);

    res.json({
      success: true,
      data: asientos
    });
  } catch (error) {
    console.error('Error al obtener asientos disponibles:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los asientos disponibles',
      error: error.message
    });
  }
};

// Obtener un asiento por ID
export const obtenerAsientoPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const [asientos] = await pool.execute(
      `SELECT a.id, a.evento_id, a.mesa_id, a.numero_asiento, a.tipo_precio_id, 
              a.estado, a.posicion_x, a.posicion_y, a.created_at, a.updated_at,
              tp.nombre as tipo_precio_nombre, tp.precio as tipo_precio_precio,
              m.numero_mesa, m.capacidad_sillas
       FROM asientos a
       LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
       LEFT JOIN mesas m ON a.mesa_id = m.id
       WHERE a.id = ?`,
      [id]
    );

    if (asientos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Asiento no encontrado'
      });
    }

    res.json({
      success: true,
      data: asientos[0]
    });
  } catch (error) {
    console.error('Error al obtener asiento:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el asiento',
      error: error.message
    });
  }
};

// Crear un nuevo asiento
export const crearAsiento = async (req, res) => {
  try {
    const { evento_id, mesa_id, numero_asiento, tipo_precio_id, area_id, posicion_x, posicion_y } = req.body;

    // Validaciones
    if (!evento_id || !numero_asiento || !tipo_precio_id) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: evento_id, numero_asiento, tipo_precio_id'
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
        message: 'Solo los eventos especiales pueden tener asientos'
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

    // Si se proporciona mesa_id, validar que existe y pertenece al evento
    if (mesa_id !== null && mesa_id !== undefined && mesa_id !== 0 && mesa_id !== '0') {
      const [mesas] = await pool.execute(
        'SELECT id FROM mesas WHERE id = ? AND evento_id = ?',
        [mesa_id, evento_id]
      );

      if (mesas.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Mesa no encontrada o no pertenece a este evento'
        });
      }
    }

    // Validar que el número de asiento no esté duplicado
    // Si tiene mesa_id: validar que no haya duplicados dentro de la misma mesa
    // Si no tiene mesa_id: validar que no haya duplicados en todo el evento
    let asientosExistentes = [];
    if (mesa_id !== null && mesa_id !== undefined) {
      // Para sillas de mesas: el número debe ser único dentro de la misma mesa
      [asientosExistentes] = await pool.execute(
        'SELECT id FROM asientos WHERE evento_id = ? AND mesa_id = ? AND numero_asiento = ?',
        [evento_id, mesa_id, numero_asiento]
      );
      
      if (asientosExistentes.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe una silla con ese número en esta mesa'
        });
      }
    } else {
      // Para asientos individuales: el número debe ser único en todo el evento
      [asientosExistentes] = await pool.execute(
        'SELECT id FROM asientos WHERE evento_id = ? AND (mesa_id IS NULL OR mesa_id = 0) AND numero_asiento = ?',
        [evento_id, numero_asiento]
      );
      
      if (asientosExistentes.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un asiento con ese número para este evento'
        });
      }
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

    // Insertar nuevo asiento
    // Asegurarse de que mesa_id sea null si no se proporciona o es inválido
    const mesaIdFinal = (mesa_id !== null && mesa_id !== undefined && mesa_id !== 0 && mesa_id !== '0') ? mesa_id : null;
    
    const [result] = await pool.execute(
      `INSERT INTO asientos (evento_id, mesa_id, numero_asiento, tipo_precio_id, estado, area_id, posicion_x, posicion_y)
       VALUES (?, ?, ?, ?, 'disponible', ?, ?, ?)`,
      [evento_id, mesaIdFinal, String(numero_asiento), tipo_precio_id, areaIdFinal, posicion_x || null, posicion_y || null]
    );

    // Obtener el asiento creado
    const [asientos] = await pool.execute(
      `SELECT a.id, a.evento_id, a.mesa_id, a.numero_asiento, a.tipo_precio_id, 
              a.estado, a.posicion_x, a.posicion_y, a.area_id, a.created_at, a.updated_at,
              tp.nombre as tipo_precio_nombre, tp.precio as tipo_precio_precio,
              m.numero_mesa, m.capacidad_sillas,
              ar.nombre as area_nombre
       FROM asientos a
       LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
       LEFT JOIN mesas m ON a.mesa_id = m.id
       LEFT JOIN areas_layout ar ON a.area_id = ar.id
       WHERE a.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Asiento creado exitosamente',
      data: asientos[0]
    });
  } catch (error) {
    console.error('Error al crear asiento:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear el asiento',
      error: error.message
    });
  }
};

// Crear múltiples asientos (útil para crear asientos de una mesa)
export const crearAsientosMasivos = async (req, res) => {
  try {
    const { evento_id, mesa_id, tipo_precio_id, cantidad, prefijo } = req.body;

    // Validaciones
    if (!evento_id || !tipo_precio_id || !cantidad) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: evento_id, tipo_precio_id, cantidad'
      });
    }

    if (isNaN(cantidad) || cantidad < 1) {
      return res.status(400).json({
        success: false,
        message: 'La cantidad debe ser un número válido mayor a 0'
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
        message: 'Solo los eventos especiales pueden tener asientos'
      });
    }

    // Validar que el tipo de precio existe
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

    // Si se proporciona mesa_id, validar que existe
    if (mesa_id) {
      const [mesas] = await pool.execute(
        'SELECT id FROM mesas WHERE id = ? AND evento_id = ?',
        [mesa_id, evento_id]
      );

      if (mesas.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Mesa no encontrada o no pertenece a este evento'
        });
      }
    }

    // Crear asientos
    const asientosCreados = [];
    const prefijoAsiento = prefijo || (mesa_id ? `Mesa ${mesa_id} Silla` : 'Asiento');

    for (let i = 1; i <= cantidad; i++) {
      const numeroAsiento = `${prefijoAsiento} ${i}`;
      
      // Verificar si ya existe
      const [existentes] = await pool.execute(
        'SELECT id FROM asientos WHERE evento_id = ? AND numero_asiento = ?',
        [evento_id, numeroAsiento]
      );

      if (existentes.length === 0) {
        const [result] = await pool.execute(
          `INSERT INTO asientos (evento_id, mesa_id, numero_asiento, tipo_precio_id, estado)
           VALUES (?, ?, ?, ?, 'disponible')`,
          [evento_id, mesa_id || null, numeroAsiento, tipo_precio_id]
        );
        asientosCreados.push(result.insertId);
      }
    }

    res.status(201).json({
      success: true,
      message: `${asientosCreados.length} asiento(s) creado(s) exitosamente`,
      data: { asientos_creados: asientosCreados.length, ids: asientosCreados }
    });
  } catch (error) {
    console.error('Error al crear asientos masivos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear los asientos',
      error: error.message
    });
  }
};

// Actualizar un asiento
export const actualizarAsiento = async (req, res) => {
  try {
    const { id } = req.params;
    const { mesa_id, numero_asiento, tipo_precio_id, estado, posicion_x, posicion_y, area_id } = req.body;

    // Verificar si el asiento existe
    const [asientosExistentes] = await pool.execute(
      'SELECT id, evento_id FROM asientos WHERE id = ?',
      [id]
    );

    if (asientosExistentes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Asiento no encontrado'
      });
    }

    const eventoId = asientosExistentes[0].evento_id;

    // Construir la consulta de actualización dinámicamente
    const campos = [];
    const valores = [];

    if (mesa_id !== undefined) {
      if (mesa_id !== null) {
        // Validar que la mesa existe y pertenece al evento
        const [mesas] = await pool.execute(
          'SELECT id FROM mesas WHERE id = ? AND evento_id = ?',
          [mesa_id, eventoId]
        );

        if (mesas.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Mesa no encontrada o no pertenece a este evento'
          });
        }
      }
      campos.push('mesa_id = ?');
      valores.push(mesa_id);
    }
    if (numero_asiento) {
      // Validar que el número no esté duplicado
      // Necesitamos obtener el mesa_id actual o el nuevo para validar correctamente
      let mesaIdParaValidar = mesa_id;
      if (mesaIdParaValidar === undefined) {
        // Si no se está cambiando mesa_id, obtener el actual
        const [asientoActual] = await pool.execute(
          'SELECT mesa_id FROM asientos WHERE id = ?',
          [id]
        );
        if (asientoActual.length > 0) {
          mesaIdParaValidar = asientoActual[0].mesa_id;
        }
      }
      
      let duplicados = [];
      if (mesaIdParaValidar !== null && mesaIdParaValidar !== undefined) {
        // Para sillas de mesas: el número debe ser único dentro de la misma mesa
        [duplicados] = await pool.execute(
          'SELECT id FROM asientos WHERE evento_id = ? AND mesa_id = ? AND numero_asiento = ? AND id != ?',
          [eventoId, mesaIdParaValidar, numero_asiento, id]
        );
        
        if (duplicados.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Ya existe una silla con ese número en esta mesa'
          });
        }
      } else {
        // Para asientos individuales: el número debe ser único en todo el evento
        [duplicados] = await pool.execute(
          'SELECT id FROM asientos WHERE evento_id = ? AND (mesa_id IS NULL OR mesa_id = 0) AND numero_asiento = ? AND id != ?',
          [eventoId, numero_asiento, id]
        );
        
        if (duplicados.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Ya existe un asiento con ese número para este evento'
          });
        }
      }
      campos.push('numero_asiento = ?');
      valores.push(numero_asiento);
    }
    if (tipo_precio_id !== undefined) {
      // Validar que el tipo de precio existe
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
    if (estado) {
      const estadosValidos = ['disponible', 'reservado', 'ocupado'];
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({
          success: false,
          message: `El estado debe ser uno de: ${estadosValidos.join(', ')}`
        });
      }
      campos.push('estado = ?');
      valores.push(estado);
    }
    if (posicion_x !== undefined) {
      campos.push('posicion_x = ?');
      valores.push(posicion_x || null);
    }
    if (posicion_y !== undefined) {
      campos.push('posicion_y = ?');
      valores.push(posicion_y || null);
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
      `UPDATE asientos SET ${campos.join(', ')}, updated_at = NOW() WHERE id = ?`,
      valores
    );

    // Obtener el asiento actualizado
    const [asientos] = await pool.execute(
      `SELECT a.id, a.evento_id, a.mesa_id, a.numero_asiento, a.tipo_precio_id, 
              a.estado, a.posicion_x, a.posicion_y, a.area_id, a.created_at, a.updated_at,
              tp.nombre as tipo_precio_nombre, tp.precio as tipo_precio_precio,
              m.numero_mesa, m.capacidad_sillas,
              ar.nombre as area_nombre
       FROM asientos a
       LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
       LEFT JOIN mesas m ON a.mesa_id = m.id
       LEFT JOIN areas_layout ar ON a.area_id = ar.id
       WHERE a.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Asiento actualizado exitosamente',
      data: asientos[0]
    });
  } catch (error) {
    console.error('Error al actualizar asiento:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el asiento',
      error: error.message
    });
  }
};

// Eliminar un asiento
export const eliminarAsiento = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si el asiento existe
    const [asientos] = await pool.execute(
      'SELECT id FROM asientos WHERE id = ?',
      [id]
    );

    if (asientos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Asiento no encontrado'
      });
    }

    // Eliminar el asiento
    await pool.execute('DELETE FROM asientos WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Asiento eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar asiento:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el asiento',
      error: error.message
    });
  }
};

