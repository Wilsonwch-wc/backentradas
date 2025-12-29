import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let client = null;
let isReady = false;
let qrCodeData = null;
let qrCodeImage = null;
const authPath = path.join(__dirname, '../.wwebjs_auth');

/**
 * Inicializa el cliente de WhatsApp Web
 */
export const inicializarWhatsAppWeb = () => {
  if (client) {
    return client;
  }

  // Detectar la ruta de Chromium/Chrome instalado en el sistema
  // Puppeteer necesita el ejecutable binario, no el script wrapper
  const possibleChromePaths = [
    '/usr/lib64/chromium-browser/chromium-browser',  // Binario ejecutable real (prioridad en AlmaLinux/RHEL)
    '/usr/lib64/chromium-browser/chromium',          // Alternativa
    '/usr/bin/chromium',                              // Ejecutable directo
    '/usr/bin/chromium-browser',                     // Symlink (resolver después)
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ];
  
  let executablePath = null;
  for (const chromePath of possibleChromePaths) {
    if (fs.existsSync(chromePath)) {
      try {
        const stats = fs.statSync(chromePath);
        if (stats.isFile() && !stats.isSymbolicLink()) {
          // Si no es un symlink, usar directamente (probablemente es el binario)
          executablePath = chromePath;
          console.log(`🔍 Chromium encontrado (binario): ${executablePath}`);
          break;
        } else {
          // Resolver symlinks para obtener el binario real
          try {
            const realPath = fs.realpathSync(chromePath);
            console.log(`🔍 Chromium encontrado: ${chromePath} -> ${realPath}`);
            
            // Si el symlink apunta a un script .sh, buscar el binario en el mismo directorio
            if (realPath.endsWith('.sh')) {
              const scriptDir = path.dirname(realPath);
              const chromeBinary = path.join(scriptDir, 'chromium-browser');
              if (fs.existsSync(chromeBinary)) {
                const binStats = fs.statSync(chromeBinary);
                if (binStats.isFile() && !binStats.isSymbolicLink()) {
                  executablePath = chromeBinary;
                  console.log(`✅ Usando binario Chromium: ${executablePath}`);
                  break;
                }
              }
            } else if (fs.existsSync(realPath) && fs.statSync(realPath).isFile()) {
              executablePath = realPath;
              break;
            }
          } catch (e) {
            // Si no se puede resolver, continuar buscando
            continue;
          }
        }
      } catch (e) {
        // Continuar buscando en la siguiente ruta
        continue;
      }
    }
  }
  
  if (!executablePath) {
    console.log('⚠️ Chromium no encontrado en rutas comunes. WhatsApp Web no estará disponible.');
  } else {
    console.log(`✅ Chromium configurado: ${executablePath}`);
  }

  const puppeteerConfig = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  };

  // Si encontramos Chromium en el sistema, usarlo
  if (executablePath) {
    puppeteerConfig.executablePath = executablePath;
  }

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(__dirname, '../.wwebjs_auth')
    }),
    puppeteer: puppeteerConfig
  });

  client.on('qr', async (qr) => {
    // QR code no se muestra en consola - solo se guarda para usar en el navegador
    // console.log('📱 Escanea este código QR con WhatsApp:');
    // qrcode.generate(qr, { small: true });
    qrCodeData = qr;
    
    // Generar QR como imagen base64 para mostrar en el navegador
    try {
      qrCodeImage = await QRCode.toDataURL(qr);
    } catch (error) {
      console.error('Error al generar QR como imagen:', error);
      qrCodeImage = null;
    }
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp Web está listo!');
    isReady = true;
    qrCodeData = null;
    qrCodeImage = null;
  });

  client.on('authenticated', () => {
    console.log('✅ WhatsApp Web autenticado!');
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Error de autenticación:', msg);
    isReady = false;
  });

  client.on('disconnected', (reason) => {
    console.log('⚠️ WhatsApp Web desconectado:', reason);
    isReady = false;
    // No destruir el cliente inmediatamente, intentar reconectar
    if (reason === 'LOGOUT' || reason === 'NAVIGATION') {
      qrCodeData = null;
      qrCodeImage = null;
      client = null;
      // Reinicializar después de un breve delay
      setTimeout(() => {
        if (!client) {
          console.log('🔄 Intentando reconectar WhatsApp Web...');
          inicializarWhatsAppWeb();
        }
      }, 5000);
    } else {
      // Para otros tipos de desconexión, intentar reconectar
      setTimeout(() => {
        if (client && !isReady) {
          console.log('🔄 Intentando reconectar WhatsApp Web...');
          client.initialize().catch(err => {
            console.error('❌ Error al reconectar:', err.message);
          });
        }
      }, 5000);
    }
  });

  // Inicializar el cliente
  client.initialize().catch(err => {
    // Manejar diferentes tipos de errores de inicialización
    const errorMsg = err.message || err.toString();
    
    if (errorMsg.includes('ERR_INTERNET_DISCONNECTED') || 
        errorMsg.includes('net::ERR_INTERNET_DISCONNECTED')) {
      console.warn('⚠️ WhatsApp Web: Sin conexión a internet (se puede ignorar)');
    } else if (errorMsg.includes('Could not find expected browser') || 
               errorMsg.includes('chromium') || 
               errorMsg.includes('chrome')) {
      // Error de Chromium - WhatsApp Web no estará disponible, pero no es crítico
      console.warn('⚠️ WhatsApp Web: Chromium no disponible. El envío automático por WhatsApp no funcionará.');
      console.warn('   (El resto de la aplicación funciona normalmente. Para habilitar WhatsApp Web, instala puppeteer completo: npm install puppeteer)');
    } else {
      // Otros errores
      console.error('❌ Error al inicializar WhatsApp Web:', err.message);
    }
  });

  return client;
};

