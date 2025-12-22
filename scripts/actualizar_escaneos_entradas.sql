-- Script para actualizar la tabla escaneos_entradas
-- Agregar soporte para entradas generales

USE entradas_db;

-- Verificar si la columna ya existe antes de agregarla
SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'entradas_db'
    AND TABLE_NAME = 'escaneos_entradas'
    AND COLUMN_NAME = 'compra_entrada_general_id'
);

-- Agregar columna solo si no existe
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE escaneos_entradas ADD COLUMN compra_entrada_general_id INT DEFAULT NULL',
  'SELECT "La columna compra_entrada_general_id ya existe" AS Mensaje'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verificar si el índice ya existe antes de crearlo
SET @idx_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = 'entradas_db'
    AND TABLE_NAME = 'escaneos_entradas'
    AND INDEX_NAME = 'idx_compra_entrada_general'
);

-- Crear índice solo si no existe
SET @sql_idx = IF(@idx_exists = 0,
  'CREATE INDEX idx_compra_entrada_general ON escaneos_entradas(compra_entrada_general_id)',
  'SELECT "El índice idx_compra_entrada_general ya existe" AS Mensaje'
);
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;

-- Nota: El tipo enum('ASIENTO','MESA') necesita ser modificado manualmente
-- MySQL no permite modificar directamente un ENUM sin recrear la tabla
-- Por ahora, el código manejará 'GENERAL' aunque el ENUM no lo incluya
-- Si necesitas que el ENUM incluya 'GENERAL', se debe recrear la tabla

-- Verificar que la columna se agregó
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'entradas_db' 
  AND TABLE_NAME = 'escaneos_entradas'
  AND COLUMN_NAME = 'compra_entrada_general_id';

SELECT 'Columna compra_entrada_general_id agregada exitosamente' AS Mensaje;

