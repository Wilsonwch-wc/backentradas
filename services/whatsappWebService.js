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

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(__dirname, '../.wwebjs_auth')
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
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
    client = null;
    // Si la sesión se cerró desde el teléfono, limpiamos QR para que se regenere
    if (reason === 'LOGOUT' || reason === 'NAVIGATION') {
      qrCodeData = null;
      qrCodeImage = null;
    }
  });

  // Inicializar el cliente
  client.initialize().catch(err => {
    // Solo mostrar error si no es por falta de conexión a internet
    if (!err.message.includes('ERR_INTERNET_DISCONNECTED') && 
        !err.message.includes('net::ERR_INTERNET_DISCONNECTED')) {
      console.error('❌ Error al inicializar WhatsApp Web:', err.message);
    } else {
      console.warn('⚠️ WhatsApp Web no puede inicializarse: Sin conexión a internet (puedes ignorar esto)');
    }
  });

  return client;
};

/**
 * Obtiene el estado del cliente de WhatsApp Web
 */
export const obtenerEstadoWhatsApp = () => {
  return {
    isReady,
    qrCode: qrCodeData,
    qrCodeImage: qrCodeImage,
    isInitialized: client !== null
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
 * Envía un PDF por WhatsApp Web
 * @param {string} telefono - Número de teléfono del cliente
 * @param {string} pdfPath - Ruta del archivo PDF
 * @param {string} mensaje - Mensaje a enviar junto con el PDF
 * @returns {Promise<Object>} - Resultado del envío
 */
export const enviarPDFPorWhatsAppWeb = async (telefono, pdfPath, mensaje = '') => {
  try {
    // Verificar que el cliente esté listo
    if (!client || !isReady) {
      throw new Error('WhatsApp Web no está listo. Por favor, escanea el código QR primero.');
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
    await client.sendMessage(numeroFormateado, media, { caption: mensaje });

    return {
      success: true,
      message: 'PDF enviado exitosamente por WhatsApp Web',
      telefono: telefono
    };

  } catch (error) {
    console.error('❌ Error al enviar PDF por WhatsApp Web:', error);
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

