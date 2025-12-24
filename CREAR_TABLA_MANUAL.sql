-- Script para crear la tabla compras_entradas_generales manualmente
-- Ejecutar en el servidor: mysql -u root -p entradas_db < CREAR_TABLA_MANUAL.sql

USE entradas_db;

-- Verificar si la tabla ya existe
SELECT COUNT(*) AS tabla_existe
FROM information_schema.tables 
WHERE table_schema = 'entradas_db' 
  AND table_name = 'compras_entradas_generales';

-- Crear la tabla (se ejecutará aunque ya exista con CREATE TABLE IF NOT EXISTS)
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

-- Verificar que se creó
SHOW TABLES LIKE 'compras_entradas_generales';
DESCRIBE compras_entradas_generales;

