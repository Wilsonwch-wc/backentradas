import pool from '../config/db.js';

// Escanear entrada por código de escaneo
const escanearPorCodigo = async (codigoEscaneo, usuarioId) => {
  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    let entradaEscaneada = null;
    let yaEscaneada = false;
    let compra = null;

    // Buscar en compras_asientos
    const [asientos] = await connection.execute(
      `SELECT 
        ca.*, 
        a.numero_asiento, 
        a.mesa_id, 
        m.numero_mesa, 
        tp.nombre as tipo_precio_nombre,
        c.id as compra_id,
        c.codigo_unico,
        c.cliente_nombre,
        c.evento_id,
        e.titulo as evento_titulo
       FROM compras_asientos ca
       INNER JOIN asientos a ON ca.asiento_id = a.id
       INNER JOIN compras c ON ca.compra_id = c.id
       INNER JOIN eventos e ON c.evento_id = e.id
       LEFT JOIN mesas m ON a.mesa_id = m.id
       LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
       WHERE ca.codigo_escaneo = ? AND ca.estado = 'CONFIRMADO'`,
      [codigoEscaneo]
    );

    if (asientos.length > 0) {
      const asiento = asientos[0];
      compra = {
        id: asiento.compra_id,
        codigo_unico: asiento.codigo_unico,
        cliente_nombre: asiento.cliente_nombre,
        evento: asiento.evento_titulo
      };

      if (asiento.escaneado) {
        yaEscaneada = true;
        entradaEscaneada = {
          tipo: 'ASIENTO',
          numero_asiento: asiento.numero_asiento,
          numero_mesa: asiento.numero_mesa,
          tipo_precio: asiento.tipo_precio_nombre,
          codigo_escaneo: codigoEscaneo,
          fecha_escaneo: asiento.fecha_escaneo,
          ya_escaneado: true
        };
      } else {
        // Marcar como escaneado
        await connection.execute(
          `UPDATE compras_asientos 
           SET escaneado = TRUE, 
               fecha_escaneo = NOW(), 
               usuario_escaneo_id = ?
           WHERE id = ?`,
          [usuarioId, asiento.id]
        );

        entradaEscaneada = {
          tipo: 'ASIENTO',
          numero_asiento: asiento.numero_asiento,
          numero_mesa: asiento.numero_mesa,
          tipo_precio: asiento.tipo_precio_nombre,
          codigo_escaneo: codigoEscaneo,
          fecha_escaneo: new Date(),
          ya_escaneado: false
        };

        // Registrar en tabla de auditoría
        await connection.execute(
          `INSERT INTO escaneos_entradas 
           (tipo, compra_asiento_id, compra_id, evento_id, usuario_escaneo_id, datos_qr)
           VALUES (?, ?, ?, ?, ?, ?)`,
          ['ASIENTO', asiento.id, asiento.compra_id, asiento.evento_id, usuarioId, JSON.stringify({ codigo_escaneo: codigoEscaneo })]
        );
      }
    } else {
      // Buscar en compras_mesas
      const [mesas] = await connection.execute(
        `SELECT 
          cm.*, 
          m.numero_mesa,
          c.id as compra_id,
          c.codigo_unico,
          c.cliente_nombre,
          c.evento_id,
          e.titulo as evento_titulo
         FROM compras_mesas cm
         INNER JOIN mesas m ON cm.mesa_id = m.id
         INNER JOIN compras c ON cm.compra_id = c.id
         INNER JOIN eventos e ON c.evento_id = e.id
         WHERE cm.codigo_escaneo = ? AND cm.estado = 'CONFIRMADO'`,
        [codigoEscaneo]
      );

      if (mesas.length === 0) {
        await connection.rollback();
        connection.release();
        throw new Error('NOT_FOUND: Código de escaneo no encontrado o entrada no confirmada');
      }

      const mesa = mesas[0];
      compra = {
        id: mesa.compra_id,
        codigo_unico: mesa.codigo_unico,
        cliente_nombre: mesa.cliente_nombre,
        evento: mesa.evento_titulo
      };

      if (mesa.escaneado) {
        yaEscaneada = true;
        entradaEscaneada = {
          tipo: 'MESA',
          numero_mesa: mesa.numero_mesa,
          cantidad_sillas: mesa.cantidad_sillas,
          codigo_escaneo: codigoEscaneo,
          fecha_escaneo: mesa.fecha_escaneo,
          ya_escaneado: true
        };
      } else {
        // Marcar como escaneada
        await connection.execute(
          `UPDATE compras_mesas 
           SET escaneado = TRUE, 
               fecha_escaneo = NOW(), 
               usuario_escaneo_id = ?
           WHERE id = ?`,
          [usuarioId, mesa.id]
        );

        entradaEscaneada = {
          tipo: 'MESA',
          numero_mesa: mesa.numero_mesa,
          cantidad_sillas: mesa.cantidad_sillas,
          codigo_escaneo: codigoEscaneo,
          fecha_escaneo: new Date(),
          ya_escaneado: false
        };

        // Registrar en tabla de auditoría
        await connection.execute(
          `INSERT INTO escaneos_entradas 
           (tipo, compra_mesa_id, compra_id, evento_id, usuario_escaneo_id, datos_qr)
           VALUES (?, ?, ?, ?, ?, ?)`,
          ['MESA', mesa.id, mesa.compra_id, mesa.evento_id, usuarioId, JSON.stringify({ codigo_escaneo: codigoEscaneo })]
        );
      }
    }

    await connection.commit();
    connection.release();

    return {
      success: true,
      message: yaEscaneada 
        ? 'Entrada ya fue escaneada anteriormente' 
        : 'Entrada escaneada exitosamente',
      data: {
        compra: compra,
        entrada: entradaEscaneada,
        ya_escaneada: yaEscaneada
      }
    };

  } catch (error) {
    await connection.rollback();
    connection.release();
    throw error;
  }
};

