import pool from '../config/db.js';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_jwt_aqui';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '314893460207-vp0a4f660vs54to3f3hp7clinf5hbsv3.apps.googleusercontent.com';

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Decodificar token JWT de Google
const decodeJWT = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) throw new Error('Token JWT con formato inválido');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    return payload;
  } catch (err) {
    throw new Error('Error al decodificar token: ' + err.message);
  }
};

/**
 * 1. Login / Registro automático con Google para AnunciosYA
 * Utiliza la tabla `usuarios` del sistema existente
 */
export const authGoogleAnuncios = async (req, res) => {
  try {
    const { token, googleUser: directUser, telefono, ubicacion, direccion } = req.body;

    let googleData = null;

    if (directUser && directUser.email) {
      googleData = {
        sub: directUser.id || directUser.sub,
        email: directUser.email,
        name: directUser.name,
        given_name: directUser.given_name || directUser.name?.split(' ')[0],
        family_name: directUser.family_name || directUser.name?.split(' ').slice(1).join(' ') || '',
        picture: directUser.picture || directUser.avatar_url
      };
    } else if (token) {
      try {
        const decoded = decodeJWT(token);
        if (!decoded.email) throw new Error('El token de Google no contiene correo');
        googleData = {
          sub: decoded.sub,
          email: decoded.email,
          name: decoded.name || decoded.email.split('@')[0],
          given_name: decoded.given_name || (decoded.name ? decoded.name.split(' ')[0] : 'Usuario'),
          family_name: decoded.family_name || '',
          picture: decoded.picture || null
        };
      } catch (decErr) {
        // Como alternativa intenta verificar con client
        try {
          const ticket = await client.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID
          });
          const payload = ticket.getPayload();
          googleData = {
            sub: payload.sub,
            email: payload.email,
            name: payload.name,
            given_name: payload.given_name || payload.name?.split(' ')[0],
            family_name: payload.family_name || '',
            picture: payload.picture
          };
        } catch (verErr) {
          return res.status(400).json({
            success: false,
            message: 'Token de Google inválido: ' + decErr.message
          });
        }
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó token o datos de Google'
      });
    }

    const email = googleData.email.toLowerCase().trim();

    // Obtener ID del rol 'anunciante'
    const [roles] = await pool.query("SELECT id FROM roles WHERE nombre = 'anunciante' LIMIT 1");
    const idRolAnunciante = roles.length > 0 ? roles[0].id : 6;

    // Buscar si el usuario ya existe en `usuarios`
    const [usuarios] = await pool.query(
      `SELECT u.*, r.nombre as rol_nombre
       FROM usuarios u
       LEFT JOIN roles r ON u.id_rol = r.id
       WHERE u.google_id = ? OR LOWER(TRIM(u.correo)) = ?`,
      [googleData.sub, email]
    );

    let usuario = null;

    if (usuarios.length > 0) {
      usuario = usuarios[0];

      // Actualizar datos de Google
      await pool.query(
        `UPDATE usuarios SET
          google_id = COALESCE(google_id, ?),
          avatar_url = COALESCE(?, avatar_url),
          apellidos = COALESCE(apellidos, ?),
          auth_provider = 'google',
          activo = 1
        WHERE id = ?`,
        [googleData.sub, googleData.picture, googleData.family_name, usuario.id]
      );

      // Si nos enviaron teléfono o ubicación y el usuario no los tenía, actualizarlos
      if ((telefono && !usuario.telefono) || (ubicacion && !usuario.ubicacion) || (direccion && !usuario.direccion)) {
        await pool.query(
          `UPDATE usuarios SET
            telefono = COALESCE(?, telefono),
            ubicacion = COALESCE(?, ubicacion),
            direccion = COALESCE(?, direccion)
          WHERE id = ?`,
          [telefono || null, ubicacion || null, direccion || null, usuario.id]
        );
      }

      // Re-obtener datos actualizados
      const [actualizados] = await pool.query(
        `SELECT u.*, r.nombre as rol_nombre
         FROM usuarios u
         LEFT JOIN roles r ON u.id_rol = r.id
         WHERE u.id = ?`,
        [usuario.id]
      );
      usuario = actualizados[0];

    } else {
      // Crear nuevo usuario en `usuarios`
      const usernameBase = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
      const username = `${usernameBase}_${Math.floor(1000 + Math.random() * 9000)}`;

      const [insertResult] = await pool.query(
        `INSERT INTO usuarios (
          nombre_usuario, nombre_completo, apellidos, correo,
          telefono, ubicacion, direccion, google_id, avatar_url,
          auth_provider, activo, id_rol, password
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'google', 1, ?, NULL)`,
        [
          username,
          googleData.given_name || googleData.name,
          googleData.family_name || '',
          email,
          telefono || null,
          ubicacion || 'Cochabamba',
          direccion || null,
          googleData.sub,
          googleData.picture || null,
          idRolAnunciante
        ]
      );

      const [nuevos] = await pool.query(
        `SELECT u.*, r.nombre as rol_nombre
         FROM usuarios u
         LEFT JOIN roles r ON u.id_rol = r.id
         WHERE u.id = ?`,
        [insertResult.insertId]
      );
      usuario = nuevos[0];
    }

    // Generar token JWT
    const jwtToken = jwt.sign(
      {
        id: usuario.id,
        nombre: usuario.nombre_completo,
        correo: usuario.correo,
        rol: usuario.rol_nombre || 'anunciante',
        id_rol: usuario.id_rol
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({
      success: true,
      message: 'Inicio de sesión con Google exitoso',
      data: {
        token: jwtToken,
        user: {
          id: usuario.id,
          nombre: usuario.nombre_completo,
          apellidos: usuario.apellidos || '',
          correo: usuario.correo,
          email: usuario.correo,
          telefono: usuario.telefono || '',
          ubicacion: usuario.ubicacion || 'Cochabamba',
          direccion: usuario.direccion || '',
          avatar_url: usuario.avatar_url || googleData.picture || '',
          rol: usuario.rol_nombre || 'anunciante',
          auth_provider: 'google'
        }
      }
    });

  } catch (error) {
    console.error('❌ Error en authGoogleAnuncios:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al autenticar con Google en el servidor',
      error: error.message
    });
  }
};

