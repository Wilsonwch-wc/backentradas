import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { crearPagoQR, verificarEstadoPagoQR, webhookQR, QR_AMBIENTE } from '../controllers/pagosControllerQR.js';

const router = express.Router();

// ─── Req 5: Endpoint público de callback — accesible desde Internet ──────────
// La pasarela llama a: POST https://dominio.com/qr/confirmed
// No requiere autenticación JWT (la pasarela no tiene token de usuario)
router.post('/confirmed', webhookQR);

// ─── Req 11: Diagnóstico del ambiente activo ─────────────────────────────────
// GET /qr/ambiente → devuelve el ambiente activo (TEST | PRODUCCION)
router.get('/ambiente', (_req, res) => {
  res.json({ success: true, ambiente: QR_AMBIENTE });
});

// ─── Req 3: Generación de QR de cobro (requiere usuario autenticado) ──────────
// POST /qr/generar
router.post('/generar', verifyToken, crearPagoQR);

// ─── Req 8: Consulta de estado del QR ────────────────────────────────────────
// GET /qr/verificaQr/:numeroReferencia
// Req 2: incluye x-api-key en la petición a la pasarela internamente
router.get('/verificaQr/:numeroReferencia', verifyToken, verificarEstadoPagoQR);

export default router;

