/**
 * pagosControllerQR.js
 * Integración con API QR Cobranza v1.7 — Redenlace ATC
 *
 * URLs:
 *  TEST:  https://appcobranzacert.redenlace.com.bo/cobranza-0.0.1
 *  PROD:  https://appcobranza.redenlace.com.bo/cobranza-0.0.1
 *
 * Endpoints:
 *  POST /atc/generarQr
 *  GET  /atc/verificaQr/{numeroReferencia}
 *  POST /qr/confirmed  ← nuestro callback
 *
 * Checklist cubierto:
 *  ✅ Consumo API REST / JSON
 *  ✅ Header x-api-key en todas las peticiones
 *  ✅ Endpoint Generar QR con campos correctos
 *  ✅ Endpoint Verificar Estado
 *  ✅ Conversión Base64 → imagen QR
 *  ✅ Callback público /qr/confirmed
 *  ✅ Recepción y respuesta del callback (codigoRespuesta 00/05)
 *  ✅ Manejo de todos los estados (INITIALIZE, PENDING, SUCCESS, CLOSED, EXPIRED, CANCELLED, ERROR, NOTFOUND)
 *  ✅ Estados del callback: 00=aprobado, 03=expirado, 05=inválido
 *  ✅ Credenciales diferenciadas TEST / PRODUCCION
 *  ✅ Reintentos automáticos con backoff exponencial
 *  ✅ Registro del pago en BD (origenNumeroReferencia + atcReferencia)
 *  ✅ Generación de entradas al confirmar el pago
 */

import axios from 'axios';
import retry from 'async-retry';
import pool from '../config/db.js';
import dotenv from 'dotenv';
import { generarBoletoPDF } from '../services/boletoService.js';
import { enviarBoletoPorEmail as enviarBoletoPorEmailService } from '../services/emailService.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// ─────────────────────────────────────────────────────────────
// Configuración por ambiente
// ─────────────────────────────────────────────────────────────
const QR_AMBIENTE = (process.env.QR_AMBIENTE || 'TEST').toUpperCase();
const IS_PRODUCCION = QR_AMBIENTE === 'PRODUCCION' || QR_AMBIENTE === 'PROD';

const QR_API_URL = IS_PRODUCCION
  ? process.env.QR_API_URL_PROD
  : process.env.QR_API_URL_TEST;

const QR_API_KEY = IS_PRODUCCION
  ? process.env.QR_API_KEY_PROD
  : process.env.QR_API_KEY_TEST;

const QR_WEBHOOK_SECRET = process.env.QR_WEBHOOK_SECRET || null;

// Tiempo de vigencia: configurable desde .env.
// Por defecto 15 minutos (ideal para pruebas). En producción cambia QR_EXPIRACION_MINUTOS=1440 (24h).
const QR_EXPIRACION_MINUTOS = parseInt(process.env.QR_EXPIRACION_MINUTOS || '15', 10);
const QR_TIEMPO_VIGENCIA = (() => {
  const totalMin = QR_EXPIRACION_MINUTOS;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return `${hh}:${mm}:00`;
})();

// Configuración de reintentos
const RETRY_OPTIONS = {
  retries: 3,
  factor: 2,
  minTimeout: 500,
  maxTimeout: 5000,
  onRetry: (err, attempt) => {
    console.warn(`[QR][${QR_AMBIENTE}] Reintento ${attempt}/3 → ${err.message}`);
  }
};

// Log de arranque
console.log(`🔐 Pasarela QR inicializada en ambiente: ${QR_AMBIENTE}`);
if (!QR_API_URL || !QR_API_KEY) {
  console.warn(
    `⚠️  [QR] Credenciales del ambiente ${QR_AMBIENTE} no configuradas. ` +
    `Configura QR_API_URL_${IS_PRODUCCION ? 'PROD' : 'TEST'} y QR_API_KEY_${IS_PRODUCCION ? 'PROD' : 'TEST'} en .env`
  );
}

// ─────────────────────────────────────────────────────────────
// Mapeo de estados
// ─────────────────────────────────────────────────────────────

/**
 * Estados del CALLBACK (campo "estado"):
 *   00 = QR aprobado
 *   03 = QR expirado
 *   05 = QR inválido
 */
