/**
 * Servicio de Lógica del Juego "El Impostor" (Palabra Secreta / Deducción)
 * 
 * Reglas según plan2.md:
 * - 3 a 12 jugadores
 * - 1 o 2 impostores (default 1)
 * - Los inocentes reciben la palabra secreta y categoría.
 * - El impostor NO recibe la palabra (seguridad anti-trampa en servidor).
 * - Ronda de pistas: cada jugador da su pista por texto/chat o confirma haber hablado.
 * - Votación secreta y revelación de roles.
 * - Oportunidad de adivinar para el impostor o nueva ronda si eliminan a un inocente.
 */

export const BANCO_PALABRAS = {
  vehiculos: {
    nombre: 'Vehículos',
    emoji: '🚗',
    palabras: [
      'Auto', 'Motocicleta', 'Avión', 'Barco', 'Bicicleta', 'Tren',
      'Camión', 'Submarino', 'Cohete', 'Helicóptero', 'Patineta', 'Autobús',
      'Tractor', 'Yate', 'Globo Aerostático', 'Ambulancia'
    ]
  },
  objetos: {
    nombre: 'Objetos Cotidianos',
    emoji: '📦',
    palabras: [
      'Teléfono', 'Computadora', 'Mesa', 'Silla', 'Televisor', 'Reloj',
      'Cámara', 'Mochila', 'Linterna', 'Auriculares', 'Paraguas', 'Espejo',
      'Guitarra', 'Lentes', 'Billetera', 'Llave'
    ]
  },
  animales: {
    nombre: 'Animales',
    emoji: '🦁',
    palabras: [
      'Perro', 'Gato', 'León', 'Tigre', 'Elefante', 'Caballo',
      'Mono', 'Águila', 'Tiburón', 'Delfín', 'Lobo', 'Oso',
      'Pingüino', 'Serpiente', 'Canguro', 'Búho'
    ]
  },
  comida: {
    nombre: 'Comida y Bebidas',
    emoji: '🍕',
    palabras: [
      'Pizza', 'Hamburguesa', 'Sopa', 'Helado', 'Arroz', 'Pollo',
      'Empanada', 'Torta', 'Tacos', 'Sushi', 'Chocolate', 'Ensalada',
      'Café', 'Manzana', 'Papas Fritas', 'Sandwich'
    ]
  },
  lugares: {
    nombre: 'Lugares',
    emoji: '🏙️',
    palabras: [
      'Hospital', 'Escuela', 'Universidad', 'Cine', 'Restaurante', 'Aeropuerto',
      'Banco', 'Supermercado', 'Biblioteca', 'Playa', 'Estadio', 'Hotel',
      'Museo', 'Parque', 'Castillo', 'Iglesia'
    ]
  },
  profesiones: {
    nombre: 'Profesiones',
    emoji: '👨‍⚕️',
    palabras: [
      'Doctor', 'Ingeniero', 'Profesor', 'Policía', 'Abogado', 'Chef',
      'Mecánico', 'Arquitecto', 'Bombero', 'Astronauta', 'Pintor', 'Piloto',
      'Músico', 'Dentista', 'Fotógrafo', 'Científico'
    ]
  }
};

export const AVATARES_IMPOSTOR = [
  { id: 'espia', emoji: '🕵️‍♂️', nombre: 'Agente Secreto', color: '#3b82f6' },
  { id: 'detective', emoji: '🔍', nombre: 'Detective', color: '#8b5cf6' },
  { id: 'ninja', emoji: '🥷', nombre: 'Sombra Silenciosa', color: '#10b981' },
  { id: 'mago', emoji: '🧙‍♂️', nombre: 'Ilusionista', color: '#ec4899' },
  { id: 'fantasma', emoji: '👻', nombre: 'Espectro', color: '#06b6d4' },
  { id: 'robot', emoji: '🤖', nombre: 'Cyborg', color: '#f59e0b' },
  { id: 'alien', emoji: '👽', nombre: 'Infiltrado Espacial', color: '#84cc16' },
  { id: 'zombie', emoji: '🧟', nombre: 'Caminante', color: '#ef4444' }
];

