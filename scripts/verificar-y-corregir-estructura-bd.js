import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno
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

// Colores para la consola
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

async function verificarYCorregir() {
  let connection;
  
  try {
    log('\n========================================', 'cyan');
    log('VERIFICACIÓN Y CORRECCIÓN DE BASE DE DATOS', 'cyan');
    log('========================================\n', 'cyan');

    connection = await pool.getConnection();
    log('✅ Conexión a la base de datos establecida\n', 'green');

    // ========================================
    // 1. VERIFICAR COLUMNA 'imagen' EN EVENTOS
    // ========================================
    log('1. Verificando columna "imagen" en tabla "eventos"...', 'blue');
    
    const [columnInfo] = await connection.execute(`
      SELECT 
        COLUMN_NAME,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        DATA_TYPE,
        COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = 'eventos'
        AND COLUMN_NAME = 'imagen'
    `, [process.env.DB_NAME || 'entradas_db']);

    if (columnInfo.length === 0) {
      log('❌ ERROR: La columna "imagen" no existe en la tabla "eventos"', 'red');
      return;
    }

    const columna = columnInfo[0];
    log(`   Columna encontrada: ${columna.COLUMN_NAME}`, 'yellow');
    log(`   Permite NULL: ${columna.IS_NULLABLE}`, 'yellow');
    log(`   Tipo: ${columna.COLUMN_TYPE}`, 'yellow');
    log(`   Valor por defecto: ${columna.COLUMN_DEFAULT || 'NULL'}`, 'yellow');

    // Si no permite NULL, corregirlo
    if (columna.IS_NULLABLE === 'NO') {
      log('\n   ⚠️  La columna NO permite NULL. Corrigiendo...', 'yellow');
      
      await connection.execute(`
        ALTER TABLE eventos 
        MODIFY imagen VARCHAR(255) NULL DEFAULT NULL
      `);
      
      log('   ✅ Columna modificada para permitir NULL', 'green');
    } else {
      log('   ✅ La columna ya permite NULL', 'green');
    }

    // ========================================
    // 2. VERIFICAR FOREIGN KEYS EN ASIENTOS
    // ========================================
    log('\n2. Verificando foreign keys en tabla "asientos"...', 'blue');
    
    const [foreignKeys] = await connection.execute(`
      SELECT 
        CONSTRAINT_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = 'asientos'
        AND CONSTRAINT_NAME LIKE 'asientos_ibfk%'
      ORDER BY CONSTRAINT_NAME
    `, [process.env.DB_NAME || 'entradas_db']);

    log(`   Se encontraron ${foreignKeys.length} foreign keys:`, 'yellow');
    foreignKeys.forEach(fk => {
      log(`   - ${fk.CONSTRAINT_NAME}: ${fk.COLUMN_NAME} → ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`, 'yellow');
    });

    // Verificar si existe la foreign key de mesa_id
    const fkMesa = foreignKeys.find(fk => fk.COLUMN_NAME === 'mesa_id');
    if (!fkMesa) {
      log('   ⚠️  No se encontró foreign key para mesa_id', 'yellow');
    } else {
      log('   ✅ Foreign key de mesa_id encontrada', 'green');
    }

    // ========================================
    // 3. VERIFICAR DATOS INCONSISTENTES
    // ========================================
    log('\n3. Verificando datos inconsistentes...', 'blue');
    
    // Asientos con mesa_id inexistente
    const [asientosInconsistentes] = await connection.execute(`
      SELECT COUNT(*) as cantidad
      FROM asientos a
      LEFT JOIN mesas m ON a.mesa_id = m.id
      WHERE a.mesa_id IS NOT NULL 
        AND m.id IS NULL
    `);

    const cantidadAsientosInconsistentes = asientosInconsistentes[0].cantidad;
    log(`   Asientos con mesa_id inexistente: ${cantidadAsientosInconsistentes}`, 'yellow');

    if (cantidadAsientosInconsistentes > 0) {
      log('   ⚠️  Corrigiendo datos inconsistentes...', 'yellow');
      const [result] = await connection.execute(`
        UPDATE asientos a
        LEFT JOIN mesas m ON a.mesa_id = m.id
        SET a.mesa_id = NULL
        WHERE a.mesa_id IS NOT NULL 
          AND m.id IS NULL
      `);
      log(`   ✅ ${result.affectedRows} asientos corregidos`, 'green');
    } else {
      log('   ✅ No hay datos inconsistentes', 'green');
    }

    // Eventos sin imagen
    const [eventosSinImagen] = await connection.execute(`
      SELECT COUNT(*) as cantidad
      FROM eventos
      WHERE imagen IS NULL OR imagen = ''
    `);

    const cantidadEventosSinImagen = eventosSinImagen[0].cantidad;
    log(`   Eventos sin imagen: ${cantidadEventosSinImagen}`, 'yellow');

    if (cantidadEventosSinImagen > 0) {
      log('   ⚠️  Estableciendo imagen por defecto...', 'yellow');
      const [result] = await connection.execute(`
        UPDATE eventos 
        SET imagen = '/images/logprincipal.jpg'
        WHERE imagen IS NULL OR imagen = ''
      `);
      log(`   ✅ ${result.affectedRows} eventos actualizados con imagen por defecto`, 'green');
    } else {
      log('   ✅ Todos los eventos tienen imagen', 'green');
    }

    // ========================================
    // 4. VERIFICACIÓN FINAL
    // ========================================
    log('\n4. Verificación final de estructura...', 'blue');
    
    const [verificacionFinal] = await connection.execute(`
      SELECT 
        COLUMN_NAME,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = 'eventos'
        AND COLUMN_NAME = 'imagen'
    `, [process.env.DB_NAME || 'entradas_db']);

    const columnaFinal = verificacionFinal[0];
    
    log('\n========================================', 'cyan');
    log('RESUMEN FINAL', 'cyan');
    log('========================================\n', 'cyan');
    
    log('Tabla: eventos', 'blue');
    log(`Columna: ${columnaFinal.COLUMN_NAME}`, 'blue');
    log(`Permite NULL: ${columnaFinal.IS_NULLABLE}`, columnaFinal.IS_NULLABLE === 'YES' ? 'green' : 'red');
    log(`Tipo: ${columnaFinal.DATA_TYPE}`, 'blue');
    log(`Valor por defecto: ${columnaFinal.COLUMN_DEFAULT || 'NULL'}`, 'blue');
    
    if (columnaFinal.IS_NULLABLE === 'YES') {
      log('\n✅ La estructura está correcta. El error no debería aparecer.', 'green');
    } else {
      log('\n❌ ERROR: La columna aún no permite NULL. Revisa los permisos de MySQL.', 'red');
    }

    log('\n========================================', 'cyan');
    log('VERIFICACIÓN COMPLETADA', 'cyan');
    log('========================================\n', 'cyan');

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

// Ejecutar
verificarYCorregir();

