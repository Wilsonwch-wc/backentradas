import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'entradas_db'
};

async function agregarLayoutBloqueado() {
  let connection = null;

  try {
    console.log('🔍 Verificando y agregando columna layout_bloqueado...\n');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexión establecida\n');

    // Verificar si la columna existe
    const [columnas] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'eventos' 
       AND COLUMN_NAME = 'layout_bloqueado'`,
      [dbConfig.database]
    );

    if (columnas.length === 0) {
      console.log('   ➕ Agregando layout_bloqueado...');
      await connection.query(
        `ALTER TABLE eventos 
         ADD COLUMN layout_bloqueado TINYINT(1) DEFAULT 0 
         AFTER escenario_height`
      );
      console.log('   ✅ layout_bloqueado agregada');
    } else {
      console.log('   ✅ layout_bloqueado ya existe');
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

agregarLayoutBloqueado();