// Almacén en memoria de salas activas de El Impostor
const salasImpostor = new Map();

// Generar código de sala de 5 caracteres
function generarCodigo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function crearSalaImpostor({ socketId, nombreJugador, avatar, categoria = 'todas', maxJugadores = 8, cantImpostores = 1 }) {
  let codigo = generarCodigo();
  while (salasImpostor.has(codigo)) {
    codigo = generarCodigo();
  }

  const jugadorHost = {
    id: socketId,
    nombre: (nombreJugador || 'Jugador 1').trim().substring(0, 18),
    avatar: avatar || AVATARES_IMPOSTOR[0],
    rol: 'jugador', // 'jugador' | 'impostor'
    vivo: true,
    listoRevelacion: false,
    haDadoPista: false,
    voto: null,
    votosRecibidos: 0
  };

  const sala = {
    codigo,
    hostSocketId: socketId,
    estado: 'LOBBY', // 'LOBBY' | 'REVELACION' | 'PISTAS' | 'VOTACION' | 'RESULTADO' | 'ADIVINAR_PALABRA' | 'TERMINADA'
    categoriaConfig: categoria,
    categoriaActual: null,
    categoriaNombre: null,
    palabraSecreta: null,
    opcionesAdivinar: [], // 4 opciones para el impostor si es descubierto
    maxJugadores: Math.min(Math.max(parseInt(maxJugadores) || 8, 3), 12),
    cantImpostores: Math.min(Math.max(parseInt(cantImpostores) || 1, 1), 2),
    jugadores: [jugadorHost],
    ronda: 1,
    turnoActualSocketId: null,
    pistas: [],
    resultadoUltimaVotacion: null,
    ganador: null, // 'INOCENTES' | 'IMPOSTOR'
    motivoVictoria: '',
    tiempoCreacion: Date.now()
  };

  salasImpostor.set(codigo, sala);
  return sala;
}

export function unirseASalaImpostor({ codigo, socketId, nombreJugador, avatar }) {
  const codigoUpper = (codigo || '').toUpperCase().trim();
  const sala = salasImpostor.get(codigoUpper);

  if (!sala) {
    return { error: 'La sala de El Impostor no existe o ha expirado.' };
  }

  if (sala.estado !== 'LOBBY') {
    return { error: 'La partida ya está en curso. Espera a que termine.' };
  }

  if (sala.jugadores.length >= sala.maxJugadores) {
    return { error: `La sala está llena (máximo ${sala.maxJugadores} jugadores).` };
  }

  // Si ya estaba en la sala con el mismo socket
  const existente = sala.jugadores.find(j => j.id === socketId);
  if (existente) {
    existente.nombre = (nombreJugador || existente.nombre).trim().substring(0, 18);
    if (avatar) existente.avatar = avatar;
    return { sala };
  }

  // Asignar avatar no repetido si es posible
  const avataresUsados = sala.jugadores.map(j => j.avatar?.id);
  const avatarDisponible = AVATARES_IMPOSTOR.find(a => !avataresUsados.includes(a.id)) || AVATARES_IMPOSTOR[sala.jugadores.length % AVATARES_IMPOSTOR.length];

  const nuevoJugador = {
    id: socketId,
    nombre: (nombreJugador || `Jugador ${sala.jugadores.length + 1}`).trim().substring(0, 18),
    avatar: avatar || avatarDisponible,
    rol: 'jugador',
    vivo: true,
    listoRevelacion: false,
    haDadoPista: false,
    voto: null,
    votosRecibidos: 0
  };

  sala.jugadores.push(nuevoJugador);
  return { sala };
}

