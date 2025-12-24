import pool from '../config/db.js';
import { generarBoletoPDF } from '../services/boletoService.js';
import { enviarPDFPorWhatsAppWeb as enviarPDFWhatsAppWebService, obtenerEstadoWhatsApp, reiniciarWhatsAppWeb } from '../services/whatsappWebService.js';
import { enviarBoletoPorEmail as enviarBoletoPorEmailService } from '../services/emailService.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para generar código único
const generarCodigoUnico = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `ENT-${timestamp}-${random}`;
};

// Crear una nueva compra
export const crearCompra = async (req, res) => {
  try {
    const {
      evento_id,
      cliente_nombre,
      cliente_email,
      cliente_telefono,
      cantidad,
      total,
      asientos, // Array de objetos { id, precio }
      mesas // Array de objetos { mesa_id, cantidad_sillas, precio_total, sillas }
    } = req.body;

    // Validaciones básicas
    if (!evento_id || !cliente_nombre || !cantidad || !total) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: evento_id, cliente_nombre, cantidad, total'
      });
    }
    // Verificar que el evento existe y obtener tipo
    const [eventos] = await pool.execute(
      'SELECT id, titulo, tipo_evento, limite_entradas FROM eventos WHERE id = ?',
      [evento_id]
    );
    if (eventos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    const evento = eventos[0];

    // Validación según tipo de evento
    if (evento.tipo_evento === 'especial') {
      if ((!asientos || asientos.length === 0) && (!mesas || mesas.length === 0)) {
        return res.status(400).json({
          success: false,
          message: 'Debe seleccionar asientos o mesas para eventos especiales'
        });
      }
    } else {
      // Evento general: validar límite de entradas si existe
      const limite = evento.limite_entradas ? parseInt(evento.limite_entradas) : null;
      if (limite && limite > 0) {
        const [sumas] = await pool.execute(
          `SELECT COALESCE(SUM(cantidad),0) AS reservadas
           FROM compras
           WHERE evento_id = ? AND estado IN ('PAGO_PENDIENTE','PAGO_REALIZADO')`,
          [evento_id]
        );
        const reservadas = parseInt(sumas[0].reservadas || 0);
        if (reservadas + parseInt(cantidad) > limite) {
          return res.status(409).json({
            success: false,
            message: `No hay suficientes entradas disponibles. Disponibles: ${Math.max(limite - reservadas, 0)}`
          });
        }
      }
    }

    // Iniciar transacción
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Generar código único
      let codigoUnico = generarCodigoUnico();
      
      // Verificar que el código no exista (muy poco probable, pero por seguridad)
      let [codigosExistentes] = await connection.execute(
        'SELECT id FROM compras WHERE codigo_unico = ?',
        [codigoUnico]
      );
      
      let intentos = 0;
      while (codigosExistentes.length > 0 && intentos < 10) {
        codigoUnico = generarCodigoUnico();
        [codigosExistentes] = await connection.execute(
          'SELECT id FROM compras WHERE codigo_unico = ?',
          [codigoUnico]
        );
        intentos++;
      }

      // Crear la compra
      const [result] = await connection.execute(
        `INSERT INTO compras 
         (codigo_unico, evento_id, cliente_nombre, cliente_email, cliente_telefono, cantidad, total, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PAGO_PENDIENTE')`,
        [codigoUnico, evento_id, cliente_nombre, cliente_email || null, cliente_telefono || null, cantidad, total]
      );

      const compraId = result.insertId;

      // Registrar asientos individuales (solo aplica a eventos especiales)
      if (evento.tipo_evento === 'especial' && asientos && asientos.length > 0) {
        for (const asiento of asientos) {
          // Verificar que el asiento existe y pertenece al evento
          const [asientosCheck] = await connection.execute(
            'SELECT id, evento_id FROM asientos WHERE id = ?',
            [asiento.id]
          );

          if (asientosCheck.length === 0 || asientosCheck[0].evento_id !== evento_id) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
              success: false,
              message: `Asiento ${asiento.id} no válido para este evento`
            });
          }

          // Verificar que el asiento no esté ya reservado/confirmado
          const [asientoOcupado] = await connection.execute(
            `SELECT id FROM compras_asientos WHERE asiento_id = ? AND estado IN ('RESERVADO','CONFIRMADO')`,
            [asiento.id]
          );
          if (asientoOcupado.length > 0) {
            await connection.rollback();
            connection.release();
            return res.status(409).json({
              success: false,
              message: `El asiento ${asiento.id} ya está reservado u ocupado`
            });
          }

          // Si el asiento pertenece a una mesa, verificar que la mesa no esté ocupada completamente
          const [asientoData] = await connection.execute(
            'SELECT mesa_id FROM asientos WHERE id = ?',
            [asiento.id]
          );
          
          if (asientoData.length > 0 && asientoData[0].mesa_id) {
            const mesaId = asientoData[0].mesa_id;
            // Verificar si la mesa está ocupada completamente
            const [mesaOcupada] = await connection.execute(
              `SELECT id FROM compras_mesas 
               WHERE mesa_id = ? 
                 AND estado IN ('RESERVADO', 'CONFIRMADO') 
                 AND compra_id IN (
                   SELECT id FROM compras 
                   WHERE evento_id = ? 
                     AND estado IN ('PAGO_PENDIENTE', 'PAGO_REALIZADO')
                 )`,
              [mesaId, evento_id]
            );
            
            if (mesaOcupada.length > 0) {
              await connection.rollback();
              connection.release();
              return res.status(409).json({
                success: false,
                message: 'Esta mesa ya está ocupada completamente y no está disponible para comprar sillas individuales'
              });
            }
          }

          await connection.execute(
            `INSERT INTO compras_asientos (compra_id, asiento_id, precio, estado)
             VALUES (?, ?, ?, 'RESERVADO')`,
            [compraId, asiento.id, asiento.precio || 0]
          );

          // Marcar asiento como reservado (actualizar estado en tabla asientos si existe columna estado)
          // Por ahora solo lo registramos en compras_asientos
        }
      }

      // Registrar mesas completas (solo aplica a eventos especiales)
      if (evento.tipo_evento === 'especial' && mesas && mesas.length > 0) {
        for (const mesa of mesas) {
          // Verificar que la mesa existe y pertenece al evento
          const [mesasCheck] = await connection.execute(
            'SELECT id, evento_id FROM mesas WHERE id = ?',
            [mesa.mesa_id]
          );

          if (mesasCheck.length === 0 || mesasCheck[0].evento_id !== evento_id) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
              success: false,
              message: `Mesa ${mesa.mesa_id} no válida para este evento`
            });
          }

          // Verificar que la mesa no esté ya reservada/confirmada
          const [mesaOcupada] = await connection.execute(
            `SELECT id FROM compras_mesas WHERE mesa_id = ? AND estado IN ('RESERVADO','CONFIRMADO')`,
            [mesa.mesa_id]
          );
          if (mesaOcupada.length > 0) {
            await connection.rollback();
            connection.release();
            return res.status(409).json({
              success: false,
              message: `La mesa M${mesa.mesa_id} ya está reservada u ocupada`
            });
          }

          await connection.execute(
            `INSERT INTO compras_mesas (compra_id, mesa_id, cantidad_sillas, precio_total, estado)
             VALUES (?, ?, ?, ?, 'RESERVADO')`,
            [compraId, mesa.mesa_id, mesa.cantidad_sillas || 0, mesa.precio_total || 0]
          );
        }
      }

      // Confirmar transacción
      await connection.commit();

      // Obtener la compra creada con todos sus detalles
      const [compras] = await connection.execute(
        `SELECT * FROM compras WHERE id = ?`,
        [compraId]
      );

      const compra = compras[0];

      // Obtener asientos de la compra con información de mesa, tipo de precio y área
      const [asientosCompra] = await connection.execute(
        `SELECT 
          ca.*, 
          a.numero_asiento, 
          a.area_id,
          a.mesa_id,
          m.numero_mesa,
          tp.nombre as tipo_precio_nombre,
          ar.nombre as area_nombre
         FROM compras_asientos ca
         INNER JOIN asientos a ON ca.asiento_id = a.id
         LEFT JOIN mesas m ON a.mesa_id = m.id
         LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
         LEFT JOIN areas_layout ar ON a.area_id = ar.id
         WHERE ca.compra_id = ?`,
        [compraId]
      );

      // Obtener mesas de la compra
      const [mesasCompra] = await connection.execute(
        `SELECT cm.*, m.numero_mesa
         FROM compras_mesas cm
         INNER JOIN mesas m ON cm.mesa_id = m.id
         WHERE cm.compra_id = ?`,
        [compraId]
      );

      connection.release();

      res.json({
        success: true,
        message: 'Compra registrada exitosamente',
        data: {
          ...compra,
          asientos: asientosCompra,
          mesas: mesasCompra
        }
      });

    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }

  } catch (error) {
    console.error('Error al crear compra:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear la compra',
      error: error.message
    });
  }
};

