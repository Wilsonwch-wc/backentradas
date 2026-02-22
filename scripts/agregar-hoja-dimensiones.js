import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'entradas_db'
};

async function agregarHojaDimensiones() {
  let connection = null;

  try {
    console.log('🔍 Verificando y agregando columnas hoja_ancho y hoja_alto...\n');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexión establecida\n');

    for (const col of ['hoja_ancho', 'hoja_alto']) {
      const [columnas] = await connection.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'eventos' 
         AND COLUMN_NAME = ?`,
        [dbConfig.database, col]
      );

      if (columnas.length === 0) {
        console.log(`   ➕ Agregando ${col}...`);
        const afterCol = col === 'hoja_ancho' ? 'layout_bloqueado' : 'hoja_ancho';
        await connection.query(
          `ALTER TABLE eventos 
           ADD COLUMN ${col} INT NULL DEFAULT NULL 
           AFTER ${afterCol}`
        );
        console.log(`   ✅ ${col} agregada`);
      } else {
        console.log(`   ✅ ${col} ya existe`);
      }
    }

    console.log('\n✅ Proceso completado');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

agregarHojaDimensiones();
