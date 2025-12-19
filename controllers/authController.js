import pool from '../config/db.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_jwt_aqui';

// Login de usuario (admin o seguridad)
export const login = async (req, res) => {
  try {
    const { nombre_usuario, password } = req.body;

    // Validar campos
    if (!nombre_usuario || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nombre de usuario y contraseña son requeridos'
      });
    }

    // Buscar usuario en la base de datos
    const [usuarios] = await pool.execute(
      `SELECT u.id, u.nombre_usuario, u.nombre_completo, u.correo, u.password, 
              u.activo, u.id_rol, r.nombre as rol_nombre
       FROM usuarios u
       INNER JOIN roles r ON u.id_rol = r.id
       WHERE u.nombre_usuario = ?`,
      [nombre_usuario]
    );

    if (usuarios.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    const usuario = usuarios[0];

    // Verificar si el usuario está activo
    if (!usuario.activo) {
      return res.status(403).json({
        success: false,
        message: 'Usuario inactivo. Contacta al administrador'
      });
    }

    // Verificar contraseña (texto plano por ahora)
    if (usuario.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Generar token JWT
    const token = jwt.sign(
      {
        id: usuario.id,
        nombre_usuario: usuario.nombre_usuario,
        nombre_completo: usuario.nombre_completo,
        correo: usuario.correo,
        rol: usuario.rol_nombre,
        id_rol: usuario.id_rol
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Retornar datos del usuario (sin password)
    res.json({
      success: true,
      message: 'Login exitoso',
      data: {
        token,
        user: {
          id: usuario.id,
          nombre_usuario: usuario.nombre_usuario,
          nombre_completo: usuario.nombre_completo,
          correo: usuario.correo,
          rol: usuario.rol_nombre,
          id_rol: usuario.id_rol
        }
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      message: 'Error al iniciar sesión',
      error: error.message
    });
  }
};

// Verificar token y obtener información del usuario actual
export const verifyAuth = async (req, res) => {
  try {
    // El middleware verifyToken ya agregó req.user
    const userId = req.user.id;

    // Obtener información actualizada del usuario
    const [usuarios] = await pool.execute(
      `SELECT u.id, u.nombre_usuario, u.nombre_completo, u.correo, 
              u.activo, u.id_rol, r.nombre as rol_nombre
       FROM usuarios u
       INNER JOIN roles r ON u.id_rol = r.id
       WHERE u.id = ?`,
      [userId]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const usuario = usuarios[0];

    res.json({
      success: true,
      data: {
        user: {
          id: usuario.id,
          nombre_usuario: usuario.nombre_usuario,
          nombre_completo: usuario.nombre_completo,
          correo: usuario.correo,
          rol: usuario.rol_nombre,
          id_rol: usuario.id_rol
        }
      }
    });

  } catch (error) {
    console.error('Error en verifyAuth:', error);
    res.status(500).json({
      success: false,
      message: 'Error al verificar autenticación',
      error: error.message
    });
  }
};

// Logout (principalmente del lado del cliente, pero podemos registrar actividad)
export const logout = async (req, res) => {
  try {
    // En una implementación más completa, podrías invalidar el token aquí
    // Por ahora, solo confirmamos el logout
    res.json({
      success: true,
      message: 'Sesión cerrada exitosamente'
    });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cerrar sesión',
      error: error.message
    });
  }
};