// Obtener compra por código único
export const obtenerCompraPorCodigo = async (req, res) => {
  try {
    const { codigo } = req.params;

    const [compras] = await pool.execute(
      `SELECT c.*, e.titulo as evento_titulo, e.hora_inicio as evento_fecha
       FROM compras c
       INNER JOIN eventos e ON c.evento_id = e.id
       WHERE c.codigo_unico = ?`,
      [codigo]
    );

    if (compras.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Compra no encontrada'
      });
    }

    const compra = compras[0];

    // Obtener asientos con información de mesa, tipo de precio y área
    const [asientos] = await pool.execute(
      `SELECT 
        ca.*, 
        a.numero_asiento, 
        a.area_id,
        a.mesa_id,
        m.numero_mesa,
        tp.nombre as tipo_precio_nombre,
        ar.nombre as area_nombre
       FROM compras_asientos ca
       INNER JOIN asientos a ON ca.asiento_id = a.id
       LEFT JOIN mesas m ON a.mesa_id = m.id
       LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
       LEFT JOIN areas_layout ar ON a.area_id = ar.id
       WHERE ca.compra_id = ?
       ORDER BY a.numero_asiento`,
      [compra.id]
    );

    // Obtener mesas
    const [mesas] = await pool.execute(
      `SELECT cm.*, m.numero_mesa
       FROM compras_mesas cm
       INNER JOIN mesas m ON cm.mesa_id = m.id
       WHERE cm.compra_id = ?`,
      [compra.id]
    );

    res.json({
      success: true,
      data: {
        ...compra,
        asientos,
        mesas
      }
    });

  } catch (error) {
    console.error('Error al obtener compra por código:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la compra',
      error: error.message
    });
  }
};

// Obtener asientos ocupados para un evento
export const obtenerAsientosOcupados = async (req, res) => {
  try {
    const { evento_id } = req.params;

    // Obtener IDs de asientos reservados o confirmados para este evento
    // Incluir tanto RESERVADOS como CONFIRMADOS para mostrar en rojo desde el momento de la reserva
    const [asientosOcupados] = await pool.execute(
      `SELECT DISTINCT ca.asiento_id
       FROM compras_asientos ca
       INNER JOIN compras c ON ca.compra_id = c.id
       WHERE c.evento_id = ? 
         AND ca.estado IN ('RESERVADO', 'CONFIRMADO')
         AND c.estado IN ('PAGO_PENDIENTE', 'PAGO_REALIZADO')`,
      [evento_id]
    );

    // Obtener IDs de mesas reservadas o confirmadas para este evento
    // Incluir tanto RESERVADAS como CONFIRMADAS para mostrar en rojo desde el momento de la reserva
    const [mesasOcupadas] = await pool.execute(
      `SELECT DISTINCT cm.mesa_id
       FROM compras_mesas cm
       INNER JOIN compras c ON cm.compra_id = c.id
       WHERE c.evento_id = ? 
         AND cm.estado IN ('RESERVADO', 'CONFIRMADO')
         AND c.estado IN ('PAGO_PENDIENTE', 'PAGO_REALIZADO')`,
      [evento_id]
    );

    // También obtener asientos que pertenecen a mesas ocupadas (completas)
    // Si una mesa está ocupada, todas sus sillas también están ocupadas
    const asientosIds = asientosOcupados.map(a => a.asiento_id);
    const mesasIds = mesasOcupadas.map(m => m.mesa_id);
    
    let asientosDeMesasOcupadas = [];
    if (mesasIds.length > 0) {
      const [asientosMesas] = await pool.execute(
        `SELECT id FROM asientos WHERE evento_id = ? AND mesa_id IN (${mesasIds.map(() => '?').join(',')})`,
        [evento_id, ...mesasIds]
      );
      asientosDeMesasOcupadas = asientosMesas.map(a => a.id);
    }

    // Combinar asientos individuales ocupados + asientos de mesas ocupadas
    const todosAsientosOcupados = [...new Set([...asientosIds, ...asientosDeMesasOcupadas])];

    res.json({
      success: true,
      data: {
        asientos: todosAsientosOcupados,
        mesas: mesasIds
      }
    });

  } catch (error) {
    console.error('Error al obtener asientos ocupados:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener asientos ocupados',
      error: error.message
    });
  }
};

