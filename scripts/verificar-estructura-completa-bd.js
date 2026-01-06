import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'entradas_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function verificarEstructura() {
  let connection;
  
  try {
    log('\n========================================', 'cyan');
    log('VERIFICACIÓN COMPLETA DE ESTRUCTURA BD', 'cyan');
    log('========================================\n', 'cyan');

    connection = await pool.getConnection();
    log('✅ Conexión establecida\n', 'green');

    // ========================================
    // 1. VERIFICAR TABLA EVENTOS
    // ========================================
    log('1. TABLA: eventos', 'blue');
    const [eventosCols] = await connection.execute(`
      SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE, COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'eventos'
      ORDER BY ORDINAL_POSITION
    `, [process.env.DB_NAME || 'entradas_db']);

    eventosCols.forEach(col => {
      const nullable = col.IS_NULLABLE === 'YES' ? '✅' : '❌';
      log(`   ${nullable} ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} ${col.IS_NULLABLE === 'YES' ? '(NULL permitido)' : '(NOT NULL)'}`, 
          col.IS_NULLABLE === 'YES' ? 'green' : 'red');
    });

    // Verificar datos
    const [eventosCount] = await connection.execute('SELECT COUNT(*) as total FROM eventos');
    log(`   📊 Total eventos: ${eventosCount[0].total}`, 'yellow');

    // ========================================
    // 2. VERIFICAR TABLA MESAS
    // ========================================
    log('\n2. TABLA: mesas', 'blue');
    const [mesasCols] = await connection.execute(`
      SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE, COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'mesas'
      ORDER BY ORDINAL_POSITION
    `, [process.env.DB_NAME || 'entradas_db']);

    mesasCols.forEach(col => {
      const nullable = col.IS_NULLABLE === 'YES' ? '✅' : '❌';
      log(`   ${nullable} ${col.COLUMN_NAME}: ${col.COLUMN_TYPE}`, 
          col.IS_NULLABLE === 'YES' ? 'green' : 'red');
    });

    const [mesasCount] = await connection.execute('SELECT COUNT(*) as total FROM mesas');
    log(`   📊 Total mesas: ${mesasCount[0].total}`, 'yellow');

    // ========================================
    // 3. VERIFICAR TABLA ASIENTOS
    // ========================================
    log('\n3. TABLA: asientos', 'blue');
    const [asientosCols] = await connection.execute(`
      SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE, COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'asientos'
      ORDER BY ORDINAL_POSITION
    `, [process.env.DB_NAME || 'entradas_db']);

    asientosCols.forEach(col => {
      const nullable = col.IS_NULLABLE === 'YES' ? '✅' : '❌';
      log(`   ${nullable} ${col.COLUMN_NAME}: ${col.COLUMN_TYPE}`, 
          col.IS_NULLABLE === 'YES' ? 'green' : 'red');
    });

    const [asientosCount] = await connection.execute('SELECT COUNT(*) as total FROM asientos');
    log(`   📊 Total asientos: ${asientosCount[0].total}`, 'yellow');

    // ========================================
    // 4. VERIFICAR FOREIGN KEYS
    // ========================================
    log('\n4. FOREIGN KEYS', 'blue');
    const [foreignKeys] = await connection.execute(`
      SELECT 
        CONSTRAINT_NAME,
        TABLE_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
        AND TABLE_NAME IN ('asientos', 'mesas', 'eventos')
      ORDER BY TABLE_NAME, CONSTRAINT_NAME
    `, [process.env.DB_NAME || 'entradas_db']);

    foreignKeys.forEach(fk => {
      log(`   ✅ ${fk.TABLE_NAME}.${fk.COLUMN_NAME} → ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`, 'green');
    });

    // ========================================
    // 5. VERIFICAR DATOS INCONSISTENTES
    // ========================================
    log('\n5. VERIFICACIÓN DE DATOS INCONSISTENTES', 'blue');

    // Asientos con mesa_id inexistente
    const [asientosInvalidos] = await connection.execute(`
      SELECT COUNT(*) as cantidad
      FROM asientos a
      LEFT JOIN mesas m ON a.mesa_id = m.id
      WHERE a.mesa_id IS NOT NULL AND m.id IS NULL
    `);
    
    if (asientosInvalidos[0].cantidad > 0) {
      log(`   ⚠️  Asientos con mesa_id inexistente: ${asientosInvalidos[0].cantidad}`, 'yellow');
      log('   💡 Estos asientos deben tener mesa_id = NULL', 'yellow');
    } else {
      log('   ✅ No hay asientos con mesa_id inexistente', 'green');
    }

    // Asientos con evento_id inexistente
    const [asientosEventoInvalido] = await connection.execute(`
      SELECT COUNT(*) as cantidad
      FROM asientos a
      LEFT JOIN eventos e ON a.evento_id = e.id
      WHERE e.id IS NULL
    `);
    
    if (asientosEventoInvalido[0].cantidad > 0) {
      log(`   ⚠️  Asientos con evento_id inexistente: ${asientosEventoInvalido[0].cantidad}`, 'yellow');
    } else {
      log('   ✅ No hay asientos con evento_id inexistente', 'green');
    }

    // Mesas con evento_id inexistente
    const [mesasEventoInvalido] = await connection.execute(`
      SELECT COUNT(*) as cantidad
      FROM mesas m
      LEFT JOIN eventos e ON m.evento_id = e.id
      WHERE e.id IS NULL
    `);
    
    if (mesasEventoInvalido[0].cantidad > 0) {
      log(`   ⚠️  Mesas con evento_id inexistente: ${mesasEventoInvalido[0].cantidad}`, 'yellow');
    } else {
      log('   ✅ No hay mesas con evento_id inexistente', 'green');
    }

    // ========================================
    // 6. RESUMEN Y RECOMENDACIONES
    // ========================================
    log('\n========================================', 'cyan');
    log('RESUMEN', 'cyan');
    log('========================================\n', 'cyan');

    const [eventos] = await connection.execute('SELECT COUNT(*) as total FROM eventos');
    const [mesas] = await connection.execute('SELECT COUNT(*) as total FROM mesas');
    const [asientos] = await connection.execute('SELECT COUNT(*) as total FROM asientos');

    log(`📊 Eventos: ${eventos[0].total}`, 'blue');
    log(`📊 Mesas: ${mesas[0].total}`, 'blue');
    log(`📊 Asientos: ${asientos[0].total}`, 'blue');

    log('\n💡 RECOMENDACIONES:', 'yellow');
    
    if (mesas[0].total === 0 && asientos[0].total > 0) {
      log('   ⚠️  Tienes asientos pero no hay mesas.', 'yellow');
      log('   → Los asientos deben crearse DESPUÉS de crear las mesas', 'yellow');
      log('   → O los asientos deben tener mesa_id = NULL (asientos individuales)', 'yellow');
    }

    if (eventos[0].total === 0) {
      log('   ⚠️  No hay eventos registrados.', 'yellow');
      log('   → Crea eventos antes de crear mesas y asientos', 'yellow');
    }

    log('\n✅ Verificación completada\n', 'green');

  } catch (error) {
    log(`\n❌ ERROR: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
    await pool.end();
  }
}

verificarEstructura();

