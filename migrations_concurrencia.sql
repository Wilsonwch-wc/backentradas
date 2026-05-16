-- ============================================================
-- MIGRACION: Indices compuestos para soporte de alta concurrencia
-- Fecha: 2026-05-16
-- Descripcion: Indices que optimizan las consultas criticas
--   de disponibilidad de asientos, mesas y areas durante compras.
-- ============================================================

-- 1. compras_asientos: optimiza verificacion de asiento ocupado
CREATE INDEX idx_ca_asiento_estado ON compras_asientos (asiento_id, estado);

-- 2. compras_mesas: optimiza verificacion de mesa ocupada
CREATE INDEX idx_cm_mesa_estado ON compras_mesas (mesa_id, estado);

-- 3. compras_entradas_generales: optimiza conteo por tipo_precio
CREATE INDEX idx_ceg_tipo_precio ON compras_entradas_generales (tipo_precio_id);

-- 4. compras_detalle_general: optimiza conteo de reservas pendientes por tipo
CREATE INDEX idx_cdg_tipo_precio_compra ON compras_detalle_general (tipo_precio_id, compra_id);

-- 5. compras: optimiza busqueda de pendientes por fecha (para cron de expiracion)
CREATE INDEX idx_c_estado_created ON compras (estado, created_at);

-- 6. cupones: optimiza busqueda por codigo + evento (con FOR UPDATE)
CREATE INDEX idx_cupon_codigo_evento ON cupones (codigo, evento_id);
