import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Crear pool de conexiones
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  database: process.env.DB_NAME || 'entradas_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Solo agregar password si existe y no está vacío
if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim() !== '') {
  dbConfig.password = process.env.DB_PASSWORD;
}

const pool = mysql.createPool(dbConfig);

// La conexión se probará desde index.js al iniciar el servidor
export default pool;

