import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función eliminada - ya no generamos código aleatorio, usamos el código de compra

/**
 * Genera un boleto individual en formato ticket térmico (80mm de ancho)
 */
const generarBoletoIndividual = async (doc, compra, evento, asiento, mesa, entradaGeneral, index, total, precio) => {
  // Dimensiones para ticket térmico 80mm (aproximadamente 226 puntos a 72 DPI)
  const ticketWidth = doc.page.width || 226.77; // 80mm en puntos
  const margin = 10;
  const contentWidth = ticketWidth - (margin * 2);
  
  let yPos = margin;

  // 1. TÍTULO DEL EVENTO (arriba, centrado)
  const eventoNombre = (evento.titulo || 'Evento').toUpperCase();
  doc.fontSize(11)
     .font('Helvetica-Bold')
     .fillColor('#000000')
     .text(eventoNombre, margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 14;

  // 2. FECHA Y HORA (debajo del título, centrado)
  const fechaEvento = evento.hora_inicio 
    ? new Date(evento.hora_inicio).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).replace(/\//g, '-')
    : 'Fecha no disponible';
  
  const horaEvento = evento.hora_inicio
    ? new Date(evento.hora_inicio).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    : 'Hora no disponible';

  const fechaHora = `${fechaEvento} - ${horaEvento}`;
  doc.fontSize(8)
     .font('Helvetica')
     .fillColor('#000000')
     .text(fechaHora, margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 12;

  // 3. QR CODE (en el medio, centrado)
  const qrSize = 80; // Tamaño del QR
  const qrX = (ticketWidth - qrSize) / 2; // Centrar el QR
  
  // Código de escaneo para el QR
  const codigoEscaneo = (asiento && asiento.codigo_escaneo) 
    ? asiento.codigo_escaneo 
    : (mesa && mesa.codigo_escaneo) 
      ? mesa.codigo_escaneo 
      : (entradaGeneral && entradaGeneral.codigo_escaneo) 
        ? entradaGeneral.codigo_escaneo 
        : null;

  // Generar QR Code
  try {
    const qrData = codigoEscaneo || JSON.stringify({
      codigo: compra.codigo_unico,
      compra_id: compra.id,
      evento_id: evento.id,
      asiento_id: asiento?.id || mesa?.id || null,
      timestamp: Date.now(),
      index: index
    });

    const qrImageBuffer = await QRCode.toBuffer(qrData, {
      errorCorrectionLevel: 'H',
      type: 'png',
      width: qrSize,
      margin: 1
    });
    
    doc.image(qrImageBuffer, qrX, yPos, {
      width: qrSize,
      height: qrSize
    });
  } catch (qrError) {
    console.error('Error al generar QR:', qrError);
  }

  yPos += qrSize + 8;

  // 4. INFORMACIÓN DEL BOLETO (debajo del QR, centrado)
  // Tipo de boleto
  let tipoBoleto = 'GENERAL';
  if (asiento && asiento.tipo_precio_nombre) {
    tipoBoleto = asiento.tipo_precio_nombre.toUpperCase();
  } else if (mesa) {
    tipoBoleto = 'MESA';
  }

  doc.fontSize(10)
     .font('Helvetica-Bold')
     .fillColor('#000000')
     .text(tipoBoleto, margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 12;

  // Precio
  const precioTexto = precio ? `Bs. ${parseFloat(precio).toFixed(2)}` : 'Bs. 0.00';
  doc.fontSize(9)
     .font('Helvetica')
     .fillColor('#000000')
     .text(precioTexto, margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 12;

  // Asiento (si aplica)
  if (asiento && asiento.numero_asiento) {
    let asientoTexto = `Asiento: ${asiento.numero_asiento}`;
    if (asiento.numero_mesa) {
      asientoTexto = `Asiento: FILA ${asiento.numero_mesa}-${asiento.numero_asiento}`;
    } else if (asiento.area_nombre) {
      asientoTexto = `Asiento: ${asiento.area_nombre} - ${asiento.numero_asiento}`;
    }
    
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#000000')
       .text(asientoTexto, margin, yPos, {
         width: contentWidth,
         align: 'center'
       });
    yPos += 10;
  } else if (mesa && mesa.numero_mesa) {
    const mesaTexto = `Mesa: M${mesa.numero_mesa}`;
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#000000')
       .text(mesaTexto, margin, yPos, {
         width: contentWidth,
         align: 'center'
       });
    yPos += 10;
  }

  // 5. LOGO "plustiket" (al final, centrado, llamativo)
  const logoText = 'plus';
  const logoText2 = 'tiket';
  const fontSize = 13; // Tamaño más grande para que sea más llamativo
  const spacing = 3; // Espacio entre "plus" y "tiket" para que no choquen
  
  const logoWidth = doc.widthOfString(logoText, { fontSize: fontSize, font: 'Helvetica-Bold' });
  const logoWidth2 = doc.widthOfString(logoText2, { fontSize: fontSize, font: 'Helvetica-Bold' });
  const totalLogoWidth = logoWidth + logoWidth2 + spacing;
  const logoX = (ticketWidth - totalLogoWidth) / 2;

  // "plus" en negro
  doc.fontSize(fontSize)
     .font('Helvetica-Bold')
     .fillColor('#000000')
     .text(logoText, logoX, yPos);
  
  // "tiket" en amarillo dorado brillante y llamativo
  doc.fontSize(fontSize)
     .font('Helvetica-Bold')
     .fillColor('#FFC107') // Amarillo dorado brillante y llamativo
     .text(logoText2, logoX + logoWidth + spacing, yPos);

  yPos += 12;

  // Retornar la altura usada para este boleto
  return yPos;
};

/**
 * Genera la factura/comprobante (similar a la imagen)
 */
const generarFactura = async (doc, compra, evento, asientos, mesas, entradasGenerales) => {
  // Para la factura usamos tamaño A4 normal
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const contentWidth = pageWidth - (margin * 2);

  doc.addPage({
    size: 'A4'
  });

  let yPos = margin;

  // Encabezado de factura
  doc.fontSize(14)
     .font('Helvetica-Bold')
     .fillColor('#000000')
     .text('FACTURA CON DERECHO A CRÉDITO FISCAL', margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 20;

  doc.fontSize(12)
     .font('Helvetica-Bold')
     .text('FACTURA', margin, yPos);
  
  doc.fontSize(10)
     .font('Helvetica')
     .text('CASA MATRIZ', margin, yPos + 15);
  
  doc.fontSize(9)
     .text('DENTRO DEL 1ER ANILLO ENTRE LAS CALLES REPUBLIQUETAS Y MONSEÑOR SALVATIERRA', margin, yPos + 28);
  doc.text('SANTA CRUZ DE LA SIERRA', margin, yPos + 40);

  // Información de factura (lado derecho)
  const rightX = pageWidth - margin - 150;
  doc.fontSize(9)
     .font('Helvetica')
     .text('NIT:', rightX, yPos);
  doc.text('FACTURA', rightX + 30, yPos);

  doc.text('FACTURA N°: 0', rightX, yPos + 15);
  doc.text('CÓD. AUTORIZACIÓN:', rightX, yPos + 30);

  // QR Code de la factura (esquina superior derecha)
  try {
    const facturaQRData = JSON.stringify({
      tipo: 'factura',
      compra_id: compra.id,
      codigo_unico: compra.codigo_unico,
      total: compra.total,
      fecha: new Date().toISOString()
    });

    const qrImageBuffer = await QRCode.toBuffer(facturaQRData, {
      errorCorrectionLevel: 'H',
      type: 'png',
      width: 80,
      margin: 1
    });

    doc.image(qrImageBuffer, pageWidth - margin - 90, yPos, {
      width: 80,
      height: 80
    });
  } catch (qrError) {
    console.error('Error al generar QR de factura:', qrError);
  }

  yPos += 60;

  // Línea separadora
  doc.moveTo(margin, yPos)
     .lineTo(pageWidth - margin, yPos)
     .strokeColor('#000000')
     .lineWidth(0.5)
     .stroke();

  yPos += 15;

  // Datos del cliente
  doc.fontSize(9)
     .font('Helvetica')
     .text(`NOMBRE/RAZÓN SOCIAL: ${compra.cliente_nombre || 'SN'}`, margin, yPos);
  
  yPos += 12;
  doc.text(`NIT/CI/CEX: ${compra.cliente_telefono || compra.cliente_email || '12345678'}`, margin, yPos);
  
  yPos += 12;
  doc.text(`COD. CLIENTE:`, margin, yPos);
  
  yPos += 12;
  const fechaEmision = new Date().toLocaleDateString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  doc.text(`FECHA DE EMISIÓN: ${fechaEmision}`, margin, yPos);

  yPos += 20;

  // Línea separadora
  doc.moveTo(margin, yPos)
     .lineTo(pageWidth - margin, yPos)
     .strokeColor('#000000')
     .lineWidth(0.5)
     .stroke();

  yPos += 15;

  // Items de la compra
  let totalItems = 0;

  // Asientos
  if (asientos && asientos.length > 0) {
    asientos.forEach(asiento => {
      const tipoPrecio = asiento.tipo_precio_nombre || 'Entrada';
      const cantidad = 1;
      const precioUnitario = parseFloat(asiento.precio || 0);
      const subtotal = precioUnitario * cantidad;
      totalItems += subtotal;

      const itemText = `${evento.titulo || 'Evento'}`;
      const detalleText = `${tipoPrecio} ${asiento.numero_asiento || ''}`;
      
      doc.fontSize(9)
         .font('Helvetica')
         .text(itemText, margin, yPos);
      
      yPos += 10;
      doc.text(`${detalleText} ${cantidad} X ${precioUnitario.toFixed(2)}`, margin + 20, yPos);
      
      const subtotalText = subtotal.toFixed(2);
      const subtotalWidth = doc.widthOfString(subtotalText, { fontSize: 9 });
      doc.text(subtotalText, pageWidth - margin - subtotalWidth, yPos);
      
      yPos += 15;
    });
  }

  // Mesas
  if (mesas && mesas.length > 0) {
    mesas.forEach(mesa => {
      const cantidad = mesa.cantidad_sillas || 1;
      const precioUnitario = parseFloat(mesa.precio_total || 0) / cantidad;
      const subtotal = parseFloat(mesa.precio_total || 0);
      totalItems += subtotal;

      const itemText = `${evento.titulo || 'Evento'}`;
      const detalleText = `Mesa ${mesa.numero_mesa} ${cantidad} X ${precioUnitario.toFixed(2)}`;
      
      doc.fontSize(9)
         .font('Helvetica')
         .text(itemText, margin, yPos);
      
      yPos += 10;
      doc.text(detalleText, margin + 20, yPos);
      
      const subtotalText = subtotal.toFixed(2);
      const subtotalWidth = doc.widthOfString(subtotalText, { fontSize: 9 });
      doc.text(subtotalText, pageWidth - margin - subtotalWidth, yPos);
      
      yPos += 15;
    });
  }

  // Entradas generales
  if (entradasGenerales && entradasGenerales.length > 0) {
    const precioUnitario = parseFloat(compra.total || 0) / entradasGenerales.length;
    entradasGenerales.forEach((entrada, idx) => {
      const subtotal = precioUnitario;
      totalItems += subtotal;

      const itemText = `${evento.titulo || 'Evento'}`;
      const detalleText = `General ${idx + 1} X ${precioUnitario.toFixed(2)}`;
      
      doc.fontSize(9)
         .font('Helvetica')
         .text(itemText, margin, yPos);
      
      yPos += 10;
      doc.text(detalleText, margin + 20, yPos);
      
      const subtotalText = subtotal.toFixed(2);
      const subtotalWidth = doc.widthOfString(subtotalText, { fontSize: 9 });
      doc.text(subtotalText, pageWidth - margin - subtotalWidth, yPos);
      
      yPos += 15;
    });
  }

  // Si no hay items específicos, mostrar entrada general
  if ((!asientos || asientos.length === 0) && 
      (!mesas || mesas.length === 0) && 
      (!entradasGenerales || entradasGenerales.length === 0)) {
    const cantidad = compra.cantidad || 1;
    const precioUnitario = parseFloat(compra.total || 0) / cantidad;
    const subtotal = parseFloat(compra.total || 0);
    totalItems = subtotal;

    const itemText = `${evento.titulo || 'Evento'}`;
    const detalleText = `General ${cantidad} X ${precioUnitario.toFixed(2)}`;
    
    doc.fontSize(9)
       .font('Helvetica')
       .text(itemText, margin, yPos);
    
    yPos += 10;
    doc.text(detalleText, margin + 20, yPos);
    
    const subtotalText = subtotal.toFixed(2);
    const subtotalWidth = doc.widthOfString(subtotalText, { fontSize: 9 });
    doc.text(subtotalText, pageWidth - margin - subtotalWidth, yPos);
    
    yPos += 15;
  }

  yPos += 10;

  // Línea separadora
  doc.moveTo(margin, yPos)
     .lineTo(pageWidth - margin, yPos)
     .strokeColor('#000000')
     .lineWidth(0.5)
     .stroke();

  yPos += 15;

  // Totales
  const subtotal = totalItems;
  const descuento = 0;
  const total = parseFloat(compra.total || 0);
  const montoGiftCard = 0;
  const montoAPagar = total;
  const importeBaseCreditoFiscal = total;

  doc.fontSize(9)
     .font('Helvetica')
     .text('SUBTOTAL Bs', margin, yPos);
  const subtotalText = subtotal.toFixed(2);
  const subtotalTextWidth = doc.widthOfString(subtotalText, { fontSize: 9 });
  doc.text(subtotalText, pageWidth - margin - subtotalTextWidth, yPos);

  yPos += 12;
  doc.text('DESCUENTO Bs', margin, yPos);
  doc.text('0.00', pageWidth - margin - 30, yPos);

  yPos += 12;
  doc.font('Helvetica-Bold')
     .text('TOTAL Bs', margin, yPos);
  doc.text(total.toFixed(2), pageWidth - margin - 30, yPos);

  yPos += 12;
  doc.font('Helvetica')
     .text('MONTO GIFT CARD Bs', margin, yPos);
  doc.text('0.00', pageWidth - margin - 30, yPos);

  yPos += 12;
  doc.font('Helvetica-Bold')
     .text('MONTO A PAGAR Bs', margin, yPos);
  doc.text(montoAPagar.toFixed(2), pageWidth - margin - 30, yPos);

  yPos += 12;
  doc.font('Helvetica')
     .text('IMPORTE BASE CRÉDITO FISCAL Bs', margin, yPos);
  doc.text(importeBaseCreditoFiscal.toFixed(2), pageWidth - margin - 30, yPos);

  yPos += 15;

  // Monto en palabras
  const numeroEnPalabras = convertirNumeroAPalabras(montoAPagar);
  doc.fontSize(8)
     .font('Helvetica')
     .text(`Son: ${numeroEnPalabras} 00/100 bolivianos`, margin, yPos, {
       width: contentWidth
     });

  yPos += 20;

  // Línea separadora
  doc.moveTo(margin, yPos)
     .lineTo(pageWidth - margin, yPos)
     .strokeColor('#000000')
     .lineWidth(0.5)
     .stroke();

  yPos += 15;

  // Textos legales
  doc.fontSize(7)
     .font('Helvetica')
     .fillColor('#000000')
     .text('"ESTA FACTURA CONTRIBUYE AL DESARROLLO DEL PAÍS, EL USO ILÍCITO DE ÉSTA SERÁ SANCIONADO DE ACUERDO A LEY"', margin, yPos, {
       width: contentWidth,
       align: 'center'
     });

  yPos += 12;
  doc.text('Ley N° 453: El proveedor debe exhibir certificaciones de habilitación o documentos que acrediten las capacidades u ofertas de servicios especializados', margin, yPos, {
     width: contentWidth,
     align: 'center'
   });

  yPos += 12;
  doc.text('"Este documento es la Representación Gráfica de un Documento Fiscal Digital emitido en una modalidad de facturación en línea"', margin, yPos, {
     width: contentWidth,
     align: 'center'
   });
};

/**
 * Convierte un número a palabras (versión simplificada)
 */
const convertirNumeroAPalabras = (numero) => {
  const unidades = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const decenas = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const especiales = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
  
  if (numero === 0) return 'cero';
  if (numero < 10) return unidades[Math.floor(numero)];
  if (numero < 20) return especiales[Math.floor(numero) - 10];
  if (numero < 100) {
    const decena = Math.floor(numero / 10);
    const unidad = Math.floor(numero % 10);
    if (unidad === 0) return decenas[decena];
    return `${decenas[decena]} y ${unidades[unidad]}`;
  }
  if (numero < 1000) {
    const centena = Math.floor(numero / 100);
    const resto = numero % 100;
    if (centena === 1) {
      return resto === 0 ? 'cien' : `ciento ${convertirNumeroAPalabras(resto)}`;
    }
    return `${unidades[centena]}cientos ${resto > 0 ? convertirNumeroAPalabras(resto) : ''}`;
  }
  if (numero < 1000000) {
    const miles = Math.floor(numero / 1000);
    const resto = numero % 1000;
    if (miles === 1) {
      return `mil ${resto > 0 ? convertirNumeroAPalabras(resto) : ''}`;
    }
    return `${convertirNumeroAPalabras(miles)} mil ${resto > 0 ? convertirNumeroAPalabras(resto) : ''}`;
  }
  return numero.toString();
};

/**
 * Genera un PDF del boleto de entrada con formato ticket térmico
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

      // Crear documento PDF con tamaño personalizado para ticket térmico (80mm de ancho)
      // 80mm = 226.77 puntos a 72 DPI
      // Alto suficiente para que quepa todo el contenido en una sola hoja
      const ticketWidth = 226.77; // 80mm
      const ticketHeight = 200; // Alto suficiente para todo el contenido

      const doc = new PDFDocument({
        size: [ticketWidth, ticketHeight],
        margin: 0
      });

      // Pipe a un archivo
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // Calcular total de entradas
      const totalEntradas = asientos.length + mesas.length + entradasGenerales.length || (compra.cantidad || 1);

      let currentY = 0;
      let ticketIndex = 0;

      // Generar boletos individuales
      // Asientos
      for (let i = 0; i < asientos.length; i++) {
        if (ticketIndex > 0) {
          // Agregar nueva página para cada boleto adicional
          doc.addPage({
            size: [ticketWidth, ticketHeight],
            margin: 0
          });
          currentY = 0;
        }
        const precio = parseFloat(asientos[i].precio || 0);
        const alturaUsada = await generarBoletoIndividual(doc, compra, evento, asientos[i], null, null, i, totalEntradas, precio);
        currentY = alturaUsada;
        ticketIndex++;
      }

      // Mesas
      for (let i = 0; i < mesas.length; i++) {
        if (ticketIndex > 0) {
          doc.addPage({
            size: [ticketWidth, ticketHeight],
            margin: 0
          });
          currentY = 0;
        }
        const index = asientos.length + i;
        const precio = parseFloat(mesas[i].precio_total || 0) / (mesas[i].cantidad_sillas || 1);
        const alturaUsada = await generarBoletoIndividual(doc, compra, evento, null, mesas[i], null, index, totalEntradas, precio);
        currentY = alturaUsada;
        ticketIndex++;
      }

      // Entradas generales
      for (let i = 0; i < entradasGenerales.length; i++) {
        if (ticketIndex > 0) {
          doc.addPage({
            size: [ticketWidth, ticketHeight],
            margin: 0
          });
          currentY = 0;
        }
        const index = asientos.length + mesas.length + i;
        const precio = parseFloat(compra.total || 0) / totalEntradas;
        const alturaUsada = await generarBoletoIndividual(doc, compra, evento, null, null, entradasGenerales[i], index, totalEntradas, precio);
        currentY = alturaUsada;
        ticketIndex++;
      }

      // Si no hay entradas específicas, generar un boleto general
      if (totalEntradas === 0 || (asientos.length === 0 && mesas.length === 0 && entradasGenerales.length === 0)) {
        const precio = parseFloat(compra.total || 0) / (compra.cantidad || 1);
        await generarBoletoIndividual(doc, compra, evento, null, null, null, 0, 1, precio);
      }

      // Generar factura/comprobante al final (en tamaño A4)
      await generarFactura(doc, compra, evento, asientos, mesas, entradasGenerales);

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
