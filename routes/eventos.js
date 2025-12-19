import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import {
  obtenerEventos,
  obtenerEventoPorId,
  crearEvento,
  actualizarEvento,
  eliminarEvento
} from '../controllers/eventosController.js';

const router = express.Router();

// Todas las rutas requieren autenticación y ser admin
router.use(verifyToken);
router.use(requireAdmin);

// Obtener todos los eventos
router.get('/', obtenerEventos);

// Obtener un evento por ID
router.get('/:id', obtenerEventoPorId);

// Crear un nuevo evento
router.post('/', crearEvento);

// Actualizar un evento
router.put('/:id', actualizarEvento);

// Eliminar un evento
router.delete('/:id', eliminarEvento);

export default router;

