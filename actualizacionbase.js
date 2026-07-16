import pool from './config/db.js';

async function main() {
  console.log('Iniciando actualización de la base de datos...');

  const queries = [
    {
      desc: '1. Agregar modo_layout a eventos',
      sql: "ALTER TABLE eventos ADD COLUMN modo_layout ENUM('libre','grid') NOT NULL DEFAULT 'libre'"
    },
    {
      desc: '2. Agregar posicion en grid a mesas (col)',
      sql: "ALTER TABLE mesas ADD COLUMN grid_col INT NULL"
    },
    {
      desc: '2. Agregar posicion en grid a mesas (row)',
      sql: "ALTER TABLE mesas ADD COLUMN grid_row INT NULL"
    },
    {
      desc: '3. Agregar posicion en grid a asientos (col)',
      sql: "ALTER TABLE asientos ADD COLUMN grid_col INT NULL"
    },
    {
      desc: '3. Agregar posicion en grid a asientos (row)',
      sql: "ALTER TABLE asientos ADD COLUMN grid_row INT NULL"
    },
    {
      desc: '4. Agregar posicion en grid a areas_layout (col_inicio)',
      sql: "ALTER TABLE areas_layout ADD COLUMN grid_col_inicio INT NULL"
    },
    {
      desc: '4. Agregar posicion en grid a areas_layout (row_inicio)',
      sql: "ALTER TABLE areas_layout ADD COLUMN grid_row_inicio INT NULL"
    },
    {
      desc: '4. Agregar posicion en grid a areas_layout (col_fin)',
      sql: "ALTER TABLE areas_layout ADD COLUMN grid_col_fin INT NULL"
    },
    {
      desc: '4. Agregar posicion en grid a areas_layout (row_fin)',
      sql: "ALTER TABLE areas_layout ADD COLUMN grid_row_fin INT NULL"
    },
    {
      desc: '5. Permitir que boletos de mesas completas no requieran asiento_id',
      sql: "ALTER TABLE compras_asientos MODIFY asiento_id INT NULL"
    },
    {
      desc: '6. Agregar soporte para escenarios con formas personalizadas',
      sql: "ALTER TABLE eventos ADD COLUMN escenario_celdas JSON NULL"
    },
    {
      desc: '7. Agregar soporte para áreas con celdas excluidas',
      sql: "ALTER TABLE areas_layout ADD COLUMN celdas_excluidas JSON NULL"
    },
    {
      desc: '8. Diferenciar pagos de pasarela de los manuales en compras',
      sql: "ALTER TABLE compras MODIFY COLUMN tipo_pago ENUM('EFECTIVO', 'QR', 'PASARELA_QR') NULL DEFAULT NULL"
    }
  ];

  for (const q of queries) {
    try {
      console.log(`Ejecutando: ${q.desc}`);
      await pool.query(q.sql);
      console.log(`✅ OK: ${q.desc}`);
    } catch (error) {
      // Ignorar errores si la columna ya existe
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log(`⚠️ Ignorado: La columna ya existe (${q.desc})`);
      } else {
        console.error(`❌ ERROR en ${q.desc}:`, error.message);
      }
    }
  }

  console.log('✅ Actualización finalizada exitosamente.');
  process.exit(0);
}

main();