/**
 * 2. Registro tradicional para AnunciosYA
 */
export const registroAnuncios = async (req, res) => {
  try {
    const { nombre, apellidos, telefono, ubicacion, direccion, email, password } = req.body;

    if (!nombre || !telefono || !ubicacion || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, teléfono, ubicación, correo y contraseña son obligatorios'
      });
    }

    const emailNorm = email.toLowerCase().trim();

    // Verificar si el correo ya existe
    const [existentes] = await pool.query(
      'SELECT id FROM usuarios WHERE LOWER(TRIM(correo)) = ?',
      [emailNorm]
    );

    if (existentes.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una cuenta con este correo electrónico. Por favor inicia sesión.'
      });
    }

    // Obtener ID del rol 'anunciante'
    const [roles] = await pool.query("SELECT id FROM roles WHERE nombre = 'anunciante' LIMIT 1");
    const idRolAnunciante = roles.length > 0 ? roles[0].id : 6;

    const usernameBase = emailNorm.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
    const username = `${usernameBase}_${Math.floor(1000 + Math.random() * 9000)}`;

    const [result] = await pool.query(
      `INSERT INTO usuarios (
        nombre_usuario, nombre_completo, apellidos, correo,
        telefono, ubicacion, direccion, auth_provider, activo, id_rol, password
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'local', 1, ?, ?)`,
      [
        username,
        nombre.trim(),
        apellidos ? apellidos.trim() : '',
        emailNorm,
        telefono.trim(),
        ubicacion.trim(),
        direccion ? direccion.trim() : null,
        idRolAnunciante,
        password // Si en PlusTicket se guarda texto plano o hash
      ]
    );

    const [nuevos] = await pool.query(
      `SELECT u.*, r.nombre as rol_nombre
       FROM usuarios u
       LEFT JOIN roles r ON u.id_rol = r.id
       WHERE u.id = ?`,
      [result.insertId]
    );
    const usuario = nuevos[0];

    const jwtToken = jwt.sign(
      {
        id: usuario.id,
        nombre: usuario.nombre_completo,
        correo: usuario.correo,
        rol: usuario.rol_nombre || 'anunciante',
        id_rol: usuario.id_rol
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({
      success: true,
      message: 'Cuenta creada exitosamente',
      data: {
        token: jwtToken,
        user: {
          id: usuario.id,
          nombre: usuario.nombre_completo,
          apellidos: usuario.apellidos || '',
          correo: usuario.correo,
          email: usuario.correo,
          telefono: usuario.telefono || '',
          ubicacion: usuario.ubicacion || 'Cochabamba',
          direccion: usuario.direccion || '',
          avatar_url: usuario.avatar_url || '',
          rol: usuario.rol_nombre || 'anunciante',
          auth_provider: 'local'
        }
      }
    });

  } catch (error) {
    console.error('❌ Error en registroAnuncios:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al registrar el usuario',
      error: error.message
    });
  }
};

/**
 * 3. Iniciar sesión tradicional para AnunciosYA
 */
