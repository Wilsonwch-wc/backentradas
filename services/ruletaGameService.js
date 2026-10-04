/**
 * Servicio de Lógica Autoritativa del Juego Ruleta (tipo Buckshot Roulette multijugador)
 * Reglas basadas en plan.md:
 * - 2 a 8 jugadores
 * - Salas con código de 5 caracteres
 * - Vida configurable (1 a 10)
 * - Escopeta con cartuchos cargados (🔴) y vacíos (🔵)
 * - 4 objetos del MVP:
 *    1. SALUD (❤️): +1 vida
 *    2. DOBLE_DANO (💥): Siguiente tiro cargado hace 2 de daño
 *    3. ESCUDO (🛡️): Bloquea el siguiente daño
 *    4. VISTA (👁️): Revela en privado si el siguiente tiro es 🔴 o 🔵
 * - Disparo a jugador: si cargado daña; si vacío click sin daño
 * - Dispararse a uno mismo: si vacío conserva el turno; si cargado se daña
 */

const salas = new Map(); // codigoSala -> Sala

const OBJETOS_DISPONIBLES = ['SALUD', 'DOBLE_DANO', 'ESCUDO', 'VISTA'];

// Genera un código de sala de 5 caracteres sin caracteres ambiguos
export const generarCodigoSala = () => {
  const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo = '';
  do {
    codigo = '';
    for (let i = 0; i < 5; i++) {
      codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
  } while (salas.has(codigo));
  return codigo;
};

// Genera secuencia aleatoria de cartuchos para la ronda
const generarCartuchos = (numJugadores) => {
  // Cantidad entre 3 y Math.min(8, 3 + numJugadores)
  const total = Math.min(8, Math.max(3, 2 + Math.floor(Math.random() * 4) + Math.min(2, numJugadores)));
  
  // Al menos 1 cargado y 1 vacío
  const cargadosCount = Math.max(1, Math.min(total - 1, Math.floor(total / 2) + (Math.random() > 0.5 ? 1 : 0)));
  const vaciosCount = total - cargadosCount;

  const lista = [];
  for (let i = 0; i < cargadosCount; i++) lista.push(true);  // true = 🔴 Cargado
  for (let i = 0; i < vaciosCount; i++) lista.push(false);  // false = 🔵 Vacío

  // Barajar
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }

  return {
    cargador: lista,
    infoPublica: {
      cargados: cargadosCount,
      vacios: vaciosCount,
      total: total
    }
  };
};

// Asigna objetos aleatorios a un jugador (máx 4 en inventario)
const darObjetosAleatorios = (jugador, cantidad = 2) => {
  for (let i = 0; i < cantidad; i++) {
    if (jugador.objetos.length < 4) {
      const objeto = OBJETOS_DISPONIBLES[Math.floor(Math.random() * OBJETOS_DISPONIBLES.length)];
      jugador.objetos.push(objeto);
    }
  }
};

export const PERSONAJES_TERROR = [
  { id: 'segador', nombre: 'El Segador', emoji: '💀', titulo: 'Heraldo de la Muerte', color: '#dc2626' },
  { id: 'titiritero', nombre: 'El Titiritero', emoji: '🎭', titulo: 'Manipulador Macabro', color: '#9333ea' },
  { id: 'carnicero', nombre: 'El Carnicero', emoji: '🩸', titulo: 'Descuartizador', color: '#b91c1c' },
  { id: 'hereje', nombre: 'El Hereje', emoji: '👁️', titulo: 'Ojo Maldito', color: '#4f46e5' },
  { id: 'verdugo', nombre: 'El Verdugo', emoji: '🪓', titulo: 'Sin Piedad', color: '#4b5563' },
  { id: 'espectro', nombre: 'El Espectro', emoji: '🩻', titulo: 'Alma en Pena', color: '#0284c7' },
  { id: 'viuda', nombre: 'La Viuda Negra', emoji: '🕷️', titulo: 'Veneno Letal', color: '#701a75' },
  { id: 'impostor', nombre: 'El Impostor', emoji: '👺', titulo: 'Demonio Rojo', color: '#ea580c' }
];

