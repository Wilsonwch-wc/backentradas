import express from 'express';
import { obtenerAnuncios, crearAnuncio, denunciarAnuncio, validarCuponAnuncio } from '../controllers/anunciosController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// 1. Obtener todos los anuncios activos (público)
router.get('/', obtenerAnuncios);

// 2. Validar cupón de descuento/gratis para publicación (público o con token opcional)
router.post('/cupones/validar', (req, res, next) => {
  if (req.headers.authorization) {
    return verifyToken(req, res, next);
  }
  next();
}, validarCuponAnuncio);

// 3. Crear anuncio (puede usar verifyToken si viene con Bearer, o aceptar id_usuario)
router.post('/', (req, res, next) => {
  // Si trae header de autorización, usar verifyToken, si no pasar directo
  if (req.headers.authorization) {
    return verifyToken(req, res, next);
  }
  next();
}, crearAnuncio);

// 4. Denunciar anuncio (público)
router.post('/:id/denunciar', denunciarAnuncio);

export default router;

