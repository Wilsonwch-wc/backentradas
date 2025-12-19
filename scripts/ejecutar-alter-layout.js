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

async function ejecutarScript() {
  let connection = null;

  try {
    console.log('🚀 Ejecutando script para agregar campos de layout...\n');
    console.log('📊 Configuración:');
    console.log(`   Host: ${dbConfig.host}`);
    console.log(`   Database: ${dbConfig.database}`);
    console.log(`   User: ${dbConfig.user}\n`);

    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexión establecida\n');

    const sentencias = [
      // Agregar campos de posición a mesas
      `ALTER TABLE \`mesas\` 
       ADD COLUMN \`posicion_x\` INT NULL DEFAULT NULL AFTER \`activo\`,
       ADD COLUMN \`posicion_y\` INT NULL DEFAULT NULL AFTER \`posicion_x\``,
      
      // Agregar campos de posición a asientos
      `ALTER TABLE \`asientos\` 
       ADD COLUMN \`posicion_x\` INT NULL DEFAULT NULL AFTER \`estado\`,
       ADD COLUMN \`posicion_y\` INT NULL DEFAULT NULL AFTER \`posicion_x\``,
      
      // Agregar campos de forma y escenario a eventos
      `ALTER TABLE \`eventos\` 
       ADD COLUMN \`forma_espacio\` ENUM('rectangulo', 'cuadrado', 'triangulo', 'circulo') NULL DEFAULT NULL AFTER \`capacidad_maxima\``,
      
      `ALTER TABLE \`eventos\` 
       ADD COLUMN \`escenario_x\` INT NULL DEFAULT NULL AFTER \`forma_espacio\`,
       ADD COLUMN \`escenario_y\` INT NULL DEFAULT NULL AFTER \`escenario_x\`,
       ADD COLUMN \`escenario_width\` INT NULL DEFAULT NULL AFTER \`escenario_y\`,
       ADD COLUMN \`escenario_height\` INT NULL DEFAULT NULL AFTER \`escenario_width\``
    ];

    console.log(`📄 Ejecutando ${sentencias.length} sentencias...\n`);

    for (let i = 0; i < sentencias.length; i++) {
      try {
        await connection.query(sentencias[i]);
        console.log(`   ✅ Sentencia ${i + 1}/${sentencias.length} ejecutada`);
      } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME' || error.message.includes('Duplicate column name')) {
          console.log(`   ⚠️  Sentencia ${i + 1}/${sentencias.length} omitida (columna ya existe)`);
        } else {
          console.error(`   ❌ Error en sentencia ${i + 1}/${sentencias.length}:`, error.message);
        }
      }
    }

    console.log('\n✨ Script ejecutado correctamente!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   Verifica las credenciales de la base de datos');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('   La base de datos no existe');
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Conexión cerrada');
    }
  }
}

ejecutarScript();
