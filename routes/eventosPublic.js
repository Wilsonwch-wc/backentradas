import express from 'express';
import {
  obtenerEventosPublicos,
  obtenerEventoPublicoPorId,
  obtenerPlanoPorZona
} from '../controllers/eventosPublicController.js';

const router = express.Router();

// Rutas públicas - no requieren autenticación

// Obtener todos los eventos
router.get('/', obtenerEventosPublicos);

// Obtener plano (asientos/mesas) filtrado por zona - para carga progresiva
router.get('/:id/plano', obtenerPlanoPorZona);

// Obtener un evento por ID
router.get('/:id', obtenerEventoPublicoPorId);

export default router;