/**
 * Crea una sala
 */
export const crearSala = ({ socketId, nombreJugador, nombreSala = 'Sala de Juego', vidaInicial = 5, maxJugadores = 8, personaje }) => {
  const codigo = generarCodigoSala();
  const vidaValida = Math.max(1, Math.min(10, parseInt(vidaInicial) || 5));
  const maxValido = Math.max(2, Math.min(8, parseInt(maxJugadores) || 8));

  const pjSeleccionado = (personaje && PERSONAJES_TERROR.find(p => p.id === personaje.id)) 
    ? PERSONAJES_TERROR.find(p => p.id === personaje.id) 
    : PERSONAJES_TERROR[0];

  const sala = {
    codigo,
    nombre: nombreSala.trim().slice(0, 25) || 'Sala Ruleta',
    hostId: socketId,
    vidaInicial: vidaValida,
    maxJugadores: maxValido,
    estado: 'LOBBY', // 'LOBBY', 'JUGANDO', 'TERMINADA'
    jugadores: [
      {
        id: socketId,
        nombre: nombreJugador.trim().slice(0, 15) || 'Jugador 1',
        personaje: pjSeleccionado,
        vida: vidaValida,
        vidaMax: vidaValida,
        objetos: [],
        escudoActivo: false,
        conectado: true,
        eliminado: false,
        esHost: true
      }
    ],
    ronda: 1,
    turnoActualSocketId: null,
    ordenTurnos: [],
    cargador: [],
    cartuchosInfo: null,
    dobleDanoActivo: false,
    historial: [],
    ganador: null,
    ultimaAccion: null
  };

  salas.set(codigo, sala);
  return sala;
};

/**
 * Une un jugador a la sala
 */
export const unirseASala = ({ codigo, socketId, nombreJugador, personaje }) => {
  const codigoNorm = (codigo || '').trim().toUpperCase();
  const sala = salas.get(codigoNorm);

  if (!sala) {
    return { error: 'La sala no existe o el código es incorrecto' };
  }

  if (sala.estado !== 'LOBBY') {
    // Si ya comenzó, verificar si se está reconectando
    const jugadorExistente = sala.jugadores.find(j => j.nombre.toLowerCase() === (nombreJugador || '').trim().toLowerCase() && !j.conectado);
    if (jugadorExistente) {
      jugadorExistente.id = socketId;
      jugadorExistente.conectado = true;
      return { sala, reconectado: true };
    }
    return { error: 'La partida ya está en curso' };
  }

  if (sala.jugadores.length >= sala.maxJugadores) {
    return { error: `La sala está llena (máximo ${sala.maxJugadores} jugadores)` };
  }

  const defaultPj = PERSONAJES_TERROR[sala.jugadores.length % PERSONAJES_TERROR.length];
  const pjSeleccionado = (personaje && PERSONAJES_TERROR.find(p => p.id === personaje.id))
    ? PERSONAJES_TERROR.find(p => p.id === personaje.id)
    : defaultPj;

  const nuevoJugador = {
    id: socketId,
    nombre: nombreJugador.trim().slice(0, 15) || `Jugador ${sala.jugadores.length + 1}`,
    personaje: pjSeleccionado,
    vida: sala.vidaInicial,
    vidaMax: sala.vidaInicial,
    objetos: [],
    escudoActivo: false,
    conectado: true,
    eliminado: false,
    esHost: false
  };

  sala.jugadores.push(nuevoJugador);
  return { sala };
};

/**
 * Inicia la partida (Solo el Host)
 */
