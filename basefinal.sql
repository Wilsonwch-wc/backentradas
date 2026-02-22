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
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_evento` (`evento_id`),
  CONSTRAINT `areas_layout_ibfk_1` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=61 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
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
) ENGINE=InnoDB AUTO_INCREMENT=3503 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `asientos`
--

LOCK TABLES `asientos` WRITE;
/*!40000 ALTER TABLE `asientos` DISABLE KEYS */;
/*!40000 ALTER TABLE `asientos` ENABLE KEYS */;
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `correo` (`correo`),
  KEY `idx_correo` (`correo`),
  KEY `idx_provider` (`provider`,`provider_id`),
  KEY `idx_activo` (`activo`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
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
  `cliente_nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cliente_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cliente_telefono` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cantidad` int NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `estado` enum('PAGO_PENDIENTE','PAGO_REALIZADO','CANCELADO','ENTRADA_USADA') COLLATE utf8mb4_unicode_ci DEFAULT 'PAGO_PENDIENTE',
  `fecha_compra` datetime DEFAULT CURRENT_TIMESTAMP,
  `fecha_pago` datetime DEFAULT NULL,
  `fecha_confirmacion` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `codigo_escaneo` varchar(5) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo_unico` (`codigo_unico`),
  UNIQUE KEY `codigo_unico_2` (`codigo_unico`),
  UNIQUE KEY `codigo_escaneo` (`codigo_escaneo`),
  KEY `idx_codigo_unico` (`codigo_unico`),
  KEY `idx_evento_id` (`evento_id`),
  KEY `idx_estado` (`estado`),
  KEY `idx_codigo_escaneo` (`codigo_escaneo`),
  CONSTRAINT `compras_ibfk_1` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `compras`
--

LOCK TABLES `compras` WRITE;
/*!40000 ALTER TABLE `compras` DISABLE KEYS */;
/*!40000 ALTER TABLE `compras` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `compras_asientos`
--

LOCK TABLES `compras_asientos` WRITE;
/*!40000 ALTER TABLE `compras_asientos` DISABLE KEYS */;
/*!40000 ALTER TABLE `compras_asientos` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `compras_entradas_generales`
--

LOCK TABLES `compras_entradas_generales` WRITE;
/*!40000 ALTER TABLE `compras_entradas_generales` DISABLE KEYS */;
INSERT INTO `compras_entradas_generales` VALUES (1,37,'23996',0,NULL,NULL,'2025-12-22 19:05:11','2025-12-22 19:05:11'),(2,37,'48692',0,NULL,NULL,'2025-12-22 19:05:11','2025-12-22 19:05:11'),(3,37,'80243',0,NULL,NULL,'2025-12-22 19:05:11','2025-12-22 19:05:11'),(4,37,'44630',0,NULL,NULL,'2025-12-22 19:05:11','2025-12-22 19:05:11'),(5,38,'66713',0,NULL,NULL,'2025-12-22 19:14:39','2025-12-22 19:14:39'),(6,38,'49431',0,NULL,NULL,'2025-12-22 19:14:39','2025-12-22 19:14:39'),(7,38,'99066',0,NULL,NULL,'2025-12-22 19:14:39','2025-12-22 19:14:39'),(8,38,'35942',0,NULL,NULL,'2025-12-22 19:14:39','2025-12-22 19:14:39'),(9,38,'37778',0,NULL,NULL,'2025-12-22 19:14:39','2025-12-22 19:14:39'),(10,38,'25241',0,NULL,NULL,'2025-12-22 19:14:39','2025-12-22 19:14:39'),(11,38,'95934',0,NULL,NULL,'2025-12-22 19:14:39','2025-12-22 19:14:39');
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
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `compras_mesas`
--

LOCK TABLES `compras_mesas` WRITE;
/*!40000 ALTER TABLE `compras_mesas` DISABLE KEYS */;
/*!40000 ALTER TABLE `compras_mesas` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contacto_info`
--

LOCK TABLES `contacto_info` WRITE;
/*!40000 ALTER TABLE `contacto_info` DISABLE KEYS */;
/*!40000 ALTER TABLE `contacto_info` ENABLE KEYS */;
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
  `tipo` enum('ASIENTO','MESA') COLLATE utf8mb4_unicode_ci NOT NULL,
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
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `eventos`
--

LOCK TABLES `eventos` WRITE;
/*!40000 ALTER TABLE `eventos` DISABLE KEYS */;
/*!40000 ALTER TABLE `eventos` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=492 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `mesas`
--

LOCK TABLES `mesas` WRITE;
/*!40000 ALTER TABLE `mesas` DISABLE KEYS */;
/*!40000 ALTER TABLE `mesas` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (1,'admin','Administrador del sistema con acceso completo',1,'2025-11-28 00:17:19','2025-11-28 00:17:19'),(2,'seguridad','Personal de seguridad con permisos limitados',1,'2025-11-28 00:17:19','2025-11-28 00:17:19');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
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
  PRIMARY KEY (`id`),
  KEY `idx_evento` (`evento_id`),
  KEY `idx_activo` (`activo`),
  CONSTRAINT `tipos_precio_evento_ibfk_1` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=51 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tipos_precio_evento`
--

LOCK TABLES `tipos_precio_evento` WRITE;
/*!40000 ALTER TABLE `tipos_precio_evento` DISABLE KEYS */;
/*!40000 ALTER TABLE `tipos_precio_evento` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usuarios`
--

LOCK TABLES `usuarios` WRITE;
/*!40000 ALTER TABLE `usuarios` DISABLE KEYS */;
INSERT INTO `usuarios` VALUES (1,'admin','Administrador Principal','1234567890','admin@entradas.com','admin123',1,1,'2025-11-28 00:17:19','2025-11-28 00:17:19'),(2,'seguridad1','Personal de Seguridad','0987654321','seguridad@entradas.com','123123',1,2,'2025-11-28 00:17:19','2025-12-12 15:23:32');
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

-- Dump completed on 2025-12-22 15:58:16
