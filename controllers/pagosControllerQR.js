/**
 * pagosControllerQR.js
 * Integración con API QR Simple v2.0 — Red Enlace Open Hub
 *
 * Comunicado oficial Red Enlace / Open Hub (plazo 31/10/2026):
 *  - Autenticación unificada OAuth 2.0
 *  - QR Simple pasa a v2.0 con URLs y campos nuevos (las versiones anteriores
 *    quedaron deprecadas)
 *
 * URLs v2 (Open Hub):
 *  TEST:  https://atcgwapitest.redenlace.com.bo/sandbox
 *  PROD:  https://api.redenlace.com.bo
 *
 * Endpoints v2:
 *  POST /qr/simple/v2/generate
 *  GET  /qr/simple/v2/verify/{numeroReferencia}
 *  POST /qr/simple/v2/cancel/{numeroReferencia}
 *  POST /qr/confirmed  ← nuestro callback (se registra en cada QR con "webhook")
 *
 * Request v2 (reemplaza al formato antiguo con PIPE en la glosa):
 *  numeroReferencia (string) · glosa (texto plano) · monto · moneda ·
 *  vigencia (segundos) · idEstablecimiento · nombreEstablecimiento · webhook {url, key, value}
 *
 * Checklist cubierto:
 *  ✅ Consumo API REST / JSON
 *  ✅ OAuth 2.0 Bearer Token en todas las peticiones
 *  ✅ Renovación automática de token (cache + retry en 401)
 *  ✅ Generar QR v2 con los campos nuevos (glosa plana + establecimiento + vigencia + webhook)
 *  ✅ Verificar estado v2
 *  ✅ Conversión Base64 → imagen QR
 *  ✅ Callback público /qr/confirmed (registrado en el propio QR)
 *  ✅ Recepción y respuesta del callback (codigoRespuesta 00/05)
 *  ✅ Manejo de estados v2 (PENDIENTE, PAGADO, CANCELADO, EXPIRADO, ERROR)
 *  ✅ Compatibilidad con los estados antiguos (00/03/05, SUCCESS, CLOSED, ...)
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
import { getAuthHeaders, invalidateToken } from '../config/redenlaceAuth.js';
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

// Base de la API QR Simple v2.0 (Open Hub).
// Si el .env del servidor no tiene las variables nuevas, se usan las URLs oficiales v2.
const QR_API_URL = (IS_PRODUCCION
  ? (process.env.QR_API_URL_V2_PROD || 'https://api.redenlace.com.bo')
  : (process.env.QR_API_URL_V2_TEST || 'https://atcgwapitest.redenlace.com.bo/sandbox')
).replace(/\/+$/, '');

// NOTA: la v2 usa solo OAuth 2.0. QR_API_KEY_* se conserva únicamente como fallback
// de transición dentro de config/redenlaceAuth.js.

// Rutas de la API QR Simple v2.0
const QR_PATH_GENERAR   = '/qr/simple/v2/generate';
const QR_PATH_VERIFICAR = '/qr/simple/v2/verify';
const QR_PATH_CANCELAR  = '/qr/simple/v2/cancel';

// Establecimiento registrado en Red Enlace (antes codigoSucursal / nombreSucursal)
const QR_ID_ESTABLECIMIENTO = process.env.QR_ID_ESTABLECIMIENTO || '461116';
const QR_NOMBRE_ESTABLECIMIENTO = process.env.QR_NOMBRE_ESTABLECIMIENTO || 'PLUSTIKET API QR';

// NOTA: QR_API_KEY_* conservado solo como fallback de transición; la v2 usa OAuth 2.0.
const QR_WEBHOOK_SECRET = process.env.QR_WEBHOOK_SECRET || null;

// URL pública HTTPS de nuestro callback. La pasarela la registra en cada QR y la
// llama cuando el cliente paga. Si no está configurada se arma con el host de la petición.
const QR_WEBHOOK_URL = (process.env.QR_WEBHOOK_URL || '').trim();

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
console.log(`🔐 Pasarela QR v2.0 inicializada. Ambiente: ${QR_AMBIENTE} | API: ${QR_API_URL} | Auth: OAuth 2.0`);
if (!QR_WEBHOOK_URL) {
  console.warn(
    '⚠️  [QR] QR_WEBHOOK_URL no configurada: se usará el host de cada petición. ' +
    'Configúrala en .env con la URL pública HTTPS de /qr/confirmed.'
  );
}

// ─────────────────────────────────────────────────────────────
// Mapeo de estados
// ─────────────────────────────────────────────────────────────

/**
 * Traduce el estado de la pasarela a nuestro estado local.
 * v2 (Open Hub) usa: PENDIENTE, PAGADO, CANCELADO, EXPIRADO, ERROR
 * v1 (legacy) usaba: 00/03/05 y SUCCESS, CLOSED, EXPIRED, CANCELLED, ERROR, NOTFOUND
 */