export const iniciarPartida = ({ codigo, socketId }) => {
  const sala = salas.get(codigo);
  if (!sala) return { error: 'Sala no encontrada' };
  if (sala.hostId !== socketId) return { error: 'Solo el anfitrión puede iniciar la partida' };
  if (sala.jugadores.length < 2) return { error: 'Se necesitan al menos 2 jugadores para iniciar' };

  sala.estado = 'JUGANDO';
  sala.ronda = 1;
  sala.dobleDanoActivo = false;
  sala.ganador = null;

  // Barajar orden de jugadores inicial
  const orden = [...sala.jugadores.map(j => j.id)];
  for (let i = orden.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [orden[i], orden[j]] = [orden[j], orden[i]];
  }
  sala.ordenTurnos = orden;
  sala.turnoActualSocketId = orden[0];

  // Resetear estados y dar objetos iniciales
  sala.jugadores.forEach(j => {
    j.vida = sala.vidaInicial;
    j.vidaMax = sala.vidaInicial;
    j.eliminado = false;
    j.escudoActivo = false;
    j.objetos = [];
    darObjetosAleatorios(j, 2);
  });

  // Generar cartuchos de primera ronda
  const { cargador, infoPublica } = generarCartuchos(sala.jugadores.length);
  sala.cargador = cargador;
  sala.cartuchosInfo = infoPublica;

  sala.historial.push({
    texto: `🎮 ¡Comienza la partida! Ronda 1: ${infoPublica.cargados} cargados 🔴 y ${infoPublica.vacios} vacíos 🔵.`,
    tipo: 'inicio'
  });

  return { sala };
};

/**
 * Avanza al siguiente turno entre jugadores vivos
 */
const avanzarTurno = (sala) => {
  const vivos = sala.jugadores.filter(j => !j.eliminado && j.conectado);
  if (vivos.length <= 1) {
    // Victoria
    sala.estado = 'TERMINADA';
    sala.ganador = vivos[0] || null;
    sala.historial.push({
      texto: `🏆 ¡${sala.ganador ? sala.ganador.nombre : 'Nadie'} ha ganado la partida!`,
      tipo: 'victoria'
    });
    return;
  }

  // Si se acabaron los cartuchos de la ronda actual
  if (sala.cargador.length === 0) {
    sala.ronda++;
    sala.dobleDanoActivo = false;
    
    // Repartir 1 o 2 objetos nuevos a los sobrevivientes
    sala.jugadores.filter(j => !j.eliminado).forEach(j => {
      darObjetosAleatorios(j, 2);
      j.escudoActivo = false; // escudo se resetea por ronda
    });

    const { cargador, infoPublica } = generarCartuchos(vivos.length);
    sala.cargador = cargador;
    sala.cartuchosInfo = infoPublica;

    sala.historial.push({
      texto: `🔄 Ronda ${sala.ronda}: Se recarga la escopeta (${infoPublica.cargados} 🔴 cargados, ${infoPublica.vacios} 🔵 vacíos).`,
      tipo: 'recarga'
    });
  }

  // Buscar siguiente jugador en ordenTurnos
  const indexActual = sala.ordenTurnos.indexOf(sala.turnoActualSocketId);
  let nextIndex = (indexActual + 1) % sala.ordenTurnos.length;
  
  // Buscar el próximo que siga vivo
  let vueltas = 0;
  while (vueltas < sala.ordenTurnos.length) {
    const candidateId = sala.ordenTurnos[nextIndex];
    const jugadorCandidate = sala.jugadores.find(j => j.id === candidateId);
    if (jugadorCandidate && !jugadorCandidate.eliminado && jugadorCandidate.conectado) {
      sala.turnoActualSocketId = candidateId;
      break;
    }
    nextIndex = (nextIndex + 1) % sala.ordenTurnos.length;
    vueltas++;
  }
};

/**
 * Disparar a otro jugador
 */
