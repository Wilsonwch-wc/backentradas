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
    if (!roles.includes(req.user.rol)) {
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

  if (req.user.rol !== 'admin') {
    return res.status(403).json({ 
      success: false,
      message: 'Se requieren permisos de administrador' 
    });
  }

  next();
};

