# Información disponible de Google OAuth

## Campos que Google OAuth proporciona:

### Información Básica (siempre disponible):
- **email**: Correo electrónico del usuario
- **name**: Nombre completo del usuario
- **given_name**: Nombre (primer nombre)
- **family_name**: Apellido
- **picture**: URL de la foto de perfil
- **verified_email**: Boolean - indica si el email está verificado (Google siempre verifica)
- **locale**: Idioma y preferencias regionales (ej: "es", "es-ES")

### Información NO disponible:
- **phone_number**: ❌ NO está disponible en el perfil básico de Google OAuth
- **dirección**: ❌ NO está disponible
- **fecha de nacimiento**: ❌ NO está disponible (requiere permisos adicionales)

## Estructura de datos que recibirás de Google:

```json
{
  "id": "123456789",
  "email": "usuario@gmail.com",
  "verified_email": true,
  "name": "Juan Pérez",
  "given_name": "Juan",
  "family_name": "Pérez",
  "picture": "https://lh3.googleusercontent.com/...",
  "locale": "es"
}
```

## Notas importantes:

1. **Teléfono**: Google NO proporciona el número de teléfono en el perfil básico. Si necesitas el teléfono, tendrás que:
   - Pedirlo al usuario después del registro
   - O solicitar permisos adicionales (que requieren revisión de Google)

2. **Email verificado**: Los emails de Google siempre están verificados, así que `verified_email` será siempre `true`

3. **Foto de perfil**: La URL de la foto puede cambiar, considera guardarla localmente si la necesitas persistir

4. **Provider ID**: El `id` de Google es único y se debe guardar como `provider_id` para identificar usuarios de Google

## Implementación recomendada:

- Guardar `provider = 'google'` y `provider_id = id` de Google
- Guardar `email`, `name`, `given_name`, `family_name`, `picture`
- `password` será NULL para usuarios de Google
- `telefono` será NULL inicialmente, se puede completar después
- `email_verificado = true` para usuarios de Google