// Buscar entrada por código de escaneo (sin tickear, solo mostrar info)
export const buscarEntradaPorCodigo = async (req, res) => {
  try {
    const { codigoEscaneo } = req.body;
    const usuarioId = req.user?.id || null;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📥 BUSCAR ENTRADA POR CÓDIGO');
    console.log('Código:', codigoEscaneo);
    console.log('Usuario:', usuarioId);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (!codigoEscaneo || !/^\d{5}$/.test(codigoEscaneo.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Código de escaneo inválido. Debe ser de 5 dígitos.'
      });
    }

    const codigo = codigoEscaneo.trim();
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
        [codigo]
      );

      if (asientos.length > 0) {
        const asiento = asientos[0];
        compra = {
          id: asiento.compra_id,
          codigo_unico: asiento.codigo_unico,
          cliente_nombre: asiento.cliente_nombre,
          evento: asiento.evento_titulo
        };

        // Solo mostrar información, NO tickear automáticamente
        yaEscaneada = asiento.escaneado ? true : false;
        entradaEscaneada = {
          tipo: 'ASIENTO',
          numero_asiento: asiento.numero_asiento,
          numero_mesa: asiento.numero_mesa,
          tipo_precio: asiento.tipo_precio_nombre,
          codigo_escaneo: codigo,
          fecha_escaneo: asiento.fecha_escaneo,
          ya_escaneado: yaEscaneada,
          compra_asiento_id: asiento.id // Necesario para tickear después
        };
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
          [codigo]
        );

        if (mesas.length > 0) {
          const mesa = mesas[0];
          compra = {
            id: mesa.compra_id,
            codigo_unico: mesa.codigo_unico,
            cliente_nombre: mesa.cliente_nombre,
            evento: mesa.evento_titulo
          };

          // Solo mostrar información, NO tickear automáticamente
          yaEscaneada = mesa.escaneado ? true : false;
          entradaEscaneada = {
            tipo: 'MESA',
            numero_mesa: mesa.numero_mesa,
            cantidad_sillas: mesa.cantidad_sillas,
            codigo_escaneo: codigo,
            fecha_escaneo: mesa.fecha_escaneo,
            ya_escaneado: yaEscaneada,
            compra_mesa_id: mesa.id // Necesario para tickear después
          };
        } else {
          // Buscar en compras_entradas_generales (eventos generales)
          const [entradasGenerales] = await connection.execute(
            `SELECT 
              eg.*,
              c.id as compra_id,
              c.codigo_unico,
              c.cliente_nombre,
              c.evento_id,
              e.titulo as evento_titulo
             FROM compras_entradas_generales eg
             INNER JOIN compras c ON eg.compra_id = c.id
             INNER JOIN eventos e ON c.evento_id = e.id
             WHERE eg.codigo_escaneo = ?`,
            [codigo]
          );

          if (entradasGenerales.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({
              success: false,
              message: 'Código de escaneo no encontrado o entrada no confirmada'
            });
          }

          const entradaGeneral = entradasGenerales[0];
          compra = {
            id: entradaGeneral.compra_id,
            codigo_unico: entradaGeneral.codigo_unico,
            cliente_nombre: entradaGeneral.cliente_nombre,
            evento: entradaGeneral.evento_titulo
          };

          // Solo mostrar información, NO tickear automáticamente
          yaEscaneada = entradaGeneral.escaneado ? true : false;
          entradaEscaneada = {
            tipo: 'GENERAL',
            codigo_escaneo: codigo,
            fecha_escaneo: entradaGeneral.fecha_escaneo,
            ya_escaneado: yaEscaneada,
            compra_entrada_general_id: entradaGeneral.id // Necesario para tickear después
          };
        }
      }

      await connection.commit();
      connection.release();

      console.log('✅ Entrada encontrada');

      return res.json({
        success: true,
        message: yaEscaneada 
          ? 'Entrada ya fue escaneada anteriormente' 
          : 'Entrada encontrada',
        data: {
          compra: compra,
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
    console.error('❌ Error al buscar entrada:', error);
    res.status(500).json({
      success: false,
      message: 'Error al buscar la entrada',
      error: error.message
    });
  }
};

// Tickear entrada (marcar como escaneada)
export const tickearEntrada = async (req, res) => {
  try {
    const { codigoEscaneo, tipo, compra_asiento_id, compra_mesa_id, compra_entrada_general_id } = req.body;
    const usuarioId = req.user?.id || null;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✓ TICKEAR ENTRADA');
    console.log('Código:', codigoEscaneo);
    console.log('Tipo:', tipo);
    console.log('Usuario:', usuarioId);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (!codigoEscaneo || !/^\d{5}$/.test(codigoEscaneo.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Código de escaneo inválido'
      });
    }

    const codigo = codigoEscaneo.trim();
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      if (tipo === 'ASIENTO' && compra_asiento_id) {
        // Verificar que existe y no está escaneada
        const [asientos] = await connection.execute(
          `SELECT * FROM compras_asientos 
           WHERE id = ? AND codigo_escaneo = ? AND estado = 'CONFIRMADO'`,
          [compra_asiento_id, codigo]
        );

        if (asientos.length === 0) {
          await connection.rollback();
          connection.release();
          return res.status(404).json({
            success: false,
            message: 'Asiento no encontrado'
          });
        }

        const asiento = asientos[0];

        if (asiento.escaneado) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({
            success: false,
            message: 'Esta entrada ya fue escaneada anteriormente'
          });
        }

        // Obtener info del evento
        const [compraInfo] = await connection.execute(
          `SELECT evento_id FROM compras WHERE id = ?`,
          [asiento.compra_id]
        );

        // Marcar como escaneado
        await connection.execute(
          `UPDATE compras_asientos 
           SET escaneado = TRUE, 
               fecha_escaneo = NOW(), 
               usuario_escaneo_id = ?
           WHERE id = ?`,
          [usuarioId, asiento.id]
        );

        // Registrar en tabla de auditoría
        await connection.execute(
          `INSERT INTO escaneos_entradas 
           (tipo, compra_asiento_id, compra_id, evento_id, usuario_escaneo_id, datos_qr)
           VALUES (?, ?, ?, ?, ?, ?)`,
          ['ASIENTO', asiento.id, asiento.compra_id, compraInfo[0].evento_id, usuarioId, JSON.stringify({ codigo_escaneo: codigo })]
        );

      } else if (tipo === 'MESA' && compra_mesa_id) {
        // Verificar que existe y no está escaneada
        const [mesas] = await connection.execute(
          `SELECT * FROM compras_mesas 
           WHERE id = ? AND codigo_escaneo = ? AND estado = 'CONFIRMADO'`,
          [compra_mesa_id, codigo]
        );

        if (mesas.length === 0) {
          await connection.rollback();
          connection.release();
          return res.status(404).json({
            success: false,
            message: 'Mesa no encontrada'
          });
        }

        const mesa = mesas[0];

        if (mesa.escaneado) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({
            success: false,
            message: 'Esta entrada ya fue escaneada anteriormente'
          });
        }

        // Obtener info del evento
        const [compraInfo] = await connection.execute(
          `SELECT evento_id FROM compras WHERE id = ?`,
          [mesa.compra_id]
        );

        // Marcar como escaneada
        await connection.execute(
          `UPDATE compras_mesas 
           SET escaneado = TRUE, 
               fecha_escaneo = NOW(), 
               usuario_escaneo_id = ?
           WHERE id = ?`,
          [usuarioId, mesa.id]
        );

        // Registrar en tabla de auditoría
        await connection.execute(
          `INSERT INTO escaneos_entradas 
           (tipo, compra_mesa_id, compra_id, evento_id, usuario_escaneo_id, datos_qr)
           VALUES (?, ?, ?, ?, ?, ?)`,
          ['MESA', mesa.id, mesa.compra_id, compraInfo[0].evento_id, usuarioId, JSON.stringify({ codigo_escaneo: codigo })]
        );
      } else {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          success: false,
          message: 'Tipo de entrada o ID no válido'
        });
      }

      await connection.commit();
      connection.release();

      console.log('✅ Entrada tickeada correctamente');

      return res.json({
        success: true,
        message: 'Entrada escaneada exitosamente'
      });

    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error('❌ Error al tickear entrada:', error);
    res.status(500).json({
      success: false,
      message: 'Error al tickear la entrada',
      error: error.message
    });
  }
};

// Desmarcar escaneo de entrada
export const desmarcarEscaneo = async (req, res) => {
  try {
    const { codigoEscaneo, tipo, compra_asiento_id, compra_mesa_id, compra_entrada_general_id } = req.body;
    const usuarioId = req.user?.id || null;

    if (!codigoEscaneo || !/^\d{5}$/.test(codigoEscaneo.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Código de escaneo inválido'
      });
    }

    const codigo = codigoEscaneo.trim();
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      if (tipo === 'ASIENTO' && compra_asiento_id) {
        await connection.execute(
          `UPDATE compras_asientos 
           SET escaneado = FALSE, 
               fecha_escaneo = NULL, 
               usuario_escaneo_id = NULL
           WHERE id = ? AND codigo_escaneo = ?`,
          [compra_asiento_id, codigo]
        );
      } else if (tipo === 'MESA' && compra_mesa_id) {
        await connection.execute(
          `UPDATE compras_mesas 
           SET escaneado = FALSE, 
               fecha_escaneo = NULL, 
               usuario_escaneo_id = NULL
           WHERE id = ? AND codigo_escaneo = ?`,
          [compra_mesa_id, codigo]
        );
      } else if (tipo === 'GENERAL' && compra_entrada_general_id) {
        await connection.execute(
          `UPDATE compras_entradas_generales 
           SET escaneado = FALSE, 
               fecha_escaneo = NULL, 
               usuario_escaneo_id = NULL
           WHERE id = ? AND codigo_escaneo = ?`,
          [compra_entrada_general_id, codigo]
        );
      } else {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          success: false,
          message: 'Tipo de entrada o ID no válido'
        });
      }

      await connection.commit();
      connection.release();

      return res.json({
        success: true,
        message: 'Escaneo eliminado correctamente'
      });

    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error('❌ Error al desmarcar escaneo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al desmarcar el escaneo',
      error: error.message
    });
  }
};

