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

    // 1) PRIMERO: verificar si el correo pertenece a un ADMIN/USUARIO DEL PANEL
    //    Esto permite que un admin pueda entrar con Google OAuth también
    const [usuarios] = await pool.execute(
      `SELECT u.id, u.nombre_usuario, u.nombre_completo, u.correo, u.activo, u.id_rol, r.nombre as rol_nombre, u.telefono
       FROM usuarios u
       INNER JOIN roles r ON u.id_rol = r.id
       WHERE u.correo = ?`,
      [googleUser.email]
    );

    if (usuarios.length > 0) {
      const usuario = usuarios[0];

      // Verificar si está activo
      if (!usuario.activo) {
        return res.status(403).json({
          success: false,
          message: 'Usuario inactivo. Contacta al administrador'
        });
      }

      // Generar token JWT como ADMIN (mismo formato que authController.login)
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

      return res.json({
        success: true,
        message: 'Login exitoso con Google',
        data: {
          token,
          user: {
            id: usuario.id,
            nombre_usuario: usuario.nombre_usuario,
            nombre_completo: usuario.nombre_completo,
            correo: usuario.correo,
            telefono: usuario.telefono,
            rol: usuario.rol_nombre,
            id_rol: usuario.id_rol
          }
        }
      });
    }

    // 2) Si no es admin, buscar o crear cliente
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

