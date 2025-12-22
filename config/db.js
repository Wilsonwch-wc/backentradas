import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Crear pool de conexiones
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '', // Sin contraseña por defecto
  database: process.env.DB_NAME || 'entradas_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Si DB_PASSWORD está vacío o no definido, no incluir el campo password
if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD.trim() === '') {
  delete dbConfig.password;
}

const pool = mysql.createPool(dbConfig);

// La conexión se probará desde index.js al iniciar el servidor
export default pool;

