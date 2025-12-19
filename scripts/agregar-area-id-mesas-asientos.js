import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'entradas_db',
  multipleStatements: true
};

async function agregarAreaId() {
  let connection = null;

  try {
    console.log('🚀 Agregando columna area_id a mesas y asientos...\n');
    console.log('📊 Configuración:');
    console.log(`   Host: ${dbConfig.host}`);
    console.log(`   Database: ${dbConfig.database}`);
    console.log(`   User: ${dbConfig.user}\n`);

    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexión establecida\n');

    // Verificar si la columna ya existe en mesas
    const [columnasMesas] = await connection.execute(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'mesas' 
       AND COLUMN_NAME = 'area_id'`,
      [dbConfig.database]
    );

    if (columnasMesas.length === 0) {
      const sentenciaMesas = `
        ALTER TABLE \`mesas\` 
        ADD COLUMN \`area_id\` INT NULL DEFAULT NULL AFTER \`posicion_y\`,
        ADD INDEX \`idx_area\` (\`area_id\`),
        ADD CONSTRAINT \`mesas_ibfk_area\` FOREIGN KEY (\`area_id\`) REFERENCES \`areas_layout\` (\`id\`) ON DELETE SET NULL;
      `;

      console.log('📄 Agregando area_id a mesas...\n');
      await connection.execute(sentenciaMesas);
      console.log('✅ Columna \`area_id\` agregada a mesas\n');
    } else {
      console.log('✅ La columna \`area_id\` ya existe en mesas\n');
    }

    // Verificar si la columna ya existe en asientos
    const [columnasAsientos] = await connection.execute(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'asientos' 
       AND COLUMN_NAME = 'area_id'`,
      [dbConfig.database]
    );

    if (columnasAsientos.length === 0) {
      const sentenciaAsientos = `
        ALTER TABLE \`asientos\` 
        ADD COLUMN \`area_id\` INT NULL DEFAULT NULL AFTER \`posicion_y\`,
        ADD INDEX \`idx_area\` (\`area_id\`),
        ADD CONSTRAINT \`asientos_ibfk_area\` FOREIGN KEY (\`area_id\`) REFERENCES \`areas_layout\` (\`id\`) ON DELETE SET NULL;
      `;

      console.log('📄 Agregando area_id a asientos...\n');
      await connection.execute(sentenciaAsientos);
      console.log('✅ Columna \`area_id\` agregada a asientos\n');
    } else {
      console.log('✅ La columna \`area_id\` ya existe en asientos\n');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexión cerrada\n');
    }
  }
}

agregarAreaId()
  .then(() => {
    console.log('✨ Proceso completado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Error fatal:', error);
    process.exit(1);
  });