const mapearEstadoCallback = (estado) => {
  const est = (estado || '').toString().trim();
  if (est === '00') return 'approved';
  if (est === '03') return 'expired';
  if (est === '05') return 'rejected';
  return 'pending';
};

/**
 * Estados del VERIFICAR QR (campo "codigoRespuesta"):
 *   INITIALIZE → pending
 *   PENDING    → pending
 *   SUCCESS    → approved
 *   CLOSED     → approved  (transacción finalizada con éxito)
 *   EXPIRED    → expired
 *   CANCELLED  → cancelled
 *   ERROR      → rejected
 *   NOTFOUND   → rejected
 */
const mapearEstadoVerificacion = (codigoRespuesta) => {
  const est = (codigoRespuesta || '').toString().trim().toUpperCase();
  if (est === 'SUCCESS' || est === 'CLOSED') return 'approved';
  if (est === 'EXPIRED') return 'expired';
  if (est === 'CANCELLED') return 'cancelled';
  if (est === 'ERROR' || est === 'NOTFOUND') return 'rejected';
  return 'pending'; // INITIALIZE, PENDING
};

/**
 * Genera un número de referencia único de máx 9 dígitos.
 * Usa los últimos 9 dígitos del timestamp en segundos.
 */
const generarNumeroReferencia = () => {
  const ts = Math.floor(Date.now() / 1000).toString().slice(-9);
  return parseInt(ts, 10);
};

/**
 * Trunca campoExtra a máximo 50 caracteres (límite de la API).
 */
const truncarCampoExtra = (texto) => (texto || '').substring(0, 50);

/**
 * Genera un código de escaneo único para boletos (5 dígitos).
 */
const generarCodigoEscaneo = async (connection) => {
  let codigo = '';
  let existe = true;
  let intentos = 0;
  const maxIntentos = 100;

  while (existe && intentos < maxIntentos) {
    codigo = Math.floor(10000 + Math.random() * 90000).toString();
    const [rows] = await connection.execute(
      `SELECT 1 FROM compras_asientos WHERE codigo_escaneo = ?
       UNION SELECT 1 FROM compras_mesas WHERE codigo_escaneo = ?
       UNION SELECT 1 FROM compras_entradas_generales WHERE codigo_escaneo = ?
       LIMIT 1`,
      [codigo, codigo, codigo]
    );
    existe = rows.length > 0;
    intentos++;
  }
  
  if (intentos >= maxIntentos) {
    throw new Error('No se pudo generar un código de escaneo único');
  }

  return codigo;
};

