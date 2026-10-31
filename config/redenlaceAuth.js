/**
 * redenlaceAuth.js
 * Módulo de autenticación OAuth 2.0 para Red Enlace Open Hub
 *
 * Nuevo esquema (desde Oct 2026):
 *   - POST /oauth/token  →  { access_token, token_type, expires_in }
 *   - Header en peticiones: Authorization: Bearer <access_token>
 *
 * Este módulo:
 *   1. Obtiene el token automáticamente cuando se necesita.
 *   2. Lo cachea hasta 60 segundos antes de que expire.
 *   3. Es seguro para uso concurrente (no genera peticiones duplicadas).
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

// URLs del servidor de tokens OAuth 2.0 (Open Hub de Red Enlace)
const TOKEN_URL = IS_PRODUCCION
  ? (process.env.QR_TOKEN_URL_PROD || 'https://openhub.redenlace.com.bo/oauth/token')
  : (process.env.QR_TOKEN_URL_TEST || 'https://openhubcert.redenlace.com.bo/oauth/token');

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

      console.log(`[RedEnlace OAuth] Solicitando token. Ambiente: ${QR_AMBIENTE} | URL: ${TOKEN_URL}`);

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

      const { access_token, expires_in, token_type } = response.data;

      if (!access_token) {
        throw new Error('[RedEnlace OAuth] La respuesta no contiene access_token');
      }

      // expires_in en segundos (típicamente 3600 = 1 hora)
      const expiresIn = typeof expires_in === 'number' ? expires_in : 3600;

      _cachedToken = {
        access_token,
        expires_at: Date.now() + expiresIn * 1000,
      };

      console.log(
        `[RedEnlace OAuth] ✅ Token obtenido. Tipo: ${token_type || 'Bearer'} | ` +
        `Expira en: ${Math.floor(expiresIn / 60)} min`
      );

      return access_token;

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

  if (QR_API_KEY) {
    headers['x-api-key'] = QR_API_KEY;
  }

  try {
    const token = await getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (err) {
    // Si OAuth falla pero tenemos x-api-key, usarlo como fallback transparente
    if (!QR_API_KEY) {
      throw err;
    }
    console.warn(`[RedEnlace Auth] Usando fallback x-api-key (${err.message})`);
  }

  return headers;
};

/**
 * Invalida el token cacheado (útil cuando la API devuelve 401).
 */
export const invalidateToken = () => {
  console.warn('[RedEnlace OAuth] Token invalidado por 401. Se solicitará uno nuevo en el próximo uso.');
  _cachedToken = null;
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
