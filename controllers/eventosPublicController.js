import pool from '../config/db.js';
import { generarSlug } from '../utils/slug.js';

const columnasEventoPublicQuery = `
  SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'eventos' 
    AND COLUMN_NAME IN ('forma_espacio', 'escenario_x', 'escenario_y', 'escenario_width', 'escenario_height', 'hoja_ancho', 'hoja_alto', 'qr_pago_url', 'estado')
`;

// Obtener todos los eventos (público - sin autenticación)
export const obtenerEventosPublicos = async (req, res) => {
  try {
    const [columnas] = await pool.execute(columnasEventoPublicQuery);
    const columnasExistentes = columnas.map(c => c.COLUMN_NAME);
    const tieneQrPago = columnasExistentes.includes('qr_pago_url');

    const tieneEstado = columnasExistentes.includes('estado');
    
    let query = `SELECT id, imagen, titulo, descripcion, hora_inicio, precio, es_nuevo, tipo_evento, created_at, updated_at`;
    if (tieneQrPago) {
      query += `, qr_pago_url`;
    }
    if (tieneEstado) {
      query += `, estado`;
    }
    // Filtrar eventos: solo mostrar eventos activos o próximamente, que no estén finalizados u ocultos
    // Si no existe el campo estado, usar solo la fecha
    if (tieneEstado) {
      // Mostrar solo eventos con estado 'activo' o 'proximamente'
      // También incluir eventos con estado NULL (eventos antiguos sin estado definido) para compatibilidad
      query += ` FROM eventos WHERE (estado IN ('activo', 'proximamente') OR estado IS NULL) AND hora_inicio >= NOW() ORDER BY hora_inicio ASC`;
    } else {
      query += ` FROM eventos WHERE hora_inicio >= NOW() ORDER BY hora_inicio ASC`;
    }

    const [eventos] = await pool.execute(query);

    // Para eventos especiales, obtener el precio más bajo de los tipos de precio
    // También generar slug desde el título
    const eventosConPrecio = await Promise.all(eventos.map(async (evento) => {
      if (evento.tipo_evento === 'especial') {
        // Obtener todos los tipos de precio del evento y encontrar el más bajo
        const [tiposPrecio] = await pool.execute(
          `SELECT precio FROM tipos_precio_evento WHERE evento_id = ? ORDER BY precio ASC LIMIT 1`,
          [evento.id]
        );
        if (tiposPrecio.length > 0) {
          evento.precio = tiposPrecio[0].precio;
        }
      }
      // Generar slug desde el título
      evento.slug = generarSlug(evento.titulo);
      return evento;
    }));

    res.json({
      success: true,
      data: eventosConPrecio
    });
  } catch (error) {
    console.error('Error al obtener eventos públicos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los eventos',
      error: error.message
    });
  }
};

