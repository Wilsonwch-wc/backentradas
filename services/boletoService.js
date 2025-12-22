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
const generarBoletoIndividual = async (doc, compra, evento, asiento, mesa, entradaGeneral, index, total) => {
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
  doc.fontSize(24) // Reducido de 30 a 24
     .font('Helvetica-Bold')
     .fillColor('#2c3e50')
     .text('ENTRADA', margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 28; // Reducido de 35 a 28

  // Nombre del evento - CENTRADO
  doc.fontSize(16) // Reducido de 18 a 16
     .font('Helvetica-Bold')
     .fillColor('#34495e')
     .text(evento.titulo || 'Evento', margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 25; // Reducido de 30 a 25

  // Línea decorativa
  doc.moveTo(margin + 50, yPos)
     .lineTo(pageWidth - margin - 50, yPos)
     .strokeColor('#3498db')
     .lineWidth(2)
     .stroke();

  yPos += 18; // Reducido de 20 a 18

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

  doc.fontSize(10) // Reducido de 11 a 10
     .font('Helvetica')
     .fillColor('#7f8c8d')
     .text('FECHA Y HORA', margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 15; // Reducido de 18 a 15

  doc.fontSize(12) // Reducido de 13 a 12
     .font('Helvetica-Bold')
     .fillColor('#2c3e50')
     .text(fechaEvento, margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 28; // Reducido de 35 a 28

  // Caja de información del cliente
  const boxY = yPos;
  const boxHeight = 60; // Reducido de 70 a 60
  
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
       .text(`Tel: ${compra.cliente_telefono}`, margin + 30, boxY + 40);
  }

  yPos = boxY + boxHeight + 18; // Reducido de 20 a 18

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
    const asientoBoxHeight = tieneInfoExtra ? 70 : 60; // Reducido de 80/65 a 70/60
    
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
    doc.fontSize(20) // Reducido de 24 a 20
       .font('Helvetica-Bold')
       .fillColor('#2c3e50')
       .text(asiento.numero_asiento, margin + 30, asientoBoxY + 30, {
         width: contentWidth - 60,
         align: 'center'
       });

    // Mostrar información adicional (mesa o área)
    let infoExtraY = asientoBoxY + 55; // Ajustado según nueva altura
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

         yPos = asientoBoxY + asientoBoxHeight + 18; // Reducido de 20 a 18
  } else if (mesa) {
    const mesaBoxY = yPos;
    const mesaBoxHeight = 60; // Reducido de 65 a 60
    
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

    doc.fontSize(20) // Reducido de 24 a 20
       .font('Helvetica-Bold')
       .fillColor('#2c3e50')
       .text(`M${mesa.numero_mesa}`, margin + 30, mesaBoxY + 30, {
         width: contentWidth - 60,
         align: 'center'
       });

    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#7f8c8d')
       .text(`${mesa.cantidad_sillas} silla(s)`, margin + 30, mesaBoxY + 50, {
         width: contentWidth - 60,
         align: 'center'
       });

    yPos = mesaBoxY + mesaBoxHeight + 18; // Reducido de 20 a 18
  } else if (entradaGeneral) {
    // Para eventos generales, mostrar "GENERAL" y el código de escaneo de la entrada individual
    const generalBoxY = yPos;
    const generalBoxHeight = 60; // Reducido de 65 a 60
    
    doc.rect(margin + 20, generalBoxY, contentWidth - 40, generalBoxHeight)
       .fillColor('#f0f0f0')
       .fill()
       .strokeColor('#a0a0a0')
       .lineWidth(2)
       .stroke();

    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#505050')
       .text('GENERAL', margin + 30, generalBoxY + 15, {
         width: contentWidth - 60,
         align: 'center'
       });

    doc.fontSize(16) // Reducido de 20 a 16
       .font('Helvetica-Bold')
       .fillColor('#2c3e50')
       .text(`ENTRADA ${index + 1}`, margin + 30, generalBoxY + 30, {
         width: contentWidth - 60,
         align: 'center'
       });
    yPos = generalBoxY + generalBoxHeight + 18;
  }

  // Código de escaneo - CENTRADO Y DESTACADO
  // Para eventos especiales: viene de asiento o mesa
  // Para eventos generales: viene de entradaGeneral.codigo_escaneo
  const codigoEscaneo = (asiento && asiento.codigo_escaneo) 
    ? asiento.codigo_escaneo 
    : (mesa && mesa.codigo_escaneo) 
      ? mesa.codigo_escaneo 
      : (entradaGeneral && entradaGeneral.codigo_escaneo) 
        ? entradaGeneral.codigo_escaneo 
        : null;
  
  if (codigoEscaneo) {
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
    const codigoBoxHeight = 45; // Reducido de 50 a 45
    
    doc.rect(margin + 20, codigoBoxY, contentWidth - 40, codigoBoxHeight)
       .fillColor('#fff3cd')
       .fill()
       .strokeColor('#ffc107')
       .lineWidth(2)
       .stroke();

    doc.fontSize(22) // Reducido de 28 a 22
       .font('Helvetica-Bold')
       .fillColor('#f57c00')
       .text(codigoEscaneo, margin + 30, codigoBoxY + 8, {
         width: contentWidth - 60,
         align: 'center'
       });

    yPos = codigoBoxY + codigoBoxHeight + 18; // Reducido de 20 a 18
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

  doc.fontSize(12) // Reducido de 14 a 12
     .font('Helvetica-Bold')
     .fillColor('#27ae60')
     .text(compra.codigo_unico, margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 25; // Reducido de 30 a 25

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
      width: 180, // Reducido de 200 a 180
      margin: 1
    });

    const qrSize = 150; // Reducido de 180 a 150
    const qrX = (pageWidth - qrSize) / 2;
    
    // Calcular altura del footer (texto + espacio)
    const footerHeight = 110; // Altura del footer con plustiket.com
    
    // Calcular posición Y para centrar el QR considerando el espacio del footer
    const espacioRestante = pageHeight - yPos - margin - footerHeight;
    const qrY = yPos + Math.max(12, (espacioRestante - qrSize) / 2); // Reducido de 15 a 12
    
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
    let footerY = qrY + qrSize + 30; // Reducido de 40 a 30
    
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
       .text(`Total pagado: $${parseFloat(compra.total).toFixed(2)} BOB`, margin, footerY + 25, {
         width: contentWidth,
         align: 'center'
       });

    // Agregar dominio "plustiket.com" con diseño al final del PDF
    // Verificar que quepa en la página antes de agregarlo
    const dominioBoxWidth = 200; // Reducido de 220 a 200
    const dominioBoxHeight = 40; // Reducido de 50 a 40
    const dominioBoxX = (pageWidth - dominioBoxWidth) / 2;
    const dominioY = footerY + 35; // Espacio después del total pagado
    
    // Solo agregar si cabe en la página
    if (dominioY + dominioBoxHeight < pageHeight - margin - 10) {
      doc.rect(dominioBoxX, dominioY, dominioBoxWidth, dominioBoxHeight)
         .fillColor('#f8f9fa')
         .fill()
         .strokeColor('#3498db')
         .lineWidth(2)
         .stroke();
      
      // Texto del dominio con estilo
      doc.fontSize(16) // Reducido de 20 a 16
         .font('Helvetica-Bold')
         .fillColor('#3498db')
         .text('plustiket.com', dominioBoxX, dominioY + 10, {
           width: dominioBoxWidth,
           align: 'center'
         });
      
      // Línea decorativa debajo
      doc.fontSize(8) // Reducido de 9 a 8
         .font('Helvetica')
         .fillColor('#7f8c8d')
         .text('Tu plataforma de confianza', dominioBoxX, dominioY + 28, {
           width: dominioBoxWidth,
           align: 'center'
         });
    }
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
       .text(`Total pagado: $${parseFloat(compra.total).toFixed(2)} BOB`, margin, footerY + 25, {
         width: contentWidth,
         align: 'center'
       });

    // Agregar dominio "plustiket.com" con diseño - caso de error QR
    const dominioBoxWidthError = 200; // Reducido de 220 a 200
    const dominioBoxHeightError = 40; // Reducido de 50 a 40
    const dominioBoxXError = (pageWidth - dominioBoxWidthError) / 2;
    const dominioYError = footerY + 35; // Reducido de 50 a 35
    
    // Solo agregar si cabe en la página
    if (dominioYError + dominioBoxHeightError < pageHeight - margin - 10) {
      doc.rect(dominioBoxXError, dominioYError, dominioBoxWidthError, dominioBoxHeightError)
         .fillColor('#f8f9fa')
         .fill()
         .strokeColor('#3498db')
         .lineWidth(2)
         .stroke();
      
      doc.fontSize(16) // Reducido de 20 a 16
         .font('Helvetica-Bold')
         .fillColor('#3498db')
         .text('plustiket.com', dominioBoxXError, dominioYError + 10, {
           width: dominioBoxWidthError,
           align: 'center'
         });
      
      doc.fontSize(8) // Reducido de 9 a 8
         .font('Helvetica')
         .fillColor('#7f8c8d')
         .text('Tu plataforma de confianza', dominioBoxXError, dominioYError + 28, {
           width: dominioBoxWidthError,
           align: 'center'
         });
    }
  }
};

/**
 * Genera un PDF del boleto de entrada
 * @param {Object} compra - Datos de la compra
 * @param {Object} evento - Datos del evento
 * @param {Array} asientos - Array de asientos
 * @param {Array} mesas - Array de mesas
 * @param {Array} entradasGenerales - Array de entradas generales (para eventos sin asientos/mesas)
 * @returns {Promise<string>} - Ruta del archivo PDF generado
 */
export const generarBoletoPDF = async (compra, evento, asientos = [], mesas = [], entradasGenerales = []) => {
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
      const totalEntradas = asientos.length + mesas.length + entradasGenerales.length || (compra.cantidad || 1);

      // Si hay múltiples entradas, generar un boleto por página
      if (totalEntradas > 1) {
        // Generar boleto para cada asiento
        for (let i = 0; i < asientos.length; i++) {
          if (i > 0) {
            doc.addPage();
          }
          await generarBoletoIndividual(doc, compra, evento, asientos[i], null, null, i, totalEntradas);
        }

        // Generar boleto para cada mesa
        for (let i = 0; i < mesas.length; i++) {
          if (asientos.length > 0 || i > 0) {
            doc.addPage();
          }
          await generarBoletoIndividual(doc, compra, evento, null, mesas[i], null, asientos.length + i, totalEntradas);
        }

        // Generar boleto para cada entrada general
        for (let i = 0; i < entradasGenerales.length; i++) {
          if (asientos.length > 0 || mesas.length > 0 || i > 0) {
            doc.addPage();
          }
          await generarBoletoIndividual(doc, compra, evento, null, null, entradasGenerales[i], asientos.length + mesas.length + i, totalEntradas);
        }
      } else {
        // Si solo hay una entrada, generar un solo boleto en una página
        const asiento = asientos.length > 0 ? asientos[0] : null;
        const mesa = mesas.length > 0 ? mesas[0] : null;
        const entradaGeneral = entradasGenerales.length > 0 ? entradasGenerales[0] : null;
        await generarBoletoIndividual(doc, compra, evento, asiento, mesa, entradaGeneral, 0, totalEntradas);
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
