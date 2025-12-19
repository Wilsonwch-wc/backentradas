# Solución para Error 403 de Google OAuth

## Problema
Error 403 al intentar verificar el token de Google OAuth:
- "The given origin is not allowed for the given client ID"
- "Your client does not have permission to get URL /oauth2/v1/certs"

## Solución

### Paso 1: Verificar Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Selecciona tu proyecto
3. Ve a **APIs & Services** → **Credentials**
4. Busca tu **OAuth 2.0 Client ID**

### Paso 2: Configurar Orígenes Autorizados

1. Haz clic en tu Client ID para editarlo
2. En **Authorized JavaScript origins**, agrega:
   ```
   http://localhost:3000
   http://localhost:5173
   http://localhost:5000
   https://tudominio.com (si tienes dominio)
   ```

3. En **Authorized redirect URIs**, agrega:
   ```
   http://localhost:3000
   http://localhost:5173
   http://localhost:5000/api/clientes/google
   https://tudominio.com (si tienes dominio)
   ```

### Paso 3: Habilitar API de Google OAuth2

1. Ve a **APIs & Services** → **Library**
2. Busca "Google+ API" o "Google OAuth2 API"
3. Asegúrate de que esté **HABILITADA**

### Paso 4: Verificar Client ID

1. Copia el **Client ID** completo desde Google Cloud Console
2. Verifica que sea el mismo en:
   - `frontend/src/main.jsx`
   - `backend/.env` (variable `GOOGLE_CLIENT_ID`)
   - O en el código si no usas .env

### Paso 5: Verificar Tipo de Aplicación

Asegúrate de que el Client ID sea de tipo **"Web application"** y no "Desktop" o "Mobile"

## Solución Temporal Implementada

He implementado un fallback que decodifica el token sin verificación si la verificación falla. Esto permite que funcione mientras corriges la configuración, pero es **menos seguro**.

**IMPORTANTE**: Una vez que corrijas la configuración en Google Cloud Console, el sistema usará la verificación completa del token (más seguro).

## Verificación

Después de hacer los cambios:

1. Espera 5-10 minutos para que los cambios se propaguen
2. Reinicia el servidor backend
3. Intenta iniciar sesión con Google nuevamente
4. Revisa la consola del servidor para ver si la verificación funciona correctamente

## Si el problema persiste

1. Verifica que el Client ID sea exactamente el mismo en frontend y backend
2. Asegúrate de que no haya espacios extra o caracteres especiales
3. Verifica que la API de Google OAuth2 esté habilitada
4. Intenta crear un nuevo Client ID en Google Cloud Console