// ─────────────────────────────────────────────────────────────
// POST /qr/generar — Genera QR de cobro
// Endpoint Redenlace: POST /atc/generarQr
// ─────────────────────────────────────────────────────────────
export const crearPagoQR = async (req, res) => {
  try {
    const {
      compra_id,
      eventoId,
      cantidad,
      total,
      descripcion,
      // Glosa: valores registrados por Redenlace para Plustiket
      codigoSucursal = '461116',
      nombreSucursal = 'PLUSTIKET API QR',
      rubroComercio  = '7922'
    } = req.body;

    const userId = req.user.id;

    if (!eventoId || !cantidad || !total) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: eventoId, cantidad, total'
      });
    }

    if (!QR_API_URL || !QR_API_KEY) {
      return res.status(503).json({
        success: false,
        message: `Pasarela QR no configurada para el ambiente ${QR_AMBIENTE}. Contacte al administrador.`
      });
    }

    // Referencia única nuestra (máx 9 dígitos)
    const origenNumeroReferencia = generarNumeroReferencia();

    // Glosa: codigoSucursal|nombreSucursal|rubroComercio|detalleCompra
    const detalleCompra = (descripcion || 'Compra de entradas').substring(0, 40);
    const glosa = `${codigoSucursal}|${nombreSucursal}|${rubroComercio}|${detalleCompra}`;

    // campoExtra: máx 50 caracteres
    const campoExtraBase = compra_id
      ? `c${compra_id}e${eventoId}u${userId}`
      : `e${eventoId}u${userId}`;
    const campoExtra = truncarCampoExtra(campoExtraBase);

    // Calcular tiempo restante real si es una compra existente
    let tiempoQrFinal = QR_TIEMPO_VIGENCIA;
    if (compra_id) {
      const [compras] = await pool.execute('SELECT fecha_compra FROM compras WHERE id = ?', [compra_id]);
      if (compras.length > 0) {
        const fechaCompra = new Date(compras[0].fecha_compra);
        const ahora = new Date();
        const diferenciaMs = ahora - fechaCompra;
        const minutosTranscurridos = Math.floor(diferenciaMs / 60000);
        const segundosRestantes = (QR_EXPIRACION_MINUTOS * 60) - Math.floor(diferenciaMs / 1000);

        if (segundosRestantes <= 0) {
          return res.status(400).json({
            success: false,
            message: 'El tiempo para pagar esta compra ha expirado. La compra será cancelada automáticamente.'
          });
        }

        const hh = String(Math.floor(segundosRestantes / 3600)).padStart(2, '0');
        const mm = String(Math.floor((segundosRestantes % 3600) / 60)).padStart(2, '0');
        const ss = String(segundosRestantes % 60).padStart(2, '0');
        tiempoQrFinal = `${hh}:${mm}:${ss}`;
      }
    }

    // Payload según especificación v1.7
    const pagoData = {
      numeroReferencia: origenNumeroReferencia,
      glosa,
      monto: parseFloat(parseFloat(total).toFixed(2)),
      moneda: 'BOB',
      canal: 'WEB',
      tiempoQr: tiempoQrFinal,
      campoExtra
    };

    console.log(`[QR][${QR_AMBIENTE}] Generando QR. Ref: ${origenNumeroReferencia} | Monto: ${pagoData.monto} BOB | Tiempo: ${tiempoQrFinal}`);

    // Llamada POST con reintentos — endpoint real de Redenlace
    let response;
    try {
      response = await retry(async () => {
        const r = await axios.post(
          `${QR_API_URL}/atc/generarQr`,
          pagoData,
          {
            headers: {
              'x-api-key': QR_API_KEY,
              'Content-Type': 'application/json'
            },
            timeout: 15000
          }
        );
        return r;
      }, RETRY_OPTIONS);
    } catch (apiError) {
      console.error('[QR] Error al llamar a Redenlace:', apiError.response?.data || apiError.message);
      return res.status(502).json({
        success: false,
        message: 'No se pudo conectar con la pasarela de pagos. Intente nuevamente.',
        error: apiError.response?.data || apiError.message
      });
    }

    // Respuesta de Redenlace:
    // { moneda, monto, origenNumeroReferencia, numeroReferencia (ATC), codigoRespuesta: "PENDING", imagen: "base64..." }
    const respuesta = response.data;
    const atcReferencia = respuesta.numeroReferencia?.toString() || null;
    const imagen = respuesta.imagen || null;

    if (!imagen) {
      console.error('[QR] Redenlace no devolvió imagen Base64:', respuesta);
      return res.status(502).json({
        success: false,
        message: 'La pasarela no devolvió una imagen QR válida.',
        detalle: respuesta
      });
    }

    console.log(`[QR][${QR_AMBIENTE}] QR generado. ` +
      `OrigenRef: ${origenNumeroReferencia} | ATC Ref: ${atcReferencia} | Estado: ${respuesta.codigoRespuesta}`);

    // Guardar en BD: almacenamos AMBAS referencias
    const [result] = await pool.execute(
      `INSERT INTO pagos
         (usuario_id, evento_id, cantidad, monto_total,
          external_reference, atc_referencia, compra_id,
          estado, ambiente, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW())`,
      [
        userId,
        eventoId,
        cantidad,
        total,
        origenNumeroReferencia.toString(),
        atcReferencia,
        compra_id || null,
        QR_AMBIENTE
      ]
    );

    res.json({
      success: true,
      ambiente: QR_AMBIENTE,
      data: {
        paymentId: result.insertId,
        origenNumeroReferencia,
        atcReferencia,
        imagen,                        // Base64 — el frontend renderiza: <img src="data:image/png;base64,...">
        tiempoQr: tiempoQrFinal,
        moneda: 'BOB',
        monto: parseFloat(total),
        estadoPasarela: respuesta.codigoRespuesta, // PENDING
        status: 'pending'
      },
      message: 'Código QR de pago generado exitosamente'
    });

  } catch (error) {
    console.error('[QR] Error inesperado al crear pago QR:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error interno al generar el código QR de pago',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /qr/confirmed — Callback / Webhook (público, sin JWT)
// La pasarela Redenlace llama a este endpoint cuando el cliente paga.
// ─────────────────────────────────────────────────────────────
export const webhookQR = async (req, res) => {
  const respuestaError = (ref, detalle) => ({
    numeroReferencia: (ref || '0').toString(),
    codigoRespuesta: '05',
    detalleRespuesta: detalle
  });

  try {
    // Validar firma si está configurada
    if (QR_WEBHOOK_SECRET) {
      const firmaRecibida =
        req.headers['x-webhook-secret'] ||
        req.headers['x-api-key'] ||
        req.headers['authorization']?.replace('Bearer ', '') || '';
      if (firmaRecibida !== QR_WEBHOOK_SECRET) {
        console.warn('[QR] Webhook rechazado: firma inválida');
        return res.status(401).json(
          respuestaError(req.body?.numeroReferencia, 'Firma inválida')
        );
      }
    }

    // Campos del callback Redenlace:
    // { numeroReferencia (ATC), estado: "00"|"03"|"05", transacciones: {...} }
    const { numeroReferencia, estado, transacciones } = req.body;

    if (!numeroReferencia || estado === undefined || estado === null) {
      return res.status(400).json(
        respuestaError(numeroReferencia, 'Faltan parámetros: numeroReferencia, estado')
      );
    }

    console.log(`[QR][${QR_AMBIENTE}] Callback recibido. ATC Ref: ${numeroReferencia} | Estado: ${estado}`);

    // Buscar el pago por la referencia ATC (atc_referencia)
    // También intentar por external_reference como fallback
    let [pagos] = await pool.execute(
      `SELECT * FROM pagos WHERE atc_referencia = ? LIMIT 1`,
      [numeroReferencia.toString()]
    );

    if (pagos.length === 0) {
      // Fallback: buscar por nuestra referencia
      [pagos] = await pool.execute(
        `SELECT * FROM pagos WHERE external_reference = ? LIMIT 1`,
        [numeroReferencia.toString()]
      );
    }

    if (pagos.length === 0) {
      console.warn(`[QR] Pago no encontrado. ATC Ref: ${numeroReferencia}`);
      return res.status(404).json(
        respuestaError(numeroReferencia, 'Número de referencia no encontrado')
      );
    }

    const pago = pagos[0];

    // Mapear estado del callback (00, 03, 05)
    const nuevoEstado = mapearEstadoCallback(estado);

    await pool.execute(
      `UPDATE pagos SET estado = ?, updated_at = NOW() WHERE id = ?`,
      [nuevoEstado, pago.id]
    );

    console.log(`[QR] Pago ${pago.id} → estado: ${nuevoEstado} (código pasarela: ${estado})`);

    // Si se aprobó y aún no estaba procesado → generar entradas
    if (nuevoEstado === 'approved' && pago.estado !== 'approved') {
      try {
        await generarEntradas(pago, transacciones);
      } catch (entradaError) {
        console.error(`[QR] Error al generar entradas para pago ${pago.id}:`, entradaError.message);
      }
    }

    // Respuesta obligatoria para Redenlace
    return res.status(200).json({
      numeroReferencia: numeroReferencia.toString(),
      codigoRespuesta: '00',
      detalleRespuesta: null
    });

  } catch (error) {
    console.error('[QR] Error interno en webhook:', error.message);
    return res.status(500).json(
      respuestaError(req.body?.numeroReferencia, 'Error interno del servidor')
    );
  }
};

// ─────────────────────────────────────────────────────────────
// GET /qr/verificaQr/:numeroReferencia — Consulta estado
// Endpoint Redenlace: GET /atc/verificaQr/{numeroReferencia}
// ─────────────────────────────────────────────────────────────
export const verificarEstadoPagoQR = async (req, res) => {
  try {
    const { numeroReferencia } = req.params;

    if (!numeroReferencia) {
      return res.status(400).json({ success: false, message: 'Falta el número de referencia' });
    }

    // Buscar en BD por nuestra referencia o la de ATC
    let [pagos] = await pool.execute(
      `SELECT * FROM pagos WHERE external_reference = ? OR atc_referencia = ? LIMIT 1`,
      [numeroReferencia, numeroReferencia]
    );

    if (pagos.length === 0) {
      return res.status(404).json({ success: false, message: 'Pago no encontrado' });
    }

    const pago = pagos[0];

    // Consultar estado real en Redenlace (usando referencia ATC)
    const refParaConsulta = pago.atc_referencia || pago.external_reference;

    if (QR_API_URL && QR_API_KEY && refParaConsulta) {
      try {
        const response = await retry(async () => {
          return await axios.get(
            `${QR_API_URL}/atc/verificaQr/${refParaConsulta}`,
            {
              headers: { 'x-api-key': QR_API_KEY },
              timeout: 10000
            }
          );
        }, { ...RETRY_OPTIONS, retries: 2 });

        // Respuesta: { codigoRespuesta: "CLOSED"|"PENDING"|..., detalleRespuesta, estados: [...], transacciones: {...} }
        const respuesta = response.data;
        const nuevoEstado = mapearEstadoVerificacion(respuesta.codigoRespuesta);

        // Solo loguear cuando el estado cambia (evitar spam en consola)
        if (nuevoEstado !== pago.estado) {
          console.log(`[QR][${QR_AMBIENTE}] Estado actualizado. ATC Ref: ${refParaConsulta} | ${pago.estado} → ${nuevoEstado}`);
        }

        if (nuevoEstado !== pago.estado) {
          await pool.execute(
            `UPDATE pagos SET estado = ?, updated_at = NOW() WHERE id = ?`,
            [nuevoEstado, pago.id]
          );
          pago.estado = nuevoEstado;

          if (nuevoEstado === 'approved') {
            try {
              await generarEntradas(pago, respuesta.transacciones);
            } catch (err) {
              console.error('[QR] Error al generar entradas en verificación:', err.message);
            }
          }
        }

        return res.json({
          success: true,
          ambiente: pago.ambiente || QR_AMBIENTE,
          data: {
            paymentId: pago.id,
            compraId: pago.compra_id,
            origenNumeroReferencia: pago.external_reference,
            atcReferencia: pago.atc_referencia,
            estado: pago.estado,
            estadoPasarela: respuesta.codigoRespuesta,
            detallePasarela: respuesta.detalleRespuesta,
            historialEstados: respuesta.estados || [],
            monto: pago.monto_total,
            createdAt: pago.created_at,
            updatedAt: pago.updated_at
          }
        });

      } catch (apiError) {
        // Degradación graceful: devolver último estado conocido
        console.warn('[QR] No se pudo consultar Redenlace, usando último estado conocido:', apiError.message);
      }
    }

    // Fallback: estado local
    return res.json({
      success: true,
      ambiente: pago.ambiente || QR_AMBIENTE,
      data: {
        paymentId: pago.id,
        compraId: pago.compra_id,
        origenNumeroReferencia: pago.external_reference,
        atcReferencia: pago.atc_referencia,
        estado: pago.estado,
        monto: pago.monto_total,
        createdAt: pago.created_at,
        updatedAt: pago.updated_at
      }
    });

  } catch (error) {
    console.error('[QR] Error al verificar estado:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al verificar el estado del pago',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────
// Función interna: generarEntradas
// Se ejecuta cuando la pasarela confirma el pago.
// Actualiza la compra a PAGO_REALIZADO y genera códigos de escaneo.
// ─────────────────────────────────────────────────────────────
const generarEntradas = async (pago, transacciones) => {
  if (!pago.compra_id) {
    console.warn(`[QR] Pago ${pago.id} sin compra_id. No se generan entradas.`);
    return;
  }

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    // Verificar que la compra existe y está pendiente o fue cancelada por error de timeout
    const [compras] = await connection.execute(
      `SELECT c.*, e.titulo AS evento_titulo, e.hora_inicio AS evento_fecha,
              e.descripcion AS evento_descripcion
       FROM compras c
       INNER JOIN eventos e ON c.evento_id = e.id
       WHERE c.id = ? AND (c.estado = 'PAGO_PENDIENTE' OR c.estado = 'CANCELADO')
       FOR UPDATE`,
      [pago.compra_id]
    );

    if (compras.length === 0) {
      console.warn(`[QR] Compra ${pago.compra_id} no encontrada o ya confirmada.`);
      await connection.rollback();
      connection.release();
      return;
    }

    const compra = compras[0];

    // El campo tipo_pago en la base de datos probablemente sea un ENUM('QR', 'EFECTIVO', etc)
    // No podemos guardar 'QR_BNB' porque da error de Data truncated.
    const tipoPago = 'QR';

    // 1. Marcar compra como PAGO_REALIZADO
    await connection.execute(
      `UPDATE compras
       SET estado = 'PAGO_REALIZADO',
           fecha_pago = NOW(),
           fecha_confirmacion = NOW(),
           tipo_pago = ?
       WHERE id = ?`,
      [tipoPago, compra.id]
    );

    // 2. Códigos de escaneo para asientos
    const [asientosCompra] = await connection.execute(
      `SELECT id FROM compras_asientos WHERE compra_id = ?`,
      [compra.id]
    );
    for (const asiento of asientosCompra) {
      const codigo = await generarCodigoEscaneo(connection);
      await connection.execute(
        `UPDATE compras_asientos SET estado = 'CONFIRMADO', codigo_escaneo = ? WHERE id = ?`,
        [codigo, asiento.id]
      );
    }

    // 3. Códigos de escaneo para mesas
    const [mesasCompra] = await connection.execute(
      `SELECT id FROM compras_mesas WHERE compra_id = ?`,
      [compra.id]
    );
    for (const mesa of mesasCompra) {
      const codigo = await generarCodigoEscaneo(connection);
      await connection.execute(
        `UPDATE compras_mesas SET estado = 'CONFIRMADO', codigo_escaneo = ? WHERE id = ?`,
        [codigo, mesa.id]
      );
    }

    // 4. Entradas generales (si no hay asientos ni mesas)
    if (asientosCompra.length === 0 && mesasCompra.length === 0) {
      const [areasPersonas] = await connection.execute(
        `SELECT cap.*, ar.nombre AS area_nombre
         FROM compras_areas_personas cap
         INNER JOIN areas_layout ar ON cap.area_id = ar.id
         WHERE cap.compra_id = ?`,
        [compra.id]
      );

      if (areasPersonas.length > 0) {
        // Zonas personas
        for (const ap of areasPersonas) {
          const cant = parseInt(ap.cantidad, 10) || 1;
          for (let i = 0; i < cant; i++) {
            const codigo = await generarCodigoEscaneo(connection);
            await connection.execute(
              `INSERT INTO compras_entradas_generales (compra_id, area_id, codigo_escaneo) VALUES (?, ?, ?)`,
              [compra.id, ap.area_id, codigo]
            );
          }
          await connection.execute(
            `UPDATE compras_areas_personas SET estado = 'CONFIRMADO' WHERE id = ?`,
            [ap.id]
          );
        }
      } else {
        // Evento general: tipos de precio
        const [detalle] = await connection.execute(
          `SELECT tipo_precio_id, cantidad FROM compras_detalle_general WHERE compra_id = ?`,
          [compra.id]
        );

        if (detalle.length > 0) {
          for (const d of detalle) {
            const cant = parseInt(d.cantidad, 10) || 1;
            for (let i = 0; i < cant; i++) {
              const codigo = await generarCodigoEscaneo(connection);
              await connection.execute(
                `INSERT INTO compras_entradas_generales (compra_id, tipo_precio_id, codigo_escaneo) VALUES (?, ?, ?)`,
                [compra.id, d.tipo_precio_id, codigo]
              );
            }
          }
        } else {
          // Cantidad simple
          const cantidad = compra.cantidad || 1;
          for (let i = 0; i < cantidad; i++) {
            const codigo = await generarCodigoEscaneo(connection);
            await connection.execute(
              `INSERT INTO compras_entradas_generales (compra_id, codigo_escaneo) VALUES (?, ?)`,
              [compra.id, codigo]
            );
          }
        }
      }
    }

    await connection.commit();
    connection.release();
    console.log(`[QR] ✅ Compra ${compra.id} confirmada como PAGO_REALIZADO`);

    // 5. Generar PDF del boleto de forma asíncrona
    setImmediate(async () => {
      try {
        const [asientosBoleto] = await pool.execute(
          `SELECT ca.*, a.numero_asiento, a.area_id, a.mesa_id,
                  m.numero_mesa, m.codigo_mesa, tp.nombre AS tipo_precio_nombre,
                  ar.nombre AS area_nombre, ca.codigo_escaneo
           FROM compras_asientos ca
           INNER JOIN asientos a ON ca.asiento_id = a.id
           LEFT JOIN mesas m ON a.mesa_id = m.id
           LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
           LEFT JOIN areas_layout ar ON a.area_id = ar.id
           WHERE ca.compra_id = ? AND ca.estado = 'CONFIRMADO'
           ORDER BY a.numero_asiento`,
          [compra.id]
        );
        const [mesasBoleto] = await pool.execute(
          `SELECT cm.*, m.numero_mesa, m.codigo_mesa, cm.codigo_escaneo,
                  ar.nombre AS area_nombre, tp.nombre AS tipo_precio_nombre
           FROM compras_mesas cm
           INNER JOIN mesas m ON cm.mesa_id = m.id
           LEFT JOIN areas_layout ar ON m.area_id = ar.id
           LEFT JOIN tipos_precio_evento tp ON m.tipo_precio_id = tp.id
           WHERE cm.compra_id = ? AND cm.estado = 'CONFIRMADO'`,
          [compra.id]
        );
        let entradasGenerales = [];
        if (asientosBoleto.length === 0 && mesasBoleto.length === 0) {
          const [egs] = await pool.execute(
            `SELECT eg.*, ar.nombre AS area_nombre,
                    tp.nombre AS tipo_precio_nombre, tp.precio AS tipo_precio_precio
             FROM compras_entradas_generales eg
             LEFT JOIN areas_layout ar ON eg.area_id = ar.id
             LEFT JOIN tipos_precio_evento tp ON eg.tipo_precio_id = tp.id
             WHERE eg.compra_id = ? ORDER BY eg.id`,
            [compra.id]
          );
          entradasGenerales = egs;
        }
        const pdfPath = await generarBoletoPDF(
          compra,
          { titulo: compra.evento_titulo, hora_inicio: compra.evento_fecha, descripcion: compra.evento_descripcion },
          asientosBoleto,
          mesasBoleto,
          entradasGenerales
        );
        console.log(`[QR] ✅ PDF del boleto generado para compra ${compra.id}`);

        // Enviar por correo
        if (compra.cliente_email) {
          try {
            const pdfPathCompleto = path.join(__dirname, '..', pdfPath.replace(/^\//, ''));
            const datosCompra = {
              tituloEvento: compra.evento_titulo,
              fechaEvento: compra.evento_fecha,
              cantidad: compra.cantidad,
              total: compra.total,
              codigoUnico: compra.codigo_unico
            };
            const emailResult = await enviarBoletoPorEmailService(
              compra.cliente_email,
              compra.cliente_nombre,
              pdfPathCompleto,
              datosCompra
            );
            if (emailResult.success) {
              console.log(`[QR] 📧 Boleto enviado por correo a ${compra.cliente_email}`);
            } else {
              console.error(`[QR] ⚠️ Error al enviar correo: ${emailResult.message}`);
            }
          } catch (emailErr) {
            console.error(`[QR] ❌ Excepción al intentar enviar correo:`, emailErr.message);
          }
        }
      } catch (pdfErr) {
        console.error(`[QR] ❌ Error al generar PDF para compra ${compra.id}:`, pdfErr.message);
      }
    });

  } catch (error) {
    await connection.rollback();
    connection.release();
    throw error;
  }
};

// Exportar constantes para uso en index.js
export { QR_EXPIRACION_MINUTOS, QR_AMBIENTE };
