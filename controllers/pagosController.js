import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import qrcode from 'qrcode';
import pool from '../config/db.js';
import dotenv from 'dotenv';

dotenv.config();

// Configurar cliente de Mercado Pago
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || '',
  options: {
    timeout: 5000,
    idempotencyKey: 'abc'
  }
});

const payment = new Payment(client);
const preference = new Preference(client);

// Crear pago QR y generar código QR
export const crearPagoQR = async (req, res) => {
  try {
    const { eventoId, cantidad, total, descripcion } = req.body;
    const userId = req.user.id;

    // Validaciones
    if (!eventoId || !cantidad || !total) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos para crear el pago'
      });
    }

    // Crear preferencia de pago en Mercado Pago
    const preferenceData = {
      items: [
        {
          title: descripcion || `Entrada(s) para evento`,
          quantity: cantidad,
          unit_price: parseFloat(total),
          currency_id: 'MXN'
        }
      ],
      payer: {
        email: req.user.email,
        name: req.user.nombre
      },
      back_urls: {
        success: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pago-exitoso`,
        failure: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pago-fallido`,
        pending: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pago-pendiente`
      },
      auto_return: 'approved',
      notification_url: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/pagos/webhook`,
      statement_descriptor: 'ENTRADAS',
      external_reference: `evento_${eventoId}_user_${userId}_${Date.now()}`,
      metadata: {
        evento_id: eventoId,
        usuario_id: userId,
        cantidad: cantidad
      }
    };

    // Crear preferencia en Mercado Pago
    const response = await preference.create({ body: preferenceData });

    // Generar código QR desde la URL de pago
    const qrCodeUrl = await qrcode.toDataURL(response.init_point);

    // Guardar información del pago en la base de datos
    const [result] = await pool.execute(
      `INSERT INTO pagos (usuario_id, evento_id, cantidad, monto_total, 
       preference_id, external_reference, estado, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [
        userId,
        eventoId,
        cantidad,
        total,
        response.id,
        preferenceData.external_reference,
      ]
    );

    res.json({
      success: true,
      data: {
        paymentId: result.insertId,
        preferenceId: response.id,
        qrCode: qrCodeUrl,
        qrCodeUrl: response.init_point,
        externalReference: preferenceData.external_reference,
        status: 'pending'
      },
      message: 'QR de pago generado exitosamente'
    });

  } catch (error) {
    console.error('Error al crear pago QR:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar el código QR de pago',
      error: error.message
    });
  }
};

// Verificar estado de un pago
export const verificarEstadoPago = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const userId = req.user.id;

    // Buscar pago en la base de datos
    const [pagos] = await pool.execute(
      `SELECT * FROM pagos WHERE id = ? AND usuario_id = ?`,
      [paymentId, userId]
    );

    if (pagos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pago no encontrado'
      });
    }

    const pago = pagos[0];

    // Verificar estado en Mercado Pago si hay preference_id
    if (pago.preference_id) {
      try {
        const preferenceInfo = await preference.get({ preferenceId: pago.preference_id });
        
        // Actualizar estado en base de datos si cambió
        if (preferenceInfo.status !== pago.estado) {
          await pool.execute(
            `UPDATE pagos SET estado = ? WHERE id = ?`,
            [preferenceInfo.status, paymentId]
          );
          pago.estado = preferenceInfo.status;
        }
      } catch (mpError) {
        console.error('Error al verificar en Mercado Pago:', mpError);
      }
    }

    res.json({
      success: true,
      data: {
        paymentId: pago.id,
        estado: pago.estado,
        monto: pago.monto_total,
        cantidad: pago.cantidad,
        createdAt: pago.created_at
      }
    });

  } catch (error) {
    console.error('Error al verificar pago:', error);
    res.status(500).json({
      success: false,
      message: 'Error al verificar el estado del pago',
      error: error.message
    });
  }
};

// Procesar webhook de Mercado Pago
export const procesarWebhook = async (req, res) => {
  try {
    const { type, data } = req.body;

    // Responder inmediatamente a Mercado Pago
    res.status(200).send('OK');

    // Procesar según el tipo de notificación
    if (type === 'payment') {
      const paymentId = data.id;
      
      // Obtener información del pago
      const paymentInfo = await payment.get({ id: paymentId });
      
      // Buscar pago en base de datos por external_reference
      const [pagos] = await pool.execute(
        `SELECT * FROM pagos WHERE external_reference = ?`,
        [paymentInfo.external_reference]
      );

      if (pagos.length > 0) {
        const pago = pagos[0];
        const nuevoEstado = paymentInfo.status === 'approved' ? 'approved' 
                          : paymentInfo.status === 'rejected' ? 'rejected'
                          : 'pending';

        // Actualizar estado del pago
        await pool.execute(
          `UPDATE pagos SET estado = ?, mp_payment_id = ?, updated_at = NOW() 
           WHERE id = ?`,
          [nuevoEstado, paymentId, pago.id]
        );

        // Si el pago fue aprobado, generar las entradas
        if (nuevoEstado === 'approved') {
          await generarEntradas(pago);
        }

        console.log(`Pago ${pago.id} actualizado a estado: ${nuevoEstado}`);
      }
    }

  } catch (error) {
    console.error('Error al procesar webhook:', error);
    // Aunque haya error, respondemos 200 para que MP no reenvíe
    res.status(200).send('OK');
  }
};

// Función auxiliar para generar entradas después del pago
const generarEntradas = async (pago) => {
  try {
    // Aquí implementarías la lógica para generar las entradas
    // Por ejemplo, crear registros en una tabla de entradas
    
    console.log(`Generando ${pago.cantidad} entradas para evento ${pago.evento_id}`);
    
    // Ejemplo de inserción de entradas (ajustar según tu esquema)
    // for (let i = 0; i < pago.cantidad; i++) {
    //   await pool.execute(
    //     `INSERT INTO entradas (pago_id, evento_id, usuario_id, codigo, estado, created_at)
    //      VALUES (?, ?, ?, ?, 'activa', NOW())`,
    //     [pago.id, pago.evento_id, pago.usuario_id, generarCodigoEntrada()]
    //   );
    // }

  } catch (error) {
    console.error('Error al generar entradas:', error);
    throw error;
  }
};

