import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Crear pool de conexiones
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'entradas_db',
  waitForConnections: true,
  connectionLimit: 10,
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

