import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env desde la raíz del backend (una carpeta arriba de docs)
dotenv.config({ path: path.join(__dirname, '../.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'entradas_db',
};

async function checkColumnExists(connection, tableName, columnName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) as count 
     FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbConfig.database, tableName, columnName]
  );
  return rows[0].count > 0;
}

async function checkIndexExists(connection, tableName, indexName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) as count 
     FROM INFORMATION_SCHEMA.STATISTICS 
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [dbConfig.database, tableName, indexName]
  );
  return rows[0].count > 0;
}

async function runMigration() {
  console.log('🔄 Iniciando actualización de la base de datos de forma segura...');
  console.log(`📡 Conectando a la BD: ${dbConfig.database} en ${dbConfig.host}`);

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexión establecida.\n');

    // 1. compra_id
    if (!(await checkColumnExists(connection, 'pagos', 'compra_id'))) {
      console.log('⏳ Agregando columna compra_id...');
      await connection.query(`ALTER TABLE pagos ADD COLUMN compra_id INT NULL DEFAULT NULL COMMENT 'ID de la compra vinculada'`);
      console.log('✅ Columna compra_id agregada.');
    } else {
      console.log('⚡ Columna compra_id ya existe.');
    }

    // 2. ambiente
    if (!(await checkColumnExists(connection, 'pagos', 'ambiente'))) {
      console.log('⏳ Agregando columna ambiente...');
      await connection.query(`ALTER TABLE pagos ADD COLUMN ambiente VARCHAR(20) NULL DEFAULT 'TEST' COMMENT 'Ambiente pasarela: TEST | PRODUCCION'`);
      console.log('✅ Columna ambiente agregada.');
    } else {
      console.log('⚡ Columna ambiente ya existe.');
    }

    // 3. updated_at
    if (!(await checkColumnExists(connection, 'pagos', 'updated_at'))) {
      console.log('⏳ Agregando columna updated_at...');
      await connection.query(`ALTER TABLE pagos ADD COLUMN updated_at DATETIME NULL DEFAULT NULL COMMENT 'Fecha de ultima actualizacion'`);
      console.log('✅ Columna updated_at agregada.');
    } else {
      console.log('⚡ Columna updated_at ya existe.');
    }

    // 4. atc_referencia
    if (!(await checkColumnExists(connection, 'pagos', 'atc_referencia'))) {
      console.log('⏳ Agregando columna atc_referencia...');
      await connection.query(`ALTER TABLE pagos ADD COLUMN atc_referencia VARCHAR(30) NULL DEFAULT NULL COMMENT 'Referencia de Redenlace ATC'`);
      console.log('✅ Columna atc_referencia agregada.');
    } else {
      console.log('⚡ Columna atc_referencia ya existe.');
    }

    // 5. Modificar estado
    console.log('⏳ Actualizando campo estado para aceptar nuevos estados de Redenlace...');
    await connection.query(`ALTER TABLE pagos MODIFY COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'Estado: pending | approved | expired | cancelled | rejected'`);
    console.log('✅ Campo estado actualizado.');

    // 6. Índices
    console.log('\n⏳ Verificando índices para rendimiento...');
    if (!(await checkIndexExists(connection, 'pagos', 'idx_external_reference'))) {
      await connection.query(`ALTER TABLE pagos ADD INDEX idx_external_reference (external_reference)`);
      console.log('✅ Índice idx_external_reference creado.');
    }
    
    if (!(await checkIndexExists(connection, 'pagos', 'idx_atc_referencia'))) {
      await connection.query(`ALTER TABLE pagos ADD INDEX idx_atc_referencia (atc_referencia)`);
      console.log('✅ Índice idx_atc_referencia creado.');
    }
    
    if (!(await checkIndexExists(connection, 'pagos', 'idx_estado_created'))) {
      await connection.query(`ALTER TABLE pagos ADD INDEX idx_estado_created (estado, created_at)`);
      console.log('✅ Índice idx_estado_created creado.');
    }

    console.log('\n🎉 ¡MIGRACIÓN COMPLETADA CON ÉXITO!');
    console.log('Tus datos anteriores de compras, eventos y pagos están INTACTOS.');

  } catch (error) {
    console.error('\n❌ ERROR DURANTE LA MIGRACIÓN:');
    console.error(error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
    process.exit(0);
  }
}

runMigration();
