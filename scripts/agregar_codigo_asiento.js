import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'entradas_db',
};

async function columnExists(conn, table, column) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function main() {
  const conn = await mysql.createConnection(dbConfig);
  try {
    console.log('Migración: agregar codigo_asiento a tabla asientos\n');

    if (await columnExists(conn, 'asientos', 'codigo_asiento')) {
      console.log('  [OK] asientos.codigo_asiento ya existe');
    } else {
      await conn.execute(
        `ALTER TABLE asientos ADD COLUMN codigo_asiento VARCHAR(20) DEFAULT NULL COMMENT 'Etiqueta visible: A1, B2, etc.' AFTER numero_asiento`
      );
      console.log('  [+] asientos.codigo_asiento agregada');
    }

    console.log('\nListo.');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
