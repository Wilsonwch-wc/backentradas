-- Script para eliminar la columna slug de la tabla eventos
-- Solo ejecutar si se creó la columna anteriormente y ya no se usa
-- Ejecutar en MySQL: mysql -u root -p entradas_db < eliminar_slug_column.sql

-- Eliminar el índice único si existe
ALTER TABLE eventos DROP INDEX idx_slug;

-- Eliminar el índice de búsqueda si existe
ALTER TABLE eventos DROP INDEX idx_slug_search;

-- Eliminar la columna slug
ALTER TABLE eventos DROP COLUMN slug;

-- Verificar que se eliminó correctamente
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'eventos' 
  AND COLUMN_NAME = 'slug';

