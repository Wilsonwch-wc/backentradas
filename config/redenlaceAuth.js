/**
 * redenlaceAuth.js
 * Módulo de autenticación OAuth 2.0 para Red Enlace Open Hub
 *
 * Esquema desde el 31/10/2026 (comunicado oficial):
 *   - Autenticación unificada OAuth 2.0 (Access Token)
 *   - Gateway v2: POST {base}/oauth-client-credentials/access-token?grant_type=client_credentials
 *     con Authorization: Basic base64(client_id:client_secret) y sin cuerpo.
 *   - Portal Open Hub (esquema anterior): POST /oauth/token con client_credentials en el formulario.
 *   - Header en peticiones: Authorization: Bearer <token> + access_token + client_id
 *
 * Este módulo:
 *   1. Obtiene el token automáticamente cuando se necesita (gateway v2 y, si falla, portal).
 *   2. Lo cachea hasta 60 segundos antes de que expire.
 *   3. Es seguro para uso concurrente (no genera peticiones duplicadas).
 *   4. QR_AUTH_MODE=auto|gateway|portal permite forzar el esquema.
 */

import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

// ─────────────────────────────────────────────────────────────
// Configuración de ambientes
// ─────────────────────────────────────────────────────────────
const QR_AMBIENTE = (process.env.QR_AMBIENTE || 'TEST').toUpperCase();
const IS_PRODUCCION = QR_AMBIENTE === 'PRODUCCION' || QR_AMBIENTE === 'PROD';

// URLs del servidor de tokens OAuth 2.0 (portal Open Hub)
const TOKEN_URL = IS_PRODUCCION
  ? (process.env.QR_TOKEN_URL_PROD || 'https://openhub.redenlace.com.bo/oauth/token')
  : (process.env.QR_TOKEN_URL_TEST || 'https://openhubcert.redenlace.com.bo/oauth/token');

// Base del gateway v2 (la misma que usa pagosControllerQR.js)
const QR_API_V2_URL = (IS_PRODUCCION
  ? (process.env.QR_API_URL_V2_PROD || 'https://api.redenlace.com.bo')
  : (process.env.QR_API_URL_V2_TEST || 'https://atcgwapitest.redenlace.com.bo/sandbox')
).replace(/\/+$/, '');

// Token del gateway v2: Basic auth (client_id:client_secret) y grant_type en la query
const GATEWAY_TOKEN_URL = `${QR_API_V2_URL}/oauth-client-credentials/access-token?grant_type=client_credentials`;

// auto = intenta gateway v2 y, si falla, el portal Open Hub
const AUTH_MODE = (process.env.QR_AUTH_MODE || 'auto').toLowerCase();

// Credenciales OAuth 2.0 (Client Credentials Flow)
const CLIENT_ID = IS_PRODUCCION
  ? process.env.QR_CLIENT_ID_PROD
  : process.env.QR_CLIENT_ID_TEST;

const CLIENT_SECRET = IS_PRODUCCION
  ? process.env.QR_CLIENT_SECRET_PROD
  : process.env.QR_CLIENT_SECRET_TEST;

// ─────────────────────────────────────────────────────────────
// Cache del token (en memoria — válido mientras el proceso vive)
// ─────────────────────────────────────────────────────────────
let _cachedToken = null;       // { access_token, expires_at }
let _pendingRequest = null;    // Promise en vuelo para evitar peticiones paralelas
let _lastOAuthError = null;    // Cache del error para no saturar en polling
let _lastOAuthErrorTime = 0;
let _metodoToken = AUTH_MODE === 'gateway' || AUTH_MODE === 'portal' ? AUTH_MODE : null;

/**
 * Normaliza la respuesta del token: el gateway y el portal usan nombres distintos.
 */
const normalizarToken = (data) => {
  const access_token = data?.access_token || data?.accessToken || data?.token;
  const expiresInRaw = data?.expires_in ?? data?.expiresIn ?? 3600;
  const expiresIn = Number(expiresInRaw) > 0 ? Number(expiresInRaw) : 3600;

  if (!access_token) {
    throw new Error('[RedEnlace OAuth] La respuesta no contiene access_token');
  }
  return {
    access_token,
    expiresIn,
    token_type: data?.token_type || data?.tokenType || 'Bearer'
  };
};

/**
 * Token del gateway v2 de Open Hub (Basic auth + grant_type en query).
 */
const solicitarTokenGateway = async () => {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const response = await axios.post(GATEWAY_TOKEN_URL, null, {
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    timeout: 10_000
  });
  return normalizarToken(response.data);
};

/**
 * Token del portal Open Hub (client_credentials en el cuerpo del formulario).
 */
const solicitarTokenPortal = async () => {
  const response = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10_000,
    }
  );
  return normalizarToken(response.data);
};

/**
 * Obtiene un Access Token válido para Red Enlace.
 * Si el token cacheado sigue vigente, lo devuelve directamente.
 * Si expiró o no existe, solicita uno nuevo.
 *
 * @returns {Promise<string>} El access_token listo para usar en Authorization.
 */
