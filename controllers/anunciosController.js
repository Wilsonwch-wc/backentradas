import pool from '../config/db.js';

// Helper para formatear tiempo relativo en español
function calcularTiempoRelativo(dateString) {
  if (!dateString) return 'Reciente';
  const fecha = new Date(dateString);
  const ahora = new Date();
  const diffSegundos = Math.floor((ahora - fecha) / 1000);

  if (diffSegundos < 60) return 'Hace un momento';
  const diffMinutos = Math.floor(diffSegundos / 60);
  if (diffMinutos < 60) return `Hace ${diffMinutos} min`;
  const diffHoras = Math.floor(diffMinutos / 60);
  if (diffHoras < 24) return `Hace ${diffHoras} ${diffHoras === 1 ? 'hora' : 'horas'}`;
  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias < 30) return `Hace ${diffDias} ${diffDias === 1 ? 'día' : 'días'}`;
  return fecha.toLocaleDateString('es-BO');
}

/**
 * 1. Obtener todos los anuncios activos desde MySQL
 */
export const obtenerAnuncios = async (req, res) => {
  try {
    const { categoria, ciudad, buscar } = req.query;

    let query = `
      SELECT a.*, 
             u.nombre_completo as vendedor_completo,
             u.telefono as vendedor_telefono,
             u.ubicacion as vendedor_ubicacion
      FROM anuncios a
      LEFT JOIN usuarios u ON a.id_usuario = u.id
      WHERE a.estado = 'activo'
    `;
    const params = [];

    if (categoria && categoria !== 'todas') {
      query += ` AND a.categoria = ?`;
      params.push(categoria);
    }

    if (ciudad && ciudad !== 'Todas') {
      query += ` AND a.ciudad = ?`;
      params.push(ciudad);
    }

    if (buscar && buscar.trim()) {
      query += ` AND (LOWER(a.titulo) LIKE ? OR LOWER(a.descripcion) LIKE ?)`;
      params.push(`%${buscar.trim().toLowerCase()}%`, `%${buscar.trim().toLowerCase()}%`);
    }

    query += ` ORDER BY a.destacado DESC, a.created_at DESC`;

    const [rows] = await pool.query(query, params);

    const anunciosFormateados = rows.map(a => {
      // Por privacidad estricta: sólo el primer nombre de pila
      const primerNombre = a.vendedor_completo
        ? a.vendedor_completo.trim().split(' ')[0]
        : 'Anunciante';

      // Parsear galería de hasta 4 imágenes opcionales
      let listaImagenes = [];
      if (a.imagenes_galeria) {
        try {
          listaImagenes = typeof a.imagenes_galeria === 'string' ? JSON.parse(a.imagenes_galeria) : a.imagenes_galeria;
        } catch {
          listaImagenes = [];
        }
      }
      if (!listaImagenes.length && a.imagen_principal) {
        listaImagenes = [a.imagen_principal];
      }

      return {
        id: a.id,
        titulo: a.titulo,
        precio: a.precio,
        categoria: a.categoria,
        ciudad: a.ciudad,
        desc: a.descripcion,
        direccion: a.direccion,
        img: a.imagen_principal || (listaImagenes[0] || null),
        imagenes: listaImagenes, // Hasta 4 imágenes opcionales
        vendedor: primerNombre, // Solo nombre de pila
        telefono: a.telefono_contacto || a.vendedor_telefono || '77412345',
        destacado: Boolean(a.destacado),
        nuevo: Boolean(a.nuevo),
        fav: false,
        tiempo: calcularTiempoRelativo(a.created_at),
        color_titulo: a.color_titulo || null,
        dias_duracion: a.dias_duracion || 6,
        costo_total: a.costo_total || '5.00',
        fecha_expiracion: a.fecha_expiracion
      };
    });

    return res.json({
      success: true,
      data: anunciosFormateados
    });

  } catch (error) {
    console.error('Error al obtener anuncios:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener anuncios de la base de datos',
      error: error.message
    });
  }
};

/**
 * 2. Crear un nuevo anuncio (con cálculo de días y opciones de pago)
 */
