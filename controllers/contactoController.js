import pool from '../config/db.js';

let tablaLista = false;

const asegurarTabla = async () => {
  if (tablaLista) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contacto_info (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      telefono VARCHAR(50),
      email VARCHAR(150),
      whatsapp VARCHAR(50),
      direccion VARCHAR(255),
      horario VARCHAR(255),
      facebook VARCHAR(255),
      instagram VARCHAR(255),
      twitter VARCHAR(255),
      youtube VARCHAR(255),
      tiktok VARCHAR(255),
      linkedin VARCHAR(255),
      website VARCHAR(255),
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // Asegurar columnas nuevas en despliegues existentes (MySQL < 8 no soporta IF NOT EXISTS)
  const columnas = {
    facebook: 'VARCHAR(255)',
    instagram: 'VARCHAR(255)',
    twitter: 'VARCHAR(255)',
    youtube: 'VARCHAR(255)',
    tiktok: 'VARCHAR(255)',
    linkedin: 'VARCHAR(255)',
    website: 'VARCHAR(255)'
  };

  const [dbRow] = await pool.query('SELECT DATABASE() as db');
  const dbName = dbRow[0]?.db;

  if (dbName) {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME 
       FROM information_schema.columns 
       WHERE table_schema = ? AND table_name = 'contacto_info'`,
      [dbName]
    );
    const existentes = new Set(cols.map(c => c.COLUMN_NAME));

    for (const [col, tipo] of Object.entries(columnas)) {
      if (!existentes.has(col)) {
        await pool.query(`ALTER TABLE contacto_info ADD COLUMN ${col} ${tipo}`);
      }
    }
  }

  tablaLista = true;
};

const obtenerRegistroUnico = async () => {
  await asegurarTabla();

  const [rows] = await pool.query(
    'SELECT * FROM contacto_info ORDER BY id ASC LIMIT 1'
  );

  if (rows.length > 0) {
    return rows[0];
  }

  const datosIniciales = {
    telefono: '(+591) 700-00000',
    email: 'contacto@ejemplo.com',
    whatsapp: '+59170000000',
    direccion: 'Av. Ejemplo 123, La Paz',
    horario: 'Lun-Vie 09:00 - 18:00',
    facebook: 'https://facebook.com/tu-pagina',
    instagram: 'https://instagram.com/tu-pagina',
    twitter: 'https://twitter.com/tu-pagina',
    youtube: 'https://youtube.com/tu-canal',
    tiktok: 'https://www.tiktok.com/@tu-usuario',
    linkedin: 'https://www.linkedin.com/company/tu-empresa',
    website: 'https://www.tusitio.com'
  };

  const [insert] = await pool.query(
    `INSERT INTO contacto_info (telefono, email, whatsapp, direccion, horario, facebook, instagram, twitter, youtube, tiktok, linkedin, website)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datosIniciales.telefono,
      datosIniciales.email,
      datosIniciales.whatsapp,
      datosIniciales.direccion,
      datosIniciales.horario,
      datosIniciales.facebook,
      datosIniciales.instagram,
      datosIniciales.twitter,
      datosIniciales.youtube,
      datosIniciales.tiktok,
      datosIniciales.linkedin,
      datosIniciales.website
    ]
  );

  return { id: insert.insertId, ...datosIniciales };
};

export const obtenerContacto = async (req, res) => {
  try {
    const registro = await obtenerRegistroUnico();

    res.json({
      success: true,
      data: registro
    });
  } catch (error) {
    console.error('Error al obtener contacto:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la información de contacto',
      error: error.message
    });
  }
};

export const actualizarContacto = async (req, res) => {
  try {
    const {
      telefono,
      email,
      whatsapp,
      direccion,
      horario,
      facebook,
      instagram,
      twitter,
      youtube,
      tiktok,
      linkedin,
      website
    } = req.body;

    if (
      telefono === undefined &&
      email === undefined &&
      whatsapp === undefined &&
      direccion === undefined &&
      horario === undefined &&
      facebook === undefined &&
      instagram === undefined &&
      twitter === undefined &&
      youtube === undefined &&
      tiktok === undefined &&
      linkedin === undefined &&
      website === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: 'Proporcione al menos un campo para actualizar'
      });
    }

    const registroActual = await obtenerRegistroUnico();

    const actualizado = {
      telefono: telefono ?? registroActual.telefono,
      email: email ?? registroActual.email,
      whatsapp: whatsapp ?? registroActual.whatsapp,
      direccion: direccion ?? registroActual.direccion,
      horario: horario ?? registroActual.horario,
      facebook: facebook ?? registroActual.facebook,
      instagram: instagram ?? registroActual.instagram,
      twitter: twitter ?? registroActual.twitter,
      youtube: youtube ?? registroActual.youtube,
      tiktok: tiktok ?? registroActual.tiktok,
      linkedin: linkedin ?? registroActual.linkedin,
      website: website ?? registroActual.website
    };

    await pool.query(
      `UPDATE contacto_info
       SET telefono = ?, email = ?, whatsapp = ?, direccion = ?, horario = ?,
           facebook = ?, instagram = ?, twitter = ?, youtube = ?, tiktok = ?, linkedin = ?, website = ?
       WHERE id = ?`,
      [
        actualizado.telefono,
        actualizado.email,
        actualizado.whatsapp,
        actualizado.direccion,
        actualizado.horario,
        actualizado.facebook,
        actualizado.instagram,
        actualizado.twitter,
        actualizado.youtube,
        actualizado.tiktok,
        actualizado.linkedin,
        actualizado.website,
        registroActual.id
      ]
    );

    res.json({
      success: true,
      message: 'Datos de contacto actualizados',
      data: actualizado
    });
  } catch (error) {
    console.error('Error al actualizar contacto:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la información de contacto',
      error: error.message
    });
  }
};