// Escanear entrada por código de escaneo o QR
export const escanearQR = async (req, res) => {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📥 RECIBIDA PETICIÓN DE ESCANEO');
    console.log('URL:', req.originalUrl);
    console.log('Método:', req.method);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('Usuario:', req.user ? `${req.user.nombre} (${req.user.rol})` : 'No autenticado');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const { codigoEscaneo, qrData } = req.body;
    const usuarioId = req.user?.id || null;

    // Si se proporciona código de escaneo, buscar por ese código
    if (codigoEscaneo) {
      const codigo = codigoEscaneo.trim();
      
      // Validar que sea un código de 5 dígitos
      if (!/^\d{5}$/.test(codigo)) {
        return res.status(400).json({
          success: false,
          message: 'Código de escaneo inválido. Debe ser de 5 dígitos.'
        });
      }

      try {
        const resultado = await escanearPorCodigo(codigo, usuarioId);
        return res.json(resultado);
      } catch (error) {
        if (error.message?.startsWith('NOT_FOUND:')) {
          return res.status(404).json({
            success: false,
            message: error.message.replace('NOT_FOUND: ', '')
          });
        }
        throw error;
      }
    }

    // Si no hay código de escaneo, intentar con QR (compatibilidad hacia atrás)
    if (!qrData) {
      return res.status(400).json({
        success: false,
        message: 'Código de escaneo o datos del QR no proporcionados'
      });
    }

    // Parsear los datos del QR
    let datosQR;
    try {
      datosQR = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: 'Formato de QR inválido'
      });
    }

    const { compra_id, asiento_id, evento_id } = datosQR;

    if (!compra_id || !evento_id) {
      return res.status(400).json({
        success: false,
        message: 'QR incompleto: faltan datos de compra o evento'
      });
    }

    // Verificar que la compra existe y está confirmada
    const [compras] = await pool.execute(
      `SELECT c.*, e.titulo as evento_titulo 
       FROM compras c
       INNER JOIN eventos e ON c.evento_id = e.id
       WHERE c.id = ? AND c.evento_id = ? AND c.estado = 'PAGO_REALIZADO'`,
      [compra_id, evento_id]
    );

    if (compras.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Compra no encontrada o no está confirmada'
      });
    }

    const compra = compras[0];
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      let entradaEscaneada = null;
      let yaEscaneada = false;

      if (asiento_id) {
        // Es un asiento individual
        const [asientos] = await connection.execute(
          `SELECT ca.*, a.numero_asiento, a.mesa_id, m.numero_mesa, tp.nombre as tipo_precio_nombre
           FROM compras_asientos ca
           INNER JOIN asientos a ON ca.asiento_id = a.id
           LEFT JOIN mesas m ON a.mesa_id = m.id
           LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
           WHERE ca.compra_id = ? AND ca.asiento_id = ? AND ca.estado = 'CONFIRMADO'`,
          [compra_id, asiento_id]
        );

        if (asientos.length === 0) {
          await connection.rollback();
          connection.release();
          return res.status(404).json({
            success: false,
            message: 'Asiento no encontrado o no está confirmado'
          });
        }

        const asiento = asientos[0];

        // Verificar si ya fue escaneado
        if (asiento.escaneado) {
          yaEscaneada = true;
          entradaEscaneada = {
            tipo: 'ASIENTO',
            numero_asiento: asiento.numero_asiento,
            numero_mesa: asiento.numero_mesa,
            tipo_precio: asiento.tipo_precio_nombre,
            fecha_escaneo: asiento.fecha_escaneo,
            ya_escaneado: true
          };
        } else {
          // Marcar como escaneado
          await connection.execute(
            `UPDATE compras_asientos 
             SET escaneado = TRUE, 
                 fecha_escaneo = NOW(), 
                 usuario_escaneo_id = ?
             WHERE compra_id = ? AND asiento_id = ?`,
            [usuarioId, compra_id, asiento_id]
          );

          entradaEscaneada = {
            tipo: 'ASIENTO',
            numero_asiento: asiento.numero_asiento,
            numero_mesa: asiento.numero_mesa,
            tipo_precio: asiento.tipo_precio_nombre,
            fecha_escaneo: new Date(),
            ya_escaneado: false
          };

          // Registrar en tabla de auditoría
          await connection.execute(
            `INSERT INTO escaneos_entradas 
             (tipo, compra_asiento_id, compra_id, evento_id, usuario_escaneo_id, datos_qr)
             VALUES (?, ?, ?, ?, ?, ?)`,
            ['ASIENTO', asiento.id, compra_id, evento_id, usuarioId, JSON.stringify(datosQR)]
          );
        }
      } else {
        // Es una mesa completa - buscar por compra_id
        const [mesas] = await connection.execute(
          `SELECT cm.*, m.numero_mesa
           FROM compras_mesas cm
           INNER JOIN mesas m ON cm.mesa_id = m.id
           WHERE cm.compra_id = ? AND cm.estado = 'CONFIRMADO'
           LIMIT 1`,
          [compra_id]
        );

        if (mesas.length === 0) {
          await connection.rollback();
          connection.release();
          return res.status(404).json({
            success: false,
            message: 'Mesa no encontrada o no está confirmada'
          });
        }

        const mesa = mesas[0];

        // Verificar si ya fue escaneada
        if (mesa.escaneado) {
          yaEscaneada = true;
          entradaEscaneada = {
            tipo: 'MESA',
            numero_mesa: mesa.numero_mesa,
            cantidad_sillas: mesa.cantidad_sillas,
            fecha_escaneo: mesa.fecha_escaneo,
            ya_escaneado: true
          };
        } else {
          // Marcar como escaneada
          await connection.execute(
            `UPDATE compras_mesas 
             SET escaneado = TRUE, 
                 fecha_escaneo = NOW(), 
                 usuario_escaneo_id = ?
             WHERE id = ?`,
            [usuarioId, mesa.id]
          );

          entradaEscaneada = {
            tipo: 'MESA',
            numero_mesa: mesa.numero_mesa,
            cantidad_sillas: mesa.cantidad_sillas,
            fecha_escaneo: new Date(),
            ya_escaneado: false
          };

          // Registrar en tabla de auditoría
          await connection.execute(
            `INSERT INTO escaneos_entradas 
             (tipo, compra_mesa_id, compra_id, evento_id, usuario_escaneo_id, datos_qr)
             VALUES (?, ?, ?, ?, ?, ?)`,
            ['MESA', mesa.id, compra_id, evento_id, usuarioId, JSON.stringify(datosQR)]
          );
        }
      }

      await connection.commit();
      connection.release();

      res.json({
        success: true,
        message: yaEscaneada 
          ? 'Entrada ya fue escaneada anteriormente' 
          : 'Entrada escaneada exitosamente',
        data: {
          compra: {
            id: compra.id,
            codigo_unico: compra.codigo_unico,
            cliente_nombre: compra.cliente_nombre,
            evento: compra.evento_titulo
          },
          entrada: entradaEscaneada,
          ya_escaneada: yaEscaneada
        }
      });

    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }

  } catch (error) {
    console.error('Error al escanear:', error);
    res.status(500).json({
      success: false,
      message: 'Error al escanear',
      error: error.message
    });
  }
};

