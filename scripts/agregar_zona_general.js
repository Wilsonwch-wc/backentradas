/**
 * Migración: agregar soporte de Zona General (personas paradas sin asientos)
 *
 * Agrega a areas_layout:
 *   - es_zona_general   TINYINT(1)  → marca el área como zona de pie/general
 *   - capacidad_maxima  INT         → límite de entradas vendibles para esa zona
 *   - tipo_precio_id    INT         → tipo de precio que aplica a esta zona general
 *
 * Uso: node scripts/agregar_zona_general.js
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

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
    console.log('=== Migración: Zona General (personas paradas) ===\n');

    // 1. areas_layout.es_zona_general
    if (await columnExists(conn, 'areas_layout', 'es_zona_general')) {
      console.log('  [OK] areas_layout.es_zona_general ya existe');
    } else {
      await conn.execute(
        `ALTER TABLE areas_layout
         ADD COLUMN es_zona_general TINYINT(1) NOT NULL DEFAULT 0
         COMMENT 'Si es 1, el área es zona de pie: se vende por capacidad, sin asientos individuales'
         AFTER tipo_area`
      );
      console.log('  [+] areas_layout.es_zona_general agregada');
    }

    // 2. areas_layout.capacidad_maxima (separado de capacidad_personas que puede existir)
    if (await columnExists(conn, 'areas_layout', 'capacidad_maxima')) {
      console.log('  [OK] areas_layout.capacidad_maxima ya existe');
    } else {
      await conn.execute(
        `ALTER TABLE areas_layout
         ADD COLUMN capacidad_maxima INT DEFAULT NULL
         COMMENT 'Límite de entradas para zona general (parados). NULL = sin límite'
         AFTER es_zona_general`
      );
      console.log('  [+] areas_layout.capacidad_maxima agregada');
    }

    // 3. areas_layout.tipo_precio_id_general
    if (await columnExists(conn, 'areas_layout', 'tipo_precio_id_general')) {
      console.log('  [OK] areas_layout.tipo_precio_id_general ya existe');
    } else {
      await conn.execute(
        `ALTER TABLE areas_layout
         ADD COLUMN tipo_precio_id_general INT DEFAULT NULL
         COMMENT 'Tipo de precio asignado a esta zona general'
         AFTER capacidad_maxima`
      );
      console.log('  [+] areas_layout.tipo_precio_id_general agregada');
    }

    // 4. Verificar que compras_areas_personas existe (para tracking de ventas)
    const [tables] = await conn.execute(
      `SELECT 1 FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'compras_areas_personas'`
    );
    if (tables.length > 0) {
      console.log('  [OK] tabla compras_areas_personas ya existe (tracking de ventas)');
    } else {
      await conn.execute(`
        CREATE TABLE compras_areas_personas (
          id INT AUTO_INCREMENT PRIMARY KEY,
          compra_id INT NOT NULL,
          area_id INT NOT NULL,
          cantidad INT NOT NULL DEFAULT 1,
          precio_unitario DECIMAL(10,2) DEFAULT NULL,
          precio_total DECIMAL(10,2) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (area_id) REFERENCES areas_layout(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('  [+] tabla compras_areas_personas creada');
    }

    console.log('\n✅ Migración completada.\n');
    console.log('Ahora puedes marcar un área como "Zona General" en el diseñador de eventos.');
    console.log('Los tickets de esa zona se venderán por cantidad sin asiento específico.');

  } catch (e) {
    console.error('\n❌ Error:', e.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
