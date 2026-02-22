-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: entradas_db
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `areas_layout`
--

DROP TABLE IF EXISTS `areas_layout`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `areas_layout` (
  `id` int NOT NULL AUTO_INCREMENT,
  `evento_id` int NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `posicion_x` int NOT NULL,
  `posicion_y` int NOT NULL,
  `ancho` int NOT NULL,
  `alto` int NOT NULL,
  `color` varchar(20) DEFAULT '#CCCCCC',
  `tipo_area` enum('SILLAS','MESAS','PERSONAS') NOT NULL DEFAULT 'SILLAS',
  `capacidad_personas` int DEFAULT NULL,
  `orden` int DEFAULT NULL,
  `forma` enum('rectangulo','circulo') NOT NULL DEFAULT 'rectangulo',
  `tipo_precio_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_evento` (`evento_id`),
  CONSTRAINT `areas_layout_ibfk_1` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=95 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `areas_layout`
--

LOCK TABLES `areas_layout` WRITE;
/*!40000 ALTER TABLE `areas_layout` DISABLE KEYS */;
/*!40000 ALTER TABLE `areas_layout` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `asientos`
--

DROP TABLE IF EXISTS `asientos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=8567 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `asientos`
--

LOCK TABLES `asientos` WRITE;
/*!40000 ALTER TABLE `asientos` DISABLE KEYS */;
/*!40000 ALTER TABLE `asientos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `boletos_enviados`
--

DROP TABLE IF EXISTS `boletos_enviados`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `boletos_enviados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `compra_id` int NOT NULL,
  `evento_id` int NOT NULL,
  `cliente_id` int DEFAULT NULL,
  `metodo_envio` enum('email','whatsapp','ambos') COLLATE utf8mb4_unicode_ci NOT NULL,
  `destinatario` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre_archivo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ruta_archivo` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado` enum('pendiente','enviado','fallido','reenviado') COLLATE utf8mb4_unicode_ci DEFAULT 'pendiente',
  `mensaje_error` text COLLATE utf8mb4_unicode_ci,
  `intentos` int DEFAULT '0',
  `fecha_envio` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_compra_id` (`compra_id`),
  KEY `idx_evento_id` (`evento_id`),
  KEY `idx_cliente_id` (`cliente_id`),
  KEY `idx_estado` (`estado`),
  KEY `idx_metodo_envio` (`metodo_envio`),
  KEY `idx_fecha_envio` (`fecha_envio`),
  CONSTRAINT `boletos_enviados_cliente_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `boletos_enviados_compra_fk` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE CASCADE,
  CONSTRAINT `boletos_enviados_evento_fk` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `boletos_enviados`
--

LOCK TABLES `boletos_enviados` WRITE;
/*!40000 ALTER TABLE `boletos_enviados` DISABLE KEYS */;
/*!40000 ALTER TABLE `boletos_enviados` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `clientes`
--

DROP TABLE IF EXISTS `clientes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
  `codigo_verificacion` varchar(6) DEFAULT NULL,
  `codigo_verificacion_expira` datetime DEFAULT NULL,
  `codigo_recuperacion` varchar(6) DEFAULT NULL,
  `codigo_recuperacion_expira` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `correo` (`correo`),
  KEY `idx_correo` (`correo`),
  KEY `idx_provider` (`provider`,`provider_id`),
  KEY `idx_activo` (`activo`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `clientes`
--

LOCK TABLES `clientes` WRITE;
/*!40000 ALTER TABLE `clientes` DISABLE KEYS */;
/*!40000 ALTER TABLE `clientes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `compras`
--

DROP TABLE IF EXISTS `compras`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `compras` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codigo_unico` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `evento_id` int NOT NULL,
  `cliente_id` int DEFAULT NULL,
  `cliente_nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cliente_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cliente_telefono` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cantidad` int NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) DEFAULT '0.00',
  `cupon_id` int DEFAULT NULL,
  `descuento` decimal(10,2) DEFAULT '0.00',
  `estado` enum('PAGO_PENDIENTE','PAGO_REALIZADO','CANCELADO','ENTRADA_USADA') COLLATE utf8mb4_unicode_ci DEFAULT 'PAGO_PENDIENTE',
  `tipo_venta` enum('NORMAL','REGALO_ADMIN','OFERTA_ADMIN') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NORMAL',
  `precio_original` decimal(10,2) DEFAULT NULL,
  `fecha_compra` datetime DEFAULT CURRENT_TIMESTAMP,
  `fecha_pago` datetime DEFAULT NULL,
  `fecha_confirmacion` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `codigo_escaneo` varchar(5) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo_pago` enum('QR','EFECTIVO') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Tipo de pago al confirmar: QR o Efectivo',
  `descuento_cupon` decimal(10,2) DEFAULT '0.00',
  `nit` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `razon_social` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numero_factura` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `usuario_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo_unico` (`codigo_unico`),
  UNIQUE KEY `codigo_unico_2` (`codigo_unico`),
  UNIQUE KEY `codigo_escaneo` (`codigo_escaneo`),
  KEY `idx_codigo_unico` (`codigo_unico`),
  KEY `idx_evento_id` (`evento_id`),
  KEY `idx_estado` (`estado`),
  KEY `idx_codigo_escaneo` (`codigo_escaneo`),
  KEY `idx_cliente_id` (`cliente_id`),
  KEY `idx_tipo_pago` (`tipo_pago`),
  KEY `idx_nit` (`nit`),
  KEY `idx_numero_factura` (`numero_factura`),
  KEY `fk_compras_usuario` (`usuario_id`),
  CONSTRAINT `compras_ibfk_1` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_compras_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=69 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `compras`
--

LOCK TABLES `compras` WRITE;
/*!40000 ALTER TABLE `compras` DISABLE KEYS */;
/*!40000 ALTER TABLE `compras` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `compras_areas_personas`
--

DROP TABLE IF EXISTS `compras_areas_personas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `compras_areas_personas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `compra_id` int NOT NULL,
  `area_id` int NOT NULL,
  `cantidad` int NOT NULL,
  `precio_unitario` decimal(10,2) DEFAULT '0.00',
  `precio_total` decimal(10,2) DEFAULT '0.00',
  `estado` enum('RESERVADO','CONFIRMADO','CANCELADO') COLLATE utf8mb4_unicode_ci DEFAULT 'RESERVADO',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_compra` (`compra_id`),
  KEY `idx_area` (`area_id`),
  CONSTRAINT `compras_areas_personas_ibfk_area` FOREIGN KEY (`area_id`) REFERENCES `areas_layout` (`id`) ON DELETE CASCADE,
  CONSTRAINT `compras_areas_personas_ibfk_compra` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `compras_areas_personas`
--

LOCK TABLES `compras_areas_personas` WRITE;
/*!40000 ALTER TABLE `compras_areas_personas` DISABLE KEYS */;
/*!40000 ALTER TABLE `compras_areas_personas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `compras_asientos`
--

DROP TABLE IF EXISTS `compras_asientos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `compras_asientos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `compra_id` int NOT NULL,
  `asiento_id` int NOT NULL,
  `precio` decimal(10,2) NOT NULL,
  `estado` enum('RESERVADO','CONFIRMADO','CANCELADO') COLLATE utf8mb4_unicode_ci DEFAULT 'RESERVADO',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `escaneado` tinyint(1) DEFAULT '0',
  `fecha_escaneo` datetime DEFAULT NULL,
  `usuario_escaneo_id` int DEFAULT NULL,
  `codigo_escaneo` varchar(5) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_compra_asiento` (`compra_id`,`asiento_id`),
  UNIQUE KEY `codigo_escaneo` (`codigo_escaneo`),
  KEY `idx_compra_id` (`compra_id`),
  KEY `idx_asiento_id` (`asiento_id`),
  KEY `idx_codigo_escaneo` (`codigo_escaneo`),
  CONSTRAINT `compras_asientos_ibfk_1` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE CASCADE,
  CONSTRAINT `compras_asientos_ibfk_2` FOREIGN KEY (`asiento_id`) REFERENCES `asientos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=62 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `compras_asientos`
--

LOCK TABLES `compras_asientos` WRITE;
/*!40000 ALTER TABLE `compras_asientos` DISABLE KEYS */;
/*!40000 ALTER TABLE `compras_asientos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `compras_detalle_general`
--

DROP TABLE IF EXISTS `compras_detalle_general`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `compras_detalle_general` (
  `id` int NOT NULL AUTO_INCREMENT,
  `compra_id` int NOT NULL,
  `tipo_precio_id` int NOT NULL,
  `cantidad` int NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_compra_id` (`compra_id`),
  KEY `idx_tipo_precio_id` (`tipo_precio_id`),
  CONSTRAINT `fk_cdg_compra` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cdg_tipo_precio` FOREIGN KEY (`tipo_precio_id`) REFERENCES `tipos_precio_evento` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `compras_detalle_general`
--

LOCK TABLES `compras_detalle_general` WRITE;
/*!40000 ALTER TABLE `compras_detalle_general` DISABLE KEYS */;
INSERT INTO `compras_detalle_general` VALUES (1,58,75,2,'2026-02-22 12:59:17'),(2,59,75,1,'2026-02-22 13:04:59'),(3,59,76,1,'2026-02-22 13:04:59'),(4,59,77,1,'2026-02-22 13:04:59'),(5,59,78,1,'2026-02-22 13:04:59'),(6,60,75,2,'2026-02-22 13:30:55'),(7,60,77,1,'2026-02-22 13:30:55'),(8,61,76,3,'2026-02-22 13:31:48'),(9,62,75,1,'2026-02-22 13:59:05'),(10,62,76,2,'2026-02-22 13:59:05'),(11,63,75,3,'2026-02-22 14:12:21'),(12,64,76,2,'2026-02-22 14:12:46'),(13,64,77,2,'2026-02-22 14:12:46'),(14,65,75,6,'2026-02-22 14:15:07'),(15,66,77,2,'2026-02-22 14:30:37'),(16,67,79,3,'2026-02-22 14:58:20'),(17,68,81,10,'2026-02-22 15:01:18');
/*!40000 ALTER TABLE `compras_detalle_general` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `compras_entradas_generales`
--

DROP TABLE IF EXISTS `compras_entradas_generales`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `compras_entradas_generales` (
  `id` int NOT NULL AUTO_INCREMENT,
  `compra_id` int NOT NULL,
  `tipo_precio_id` int DEFAULT NULL,
  `area_id` int DEFAULT NULL,
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
  KEY `idx_area_id` (`area_id`),
  KEY `idx_tipo_precio_id` (`tipo_precio_id`),
  CONSTRAINT `compras_entradas_generales_ibfk_1` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eg_tipo_precio` FOREIGN KEY (`tipo_precio_id`) REFERENCES `tipos_precio_evento` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=63 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `compras_entradas_generales`
--

LOCK TABLES `compras_entradas_generales` WRITE;
/*!40000 ALTER TABLE `compras_entradas_generales` DISABLE KEYS */;
/*!40000 ALTER TABLE `compras_entradas_generales` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `compras_mesas`
--

DROP TABLE IF EXISTS `compras_mesas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `compras_mesas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `compra_id` int NOT NULL,
  `mesa_id` int NOT NULL,
  `cantidad_sillas` int NOT NULL,
  `precio_total` decimal(10,2) NOT NULL,
  `estado` enum('RESERVADO','CONFIRMADO','CANCELADO') COLLATE utf8mb4_unicode_ci DEFAULT 'RESERVADO',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `escaneado` tinyint(1) DEFAULT '0',
  `fecha_escaneo` datetime DEFAULT NULL,
  `usuario_escaneo_id` int DEFAULT NULL,
  `codigo_escaneo` varchar(5) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo_escaneo` (`codigo_escaneo`),
  KEY `idx_compra_id` (`compra_id`),
  KEY `idx_mesa_id` (`mesa_id`),
  KEY `idx_codigo_escaneo` (`codigo_escaneo`),
  CONSTRAINT `compras_mesas_ibfk_1` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE CASCADE,
  CONSTRAINT `compras_mesas_ibfk_2` FOREIGN KEY (`mesa_id`) REFERENCES `mesas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `compras_mesas`
--

LOCK TABLES `compras_mesas` WRITE;
/*!40000 ALTER TABLE `compras_mesas` DISABLE KEYS */;
/*!40000 ALTER TABLE `compras_mesas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `configuracion_sistema`
--

DROP TABLE IF EXISTS `configuracion_sistema`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `configuracion_sistema` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clave` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` text COLLATE utf8mb4_unicode_ci,
  `tipo` enum('string','number','boolean','json') COLLATE utf8mb4_unicode_ci DEFAULT 'string',
  `descripcion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `categoria` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'general',
  `editable` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `clave` (`clave`),
  KEY `idx_categoria` (`categoria`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `configuracion_sistema`
--

LOCK TABLES `configuracion_sistema` WRITE;
/*!40000 ALTER TABLE `configuracion_sistema` DISABLE KEYS */;
INSERT INTO `configuracion_sistema` VALUES (1,'nombre_empresa','PlusTiket','string','Nombre de la empresa','general',1,'2026-01-30 18:05:59','2026-01-30 18:05:59'),(2,'email_empresa','contacto@plustiket.com','string','Email de contacto de la empresa','general',1,'2026-01-30 18:05:59','2026-01-30 18:05:59'),(3,'telefono_empresa','+591 70000000','string','Tel├®fono de contacto','general',1,'2026-01-30 18:05:59','2026-01-30 18:05:59'),(4,'direccion_empresa','Quillacollo, Cochabamba, Bolivia','string','Direcci├│n de la empresa','general',1,'2026-01-30 18:05:59','2026-01-30 18:05:59'),(5,'nit_empresa','0','string','NIT de la empresa','facturacion',1,'2026-01-30 18:05:59','2026-01-30 18:05:59'),(6,'tiempo_expiracion_reserva','15','number','Minutos para que expire una reserva pendiente','compras',1,'2026-01-30 18:05:59','2026-01-30 18:05:59'),(7,'tiempo_expiracion_codigo_verificacion','10','number','Minutos para que expire el c├│digo de verificaci├│n','seguridad',1,'2026-01-30 18:05:59','2026-01-30 18:05:59'),(8,'tiempo_expiracion_codigo_recuperacion','15','number','Minutos para que expire el c├│digo de recuperaci├│n','seguridad',1,'2026-01-30 18:05:59','2026-01-30 18:05:59'),(9,'whatsapp_habilitado','true','boolean','Habilitar env├¡o de boletos por WhatsApp','whatsapp',1,'2026-01-30 18:05:59','2026-01-30 18:05:59'),(10,'email_habilitado','true','boolean','Habilitar env├¡o de boletos por email','email',1,'2026-01-30 18:05:59','2026-01-30 18:05:59'),(11,'max_intentos_envio','3','number','M├íximo de intentos de env├¡o de boletos','envios',1,'2026-01-30 18:05:59','2026-01-30 18:05:59');
/*!40000 ALTER TABLE `configuracion_sistema` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `contacto_info`
--

DROP TABLE IF EXISTS `contacto_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contacto_info`
--

LOCK TABLES `contacto_info` WRITE;
/*!40000 ALTER TABLE `contacto_info` DISABLE KEYS */;
INSERT INTO `contacto_info` VALUES (15,'+591 63938895','acanaviril@gmail.com','+591 63938895','Av. 6 DE AGOSTO ENTRE COCHABAMBA Y GENERAL PANDO - CENTRO COMERCIAL URKUPIÑA OF. 10','Lun-Vie 09:00 - 18:00','2026-02-22 23:27:32','2026-02-22 23:28:24','https://facebook.com/tu-pagina','https://instagram.com/tu-pagina','https://twitter.com/tu-pagina','https://youtube.com/tu-canal','https://www.tiktok.com/@tu-usuario','https://www.linkedin.com/company/tu-empresa','https://www.tusitio.com');
/*!40000 ALTER TABLE `contacto_info` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cupones`
--

DROP TABLE IF EXISTS `cupones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cupones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `evento_id` int NOT NULL,
  `codigo` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `porcentaje_descuento` decimal(5,2) NOT NULL,
  `limite_usos` int DEFAULT '1',
  `usos_actuales` int DEFAULT '0',
  `fecha_inicio` datetime DEFAULT NULL,
  `fecha_fin` datetime DEFAULT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `limite_por_cliente` int DEFAULT '1' COMMENT '1=una vez por cliente, 2=dos veces, 0 o NULL=sin l??mite por cliente',
  PRIMARY KEY (`id`),
  UNIQUE KEY `evento_codigo` (`evento_id`,`codigo`),
  KEY `idx_evento_id` (`evento_id`),
  KEY `idx_codigo` (`codigo`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cupones`
--

LOCK TABLES `cupones` WRITE;
/*!40000 ALTER TABLE `cupones` DISABLE KEYS */;
/*!40000 ALTER TABLE `cupones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cupones_descuento`
--

DROP TABLE IF EXISTS `cupones_descuento`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cupones_descuento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codigo` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo_descuento` enum('porcentaje','monto_fijo') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'porcentaje',
  `valor_descuento` decimal(10,2) NOT NULL,
  `monto_minimo` decimal(10,2) DEFAULT '0.00',
  `monto_maximo_descuento` decimal(10,2) DEFAULT NULL,
  `evento_id` int DEFAULT NULL,
  `uso_maximo` int DEFAULT NULL,
  `uso_actual` int DEFAULT '0',
  `uso_por_cliente` int DEFAULT '1',
  `fecha_inicio` datetime DEFAULT NULL,
  `fecha_fin` datetime DEFAULT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo` (`codigo`),
  KEY `idx_codigo` (`codigo`),
  KEY `idx_evento_id` (`evento_id`),
  KEY `idx_activo` (`activo`),
  KEY `idx_fechas` (`fecha_inicio`,`fecha_fin`),
  CONSTRAINT `cupones_evento_fk` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cupones_descuento`
--

LOCK TABLES `cupones_descuento` WRITE;
/*!40000 ALTER TABLE `cupones_descuento` DISABLE KEYS */;
/*!40000 ALTER TABLE `cupones_descuento` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cupones_usados`
--

DROP TABLE IF EXISTS `cupones_usados`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cupones_usados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cupon_id` int NOT NULL,
  `compra_id` int NOT NULL,
  `descuento_aplicado` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total_antes_descuento` decimal(10,2) DEFAULT NULL,
  `total_despues_descuento` decimal(10,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cupon_id` (`cupon_id`),
  KEY `idx_compra_id` (`compra_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cupones_usados`
--

LOCK TABLES `cupones_usados` WRITE;
/*!40000 ALTER TABLE `cupones_usados` DISABLE KEYS */;
/*!40000 ALTER TABLE `cupones_usados` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `entradas`
--

DROP TABLE IF EXISTS `entradas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `entradas`
--

LOCK TABLES `entradas` WRITE;
/*!40000 ALTER TABLE `entradas` DISABLE KEYS */;
/*!40000 ALTER TABLE `entradas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `escaneos_entradas`
--

DROP TABLE IF EXISTS `escaneos_entradas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `escaneos_entradas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tipo` enum('ASIENTO','MESA','GENERAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `compra_asiento_id` int DEFAULT NULL,
  `compra_mesa_id` int DEFAULT NULL,
  `compra_id` int NOT NULL,
  `evento_id` int NOT NULL,
  `usuario_escaneo_id` int DEFAULT NULL,
  `fecha_escaneo` datetime DEFAULT CURRENT_TIMESTAMP,
  `datos_qr` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `compra_entrada_general_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_compra_id` (`compra_id`),
  KEY `idx_evento_id` (`evento_id`),
  KEY `idx_fecha_escaneo` (`fecha_escaneo`),
  KEY `idx_usuario_escaneo` (`usuario_escaneo_id`),
  KEY `idx_compra_entrada_general` (`compra_entrada_general_id`),
  CONSTRAINT `escaneos_entradas_ibfk_1` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE CASCADE,
  CONSTRAINT `escaneos_entradas_ibfk_2` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `escaneos_entradas`
--

LOCK TABLES `escaneos_entradas` WRITE;
/*!40000 ALTER TABLE `escaneos_entradas` DISABLE KEYS */;
/*!40000 ALTER TABLE `escaneos_entradas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `eventos`
--

DROP TABLE IF EXISTS `eventos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `eventos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `imagen` varchar(255) NOT NULL,
  `qr_pago_url` varchar(255) DEFAULT NULL,
  `titulo` varchar(120) NOT NULL,
  `descripcion` text NOT NULL,
  `ubicacion` varchar(255) DEFAULT NULL,
  `ciudad` varchar(100) DEFAULT NULL,
  `hora_inicio` datetime NOT NULL,
  `hora_fin` datetime DEFAULT NULL,
  `precio` decimal(10,2) NOT NULL DEFAULT '0.00',
  `es_nuevo` tinyint(1) NOT NULL DEFAULT '0',
  `tipo_evento` enum('general','especial') NOT NULL DEFAULT 'general',
  `estado` varchar(20) DEFAULT 'activo',
  `capacidad_maxima` int DEFAULT NULL,
  `limite_entradas` int DEFAULT NULL,
  `forma_espacio` enum('rectangulo','cuadrado','triangulo','circulo') DEFAULT NULL,
  `escenario_x` int DEFAULT NULL,
  `escenario_y` int DEFAULT NULL,
  `escenario_width` int DEFAULT NULL,
  `escenario_height` int DEFAULT NULL,
  `layout_bloqueado` tinyint(1) DEFAULT '0',
  `hoja_ancho` int DEFAULT NULL,
  `hoja_alto` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tipo_evento` (`tipo_evento`)
) ENGINE=InnoDB AUTO_INCREMENT=50 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `eventos`
--

LOCK TABLES `eventos` WRITE;
/*!40000 ALTER TABLE `eventos` DISABLE KEYS */;
/*!40000 ALTER TABLE `eventos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `historial_precios`
--

DROP TABLE IF EXISTS `historial_precios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `historial_precios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tipo_precio_id` int NOT NULL,
  `evento_id` int NOT NULL,
  `precio_anterior` decimal(10,2) NOT NULL,
  `precio_nuevo` decimal(10,2) NOT NULL,
  `usuario_id` int DEFAULT NULL,
  `motivo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tipo_precio_id` (`tipo_precio_id`),
  KEY `idx_evento_id` (`evento_id`),
  KEY `idx_usuario_id` (`usuario_id`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `historial_precios_evento_fk` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `historial_precios_tipo_fk` FOREIGN KEY (`tipo_precio_id`) REFERENCES `tipos_precio_evento` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `historial_precios`
--

LOCK TABLES `historial_precios` WRITE;
/*!40000 ALTER TABLE `historial_precios` DISABLE KEYS */;
/*!40000 ALTER TABLE `historial_precios` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `logs_sistema`
--

DROP TABLE IF EXISTS `logs_sistema`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `logs_sistema` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tipo` enum('info','warning','error','debug') COLLATE utf8mb4_unicode_ci DEFAULT 'info',
  `modulo` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `accion` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `datos_adicionales` json DEFAULT NULL,
  `usuario_id` int DEFAULT NULL,
  `cliente_id` int DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tipo` (`tipo`),
  KEY `idx_modulo` (`modulo`),
  KEY `idx_usuario_id` (`usuario_id`),
  KEY `idx_cliente_id` (`cliente_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `logs_sistema`
--

LOCK TABLES `logs_sistema` WRITE;
/*!40000 ALTER TABLE `logs_sistema` DISABLE KEYS */;
/*!40000 ALTER TABLE `logs_sistema` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `mesas`
--

DROP TABLE IF EXISTS `mesas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=709 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `mesas`
--

LOCK TABLES `mesas` WRITE;
/*!40000 ALTER TABLE `mesas` DISABLE KEYS */;
/*!40000 ALTER TABLE `mesas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notificaciones`
--

DROP TABLE IF EXISTS `notificaciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notificaciones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tipo_destinatario` enum('usuario','cliente') COLLATE utf8mb4_unicode_ci NOT NULL,
  `destinatario_id` int NOT NULL,
  `titulo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mensaje` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` enum('info','success','warning','error') COLLATE utf8mb4_unicode_ci DEFAULT 'info',
  `leida` tinyint(1) DEFAULT '0',
  `fecha_lectura` datetime DEFAULT NULL,
  `enlace` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `datos_adicionales` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tipo_destinatario` (`tipo_destinatario`),
  KEY `idx_destinatario_id` (`destinatario_id`),
  KEY `idx_leida` (`leida`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notificaciones`
--

LOCK TABLES `notificaciones` WRITE;
/*!40000 ALTER TABLE `notificaciones` DISABLE KEYS */;
/*!40000 ALTER TABLE `notificaciones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pagos`
--

DROP TABLE IF EXISTS `pagos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pagos`
--

LOCK TABLES `pagos` WRITE;
/*!40000 ALTER TABLE `pagos` DISABLE KEYS */;
/*!40000 ALTER TABLE `pagos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reportes_generados`
--

DROP TABLE IF EXISTS `reportes_generados`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reportes_generados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` enum('ventas','eventos','clientes','escaneos','general') COLLATE utf8mb4_unicode_ci NOT NULL,
  `evento_id` int DEFAULT NULL,
  `fecha_inicio` date DEFAULT NULL,
  `fecha_fin` date DEFAULT NULL,
  `ruta_archivo` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `formato` enum('pdf','excel','csv') COLLATE utf8mb4_unicode_ci DEFAULT 'pdf',
  `usuario_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tipo` (`tipo`),
  KEY `idx_evento_id` (`evento_id`),
  KEY `idx_usuario_id` (`usuario_id`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `reportes_evento_fk` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reportes_generados`
--

LOCK TABLES `reportes_generados` WRITE;
/*!40000 ALTER TABLE `reportes_generados` DISABLE KEYS */;
/*!40000 ALTER TABLE `reportes_generados` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (1,'admin','Administrador del sistema con acceso completo',1,'2025-11-28 00:17:19','2025-11-28 00:17:19'),(2,'seguridad','Personal de seguridad con permisos limitados',1,'2025-11-28 00:17:19','2025-11-28 00:17:19'),(4,'vendedor','personal de venta',1,'2026-02-22 12:11:30','2026-02-22 12:11:30');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sesiones_whatsapp`
--

DROP TABLE IF EXISTS `sesiones_whatsapp`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sesiones_whatsapp` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre_sesion` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'default',
  `numero_telefono` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado` enum('desconectado','conectando','conectado','error') COLLATE utf8mb4_unicode_ci DEFAULT 'desconectado',
  `ultimo_qr` text COLLATE utf8mb4_unicode_ci,
  `ultima_conexion` datetime DEFAULT NULL,
  `datos_sesion` longtext COLLATE utf8mb4_unicode_ci,
  `activo` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre_sesion` (`nombre_sesion`),
  KEY `idx_estado` (`estado`),
  KEY `idx_activo` (`activo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sesiones_whatsapp`
--

LOCK TABLES `sesiones_whatsapp` WRITE;
/*!40000 ALTER TABLE `sesiones_whatsapp` DISABLE KEYS */;
/*!40000 ALTER TABLE `sesiones_whatsapp` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tipos_precio_evento`
--

DROP TABLE IF EXISTS `tipos_precio_evento`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
  `limite` int DEFAULT NULL COMMENT 'Límite de entradas para este tipo (VIP, General, etc.); NULL = sin límite',
  PRIMARY KEY (`id`),
  KEY `idx_evento` (`evento_id`),
  KEY `idx_activo` (`activo`),
  CONSTRAINT `tipos_precio_evento_ibfk_1` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=82 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tipos_precio_evento`
--

LOCK TABLES `tipos_precio_evento` WRITE;
/*!40000 ALTER TABLE `tipos_precio_evento` DISABLE KEYS */;
/*!40000 ALTER TABLE `tipos_precio_evento` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `uso_cupones`
--

DROP TABLE IF EXISTS `uso_cupones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `uso_cupones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cupon_id` int NOT NULL,
  `compra_id` int NOT NULL,
  `cliente_id` int DEFAULT NULL,
  `monto_descuento` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cupon_id` (`cupon_id`),
  KEY `idx_compra_id` (`compra_id`),
  KEY `idx_cliente_id` (`cliente_id`),
  CONSTRAINT `uso_cupones_cliente_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `uso_cupones_compra_fk` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE CASCADE,
  CONSTRAINT `uso_cupones_cupon_fk` FOREIGN KEY (`cupon_id`) REFERENCES `cupones_descuento` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `uso_cupones`
--

LOCK TABLES `uso_cupones` WRITE;
/*!40000 ALTER TABLE `uso_cupones` DISABLE KEYS */;
/*!40000 ALTER TABLE `uso_cupones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `usuarios`
--

DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usuarios`
--

LOCK TABLES `usuarios` WRITE;
/*!40000 ALTER TABLE `usuarios` DISABLE KEYS */;
INSERT INTO `usuarios` VALUES (1,'adminsp','Administrador Principal','1234567890','reviewiasit@gmail.com','12344321',1,1,'2025-11-28 00:17:19','2026-02-13 15:17:36'),(5,'vendedor','jose el vendedor','67676767','dehator413@iaciu.com','123123',1,4,'2026-02-22 12:25:54','2026-02-22 12:25:54'),(6,'seguridad','escaneador luis','67676767','wch21chw@gmail.com','123123',1,2,'2026-02-22 14:52:53','2026-02-22 14:52:53');
/*!40000 ALTER TABLE `usuarios` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-22 19:33:03
