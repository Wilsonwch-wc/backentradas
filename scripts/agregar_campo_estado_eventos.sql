-- Script para agregar campo estado a la tabla eventos
-- Estados posibles: 'activo', 'proximamente', 'finalizado'

-- Verificar si la columna ya existe antes de agregarla
SET @col_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'eventos' 
    AND COLUMN_NAME = 'estado'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE eventos ADD COLUMN estado VARCHAR(20) DEFAULT "activo" AFTER tipo_evento',
  'SELECT "La columna estado ya existe" AS mensaje'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Actualizar eventos pasados a 'finalizado'
UPDATE eventos 
SET estado = 'finalizado' 
WHERE hora_inicio < NOW() AND estado IS NULL;

-- Actualizar eventos futuros a 'activo' si no tienen estado
UPDATE eventos 
SET estado = 'activo' 
WHERE hora_inicio >= NOW() AND estado IS NULL;

