import pool from '../config/db.js';
import { generarSlug } from '../utils/slug.js';

const columnasEventoQuery = `
  SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'eventos' 
    AND COLUMN_NAME IN (
      'forma_espacio', 'escenario_x', 'escenario_y',
      'escenario_width', 'escenario_height',
      'layout_bloqueado', 'qr_pago_url'
    )
`;

// Obtener todos los eventos
export const obtenerEventos = async (req, res) => {
  try {
    // Primero verificar qué columnas existen
    const [columnas] = await pool.execute(columnasEventoQuery);
    
    const columnasExistentes = columnas.map(c => c.COLUMN_NAME);
    const tieneFormaEspacio = columnasExistentes.includes('forma_espacio');
    const tieneLayoutBloqueado = columnasExistentes.includes('layout_bloqueado');
    const tieneQrPago = columnasExistentes.includes('qr_pago_url');
    
    let query = `SELECT id, imagen, titulo, descripcion, hora_inicio, precio, es_nuevo, tipo_evento, capacidad_maxima, limite_entradas, created_at, updated_at`;
    
    if (tieneFormaEspacio) {
      query += `, forma_espacio, escenario_x, escenario_y, escenario_width, escenario_height`;
    }
    
    if (tieneLayoutBloqueado) {
      query += `, layout_bloqueado`;
    }
    if (tieneQrPago) {
      query += `, qr_pago_url`;
    }
    
    query += ` FROM eventos ORDER BY hora_inicio DESC`;
    
    const [eventos] = await pool.execute(query);

    res.json({
      success: true,
      data: eventos
    });
  } catch (error) {
    console.error('Error al obtener eventos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los eventos',
      error: error.message
    });
  }
};

// Obtener un evento por ID
export const obtenerEventoPorId = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar qué columnas existen
    const [columnas] = await pool.execute(columnasEventoQuery);
    
    const columnasExistentes = columnas.map(c => c.COLUMN_NAME);
    const tieneFormaEspacio = columnasExistentes.includes('forma_espacio');
    const tieneLayoutBloqueado = columnasExistentes.includes('layout_bloqueado');
    const tieneQrPago = columnasExistentes.includes('qr_pago_url');
    
    let query = `SELECT id, imagen, titulo, descripcion, hora_inicio, precio, es_nuevo, tipo_evento, capacidad_maxima, limite_entradas, created_at, updated_at`;
    
    if (tieneFormaEspacio) {
      query += `, forma_espacio, escenario_x, escenario_y, escenario_width, escenario_height`;
    }
    
    if (tieneLayoutBloqueado) {
      query += `, layout_bloqueado`;
    }
    if (tieneQrPago) {
      query += `, qr_pago_url`;
    }
    
    query += ` FROM eventos WHERE id = ?`;
    
    const [eventos] = await pool.execute(query, [id]);

    if (eventos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    res.json({
      success: true,
      data: eventos[0]
    });
  } catch (error) {
    console.error('Error al obtener evento:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el evento',
      error: error.message
    });
  }
};