/**
 * Obtiene el estado del cliente de WhatsApp Web
 */
export const obtenerEstadoWhatsApp = async () => {
  let isActuallyReady = isReady;
  let numeroWhatsApp = null;
  
  // Verificar si el cliente está realmente conectado
  if (client && isReady) {
    try {
      const info = await client.info;
      isActuallyReady = !!(info && info.wid);
      if (info && info.wid) {
        // Extraer el número de teléfono del wid (formato: "XXXXXXXXXX@c.us")
        const widString = info.wid.user || info.wid.toString();
        numeroWhatsApp = widString.replace('@c.us', '').replace('@s.whatsapp.net', '');
        // Formatear el número con el código de país
        if (numeroWhatsApp.startsWith('591')) {
          numeroWhatsApp = '+' + numeroWhatsApp;
        } else if (!numeroWhatsApp.startsWith('+')) {
          numeroWhatsApp = '+591' + numeroWhatsApp;
        }
      }
    } catch (err) {
      // Si hay error al obtener info, el cliente no está realmente listo
      isActuallyReady = false;
      isReady = false;
      console.log('⚠️ Cliente marcado como no listo después de verificar estado');
    }
  }
  
  return {
    isReady: isActuallyReady,
    qrCode: qrCodeData,
    qrCodeImage: qrCodeImage,
    isInitialized: client !== null,
    numeroWhatsApp: numeroWhatsApp
  };
};

/**
 * Formatea un número de teléfono para WhatsApp
 */
const formatearNumero = (telefono) => {
  let numero = telefono.trim().replace(/\s+/g, '');
  
  // Remover prefijos comunes
  numero = numero.replace(/^whatsapp:/, '');
  numero = numero.replace(/^\+/, '');
  
  // Si no tiene código de país, asumir que es Bolivia (+591)
  if (!numero.startsWith('591')) {
    numero = '591' + numero;
  }
  
  return numero + '@c.us';
};

/**
 * Envía un mensaje de texto por WhatsApp Web
 * @param {string} telefono - Número de teléfono del cliente
 * @param {string} mensaje - Mensaje a enviar
 * @returns {Promise<Object>} - Resultado del envío
 */
export const enviarMensajePorWhatsAppWeb = async (telefono, mensaje) => {
  try {
    // Verificar que el cliente esté listo y realmente conectado
    if (!client) {
      console.log('⚠️ Cliente de WhatsApp Web no existe, reinicializando...');
      inicializarWhatsAppWeb();
      return {
        success: false,
        message: 'WhatsApp Web no está inicializado. Por favor, espera unos segundos e intenta nuevamente.'
      };
    }

    // Verificar que el cliente esté listo
    if (!isReady) {
      try {
        const info = await client.info;
        if (!info) {
          throw new Error('Cliente no conectado');
        }
        isReady = true;
      } catch (err) {
        return {
          success: false,
          message: 'WhatsApp Web no está listo. Por favor, escanea el código QR primero.'
        };
      }
    }

    // Verificación adicional: intentar obtener el estado del cliente
    try {
      const info = await client.info;
      if (!info || !info.wid) {
        throw new Error('Cliente no autenticado');
      }
    } catch (err) {
      console.error('❌ Cliente no autenticado:', err.message);
      isReady = false;
      return {
        success: false,
        message: 'WhatsApp Web no está autenticado. Por favor, escanea el código QR nuevamente.'
      };
    }

    // Formatear número
    const numeroFormateado = formatearNumero(telefono);

    // Enviar el mensaje con timeout
    const sendPromise = client.sendMessage(numeroFormateado, mensaje);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout: El envío tardó demasiado')), 30000); // 30 segundos
    });

    await Promise.race([sendPromise, timeoutPromise]);

    return {
      success: true,
      message: 'Mensaje enviado exitosamente por WhatsApp Web',
      telefono: telefono
    };

  } catch (error) {
    console.error('❌ Error al enviar mensaje por WhatsApp Web:', error);
    
    // Si el error es de conexión, marcar como no listo
    if (error.message?.includes('Protocol error') || 
        error.message?.includes('ERR_HTTP2_PROTOCOL_ERROR') ||
        error.message?.includes('Session closed') ||
        error.message?.includes('not authenticated')) {
      isReady = false;
      console.log('⚠️ Cliente marcado como no listo debido a error de conexión');
    }
    
    return {
      success: false,
      message: error.message || 'Error al enviar el mensaje',
      error: error.message
    };
  }
};

