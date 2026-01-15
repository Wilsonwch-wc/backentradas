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
    puppeteer: puppeteerConfig,
    // Deshabilitar funcionalidades que pueden causar errores
    markOnlineOnConnect: false,
    // Evitar errores con mensajes no leídos
    disableAutoRead: true,
    // Deshabilitar el marcado automático de mensajes como vistos
    markReadOnConnect: false
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

  client.on('ready', async () => {
    console.log('✅ WhatsApp Web está listo!');
    isReady = true;
    qrCodeData = null;
    qrCodeImage = null;
    
    // Intentar deshabilitar sendSeen completamente (opcional, no crítico si falla)
    try {
      if (client && typeof client.pupPage === 'function') {
        const page = await client.pupPage();
        if (page) {
          await page.evaluate(() => {
            // Sobrescribir la función sendSeen para que no haga nada
            if (window.WWebJS && window.WWebJS.sendSeen) {
              window.WWebJS.sendSeen = async function() {
                // No hacer nada, solo retornar éxito silenciosamente
                return Promise.resolve();
              };
            }
          });
          console.log('✅ sendSeen deshabilitado completamente');
        }
      }
    } catch (err) {
      // No crítico si falla, continuar normalmente
      console.warn('⚠️ No se pudo deshabilitar sendSeen (continuando):', err.message);
    }
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
    
    // Obtener el número de WhatsApp actual para comparar
    let numeroWhatsAppActual = null;
    try {
      const info = await client.info;
      if (info && info.wid) {
        const widString = info.wid.user || info.wid.toString();
        numeroWhatsAppActual = widString.replace('@c.us', '').replace('@s.whatsapp.net', '');
        console.log(`📱 Número de WhatsApp actual: ${numeroWhatsAppActual}`);
        console.log(`📱 Número de destino formateado: ${numeroFormateado}`);
        
        // Si el número de destino es el mismo que el actual, es un chat con uno mismo
        const numeroDestinoSinFormato = numeroFormateado.replace('@c.us', '');
        if (numeroWhatsAppActual === numeroDestinoSinFormato) {
          console.log(`ℹ️ Enviando mensaje al mismo número (chat con uno mismo)`);
        }
      }
    } catch (err) {
      console.warn('⚠️ No se pudo obtener el número de WhatsApp actual:', err.message);
    }

    // Enviar el mensaje con timeout
    console.log(`📤 Intentando enviar mensaje de texto a ${numeroFormateado}...`);
    const timestampAntesEnvio = Date.now();
    let mensajeEnviado = null;
    let errorOcurrido = null;
    
    try {
      // Intentar enviar el mensaje directamente
      let resultadoEnvio = null;
      let errorEnEnvio = null;
      
      try {
        console.log(`⏳ Enviando mensaje...`);
        resultadoEnvio = await client.sendMessage(numeroFormateado, mensaje);
        console.log(`✅ Mensaje enviado exitosamente, resultado recibido`);
      } catch (err) {
        errorEnEnvio = err;
        console.log(`⚠️ Error al enviar: ${err.message}`);
        
        // Si el error es solo de markedUnread/sendSeen, el mensaje puede haberse enviado
        if (err.message?.includes('markedUnread') || 
            err.message?.includes('sendSeen') ||
            err.message?.includes('Evaluation failed')) {
          console.log(`⚠️ Error de markedUnread/sendSeen, pero el mensaje puede haberse enviado`);
          // Esperar un momento para que el mensaje se procese
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
          // Para otros errores, lanzar normalmente
          throw err;
        }
      }
      
      // Si tenemos resultado, retornarlo
      if (resultadoEnvio && resultadoEnvio.id) {
        const mensajeId = resultadoEnvio.id?._serialized || resultadoEnvio.id?.id || (typeof resultadoEnvio.id === 'string' ? resultadoEnvio.id : JSON.stringify(resultadoEnvio.id)) || 'ID disponible';
        console.log(`✅ Mensaje de texto enviado exitosamente. ID: ${mensajeId}`);
        return {
          success: true,
          message: 'Mensaje enviado exitosamente por WhatsApp Web',
          telefono: telefono
        };
      }
      
      // Si no hay resultado pero hay error de sendSeen, verificar en el chat
      if (errorEnEnvio && (errorEnEnvio.message?.includes('markedUnread') || 
          errorEnEnvio.message?.includes('sendSeen') ||
          errorEnEnvio.message?.includes('Evaluation failed'))) {
        console.log(`⚠️ Error de markedUnread/sendSeen detectado. Verificando si el mensaje se envió...`);
        // Esperar más tiempo para que el mensaje se procese completamente
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        try {
          const chat = await client.getChatById(numeroFormateado);
          const messages = await chat.fetchMessages({ limit: 15 });
          console.log(`📋 Total de mensajes encontrados: ${messages.length}`);
          
          // Buscar mensaje reciente de texto que coincida con el mensaje enviado
          const ultimoMensaje = messages.find(m => {
            const mensajeTimestamp = m.timestamp ? m.timestamp * 1000 : 0;
            const esReciente = mensajeTimestamp >= timestampAntesEnvio - 120000; // 2 minutos de margen
            const esTexto = m.type === 'chat' && m.fromMe && !m.hasMedia;
            const coincideConMensaje = m.body && mensaje && m.body.includes(mensaje.substring(0, 20));
            console.log(`🔍 Mensaje: fromMe=${m.fromMe}, tipo=${m.type}, timestamp=${mensajeTimestamp} (${new Date(mensajeTimestamp).toISOString()}), esReciente=${esReciente}, esTexto=${esTexto}, coincide=${coincideConMensaje}`);
            return esTexto && esReciente;
          });
          
          if (ultimoMensaje) {
            mensajeEnviado = ultimoMensaje;
            const mensajeId = ultimoMensaje.id?._serialized || ultimoMensaje.id?.id || (typeof ultimoMensaje.id === 'string' ? ultimoMensaje.id : JSON.stringify(ultimoMensaje.id)) || 'ID disponible';
            console.log(`✅ Mensaje encontrado después del error de sendSeen. ID: ${mensajeId}`);
            console.log(`📋 Tipo de mensaje: ${ultimoMensaje.type}, Body: ${ultimoMensaje.body?.substring(0, 50)}...`);
            return {
              success: true,
              message: 'Mensaje enviado exitosamente por WhatsApp Web',
              telefono: telefono,
              warning: 'El mensaje se envió pero hubo un problema menor al marcarlo como visto'
            };
          } else {
            console.error(`❌ No se encontró ningún mensaje reciente de texto en el chat después de 5 segundos`);
            errorOcurrido = errorEnEnvio;
          }
        } catch (checkError) {
          console.error('❌ Error al verificar el mensaje:', checkError.message);
          console.error('❌ Stack:', checkError.stack);
          errorOcurrido = errorEnEnvio;
        }
      } else if (errorEnEnvio) {
        errorOcurrido = errorEnEnvio;
      }
      
      // Si llegamos aquí y hay un error, lanzarlo
      if (errorOcurrido) {
        throw errorOcurrido;
      }
      
      throw new Error('El mensaje no se envió correctamente: no se recibió confirmación');
      
    } catch (sendError) {
      // Si el error NO es de markedUnread, lanzarlo
      if (!sendError.message?.includes('markedUnread') && 
          !sendError.message?.includes('sendSeen') &&
          !sendError.message?.includes('Evaluation failed')) {
        throw sendError;
      }
      
      // Si es de markedUnread pero no encontramos el mensaje, lanzar el error
      throw new Error('Error al enviar el mensaje. El error ocurrió durante el proceso de envío.');
    }

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
 * @param {string} mensajeTexto - Mensaje de texto a enviar primero (para verificar el número)
 * @param {string} mensajeCaption - Mensaje a usar como caption del PDF (opcional, usa mensajeTexto si no se proporciona)
 * @returns {Promise<Object>} - Resultado del envío
 */
export const enviarPDFPorWhatsAppWeb = async (telefono, pdfPath, mensajeTexto = '', mensajeCaption = '') => {
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
    console.log(`📱 Número formateado: ${telefono} -> ${numeroFormateado}`);

    // Leer el archivo PDF
    const pdfBuffer = fs.readFileSync(pdfPath);
    console.log(`📄 PDF leído: ${path.basename(pdfPath)} (${(pdfBuffer.length / 1024).toFixed(2)} KB)`);

    // Crear MessageMedia para el PDF
    const media = new MessageMedia(
      'application/pdf',
      pdfBuffer.toString('base64'),
      path.basename(pdfPath)
    );

    // Verificar que el número está registrado en WhatsApp antes de enviar (opcional)
    // Nota: isRegisteredUser puede no estar disponible en todas las versiones
    try {
      if (client.isRegisteredUser && typeof client.isRegisteredUser === 'function') {
        console.log(`🔍 Verificando si el número ${numeroFormateado} está registrado en WhatsApp...`);
        const numeroExiste = await client.isRegisteredUser(numeroFormateado);
        if (!numeroExiste) {
          throw new Error(`El número ${telefono} no está registrado en WhatsApp`);
        }
        console.log(`✅ Número verificado: ${numeroFormateado} está registrado`);
      } else {
        console.log('⚠️ isRegisteredUser no está disponible, omitiendo verificación');
      }
    } catch (checkError) {
      console.error('❌ Error al verificar número:', checkError.message);
      // Si el error es que no está registrado, lanzarlo
      if (checkError.message.includes('no está registrado')) {
        throw checkError;
      }
      // Si es otro error (método no disponible, etc.), continuar con el envío
      console.warn('⚠️ No se pudo verificar el número, pero continuando con el envío...');
    }

    // Obtener el número de WhatsApp actual para comparar
    let numeroWhatsAppActual = null;
    let esMismoNumero = false;
    try {
      const info = await client.info;
      if (info && info.wid) {
        const widString = info.wid.user || info.wid.toString();
        numeroWhatsAppActual = widString.replace('@c.us', '').replace('@s.whatsapp.net', '');
        const numeroDestinoSinFormato = numeroFormateado.replace('@c.us', '');
        esMismoNumero = numeroWhatsAppActual === numeroDestinoSinFormato;
        console.log(`📱 Número de WhatsApp actual: ${numeroWhatsAppActual}`);
        console.log(`📱 Número de destino: ${numeroDestinoSinFormato}`);
        if (esMismoNumero) {
          console.log(`ℹ️ Enviando al mismo número (chat con uno mismo) - omitiendo mensaje de texto`);
        }
      }
    } catch (err) {
      console.warn('⚠️ No se pudo obtener el número de WhatsApp actual:', err.message);
    }

    // Omitir el mensaje de texto completamente debido a problemas con markedUnread
    // El mensaje de texto no es crítico, podemos enviar directamente el PDF
    console.log(`ℹ️ Omitiendo mensaje de texto (debido a problemas con markedUnread)`);
    console.log(`ℹ️ Enviando directamente el PDF con el mensaje como caption`);

    // Deshabilitar sendSeen antes de enviar el PDF (opcional, no crítico si falla)
    try {
      if (client && typeof client.pupPage === 'function') {
        const page = await client.pupPage();
        if (page) {
          await page.evaluate(() => {
            if (window.WWebJS && window.WWebJS.sendSeen) {
              window.WWebJS.sendSeen = async function() {
                return Promise.resolve();
              };
            }
          });
        }
      }
    } catch (err) {
      // No crítico si falla, continuar con el envío
      console.warn('⚠️ No se pudo deshabilitar sendSeen antes del envío del PDF (continuando):', err.message);
    }

    // SEGUNDO: Enviar el PDF con el mensaje como caption
    // Agregar timeout para evitar que se quede colgado
    console.log(`📤 Paso 2: Intentando enviar PDF a ${numeroFormateado}...`);
    console.log(`📄 Tamaño del PDF: ${media.data ? (media.data.length * 3 / 4) : 'N/A'} bytes (base64)`);
    const captionParaPDF = mensajeCaption || mensajeTexto || '';
    console.log(`💬 Caption: ${captionParaPDF.substring(0, 50)}...`);
    
    // Obtener timestamp antes de enviar para verificar que el mensaje encontrado sea el correcto
    const timestampAntesEnvio = Date.now();
    console.log(`⏰ Timestamp antes del envío: ${timestampAntesEnvio} (${new Date(timestampAntesEnvio).toISOString()})`);
    let mensajeEnviado = null;
    let errorOcurrido = null;
    
    try {
      // Intentar enviar el PDF directamente
      console.log(`⏳ Enviando PDF a ${numeroFormateado}...`);
      console.log(`📄 Media info: mimetype=${media.mimetype}, filename=${media.filename}`);
      
      // Usar un listener de eventos para detectar cuando el mensaje se envía realmente
      let mensajeEnviadoDetectado = false;
      let mensajeEnviadoId = null;
      
      // Crear un listener temporal para detectar mensajes enviados
      const messageListener = (message) => {
        if (message.from === numeroFormateado || message.to === numeroFormateado) {
          if (message.hasMedia && (message.type === 'document' || message.type === 'ptt')) {
            const mensajeTimestamp = message.timestamp ? message.timestamp * 1000 : 0;
            if (mensajeTimestamp >= timestampAntesEnvio - 60000) { // 1 minuto de margen
              console.log(`✅ Mensaje detectado por evento! ID: ${message.id._serialized}`);
              mensajeEnviadoDetectado = true;
              mensajeEnviadoId = message.id._serialized;
            }
          }
        }
      };
      
      // Agregar el listener
      client.on('message_create', messageListener);
      
      try {
        // Intentar enviar el mensaje
        console.log(`📤 Iniciando envío...`);
        const resultado = await client.sendMessage(numeroFormateado, media, { caption: captionParaPDF });
        
        // Si tenemos resultado, el mensaje se envió
        if (resultado && resultado.id) {
          const mensajeId = resultado.id?._serialized || resultado.id?.id || (typeof resultado.id === 'string' ? resultado.id : JSON.stringify(resultado.id)) || 'ID disponible';
          console.log(`✅ PDF enviado exitosamente. ID: ${mensajeId}`);
          client.removeListener('message_create', messageListener);
          return {
            success: true,
            message: 'PDF enviado exitosamente por WhatsApp Web',
            telefono: telefono
          };
        }
      } catch (sendErr) {
        console.log(`⚠️ Error al enviar: ${sendErr.message}`);
        
        // Si el error es de markedUnread, esperar y verificar
        if (sendErr.message?.includes('markedUnread') || 
            sendErr.message?.includes('sendSeen') ||
            sendErr.message?.includes('Evaluation failed')) {
          console.log(`⚠️ Error de markedUnread. Esperando 20 segundos para detectar el mensaje...`);
          
          // Esperar hasta 20 segundos para que el evento se dispare
          for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (mensajeEnviadoDetectado) {
              console.log(`✅ Mensaje detectado por evento después de ${i + 1} segundos!`);
              client.removeListener('message_create', messageListener);
              return {
                success: true,
                message: 'PDF enviado exitosamente por WhatsApp Web',
                telefono: telefono,
                warning: 'El PDF se envió pero hubo un problema menor al marcarlo como visto'
              };
            }
          }
          
          // Si no se detectó por evento, verificar en el chat
          console.log(`🔍 No se detectó por evento, verificando en el chat...`);
          client.removeListener('message_create', messageListener);
          
          try {
            const chat = await client.getChatById(numeroFormateado);
            const messages = await chat.fetchMessages({ limit: 30 });
            console.log(`📋 Total de mensajes en el chat: ${messages.length}`);
            
            // Buscar cualquier mensaje reciente con media
            const ultimoMensaje = messages.find(m => {
              const mensajeTimestamp = m.timestamp ? m.timestamp * 1000 : 0;
              const esReciente = mensajeTimestamp >= timestampAntesEnvio - 300000; // 5 minutos de margen
              const tieneMedia = m.hasMedia && (m.type === 'document' || m.type === 'ptt');
              const esMio = m.fromMe;
              
              console.log(`🔍 Mensaje: fromMe=${esMio}, hasMedia=${m.hasMedia}, tipo=${m.type}, timestamp=${new Date(mensajeTimestamp).toISOString()}, esReciente=${esReciente}`);
              
              return esMio && tieneMedia && esReciente;
            });
            
            if (ultimoMensaje) {
              const mensajeId = ultimoMensaje.id?._serialized || ultimoMensaje.id?.id || (typeof ultimoMensaje.id === 'string' ? ultimoMensaje.id : JSON.stringify(ultimoMensaje.id)) || 'ID disponible';
              console.log(`✅ PDF encontrado en el chat! ID: ${mensajeId}, Tipo: ${ultimoMensaje.type}`);
              return {
                success: true,
                message: 'PDF enviado exitosamente por WhatsApp Web',
                telefono: telefono,
                warning: 'El PDF se envió pero hubo un problema menor al marcarlo como visto'
              };
            } else {
              console.error(`❌ No se encontró ningún mensaje reciente después de 20 segundos`);
              throw new Error('El PDF no se envió. El error de markedUnread ocurrió antes del envío.');
            }
          } catch (checkError) {
            console.error('❌ Error al verificar en el chat:', checkError.message);
            throw checkError;
          }
        } else {
          // Para otros errores, lanzar normalmente
          client.removeListener('message_create', messageListener);
          throw sendErr;
        }
      }
      
      // Limpiar el listener si aún está activo
      client.removeListener('message_create', messageListener);
      
      // Si llegamos aquí sin éxito, lanzar error
      throw new Error('El PDF no se envió correctamente');
      
    } catch (sendError) {
      console.error('❌ Error al enviar PDF:', sendError.message);
      
      // Si el error es relacionado con markedUnread o sendSeen, hacer una verificación final
      if (sendError.message?.includes('markedUnread') || 
          sendError.message?.includes('sendSeen') ||
          sendError.message?.includes('Evaluation failed')) {
        console.log('🔍 Verificación final: consultando el chat una última vez...');
        try {
          const chat = await client.getChatById(numeroFormateado);
          await new Promise(resolve => setTimeout(resolve, 5000));
          const messages = await chat.fetchMessages({ limit: 30 });
          
          // Buscar cualquier mensaje con media reciente
          const ultimoMensaje = messages.find(m => {
            const mensajeTimestamp = m.timestamp ? m.timestamp * 1000 : 0;
            return m.fromMe && m.hasMedia && mensajeTimestamp >= timestampAntesEnvio - 600000; // 10 minutos de margen
          });
          
          if (ultimoMensaje) {
            const mensajeId = ultimoMensaje.id?._serialized || ultimoMensaje.id?.id || (typeof ultimoMensaje.id === 'string' ? ultimoMensaje.id : JSON.stringify(ultimoMensaje.id)) || 'ID disponible';
            console.log(`✅ Mensaje encontrado en verificación final! ID: ${mensajeId}`);
            return {
              success: true,
              message: 'PDF enviado exitosamente por WhatsApp Web',
              telefono: telefono,
              warning: 'El PDF se envió pero hubo un problema menor al marcarlo como visto'
            };
          }
        } catch (verifyError) {
          console.error('❌ Error en verificación final:', verifyError.message);
        }
      }
      
      throw new Error(`Error al enviar el PDF. El error ocurrió durante el proceso de envío. Por favor, intenta reiniciar la sesión de WhatsApp Web.`);
    }

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

