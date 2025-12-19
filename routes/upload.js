import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { upload, subirImagen } from '../controllers/uploadController.js';

const router = express.Router();

// Todas las rutas requieren autenticación y ser admin
router.use(verifyToken);
router.use(requireAdmin);

// Ruta para subir imágenes
router.post('/imagen', upload.single('imagen'), subirImagen);

export default router;