// Obtener reporte de escaneos por evento
export const obtenerReporteEscaneos = async (req, res) => {
  try {
    const { evento_id } = req.params;

    if (!evento_id) {
      return res.status(400).json({
        success: false,
        message: 'ID de evento requerido'
      });
    }

    // Obtener estadísticas generales
    const [estadisticas] = await pool.execute(
      `SELECT 
        COUNT(DISTINCT ca.id) as total_asientos,
        SUM(CASE WHEN ca.escaneado THEN 1 ELSE 0 END) as asientos_escaneados,
        COUNT(DISTINCT cm.id) as total_mesas,
        SUM(CASE WHEN cm.escaneado THEN 1 ELSE 0 END) as mesas_escaneadas
       FROM compras c
       LEFT JOIN compras_asientos ca ON c.id = ca.compra_id AND ca.estado = 'CONFIRMADO'
       LEFT JOIN compras_mesas cm ON c.id = cm.compra_id AND cm.estado = 'CONFIRMADO'
       WHERE c.evento_id = ? AND c.estado = 'PAGO_REALIZADO'`,
      [evento_id]
    );

    const stats = estadisticas[0];
    const totalEntradas = (stats.total_asientos || 0) + (stats.total_mesas || 0);
    const totalEscaneadas = (stats.asientos_escaneados || 0) + (stats.mesas_escaneadas || 0);

    // Obtener asientos escaneados con detalles
    const [asientosEscaneados] = await pool.execute(
      `SELECT 
        ca.id,
        ca.escaneado,
        ca.fecha_escaneo,
        ca.codigo_escaneo,
        a.numero_asiento,
        a.mesa_id,
        m.numero_mesa,
        tp.nombre as tipo_precio_nombre,
        c.codigo_unico,
        c.cliente_nombre,
        u.nombre_completo as usuario_escaneo
       FROM compras_asientos ca
       INNER JOIN compras c ON ca.compra_id = c.id
       INNER JOIN asientos a ON ca.asiento_id = a.id
       LEFT JOIN mesas m ON a.mesa_id = m.id
       LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
       LEFT JOIN usuarios u ON ca.usuario_escaneo_id = u.id
       WHERE c.evento_id = ? AND ca.estado = 'CONFIRMADO'
       ORDER BY ca.fecha_escaneo DESC, a.numero_asiento ASC`,
      [evento_id]
    );

    // Obtener mesas escaneadas con detalles
    const [mesasEscaneadas] = await pool.execute(
      `SELECT 
        cm.id,
        cm.escaneado,
        cm.fecha_escaneo,
        cm.codigo_escaneo,
        m.numero_mesa,
        cm.cantidad_sillas,
        c.codigo_unico,
        c.cliente_nombre,
        u.nombre_completo as usuario_escaneo
       FROM compras_mesas cm
       INNER JOIN compras c ON cm.compra_id = c.id
       INNER JOIN mesas m ON cm.mesa_id = m.id
       LEFT JOIN usuarios u ON cm.usuario_escaneo_id = u.id
       WHERE c.evento_id = ? AND cm.estado = 'CONFIRMADO'
       ORDER BY cm.fecha_escaneo DESC, m.numero_mesa ASC`,
      [evento_id]
    );

    // Obtener información del evento
    const [eventos] = await pool.execute(
      `SELECT id, titulo, hora_inicio FROM eventos WHERE id = ?`,
      [evento_id]
    );

    res.json({
      success: true,
      data: {
        evento: eventos[0] || null,
        estadisticas: {
          total_entradas: totalEntradas,
          total_escaneadas: totalEscaneadas,
          total_pendientes: totalEntradas - totalEscaneadas,
          porcentaje_escaneado: totalEntradas > 0 
            ? ((totalEscaneadas / totalEntradas) * 100).toFixed(2) 
            : 0,
          asientos: {
            total: stats.total_asientos || 0,
            escaneados: stats.asientos_escaneados || 0
          },
          mesas: {
            total: stats.total_mesas || 0,
            escaneadas: stats.mesas_escaneadas || 0
          }
        },
        asientos: asientosEscaneados,
        mesas: mesasEscaneadas
      }
    });

  } catch (error) {
    console.error('Error al obtener reporte de escaneos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el reporte',
      error: error.message
    });
  }
};