export const loginAnuncios = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Correo/teléfono y contraseña son obligatorios'
      });
    }

    const busqueda = email.trim().toLowerCase();

    const [usuarios] = await pool.query(
      `SELECT u.*, r.nombre as rol_nombre
       FROM usuarios u
       LEFT JOIN roles r ON u.id_rol = r.id
       WHERE LOWER(TRIM(u.correo)) = ? OR u.telefono = ? OR u.nombre_usuario = ?`,
      [busqueda, busqueda, busqueda]
    );

    if (usuarios.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas. Revisa tu correo o contraseña.'
      });
    }

    const usuario = usuarios[0];

    if (!usuario.activo) {
      return res.status(403).json({
        success: false,
        message: 'Tu cuenta se encuentra inactiva. Contacta al soporte.'
      });
    }

    if (usuario.password && usuario.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Contraseña incorrecta'
      });
    }

    const jwtToken = jwt.sign(
      {
        id: usuario.id,
        nombre: usuario.nombre_completo,
        correo: usuario.correo,
        rol: usuario.rol_nombre || 'anunciante',
        id_rol: usuario.id_rol
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      data: {
        token: jwtToken,
        user: {
          id: usuario.id,
          nombre: usuario.nombre_completo,
          apellidos: usuario.apellidos || '',
          correo: usuario.correo,
          email: usuario.correo,
          telefono: usuario.telefono || '',
          ubicacion: usuario.ubicacion || 'Cochabamba',
          direccion: usuario.direccion || '',
          avatar_url: usuario.avatar_url || '',
          rol: usuario.rol_nombre || 'anunciante',
          auth_provider: usuario.auth_provider || 'local'
        }
      }
    });

  } catch (error) {
    console.error('❌ Error en loginAnuncios:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al iniciar sesión',
      error: error.message
    });
  }
};

/**
 * 4. Obtener perfil actual del usuario autenticado
 */
export const obtenerPerfilActual = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }

    const [usuarios] = await pool.query(
      `SELECT u.id, u.nombre_usuario, u.nombre_completo, u.apellidos, u.correo,
              u.telefono, u.ubicacion, u.direccion, u.avatar_url, u.auth_provider,
              u.activo, u.id_rol, r.nombre as rol_nombre
       FROM usuarios u
       LEFT JOIN roles r ON u.id_rol = r.id
       WHERE u.id = ?`,
      [userId]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    const usuario = usuarios[0];

    return res.json({
      success: true,
      data: {
        id: usuario.id,
        nombre: usuario.nombre_completo,
        nombre_completo: usuario.nombre_completo,
        apellidos: usuario.apellidos || '',
        correo: usuario.correo,
        email: usuario.correo,
        telefono: usuario.telefono || '',
        ubicacion: usuario.ubicacion || 'Cochabamba',
        direccion: usuario.direccion || '',
        avatar_url: usuario.avatar_url || '',
        rol: usuario.rol_nombre || 'anunciante',
        auth_provider: usuario.auth_provider || 'local'
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 5. Actualizar perfil del usuario (nombre, apellidos, teléfono, ubicación, dirección)
 */
export const actualizarPerfil = async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado o ID no proporcionado'
      });
    }

    const { nombre, apellidos, telefono, ubicacion, direccion, avatar_url } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({
        success: false,
        message: 'El nombre es obligatorio'
      });
    }

    await pool.query(
      `UPDATE usuarios SET
        nombre_completo = ?,
        apellidos = ?,
        telefono = ?,
        ubicacion = ?,
        direccion = ?,
        avatar_url = COALESCE(?, avatar_url),
        updated_at = NOW()
      WHERE id = ?`,
      [
        nombre.trim(),
        apellidos ? apellidos.trim() : '',
        telefono ? telefono.trim() : null,
        ubicacion ? ubicacion.trim() : 'Cochabamba',
        direccion ? direccion.trim() : null,
        avatar_url || null,
        userId
      ]
    );

    const [usuarios] = await pool.query(
      `SELECT u.id, u.nombre_usuario, u.nombre_completo, u.apellidos, u.correo,
              u.telefono, u.ubicacion, u.direccion, u.avatar_url, u.auth_provider,
              r.nombre as rol_nombre
       FROM usuarios u
       LEFT JOIN roles r ON u.id_rol = r.id
       WHERE u.id = ?`,
      [userId]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado en la base de datos'
      });
    }

    const usuario = usuarios[0];

    return res.json({
      success: true,
      message: '¡Perfil actualizado exitosamente en la base de datos!',
      data: {
        user: {
          id: usuario.id,
          nombre: usuario.nombre_completo,
          nombre_completo: usuario.nombre_completo,
          apellidos: usuario.apellidos || '',
          correo: usuario.correo,
          email: usuario.correo,
          telefono: usuario.telefono || '',
          ubicacion: usuario.ubicacion || 'Cochabamba',
          direccion: usuario.direccion || '',
          avatar_url: usuario.avatar_url || '',
          rol: usuario.rol_nombre || 'anunciante',
          auth_provider: usuario.auth_provider || 'local'
        }
      }
    });

  } catch (error) {
    console.error('❌ Error al actualizar perfil:', error);
    return res.status(500).json({
      success: false,
      message: 'Error en el servidor al actualizar el perfil',
      error: error.message
    });
  }
};