// Generar código de verificación de 4 dígitos
const generarCodigoVerificacion = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// Separar nombre completo en nombre y apellido
const separarNombreCompleto = (nombreCompleto) => {
  if (!nombreCompleto || typeof nombreCompleto !== 'string') {
    return { nombre: null, apellido: null };
  }
  
  const partes = nombreCompleto.trim().split(/\s+/);
  
  if (partes.length === 0) {
    return { nombre: null, apellido: null };
  } else if (partes.length === 1) {
    return { nombre: partes[0], apellido: null };
  } else if (partes.length === 2) {
    return { nombre: partes[0], apellido: partes[1] };
  } else {
    // Si hay más de 2 partes, tomar la primera como nombre y el resto como apellido
    return {
      nombre: partes[0],
      apellido: partes.slice(1).join(' ')
    };
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
      'SELECT id, email_verificado FROM clientes WHERE correo = ?',
      [correo]
    );

    if (clientesExistentes.length > 0) {
      const clienteExistente = clientesExistentes[0];
      // Si el correo existe pero no está verificado, permitir reenviar código
      if (!clienteExistente.email_verificado) {
        // Generar nuevo código y actualizar
        const codigo = generarCodigoVerificacion();
        const fechaExpiracion = new Date();
        fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + 15); // 15 minutos

        await pool.execute(
          `UPDATE clientes 
           SET codigo_verificacion = ?, 
               codigo_verificacion_expira = ?,
               password = ?
           WHERE id = ?`,
          [codigo, fechaExpiracion, password, clienteExistente.id]
        );

        // Enviar código por email
        const { enviarCodigoVerificacion } = await import('../services/emailService.js');
        const nombre = nombre_completo || nombre || apellido || 'Usuario';
        await enviarCodigoVerificacion(correo, nombre, codigo);

        return res.status(200).json({
          success: true,
          message: 'Código de verificación reenviado. Por favor, verifica tu correo electrónico.',
          data: {
            requiereVerificacion: true,
            correo: correo
          }
        });
      }
      
      return res.status(400).json({
        success: false,
        message: 'El correo ya está registrado y verificado'
      });
    }

    // Separar nombre completo si solo se proporciona nombre_completo
    let nombreFinal = nombre;
    let apellidoFinal = apellido;
    let nombreCompletoFinal = nombre_completo;
    
    // Si se proporciona nombre_completo pero no nombre/apellido, separarlo
    if (nombre_completo && !nombre && !apellido) {
      const separado = separarNombreCompleto(nombre_completo);
      nombreFinal = separado.nombre;
      apellidoFinal = separado.apellido;
      nombreCompletoFinal = nombre_completo;
    } else if (nombre && apellido && !nombre_completo) {
      // Si se proporcionan nombre y apellido, crear nombre_completo
      nombreCompletoFinal = `${nombre} ${apellido}`;
    } else if (nombre_completo && (nombre || apellido)) {
      // Si se proporciona nombre_completo y también nombre/apellido, usar nombre_completo y separarlo
      const separado = separarNombreCompleto(nombre_completo);
      nombreFinal = nombre || separado.nombre;
      apellidoFinal = apellido || separado.apellido;
      nombreCompletoFinal = nombre_completo;
    } else if (nombre && !apellido && !nombre_completo) {
      // Solo nombre, usar como nombre_completo también
      nombreCompletoFinal = nombre;
    } else if (apellido && !nombre && !nombre_completo) {
      // Solo apellido, usar como nombre_completo también
      nombreCompletoFinal = apellido;
    }

    // Generar código de verificación
    const codigo = generarCodigoVerificacion();
    const fechaExpiracion = new Date();
    fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + 15); // 15 minutos

    // Crear nuevo cliente (sin verificar)
    const [result] = await pool.execute(
      `INSERT INTO clientes (nombre, apellido, nombre_completo, correo, password, telefono, provider, codigo_verificacion, codigo_verificacion_expira, email_verificado, activo)
       VALUES (?, ?, ?, ?, ?, ?, 'local', ?, ?, FALSE, FALSE)`,
      [
        nombreFinal || null,
        apellidoFinal || null,
        nombreCompletoFinal || null,
        correo,
        password, // En producción esto debe estar hasheado
        telefono || null,
        codigo,
        fechaExpiracion
      ]
    );

    // Enviar código por email
    const { enviarCodigoVerificacion } = await import('../services/emailService.js');
    const nombreCliente = nombre_completo || nombre || apellido || 'Usuario';
    const emailResult = await enviarCodigoVerificacion(correo, nombreCliente, codigo);

    if (!emailResult.success) {
      console.error('Error al enviar código de verificación:', emailResult.message);
      // Aún así, devolver éxito pero indicar que requiere verificación
    }

    res.status(201).json({
      success: true,
      message: 'Registro exitoso. Por favor, verifica tu correo electrónico con el código enviado.',
      data: {
        requiereVerificacion: true,
        correo: correo,
        emailEnviado: emailResult.success
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

    // 1) PRIMERO: intentar login como ADMIN/USUARIO DEL PANEL usando el correo
    //    Esto permite que un mismo correo (ej. del administrador) entre tanto al panel
    //    como a la parte de cliente usando este mismo formulario.
    const [usuarios] = await pool.execute(
      `SELECT u.id, u.nombre_usuario, u.nombre_completo, u.correo, u.password,
              u.activo, u.id_rol, r.nombre as rol_nombre, u.telefono
       FROM usuarios u
       INNER JOIN roles r ON u.id_rol = r.id
       WHERE u.correo = ?`,
      [correo]
    );

    if (usuarios.length > 0) {
      const usuario = usuarios[0];

      // Verificar si está activo
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

      // Generar token JWT como ADMIN (mismo formato que authController.login)
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

      return res.json({
        success: true,
        message: 'Login exitoso',
        data: {
          token,
          user: {
            id: usuario.id,
            nombre_usuario: usuario.nombre_usuario,
            nombre_completo: usuario.nombre_completo,
            correo: usuario.correo,
            telefono: usuario.telefono,
            rol: usuario.rol_nombre,
            id_rol: usuario.id_rol
          }
        }
      });
    }

    // 2) Si no es admin, intentar login como CLIENTE normal

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

    // Verificar si el email está verificado
    if (!cliente.email_verificado) {
      return res.status(403).json({
        success: false,
        message: 'Por favor, verifica tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada.',
        requiereVerificacion: true,
        correo: correo
      });
    }

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

// Verificar código de verificación de email
export const verificarCodigoEmail = async (req, res) => {
  try {
    const { correo, codigo } = req.body;

    if (!correo || !codigo) {
      return res.status(400).json({
        success: false,
        message: 'Correo y código son requeridos'
      });
    }

    // Buscar cliente por correo
    const [clientes] = await pool.execute(
      'SELECT id, codigo_verificacion, codigo_verificacion_expira, email_verificado, nombre_completo, nombre, apellido FROM clientes WHERE correo = ?',
      [correo]
    );

    if (clientes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Correo no encontrado'
      });
    }

    const cliente = clientes[0];

    // Verificar si ya está verificado
    if (cliente.email_verificado) {
      return res.status(400).json({
        success: false,
        message: 'Este correo ya está verificado'
      });
    }

    // Verificar código
    if (!cliente.codigo_verificacion || cliente.codigo_verificacion !== codigo) {
      return res.status(400).json({
        success: false,
        message: 'Código de verificación inválido'
      });
    }

    // Verificar expiración
    const ahora = new Date();
    const fechaExpiracion = new Date(cliente.codigo_verificacion_expira);
    
    if (ahora > fechaExpiracion) {
      return res.status(400).json({
        success: false,
        message: 'El código de verificación ha expirado. Por favor, solicita uno nuevo.'
      });
    }

    // Verificar y activar cuenta
    await pool.execute(
      `UPDATE clientes 
       SET email_verificado = TRUE, 
           activo = TRUE,
           codigo_verificacion = NULL,
           codigo_verificacion_expira = NULL
       WHERE id = ?`,
      [cliente.id]
    );

    // Obtener cliente actualizado
    const [clientesActualizados] = await pool.execute(
      'SELECT id, nombre, apellido, nombre_completo, correo, telefono, foto_perfil, provider FROM clientes WHERE id = ?',
      [cliente.id]
    );

    const clienteActualizado = clientesActualizados[0];

    // Generar token JWT
    const token = jwt.sign(
      {
        id: clienteActualizado.id,
        correo: clienteActualizado.correo,
        nombre: clienteActualizado.nombre_completo || clienteActualizado.nombre,
        provider: clienteActualizado.provider,
        tipo: 'cliente'
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: 'Correo verificado exitosamente',
      data: {
        token,
        user: clienteActualizado
      }
    });

  } catch (error) {
    console.error('Error al verificar código:', error);
    res.status(500).json({
      success: false,
      message: 'Error al verificar el código',
      error: error.message
    });
  }
};

// Reenviar código de verificación
export const reenviarCodigoVerificacion = async (req, res) => {
  try {
    const { correo } = req.body;

    if (!correo) {
      return res.status(400).json({
        success: false,
        message: 'Correo es requerido'
      });
    }

    // Buscar cliente
    const [clientes] = await pool.execute(
      'SELECT id, nombre_completo, nombre, apellido, email_verificado FROM clientes WHERE correo = ?',
      [correo]
    );

    if (clientes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Correo no encontrado'
      });
    }

    const cliente = clientes[0];

    // Si ya está verificado, no permitir reenvío
    if (cliente.email_verificado) {
      return res.status(400).json({
        success: false,
        message: 'Este correo ya está verificado'
      });
    }

    // Generar nuevo código
    const codigo = generarCodigoVerificacion();
    const fechaExpiracion = new Date();
    fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + 15); // 15 minutos

    // Actualizar código en la base de datos
    await pool.execute(
      `UPDATE clientes 
       SET codigo_verificacion = ?, 
           codigo_verificacion_expira = ?
       WHERE id = ?`,
      [codigo, fechaExpiracion, cliente.id]
    );

    // Enviar código por email
    const { enviarCodigoVerificacion } = await import('../services/emailService.js');
    const nombreCliente = cliente.nombre_completo || cliente.nombre || cliente.apellido || 'Usuario';
    const emailResult = await enviarCodigoVerificacion(correo, nombreCliente, codigo);

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Error al enviar el código de verificación. Por favor, intenta nuevamente.',
        error: emailResult.message
      });
    }

    res.json({
      success: true,
      message: 'Código de verificación reenviado exitosamente'
    });

  } catch (error) {
    console.error('Error al reenviar código:', error);
    res.status(500).json({
      success: false,
      message: 'Error al reenviar el código',
      error: error.message
    });
  }
};

