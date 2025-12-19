// Controlador de pagos adaptado para Banco de Crédito de Bolivia (BCP)
// Documentación: https://www.bcp.com.bo/Desarrollo/ApiPagosQR
import axios from 'axios';
import qrcode from 'qrcode';
import pool from '../config/db.js';
import dotenv from 'dotenv';

dotenv.config();

const BCP_API_URL = process.env.BCP_API_URL || 'https://api.bcp.com.bo';
const BCP_CLIENT_ID = process.env.BCP_CLIENT_ID;
const BCP_CLIENT_SECRET = process.env.BCP_CLIENT_SECRET;

// Crear pago QR con BCP
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

    // Obtener token de autenticación BCP
    const token = await obtenerTokenBCP();

    // Crear solicitud de pago QR
    const pagoData = {
      monto: parseFloat(total),
      moneda: 'BOB', // Bolivianos
      concepto: descripcion || `Entrada(s) para evento`,
      referencia: `EVENTO_${eventoId}_USER_${userId}_${Date.now()}`,
      callback_url: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/pagos/webhook`,
      metadata: {
        evento_id: eventoId,
        usuario_id: userId,
        cantidad: cantidad
      }
    };

    // Llamar a API de BCP para generar QR
    const response = await axios.post(
      `${BCP_API_URL}/api/v1/pagos/qr`,
      pagoData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Generar código QR desde la URL proporcionada por BCP
    const qrCodeUrl = await qrcode.toDataURL(response.data.qr_url);

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
        response.data.pago_id,
        pagoData.referencia,
      ]
    );

    res.json({
      success: true,
      data: {
        paymentId: result.insertId,
        qrCode: qrCodeUrl,
        qrCodeUrl: response.data.qr_url,
        qrText: response.data.qr_text, // Para mostrar como alternativa
        externalReference: pagoData.referencia,
        status: 'pending'
      },
      message: 'QR de pago generado exitosamente'
    });

  } catch (error) {
    console.error('Error al crear pago QR BCP:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Error al generar el código QR de pago',
      error: error.response?.data?.message || error.message
    });
  }
};

// Obtener token de autenticación BCP
const obtenerTokenBCP = async () => {
  try {
    const response = await axios.post(
      `${BCP_API_URL}/oauth/token`,
      {
        grant_type: 'client_credentials',
        client_id: BCP_CLIENT_ID,
        client_secret: BCP_CLIENT_SECRET
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error('Error al obtener token BCP:', error);
    throw new Error('Error de autenticación con BCP');
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

    // Verificar estado en BCP si hay preference_id
    if (pago.preference_id) {
      try {
        const token = await obtenerTokenBCP();
        const response = await axios.get(
          `${BCP_API_URL}/api/v1/pagos/${pago.preference_id}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );

        const nuevoEstado = response.data.estado === 'aprobado' ? 'approved'
                          : response.data.estado === 'rechazado' ? 'rejected'
                          : 'pending';

        // Actualizar estado en base de datos si cambió
        if (nuevoEstado !== pago.estado) {
          await pool.execute(
            `UPDATE pagos SET estado = ? WHERE id = ?`,
            [nuevoEstado, paymentId]
          );
          pago.estado = nuevoEstado;
        }
      } catch (mpError) {
        console.error('Error al verificar en BCP:', mpError);
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

// Procesar webhook de BCP
export const procesarWebhook = async (req, res) => {
  try {
    const { tipo, datos } = req.body;

    // Responder inmediatamente a BCP
    res.status(200).send('OK');

    // Procesar según el tipo de notificación
    if (tipo === 'pago' && datos.estado === 'aprobado') {
      const referencia = datos.referencia;

      // Buscar pago en base de datos
      const [pagos] = await pool.execute(
        `SELECT * FROM pagos WHERE external_reference = ?`,
        [referencia]
      );

      if (pagos.length > 0) {
        const pago = pagos[0];

        // Actualizar estado del pago
        await pool.execute(
          `UPDATE pagos SET estado = 'approved', mp_payment_id = ?, updated_at = NOW() 
           WHERE id = ?`,
          [datos.pago_id, pago.id]
        );

        // Generar las entradas
        await generarEntradas(pago);

        console.log(`Pago ${pago.id} aprobado y entradas generadas`);
      }
    }

  } catch (error) {
    console.error('Error al procesar webhook BCP:', error);
    res.status(200).send('OK'); // Siempre responder OK para no reenvíos
  }
};

// Función auxiliar para generar entradas
const generarEntradas = async (pago) => {
  try {
    console.log(`Generando ${pago.cantidad} entradas para evento ${pago.evento_id}`);
    // Implementar lógica de generación de entradas
  } catch (error) {
    console.error('Error al generar entradas:', error);
    throw error;
  }
};

