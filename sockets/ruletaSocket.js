import {
  crearSala,
  unirseASala,
  iniciarPartida,
  dispararJugador,
  dispararseASiMismo,
  usarObjeto,
  serializarSala,
  desconectarJugador,
  reiniciarPartida,
  getSalaPorCodigo
} from '../services/ruletaGameService.js';

export const inicializarRuletaSocket = (io) => {
  // Namespace o prefijo de eventos para la Ruleta
  const ruletaNamespace = io.of('/ruleta');

  ruletaNamespace.on('connection', (socket) => {
    console.log(`🎮 [Ruleta] Jugador conectado socket: ${socket.id}`);

    // Crear sala
    socket.on('crear_sala', (data, callback) => {
      try {
        const { nombreJugador, nombreSala, vidaInicial, maxJugadores, personaje } = data || {};
        const sala = crearSala({
          socketId: socket.id,
          nombreJugador: nombreJugador || 'Jugador 1',
          nombreSala,
          vidaInicial,
          maxJugadores,
          personaje
        });

        socket.join(sala.codigo);
        const salaPublica = serializarSala(sala);

        if (typeof callback === 'function') {
          callback({ success: true, sala: salaPublica });
        }
      } catch (err) {
        console.error('Error al crear sala:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // Unirse a sala
    socket.on('unirse_sala', (data, callback) => {
      try {
        const { codigo, nombreJugador, personaje } = data || {};
        const resultado = unirseASala({
          codigo,
          socketId: socket.id,
          nombreJugador: nombreJugador || 'Jugador',
          personaje
        });

        if (resultado.error) {
          if (typeof callback === 'function') callback({ success: false, error: resultado.error });
          return;
        }

        socket.join(resultado.sala.codigo);
        const salaPublica = serializarSala(resultado.sala);

        // Notificar a toda la sala
        ruletaNamespace.to(resultado.sala.codigo).emit('sala_actualizada', salaPublica);

        if (typeof callback === 'function') {
          callback({ success: true, sala: salaPublica });
        }
      } catch (err) {
        console.error('Error al unirse a sala:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // Iniciar partida (Host)
    socket.on('iniciar_partida', (data, callback) => {
      try {
        const { codigo } = data || {};
        const resultado = iniciarPartida({ codigo, socketId: socket.id });

        if (resultado.error) {
          if (typeof callback === 'function') callback({ success: false, error: resultado.error });
          return;
        }

        const salaPublica = serializarSala(resultado.sala);
        ruletaNamespace.to(codigo).emit('partida_iniciada', salaPublica);

        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('Error al iniciar partida:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // Disparar a otro jugador
    socket.on('disparar_jugador', (data, callback) => {
      try {
        const { codigo, objetivoSocketId } = data || {};
        const resultado = dispararJugador({ codigo, socketId: socket.id, objetivoSocketId });

        if (resultado.error) {
          if (typeof callback === 'function') callback({ success: false, error: resultado.error });
          return;
        }

        const salaPublica = serializarSala(resultado.sala);
        ruletaNamespace.to(codigo).emit('evento_disparo', {
          resultadoAccion: resultado.resultadoAccion,
          sala: salaPublica
        });

        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('Error al disparar jugador:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // Dispararse a uno mismo
    socket.on('dispararse_a_si_mismo', (data, callback) => {
      try {
        const { codigo } = data || {};
        const resultado = dispararseASiMismo({ codigo, socketId: socket.id });

        if (resultado.error) {
          if (typeof callback === 'function') callback({ success: false, error: resultado.error });
          return;
        }

        const salaPublica = serializarSala(resultado.sala);
        ruletaNamespace.to(codigo).emit('evento_disparo', {
          resultadoAccion: resultado.resultadoAccion,
          sala: salaPublica
        });

        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('Error al dispararse:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // Usar objeto
    socket.on('usar_objeto', (data, callback) => {
      try {
        const { codigo, tipoObjeto } = data || {};
        const resultado = usarObjeto({ codigo, socketId: socket.id, tipoObjeto });

        if (resultado.error) {
          if (typeof callback === 'function') callback({ success: false, error: resultado.error });
          return;
        }

        const salaPublica = serializarSala(resultado.sala);

        // Si es VISTA, enviar información secreta solo al socket que lo usó
        if (resultado.mensajePrivado) {
          socket.emit('informacion_secreta', resultado.mensajePrivado);
        }

        const usuarioNombre = resultado.sala.jugadores.find(j => j.id === socket.id)?.nombre || 'Un jugador';
        // Notificar a todos que se usó el objeto
        ruletaNamespace.to(codigo).emit('objeto_usado', {
          tipoObjeto: resultado.objetoUsado,
          usuarioSocketId: socket.id,
          jugadorNombre: usuarioNombre,
          sala: salaPublica
        });

        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('Error al usar objeto:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // Reiniciar partida (Host)
    socket.on('reiniciar_partida', (data, callback) => {
      try {
        const { codigo } = data || {};
        const resultado = reiniciarPartida({ codigo, socketId: socket.id });

        if (resultado.error) {
          if (typeof callback === 'function') callback({ success: false, error: resultado.error });
          return;
        }

        const salaPublica = serializarSala(resultado.sala);
        ruletaNamespace.to(codigo).emit('partida_reiniciada', salaPublica);

        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('Error al reiniciar partida:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // Desconexión
    socket.on('disconnect', () => {
      console.log(`🔌 [Ruleta] Jugador desconectado: ${socket.id}`);
      const resultado = desconectarJugador(socket.id);
      if (resultado.codigo && !resultado.salaEliminada && resultado.sala) {
        const salaPublica = serializarSala(resultado.sala);
        ruletaNamespace.to(resultado.codigo).emit('sala_actualizada', salaPublica);
      }
    });
  });
};