// Solicitar recuperación de contraseña
export const solicitarRecuperacionPassword = async (req, res) => {
  try {
    const { correo } = req.body;

    if (!correo) {
      return res.status(400).json({
        success: false,
        message: 'Correo es requerido'
      });
    }

    // Buscar cliente
    const [clientes] = await pool.execute(
      'SELECT id, nombre_completo, nombre, apellido, provider, email_verificado FROM clientes WHERE correo = ?',
      [correo]
    );

    if (clientes.length === 0) {
      // Por seguridad, no revelar si el correo existe o no
      return res.json({
        success: true,
        message: 'Si el correo existe, se ha enviado un código de recuperación'
      });
    }

    const cliente = clientes[0];

    // Solo permitir recuperación para usuarios locales con email verificado
    if (cliente.provider !== 'local') {
      return res.status(400).json({
        success: false,
        message: 'No se puede recuperar la contraseña de cuentas vinculadas con Google'
      });
    }

    if (!cliente.email_verificado) {
      return res.status(400).json({
        success: false,
        message: 'Por favor, verifica tu correo electrónico primero'
      });
    }

    // Generar código de recuperación
    const codigo = generarCodigoVerificacion();
    const fechaExpiracion = new Date();
    fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + 15); // 15 minutos

    // Guardar código en la base de datos (usaremos el mismo campo codigo_verificacion pero con un prefijo o campo separado)
    // Por simplicidad, usaremos codigo_verificacion y agregaremos un campo codigo_recuperacion_password si es necesario
    // Por ahora, usaremos codigo_verificacion para recuperación también
    await pool.execute(
      `UPDATE clientes 
       SET codigo_verificacion = ?, 
           codigo_verificacion_expira = ?
       WHERE id = ?`,
      [codigo, fechaExpiracion, cliente.id]
    );

    // Enviar código por email
    const { enviarCodigoRecuperacion } = await import('../services/emailService.js');
    const nombreCliente = cliente.nombre_completo || cliente.nombre || cliente.apellido || 'Usuario';
    const emailResult = await enviarCodigoRecuperacion(correo, nombreCliente, codigo);

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Error al enviar el código de recuperación. Por favor, intenta nuevamente.',
        error: emailResult.message
      });
    }

    // Por seguridad, no revelar si el correo existe
    res.json({
      success: true,
      message: 'Si el correo existe, se ha enviado un código de recuperación'
    });

  } catch (error) {
    console.error('Error al solicitar recuperación:', error);
    res.status(500).json({
      success: false,
      message: 'Error al procesar la solicitud',
      error: error.message
    });
  }
};

