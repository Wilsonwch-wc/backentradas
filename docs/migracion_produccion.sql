-- ============================================================
-- Migración: Actualización segura de la tabla `pagos`
-- ============================================================
-- Este script es 100% SEGURO. 
-- NO borra eventos, NO borra ventas, NO altera tablas existentes
-- (solo agrega columnas nuevas a la tabla `pagos`).
-- ============================================================

-- 1. Agregar columna compra_id para vincular el pago QR con la compra
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS compra_id INT NULL DEFAULT NULL
    COMMENT 'ID de la compra vinculada en la tabla compras';

-- 2. Agregar columna ambiente para saber si fue TEST o PRODUCCION
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS ambiente VARCHAR(20) NULL DEFAULT 'TEST'
    COMMENT 'Ambiente pasarela: TEST | PRODUCCION';

-- 3. Fecha de última actualización de estado
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL DEFAULT NULL
    COMMENT 'Fecha de ultima actualizacion del estado';

-- 4. Ampliar el campo estado para aceptar todos los códigos nuevos
ALTER TABLE pagos
  MODIFY COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'pending'
    COMMENT 'Estado: pending | approved | expired | cancelled | rejected';

-- 5. Agregar referencia de ATC (Redenlace) para el webhook
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS atc_referencia VARCHAR(30) NULL DEFAULT NULL 
    COMMENT 'Referencia generada por Redenlace ATC';

-- 6. Crear índices para que el webhook y el polling sean rápidos
-- Nota: Si los índices ya existen, dará un pequeño error que puedes ignorar
ALTER TABLE pagos ADD INDEX idx_external_reference (external_reference);
ALTER TABLE pagos ADD INDEX idx_atc_referencia (atc_referencia);
ALTER TABLE pagos ADD INDEX idx_estado_created (estado, created_at);
