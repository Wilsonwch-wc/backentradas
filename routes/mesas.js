import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import {
  obtenerMesasPorEvento,
  obtenerMesaPorId,
  crearMesa,
  actualizarMesa,
  eliminarMesa
} from '../controllers/mesasController.js';

const router = express.Router();

// Todas las rutas requieren autenticación y ser admin
router.use(verifyToken);
router.use(requireAdmin);

// Obtener todas las mesas de un evento
router.get('/evento/:eventoId', obtenerMesasPorEvento);

// Obtener una mesa por ID
router.get('/:id', obtenerMesaPorId);

// Crear una nueva mesa
router.post('/', crearMesa);

// Actualizar una mesa
router.put('/:id', actualizarMesa);

// Eliminar una mesa
router.delete('/:id', eliminarMesa);

export default router;

