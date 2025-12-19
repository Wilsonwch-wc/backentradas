import express from 'express';
import {
  obtenerEventosPublicos,
  obtenerEventoPublicoPorId
} from '../controllers/eventosPublicController.js';

const router = express.Router();

// Rutas públicas - no requieren autenticación

// Obtener todos los eventos
router.get('/', obtenerEventosPublicos);

// Obtener un evento por ID
router.get('/:id', obtenerEventoPublicoPorId);

export default router;

