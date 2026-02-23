import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

// Middleware para verificar el token JWT
export const verifyToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        message: 'Token no proporcionado',
        error: 'No autorizado'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tu_secreto_jwt_aqui');
    req.user = decoded; // Agregar información del usuario al request
    next();
  } catch (error) {
    return res.status(401).json({ 
      message: 'Token inválido o expirado',
      error: error.message 
    });
  }
};

// Middleware para verificar roles específicos
export const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: 'Usuario no autenticado' 
      });
    }

    // Verificar si el rol del usuario está en la lista de roles permitidos
    const rol = (req.user.rol || '').toLowerCase();
    const rolesPermitidos = (roles || []).map((r) => String(r || '').toLowerCase());
    if (!rolesPermitidos.includes(rol)) {
      return res.status(403).json({ 
        success: false,
        message: 'No tienes permisos para acceder a esta ruta' 
      });
    }

    next();
  };
};

// Middleware específico para admin
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      message: 'Usuario no autenticado' 
    });
  }

  const rol = (req.user.rol || '').toLowerCase();
  if (rol !== 'admin') {
    return res.status(403).json({ 
      success: false,
      message: 'Se requieren permisos de administrador' 
    });
  }

  next();
};

// Verificar token si viene en la petición; no fallar si no hay token (para rutas públicas opcionales)
export const optionalAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      next();
      return;
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tu_secreto_jwt_aqui');
    req.user = decoded;
    next();
  } catch (_) {
    next();
  }
};

// Admin o vendedor; para vendedor luego se valida que la compra sea suya (usuario_id)
export const requireAdminOrVendedor = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
  }
  const rol = (req.user.rol || '').toLowerCase();
  if (rol !== 'admin' && rol !== 'vendedor' && rol !== 'vendedor_externo') {
    return res.status(403).json({ success: false, message: 'Se requieren permisos de administrador o vendedor' });
  }
  next();
};

