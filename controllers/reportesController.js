import pool from '../config/db.js';
import { generarReporteExcel, generarReportePDF } from '../services/exportService.js';

const buildDetalleCompraEspecial = (asientos = [], mesas = [], totalEntradas = 0) => {
  const partes = [];

  if (mesas.length > 0) {
    const totalSillasMesas = mesas.reduce((acc, mesa) => acc + (mesa.cantidad_sillas || 0), 0);
    const mesasLista = mesas
      .map((mesa) => `M${mesa.numero_mesa || mesa.mesa_id || mesa.id || ''}`)
      .join(', ');
    partes.push(
      `${mesas.length > 1 ? 'Mesas' : 'Mesa'} ${mesasLista} (${totalSillasMesas} ${totalSillasMesas === 1 ? 'silla' : 'sillas'})`
    );
  }

  if (asientos.length > 0) {
    const asientosLista = asientos
      .map((asiento) => {
        const mesaLabel = asiento.numero_mesa || asiento.mesa_id ? `M${asiento.numero_mesa || asiento.mesa_id}-` : '';
        return `${mesaLabel}S${asiento.numero_asiento || asiento.asiento_id || asiento.id || ''}`;
      })
      .join(', ');
    partes.push(`Sillas: ${asientosLista}`);
  }

  if (partes.length === 0 && totalEntradas > 0) {
    partes.push(`${totalEntradas} entrada(s)`);
  }

  return partes.join(' | ');
};

export const obtenerEventosParaReportes = async (_req, res) => {
  try {
    const [eventos] = await pool.execute(`
      SELECT 
        id,
        titulo,
        hora_inicio,
        tipo_evento,
        limite_entradas,
        capacidad_maxima,
        CASE WHEN hora_inicio >= NOW() THEN 1 ELSE 0 END AS habilitado
      FROM eventos
      ORDER BY hora_inicio DESC
    `);

    res.json({
      success: true,
      data: eventos
    });
  } catch (error) {
    console.error('Error al obtener eventos para reportes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los eventos',
      error: error.message
    });
  }
};

export const obtenerReportePorEvento = async (req, res) => {
  try {
    const { id } = req.params;

    const [eventos] = await pool.execute(
      `
        SELECT 
          id,
          titulo,
          hora_inicio,
          tipo_evento,
          limite_entradas,
          capacidad_maxima,
          CASE WHEN hora_inicio >= NOW() THEN 1 ELSE 0 END AS habilitado
        FROM eventos
        WHERE id = ?
      `,
      [id]
    );

    if (eventos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    const evento = eventos[0];

    const [compras] = await pool.execute(
      `
        SELECT 
          c.id,
          c.codigo_unico,
          c.cliente_nombre,
          c.cliente_email,
          c.cliente_telefono,
          c.cantidad,
          c.total,
          c.estado,
          c.tipo_pago,
          c.fecha_compra,
          c.fecha_pago,
          c.fecha_confirmacion
        FROM compras c
        WHERE c.evento_id = ?
        ORDER BY c.fecha_compra DESC
      `,
      [id]
    );

    const compraIds = compras.map((c) => c.id);
    let asientos = [];
    let mesas = [];

    if (compraIds.length > 0) {
      [asientos] = await pool.query(
        `
          SELECT 
            ca.id,
            ca.compra_id,
            ca.estado,
            ca.precio,
            a.id AS asiento_id,
            a.numero_asiento,
            a.mesa_id,
            a.area_id,
            m.numero_mesa
          FROM compras_asientos ca
          INNER JOIN asientos a ON ca.asiento_id = a.id
          LEFT JOIN mesas m ON a.mesa_id = m.id
          WHERE ca.compra_id IN (?)
          ORDER BY m.numero_mesa, a.numero_asiento
        `,
        [compraIds]
      );

      [mesas] = await pool.query(
        `
          SELECT 
            cm.id,
            cm.compra_id,
            cm.estado,
            cm.cantidad_sillas,
            cm.precio_total,
            cm.mesa_id,
            m.numero_mesa
          FROM compras_mesas cm
          INNER JOIN mesas m ON cm.mesa_id = m.id
          WHERE cm.compra_id IN (?)
          ORDER BY m.numero_mesa
        `,
        [compraIds]
      );
    }

    const asientosPorCompra = asientos.reduce((acc, asiento) => {
      if (!acc[asiento.compra_id]) acc[asiento.compra_id] = [];
      acc[asiento.compra_id].push(asiento);
      return acc;
    }, {});

    const mesasPorCompra = mesas.reduce((acc, mesa) => {
      if (!acc[mesa.compra_id]) acc[mesa.compra_id] = [];
      acc[mesa.compra_id].push(mesa);
      return acc;
    }, {});

    const comprasConDetalle = compras.map((compra) => {
      const detalleAsientos = asientosPorCompra[compra.id] || [];
      const detalleMesas = mesasPorCompra[compra.id] || [];

      const totalEntradasEspecial =
        detalleAsientos.length +
        detalleMesas.reduce((acc, mesa) => acc + (mesa.cantidad_sillas || 0), 0);

      const totalEntradas =
        evento.tipo_evento === 'especial'
          ? totalEntradasEspecial || compra.cantidad
          : compra.cantidad;

      return {
        ...compra,
        asientos: detalleAsientos,
        mesas: detalleMesas,
        total_entradas: totalEntradas,
        detalle_compra:
          evento.tipo_evento === 'especial'
            ? buildDetalleCompraEspecial(detalleAsientos, detalleMesas, totalEntradas)
            : `${totalEntradas} entrada(s) general`
      };
    });

    const resumen = comprasConDetalle.reduce(
      (acc, compra) => {
        acc.total_compras += 1;
        const entradas = compra.total_entradas || 0;
        acc.entradas_totales += entradas;

        if (compra.estado === 'PAGO_REALIZADO' || compra.estado === 'ENTRADA_USADA') {
          acc.pagos_realizados += 1;
          acc.entradas_confirmadas += entradas;
          // Acumular por tipo de pago
          const totalCompra = parseFloat(compra.total || 0);
          if (compra.tipo_pago === 'QR') {
            acc.pagos_qr += 1;
            acc.total_qr += totalCompra;
          } else if (compra.tipo_pago === 'EFECTIVO') {
            acc.pagos_efectivo += 1;
            acc.total_efectivo += totalCompra;
          }
        } else if (compra.estado === 'PAGO_PENDIENTE') {
          acc.pagos_pendientes += 1;
          acc.entradas_pendientes += entradas;
        } else if (compra.estado === 'CANCELADO') {
          acc.canceladas += 1;
        }

        return acc;
      },
      {
        total_compras: 0,
        pagos_realizados: 0,
        pagos_pendientes: 0,
        canceladas: 0,
        entradas_totales: 0,
        entradas_confirmadas: 0,
        entradas_pendientes: 0,
        pagos_qr: 0,
        pagos_efectivo: 0,
        total_qr: 0,
        total_efectivo: 0
      }
    );

    res.json({
      success: true,
      data: {
        evento,
        resumen,
        compras: comprasConDetalle
      }
    });
  } catch (error) {
    console.error('Error al obtener reporte del evento:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el reporte del evento',
      error: error.message
    });
  }
};

