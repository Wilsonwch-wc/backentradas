import pool from '../config/db.js';

async function ejecutarScript() {
  let connection;
  
  try {
    console.log('🔧 Ejecutando script para agregar verificación de email...\n');
    
    connection = await pool.getConnection();
    
    // Verificar si codigo_verificacion existe
    const [colCodigo] = await connection.execute(`
      SELECT COUNT(*) as existe
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'clientes' 
        AND COLUMN_NAME = 'codigo_verificacion'
    `);
    
    if (colCodigo[0].existe === 0) {
      console.log('➕ Agregando columna codigo_verificacion...');
      await connection.execute(`
        ALTER TABLE clientes 
        ADD COLUMN codigo_verificacion VARCHAR(4) NULL AFTER password
      `);
      console.log('✅ Columna codigo_verificacion agregada.');
    } else {
      console.log('ℹ️  La columna codigo_verificacion ya existe.');
    }
    
    // Verificar si codigo_verificacion_expira existe
    const [colExpira] = await connection.execute(`
      SELECT COUNT(*) as existe
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'clientes' 
        AND COLUMN_NAME = 'codigo_verificacion_expira'
    `);
    
    if (colExpira[0].existe === 0) {
      console.log('➕ Agregando columna codigo_verificacion_expira...');
      await connection.execute(`
        ALTER TABLE clientes 
        ADD COLUMN codigo_verificacion_expira DATETIME NULL AFTER codigo_verificacion
      `);
      console.log('✅ Columna codigo_verificacion_expira agregada.');
    } else {
      console.log('ℹ️  La columna codigo_verificacion_expira ya existe.');
    }
    
    // Verificar si email_verificado existe
    const [colVerificado] = await connection.execute(`
      SELECT COUNT(*) as existe
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'clientes' 
        AND COLUMN_NAME = 'email_verificado'
    `);
    
    if (colVerificado[0].existe === 0) {
      console.log('➕ Agregando columna email_verificado...');
      await connection.execute(`
        ALTER TABLE clientes 
        ADD COLUMN email_verificado BOOLEAN DEFAULT FALSE AFTER codigo_verificacion_expira
      `);
      console.log('✅ Columna email_verificado agregada.');
    } else {
      console.log('ℹ️  La columna email_verificado ya existe.');
    }
    
    // Actualizar usuarios existentes de Google como verificados
    console.log('\n🔄 Actualizando usuarios de Google como verificados...');
    const [resultGoogle] = await connection.execute(`
      UPDATE clientes 
      SET email_verificado = TRUE 
      WHERE provider = 'google' AND (email_verificado IS NULL OR email_verificado = FALSE)
    `);
    console.log(`✅ ${resultGoogle.affectedRows} usuarios de Google actualizados.`);
    
    // Actualizar usuarios locales existentes como verificados (para no afectar usuarios actuales)
    console.log('\n🔄 Actualizando usuarios locales existentes como verificados...');
    const [resultLocal] = await connection.execute(`
      UPDATE clientes 
      SET email_verificado = TRUE 
      WHERE provider = 'local' AND (email_verificado IS NULL OR email_verificado = FALSE)
    `);
    console.log(`✅ ${resultLocal.affectedRows} usuarios locales actualizados.`);
    
    console.log('\n✅ Script ejecutado exitosamente!');
    console.log('📋 Los campos de verificación de email han sido agregados a la tabla clientes.');
    
  } catch (error) {
    console.error('❌ Error al ejecutar el script:', error);
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️  Algunas columnas ya existen, continuando...');
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

