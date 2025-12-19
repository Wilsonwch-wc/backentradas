import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import {
  obtenerAreasPorEvento,
  obtenerAreaPorId,
  crearArea,
  actualizarArea,
  eliminarArea
} from '../controllers/areasController.js';

const router = express.Router();

// Todas las rutas requieren autenticación y ser admin
router.use(verifyToken);
router.use(requireAdmin);

// Obtener todas las áreas de un evento
router.get('/evento/:eventoId', obtenerAreasPorEvento);

// Obtener un área por ID
router.get('/:id', obtenerAreaPorId);

// Crear una nueva área
router.post('/', crearArea);

// Actualizar un área
router.put('/:id', actualizarArea);

// Eliminar un área
router.delete('/:id', eliminarArea);

export default router;

