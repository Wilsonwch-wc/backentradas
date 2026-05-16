import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import routes from './routes/index.js';
import authRoutes from './routes/auth.js';
import usuariosRoutes from './routes/usuarios.js';
import eventosRoutes from './routes/eventos.js';
import eventosPublicRoutes from './routes/eventosPublic.js';
import clientesRoutes from './routes/clientes.js';
import uploadRoutes from './routes/upload.js';
import tiposPrecioRoutes from './routes/tiposPrecio.js';
import mesasRoutes from './routes/mesas.js';
import asientosRoutes from './routes/asientos.js';
import areasRoutes from './routes/areas.js';
import contactoRoutes from './routes/contacto.js';
import comprasRoutes from './routes/compras.js';
// import pagosRoutes from './routes/pagos.js'; // Comentado temporalmente
import reportesRoutes from './routes/reportes.js';
import dashboardRoutes from './routes/dashboard.js';
import seguridadRoutes from './routes/seguridad.js';
import cuponesRoutes from './routes/cupones.js';
import db from './config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Rate limiting
import rateLimit from 'express-rate-limit';
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiadas peticiones. Intenta de nuevo en 15 minutos.' }
});
const compraLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados intentos de compra. Intenta de nuevo en un momento.' }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(generalLimiter);

// Servir archivos estáticos (imágenes subidas)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Servir imágenes estáticas (QR por defecto, etc.)
app.use('/images', express.static(path.join(__dirname, 'images')));

// Servir boletos PDF
app.use('/uploads/boletos', express.static(path.join(__dirname, 'uploads/boletos')));

// Servir reportes exportados (Excel y PDF)
app.use('/uploads/reportes', express.static(path.join(__dirname, 'uploads/reportes')));

// Verificar conexión a la base de datos al iniciar
const testConnection = async () => {
  try {
    const connection = await db.getConnection();
    console.log('✅ Conexión a la base de datos MySQL establecida correctamente');
    console.log(`📊 Base de datos: ${process.env.DB_NAME || 'entradas_db'}`);
    console.log(`🖥️  Host: ${process.env.DB_HOST || 'localhost'}`);
    connection.release();
  } catch (err) {
    console.error('❌ Error al conectar con MySQL:', err.message);
    console.error('Detalles:', err);
  }
};

// Ruta de prueba
app.get('/api/health', (req, res) => {
  res.json({ 
    message: 'Backend funcionando correctamente',
    database: 'conectado'
  });
});

// Rutas
app.use('/api', routes);
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/eventos', eventosRoutes);
app.use('/api/eventos-public', eventosPublicRoutes); // Ruta pública para eventos
app.use('/api/clientes', clientesRoutes); // Rutas de clientes (públicos)
app.use('/api/upload', uploadRoutes);
app.use('/api/tipos-precio', tiposPrecioRoutes); // Rutas para tipos de precio
app.use('/api/mesas', mesasRoutes); // Rutas para mesas
app.use('/api/asientos', asientosRoutes); // Rutas para asientos
app.use('/api/areas', areasRoutes); // Rutas para áreas del layout
app.use('/api/contacto', contactoRoutes); // Datos de contacto público
app.use('/api/compras', compraLimiter, comprasRoutes); // Rutas para compras
app.use('/api/reportes', reportesRoutes); // Rutas para reportes
app.use('/api/dashboard', dashboardRoutes); // Rutas para panel
app.use('/api/seguridad', seguridadRoutes); // Rutas para seguridad (escaneo de QRs)
app.use('/api/cupones', cuponesRoutes); // Rutas para cupones de descuento
// app.use('/api/pagos', pagosRoutes); // Comentado temporalmente

// Log para verificar rutas de seguridad
console.log('✅ Rutas de seguridad registradas en /api/seguridad');

// Cron: expirar compras pendientes cada 5 minutos
const EXPIRAR_PENDIENTES_MINUTOS = parseInt(process.env.EXPIRAR_PENDIENTES_MINUTOS, 10) || 15;

const expirarComprasPendientes = async () => {
  try {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      const [pendientes] = await connection.execute(
        `SELECT id FROM compras 
         WHERE estado = 'PAGO_PENDIENTE' 
           AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
         FOR UPDATE`,
        [EXPIRAR_PENDIENTES_MINUTOS]
      );

      if (pendientes.length === 0) {
        await connection.commit();
        connection.release();
        return;
      }

      const ids = pendientes.map(p => p.id);

      await connection.execute(
        `UPDATE compras SET estado = 'CANCELADO' WHERE id IN (?) AND estado = 'PAGO_PENDIENTE'`,
        [ids]
      );
      await connection.execute(
        `UPDATE compras_asientos SET estado = 'CANCELADO' WHERE compra_id IN (?)`,
        [ids]
      );
      await connection.execute(
        `UPDATE compras_mesas SET estado = 'CANCELADO' WHERE compra_id IN (?)`,
        [ids]
      );
      await connection.execute(
        `UPDATE compras_areas_personas SET estado = 'CANCELADO' WHERE compra_id IN (?)`,
        [ids]
      );

      await connection.commit();
      connection.release();
      console.log(`⏰ Compras pendientes expiradas: ${ids.length} (mayores a ${EXPIRAR_PENDIENTES_MINUTOS} min)`);
    } catch (error) {
      await connection.rollback();
      connection.release();
      console.error('❌ Error en cron expirar compras pendientes:', error.message);
    }
  } catch (error) {
    console.error('❌ Error de conexion en cron expirar compras pendientes:', error.message);
  }
};

cron.schedule('*/5 * * * *', expirarComprasPendientes);
console.log(`⏰ Cron activado: expirar compras pendientes cada 5 min (limite: ${EXPIRAR_PENDIENTES_MINUTOS} min)`);

// Iniciar aplicación
app.listen(PORT, HOST, async () => {
  console.log('🚀 Iniciando backend...');
  console.log(`🌐 Backend corriendo en ${HOST}:${PORT}`);
  console.log(`📡 API disponible en ${HOST}:${PORT}/api`);
  console.log('─'.repeat(50));
  
  // Probar conexión a la base de datos
  await testConnection();
  console.log('─'.repeat(50));
});

