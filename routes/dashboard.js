import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { obtenerResumenDashboard } from '../controllers/dashboardController.js';

const router = express.Router();

router.use(verifyToken);
router.use(requireAdmin);

router.get('/resumen', obtenerResumenDashboard);

export default router;


