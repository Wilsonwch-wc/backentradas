import express from 'express';
import { verifyToken, requireAdmin, checkRole } from '../middleware/auth.js';
import { obtenerResumenDashboard, obtenerPanelEnVivo } from '../controllers/dashboardController.js';

const router = express.Router();

router.use(verifyToken);

router.get('/resumen', requireAdmin, obtenerResumenDashboard);
router.get('/panel-vivo', checkRole(['admin', 'seguridad']), obtenerPanelEnVivo);

export default router;