// Crear un nuevo evento
export const crearEvento = async (req, res) => {
  try {
    const { imagen, titulo, descripcion, hora_inicio, precio, es_nuevo, tipo_evento, capacidad_maxima, limite_entradas, qr_pago_url } = req.body;

    // Validaciones básicas
    if (!titulo || !descripcion || !hora_inicio) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: titulo, descripcion, hora_inicio'
      });
    }

    // Validar tipo_evento
    const tipoEventoValido = tipo_evento === 'especial' ? 'especial' : 'general';
    
    // Validar precio según tipo de evento
    if (tipoEventoValido === 'general') {
      if (precio === undefined) {
        return res.status(400).json({
          success: false,
          message: 'El precio es requerido para eventos generales'
        });
      }
      if (isNaN(precio) || precio < 0) {
        return res.status(400).json({
          success: false,
          message: 'El precio debe ser un número válido mayor o igual a 0'
        });
      }
    }

    // Validar capacidad_maxima para eventos especiales
    if (tipoEventoValido === 'especial' && capacidad_maxima !== undefined && capacidad_maxima !== null) {
      if (isNaN(capacidad_maxima) || capacidad_maxima < 1) {
        return res.status(400).json({
          success: false,
          message: 'La capacidad máxima debe ser un número válido mayor a 0'
        });
      }
    }

    // Validar limite_entradas para eventos generales
    if (tipoEventoValido === 'general') {
      if (limite_entradas === undefined || limite_entradas === null || limite_entradas === '') {
        return res.status(400).json({
          success: false,
          message: 'El límite de entradas es requerido para eventos generales'
        });
      }
      if (isNaN(limite_entradas) || parseInt(limite_entradas) < 1) {
        return res.status(400).json({
          success: false,
          message: 'El límite de entradas debe ser un número válido mayor a 0'
        });
      }
    }

    // Verificar columnas disponibles
    const [columnas] = await pool.execute(columnasEventoQuery);
    const columnasExistentes = columnas.map(c => c.COLUMN_NAME);
    const tieneQrPago = columnasExistentes.includes('qr_pago_url');

    // Construir inserción dinámica
    const campos = [
      'imagen',
      'titulo',
      'descripcion',
      'hora_inicio',
      'precio',
      'es_nuevo',
      'tipo_evento',
      'capacidad_maxima',
      'limite_entradas'
    ];
    const placeholders = Array(campos.length).fill('?');
    const valores = [
      imagen || null,
      titulo,
      descripcion,
      hora_inicio,
      tipoEventoValido === 'general' ? parseFloat(precio) : 0.00,
      es_nuevo ? 1 : 0,
      tipoEventoValido,
      tipoEventoValido === 'especial' ? (capacidad_maxima || null) : null,
      tipoEventoValido === 'general' ? (limite_entradas ? parseInt(limite_entradas) : null) : null
    ];

    if (tieneQrPago) {
      campos.push('qr_pago_url');
      placeholders.push('?');
      valores.push(qr_pago_url || null);
    }

    const [result] = await pool.execute(
      `INSERT INTO eventos (${campos.join(', ')})
       VALUES (${placeholders.join(', ')})`,
      valores
    );

    // Obtener el evento creado
    let querySelect = `SELECT id, imagen, titulo, descripcion, hora_inicio, precio, es_nuevo, tipo_evento, capacidad_maxima, limite_entradas, created_at, updated_at`;
    if (tieneQrPago) {
      querySelect += `, qr_pago_url`;
    }
    querySelect += ` FROM eventos WHERE id = ?`;

    const [eventos] = await pool.execute(querySelect, [result.insertId]);

    res.status(201).json({
      success: true,
      message: 'Evento creado exitosamente',
      data: eventos[0]
    });
  } catch (error) {
    console.error('Error al crear evento:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear el evento',
      error: error.message
    });
  }
};

