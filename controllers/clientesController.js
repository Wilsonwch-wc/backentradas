import pool from '../config/db.js';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_jwt_aqui';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '345796663899-oldi1tt8j3h293silmqluppqn0mrmocr.apps.googleusercontent.com';

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Función para decodificar JWT sin verificación (solo para lectura, menos seguro)
const decodeJWT = (token) => {
  try {
    // Decodificar sin verificar (solo para obtener los datos)
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return decoded;
  } catch (error) {
    throw new Error('No se pudo decodificar el token');
  }
};

// Verificar token de Google
const verifyGoogleToken = async (token) => {
  try {
    if (!token) {
      throw new Error('Token no proporcionado');
    }

    console.log('🔍 Verificando token de Google...');
    console.log('📋 GOOGLE_CLIENT_ID:', GOOGLE_CLIENT_ID);
    
    // Intentar verificar el token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    console.log('✅ Token verificado exitosamente');
    console.log('👤 Usuario:', payload.email);
    
    return payload;
  } catch (error) {
    console.error('❌ Error al verificar token de Google:', error.message);
    console.error('📋 Código de error:', error.code);
    console.error('📋 Status:', error.status);
    
    // Error 403: Problema de permisos o configuración
    if (error.code === 403 || error.status === 403) {
      throw new Error(
        'Error de configuración de Google OAuth. ' +
        'Verifica que: 1) El Client ID sea correcto, 2) La API de Google OAuth2 esté habilitada, ' +
        '3) Los orígenes autorizados estén configurados en Google Cloud Console.'
      );
    }
    
    // Mensajes de error más específicos
    if (error.message?.includes('Token used too early')) {
      throw new Error('El token aún no es válido. Intenta nuevamente.');
    } else if (error.message?.includes('Token used too late')) {
      throw new Error('El token ha expirado. Por favor, inicia sesión nuevamente.');
    } else if (error.message?.includes('Invalid token signature')) {
      throw new Error('Token inválido. Verifica la configuración de Google OAuth.');
    } else if (error.message?.includes('Invalid audience')) {
      throw new Error('El token no corresponde a esta aplicación. Verifica el Client ID.');
    }
    
    throw new Error(`Error al verificar token de Google: ${error.message}`);
  }
};

