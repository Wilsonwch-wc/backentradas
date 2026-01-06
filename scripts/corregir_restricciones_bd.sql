-- ========================================
-- Script para Corregir Restricciones de Base de Datos
-- ========================================
-- Este script corrige problemas comunes de restricciones en la BD
-- Es seguro ejecutarlo múltiples veces (idempotente)
-- ========================================

USE entradas_db;

-- ========================================
-- 1. CORREGIR COLUMNA 'imagen' EN EVENTOS
-- ========================================
-- Problema: La columna 'imagen' es NOT NULL pero el código puede intentar insertar NULL
-- Solución: Permitir NULL o establecer un valor por defecto

-- Verificar si la columna permite NULL
SET @imagen_allows_null = (
    SELECT IS_NULLABLE 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'entradas_db' 
      AND TABLE_NAME = 'eventos' 
      AND COLUMN_NAME = 'imagen'
);

-- Si no permite NULL, modificarla para que permita NULL
SET @sql_imagen = IF(@imagen_allows_null = 'NO',
    'ALTER TABLE eventos MODIFY imagen VARCHAR(255) NULL DEFAULT NULL',
    'SELECT "La columna imagen ya permite NULL" AS Mensaje'
);

PREPARE stmt_imagen FROM @sql_imagen;
EXECUTE stmt_imagen;
DEALLOCATE PREPARE stmt_imagen;

-- ========================================
-- 2. VERIFICAR Y CORREGIR FOREIGN KEYS EN ASIENTOS
-- ========================================
-- Verificar que la foreign key de mesa_id esté correctamente configurada

-- Verificar si existe la constraint
SET @fk_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = 'entradas_db' 
      AND TABLE_NAME = 'asientos' 
      AND CONSTRAINT_NAME = 'asientos_ibfk_2'
      AND COLUMN_NAME = 'mesa_id'
);

-- Si no existe, crearla (aunque debería existir)
SET @sql_fk = IF(@fk_exists = 0,
    'ALTER TABLE asientos ADD CONSTRAINT asientos_ibfk_2 FOREIGN KEY (mesa_id) REFERENCES mesas(id) ON DELETE SET NULL',
    'SELECT "La foreign key asientos_ibfk_2 ya existe" AS Mensaje'
);

PREPARE stmt_fk FROM @sql_fk;
EXECUTE stmt_fk;
DEALLOCATE PREPARE stmt_fk;

-- ========================================
-- 3. LIMPIAR DATOS INCONSISTENTES (OPCIONAL)
-- ========================================
-- Eliminar asientos que referencian mesas que no existen

-- Primero, verificar si hay datos inconsistentes
SELECT 
    COUNT(*) AS asientos_con_mesa_inexistente
FROM asientos a
LEFT JOIN mesas m ON a.mesa_id = m.id
WHERE a.mesa_id IS NOT NULL 
  AND m.id IS NULL;

-- Si hay datos inconsistentes, corregirlos (establecer mesa_id a NULL)
UPDATE asientos a
LEFT JOIN mesas m ON a.mesa_id = m.id
SET a.mesa_id = NULL
WHERE a.mesa_id IS NOT NULL 
  AND m.id IS NULL;

-- ========================================
-- 4. VERIFICAR EVENTOS SIN IMAGEN
-- ========================================
-- Establecer una imagen por defecto para eventos que no tienen imagen
-- (Solo si realmente quieres permitir eventos sin imagen)

-- Verificar eventos sin imagen
SELECT 
    COUNT(*) AS eventos_sin_imagen
FROM eventos
WHERE imagen IS NULL OR imagen = '';

-- Opcional: Establecer imagen por defecto (descomentar si lo necesitas)
-- UPDATE eventos 
-- SET imagen = '/images/logprincipal.jpg'
-- WHERE imagen IS NULL OR imagen = '';

-- ========================================
-- 5. VERIFICACIÓN FINAL
-- ========================================

SELECT '=== VERIFICACIÓN DE ESTRUCTURA ===' AS Mensaje;

-- Verificar estructura de tabla eventos
SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'entradas_db' 
  AND TABLE_NAME = 'eventos' 
  AND COLUMN_NAME = 'imagen';

-- Verificar foreign keys de asientos
SELECT 
    CONSTRAINT_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'entradas_db' 
  AND TABLE_NAME = 'asientos' 
  AND CONSTRAINT_NAME LIKE 'asientos_ibfk%';

-- Verificar datos inconsistentes
SELECT 
    'Asientos con mesa_id inexistente' AS Tipo,
    COUNT(*) AS Cantidad
FROM asientos a
LEFT JOIN mesas m ON a.mesa_id = m.id
WHERE a.mesa_id IS NOT NULL 
  AND m.id IS NULL

UNION ALL

SELECT 
    'Eventos sin imagen' AS Tipo,
    COUNT(*) AS Cantidad
FROM eventos
WHERE imagen IS NULL OR imagen = '';

-- ========================================
-- FIN DEL SCRIPT
-- ========================================
SELECT 'Script ejecutado correctamente' AS Resultado;

