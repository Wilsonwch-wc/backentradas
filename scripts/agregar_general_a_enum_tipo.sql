-- Script para agregar 'GENERAL' al ENUM de la columna tipo en escaneos_entradas
-- MySQL requiere modificar el ENUM usando ALTER TABLE

USE entradas_db;

-- Modificar el ENUM para incluir 'GENERAL'
ALTER TABLE escaneos_entradas 
MODIFY COLUMN tipo ENUM('ASIENTO','MESA','GENERAL') NOT NULL;

-- Verificar el cambio
SELECT COLUMN_NAME, COLUMN_TYPE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'entradas_db' 
  AND TABLE_NAME = 'escaneos_entradas' 
  AND COLUMN_NAME = 'tipo';

SELECT 'ENUM actualizado exitosamente. Ahora acepta: ASIENTO, MESA, GENERAL' AS Mensaje;

