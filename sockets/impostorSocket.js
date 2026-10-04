import {
  crearSalaImpostor,
  unirseASalaImpostor,
  iniciarPartidaImpostor,
  confirmarRevelacionImpostor,
  enviarPistaImpostor,
  emitirVotoImpostor,
  adivinarPalabraImpostor,
  siguienteRondaImpostor,
  reiniciarPartidaImpostor,
  desconectarJugadorImpostor,
  serializarSalaImpostor,
  getSalaImpostorPorCodigo,
  BANCO_PALABRAS,
  AVATARES_IMPOSTOR
} from '../services/impostorGameService.js';

export const inicializarImpostorSocket = (io) => {
  const impostorNamespace = io.of('/impostor');

  // Helper para emitir la sala a cada jugador con seguridad anti-trampa personalizada
  const emitirSalaPersonalizada = (sala) => {
    if (!sala || !sala.codigo) return;
    sala.jugadores.forEach(j => {
      const socketCliente = impostorNamespace.sockets.get(j.id);
      if (socketCliente) {
        const vistaPersonalizada = serializarSalaImpostor(sala, j.id);
        socketCliente.emit('sala_actualizada', vistaPersonalizada);
      }
    });
  };

  impostorNamespace.on('connection', (socket) => {
    console.log(`🕵️‍♂️ [Impostor] Jugador conectado socket: ${socket.id}`);

    // Obtener información inicial (categorías y avatares)
    socket.on('get_config_inicial', (callback) => {
      if (typeof callback === 'function') {
        callback({
          categorias: Object.entries(BANCO_PALABRAS).map(([key, val]) => ({
            id: key,
            nombre: val.nombre,
            emoji: val.emoji
          })),
          avatares: AVATARES_IMPOSTOR
        });
      }
    });

    // 1. Crear Sala
    socket.on('crear_sala', (data, callback) => {
      try {
        const { nombreJugador, avatar, categoria, maxJugadores, cantImpostores } = data || {};
        const sala = crearSalaImpostor({
          socketId: socket.id,
          nombreJugador,
          avatar,
          categoria,
          maxJugadores,
          cantImpostores
        });

        socket.join(sala.codigo);
        const vista = serializarSalaImpostor(sala, socket.id);

        if (typeof callback === 'function') {
          callback({ success: true, sala: vista });
        }
      } catch (err) {
        console.error('Error al crear sala Impostor:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // 2. Unirse a Sala
    socket.on('unirse_sala', (data, callback) => {
      try {
        const { codigo, nombreJugador, avatar } = data || {};
        const resultado = unirseASalaImpostor({
          codigo,
          socketId: socket.id,
          nombreJugador,
          avatar
        });

        if (resultado.error) {
          if (typeof callback === 'function') callback({ success: false, error: resultado.error });
          return;
        }

        socket.join(resultado.sala.codigo);
        emitirSalaPersonalizada(resultado.sala);

        const vista = serializarSalaImpostor(resultado.sala, socket.id);
        if (typeof callback === 'function') {
          callback({ success: true, sala: vista });
        }
      } catch (err) {
        console.error('Error al unirse a sala Impostor:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // 3. Iniciar Partida (Host)
    socket.on('iniciar_partida', (data, callback) => {
      try {
        const { codigo, categoria, cantImpostores } = data || {};
        const resultado = iniciarPartidaImpostor({
          codigo,
          socketId: socket.id,
          categoria,
          cantImpostores
        });

        if (resultado.error) {
          if (typeof callback === 'function') callback({ success: false, error: resultado.error });
          return;
        }

        emitirSalaPersonalizada(resultado.sala);
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('Error al iniciar partida Impostor:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // 4. Confirmar que ya vio su rol / palabra secreta
    socket.on('confirmar_revelacion', (data, callback) => {
      try {
        const { codigo } = data || {};
        const resultado = confirmarRevelacionImpostor({ codigo, socketId: socket.id });

        if (resultado.error) {
          if (typeof callback === 'function') callback({ success: false, error: resultado.error });
          return;
        }

        emitirSalaPersonalizada(resultado.sala);
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('Error confirmar revelacion:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // 5. Enviar pista de turno (por mensaje de texto o confirmación de voz)
    socket.on('enviar_pista', (data, callback) => {
      try {
        const { codigo, texto } = data || {};
        const resultado = enviarPistaImpostor({ codigo, socketId: socket.id, texto });

        if (resultado.error) {
          if (typeof callback === 'function') callback({ success: false, error: resultado.error });
          return;
        }

        emitirSalaPersonalizada(resultado.sala);
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('Error enviar pista:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // 6. Emitir voto secreto
    socket.on('emitir_voto', (data, callback) => {
      try {
        const { codigo, objetivoId } = data || {};
        const resultado = emitirVotoImpostor({ codigo, socketId: socket.id, objetivoId });

        if (resultado.error) {
          if (typeof callback === 'function') callback({ success: false, error: resultado.error });
          return;
        }

        emitirSalaPersonalizada(resultado.sala);
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('Error emitir voto:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // 7. Adivinar palabra (Última oportunidad del impostor descubierto)
    socket.on('adivinar_palabra', (data, callback) => {
      try {
        const { codigo, palabra } = data || {};
        const resultado = adivinarPalabraImpostor({
          codigo,
          socketId: socket.id,
          palabraAdivinada: palabra
        });

        if (resultado.error) {
          if (typeof callback === 'function') callback({ success: false, error: resultado.error });
          return;
        }

        emitirSalaPersonalizada(resultado.sala);
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('Error adivinar palabra:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // 8. Siguiente ronda de pistas (cuando eliminaron a un inocente)
    socket.on('siguiente_ronda', (data, callback) => {
      try {
        const { codigo } = data || {};
        const resultado = siguienteRondaImpostor({ codigo, socketId: socket.id });

        if (resultado.error) {
          if (typeof callback === 'function') callback({ success: false, error: resultado.error });
          return;
        }

        emitirSalaPersonalizada(resultado.sala);
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('Error siguiente ronda:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // 9. Reiniciar partida / Jugar de nuevo
    socket.on('reiniciar_partida', (data, callback) => {
      try {
        const { codigo } = data || {};
        const resultado = reiniciarPartidaImpostor({ codigo, socketId: socket.id });

        if (resultado.error) {
          if (typeof callback === 'function') callback({ success: false, error: resultado.error });
          return;
        }

        emitirSalaPersonalizada(resultado.sala);
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('Error reiniciar partida:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // Desconexión
    socket.on('disconnect', () => {
      console.log(`🔌 [Impostor] Jugador desconectado: ${socket.id}`);
      const info = desconectarJugadorImpostor(socket.id);
      if (info && !info.eliminada && info.sala) {
        emitirSalaPersonalizada(info.sala);
      }
    });
  });
};
