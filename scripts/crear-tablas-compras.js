import pool from '../config/db.js';

const crearTablasCompras = async () => {
  try {
    // Crear tabla de compras
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS compras (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo_unico VARCHAR(30) UNIQUE NOT NULL,
        evento_id INT NOT NULL,
        cliente_nombre VARCHAR(255) NOT NULL,
        cliente_email VARCHAR(255),
        cliente_telefono VARCHAR(50),
        cantidad INT NOT NULL,
        total DECIMAL(10, 2) NOT NULL,
        estado ENUM('PAGO_PENDIENTE', 'PAGO_REALIZADO', 'CANCELADO', 'ENTRADA_USADA') DEFAULT 'PAGO_PENDIENTE',
        fecha_compra DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_pago DATETIME NULL,
        fecha_confirmacion DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
        INDEX idx_codigo_unico (codigo_unico),
        INDEX idx_evento_id (evento_id),
        INDEX idx_estado (estado)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ Tabla compras creada exitosamente');

    // Crear tabla de compras_asientos (relación)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS compras_asientos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        compra_id INT NOT NULL,
        asiento_id INT NOT NULL,
        precio DECIMAL(10, 2) NOT NULL,
        estado ENUM('RESERVADO', 'CONFIRMADO', 'CANCELADO') DEFAULT 'RESERVADO',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
        FOREIGN KEY (asiento_id) REFERENCES asientos(id) ON DELETE CASCADE,
        UNIQUE KEY unique_compra_asiento (compra_id, asiento_id),
        INDEX idx_compra_id (compra_id),
        INDEX idx_asiento_id (asiento_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ Tabla compras_asientos creada exitosamente');

    // Crear tabla de compras_mesas (para mesas completas)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS compras_mesas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        compra_id INT NOT NULL,
        mesa_id INT NOT NULL,
        cantidad_sillas INT NOT NULL,
        precio_total DECIMAL(10, 2) NOT NULL,
        estado ENUM('RESERVADO', 'CONFIRMADO', 'CANCELADO') DEFAULT 'RESERVADO',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
        FOREIGN KEY (mesa_id) REFERENCES mesas(id) ON DELETE CASCADE,
        INDEX idx_compra_id (compra_id),
        INDEX idx_mesa_id (mesa_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ Tabla compras_mesas creada exitosamente');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error al crear tablas de compras:', error.message);
    console.error('Detalles:', error);
    process.exit(1);
  }
};

crearTablasCompras();

