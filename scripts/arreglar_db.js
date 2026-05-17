/**
 * Script de reparación/migración para corregir discrepancias en la base de datos:
 * 1. Agrega la columna 'estado' a la tabla compras_areas_personas si no existe.
 * 2. Asegura que las columnas de zona general existen en areas_layout.
 *
 * Uso: node scripts/arreglar_db.js
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
    console.log('=== Reparación y Alineación de Base de Datos ===\n');

    // 1. Asegurar areas_layout.es_zona_general
    if (await columnExists(conn, 'areas_layout', 'es_zona_general')) {
      console.log('  [OK] areas_layout.es_zona_general ya existe');
    } else {
      await conn.execute(
        `ALTER TABLE areas_layout
         ADD COLUMN es_zona_general TINYINT(1) NOT NULL DEFAULT 0
         COMMENT 'Si es 1, el área es zona de pie: se vende por capacidad, sin asientos individuales'`
      );
      console.log('  [+] areas_layout.es_zona_general agregada');
    }

    // 2. Asegurar areas_layout.capacidad_maxima
    if (await columnExists(conn, 'areas_layout', 'capacidad_maxima')) {
      console.log('  [OK] areas_layout.capacidad_maxima ya existe');
    } else {
      await conn.execute(
        `ALTER TABLE areas_layout
         ADD COLUMN capacidad_maxima INT DEFAULT NULL
         COMMENT 'Límite de entradas para zona general (parados). NULL = sin límite'`
      );
      console.log('  [+] areas_layout.capacidad_maxima agregada');
    }

    // 3. Asegurar areas_layout.tipo_precio_id_general
    if (await columnExists(conn, 'areas_layout', 'tipo_precio_id_general')) {
      console.log('  [OK] areas_layout.tipo_precio_id_general ya existe');
    } else {
      await conn.execute(
        `ALTER TABLE areas_layout
         ADD COLUMN tipo_precio_id_general INT DEFAULT NULL
         COMMENT 'Tipo de precio asignado a esta zona general'`
      );
      console.log('  [+] areas_layout.tipo_precio_id_general agregada');
    }

    // 4. Asegurar tabla compras_areas_personas y su columna estado
    const [tables] = await conn.execute(
      `SELECT 1 FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'compras_areas_personas'`
    );

    if (tables.length === 0) {
      // Si la tabla no existe, crearla con todos los campos
      await conn.execute(`
        CREATE TABLE compras_areas_personas (
          id INT AUTO_INCREMENT PRIMARY KEY,
          compra_id INT NOT NULL,
          area_id INT NOT NULL,
          cantidad INT NOT NULL DEFAULT 1,
          precio_unitario DECIMAL(10,2) DEFAULT NULL,
          precio_total DECIMAL(10,2) DEFAULT NULL,
          estado ENUM('RESERVADO','CONFIRMADO','CANCELADO') NOT NULL DEFAULT 'RESERVADO',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (area_id) REFERENCES areas_layout(id) ON DELETE CASCADE,
          FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('  [+] Tabla compras_areas_personas creada con todas sus columnas');
    } else {
      console.log('  [OK] Tabla compras_areas_personas ya existe. Verificando campos...');
      
      // Verificar si falta la columna 'estado'
      if (await columnExists(conn, 'compras_areas_personas', 'estado')) {
        console.log('  [OK] compras_areas_personas.estado ya existe');
      } else {
        await conn.execute(
          `ALTER TABLE compras_areas_personas
           ADD COLUMN estado ENUM('RESERVADO','CONFIRMADO','CANCELADO') NOT NULL DEFAULT 'RESERVADO'
           AFTER precio_total`
        );
        console.log('  [+] Column compras_areas_personas.estado agregada correctamente');
      }

      // Verificar si falta la columna 'updated_at'
      if (await columnExists(conn, 'compras_areas_personas', 'updated_at')) {
        console.log('  [OK] compras_areas_personas.updated_at ya existe');
      } else {
        await conn.execute(
          `ALTER TABLE compras_areas_personas
           ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
           AFTER created_at`
        );
        console.log('  [+] Column compras_areas_personas.updated_at agregada');
      }

      // Verificar FK de compra_id (en caso de que falte)
      try {
        await conn.execute(
          `ALTER TABLE compras_areas_personas
           ADD CONSTRAINT fk_compras_areas_personas_compra
           FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE`
        );
        console.log('  [+] FK constraint compras_areas_personas -> compras agregada');
      } catch (err) {
        // Probablemente ya existe la FK
      }
    }

    console.log('\n✅ Reparación completada correctamente.');

  } catch (e) {
    console.error('\n❌ Error durante la reparación:', e.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
