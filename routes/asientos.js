import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import {
  obtenerAsientosPorEvento,
  obtenerAsientosDisponibles,
  obtenerAsientoPorId,
  crearAsiento,
  crearAsientosMasivos,
  actualizarAsiento,
  eliminarAsiento
} from '../controllers/asientosController.js';

const router = express.Router();

// Todas las rutas requieren autenticación y ser admin
router.use(verifyToken);
router.use(requireAdmin);

// Obtener todos los asientos de un evento
router.get('/evento/:eventoId', obtenerAsientosPorEvento);

// Obtener asientos disponibles de un evento (con filtros opcionales)
router.get('/evento/:eventoId/disponibles', obtenerAsientosDisponibles);

// Obtener un asiento por ID
router.get('/:id', obtenerAsientoPorId);

// Crear un nuevo asiento
router.post('/', crearAsiento);

// Crear múltiples asientos
router.post('/masivos', crearAsientosMasivos);

// Actualizar un asiento
router.put('/:id', actualizarAsiento);

// Eliminar un asiento
router.delete('/:id', eliminarAsiento);

export default router;

