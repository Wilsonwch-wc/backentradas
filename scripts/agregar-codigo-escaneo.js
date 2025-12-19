import pool from '../config/db.js';

const agregarCodigoEscaneo = async () => {
  try {
    console.log('🔄 Agregando columna codigo_escaneo a las tablas...\n');

    // Verificar y agregar campo a compras_asientos
    const [columnasAsientos] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'compras_asientos' 
        AND COLUMN_NAME = 'codigo_escaneo'
    `);

    if (columnasAsientos.length === 0) {
      await pool.execute(`
        ALTER TABLE compras_asientos 
        ADD COLUMN codigo_escaneo VARCHAR(5) UNIQUE NULL,
        ADD INDEX idx_codigo_escaneo (codigo_escaneo)
      `);
      console.log('✅ Campo codigo_escaneo agregado a compras_asientos');
    } else {
      console.log('⚠️  Campo codigo_escaneo ya existe en compras_asientos');
    }

    // Verificar y agregar campo a compras_mesas
    const [columnasMesas] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'compras_mesas' 
        AND COLUMN_NAME = 'codigo_escaneo'
    `);

    if (columnasMesas.length === 0) {
      await pool.execute(`
        ALTER TABLE compras_mesas 
        ADD COLUMN codigo_escaneo VARCHAR(5) UNIQUE NULL,
        ADD INDEX idx_codigo_escaneo (codigo_escaneo)
      `);
      console.log('✅ Campo codigo_escaneo agregado a compras_mesas');
    } else {
      console.log('⚠️  Campo codigo_escaneo ya existe en compras_mesas');
    }

    console.log('\n✅ Campos codigo_escaneo agregados exitosamente');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error al agregar campos codigo_escaneo:', error.message);
    console.error('Detalles:', error);
    process.exit(1);
  }
};

agregarCodigoEscaneo();

