import pool from '../config/db.js';

// Obtener todas las áreas de un evento
export const obtenerAreasPorEvento = async (req, res) => {
  try {
    const { eventoId } = req.params;

    const [areas] = await pool.execute(
      `SELECT id, evento_id, nombre, posicion_x, posicion_y, ancho, alto, color,
              tipo_area, capacidad_personas, orden, forma, tipo_precio_id,
              created_at, updated_at
       FROM areas_layout
       WHERE evento_id = ?
       ORDER BY COALESCE(orden, 999), nombre ASC`,
      [eventoId]
    );

    res.json({
      success: true,
      data: areas
    });
  } catch (error) {
    console.error('Error al obtener áreas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las áreas',
      error: error.message
    });
  }
};

// Obtener un área por ID
export const obtenerAreaPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const [areas] = await pool.execute(
      `SELECT id, evento_id, nombre, posicion_x, posicion_y, ancho, alto, color, created_at, updated_at
       FROM areas_layout
       WHERE id = ?`,
      [id]
    );

    if (areas.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Área no encontrada'
      });
    }

    res.json({
      success: true,
      data: areas[0]
    });
  } catch (error) {
    console.error('Error al obtener área:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el área',
      error: error.message
    });
  }
};

// Crear una nueva área
export const crearArea = async (req, res) => {
  try {
    const { evento_id, nombre, posicion_x, posicion_y, ancho, alto, color, tipo_area = 'SILLAS', capacidad_personas, orden, forma = 'rectangulo', tipo_precio_id } = req.body;

    // Validaciones
    if (!evento_id || !nombre || posicion_x === undefined || posicion_y === undefined || !ancho || !alto) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: evento_id, nombre, posicion_x, posicion_y, ancho, alto'
      });
    }

    const tipoAreaValido = ['SILLAS', 'MESAS', 'PERSONAS'].includes(tipo_area) ? tipo_area : 'SILLAS';
    const formaValida = ['rectangulo', 'circulo'].includes(forma) ? forma : 'rectangulo';

    if (tipoAreaValido === 'PERSONAS') {
      const cap = parseInt(capacidad_personas, 10);
      if (!cap || cap <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Para áreas de tipo PERSONAS (zona general) la capacidad debe ser mayor a 0'
        });
      }
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
        message: 'Solo los eventos especiales pueden tener áreas'
      });
    }

    // Validar dimensiones
    if (ancho <= 0 || alto <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El ancho y alto deben ser mayores a 0'
      });
    }

    const capPersonas = tipoAreaValido === 'PERSONAS' ? parseInt(capacidad_personas, 10) : null;
    const tipoPrecioId = tipo_precio_id ? parseInt(tipo_precio_id, 10) : null;

    // Insertar nueva área
    const [result] = await pool.execute(
      `INSERT INTO areas_layout (evento_id, nombre, posicion_x, posicion_y, ancho, alto, color, tipo_area, capacidad_personas, orden, forma, tipo_precio_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [evento_id, nombre, posicion_x, posicion_y, ancho, alto, color || '#CCCCCC', tipoAreaValido, capPersonas, orden || null, formaValida, tipoPrecioId]
    );

    // Obtener el área creada
    const [areas] = await pool.execute(
      `SELECT id, evento_id, nombre, posicion_x, posicion_y, ancho, alto, color,
              tipo_area, capacidad_personas, orden, forma, tipo_precio_id,
              created_at, updated_at
       FROM areas_layout
       WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Área creada exitosamente',
      data: areas[0]
    });
  } catch (error) {
    console.error('Error al crear área:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear el área',
      error: error.message
    });
  }
};

// Actualizar un área
export const actualizarArea = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, posicion_x, posicion_y, ancho, alto, color, tipo_area, capacidad_personas, orden, forma, tipo_precio_id } = req.body;

    // Verificar si el área existe
    const [areasExistentes] = await pool.execute(
      'SELECT id, evento_id FROM areas_layout WHERE id = ?',
      [id]
    );

    if (areasExistentes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Área no encontrada'
      });
    }

    // Construir la consulta de actualización dinámicamente
    const campos = [];
    const valores = [];

    if (nombre !== undefined) {
      campos.push('nombre = ?');
      valores.push(nombre);
    }
    if (posicion_x !== undefined) {
      campos.push('posicion_x = ?');
      valores.push(posicion_x);
    }
    if (posicion_y !== undefined) {
      campos.push('posicion_y = ?');
      valores.push(posicion_y);
    }
    if (ancho !== undefined) {
      if (ancho <= 0) {
        return res.status(400).json({
          success: false,
          message: 'El ancho debe ser mayor a 0'
        });
      }
      campos.push('ancho = ?');
      valores.push(ancho);
    }
    if (alto !== undefined) {
      if (alto <= 0) {
        return res.status(400).json({
          success: false,
          message: 'El alto debe ser mayor a 0'
        });
      }
      campos.push('alto = ?');
      valores.push(alto);
    }
    if (color !== undefined) {
      campos.push('color = ?');
      valores.push(color);
    }
    if (tipo_area !== undefined && ['SILLAS', 'MESAS', 'PERSONAS'].includes(tipo_area)) {
      campos.push('tipo_area = ?');
      valores.push(tipo_area);
    }
    if (capacidad_personas !== undefined) {
      campos.push('capacidad_personas = ?');
      const cap = parseInt(capacidad_personas, 10);
      valores.push(cap > 0 ? cap : null);
    }
    if (orden !== undefined) {
      campos.push('orden = ?');
      valores.push(orden);
    }
    if (forma !== undefined && ['rectangulo', 'circulo'].includes(forma)) {
      campos.push('forma = ?');
      valores.push(forma);
    }
    if (tipo_precio_id !== undefined) {
      campos.push('tipo_precio_id = ?');
      valores.push(tipo_precio_id ? parseInt(tipo_precio_id, 10) : null);
    }

    if (campos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay campos para actualizar'
      });
    }

    valores.push(id);

    await pool.execute(
      `UPDATE areas_layout SET ${campos.join(', ')}, updated_at = NOW() WHERE id = ?`,
      valores
    );

    // Obtener el área actualizada
    const [areas] = await pool.execute(
      `SELECT id, evento_id, nombre, posicion_x, posicion_y, ancho, alto, color,
              tipo_area, capacidad_personas, orden, forma, tipo_precio_id,
              created_at, updated_at
       FROM areas_layout
       WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Área actualizada exitosamente',
      data: areas[0]
    });
  } catch (error) {
    console.error('Error al actualizar área:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el área',
      error: error.message
    });
  }
};

// Eliminar un área
export const eliminarArea = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si el área existe
    const [areas] = await pool.execute(
      'SELECT id FROM areas_layout WHERE id = ?',
      [id]
    );

    if (areas.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Área no encontrada'
      });
    }

    // Eliminar el área
    await pool.execute('DELETE FROM areas_layout WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Área eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar área:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el área',
      error: error.message
    });
  }
};

