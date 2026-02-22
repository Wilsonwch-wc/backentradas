-- =====================================================
-- SCRIPT ÚNICO DE ACTUALIZACIÓN DE BASE DE DATOS
-- Base de datos: entradas_db
-- Uso: Solo AGREGA tablas/columnas que falten. NO elimina datos.
-- Ejecutar en el servidor: mysql -u root -p entradas_db < actualizar_bd_servidor.sql
-- =====================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ==================== CLIENTES ====================
-- Verificación email y recuperación contraseña

SET @q = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'codigo_verificacion') = 0,
    'ALTER TABLE clientes ADD COLUMN codigo_verificacion VARCHAR(6) DEFAULT NULL',
    'SELECT 1'
));
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @q = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'codigo_verificacion_expira') = 0,
    'ALTER TABLE clientes ADD COLUMN codigo_verificacion_expira DATETIME DEFAULT NULL',
    'SELECT 1'
));
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @q = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'codigo_recuperacion') = 0,
    'ALTER TABLE clientes ADD COLUMN codigo_recuperacion VARCHAR(6) DEFAULT NULL',
    'SELECT 1'
));
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @q = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'codigo_recuperacion_expira') = 0,
    'ALTER TABLE clientes ADD COLUMN codigo_recuperacion_expira DATETIME DEFAULT NULL',
    'SELECT 1'
));
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @q = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'email_verificado') = 0,
    'ALTER TABLE clientes ADD COLUMN email_verificado TINYINT(1) DEFAULT 0',
    'SELECT 1'
));
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ==================== EVENTOS ====================

SET @q = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'eventos' AND COLUMN_NAME = 'estado') = 0,
    'ALTER TABLE eventos ADD COLUMN estado VARCHAR(20) DEFAULT ''activo''',
    'SELECT 1'
));
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @q = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'eventos' AND COLUMN_NAME = 'ubicacion') = 0,
    'ALTER TABLE eventos ADD COLUMN ubicacion VARCHAR(255) DEFAULT NULL',
    'SELECT 1'
));
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @q = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'eventos' AND COLUMN_NAME = 'ciudad') = 0,
    'ALTER TABLE eventos ADD COLUMN ciudad VARCHAR(100) DEFAULT NULL',
    'SELECT 1'
));
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @q = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'eventos' AND COLUMN_NAME = 'hora_fin') = 0,
    'ALTER TABLE eventos ADD COLUMN hora_fin DATETIME DEFAULT NULL',
    'SELECT 1'
));
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ==================== COMPRAS ====================

SET @q = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'compras' AND COLUMN_NAME = 'cliente_id') = 0,
    'ALTER TABLE compras ADD COLUMN cliente_id INT DEFAULT NULL',
    'SELECT 1'
));
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @q = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'compras' AND COLUMN_NAME = 'cupon_id') = 0,
    'ALTER TABLE compras ADD COLUMN cupon_id INT DEFAULT NULL',
    'SELECT 1'
));
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @q = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'compras' AND COLUMN_NAME = 'descuento') = 0,
    'ALTER TABLE compras ADD COLUMN descuento DECIMAL(10,2) DEFAULT 0.00',
    'SELECT 1'
));
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @q = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'compras' AND COLUMN_NAME = 'subtotal') = 0,
    'ALTER TABLE compras ADD COLUMN subtotal DECIMAL(10,2) DEFAULT 0.00',
    'SELECT 1'
));
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @q = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'compras' AND INDEX_NAME = 'idx_cliente_id') = 0,
    'ALTER TABLE compras ADD INDEX idx_cliente_id (cliente_id)',
    'SELECT 1'
));
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @q = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'compras' AND COLUMN_NAME = 'descuento_cupon') = 0,
    'ALTER TABLE compras ADD COLUMN descuento_cupon DECIMAL(10,2) DEFAULT 0.00',
    'SELECT 1'
));
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ==================== TABLAS NUEVAS ====================

