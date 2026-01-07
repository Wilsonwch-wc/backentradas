-- Script para agregar campos de verificación de email a la tabla clientes
-- Campos: codigo_verificacion, codigo_verificacion_expira, email_verificado

-- Verificar y agregar codigo_verificacion
SET @col_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'clientes' 
    AND COLUMN_NAME = 'codigo_verificacion'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE clientes ADD COLUMN codigo_verificacion VARCHAR(4) NULL AFTER password',
  'SELECT "La columna codigo_verificacion ya existe" AS mensaje'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verificar y agregar codigo_verificacion_expira
SET @col_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'clientes' 
    AND COLUMN_NAME = 'codigo_verificacion_expira'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE clientes ADD COLUMN codigo_verificacion_expira DATETIME NULL AFTER codigo_verificacion',
  'SELECT "La columna codigo_verificacion_expira ya existe" AS mensaje'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verificar y agregar email_verificado (si no existe)
SET @col_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'clientes' 
    AND COLUMN_NAME = 'email_verificado'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE clientes ADD COLUMN email_verificado BOOLEAN DEFAULT FALSE AFTER codigo_verificacion_expira',
  'SELECT "La columna email_verificado ya existe" AS mensaje'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Actualizar usuarios existentes de Google como verificados (ya que Google verifica emails)
UPDATE clientes 
SET email_verificado = TRUE 
WHERE provider = 'google' AND (email_verificado IS NULL OR email_verificado = FALSE);

-- Actualizar usuarios locales existentes como verificados (para no afectar usuarios actuales)
UPDATE clientes 
SET email_verificado = TRUE 
WHERE provider = 'local' AND (email_verificado IS NULL OR email_verificado = FALSE);

