import pool from '../config/db.js';

const actualizarCodigoUnico = async () => {
  try {
    // Verificar si la tabla existe
    const [tables] = await pool.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'compras'`
    );

    if (tables.length === 0) {
      console.log('ℹ️  La tabla compras no existe. Ejecuta primero crear-tablas-compras.js');
      process.exit(0);
    }

    // Actualizar el tamaño de la columna
    await pool.execute(
      `ALTER TABLE compras MODIFY COLUMN codigo_unico VARCHAR(30) UNIQUE NOT NULL`
    );

    console.log('✅ Columna codigo_unico actualizada a VARCHAR(30)');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al actualizar columna codigo_unico:', error.message);
    process.exit(1);
  }
};

actualizarCodigoUnico();

