import express from 'express';
import {
  authGoogleAnuncios,
  registroAnuncios,
  loginAnuncios,
  obtenerPerfilActual,
  actualizarPerfil
} from '../controllers/anunciosAuthController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Autenticación con Google (login o registro automático)
router.post('/google', authGoogleAnuncios);

// Registro tradicional con campos solicitados
router.post('/registro', registroAnuncios);

// Inicio de sesión tradicional
router.post('/login', loginAnuncios);

// Obtener perfil actual (requiere token)
router.get('/perfil', verifyToken, obtenerPerfilActual);

// Actualizar perfil (nombre, apellidos, teléfono, ubicación, dirección)
router.put('/perfil', verifyToken, actualizarPerfil);
router.post('/perfil/actualizar', verifyToken, actualizarPerfil);

export default router;

