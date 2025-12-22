/**
 * Convierte un texto a slug (URL-friendly)
 * Ejemplo: "GRUPO FRONTERA" -> "grupo-frontera"
 */
export const generarSlug = (texto) => {
  if (!texto) return '';
  
  return texto
    .toString()
    .toLowerCase()
    .trim()
    // Reemplazar espacios y guiones múltiples por un solo guion
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    // Eliminar caracteres especiales excepto guiones
    .replace(/[^\w\-]+/g, '')
    // Eliminar guiones al inicio y final
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

/**
 * Genera un slug único agregando un número si es necesario
 * Ejemplo: "grupo-frontera", "grupo-frontera-2", etc.
 */
export const generarSlugUnico = async (titulo, pool, eventoIdExcluir = null) => {
  const slugBase = generarSlug(titulo);
  
  // Si el slug está vacío, usar un valor por defecto
  if (!slugBase) {
    return `evento-${Date.now()}`;
  }
  
  let slug = slugBase;
  let contador = 1;
  
  // Verificar si el slug ya existe
  while (true) {
    let query = 'SELECT id FROM eventos WHERE slug = ?';
    const params = [slug];
    
    // Si estamos editando un evento, excluirlo de la búsqueda
    if (eventoIdExcluir) {
      query += ' AND id != ?';
      params.push(eventoIdExcluir);
    }
    
    const [eventos] = await pool.execute(query, params);
    
    if (eventos.length === 0) {
      // El slug está disponible
      return slug;
    }
    
    // El slug ya existe, intentar con un número
    contador++;
    slug = `${slugBase}-${contador}`;
    
    // Prevenir loops infinitos (máximo 1000 intentos)
    if (contador > 1000) {
      return `${slugBase}-${Date.now()}`;
    }
  }
};