export const crearAnuncio = async (req, res) => {
  try {
    const {
      titulo,
      precio,
      categoria,
      ciudad,
      descripcion,
      imagen_principal,
      direccion,
      telefono_contacto,
      dias_duracion,
      color_titulo,
      costo_total,
      id_usuario: bodyUserId,
      nombre_vendedor,
      apellidos_vendedor,
      codigo_cupon
    } = req.body;

    let idUsuario = req.user?.id || bodyUserId;

    if (!idUsuario) {
      // Si no viene autenticado pero vienen datos de usuario
      return res.status(401).json({
        success: false,
        message: 'Debes iniciar sesión para publicar un anuncio'
      });
    }

    if (!titulo || !precio || !categoria || !ciudad) {
      return res.status(400).json({
        success: false,
        message: 'Título, precio, categoría y ciudad son obligatorios'
      });
    }

    // Actualizar datos del usuario si se enviaron (nombre, apellidos, telefono, direccion)
    if (nombre_vendedor || telefono_contacto || direccion || apellidos_vendedor) {
      await pool.query(
        `UPDATE usuarios SET
          nombre_completo = COALESCE(?, nombre_completo),
          apellidos = COALESCE(?, apellidos),
          telefono = COALESCE(?, telefono),
          direccion = COALESCE(?, direccion),
          ubicacion = COALESCE(?, ubicacion),
          updated_at = NOW()
        WHERE id = ?`,
        [
          nombre_vendedor || null,
          apellidos_vendedor || null,
          telefono_contacto || null,
          direccion || null,
          ciudad || null,
          idUsuario
        ]
      );
    }

    // Procesar cupón si fue provisto
    let cuponValido = null;
    let costoFinal = parseFloat(costo_total) || 5.00;

    if (codigo_cupon && codigo_cupon.trim()) {
      const code = codigo_cupon.trim().toUpperCase();
      const [cupones] = await pool.query(
        'SELECT * FROM cupones_anuncios WHERE UPPER(codigo) = ? AND activo = 1 LIMIT 1',
        [code]
      );

      if (cupones.length > 0) {
        const c = cupones[0];

        // Validar límite total
        if (c.limite_usos > 0 && c.usos_actuales >= c.limite_usos) {
          return res.status(400).json({
            success: false,
            message: `El cupón ${code} ha alcanzado su límite máximo de usos (${c.limite_usos}).`
          });
        }

        // Validar límite por usuario
        const [usosUser] = await pool.query(
          'SELECT COUNT(*) AS total_usos FROM cupones_anuncios_usos WHERE id_cupon = ? AND id_usuario = ?',
          [c.id, idUsuario]
        );

        if (c.limite_por_usuario > 0 && usosUser[0].total_usos >= c.limite_por_usuario) {
          return res.status(400).json({
            success: false,
            message: `Ya has utilizado este cupón el número máximo de veces permitidas (${c.limite_por_usuario}).`
          });
        }

        // Aplicar descuento
        cuponValido = c;
        if (c.tipo === 'gratis' || parseFloat(c.valor) >= 100) {
          costoFinal = 0.00;
        } else if (c.tipo === 'porcentaje') {
          costoFinal = Math.max(0, costoFinal * (1 - parseFloat(c.valor) / 100));
        } else if (c.tipo === 'monto') {
          costoFinal = Math.max(0, costoFinal - parseFloat(c.valor));
        }
      }
    }

    const dias = parseInt(dias_duracion, 10) || 6;
    const precioFinal = precio.startsWith('Bs') ? precio : `Bs ${precio}`;

    // Procesar hasta 4 imágenes opcionales (puede ser 0, 1, 2, 3 o 4)
    let arrayImagenes = [];
    if (Array.isArray(req.body.imagenes)) {
      arrayImagenes = req.body.imagenes
        .filter(img => typeof img === 'string' && img.trim().length > 0)
        .slice(0, 4);
    } else if (imagen_principal && imagen_principal.trim()) {
      arrayImagenes = [imagen_principal.trim()];
    }

    const imgPrincipal = arrayImagenes.length > 0 ? arrayImagenes[0] : (imagen_principal || null);
    const jsonGaleria = arrayImagenes.length > 0 ? JSON.stringify(arrayImagenes) : null;

    // Insertar el anuncio con duración calculada en días e imágenes opcionales
    const [result] = await pool.query(
      `INSERT INTO anuncios (
        id_usuario, titulo, precio, categoria, ciudad, descripcion,
        imagen_principal, imagenes_galeria, telefono_contacto, direccion, color_titulo,
        dias_duracion, costo_total, fecha_expiracion, destacado, nuevo, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), 1, 1, 'activo')`,
      [
        idUsuario,
        titulo.trim(),
        precioFinal,
        categoria,
        ciudad,
        descripcion || null,
        imgPrincipal,
        jsonGaleria,
        telefono_contacto || null,
        direccion || null,
        color_titulo || null,
        dias,
        costoFinal.toFixed(2),
        dias
      ]
    );

    // Si se usó cupón, registrar en la tabla de usos e incrementar contador
    if (cuponValido) {
      const [uRows] = await pool.query('SELECT correo FROM usuarios WHERE id = ?', [idUsuario]);
      const userMail = uRows[0]?.correo || null;
      await pool.query(
        'INSERT INTO cupones_anuncios_usos (id_cupon, id_usuario, correo, id_anuncio) VALUES (?, ?, ?, ?)',
        [cuponValido.id, idUsuario, userMail, result.insertId]
      );
      await pool.query(
        'UPDATE cupones_anuncios SET usos_actuales = usos_actuales + 1 WHERE id = ?',
        [cuponValido.id]
      );
    }

    // Obtener el anuncio recién insertado con los datos del usuario
    const [nuevos] = await pool.query(
      `SELECT a.*, u.nombre_completo as vendedor_completo, u.telefono as vendedor_telefono
       FROM anuncios a
       LEFT JOIN usuarios u ON a.id_usuario = u.id
       WHERE a.id = ?`,
      [result.insertId]
    );

    const a = nuevos[0];
    const primerNombre = a.vendedor_completo
      ? a.vendedor_completo.trim().split(' ')[0]
      : 'Anunciante';

    const nuevoFormateado = {
      id: a.id,
      titulo: a.titulo,
      precio: a.precio,
      categoria: a.categoria,
      ciudad: a.ciudad,
      desc: a.descripcion,
      direccion: a.direccion,
      img: a.imagen_principal,
      imagenes: arrayImagenes, // Hasta 4 imágenes
      vendedor: primerNombre,
      telefono: a.telefono_contacto || a.vendedor_telefono || '77412345',
      destacado: Boolean(a.destacado),
      nuevo: Boolean(a.nuevo),
      fav: false,
      tiempo: 'Ahora mismo',
      color_titulo: a.color_titulo || null,
      dias_duracion: a.dias_duracion,
      costo_total: a.costo_total,
      fecha_expiracion: a.fecha_expiracion
    };

    return res.json({
      success: true,
      message: '¡Anuncio publicado y pagado exitosamente!',
      data: nuevoFormateado
    });

  } catch (error) {
    console.error('Error al crear anuncio:', error);
    return res.status(500).json({
      success: false,
      message: 'Error en el servidor al guardar el anuncio',
      error: error.message
    });
  }
};

