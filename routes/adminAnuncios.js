import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  requireAnunciosAdmin,
  getDashboardStats,
  listarAnunciosAdmin,
  cambiarEstadoAnuncio,
  listarUsuariosAnunciantes,
  cambiarEstadoUsuario,
  anunciosDeUsuario,
  listarCuponesAdmin,
  crearCuponAdmin,
  cambiarEstadoCuponAdmin,
  eliminarCuponAdmin
} from '../controllers/adminAnunciosController.js';

const router = express.Router();

// Todas las rutas requieren auth + permiso admin
router.use(verifyToken, requireAnunciosAdmin);

// 1. Dashboard stats
router.get('/stats', getDashboardStats);

// 2. Anuncios
router.get('/anuncios', listarAnunciosAdmin);
router.patch('/anuncios/:id/estado', cambiarEstadoAnuncio);

// 3. Usuarios
router.get('/usuarios', listarUsuariosAnunciantes);
router.patch('/usuarios/:id/estado', cambiarEstadoUsuario);
router.get('/usuarios/:id/anuncios', anunciosDeUsuario);

// 4. Cupones de AnunciosYA
router.get('/cupones', listarCuponesAdmin);
router.post('/cupones', crearCuponAdmin);
router.patch('/cupones/:id/estado', cambiarEstadoCuponAdmin);
router.delete('/cupones/:id', eliminarCuponAdmin);

export default router;
