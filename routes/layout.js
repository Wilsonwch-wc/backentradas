import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { guardarLayoutCompleto } from '../controllers/layoutController.js';

const router = express.Router();

router.use(verifyToken);
router.use(requireAdmin);

// Guardar el layout completo de un evento en una sola petición
router.put('/:eventoId', guardarLayoutCompleto);

export default router;