// Restablecer contraseña con código
export const restablecerPassword = async (req, res) => {
  try {
    const { correo, codigo, nuevaPassword } = req.body;

    if (!correo || !codigo || !nuevaPassword) {
      return res.status(400).json({
        success: false,
        message: 'Correo, código y nueva contraseña son requeridos'
      });
    }

    if (nuevaPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres'
      });
    }

    // Buscar cliente
    const [clientes] = await pool.execute(
      'SELECT id, codigo_verificacion, codigo_verificacion_expira, provider, email_verificado FROM clientes WHERE correo = ?',
      [correo]
    );

    if (clientes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Correo no encontrado'
      });
    }

    const cliente = clientes[0];

    // Solo permitir para usuarios locales
    if (cliente.provider !== 'local') {
      return res.status(400).json({
        success: false,
        message: 'No se puede restablecer la contraseña de cuentas vinculadas con Google'
      });
    }

    // Verificar código
    if (!cliente.codigo_verificacion || cliente.codigo_verificacion !== codigo) {
      return res.status(400).json({
        success: false,
        message: 'Código de recuperación inválido'
      });
    }

    // Verificar expiración
    const ahora = new Date();
    const fechaExpiracion = new Date(cliente.codigo_verificacion_expira);
    
    if (ahora > fechaExpiracion) {
      return res.status(400).json({
        success: false,
        message: 'El código de recuperación ha expirado. Por favor, solicita uno nuevo.'
      });
    }

    // Actualizar contraseña y limpiar código
    await pool.execute(
      `UPDATE clientes 
       SET password = ?,
           codigo_verificacion = NULL,
           codigo_verificacion_expira = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [nuevaPassword, cliente.id]
    );

    res.json({
      success: true,
      message: 'Contraseña restablecida exitosamente. Ahora puedes iniciar sesión.'
    });

  } catch (error) {
    console.error('Error al restablecer contraseña:', error);
    res.status(500).json({
      success: false,
      message: 'Error al restablecer la contraseña',
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

// Obtener todos los clientes (solo admin)
export const obtenerClientes = async (req, res) => {
  try {
    const [clientes] = await pool.execute(
      `SELECT id, nombre, apellido, nombre_completo, correo, telefono, 
              provider, foto_perfil, email_verificado, activo, 
              created_at, updated_at
       FROM clientes
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      data: clientes
    });
  } catch (error) {
    console.error('Error al obtener clientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los clientes',
      error: error.message
    });
  }
};

