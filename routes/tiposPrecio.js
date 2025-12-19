import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import {
  obtenerTiposPrecioPorEvento,
  obtenerTipoPrecioPorId,
  crearTipoPrecio,
  actualizarTipoPrecio,
  eliminarTipoPrecio
} from '../controllers/tiposPrecioController.js';

const router = express.Router();

// Todas las rutas requieren autenticación y ser admin
router.use(verifyToken);
router.use(requireAdmin);

// Obtener todos los tipos de precio de un evento
router.get('/evento/:eventoId', obtenerTiposPrecioPorEvento);

// Obtener un tipo de precio por ID
router.get('/:id', obtenerTipoPrecioPorId);

// Crear un nuevo tipo de precio
router.post('/', crearTipoPrecio);

// Actualizar un tipo de precio
router.put('/:id', actualizarTipoPrecio);

// Eliminar un tipo de precio
router.delete('/:id', eliminarTipoPrecio);

export default router;

