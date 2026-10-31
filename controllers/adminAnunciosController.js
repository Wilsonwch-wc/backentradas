import pool from '../config/db.js';

const ADMIN_EMAIL = 'reviewiasit@gmail.com';

export const requireAnunciosAdmin = async (req, res, next) => {
  try {
    const correo = req.user?.correo || req.user?.email;
    const rol    = (req.user?.rol || '').toLowerCase();
    if (rol === 'admin' || correo === ADMIN_EMAIL) return next();
    return res.status(403).json({ success: false, message: 'No tienes permisos de administrador para AnunciosYA' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const [[totales]] = await pool.query("SELECT COUNT(*) AS total_anuncios, SUM(estado = 'activo') AS activos, SUM(estado = 'pausado') AS pausados, SUM(estado = 'vendido') AS vendidos, SUM(estado = 'eliminado') AS eliminados, SUM(nuevo = 1) AS nuevos_hoy, COALESCE(SUM(visitas), 0) AS total_visitas FROM anuncios");
    const [[usuariosStats]] = await pool.query("SELECT COUNT(*) AS total_usuarios, SUM(auth_provider = 'google') AS por_google, SUM(auth_provider = 'local') AS por_local, SUM(DATE(created_at) = CURDATE()) AS registrados_hoy FROM usuarios");
    const [porCategoria] = await pool.query("SELECT categoria, COUNT(*) AS cantidad, COALESCE(SUM(visitas), 0) AS visitas_total FROM anuncios WHERE estado = 'activo' GROUP BY categoria ORDER BY cantidad DESC");
    const [porCiudad] = await pool.query("SELECT ciudad, COUNT(*) AS cantidad FROM anuncios WHERE estado = 'activo' GROUP BY ciudad ORDER BY cantidad DESC LIMIT 10");
    const [registrosPorDia] = await pool.query('SELECT DATE(created_at) AS dia, COUNT(*) AS nuevos FROM anuncios WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY DATE(created_at) ORDER BY dia ASC');
    const [masVistos] = await pool.query('SELECT a.id, a.titulo, a.categoria, a.ciudad, a.visitas, a.estado, u.nombre_completo AS vendedor, u.correo AS vendedor_correo FROM anuncios a LEFT JOIN usuarios u ON a.id_usuario = u.id ORDER BY a.visitas DESC LIMIT 10');
    return res.json({ success: true, data: { totales, usuarios: usuariosStats, porCategoria, porCiudad, registrosPorDia, masVistos } });
  } catch (error) {
    console.error('Error getDashboardStats:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listarAnunciosAdmin = async (req, res) => {
  try {
    const { estado, categoria, ciudad, buscar, pagina = 1, limite = 20 } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(limite);
    let where = 'WHERE 1=1';
    const params = [];
    if (estado && estado !== 'todos') { where += ' AND a.estado = ?'; params.push(estado); }
    if (categoria && categoria !== 'todas') { where += ' AND a.categoria = ?'; params.push(categoria); }
    if (ciudad && ciudad !== 'Todas') { where += ' AND a.ciudad = ?'; params.push(ciudad); }
    if (buscar && buscar.trim()) {
      where += ' AND (LOWER(a.titulo) LIKE ? OR LOWER(u.nombre_completo) LIKE ? OR LOWER(u.correo) LIKE ?)';
      const term = '%' + buscar.trim().toLowerCase() + '%';
      params.push(term, term, term);
    }
    const [[totRow]] = await pool.query('SELECT COUNT(*) AS total FROM anuncios a LEFT JOIN usuarios u ON a.id_usuario = u.id ' + where, params);
    const [anuncios] = await pool.query('SELECT a.id, a.titulo, a.precio, a.categoria, a.ciudad, a.estado, a.visitas, a.destacado, a.nuevo, a.created_at, a.fecha_expiracion, a.costo_total, a.imagen_principal, a.dias_duracion, u.id AS id_usuario, u.nombre_completo AS vendedor, u.correo AS vendedor_correo, u.telefono AS vendedor_telefono FROM anuncios a LEFT JOIN usuarios u ON a.id_usuario = u.id ' + where + ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?', [...params, parseInt(limite), offset]);
    return res.json({ success: true, data: { anuncios, total: totRow.total, pagina: parseInt(pagina), limite: parseInt(limite) } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const cambiarEstadoAnuncio = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, motivo } = req.body;
    const estadosValidos = ['activo', 'pausado', 'vendido', 'eliminado'];
    if (!estadosValidos.includes(estado)) return res.status(400).json({ success: false, message: 'Estado invalido' });
    await pool.query('UPDATE anuncios SET estado = ?, updated_at = NOW() WHERE id = ?', [estado, id]);
    console.log('[ADMIN] Anuncio #' + id + ' -> ' + estado + ' motivo: ' + (motivo || 'N/A') + ' admin: ' + (req.user?.correo || ''));
    return res.json({ success: true, message: 'Anuncio actualizado a ' + estado });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listarUsuariosAnunciantes = async (req, res) => {
  try {
    const { buscar, pagina = 1, limite = 20 } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(limite);
    let where = "WHERE 1=1";
    const params = [];
    if (buscar && buscar.trim()) {
      where += ' AND (LOWER(u.nombre_completo) LIKE ? OR LOWER(u.correo) LIKE ?)';
      const term = '%' + buscar.trim().toLowerCase() + '%';
      params.push(term, term);
    }
    const [[totRow]] = await pool.query('SELECT COUNT(*) AS total FROM usuarios u ' + where, params);
    const [usuarios] = await pool.query('SELECT u.id, u.nombre_completo, u.apellidos, u.correo, u.telefono, u.ubicacion, u.activo, u.auth_provider, u.avatar_url, u.created_at, (SELECT COUNT(*) FROM anuncios WHERE id_usuario = u.id) AS total_anuncios, (SELECT COUNT(*) FROM anuncios WHERE id_usuario = u.id AND estado = "activo") AS anuncios_activos FROM usuarios u ' + where + ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?', [...params, parseInt(limite), offset]);
    return res.json({ success: true, data: { usuarios, total: totRow.total, pagina: parseInt(pagina), limite: parseInt(limite) } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const cambiarEstadoUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;
    await pool.query('UPDATE usuarios SET activo = ?, updated_at = NOW() WHERE id = ?', [activo ? 1 : 0, id]);
    return res.json({ success: true, message: 'Usuario ' + id + (activo ? ' activado' : ' desactivado') });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const anunciosDeUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const [anuncios] = await pool.query('SELECT id, titulo, precio, categoria, ciudad, estado, visitas, created_at, fecha_expiracion FROM anuncios WHERE id_usuario = ? ORDER BY created_at DESC', [id]);
    return res.json({ success: true, data: anuncios });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ── CUPONES DE ANUNCIOSYA ── */

export const listarCuponesAdmin = async (req, res) => {
  try {
    const [cupones] = await pool.query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM cupones_anuncios_usos WHERE id_cupon = c.id) AS total_usos_reales
       FROM cupones_anuncios c
       ORDER BY c.created_at DESC`
    );
    return res.json({ success: true, data: cupones });
  } catch (error) {
    console.error('Error listarCuponesAdmin:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const crearCuponAdmin = async (req, res) => {
  try {
    const {
      codigo,
      descripcion,
      tipo = 'gratis',
      valor = 100,
      limite_usos = 10,
      limite_por_usuario = 1,
      fecha_expiracion
    } = req.body;

    if (!codigo || !codigo.trim()) {
      return res.status(400).json({ success: false, message: 'El código del cupón es obligatorio.' });
    }

    const code = codigo.trim().toUpperCase();

    // Verificar si ya existe
    const [existentes] = await pool.query(
      'SELECT id FROM cupones_anuncios WHERE UPPER(codigo) = ?',
      [code]
    );

    if (existentes.length > 0) {
      return res.status(400).json({ success: false, message: `El cupón con código "${code}" ya existe.` });
    }

    const [result] = await pool.query(
      `INSERT INTO cupones_anuncios (
        codigo, descripcion, tipo, valor, limite_usos, usos_actuales, 
        limite_por_usuario, activo, fecha_expiracion
      ) VALUES (?, ?, ?, ?, ?, 0, ?, 1, ?)`,
      [
        code,
        descripcion?.trim() || 'Cupón de Publicación',
        tipo,
        parseFloat(valor) || 100.00,
        parseInt(limite_usos, 10) || 10,
        parseInt(limite_por_usuario, 10) || 1,
        fecha_expiracion ? new Date(fecha_expiracion) : null
      ]
    );

    const [nuevo] = await pool.query('SELECT * FROM cupones_anuncios WHERE id = ?', [result.insertId]);

    return res.json({
      success: true,
      message: `¡Cupón "${code}" creado con éxito!`,
      data: nuevo[0]
    });
  } catch (error) {
    console.error('Error crearCuponAdmin:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const cambiarEstadoCuponAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;

    await pool.query(
      'UPDATE cupones_anuncios SET activo = ?, updated_at = NOW() WHERE id = ?',
      [activo ? 1 : 0, id]
    );

    return res.json({
      success: true,
      message: `Cupón #${id} ${activo ? 'activado' : 'desactivado'} con éxito.`
    });
  } catch (error) {
    console.error('Error cambiarEstadoCuponAdmin:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const eliminarCuponAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM cupones_anuncios WHERE id = ?', [id]);
    return res.json({ success: true, message: `Cupón #${id} eliminado correctamente.` });
  } catch (error) {
    console.error('Error eliminarCuponAdmin:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};