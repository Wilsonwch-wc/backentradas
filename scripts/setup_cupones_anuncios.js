import pool from '../config/db.js';

async function setup() {
  try {
    console.log('Creando tablas de cupones para AnunciosYA...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cupones_anuncios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(50) NOT NULL UNIQUE,
        descripcion VARCHAR(255) NULL,
        tipo ENUM('gratis', 'porcentaje', 'monto') DEFAULT 'gratis',
        valor DECIMAL(10,2) DEFAULT 100.00,
        limite_usos INT DEFAULT 10,
        usos_actuales INT DEFAULT 0,
        limite_por_usuario INT DEFAULT 1,
        activo TINYINT(1) DEFAULT 1,
        fecha_expiracion DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cupones_anuncios_usos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_cupon INT NOT NULL,
        id_usuario INT NULL,
        correo VARCHAR(150) NULL,
        id_anuncio INT NULL,
        fecha_uso TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cupon (id_cupon),
        INDEX idx_usuario (id_usuario),
        INDEX idx_correo (correo),
        CONSTRAINT fk_cau_cupon FOREIGN KEY (id_cupon) REFERENCES cupones_anuncios(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Insertar cupón VPPP por defecto si no existe
    await pool.query(`
      INSERT INTO cupones_anuncios (codigo, descripcion, tipo, valor, limite_usos, usos_actuales, limite_por_usuario, activo)
      SELECT 'VPPP', 'Cupón de Publicación 100% Gratis', 'gratis', 100.00, 10, 0, 1, 1
      WHERE NOT EXISTS (SELECT 1 FROM cupones_anuncios WHERE codigo = 'VPPP');
    `);

    console.log('✅ Tablas cupones_anuncios y cupones_anuncios_usos creadas correctamente. Cupón VPPP activo con 10 usos.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creando tablas de cupones:', error);
    process.exit(1);
  }
}

setup();
