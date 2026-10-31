import express from 'express';
import {
  obtenerTiendas,
  obtenerTiendaPorId,
  obtenerMiTienda,
  crearTienda,
  actualizarTienda,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  obtenerProductosDeTienda
} from '../controllers/tiendasController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// ---- Rutas Públicas ----
// GET /api/tiendas            -> listar todas las tiendas activas
router.get('/', obtenerTiendas);

// GET /api/tiendas/:id        -> detalle de una tienda + sus productos
router.get('/:id', obtenerTiendaPorId);

// GET /api/tiendas/:id_tienda/productos  -> productos de una tienda
router.get('/:id_tienda/productos', obtenerProductosDeTienda);

// ---- Rutas Protegidas (requieren token) ----
// GET /api/tiendas/mi-tienda        -> tienda del usuario autenticado
router.get('/mi-tienda/perfil', verifyToken, obtenerMiTienda);

// POST /api/tiendas                 -> crear tienda
router.post('/', verifyToken, crearTienda);

// PUT /api/tiendas/:id              -> actualizar tienda
router.put('/:id', verifyToken, actualizarTienda);

// POST /api/tiendas/productos       -> crear producto
router.post('/productos/crear', verifyToken, crearProducto);

// PUT /api/tiendas/productos/:id    -> actualizar producto
router.put('/productos/:id', verifyToken, actualizarProducto);

// DELETE /api/tiendas/productos/:id -> eliminar producto
router.delete('/productos/:id', verifyToken, eliminarProducto);

export default router;
