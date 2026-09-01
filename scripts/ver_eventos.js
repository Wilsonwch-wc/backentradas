import mysql from 'mysql2/promise';

// 🔑 CREDENCIALES DE LA BASE DE DATOS
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'entradas_db',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function verEventos() {
  try {
    console.log('====================================================');
    console.log('📋 LISTA DE EVENTOS EN LA BASE DE DATOS (entradas_db)');
    console.log('====================================================\n');

    const [eventos] = await pool.execute(
      'SELECT id, titulo, estado, hora_inicio FROM eventos ORDER BY id DESC'
    );

    if (eventos.length === 0) {
      console.log('No hay eventos registrados.');
      process.exit(0);
    }

    for (const ev of eventos) {
      const fecha = ev.hora_inicio ? new Date(ev.hora_inicio).toLocaleString('es-ES') : 'Sin fecha';
      console.log(`📌 ID: ${ev.id} | Título: "${ev.titulo}" | Estado: ${ev.estado.toUpperCase()} | Fecha: ${fecha}`);

      // Consultar áreas o zonas de este evento si existen
      const [areas] = await pool.execute(
        'SELECT id, nombre, tipo_area FROM areas_layout WHERE evento_id = ?',
        [ev.id]
      );
      if (areas.length > 0) {
        console.log(`   Áreas/Zonas:`);
        areas.forEach(a => console.log(`     - [ID ${a.id}] ${a.nombre} (${a.tipo_area})`));
      }
      console.log('----------------------------------------------------');
    }
  } catch (error) {
    console.error('❌ Error al consultar eventos:', error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

verEventos();
