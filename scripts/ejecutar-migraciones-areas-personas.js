#!/usr/bin/env node
/**
 * Script para ejecutar las migraciones de áreas PERSONAS.
 * Usa la misma configuración de DB que la aplicación (backend/config/db.js).
 *
 * Ejecutar desde la raíz del proyecto:
 *   node backend/scripts/ejecutar-migraciones-areas-personas.js
 *
 * O desde backend:
 *   node scripts/ejecutar-migraciones-areas-personas.js
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'entradas_db',
  multipleStatements: true
};

const scriptsDir = path.join(__dirname);
const scripts = [
  'agregar_tipo_area.sql',
  'agregar_area_id_compras_generales.sql',
  'crear_tabla_compras_areas_personas.sql'
];

async function ejecutarScript(conn, nombreArchivo) {
  const filepath = path.join(scriptsDir, nombreArchivo);
  if (!fs.existsSync(filepath)) {
    console.warn(`  ⚠ Archivo no encontrado: ${nombreArchivo}`);
    return;
  }
  const sql = fs.readFileSync(filepath, 'utf8');
  try {
    await conn.query(sql);
    console.log(`  ✓ ${nombreArchivo} ejecutado correctamente`);
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEYNAME' || err.code === 'ER_TABLE_EXISTS_ERROR' || err.code === 'ER_DUP_TABLENAME' || err.code === 'ER_FK_DUP_NAME') {
      console.log(`  ⏭ ${nombreArchivo}: algunos elementos ya existen (omitido)`);
    } else {
      console.error(`  ✗ Error en ${nombreArchivo}:`, err.message);
      throw err;
    }
  }
}

async function main() {
  console.log('Ejecutando migraciones de áreas PERSONAS...\n');
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    for (const script of scripts) {
      console.log(`\n📄 ${script}`);
      await ejecutarScript(conn, script);
    }
    console.log('\n✅ Todas las migraciones se ejecutaron correctamente.');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('   Verifica que MySQL esté ejecutándose y que las credenciales en .env sean correctas.');
    }
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