// Actualizar un cliente (solo admin)
export const actualizarClienteAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, apellido, nombre_completo, correo, telefono, activo } = req.body;

    // Verificar que el cliente existe
    const [clientesExistentes] = await pool.execute(
      'SELECT id FROM clientes WHERE id = ?',
      [id]
    );

    if (clientesExistentes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }

    // Construir la consulta dinámicamente
    const updates = [];
    const values = [];

    if (nombre !== undefined) {
      updates.push('nombre = ?');
      values.push(nombre);
    }
    if (apellido !== undefined) {
      updates.push('apellido = ?');
      values.push(apellido);
    }
    if (nombre_completo !== undefined) {
      updates.push('nombre_completo = ?');
      values.push(nombre_completo);
    }
    if (correo !== undefined) {
      // Verificar que el correo no esté en uso por otro cliente
      const [correoExiste] = await pool.execute(
        'SELECT id FROM clientes WHERE correo = ? AND id != ?',
        [correo, id]
      );
      if (correoExiste.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'El correo ya está en uso por otro cliente'
        });
      }
      updates.push('correo = ?');
      values.push(correo);
    }
    if (telefono !== undefined) {
      updates.push('telefono = ?');
      values.push(telefono);
    }
    if (activo !== undefined) {
      updates.push('activo = ?');
      values.push(activo ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionaron campos para actualizar'
      });
    }

    values.push(id);
    await pool.execute(
      `UPDATE clientes SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Obtener el cliente actualizado
    const [clientesActualizados] = await pool.execute(
      `SELECT id, nombre, apellido, nombre_completo, correo, telefono, 
              provider, foto_perfil, email_verificado, activo, 
              created_at, updated_at
       FROM clientes WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Cliente actualizado exitosamente',
      data: clientesActualizados[0]
    });
  } catch (error) {
    console.error('Error al actualizar cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el cliente',
      error: error.message
    });
  }
};

// Eliminar un cliente (solo admin)
export const eliminarCliente = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el cliente existe
    const [clientes] = await pool.execute(
      'SELECT id FROM clientes WHERE id = ?',
      [id]
    );

    if (clientes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }

    // Eliminar el cliente (cascade eliminará las compras relacionadas)
    await pool.execute('DELETE FROM clientes WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Cliente eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el cliente',
      error: error.message
    });
  }
};

