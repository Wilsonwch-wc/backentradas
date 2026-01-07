import pool from '../config/db.js';

async function ejecutarScript() {
  let connection;
  
  try {
    console.log('🔧 Ejecutando script para agregar campo estado a eventos...\n');
    
    connection = await pool.getConnection();
    
    // Verificar si la columna ya existe
    const [columnas] = await connection.execute(`
      SELECT COUNT(*) as existe
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'eventos' 
        AND COLUMN_NAME = 'estado'
    `);
    
    if (columnas[0].existe > 0) {
      console.log('ℹ️  La columna estado ya existe en la tabla eventos.');
    } else {
      console.log('➕ Agregando columna estado a la tabla eventos...');
      await connection.execute(`
        ALTER TABLE eventos 
        ADD COLUMN estado VARCHAR(20) DEFAULT 'activo' AFTER tipo_evento
      `);
      console.log('✅ Columna estado agregada exitosamente.');
    }
    
    // Actualizar eventos pasados a 'finalizado'
    console.log('\n🔄 Actualizando eventos pasados a estado "finalizado"...');
    const [resultFinalizados] = await connection.execute(`
      UPDATE eventos 
      SET estado = 'finalizado' 
      WHERE hora_inicio < NOW() AND (estado IS NULL OR estado = 'activo')
    `);
    console.log(`✅ ${resultFinalizados.affectedRows} eventos pasados actualizados a "finalizado".`);
    
    // Actualizar eventos futuros a 'activo' si no tienen estado
    console.log('\n🔄 Actualizando eventos futuros a estado "activo"...');
    const [resultActivos] = await connection.execute(`
      UPDATE eventos 
      SET estado = 'activo' 
      WHERE hora_inicio >= NOW() AND (estado IS NULL OR estado = '')
    `);
    console.log(`✅ ${resultActivos.affectedRows} eventos futuros actualizados a "activo".`);
    
    console.log('\n✅ Script ejecutado exitosamente!');
    console.log('📋 El campo estado ha sido agregado y configurado en la tabla eventos.');
    console.log('   Estados disponibles: activo, proximamente, finalizado');
    
  } catch (error) {
    console.error('❌ Error al ejecutar el script:', error);
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️  La columna estado ya existe, continuando con actualizaciones...');
    } else {
      process.exit(1);
    }
  } finally {
    if (connection) {
      connection.release();
    }
    await pool.end();
  }
}

ejecutarScript();

