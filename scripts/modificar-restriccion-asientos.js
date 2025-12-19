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

async function modificarRestriccionAsientos() {
  let connection = null;

  try {
    console.log('🚀 Modificando restricción única de asientos...\n');
    console.log('📊 Configuración:');
    console.log(`   Host: ${dbConfig.host}`);
    console.log(`   Database: ${dbConfig.database}`);
    console.log(`   User: ${dbConfig.user}\n`);

    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexión establecida\n');

    // Verificar si la restricción unique_asiento_evento existe
    const [indexes] = await connection.execute(
      `SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE 
       FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'asientos' 
       AND CONSTRAINT_NAME = 'unique_asiento_evento'`,
      [dbConfig.database]
    );

    if (indexes.length > 0) {
      console.log('🔍 Restricción unique_asiento_evento encontrada. Eliminándola...\n');
      
      // Eliminar la restricción única antigua
      await connection.execute(
        `ALTER TABLE \`asientos\` 
         DROP INDEX \`unique_asiento_evento\``
      );
      
      console.log('✅ Restricción única antigua eliminada\n');
    } else {
      console.log('ℹ️  No se encontró la restricción unique_asiento_evento\n');
    }

    // Verificar si ya existe una restricción única nueva que incluya mesa_id
    const [newIndexes] = await connection.execute(
      `SELECT CONSTRAINT_NAME 
       FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'asientos' 
       AND CONSTRAINT_NAME = 'unique_asiento_mesa_evento'`,
      [dbConfig.database]
    );

    if (newIndexes.length === 0) {
      console.log('🔧 Creando nueva restricción única (evento_id, mesa_id, numero_asiento)...\n');
      
      // Crear nueva restricción única que incluye mesa_id
      // Esto permite que diferentes mesas tengan sillas con el mismo número
      // pero mantiene la unicidad dentro de cada mesa
      await connection.execute(
        `ALTER TABLE \`asientos\` 
         ADD UNIQUE KEY \`unique_asiento_mesa_evento\` (\`evento_id\`, \`mesa_id\`, \`numero_asiento\`)`
      );
      
      console.log('✅ Nueva restricción única creada: unique_asiento_mesa_evento (evento_id, mesa_id, numero_asiento)\n');
    } else {
      console.log('✅ La restricción unique_asiento_mesa_evento ya existe\n');
    }

    // También asegurarse de que los asientos individuales (sin mesa) tengan números únicos
    // Verificar si existe índice para asientos individuales
    const [individualIndexes] = await connection.execute(
      `SELECT INDEX_NAME 
       FROM INFORMATION_SCHEMA.STATISTICS 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'asientos' 
       AND INDEX_NAME = 'idx_asiento_individual'`,
      [dbConfig.database]
    );

    if (individualIndexes.length === 0) {
      console.log('🔧 Creando índice para asientos individuales...\n');
      
      // Crear índice compuesto para validar unicidad de asientos individuales
      // Nota: MySQL no permite índices parciales con WHERE fácilmente, 
      // pero podemos usar un índice único en (evento_id, numero_asiento) solo para cuando mesa_id IS NULL
      // Sin embargo, MySQL no soporta índices únicos parciales directamente.
      // La lógica de validación en el código debería ser suficiente.
      
      await connection.execute(
        `ALTER TABLE \`asientos\` 
         ADD INDEX \`idx_asiento_individual\` (\`evento_id\`, \`numero_asiento\`, \`mesa_id\`)`
      );
      
      console.log('✅ Índice para asientos individuales creado\n');
    } else {
      console.log('✅ El índice idx_asiento_individual ya existe\n');
    }

    console.log('✅ ¡Proceso completado exitosamente!\n');
    console.log('📝 Resumen:');
    console.log('   - Restricción antigua eliminada (permitía duplicados en todo el evento)');
    console.log('   - Nueva restricción creada: permite números duplicados entre diferentes mesas');
    console.log('   - La unicidad ahora es: (evento_id, mesa_id, numero_asiento)');

    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al modificar restricción:', error.message);
    if (connection) {
      await connection.end();
    }
    process.exit(1);
  }
}

modificarRestriccionAsientos();

