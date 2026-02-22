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

export const obtenerResumenDashboard = async (req, res) => {
  try {
    const eventoIdQuery = req.query?.evento_id;
    const eventoIdNum = eventoIdQuery ? parseInt(eventoIdQuery, 10) : NaN;
    const filtrarPorEventoId = Number.isInteger(eventoIdNum) && eventoIdNum > 0;

    let idsFiltro = [];
    let nombresEventoActivo = [];
    let eventosHabilitados = 0;

    if (filtrarPorEventoId) {
      // Usuario eligió un evento concreto
      idsFiltro = [eventoIdNum];
      const [ev] = await pool.execute('SELECT id, titulo FROM eventos WHERE id = ?', [eventoIdNum]);
      if (ev.length) {
        nombresEventoActivo = [ev[0].titulo].filter(Boolean);
      }
      eventosHabilitados = ev?.length ? 1 : 0;
    } else {
      // Por defecto: solo el próximo evento (activo y que aún no ha pasado)
      const [proximos] = await pool.execute(
        "SELECT id, titulo FROM eventos WHERE estado = 'activo' AND hora_inicio >= NOW() ORDER BY hora_inicio ASC LIMIT 1"
      );
      idsFiltro = proximos.map((r) => r.id);
      nombresEventoActivo = proximos.map((r) => r.titulo).filter(Boolean);
      const [countHabilitados] = await pool.execute(
        "SELECT COUNT(*) AS total FROM eventos WHERE estado = 'activo' AND hora_inicio >= NOW()"
      );
      eventosHabilitados = countHabilitados?.[0]?.total ?? 0;
    }

    const filtroEventoActivo =
      idsFiltro.length > 0
        ? ` AND evento_id IN (${idsFiltro.join(',')})`
        : ' AND 1=0';

    const [
      totalClientes,
      totalEventos,
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
      safeCount(`SELECT COUNT(*) AS total FROM compras WHERE 1=1 ${filtroEventoActivo}`),
      safeCount(`SELECT COUNT(*) AS total FROM compras WHERE estado IN ('PAGO_REALIZADO','ENTRADA_USADA') ${filtroEventoActivo}`),
      safeCount(`SELECT COUNT(*) AS total FROM compras WHERE estado = 'PAGO_PENDIENTE' ${filtroEventoActivo}`),
      safeSum(`SELECT COALESCE(SUM(total),0) AS suma FROM compras WHERE estado = 'PAGO_PENDIENTE' ${filtroEventoActivo}`),
      safeSum(`SELECT COALESCE(SUM(total),0) AS suma FROM compras WHERE estado IN ('PAGO_REALIZADO','ENTRADA_USADA') ${filtroEventoActivo}`),
      safeSum(`SELECT COALESCE(SUM(cantidad),0) AS suma FROM compras WHERE estado IN ('PAGO_REALIZADO','ENTRADA_USADA') ${filtroEventoActivo}`),
      safeSum(`SELECT COALESCE(SUM(cantidad),0) AS suma FROM compras WHERE estado = 'PAGO_PENDIENTE' ${filtroEventoActivo}`)
    ]);

    // Lista de todos los eventos para el selector (id, titulo, hora_inicio, estado)
    const [listaEventosRows] = await pool.execute(
      'SELECT id, titulo, hora_inicio, estado FROM eventos ORDER BY hora_inicio DESC'
    );
    const lista_eventos = listaEventosRows.map((r) => ({
      id: r.id,
      titulo: r.titulo || `Evento #${r.id}`,
      hora_inicio: r.hora_inicio,
      estado: r.estado || null
    }));

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
        evento_activo_nombres: nombresEventoActivo,
        lista_eventos
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


