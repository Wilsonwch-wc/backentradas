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
    const [roles] = await pool.execute(
      'SELECT id, nombre, descripcion, activo FROM roles WHERE activo = TRUE ORDER BY nombre'
    );

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

