/**
 * Agrega columnas de precios por mesa (idempotente).
 * Uso: node scripts/agregar_precios_mesa.js
 */
import pool from '../config/db.js';

const ALTERS = [
  `ALTER TABLE mesas ADD COLUMN precio_mesa_completa DECIMAL(10,2) DEFAULT NULL COMMENT 'Precio fijo al vender la mesa entera'`,
  `ALTER TABLE mesas ADD COLUMN precio_silla_individual DECIMAL(10,2) DEFAULT NULL COMMENT 'Precio por silla suelta si la mesa no es solo paquete'`,
  `ALTER TABLE mesas ADD COLUMN venta_solo_mesa TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=solo mesa completa, no sillas sueltas'`,
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
    console.log('Migración: precios por mesa en tabla mesas\n');
    for (const sql of ALTERS) {
      const col = sql.match(/ADD COLUMN (\w+)/i)?.[1];
      if (col && (await columnExists(conn, 'mesas', col))) {
        console.log(`  [OK] ${col} ya existe`);
        continue;
      }
      await conn.execute(sql);
      console.log(`  [+] ${col || 'columna'} agregada`);
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