// Actualizar un evento
export const actualizarEvento = async (req, res) => {
  try {
    const { id } = req.params;
    const { imagen, titulo, descripcion, hora_inicio, precio, es_nuevo, tipo_evento, capacidad_maxima, limite_entradas,
            forma_espacio, escenario_x, escenario_y, escenario_width, escenario_height, layout_bloqueado, qr_pago_url } = req.body;

    // Verificar si el evento existe
    const [eventosExistentes] = await pool.execute(
      'SELECT id, tipo_evento FROM eventos WHERE id = ?',
      [id]
    );

    if (eventosExistentes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    const eventoTipoActual = eventosExistentes[0].tipo_evento;

    // Construir la consulta de actualización dinámicamente
    const campos = [];
    const valores = [];

    if (imagen !== undefined) {
      campos.push('imagen = ?');
      valores.push(imagen || null);
    }
    if (titulo) {
      campos.push('titulo = ?');
      valores.push(titulo);
    }
    if (descripcion) {
      campos.push('descripcion = ?');
      valores.push(descripcion);
    }
    if (hora_inicio) {
      campos.push('hora_inicio = ?');
      valores.push(hora_inicio);
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
    if (es_nuevo !== undefined) {
      campos.push('es_nuevo = ?');
      valores.push(es_nuevo ? 1 : 0);
    }
    if (tipo_evento !== undefined) {
      const tipoEventoValido = tipo_evento === 'especial' ? 'especial' : 'general';
      campos.push('tipo_evento = ?');
      valores.push(tipoEventoValido);
    }
    if (capacidad_maxima !== undefined) {
      if (capacidad_maxima !== null && (isNaN(capacidad_maxima) || capacidad_maxima < 1)) {
        return res.status(400).json({
          success: false,
          message: 'La capacidad máxima debe ser un número válido mayor a 0 o null'
        });
      }
      campos.push('capacidad_maxima = ?');
      valores.push(capacidad_maxima || null);
    }
    if (limite_entradas !== undefined) {
      if (limite_entradas !== null && limite_entradas !== '' && (isNaN(limite_entradas) || parseInt(limite_entradas) < 1)) {
        return res.status(400).json({
          success: false,
          message: 'El límite de entradas debe ser un número válido mayor a 0 o null'
        });
      }
      campos.push('limite_entradas = ?');
      valores.push(limite_entradas && limite_entradas !== '' ? parseInt(limite_entradas) : null);
    }
    if (forma_espacio !== undefined) {
      const formasValidas = ['rectangulo', 'cuadrado', 'triangulo', 'circulo'];
      if (forma_espacio && !formasValidas.includes(forma_espacio)) {
        return res.status(400).json({
          success: false,
          message: `La forma debe ser una de: ${formasValidas.join(', ')}`
        });
      }
      campos.push('forma_espacio = ?');
      valores.push(forma_espacio || null);
    }
    if (escenario_x !== undefined) {
      campos.push('escenario_x = ?');
      valores.push(escenario_x || null);
    }
    if (escenario_y !== undefined) {
      campos.push('escenario_y = ?');
      valores.push(escenario_y || null);
    }
    if (escenario_width !== undefined) {
      campos.push('escenario_width = ?');
      valores.push(escenario_width || null);
    }
    if (escenario_height !== undefined) {
      campos.push('escenario_height = ?');
      valores.push(escenario_height || null);
    }
    if (layout_bloqueado !== undefined) {
      campos.push('layout_bloqueado = ?');
      valores.push(layout_bloqueado ? 1 : 0);
    }

    // Verificar columnas disponibles para campos opcionales
    const [columnas] = await pool.execute(columnasEventoQuery);
    const columnasExistentes = columnas.map(c => c.COLUMN_NAME);
    const tieneQrPago = columnasExistentes.includes('qr_pago_url');

    if (tieneQrPago && qr_pago_url !== undefined) {
      campos.push('qr_pago_url = ?');
      valores.push(qr_pago_url || null);
    }

    if (campos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay campos para actualizar'
      });
    }

    valores.push(id);

    await pool.execute(
      `UPDATE eventos SET ${campos.join(', ')}, updated_at = NOW() WHERE id = ?`,
      valores
    );

    const tieneFormaEspacio = columnasExistentes.includes('forma_espacio');
    const tieneLayoutBloqueado = columnasExistentes.includes('layout_bloqueado');
    
    let querySelect = `SELECT id, imagen, titulo, descripcion, hora_inicio, precio, es_nuevo, tipo_evento, capacidad_maxima, limite_entradas, created_at, updated_at`;
    if (tieneFormaEspacio) {
      querySelect += `, forma_espacio, escenario_x, escenario_y, escenario_width, escenario_height`;
    }
    if (tieneLayoutBloqueado) {
      querySelect += `, layout_bloqueado`;
    }
    if (tieneQrPago) {
      querySelect += `, qr_pago_url`;
    }
    querySelect += ` FROM eventos WHERE id = ?`;
    
    // Obtener el evento actualizado
    const [eventos] = await pool.execute(querySelect, [id]);

    res.json({
      success: true,
      message: 'Evento actualizado exitosamente',
      data: eventos[0]
    });
  } catch (error) {
    console.error('Error al actualizar evento:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el evento',
      error: error.message
    });
  }
};

// Eliminar un evento
export const eliminarEvento = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si el evento existe
    const [eventos] = await pool.execute(
      'SELECT id FROM eventos WHERE id = ?',
      [id]
    );

    if (eventos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    // Eliminar el evento
    await pool.execute('DELETE FROM eventos WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Evento eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar evento:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el evento',
      error: error.message
    });
  }
};

