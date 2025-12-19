import pool from '../config/db.js';

const agregarColumnaQr = async () => {
  try {
    // Verificar si la columna ya existe
    const [rows] = await pool.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'eventos' 
         AND COLUMN_NAME = 'qr_pago_url'`
    );

    if (rows.length > 0) {
      console.log('ℹ️  La columna qr_pago_url ya existe en eventos');
      process.exit(0);
    }

    // Agregar la columna
    await pool.execute(
      `ALTER TABLE eventos ADD COLUMN qr_pago_url VARCHAR(255) NULL AFTER imagen`
    );

    console.log('✅ Columna qr_pago_url agregada en eventos');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al agregar columna qr_pago_url:', error.message);
    process.exit(1);
  }
};

agregarColumnaQr();

