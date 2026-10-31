import pool from '../config/db.js';

const migrate = async () => {
  console.log('🚀 Iniciando migración de Tiendas y Productos...');

  // 1. Tipo cuenta en usuarios
  try {
    await pool.query(
      "ALTER TABLE usuarios ADD COLUMN tipo_cuenta ENUM('particular','negocio') DEFAULT 'particular' AFTER auth_provider"
    );
    console.log('✅ Columna tipo_cuenta agregada a usuarios');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('⚠️  tipo_cuenta ya existe, omitiendo');
    } else {
      console.log('❌ tipo_cuenta error:', e.message);
    }
  }

  // 2. Tabla tiendas
  try {
    await pool.query(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Tabla tiendas creada/verificada');
  } catch (e) {
    console.log('⚠️  tiendas:', e.message);
  }

  // 3. Tabla productos
  try {
    await pool.query(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Tabla productos creada/verificada');
  } catch (e) {
    console.log('⚠️  productos:', e.message);
  }

  // 4. Rol negocio
  try {
    await pool.query(
      "INSERT IGNORE INTO roles (id, nombre, descripcion, activo) VALUES (7, 'negocio', 'Dueno de tienda registrado en AnunciosYA', 1)"
    );
    console.log('✅ Rol negocio insertado/verificado');
  } catch (e) {
    console.log('⚠️  rol negocio:', e.message);
  }

  console.log('\n🎉 Migración de Tiendas y Productos completada!\n');
  process.exit(0);
};

migrate().catch(e => {
  console.error('❌ Error fatal en migración:', e);
  process.exit(1);
});
