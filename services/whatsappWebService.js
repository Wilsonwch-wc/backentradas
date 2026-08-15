import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
      console.log('✅ Autenticado - verificando conexión...');
      qrCodeData = null;
      qrCodeImage = null;
      
      // Verificar activamente si está conectado (no esperar solo el evento ready)
      let intentos = 0;
      const maxIntentos = 40; // 20 segundos máximo
      
      const verificar = setInterval(async () => {
        intentos++;
        
        // Si ya está listo, detener
        if (isReady) {
          clearInterval(verificar);
          return;
        }
        
        try {
          if (client) {
            const state = await Promise.race([
              client.getState(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
            ]).catch(() => null);
            
            if (state === 'CONNECTED' && !isReady) {
              isReady = true;
              qrCodeData = null;
              qrCodeImage = null;
              
              clearInterval(verificar);
              
              // Obtener número con varios intentos
              setTimeout(async () => {
                try {
                  const info = client.info;
                  if (info && info.wid) {
                    phoneNumber = info.wid.user || info.wid._serialized?.split('@')[0];
                    console.log(`✅ WhatsApp conectado: +${phoneNumber}`);
                  } else {
                    console.log('✅ WhatsApp conectado (número no disponible)');
                  }
                } catch (e) {
                  console.log('✅ WhatsApp conectado');
                }
              }, 1000);
              return;
            }
          }
        } catch (e) {
          // Continuar intentando
        }
        
        if (intentos >= maxIntentos) {
          clearInterval(verificar);
          console.warn('⚠️ Timeout verificando conexión');
        }
      }, 500);
    });

    // Evento: Listo
    client.on('ready', async () => {
      if (isReady) return;
      
      isReady = true;
      qrCodeData = null;
      qrCodeImage = null;
      
      // PARCHE: Deshabilitar sendSeen para evitar error markedUnread
      try {
        if (client.pupPage) {
          await client.pupPage.evaluate(() => {
            if (window.WWebJS && window.WWebJS.sendSeen) {
              window.WWebJS.sendSeen = async () => { return true; };
            }
          });
          console.log('✅ Parche sendSeen aplicado');
        }
      } catch (e) {
        console.log('⚠️ No se pudo aplicar parche sendSeen');
      }
      
      try {
        const info = client.info;
        if (info && info.wid) {
          phoneNumber = info.wid.user || info.wid._serialized?.split('@')[0];
          console.log(`✅ WhatsApp listo: +${phoneNumber}`);
        } else {
          console.log('✅ WhatsApp listo');
        }
      } catch (e) {
        console.log('✅ WhatsApp listo');
      }
    });

    // Evento: Cargando
    client.on('loading_screen', (percent, message) => {
      console.log(`⏳ Cargando: ${percent}%`);
    });

    // Evento: Error de autenticación
    client.on('auth_failure', (msg) => {
      console.error('❌ Error auth:', msg);
      isReady = false;
      phoneNumber = null;
    });

    // Evento: Desconectado
    client.on('disconnected', (reason) => {
      console.log('⚠️ Desconectado:', reason);
      isReady = false;
      phoneNumber = null;
      qrCodeData = null;
      qrCodeImage = null;
      client = null;
      initializing = false;
      authenticatedLogged = false;
      
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
      if (client.pupPage) {
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
        throw initError;
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
          isReady = true;
          qrCodeData = null;
          qrCodeImage = null;
          
          const info = await client.info;
          if (info && info.wid) {
            phoneNumber = info.wid.user || info.wid._serialized?.split('@')[0];
            console.log(`✅ Sesión restaurada: +${phoneNumber}`);
          } else {
            console.log('✅ Sesión restaurada');
          }
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
  if (client && !isReady) {
    try {
      const state = await client.getState();
      if (state === 'CONNECTED') {
        isReady = true;
        qrCodeData = null;
        qrCodeImage = null;
      }
    } catch (e) {
      // Ignorar
    }
  }
  
  // Intentar obtener el número si está conectado pero no tenemos el número
  if (client && isReady && !phoneNumber) {
    try {
      const info = client.info;
      if (info && info.wid) {
        phoneNumber = info.wid.user || info.wid._serialized?.split('@')[0];
        if (phoneNumber) {
          console.log(`📱 Número detectado: +${phoneNumber}`);
        }
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
    
    const destino = numeroRegistrado ? numeroRegistrado._serialized : numero;
    
    try {
      await client.sendMessage(destino, mensaje, { sendSeen: false });
      console.log('✅ Mensaje enviado');
      return { success: true, message: 'Mensaje enviado', telefono };
    } catch (error) {
      if (error.message?.includes('markedUnread') || error.message?.includes('sendSeen')) {
        console.log('✅ Mensaje enviado (sendSeen ignorado)');
        return { success: true, message: 'Mensaje enviado', telefono };
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

    // Obtener ID real del número (puede ser @c.us o @lid según el número)
    let destino = numeroBase;
    try {
      const numId = await client.getNumberId(numeroBase.replace('@c.us', ''));
      if (numId) {
        // Usar el ID tal cual devuelve WhatsApp (NO forzar @c.us ni @lid)
        destino = numId._serialized;
        console.log(`📱 Número verificado: ${destino}`);
      }
    } catch (e) { /* usar numero original */ }

    // Crear media
    const pdfBuffer = fs.readFileSync(pdfPath);
    const fileName = path.basename(pdfPath);
    console.log(`📄 PDF: ${fileName} (${Math.round(pdfBuffer.length / 1024)}KB)`);
    
    const media = new MessageMedia('application/pdf', pdfBuffer.toString('base64'), fileName);
    const caption = mensajeCaption || mensajeTexto || '';

    // Intentar enviar con hasta 2 reintentos en caso de error de chat
    const MAX_REINTENTOS = 2;
    let ultimoError = null;

    for (let intento = 0; intento <= MAX_REINTENTOS; intento++) {
      try {
        if (intento > 0) {
          console.log(`🔄 Reintentando envío PDF (intento ${intento}/${MAX_REINTENTOS}, destino: ${destino})...`);
          await new Promise(resolve => setTimeout(resolve, 3000 * intento));
        }

        await client.sendMessage(destino, media, { 
          caption, 
          sendMediaAsDocument: true,
          sendSeen: false
        });
        console.log(`✅ PDF enviado a ${telefono}`);
        return { success: true, message: 'PDF enviado correctamente', telefono };

      } catch (error) {
        // Error de sendSeen/markedUnread - el mensaje SÍ se envió
        if (error.message?.includes('markedUnread') || error.message?.includes('sendSeen')) {
          console.log(`✅ PDF enviado a ${telefono} (sendSeen ignorado)`);
          return { success: true, message: 'PDF enviado correctamente', telefono };
        }

        // Error "No LID for user": el número necesita formato @c.us directo
        if (error.message?.includes('No LID for user')) {
          console.warn(`⚠️ No LID error (intento ${intento}), cambiando a formato @c.us...`);
          destino = numeroBase; // Forzar el número de teléfono base @c.us
          ultimoError = error;
          continue;
        }

        // Error findChat: el chat no existe aún, reintentar con número base
        if (error.message?.includes('findChat') || error.message?.includes('new chat not found')) {
          console.warn(`⚠️ findChat error (intento ${intento}), reintentando con número base...`);
          destino = numeroBase;
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
