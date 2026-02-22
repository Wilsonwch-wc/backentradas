import pool from '../config/db.js';

const safeCount = async (query, params = []) => {
  try {
    const [rows] = await pool.execute(query, params);
    return rows?.[0]?.total ?? 0;
  } catch (err) {
    console.warn('⚠️ Error en conteo dashboard:', err.message);
    return 0;
  }
};

const safeSum = async (query, params = []) => {
  try {
    const [rows] = await pool.execute(query, params);
    return Number(rows?.[0]?.suma ?? 0);
  } catch (err) {
    console.warn('⚠️ Error en suma dashboard:', err.message);
    return 0;
  }
};

export const obtenerResumenDashboard = async (_req, res) => {
  try {
    // Eventos actualmente activos (solo estos entran en compras/pagos/ingresos del panel)
    const [eventosActivosRows] = await pool.execute(
      "SELECT id, titulo FROM eventos WHERE estado = 'activo' ORDER BY hora_inicio ASC"
    );
    const idsActivos = eventosActivosRows.map((r) => r.id);
    const nombresEventoActivo = eventosActivosRows.map((r) => r.titulo).filter(Boolean);
    const filtroEventoActivo =
      idsActivos.length > 0
        ? ` AND evento_id IN (${idsActivos.join(',')})`
        : ' AND 1=0';

    const [
      totalClientes,
      totalEventos,
      eventosHabilitados,
      totalCompras,
      pagosConfirmados,
      totalPendientes,
      totalPendientesMonto,
      ingresosConfirmados,
      entradasConfirmadas,
      entradasPendientes
    ] = await Promise.all([
      safeCount('SELECT COUNT(*) AS total FROM clientes'),
      safeCount('SELECT COUNT(*) AS total FROM eventos'),
      safeCount("SELECT COUNT(*) AS total FROM eventos WHERE estado = 'activo'"),
      safeCount(`SELECT COUNT(*) AS total FROM compras WHERE 1=1 ${filtroEventoActivo}`),
      safeCount(`SELECT COUNT(*) AS total FROM compras WHERE estado IN ('PAGO_REALIZADO','ENTRADA_USADA') ${filtroEventoActivo}`),
      safeCount(`SELECT COUNT(*) AS total FROM compras WHERE estado = 'PAGO_PENDIENTE' ${filtroEventoActivo}`),
      safeSum(`SELECT COALESCE(SUM(total),0) AS suma FROM compras WHERE estado = 'PAGO_PENDIENTE' ${filtroEventoActivo}`),
      safeSum(`SELECT COALESCE(SUM(total),0) AS suma FROM compras WHERE estado IN ('PAGO_REALIZADO','ENTRADA_USADA') ${filtroEventoActivo}`),
      safeSum(`SELECT COALESCE(SUM(cantidad),0) AS suma FROM compras WHERE estado IN ('PAGO_REALIZADO','ENTRADA_USADA') ${filtroEventoActivo}`),
      safeSum(`SELECT COALESCE(SUM(cantidad),0) AS suma FROM compras WHERE estado = 'PAGO_PENDIENTE' ${filtroEventoActivo}`)
    ]);

    res.json({
      success: true,
      data: {
        clientes: totalClientes,
        eventos: totalEventos,
        eventos_habilitados: eventosHabilitados,
        compras: totalCompras,
        pagos_confirmados: pagosConfirmados,
        pagos_pendientes: totalPendientes,
        monto_pendiente: totalPendientesMonto,
        ingresos_confirmados: ingresosConfirmados,
        entradas_confirmadas: entradasConfirmadas,
        entradas_pendientes: entradasPendientes,
        ultima_actualizacion: new Date().toISOString(),
        evento_activo_nombres: nombresEventoActivo
      }
    });
  } catch (error) {
    console.error('Error en dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el resumen del dashboard',
      error: error.message
    });
  }
};