export function iniciarPartidaImpostor({ codigo, socketId, categoria, cantImpostores }) {
  const sala = salasImpostor.get(codigo);
  if (!sala) return { error: 'Sala no encontrada' };

  if (sala.hostSocketId !== socketId) {
    return { error: 'Solo el anfitrión de la sala puede iniciar la partida.' };
  }

  // Mínimo 3 jugadores (en desarrollo se puede permitir 2 si se fuerza, pero la regla pide 3)
  if (sala.jugadores.length < 3) {
    return { error: 'Se necesitan al menos 3 jugadores para jugar a El Impostor.' };
  }

  if (categoria) sala.categoriaConfig = categoria;
  if (cantImpostores) sala.cantImpostores = Math.min(parseInt(cantImpostores) || 1, Math.floor(sala.jugadores.length / 2));

  // 1. Elegir Categoría y Palabra Secreta
  const categoriasKeys = Object.keys(BANCO_PALABRAS);
  let catKey = sala.categoriaConfig;
  if (!catKey || catKey === 'todas' || !BANCO_PALABRAS[catKey]) {
    catKey = categoriasKeys[Math.floor(Math.random() * categoriasKeys.length)];
  }

  const catData = BANCO_PALABRAS[catKey];
  sala.categoriaActual = catKey;
  sala.categoriaNombre = catData.nombre;

  // Elegir palabra secreta al azar
  const palabrasList = [...catData.palabras];
  const palabraSecreta = palabrasList[Math.floor(Math.random() * palabrasList.length)];
  sala.palabraSecreta = palabraSecreta;

  // Preparar 4 opciones para la adivinanza del impostor (1 correcta + 3 falsas de la misma categoría)
  const otrasPalabras = palabrasList.filter(p => p !== palabraSecreta);
  // Barajar y tomar 3
  otrasPalabras.sort(() => Math.random() - 0.5);
  const opciones = [palabraSecreta, ...otrasPalabras.slice(0, 3)].sort(() => Math.random() - 0.5);
  sala.opcionesAdivinar = opciones;

  // 2. Asignar Roles: Impostor(es) y Jugadores normales
  // Resetear estados
  sala.jugadores.forEach(j => {
    j.rol = 'jugador';
    j.vivo = true;
    j.listoRevelacion = false;
    j.haDadoPista = false;
    j.voto = null;
    j.votosRecibidos = 0;
  });

  // Elegir impostores al azar
  const indicesDisponibles = sala.jugadores.map((_, idx) => idx).sort(() => Math.random() - 0.5);
  const impostoresElegidos = indicesDisponibles.slice(0, sala.cantImpostores);
  impostoresElegidos.forEach(idx => {
    sala.jugadores[idx].rol = 'impostor';
  });

  sala.ronda = 1;
  sala.pistas = [];
  sala.resultadoUltimaVotacion = null;
  sala.ganador = null;
  sala.motivoVictoria = '';
  sala.estado = 'REVELACION';

  return { sala };
}

export function confirmarRevelacionImpostor({ codigo, socketId }) {
  const sala = salasImpostor.get(codigo);
  if (!sala) return { error: 'Sala no encontrada' };

  const jugador = sala.jugadores.find(j => j.id === socketId);
  if (!jugador) return { error: 'Jugador no encontrado' };

  jugador.listoRevelacion = true;

  // Si todos los jugadores activos ya confirmaron que leyeron su rol:
  const todosListos = sala.jugadores.filter(j => j.vivo).every(j => j.listoRevelacion);
  if (todosListos) {
    comenzarRondaPistas(sala);
  }

  return { sala, todosListos };
}

function comenzarRondaPistas(sala) {
  sala.estado = 'PISTAS';
  sala.jugadores.forEach(j => {
    j.haDadoPista = false;
    j.voto = null;
    j.votosRecibidos = 0;
  });

  // El primer turno es del primer jugador vivo
  const vivos = sala.jugadores.filter(j => j.vivo);
  sala.turnoActualSocketId = vivos[0]?.id || null;
}