/**
 * 3. Denunciar / Reportar un anuncio por contenido indebido, estafa o datos falsos
 */
export const denunciarAnuncio = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo, comentario, contacto } = req.body;

    console.log(`[DENUNCIA RECIBIDA] Anuncio ID #${id} - Motivo: "${motivo}" - Comentario: "${comentario || 'N/A'}"`);

    return res.json({
      success: true,
      message: 'Tu denuncia ha sido registrada con éxito. Nuestro equipo de moderación revisará este anuncio.'
    });
  } catch (error) {
    console.error('Error al denunciar anuncio:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al procesar la denuncia',
      error: error.message
    });
  }
};

/**
 * 4. Validar cupón de publicación en AnunciosYA
 */
export const validarCuponAnuncio = async (req, res) => {
  try {
    const { codigo, id_usuario, correo } = req.body;

    if (!codigo || !codigo.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Por favor ingresa un código de cupón'
      });
    }

    const code = codigo.trim().toUpperCase();
    const [rows] = await pool.query(
      'SELECT * FROM cupones_anuncios WHERE UPPER(codigo) = ? LIMIT 1',
      [code]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `El cupón "${code}" no existe o es inválido.`
      });
    }

    const cupon = rows[0];

    if (!cupon.activo) {
      return res.status(400).json({
        success: false,
        message: `El cupón "${code}" se encuentra inactivo.`
      });
    }

    if (cupon.fecha_expiracion && new Date(cupon.fecha_expiracion) < new Date()) {
      return res.status(400).json({
        success: false,
        message: `El cupón "${code}" ha expirado.`
      });
    }

    if (cupon.limite_usos > 0 && cupon.usos_actuales >= cupon.limite_usos) {
      return res.status(400).json({
        success: false,
        message: `El cupón "${code}" ha alcanzado el límite total de usos disponibles (${cupon.limite_usos}).`
      });
    }

    // Validar por usuario si hay usuario o correo
    const userId = req.user?.id || id_usuario;
    const userMail = req.user?.correo || req.user?.email || correo;

    if ((userId || userMail) && cupon.limite_por_usuario > 0) {
      let queryUsos = 'SELECT COUNT(*) AS total_usos FROM cupones_anuncios_usos WHERE id_cupon = ? AND (';
      const params = [cupon.id];

      if (userId && userMail) {
        queryUsos += 'id_usuario = ? OR LOWER(correo) = ?)';
        params.push(userId, userMail.toLowerCase().trim());
      } else if (userId) {
        queryUsos += 'id_usuario = ?)';
        params.push(userId);
      } else {
        queryUsos += 'LOWER(correo) = ?)';
        params.push(userMail.toLowerCase().trim());
      }

      const [usosRows] = await pool.query(queryUsos, params);
      const totalUsos = usosRows[0]?.total_usos || 0;

      if (totalUsos >= cupon.limite_por_usuario) {
        return res.status(400).json({
          success: false,
          message: `Ya has utilizado el cupón "${code}" (${totalUsos}/${cupon.limite_por_usuario} usos permitidos por usuario).`
        });
      }
    }

    return res.json({
      success: true,
      valido: true,
      message: `🎉 ¡Cupón "${code}" validado con éxito!`,
      data: {
        id: cupon.id,
        codigo: cupon.codigo,
        descripcion: cupon.descripcion || 'Publicación Gratuita',
        tipo: cupon.tipo,
        valor: parseFloat(cupon.valor),
        limite_usos: cupon.limite_usos,
        usos_actuales: cupon.usos_actuales,
        limite_por_usuario: cupon.limite_por_usuario
      }
    });

  } catch (error) {
    console.error('Error al validar cupón de anuncio:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al validar el cupón',
      error: error.message
    });
  }
};

