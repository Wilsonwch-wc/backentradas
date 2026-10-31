/**
 * ══════════════════════════════════════════════════════════════════════
 * Script de Actualización Automática de Base de Datos para el Servidor
 * Proyecto: PlusTicket / AnunciosYA
 * 
 * Este script lee automáticamente las variables de entorno de .env
 * (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT) y aplica todas las
 * tablas, columnas y permisos necesarios para AnunciosYA.
 * 
 * Uso en el servidor:
 *   cd backend
 *   node actualizar_servidor.js
 * ══════════════════════════════════════════════════════════════════════
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const config = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'entradas_db',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  multipleStatements: true
};

console.log('══════════════════════════════════════════════════════════════');
console.log('🚀 INICIANDO ACTUALIZACIÓN DE BASE DE DATOS EN EL SERVIDOR');
console.log('══════════════════════════════════════════════════════════════');
console.log(`📍 Host:     ${config.host}:${config.port}`);
console.log(`👤 Usuario:  ${config.user}`);
console.log(`🗄️  Base:     ${config.database}`);
console.log('──────────────────────────────────────────────────────────────');

async function actualizar() {
  let connection;
  try {
    connection = await mysql.createConnection(config);
    console.log('✅ Conexión establecida con MySQL exitosamente.\n');

    // 1. Rol 'anunciante'
    console.log('1️⃣  Verificando rol de anunciante...');
    await connection.query(`
      INSERT INTO roles (id, nombre, descripcion, activo)
      SELECT 6, 'anunciante', 'Usuario registrado para publicar y gestionar anuncios en AnunciosYA', 1
      WHERE NOT EXISTS (SELECT 1 FROM roles WHERE nombre = 'anunciante' OR id = 6);
    `);
    console.log('   ✓ Rol anunciante configurado.');

    // 2. Modificaciones en tabla `usuarios`
    console.log('2️⃣  Adaptando tabla usuarios (Google Auth y perfil)...');
    await connection.query(`ALTER TABLE usuarios MODIFY COLUMN password VARCHAR(255) NULL;`);
    await connection.query(`ALTER TABLE usuarios MODIFY COLUMN nombre_usuario VARCHAR(100) NULL;`);

    const columnasUsuarios = [
      { nombre: 'apellidos', def: 'VARCHAR(100) NULL AFTER nombre_completo' },
      { nombre: 'ubicacion', def: 'VARCHAR(100) NULL AFTER telefono' },
      { nombre: 'direccion', def: 'VARCHAR(255) NULL AFTER ubicacion' },
      { nombre: 'google_id', def: 'VARCHAR(100) NULL UNIQUE AFTER correo' },
      { nombre: 'avatar_url', def: 'VARCHAR(500) NULL AFTER google_id' },
      { nombre: 'auth_provider', def: "ENUM('local', 'google') DEFAULT 'local' AFTER avatar_url" }
    ];

    for (const col of columnasUsuarios) {
      const [[exists]] = await connection.query(`
        SELECT COUNT(*) as cnt FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = ?
      `, [config.database, col.nombre]);

      if (exists.cnt === 0) {
        await connection.query(`ALTER TABLE usuarios ADD COLUMN ${col.nombre} ${col.def}`);
        console.log(`   + Columna añadida a usuarios: ${col.nombre}`);
      } else {
        console.log(`   ✓ Columna existente en usuarios: ${col.nombre}`);
      }
    }

    // 3. Crear o actualizar tabla `anuncios`
    console.log('3️⃣  Verificando tabla anuncios...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS anuncios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_usuario INT NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        precio VARCHAR(50) NOT NULL,
        categoria VARCHAR(50) NOT NULL,
        ciudad VARCHAR(100) NOT NULL,
        descripcion TEXT NULL,
        imagen_principal MEDIUMTEXT NULL,
        imagenes_galeria LONGTEXT NULL,
        telefono_contacto VARCHAR(50) NULL,
        destacado TINYINT(1) DEFAULT 0,
        nuevo TINYINT(1) DEFAULT 1,
        estado ENUM('activo', 'pausado', 'vendido', 'eliminado') DEFAULT 'activo',
        visitas INT DEFAULT 0,
        color_titulo VARCHAR(50) NULL,
        dias_duracion INT DEFAULT 6,
        costo_total DECIMAL(10,2) DEFAULT 5.00,
        direccion VARCHAR(255) NULL,
        fecha_expiracion DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_anuncio_usuario (id_usuario),
        INDEX idx_anuncio_categoria (categoria),
        INDEX idx_anuncio_ciudad (ciudad),
        INDEX idx_anuncio_estado (estado),
        CONSTRAINT fk_anuncios_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Columnas opcionales en `anuncios`
    const columnasAnuncios = [
      { nombre: 'imagenes_galeria', def: 'LONGTEXT NULL AFTER imagen_principal' },
      { nombre: 'color_titulo', def: 'VARCHAR(50) NULL AFTER visitas' },
      { nombre: 'dias_duracion', def: 'INT DEFAULT 6 AFTER color_titulo' },
      { nombre: 'costo_total', def: 'DECIMAL(10,2) DEFAULT 5.00 AFTER dias_duracion' },
      { nombre: 'direccion', def: 'VARCHAR(255) NULL AFTER costo_total' },
      { nombre: 'fecha_expiracion', def: 'DATETIME NULL AFTER direccion' }
    ];

    for (const col of columnasAnuncios) {
      const [[exists]] = await connection.query(`
        SELECT COUNT(*) as cnt FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'anuncios' AND COLUMN_NAME = ?
      `, [config.database, col.nombre]);

      if (exists.cnt === 0) {
        await connection.query(`ALTER TABLE anuncios ADD COLUMN ${col.nombre} ${col.def}`);
        console.log(`   + Columna añadida a anuncios: ${col.nombre}`);
      } else {
        console.log(`   ✓ Columna existente en anuncios: ${col.nombre}`);
      }
    }

    await connection.query(`ALTER TABLE anuncios MODIFY COLUMN imagen_principal MEDIUMTEXT NULL;`);
    console.log('   ✓ Tabla anuncios lista y verificada.');

    // 4. Tabla `anuncios_imagenes`
    console.log('4️⃣  Verificando tabla anuncios_imagenes...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS anuncios_imagenes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_anuncio INT NOT NULL,
        url_imagen MEDIUMTEXT NOT NULL,
        orden INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_imagen_anuncio (id_anuncio),
        CONSTRAINT fk_imagenes_anuncio FOREIGN KEY (id_anuncio) REFERENCES anuncios(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('   ✓ Tabla anuncios_imagenes lista.');

    // 5. Tabla `anuncios_favoritos`
    console.log('5️⃣  Verificando tabla anuncios_favoritos...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS anuncios_favoritos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_usuario INT NOT NULL,
        id_anuncio INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_usuario_anuncio_fav (id_usuario, id_anuncio),
        INDEX idx_fav_usuario (id_usuario),
        INDEX idx_fav_anuncio (id_anuncio),
        CONSTRAINT fk_fav_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE,
        CONSTRAINT fk_fav_anuncio FOREIGN KEY (id_anuncio) REFERENCES anuncios(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('   ✓ Tabla anuncios_favoritos lista.');

    // 6. Tabla `anuncios_denuncias`
    console.log('6️⃣  Verificando tabla anuncios_denuncias...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS anuncios_denuncias (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_anuncio INT NOT NULL,
        id_usuario INT NULL,
        motivo VARCHAR(100) NOT NULL,
        comentario TEXT NULL,
        contacto VARCHAR(100) NULL,
        estado ENUM('pendiente', 'revisado', 'desestimado') DEFAULT 'pendiente',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_denuncia_anuncio (id_anuncio),
        CONSTRAINT fk_denuncias_anuncio FOREIGN KEY (id_anuncio) REFERENCES anuncios(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('   ✓ Tabla anuncios_denuncias lista.');

    // 7. Administrador reviewiasit@gmail.com
    console.log('7️⃣  Verificando cuenta de Administrador (reviewiasit@gmail.com)...');
    const [[adminExists]] = await connection.query(`
      SELECT id, correo, id_rol, activo FROM usuarios WHERE LOWER(TRIM(correo)) = 'reviewiasit@gmail.com'
    `);

    if (!adminExists) {
      await connection.query(`
        INSERT INTO usuarios (
          nombre_usuario, nombre_completo, apellidos, correo,
          telefono, ubicacion, auth_provider, activo, id_rol, password
        ) VALUES (
          'admin_anuncios', 'Administrador AnunciosYA', 'Master',
          'reviewiasit@gmail.com', '70000000', 'Cochabamba',
          'local', 1, 1, 'admin123'
        )
      `);
      console.log('   + Administrador insertado exitosamente con id_rol = 1.');
    } else {
      await connection.query(`
        UPDATE usuarios SET activo = 1, id_rol = 1 WHERE id = ?
      `, [adminExists.id]);
      console.log(`   ✓ Administrador existente (ID: ${adminExists.id}) actualizado con rol = 1 (admin) y activo = 1.`);
    }

    console.log('\n──────────────────────────────────────────────────────────────');
    console.log('🎉 ¡ACTUALIZACIÓN COMPLETADA CON ÉXITO SIN ERRORES!');
    console.log('══════════════════════════════════════════════════════════════');
  } catch (err) {
    console.error('\n❌ ERROR DURANTE LA ACTUALIZACIÓN:');
    console.error(err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

actualizar();