export const getAccessToken = async () => {
  // Token válido con margen de 60s antes del vencimiento
  if (_cachedToken && _cachedToken.expires_at > Date.now() + 60_000) {
    return _cachedToken.access_token;
  }

  // Si hubo un error reciente (DNS/red/timeout), no repetir en cada segundo de polling
  if (_lastOAuthError && Date.now() - _lastOAuthErrorTime < 5 * 60 * 1000) {
    throw _lastOAuthError;
  }

  // Si ya hay una solicitud en vuelo, esperar que termine (evita tokens duplicados)
  if (_pendingRequest) {
    return _pendingRequest;
  }

  _pendingRequest = (async () => {
    try {
      if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error(
          `[RedEnlace OAuth] Credenciales no configuradas para ambiente ${QR_AMBIENTE}. ` +
          `Configura QR_CLIENT_ID_${IS_PRODUCCION ? 'PROD' : 'TEST'} y ` +
          `QR_CLIENT_SECRET_${IS_PRODUCCION ? 'PROD' : 'TEST'} en .env`
        );
      }

      // Orden de intentos: primero el que ya funcionó (si se sabe), luego el resto
      const intentos = [];
      if (AUTH_MODE !== 'portal' && _metodoToken !== 'portal') intentos.push(['gateway', solicitarTokenGateway]);
      if (AUTH_MODE !== 'gateway' && _metodoToken !== 'gateway') intentos.push(['portal', solicitarTokenPortal]);
      if (intentos.length === 0) intentos.push(['gateway', solicitarTokenGateway]);

      let token = null;
      let metodo = null;
      let ultimoError = null;

      for (const [nombre, solicitar] of intentos) {
        try {
          console.log(`[RedEnlace OAuth] Solicitando token (${nombre}). Ambiente: ${QR_AMBIENTE}`);
          token = await solicitar();
          metodo = nombre;
          break;
        } catch (err) {
          ultimoError = err;
          const detalle = err.response?.status ? `HTTP ${err.response.status}` : err.message;
          console.warn(`[RedEnlace OAuth] Token vía ${nombre} falló (${detalle})`);
        }
      }

      if (!token) {
        throw ultimoError || new Error('[RedEnlace OAuth] No se pudo obtener el token');
      }

      _metodoToken = metodo;
      _cachedToken = {
        access_token: token.access_token,
        expires_at: Date.now() + token.expiresIn * 1000,
      };

      _lastOAuthError = null;
      _lastOAuthErrorTime = 0;

      console.log(
        `[RedEnlace OAuth] ✅ Token obtenido vía ${metodo}. Tipo: ${token.token_type} | ` +
        `Expira en: ${Math.floor(token.expiresIn / 60)} min`
      );

      return token.access_token;

    } catch (err) {
      _lastOAuthError = err;
      _lastOAuthErrorTime = Date.now();
      throw err;
    } finally {
      _pendingRequest = null;
    }
  })();

  return _pendingRequest;
};

const QR_API_KEY = IS_PRODUCCION
  ? process.env.QR_API_KEY_PROD
  : process.env.QR_API_KEY_TEST;

/**
 * Retorna headers completos con Bearer Token (OAuth 2.0) o fallback x-api-key para usar en axios.
 *
 * @param {Object} extraHeaders - Headers adicionales a mezclar.
 * @returns {Promise<Object>}
 */
export const getAuthHeaders = async (extraHeaders = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  try {
    const token = await getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      // El gateway de Open Hub v2 valida también el token y el client_id en estos headers
      headers['access_token'] = token;
      if (CLIENT_ID) headers['client_id'] = CLIENT_ID;
      return headers;
    }
  } catch (err) {
    // Si OAuth falla pero tenemos x-api-key, usarlo como fallback transparente
    if (!QR_API_KEY) {
      throw err;
    }
    console.warn(`[RedEnlace Auth] Usando fallback x-api-key (${err.message})`);
  }

  // Fallback legacy: solo cuando no hay token OAuth (la v2 usa únicamente OAuth)
  if (QR_API_KEY) {
    headers['x-api-key'] = QR_API_KEY;
  }

  return headers;
};

/**
 * Invalida el token cacheado (útil cuando la API devuelve 401).
 */
export const invalidateToken = () => {
  console.warn('[RedEnlace OAuth] Token invalidado por 401. Se solicitará uno nuevo en el próximo uso.');
  _cachedToken = null;
  _lastOAuthError = null;
  _lastOAuthErrorTime = 0;
  // Un 401 puede significar que el método de token dejó de servir: probar ambos de nuevo
  if (AUTH_MODE === 'auto') _metodoToken = null;
};

/**
 * Retorna el estado actual del token para diagnóstico.
 */
export const getTokenStatus = () => {
  if (!_cachedToken) return { estado: 'sin_token', ambiente: QR_AMBIENTE };
  const segundosRestantes = Math.floor((_cachedToken.expires_at - Date.now()) / 1000);
  return {
    estado: segundosRestantes > 0 ? 'activo' : 'expirado',
    segundosRestantes,
    ambiente: QR_AMBIENTE,
  };
};
