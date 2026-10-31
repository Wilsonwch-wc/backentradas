import pool from '../config/db.js';

async function migrarTablasAnuncios() {
  console.log('=====================================================');
  console.log('🚀 Iniciando creación y migración de tablas AnunciosYA');
  console.log('=====================================================');

  try {
    // 1. Rol 'anunciante'
    console.log('1. Verificando rol "anunciante"...');
    const [rolesExistentes] = await pool.query(
      "SELECT id FROM roles WHERE nombre = 'anunciante'"
    );

    if (rolesExistentes.length === 0) {
      await pool.query(`
        INSERT INTO roles (nombre, descripcion, activo)
        VALUES ('anunciante', 'Usuario registrado para publicar y gestionar anuncios en AnunciosYA', 1)
      `);
      console.log('   ✅ Rol "anunciante" creado correctamente.');
    } else {
      console.log('   ℹ️ El rol "anunciante" ya existe.');
    }

    // 2. Modificar columnas existentes de usuarios si es necesario
    console.log('2. Adaptando columnas en tabla "usuarios"...');
    try {
      await pool.query("ALTER TABLE usuarios MODIFY COLUMN password VARCHAR(255) NULL");
      console.log('   ✅ Columna password permite NULL para Google Auth.');
    } catch (err) {
      console.log('   ⚠️ Nota en password:', err.message);
    }

    try {
      await pool.query("ALTER TABLE usuarios MODIFY COLUMN nombre_usuario VARCHAR(100) NULL");
      console.log('   ✅ Columna nombre_usuario modificada a VARCHAR(100) NULL.');
    } catch (err) {
      console.log('   ⚠️ Nota en nombre_usuario:', err.message);
    }

    // Columnas nuevas en usuarios
    const columnasUsuarios = [
      {
        nombre: 'apellidos',
        sql: "ALTER TABLE usuarios ADD COLUMN apellidos VARCHAR(100) NULL AFTER nombre_completo"
      },
      {
        nombre: 'ubicacion',
        sql: "ALTER TABLE usuarios ADD COLUMN ubicacion VARCHAR(100) NULL AFTER telefono"
      },
      {
        nombre: 'direccion',
        sql: "ALTER TABLE usuarios ADD COLUMN direccion VARCHAR(255) NULL AFTER ubicacion"
      },
      {
        nombre: 'google_id',
        sql: "ALTER TABLE usuarios ADD COLUMN google_id VARCHAR(100) NULL UNIQUE AFTER correo"
      },
      {
        nombre: 'avatar_url',
        sql: "ALTER TABLE usuarios ADD COLUMN avatar_url VARCHAR(500) NULL AFTER google_id"
      },
      {
        nombre: 'auth_provider',
        sql: "ALTER TABLE usuarios ADD COLUMN auth_provider ENUM('local', 'google') DEFAULT 'local' AFTER avatar_url"
      }
    ];

    for (const col of columnasUsuarios) {
      try {
        await pool.query(col.sql);
        console.log(`   ✅ Columna "${col.nombre}" añadida a "usuarios".`);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log(`   ℹ️ Columna "${col.nombre}" ya existe en "usuarios".`);
        } else {
          console.error(`   ❌ Error al agregar columna "${col.nombre}":`, err.message);
        }
      }
    }

    // 3. Crear tabla `anuncios`
    console.log('3. Creando tabla "anuncios"...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS anuncios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_usuario INT NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        precio VARCHAR(50) NOT NULL,
        categoria VARCHAR(50) NOT NULL,
        ciudad VARCHAR(100) NOT NULL,
        descripcion TEXT NULL,
        imagen_principal VARCHAR(500) NULL,
        telefono_contacto VARCHAR(50) NULL,
        destacado TINYINT(1) DEFAULT 0,
        nuevo TINYINT(1) DEFAULT 1,
        estado ENUM('activo', 'pausado', 'vendido', 'eliminado') DEFAULT 'activo',
        visitas INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_anuncio_usuario (id_usuario),
        INDEX idx_anuncio_categoria (categoria),
        INDEX idx_anuncio_ciudad (ciudad),
        INDEX idx_anuncio_estado (estado),
        CONSTRAINT fk_anuncios_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('   ✅ Tabla "anuncios" lista.');

    // 4. Crear tabla `anuncios_imagenes`
    console.log('4. Creando tabla "anuncios_imagenes"...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS anuncios_imagenes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_anuncio INT NOT NULL,
        url_imagen VARCHAR(500) NOT NULL,
        orden INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_imagen_anuncio (id_anuncio),
        CONSTRAINT fk_imagenes_anuncio FOREIGN KEY (id_anuncio) REFERENCES anuncios(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('   ✅ Tabla "anuncios_imagenes" lista.');

    // 5. Crear tabla `anuncios_favoritos`
    console.log('5. Creando tabla "anuncios_favoritos"...');
    await pool.query(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('   ✅ Tabla "anuncios_favoritos" lista.');

    console.log('=====================================================');
    console.log('🎉 Migración completada exitosamente.');
    console.log('=====================================================');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error fatal en migración:', error);
    process.exit(1);
  }
}

migrarTablasAnuncios();
