import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { LoadUtils } = require('whatsapp-web.js/src/util/Injected/Utils');
const { ExposeStore } = require('whatsapp-web.js/src/util/Injected/Store');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Estado del servicio
let client = null;
let isReady = false;
let qrCodeData = null;
let qrCodeImage = null;
let phoneNumber = null;
let initializing = false;
let authenticatedLogged = false;  // Para evitar logs duplicados
const authPath = path.join(__dirname, '../.wwebjs_auth');

/**
 * Extrae el número de teléfono del usuario conectado usando varios métodos
 */
const extraerNumero = async () => {
  if (client?.info?.wid?.user) {
    return client.info.wid.user;
  }
  if (client?.info?.wid?._serialized) {
    return client.info.wid._serialized.split('@')[0];
  }
  if (client?.pupPage) {
    try {
      const num = await client.pupPage.evaluate(() => {
        // 1. localStorage last-wid-md (guarda el JID de la sesión activa en formato: 59167958901:XX@s.whatsapp.net)
        const lastWid = window.localStorage?.getItem('last-wid-md');
        if (lastWid) {
          const m = lastWid.match(/(\d+)[:@]/);
          if (m && m[1]) return m[1];
          const m2 = lastWid.match(/^"?(\d+)/);
          if (m2 && m2[1]) return m2[1];
        }
        // 2. localStorage user
        const widUser = window.localStorage?.getItem('wid-user');
        if (widUser && /^\d+$/.test(widUser)) return widUser;

        // 3. Store de WhatsApp Web
        if (window.Store?.Conn?.wid?.user) return window.Store.Conn.wid.user;
        if (window.Store?.User?.getMaybeMePnUser?.()?.user) return window.Store.User.getMaybeMePnUser().user;
        if (window.Store?.User?.getMeUser?.()?.user) return window.Store.User.getMeUser().user;

        return null;
      });
      if (num) return num;
    } catch (_) {}
  }
  return null;
};

/**
 * Fuerza la inyección de Store y WWebJS sin esperar que WhatsApp termine de sincronizar todos los chats
 */
const forzarInyeccionWWeb = async () => {
  if (!client || !client.pupPage) return false;
  try {
    const yaInyectado = await client.pupPage.evaluate(() => {
      return typeof window.Store !== 'undefined' && typeof window.WWebJS !== 'undefined' && typeof window.WWebJS.getChat === 'function';
    }).catch(() => false);

    if (!yaInyectado) {
      // Inyectar Store y Utils de whatsapp-web.js directamente en el contexto del navegador
      await client.pupPage.evaluate(ExposeStore).catch(() => {});
      await client.pupPage.evaluate(LoadUtils).catch(() => {});
    }

    // Parche crítico: asegurar que el remitente (meUser / lidUser) siempre tenga un Wid válido con propiedad 'id'
    // Previene: "Data passed to getter must include an id property... but got undefined at getSender"
    await client.pupPage.evaluate(() => {
      if (window.Store) {
        const getFallbackWid = () => {
          if (window.Store.Conn && window.Store.Conn.wid) {
            return window.Store.Conn.wid;
          }
          if (window.Store.User && typeof window.Store.User.getMeUser === 'function') {
            const me = window.Store.User.getMeUser();
            if (me) return me;
          }
          const lastWid = window.localStorage?.getItem('last-wid-md');
          if (lastWid && window.Store.WidFactory && typeof window.Store.WidFactory.createWid === 'function') {
            try {
              return window.Store.WidFactory.createWid(lastWid);
            } catch (_) {}
          }
          return null;
        };

        if (window.Store.User) {
          const origGetPn = window.Store.User.getMaybeMePnUser;
          window.Store.User.getMaybeMePnUser = function() {
            let res = null;
            try {
              if (typeof origGetPn === 'function') res = origGetPn.apply(this, arguments);
            } catch (_) {}
            return res || getFallbackWid();
          };

          const origGetLid = window.Store.User.getMaybeMeLidUser;
          window.Store.User.getMaybeMeLidUser = function() {
            let res = null;
            try {
              if (typeof origGetLid === 'function') res = origGetLid.apply(this, arguments);
            } catch (_) {}
            return res || getFallbackWid();
          };
        }
      }

      // Parche crítico al enviar archivos (PDF, imágenes): whatsapp-web.js copia la
      // propiedad interna __x_id del modelo de media dentro del objeto del mensaje
      // saliente y con eso reemplaza el id real del Msg. WhatsApp Web falla entonces
      // al resolver el remitente: "Data passed to getter must include an id property
      // (it's how we memoize) but got undefined" en getValidatedSender/getSender.
      // Se limpia __x_id justo antes de que se construya el modelo del mensaje.
      if (window.Store?.SendMessage?.addAndSendMsgToChat && !window.Store.SendMessage.addAndSendMsgToChat.__limpiaIdMedia) {
        const addAndSendOriginal = window.Store.SendMessage.addAndSendMsgToChat;
        const addAndSendParcheado = function (chat, mensaje) {
          if (mensaje && typeof mensaje === 'object') {
            try { delete mensaje.__x_id; } catch (_) {}
          }
          return addAndSendOriginal.apply(this, arguments);
        };
        addAndSendParcheado.__limpiaIdMedia = true;
        window.Store.SendMessage.addAndSendMsgToChat = addAndSendParcheado;
      }

      // Aplicar parche sendSeen
      if (window.WWebJS) {
        window.WWebJS.sendSeen = async () => true;
      }
    }).catch(() => {});

    // Asegurar client.info si aún no está asignado
    if (!client.info || !client.info.wid) {
      try {
        const infoData = await client.pupPage.evaluate(() => {
          const wid = window.Store?.Conn?.wid || 
                      (typeof window.Store?.User?.getMaybeMePnUser === 'function' && window.Store.User.getMaybeMePnUser()) ||
                      (window.Store?.WidFactory && window.localStorage?.getItem('last-wid-md') ? window.Store.WidFactory.createWid(window.localStorage.getItem('last-wid-md')) : null);
          return wid ? { wid } : null;
        });
        if (infoData && infoData.wid) {
          client.info = infoData;
        }
      } catch (_) {}
    }

    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Busca Chrome/Chromium en el sistema
 */
const findChrome = () => {
  const paths = [
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe' : null,
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/lib64/chromium-browser/chromium-browser',
    // Mac
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);
  
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch (e) {
      continue;
    }
  }
  return null;
};

/**
 * Inicializa el cliente de WhatsApp Web
 */
export const inicializarWhatsAppWeb = async () => {
  // Evitar múltiples inicializaciones
  if (client || initializing) {
    return client;
  }
  
  initializing = true;

  try {
    const chromePath = findChrome();
    if (chromePath) {
      console.log(`✅ Chrome: ${chromePath}`);
    } else {
      console.log('⚠️ Chrome no encontrado');
      initializing = false;
      return null;
    }

    // Resetear estado
    isReady = false;
    qrCodeData = null;
    qrCodeImage = null;
    phoneNumber = null;
    authenticatedLogged = false;

    client = new Client({
      authStrategy: new LocalAuth({
        dataPath: authPath
      }),
      webVersionCache: {
        type: 'local'
      },
      takeoverOnConflict: true,
      puppeteer: {
        headless: true,
        executablePath: chromePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        timeout: 60000
      }
    });

    // Evento: QR generado
    client.on('qr', async (qr) => {
      if (isReady) return;
      console.log('📱 QR generado - escanea con WhatsApp');
      console.log('📱 QR data length:', qr?.length || 0);
      qrCodeData = qr;
      try {
        qrCodeImage = await QRCode.toDataURL(qr);
        console.log('✅ QR imagen generada');
      } catch (e) {
        console.error('❌ Error generando QR imagen:', e.message);
        qrCodeImage = null;
      }
    });

    // Evento: Autenticado
    client.on('authenticated', () => {
      if (authenticatedLogged) return;
      authenticatedLogged = true;
      console.log('✅ Autenticado en WhatsApp Web');
      qrCodeData = null;
      qrCodeImage = null;
      
      // Inyectar módulos y extraer número de inmediato sin esperar la sincronización pesada de chats
      setTimeout(async () => {
        try {
          await forzarInyeccionWWeb();
          phoneNumber = await extraerNumero();
          isReady = true;
          console.log(`✅ WhatsApp conectado y listo: +${phoneNumber || '(número sincronizado)'}`);
        } catch (e) {
          console.warn('⚠️ Activando WhatsApp:', e.message);
          isReady = true;
        }
      }, 1500);
    });

    // Evento: Listo
    client.on('ready', async () => {
      isReady = true;
      qrCodeData = null;
      qrCodeImage = null;
      
      await forzarInyeccionWWeb();
      phoneNumber = await extraerNumero();
      if (phoneNumber) {
        console.log(`✅ WhatsApp listo: +${phoneNumber}`);
      } else {
        console.log('✅ WhatsApp listo');
      }
    });

    // Evento: Cargando
    client.on('loading_screen', (percent, message) => {
      console.log(`⏳ Cargando WhatsApp: ${percent}%`);
    });

    // Evento: Error de autenticación
    client.on('auth_failure', (msg) => {
      console.error('❌ Error auth:', msg);
      isReady = false;
      phoneNumber = null;
    });

    // Evento: Desconectado
    client.on('disconnected', async (reason) => {
      console.log('⚠️ Desconectado:', reason);
      isReady = false;
      phoneNumber = null;
      qrCodeData = null;
      qrCodeImage = null;
      
      const oldClient = client;
      client = null;
      initializing = false;
      authenticatedLogged = false;

      if (oldClient) {
        try {
          await oldClient.destroy().catch(() => {});
        } catch (_) {}
      }
      
      // Reconectar después de 5 segundos
      setTimeout(() => {
        if (!client && !initializing) {
          console.log('🔄 Reconectando...');
          inicializarWhatsAppWeb();
        }
      }, 5000);
    });

    // Inicializar con timeout
    console.log('📱 Iniciando WhatsApp...');
    
    try {
      // Timeout de 60 segundos para la inicialización
      await Promise.race([
        client.initialize(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de inicialización')), 60000))
      ]);
      console.log('✅ WhatsApp inicializado');
      
      // Aplicar parche sendSeen inmediatamente
      if (client && client.pupPage) {
        await client.pupPage.evaluate(() => {
          if (window.WWebJS) {
            window.WWebJS.sendSeen = async () => true;
          }
        }).catch(() => {});
      }
    } catch (initError) {
      console.error('❌ Error en initialize():', initError.message);
      // Si hay error pero el cliente existe, puede que aún funcione
      if (!client) {
        return null;
      }
    }
    
    // Esperar un momento para ver el estado
    await new Promise(r => setTimeout(r, 3000));
    
    // Verificar si ya está conectado (sesión guardada)
    if (!isReady && client) {
      try {
        const state = await client.getState();
        console.log('📊 Estado actual:', state);
        
        if (state === 'CONNECTED') {
          qrCodeData = null;
          qrCodeImage = null;
          await forzarInyeccionWWeb();
          phoneNumber = await extraerNumero();
          isReady = true;
          console.log(`✅ Sesión restaurada: +${phoneNumber || '(número sincronizado)'}`);
        } else if (!qrCodeData) {
          console.log('⏳ Esperando QR o conexión...');
        }
      } catch (e) {
        console.log('⏳ WhatsApp iniciando, esperando QR...');
      }
    }

  } catch (error) {
    console.error('❌ Error WhatsApp:', error.message);
    client = null;
    isReady = false;
  } finally {
    initializing = false;
  }

  return client;
};

/**
 * Obtiene el estado del cliente
 */
export const obtenerEstadoWhatsApp = async () => {
  // Verificar estado real si hay cliente
  if (client) {
    try {
      const state = await client.getState();
      if (state === 'CONNECTED') {
        qrCodeData = null;
        qrCodeImage = null;
        await forzarInyeccionWWeb();
        if (!phoneNumber) {
          phoneNumber = await extraerNumero();
        }
        isReady = true;
      }
    } catch (e) {
      // Ignorar
    }
  }
  
  // Intentar obtener el número si está conectado pero no tenemos el número
  if (client && !phoneNumber) {
    try {
      phoneNumber = await extraerNumero();
      if (phoneNumber) {
        console.log(`📱 Número detectado: +${phoneNumber}`);
      }
    } catch (e) {
      // Ignorar
    }
  }
  
  return {
    isReady: isReady,
    qrCode: qrCodeData,
    qrCodeImage: qrCodeImage,
    isInitialized: client !== null,
    numeroWhatsApp: phoneNumber ? `+${phoneNumber}` : null
  };
};

/**
 * Formatea número de teléfono
 */
const formatearNumero = (telefono) => {
  let numero = telefono.trim().replace(/\s+/g, '').replace(/^\+/, '');
  if (!numero.startsWith('591')) {
    numero = '591' + numero;
  }
  return numero + '@c.us';
};

/**
 * Verifica en el navegador que el parche de envío de media siga activo y que el
 * usuario emisor esté resuelto. Deja un rastro en el log para diagnosticar si un
 * envío vuelve a fallar.
 */
const verificarParchesEnvio = async () => {
  if (!client || !client.pupPage) return null;
  try {
    const info = await client.pupPage.evaluate(() => {
      const serializar = (fn) => {
        try { return fn()?._serialized || null; } catch (_) { return null; }
      };
      return {
        parcheMedia: Boolean(window.Store?.SendMessage?.addAndSendMsgToChat?.__limpiaIdMedia),
        meUser: serializar(() => window.Store?.User?.getMaybeMePnUser?.()),
        meLid: serializar(() => window.Store?.User?.getMaybeMeLidUser?.())
      };
    });
    console.log(`🔎 Parche envío media: ${info.parcheMedia ? 'activo' : 'NO aplicado'} | emisor: ${info.meUser || info.meLid || 'sin resolver'}`);
    return info;
  } catch (_) {
    return null;
  }
};

/**
 * Confirma en el navegador que en el chat de destino haya un mensaje saliente reciente.
 * sendMessage puede devolver undefined aunque el envío haya salido bien, así que esta
 * es la única señal disponible para no dar por enviado algo que nunca salió.
 */
const confirmarEnvioEnChat = async (chatId) => {
  if (!client || !client.pupPage) return null;
  try {
    return await client.pupPage.evaluate(async (chatId) => {
      const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
      if (!chat) return { sinChat: true, detalle: 'el chat no existe' };

      const mensajes = typeof chat.msgs?.getModelsArray === 'function' ? chat.msgs.getModelsArray() : [];
      const salientes = mensajes.filter((m) => m.id?.fromMe === true || m.self === 'out' || m.fromMe === true);
      const ultimo = salientes[salientes.length - 1];

      if (!ultimo) return { confirmado: false, detalle: 'sin mensajes salientes en el chat' };

      const segundos = Number(ultimo.t) > 0 ? Math.round(Date.now() / 1000 - Number(ultimo.t)) : null;
      return {
        confirmado: segundos === null || (segundos >= 0 && segundos < 180),
        detalle: `último saliente (${ultimo.type || 'media'}) ${segundos === null ? 'sin marca de tiempo' : `hace ~${segundos}s`}`
      };
    }, chatId);
  } catch (_) {
    return null;
  }
};

/**
 * Envía un mensaje de texto
 */
export const enviarMensajePorWhatsAppWeb = async (telefono, mensaje) => {
  try {
    if (!client || !isReady) {
      return {
        success: false,
        message: 'WhatsApp no está conectado'
      };
    }

    // Asegurar que WWebJS esté inyectado
    await forzarInyeccionWWeb();

    const numero = formatearNumero(telefono);
    console.log(`📤 Enviando mensaje a ${numero}...`);
    
    // Verificar número
    let numeroRegistrado;
    try {
      numeroRegistrado = await client.getNumberId(numero.replace('@c.us', ''));
      if (!numeroRegistrado) {
        return {
          success: false,
          message: 'El número no está registrado en WhatsApp'
        };
      }
    } catch (e) {
      // Continuar de todos modos
    }
    
    // Si numId tiene @c.us usarlo; si tiene @lid, preferir el número telefónico @c.us para evitar error de getChat
    const destino = (numeroRegistrado && numeroRegistrado._serialized && !numeroRegistrado._serialized.includes('@lid'))
      ? numeroRegistrado._serialized
      : numero;
    
    try {
      await client.sendMessage(destino, mensaje, { sendSeen: false });
      console.log('✅ Mensaje enviado');
      return { success: true, message: 'Mensaje enviado', telefono };
    } catch (error) {
      if (error.message?.includes('markedUnread') || error.message?.includes('sendSeen')) {
        console.log('✅ Mensaje enviado (sendSeen ignorado)');
        return { success: true, message: 'Mensaje enviado', telefono };
      }

      // Si falló por getChat o problema con LID, reintentar con el formato @c.us directo
      if (destino !== numero || error.message?.includes('getChat') || error.message?.includes('No LID') || error.message?.includes('findChat')) {
        console.warn(`⚠️ Error al enviar a ${destino} (${error.message}), reintentando con número directo ${numero}...`);
        try {
          await client.sendMessage(numero, mensaje, { sendSeen: false });
          console.log('✅ Mensaje enviado en reintento');
          return { success: true, message: 'Mensaje enviado', telefono };
        } catch (e2) {
          if (e2.message?.includes('markedUnread') || e2.message?.includes('sendSeen')) {
            return { success: true, message: 'Mensaje enviado', telefono };
          }
          throw e2;
        }
      }
      throw error;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return { success: false, message: error.message };
  }
};

/**
 * Envía un PDF
 */
export const enviarPDFPorWhatsAppWeb = async (telefono, pdfPath, mensajeTexto = '', mensajeCaption = '') => {
  try {
    if (!client || !isReady) {
      return { success: false, message: 'WhatsApp no está conectado' };
    }

    if (!fs.existsSync(pdfPath)) {
      return { success: false, message: 'Archivo no encontrado' };
    }

    const numeroBase = formatearNumero(telefono); // ej: 59167958901@c.us
    console.log(`📤 Enviando PDF a ${numeroBase}...`);

    // Obtener ID real del número
    let destino = numeroBase;
    try {
      const numId = await client.getNumberId(numeroBase.replace('@c.us', ''));
      if (numId && numId._serialized) {
        // Si es un @lid, usar el número base @c.us porque sendMessage con media a @lid suele fallar con getChat
        destino = numId._serialized.includes('@lid') ? numeroBase : numId._serialized;
        console.log(`📱 Número verificado: ${destino}`);
      }
    } catch (e) { /* usar numero original */ }

    // Crear media
    const pdfBuffer = fs.readFileSync(pdfPath);
    const fileName = path.basename(pdfPath);
    console.log(`📄 PDF: ${fileName} (${Math.round(pdfBuffer.length / 1024)}KB)`);
    
    const media = new MessageMedia('application/pdf', pdfBuffer.toString('base64'), fileName);
    const caption = mensajeCaption || mensajeTexto || '';

    // Asegurar que los parches (incluido el que limpia __x_id al enviar media) estén aplicados
    await forzarInyeccionWWeb();
    await verificarParchesEnvio();

    // Intentar enviar con hasta 2 reintentos en caso de error de chat
    const MAX_REINTENTOS = 2;
    let ultimoError = null;

    for (let intento = 0; intento <= MAX_REINTENTOS; intento++) {
      try {
        if (intento > 0) {
          console.log(`🔄 Reintentando envío PDF (intento ${intento}/${MAX_REINTENTOS}, destino: ${destino})...`);
          await new Promise(resolve => setTimeout(resolve, 3000 * intento));
        }

        // Asegurar que WWebJS esté inyectado y listo antes de llamar sendMessage
        await forzarInyeccionWWeb();

        const enviado = await client.sendMessage(destino, media, { 
          caption, 
          sendMediaAsDocument: true,
          sendSeen: false
        });

        // La librería puede devolver undefined aunque el mensaje SÍ se haya enviado
        // (no encuentra el modelo por su id), así que no se usa para decidir éxito o
        // fallo: tratar ese undefined como error era lo que provocaba envíos repetidos.
        const confirmacion = await confirmarEnvioEnChat(destino);

        // Único caso que sí es un fallo real: el chat no existe, no se envió nada
        if (!enviado && confirmacion?.sinChat) {
          const errorSinChat = new Error(`No se encontró el chat de ${destino} en WhatsApp Web`);
          errorSinChat.reintentable = true;
          throw errorSinChat;
        }

        const detalle = !confirmacion
          ? 'sin datos de confirmación'
          : confirmacion.confirmado
            ? `confirmado: ${confirmacion.detalle}`
            : `no confirmado: ${confirmacion.detalle}`;

        console.log(enviado
          ? `✅ PDF enviado a ${telefono} (${detalle})`
          : `✅ PDF enviado a ${telefono} (la librería no devolvió el mensaje; ${detalle})`);

        return { success: true, message: 'PDF enviado correctamente', telefono };

      } catch (error) {
        // Error de sendSeen/markedUnread - el mensaje SÍ se envió
        if (error.message?.includes('markedUnread') || error.message?.includes('sendSeen')) {
          console.log(`✅ PDF enviado a ${telefono} (sendSeen ignorado)`);
          return { success: true, message: 'PDF enviado correctamente', telefono };
        }

        // Solo se reintenta con los errores de búsqueda del chat, que ocurren ANTES de
        // enviar. Un "Evaluation failed" puede producirse después de encolar el mensaje,
        // y reintentarlo duplicaría el envío (el cliente recibiría el PDF varias veces).
        if (
          error.reintentable ||
          error.message?.includes('getChat') || 
          error.message?.includes('No LID for user') || 
          error.message?.includes('findChat') || 
          error.message?.includes('new chat not found')
        ) {
          console.warn(`⚠️ Error al enviar a ${destino} (${error.message}) en intento ${intento}. Cambiando a ${numeroBase}...`);
          destino = numeroBase; // Forzar el número de teléfono base @c.us
          ultimoError = error;
          continue;
        }

        ultimoError = error;
        break;
      }
    }

    throw ultimoError;
  } catch (error) {
    console.error('❌ Error al enviar PDF (desde servicio):', error.message);
    return { success: false, message: error.message };
  }
};

/**
 * Reinicia la sesión
 */
export const reiniciarWhatsAppWeb = async () => {
  try {
    if (client) {
      await client.destroy().catch(() => {});
    }
  } catch (e) {
    // Ignorar
  }

  client = null;
  isReady = false;
  initializing = false;
  qrCodeData = null;
  qrCodeImage = null;
  phoneNumber = null;
  authenticatedLogged = false;

  // Borrar sesión guardada
  try {
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
      console.log('🗑️ Sesión eliminada');
    }
  } catch (err) {
    console.error('Error al borrar sesión:', err);
  }

  // Reiniciar
  setTimeout(() => {
    inicializarWhatsAppWeb();
  }, 2000);

  return { success: true, message: 'Sesión reiniciada' };
};

// Inicializar al cargar el módulo
inicializarWhatsAppWeb();
