-- ============================================
-- Base de datos: entradas_db
-- Estructura limpia (sin datos)
-- Orden correcto de creación de tablas
-- ============================================

SET FOREIGN_KEY_CHECKS=0;

-- Eliminar todas las tablas en orden inverso
DROP TABLE IF EXISTS `escaneos_entradas`;
DROP TABLE IF EXISTS `entradas`;
DROP TABLE IF EXISTS `compras_asientos`;
DROP TABLE IF EXISTS `compras_mesas`;
DROP TABLE IF EXISTS `compras`;
DROP TABLE IF EXISTS `asientos`;
DROP TABLE IF EXISTS `mesas`;
DROP TABLE IF EXISTS `areas_layout`;
DROP TABLE IF EXISTS `tipos_precio_evento`;
DROP TABLE IF EXISTS `pagos`;
DROP TABLE IF EXISTS `usuarios`;
DROP TABLE IF EXISTS `clientes`;
DROP TABLE IF EXISTS `contacto_info`;
DROP TABLE IF EXISTS `eventos`;
DROP TABLE IF EXISTS `roles`;

SET FOREIGN_KEY_CHECKS=1;

-- ============================================
-- Crear tablas en orden correcto
-- ============================================

-- 1. Tabla: roles (sin dependencias)
CREATE TABLE `roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`),
  KEY `idx_nombre` (`nombre`),
  KEY `idx_activo` (`activo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla: eventos (sin dependencias)
CREATE TABLE `eventos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `imagen` varchar(255) NOT NULL,
  `qr_pago_url` varchar(255) DEFAULT NULL,
  `titulo` varchar(120) NOT NULL,
  `descripcion` text NOT NULL,
  `hora_inicio` datetime NOT NULL,
  `precio` decimal(10,2) NOT NULL DEFAULT '0.00',
  `es_nuevo` tinyint(1) NOT NULL DEFAULT '0',
  `tipo_evento` enum('general','especial') NOT NULL DEFAULT 'general',
  `capacidad_maxima` int DEFAULT NULL,
  `limite_entradas` int DEFAULT NULL,
  `forma_espacio` enum('rectangulo','cuadrado','triangulo','circulo') DEFAULT NULL,
  `escenario_x` int DEFAULT NULL,
  `escenario_y` int DEFAULT NULL,
  `escenario_width` int DEFAULT NULL,
  `escenario_height` int DEFAULT NULL,
  `layout_bloqueado` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tipo_evento` (`tipo_evento`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla: contacto_info (sin dependencias)
CREATE TABLE `contacto_info` (
  `id` int NOT NULL AUTO_INCREMENT,
  `telefono` varchar(30) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `whatsapp` varchar(30) DEFAULT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `horario` varchar(255) DEFAULT NULL,
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `facebook` varchar(255) DEFAULT NULL,
  `instagram` varchar(255) DEFAULT NULL,
  `twitter` varchar(255) DEFAULT NULL,
  `youtube` varchar(255) DEFAULT NULL,
  `tiktok` varchar(255) DEFAULT NULL,
  `linkedin` varchar(255) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabla: tipos_precio_evento (depende de eventos)
CREATE TABLE `tipos_precio_evento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `evento_id` int NOT NULL,
  `nombre` varchar(50) NOT NULL,
  `precio` decimal(10,2) NOT NULL DEFAULT '0.00',
  `color` varchar(20) DEFAULT '#CCCCCC',
  `descripcion` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_evento` (`evento_id`),
  KEY `idx_activo` (`activo`),
  CONSTRAINT `tipos_precio_evento_ibfk_1` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabla: areas_layout (depende de eventos)
CREATE TABLE `areas_layout` (
  `id` int NOT NULL AUTO_INCREMENT,
  `evento_id` int NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `posicion_x` int NOT NULL,
  `posicion_y` int NOT NULL,
  `ancho` int NOT NULL,
  `alto` int NOT NULL,
  `color` varchar(20) DEFAULT '#CCCCCC',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_evento` (`evento_id`),
  CONSTRAINT `areas_layout_ibfk_1` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Tabla: mesas (depende de eventos, tipos_precio_evento, areas_layout)
CREATE TABLE `mesas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `evento_id` int NOT NULL,
  `numero_mesa` int NOT NULL,
  `capacidad_sillas` int NOT NULL DEFAULT '1',
  `tipo_precio_id` int NOT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `posicion_x` int DEFAULT NULL,
  `posicion_y` int DEFAULT NULL,
  `ancho` int DEFAULT NULL,
  `alto` int DEFAULT NULL,
  `area_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_mesa_evento` (`evento_id`,`numero_mesa`),
  KEY `idx_evento` (`evento_id`),
  KEY `idx_tipo_precio` (`tipo_precio_id`),
  KEY `idx_activo` (`activo`),
  KEY `idx_area` (`area_id`),
  CONSTRAINT `mesas_ibfk_1` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `mesas_ibfk_2` FOREIGN KEY (`tipo_precio_id`) REFERENCES `tipos_precio_evento` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `mesas_ibfk_area` FOREIGN KEY (`area_id`) REFERENCES `areas_layout` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Tabla: asientos (depende de eventos, mesas, tipos_precio_evento, areas_layout)
CREATE TABLE `asientos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `evento_id` int NOT NULL,
  `mesa_id` int DEFAULT NULL,
  `numero_asiento` varchar(50) NOT NULL,
  `tipo_precio_id` int NOT NULL,
  `estado` enum('disponible','reservado','ocupado') NOT NULL DEFAULT 'disponible',
  `posicion_x` int DEFAULT NULL,
  `posicion_y` int DEFAULT NULL,
  `area_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_asiento_mesa_evento` (`evento_id`,`mesa_id`,`numero_asiento`),
  KEY `idx_evento` (`evento_id`),
  KEY `idx_mesa` (`mesa_id`),
  KEY `idx_tipo_precio` (`tipo_precio_id`),
  KEY `idx_estado` (`estado`),
  KEY `idx_area` (`area_id`),
  KEY `idx_asiento_individual` (`evento_id`,`numero_asiento`,`mesa_id`),
  CONSTRAINT `asientos_ibfk_1` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `asientos_ibfk_2` FOREIGN KEY (`mesa_id`) REFERENCES `mesas` (`id`) ON DELETE SET NULL,
  CONSTRAINT `asientos_ibfk_3` FOREIGN KEY (`tipo_precio_id`) REFERENCES `tipos_precio_evento` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `asientos_ibfk_area` FOREIGN KEY (`area_id`) REFERENCES `areas_layout` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Tabla: clientes (sin dependencias)
CREATE TABLE `clientes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) DEFAULT NULL,
  `apellido` varchar(100) DEFAULT NULL,
  `nombre_completo` varchar(200) DEFAULT NULL,
  `correo` varchar(100) NOT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `provider` varchar(50) DEFAULT 'local',
  `provider_id` varchar(255) DEFAULT NULL,
  `foto_perfil` varchar(500) DEFAULT NULL,
  `email_verificado` tinyint(1) DEFAULT '0',
  `activo` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `correo` (`correo`),
  KEY `idx_correo` (`correo`),
  KEY `idx_provider` (`provider`,`provider_id`),
  KEY `idx_activo` (`activo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Tabla: compras (depende de eventos)
CREATE TABLE `compras` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codigo_unico` varchar(30) NOT NULL,
  `evento_id` int NOT NULL,
  `cliente_nombre` varchar(255) NOT NULL,
  `cliente_email` varchar(255) DEFAULT NULL,
  `cliente_telefono` varchar(50) DEFAULT NULL,
  `cantidad` int NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `estado` enum('PAGO_PENDIENTE','PAGO_REALIZADO','CANCELADO','ENTRADA_USADA') DEFAULT 'PAGO_PENDIENTE',
  `fecha_compra` datetime DEFAULT CURRENT_TIMESTAMP,
  `fecha_pago` datetime DEFAULT NULL,
  `fecha_confirmacion` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo_unico` (`codigo_unico`),
  KEY `idx_codigo_unico` (`codigo_unico`),
  KEY `idx_evento_id` (`evento_id`),
  KEY `idx_estado` (`estado`),
  CONSTRAINT `compras_ibfk_1` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Tabla: compras_asientos (depende de compras, asientos)
CREATE TABLE `compras_asientos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `compra_id` int NOT NULL,
  `asiento_id` int NOT NULL,
  `precio` decimal(10,2) NOT NULL,
  `estado` enum('RESERVADO','CONFIRMADO','CANCELADO') DEFAULT 'RESERVADO',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `escaneado` tinyint(1) DEFAULT '0',
  `fecha_escaneo` datetime DEFAULT NULL,
  `usuario_escaneo_id` int DEFAULT NULL,
  `codigo_escaneo` varchar(5) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_compra_asiento` (`compra_id`,`asiento_id`),
  UNIQUE KEY `codigo_escaneo` (`codigo_escaneo`),
  KEY `idx_compra_id` (`compra_id`),
  KEY `idx_asiento_id` (`asiento_id`),
  KEY `idx_codigo_escaneo` (`codigo_escaneo`),
  CONSTRAINT `compras_asientos_ibfk_1` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE CASCADE,
  CONSTRAINT `compras_asientos_ibfk_2` FOREIGN KEY (`asiento_id`) REFERENCES `asientos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Tabla: compras_mesas (depende de compras, mesas)
CREATE TABLE `compras_mesas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `compra_id` int NOT NULL,
  `mesa_id` int NOT NULL,
  `cantidad_sillas` int NOT NULL,
  `precio_total` decimal(10,2) NOT NULL,
  `estado` enum('RESERVADO','CONFIRMADO','CANCELADO') DEFAULT 'RESERVADO',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `escaneado` tinyint(1) DEFAULT '0',
  `fecha_escaneo` datetime DEFAULT NULL,
  `usuario_escaneo_id` int DEFAULT NULL,
  `codigo_escaneo` varchar(5) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo_escaneo` (`codigo_escaneo`),
  KEY `idx_compra_id` (`compra_id`),
  KEY `idx_mesa_id` (`mesa_id`),
  KEY `idx_codigo_escaneo` (`codigo_escaneo`),
  CONSTRAINT `compras_mesas_ibfk_1` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE CASCADE,
  CONSTRAINT `compras_mesas_ibfk_2` FOREIGN KEY (`mesa_id`) REFERENCES `mesas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Tabla: pagos (depende de tipos_precio_evento)
CREATE TABLE `pagos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `evento_id` int NOT NULL,
  `tipo_precio_id` int DEFAULT NULL,
  `cantidad` int NOT NULL,
  `monto_total` decimal(10,2) NOT NULL,
  `preference_id` varchar(255) DEFAULT NULL,
  `mp_payment_id` varchar(255) DEFAULT NULL,
  `external_reference` varchar(255) DEFAULT NULL,
  `estado` enum('pending','approved','rejected','cancelled') DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `external_reference` (`external_reference`),
  KEY `idx_usuario` (`usuario_id`),
  KEY `idx_evento` (`evento_id`),
  KEY `idx_external_ref` (`external_reference`),
  KEY `idx_estado` (`estado`),
  KEY `idx_tipo_precio` (`tipo_precio_id`),
  CONSTRAINT `pagos_ibfk_tipo_precio` FOREIGN KEY (`tipo_precio_id`) REFERENCES `tipos_precio_evento` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Tabla: entradas (depende de pagos, eventos, tipos_precio_evento, mesas, asientos)
CREATE TABLE `entradas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pago_id` int NOT NULL,
  `evento_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `tipo_precio_id` int DEFAULT NULL,
  `mesa_id` int DEFAULT NULL,
  `asiento_id` int DEFAULT NULL,
  `codigo` varchar(50) NOT NULL,
  `estado` enum('activa','usada','cancelada') DEFAULT 'activa',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `used_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo` (`codigo`),
  KEY `idx_pago` (`pago_id`),
  KEY `idx_evento` (`evento_id`),
  KEY `idx_usuario` (`usuario_id`),
  KEY `idx_codigo` (`codigo`),
  KEY `idx_tipo_precio` (`tipo_precio_id`),
  KEY `idx_mesa` (`mesa_id`),
  KEY `idx_asiento` (`asiento_id`),
  CONSTRAINT `entradas_ibfk_1` FOREIGN KEY (`pago_id`) REFERENCES `pagos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `entradas_ibfk_asiento` FOREIGN KEY (`asiento_id`) REFERENCES `asientos` (`id`) ON DELETE SET NULL,
  CONSTRAINT `entradas_ibfk_mesa` FOREIGN KEY (`mesa_id`) REFERENCES `mesas` (`id`) ON DELETE SET NULL,
  CONSTRAINT `entradas_ibfk_tipo_precio` FOREIGN KEY (`tipo_precio_id`) REFERENCES `tipos_precio_evento` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Tabla: escaneos_entradas (depende de compras, eventos)
CREATE TABLE `escaneos_entradas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tipo` enum('ASIENTO','MESA') NOT NULL,
  `compra_asiento_id` int DEFAULT NULL,
  `compra_mesa_id` int DEFAULT NULL,
  `compra_id` int NOT NULL,
  `evento_id` int NOT NULL,
  `usuario_escaneo_id` int DEFAULT NULL,
  `fecha_escaneo` datetime DEFAULT CURRENT_TIMESTAMP,
  `datos_qr` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_compra_id` (`compra_id`),
  KEY `idx_evento_id` (`evento_id`),
  KEY `idx_fecha_escaneo` (`fecha_escaneo`),
  KEY `idx_usuario_escaneo` (`usuario_escaneo_id`),
  CONSTRAINT `escaneos_entradas_ibfk_1` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE CASCADE,
  CONSTRAINT `escaneos_entradas_ibfk_2` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. Tabla: usuarios (depende de roles)
CREATE TABLE `usuarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre_usuario` varchar(50) NOT NULL,
  `nombre_completo` varchar(100) NOT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `correo` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `id_rol` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre_usuario` (`nombre_usuario`),
  UNIQUE KEY `correo` (`correo`),
  KEY `idx_nombre_usuario` (`nombre_usuario`),
  KEY `idx_correo` (`correo`),
  KEY `idx_activo` (`activo`),
  KEY `idx_rol` (`id_rol`),
  CONSTRAINT `usuarios_ibfk_1` FOREIGN KEY (`id_rol`) REFERENCES `roles` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

