import pool from '../config/db.js';

// Obtener todos los usuarios con sus roles
export const obtenerUsuarios = async (req, res) => {
  try {
    const [usuarios] = await pool.execute(
      `SELECT u.id, u.nombre_usuario, u.nombre_completo, u.telefono, 
              u.correo, u.activo, u.id_rol, u.created_at, u.updated_at,
              r.nombre as rol_nombre, r.descripcion as rol_descripcion
       FROM usuarios u
       INNER JOIN roles r ON u.id_rol = r.id
       ORDER BY u.created_at DESC`
    );

    res.json({
      success: true,
      data: usuarios
    });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los usuarios',
      error: error.message
    });
  }
};

// Obtener un usuario por ID
export const obtenerUsuarioPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const [usuarios] = await pool.execute(
      `SELECT u.id, u.nombre_usuario, u.nombre_completo, u.telefono, 
              u.correo, u.activo, u.id_rol, u.created_at, u.updated_at,
              r.nombre as rol_nombre, r.descripcion as rol_descripcion
       FROM usuarios u
       INNER JOIN roles r ON u.id_rol = r.id
       WHERE u.id = ?`,
      [id]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    res.json({
      success: true,
      data: usuarios[0]
    });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el usuario',
      error: error.message
    });
  }
};

// Crear un nuevo usuario
export const crearUsuario = async (req, res) => {
  try {
    const { nombre_usuario, nombre_completo, telefono, correo, password, id_rol, activo } = req.body;

    // Validaciones
    if (!nombre_usuario || !nombre_completo || !correo || !password || !id_rol) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos'
      });
    }

    // Verificar si el nombre de usuario ya existe
    const [usuariosExistentes] = await pool.execute(
      'SELECT id FROM usuarios WHERE nombre_usuario = ? OR correo = ?',
      [nombre_usuario, correo]
    );

    if (usuariosExistentes.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'El nombre de usuario o correo ya existe'
      });
    }

    // Insertar nuevo usuario
    const [result] = await pool.execute(
      `INSERT INTO usuarios (nombre_usuario, nombre_completo, telefono, correo, password, activo, id_rol)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre_usuario,
        nombre_completo,
        telefono || null,
        correo,
        password, // En producción esto debe estar hasheado
        activo !== undefined ? activo : true,
        id_rol
      ]
    );

    // Obtener el usuario creado
    const [usuarios] = await pool.execute(
      `SELECT u.id, u.nombre_usuario, u.nombre_completo, u.telefono, 
              u.correo, u.activo, u.id_rol, u.created_at, u.updated_at,
              r.nombre as rol_nombre, r.descripcion as rol_descripcion
       FROM usuarios u
       INNER JOIN roles r ON u.id_rol = r.id
       WHERE u.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente',
      data: usuarios[0]
    });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear el usuario',
      error: error.message
    });
  }
};

