USE entradas_db;

SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'entradas_db'
    AND TABLE_NAME = 'compras'
    AND COLUMN_NAME = 'tipo_pago'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE compras ADD COLUMN tipo_pago ENUM(''QR'', ''EFECTIVO'') DEFAULT NULL COMMENT ''Tipo de pago al confirmar: QR o Efectivo''',
  'SELECT "La columna tipo_pago ya existe" AS Mensaje'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = 'entradas_db'
    AND TABLE_NAME = 'compras'
    AND INDEX_NAME = 'idx_tipo_pago'
);

SET @sql_idx = IF(@idx_exists = 0,
  'CREATE INDEX idx_tipo_pago ON compras(tipo_pago)',
  'SELECT "El índice idx_tipo_pago ya existe" AS Mensaje'
);

PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;

SELECT 'Script ejecutado correctamente' AS Resultado;