-- Tabla cupones (usada por el backend para crear/validar cupones)
CREATE TABLE IF NOT EXISTS cupones (
  id INT NOT NULL AUTO_INCREMENT,
  evento_id INT NOT NULL,
  codigo VARCHAR(50) NOT NULL,
  porcentaje_descuento DECIMAL(5,2) NOT NULL,
  limite_usos INT DEFAULT 1,
  limite_por_cliente INT DEFAULT 1,
  usos_actuales INT DEFAULT 0,
  fecha_inicio DATETIME DEFAULT NULL,
  fecha_fin DATETIME DEFAULT NULL,
  descripcion VARCHAR(255) DEFAULT NULL,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_evento_id (evento_id),
  KEY idx_codigo (codigo),
  UNIQUE KEY evento_codigo (evento_id, codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Columna limite_por_cliente en cupones (si la tabla ya existía)
SET @q = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cupones' AND COLUMN_NAME = 'limite_por_cliente') = 0,
    'ALTER TABLE cupones ADD COLUMN limite_por_cliente INT DEFAULT 1 COMMENT ''1=una vez por cliente, 2=dos veces, 0 o NULL=sin límite por cliente''',
    'SELECT 1'
));
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- Tabla cupones_usados (registro de uso de cupones en compras)
CREATE TABLE IF NOT EXISTS cupones_usados (
  id INT NOT NULL AUTO_INCREMENT,
  cupon_id INT NOT NULL,
  compra_id INT NOT NULL,
  descuento_aplicado DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_antes_descuento DECIMAL(10,2) DEFAULT NULL,
  total_despues_descuento DECIMAL(10,2) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cupon_id (cupon_id),
  KEY idx_compra_id (compra_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sesiones_whatsapp (
  id INT NOT NULL AUTO_INCREMENT,
  nombre_sesion VARCHAR(100) NOT NULL DEFAULT 'default',
  numero_telefono VARCHAR(20) DEFAULT NULL,
  estado ENUM('desconectado', 'conectando', 'conectado', 'error') DEFAULT 'desconectado',
  ultimo_qr TEXT DEFAULT NULL,
  ultima_conexion DATETIME DEFAULT NULL,
  datos_sesion LONGTEXT DEFAULT NULL,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY nombre_sesion (nombre_sesion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS boletos_enviados (
  id INT NOT NULL AUTO_INCREMENT,
  compra_id INT NOT NULL,
  evento_id INT NOT NULL,
  cliente_id INT DEFAULT NULL,
  metodo_envio ENUM('email', 'whatsapp', 'ambos') NOT NULL,
  destinatario VARCHAR(255) NOT NULL,
  nombre_archivo VARCHAR(255) DEFAULT NULL,
  ruta_archivo VARCHAR(500) DEFAULT NULL,
  estado ENUM('pendiente', 'enviado', 'fallido', 'reenviado') DEFAULT 'pendiente',
  mensaje_error TEXT DEFAULT NULL,
  intentos INT DEFAULT 0,
  fecha_envio DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_compra_id (compra_id),
  KEY idx_evento_id (evento_id),
  KEY idx_cliente_id (cliente_id),
  KEY idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS configuracion_sistema (
  id INT NOT NULL AUTO_INCREMENT,
  clave VARCHAR(100) NOT NULL,
  valor TEXT DEFAULT NULL,
  tipo ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
  descripcion VARCHAR(255) DEFAULT NULL,
  categoria VARCHAR(50) DEFAULT 'general',
  editable TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY clave (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS logs_sistema (
  id INT NOT NULL AUTO_INCREMENT,
  tipo ENUM('info', 'warning', 'error', 'debug') DEFAULT 'info',
  modulo VARCHAR(100) DEFAULT NULL,
  accion VARCHAR(255) NOT NULL,
  descripcion TEXT DEFAULT NULL,
  datos_adicionales JSON DEFAULT NULL,
  usuario_id INT DEFAULT NULL,
  cliente_id INT DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  user_agent VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tipo (tipo),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notificaciones (
  id INT NOT NULL AUTO_INCREMENT,
  tipo_destinatario ENUM('usuario', 'cliente') NOT NULL,
  destinatario_id INT NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  mensaje TEXT NOT NULL,
  tipo ENUM('info', 'success', 'warning', 'error') DEFAULT 'info',
  leida TINYINT(1) DEFAULT 0,
  fecha_lectura DATETIME DEFAULT NULL,
  enlace VARCHAR(500) DEFAULT NULL,
  datos_adicionales JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tipo_destinatario (tipo_destinatario),
  KEY idx_destinatario_id (destinatario_id),
  KEY idx_leida (leida)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cupones_descuento (
  id INT NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(50) NOT NULL,
  descripcion VARCHAR(255) DEFAULT NULL,
  tipo_descuento ENUM('porcentaje', 'monto_fijo') NOT NULL DEFAULT 'porcentaje',
  valor_descuento DECIMAL(10,2) NOT NULL,
  monto_minimo DECIMAL(10,2) DEFAULT 0.00,
  monto_maximo_descuento DECIMAL(10,2) DEFAULT NULL,
  evento_id INT DEFAULT NULL,
  uso_maximo INT DEFAULT NULL,
  uso_actual INT DEFAULT 0,
  uso_por_cliente INT DEFAULT 1,
  fecha_inicio DATETIME DEFAULT NULL,
  fecha_fin DATETIME DEFAULT NULL,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY codigo (codigo),
  KEY idx_evento_id (evento_id),
  KEY idx_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS uso_cupones (
  id INT NOT NULL AUTO_INCREMENT,
  cupon_id INT NOT NULL,
  compra_id INT NOT NULL,
  cliente_id INT DEFAULT NULL,
  monto_descuento DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cupon_id (cupon_id),
  KEY idx_compra_id (compra_id),
  KEY idx_cliente_id (cliente_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS historial_precios (
  id INT NOT NULL AUTO_INCREMENT,
  tipo_precio_id INT NOT NULL,
  evento_id INT NOT NULL,
  precio_anterior DECIMAL(10,2) NOT NULL,
  precio_nuevo DECIMAL(10,2) NOT NULL,
  usuario_id INT DEFAULT NULL,
  motivo VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tipo_precio_id (tipo_precio_id),
  KEY idx_evento_id (evento_id),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reportes_generados (
  id INT NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(255) NOT NULL,
  tipo ENUM('ventas', 'eventos', 'clientes', 'escaneos', 'general') NOT NULL,
  evento_id INT DEFAULT NULL,
  fecha_inicio DATE DEFAULT NULL,
  fecha_fin DATE DEFAULT NULL,
  ruta_archivo VARCHAR(500) DEFAULT NULL,
  formato ENUM('pdf', 'excel', 'csv') DEFAULT 'pdf',
  usuario_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tipo (tipo),
  KEY idx_evento_id (evento_id),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Valores por defecto en configuracion_sistema (solo si no existen)
INSERT IGNORE INTO configuracion_sistema (clave, valor, tipo, descripcion, categoria) VALUES
('nombre_empresa', 'PlusTiket', 'string', 'Nombre de la empresa', 'general'),
('email_empresa', 'contacto@plustiket.com', 'string', 'Email de contacto', 'general'),
('telefono_empresa', '+591 70000000', 'string', 'Teléfono de contacto', 'general'),
('direccion_empresa', 'Quillacollo, Cochabamba, Bolivia', 'string', 'Dirección', 'general'),
('nit_empresa', '0', 'string', 'NIT de la empresa', 'facturacion'),
('tiempo_expiracion_reserva', '15', 'number', 'Minutos para expirar reserva', 'compras'),
('tiempo_expiracion_codigo_verificacion', '10', 'number', 'Minutos código verificación', 'seguridad'),
('tiempo_expiracion_codigo_recuperacion', '15', 'number', 'Minutos código recuperación', 'seguridad'),
('whatsapp_habilitado', 'true', 'boolean', 'Envío boletos por WhatsApp', 'whatsapp'),
('email_habilitado', 'true', 'boolean', 'Envío boletos por email', 'email'),
('max_intentos_envio', '3', 'number', 'Máximo intentos envío boletos', 'envios');

-- Actualizar eventos sin estado
UPDATE eventos SET estado = 'finalizado' WHERE hora_inicio < NOW() AND (estado IS NULL OR estado = '');
UPDATE eventos SET estado = 'activo' WHERE hora_inicio >= NOW() AND (estado IS NULL OR estado = '');

-- Marcar clientes Google como email verificado
UPDATE clientes SET email_verificado = 1 WHERE provider = 'google' AND (email_verificado IS NULL OR email_verificado = 0);
UPDATE clientes SET email_verificado = 1 WHERE provider = 'local' AND (email_verificado IS NULL OR email_verificado = 0);

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Actualización de BD completada. Solo se agregó lo que faltaba.' AS resultado;
