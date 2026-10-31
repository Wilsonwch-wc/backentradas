import pool from '../config/db.js';

// =========================================================
// TIENDAS - CRUD
// =========================================================

/**
 * Obtener todas las tiendas activas (vista pública)
 */
export const obtenerTiendas = async (req, res) => {
  try {
    const { ubicacion, categoria, busqueda, limite = 20, pagina = 1 } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(limite);

    let whereConditions = ['t.activa = 1'];
    const params = [];

    if (ubicacion && ubicacion !== 'Todos') {
      whereConditions.push('t.ubicacion = ?');
      params.push(ubicacion);
    }

    if (categoria && categoria !== 'Todos') {
      whereConditions.push('t.categoria_principal = ?');
      params.push(categoria);
    }

    if (busqueda) {
      whereConditions.push('(t.nombre_tienda LIKE ? OR t.descripcion LIKE ? OR t.nombre_propietario LIKE ?)');
      const b = `%${busqueda}%`;
      params.push(b, b, b);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const [tiendas] = await pool.query(
      `SELECT t.id, t.nombre_tienda, t.nombre_propietario, t.descripcion,
              t.ubicacion, t.direccion, t.telefono, t.email,
              t.logo_url, t.banner_url, t.categoria_principal,
              t.activa, t.destacada, t.visitas, t.created_at,
              (SELECT COUNT(*) FROM productos p WHERE p.id_tienda = t.id AND p.activo = 1) as total_productos
       FROM tiendas t
       ${whereClause}
       ORDER BY t.destacada DESC, t.visitas DESC, t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limite), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM tiendas t ${whereClause}`,
      params
    );

    return res.json({
      success: true,
      data: tiendas,
      paginacion: {
        total: parseInt(total),
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        paginas: Math.ceil(parseInt(total) / parseInt(limite))
      }
    });
  } catch (error) {
    console.error('❌ Error al obtener tiendas:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Obtener una tienda por ID (vista pública) - incluye productos
 */
export const obtenerTiendaPorId = async (req, res) => {
  try {
    const { id } = req.params;

    // Incrementar visitas
    await pool.query('UPDATE tiendas SET visitas = visitas + 1 WHERE id = ?', [id]);

    const [[tienda]] = await pool.query(
      `SELECT t.*, u.correo as email_propietario
       FROM tiendas t
       LEFT JOIN usuarios u ON t.id_usuario = u.id
       WHERE t.id = ? AND t.activa = 1`,
      [id]
    );

    if (!tienda) {
      return res.status(404).json({ success: false, message: 'Tienda no encontrada' });
    }

    const [productos] = await pool.query(
      `SELECT id, nombre, descripcion, categoria, precio, cantidad_disponible, imagen_url, activo, created_at
       FROM productos
       WHERE id_tienda = ? AND activo = 1
       ORDER BY created_at DESC`,
      [id]
    );

    return res.json({
      success: true,
      data: { ...tienda, productos }
    });
  } catch (error) {
    console.error('❌ Error al obtener tienda:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Obtener tienda del usuario autenticado
 */
export const obtenerMiTienda = async (req, res) => {
  try {
    const userId = req.user?.id;

    const [tiendas] = await pool.query(
      `SELECT * FROM tiendas WHERE id_usuario = ? ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (tiendas.length === 0) {
      return res.json({ success: true, data: null, message: 'No tienes una tienda registrada' });
    }

    const tienda = tiendas[0];

    const [productos] = await pool.query(
      `SELECT * FROM productos WHERE id_tienda = ? ORDER BY created_at DESC`,
      [tienda.id]
    );

    return res.json({
      success: true,
      data: { ...tienda, productos }
    });
  } catch (error) {
    console.error('❌ Error al obtener mi tienda:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Crear una nueva tienda
 */
export const crearTienda = async (req, res) => {
  try {
    const userId = req.user?.id;
    const {
      nombre_tienda, nombre_propietario, descripcion,
      ubicacion, direccion, telefono, email,
      logo_url, banner_url, categoria_principal
    } = req.body;

    if (!nombre_tienda || !nombre_propietario) {
      return res.status(400).json({
        success: false,
        message: 'El nombre de la tienda y del propietario son obligatorios'
      });
    }

    // Verificar si ya tiene una tienda
    const [existentes] = await pool.query(
      'SELECT id FROM tiendas WHERE id_usuario = ?',
      [userId]
    );

    if (existentes.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya tienes una tienda registrada. Puedes editar la existente.'
      });
    }

    const [result] = await pool.query(
      `INSERT INTO tiendas (
        id_usuario, nombre_tienda, nombre_propietario, descripcion,
        ubicacion, direccion, telefono, email, logo_url, banner_url, categoria_principal
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        nombre_tienda.trim(),
        nombre_propietario.trim(),
        descripcion || null,
        ubicacion || 'Cochabamba',
        direccion || null,
        telefono || null,
        email || null,
        logo_url || null,
        banner_url || null,
        categoria_principal || null
      ]
    );

    // Actualizar tipo_cuenta del usuario
    await pool.query(
      "UPDATE usuarios SET tipo_cuenta = 'negocio' WHERE id = ?",
      [userId]
    );

    const [[tienda]] = await pool.query(
      'SELECT * FROM tiendas WHERE id = ?',
      [result.insertId]
    );

    return res.json({
      success: true,
      message: '¡Tienda creada exitosamente!',
      data: tienda
    });
  } catch (error) {
    console.error('❌ Error al crear tienda:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Actualizar tienda (solo el propietario)
 */
export const actualizarTienda = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    // Verificar propiedad
    const [[tienda]] = await pool.query(
      'SELECT id FROM tiendas WHERE id = ? AND id_usuario = ?',
      [id, userId]
    );

    if (!tienda) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para editar esta tienda'
      });
    }

    const {
      nombre_tienda, nombre_propietario, descripcion,
      ubicacion, direccion, telefono, email,
      logo_url, banner_url, categoria_principal, activa
    } = req.body;

    await pool.query(
      `UPDATE tiendas SET
        nombre_tienda = COALESCE(?, nombre_tienda),
        nombre_propietario = COALESCE(?, nombre_propietario),
        descripcion = ?,
        ubicacion = COALESCE(?, ubicacion),
        direccion = ?,
        telefono = ?,
        email = ?,
        logo_url = COALESCE(?, logo_url),
        banner_url = COALESCE(?, banner_url),
        categoria_principal = ?,
        activa = COALESCE(?, activa)
      WHERE id = ?`,
      [
        nombre_tienda || null,
        nombre_propietario || null,
        descripcion !== undefined ? descripcion : undefined,
        ubicacion || null,
        direccion !== undefined ? direccion : undefined,
        telefono !== undefined ? telefono : undefined,
        email !== undefined ? email : undefined,
        logo_url || null,
        banner_url || null,
        categoria_principal !== undefined ? categoria_principal : undefined,
        activa !== undefined ? activa : null,
        id
      ]
    );

    const [[tiendaActualizada]] = await pool.query(
      'SELECT * FROM tiendas WHERE id = ?',
      [id]
    );

    return res.json({
      success: true,
      message: 'Tienda actualizada exitosamente',
      data: tiendaActualizada
    });
  } catch (error) {
    console.error('❌ Error al actualizar tienda:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// =========================================================
// PRODUCTOS - CRUD
// =========================================================

/**
 * Crear producto (solo el dueño de la tienda)
 */
export const crearProducto = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id_tienda, nombre, descripcion, categoria, precio, cantidad_disponible, imagen_url } = req.body;

    if (!id_tienda || !nombre || precio === undefined) {
      return res.status(400).json({
        success: false,
        message: 'id_tienda, nombre y precio son obligatorios'
      });
    }

    // Verificar que la tienda pertenece al usuario
    const [[tienda]] = await pool.query(
      'SELECT id FROM tiendas WHERE id = ? AND id_usuario = ?',
      [id_tienda, userId]
    );

    if (!tienda) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para agregar productos a esta tienda'
      });
    }

    const [result] = await pool.query(
      `INSERT INTO productos (id_tienda, nombre, descripcion, categoria, precio, cantidad_disponible, imagen_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id_tienda,
        nombre.trim(),
        descripcion || null,
        categoria || 'otros',
        parseFloat(precio),
        parseInt(cantidad_disponible) || 0,
        imagen_url || null
      ]
    );

    const [[producto]] = await pool.query(
      'SELECT * FROM productos WHERE id = ?',
      [result.insertId]
    );

    return res.json({
      success: true,
      message: 'Producto agregado exitosamente',
      data: producto
    });
  } catch (error) {
    console.error('❌ Error al crear producto:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Actualizar producto (solo el dueño de la tienda)
 */
export const actualizarProducto = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    // Verificar propiedad: el producto debe pertenecer a una tienda del usuario
    const [[producto]] = await pool.query(
      `SELECT p.* FROM productos p
       INNER JOIN tiendas t ON p.id_tienda = t.id
       WHERE p.id = ? AND t.id_usuario = ?`,
      [id, userId]
    );

    if (!producto) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para editar este producto'
      });
    }

    const { nombre, descripcion, categoria, precio, cantidad_disponible, imagen_url, activo } = req.body;

    await pool.query(
      `UPDATE productos SET
        nombre = COALESCE(?, nombre),
        descripcion = ?,
        categoria = COALESCE(?, categoria),
        precio = COALESCE(?, precio),
        cantidad_disponible = COALESCE(?, cantidad_disponible),
        imagen_url = COALESCE(?, imagen_url),
        activo = COALESCE(?, activo)
      WHERE id = ?`,
      [
        nombre || null,
        descripcion !== undefined ? descripcion : producto.descripcion,
        categoria || null,
        precio !== undefined ? parseFloat(precio) : null,
        cantidad_disponible !== undefined ? parseInt(cantidad_disponible) : null,
        imagen_url || null,
        activo !== undefined ? activo : null,
        id
      ]
    );

    const [[productoActualizado]] = await pool.query(
      'SELECT * FROM productos WHERE id = ?',
      [id]
    );

    return res.json({
      success: true,
      message: 'Producto actualizado exitosamente',
      data: productoActualizado
    });
  } catch (error) {
    console.error('❌ Error al actualizar producto:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Eliminar producto (solo el dueño de la tienda)
 */
export const eliminarProducto = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    // Verificar propiedad
    const [[producto]] = await pool.query(
      `SELECT p.id FROM productos p
       INNER JOIN tiendas t ON p.id_tienda = t.id
       WHERE p.id = ? AND t.id_usuario = ?`,
      [id, userId]
    );

    if (!producto) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para eliminar este producto'
      });
    }

    await pool.query('DELETE FROM productos WHERE id = ?', [id]);

    return res.json({
      success: true,
      message: 'Producto eliminado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error al eliminar producto:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Obtener productos de una tienda (vista pública)
 */
export const obtenerProductosDeTienda = async (req, res) => {
  try {
    const { id_tienda } = req.params;
    const { categoria } = req.query;

    let where = 'WHERE p.id_tienda = ? AND p.activo = 1';
    const params = [id_tienda];

    if (categoria && categoria !== 'todos') {
      where += ' AND p.categoria = ?';
      params.push(categoria);
    }

    const [productos] = await pool.query(
      `SELECT * FROM productos p ${where} ORDER BY p.created_at DESC`,
      params
    );

    return res.json({ success: true, data: productos });
  } catch (error) {
    console.error('❌ Error al obtener productos:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