export function enviarPistaImpostor({ codigo, socketId, texto }) {
  const sala = salasImpostor.get(codigo);
  if (!sala) return { error: 'Sala no encontrada' };

  if (sala.estado !== 'PISTAS') {
    return { error: 'No es momento de enviar pistas.' };
  }

  if (sala.turnoActualSocketId !== socketId) {
    return { error: 'No es tu turno de dar pista.' };
  }

  const jugador = sala.jugadores.find(j => j.id === socketId);
  if (!jugador || !jugador.vivo) {
    return { error: 'Jugador no activo.' };
  }

  const textoLimpio = (texto || '').trim().substring(0, 140) || '🗣️ (Habló en voz alta)';

  sala.pistas.push({
    jugadorId: jugador.id,
    jugadorNombre: jugador.nombre,
    jugadorAvatar: jugador.avatar,
    texto: textoLimpio,
    ronda: sala.ronda,
    timestamp: Date.now()
  });

  jugador.haDadoPista = true;

  // Determinar siguiente turno entre los jugadores vivos que aún no dieron pista
  const vivos = sala.jugadores.filter(j => j.vivo);
  const pendientes = vivos.filter(j => !j.haDadoPista);

  if (pendientes.length > 0) {
    sala.turnoActualSocketId = pendientes[0].id;
  } else {
    // ¡Todos los jugadores vivos han dado su pista! Pasar a VOTACIÓN
    sala.estado = 'VOTACION';
    sala.turnoActualSocketId = null;
  }

  return { sala };
}

export function emitirVotoImpostor({ codigo, socketId, objetivoId }) {
  const sala = salasImpostor.get(codigo);
  if (!sala) return { error: 'Sala no encontrada' };

  if (sala.estado !== 'VOTACION') {
    return { error: 'No está abierta la fase de votación.' };
  }

  const votante = sala.jugadores.find(j => j.id === socketId);
  if (!votante || !votante.vivo) {
    return { error: 'No puedes votar si estás eliminado.' };
  }

  if (socketId === objetivoId) {
    return { error: 'No puedes votarte a ti mismo.' };
  }

  const objetivo = sala.jugadores.find(j => j.id === objetivoId);
  if (!objetivo || !objetivo.vivo) {
    return { error: 'El jugador objetivo no está activo para ser votado.' };
  }

  votante.voto = objetivoId;

  // Comprobar si todos los vivos ya votaron
  const vivos = sala.jugadores.filter(j => j.vivo);
  const totalVotos = vivos.filter(j => j.voto !== null).length;
  const faltanVotar = vivos.length - totalVotos;

  if (faltanVotar === 0) {
    // Procesar resultado de la votación
    procesarResultadoVotacion(sala);
  }

  return { sala, totalVotos, totalVivos: vivos.length, todosVotaron: faltanVotar === 0 };
}

