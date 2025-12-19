import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  loginConGoogle,
  registrarCliente,
  loginCliente,
  verifyCliente,
  actualizarCliente
} from '../controllers/clientesController.js';

const router = express.Router();

// Rutas públicas
router.post('/google', loginConGoogle);
router.post('/registro', registrarCliente);
router.post('/login', loginCliente);

// Rutas protegidas
router.get('/verify', verifyToken, verifyCliente);
router.put('/actualizar', verifyToken, actualizarCliente);

export default router;

