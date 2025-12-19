import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Genera un boleto individual en una página
 */
const generarBoletoIndividual = async (doc, compra, evento, asiento, mesa, index, total) => {
  const pageWidth = 595; // A4 width
  const pageHeight = 842; // A4 height
  const margin = 40;
  const contentWidth = pageWidth - (margin * 2);
  
  // Fondo decorativo (opcional)
  doc.rect(margin, margin, contentWidth, pageHeight - (margin * 2))
     .strokeColor('#e0e0e0')
     .lineWidth(2)
     .stroke();

  // Borde decorativo interno
  doc.rect(margin + 10, margin + 10, contentWidth - 20, pageHeight - (margin * 2) - 20)
     .strokeColor('#3498db')
     .lineWidth(1)
     .stroke();

  let yPos = margin + 25; // Reducido de 40 a 25

  // Título principal - CENTRADO
  doc.fontSize(30) // Reducido de 32 a 30
     .font('Helvetica-Bold')
     .fillColor('#2c3e50')
     .text('ENTRADA', margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 35; // Reducido de 50 a 35

  // Nombre del evento - CENTRADO
  doc.fontSize(18) // Reducido de 20 a 18
     .font('Helvetica-Bold')
     .fillColor('#34495e')
     .text(evento.titulo || 'Evento', margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 30; // Reducido de 40 a 30

  // Línea decorativa
  doc.moveTo(margin + 50, yPos)
     .lineTo(pageWidth - margin - 50, yPos)
     .strokeColor('#3498db')
     .lineWidth(2)
     .stroke();

  yPos += 20; // Reducido de 30 a 20

  // Información del evento - CENTRADO
  const fechaEvento = evento.hora_inicio 
    ? new Date(evento.hora_inicio).toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Fecha no disponible';

  doc.fontSize(11) // Reducido de 12 a 11
     .font('Helvetica')
     .fillColor('#7f8c8d')
     .text('📅 FECHA Y HORA', margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 18; // Reducido de 25 a 18

  doc.fontSize(13) // Reducido de 14 a 13
     .font('Helvetica-Bold')
     .fillColor('#2c3e50')
     .text(fechaEvento, margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 35; // Reducido de 50 a 35

  // Caja de información del cliente
  const boxY = yPos;
  const boxHeight = 70; // Reducido de 100 a 70
  
  doc.rect(margin + 20, boxY, contentWidth - 40, boxHeight)
     .fillColor('#f8f9fa')
     .fill()
     .strokeColor('#bdc3c7')
     .lineWidth(1)
     .stroke();

  doc.fontSize(10) // Reducido de 11 a 10
     .font('Helvetica-Bold')
     .fillColor('#34495e')
     .text('CLIENTE', margin + 30, boxY + 10);

  doc.fontSize(9) // Reducido de 10 a 9
     .font('Helvetica')
     .fillColor('#2c3e50')
     .text(compra.cliente_nombre, margin + 30, boxY + 25, {
       width: contentWidth - 60
     });

  if (compra.cliente_telefono) {
    doc.fontSize(8) // Reducido de 9 a 8
       .fillColor('#7f8c8d')
       .text(`📱 ${compra.cliente_telefono}`, margin + 30, boxY + 40);
  }

  yPos = boxY + boxHeight + 20; // Reducido de 30 a 20

  // Información de la entrada
  doc.fontSize(10) // Reducido de 11 a 10
     .font('Helvetica-Bold')
     .fillColor('#34495e')
     .text('ENTRADA', margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 20; // Reducido de 30 a 20

  // Asiento o Mesa
  if (asiento) {
    const asientoBoxY = yPos;
    // Ajustar altura según si tiene información adicional
    const tieneInfoExtra = asiento.numero_mesa || asiento.area_nombre;
    const asientoBoxHeight = tieneInfoExtra ? 80 : 65; // Reducido de 100/80 a 80/65
    
    doc.rect(margin + 20, asientoBoxY, contentWidth - 40, asientoBoxHeight)
       .fillColor('#e8f5e9')
       .fill()
       .strokeColor('#27ae60')
       .lineWidth(2)
       .stroke();

    // Mostrar tipo de entrada (VIP, GENERAL, etc.) o "ASIENTO" si no hay tipo
    const tipoEntrada = asiento.tipo_precio_nombre || 'ASIENTO';
    
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#27ae60')
       .text(tipoEntrada, margin + 30, asientoBoxY + 15, {
         width: contentWidth - 60,
         align: 'center'
       });

    // Mostrar número de asiento
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .fillColor('#2c3e50')
       .text(asiento.numero_asiento, margin + 30, asientoBoxY + 35, {
         width: contentWidth - 60,
         align: 'center'
       });

    // Mostrar información adicional (mesa o área)
    let infoExtraY = asientoBoxY + 65;
    if (asiento.numero_mesa) {
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor('#7f8c8d')
         .text(`Mesa M${asiento.numero_mesa}`, margin + 30, infoExtraY, {
           width: contentWidth - 60,
           align: 'center'
         });
      infoExtraY += 15;
    }
    
    if (asiento.area_nombre) {
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor('#7f8c8d')
         .text(`Área: ${asiento.area_nombre}`, margin + 30, infoExtraY, {
           width: contentWidth - 60,
           align: 'center'
         });
    }

    yPos = asientoBoxY + asientoBoxHeight + 20; // Reducido de 30 a 20
  } else if (mesa) {
    const mesaBoxY = yPos;
    const mesaBoxHeight = 65; // Reducido de 80 a 65
    
    doc.rect(margin + 20, mesaBoxY, contentWidth - 40, mesaBoxHeight)
       .fillColor('#e3f2fd')
       .fill()
       .strokeColor('#2196f3')
       .lineWidth(2)
       .stroke();

    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#2196f3')
       .text('MESA', margin + 30, mesaBoxY + 15);

    doc.fontSize(24)
       .font('Helvetica-Bold')
       .fillColor('#2c3e50')
       .text(`M${mesa.numero_mesa}`, margin + 30, mesaBoxY + 35, {
         width: contentWidth - 60,
         align: 'center'
       });

    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#7f8c8d')
       .text(`${mesa.cantidad_sillas} silla(s)`, margin + 30, mesaBoxY + 65, {
         width: contentWidth - 60,
         align: 'center'
       });

    yPos = mesaBoxY + mesaBoxHeight + 20; // Reducido de 30 a 20
  }

  // Código de escaneo - CENTRADO Y DESTACADO
  if ((asiento && asiento.codigo_escaneo) || (mesa && mesa.codigo_escaneo)) {
    const codigoEscaneo = asiento?.codigo_escaneo || mesa?.codigo_escaneo;
    
    doc.fontSize(10) // Reducido de 11 a 10
       .font('Helvetica-Bold')
       .fillColor('#7f8c8d')
       .text('CÓDIGO DE ESCANEO', margin, yPos, {
         width: contentWidth,
         align: 'center'
       });

    yPos += 18; // Reducido de 20 a 18

    // Código en caja destacada
    const codigoBoxY = yPos;
    const codigoBoxHeight = 50;
    
    doc.rect(margin + 20, codigoBoxY, contentWidth - 40, codigoBoxHeight)
       .fillColor('#fff3cd')
       .fill()
       .strokeColor('#ffc107')
       .lineWidth(2)
       .stroke();

    doc.fontSize(28) // Más grande y destacado
       .font('Helvetica-Bold')
       .fillColor('#f57c00')
       .text(codigoEscaneo, margin + 30, codigoBoxY + 10, {
         width: contentWidth - 60,
         align: 'center'
       });

    yPos = codigoBoxY + codigoBoxHeight + 20;
  }

  // Código único - CENTRADO
  doc.fontSize(9) // Reducido de 10 a 9
     .font('Helvetica-Bold')
     .fillColor('#7f8c8d')
     .text('CÓDIGO ÚNICO', margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 15; // Reducido de 20 a 15

  doc.fontSize(14) // Reducido de 16 a 14
     .font('Helvetica-Bold')
     .fillColor('#27ae60')
     .text(compra.codigo_unico, margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 30; // Reducido de 40 a 30

  // QR Code - CENTRADO y mejor posicionado
  const qrData = JSON.stringify({
    codigo: compra.codigo_unico,
    compra_id: compra.id,
    evento_id: evento.id,
    asiento_id: asiento?.id || mesa?.id || null,
    timestamp: Date.now(),
    index: index
  });

  try {
    const qrImageBuffer = await QRCode.toBuffer(qrData, {
      errorCorrectionLevel: 'H',
      type: 'png',
      width: 200,
      margin: 1
    });

    const qrSize = 180; // Reducido de 200 a 180 para que quepa mejor
    const qrX = (pageWidth - qrSize) / 2;
    
    // Calcular altura del footer (texto + espacio)
    const footerHeight = 70; // Reducido de 80 a 70
    
    // Calcular posición Y para centrar el QR considerando el espacio del footer
    const espacioRestante = pageHeight - yPos - margin - footerHeight;
    const qrY = yPos + Math.max(15, (espacioRestante - qrSize) / 2); // Reducido de 20 a 15
    
    doc.image(qrImageBuffer, qrX, qrY, {
      width: qrSize,
      height: qrSize
    });

    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#7f8c8d')
       .text('Escanea para validar', qrX, qrY + qrSize + 10, {
         width: qrSize,
         align: 'center'
       });
    
    // Footer - Colocar después del QR con espacio suficiente
    let footerY = qrY + qrSize + 40; // Espacio después del texto "Escanea para validar"
    
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#95a5a6')
       .text('Esta entrada es personal e intransferible. Solo válida para una vez.', margin, footerY, {
         width: contentWidth,
         align: 'center'
       });

    if (total > 1) {
      doc.fontSize(8)
         .fillColor('#95a5a6')
         .text(`Entrada ${index + 1} de ${total}`, margin, footerY + 15, {
           width: contentWidth,
           align: 'center'
         });
    }

    // Información de pago (pequeña en la parte inferior)
    doc.fontSize(7)
       .fillColor('#bdc3c7')
       .text(`Total pagado: $${parseFloat(compra.total).toFixed(2)} BOB`, margin, footerY + 30, {
         width: contentWidth,
         align: 'center'
       });
  } catch (qrError) {
    console.error('Error al generar QR:', qrError);
    
    // Si hay error con el QR, poner el footer al final
    const footerY = pageHeight - margin - 40;
    
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#95a5a6')
       .text('Esta entrada es personal e intransferible. Solo válida para una vez.', margin, footerY, {
         width: contentWidth,
         align: 'center'
       });

    if (total > 1) {
      doc.fontSize(8)
         .fillColor('#95a5a6')
         .text(`Entrada ${index + 1} de ${total}`, margin, footerY + 15, {
           width: contentWidth,
           align: 'center'
         });
    }

    doc.fontSize(7)
       .fillColor('#bdc3c7')
       .text(`Total pagado: $${parseFloat(compra.total).toFixed(2)} BOB`, margin, footerY + 30, {
         width: contentWidth,
         align: 'center'
       });
  }
};

/**
 * Genera un PDF del boleto de entrada
 * @param {Object} compra - Datos de la compra
 * @param {Object} evento - Datos del evento
 * @param {Array} asientos - Array de asientos
 * @param {Array} mesas - Array de mesas
 * @returns {Promise<string>} - Ruta del archivo PDF generado
 */
export const generarBoletoPDF = async (compra, evento, asientos = [], mesas = []) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Crear directorio de boletos si no existe
      const boletosDir = path.join(__dirname, '../uploads/boletos');
      if (!fs.existsSync(boletosDir)) {
        fs.mkdirSync(boletosDir, { recursive: true });
      }

      // Nombre del archivo
      const filename = `boleto-${compra.codigo_unico}-${Date.now()}.pdf`;
      const filepath = path.join(boletosDir, filename);

      // Crear documento PDF
      const doc = new PDFDocument({
        size: 'A4',
        margin: 0
      });

      // Pipe a un archivo
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // Calcular total de entradas
      const totalEntradas = asientos.length + mesas.length;

      // Si hay múltiples entradas, generar un boleto por página
      if (totalEntradas > 1) {
        // Generar boleto para cada asiento
        for (let i = 0; i < asientos.length; i++) {
          if (i > 0) {
            doc.addPage();
          }
          await generarBoletoIndividual(doc, compra, evento, asientos[i], null, i, totalEntradas);
        }

        // Generar boleto para cada mesa
        for (let i = 0; i < mesas.length; i++) {
          if (asientos.length > 0 || i > 0) {
            doc.addPage();
          }
          await generarBoletoIndividual(doc, compra, evento, null, mesas[i], asientos.length + i, totalEntradas);
        }
      } else {
        // Si solo hay una entrada, generar un solo boleto en una página
        const asiento = asientos.length > 0 ? asientos[0] : null;
        const mesa = mesas.length > 0 ? mesas[0] : null;
        await generarBoletoIndividual(doc, compra, evento, asiento, mesa, 0, 1);
      }

      // Finalizar PDF
      doc.end();

      stream.on('finish', () => {
        // Retornar ruta relativa para servir el archivo
        const relativePath = `/uploads/boletos/${filename}`;
        resolve(relativePath);
      });

      stream.on('error', (error) => {
        reject(error);
      });

    } catch (error) {
      reject(error);
    }
  });
};