function procesarResultadoVotacion(sala) {
  const vivos = sala.jugadores.filter(j => j.vivo);

  // Reiniciar conteo
  vivos.forEach(j => { j.votosRecibidos = 0; });

  // Contar votos
  vivos.forEach(j => {
    if (j.voto) {
      const obj = vivos.find(o => o.id === j.voto);
      if (obj) obj.votosRecibidos += 1;
    }
  });

  // Ordenar por votos recibidos
  const ordenados = [...vivos].sort((a, b) => b.votosRecibidos - a.votosRecibidos);
  const maxVotos = ordenados[0]?.votosRecibidos || 0;
  const masVotados = ordenados.filter(j => j.votosRecibidos === maxVotos);

  // ¿Hubo empate?
  if (masVotados.length > 1) {
    sala.estado = 'RESULTADO';
    sala.resultadoUltimaVotacion = {
      empate: true,
      masVotados: masVotados.map(j => ({ id: j.id, nombre: j.nombre, votos: j.votosRecibidos })),
      eliminado: null,
      mensaje: `¡Empate entre ${masVotados.map(j => j.nombre).join(' y ')} con ${maxVotos} votos! Nadie es expulsado.`
    };
    return;
  }

  // Hay un jugador eliminado
  const eliminado = masVotados[0];
  eliminado.vivo = false;

  const eraImpostor = eliminado.rol === 'impostor';

  sala.resultadoUltimaVotacion = {
    empate: false,
    eliminado: {
      id: eliminado.id,
      nombre: eliminado.nombre,
      avatar: eliminado.avatar,
      rol: eliminado.rol,
      votos: eliminado.votosRecibidos
    },
    eraImpostor,
    mensaje: eraImpostor
      ? `🎯 ¡ACERTARON! ${eliminado.nombre} ERA EL IMPOSTOR.`
      : `😱 ¡ERROR! ${eliminado.nombre} ERA INOCENTE.`
  };

  if (eraImpostor) {
    // Si era impostor, se le da la oportunidad de adivinar la palabra secreta (plan2.md sección 24)
    sala.estado = 'ADIVINAR_PALABRA';
    sala.impostorDescubiertoId = eliminado.id;
  } else {
    // Era inocente. Comprobar si los impostores vivos superan o igualan a los inocentes
    const vivosRestantes = sala.jugadores.filter(j => j.vivo);
    const impostoresVivos = vivosRestantes.filter(j => j.rol === 'impostor');
    const inocentesVivos = vivosRestantes.filter(j => j.rol === 'jugador');

    if (impostoresVivos.length >= inocentesVivos.length || inocentesVivos.length <= 1) {
      // Victoria del impostor
      sala.estado = 'TERMINADA';
      sala.ganador = 'IMPOSTOR';
      sala.motivoVictoria = 'El impostor manipuló la votación y eliminó a los inocentes.';
    } else {
      // La partida continúa con otra ronda
      sala.estado = 'RESULTADO';
    }
  }
}

export function adivinarPalabraImpostor({ codigo, socketId, palabraAdivinada }) {
  const sala = salasImpostor.get(codigo);
  if (!sala) return { error: 'Sala no encontrada' };

  if (sala.estado !== 'ADIVINAR_PALABRA') {
    return { error: 'No está en fase de adivinar palabra.' };
  }

  if (sala.impostorDescubiertoId !== socketId) {
    return { error: 'Solo el impostor descubierto puede intentar adivinar.' };
  }

  const acerto = (palabraAdivinada || '').trim().toLowerCase() === (sala.palabraSecreta || '').trim().toLowerCase();

  sala.estado = 'TERMINADA';

  if (acerto) {
    sala.ganador = 'IMPOSTOR';
    sala.motivoVictoria = `¡El impostor fue descubierto pero ADIVINÓ la palabra secreta ("${sala.palabraSecreta}")! Robó la victoria.`;
  } else {
    sala.ganador = 'INOCENTES';
    sala.motivoVictoria = `Los inocentes descubrieron al impostor y éste falló al adivinar ("${palabraAdivinada}" vs "${sala.palabraSecreta}"). ¡Victoria de los inocentes!`;
  }

  return { sala, acerto };
}

export function siguienteRondaImpostor({ codigo, socketId }) {
  const sala = salasImpostor.get(codigo);
  if (!sala) return { error: 'Sala no encontrada' };

  if (sala.hostSocketId !== socketId && !sala.jugadores.some(j => j.id === socketId)) {
    return { error: 'No autorizado.' };
  }

  if (sala.estado !== 'RESULTADO') {
    return { error: 'No se puede avanzar en este momento.' };
  }

  sala.ronda += 1;
  comenzarRondaPistas(sala);
  return { sala };
}

