import pool from '../config/db.js';
import { generarBoletoPDF } from '../services/boletoService.js';
import { enviarPDFPorWhatsAppWeb as enviarPDFWhatsAppWebService, enviarMensajePorWhatsAppWeb, obtenerEstadoWhatsApp, reiniciarWhatsAppWeb } from '../services/whatsappWebService.js';
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
      tipo_venta = 'NORMAL',
      precio_original = null,
      codigo_cupon, // Código del cupón de descuento
      asientos, // Array de objetos { id, precio }
      mesas, // Array de objetos { mesa_id, cantidad_sillas, precio_total, sillas }
      areas_personas, // Array de objetos { area_id, cantidad, precio_unitario? } para zona general/personas de pie
      entradas_generales // Array de { tipo_precio_id, cantidad } para evento general con múltiples precios (VIP, General, etc.)
    } = req.body;

    // Validaciones básicas
    if (!evento_id || !cliente_nombre || !cantidad) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: evento_id, cliente_nombre, cantidad'
      });
    }

    const tipoVentaValido = ['NORMAL', 'REGALO_ADMIN', 'OFERTA_ADMIN'].includes(tipo_venta) ? tipo_venta : 'NORMAL';
    const rolUser = (req.user?.rol || '').toLowerCase();
    const puedeOpcionesVentaAdmin = rolUser === 'admin' || rolUser === 'vendedor';
    if ((tipoVentaValido === 'REGALO_ADMIN' || tipoVentaValido === 'OFERTA_ADMIN') && !puedeOpcionesVentaAdmin) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para aplicar "Entrada gratis" o "Precio especial"'
      });
    }
    let totalFinal = parseFloat(total) || 0;
    let precioOriginalFinal = precio_original != null ? parseFloat(precio_original) : null;
    let cuponId = null;
    let descuentoCupon = null;
    let totalAntesDescuento = totalFinal;

    // Calcular cantidad real: asientos + sillas de mesas + personas en áreas + entradas generales por tipo
    let cantidadFinal = parseInt(cantidad, 10) || 0;
    if (asientos && asientos.length > 0) cantidadFinal = Math.max(cantidadFinal, asientos.length);
    if (mesas && mesas.length > 0) {
      const sillasMesas = mesas.reduce((s, m) => s + (parseInt(m.cantidad_sillas, 10) || 0), 0);
      cantidadFinal = Math.max(cantidadFinal, sillasMesas);
    }
    if (areas_personas && areas_personas.length > 0) {
      const personasAreas = areas_personas.reduce((s, ap) => s + (parseInt(ap.cantidad, 10) || 0), 0);
      cantidadFinal = Math.max(cantidadFinal, personasAreas);
    }
    if (entradas_generales && Array.isArray(entradas_generales) && entradas_generales.length > 0) {
      const sumaEntradasGeneral = entradas_generales.reduce((s, eg) => s + (parseInt(eg.cantidad, 10) || 0), 0);
      cantidadFinal = Math.max(cantidadFinal, sumaEntradasGeneral);
    }

    if (tipoVentaValido === 'REGALO_ADMIN') {
      totalFinal = 0;
      precioOriginalFinal = null;
    } else if (tipoVentaValido === 'OFERTA_ADMIN' && totalFinal >= 0) {
      // precio_original es opcional para oferta
    } else if (tipoVentaValido === 'NORMAL' && (totalFinal <= 0 || total == null)) {
      return res.status(400).json({
        success: false,
        message: 'Falta el total para venta normal'
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
      const tieneAsientos = asientos && asientos.length > 0;
      const tieneMesas = mesas && mesas.length > 0;
      const tieneAreasPersonas = areas_personas && areas_personas.length > 0;
      if (!tieneAsientos && !tieneMesas && !tieneAreasPersonas) {
        return res.status(400).json({
          success: false,
          message: 'Debe seleccionar asientos, mesas o zonas generales (personas de pie) para eventos especiales'
        });
      }
    } else {
      // Evento general: el cupo lo define cada tipo de precio (límite por tipo), no el evento
    }

    // Validar y aplicar cupón si se proporciona (solo para ventas normales)
    if (codigo_cupon && tipoVentaValido === 'NORMAL') {
      const codigoCuponUpper = codigo_cupon.toUpperCase().trim();
      
      // Buscar el cupón
      const [cupones] = await pool.execute(
        `SELECT c.*, e.titulo as evento_titulo
         FROM cupones c
         INNER JOIN eventos e ON c.evento_id = e.id
         WHERE c.codigo = ? AND c.evento_id = ?`,
        [codigoCuponUpper, evento_id]
      );

      if (cupones.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Cupón no encontrado para este evento'
        });
      }

      const cupon = cupones[0];

      // Validar que esté activo
      if (!cupon.activo) {
        return res.status(400).json({
          success: false,
          message: 'Este cupón no está activo'
        });
      }

      // Validar límite de usos (total del cupón)
      if (cupon.usos_actuales >= cupon.limite_usos) {
        return res.status(400).json({
          success: false,
          message: 'Este cupón ha alcanzado su límite de usos'
        });
      }

      // Validar usos por cliente (1, 2, n veces por mismo email; 0 o null = sin límite)
      const limitePorCliente = cupon.limite_por_cliente != null ? parseInt(cupon.limite_por_cliente, 10) : 0;
      if (limitePorCliente > 0 && cliente_email) {
        const [usosCliente] = await pool.execute(
          `SELECT COUNT(*) as total FROM cupones_usados u
           INNER JOIN compras c ON c.id = u.compra_id
           WHERE u.cupon_id = ? AND LOWER(TRIM(IFNULL(c.cliente_email, ''))) = LOWER(TRIM(?))`,
          [cupon.id, cliente_email]
        );
        const usosDelCliente = parseInt(usosCliente[0]?.total || 0, 10);
        if (usosDelCliente >= limitePorCliente) {
          return res.status(400).json({
            success: false,
            message: `Este cupón solo puede usarse ${limitePorCliente} vez${limitePorCliente > 1 ? 'ces' : ''} por cliente. Ya lo utilizaste.`
          });
        }
      }

      // Validar fechas
      const ahora = new Date();
      if (cupon.fecha_inicio && new Date(cupon.fecha_inicio) > ahora) {
        return res.status(400).json({
          success: false,
          message: 'Este cupón aún no está disponible'
        });
      }

      if (cupon.fecha_fin && new Date(cupon.fecha_fin) < ahora) {
        return res.status(400).json({
          success: false,
          message: 'Este cupón ha expirado'
        });
      }

      // Calcular descuento
      const porcentajeDescuento = parseFloat(cupon.porcentaje_descuento);
      descuentoCupon = (totalFinal * porcentajeDescuento) / 100;
      totalAntesDescuento = totalFinal;
      totalFinal = totalFinal - descuentoCupon;
      cuponId = cupon.id;

      // Asegurar que el total no sea negativo
      if (totalFinal < 0) {
        totalFinal = 0;
        descuentoCupon = totalAntesDescuento;
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

      // Si hay usuario logueado admin o vendedor, registrar quién realizó la venta
      let usuarioId = null;
      const rol = (req.user?.rol || '').toLowerCase();
      if (req.user && (rol === 'admin' || rol === 'vendedor' || rol === 'vendedor_externo')) {
        usuarioId = req.user.id;
      }

      let compraId;
      try {
        const [result] = await connection.execute(
          `INSERT INTO compras 
           (codigo_unico, evento_id, cliente_nombre, cliente_email, cliente_telefono, cantidad, total, estado, tipo_venta, precio_original, cupon_id, descuento_cupon, usuario_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'PAGO_PENDIENTE', ?, ?, ?, ?, ?)`,
          [codigoUnico, evento_id, cliente_nombre, cliente_email || null, cliente_telefono || null, cantidadFinal, totalFinal, tipoVentaValido, precioOriginalFinal, cuponId, descuentoCupon, usuarioId]
        );
        compraId = result.insertId;
      } catch (err) {
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('usuario_id') || err.code === 'ER_BAD_FIELD_ERROR') {
          const [result] = await connection.execute(
            `INSERT INTO compras 
             (codigo_unico, evento_id, cliente_nombre, cliente_email, cliente_telefono, cantidad, total, estado, tipo_venta, precio_original, cupon_id, descuento_cupon)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'PAGO_PENDIENTE', ?, ?, ?, ?)`,
            [codigoUnico, evento_id, cliente_nombre, cliente_email || null, cliente_telefono || null, cantidadFinal, totalFinal, tipoVentaValido, precioOriginalFinal, cuponId, descuentoCupon]
          );
          compraId = result.insertId;
        } else {
          throw err;
        }
      }

      // Si se usó un cupón, actualizar contador y registrar uso
      if (cuponId) {
        // Incrementar contador de usos del cupón
        await connection.execute(
          'UPDATE cupones SET usos_actuales = usos_actuales + 1 WHERE id = ?',
          [cuponId]
        );

        // Registrar el uso del cupón
        await connection.execute(
          `INSERT INTO cupones_usados 
           (cupon_id, compra_id, descuento_aplicado, total_antes_descuento, total_despues_descuento)
           VALUES (?, ?, ?, ?, ?)`,
          [cuponId, compraId, descuentoCupon, totalAntesDescuento, totalFinal]
        );
      }

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

      // Registrar áreas personas (zonas generales - personas de pie)
      if (evento.tipo_evento === 'especial' && areas_personas && areas_personas.length > 0) {
        for (const ap of areas_personas) {
          const areaId = parseInt(ap.area_id, 10);
          const cant = parseInt(ap.cantidad, 10) || 1;
          const precioUnit = parseFloat(ap.precio_unitario) || 0;

          if (!areaId || cant < 1) continue;

          // Verificar que el área existe, pertenece al evento y es tipo PERSONAS
          const [areasCheck] = await connection.execute(
            `SELECT id, capacidad_personas FROM areas_layout WHERE id = ? AND evento_id = ? AND tipo_area = 'PERSONAS'`,
            [areaId, evento_id]
          );
          if (areasCheck.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
              success: false,
              message: `Área ${areaId} no válida o no es zona general (personas de pie)`
            });
          }

          const capacidad = parseInt(areasCheck[0].capacidad_personas || 0);
          if (capacidad < 1) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
              success: false,
              message: `Área ${areaId} no tiene capacidad definida`
            });
          }

          // Verificar disponibilidad
          const [reservas] = await connection.execute(
            `SELECT COALESCE(SUM(cap.cantidad), 0) as total
             FROM compras_areas_personas cap
             INNER JOIN compras c ON cap.compra_id = c.id
             WHERE cap.area_id = ? AND c.estado IN ('PAGO_PENDIENTE', 'PAGO_REALIZADO', 'ENTRADA_USADA')
               AND cap.estado IN ('RESERVADO', 'CONFIRMADO')`,
            [areaId]
          );
          const reservadas = parseInt(reservas[0]?.total || 0);
          const disponibles = Math.max(0, capacidad - reservadas);
          if (cant > disponibles) {
            await connection.rollback();
            connection.release();
            return res.status(409).json({
              success: false,
              message: `No hay suficientes entradas disponibles en la zona general. Disponibles: ${disponibles}`
            });
          }

          const precioTotal = precioUnit * cant;
          await connection.execute(
            `INSERT INTO compras_areas_personas (compra_id, area_id, cantidad, precio_unitario, precio_total, estado)
             VALUES (?, ?, ?, ?, ?, 'RESERVADO')`,
            [compraId, areaId, cant, precioUnit, precioTotal]
          );
        }
      }

      // Evento general con múltiples tipos de precio (VIP, General, Gradería): validar límites y guardar detalle
      if (evento.tipo_evento === 'general' && entradas_generales && Array.isArray(entradas_generales) && entradas_generales.length > 0) {
        const [tiposDelEvento] = await connection.execute(
          'SELECT id, precio, limite FROM tipos_precio_evento WHERE evento_id = ? AND activo = 1',
          [evento_id]
        );
        const idsValidos = new Set(tiposDelEvento.map(t => t.id));
        const limitePorTipo = Object.fromEntries(tiposDelEvento.map(t => [t.id, t.limite != null ? parseInt(t.limite, 10) : null]));

        for (const eg of entradas_generales) {
          const tipoId = parseInt(eg.tipo_precio_id, 10);
          const cant = parseInt(eg.cantidad, 10) || 0;
          if (!tipoId || cant < 1) continue;
          if (!idsValidos.has(tipoId)) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
              success: false,
              message: `Tipo de precio ${tipoId} no válido para este evento`
            });
          }
          const limiteTipo = limitePorTipo[tipoId];
          if (limiteTipo != null) {
            const [egVendidas] = await connection.execute(
              `SELECT COUNT(*) AS total FROM compras_entradas_generales eg
               INNER JOIN compras c ON eg.compra_id = c.id
               WHERE eg.tipo_precio_id = ? AND c.evento_id = ? AND c.estado IN ('PAGO_REALIZADO','ENTRADA_USADA')`,
              [tipoId, evento_id]
            );
            const [dgReservadas] = await connection.execute(
              `SELECT COALESCE(SUM(cdg.cantidad), 0) AS total FROM compras_detalle_general cdg
               INNER JOIN compras c ON cdg.compra_id = c.id
               WHERE cdg.tipo_precio_id = ? AND c.evento_id = ? AND c.estado = 'PAGO_PENDIENTE' AND c.id != ?`,
              [tipoId, evento_id, compraId]
            );
            const yaVendidas = parseInt(egVendidas[0]?.total || 0, 10) + parseInt(dgReservadas[0]?.total || 0, 10);
            if (yaVendidas + cant > limiteTipo) {
              const [tipoNombre] = await connection.execute('SELECT nombre FROM tipos_precio_evento WHERE id = ?', [tipoId]);
              const nombreTipo = tipoNombre[0]?.nombre || 'Este tipo';
              await connection.rollback();
              connection.release();
              return res.status(409).json({
                success: false,
                message: `${nombreTipo}: no hay suficientes entradas. Disponibles: ${Math.max(0, limiteTipo - yaVendidas)}`
              });
            }
          }
          await connection.execute(
            `INSERT INTO compras_detalle_general (compra_id, tipo_precio_id, cantidad) VALUES (?, ?, ?)`,
            [compraId, tipoId, cant]
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

      // Obtener áreas personas (zonas generales)
      let areasPersonasCompra = [];
      try {
        const [apRows] = await connection.execute(
          `SELECT cap.*, ar.nombre as area_nombre
           FROM compras_areas_personas cap
           INNER JOIN areas_layout ar ON cap.area_id = ar.id
           WHERE cap.compra_id = ?`,
          [compraId]
        );
        areasPersonasCompra = apRows;
      } catch (_) {}

      connection.release();

      res.json({
        success: true,
        message: 'Compra registrada exitosamente',
        data: {
          ...compra,
          asientos: asientosCompra,
          mesas: mesasCompra,
          areas_personas: areasPersonasCompra
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

    // Obtener entradas generales (para eventos generales o zonas personas)
    const [entradasGenerales] = await pool.execute(
      `SELECT 
        eg.id,
        eg.compra_id,
        eg.area_id,
        eg.tipo_precio_id,
        eg.codigo_escaneo,
        eg.escaneado,
        eg.fecha_escaneo,
        eg.usuario_escaneo_id,
        ar.nombre as area_nombre,
        tp.nombre as tipo_precio_nombre
       FROM compras_entradas_generales eg
       LEFT JOIN areas_layout ar ON eg.area_id = ar.id
       LEFT JOIN tipos_precio_evento tp ON eg.tipo_precio_id = tp.id
       WHERE eg.compra_id = ?
       ORDER BY eg.id ASC`,
      [compra.id]
    );

    // Obtener áreas personas (zonas generales - antes de confirmar pago)
    let areasPersonas = [];
    try {
      const [apRows] = await pool.execute(
        `SELECT cap.*, ar.nombre as area_nombre
         FROM compras_areas_personas cap
         INNER JOIN areas_layout ar ON cap.area_id = ar.id
         WHERE cap.compra_id = ?`,
        [compra.id]
      );
      areasPersonas = apRows;
    } catch (_) {}

    // Para compras PENDIENTES con evento general: el detalle está en compras_detalle_general (tipo + cantidad)
    let detalleGeneral = [];
    try {
      const [dgRows] = await pool.execute(
        `SELECT cdg.id, cdg.tipo_precio_id, cdg.cantidad, tp.nombre as tipo_precio_nombre, tp.precio
         FROM compras_detalle_general cdg
         LEFT JOIN tipos_precio_evento tp ON cdg.tipo_precio_id = tp.id
         WHERE cdg.compra_id = ?
         ORDER BY cdg.id`,
        [compra.id]
      );
      detalleGeneral = dgRows;
    } catch (_) {}

    res.json({
      success: true,
      data: {
        ...compra,
        asientos,
        mesas,
        entradas_generales: entradasGenerales,
        detalle_general: detalleGeneral,
        areas_personas: areasPersonas
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
              e.titulo as evento_titulo,
              ar.nombre as area_nombre
             FROM compras_entradas_generales eg
             INNER JOIN compras c ON eg.compra_id = c.id
             INNER JOIN eventos e ON c.evento_id = e.id
             LEFT JOIN areas_layout ar ON eg.area_id = ar.id
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
            compra_entrada_general_id: entradaGeneral.id,
            area_nombre: entradaGeneral.area_nombre || null
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

    let datosNotificacion = null; // Declarar variable fuera de los ifs

    try {
      if (tipo === 'ASIENTO' && compra_asiento_id) {
        // Verificar que existe y no está escaneada, obtener detalles del asiento
        const [asientos] = await connection.execute(
          `SELECT 
            ca.*,
            a.numero_asiento,
            a.mesa_id,
            m.numero_mesa,
            m.capacidad_sillas,
            tp.nombre as tipo_precio_nombre
           FROM compras_asientos ca
           INNER JOIN asientos a ON ca.asiento_id = a.id
           LEFT JOIN mesas m ON a.mesa_id = m.id
           LEFT JOIN tipos_precio_evento tp ON a.tipo_precio_id = tp.id
           WHERE ca.id = ? AND ca.codigo_escaneo = ? AND ca.estado = 'CONFIRMADO'`,
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

        // Obtener info del evento y datos de compra para notificación
        const [compraInfo] = await connection.execute(
          `SELECT c.evento_id, c.cliente_telefono, c.cliente_nombre, e.titulo as evento_titulo 
           FROM compras c 
           INNER JOIN eventos e ON c.evento_id = e.id 
           WHERE c.id = ?`,
          [asiento.compra_id]
        );

        if (!compraInfo || compraInfo.length === 0) {
          await connection.rollback();
          connection.release();
          return res.status(404).json({
            success: false,
            message: 'Información de compra no encontrada'
          });
        }

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

        // Preparar datos para notificación con detalles del asiento
        let detalleAsiento = `Asiento S${asiento.numero_asiento}`;
        if (asiento.mesa_id && asiento.numero_mesa) {
          detalleAsiento = `Silla S${asiento.numero_asiento} de Mesa M${asiento.numero_mesa}`;
        }

        datosNotificacion = {
          telefono: compraInfo[0]?.cliente_telefono,
          nombre: compraInfo[0]?.cliente_nombre,
          evento: compraInfo[0]?.evento_titulo,
          codigo: codigo,
          tipo: 'Asiento',
          detalle: detalleAsiento,
          numero_asiento: asiento.numero_asiento,
          numero_mesa: asiento.numero_mesa || null,
          compra_id: asiento.compra_id
        };

      } else if (tipo === 'MESA' && compra_mesa_id) {
        // Verificar que existe y no está escaneada, obtener detalles de la mesa
        const [mesas] = await connection.execute(
          `SELECT 
            cm.*,
            m.numero_mesa,
            m.capacidad_sillas
           FROM compras_mesas cm
           INNER JOIN mesas m ON cm.mesa_id = m.id
           WHERE cm.id = ? AND cm.codigo_escaneo = ? AND cm.estado = 'CONFIRMADO'`,
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

        // Obtener info del evento y datos de compra para notificación
        const [compraInfo] = await connection.execute(
          `SELECT c.evento_id, c.cliente_telefono, c.cliente_nombre, e.titulo as evento_titulo 
           FROM compras c 
           INNER JOIN eventos e ON c.evento_id = e.id 
           WHERE c.id = ?`,
          [mesa.compra_id]
        );

        if (!compraInfo || compraInfo.length === 0) {
          await connection.rollback();
          connection.release();
          return res.status(404).json({
            success: false,
            message: 'Información de compra no encontrada'
          });
        }

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

        // Preparar datos para notificación con detalles de la mesa
        const detalleMesa = `Mesa M${mesa.numero_mesa} (${mesa.capacidad_sillas || mesa.cantidad_sillas || 0} silla${(mesa.capacidad_sillas || mesa.cantidad_sillas || 0) > 1 ? 's' : ''})`;

        datosNotificacion = {
          telefono: compraInfo[0]?.cliente_telefono,
          nombre: compraInfo[0]?.cliente_nombre,
          evento: compraInfo[0]?.evento_titulo,
          codigo: codigo,
          tipo: 'Mesa',
          detalle: detalleMesa,
          numero_mesa: mesa.numero_mesa,
          cantidad_sillas: mesa.capacidad_sillas || mesa.cantidad_sillas || 0,
          compra_id: mesa.compra_id
        };

      } else if (tipo === 'GENERAL') {
        console.log('🔍 Buscando entrada GENERAL:', { codigo, compra_entrada_general_id });
        // Buscar entrada general por ID (si viene) o por código
        let entradasGenerales;
        try {
          if (compra_entrada_general_id) {
            [entradasGenerales] = await connection.execute(
              `SELECT eg.*, c.estado as compra_estado, ar.nombre as area_nombre
               FROM compras_entradas_generales eg
               INNER JOIN compras c ON eg.compra_id = c.id
               LEFT JOIN areas_layout ar ON eg.area_id = ar.id
               WHERE eg.id = ? AND eg.codigo_escaneo = ? AND c.estado = 'PAGO_REALIZADO'`,
              [compra_entrada_general_id, codigo]
            );
          } else {
            [entradasGenerales] = await connection.execute(
              `SELECT eg.*, c.estado as compra_estado, ar.nombre as area_nombre
               FROM compras_entradas_generales eg
               INNER JOIN compras c ON eg.compra_id = c.id
               LEFT JOIN areas_layout ar ON eg.area_id = ar.id
               WHERE eg.codigo_escaneo = ? AND c.estado = 'PAGO_REALIZADO'`,
              [codigo]
            );
          }
          console.log('✅ Entradas encontradas:', entradasGenerales.length);
        } catch (dbError) {
          console.error('❌ Error en consulta de entradas generales:', dbError);
          await connection.rollback();
          connection.release();
          return res.status(500).json({
            success: false,
            message: 'Error al buscar entrada general',
            error: dbError.message
          });
        }

        if (entradasGenerales.length === 0) {
          await connection.rollback();
          connection.release();
          return res.status(404).json({
            success: false,
            message: 'Entrada general no encontrada o no confirmada'
          });
        }

        const entradaGeneral = entradasGenerales[0];

        if (entradaGeneral.escaneado) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({
            success: false,
            message: 'Esta entrada ya fue escaneada anteriormente'
          });
        }

        // Obtener info del evento y compra
        const [compraInfo] = await connection.execute(
          `SELECT c.evento_id, c.cliente_telefono, c.cliente_nombre, e.titulo as evento_titulo 
           FROM compras c 
           INNER JOIN eventos e ON c.evento_id = e.id 
           WHERE c.id = ?`,
          [entradaGeneral.compra_id]
        );

        if (!compraInfo || compraInfo.length === 0) {
          await connection.rollback();
          connection.release();
          return res.status(404).json({
            success: false,
            message: 'Información de compra no encontrada'
          });
        }

        // Marcar como escaneada
        await connection.execute(
          `UPDATE compras_entradas_generales 
           SET escaneado = TRUE, 
               fecha_escaneo = NOW(), 
               usuario_escaneo_id = ?
           WHERE id = ?`,
          [usuarioId, entradaGeneral.id]
        );

        // Registrar en tabla de auditoría
        await connection.execute(
          `INSERT INTO escaneos_entradas 
           (tipo, compra_entrada_general_id, compra_id, evento_id, usuario_escaneo_id, datos_qr)
           VALUES (?, ?, ?, ?, ?, ?)`,
          ['GENERAL', entradaGeneral.id, entradaGeneral.compra_id, compraInfo[0].evento_id, usuarioId, JSON.stringify({ codigo_escaneo: codigo })]
        );

        // Preparar datos para notificación
        const detalleGeneral = entradaGeneral.area_nombre
          ? `Zona general: ${entradaGeneral.area_nombre}`
          : 'Entrada General';
        datosNotificacion = {
          telefono: compraInfo[0]?.cliente_telefono,
          nombre: compraInfo[0]?.cliente_nombre,
          evento: compraInfo[0]?.evento_titulo,
          codigo: codigo,
          tipo: 'General',
          detalle: detalleGeneral,
          compra_id: entradaGeneral.compra_id
        };

      } else {
        await connection.rollback();
        connection.release();
        console.error('❌ Tipo de entrada no válido en tickearEntrada:', {
          tipo,
          compra_asiento_id,
          compra_mesa_id,
          compra_entrada_general_id,
          codigo
        });
        return res.status(400).json({
          success: false,
          message: `Tipo de entrada o ID no válido. Tipo recibido: "${tipo}". Se requiere: ASIENTO+compra_asiento_id, MESA+compra_mesa_id, o GENERAL+compra_entrada_general_id`
        });
      }

      await connection.commit();
      connection.release();

      // Enviar notificación por WhatsApp (si hay teléfono y datos)
      if (datosNotificacion && datosNotificacion.telefono) {
        try {
          // Formatear fecha y hora en zona horaria de Bolivia (America/La_Paz, UTC-4)
          const fechaHora = new Date().toLocaleString('es-ES', {
            timeZone: 'America/La_Paz',
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });

          // Construir mensaje con detalles específicos según el tipo
          let mensajeNotificacion = `🔔 *NOTIFICACIÓN DE ESCANEO*\n\n` +
            `Hola *${datosNotificacion.nombre || 'Cliente'}*,\n\n` +
            `Tu entrada ha sido escaneada exitosamente:\n\n` +
            `📅 *Evento:* ${datosNotificacion.evento || 'Evento'}\n` +
            `🎫 *Entrada:* ${datosNotificacion.detalle || `Entrada ${datosNotificacion.tipo}`}\n` +
            `🔑 *Código:* ${datosNotificacion.codigo}\n` +
            `🕒 *Fecha y hora:* ${fechaHora}\n\n` +
            `¡Gracias por asistir al evento! 🎉`;

          const resultadoNotificacion = await enviarMensajePorWhatsAppWeb(
            datosNotificacion.telefono,
            mensajeNotificacion
          );

          if (resultadoNotificacion.success) {
            console.log(`✅ Notificación enviada a ${datosNotificacion.telefono}`);
          } else {
            console.log(`⚠️ No se pudo enviar notificación: ${resultadoNotificacion.message}`);
          }
        } catch (error) {
          console.error('❌ Error al enviar notificación por WhatsApp:', error);
          // No fallar el proceso si falla la notificación
        }
      }

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
        eg.area_id,
        eg.fecha_escaneo,
        eg.usuario_escaneo_id,
        c.id as compra_id,
        c.codigo_unico,
        c.cliente_nombre,
        c.evento_id,
        e.titulo as evento_titulo,
        u.nombre_completo as usuario_escaneo,
        ar.nombre as area_nombre
      FROM compras_entradas_generales eg
      INNER JOIN compras c ON eg.compra_id = c.id
      INNER JOIN eventos e ON c.evento_id = e.id
      LEFT JOIN usuarios u ON eg.usuario_escaneo_id = u.id
      LEFT JOIN areas_layout ar ON eg.area_id = ar.id
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
                total_faltantes: totalConfirmadasGenerales - totalEscaneadasGenerales,
                total_confirmadas: totalConfirmadasGenerales,
                total_escaneadas: totalEscaneadasGenerales
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

    // Zonas generales (personas de pie) para evento especial
    let zonasGenerales = null;
    if (evento_id && tipoEvento === 'especial') {
      try {
        const [statsZonas] = await pool.execute(
          `SELECT COALESCE(SUM(cap.cantidad), 0) as total_vendidas
           FROM compras_areas_personas cap
           INNER JOIN compras c ON cap.compra_id = c.id
           WHERE c.evento_id = ? AND cap.estado = 'CONFIRMADO'`,
          [evento_id]
        );
        const [totalZonas] = await pool.execute(
          `SELECT COALESCE(SUM(ar.capacidad_personas), 0) as total_capacidad
           FROM areas_layout ar
           WHERE ar.evento_id = ? AND ar.tipo_area = 'PERSONAS'`,
          [evento_id]
        );
        const [escaneadasZonas] = await pool.execute(
          `SELECT COUNT(*) as total
           FROM compras_entradas_generales eg
           INNER JOIN compras c ON eg.compra_id = c.id
           WHERE c.evento_id = ? AND eg.area_id IS NOT NULL AND eg.escaneado = TRUE`,
          [evento_id]
        );
        const vendidasZonas = parseInt(statsZonas[0]?.total_vendidas || 0);
        const capacidadZonas = parseInt(totalZonas[0]?.total_capacidad || 0);
        const escaneadasZonasCount = parseInt(escaneadasZonas[0]?.total || 0);
        zonasGenerales = {
          limite_total: capacidadZonas || null,
          vendidas: vendidasZonas,
          disponibles: capacidadZonas > 0 ? Math.max(0, capacidadZonas - vendidasZonas) : null,
          escaneadas: escaneadasZonasCount,
          total_faltantes: vendidasZonas - escaneadasZonasCount
        };
      } catch (_) {}
    }

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
          },
          zonas_generales: zonasGenerales
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

// Obtener todas las compras (admin: todas; vendedor: solo las suyas por usuario_id)
export const obtenerCompras = async (req, res) => {
  try {
    let { estado, evento_id } = req.query;
    const rol = (req.user?.rol || '').toLowerCase();

    // "activo" o "proximo" = solo el próximo evento (activo y hora_inicio >= NOW())
    if (evento_id === 'activo' || evento_id === 'proximo') {
      const [proximos] = await pool.execute(
        "SELECT id FROM eventos WHERE estado = 'activo' AND hora_inicio >= NOW() ORDER BY hora_inicio ASC LIMIT 1"
      );
      evento_id = proximos.length ? String(proximos[0].id) : null;
      if (!evento_id) {
        return res.json({ success: true, data: [] });
      }
    }

    let query = `
      SELECT c.*, e.titulo as evento_titulo, e.hora_inicio as evento_fecha
      FROM compras c
      INNER JOIN eventos e ON c.evento_id = e.id
      WHERE 1=1
    `;
    const params = [];

    if ((rol === 'vendedor' || rol === 'vendedor_externo') && req.user?.id) {
      query += ' AND c.usuario_id = ?';
      params.push(req.user.id);
    }

    if (estado) {
      query += ' AND c.estado = ?';
      params.push(estado);
    }

    if (evento_id) {
      query += ' AND c.evento_id = ?';
      params.push(evento_id);
    }

    query += ' ORDER BY c.created_at DESC';

    let compras;
    try {
      const [rows] = await pool.execute(query, params);
      compras = rows;
    } catch (err) {
      // Si la tabla no tiene usuario_id, el vendedor ve lista vacía hasta ejecutar la migración
      if (err.code === 'ER_BAD_FIELD_ERROR' && (rol === 'vendedor' || rol === 'vendedor_externo') && (err.message || '').toLowerCase().includes('usuario_id')) {
        console.warn('Tabla compras sin columna usuario_id. Ejecuta backend/scripts/agregar_usuario_id_compras.sql para que "Mis ventas" filtre por vendedor.');
        return res.json({ success: true, data: [] });
      }
      throw err;
    }

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

// Resumen de "mis ventas" (vendedor / vendedor_externo)
export const obtenerResumenMisVentas = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
    }

    const usuarioId = Number(req.user.id);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return res.status(400).json({ success: false, message: 'Usuario inválido' });
    }

    const [resumenRows] = await pool.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN estado IN ('PAGO_REALIZADO','ENTRADA_USADA') THEN 1 ELSE 0 END), 0) AS ventas_confirmadas,
         COALESCE(SUM(CASE WHEN estado IN ('PAGO_REALIZADO','ENTRADA_USADA') THEN total ELSE 0 END), 0) AS ingresos_confirmados,
         COALESCE(SUM(CASE WHEN estado IN ('PAGO_REALIZADO','ENTRADA_USADA') THEN cantidad ELSE 0 END), 0) AS entradas_confirmadas,
         COALESCE(SUM(CASE WHEN estado = 'PAGO_PENDIENTE' THEN 1 ELSE 0 END), 0) AS ventas_pendientes,
         COALESCE(SUM(CASE WHEN estado = 'PAGO_PENDIENTE' THEN total ELSE 0 END), 0) AS monto_pendiente,
         COALESCE(SUM(CASE WHEN estado = 'PAGO_PENDIENTE' THEN cantidad ELSE 0 END), 0) AS entradas_pendientes,
         COALESCE(SUM(CASE WHEN estado = 'CANCELADO' THEN 1 ELSE 0 END), 0) AS ventas_canceladas,
         COALESCE(COUNT(*), 0) AS ventas_totales
       FROM compras
       WHERE usuario_id = ?`,
      [usuarioId]
    );

    const resumen = resumenRows?.[0] || {};

    const [porEventoRows] = await pool.execute(
      `SELECT
         c.evento_id,
         COALESCE(e.titulo, CONCAT('Evento #', c.evento_id)) AS evento_titulo,
         MIN(e.hora_inicio) AS evento_fecha,
         COALESCE(SUM(CASE WHEN c.estado IN ('PAGO_REALIZADO','ENTRADA_USADA') THEN 1 ELSE 0 END), 0) AS ventas_confirmadas,
         COALESCE(SUM(CASE WHEN c.estado IN ('PAGO_REALIZADO','ENTRADA_USADA') THEN c.total ELSE 0 END), 0) AS ingresos_confirmados,
         COALESCE(SUM(CASE WHEN c.estado IN ('PAGO_REALIZADO','ENTRADA_USADA') THEN c.cantidad ELSE 0 END), 0) AS entradas_confirmadas,
         COALESCE(SUM(CASE WHEN c.estado = 'PAGO_PENDIENTE' THEN 1 ELSE 0 END), 0) AS ventas_pendientes,
         COALESCE(SUM(CASE WHEN c.estado = 'PAGO_PENDIENTE' THEN c.total ELSE 0 END), 0) AS monto_pendiente,
         COALESCE(SUM(CASE WHEN c.estado = 'CANCELADO' THEN 1 ELSE 0 END), 0) AS ventas_canceladas,
         COALESCE(COUNT(*), 0) AS ventas_totales
       FROM compras c
       LEFT JOIN eventos e ON c.evento_id = e.id
       WHERE c.usuario_id = ?
       GROUP BY c.evento_id, e.titulo
       ORDER BY ingresos_confirmados DESC, ventas_confirmadas DESC`,
      [usuarioId]
    );

    res.json({
      success: true,
      data: {
        resumen: {
          ventas_totales: Number(resumen.ventas_totales || 0),
          ventas_confirmadas: Number(resumen.ventas_confirmadas || 0),
          ventas_pendientes: Number(resumen.ventas_pendientes || 0),
          ventas_canceladas: Number(resumen.ventas_canceladas || 0),
          ingresos_confirmados: Number(resumen.ingresos_confirmados || 0),
          monto_pendiente: Number(resumen.monto_pendiente || 0),
          entradas_confirmadas: Number(resumen.entradas_confirmadas || 0),
          entradas_pendientes: Number(resumen.entradas_pendientes || 0),
          ultima_actualizacion: new Date().toISOString()
        },
        por_evento: porEventoRows || []
      }
    });
  } catch (error) {
    console.error('Error al obtener resumen de mis ventas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el resumen de ventas',
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
    const { tipo_pago, tipo_venta, precio_original } = req.body || {};

    // Validar tipo de pago requerido
    if (!tipo_pago || !['QR', 'EFECTIVO'].includes(tipo_pago.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: 'Debe indicar el tipo de pago: QR o EFECTIVO'
      });
    }

    const tipoPagoValido = tipo_pago.toUpperCase();
    const tipoVentaValido = ['NORMAL', 'REGALO_ADMIN', 'OFERTA_ADMIN'].includes(tipo_venta) ? tipo_venta : null;
    const precioOriginalValido = precio_original != null ? parseFloat(precio_original) : null;

    // Verificar que la compra existe
    const [compras] = await pool.execute('SELECT * FROM compras WHERE id = ?', [id]);
    if (compras.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Compra no encontrada'
      });
    }

    const compra = compras[0];

    const rolUser = (req.user?.rol || '').toLowerCase();
    const esVendedor = rolUser === 'vendedor' || rolUser === 'vendedor_externo';
    const puedeOpcionesVentaAdmin = rolUser === 'admin' || rolUser === 'vendedor';

    if ((tipoVentaValido === 'REGALO_ADMIN' || tipoVentaValido === 'OFERTA_ADMIN') && !puedeOpcionesVentaAdmin) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para aplicar "Entrada gratis" o "Precio especial"'
      });
    }

    // Vendedor: solo bloquear si la compra tiene otro dueño asignado (usuario_id no nulo y distinto del vendedor)
    if (esVendedor && compra.usuario_id != null && Number(compra.usuario_id) !== Number(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Solo puedes confirmar pagos de tus propias ventas'
      });
    }

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
      // Actualizar estado de la compra con tipo de pago (y opcionalmente tipo_venta, precio_original)
      const updates = ['estado = "PAGO_REALIZADO"', 'fecha_pago = NOW()', 'fecha_confirmacion = NOW()', 'tipo_pago = ?'];
      const params = [tipoPagoValido];
      if (tipoVentaValido === 'REGALO_ADMIN') {
        updates.push('tipo_venta = ?', 'precio_original = NULL', 'total = 0');
        params.push('REGALO_ADMIN');
      } else if (tipoVentaValido === 'OFERTA_ADMIN') {
        updates.push('tipo_venta = ?');
        params.push('OFERTA_ADMIN');
        if (precioOriginalValido != null && !isNaN(precioOriginalValido)) {
          updates.push('precio_original = ?');
          params.push(precioOriginalValido);
        }
      }
      params.push(id);
      await connection.execute(
        `UPDATE compras SET ${updates.join(', ')} WHERE id = ?`,
        params
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

      // Si es evento general (no hay asientos ni mesas), generar entradas generales
      // Puede ser: (a) evento general simple, o (b) zonas personas (compras_areas_personas)
      if (asientosCompra.length === 0 && mesasCompra.length === 0) {
        const [areasPersonasCompra] = await connection.execute(
          `SELECT cap.*, ar.nombre as area_nombre
           FROM compras_areas_personas cap
           INNER JOIN areas_layout ar ON cap.area_id = ar.id
           WHERE cap.compra_id = ?`,
          [id]
        );

        if (areasPersonasCompra.length > 0) {
          // Crear una entrada general por cada persona en cada área
          for (const ap of areasPersonasCompra) {
            const cant = parseInt(ap.cantidad, 10) || 1;
            const areaId = ap.area_id;
            for (let i = 0; i < cant; i++) {
              const codigoEscaneo = await generarCodigoEscaneo(connection);
              await connection.execute(
                `INSERT INTO compras_entradas_generales (compra_id, area_id, codigo_escaneo)
                 VALUES (?, ?, ?)`,
                [id, areaId, codigoEscaneo]
              );
            }
            await connection.execute(
              `UPDATE compras_areas_personas SET estado = 'CONFIRMADO' WHERE id = ?`,
              [ap.id]
            );
          }
        } else {
          // Evento general: compras_detalle_general (múltiples tipos) o cantidad simple
          const [detalleGeneral] = await connection.execute(
            'SELECT tipo_precio_id, cantidad FROM compras_detalle_general WHERE compra_id = ?',
            [id]
          );
          if (detalleGeneral.length > 0) {
            for (const d of detalleGeneral) {
              const cant = parseInt(d.cantidad, 10) || 1;
              const tipoPrecioId = d.tipo_precio_id;
              for (let i = 0; i < cant; i++) {
                const codigoEscaneo = await generarCodigoEscaneo(connection);
                await connection.execute(
                  `INSERT INTO compras_entradas_generales (compra_id, tipo_precio_id, codigo_escaneo)
                   VALUES (?, ?, ?)`,
                  [id, tipoPrecioId, codigoEscaneo]
                );
              }
            }
          } else {
            const cantidad = compra.cantidad || 1;
            for (let i = 0; i < cantidad; i++) {
              const codigoEscaneo = await generarCodigoEscaneo(connection);
              await connection.execute(
                `INSERT INTO compras_entradas_generales (compra_id, codigo_escaneo)
                 VALUES (?, ?)`,
                [id, codigoEscaneo]
              );
            }
          }
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

      // Obtener entradas generales si no hay asientos ni mesas (incluye zonas personas)
      if (asientosBoleto.length === 0 && mesasBoleto.length === 0) {
        try {
          const [entradas] = await pool.execute(
            `SELECT 
              eg.id,
              eg.compra_id,
              eg.area_id,
              eg.tipo_precio_id,
              eg.codigo_escaneo,
              eg.escaneado,
              eg.fecha_escaneo,
              eg.usuario_escaneo_id,
              ar.nombre as area_nombre,
              tp.nombre as tipo_precio_nombre,
              tp.precio as tipo_precio_precio
             FROM compras_entradas_generales eg
             LEFT JOIN areas_layout ar ON eg.area_id = ar.id
             LEFT JOIN tipos_precio_evento tp ON eg.tipo_precio_id = tp.id
             WHERE eg.compra_id = ?
             ORDER BY eg.id ASC`,
            [id]
          );
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

    const rolCancel = (req.user?.rol || '').toLowerCase();
    if ((rolCancel === 'vendedor' || rolCancel === 'vendedor_externo') && compra.usuario_id != null && Number(compra.usuario_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Solo puedes cancelar tus propias ventas' });
    }

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

      // Actualizar estado de áreas personas a CANCELADO
      await connection.execute(
        `UPDATE compras_areas_personas 
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

    const rolPdf = (req.user?.rol || '').toLowerCase();
    if ((rolPdf === 'vendedor' || rolPdf === 'vendedor_externo') && (compra.usuario_id == null || compra.usuario_id !== req.user.id)) {
      return res.status(403).json({ success: false, message: 'Solo puedes acceder a tus propias ventas' });
    }

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

    // Obtener entradas generales (para eventos sin asientos/mesas, incluye zonas personas)
    let entradasGenerales = [];
    if (asientos.length === 0 && mesas.length === 0) {
      const [entradas] = await pool.execute(
        `SELECT eg.id, eg.compra_id, eg.area_id, eg.tipo_precio_id, eg.codigo_escaneo, eg.escaneado, eg.fecha_escaneo, eg.usuario_escaneo_id,
                ar.nombre as area_nombre,
                tp.nombre as tipo_precio_nombre,
                tp.precio as tipo_precio_precio
         FROM compras_entradas_generales eg
         LEFT JOIN areas_layout ar ON eg.area_id = ar.id
         LEFT JOIN tipos_precio_evento tp ON eg.tipo_precio_id = tp.id
         WHERE eg.compra_id = ?
         ORDER BY eg.id ASC`,
        [id]
      );
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

    const rolWa = (req.user?.rol || '').toLowerCase();
    if ((rolWa === 'vendedor' || rolWa === 'vendedor_externo') && compra.usuario_id != null && Number(compra.usuario_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Solo puedes enviar boletos de tus propias ventas' });
    }

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

    // Obtener entradas generales (para eventos sin asientos/mesas, incluye zonas personas)
    let entradasGenerales = [];
    if (asientos.length === 0 && mesas.length === 0) {
      const [entradas] = await pool.execute(
        `SELECT eg.id, eg.compra_id, eg.area_id, eg.tipo_precio_id, eg.codigo_escaneo, eg.escaneado, eg.fecha_escaneo, eg.usuario_escaneo_id,
                ar.nombre as area_nombre,
                tp.nombre as tipo_precio_nombre,
                tp.precio as tipo_precio_precio
         FROM compras_entradas_generales eg
         LEFT JOIN areas_layout ar ON eg.area_id = ar.id
         LEFT JOIN tipos_precio_evento tp ON eg.tipo_precio_id = tp.id
         WHERE eg.compra_id = ?
         ORDER BY eg.id ASC`,
        [id]
      );
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

    // Crear mensaje de texto (se enviará primero para verificar el número)
    const mensajeTexto = `✅✅✅ *GRACIAS POR TU COMPRA* ✅✅✅\n\n` +
      `*TU COMPRA SE REALIZÓ CORRECTAMENTE*\n\n` +
      `Hola *${compra.cliente_nombre}*,\n\n` +
      `📅 *Evento:* ${compra.evento_titulo}\n` +
      `📆 *Fecha:* ${fechaEvento}\n` +
      `🎟️ *Cantidad:* ${compra.cantidad} entrada(s)\n` +
      `💰 *Total:* $${parseFloat(compra.total).toFixed(2)} BOB\n` +
      `🔑 *Código:* ${compra.codigo_unico}\n\n` +
      `📎 *Estos son sus boletos:*\n\n` +
      `¡Esperamos verte en el evento! 🎉`;
    
    // Mensaje más corto para el caption del PDF
    const mensajeCaption = `🎟️ *Boletos para: ${compra.evento_titulo}*\n` +
      `📆 ${fechaEvento}\n` +
      `🔑 Código: ${compra.codigo_unico}`;

    // Enviar el PDF por WhatsApp Web (el servicio enviará primero el mensaje de texto)
    const resultado = await enviarPDFWhatsAppWebService(
      compra.cliente_telefono,
      pdfPathCompleto,
      mensajeTexto,  // Mensaje completo para el texto inicial
      mensajeCaption // Caption más corto para el PDF
    );

    if (resultado.success) {
      res.json({
        success: true,
        message: 'PDF enviado exitosamente por WhatsApp Web',
        telefono: compra.cliente_telefono
      });
    } else {
      console.error('❌ Error al enviar PDF (desde servicio):', resultado.message, resultado.error);
      res.status(500).json({
        success: false,
        message: resultado.message || 'Error al enviar el PDF',
        error: resultado.error
      });
    }

  } catch (error) {
    console.error('❌ Error al enviar PDF por WhatsApp Web:', error);
    console.error('❌ Stack trace completo:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al enviar el PDF por WhatsApp Web',
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
      // Eliminar en orden para evitar restricciones de FK (compatible con servidores con o sin CASCADE)
      await connection.execute(
        `DELETE FROM compras_asientos WHERE compra_id = ?`,
        [id]
      );
      await connection.execute(
        `DELETE FROM compras_mesas WHERE compra_id = ?`,
        [id]
      );
      await connection.execute(
        `DELETE FROM compras_areas_personas WHERE compra_id = ?`,
        [id]
      );
      // Tablas que pueden existir según versión del esquema
      try {
        await connection.execute(
          `DELETE FROM compras_entradas_generales WHERE compra_id = ?`,
          [id]
        );
      } catch (e) {
        if (e.code !== 'ER_NO_SUCH_TABLE') console.warn('compras_entradas_generales:', e.message);
      }
      try {
        await connection.execute(
          `DELETE FROM escaneos_entradas WHERE compra_id = ?`,
          [id]
        );
      } catch (e) {
        if (e.code !== 'ER_NO_SUCH_TABLE') console.warn('escaneos_entradas:', e.message);
      }
      // Cupones: tabla puede no existir en algunos servidores
      if (compra.cupon_id) {
        try {
          await connection.execute(
            `DELETE FROM cupones_usados WHERE compra_id = ?`,
            [id]
          );
          await connection.execute(
            `UPDATE cupones SET usos_actuales = GREATEST(0, usos_actuales - 1) WHERE id = ?`,
            [compra.cupon_id]
          );
        } catch (e) {
          if (e.code !== 'ER_NO_SUCH_TABLE' && e.code !== 'ER_BAD_FIELD_ERROR') throw e;
          console.warn('Cupones al eliminar compra:', e.message);
        }
      }

      // Eliminar la compra
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
    const msg = error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_NO_REFERENCED_ROW_2'
      ? 'No se puede eliminar: hay datos vinculados. Contacte al administrador.'
      : (error.message || 'Error al eliminar la compra');
    res.status(500).json({
      success: false,
      message: msg,
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

    const rolEmail = (req.user?.rol || '').toLowerCase();
    if ((rolEmail === 'vendedor' || rolEmail === 'vendedor_externo') && compra.usuario_id != null && Number(compra.usuario_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Solo puedes enviar boletos de tus propias ventas' });
    }

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

    // Obtener entradas generales (para eventos sin asientos/mesas, incluye zonas personas)
    let entradasGenerales = [];
    if (asientos.length === 0 && mesas.length === 0) {
      const [entradas] = await pool.execute(
        `SELECT eg.id, eg.compra_id, eg.area_id, eg.tipo_precio_id, eg.codigo_escaneo, eg.escaneado, eg.fecha_escaneo, eg.usuario_escaneo_id,
                ar.nombre as area_nombre,
                tp.nombre as tipo_precio_nombre,
                tp.precio as tipo_precio_precio
         FROM compras_entradas_generales eg
         LEFT JOIN areas_layout ar ON eg.area_id = ar.id
         LEFT JOIN tipos_precio_evento tp ON eg.tipo_precio_id = tp.id
         WHERE eg.compra_id = ?
         ORDER BY eg.id ASC`,
        [id]
      );
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

