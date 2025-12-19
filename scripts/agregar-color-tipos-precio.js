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

async function agregarColorTiposPrecio() {
  let connection = null;

  try {
    console.log('🚀 Agregando columna de color a tipos_precio_evento...\n');
    console.log('📊 Configuración:');
    console.log(`   Host: ${dbConfig.host}`);
    console.log(`   Database: ${dbConfig.database}`);
    console.log(`   User: ${dbConfig.user}\n`);

    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexión establecida\n');

    // Verificar si la columna ya existe
    const [columnas] = await connection.execute(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'tipos_precio_evento' 
       AND COLUMN_NAME = 'color'`,
      [dbConfig.database]
    );

    if (columnas.length === 0) {
      const sentencia = `
        ALTER TABLE \`tipos_precio_evento\` 
        ADD COLUMN \`color\` VARCHAR(20) DEFAULT '#CCCCCC' AFTER \`precio\`;
      `;

      console.log('📄 Ejecutando sentencia SQL...\n');
      await connection.execute(sentencia);
      console.log('✅ Columna \`color\` agregada exitosamente\n');
    } else {
      console.log('✅ La columna \`color\` ya existe\n');
    }

    // Actualizar colores por defecto según el nombre
    const actualizarColores = `
      UPDATE \`tipos_precio_evento\` 
      SET \`color\` = CASE 
        WHEN UPPER(\`nombre\`) LIKE '%VIP%' THEN '#4CAF50'
        WHEN UPPER(\`nombre\`) LIKE '%BALCON%' OR UPPER(\`nombre\`) LIKE '%BALCÓN%' THEN '#F44336'
        WHEN UPPER(\`nombre\`) LIKE '%GENERAL%' THEN '#9E9E9E'
        ELSE '#CCCCCC'
      END
      WHERE \`color\` = '#CCCCCC' OR \`color\` IS NULL;
    `;

    console.log('📄 Actualizando colores por defecto...\n');
    await connection.execute(actualizarColores);
    console.log('✅ Colores actualizados\n');

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

agregarColorTiposPrecio()
  .then(() => {
    console.log('✨ Proceso completado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Error fatal:', error);
    process.exit(1);
  });

