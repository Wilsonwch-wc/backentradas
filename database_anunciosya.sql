-- ====================================================================
-- Script Completo de Creación y Actualización de Base de Datos
-- Proyecto: PlusTicket / AnunciosYA
-- Base de Datos: entradas_db (MySQL)
-- ====================================================================

USE entradas_db;

-- 1. Rol para anunciantes de AnunciosYA
INSERT INTO roles (id, nombre, descripcion, activo)
SELECT 6, 'anunciante', 'Usuario registrado para publicar y gestionar anuncios en AnunciosYA', 1
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE nombre = 'anunciante' OR id = 6);

-- 2. Adaptar tabla `usuarios`
ALTER TABLE usuarios MODIFY COLUMN password VARCHAR(255) NULL;
ALTER TABLE usuarios MODIFY COLUMN nombre_usuario VARCHAR(100) NULL;

SET @db = DATABASE();

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'apellidos');
SET @q = IF(@col = 0, 'ALTER TABLE usuarios ADD COLUMN apellidos VARCHAR(100) NULL AFTER nombre_completo', 'SELECT 1');
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'ubicacion');
SET @q = IF(@col = 0, 'ALTER TABLE usuarios ADD COLUMN ubicacion VARCHAR(100) NULL AFTER telefono', 'SELECT 1');
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'direccion');
SET @q = IF(@col = 0, 'ALTER TABLE usuarios ADD COLUMN direccion VARCHAR(255) NULL AFTER ubicacion', 'SELECT 1');
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'google_id');
SET @q = IF(@col = 0, 'ALTER TABLE usuarios ADD COLUMN google_id VARCHAR(100) NULL UNIQUE AFTER correo', 'SELECT 1');
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'avatar_url');
SET @q = IF(@col = 0, 'ALTER TABLE usuarios ADD COLUMN avatar_url VARCHAR(500) NULL AFTER google_id', 'SELECT 1');
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'auth_provider');
SET @q = IF(@col = 0, 'ALTER TABLE usuarios ADD COLUMN auth_provider ENUM(\'local\', \'google\') DEFAULT \'local\' AFTER avatar_url', 'SELECT 1');
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- 3. Crear tabla `anuncios` si no existe
CREATE TABLE IF NOT EXISTS anuncios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  precio VARCHAR(50) NOT NULL,
  categoria VARCHAR(50) NOT NULL,
  ciudad VARCHAR(100) NOT NULL,
  descripcion TEXT NULL,
  imagen_principal MEDIUMTEXT NULL,
  imagenes_galeria LONGTEXT NULL,
  telefono_contacto VARCHAR(50) NULL,
  destacado TINYINT(1) DEFAULT 0,
  nuevo TINYINT(1) DEFAULT 1,
  estado ENUM('activo', 'pausado', 'vendido', 'eliminado') DEFAULT 'activo',
  visitas INT DEFAULT 0,
  color_titulo VARCHAR(50) NULL,
  dias_duracion INT DEFAULT 6,
  costo_total DECIMAL(10,2) DEFAULT 5.00,
  direccion VARCHAR(255) NULL,
  fecha_expiracion DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_anuncio_usuario (id_usuario),
  INDEX idx_anuncio_categoria (categoria),
  INDEX idx_anuncio_ciudad (ciudad),
  INDEX idx_anuncio_estado (estado),
  CONSTRAINT fk_anuncios_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Si ya existía, agregar columnas opcionales
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'anuncios' AND COLUMN_NAME = 'imagenes_galeria');
SET @q = IF(@col = 0, 'ALTER TABLE anuncios ADD COLUMN imagenes_galeria LONGTEXT NULL AFTER imagen_principal', 'SELECT 1');
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'anuncios' AND COLUMN_NAME = 'color_titulo');
SET @q = IF(@col = 0, 'ALTER TABLE anuncios ADD COLUMN color_titulo VARCHAR(50) NULL AFTER visitas', 'SELECT 1');
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'anuncios' AND COLUMN_NAME = 'dias_duracion');
SET @q = IF(@col = 0, 'ALTER TABLE anuncios ADD COLUMN dias_duracion INT DEFAULT 6 AFTER color_titulo', 'SELECT 1');
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'anuncios' AND COLUMN_NAME = 'costo_total');
SET @q = IF(@col = 0, 'ALTER TABLE anuncios ADD COLUMN costo_total DECIMAL(10,2) DEFAULT 5.00 AFTER dias_duracion', 'SELECT 1');
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'anuncios' AND COLUMN_NAME = 'direccion');
SET @q = IF(@col = 0, 'ALTER TABLE anuncios ADD COLUMN direccion VARCHAR(255) NULL AFTER costo_total', 'SELECT 1');
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'anuncios' AND COLUMN_NAME = 'fecha_expiracion');
SET @q = IF(@col = 0, 'ALTER TABLE anuncios ADD COLUMN fecha_expiracion DATETIME NULL AFTER direccion', 'SELECT 1');
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

ALTER TABLE anuncios MODIFY COLUMN imagen_principal MEDIUMTEXT NULL;

-- 4. Tabla `anuncios_imagenes`
CREATE TABLE IF NOT EXISTS anuncios_imagenes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_anuncio INT NOT NULL,
  url_imagen MEDIUMTEXT NOT NULL,
  orden INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_imagen_anuncio (id_anuncio),
  CONSTRAINT fk_imagenes_anuncio FOREIGN KEY (id_anuncio) REFERENCES anuncios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabla `anuncios_favoritos`
CREATE TABLE IF NOT EXISTS anuncios_favoritos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  id_anuncio INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_usuario_anuncio_fav (id_usuario, id_anuncio),
  INDEX idx_fav_usuario (id_usuario),
  INDEX idx_fav_anuncio (id_anuncio),
  CONSTRAINT fk_fav_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_fav_anuncio FOREIGN KEY (id_anuncio) REFERENCES anuncios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Tabla `anuncios_denuncias`
CREATE TABLE IF NOT EXISTS anuncios_denuncias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_anuncio INT NOT NULL,
  id_usuario INT NULL,
  motivo VARCHAR(100) NOT NULL,
  comentario TEXT NULL,
  contacto VARCHAR(100) NULL,
  estado ENUM('pendiente', 'revisado', 'desestimado') DEFAULT 'pendiente',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_denuncia_anuncio (id_anuncio),
  CONSTRAINT fk_denuncias_anuncio FOREIGN KEY (id_anuncio) REFERENCES anuncios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Asegurar usuario Administrador de AnunciosYA
INSERT INTO usuarios (
  nombre_usuario, nombre_completo, apellidos, correo,
  telefono, ubicacion, auth_provider, activo, id_rol, password
)
SELECT
  'admin_anuncios',
  'Administrador AnunciosYA',
  'Master',
  'reviewiasit@gmail.com',
  '70000000',
  'Cochabamba',
  'local',
  1,
  1,
  'admin123'
WHERE NOT EXISTS (
  SELECT 1 FROM usuarios WHERE LOWER(TRIM(correo)) = 'reviewiasit@gmail.com'
);

UPDATE usuarios
SET activo = 1,
    id_rol = 1
WHERE LOWER(TRIM(correo)) = 'reviewiasit@gmail.com';