/**
 * Envía un PDF por WhatsApp Web
 * @param {string} telefono - Número de teléfono del cliente
 * @param {string} pdfPath - Ruta del archivo PDF
 * @param {string} mensaje - Mensaje a enviar junto con el PDF
 * @returns {Promise<Object>} - Resultado del envío
 */
export const enviarPDFPorWhatsAppWeb = async (telefono, pdfPath, mensaje = '') => {
  try {
    // Verificar que el cliente esté listo y realmente conectado
    if (!client) {
      // Intentar reinicializar si no hay cliente
      console.log('⚠️ Cliente de WhatsApp Web no existe, reinicializando...');
      inicializarWhatsAppWeb();
      throw new Error('WhatsApp Web no está inicializado. Por favor, espera unos segundos e intenta nuevamente.');
    }

    // Verificar que el cliente esté listo
    if (!isReady) {
      // Verificar si el cliente está realmente conectado
      try {
        const info = await client.info;
        if (!info) {
          throw new Error('Cliente no conectado');
        }
        // Si tiene info, actualizar isReady
        isReady = true;
      } catch (err) {
        // El cliente no está realmente listo
        throw new Error('WhatsApp Web no está listo. Por favor, escanea el código QR primero.');
      }
    }

    // Verificación adicional: intentar obtener el estado del cliente
    try {
      const info = await client.info;
      if (!info || !info.wid) {
        throw new Error('Cliente no autenticado');
      }
    } catch (err) {
      console.error('❌ Cliente no autenticado:', err.message);
      isReady = false;
      throw new Error('WhatsApp Web no está autenticado. Por favor, escanea el código QR nuevamente.');
    }

    // Verificar que el archivo existe
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`El archivo PDF no existe: ${pdfPath}`);
    }

    // Formatear número
    const numeroFormateado = formatearNumero(telefono);

    // Leer el archivo PDF
    const pdfBuffer = fs.readFileSync(pdfPath);

    // Crear MessageMedia para el PDF
    const media = new MessageMedia(
      'application/pdf',
      pdfBuffer.toString('base64'),
      path.basename(pdfPath)
    );

    // Enviar el PDF con el mensaje como caption
    // Agregar timeout para evitar que se quede colgado
    const sendPromise = client.sendMessage(numeroFormateado, media, { caption: mensaje });
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout: El envío tardó demasiado')), 60000); // 60 segundos
    });

    await Promise.race([sendPromise, timeoutPromise]);

    return {
      success: true,
      message: 'PDF enviado exitosamente por WhatsApp Web',
      telefono: telefono
    };

  } catch (error) {
    console.error('❌ Error al enviar PDF por WhatsApp Web:', error);
    
    // Si el error es de conexión, marcar como no listo
    if (error.message?.includes('Protocol error') || 
        error.message?.includes('ERR_HTTP2_PROTOCOL_ERROR') ||
        error.message?.includes('Session closed') ||
        error.message?.includes('not authenticated')) {
      isReady = false;
      console.log('⚠️ Cliente marcado como no listo debido a error de conexión');
    }
    
    return {
      success: false,
      message: error.message || 'Error al enviar el PDF',
      error: error.message
    };
  }
};

/**
 * Reinicia la sesión de WhatsApp Web borrando las credenciales guardadas
 */
export const reiniciarWhatsAppWeb = async () => {
  try {
    // Destruir cliente si existe
    if (client) {
      await client.destroy().catch(() => {});
    }
  } catch (e) {
    console.error('Error al destruir cliente de WhatsApp:', e);
  }

  client = null;
  isReady = false;
  qrCodeData = null;
  qrCodeImage = null;

  // Borrar carpeta de autenticación para forzar nuevo login
  try {
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
      console.log('🧹 Sesión de WhatsApp Web eliminada');
    }
  } catch (err) {
    console.error('Error al borrar datos de sesión:', err);
  }

  // Re-inicializar para generar nuevo QR
  inicializarWhatsAppWeb();

  return { success: true, message: 'Sesión reiniciada. Escanea el nuevo código QR.' };
};

// Inicializar automáticamente al importar el módulo
inicializarWhatsAppWeb();

