import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import {
  loginConGoogle,
  registrarCliente,
  loginCliente,
  verifyCliente,
  actualizarCliente,
  obtenerClientes,
  actualizarClienteAdmin,
  eliminarCliente,
  verificarCodigoEmail,
  reenviarCodigoVerificacion,
  solicitarRecuperacionPassword,
  restablecerPassword
} from '../controllers/clientesController.js';

const router = express.Router();

// Rutas públicas
router.post('/google', loginConGoogle);
router.post('/registro', registrarCliente);
router.post('/login', loginCliente);
router.post('/verificar-codigo', verificarCodigoEmail);
router.post('/reenviar-codigo', reenviarCodigoVerificacion);
router.post('/solicitar-recuperacion', solicitarRecuperacionPassword);
router.post('/restablecer-password', restablecerPassword);

// Rutas protegidas (cliente autenticado)
router.get('/verify', verifyToken, verifyCliente);
router.put('/actualizar', verifyToken, actualizarCliente);

// Rutas protegidas (solo admin)
router.get('/admin', verifyToken, requireAdmin, obtenerClientes);
router.put('/admin/:id', verifyToken, requireAdmin, actualizarClienteAdmin);
router.delete('/admin/:id', verifyToken, requireAdmin, eliminarCliente);

export default router;

