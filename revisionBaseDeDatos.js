import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'entradas_db',
  timezone: '-04:00'
};

const SQL_PATH = path.resolve(__dirname, '..', 'base (1).sql');

function extractTableBody(sqlText, tableName) {
  const marker = `CREATE TABLE \`${tableName}\``;
  const idx = sqlText.indexOf(marker);
  if (idx === -1) return null;

  let pos = idx + marker.length;
  while (pos < sqlText.length && sqlText[pos] !== '(') pos++;
  if (pos >= sqlText.length) return null;

  let depth = 1;
  pos++;
  const start = pos;

  while (pos < sqlText.length && depth > 0) {
    if (sqlText[pos] === '(') depth++;
    else if (sqlText[pos] === ')') depth--;
    pos++;
  }

  return sqlText.substring(start, pos - 1);
}

function parseColumns(body) {
  if (!body) return [];
  const columns = [];
  const lines = body.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    if (/^\s*(PRIMARY\s+KEY|UNIQUE\s+KEY|KEY\s+|CONSTRAINT|INDEX)\s/i.test(trimmed)) continue;

    const colMatch = trimmed.match(/^`(\w+)`\s+(.+)/);
    if (colMatch) {
      let def = colMatch[2].trim();
      if (def.endsWith(',')) def = def.slice(0, -1).trim();
      columns.push({
        name: colMatch[1],
        definition: def
      });
    }
  }

  return columns;
}

function parseSQL(sqlText) {
  const tables = {};
  const createRegex = /CREATE TABLE `(\w+)`/gi;
  let match;

  while ((match = createRegex.exec(sqlText)) !== null) {
    const tableName = match[1];
    const body = extractTableBody(sqlText, tableName);
    if (body) {
      tables[tableName] = parseColumns(body);
    }
  }

  return tables;
}

async function getActualSchema(pool) {
  const tables = {};

  const [tableRows] = await pool.execute(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME",
    [dbConfig.database]
  );

  for (const row of tableRows) {
    const tableName = row.TABLE_NAME;
    const [colRows] = await pool.execute(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [dbConfig.database, tableName]
    );

    tables[tableName] = colRows.map(col => ({
      name: col.COLUMN_NAME,
      type: col.COLUMN_TYPE,
      nullable: col.IS_NULLABLE,
      default: col.COLUMN_DEFAULT,
      key: col.COLUMN_KEY,
      extra: col.EXTRA
    }));
  }

  return tables;
}