// Obtener todas las entradas pendientes de escanear para un evento
export const obtenerEntradasPendientes = async (req, res) => {
  try {
    const { evento_id } = req.params;

    if (!evento_id) {
      return res.status(400).json({
        success: false,
        message: 'ID de evento requerido'
      });
    }

    // Obtener asientos pendientes
    const [asientosPendientes] = await pool.execute(
      `SELECT 
        ca.id,
        a.numero_asiento,
        a.mesa_id,
        m.numero_mesa,
        tp.nombre as tipo_precio_nombre,
        c.codigo_unico,
        c.cliente_nombre
       FROM compras_asientos ca
       INNER JOIN compras c ON ca.compra_id = c.id
       INNER JOIN asientos a ON ca.asiento_id = a.id
       LEFT JOIN mesas m ON a.mesa_id = m.id
       LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
       WHERE c.evento_id = ? 
         AND ca.estado = 'CONFIRMADO' 
         AND ca.escaneado = FALSE
       ORDER BY a.numero_asiento ASC`,
      [evento_id]
    );

    // Obtener mesas pendientes
    const [mesasPendientes] = await pool.execute(
      `SELECT 
        cm.id,
        m.numero_mesa,
        cm.cantidad_sillas,
        c.codigo_unico,
        c.cliente_nombre
       FROM compras_mesas cm
       INNER JOIN compras c ON cm.compra_id = c.id
       INNER JOIN mesas m ON cm.mesa_id = m.id
       WHERE c.evento_id = ? 
         AND cm.estado = 'CONFIRMADO' 
         AND cm.escaneado = FALSE
       ORDER BY m.numero_mesa ASC`,
      [evento_id]
    );

    res.json({
      success: true,
      data: {
        asientos: asientosPendientes,
        mesas: mesasPendientes,
        total_pendientes: asientosPendientes.length + mesasPendientes.length
      }
    });

  } catch (error) {
    console.error('Error al obtener entradas pendientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener entradas pendientes',
      error: error.message
    });
  }
};

