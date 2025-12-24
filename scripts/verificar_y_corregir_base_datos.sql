-- Script para verificar y crear tablas faltantes en la base de datos
-- Ejecutar en el servidor si falta alguna tabla

USE entradas_db;

-- 1. Crear tabla compras_entradas_generales si no existe
CREATE TABLE IF NOT EXISTS `compras_entradas_generales` (
  `id` int NOT NULL AUTO_INCREMENT,
  `compra_id` int NOT NULL,
  `codigo_escaneo` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL,
  `escaneado` tinyint(1) DEFAULT '0',
  `fecha_escaneo` datetime DEFAULT NULL,
  `usuario_escaneo_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo_escaneo` (`codigo_escaneo`),
  KEY `idx_compra_id` (`compra_id`),
  KEY `idx_codigo_escaneo` (`codigo_escaneo`),
  KEY `idx_escaneado` (`escaneado`),
  CONSTRAINT `compras_entradas_generales_ibfk_1` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Verificar y agregar columna compra_entrada_general_id a escaneos_entradas si no existe
SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'entradas_db'
    AND TABLE_NAME = 'escaneos_entradas'
    AND COLUMN_NAME = 'compra_entrada_general_id'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE escaneos_entradas ADD COLUMN compra_entrada_general_id INT DEFAULT NULL',
  'SELECT "La columna compra_entrada_general_id ya existe" AS Mensaje'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Verificar y crear índice si no existe
SET @idx_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = 'entradas_db'
    AND TABLE_NAME = 'escaneos_entradas'
    AND INDEX_NAME = 'idx_compra_entrada_general'
);

SET @sql_idx = IF(@idx_exists = 0,
  'CREATE INDEX idx_compra_entrada_general ON escaneos_entradas(compra_entrada_general_id)',
  'SELECT "El índice idx_compra_entrada_general ya existe" AS Mensaje'
);
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;

-- 4. Verificar que todo esté correcto
SELECT 'Verificación completada' AS Mensaje;
SELECT 'Tabla compras_entradas_generales' AS Tabla, COUNT(*) AS Existe 
FROM information_schema.tables 
WHERE table_schema = 'entradas_db' AND table_name = 'compras_entradas_generales';

SELECT 'Columna compra_entrada_general_id' AS Columna, COUNT(*) AS Existe
FROM information_schema.columns
WHERE table_schema = 'entradas_db' 
  AND table_name = 'escaneos_entradas'
  AND column_name = 'compra_entrada_general_id';