// Obtener todas las entradas escaneadas
export const obtenerEntradasEscaneadas = async (req, res) => {
  try {
    const { evento_id } = req.query;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 OBTENER ENTRADAS ESCANEADAS');
    console.log('Evento ID:', evento_id || 'TODOS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    let queryAsientos = `
      SELECT 
        ca.id,
        ca.codigo_escaneo,
        ca.fecha_escaneo,
        ca.usuario_escaneo_id,
        a.numero_asiento,
        a.mesa_id,
        m.numero_mesa,
        tp.nombre as tipo_precio_nombre,
        c.id as compra_id,
        c.codigo_unico,
        c.cliente_nombre,
        c.evento_id,
        e.titulo as evento_titulo,
        u.nombre_completo as usuario_escaneo
      FROM compras_asientos ca
      INNER JOIN asientos a ON ca.asiento_id = a.id
      INNER JOIN compras c ON ca.compra_id = c.id
      INNER JOIN eventos e ON c.evento_id = e.id
      LEFT JOIN mesas m ON a.mesa_id = m.id
      LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
      LEFT JOIN usuarios u ON ca.usuario_escaneo_id = u.id
      WHERE ca.escaneado = TRUE AND ca.estado = 'CONFIRMADO'
    `;

    let queryMesas = `
      SELECT 
        cm.id,
        cm.codigo_escaneo,
        cm.fecha_escaneo,
        cm.usuario_escaneo_id,
        m.numero_mesa,
        cm.cantidad_sillas,
        c.id as compra_id,
        c.codigo_unico,
        c.cliente_nombre,
        c.evento_id,
        e.titulo as evento_titulo,
        u.nombre_completo as usuario_escaneo
      FROM compras_mesas cm
      INNER JOIN mesas m ON cm.mesa_id = m.id
      INNER JOIN compras c ON cm.compra_id = c.id
      INNER JOIN eventos e ON c.evento_id = e.id
      LEFT JOIN usuarios u ON cm.usuario_escaneo_id = u.id
      WHERE cm.escaneado = TRUE AND cm.estado = 'CONFIRMADO'
    `;

    let queryEntradasGenerales = `
      SELECT 
        eg.id,
        eg.codigo_escaneo,
        eg.fecha_escaneo,
        eg.usuario_escaneo_id,
        c.id as compra_id,
        c.codigo_unico,
        c.cliente_nombre,
        c.evento_id,
        e.titulo as evento_titulo,
        u.nombre_completo as usuario_escaneo
      FROM compras_entradas_generales eg
      INNER JOIN compras c ON eg.compra_id = c.id
      INNER JOIN eventos e ON c.evento_id = e.id
      LEFT JOIN usuarios u ON eg.usuario_escaneo_id = u.id
      WHERE eg.escaneado = TRUE
    `;

    const params = [];
    if (evento_id) {
      queryAsientos += ' AND c.evento_id = ?';
      queryMesas += ' AND c.evento_id = ?';
      queryEntradasGenerales += ' AND c.evento_id = ?';
      params.push(evento_id);
    }

    queryAsientos += ' ORDER BY ca.fecha_escaneo DESC';
    queryMesas += ' ORDER BY cm.fecha_escaneo DESC';
    queryEntradasGenerales += ' ORDER BY eg.fecha_escaneo DESC';

    const [asientos] = await pool.execute(queryAsientos, params);
    const [mesas] = await pool.execute(queryMesas, params);
    const [entradasGenerales] = await pool.execute(queryEntradasGenerales, params);

    // Obtener información del evento si hay filtro
    let tipoEvento = null;
    let eventoInfo = null;
    if (evento_id) {
      const [eventos] = await pool.execute('SELECT tipo_evento, limite_entradas, capacidad_maxima FROM eventos WHERE id = ?', [evento_id]);
      if (eventos.length > 0) {
        eventoInfo = eventos[0];
        tipoEvento = eventoInfo.tipo_evento;
      }
      
      // Si es evento general, obtener estadísticas de entradas generales
      if (tipoEvento === 'general') {
        // Obtener límite del evento
        const limiteTotal = eventoInfo?.limite_entradas ? parseInt(eventoInfo.limite_entradas) : null;
        
        // Contar todas las entradas generales confirmadas (desde compras_entradas_generales)
        const [statsGenerales] = await pool.execute(
          `SELECT 
             COUNT(*) as total_confirmadas,
             SUM(CASE WHEN escaneado = TRUE THEN 1 ELSE 0 END) as total_escaneadas
           FROM compras_entradas_generales eg
           INNER JOIN compras c ON eg.compra_id = c.id
           WHERE c.evento_id = ? AND c.estado = 'PAGO_REALIZADO'`,
          [evento_id]
        );
        
        const totalConfirmadasGenerales = parseInt(statsGenerales[0]?.total_confirmadas || 0);
        const totalEscaneadasGenerales = parseInt(statsGenerales[0]?.total_escaneadas || 0);
        const totalDisponiblesGenerales = limiteTotal ? Math.max(0, limiteTotal - totalConfirmadasGenerales) : null;
        
        res.json({
          success: true,
          data: {
            asientos: [],
            mesas: [],
            generales: entradasGenerales.map(eg => ({
              ...eg,
              tipo: 'GENERAL',
              compra_entrada_general_id: eg.id
            })),
            estadisticas: {
              total_confirmadas: totalConfirmadasGenerales,
              total_escaneadas: totalEscaneadasGenerales,
              total_faltantes: totalConfirmadasGenerales - totalEscaneadasGenerales,
              tipo_evento: 'general',
              generales: {
                limite_total: limiteTotal,
                vendidas: totalConfirmadasGenerales,
                disponibles: totalDisponiblesGenerales,
                escaneadas: totalEscaneadasGenerales,
                total_faltantes: totalConfirmadasGenerales - totalEscaneadasGenerales
              },
              asientos: {
                limite_total: null,
                vendidas: 0,
                disponibles: null,
                escaneadas: 0,
                total_faltantes: 0
              },
              mesas: {
                limite_total: null,
                vendidas: 0,
                disponibles: null,
                escaneadas: 0,
                total_faltantes: 0,
                sillas: {
                  limite_total: null,
                  vendidas: 0,
                  disponibles: null,
                  escaneadas: 0,
                  total_faltantes: 0
                }
              }
            }
          }
        });
        return;
      }
    }

    // Para eventos especiales (con asientos/mesas)
    // Obtener información de capacidad del evento si hay filtro
    let totalAsientosDisponibles = null;
    let totalMesasDisponibles = null;
    let totalSillasDisponibles = null;
    
    if (evento_id) {
      // Contar total de asientos en el evento
      const [totalAsientos] = await pool.execute(
        'SELECT COUNT(*) as total FROM asientos WHERE evento_id = ?',
        [evento_id]
      );
      const totalAsientosEnEvento = parseInt(totalAsientos[0]?.total || 0);
      
      // Contar total de mesas en el evento
      const [totalMesas] = await pool.execute(
        'SELECT COUNT(*) as total FROM mesas WHERE evento_id = ? AND activo = 1',
        [evento_id]
      );
      const totalMesasEnEvento = parseInt(totalMesas[0]?.total || 0);
      
      // Calcular total de sillas (suma de capacidad_sillas de todas las mesas)
      const [totalSillas] = await pool.execute(
        'SELECT SUM(capacidad_sillas) as total FROM mesas WHERE evento_id = ? AND activo = 1',
        [evento_id]
      );
      const totalSillasEnEvento = parseInt(totalSillas[0]?.total || 0);
      
      totalAsientosDisponibles = totalAsientosEnEvento;
      totalMesasDisponibles = totalMesasEnEvento;
      totalSillasDisponibles = totalSillasEnEvento;
    }
    
    let queryStatsAsientos = `
      SELECT 
        COUNT(*) as total_confirmadas,
        SUM(CASE WHEN escaneado = TRUE THEN 1 ELSE 0 END) as total_escaneadas
      FROM compras_asientos ca
      INNER JOIN compras c ON ca.compra_id = c.id
      INNER JOIN eventos e ON c.evento_id = e.id
      WHERE ca.estado = 'CONFIRMADO' AND e.tipo_evento = 'especial'
    `;

    let queryStatsMesas = `
      SELECT 
        COUNT(*) as total_confirmadas,
        SUM(CASE WHEN escaneado = TRUE THEN 1 ELSE 0 END) as total_escaneadas
      FROM compras_mesas cm
      INNER JOIN compras c ON cm.compra_id = c.id
      INNER JOIN eventos e ON c.evento_id = e.id
      WHERE cm.estado = 'CONFIRMADO' AND e.tipo_evento = 'especial'
    `;

    const statsParams = [];
    if (evento_id) {
      queryStatsAsientos += ' AND c.evento_id = ?';
      queryStatsMesas += ' AND c.evento_id = ?';
      statsParams.push(evento_id);
    }

    const [statsAsientos] = await pool.execute(queryStatsAsientos, statsParams);
    const [statsMesas] = await pool.execute(queryStatsMesas, statsParams);

    const totalConfirmadasAsientos = parseInt(statsAsientos[0]?.total_confirmadas || 0);
    const totalEscaneadasAsientos = parseInt(statsAsientos[0]?.total_escaneadas || 0);
    const totalConfirmadasMesas = parseInt(statsMesas[0]?.total_confirmadas || 0);
    const totalEscaneadasMesas = parseInt(statsMesas[0]?.total_escaneadas || 0);
    
    // Calcular disponibles
    const asientosDisponibles = totalAsientosDisponibles !== null ? Math.max(0, totalAsientosDisponibles - totalConfirmadasAsientos) : null;
    const mesasDisponibles = totalMesasDisponibles !== null ? Math.max(0, totalMesasDisponibles - totalConfirmadasMesas) : null;

    // Para mesas, cada mesa tiene cantidad_sillas, así que necesitamos contar las sillas
    let querySillasMesas = `
      SELECT 
        SUM(cm.cantidad_sillas) as total_sillas_confirmadas,
        SUM(CASE WHEN cm.escaneado = TRUE THEN cm.cantidad_sillas ELSE 0 END) as total_sillas_escaneadas
      FROM compras_mesas cm
      INNER JOIN compras c ON cm.compra_id = c.id
      INNER JOIN eventos e ON c.evento_id = e.id
      WHERE cm.estado = 'CONFIRMADO' AND e.tipo_evento = 'especial'
    `;

    if (evento_id) {
      querySillasMesas += ' AND c.evento_id = ?';
    }

    const [statsSillasMesas] = await pool.execute(querySillasMesas, statsParams);
    const totalSillasConfirmadas = parseInt(statsSillasMesas[0]?.total_sillas_confirmadas || 0);
    const totalSillasEscaneadas = parseInt(statsSillasMesas[0]?.total_sillas_escaneadas || 0);
    
    // Calcular sillas disponibles
    const sillasDisponibles = totalSillasDisponibles !== null ? Math.max(0, totalSillasDisponibles - totalSillasConfirmadas) : null;

    // Si no hay filtro de evento, también contar eventos generales
    let totalConfirmadasGenerales = 0;
    let totalEscaneadasGenerales = 0;
    let limiteTotalGenerales = null;
    if (!evento_id) {
      // Contar todas las entradas generales confirmadas y escaneadas
      const [statsGenerales] = await pool.execute(`
        SELECT 
          COUNT(*) as total_confirmadas,
          SUM(CASE WHEN eg.escaneado = TRUE THEN 1 ELSE 0 END) as total_escaneadas
        FROM compras_entradas_generales eg
        INNER JOIN compras c ON eg.compra_id = c.id
        INNER JOIN eventos e ON c.evento_id = e.id
        WHERE c.estado = 'PAGO_REALIZADO' AND e.tipo_evento = 'general'
      `);
      totalConfirmadasGenerales = parseInt(statsGenerales[0]?.total_confirmadas || 0);
      totalEscaneadasGenerales = parseInt(statsGenerales[0]?.total_escaneadas || 0);
      // Para vista general sin filtro, no calculamos límite total
      limiteTotalGenerales = null;
    } else {
      // Si hay filtro de evento pero no es general, las entradas generales ya están en entradasGenerales
      // Contar las entradas generales escaneadas para este evento
      totalEscaneadasGenerales = entradasGenerales.length;
      const [statsGenerales] = await pool.execute(
        `SELECT COUNT(*) as total_confirmadas
         FROM compras_entradas_generales eg
         INNER JOIN compras c ON eg.compra_id = c.id
         WHERE c.evento_id = ? AND c.estado = 'PAGO_REALIZADO'`,
        [evento_id]
      );
      totalConfirmadasGenerales = parseInt(statsGenerales[0]?.total_confirmadas || 0);
    }

    // Totales generales (especiales + generales)
    const totalConfirmadas = totalConfirmadasAsientos + totalSillasConfirmadas + totalConfirmadasGenerales;
    const totalEscaneadas = totalEscaneadasAsientos + totalSillasEscaneadas;
    const totalFaltantes = totalConfirmadas - totalEscaneadas;

    console.log(`✅ Encontradas ${asientos.length} asientos y ${mesas.length} mesas escaneadas`);
    console.log(`📊 Estadísticas: ${totalConfirmadas} confirmadas, ${totalEscaneadas} escaneadas, ${totalFaltantes} faltantes`);

    res.json({
      success: true,
      data: {
        asientos: asientos.map(a => ({
          ...a,
          tipo: 'ASIENTO',
          compra_asiento_id: a.id
        })),
        mesas: mesas.map(m => ({
          ...m,
          tipo: 'MESA',
          compra_mesa_id: m.id
        })),
        generales: entradasGenerales.map(eg => ({
          ...eg,
          tipo: 'GENERAL',
          compra_entrada_general_id: eg.id
        })),
        estadisticas: {
          total_confirmadas: totalConfirmadas,
          total_escaneadas: totalEscaneadas,
          total_faltantes: totalFaltantes,
          tipo_evento: tipoEvento || (evento_id ? null : 'mixto'),
          generales: {
            limite_total: limiteTotalGenerales,
            vendidas: totalConfirmadasGenerales,
            disponibles: limiteTotalGenerales !== null ? Math.max(0, limiteTotalGenerales - totalConfirmadasGenerales) : null,
            escaneadas: totalEscaneadasGenerales,
            total_faltantes: totalConfirmadasGenerales - totalEscaneadasGenerales
          },
          asientos: {
            limite_total: totalAsientosDisponibles,
            vendidas: totalConfirmadasAsientos,
            disponibles: asientosDisponibles,
            escaneadas: totalEscaneadasAsientos,
            total_faltantes: totalConfirmadasAsientos - totalEscaneadasAsientos
          },
          mesas: {
            limite_total: totalMesasDisponibles,
            vendidas: totalConfirmadasMesas,
            disponibles: mesasDisponibles,
            escaneadas: totalEscaneadasMesas,
            total_faltantes: totalConfirmadasMesas - totalEscaneadasMesas,
            sillas: {
              limite_total: totalSillasDisponibles,
              vendidas: totalSillasConfirmadas,
              disponibles: sillasDisponibles,
              escaneadas: totalSillasEscaneadas,
              total_faltantes: totalSillasConfirmadas - totalSillasEscaneadas
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('❌ Error al obtener entradas escaneadas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener entradas escaneadas',
      error: error.message
    });
  }
};

// Obtener todas las compras (para admin)
export const obtenerCompras = async (req, res) => {
  try {
    const { estado, evento_id } = req.query;

    let query = `
      SELECT c.*, e.titulo as evento_titulo, e.hora_inicio as evento_fecha
      FROM compras c
      INNER JOIN eventos e ON c.evento_id = e.id
      WHERE 1=1
    `;
    const params = [];

    if (estado) {
      query += ' AND c.estado = ?';
      params.push(estado);
    }

    if (evento_id) {
      query += ' AND c.evento_id = ?';
      params.push(evento_id);
    }

    query += ' ORDER BY c.created_at DESC';

    const [compras] = await pool.execute(query, params);

    // Para cada compra, obtener cantidad de asientos y mesas
    const comprasConDetalles = await Promise.all(compras.map(async (compra) => {
      const [asientosCount] = await pool.execute(
        'SELECT COUNT(*) as total FROM compras_asientos WHERE compra_id = ?',
        [compra.id]
      );
      const [mesasCount] = await pool.execute(
        'SELECT COUNT(*) as total FROM compras_mesas WHERE compra_id = ?',
        [compra.id]
      );

      return {
        ...compra,
        total_asientos: asientosCount[0].total,
        total_mesas: mesasCount[0].total
      };
    }));

    res.json({
      success: true,
      data: comprasConDetalles
    });

  } catch (error) {
    console.error('Error al obtener compras:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las compras',
      error: error.message
    });
  }
};

// Obtener compras del cliente logueado
export const obtenerMisCompras = async (req, res) => {
  try {
    // Obtener el correo del cliente desde el token
    const clienteEmail = req.user?.correo;

    if (!clienteEmail) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    // Obtener todas las compras del cliente
    const [compras] = await pool.execute(
      `SELECT c.*, e.titulo as evento_titulo, e.hora_inicio as evento_fecha, e.imagen as evento_imagen
       FROM compras c
       INNER JOIN eventos e ON c.evento_id = e.id
       WHERE c.cliente_email = ?
       ORDER BY c.created_at DESC`,
      [clienteEmail]
    );

    // Para cada compra, obtener detalles de asientos y mesas
    const comprasConDetalles = await Promise.all(compras.map(async (compra) => {
      const [asientos] = await pool.execute(
        `SELECT 
          ca.*, 
          a.numero_asiento, 
          a.mesa_id,
          m.numero_mesa,
          tp.nombre as tipo_precio_nombre,
          ar.nombre as area_nombre
         FROM compras_asientos ca
         INNER JOIN asientos a ON ca.asiento_id = a.id
         LEFT JOIN mesas m ON a.mesa_id = m.id
         LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
         LEFT JOIN areas_layout ar ON a.area_id = ar.id
         WHERE ca.compra_id = ?
         ORDER BY a.numero_asiento`,
        [compra.id]
      );

      const [mesas] = await pool.execute(
        `SELECT cm.*, m.numero_mesa
         FROM compras_mesas cm
         INNER JOIN mesas m ON cm.mesa_id = m.id
         WHERE cm.compra_id = ?`,
        [compra.id]
      );

      return {
        ...compra,
        asientos,
        mesas
      };
    }));

    res.json({
      success: true,
      data: comprasConDetalles
    });

  } catch (error) {
    console.error('Error al obtener mis compras:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las compras',
      error: error.message
    });
  }
};

// Generar código único de 5 dígitos para escaneo
const generarCodigoEscaneo = async (connection) => {
  let codigo = '';
  let existe = true;
  let intentos = 0;
  const maxIntentos = 100;

  // Generar códigos hasta encontrar uno único
  while (existe && intentos < maxIntentos) {
    // Generar código de 5 dígitos (10000-99999)
    codigo = Math.floor(10000 + Math.random() * 90000).toString();
    
    // Verificar si existe en compras_asientos
    const [asientos] = await connection.execute(
      'SELECT id FROM compras_asientos WHERE codigo_escaneo = ?',
      [codigo]
    );
    
    // Verificar si existe en compras_mesas
    const [mesas] = await connection.execute(
      'SELECT id FROM compras_mesas WHERE codigo_escaneo = ?',
      [codigo]
    );
    
    // Verificar si existe en compras_entradas_generales (para eventos generales)
    const [entradasGenerales] = await connection.execute(
      'SELECT id FROM compras_entradas_generales WHERE codigo_escaneo = ?',
      [codigo]
    );
    
    existe = asientos.length > 0 || mesas.length > 0 || entradasGenerales.length > 0;
    intentos++;
  }

  if (intentos >= maxIntentos) {
    throw new Error('No se pudo generar un código único después de múltiples intentos');
  }

  return codigo;
};

// Confirmar pago de una compra
export const confirmarPago = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que la compra existe
    const [compras] = await pool.execute('SELECT * FROM compras WHERE id = ?', [id]);
    if (compras.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Compra no encontrada'
      });
    }

    const compra = compras[0];

    // Verificar que el estado sea PAGO_PENDIENTE
    if (compra.estado !== 'PAGO_PENDIENTE') {
      return res.status(400).json({
        success: false,
        message: `No se puede confirmar el pago. Estado actual: ${compra.estado}`
      });
    }

    // Iniciar transacción
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Actualizar estado de la compra
      await connection.execute(
        `UPDATE compras 
         SET estado = 'PAGO_REALIZADO', 
             fecha_pago = NOW(), 
             fecha_confirmacion = NOW()
         WHERE id = ?`,
        [id]
      );

      // Obtener todos los asientos de la compra para generar códigos
      const [asientosCompra] = await connection.execute(
        `SELECT id FROM compras_asientos WHERE compra_id = ?`,
        [id]
      );

      // Generar y asignar códigos únicos de escaneo a cada asiento
      for (const asiento of asientosCompra) {
        const codigoEscaneo = await generarCodigoEscaneo(connection);
        await connection.execute(
          `UPDATE compras_asientos 
           SET estado = 'CONFIRMADO', codigo_escaneo = ?
           WHERE id = ?`,
          [codigoEscaneo, asiento.id]
        );
      }

      // Obtener todas las mesas de la compra para generar códigos
      const [mesasCompra] = await connection.execute(
        `SELECT id FROM compras_mesas WHERE compra_id = ?`,
        [id]
      );

      // Generar y asignar códigos únicos de escaneo a cada mesa
      for (const mesa of mesasCompra) {
        const codigoEscaneo = await generarCodigoEscaneo(connection);
        await connection.execute(
          `UPDATE compras_mesas 
           SET estado = 'CONFIRMADO', codigo_escaneo = ?
           WHERE id = ?`,
          [codigoEscaneo, mesa.id]
        );
      }

      // Si es evento general (no hay asientos ni mesas), generar un código de escaneo por cada entrada
      if (asientosCompra.length === 0 && mesasCompra.length === 0) {
        const cantidad = compra.cantidad || 1;
        // Generar un código único para cada entrada
        for (let i = 0; i < cantidad; i++) {
          const codigoEscaneo = await generarCodigoEscaneo(connection);
          await connection.execute(
            `INSERT INTO compras_entradas_generales (compra_id, codigo_escaneo)
             VALUES (?, ?)`,
            [id, codigoEscaneo]
          );
        }
      }

      await connection.commit();
      connection.release();

      // Obtener la compra actualizada con todos los detalles
      const [comprasActualizadas] = await pool.execute(
        `SELECT c.*, e.titulo as evento_titulo, e.hora_inicio as evento_fecha, e.descripcion as evento_descripcion
         FROM compras c
         INNER JOIN eventos e ON c.evento_id = e.id
         WHERE c.id = ?`,
        [id]
      );

      const compraActualizada = comprasActualizadas[0];

      // Obtener asientos y mesas para el boleto
      let asientosBoleto = [];
      let mesasBoleto = [];
      let entradasGeneralesBoleto = [];
      
      try {
        const [asientos] = await pool.execute(
          `SELECT 
            ca.*, 
            a.numero_asiento, 
            a.area_id,
            a.mesa_id,
            m.numero_mesa,
            tp.nombre as tipo_precio_nombre,
            ar.nombre as area_nombre,
            ca.codigo_escaneo
           FROM compras_asientos ca
           INNER JOIN asientos a ON ca.asiento_id = a.id
           LEFT JOIN mesas m ON a.mesa_id = m.id
           LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
           LEFT JOIN areas_layout ar ON a.area_id = ar.id
           WHERE ca.compra_id = ? AND ca.estado = 'CONFIRMADO'
           ORDER BY a.numero_asiento`,
          [id]
        );
        asientosBoleto = asientos;
      } catch (err) {
        console.error('Error al obtener asientos para boleto:', err);
      }

      try {
        const [mesas] = await pool.execute(
          `SELECT cm.*, m.numero_mesa, cm.codigo_escaneo
           FROM compras_mesas cm
           INNER JOIN mesas m ON cm.mesa_id = m.id
           WHERE cm.compra_id = ? AND cm.estado = 'CONFIRMADO'`,
          [id]
        );
        mesasBoleto = mesas;
      } catch (err) {
        console.error('Error al obtener mesas para boleto:', err);
      }

      // Obtener entradas generales si no hay asientos ni mesas
      if (asientosBoleto.length === 0 && mesasBoleto.length === 0) {
        try {
          const [entradas] = await pool.execute(`
            SELECT 
              id,
              compra_id,
              codigo_escaneo,
              escaneado,
              fecha_escaneo,
              usuario_escaneo_id
            FROM compras_entradas_generales
            WHERE compra_id = ?
            ORDER BY id ASC
          `, [id]);
          entradasGeneralesBoleto = entradas;
        } catch (err) {
          console.error('Error al obtener entradas generales para boleto:', err);
        }
      }

      // Generar PDF del boleto
      let pdfPath = null;
      let pdfUrl = null;
      try {
        const protocol = req.protocol || 'http';
        const host = req.get('host') || 'localhost:5000';
        const serverBase = `${protocol}://${host}`;

        pdfPath = await generarBoletoPDF(
          compraActualizada,
          {
            titulo: compraActualizada.evento_titulo,
            hora_inicio: compraActualizada.evento_fecha,
            descripcion: compraActualizada.evento_descripcion
          },
          asientosBoleto,
          mesasBoleto,
          entradasGeneralesBoleto
        );

        pdfUrl = `${serverBase}${pdfPath}`;
        console.log('✅ PDF del boleto generado:', pdfUrl);
      } catch (pdfError) {
        console.error('❌ Error al generar PDF del boleto:', pdfError);
        // Continuar sin PDF si falla
      }

      res.json({
        success: true,
        message: 'Pago confirmado exitosamente',
        data: compraActualizada,
        boletoUrl: pdfUrl
      });

    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }

  } catch (error) {
    console.error('Error al confirmar pago:', error);
    res.status(500).json({
      success: false,
      message: 'Error al confirmar el pago',
      error: error.message
    });
  }
};

