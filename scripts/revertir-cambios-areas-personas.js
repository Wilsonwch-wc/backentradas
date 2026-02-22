#!/usr/bin/env node
/**
 * Revierte los cambios de áreas PERSONAS en la base de datos:
 * - Elimina tabla compras_areas_personas
 * - Elimina columna area_id e índice de compras_entradas_generales
 * - Elimina columnas tipo_area, capacidad_personas, orden de areas_layout
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'entradas_db'
};

async function main() {
  console.log('Revirtiendo cambios de áreas PERSONAS en la base de datos...\n');
  const conn = await mysql.createConnection(dbConfig);

  try {
    // 1. Eliminar tabla compras_areas_personas
    await conn.query('DROP TABLE IF EXISTS compras_areas_personas');
    console.log('  ✓ Tabla compras_areas_personas eliminada');

    // 2. Eliminar FK, índice y columna area_id de compras_entradas_generales
    const [fkRows] = await conn.query(
      "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = 'entradas_db' AND TABLE_NAME = 'compras_entradas_generales' AND COLUMN_NAME = 'area_id' AND REFERENCED_TABLE_NAME IS NOT NULL"
    );
    if (fkRows.length > 0) {
      await conn.query(`ALTER TABLE compras_entradas_generales DROP FOREIGN KEY \`${fkRows[0].CONSTRAINT_NAME}\``);
      console.log('  ✓ FK area_id eliminada');
    }
  } catch (e) {
    if (e.code === 'ER_CANT_DROP_FIELD_OR_KEY' || e.code === 'ER_UNKNOWN_KEY') console.log('  ⏭ FK no existía');
    else throw e;
  }

  try {
    await conn.query('ALTER TABLE compras_entradas_generales DROP INDEX idx_area_id');
    console.log('  ✓ Índice idx_area_id eliminado');
  } catch (e) {
    if (e.code === 'ER_CANT_DROP_FIELD_OR_KEY' || e.code === 'ER_UNKNOWN_KEY') console.log('  ⏭ Índice idx_area_id no existía');
    else throw e;
  }

  try {
    await conn.query('ALTER TABLE compras_entradas_generales DROP COLUMN area_id');
    console.log('  ✓ Columna area_id eliminada de compras_entradas_generales');
  } catch (e) {
    if (e.code === 'ER_CANT_DROP_FIELD_OR_KEY') console.log('  ⏭ Columna area_id no existía');
    else throw e;
  }

  // 3. Eliminar columnas de areas_layout
  for (const col of ['orden', 'capacidad_personas', 'tipo_area']) {
    try {
      await conn.query(`ALTER TABLE areas_layout DROP COLUMN ${col}`);
      console.log(`  ✓ Columna ${col} eliminada de areas_layout`);
    } catch (e) {
      if (e.code === 'ER_CANT_DROP_FIELD_OR_KEY') console.log(`  ⏭ Columna ${col} no existía`);
      else throw e;
    }
  }

  await conn.end();
  console.log('\n✅ Cambios revertidos correctamente.');
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