// Actualizar un usuario
export const actualizarUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_usuario, nombre_completo, telefono, correo, password, id_rol, activo } = req.body;

    // Verificar si el usuario existe
    const [usuariosExistentes] = await pool.execute(
      'SELECT id FROM usuarios WHERE id = ?',
      [id]
    );

    if (usuariosExistentes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Verificar si el nombre de usuario o correo ya existe en otro usuario
    if (nombre_usuario || correo) {
      const [usuariosDuplicados] = await pool.execute(
        'SELECT id FROM usuarios WHERE (nombre_usuario = ? OR correo = ?) AND id != ?',
        [nombre_usuario, correo, id]
      );

      if (usuariosDuplicados.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'El nombre de usuario o correo ya existe'
        });
      }
    }

    // Construir la consulta de actualización dinámicamente
    const campos = [];
    const valores = [];

    if (nombre_usuario) {
      campos.push('nombre_usuario = ?');
      valores.push(nombre_usuario);
    }
    if (nombre_completo) {
      campos.push('nombre_completo = ?');
      valores.push(nombre_completo);
    }
    if (telefono !== undefined) {
      campos.push('telefono = ?');
      valores.push(telefono || null);
    }
    if (correo) {
      campos.push('correo = ?');
      valores.push(correo);
    }
    if (password) {
      campos.push('password = ?');
      valores.push(password); // En producción esto debe estar hasheado
    }
    if (id_rol) {
      campos.push('id_rol = ?');
      valores.push(id_rol);
    }
    if (activo !== undefined) {
      campos.push('activo = ?');
      valores.push(activo);
    }

    if (campos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay campos para actualizar'
      });
    }

    valores.push(id);

    await pool.execute(
      `UPDATE usuarios SET ${campos.join(', ')}, updated_at = NOW() WHERE id = ?`,
      valores
    );

    // Obtener el usuario actualizado
    const [usuarios] = await pool.execute(
      `SELECT u.id, u.nombre_usuario, u.nombre_completo, u.telefono, 
              u.correo, u.activo, u.id_rol, u.created_at, u.updated_at,
              r.nombre as rol_nombre, r.descripcion as rol_descripcion
       FROM usuarios u
       INNER JOIN roles r ON u.id_rol = r.id
       WHERE u.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      data: usuarios[0]
    });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el usuario',
      error: error.message
    });
  }
};

// Eliminar un usuario
export const eliminarUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si el usuario existe
    const [usuarios] = await pool.execute(
      'SELECT id FROM usuarios WHERE id = ?',
      [id]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Eliminar el usuario
    await pool.execute('DELETE FROM usuarios WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Usuario eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el usuario',
      error: error.message
    });
  }
};

// Obtener todos los roles
export const obtenerRoles = async (req, res) => {
  try {
    const incluirTodos = req.query?.todos === '1' || req.query?.todos === 'true';
    const query = incluirTodos
      ? 'SELECT id, nombre, descripcion, activo FROM roles ORDER BY nombre'
      : 'SELECT id, nombre, descripcion, activo FROM roles WHERE activo = TRUE ORDER BY nombre';

    const [roles] = await pool.execute(query);

    res.json({
      success: true,
      data: roles
    });
  } catch (error) {
    console.error('Error al obtener roles:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los roles',
      error: error.message
    });
  }
};

// Crear un rol
export const crearRol = async (req, res) => {
  try {
    const { nombre, descripcion, activo } = req.body;
    const nombreLimpio = String(nombre || '').trim();

    if (!nombreLimpio) {
      return res.status(400).json({ success: false, message: 'El nombre del rol es requerido' });
    }

    const [dup] = await pool.execute('SELECT id FROM roles WHERE nombre = ?', [nombreLimpio]);
    if (dup.length > 0) {
      return res.status(400).json({ success: false, message: 'Ya existe un rol con ese nombre' });
    }

    const [result] = await pool.execute(
      'INSERT INTO roles (nombre, descripcion, activo) VALUES (?, ?, ?)',
      [nombreLimpio, descripcion ? String(descripcion).trim() : null, activo !== undefined ? !!activo : true]
    );

    const [roles] = await pool.execute('SELECT id, nombre, descripcion, activo FROM roles WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, message: 'Rol creado exitosamente', data: roles[0] });
  } catch (error) {
    console.error('Error al crear rol:', error);
    res.status(500).json({ success: false, message: 'Error al crear el rol', error: error.message });
  }
};

// Actualizar un rol
export const actualizarRol = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, activo } = req.body;

    const [exist] = await pool.execute('SELECT id, nombre FROM roles WHERE id = ?', [id]);
    if (exist.length === 0) {
      return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    }

    const campos = [];
    const valores = [];

    if (nombre !== undefined) {
      const nombreLimpio = String(nombre || '').trim();
      if (!nombreLimpio) {
        return res.status(400).json({ success: false, message: 'El nombre del rol no puede estar vacío' });
      }
      // validar duplicado
      const [dup] = await pool.execute('SELECT id FROM roles WHERE nombre = ? AND id != ?', [nombreLimpio, id]);
      if (dup.length > 0) {
        return res.status(400).json({ success: false, message: 'Ya existe otro rol con ese nombre' });
      }
      campos.push('nombre = ?');
      valores.push(nombreLimpio);
    }

    if (descripcion !== undefined) {
      campos.push('descripcion = ?');
      valores.push(descripcion ? String(descripcion).trim() : null);
    }

    if (activo !== undefined) {
      campos.push('activo = ?');
      valores.push(!!activo);
    }

    if (campos.length === 0) {
      return res.status(400).json({ success: false, message: 'No hay campos para actualizar' });
    }

    valores.push(id);
    await pool.execute(`UPDATE roles SET ${campos.join(', ')}, updated_at = NOW() WHERE id = ?`, valores);

    const [roles] = await pool.execute('SELECT id, nombre, descripcion, activo FROM roles WHERE id = ?', [id]);
    res.json({ success: true, message: 'Rol actualizado exitosamente', data: roles[0] });
  } catch (error) {
    console.error('Error al actualizar rol:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar el rol', error: error.message });
  }
};

// Eliminar un rol (solo si no está asignado a usuarios)
export const eliminarRol = async (req, res) => {
  try {
    const { id } = req.params;

    const [roles] = await pool.execute('SELECT id, nombre FROM roles WHERE id = ?', [id]);
    if (roles.length === 0) {
      return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    }

    const rolNombre = String(roles[0].nombre || '').toLowerCase();
    if (rolNombre === 'admin') {
      return res.status(400).json({ success: false, message: 'No se puede eliminar el rol admin' });
    }

    const [enUso] = await pool.execute('SELECT COUNT(*) AS total FROM usuarios WHERE id_rol = ?', [id]);
    if ((enUso?.[0]?.total || 0) > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar este rol porque hay usuarios asignados. Desactívalo en su lugar.'
      });
    }

    await pool.execute('DELETE FROM roles WHERE id = ?', [id]);
    res.json({ success: true, message: 'Rol eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar rol:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar el rol', error: error.message });
  }
};

// Borrar todos los datos de la base de datos excepto usuarios y roles
export const borrarTodosLosDatos = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Desactivar temporalmente las verificaciones de foreign keys
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');

    // Eliminar datos en orden para evitar problemas con foreign keys
    // Empezar con las tablas dependientes (hijas)
    
    // Tablas de escaneo y entradas
    await connection.execute('DELETE FROM escaneos_entradas');
    await connection.execute('DELETE FROM entradas');
    
    // Tablas de compras relacionadas
    await connection.execute('DELETE FROM compras_asientos');
    await connection.execute('DELETE FROM compras_mesas');
    try { await connection.execute('DELETE FROM compras_entradas_generales'); } catch (_) {}
    try { await connection.execute('DELETE FROM compras_areas_personas'); } catch (_) {}
    try { await connection.execute('DELETE FROM cupones_usados'); } catch (_) {}
    await connection.execute('DELETE FROM compras');
    try { await connection.execute('DELETE FROM cupones'); } catch (_) {}
    await connection.execute('DELETE FROM pagos');
    
    // Tablas de layout y asientos/mesas
    await connection.execute('DELETE FROM asientos');
    await connection.execute('DELETE FROM mesas');
    await connection.execute('DELETE FROM areas_layout');
    await connection.execute('DELETE FROM tipos_precio_evento');
    
    // Tablas principales (no borrar: usuarios, roles, contacto_info)
    await connection.execute('DELETE FROM eventos');
    await connection.execute('DELETE FROM clientes');

    // Reactivar las verificaciones de foreign keys
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

    await connection.commit();
    connection.release();

    res.json({
      success: true,
      message: 'Todos los datos han sido eliminados (se conservan usuarios, roles y datos de contacto)'
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    
    console.error('Error al borrar todos los datos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al borrar los datos',
      error: error.message
    });
  }
};