const mapearEstadoPasarela = (valor) => {
  const est = (valor ?? '').toString().trim().toUpperCase();
  if (['00', 'PAGADO', 'PAGADA', 'SUCCESS', 'CLOSED', 'APROBADO'].includes(est)) return 'approved';
  if (['03', 'EXPIRADO', 'EXPIRED'].includes(est)) return 'expired';
  if (['CANCELADO', 'CANCELLED'].includes(est)) return 'cancelled';
  if (['05', 'ERROR', 'NOTFOUND', 'RECHAZADO', 'RECHAZADA', 'INVALIDO', 'INVÁLIDO'].includes(est)) return 'rejected';
  return 'pending'; // PENDIENTE / PROCESANDO / INITIALIZE
};

/**
 * Genera un número de referencia único de máx 9 dígitos (la v2 exige dígitos y ≤ i32::MAX).
 * Usa los últimos 9 dígitos del timestamp en milisegundos para no repetir el número
 * cuando se generan dos QR dentro del mismo segundo.
 */
const generarNumeroReferencia = () => {
  return parseInt(Date.now().toString().slice(-9), 10);
};

/**
 * Glosa v2: texto plano visible para el pagador. Ya no se usa el formato antiguo
 * codSucursal|nombreSucursal|rubro|detalle (por eso el proveedor la rechazaba).
 */
const sanitizarGlosa = (texto) => {
  const limpio = (texto || 'Compra de entradas')
    .toString()
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpio.substring(0, 60) || 'Compra de entradas';
};

/**
 * El campo "qr" de la v2 puede venir como base64 puro o como data URI.
 * El frontend arma el src como data:image/png;base64,<imagen>, así que se deja solo el base64.
 */
const normalizarQrBase64 = (valor) => {
  if (!valor || typeof valor !== 'string') return null;
  return valor.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').trim() || null;
};

/**
 * Datos del webhook que la pasarela usa para notificar el pago (obligatorio en la v2).
 * Se prefiere QR_WEBHOOK_URL; si no está, se arma con el host público de la petición.
 */
