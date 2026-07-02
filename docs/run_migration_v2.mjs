import pool from '../config/db.js';

const addColumnIfNotExists = async (table, column, definition) => {
  const [cols] = await pool.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (cols.length === 0) {
    await pool.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`✅ Columna ${column}: agregada`);
  } else {
    console.log(`ℹ️  Columna ${column}: ya existe`);
  }
};

const addIndexIfNotExists = async (table, indexName, definition) => {
  const [idxs] = await pool.execute(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  if (idxs.length === 0) {
    await pool.execute(`ALTER TABLE ${table} ADD INDEX ${indexName} (${definition})`);
    console.log(`✅ Índice ${indexName}: creado`);
  } else {
    console.log(`ℹ️  Índice ${indexName}: ya existe`);
  }
};

try {
  console.log('🔄 Migración v2: columna atc_referencia en tabla pagos\n');

  // Referencia generada por Redenlace ATC (distinta a la referencia del comercio)
  await addColumnIfNotExists(
    'pagos',
    'atc_referencia',
    "VARCHAR(30) NULL DEFAULT NULL COMMENT 'Referencia generada por Redenlace ATC (numeroReferencia en respuesta generarQr)'"
  );

  // Índice para búsqueda por referencia ATC (usada en el callback)
  await addIndexIfNotExists('pagos', 'idx_atc_referencia', 'atc_referencia');

  console.log('\n✅ Migración v2 completada');
} catch (e) {
  console.error('\n❌ Error en migración v2:', e.message);
}

process.exit(0);
