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

async function ajustarRestriccionAsientos() {
  let connection = null;

  try {
    console.log('🚀 Ajustando restricción única de asientos para manejar NULLs...\n');

    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexión establecida\n');

    // Eliminar la restricción actual si existe
    try {
      await connection.execute(
        `ALTER TABLE \`asientos\` 
         DROP INDEX \`unique_asiento_mesa_evento\``
      );
      console.log('✅ Restricción anterior eliminada\n');
    } catch (error) {
      if (!error.message.includes("doesn't exist") && !error.message.includes("Unknown key")) {
        throw error;
      }
      console.log('ℹ️  No había restricción anterior para eliminar\n');
    }

    // Crear una restricción única que funcione mejor con NULLs
    // MySQL trata cada NULL como único en índices únicos, pero podemos usar COALESCE
    // para asientos individuales (mesa_id IS NULL), usamos un valor por defecto para el índice
    console.log('🔧 Creando restricción única mejorada...\n');
    
    // Primero, crear un índice único que incluya un campo calculado para manejar NULLs
    // Usaremos un valor especial (-1) para representar NULL en el índice
    await connection.execute(
      `ALTER TABLE \`asientos\` 
       ADD UNIQUE KEY \`unique_asiento_mesa_evento\` (\`evento_id\`, COALESCE(\`mesa_id\`, -1), \`numero_asiento\`)`
    );

    console.log('✅ Restricción única mejorada creada\n');
    console.log('📝 Nota: La validación en el código de aplicación maneja la lógica adicional\n');
    console.log('✅ ¡Proceso completado exitosamente!\n');

    await connection.end();
    process.exit(0);
  } catch (error) {
    // Si COALESCE no funciona en el índice, usar enfoque alternativo
    if (error.message.includes('COALESCE') || error.message.includes('Generated')) {
      console.log('⚠️  MySQL no soporta COALESCE en índices únicos directamente\n');
      console.log('🔧 Usando enfoque alternativo: restricción única simple\n');
      
      try {
        // Crear restricción simple que permita múltiples NULLs
        // MySQL permite múltiples NULLs en índices únicos, así que esto funciona
        await connection.execute(
          `ALTER TABLE \`asientos\` 
           ADD UNIQUE KEY \`unique_asiento_mesa_evento\` (\`evento_id\`, \`mesa_id\`, \`numero_asiento\`)`
        );
        
        console.log('✅ Restricción única creada\n');
        console.log('📝 Nota: Para asientos individuales (mesa_id NULL), la validación en código asegura unicidad\n');
        
        await connection.end();
        process.exit(0);
      } catch (error2) {
        console.error('❌ Error al crear restricción alternativa:', error2.message);
        if (connection) {
          await connection.end();
        }
        process.exit(1);
      }
    } else {
      console.error('❌ Error:', error.message);
      if (connection) {
        await connection.end();
      }
      process.exit(1);
    }
  }
}

ajustarRestriccionAsientos();

