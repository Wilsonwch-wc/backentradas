import express from 'express';
import { obtenerContacto, actualizarContacto } from '../controllers/contactoController.js';
import { verifyToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Público: obtener datos de contacto para mostrarlos en el sitio
router.get('/', obtenerContacto);

// Admin: actualizar datos de contacto
router.put('/', verifyToken, requireAdmin, actualizarContacto);

export default router;

