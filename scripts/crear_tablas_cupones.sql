-- ============================================================
-- Crear tablas de cupones de descuento (si no existen)
-- Ejecutar en la base de datos del servidor (ej. entradas_db)
-- ============================================================

-- Tabla: cupones
CREATE TABLE IF NOT EXISTS `cupones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `evento_id` int NOT NULL,
  `codigo` varchar(50) NOT NULL,
  `porcentaje_descuento` decimal(5,2) NOT NULL,
  `limite_usos` int NOT NULL DEFAULT 1,
  `limite_por_cliente` int NOT NULL DEFAULT 1,
  `fecha_inicio` datetime DEFAULT NULL,
  `fecha_fin` datetime DEFAULT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `usos_actuales` int NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_codigo_evento` (`evento_id`, `codigo`),
  KEY `idx_evento_id` (`evento_id`),
  KEY `idx_activo` (`activo`),
  CONSTRAINT `cupones_ibfk_evento` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: cupones_usados (registro de cada uso de cupón en una compra)
CREATE TABLE IF NOT EXISTS `cupones_usados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cupon_id` int NOT NULL,
  `compra_id` int NOT NULL,
  `descuento_aplicado` decimal(10,2) DEFAULT NULL,
  `total_antes_descuento` decimal(10,2) DEFAULT NULL,
  `total_despues_descuento` decimal(10,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cupon_id` (`cupon_id`),
  KEY `idx_compra_id` (`compra_id`),
  CONSTRAINT `cupones_usados_ibfk_cupon` FOREIGN KEY (`cupon_id`) REFERENCES `cupones` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cupones_usados_ibfk_compra` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
