import pool from '../config/db.js';

/** Agrega una columna solo si no existe ya en la tabla */
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

/** Agrega un índice solo si no existe ya */
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
  console.log('🔄 Iniciando migración de tabla pagos...\n');

  // 1. Vincular pago QR con compra
  await addColumnIfNotExists('pagos', 'compra_id', 'INT NULL DEFAULT NULL COMMENT "ID de la compra vinculada en tabla compras"');

  // 2. Registrar ambiente del pago
  await addColumnIfNotExists('pagos', 'ambiente', "VARCHAR(20) NULL DEFAULT 'TEST' COMMENT 'Ambiente pasarela: TEST | PRODUCCION'");

  // 3. Fecha de última actualización de estado
  await addColumnIfNotExists('pagos', 'updated_at', 'DATETIME NULL DEFAULT NULL COMMENT "Fecha de ultima actualizacion del estado"');

  // 4. Ampliar campo estado para todos los estados del Req 9
  await pool.execute(
    `ALTER TABLE pagos MODIFY COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'pending'
     COMMENT 'Estado: pending | approved | expired | cancelled | rejected'`
  );
  console.log('✅ Campo estado: modificado');

  // 5. Índices para búsquedas eficientes
  await addIndexIfNotExists('pagos', 'idx_external_reference', 'external_reference');
  await addIndexIfNotExists('pagos', 'idx_estado_created', 'estado, created_at');

  console.log('\n✅ Migración completada exitosamente');
} catch (e) {
  console.error('\n❌ Error en migración:', e.message);
}

process.exit(0);
