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

async function finalizarRestriccionAsientos() {
  let connection = null;

  try {
    console.log('🚀 Finalizando configuración de restricción única de asientos...\n');

    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexión establecida\n');

    // Verificar restricción actual
    const [indexes] = await connection.execute(
      `SELECT CONSTRAINT_NAME 
       FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'asientos' 
       AND CONSTRAINT_NAME = 'unique_asiento_mesa_evento'`,
      [dbConfig.database]
    );

    if (indexes.length > 0) {
      console.log('✅ La restricción unique_asiento_mesa_evento ya existe\n');
      console.log('📝 Configuración actual:');
      console.log('   - Restricción única: (evento_id, mesa_id, numero_asiento)');
      console.log('   - Permite números duplicados entre diferentes mesas');
      console.log('   - MySQL permite múltiples NULLs en índices únicos');
      console.log('   - La validación en código maneja la unicidad de asientos individuales\n');
      console.log('✅ ¡Configuración correcta! El sistema debería funcionar ahora.\n');
    } else {
      console.log('🔧 Creando restricción única...\n');
      
      await connection.execute(
        `ALTER TABLE \`asientos\` 
         ADD UNIQUE KEY \`unique_asiento_mesa_evento\` (\`evento_id\`, \`mesa_id\`, \`numero_asiento\`)`
      );
      
      console.log('✅ Restricción única creada\n');
    }

    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (connection) {
      await connection.end();
    }
    process.exit(1);
  }
}

finalizarRestriccionAsientos();

