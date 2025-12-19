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

async function limpiarYCrearRestriccion() {
  let connection = null;

  try {
    console.log('🚀 Limpiando y recreando restricción única de asientos...\n');

    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexión establecida\n');

    // Buscar TODAS las restricciones únicas en la tabla asientos
    const [allIndexes] = await connection.execute(
      `SELECT CONSTRAINT_NAME, COLUMN_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'asientos' 
       AND CONSTRAINT_NAME LIKE '%unique%' OR CONSTRAINT_NAME LIKE '%asiento%' OR CONSTRAINT_NAME LIKE '%evento%'
       ORDER BY CONSTRAINT_NAME`,
      [dbConfig.database]
    );

    console.log('🔍 Restricciones encontradas:\n');
    const uniqueConstraints = new Set();
    allIndexes.forEach(idx => {
      uniqueConstraints.add(idx.CONSTRAINT_NAME);
      console.log(`   - ${idx.CONSTRAINT_NAME} (${idx.COLUMN_NAME})`);
    });

    // Eliminar todas las restricciones relacionadas
    console.log('\n🗑️  Eliminando restricciones...\n');
    
    const constraintsToRemove = [
      'unique_asiento_evento',
      'unique_asiento_mesa_evento',
      'unique_evento_asiento'
    ];

    for (const constraintName of constraintsToRemove) {
      try {
        await connection.execute(
          `ALTER TABLE \`asientos\` DROP INDEX \`${constraintName}\``
        );
        console.log(`   ✅ Eliminada: ${constraintName}`);
      } catch (error) {
        if (error.message.includes("doesn't exist") || error.message.includes("Unknown key")) {
          console.log(`   ℹ️  No existía: ${constraintName}`);
        } else {
          console.log(`   ⚠️  Error al eliminar ${constraintName}: ${error.message}`);
        }
      }
    }

    // Crear la nueva restricción correcta
    console.log('\n🔧 Creando nueva restricción única...\n');
    
    try {
      await connection.execute(
        `ALTER TABLE \`asientos\` 
         ADD UNIQUE KEY \`unique_asiento_mesa_evento\` (\`evento_id\`, \`mesa_id\`, \`numero_asiento\`)`
      );
      console.log('✅ Nueva restricción creada: unique_asiento_mesa_evento (evento_id, mesa_id, numero_asiento)\n');
      console.log('📝 Esta restricción permite:');
      console.log('   - Diferentes mesas pueden tener sillas con el mismo número');
      console.log('   - Múltiples NULLs son permitidos (cada NULL es único en el índice)');
      console.log('   - La validación en código maneja la unicidad de asientos individuales\n');
    } catch (error) {
      if (error.message.includes('Duplicate key')) {
        console.log('⚠️  La restricción ya existe, omitiendo creación\n');
      } else {
        throw error;
      }
    }

    console.log('✅ ¡Proceso completado exitosamente!\n');
    console.log('🎯 Ahora puedes guardar mesas con sillas sin errores de duplicado.');

    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    if (connection) {
      await connection.end();
    }
    process.exit(1);
  }
}

limpiarYCrearRestriccion();

