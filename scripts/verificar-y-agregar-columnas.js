import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'entradas_db'
};

async function verificarYAgregar() {
  let connection = null;

  try {
    console.log('🔍 Verificando y agregando columnas necesarias...\n');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexión establecida\n');

    // Verificar columnas en eventos
    const [columnasEventos] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'eventos' 
       AND COLUMN_NAME IN ('forma_espacio', 'escenario_x', 'escenario_y', 'escenario_width', 'escenario_height', 'limite_entradas')`,
      [dbConfig.database]
    );

    const columnasExistentesEventos = columnasEventos.map(c => c.COLUMN_NAME);
    console.log('📋 Columnas existentes en eventos:', columnasExistentesEventos.length > 0 ? columnasExistentesEventos.join(', ') : 'ninguna');

    // Agregar columnas faltantes en eventos
    if (!columnasExistentesEventos.includes('forma_espacio')) {
      console.log('   ➕ Agregando forma_espacio...');
      await connection.query(
        `ALTER TABLE eventos 
         ADD COLUMN forma_espacio ENUM('rectangulo', 'cuadrado', 'triangulo', 'circulo') NULL DEFAULT NULL AFTER capacidad_maxima`
      );
      console.log('   ✅ forma_espacio agregada');
    }

    if (!columnasExistentesEventos.includes('escenario_x')) {
      console.log('   ➕ Agregando escenario_x, escenario_y, escenario_width, escenario_height...');
      await connection.query(
        `ALTER TABLE eventos 
         ADD COLUMN escenario_x INT NULL DEFAULT NULL AFTER forma_espacio,
         ADD COLUMN escenario_y INT NULL DEFAULT NULL AFTER escenario_x,
         ADD COLUMN escenario_width INT NULL DEFAULT NULL AFTER escenario_y,
         ADD COLUMN escenario_height INT NULL DEFAULT NULL AFTER escenario_width`
      );
      console.log('   ✅ Columnas de escenario agregadas');
    }

    if (!columnasExistentesEventos.includes('limite_entradas')) {
      console.log('   ➕ Agregando limite_entradas...');
      await connection.query(
        `ALTER TABLE eventos 
         ADD COLUMN limite_entradas INT NULL DEFAULT NULL AFTER capacidad_maxima`
      );
      console.log('   ✅ limite_entradas agregada');
    }

    // Verificar columnas en mesas
    const [columnasMesas] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'mesas' 
       AND COLUMN_NAME IN ('posicion_x', 'posicion_y', 'ancho', 'alto')`,
      [dbConfig.database]
    );

    const columnasExistentesMesas = columnasMesas.map(c => c.COLUMN_NAME);
    console.log('\n📋 Columnas existentes en mesas:', columnasExistentesMesas.length > 0 ? columnasExistentesMesas.join(', ') : 'ninguna');

    if (!columnasExistentesMesas.includes('posicion_x')) {
      console.log('   ➕ Agregando posicion_x, posicion_y a mesas...');
      await connection.query(
        `ALTER TABLE mesas 
         ADD COLUMN posicion_x INT NULL DEFAULT NULL AFTER activo,
         ADD COLUMN posicion_y INT NULL DEFAULT NULL AFTER posicion_x`
      );
      console.log('   ✅ Columnas de posición agregadas a mesas');
    }

    if (!columnasExistentesMesas.includes('ancho')) {
      console.log('   ➕ Agregando ancho, alto a mesas...');
      await connection.query(
        `ALTER TABLE mesas 
         ADD COLUMN ancho INT NULL DEFAULT NULL AFTER posicion_y,
         ADD COLUMN alto INT NULL DEFAULT NULL AFTER ancho`
      );
      console.log('   ✅ Columnas de dimensiones agregadas a mesas');
    }

    // Verificar columnas en asientos
    const [columnasAsientos] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'asientos' 
       AND COLUMN_NAME IN ('posicion_x', 'posicion_y')`,
      [dbConfig.database]
    );

    const columnasExistentesAsientos = columnasAsientos.map(c => c.COLUMN_NAME);
    console.log('\n📋 Columnas existentes en asientos:', columnasExistentesAsientos.length > 0 ? columnasExistentesAsientos.join(', ') : 'ninguna');

    if (!columnasExistentesAsientos.includes('posicion_x')) {
      console.log('   ➕ Agregando posicion_x, posicion_y a asientos...');
      await connection.query(
        `ALTER TABLE asientos 
         ADD COLUMN posicion_x INT NULL DEFAULT NULL AFTER estado,
         ADD COLUMN posicion_y INT NULL DEFAULT NULL AFTER posicion_x`
      );
      console.log('   ✅ Columnas de posición agregadas a asientos');
    }

    console.log('\n✨ Verificación completada! Todas las columnas necesarias están presentes.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('   (La columna ya existe, esto está bien)');
    } else {
      process.exit(1);
    }
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Conexión cerrada');
    }
  }
}

verificarYAgregar();

