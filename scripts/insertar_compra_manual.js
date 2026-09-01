import mysql from 'mysql2/promise';
import crypto from 'crypto';

/**
 * =========================================================================
 * 🔑 1. CREDENCIALES DE LA BASE DE DATOS
 * =========================================================================
 */
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

/**
 * =========================================================================
 * ⚙️ 2. CONFIGURACIÓN DE LA COMPRA MANUAL
 * =========================================================================
 */
const CONFIG = {
  // Evento: CORAZON SERRANO -CBB (ID 81)
  evento_id: 81,

  // Zona: GENERAL (ID 161)
  area_id: 161,

  // Datos del Cliente
  cliente_nombre: 'plustiket',
  cliente_email: 'acanaviril@gmail.com',
  cliente_telefono: '00000000',

  // Cantidad y Precio (0 Bs.)
  cantidad_entradas: 4,   // Cambia a 2, 4 o la cantidad que desees
  precio_unitario: 0.00,  // Precio: 0 Bs.

  // Tipo de pago y Estado
  tipo_pago: 'QR',          // 'QR', 'PASARELA' o 'EFECTIVO'
  tipo_venta: 'NORMAL',     // 'NORMAL' (compra normal de cliente) o 'REGALO_ADMIN' (cortesía 0 Bs.)
  estado: 'PAGO_REALIZADO', // 'PAGO_REALIZADO'

  // Fecha personalizada
  fecha_personalizada: '2026-07-28 15:26:35',
};

// Generar código único para la compra (ej: ENT-1765215246044-1234)
const generarCodigoUnico = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `ENT-${timestamp}-${random}`;
};

// Generar código de escaneo único para cada boleto (ej: ESC-A1B2C3D4)
const generarCodigoEscaneo = async (conn) => {
  let codigo;
  let existe = true;
  while (existe) {
    codigo = 'ESC-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const [rows] = await conn.execute(
      'SELECT id FROM compras_entradas_generales WHERE codigo_escaneo = ?',
      [codigo]
    );
    if (rows.length === 0) existe = false;
  }
  return codigo;
};

async function ejecutar() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    console.log('====================================================');
    console.log('🚀 INSERCIÓN DE COMPRA MANUAL EN ENTRADAS_DB');
    console.log('====================================================\n');

    // 1. Verificar evento
    const [eventos] = await connection.execute(
      'SELECT id, titulo FROM eventos WHERE id = ?',
      [CONFIG.evento_id]
    );
    if (eventos.length === 0) {
      throw new Error(`No existe ningún evento con el ID: ${CONFIG.evento_id}`);
    }

    // 2. Verificar área (GENERAL)
    let nombreArea = 'GENERAL';
    if (CONFIG.area_id) {
      const [areas] = await connection.execute(
        'SELECT id, nombre FROM areas_layout WHERE id = ?',
        [CONFIG.area_id]
      );
      if (areas.length > 0) {
        nombreArea = areas[0].nombre;
      }
    }

    console.log(`📌 Evento: [ID ${eventos[0].id}] ${eventos[0].titulo}`);
    console.log(`📍 Zona:   [ID ${CONFIG.area_id}] ${nombreArea}`);

    const totalCalculado = CONFIG.cantidad_entradas * CONFIG.precio_unitario;
    const codigoUnico = generarCodigoUnico();
    const fecha = CONFIG.fecha_personalizada;

    // 3. Insertar en tabla compras
    const [compraRes] = await connection.execute(
      `INSERT INTO compras 
       (codigo_unico, evento_id, cliente_nombre, cliente_email, cliente_telefono, cantidad, total, subtotal, estado, tipo_pago, tipo_venta, fecha_compra, fecha_pago, fecha_confirmacion, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        codigoUnico,
        CONFIG.evento_id,
        CONFIG.cliente_nombre,
        CONFIG.cliente_email,
        CONFIG.cliente_telefono,
        CONFIG.cantidad_entradas,
        totalCalculado,
        totalCalculado,
        CONFIG.estado,
        CONFIG.tipo_pago,
        CONFIG.tipo_venta || 'NORMAL',
        fecha,
        fecha,
        fecha,
        fecha,
        fecha
      ]
    );

    const compraId = compraRes.insertId;

    // 4. Insertar en tabla compras_areas_personas (para que el reporte de la zona general esté cuadrado)
    if (CONFIG.area_id) {
      await connection.execute(
        `INSERT INTO compras_areas_personas (compra_id, area_id, cantidad, precio_unitario, precio_total, estado, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'CONFIRMADO', ?, ?)`,
        [compraId, CONFIG.area_id, CONFIG.cantidad_entradas, CONFIG.precio_unitario, totalCalculado, fecha, fecha]
      );
    }

    // 5. Generar boletos individuales con sus códigos de escaneo QR
    const codigosEscaneo = [];
    for (let i = 0; i < CONFIG.cantidad_entradas; i++) {
      const codigoEscaneo = await generarCodigoEscaneo(connection);
      await connection.execute(
        `INSERT INTO compras_entradas_generales (compra_id, area_id, codigo_escaneo, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [compraId, CONFIG.area_id, codigoEscaneo, fecha, fecha]
      );
      codigosEscaneo.push(codigoEscaneo);
    }

    console.log(`\n✅ Compra insertada con éxito:`);
    console.log(`   ID Compra:    #${compraId}`);
    console.log(`   Código Único: ${codigoUnico}`);
    console.log(`   Cliente:      ${CONFIG.cliente_nombre}`);
    console.log(`   Zona:         ${nombreArea}`);
    console.log(`   Total:        Bs. ${totalCalculado.toFixed(2)} (${CONFIG.cantidad_entradas} entradas × Bs. ${CONFIG.precio_unitario})`);
    console.log(`   Tipo de Pago: ${CONFIG.tipo_pago}`);
    console.log(`   Fecha:        ${fecha}\n`);

    console.log(`🎟️ ${CONFIG.cantidad_entradas} Boletos generados con códigos de escaneo QR:`);
    codigosEscaneo.forEach((c, idx) => console.log(`   Boleto #${idx + 1}: ${c}`));

    await connection.commit();
    console.log('\n🎉 ¡PROCESO COMPLETADO! Ya aparece en /admin/compras con todos sus datos.');

  } catch (error) {
    await connection.rollback();
    console.error('\n❌ ERROR AL INSERTAR:', error.message);
  } finally {
    connection.release();
    await pool.end();
    process.exit(0);
  }
}

ejecutar();