export const dispararJugador = ({ codigo, socketId, objetivoSocketId }) => {
  const sala = salas.get(codigo);
  if (!sala || sala.estado !== 'JUGANDO') return { error: 'Partida no activa' };
  if (sala.turnoActualSocketId !== socketId) return { error: 'No es tu turno' };

  const tirador = sala.jugadores.find(j => j.id === socketId);
  const objetivo = sala.jugadores.find(j => j.id === objetivoSocketId);

  if (!tirador || !objetivo) return { error: 'Jugadores no válidos' };
  if (objetivo.eliminado) return { error: 'El objetivo ya está eliminado' };
  if (tirador.id === objetivo.id) return { error: 'Usa la acción dispararte a ti mismo' };

  if (sala.cargador.length === 0) return { error: 'No quedan cartuchos' };

  const esCargado = sala.cargador.shift();
  let danoTotal = 0;
  let danoBloqueado = false;

  if (esCargado) {
    const danoBase = sala.dobleDanoActivo ? 2 : 1;
    if (objetivo.escudoActivo) {
      objetivo.escudoActivo = false;
      danoBloqueado = true;
      danoTotal = 0;
      sala.historial.push({
        texto: `🛡️ ${objetivo.nombre} bloqueó el disparo de ${tirador.nombre} con su Escudo.`,
        tipo: 'escudo'
      });
    } else {
      danoTotal = danoBase;
      objetivo.vida = Math.max(0, objetivo.vida - danoTotal);
      if (objetivo.vida === 0) {
        objetivo.eliminado = true;
        sala.historial.push({
          texto: `💥💀 ¡${tirador.nombre} eliminó a ${objetivo.nombre}! (-${danoTotal} vida)`,
          tipo: 'eliminado'
        });
      } else {
        sala.historial.push({
          texto: `💥 ${tirador.nombre} disparó a ${objetivo.nombre} (-${danoTotal} vida).`,
          tipo: 'dano'
        });
      }
    }
  } else {
    sala.historial.push({
      texto: `💨 *CLICK* El cartucho disparado por ${tirador.nombre} hacia ${objetivo.nombre} estaba VACÍO.`,
      tipo: 'vacio'
    });
  }

  // El doble daño se consume tras cualquier disparo
  sala.dobleDanoActivo = false;

  const resultadoAccion = {
    tipoAccion: 'DISPARO_RIVAL',
    tiradorId: tirador.id,
    tiradorNombre: tirador.nombre,
    objetivoId: objetivo.id,
    objetivoNombre: objetivo.nombre,
    esCargado,
    danoTotal,
    danoBloqueado,
    cartuchosRestantes: sala.cargador.length
  };

  sala.ultimaAccion = resultadoAccion;
  avanzarTurno(sala);

  return { sala, resultadoAccion };
};

/**
 * Dispararse a uno mismo
 */
