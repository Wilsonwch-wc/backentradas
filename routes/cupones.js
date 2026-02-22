import express from 'express';
import {
  obtenerCupones,
  obtenerCuponPorId,
  crearCupon,
  actualizarCupon,
  eliminarCupon,
  validarCupon,
  obtenerEstadisticasCupon
} from '../controllers/cuponesController.js';
import { verifyToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Ruta pública para validar cupón (usada por clientes antes de comprar)
router.post('/validar', validarCupon);

// Rutas protegidas (solo admin)
router.get('/', verifyToken, requireAdmin, obtenerCupones);
router.get('/:id', verifyToken, requireAdmin, obtenerCuponPorId);
router.post('/', verifyToken, requireAdmin, crearCupon);
router.put('/:id', verifyToken, requireAdmin, actualizarCupon);
router.delete('/:id', verifyToken, requireAdmin, eliminarCupon);
router.get('/:id/estadisticas', verifyToken, requireAdmin, obtenerEstadisticasCupon);

export default router;
