import pool from '../config/db.js';

async function fix() {
  try {
    const [cols] = await pool.query("DESCRIBE anuncios");
    console.log("Columnas actuales de imagen:", cols.filter(c => c.Field.includes('imagen')));

    // Modificar imagen_principal e imagenes_galeria a LONGTEXT (hasta 4GB)
    await pool.query("ALTER TABLE anuncios MODIFY COLUMN imagen_principal LONGTEXT NULL");
    await pool.query("ALTER TABLE anuncios MODIFY COLUMN imagenes_galeria LONGTEXT NULL");

    // También asegurar que la tabla anuncios_imagenes si existe use LONGTEXT
    try {
      await pool.query("ALTER TABLE anuncios_imagenes MODIFY COLUMN url_imagen LONGTEXT NOT NULL");
    } catch (e) {
      console.log("Nota anuncios_imagenes:", e.message);
    }

    const [colsAfter] = await pool.query("DESCRIBE anuncios");
    console.log("Columnas actualizadas:", colsAfter.filter(c => c.Field.includes('imagen')));
    console.log("✅ Columnas imagen_principal e imagenes_galeria actualizadas a LONGTEXT con éxito.");
    process.exit(0);
  } catch (err) {
    console.error("Error al actualizar columnas:", err);
    process.exit(1);
  }
}

fix();
