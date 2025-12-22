-- Script para crear la tabla compras_entradas_generales
-- Esta tabla almacena un código de escaneo único por cada entrada en eventos generales

USE entradas_db;

-- Crear la tabla si no existe
CREATE TABLE IF NOT EXISTS `compras_entradas_generales` (
  `id` int NOT NULL AUTO_INCREMENT,
  `compra_id` int NOT NULL,
  `codigo_escaneo` varchar(5) NOT NULL,
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

-- Verificar que la tabla se creó correctamente
SELECT 'Tabla compras_entradas_generales creada exitosamente' AS Mensaje;

