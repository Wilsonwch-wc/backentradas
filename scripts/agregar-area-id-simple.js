import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'entradas_db'
});

const [cols] = await conn.query(
  "SELECT COUNT(*) as n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='entradas_db' AND TABLE_NAME='compras_entradas_generales' AND COLUMN_NAME='area_id'"
);
if (cols[0].n > 0) {
  console.log('Columna area_id ya existe');
} else {
  await conn.query('ALTER TABLE compras_entradas_generales ADD COLUMN area_id INT NULL AFTER compra_id');
  console.log('Columna area_id agregada');
}
try {
  await conn.query('CREATE INDEX idx_area_id ON compras_entradas_generales(area_id)');
  console.log('Indice idx_area_id creado');
} catch (e) {
  if (e.code === 'ER_DUP_KEYNAME') console.log('Indice ya existe');
  else throw e;
}
await conn.end();
console.log('Listo');