export function reiniciarPartidaImpostor({ codigo, socketId }) {
  const sala = salasImpostor.get(codigo);
  if (!sala) return { error: 'Sala no encontrada' };

  if (sala.hostSocketId !== socketId) {
    return { error: 'Solo el anfitrión puede reiniciar la partida.' };
  }

  sala.estado = 'LOBBY';
  sala.palabraSecreta = null;
  sala.categoriaActual = null;
  sala.categoriaNombre = null;
  sala.ronda = 1;
  sala.pistas = [];
  sala.resultadoUltimaVotacion = null;
  sala.ganador = null;
  sala.motivoVictoria = '';
  sala.turnoActualSocketId = null;

  sala.jugadores.forEach(j => {
    j.rol = 'jugador';
    j.vivo = true;
    j.listoRevelacion = false;
    j.haDadoPista = false;
    j.voto = null;
    j.votosRecibidos = 0;
  });

  return { sala };
}

export function desconectarJugadorImpostor(socketId) {
  for (const [codigo, sala] of salasImpostor.entries()) {
    const idx = sala.jugadores.findIndex(j => j.id === socketId);
    if (idx !== -1) {
      const eraHost = sala.hostSocketId === socketId;
      sala.jugadores.splice(idx, 1);

      if (sala.jugadores.length === 0) {
        salasImpostor.delete(codigo);
        return { codigo, eliminada: true };
      }

      if (eraHost) {
        sala.hostSocketId = sala.jugadores[0].id;
      }

      // Si estaba en juego y quedó con menos de 2 jugadores
      if (sala.estado !== 'LOBBY' && sala.jugadores.length < 2) {
        sala.estado = 'TERMINADA';
        sala.motivoVictoria = 'La partida terminó porque no hay suficientes jugadores conectados.';
      }

      return { codigo, sala, eliminada: false };
    }
  }
  return null;
}

export function getSalaImpostorPorCodigo(codigo) {
  return salasImpostor.get((codigo || '').toUpperCase().trim());
}

/**
 * Serializar sala con estricta seguridad anti-trampa (plan2.md sección 8 y 34):
 * NUNCA enviar `palabraSecreta` al impostor mientras el juego no haya terminado.
 */
export function serializarSalaImpostor(sala, targetSocketId) {
  if (!sala) return null;

  const targetJugador = sala.jugadores.find(j => j.id === targetSocketId);
  const esImpostor = targetJugador?.rol === 'impostor';
  const juegoTerminado = sala.estado === 'TERMINADA' || sala.estado === 'ADIVINAR_PALABRA';

  // Ocultar roles de los demás jugadores durante la partida
  const jugadoresPublicos = sala.jugadores.map(j => {
    const soyYo = j.id === targetSocketId;
    return {
      id: j.id,
      nombre: j.nombre,
      avatar: j.avatar,
      vivo: j.vivo,
      haDadoPista: j.haDadoPista,
      haVotado: j.voto !== null,
      votosRecibidos: (sala.estado === 'RESULTADO' || juegoTerminado) ? j.votosRecibidos : 0,
      // Solo mostrar rol propio o al terminar la partida / en resultado de expulsión
      rol: (soyYo || juegoTerminado || (!j.vivo && sala.resultadoUltimaVotacion?.eliminado?.id === j.id)) ? j.rol : 'desconocido'
    };
  });

  return {
    codigo: sala.codigo,
    hostSocketId: sala.hostSocketId,
    estado: sala.estado,
    categoriaConfig: sala.categoriaConfig,
    categoriaNombre: sala.categoriaNombre,
    // PALABRA SECRETA: El impostor NUNCA la recibe a menos que el juego haya terminado
    palabraSecreta: (esImpostor && !juegoTerminado) ? null : sala.palabraSecreta,
    opcionesAdivinar: sala.opcionesAdivinar,
    impostorDescubiertoId: sala.impostorDescubiertoId,
    maxJugadores: sala.maxJugadores,
    cantImpostores: sala.cantImpostores,
    jugadores: jugadoresPublicos,
    ronda: sala.ronda,
    turnoActualSocketId: sala.turnoActualSocketId,
    pistas: sala.pistas,
    resultadoUltimaVotacion: sala.resultadoUltimaVotacion,
    ganador: sala.ganador,
    motivoVictoria: sala.motivoVictoria,
    miRol: targetJugador?.rol || 'espectador'
  };
}
