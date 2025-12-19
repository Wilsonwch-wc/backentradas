import express from 'express';
import { login, verifyAuth, logout } from '../controllers/authController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Ruta de login (pública)
router.post('/login', login);

// Ruta para verificar autenticación (protegida)
router.get('/verify', verifyToken, verifyAuth);

// Ruta de logout (protegida)
router.post('/logout', verifyToken, logout);

export default router;