async function main() {
  console.log('======================================================================');
  console.log('           REVISION DE BASE DE DATOS - ENTRADAS');
  console.log('======================================================================');
  console.log('');
  console.log(`  Host:     ${dbConfig.host}`);
  console.log(`  Database: ${dbConfig.database}`);
  console.log(`  User:     ${dbConfig.user}`);
  console.log(`  SQL ref:  ${SQL_PATH}`);
  console.log('');

  if (!fs.existsSync(SQL_PATH)) {
    console.error(`ERROR: No se encontro el archivo SQL de referencia: ${SQL_PATH}`);
    process.exit(1);
  }

  const sqlText = fs.readFileSync(SQL_PATH, 'utf-8');
  const expected = parseSQL(sqlText);

  console.log(`  Tablas esperadas en SQL de referencia: ${Object.keys(expected).length}`);
  console.log('');

  let pool;
  try {
    pool = mysql.createPool({ ...dbConfig, connectionLimit: 5 });
    const connection = await pool.getConnection();
    console.log('  Conexion a MySQL exitosa.');
    connection.release();

    const actual = await getActualSchema(pool);

    console.log(`  Tablas actuales en servidor:          ${Object.keys(actual).length}`);
    console.log('');
    console.log('----------------------------------------------------------------------');

    const expectedTables = Object.keys(expected).sort();
    const actualTables = Object.keys(actual).sort();

    const missingTables = expectedTables.filter(t => !actualTables.includes(t));
    const extraTables = actualTables.filter(t => !expectedTables.includes(t));
    const commonTables = expectedTables.filter(t => actualTables.includes(t));

    const alterStatements = [];

    if (missingTables.length > 0) {
      console.log('');
      console.log('*** TABLAS FALTANTES EN EL SERVIDOR ***');
      for (const t of missingTables) {
        const colCount = expected[t].length;
        console.log(`  [FALTA] ${t} (${colCount} columnas)`);
      }
    }

    if (extraTables.length > 0) {
      console.log('');
      console.log('*** TABLAS EXTRA EN EL SERVIDOR (no estan en SQL de referencia) ***');
      for (const t of extraTables) {
        console.log(`  [EXTRA] ${t}`);
      }
    }

    if (missingTables.length === 0 && extraTables.length === 0) {
      console.log('');
      console.log('  [OK] Todas las tablas coinciden.');
    }

    console.log('');
    console.log('----------------------------------------------------------------------');
    console.log('*** REVISION DE COLUMNAS POR TABLA ***');
    console.log('');

    let totalMissingCols = 0;
    let tablesWithIssues = 0;

    for (const tableName of commonTables) {
      const expectedCols = expected[tableName];
      const actualCols = actual[tableName];
      const actualColNames = new Set(actualCols.map(c => c.name));
      const expectedColNames = expectedCols.map(c => c.name);

      const missingCols = expectedCols.filter(c => !actualColNames.has(c.name));
      const extraCols = actualCols.filter(c => !expectedColNames.includes(c.name));

      if (missingCols.length > 0 || extraCols.length > 0) {
        tablesWithIssues++;
        console.log(`  TABLA: ${tableName}`);
        if (missingCols.length > 0) {
          for (const col of missingCols) {
            console.log(`    [-] FALTA: ${col.name}  (${col.definition})`);
            const def = col.definition
              .replace(/\s*ON UPDATE CURRENT_TIMESTAMP/i, '')
              .replace(/\s*DEFAULT CURRENT_TIMESTAMP/i, '')
              .replace(/\s*DEFAULT '.*?'/i, '')
              .replace(/\s*COMMENT '.*?'/i, '')
              .replace(/\s*AUTO_INCREMENT/i, '')
              .trim();
            const nullPart = col.definition.toUpperCase().includes('NOT NULL') ? 'NOT NULL' : 'NULL';
            const defaultMatch = col.definition.match(/DEFAULT\s+(CURRENT_TIMESTAMP|NULL|'[^']*'|\d[\d.]*)/i);
            const defaultVal = defaultMatch ? `DEFAULT ${defaultMatch[1]}` : '';
            const autoInc = col.definition.toUpperCase().includes('AUTO_INCREMENT') ? ' AUTO_INCREMENT' : '';

            const colIndex = expectedCols.indexOf(col);
            let afterClause = '';
            if (colIndex > 0) {
              const prevCol = expectedCols[colIndex - 1];
              if (actualColNames.has(prevCol.name)) {
                afterClause = ` AFTER \`${prevCol.name}\``;
              }
            }

            alterStatements.push(
              `ALTER TABLE \`${tableName}\` ADD COLUMN \`${col.name}\` ${def}${afterClause};`
            );
            totalMissingCols++;
          }
        }
        if (extraCols.length > 0) {
          for (const col of extraCols) {
            console.log(`    [+] EXTRA: ${col.name} (${col.type})`);
          }
        }
        console.log('');
      }
    }

    if (tablesWithIssues === 0) {
      console.log('  [OK] Todas las columnas coinciden en las tablas comunes.');
      console.log('');
    }

    console.log('======================================================================');
    console.log('*** RESUMEN ***');
    console.log(`  Tablas esperadas:      ${expectedTables.length}`);
    console.log(`  Tablas en servidor:    ${actualTables.length}`);
    console.log(`  Tablas faltantes:      ${missingTables.length}`);
    console.log(`  Tablas extra:          ${extraTables.length}`);
    console.log(`  Columnas faltantes:     ${totalMissingCols}`);
    console.log('');

    if (alterStatements.length > 0) {
      console.log('======================================================================');
      console.log('*** SQL PARA CORREGIR (copiar y ejecutar en MySQL) ***');
      console.log('');
      for (const stmt of alterStatements) {
        console.log(stmt);
      }
      console.log('');
    }

    console.log('======================================================================');
    console.log('Revision completada.');
    console.log('');

  } catch (error) {
    console.error('ERROR de conexion:', error.message);
    process.exit(1);
  } finally {
    if (pool) await pool.end();
  }
}

main();
