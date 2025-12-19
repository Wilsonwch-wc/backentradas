import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { obtenerEventosParaReportes, obtenerReportePorEvento } from '../controllers/reportesController.js';

const router = express.Router();

router.use(verifyToken);
router.use(requireAdmin);

router.get('/eventos', obtenerEventosParaReportes);
router.get('/evento/:id', obtenerReportePorEvento);

export default router;