// Cancelar compra y habilitar asientos
export const cancelarCompra = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que la compra existe
    const [compras] = await pool.execute('SELECT * FROM compras WHERE id = ?', [id]);
    if (compras.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Compra no encontrada'
      });
    }

    const compra = compras[0];

    // Solo se puede cancelar si está pendiente
    if (compra.estado !== 'PAGO_PENDIENTE') {
      return res.status(400).json({
        success: false,
        message: `No se puede cancelar. Estado actual: ${compra.estado}`
      });
    }

    // Iniciar transacción
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Actualizar estado de la compra a CANCELADO
      await connection.execute(
        `UPDATE compras 
         SET estado = 'CANCELADO'
         WHERE id = ?`,
        [id]
      );

      // Actualizar estado de asientos a CANCELADO
      await connection.execute(
        `UPDATE compras_asientos 
         SET estado = 'CANCELADO'
         WHERE compra_id = ?`,
        [id]
      );

      // Actualizar estado de mesas a CANCELADO
      await connection.execute(
        `UPDATE compras_mesas 
         SET estado = 'CANCELADO'
         WHERE compra_id = ?`,
        [id]
      );

      await connection.commit();
      connection.release();

      res.json({
        success: true,
        message: 'Compra cancelada y asientos habilitados exitosamente'
      });

    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }

  } catch (error) {
    console.error('Error al cancelar compra:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cancelar la compra',
      error: error.message
    });
  }
};

