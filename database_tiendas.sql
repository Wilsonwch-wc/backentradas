-- ====================================================================
-- Script de Migración: Módulo Tiendas y Productos
-- Proyecto: AnunciosYA
-- Base de Datos: entradas_db (MySQL)
-- ====================================================================

USE entradas_db;

SET @db = DATABASE();

-- 1. Agregar columna tipo_cuenta a usuarios (particular o dueño de negocio)
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'tipo_cuenta');
SET @q = IF(@col = 0,
  "ALTER TABLE usuarios ADD COLUMN tipo_cuenta ENUM('particular','negocio') DEFAULT 'particular' AFTER auth_provider",
  'SELECT 1');
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- 2. Tabla tiendas
CREATE TABLE IF NOT EXISTS tiendas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  nombre_tienda VARCHAR(150) NOT NULL,
  nombre_propietario VARCHAR(150) NOT NULL,
  descripcion TEXT NULL,
  ubicacion VARCHAR(100) NOT NULL DEFAULT 'Cochabamba',
  direccion VARCHAR(255) NULL,
  telefono VARCHAR(50) NULL,
  email VARCHAR(150) NULL,
  logo_url LONGTEXT NULL,
  banner_url LONGTEXT NULL,
  categoria_principal VARCHAR(80) NULL,
  activa TINYINT(1) DEFAULT 1,
  destacada TINYINT(1) DEFAULT 0,
  visitas INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tienda_usuario (id_usuario),
  INDEX idx_tienda_activa (activa),
  INDEX idx_tienda_ubicacion (ubicacion),
  CONSTRAINT fk_tienda_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla productos
CREATE TABLE IF NOT EXISTS productos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_tienda INT NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  descripcion TEXT NULL,
  categoria VARCHAR(80) NOT NULL DEFAULT 'otros',
  precio DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  cantidad_disponible INT NOT NULL DEFAULT 0,
  imagen_url LONGTEXT NULL,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_producto_tienda (id_tienda),
  INDEX idx_producto_categoria (categoria),
  INDEX idx_producto_activo (activo),
  CONSTRAINT fk_producto_tienda FOREIGN KEY (id_tienda) REFERENCES tiendas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Rol 'negocio' si no existe
INSERT INTO roles (id, nombre, descripcion, activo)
SELECT 7, 'negocio', 'Dueno de tienda o negocio registrado en AnunciosYA', 1
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE nombre = 'negocio' OR id = 7);

SELECT 'Migracion Tiendas y Productos completada exitosamente' AS resultado;