// Exportar reporte a Excel o PDF
export const exportarReporte = async (req, res) => {
  try {
    const { evento_id } = req.params;
    const { formato } = req.query; // 'excel' o 'pdf'

    if (!evento_id) {
      return res.status(400).json({
        success: false,
        message: 'Evento ID es requerido'
      });
    }

    // Obtener datos del reporte
    const [eventos] = await pool.execute(
      `SELECT id, titulo, hora_inicio, tipo_evento, limite_entradas, capacidad_maxima
       FROM eventos WHERE id = ?`,
      [evento_id]
    );

    if (eventos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    const evento = eventos[0];

    // Obtener compras (incluye tipo_pago para reportes)
    const [compras] = await pool.execute(
      `SELECT c.id, c.codigo_unico, c.cliente_nombre, c.cliente_email, 
              c.cliente_telefono, c.cantidad, c.total, c.estado, c.tipo_pago,
              c.fecha_compra, c.fecha_pago, c.fecha_confirmacion
       FROM compras c
       WHERE c.evento_id = ?
       ORDER BY c.fecha_compra DESC`,
      [evento_id]
    );

    // Calcular resumen por tipo de pago para la exportación
    const resumenTipoPago = compras.reduce(
      (acc, c) => {
        if ((c.estado === 'PAGO_REALIZADO' || c.estado === 'ENTRADA_USADA') && c.tipo_pago) {
          const total = parseFloat(c.total || 0);
          if (c.tipo_pago === 'QR') {
            acc.pagos_qr += 1;
            acc.total_qr += total;
          } else if (c.tipo_pago === 'EFECTIVO') {
            acc.pagos_efectivo += 1;
            acc.total_efectivo += total;
          }
        }
        return acc;
      },
      { pagos_qr: 0, pagos_efectivo: 0, total_qr: 0, total_efectivo: 0 }
    );

    // Obtener estadísticas básicas
    let estadisticas = null;
    try {
      if (evento.tipo_evento === 'general') {
        const [statsGen] = await pool.execute(
          `SELECT 
            COUNT(*) as total_confirmadas,
            SUM(CASE WHEN eg.escaneado = TRUE THEN 1 ELSE 0 END) as total_escaneadas
           FROM compras_entradas_generales eg
           INNER JOIN compras c ON eg.compra_id = c.id
           WHERE c.evento_id = ? AND c.estado = 'PAGO_REALIZADO'`,
          [evento_id]
        );
        const [eventoInfo] = await pool.execute(
          'SELECT limite_entradas FROM eventos WHERE id = ?',
          [evento_id]
        );
        estadisticas = {
          tipo_evento: 'general',
          generales: {
            limite_total: eventoInfo[0]?.limite_entradas || null,
            vendidas: parseInt(statsGen[0]?.total_confirmadas || 0),
            disponibles: eventoInfo[0]?.limite_entradas ? Math.max(0, eventoInfo[0].limite_entradas - parseInt(statsGen[0]?.total_confirmadas || 0)) : null,
            escaneadas: parseInt(statsGen[0]?.total_escaneadas || 0),
            total_faltantes: parseInt(statsGen[0]?.total_confirmadas || 0) - parseInt(statsGen[0]?.total_escaneadas || 0)
          }
        };
      } else {
        // Evento especial
        const [statsAsientos] = await pool.execute(
          `SELECT COUNT(*) as total_confirmadas,
                  SUM(CASE WHEN ca.escaneado = TRUE THEN 1 ELSE 0 END) as total_escaneadas
           FROM compras_asientos ca
           INNER JOIN compras c ON ca.compra_id = c.id
           WHERE c.evento_id = ? AND ca.estado = 'CONFIRMADO'`,
          [evento_id]
        );
        const [statsMesas] = await pool.execute(
          `SELECT COUNT(*) as total_confirmadas,
                  SUM(CASE WHEN cm.escaneado = TRUE THEN 1 ELSE 0 END) as total_escaneadas,
                  SUM(cm.cantidad_sillas) as total_sillas_confirmadas,
                  SUM(CASE WHEN cm.escaneado = TRUE THEN cm.cantidad_sillas ELSE 0 END) as total_sillas_escaneadas
           FROM compras_mesas cm
           INNER JOIN compras c ON cm.compra_id = c.id
           WHERE c.evento_id = ? AND cm.estado = 'CONFIRMADO'`,
          [evento_id]
        );
        const [totalAsientos] = await pool.execute(
          'SELECT COUNT(*) as total FROM asientos WHERE evento_id = ?',
          [evento_id]
        );
        const [totalMesas] = await pool.execute(
          'SELECT COUNT(*) as total, SUM(capacidad_sillas) as total_sillas FROM mesas WHERE evento_id = ? AND activo = 1',
          [evento_id]
        );
        
        estadisticas = {
          tipo_evento: 'especial',
          asientos: {
            limite_total: parseInt(totalAsientos[0]?.total || 0),
            vendidas: parseInt(statsAsientos[0]?.total_confirmadas || 0),
            disponibles: Math.max(0, parseInt(totalAsientos[0]?.total || 0) - parseInt(statsAsientos[0]?.total_confirmadas || 0)),
            escaneadas: parseInt(statsAsientos[0]?.total_escaneadas || 0),
            total_faltantes: parseInt(statsAsientos[0]?.total_confirmadas || 0) - parseInt(statsAsientos[0]?.total_escaneadas || 0)
          },
          mesas: {
            limite_total: parseInt(totalMesas[0]?.total || 0),
            vendidas: parseInt(statsMesas[0]?.total_confirmadas || 0),
            disponibles: Math.max(0, parseInt(totalMesas[0]?.total || 0) - parseInt(statsMesas[0]?.total_confirmadas || 0)),
            escaneadas: parseInt(statsMesas[0]?.total_escaneadas || 0),
            total_faltantes: parseInt(statsMesas[0]?.total_confirmadas || 0) - parseInt(statsMesas[0]?.total_escaneadas || 0),
            sillas: {
              limite_total: parseInt(totalMesas[0]?.total_sillas || 0),
              vendidas: parseInt(statsMesas[0]?.total_sillas_confirmadas || 0),
              disponibles: Math.max(0, parseInt(totalMesas[0]?.total_sillas || 0) - parseInt(statsMesas[0]?.total_sillas_confirmadas || 0)),
              escaneadas: parseInt(statsMesas[0]?.total_sillas_escaneadas || 0),
              total_faltantes: parseInt(statsMesas[0]?.total_sillas_confirmadas || 0) - parseInt(statsMesas[0]?.total_sillas_escaneadas || 0)
            }
          }
        };
      }
    } catch (err) {
      console.warn('No se pudieron obtener estadísticas:', err);
    }

    const datosReporte = {
      evento,
      compras,
      estadisticas,
      resumenTipoPago
    };

    let filepath;
    const nombreArchivo = `reporte_evento_${evento_id}_${evento.titulo.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;

    if (formato === 'pdf') {
      filepath = await generarReportePDF(datosReporte, nombreArchivo);
    } else {
      filepath = await generarReporteExcel(datosReporte, nombreArchivo);
    }

    res.json({
      success: true,
      message: `Reporte ${formato?.toUpperCase() || 'EXCEL'} generado exitosamente`,
      data: {
        url: filepath,
        formato: formato || 'excel'
      }
    });
  } catch (error) {
    console.error('Error al exportar reporte:', error);
    res.status(500).json({
      success: false,
      message: 'Error al exportar el reporte',
      error: error.message
    });
  }
};