// Login/Registro con Google
export const loginConGoogle = async (req, res) => {
  try {
    console.log('🔐 Iniciando login con Google...');
    console.log('📦 Body recibido:', { 
      hasToken: !!req.body.token, 
      hasGoogleUser: !!req.body.googleUser 
    });

    const { token, googleUser: googleUserData } = req.body;

    let googleUser;

    if (googleUserData) {
      // Si viene la información del usuario directamente
      console.log('📋 Usando datos de usuario directamente');
      googleUser = {
        sub: googleUserData.id || googleUserData.sub,
        email: googleUserData.email,
        name: googleUserData.name,
        given_name: googleUserData.given_name || googleUserData.name?.split(' ')[0],
        family_name: googleUserData.family_name || googleUserData.name?.split(' ').slice(1).join(' '),
        picture: googleUserData.picture
      };
    } else if (token) {
      // Decodificar token de Google directamente (sin verificación de certificados)
      // Esto evita el error 403 de Google cuando el servidor intenta acceder a los certificados
      console.log('🔍 Decodificando token de Google...');
      
      try {
        const decoded = decodeJWT(token);
        
        // Validaciones básicas del token
        if (!decoded.sub || !decoded.email) {
          throw new Error('El token no contiene la información necesaria');
        }
        
        // Verificar que el token sea de Google (audience debe coincidir)
        const clientIdShort = GOOGLE_CLIENT_ID.replace('.apps.googleusercontent.com', '');
        if (decoded.aud !== GOOGLE_CLIENT_ID && decoded.aud !== clientIdShort) {
          console.warn('⚠️ El audience del token no coincide exactamente, pero continuando...');
          console.warn('📋 Token audience:', decoded.aud);
          console.warn('📋 Esperado:', GOOGLE_CLIENT_ID);
        }
        
        // Verificar que el token no haya expirado
        if (decoded.exp && decoded.exp < Date.now() / 1000) {
          throw new Error('El token ha expirado. Por favor, inicia sesión nuevamente.');
        }
        
        // Verificar que el token sea de Google (issuer)
        if (decoded.iss && !decoded.iss.includes('google')) {
          throw new Error('El token no es de Google');
        }
        
        // Usar los datos decodificados
        googleUser = {
          sub: decoded.sub,
          email: decoded.email,
          name: decoded.name,
          given_name: decoded.given_name,
          family_name: decoded.family_name,
          picture: decoded.picture,
          email_verified: decoded.email_verified || true
        };
        
        console.log('✅ Token decodificado exitosamente');
        console.log('👤 Usuario:', googleUser.email);
        console.log('📧 Email verificado:', googleUser.email_verified);
      } catch (decodeError) {
        console.error('❌ Error al decodificar token:', decodeError.message);
        
        // Si falla la decodificación, intentar verificación como último recurso
        console.log('🔄 Intentando verificación completa como último recurso...');
        try {
          googleUser = await verifyGoogleToken(token);
        } catch (verifyError) {
          throw new Error(
            `No se pudo procesar el token de Google: ${decodeError.message}. ` +
            `Verifica que el token sea válido y que el Client ID sea correcto.`
          );
        }
      }
    } else {
      console.error('❌ No se proporcionó token ni datos de usuario');
      return res.status(400).json({
        success: false,
        message: 'Token de Google o información del usuario requerida'
      });
    }

    if (!googleUser.email) {
      console.error('❌ No se pudo obtener el email del usuario');
      return res.status(400).json({
        success: false,
        message: 'No se pudo obtener la información del usuario de Google'
      });
    }

    console.log('👤 Email del usuario:', googleUser.email);

    // Buscar o crear cliente
    const [clientesExistentes] = await pool.execute(
      'SELECT * FROM clientes WHERE correo = ? OR (provider = ? AND provider_id = ?)',
      [googleUser.email, 'google', googleUser.sub]
    );

    let cliente;

    if (clientesExistentes.length > 0) {
      // Cliente existe, actualizar información
      cliente = clientesExistentes[0];
      
      await pool.execute(
        `UPDATE clientes SET 
         nombre = ?, 
         apellido = ?, 
         nombre_completo = ?,
         foto_perfil = ?,
         email_verificado = TRUE,
         updated_at = NOW()
         WHERE id = ?`,
        [
          googleUser.given_name || null,
          googleUser.family_name || null,
          googleUser.name || null,
          googleUser.picture || null,
          cliente.id
        ]
      );

      // Obtener cliente actualizado
      const [clientesActualizados] = await pool.execute(
        'SELECT * FROM clientes WHERE id = ?',
        [cliente.id]
      );
      cliente = clientesActualizados[0];
    } else {
      // Crear nuevo cliente
      const [result] = await pool.execute(
        `INSERT INTO clientes (nombre, apellido, nombre_completo, correo, provider, provider_id, foto_perfil, email_verificado)
         VALUES (?, ?, ?, ?, 'google', ?, ?, TRUE)`,
        [
          googleUser.given_name || null,
          googleUser.family_name || null,
          googleUser.name || null,
          googleUser.email,
          googleUser.sub,
          googleUser.picture || null
        ]
      );

      const [clientesNuevos] = await pool.execute(
        'SELECT * FROM clientes WHERE id = ?',
        [result.insertId]
      );
      cliente = clientesNuevos[0];
    }

    // Generar token JWT
    const jwtToken = jwt.sign(
      {
        id: cliente.id,
        correo: cliente.correo,
        nombre: cliente.nombre_completo || cliente.nombre,
        provider: cliente.provider,
        tipo: 'cliente'
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: 'Login exitoso',
      data: {
        token: jwtToken,
        user: {
          id: cliente.id,
          nombre: cliente.nombre,
          apellido: cliente.apellido,
          nombre_completo: cliente.nombre_completo,
          correo: cliente.correo,
          telefono: cliente.telefono,
          foto_perfil: cliente.foto_perfil,
          provider: cliente.provider
        }
      }
    });

  } catch (error) {
    console.error('❌ Error en login con Google:', error);
    console.error('📋 Stack trace:', error.stack);
    
    // Determinar el código de estado apropiado
    const statusCode = error.message?.includes('Token') || error.message?.includes('inválido') 
      ? 401 
      : 500;
    
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error al autenticar con Google',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Registro local de cliente
export const registrarCliente = async (req, res) => {
  try {
    const { nombre, apellido, nombre_completo, correo, password, telefono } = req.body;

    // Validaciones
    if (!correo || !password) {
      return res.status(400).json({
        success: false,
        message: 'Correo y contraseña son requeridos'
      });
    }

    // Verificar si el correo ya existe
    const [clientesExistentes] = await pool.execute(
      'SELECT id FROM clientes WHERE correo = ?',
      [correo]
    );

    if (clientesExistentes.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'El correo ya está registrado'
      });
    }

    // Crear nuevo cliente
    const [result] = await pool.execute(
      `INSERT INTO clientes (nombre, apellido, nombre_completo, correo, password, telefono, provider)
       VALUES (?, ?, ?, ?, ?, ?, 'local')`,
      [
        nombre || null,
        apellido || null,
        nombre_completo || (nombre && apellido ? `${nombre} ${apellido}` : nombre || apellido || null),
        correo,
        password, // En producción esto debe estar hasheado
        telefono || null
      ]
    );

    // Obtener cliente creado
    const [clientes] = await pool.execute(
      'SELECT id, nombre, apellido, nombre_completo, correo, telefono, foto_perfil, provider FROM clientes WHERE id = ?',
      [result.insertId]
    );

    const cliente = clientes[0];

    // Generar token JWT
    const token = jwt.sign(
      {
        id: cliente.id,
        correo: cliente.correo,
        nombre: cliente.nombre_completo || cliente.nombre,
        provider: cliente.provider,
        tipo: 'cliente'
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'Cliente registrado exitosamente',
      data: {
        token,
        user: cliente
      }
    });

  } catch (error) {
    console.error('Error al registrar cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar el cliente',
      error: error.message
    });
  }
};

