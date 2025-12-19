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

async function crearTablaAreas() {
  let connection = null;

  try {
    console.log('🚀 Creando tabla de áreas...\n');
    console.log('📊 Configuración:');
    console.log(`   Host: ${dbConfig.host}`);
    console.log(`   Database: ${dbConfig.database}`);
    console.log(`   User: ${dbConfig.user}\n`);

    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexión establecida\n');

    const sentencia = `
      CREATE TABLE IF NOT EXISTS \`areas_layout\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`evento_id\` int NOT NULL,
        \`nombre\` varchar(100) NOT NULL,
        \`posicion_x\` int NOT NULL,
        \`posicion_y\` int NOT NULL,
        \`ancho\` int NOT NULL,
        \`alto\` int NOT NULL,
        \`color\` varchar(20) DEFAULT '#CCCCCC',
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_evento\` (\`evento_id\`),
        CONSTRAINT \`areas_layout_ibfk_1\` FOREIGN KEY (\`evento_id\`) REFERENCES \`eventos\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `;

    console.log('📄 Ejecutando sentencia SQL...\n');
    await connection.execute(sentencia);
    console.log('✅ Tabla \`areas_layout\` creada exitosamente\n');

  } catch (error) {
    console.error('❌ Error al crear la tabla:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexión cerrada\n');
    }
  }
}

crearTablaAreas()
  .then(() => {
    console.log('✨ Proceso completado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Error fatal:', error);
    process.exit(1);
  });

