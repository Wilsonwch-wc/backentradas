# 🧪 Prueba de Integración — Pasarela QR Redenlace ATC
**Fecha:** 2026-07-02  
**Ambiente:** TEST (Sandbox Redenlace)  
**Sistema:** PlusTiket — Backend Node.js + Frontend React (Vite)

---

## ✅ Resumen de Resultados

| Paso | Descripción | Resultado |
|------|-------------|-----------|
| 1 | Login como cliente vía API | ✅ Token JWT generado |
| 2 | Consulta de compra pendiente | ✅ Compra `#98` encontrada |
| 3 | Generación del QR de cobro | ✅ QR Base64 generado por Redenlace |
| 4 | Simulación del webhook de pago | ✅ Compra confirmada como `PAGO_REALIZADO` |
| 5 | Generación de entradas y PDF | ✅ Boleto generado automáticamente |

---

## 🔧 Entorno de Prueba

- **Backend:** `http://localhost:5000`
- **Frontend:** `http://localhost:3000`
- **Base de datos:** MySQL local — `entradas_db`
- **Ambiente QR:** `TEST`
- **URL Redenlace TEST:** `https://appcobranzacert.redenlace.com.bo/cobranza-0.0.1`

---

## 📋 Paso 1 — Login como cliente

### Petición
```
POST http://localhost:5000/api/clientes/login
Content-Type: application/json
```

```json
{
  "correo": "patricia31_382@liaok.lat",
  "password": "123123"
}
```

### Respuesta exitosa
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 33,
    "nombre": "usuario",
    "tipo": "cliente"
  }
}
```

> 📌 El token obtenido se usa como `Bearer Token` en todas las peticiones siguientes.

---

## 📋 Paso 2 — Consultar compras pendientes

### Petición
```
GET http://localhost:5000/api/compras/mis-compras
Authorization: Bearer <token>
```

### Respuesta
```json
{
  "success": true,
  "data": [
    {
      "id": 98,
      "codigo_unico": "ENT-1783000666390-0403",
      "evento_id": 57,
      "evento_titulo": "CORAZON SERRANO",
      "cliente_nombre": "usuario",
      "cliente_email": "patricia31_382@liaok.lat",
      "cantidad": 1,
      "total": "5.00",
      "estado": "PAGO_PENDIENTE",
      "tipo_venta": "NORMAL",
      "fecha_compra": "2026-07-02T13:57:46.000Z"
    }
  ]
}
```

> 📌 La compra `id: 98` del evento `CORAZON SERRANO` está en estado `PAGO_PENDIENTE` — lista para generar el QR.

---

## 📋 Paso 3 — Generar el QR de cobro

### Petición
```
POST http://localhost:5000/qr/generar
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "compra_id": 98,
  "eventoId": 57,
  "cantidad": 1,
  "total": 5.00,
  "descripcion": "CORAZON SERRANO"
}
```

### Respuesta de Redenlace (exitosa)
```json
{
  "success": true,
  "ambiente": "TEST",
  "data": {
    "paymentId": 5,
    "origenNumeroReferencia": 783000772,
    "atcReferencia": "11139820",
    "imagen": "iVBORw0KGgo...",
    "tiempoQr": "00:15:00",
    "moneda": "BOB",
    "monto": 5,
    "estadoPasarela": "PENDING",
    "status": "pending"
  },
  "message": "Código QR de pago generado exitosamente"
}
```

### Campos clave
| Campo | Valor | Descripción |
|-------|-------|-------------|
| `origenNumeroReferencia` | `783000772` | Referencia generada por **nuestro sistema** |
| `atcReferencia` | `11139820` | Referencia generada por **Redenlace ATC** (se usa en webhook y verificación) |
| `tiempoQr` | `00:15:00` | El QR tiene vigencia de 15 minutos |
| `imagen` | `iVBORw0...` | Imagen del QR en Base64 — el frontend la muestra con `data:image/png;base64,...` |

### Log en consola del backend
```
[QR][TEST] Generando QR. Ref: 783000772 | Monto: 5 BOB
[QR][TEST] QR generado. OrigenRef: 783000772 | ATC Ref: 11139820 | Estado: PENDING
```

---

## 📋 Paso 4 — Simular el webhook de pago aprobado

> Este paso simula lo que Redenlace hace automáticamente cuando el cliente paga con su app bancaria.

### Petición
```
POST http://localhost:5000/qr/confirmed
Content-Type: application/json
```
> ⚠️ **Sin Authorization** — el webhook es un endpoint público (Redenlace lo llama sin token JWT)

```json
{
  "numeroReferencia": "11139820",
  "estado": "00",
  "transacciones": {
    "banco": {
      "sigla": "BNB"
    }
  }
}
```

### Códigos de estado que envía Redenlace
| Código | Significado |
|--------|-------------|
| `"00"` | Pago **aprobado** ✅ |
| `"03"` | QR **expirado** |
| `"05"` | QR **inválido** |

### Respuesta exitosa del webhook
```json
{
  "numeroReferencia": "11139820",
  "codigoRespuesta": "00",
  "detalleRespuesta": null
}
```

### Log en consola del backend
```
[QR][TEST] Callback recibido. ATC Ref: 11139820 | Estado: 00
[QR] Pago 5 → estado: approved (código pasarela: 00)
[QR] ✅ Compra 98 confirmada como PAGO_REALIZADO
[QR] ✅ PDF del boleto generado para compra 98
```

---

## 📋 Paso 5 — Verificar resultado final

### Petición
```
GET http://localhost:5000/api/compras/mis-compras
Authorization: Bearer <token>
```

### Compra confirmada
```json
{
  "id": 98,
  "estado": "PAGO_REALIZADO",
  "tipo_pago": "QR_BNB",
  "fecha_pago": "2026-07-02T14:01:...",
  "fecha_confirmacion": "2026-07-02T14:01:..."
}
```

---

## 🎯 Flujo completo validado

```
Cliente compra en frontend
        ↓
POST /api/compras  →  Compra creada (PAGO_PENDIENTE)
        ↓
Frontend redirige a /pago-qr/:eventoId
        ↓
POST /qr/generar  →  QR Base64 generado por Redenlace
        ↓
Frontend muestra QR + countdown 15 min + polling cada 5s
        ↓
[Cliente escanea QR y paga con su app bancaria]
        ↓
POST /qr/confirmed  ←  Redenlace llama al webhook
        ↓
Backend actualiza: PAGO_PENDIENTE → PAGO_REALIZADO
        ↓
Backend genera códigos de escaneo de entradas
        ↓
Backend genera PDF del boleto (setImmediate asíncrono)
        ↓
Frontend detecta el cambio vía polling → pantalla verde ✅
        ↓
Cliente ve "¡Pago recibido!" y puede ir a Mis Compras
```

---

## 📝 Notas para producción

1. **Callback URL a registrar en Redenlace:** `https://plustiket.com/qr/confirmed`
2. **Cambiar en `.env` del servidor:**
   ```env
   QR_AMBIENTE=TEST          # Cambiar a PRODUCCION cuando tengan token real
   QR_EXPIRACION_MINUTOS=1440  # 24 horas para producción
   ```
3. **Ejecutar migración en el servidor:** `node docs/migrar_produccion.mjs`
4. **Solicitar a Redenlace:** Simulador web para pruebas en TEST o token de PRODUCCION

---

*Documento generado automáticamente — PlusTiket QR Integration Test 2026-07-02*