// Obtener un evento por slug (generado del título) o ID (público)
export const obtenerEventoPublicoPorId = async (req, res) => {
  try {
    const { id } = req.params; // Puede ser slug o ID numérico

    // Verificar qué columnas existen para el layout/qr
    const [columnas] = await pool.execute(columnasEventoPublicQuery);
    
    const columnasExistentes = columnas.map(c => c.COLUMN_NAME);
    const tieneFormaEspacio = columnasExistentes.includes('forma_espacio');
    const tieneHojaAncho = columnasExistentes.includes('hoja_ancho');
    const tieneHojaAlto = columnasExistentes.includes('hoja_alto');
    const tieneQrPago = columnasExistentes.includes('qr_pago_url');
    
    const tieneEstado = columnasExistentes.includes('estado');
    
    let query = `SELECT id, imagen, titulo, descripcion, hora_inicio, precio, es_nuevo, tipo_evento, created_at, updated_at`;
    
    if (tieneFormaEspacio) {
      query += `, forma_espacio, escenario_x, escenario_y, escenario_width, escenario_height`;
    }
    if (tieneHojaAncho) query += `, hoja_ancho`;
    if (tieneHojaAlto) query += `, hoja_alto`;
    if (tieneQrPago) {
      query += `, qr_pago_url`;
    }
    if (tieneEstado) {
      query += `, estado`;
    }
    
    // Si es numérico, buscar por ID. Si no, buscar por título convertido a slug
    const isNumeric = /^\d+$/.test(id);
    let eventos = [];
    
    // Agregar filtro de estado si existe
    let filtroEstado = '';
    if (tieneEstado) {
      filtroEstado = ` AND (estado IN ('activo', 'proximamente') OR estado IS NULL)`;
    }
    
    if (isNumeric) {
      // Búsqueda por ID (compatibilidad con URLs antiguas)
      query += ` FROM eventos WHERE id = ?${filtroEstado}`;
      [eventos] = await pool.execute(query, [id]);
    } else {
      // Búsqueda por slug: obtener todos los eventos y comparar slugs generados
      // Esto es necesario porque MySQL no puede hacer coincidencia exacta de slugs generados dinámicamente
      query += ` FROM eventos WHERE 1=1${filtroEstado}`;
      const [todosEventos] = await pool.execute(query);
      
      // Buscar el evento cuyo slug generado coincida
      eventos = todosEventos.filter(evento => {
        const slugEvento = generarSlug(evento.titulo);
        return slugEvento === id;
      });
      
      // Si no se encuentra, intentar buscar por ID como fallback (por si acaso el slug es un número)
      if (eventos.length === 0) {
        const numId = parseInt(id);
        if (!isNaN(numId)) {
          query = `SELECT id, imagen, titulo, descripcion, hora_inicio, precio, es_nuevo, tipo_evento, created_at, updated_at`;
          if (tieneFormaEspacio) {
            query += `, forma_espacio, escenario_x, escenario_y, escenario_width, escenario_height`;
          }
          if (tieneHojaAncho) query += `, hoja_ancho`;
          if (tieneHojaAlto) query += `, hoja_alto`;
          if (tieneQrPago) {
            query += `, qr_pago_url`;
          }
          if (tieneEstado) {
            query += `, estado`;
          }
          query += ` FROM eventos WHERE id = ?${filtroEstado}`;
          const [eventosPorId] = await pool.execute(query, [numId]);
          if (eventosPorId.length > 0) {
            eventos = eventosPorId;
          }
        }
      }
    }

    if (eventos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    const evento = eventos[0];
    const eventoId = evento.id; // Usar el ID real del evento

    // Si es un evento especial, obtener todos los tipos de precio, mesas y asientos
    if (evento.tipo_evento === 'especial') {
      const [tiposPrecio] = await pool.execute(
        `SELECT id, nombre, precio, descripcion, color
         FROM tipos_precio_evento
         WHERE evento_id = ? AND activo = 1
         ORDER BY precio DESC`,
        [eventoId]
      );
      evento.tipos_precio = tiposPrecio;
      // También establecer el precio más bajo como precio principal
      if (tiposPrecio.length > 0) {
        const precioMinimo = tiposPrecio.reduce((min, tp) => tp.precio < min ? tp.precio : min, tiposPrecio[0].precio);
        evento.precio = precioMinimo;
      }

      // Obtener mesas con sus posiciones y dimensiones
      const [mesas] = await pool.execute(
        `SELECT id, numero_mesa, capacidad_sillas, tipo_precio_id, posicion_x, posicion_y, ancho, alto
         FROM mesas
         WHERE evento_id = ? AND activo = 1
         ORDER BY numero_mesa ASC`,
        [eventoId]
      );
      evento.mesas = mesas;

      // Obtener asientos con sus posiciones, estado y área
      const [asientos] = await pool.execute(
        `SELECT a.id, a.mesa_id, a.numero_asiento, a.tipo_precio_id, a.estado, 
                a.posicion_x, a.posicion_y, a.area_id, ar.nombre as area_nombre
         FROM asientos a
         LEFT JOIN areas_layout ar ON a.area_id = ar.id
         WHERE a.evento_id = ?
         ORDER BY a.mesa_id ASC, a.numero_asiento ASC`,
        [eventoId]
      );
      evento.asientos = asientos;

      // Obtener áreas del layout (incluye tipo PERSONAS para zona general)
      try {
        const [areas] = await pool.execute(
          `SELECT ar.id, ar.nombre, ar.posicion_x, ar.posicion_y, ar.ancho, ar.alto, ar.color,
                  ar.tipo_area, ar.capacidad_personas, ar.orden, ar.forma, ar.tipo_precio_id,
                  tp.precio as precio_area, tp.nombre as tipo_precio_nombre
           FROM areas_layout ar
           LEFT JOIN tipos_precio_evento tp ON ar.tipo_precio_id = tp.id AND tp.activo = 1
           WHERE ar.evento_id = ?
           ORDER BY COALESCE(ar.orden, 999), ar.nombre ASC`,
          [eventoId]
        );
        // Para áreas PERSONAS, calcular reservadas y disponibles
        for (const area of areas) {
          area.tipo_area = area.tipo_area || 'SILLAS';
          area.forma = area.forma || 'rectangulo';
          if (area.tipo_area === 'PERSONAS' && area.capacidad_personas) {
            const [reservas] = await pool.execute(
              `SELECT COALESCE(SUM(cantidad), 0) as total
               FROM compras_areas_personas cap
               INNER JOIN compras c ON cap.compra_id = c.id
               WHERE cap.area_id = ? AND c.estado IN ('PAGO_PENDIENTE', 'PAGO_REALIZADO', 'ENTRADA_USADA')`,
              [area.id]
            );
            area.personas_reservadas = parseInt(reservas[0]?.total || 0, 10);
            area.personas_disponibles = Math.max(0, (area.capacidad_personas || 0) - area.personas_reservadas);
            area.precio = area.precio_area != null ? parseFloat(area.precio_area) : null;
          }
        }
        evento.areas = areas;
      } catch (error) {
        console.warn('No se pudieron cargar las áreas:', error);
        evento.areas = [];
      }
    } else {
      evento.tipos_precio = [];
      evento.mesas = [];
      evento.asientos = [];
      evento.areas = [];
    }

    // Agregar slug generado desde el título
    evento.slug = generarSlug(evento.titulo);

    res.json({
      success: true,
      data: evento
    });
  } catch (error) {
    console.error('Error al obtener evento público:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el evento',
      error: error.message
    });
  }
};

