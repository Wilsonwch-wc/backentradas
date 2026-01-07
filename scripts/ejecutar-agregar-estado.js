import pool from '../config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ejecutarScript() {
  let connection;
  
  try {
    console.log('🔧 Ejecutando script para agregar campo estado a eventos...\n');
    
    connection = await pool.getConnection();
    
    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, 'agregar_campo_estado_eventos.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Ejecutar cada comando SQL separadamente
    const comandos = sql.split(';').filter(cmd => cmd.trim().length > 0);
    
    for (const comando of comandos) {
      const cmdLimpio = comando.trim();
      if (cmdLimpio && !cmdLimpio.startsWith('--')) {
        try {
          await connection.execute(cmdLimpio);
          console.log('✅ Comando ejecutado:', cmdLimpio.substring(0, 50) + '...');
        } catch (error) {
          // Si el error es que la columna ya existe, está bien
          if (error.message.includes('Duplicate column') || error.message.includes('ya existe')) {
            console.log('ℹ️  La columna estado ya existe, continuando...');
          } else {
            throw error;
          }
        }
      }
    }
    
    console.log('\n✅ Script ejecutado exitosamente!');
    console.log('📋 El campo estado ha sido agregado a la tabla eventos.');
    console.log('   Estados disponibles: activo, proximamente, finalizado');
    
  } catch (error) {
    console.error('❌ Error al ejecutar el script:', error);
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
    await pool.end();
  }
}

ejecutarScript();

