import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Crea un transporter de nodemailer
 * Configuración desde variables de entorno
 */
const crearTransporter = () => {
  // Configuración desde variables de entorno
  const config = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true para 465, false para otros puertos
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  };

  // Si no hay credenciales configuradas, retornar null
  if (!config.auth.user || !config.auth.pass) {
    return null;
  }

  return nodemailer.createTransport(config);
};

/**
 * Envía un boleto PDF por correo electrónico
 * @param {string} email - Email del destinatario
 * @param {string} nombreCliente - Nombre del cliente
 * @param {string} pdfPath - Ruta del archivo PDF
 * @param {Object} datosCompra - Datos de la compra (evento, código, etc.)
 * @returns {Promise<Object>} - Resultado del envío
 */
export const enviarBoletoPorEmail = async (email, nombreCliente, pdfPath, datosCompra) => {
  try {
    const transporter = crearTransporter();

    if (!transporter) {
      return {
        success: false,
        message: 'Servicio de correo no configurado. Por favor, configura las variables SMTP en el archivo .env'
      };
    }

    // Verificar que el archivo PDF existe
    if (!fs.existsSync(pdfPath)) {
      return {
        success: false,
        message: `El archivo PDF no existe: ${pdfPath}`
      };
    }

    // Leer el archivo PDF
    const pdfBuffer = fs.readFileSync(pdfPath);
    const nombreArchivo = path.basename(pdfPath);

    // Formatear fecha del evento
    const fechaEvento = datosCompra.fechaEvento 
      ? new Date(datosCompra.fechaEvento).toLocaleDateString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : 'Fecha no disponible';

    // Crear el contenido del email
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #2563eb;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
          }
          .content {
            background-color: #f9fafb;
            padding: 20px;
            border-radius: 0 0 8px 8px;
          }
          .info-box {
            background-color: white;
            padding: 15px;
            margin: 15px 0;
            border-radius: 5px;
            border-left: 4px solid #2563eb;
          }
          .footer {
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>✅ ¡Gracias por tu compra!</h1>
        </div>
        <div class="content">
          <p>Hola <strong>${nombreCliente}</strong>,</p>
          
          <p>Tu comprobante fue procesado correctamente. Adjuntamos tu boleto en formato PDF.</p>
          
          <div class="info-box">
            <h3>📅 Detalles del Evento</h3>
            <p><strong>Evento:</strong> ${datosCompra.tituloEvento}</p>
            <p><strong>Fecha:</strong> ${fechaEvento}</p>
            <p><strong>Cantidad:</strong> ${datosCompra.cantidad} entrada(s)</p>
            <p><strong>Total:</strong> $${parseFloat(datosCompra.total).toFixed(2)} BOB</p>
            <p><strong>Código:</strong> ${datosCompra.codigoUnico}</p>
          </div>
          
          <p>Por favor, guarda este correo y lleva tu boleto al evento. ¡Esperamos verte allí! 🎉</p>
        </div>
        <div class="footer">
          <p>PlusTicket - MAS FACIL IMPOSIBLE</p>
          <p>Este es un correo automático, por favor no respondas.</p>
        </div>
      </body>
      </html>
    `;

    // Configurar el correo
    const mailOptions = {
      from: `"PlusTicket" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `Tu boleto para ${datosCompra.tituloEvento} - ${datosCompra.codigoUnico}`,
      html: htmlContent,
      attachments: [
        {
          filename: nombreArchivo,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    // Enviar el correo
    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      message: 'Boleto enviado exitosamente por correo electrónico',
      messageId: info.messageId,
      email: email
    };

  } catch (error) {
    console.error('❌ Error al enviar boleto por email:', error);
    return {
      success: false,
      message: error.message || 'Error al enviar el correo electrónico',
      error: error.message
    };
  }
};

/**
 * Verifica si el servicio de email está configurado
 */
export const verificarConfiguracionEmail = () => {
  const tieneConfig = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  return {
    configurado: tieneConfig,
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || '587'
  };
};

