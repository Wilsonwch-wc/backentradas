/**
 * Script para verificar la base de datos del servidor:
 * - Lista las tablas que existen
 * - Compara con el esquema esperado y muestra qué tablas/columnas faltan
 * - Genera un archivo SQL solo con ADD COLUMN / CREATE TABLE para lo que falta (sin borrar datos)
 *
 * Uso: node scripts/verificar_y_generar_migracion_servidor.js
 * Requiere: .env o variables con DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (o defaults en config/db.js)
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'entradas_db',
};

// Esquema esperado: tablas que la aplicación necesita y columnas que deben existir.
// Solo se listan columnas que suelen añadirse en migraciones (no las obvias de un CREATE inicial).
const ESQUEMA_ESPERADO = {
  areas_layout: ['id', 'evento_id', 'nombre', 'posicion_x', 'posicion_y', 'ancho', 'alto', 'color', 'tipo_area', 'capacidad_personas', 'orden', 'created_at', 'updated_at'],
  asientos: ['id', 'evento_id', 'mesa_id', 'numero_asiento', 'tipo_precio_id', 'estado', 'posicion_x', 'posicion_y', 'area_id', 'created_at', 'updated_at'],
  clientes: ['id', 'nombre', 'apellido', 'nombre_completo', 'correo', 'telefono', 'password', 'provider', 'provider_id', 'foto_perfil', 'email_verificado', 'activo', 'created_at', 'updated_at', 'codigo_verificacion', 'codigo_verificacion_expira', 'codigo_recuperacion', 'codigo_recuperacion_expira'],
  compras: ['id', 'codigo_unico', 'evento_id', 'cliente_nombre', 'cliente_email', 'cliente_telefono', 'cantidad', 'total', 'estado', 'fecha_compra', 'fecha_pago', 'fecha_confirmacion', 'created_at', 'updated_at', 'codigo_escaneo', 'tipo_venta', 'precio_original', 'cupon_id', 'descuento_cupon', 'usuario_id', 'nit', 'razon_social', 'numero_factura', 'tipo_pago', 'cliente_id', 'descuento', 'subtotal'],
  compras_asientos: ['id', 'compra_id', 'asiento_id', 'precio', 'estado', 'created_at', 'updated_at', 'escaneado', 'fecha_escaneo', 'usuario_escaneo_id', 'codigo_escaneo'],
  compras_entradas_generales: ['id', 'compra_id', 'area_id', 'tipo_precio_id', 'codigo_escaneo', 'escaneado', 'fecha_escaneo', 'usuario_escaneo_id', 'created_at', 'updated_at'],
  compras_mesas: ['id', 'compra_id', 'mesa_id', 'precio', 'cantidad_sillas', 'estado', 'created_at', 'updated_at', 'escaneado', 'fecha_escaneo', 'usuario_escaneo_id', 'codigo_escaneo'],
  compras_detalle_general: ['id', 'compra_id', 'tipo_precio_id', 'cantidad', 'created_at'],
  contacto_info: ['id', 'nombre', 'email', 'telefono', 'mensaje', 'created_at'],
  eventos: ['id', 'titulo', 'descripcion', 'fecha', 'hora_inicio', 'lugar', 'imagen', 'precio', 'estado', 'created_at', 'updated_at', 'slug', 'tipo_evento', 'ubicacion', 'ciudad', 'hora_fin'],
  mesas: ['id', 'evento_id', 'numero_mesa', 'capacidad', 'posicion_x', 'posicion_y', 'area_id', 'created_at', 'updated_at'],
  tipos_precio_evento: ['id', 'evento_id', 'nombre', 'precio', 'created_at', 'updated_at', 'limite'],
  usuarios: ['id', 'nombre', 'correo', 'password', 'rol', 'activo', 'created_at', 'updated_at'],
  cupones: ['id', 'evento_id', 'codigo', 'porcentaje_descuento', 'limite_usos', 'activo', 'created_at', 'updated_at'],
};

// Definiciones para generar ALTER TABLE (solo columnas que suelen faltar en servidor)
const ALTERS_COLUMNAS = [
  { table: 'compras', column: 'usuario_id', sql: 'ALTER TABLE compras ADD COLUMN usuario_id INT NULL;' },
  { table: 'compras', column: 'tipo_venta', sql: "ALTER TABLE compras ADD COLUMN tipo_venta VARCHAR(50) DEFAULT NULL COMMENT 'NORMAL, REGALO_ADMIN, OFERTA_ADMIN';" },
  { table: 'compras', column: 'precio_original', sql: 'ALTER TABLE compras ADD COLUMN precio_original DECIMAL(10,2) DEFAULT NULL;' },
  { table: 'compras', column: 'tipo_pago', sql: "ALTER TABLE compras ADD COLUMN tipo_pago ENUM('QR','EFECTIVO') DEFAULT NULL;" },
  { table: 'compras', column: 'nit', sql: 'ALTER TABLE compras ADD COLUMN nit VARCHAR(20) DEFAULT NULL;' },
  { table: 'compras', column: 'razon_social', sql: 'ALTER TABLE compras ADD COLUMN razon_social VARCHAR(255) DEFAULT NULL;' },
  { table: 'compras', column: 'numero_factura', sql: 'ALTER TABLE compras ADD COLUMN numero_factura VARCHAR(50) DEFAULT NULL;' },
  { table: 'compras', column: 'cupon_id', sql: 'ALTER TABLE compras ADD COLUMN cupon_id INT DEFAULT NULL;' },
  { table: 'compras', column: 'descuento_cupon', sql: 'ALTER TABLE compras ADD COLUMN descuento_cupon DECIMAL(10,2) DEFAULT 0.00;' },
  { table: 'compras', column: 'cliente_id', sql: 'ALTER TABLE compras ADD COLUMN cliente_id INT DEFAULT NULL;' },
  { table: 'compras', column: 'descuento', sql: 'ALTER TABLE compras ADD COLUMN descuento DECIMAL(10,2) DEFAULT 0.00;' },
  { table: 'compras', column: 'subtotal', sql: 'ALTER TABLE compras ADD COLUMN subtotal DECIMAL(10,2) DEFAULT 0.00;' },
  { table: 'compras_entradas_generales', column: 'tipo_precio_id', sql: 'ALTER TABLE compras_entradas_generales ADD COLUMN tipo_precio_id INT NULL AFTER compra_id;' },
  { table: 'tipos_precio_evento', column: 'limite', sql: 'ALTER TABLE tipos_precio_evento ADD COLUMN limite INT NULL DEFAULT NULL COMMENT \'Límite de entradas para este tipo; NULL = sin límite\';' },
  { table: 'clientes', column: 'codigo_verificacion', sql: 'ALTER TABLE clientes ADD COLUMN codigo_verificacion VARCHAR(6) DEFAULT NULL;' },
  { table: 'clientes', column: 'codigo_verificacion_expira', sql: 'ALTER TABLE clientes ADD COLUMN codigo_verificacion_expira DATETIME DEFAULT NULL;' },
  { table: 'clientes', column: 'codigo_recuperacion', sql: 'ALTER TABLE clientes ADD COLUMN codigo_recuperacion VARCHAR(6) DEFAULT NULL;' },
  { table: 'clientes', column: 'codigo_recuperacion_expira', sql: 'ALTER TABLE clientes ADD COLUMN codigo_recuperacion_expira DATETIME DEFAULT NULL;' },
  { table: 'clientes', column: 'email_verificado', sql: 'ALTER TABLE clientes ADD COLUMN email_verificado TINYINT(1) DEFAULT 0;' },
  { table: 'eventos', column: 'estado', sql: "ALTER TABLE eventos ADD COLUMN estado VARCHAR(20) DEFAULT 'activo';" },
  { table: 'eventos', column: 'ubicacion', sql: 'ALTER TABLE eventos ADD COLUMN ubicacion VARCHAR(255) DEFAULT NULL;' },
  { table: 'eventos', column: 'ciudad', sql: 'ALTER TABLE eventos ADD COLUMN ciudad VARCHAR(100) DEFAULT NULL;' },
  { table: 'eventos', column: 'hora_fin', sql: 'ALTER TABLE eventos ADD COLUMN hora_fin DATETIME DEFAULT NULL;' },
];

const CREATE_COMPRAS_DETALLE_GENERAL = `CREATE TABLE IF NOT EXISTS compras_detalle_general (
  id INT NOT NULL AUTO_INCREMENT,
  compra_id INT NOT NULL,
  tipo_precio_id INT NOT NULL,
  cantidad INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_compra_id (compra_id),
  KEY idx_tipo_precio_id (tipo_precio_id),
  CONSTRAINT fk_cdg_compra FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
  CONSTRAINT fk_cdg_tipo_precio FOREIGN KEY (tipo_precio_id) REFERENCES tipos_precio_evento(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

const CREATE_CUPONES = `CREATE TABLE IF NOT EXISTS cupones (
  id INT NOT NULL AUTO_INCREMENT,
  evento_id INT NOT NULL,
  codigo VARCHAR(50) NOT NULL,
  porcentaje_descuento DECIMAL(5,2) NOT NULL,
  limite_usos INT DEFAULT 1,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_evento_id (evento_id),
  KEY idx_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;

async function main() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const dbName = dbConfig.database;

    console.log('========================================');
    console.log('  Verificación de BD para servidor');
    console.log('  Base de datos:', dbName);
    console.log('========================================\n');

    // 1) Tablas actuales en el servidor
    const [tablesRows] = await connection.execute(
      'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
      [dbName]
    );
    const tablasEnServidor = new Set(tablesRows.map((r) => r.TABLE_NAME));

    // 2) Columnas actuales: por tabla
    const [columnsRows] = await connection.execute(
      'SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION',
      [dbName]
    );
    const columnasPorTabla = {};
    for (const r of columnsRows) {
      if (!columnasPorTabla[r.TABLE_NAME]) columnasPorTabla[r.TABLE_NAME] = new Set();
      columnasPorTabla[r.TABLE_NAME].add(r.COLUMN_NAME);
    }

    // 3) Comparar con esquema esperado
    const tablasFaltantes = [];
    const columnasFaltantes = {}; // { tabla: [ col1, col2 ] }

    for (const [tabla, columnasEsperadas] of Object.entries(ESQUEMA_ESPERADO)) {
      if (!tablasEnServidor.has(tabla)) {
        tablasFaltantes.push(tabla);
        continue;
      }
      const columnasActuales = columnasPorTabla[tabla] || new Set();
      const faltantes = columnasEsperadas.filter((c) => !columnasActuales.has(c));
      if (faltantes.length) columnasFaltantes[tabla] = faltantes;
    }

    // 4) Reporte por consola
    console.log('--- TABLAS EN EL SERVIDOR ---');
    console.log(Array.from(tablasEnServidor).sort().join(', '));
    console.log('');

    if (tablasFaltantes.length) {
      console.log('--- TABLAS QUE FALTAN (esperadas por la app) ---');
      tablasFaltantes.forEach((t) => console.log('  -', t));
      console.log('');
    } else {
      console.log('--- TABLAS: todas las esperadas existen. ---\n');
    }

    if (Object.keys(columnasFaltantes).length) {
      console.log('--- COLUMNAS QUE FALTAN (por tabla) ---');
      for (const [tabla, cols] of Object.entries(columnasFaltantes)) {
        console.log(' ', tabla + ':', cols.join(', '));
      }
      console.log('');
    } else {
      console.log('--- COLUMNAS: no falta ninguna de las esperadas. ---\n');
    }

    // 5) Generar SQL solo para lo que falta (sin borrar datos)
    const lineas = [
      '-- Generado por verificar_y_generar_migracion_servidor.js',
      '-- Solo agrega tablas/columnas que faltan. NO elimina datos.',
      '-- Revisar antes de ejecutar en el servidor.',
      '',
      'SET FOREIGN_KEY_CHECKS = 0;',
      '',
    ];

    if (tablasFaltantes.includes('compras_detalle_general')) {
      lineas.push(CREATE_COMPRAS_DETALLE_GENERAL);
      lineas.push('');
    }
    if (tablasFaltantes.includes('cupones')) {
      lineas.push(CREATE_CUPONES);
      lineas.push('');
    }

    for (const { table, column, sql } of ALTERS_COLUMNAS) {
      if (!tablasEnServidor.has(table)) continue;
      const faltantes = columnasFaltantes[table];
      if (faltantes && faltantes.includes(column)) {
        lineas.push(sql);
        lineas.push('');
      }
    }

    if (tablasEnServidor.has('compras') && (columnasFaltantes.compras || []).includes('usuario_id')) {
      lineas.push('-- Si tienes tabla usuarios, descomenta la siguiente línea para la FK:');
      lineas.push('-- ALTER TABLE compras ADD CONSTRAINT fk_compras_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;');
      lineas.push('');
    }

    if (tablasEnServidor.has('escaneos_entradas')) {
      lineas.push('-- Permitir entradas GENERAL (eventos sin asientos/mesas)');
      lineas.push("ALTER TABLE escaneos_entradas MODIFY COLUMN tipo ENUM('ASIENTO','MESA','GENERAL') NOT NULL;");
      lineas.push('');
    }

    lineas.push('SET FOREIGN_KEY_CHECKS = 1;');
    lineas.push('');

    const archivoSalida = path.join(__dirname, 'sql_para_agregar_faltantes_servidor.sql');
    fs.writeFileSync(archivoSalida, lineas.join('\n'), 'utf8');
    console.log('--- ARCHIVO GENERADO ---');
    console.log('  ', archivoSalida);
    console.log('  Contiene solo ADD COLUMN / CREATE TABLE para lo que falta.');
    console.log('  Revisa el archivo y ejecútalo en el servidor cuando quieras aplicar los cambios.');
    console.log('');

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

main();
