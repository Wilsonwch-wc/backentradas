#!/usr/bin/env node
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'entradas_db',
  multipleStatements: true
};

async function main() {
  const conn = await mysql.createConnection(dbConfig);
  const sql = fs.readFileSync(path.join(__dirname, 'agregar_tipo_venta_compras.sql'), 'utf8');
  await conn.query(sql);
  await conn.end();
  console.log('✓ Campos tipo_venta y precio_original agregados a compras');
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
