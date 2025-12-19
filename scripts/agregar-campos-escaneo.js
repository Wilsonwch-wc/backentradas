import pool from '../config/db.js';

const agregarCamposEscaneo = async () => {
  try {
    console.log('🔄 Agregando campos de escaneo a las tablas...\n');

    // Verificar y agregar campos a compras_asientos
    const [columnasAsientos] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'compras_asientos' 
        AND COLUMN_NAME IN ('escaneado', 'fecha_escaneo', 'usuario_escaneo_id')
    `);
    const columnasExistentesAsientos = columnasAsientos.map(c => c.COLUMN_NAME);

    if (!columnasExistentesAsientos.includes('escaneado')) {
      await pool.execute(`ALTER TABLE compras_asientos ADD COLUMN escaneado BOOLEAN DEFAULT FALSE`);
      console.log('✅ Campo escaneado agregado a compras_asientos');
    } else {
      console.log('⚠️  Campo escaneado ya existe en compras_asientos');
    }

    if (!columnasExistentesAsientos.includes('fecha_escaneo')) {
      await pool.execute(`ALTER TABLE compras_asientos ADD COLUMN fecha_escaneo DATETIME NULL`);
      console.log('✅ Campo fecha_escaneo agregado a compras_asientos');
    } else {
      console.log('⚠️  Campo fecha_escaneo ya existe en compras_asientos');
    }

    if (!columnasExistentesAsientos.includes('usuario_escaneo_id')) {
      await pool.execute(`ALTER TABLE compras_asientos ADD COLUMN usuario_escaneo_id INT NULL`);
      console.log('✅ Campo usuario_escaneo_id agregado a compras_asientos');
    } else {
      console.log('⚠️  Campo usuario_escaneo_id ya existe en compras_asientos');
    }

    // Agregar índices si no existen
    try {
      await pool.execute(`CREATE INDEX IF NOT EXISTS idx_escaneado ON compras_asientos(escaneado)`);
      await pool.execute(`CREATE INDEX IF NOT EXISTS idx_fecha_escaneo ON compras_asientos(fecha_escaneo)`);
    } catch (error) {
      if (error.code !== 'ER_DUP_KEYNAME') {
        console.log('⚠️  Algunos índices ya existen en compras_asientos');
      }
    }

    // Verificar y agregar campos a compras_mesas
    const [columnasMesas] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'compras_mesas' 
        AND COLUMN_NAME IN ('escaneado', 'fecha_escaneo', 'usuario_escaneo_id')
    `);
    const columnasExistentesMesas = columnasMesas.map(c => c.COLUMN_NAME);

    if (!columnasExistentesMesas.includes('escaneado')) {
      await pool.execute(`ALTER TABLE compras_mesas ADD COLUMN escaneado BOOLEAN DEFAULT FALSE`);
      console.log('✅ Campo escaneado agregado a compras_mesas');
    } else {
      console.log('⚠️  Campo escaneado ya existe en compras_mesas');
    }

    if (!columnasExistentesMesas.includes('fecha_escaneo')) {
      await pool.execute(`ALTER TABLE compras_mesas ADD COLUMN fecha_escaneo DATETIME NULL`);
      console.log('✅ Campo fecha_escaneo agregado a compras_mesas');
    } else {
      console.log('⚠️  Campo fecha_escaneo ya existe en compras_mesas');
    }

    if (!columnasExistentesMesas.includes('usuario_escaneo_id')) {
      await pool.execute(`ALTER TABLE compras_mesas ADD COLUMN usuario_escaneo_id INT NULL`);
      console.log('✅ Campo usuario_escaneo_id agregado a compras_mesas');
    } else {
      console.log('⚠️  Campo usuario_escaneo_id ya existe en compras_mesas');
    }

    // Agregar índices si no existen
    try {
      await pool.execute(`CREATE INDEX IF NOT EXISTS idx_escaneado ON compras_mesas(escaneado)`);
      await pool.execute(`CREATE INDEX IF NOT EXISTS idx_fecha_escaneo ON compras_mesas(fecha_escaneo)`);
    } catch (error) {
      if (error.code !== 'ER_DUP_KEYNAME') {
        console.log('⚠️  Algunos índices ya existen en compras_mesas');
      }
    }

    // Crear tabla de escaneos para auditoría (opcional pero recomendado)
    try {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS escaneos_entradas (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tipo ENUM('ASIENTO', 'MESA') NOT NULL,
          compra_asiento_id INT NULL,
          compra_mesa_id INT NULL,
          compra_id INT NOT NULL,
          evento_id INT NOT NULL,
          usuario_escaneo_id INT NULL,
          fecha_escaneo DATETIME DEFAULT CURRENT_TIMESTAMP,
          datos_qr TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
          FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
          INDEX idx_compra_id (compra_id),
          INDEX idx_evento_id (evento_id),
          INDEX idx_fecha_escaneo (fecha_escaneo),
          INDEX idx_usuario_escaneo (usuario_escaneo_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ Tabla escaneos_entradas creada exitosamente');
    } catch (error) {
      if (error.code === 'ER_TABLE_EXISTS_ERROR') {
        console.log('⚠️  La tabla escaneos_entradas ya existe');
      } else {
        throw error;
      }
    }

    console.log('\n✅ Campos de escaneo agregados exitosamente');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error al agregar campos de escaneo:', error.message);
    console.error('Detalles:', error);
    process.exit(1);
  }
};

agregarCamposEscaneo();