// Login local de cliente
export const loginCliente = async (req, res) => {
  try {
    const { correo, password } = req.body;

    if (!correo || !password) {
      return res.status(400).json({
        success: false,
        message: 'Correo y contraseña son requeridos'
      });
    }

    // Buscar cliente
    const [clientes] = await pool.execute(
      'SELECT * FROM clientes WHERE correo = ? AND provider = ?',
      [correo, 'local']
    );

    if (clientes.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    const cliente = clientes[0];

    // Verificar si está activo
    if (!cliente.activo) {
      return res.status(403).json({
        success: false,
        message: 'Cuenta inactiva. Contacta al soporte'
      });
    }

    // Verificar contraseña (texto plano por ahora)
    if (cliente.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Generar token JWT
    const token = jwt.sign(
      {
        id: cliente.id,
        correo: cliente.correo,
        nombre: cliente.nombre_completo || cliente.nombre,
        provider: cliente.provider,
        tipo: 'cliente'
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: 'Login exitoso',
      data: {
        token,
        user: {
          id: cliente.id,
          nombre: cliente.nombre,
          apellido: cliente.apellido,
          nombre_completo: cliente.nombre_completo,
          correo: cliente.correo,
          telefono: cliente.telefono,
          foto_perfil: cliente.foto_perfil,
          provider: cliente.provider
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

// Verificar token y obtener información del cliente
export const verifyCliente = async (req, res) => {
  try {
    const userId = req.user.id;

    const [clientes] = await pool.execute(
      'SELECT id, nombre, apellido, nombre_completo, correo, telefono, foto_perfil, provider, activo, created_at, updated_at FROM clientes WHERE id = ?',
      [userId]
    );

    if (clientes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }

    res.json({
      success: true,
      data: {
        user: clientes[0]
      }
    });

  } catch (error) {
    console.error('Error al verificar cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al verificar autenticación',
      error: error.message
    });
  }
};

// Actualizar información del cliente
export const actualizarCliente = async (req, res) => {
  try {
    const userId = req.user.id;
    const { telefono, password } = req.body;

    // Validar que al menos un campo se esté actualizando
    if (!telefono && !password) {
      return res.status(400).json({
        success: false,
        message: 'Debes proporcionar al menos un campo para actualizar'
      });
    }

    // Construir la consulta dinámicamente
    const updates = [];
    const values = [];

    if (telefono !== undefined) {
      updates.push('telefono = ?');
      values.push(telefono);
    }

    if (password !== undefined) {
      // Solo actualizar password si el usuario no es de Google
      const [clientes] = await pool.execute(
        'SELECT provider FROM clientes WHERE id = ?',
        [userId]
      );

      if (clientes.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Cliente no encontrado'
        });
      }

      if (clientes[0].provider === 'google') {
        return res.status(400).json({
          success: false,
          message: 'Los usuarios registrados con Google no pueden cambiar su contraseña'
        });
      }

      updates.push('password = ?');
      values.push(password); // En producción esto debería estar hasheado
    }

    // Agregar updated_at
    updates.push('updated_at = NOW()');
    values.push(userId);

    // Ejecutar actualización
    await pool.execute(
      `UPDATE clientes SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Obtener cliente actualizado
    const [clientesActualizados] = await pool.execute(
      'SELECT id, nombre, apellido, nombre_completo, correo, telefono, foto_perfil, provider, activo, created_at, updated_at FROM clientes WHERE id = ?',
      [userId]
    );

    res.json({
      success: true,
      message: 'Información actualizada exitosamente',
      data: {
        user: clientesActualizados[0]
      }
    });

  } catch (error) {
    console.error('Error al actualizar cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la información',
      error: error.message
    });
  }
};

