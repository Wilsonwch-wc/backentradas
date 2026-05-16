/**
 * Migración idempotente para el servidor:
 * - Precios por mesa (tabla mesas)
 * - Ubicación del evento (tabla eventos)
 *
 * Uso: node scripts/agregar_precios_mesa.js
 */
import pool from '../config/db.js';

const MIGRATIONS = [
  // --- mesas: precios ---
  {
    table: 'mesas',
    column: 'precio_mesa_completa',
    sql: `ALTER TABLE mesas ADD COLUMN precio_mesa_completa DECIMAL(10,2) DEFAULT NULL COMMENT 'Precio fijo al vender la mesa entera'`,
  },
  {
    table: 'mesas',
    column: 'precio_silla_individual',
    sql: `ALTER TABLE mesas ADD COLUMN precio_silla_individual DECIMAL(10,2) DEFAULT NULL COMMENT 'Precio por silla suelta si la mesa no es solo paquete'`,
  },
  {
    table: 'mesas',
    column: 'venta_solo_mesa',
    sql: `ALTER TABLE mesas ADD COLUMN venta_solo_mesa TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=solo mesa completa, no sillas sueltas'`,
  },
  // --- eventos: ubicación (Cartelera) ---
  {
    table: 'eventos',
    column: 'ubicacion',
    sql: `ALTER TABLE eventos ADD COLUMN ubicacion VARCHAR(255) DEFAULT NULL COMMENT 'Lugar o dirección del evento'`,
  },
  {
    table: 'eventos',
    column: 'ciudad',
    sql: `ALTER TABLE eventos ADD COLUMN ciudad VARCHAR(100) DEFAULT NULL COMMENT 'Ciudad del evento'`,
  },
  {
    table: 'eventos',
    column: 'ubicacion_url',
    sql: `ALTER TABLE eventos ADD COLUMN ubicacion_url VARCHAR(500) DEFAULT NULL COMMENT 'URL mapa (Google Maps, Waze, etc.)'`,
  },
];

async function columnExists(conn, table, column) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function main() {
  const conn = await pool.getConnection();
  try {
    console.log('Migración servidor: mesas (precios) + eventos (ubicación)\n');

    for (const { table, column, sql } of MIGRATIONS) {
      if (await columnExists(conn, table, column)) {
        console.log(`  [OK] ${table}.${column} ya existe`);
        continue;
      }
      await conn.execute(sql);
      console.log(`  [+] ${table}.${column} agregada`);
    }

    console.log('\nListo.');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
