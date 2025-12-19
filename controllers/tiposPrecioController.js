import pool from '../config/db.js';

// Obtener todos los tipos de precio de un evento
export const obtenerTiposPrecioPorEvento = async (req, res) => {
  try {
    const { eventoId } = req.params;

    const [tipos] = await pool.execute(
      `SELECT id, evento_id, nombre, precio, color, descripcion, activo, created_at, updated_at
       FROM tipos_precio_evento
       WHERE evento_id = ? AND activo = 1
       ORDER BY precio ASC`,
      [eventoId]
    );

    res.json({
      success: true,
      data: tipos
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
      `SELECT id, evento_id, nombre, precio, color, descripcion, activo, created_at, updated_at
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
    const { evento_id, nombre, precio, color, descripcion } = req.body;

    // Validaciones
    if (!evento_id || !nombre || precio === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: evento_id, nombre, precio'
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
        message: 'Solo los eventos especiales pueden tener tipos de precio'
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

    // Insertar nuevo tipo de precio
    const [result] = await pool.execute(
      `INSERT INTO tipos_precio_evento (evento_id, nombre, precio, color, descripcion)
       VALUES (?, ?, ?, ?, ?)`,
      [evento_id, nombre, parseFloat(precio), colorFinal, descripcion || null]
    );

    // Obtener el tipo de precio creado
    const [tipos] = await pool.execute(
      `SELECT id, evento_id, nombre, precio, color, descripcion, activo, created_at, updated_at
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

// Actualizar un tipo de precio
export const actualizarTipoPrecio = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, precio, color, descripcion, activo } = req.body;

    // Verificar si el tipo de precio existe
    const [tiposExistentes] = await pool.execute(
      'SELECT id FROM tipos_precio_evento WHERE id = ?',
      [id]
    );

    if (tiposExistentes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tipo de precio no encontrado'
      });
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
      `SELECT id, evento_id, nombre, precio, color, descripcion, activo, created_at, updated_at
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