export const dispararseASiMismo = ({ codigo, socketId }) => {
  const sala = salas.get(codigo);
  if (!sala || sala.estado !== 'JUGANDO') return { error: 'Partida no activa' };
  if (sala.turnoActualSocketId !== socketId) return { error: 'No es tu turno' };

  const tirador = sala.jugadores.find(j => j.id === socketId);
  if (!tirador || tirador.eliminado) return { error: 'Acción no permitida' };

  if (sala.cargador.length === 0) return { error: 'No quedan cartuchos' };

  const esCargado = sala.cargador.shift();
  let danoTotal = 0;
  let danoBloqueado = false;
  let conservaTurno = false;

  if (esCargado) {
    const danoBase = sala.dobleDanoActivo ? 2 : 1;
    if (tirador.escudoActivo) {
      tirador.escudoActivo = false;
      danoBloqueado = true;
      sala.historial.push({
        texto: `🛡️ ${tirador.nombre} se disparó, pero su Escudo absorbió el daño.`,
        tipo: 'escudo'
      });
    } else {
      danoTotal = danoBase;
      tirador.vida = Math.max(0, tirador.vida - danoTotal);
      if (tirador.vida === 0) {
        tirador.eliminado = true;
        sala.historial.push({
          texto: `💥💀 ¡${tirador.nombre} se disparó un cartucho CARGADO y quedó ELIMINADO!`,
          tipo: 'eliminado'
        });
      } else {
        sala.historial.push({
          texto: `💥 ¡OUCH! ${tirador.nombre} se disparó a sí mismo (-${danoTotal} vida).`,
          tipo: 'dano'
        });
      }
    }
  } else {
    // ¡ESTRATEGIA BUCKSHOT!: Cartucho vacío en uno mismo = conserva el turno
    conservaTurno = true;
    sala.historial.push({
      texto: `🎯 *CLICK* ¡${tirador.nombre} se disparó un cartucho VACÍO y CONSERVA EL TURNO!`,
      tipo: 'vacio_conserva'
    });
  }

  sala.dobleDanoActivo = false;

  const resultadoAccion = {
    tipoAccion: 'DISPARO_PROPIO',
    tiradorId: tirador.id,
    tiradorNombre: tirador.nombre,
    objetivoId: tirador.id,
    objetivoNombre: tirador.nombre,
    esCargado,
    danoTotal,
    danoBloqueado,
    conservaTurno,
    cartuchosRestantes: sala.cargador.length
  };

  sala.ultimaAccion = resultadoAccion;

  if (!conservaTurno || tirador.eliminado) {
    avanzarTurno(sala);
  } else {
    // Si conserva turno pero se acabaron los cartuchos
    if (sala.cargador.length === 0) {
      avanzarTurno(sala);
    }
  }

  return { sala, resultadoAccion };
};

/**
 * Usar un objeto
 */
export const usarObjeto = ({ codigo, socketId, tipoObjeto }) => {
  const sala = salas.get(codigo);
  if (!sala || sala.estado !== 'JUGANDO') return { error: 'Partida no activa' };
  if (sala.turnoActualSocketId !== socketId) return { error: 'Solo puedes usar objetos en tu turno' };

  const jugador = sala.jugadores.find(j => j.id === socketId);
  if (!jugador || jugador.eliminado) return { error: 'Jugador no válido' };

  const itemIndex = jugador.objetos.indexOf(tipoObjeto);
  if (itemIndex === -1) return { error: 'No posees este objeto en tu inventario' };

  let mensajePrivado = null;

  switch (tipoObjeto) {
    case 'SALUD':
      if (jugador.vida >= jugador.vidaMax) {
        return { error: 'Ya tienes la vida al máximo' };
      }
      jugador.vida = Math.min(jugador.vidaMax, jugador.vida + 1);
      jugador.objetos.splice(itemIndex, 1);
      sala.historial.push({
        texto: `❤️ ${jugador.nombre} usó Salud (+1 vida: ${jugador.vida}/${jugador.vidaMax}).`,
        tipo: 'salud'
      });
      break;

    case 'DOBLE_DANO':
      if (sala.dobleDanoActivo) {
        return { error: 'El doble daño ya está activo para el siguiente disparo' };
      }
      sala.dobleDanoActivo = true;
      jugador.objetos.splice(itemIndex, 1);
      sala.historial.push({
        texto: `💥 ¡${jugador.nombre} activó Doble Daño! El siguiente disparo causará ×2 de daño.`,
        tipo: 'doble_dano'
      });
      break;

    case 'ESCUDO':
      if (jugador.escudoActivo) {
        return { error: 'Ya tienes un escudo activo' };
      }
      jugador.escudoActivo = true;
      jugador.objetos.splice(itemIndex, 1);
      sala.historial.push({
        texto: `🛡️ ${jugador.nombre} activó un Escudo protector.`,
        tipo: 'escudo_activado'
      });
      break;

    case 'VISTA':
      if (sala.cargador.length === 0) {
        return { error: 'No quedan cartuchos en la escopeta' };
      }
      jugador.objetos.splice(itemIndex, 1);
      const siguienteTiro = sala.cargador[0]; // true = cargado, false = vacío
      mensajePrivado = {
        tipo: 'VISTA_RESULTADO',
        siguienteEsCargado: siguienteTiro
      };
      sala.historial.push({
        texto: `👁️ ${jugador.nombre} utilizó la Vista del Cartucho. (Información secreta)`,
        tipo: 'vista'
      });
      break;

    default:
      return { error: 'Objeto desconocido' };
  }

  return { sala, mensajePrivado, objetoUsado: tipoObjeto };
};

