-- ============================================================
-- Migración: Actualizar tabla `pagos` para cumplir requisitos
-- de la pasarela de cobro QR
-- ============================================================
-- Ejecutar este script UNA SOLA VEZ en la base de datos.
-- ============================================================

-- 1. Agregar columna compra_id para vincular el pago QR con la compra
--    Permite que el webhook encuentre la compra y la confirme automáticamente
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS compra_id INT NULL DEFAULT NULL
    COMMENT 'ID de la compra en tabla compras vinculada a este pago QR';

-- 2. Agregar columna ambiente para saber si el pago se realizó en TEST o PRODUCCION
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS ambiente VARCHAR(20) NULL DEFAULT 'TEST'
    COMMENT 'Ambiente de la pasarela: TEST | PRODUCCION';

-- 3. Agregar columna updated_at si no existe
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL DEFAULT NULL
    COMMENT 'Fecha de última actualización del estado';

-- 4. Ampliar los valores del campo estado para incluir todos los estados del Req 9
--    PENDING, SUCCESS(approved), CLOSED, EXPIRED, CANCELLED, ERROR, NOTFOUND(rejected)
ALTER TABLE pagos
  MODIFY COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'pending'
    COMMENT 'Estado: pending | approved | expired | cancelled | rejected';

-- 5. Índice para búsqueda rápida por external_reference (numeroReferencia)
ALTER TABLE pagos
  ADD INDEX IF NOT EXISTS idx_external_reference (external_reference);

-- 6. Índice para el cron de expiración
ALTER TABLE pagos
  ADD INDEX IF NOT EXISTS idx_estado_created (estado, created_at);

-- Verificar resultado
SELECT 
  COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'pagos'
ORDER BY ORDINAL_POSITION;
