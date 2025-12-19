import express from 'express';
import {
  escanearQR,
  obtenerReporteEscaneos,
  obtenerEntradasPendientes
} from '../controllers/seguridadController.js';
import { verifyToken, checkRole } from '../middleware/auth.js';

const router = express.Router();

console.log('📦 Router de seguridad inicializado');

// Todas las rutas requieren autenticación y rol de seguridad o admin
const requireSeguridad = checkRole(['seguridad', 'admin']);

// Middleware de logging para debug
router.use((req, res, next) => {
  console.log(`🔍 [SEGURIDAD] ${req.method} ${req.originalUrl}`);
  next();
});

// Ruta de prueba sin autenticación
router.get('/test', (req, res) => {
  res.json({ message: 'Ruta de seguridad funcionando correctamente', timestamp: new Date() });
});

// Escanear QR de una entrada
router.post('/escanear', verifyToken, requireSeguridad, escanearQR);

console.log('✅ Ruta POST /escanear registrada en router de seguridad');

// Obtener reporte de escaneos por evento
router.get('/reporte/:evento_id', verifyToken, requireSeguridad, obtenerReporteEscaneos);

// Obtener entradas pendientes de escanear
router.get('/pendientes/:evento_id', verifyToken, requireSeguridad, obtenerEntradasPendientes);

export default router;

