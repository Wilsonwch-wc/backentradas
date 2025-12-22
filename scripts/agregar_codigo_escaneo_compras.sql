-- Script para agregar el campo codigo_escaneo a la tabla compras
-- Esto permite que eventos generales tengan código de escaneo

USE entradas_db;

-- Verificar si la columna ya existe
SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'entradas_db'
    AND TABLE_NAME = 'compras'
    AND COLUMN_NAME = 'codigo_escaneo'
);

-- Agregar columna solo si no existe
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE compras 
   ADD COLUMN codigo_escaneo VARCHAR(5) UNIQUE NULL,
   ADD INDEX idx_codigo_escaneo (codigo_escaneo)',
  'SELECT "La columna codigo_escaneo ya existe en la tabla compras" AS mensaje'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verificar que la columna se agregó correctamente
SELECT 
  COLUMN_NAME,
  DATA_TYPE,
  CHARACTER_MAXIMUM_LENGTH,
  IS_NULLABLE,
  COLUMN_KEY
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'entradas_db' 
  AND TABLE_NAME = 'compras' 
  AND COLUMN_NAME = 'codigo_escaneo';

