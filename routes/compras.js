import express from 'express';
import { 
  crearCompra, 
  obtenerCompraPorCodigo, 
  obtenerCompras,
  obtenerMisCompras,
  obtenerAsientosOcupados,
  confirmarPago,
  cancelarCompra,
  reenviarBoleto,
  obtenerPDFBoleto,
  enviarPDFPorWhatsAppWeb,
  enviarBoletoPorEmail,
  obtenerEstadoWhatsAppWeb,
  reiniciarSesionWhatsAppWeb,
  eliminarCompra,
  buscarEntradaPorCodigo,
  tickearEntrada,
  desmarcarEscaneo,
  obtenerEntradasEscaneadas
} from '../controllers/comprasController.js';
import { verifyToken, optionalAuth, requireAdminOrVendedor, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

console.log('📦 Router de compras inicializado');

// IMPORTANTE: Rutas más específicas primero para evitar conflictos

// Buscar entrada por código de escaneo (sin tickear, solo mostrar info)
router.post('/buscar-entrada', verifyToken, (req, res, next) => {
  console.log('🔍 [COMPRAS] POST /buscar-entrada recibida');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  next();
}, buscarEntradaPorCodigo);

// Tickear entrada (marcar como escaneada)
router.post('/tickear-entrada', verifyToken, tickearEntrada);

// Desmarcar escaneo de entrada
router.post('/desmarcar-escaneo', verifyToken, desmarcarEscaneo);

// Obtener todas las entradas escaneadas
router.get('/entradas-escaneadas', verifyToken, obtenerEntradasEscaneadas);

// Crear compra (público; si hay token de admin/vendedor se guarda usuario_id)
router.post('/', optionalAuth, crearCompra);

// Obtener compra por código (público, para que el admin pueda buscar)
router.get('/codigo/:codigo', obtenerCompraPorCodigo);

// Obtener asientos ocupados para un evento (público)
router.get('/ocupados/:evento_id', obtenerAsientosOcupados);

// Obtener compras del cliente logueado (requiere autenticación - cliente)
router.get('/mis-compras', verifyToken, obtenerMisCompras);

// Obtener todas las compras (admin: todas; vendedor: solo las suyas)
router.get('/', verifyToken, requireAdminOrVendedor, obtenerCompras);

// Confirmar pago (admin o vendedor; vendedor solo sus compras)
router.put('/:id/confirmar-pago', verifyToken, requireAdminOrVendedor, confirmarPago);

// Cancelar compra (admin o vendedor solo sus compras)
router.put('/:id/cancelar', verifyToken, requireAdminOrVendedor, cancelarCompra);

// Reenviar boleto (requiere autenticación - solo admin)
router.post('/:id/reenviar-boleto', verifyToken, reenviarBoleto);

// Obtener PDF del boleto (requiere autenticación - solo admin)
router.get('/:id/pdf', verifyToken, obtenerPDFBoleto);

// Enviar PDF por WhatsApp Web (requiere autenticación - solo admin)
router.post('/:id/enviar-whatsapp-web', verifyToken, enviarPDFPorWhatsAppWeb);

// Enviar boleto por correo electrónico (requiere autenticación - solo admin)
router.post('/:id/enviar-email', verifyToken, enviarBoletoPorEmail);

// Obtener estado de WhatsApp Web (requiere autenticación - solo admin)
router.get('/whatsapp-web/estado', verifyToken, obtenerEstadoWhatsAppWeb);
router.post('/whatsapp-web/reiniciar', verifyToken, reiniciarSesionWhatsAppWeb);

// Eliminar compra (solo admin)
router.delete('/:id', verifyToken, requireAdmin, eliminarCompra);

export default router;