/**
 * Obtener estado público de la sala (sin revelar la secuencia interna del cargador)
 */
export const serializarSala = (sala) => {
  if (!sala) return null;
  return {
    codigo: sala.codigo,
    nombre: sala.nombre,
    hostId: sala.hostId,
    vidaInicial: sala.vidaInicial,
    maxJugadores: sala.maxJugadores,
    estado: sala.estado,
    ronda: sala.ronda,
    turnoActualSocketId: sala.turnoActualSocketId,
    cartuchosInfo: sala.cartuchosInfo,
    cartuchosRestantesTotal: sala.cargador ? sala.cargador.length : 0,
    dobleDanoActivo: sala.dobleDanoActivo,
    ganador: sala.ganador,
    ultimaAccion: sala.ultimaAccion,
    historial: sala.historial.slice(-20), // últimos 20 eventos
    jugadores: sala.jugadores.map(j => ({
      id: j.id,
      nombre: j.nombre,
      personaje: j.personaje,
      vida: j.vida,
      vidaMax: j.vidaMax,
      objetos: j.objetos,
      escudoActivo: j.escudoActivo,
      conectado: j.conectado,
      eliminado: j.eliminado,
      esHost: j.esHost
    }))
  };
};

/**
 * Desconectar jugador
 */
export const desconectarJugador = (socketId) => {
  for (const [codigo, sala] of salas.entries()) {
    const jugador = sala.jugadores.find(j => j.id === socketId);
    if (jugador) {
      jugador.conectado = false;

      // Si está en lobby, simplemente eliminarlo de la lista
      if (sala.estado === 'LOBBY') {
        sala.jugadores = sala.jugadores.filter(j => j.id !== socketId);
        // Si el host se fue, pasar el host a otro o borrar sala si vacía
        if (sala.jugadores.length === 0) {
          salas.delete(codigo);
          return { salaEliminada: true, codigo };
        }
        if (sala.hostId === socketId) {
          sala.hostId = sala.jugadores[0].id;
          sala.jugadores[0].esHost = true;
        }
      } else if (sala.estado === 'JUGANDO') {
        sala.historial.push({
          texto: `⚠️ ${jugador.nombre} se ha desconectado.`,
          tipo: 'desconexion'
        });
        // Si era su turno, avanzar al siguiente
        if (sala.turnoActualSocketId === socketId) {
          avanzarTurno(sala);
        }
      }

      return { sala, codigo };
    }
  }
  return {};
};

/**
 * Reiniciar partida para revancha
 */
export const reiniciarPartida = ({ codigo, socketId }) => {
  const sala = salas.get(codigo);
  if (!sala) return { error: 'Sala no encontrada' };
  if (sala.hostId !== socketId) return { error: 'Solo el anfitrión puede reiniciar la partida' };

  sala.estado = 'LOBBY';
  sala.ronda = 1;
  sala.cargador = [];
  sala.cartuchosInfo = null;
  sala.dobleDanoActivo = false;
  sala.ganador = null;
  sala.historial = [{ texto: '🔄 La sala ha sido reiniciada para una nueva partida.', tipo: 'reinicio' }];
  
  sala.jugadores.forEach(j => {
    j.vida = sala.vidaInicial;
    j.vidaMax = sala.vidaInicial;
    j.eliminado = false;
    j.escudoActivo = false;
    j.objetos = [];
  });

  return { sala };
};

export const getSalaPorCodigo = (codigo) => {
  return salas.get((codigo || '').toUpperCase());
};