// Reenviar boleto por WhatsApp
export const reenviarBoleto = async (req, res) => {
  try {
    const { id } = req.params;
    const { telefono } = req.body; // Opcional: si no se envía, usa el teléfono del cliente

    // Obtener la compra con todos sus detalles
    const [compras] = await pool.execute(`
      SELECT 
        c.*,
        e.titulo as evento_titulo,
        e.hora_inicio as evento_fecha
      FROM compras c
      INNER JOIN eventos e ON c.evento_id = e.id
      WHERE c.id = ?
    `, [id]);

    if (compras.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Compra no encontrada'
      });
    }

    const compra = compras[0];

    // Verificar que el pago esté confirmado
    if (compra.estado !== 'PAGO_REALIZADO') {
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden reenviar boletos de compras con pago confirmado'
      });
    }

    // Determinar el número de teléfono a usar
    const numeroEnvio = telefono || compra.cliente_telefono;
    if (!numeroEnvio) {
      return res.status(400).json({
        success: false,
        message: 'No se encontró número de teléfono para enviar el boleto'
      });
    }

    // Obtener asientos individuales
    const [asientos] = await pool.execute(`
      SELECT 
        ca.*,
        a.numero_asiento,
        a.area_id,
        a.mesa_id,
        m.numero_mesa,
        tp.nombre as tipo_precio_nombre,
        ar.nombre as area_nombre
      FROM compras_asientos ca
      INNER JOIN asientos a ON ca.asiento_id = a.id
      LEFT JOIN mesas m ON a.mesa_id = m.id
      LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
      LEFT JOIN areas_layout ar ON a.area_id = ar.id
      WHERE ca.compra_id = ? AND ca.estado = 'CONFIRMADO'
    `, [id]);

    // Obtener mesas completas
      const [mesas] = await pool.execute(`
      SELECT 
        cm.*,
        m.numero_mesa,
        cm.codigo_escaneo
      FROM compras_mesas cm
      INNER JOIN mesas m ON cm.mesa_id = m.id
      WHERE cm.compra_id = ? AND cm.estado = 'CONFIRMADO'
    `, [id]);

    // Obtener información del evento
    const [eventos] = await pool.execute('SELECT * FROM eventos WHERE id = ?', [compra.evento_id]);
    const evento = eventos[0];

    // Generar el PDF del boleto
    const pdfPath = await generarBoletoPDF(compra, evento, asientos, mesas);
    
    // Construir URL completa del PDF
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:5000';
    const serverBase = `${protocol}://${host}`;
    const pdfUrl = `${serverBase}${pdfPath.replace(/\\/g, '/').replace(/^.*\/uploads/, '/uploads')}`;

    // Formatear fecha del evento
    const fechaEvento = evento.evento_fecha ? new Date(evento.evento_fecha).toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) : 'Fecha no disponible';

    // Preparar datos para el mensaje
    const asientosParaMensaje = [
      ...asientos.map(a => ({
        type: 'asiento',
        nombre: `Asiento ${a.numero_asiento}`
      })),
      ...mesas.map(m => ({
        type: 'mesa_completa',
        nombre: `Mesa M${m.numero_mesa}`
      }))
    ];

    res.json({
      success: true,
      message: 'Boleto reenviado exitosamente por WhatsApp',
      telefono: numeroEnvio
    });

  } catch (error) {
    console.error('Error al reenviar boleto:', error);
    res.status(500).json({
      success: false,
      message: 'Error al reenviar el boleto',
      error: error.message
    });
  }
};

