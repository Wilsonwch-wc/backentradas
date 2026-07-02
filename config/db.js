import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Crear pool de conexiones
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL_SIZE, 10) || 50,
  queueLimit: 0,
  // Zona horaria de Bolivia (UTC-4)
  timezone: '-04:00'
};


const pool = mysql.createPool(dbConfig);

// Configurar zona horaria de MySQL al iniciar
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '-04:00'");
});

// La conexión se probará desde index.js al iniciar el servidor
export default pool;

