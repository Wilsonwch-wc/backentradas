import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { crearPagoQR, verificarEstadoPago, procesarWebhook } from '../controllers/pagosController.js';

const router = express.Router();

// Crear orden de pago y generar QR
router.post('/crear-pago', verifyToken, crearPagoQR);

// Verificar estado de un pago
router.get('/verificar/:paymentId', verifyToken, verificarEstadoPago);

// Webhook para recibir notificaciones de Mercado Pago
router.post('/webhook', procesarWebhook);

export default router;