// Obtener URL del PDF del boleto para enviar por WhatsApp Web
export const obtenerPDFBoleto = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener la compra con todos sus detalles (incluyendo codigo_escaneo para eventos generales)
    const [compras] = await pool.execute(`
      SELECT 
        c.*,
        e.titulo as evento_titulo,
        e.hora_inicio as evento_fecha,
        e.descripcion as evento_descripcion,
        e.tipo_evento
      FROM compras c
      INNER JOIN eventos e ON c.evento_id = e.id
      WHERE c.id = ?
    `, [id]);

    if (compras.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Compra no encontrada'
      });
    }

    const compra = compras[0];

    // Verificar que el pago esté confirmado
    if (compra.estado !== 'PAGO_REALIZADO') {
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden obtener PDFs de compras con pago confirmado'
      });
    }

    // Obtener asientos individuales
    const [asientos] = await pool.execute(`
      SELECT 
        ca.*,
        a.numero_asiento,
        a.area_id,
        a.mesa_id,
        m.numero_mesa,
        tp.nombre as tipo_precio_nombre,
        ar.nombre as area_nombre
      FROM compras_asientos ca
      INNER JOIN asientos a ON ca.asiento_id = a.id
      LEFT JOIN mesas m ON a.mesa_id = m.id
      LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
      LEFT JOIN areas_layout ar ON a.area_id = ar.id
      WHERE ca.compra_id = ? AND ca.estado = 'CONFIRMADO'
    `, [id]);

    // Obtener mesas completas
    const [mesas] = await pool.execute(`
      SELECT 
        cm.*,
        m.numero_mesa,
        cm.codigo_escaneo
      FROM compras_mesas cm
      INNER JOIN mesas m ON cm.mesa_id = m.id
      WHERE cm.compra_id = ? AND cm.estado = 'CONFIRMADO'
    `, [id]);

    // Obtener entradas generales (para eventos sin asientos/mesas)
    let entradasGenerales = [];
    if (asientos.length === 0 && mesas.length === 0) {
      const [entradas] = await pool.execute(`
        SELECT 
          id,
          compra_id,
          codigo_escaneo,
          escaneado,
          fecha_escaneo,
          usuario_escaneo_id
        FROM compras_entradas_generales
        WHERE compra_id = ?
        ORDER BY id ASC
      `, [id]);
      entradasGenerales = entradas;
    }

    // Obtener información del evento
    const evento = {
      id: compra.evento_id,
      titulo: compra.evento_titulo,
      hora_inicio: compra.evento_fecha,
      descripcion: compra.evento_descripcion
    };

    // Generar el PDF del boleto
    const pdfPath = await generarBoletoPDF(compra, evento, asientos, mesas, entradasGenerales);
    
    // Obtener ruta completa del archivo
    const pdfPathCompleto = path.join(__dirname, '..', pdfPath.replace(/^\//, ''));
    
    // Verificar si el archivo existe
    if (!fs.existsSync(pdfPathCompleto)) {
      return res.status(404).json({
        success: false,
        message: 'El archivo PDF no se encontró'
      });
    }

    // Enviar el archivo PDF directamente
    const nombreArchivo = `boleto-${compra.codigo_unico}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.sendFile(pdfPathCompleto);

  } catch (error) {
    console.error('Error al obtener PDF del boleto:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el PDF del boleto',
      error: error.message
    });
  }
};

// Enviar PDF del boleto directamente por WhatsApp Web
export const enviarPDFPorWhatsAppWeb = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar estado de WhatsApp Web (ahora es async)
    const estadoWhatsApp = await obtenerEstadoWhatsApp();
    if (!estadoWhatsApp.isReady) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp Web no está listo. Por favor, escanea el código QR primero.',
        qrCode: estadoWhatsApp.qrCode,
        qrCodeImage: estadoWhatsApp.qrCodeImage,
        isReady: false
      });
    }

    // Obtener la compra con todos sus detalles (incluyendo codigo_escaneo para eventos generales)
    const [compras] = await pool.execute(`
      SELECT 
        c.*,
        e.titulo as evento_titulo,
        e.hora_inicio as evento_fecha,
        e.descripcion as evento_descripcion,
        e.tipo_evento
      FROM compras c
      INNER JOIN eventos e ON c.evento_id = e.id
      WHERE c.id = ?
    `, [id]);

    if (compras.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Compra no encontrada'
      });
    }

    const compra = compras[0];

    // Verificar que el pago esté confirmado
    if (compra.estado !== 'PAGO_REALIZADO') {
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden enviar PDFs de compras con pago confirmado'
      });
    }

    if (!compra.cliente_telefono) {
      return res.status(400).json({
        success: false,
        message: 'No se encontró número de teléfono del cliente'
      });
    }

    // Obtener asientos individuales
    const [asientos] = await pool.execute(`
      SELECT 
        ca.*,
        a.numero_asiento,
        a.area_id,
        a.mesa_id,
        m.numero_mesa,
        tp.nombre as tipo_precio_nombre,
        ar.nombre as area_nombre
      FROM compras_asientos ca
      INNER JOIN asientos a ON ca.asiento_id = a.id
      LEFT JOIN mesas m ON a.mesa_id = m.id
      LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
      LEFT JOIN areas_layout ar ON a.area_id = ar.id
      WHERE ca.compra_id = ? AND ca.estado = 'CONFIRMADO'
    `, [id]);

    // Obtener mesas completas
      const [mesas] = await pool.execute(`
      SELECT 
        cm.*,
        m.numero_mesa,
        cm.codigo_escaneo
      FROM compras_mesas cm
      INNER JOIN mesas m ON cm.mesa_id = m.id
      WHERE cm.compra_id = ? AND cm.estado = 'CONFIRMADO'
    `, [id]);

    // Obtener información del evento
    const evento = {
      id: compra.evento_id,
      titulo: compra.evento_titulo,
      hora_inicio: compra.evento_fecha,
      descripcion: compra.evento_descripcion
    };

    // Generar el PDF del boleto
    const pdfPath = await generarBoletoPDF(compra, evento, asientos, mesas);
    
    // Obtener la ruta completa del archivo
    const pdfPathCompleto = path.join(__dirname, '..', pdfPath.replace(/^\//, ''));

    // Formatear fecha del evento
    const fechaEvento = compra.evento_fecha ? new Date(compra.evento_fecha).toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) : 'Fecha no disponible';

    // Crear mensaje personalizado
    const mensaje = `✅✅✅ *GRACIAS POR TU COMPRA* ✅✅✅\n\n` +
      `*TU COMPROBANTE FUE PROCESADO CORRECTAMENTE*\n\n` +
      `Hola *${compra.cliente_nombre}*,\n\n` +
      `📅 *Evento:* ${compra.evento_titulo}\n` +
      `📆 *Fecha:* ${fechaEvento}\n` +
      `🎟️ *Cantidad:* ${compra.cantidad} entrada(s)\n` +
      `💰 *Total:* $${parseFloat(compra.total).toFixed(2)} BOB\n` +
      `🔑 *Código:* ${compra.codigo_unico}\n\n` +
      `¡Esperamos verte en el evento! 🎉`;

    // Enviar el PDF por WhatsApp Web
    const resultado = await enviarPDFWhatsAppWebService(
      compra.cliente_telefono,
      pdfPathCompleto,
      mensaje
    );

    if (resultado.success) {
      res.json({
        success: true,
        message: 'PDF enviado exitosamente por WhatsApp Web',
        telefono: compra.cliente_telefono
      });
    } else {
      res.status(500).json({
        success: false,
        message: resultado.message || 'Error al enviar el PDF',
        error: resultado.error
      });
    }

  } catch (error) {
    console.error('Error al enviar PDF por WhatsApp Web:', error);
    res.status(500).json({
      success: false,
      message: 'Error al enviar el PDF por WhatsApp Web',
      error: error.message
    });
  }
};

// Obtener estado de WhatsApp Web
export const obtenerEstadoWhatsAppWeb = async (req, res) => {
  try {
    const estado = await obtenerEstadoWhatsApp();
    res.json({
      success: true,
      ...estado
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener el estado de WhatsApp Web',
      error: error.message
    });
  }
};

// Reiniciar sesión de WhatsApp Web
export const reiniciarSesionWhatsAppWeb = async (_req, res) => {
  try {
    const resultado = await reiniciarWhatsAppWeb();
    res.json({
      success: true,
      ...resultado
    });
  } catch (error) {
    console.error('Error al reiniciar WhatsApp Web:', error);
    res.status(500).json({
      success: false,
      message: 'Error al reiniciar WhatsApp Web',
      error: error.message
    });
  }
};

// Eliminar compra completamente y liberar asientos
export const eliminarCompra = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que la compra existe
    const [compras] = await pool.execute('SELECT * FROM compras WHERE id = ?', [id]);
    if (compras.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Compra no encontrada'
      });
    }

    const compra = compras[0];

    // Iniciar transacción
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Eliminar registros de compras_asientos primero (CASCADE debería hacerlo, pero lo hacemos explícito)
      await connection.execute(
        `DELETE FROM compras_asientos WHERE compra_id = ?`,
        [id]
      );

      // Eliminar registros de compras_mesas (CASCADE debería hacerlo, pero lo hacemos explícito)
      await connection.execute(
        `DELETE FROM compras_mesas WHERE compra_id = ?`,
        [id]
      );

      // Eliminar la compra (esto debería eliminar en cascada las relaciones si quedan)
      await connection.execute(
        `DELETE FROM compras WHERE id = ?`,
        [id]
      );

      await connection.commit();
      connection.release();

      res.json({
        success: true,
        message: 'Compra y todas sus entradas eliminadas exitosamente. Los asientos han sido liberados.'
      });

    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }

  } catch (error) {
    console.error('Error al eliminar compra:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar la compra',
      error: error.message
    });
  }
};

// Enviar boleto por correo electrónico
export const enviarBoletoPorEmail = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener la compra con todos sus detalles (incluyendo codigo_escaneo para eventos generales)
    const [compras] = await pool.execute(`
      SELECT 
        c.*,
        e.titulo as evento_titulo,
        e.hora_inicio as evento_fecha,
        e.descripcion as evento_descripcion,
        e.tipo_evento
      FROM compras c
      INNER JOIN eventos e ON c.evento_id = e.id
      WHERE c.id = ?
    `, [id]);

    if (compras.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Compra no encontrada'
      });
    }

    const compra = compras[0];

    // Verificar que el pago esté confirmado
    if (compra.estado !== 'PAGO_REALIZADO') {
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden enviar boletos de compras con pago confirmado'
      });
    }

    // Verificar que haya email del cliente
    if (!compra.cliente_email) {
      return res.status(400).json({
        success: false,
        message: 'No se encontró correo electrónico del cliente'
      });
    }

    // Obtener asientos individuales
    const [asientos] = await pool.execute(`
      SELECT 
        ca.*,
        a.numero_asiento,
        a.area_id,
        a.mesa_id,
        m.numero_mesa,
        tp.nombre as tipo_precio_nombre,
        ar.nombre as area_nombre
      FROM compras_asientos ca
      INNER JOIN asientos a ON ca.asiento_id = a.id
      LEFT JOIN mesas m ON a.mesa_id = m.id
      LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
      LEFT JOIN areas_layout ar ON a.area_id = ar.id
      WHERE ca.compra_id = ? AND ca.estado = 'CONFIRMADO'
    `, [id]);

    // Obtener mesas completas
    const [mesas] = await pool.execute(`
      SELECT 
        cm.*,
        m.numero_mesa,
        cm.codigo_escaneo
      FROM compras_mesas cm
      INNER JOIN mesas m ON cm.mesa_id = m.id
      WHERE cm.compra_id = ? AND cm.estado = 'CONFIRMADO'
    `, [id]);

    // Obtener entradas generales (para eventos sin asientos/mesas)
    let entradasGenerales = [];
    if (asientos.length === 0 && mesas.length === 0) {
      const [entradas] = await pool.execute(`
        SELECT 
          id,
          compra_id,
          codigo_escaneo,
          escaneado,
          fecha_escaneo,
          usuario_escaneo_id
        FROM compras_entradas_generales
        WHERE compra_id = ?
        ORDER BY id ASC
      `, [id]);
      entradasGenerales = entradas;
    }

    // Obtener información del evento
    const evento = {
      id: compra.evento_id,
      titulo: compra.evento_titulo,
      hora_inicio: compra.evento_fecha,
      descripcion: compra.evento_descripcion
    };

    // Generar el PDF del boleto
    const pdfPath = await generarBoletoPDF(compra, evento, asientos, mesas, entradasGenerales);
    
    // Obtener ruta completa del archivo
    const pdfPathCompleto = path.join(__dirname, '..', pdfPath.replace(/^\//, ''));

    // Preparar datos para el email
    const datosCompra = {
      tituloEvento: compra.evento_titulo,
      fechaEvento: compra.evento_fecha,
      cantidad: compra.cantidad,
      total: compra.total,
      codigoUnico: compra.codigo_unico
    };

    // Enviar el boleto por email
    const resultado = await enviarBoletoPorEmailService(
      compra.cliente_email,
      compra.cliente_nombre,
      pdfPathCompleto,
      datosCompra
    );

    if (resultado.success) {
      res.json({
        success: true,
        message: resultado.message,
        email: resultado.email
      });
    } else {
      res.status(500).json({
        success: false,
        message: resultado.message,
        error: resultado.error
      });
    }

  } catch (error) {
    console.error('Error al enviar boleto por email:', error);
    res.status(500).json({
      success: false,
      message: 'Error al enviar el boleto por correo electrónico',
      error: error.message
    });
  }
};