const construirWebhook = (req) => {
  let url = QR_WEBHOOK_URL;
  if (!url) {
    const host = req.get('x-forwarded-host') || req.get('host');
    const proto = (req.get('x-forwarded-proto') || req.protocol || 'https')
      .split(',')[0]
      .trim();
    url = `${proto}://${host}/qr/confirmed`;
  }
  // key/value = header y secreto que la pasarela enviará de vuelta en cada notificación
  return { url, key: 'x-api-key', value: QR_WEBHOOK_SECRET || '' };
};

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
// Endpoint Redenlace v2: POST /qr/simple/v2/generate
// ─────────────────────────────────────────────────────────────
export const crearPagoQR = async (req, res) => {
  try {
    const {
      compra_id,
      eventoId,
      cantidad,
      total,
      descripcion
    } = req.body;

    const userId = req.user.id;

    if (!eventoId || !cantidad || !total) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: eventoId, cantidad, total'
      });
    }

    if (!QR_API_URL) {
      return res.status(503).json({
        success: false,
        message: `Pasarela QR no configurada para el ambiente ${QR_AMBIENTE}. Contacte al administrador.`
      });
    }

    // Referencia única nuestra (máx 9 dígitos, la v2 la recibe como string)
    const origenNumeroReferencia = generarNumeroReferencia();

    // Glosa v2: texto plano (sin el formato antiguo codSucursal|nombreSucursal|rubro|detalle)
    const glosa = sanitizarGlosa(descripcion);

    // Vigencia en segundos (la v2 reemplazó tiempoQr "HH:MM:SS" por vigencia)
    let vigenciaSegundos = QR_EXPIRACION_MINUTOS * 60;
    let tiempoQrFinal = QR_TIEMPO_VIGENCIA;
    if (compra_id) {
      const [compras] = await pool.execute('SELECT fecha_compra FROM compras WHERE id = ?', [compra_id]);
      if (compras.length > 0) {
        const fechaCompra = new Date(compras[0].fecha_compra);
        const diferenciaMs = Date.now() - fechaCompra.getTime();
        vigenciaSegundos = (QR_EXPIRACION_MINUTOS * 60) - Math.floor(diferenciaMs / 1000);

        if (vigenciaSegundos <= 0) {
          return res.status(400).json({
            success: false,
            message: 'El tiempo para pagar esta compra ha expirado. La compra será cancelada automáticamente.'
          });
        }

        const hh = String(Math.floor(vigenciaSegundos / 3600)).padStart(2, '0');
        const mm = String(Math.floor((vigenciaSegundos % 3600) / 60)).padStart(2, '0');
        const ss = String(vigenciaSegundos % 60).padStart(2, '0');
        tiempoQrFinal = `${hh}:${mm}:${ss}`;
      }
    }

    // Payload según especificación API QR Simple v2.0 (Open Hub)
    const idEstablecimientoNum = Number(QR_ID_ESTABLECIMIENTO);
    const pagoData = {
      numeroReferencia: origenNumeroReferencia.toString(),
      glosa,
      monto: parseFloat(parseFloat(total).toFixed(2)),
      moneda: 'BOB',
      vigencia: vigenciaSegundos,
      idEstablecimiento: Number.isFinite(idEstablecimientoNum) ? idEstablecimientoNum : QR_ID_ESTABLECIMIENTO,
      nombreEstablecimiento: QR_NOMBRE_ESTABLECIMIENTO,
      webhook: construirWebhook(req)
    };

    // Log con el payload exacto que se envía (sin exponer el secreto del webhook)
    const payloadParaLog = {
      ...pagoData,
      webhook: {
        url: pagoData.webhook.url,
        key: pagoData.webhook.key,
        value: pagoData.webhook.value ? '***' : ''
      }
    };
    console.log(`[QR][${QR_AMBIENTE}] QR v2 → POST ${QR_API_URL}${QR_PATH_GENERAR}`);
    console.log(`[QR][${QR_AMBIENTE}] QR v2 → payload: ${JSON.stringify(payloadParaLog)}`);

    // Llamada POST con reintentos — endpoint v2 de Open Hub (OAuth 2.0)
    let response;
    try {
      response = await retry(async () => {
        const headers = await getAuthHeaders();
        const r = await axios.post(
          `${QR_API_URL}${QR_PATH_GENERAR}`,
          pagoData,
          { headers, timeout: 15000 }
        );
        return r;
      }, RETRY_OPTIONS);
    } catch (apiError) {
      // Si fue un 401, invalidar el token y reintentar una vez más
      if (apiError.response?.status === 401) {
        invalidateToken();
        try {
          const headers = await getAuthHeaders();
          response = await axios.post(
            `${QR_API_URL}${QR_PATH_GENERAR}`,
            pagoData,
            { headers, timeout: 15000 }
          );
        } catch (retryError) {
          console.error('[QR] Error tras renovar token:', retryError.response?.data || retryError.message);
          return res.status(502).json({
            success: false,
            message: 'No se pudo autenticar con la pasarela de pagos.',
            error: retryError.response?.data || retryError.message
          });
        }
      } else {
        console.error('[QR] Error al llamar a Redenlace:', apiError.response?.data || apiError.message);
        return res.status(502).json({
          success: false,
          message: 'No se pudo conectar con la pasarela de pagos. Intente nuevamente.',
          error: apiError.response?.data || apiError.message
        });
      }
    }

    // Respuesta v2:
    // { numeroReferencia (ATC), numeroReferenciaOriginante (nuestra), estado: "PENDIENTE",
    //   qr: "base64...", monto, moneda, fechaExpiracion }
    const respuesta = response.data || {};
    const atcReferencia = (respuesta.numeroReferencia ?? respuesta.numeroReferenciaOriginante ?? null)?.toString() || null;
    const imagen = normalizarQrBase64(respuesta.qr || respuesta.imagen);

    if (!imagen) {
      console.error('[QR] Redenlace no devolvió imagen Base64:', respuesta);
      return res.status(502).json({
        success: false,
        message: 'La pasarela no devolvió una imagen QR válida.',
        detalle: respuesta
      });
    }

    const estadoPasarela = respuesta.estado || respuesta.codigoRespuesta || 'PENDIENTE';

    console.log(
      `[QR][${QR_AMBIENTE}] QR v2 ← respuesta: numeroReferencia=${atcReferencia} | ` +
      `originante=${respuesta.numeroReferenciaOriginante ?? '-'} | estado=${estadoPasarela} | ` +
      `qr=${imagen ? `${Math.round(imagen.length / 1024)}KB base64` : 'ausente'} | ` +
      `monto=${respuesta.monto ?? pagoData.monto} ${respuesta.moneda || 'BOB'}`
    );

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
        estadoPasarela, // v2: PENDIENTE
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
        console.warn(
          `[QR] Webhook rechazado: firma inválida (headers recibidos: ${Object.keys(req.headers).join(', ')})`
        );
        return res.status(401).json(
          respuestaError(req.body?.numeroReferencia, 'Firma inválida')
        );
      }
    }

    // Campos del callback:
    //  v2: { numeroReferencia, numeroReferenciaOriginante, estado: "PAGADO"|"PENDIENTE"|...,
    //        monto|importe, moneda, codigoRespuesta, detalleRespuesta|mensaje, clienteOrigen, bancoOrigen }
    //  v1: { numeroReferencia, estado: "00"|"03"|"05", transacciones: {...} }
    const {
      numeroReferencia,
      numeroReferenciaOriginante,
      estado,
      codigoRespuesta,
      transacciones,
      detalleRespuesta,
      mensaje
    } = req.body;

    // La pasarela puede mandar el resultado en "estado" o en "codigoRespuesta"
    const codigo = codigoRespuesta ?? estado;

    if ((!numeroReferencia && !numeroReferenciaOriginante) || codigo === undefined || codigo === null) {
      return res.status(400).json(
        respuestaError(numeroReferencia || numeroReferenciaOriginante, 'Faltan parámetros: numeroReferencia, estado/codigoRespuesta')
      );
    }

    console.log(
      `[QR][${QR_AMBIENTE}] Callback recibido. Ref: ${numeroReferencia} | Originante: ${numeroReferenciaOriginante || '-'} | ` +
      `Estado: ${codigo}${detalleRespuesta || mensaje ? ` (${detalleRespuesta || mensaje})` : ''}`
    );

    // Buscar el pago por cualquiera de las dos referencias (ATC u originante/nuestra)
    const candidatas = [numeroReferencia, numeroReferenciaOriginante]
      .filter((r) => r !== undefined && r !== null && r !== '')
      .map((r) => r.toString());

    let pago = null;
    for (const ref of candidatas) {
      const [porAtc] = await pool.execute(
        `SELECT * FROM pagos WHERE atc_referencia = ? LIMIT 1`,
        [ref]
      );
      if (porAtc.length > 0) { pago = porAtc[0]; break; }

      const [porExterna] = await pool.execute(
        `SELECT * FROM pagos WHERE external_reference = ? LIMIT 1`,
        [ref]
      );
      if (porExterna.length > 0) { pago = porExterna[0]; break; }
    }

    if (!pago) {
      console.warn(`[QR] Pago no encontrado. Ref: ${candidatas.join(' / ')}`);
      return res.status(404).json(
        respuestaError(numeroReferencia || numeroReferenciaOriginante, 'Número de referencia no encontrado')
      );
    }

    // Mapear estado del callback (v2: PAGADO/PENDIENTE/... · v1: 00/03/05)
    const nuevoEstado = mapearEstadoPasarela(codigo);

    await pool.execute(
      `UPDATE pagos SET estado = ?, updated_at = NOW() WHERE id = ?`,
      [nuevoEstado, pago.id]
    );

    console.log(`[QR] Pago ${pago.id} → estado: ${nuevoEstado} (estado pasarela: ${codigo})`);

    // Si se aprobó y aún no estaba procesado → generar entradas
    if (nuevoEstado === 'approved' && pago.estado !== 'approved') {
      try {
        await generarEntradas(pago, transacciones);
      } catch (entradaError) {
        console.error(`[QR] Error al generar entradas para pago ${pago.id}:`, entradaError.message);
      }
    }

    // Respuesta obligatoria para Redenlace (se responde con NUESTRA referencia originante si vino)
    return res.status(200).json({
      numeroReferencia: (numeroReferenciaOriginante || numeroReferencia).toString(),
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
// Endpoint Redenlace v2: GET /qr/simple/v2/verify/{numeroReferencia}
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

    // Consultar estado real en Redenlace. Se prueba primero la referencia ATC y, si la
    // pasarela no la encuentra, la nuestra: la v2 devuelve numeroReferencia (ATC) y
    // numeroReferenciaOriginante (nuestra), así que cubrimos ambas nomenclaturas.
    const refsParaConsultar = [...new Set(
      [pago.atc_referencia, pago.external_reference]
        .filter((r) => r !== null && r !== undefined && r !== '')
        .map(String)
    )];

    if (QR_API_URL && refsParaConsultar.length > 0) {
      try {
        let response = null;
        let refParaConsulta = refsParaConsultar[0];
        let ultimoErrorConsulta = null;

        for (const ref of refsParaConsultar) {
          try {
            response = await retry(async () => {
              const headers = await getAuthHeaders();
              return await axios.get(
                `${QR_API_URL}${QR_PATH_VERIFICAR}/${ref}`,
                { headers, timeout: 10000 }
              );
            }, {
              ...RETRY_OPTIONS,
              retries: 2,
              // 4xx no se reintenta: si no existe con esa referencia, se prueba la otra
              bail: (e) => Boolean(e.response && e.response.status >= 400 && e.response.status < 500)
            });
            refParaConsulta = ref;
            break;
          } catch (consultaError) {
            ultimoErrorConsulta = consultaError;
            const codigo = consultaError.response?.data?.errors?.[0]?.code;
            const noEncontrada = consultaError.response?.status === 404 || codigo === 'TRANSACCION_NO_ENCONTRADA';
            if (!noEncontrada) throw consultaError;
            console.warn(`[QR] Referencia ${ref} no encontrada en la pasarela; probando la otra...`);
          }
        }

        if (!response) throw ultimoErrorConsulta;

        // Respuesta v2: { numeroReferencia, estado: "PENDIENTE"|"PAGADO"|...,
        //                 mensaje, importe|monto, moneda, clienteOrigen, bancoOrigen }
        // (compatibilidad con v1: codigoRespuesta + transacciones)
        const respuesta = response.data || {};
        const estadoBruto = respuesta.estado || respuesta.codigoRespuesta;
        const detalleBruto = respuesta.mensaje || respuesta.detalleRespuesta || null;
        const nuevoEstado = mapearEstadoPasarela(estadoBruto);

        // Solo loguear cuando el estado cambia (evitar spam en consola)
        if (nuevoEstado !== pago.estado) {
          console.log(`[QR][${QR_AMBIENTE}] Estado actualizado. Ref: ${refParaConsulta} | ${pago.estado} → ${nuevoEstado} (pasarela: ${estadoBruto})`);
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
            estadoPasarela: estadoBruto,
            detallePasarela: detalleBruto,
            historialEstados: respuesta.historialEstados || respuesta.estados || [],
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

    // Distinguir la pasarela de pagos automática (PASARELA_QR) del QR manual verificado por admin (QR)
    const tipoPago = 'PASARELA_QR';

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

    // 3. Códigos de escaneo para mesas (y boletos virtuales por silla)
    const [mesasCompra] = await connection.execute(
      `SELECT cm.id, cm.precio_total, m.capacidad_sillas, m.codigo_mesa, m.numero_mesa
       FROM compras_mesas cm
       INNER JOIN mesas m ON cm.mesa_id = m.id
       WHERE cm.compra_id = ?`,
      [compra.id]
    );
    for (const mesa of mesasCompra) {
      const cantSillas = parseInt(mesa.capacidad_sillas) || 10;
      const precioUnitario = mesa.precio_total ? (parseFloat(mesa.precio_total) / cantSillas) : 0;
      
      console.log(`[QR] 🪑 Mesa ${mesa.codigo_mesa || mesa.numero_mesa}: generando ${cantSillas} boletos virtuales a Bs.${precioUnitario} c/u`);

      for (let s = 1; s <= cantSillas; s++) {
        const codSilla = await generarCodigoEscaneo(connection);
        await connection.execute(
          `INSERT INTO compras_asientos (compra_id, asiento_id, precio, estado, codigo_escaneo)
           VALUES (?, NULL, ?, 'CONFIRMADO', ?)`,
          [compra.id, precioUnitario, codSilla]
        );
      }

      const codigo = await generarCodigoEscaneo(connection);
      await connection.execute(
        `UPDATE compras_mesas SET estado = 'CONFIRMADO', codigo_escaneo = ? WHERE id = ?`,
        [codigo, mesa.id]
      );
    }

    // 4. Entradas generales (zonas de pie, sin importar si hay mesas/asientos)
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
    } else if (asientosCompra.length === 0 && mesasCompra.length === 0) {
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
          `SELECT cm.*, m.numero_mesa, m.codigo_mesa, m.capacidad_sillas, cm.codigo_escaneo,
                  ar.nombre AS area_nombre, tp.nombre AS tipo_precio_nombre
           FROM compras_mesas cm
           INNER JOIN mesas m ON cm.mesa_id = m.id
           LEFT JOIN areas_layout ar ON m.area_id = ar.id
           LEFT JOIN tipos_precio_evento tp ON m.tipo_precio_id = tp.id
           WHERE cm.compra_id = ? AND cm.estado = 'CONFIRMADO'`,
          [compra.id]
        );
        let entradasGenerales = [];
        const [egs] = await pool.execute(
          `SELECT eg.*, ar.nombre AS area_nombre, cap.precio_unitario AS area_precio,
                  tp.nombre AS tipo_precio_nombre, tp.precio AS tipo_precio_precio
           FROM compras_entradas_generales eg
           LEFT JOIN areas_layout ar ON eg.area_id = ar.id
           LEFT JOIN compras_areas_personas cap ON cap.compra_id = eg.compra_id AND cap.area_id = eg.area_id
           LEFT JOIN tipos_precio_evento tp ON eg.tipo_precio_id = tp.id
           WHERE eg.compra_id = ? ORDER BY eg.id`,
          [compra.id]
        );
        entradasGenerales = egs;
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
