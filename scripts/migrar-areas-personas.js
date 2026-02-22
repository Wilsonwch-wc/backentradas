#!/usr/bin/env node
/**
 * Migración: áreas de zona general (personas de pie) - círculos
 * Ejecuta: node backend/scripts/migrar-areas-personas.js
 */
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

async function runSql(conn, name, fn) {
  try {
    await fn(conn);
    console.log(`  ✓ ${name}`);
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_DUP_KEYNAME' || e.code === 'ER_TABLE_EXISTS_ERROR' || e.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
      console.log(`  ⏭ ${name} (ya existe)`);
    } else throw e;
  }
}

async function main() {
  console.log('Migrando áreas de zona general (círculos)...\n');
  const conn = await mysql.createConnection(dbConfig);

  // 1. areas_layout: tipo_area, capacidad_personas, orden, forma
  await runSql(conn, 'tipo_area', async (c) => {
    const [r] = await c.query("SELECT COUNT(*) n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='areas_layout' AND COLUMN_NAME='tipo_area'", [dbConfig.database]);
    if (r[0].n === 0) {
      await c.query("ALTER TABLE areas_layout ADD COLUMN tipo_area ENUM('SILLAS','MESAS','PERSONAS') NOT NULL DEFAULT 'SILLAS' AFTER color");
    }
  });
  await runSql(conn, 'capacidad_personas', async (c) => {
    const [r] = await c.query("SELECT COUNT(*) n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='areas_layout' AND COLUMN_NAME='capacidad_personas'", [dbConfig.database]);
    if (r[0].n === 0) {
      await c.query("ALTER TABLE areas_layout ADD COLUMN capacidad_personas INT DEFAULT NULL AFTER tipo_area");
    }
  });
  await runSql(conn, 'orden', async (c) => {
    const [r] = await c.query("SELECT COUNT(*) n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='areas_layout' AND COLUMN_NAME='orden'", [dbConfig.database]);
    if (r[0].n === 0) {
      await c.query("ALTER TABLE areas_layout ADD COLUMN orden INT DEFAULT NULL AFTER capacidad_personas");
    }
  });
  await runSql(conn, 'forma', async (c) => {
    const [r] = await c.query("SELECT COUNT(*) n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='areas_layout' AND COLUMN_NAME='forma'", [dbConfig.database]);
    if (r[0].n === 0) {
      await c.query("ALTER TABLE areas_layout ADD COLUMN forma ENUM('rectangulo','circulo') NOT NULL DEFAULT 'rectangulo' AFTER orden");
    }
  });
  await runSql(conn, 'tipo_precio_id en areas_layout', async (c) => {
    const [r] = await c.query("SELECT COUNT(*) n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='areas_layout' AND COLUMN_NAME='tipo_precio_id'", [dbConfig.database]);
    if (r[0].n === 0) {
      await c.query("ALTER TABLE areas_layout ADD COLUMN tipo_precio_id INT NULL AFTER forma");
    }
  });

  // 2. compras_entradas_generales: area_id
  await runSql(conn, 'area_id compras_entradas_generales', async (c) => {
    const [r] = await c.query("SELECT COUNT(*) n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='compras_entradas_generales' AND COLUMN_NAME='area_id'", [dbConfig.database]);
    if (r[0].n === 0) {
      await c.query("ALTER TABLE compras_entradas_generales ADD COLUMN area_id INT NULL AFTER compra_id");
    }
  });
  await runSql(conn, 'índice idx_area_id', async (c) => {
    const [r] = await c.query("SELECT COUNT(*) n FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME='compras_entradas_generales' AND INDEX_NAME='idx_area_id'", [dbConfig.database]);
    if (r[0].n === 0) {
      await c.query("CREATE INDEX idx_area_id ON compras_entradas_generales(area_id)");
    }
  });

  // 3. Tabla compras_areas_personas
  await runSql(conn, 'compras_areas_personas', async (c) => {
    await c.query(`CREATE TABLE IF NOT EXISTS compras_areas_personas (
      id INT NOT NULL AUTO_INCREMENT,
      compra_id INT NOT NULL,
      area_id INT NOT NULL,
      cantidad INT NOT NULL,
      precio_unitario DECIMAL(10,2) DEFAULT 0,
      precio_total DECIMAL(10,2) DEFAULT 0,
      estado ENUM('RESERVADO','CONFIRMADO','CANCELADO') DEFAULT 'RESERVADO',
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_compra (compra_id),
      KEY idx_area (area_id),
      CONSTRAINT compras_areas_personas_ibfk_compra FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
      CONSTRAINT compras_areas_personas_ibfk_area FOREIGN KEY (area_id) REFERENCES areas_layout(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  });

  await conn.end();
  console.log('\n✅ Migración completada.');
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
