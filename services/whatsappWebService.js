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

    // Enviar el mensaje con timeout
    console.log(`📤 Intentando enviar mensaje de texto a ${numeroFormateado}...`);
    const timestampAntesEnvio = Date.now();
    let mensajeEnviado = null;
    let errorOcurrido = null;
    
    try {
      // Usar un enfoque que capture el resultado antes del error
      // Envolver en un try-catch más robusto que ignore errores de sendSeen
      let resultadoEnvio = null;
      let errorEnEnvio = null;
      
      try {
        // Intentar enviar directamente sin esperar el sendSeen
        resultadoEnvio = await client.sendMessage(numeroFormateado, mensaje);
        console.log(`✅ Mensaje enviado exitosamente, resultado recibido`);
      } catch (err) {
        errorEnEnvio = err;
        // Si el error es solo de markedUnread/sendSeen, verificar si el mensaje se envió
        if (err.message?.includes('markedUnread') || 
            err.message?.includes('sendSeen') ||
            err.message?.includes('Evaluation failed')) {
          console.log(`⚠️ Error de markedUnread/sendSeen, pero el mensaje puede haberse enviado`);
          // Si tenemos un resultado parcial, usarlo
          if (resultadoEnvio && resultadoEnvio.id) {
            console.log(`✅ Mensaje enviado antes del error de sendSeen`);
          }
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
      const sendPromiseWithCatch = Promise.resolve({ 
        success: false, 
        error: errorEnEnvio, 
        puedeHaberEnviado: true 
      });
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout: El envío tardó demasiado')), 30000); // 30 segundos
      });

      const resultado = await Promise.race([sendPromiseWithCatch, timeoutPromise]);
      
      // Si el mensaje se envió exitosamente
      if (resultado && resultado.success && resultado.result) {
        mensajeEnviado = resultado.result;
        const mensajeId = resultado.result.id?._serialized || resultado.result.id?.id || (typeof resultado.result.id === 'string' ? resultado.result.id : JSON.stringify(resultado.result.id)) || 'ID disponible';
        console.log(`✅ Mensaje de texto enviado exitosamente. ID: ${mensajeId}`);
        return {
          success: true,
          message: 'Mensaje enviado exitosamente por WhatsApp Web',
          telefono: telefono
        };
      }
      
      // Si hay un error pero puede haberse enviado, verificar en el chat
      if (resultado && resultado.puedeHaberEnviado) {
        console.log(`⚠️ Error de markedUnread/sendSeen detectado. Verificando si el mensaje se envió...`);
        // Esperar más tiempo para que el mensaje se procese completamente
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        try {
          const chat = await client.getChatById(numeroFormateado);
          const messages = await chat.fetchMessages({ limit: 10 });
          console.log(`📋 Total de mensajes encontrados: ${messages.length}`);
          
          // Buscar mensaje reciente de texto
          const ultimoMensaje = messages.find(m => {
            const mensajeTimestamp = m.timestamp ? m.timestamp * 1000 : 0;
            const esReciente = mensajeTimestamp >= timestampAntesEnvio - 60000; // 1 minuto de margen
            const esTexto = m.type === 'chat' && m.fromMe && !m.hasMedia;
            console.log(`🔍 Mensaje: fromMe=${m.fromMe}, tipo=${m.type}, timestamp=${mensajeTimestamp} (${new Date(mensajeTimestamp).toISOString()}), esReciente=${esReciente}, esTexto=${esTexto}`);
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
            errorOcurrido = resultado.error;
          }
        } catch (checkError) {
          console.error('❌ Error al verificar el mensaje:', checkError.message);
          console.error('❌ Stack:', checkError.stack);
          errorOcurrido = resultado.error;
        }
      } else {
        errorOcurrido = resultado?.error || new Error('Error desconocido al enviar');
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

    // PRIMERO: Enviar un mensaje de texto para verificar que el número esté disponible
    console.log(`📤 Paso 1: Enviando mensaje de texto a ${numeroFormateado}...`);
    const textoParaEnviar = mensajeTexto || '✅ Su compra se realizó correctamente. Estos son sus boletos:';
    
    try {
      const resultadoTexto = await enviarMensajePorWhatsAppWeb(telefono, textoParaEnviar);
      if (!resultadoTexto.success) {
        console.error(`❌ Error al enviar mensaje de texto: ${resultadoTexto.message}`);
        throw new Error(`No se pudo enviar el mensaje de texto: ${resultadoTexto.message}`);
      }
      console.log(`✅ Mensaje de texto enviado exitosamente`);
      // Esperar un momento antes de enviar el PDF
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (textError) {
      console.error(`❌ Error al enviar mensaje de texto: ${textError.message}`);
      throw new Error(`No se pudo verificar el número. Error: ${textError.message}`);
    }

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
    console.log(`📄 Tamaño del PDF: ${media.length} bytes`);
    const captionParaPDF = mensajeCaption || mensajeTexto || '';
    console.log(`💬 Caption: ${captionParaPDF.substring(0, 50)}...`);
    
    // Obtener timestamp antes de enviar para verificar que el mensaje encontrado sea el correcto
    const timestampAntesEnvio = Date.now();
    console.log(`⏰ Timestamp antes del envío: ${timestampAntesEnvio} (${new Date(timestampAntesEnvio).toISOString()})`);
    let mensajeEnviado = null;
    let errorOcurrido = null;
    
    try {
      // Intentar enviar el mensaje
      const sendPromise = client.sendMessage(numeroFormateado, media, { caption: captionParaPDF });
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout: El envío tardó demasiado')), 60000); // 60 segundos
      });

      // Intentar enviar el mensaje con un enfoque que capture el resultado antes del error
      console.log(`⏳ Esperando respuesta del envío...`);
      
      // Usar Promise.allSettled para capturar el resultado incluso si hay un error después
      const sendPromiseWithCatch = sendPromise
        .then((result) => {
          console.log(`✅ Mensaje enviado exitosamente, resultado recibido`);
          return { success: true, result };
        })
        .catch((err) => {
          // Si el error es solo de markedUnread/sendSeen, no fallar todavía
          if (err.message?.includes('markedUnread') || 
              err.message?.includes('sendSeen') ||
              err.message?.includes('Evaluation failed')) {
            console.log(`⚠️ Error de markedUnread/sendSeen, pero el mensaje puede haberse enviado`);
            return { success: false, error: err, puedeHaberEnviado: true };
          }
          // Para otros errores, lanzar normalmente
          throw err;
        });
      
      try {
        const resultado = await Promise.race([sendPromiseWithCatch, timeoutPromise]);
        
        // Si el mensaje se envió exitosamente
        if (resultado && resultado.success && resultado.result) {
          mensajeEnviado = resultado.result;
          const mensajeId = resultado.result.id?._serialized || resultado.result.id?.id || (typeof resultado.result.id === 'string' ? resultado.result.id : JSON.stringify(resultado.result.id)) || 'ID disponible';
          console.log(`✅ PDF enviado exitosamente. ID del mensaje: ${mensajeId}`);
          return {
            success: true,
            message: 'PDF enviado exitosamente por WhatsApp Web',
            telefono: telefono
          };
        }
        
        // Si hay un error pero puede haberse enviado, verificar en el chat
        if (resultado && resultado.puedeHaberEnviado) {
          console.log(`⚠️ Error de markedUnread/sendSeen detectado. Verificando si el mensaje se envió...`);
          // Esperar más tiempo para que el mensaje se procese completamente
          await new Promise(resolve => setTimeout(resolve, 8000));
          
          try {
            const chat = await client.getChatById(numeroFormateado);
            const messages = await chat.fetchMessages({ limit: 15 });
            console.log(`📋 Total de mensajes encontrados: ${messages.length}`);
            
            // Buscar mensaje reciente que tenga media (documento o imagen)
            const ultimoMensaje = messages.find(m => {
              const mensajeTimestamp = m.timestamp ? m.timestamp * 1000 : 0;
              const esReciente = mensajeTimestamp >= timestampAntesEnvio - 120000; // 2 minutos de margen
              const esDocumento = m.type === 'document' || m.type === 'ptt' || (m.hasMedia && m.type !== 'chat');
              console.log(`🔍 Mensaje: fromMe=${m.fromMe}, hasMedia=${m.hasMedia}, tipo=${m.type}, timestamp=${mensajeTimestamp} (${new Date(mensajeTimestamp).toISOString()}), esReciente=${esReciente}, esDocumento=${esDocumento}`);
              return m.fromMe && esDocumento && esReciente;
            });
            
            if (ultimoMensaje) {
              mensajeEnviado = ultimoMensaje;
              const mensajeId = ultimoMensaje.id?._serialized || ultimoMensaje.id?.id || (typeof ultimoMensaje.id === 'string' ? ultimoMensaje.id : JSON.stringify(ultimoMensaje.id)) || 'ID disponible';
              console.log(`✅ Mensaje encontrado después del error de sendSeen. ID: ${mensajeId}`);
              console.log(`📋 Tipo de mensaje: ${ultimoMensaje.type}, Tiene media: ${ultimoMensaje.hasMedia}, Timestamp: ${ultimoMensaje.timestamp}`);
              return {
                success: true,
                message: 'PDF enviado exitosamente por WhatsApp Web',
                telefono: telefono,
                warning: 'El PDF se envió pero hubo un problema menor al marcarlo como visto'
              };
            } else {
              console.error(`❌ No se encontró ningún mensaje reciente con media en el chat después de 8 segundos`);
              errorOcurrido = resultado.error;
            }
          } catch (checkError) {
            console.error('❌ Error al verificar el mensaje:', checkError.message);
            console.error('❌ Stack:', checkError.stack);
            errorOcurrido = resultado.error;
          }
        } else {
          errorOcurrido = resultado?.error || new Error('Error desconocido al enviar');
        }
      } catch (raceError) {
        errorOcurrido = raceError;
        console.error(`❌ Error durante el envío: ${raceError.message}`);
        
        // Si el error NO es de markedUnread, lanzarlo
        if (!raceError.message?.includes('markedUnread') && 
            !raceError.message?.includes('sendSeen') &&
            !raceError.message?.includes('Evaluation failed')) {
          throw raceError;
        }
      }
      
      // Verificar que el mensaje realmente se envió (debe tener un ID)
      if (mensajeEnviado) {
        // El ID puede ser un objeto, obtener el ID serializado
        const mensajeId = mensajeEnviado.id?._serialized || mensajeEnviado.id?.id || (typeof mensajeEnviado.id === 'string' ? mensajeEnviado.id : JSON.stringify(mensajeEnviado.id)) || 'ID disponible';
        console.log(`✅ PDF enviado exitosamente. ID del mensaje: ${mensajeId}`);
        console.log(`📋 Detalles del mensaje enviado:`, {
          tieneMedia: mensajeEnviado.hasMedia,
          fromMe: mensajeEnviado.fromMe,
          tipo: mensajeEnviado.type,
          timestamp: mensajeEnviado.timestamp
        });
        return {
          success: true,
          message: 'PDF enviado exitosamente por WhatsApp Web',
          telefono: telefono
        };
      }
      
      // Si llegamos aquí y hay un error de markedUnread, verificar en el chat
      if (errorOcurrido && (errorOcurrido.message?.includes('markedUnread') || 
          errorOcurrido.message?.includes('sendSeen') ||
          errorOcurrido.message?.includes('Evaluation failed'))) {
        console.log('🔍 Verificando si el mensaje se envió realmente consultando el chat...');
        console.log(`⏰ Timestamp antes del envío: ${timestampAntesEnvio} (${new Date(timestampAntesEnvio).toISOString()})`);
        try {
          const chat = await client.getChatById(numeroFormateado);
          await new Promise(resolve => setTimeout(resolve, 3000));
          const messages = await chat.fetchMessages({ limit: 10 });
          console.log(`📋 Total de mensajes en el chat: ${messages.length}`);
          
          // Buscar mensaje reciente (enviado después del timestamp) que tenga media
          const ultimoMensaje = messages.find(m => {
            const mensajeTimestamp = m.timestamp ? m.timestamp * 1000 : 0; // Convertir a milisegundos
            const esReciente = mensajeTimestamp >= timestampAntesEnvio - 30000; // 30 segundos de margen
            console.log(`🔍 Mensaje: fromMe=${m.fromMe}, hasMedia=${m.hasMedia}, tipo=${m.type}, timestamp=${mensajeTimestamp} (${new Date(mensajeTimestamp).toISOString()}), esReciente=${esReciente}`);
            return m.fromMe && m.hasMedia && esReciente;
          });
          
          if (ultimoMensaje) {
            // El ID puede ser un objeto, obtener el ID serializado
            const mensajeId = ultimoMensaje.id?._serialized || ultimoMensaje.id?.id || (typeof ultimoMensaje.id === 'string' ? ultimoMensaje.id : JSON.stringify(ultimoMensaje.id)) || 'ID disponible';
            console.log(`✅ Mensaje encontrado en el chat! ID: ${mensajeId}`);
            console.log(`📋 Detalles del mensaje:`, {
              tieneMedia: ultimoMensaje.hasMedia,
              fromMe: ultimoMensaje.fromMe,
              timestamp: ultimoMensaje.timestamp,
              tipo: ultimoMensaje.type,
              mimetype: ultimoMensaje.mimetype || 'N/A'
            });
            return {
              success: true,
              message: 'PDF enviado exitosamente por WhatsApp Web',
              telefono: telefono,
              warning: 'El PDF se envió pero hubo un problema menor al marcarlo como visto'
            };
          } else {
            console.error(`❌ No se encontró ningún mensaje reciente con media después del timestamp ${timestampAntesEnvio}`);
          }
        } catch (verifyError) {
          console.error('❌ Error al verificar mensaje en el chat:', verifyError.message);
        }
      }
      
      // Si no se encontró el mensaje, lanzar el error
      if (errorOcurrido) {
        throw errorOcurrido;
      }
      
      throw new Error('El PDF no se envió correctamente: no se recibió confirmación');
      
    } catch (sendError) {
      console.error('❌ Error al enviar PDF:', sendError.message);
      
      // Si el error es relacionado con markedUnread o sendSeen, verificar una última vez
      if (sendError.message?.includes('markedUnread') || 
          sendError.message?.includes('sendSeen') ||
          sendError.message?.includes('Evaluation failed')) {
        console.log('🔍 Verificación final: consultando el chat...');
        try {
          const chat = await client.getChatById(numeroFormateado);
          await new Promise(resolve => setTimeout(resolve, 4000));
          const messages = await chat.fetchMessages({ limit: 10 });
          // Buscar mensaje reciente (enviado después del timestamp) que tenga media
          const ultimoMensaje = messages.find(m => {
            const mensajeTimestamp = m.timestamp ? m.timestamp * 1000 : 0; // Convertir a milisegundos
            return m.fromMe && m.hasMedia && mensajeTimestamp >= timestampAntesEnvio - 10000; // 10 segundos de margen
          });
          
          if (ultimoMensaje) {
            // El ID puede ser un objeto, obtener el ID serializado
            const mensajeId = ultimoMensaje.id?._serialized || ultimoMensaje.id?.id || (typeof ultimoMensaje.id === 'string' ? ultimoMensaje.id : JSON.stringify(ultimoMensaje.id)) || 'ID disponible';
            console.log(`✅ Mensaje encontrado en verificación final! ID: ${mensajeId}`);
            console.log(`📋 Detalles del mensaje:`, {
              tieneMedia: ultimoMensaje.hasMedia,
              fromMe: ultimoMensaje.fromMe,
              timestamp: ultimoMensaje.timestamp,
              tipo: ultimoMensaje.type,
              body: ultimoMensaje.body?.substring(0, 50) || 'Sin body'
            });
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

