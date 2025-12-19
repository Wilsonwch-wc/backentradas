import express from 'express';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Ruta pública de ejemplo
router.get('/public', (req, res) => {
  res.json({ message: 'Esta es una ruta pública' });
});

// Ruta protegida de ejemplo
router.get('/protected', verifyToken, (req, res) => {
  res.json({ 
    message: 'Esta es una ruta protegida',
    user: req.user
  });
});

export default router;

