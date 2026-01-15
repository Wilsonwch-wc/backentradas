import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Genera un código alfanumérico único para el boleto
 */
const generarCodigoBoleto = (codigoUnico, index) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo = 'TTX';
  for (let i = 0; i < 11; i++) {
    codigo += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return codigo;
};

/**
 * Genera un boleto individual compacto (diseño similar a las imágenes)
 */
const generarBoletoIndividual = async (doc, compra, evento, asiento, mesa, entradaGeneral, index, total, precio, startYOverride = null) => {
  // Dimensiones del boleto (más pequeño, similar a las imágenes)
  const boletoWidth = 400; // Ancho del boleto
  const boletoHeight = 200; // Alto del boleto
  const margin = 20;
  const pageWidth = 595; // A4 width
  const pageHeight = 842; // A4 height
  
  // Calcular posición para centrar el boleto en la página
  const startX = (pageWidth - boletoWidth) / 2;
  let startY = startYOverride !== null ? startYOverride : (margin + (index * (boletoHeight + margin * 2)));
  
  // Si no cabe en la página, crear nueva página
  if (startY + boletoHeight > pageHeight - margin) {
    doc.addPage();
    startY = margin;
  }

  // Fondo blanco del boleto
  doc.rect(startX, startY, boletoWidth, boletoHeight)
     .fillColor('#FFFFFF')
     .fill()
     .strokeColor('#000000')
     .lineWidth(1)
     .stroke();

  let yPos = startY + 15;
  let xPos = startX + 15;

  // Logo "plustiket" (similar a "todotix" de la imagen)
  doc.fontSize(18)
     .font('Helvetica-Bold')
     .fillColor('#000000')
     .text('plus', xPos, yPos);
  
  const plusWidth = doc.widthOfString('plus', { fontSize: 18, font: 'Helvetica-Bold' });
  doc.fontSize(18)
     .font('Helvetica-Bold')
     .fillColor('#E74C3C') // Rojo para "tiket"
     .text('tiket', xPos + plusWidth, yPos);

  yPos += 25;

  // Nombre del evento (en mayúsculas, centrado)
  const eventoNombre = (evento.titulo || 'Evento').toUpperCase();
  doc.fontSize(16)
     .font('Helvetica-Bold')
     .fillColor('#000000')
     .text(eventoNombre, startX, yPos, {
       width: boletoWidth,
       align: 'center'
     });

  yPos += 20;

  // Fecha y hora (formato: 2025-09-23 - 15:00:00)
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
  doc.fontSize(10)
     .font('Helvetica')
     .fillColor('#000000')
     .text(fechaHora, startX, yPos, {
       width: boletoWidth,
       align: 'center'
     });

  yPos += 20;

  // Sección izquierda: QR Code
  const qrSize = 100;
  const qrX = startX + 20;
  const qrY = yPos;

  // Sección derecha: Código alfanumérico vertical
  const codigoX = startX + boletoWidth - 100;
  const codigoY = yPos;

  // Generar código alfanumérico único
  const codigoBoleto = generarCodigoBoleto(compra.codigo_unico, index);
  
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
    
    doc.image(qrImageBuffer, qrX, qrY, {
      width: qrSize,
      height: qrSize
    });
  } catch (qrError) {
    console.error('Error al generar QR:', qrError);
  }

  // Código alfanumérico vertical (lado derecho) - mostrar cada carácter en una línea
  doc.fontSize(9)
     .font('Helvetica-Bold')
     .fillColor('#000000');
  
  // Mostrar código verticalmente (cada carácter en una nueva línea)
  let charY = codigoY;
  for (let i = 0; i < codigoBoleto.length; i++) {
    doc.text(codigoBoleto[i], codigoX, charY);
    charY += 12;
  }

  // Información del boleto (debajo del QR)
  const infoY = qrY + qrSize + 10;
  
  // Tipo de boleto
  let tipoBoleto = 'GENERAL';
  if (asiento && asiento.tipo_precio_nombre) {
    tipoBoleto = asiento.tipo_precio_nombre.toUpperCase();
  } else if (mesa) {
    tipoBoleto = 'MESA';
  }

  doc.fontSize(12)
     .font('Helvetica-Bold')
     .fillColor('#000000')
     .text(tipoBoleto, startX, infoY, {
       width: boletoWidth,
       align: 'center'
     });

  // Precio
  const precioTexto = precio ? `Bs. ${parseFloat(precio).toFixed(2)}` : 'Bs. 0.00';
  doc.fontSize(11)
     .font('Helvetica')
     .fillColor('#000000')
     .text(precioTexto, startX, infoY + 15, {
       width: boletoWidth,
       align: 'center'
     });

  // Asiento (si aplica)
  if (asiento && asiento.numero_asiento) {
    let asientoTexto = `Asiento: ${asiento.numero_asiento}`;
    if (asiento.numero_mesa) {
      asientoTexto = `Asiento: FILA ${asiento.numero_mesa}-${asiento.numero_asiento}`;
    } else if (asiento.area_nombre) {
      asientoTexto = `Asiento: ${asiento.area_nombre} - ${asiento.numero_asiento}`;
    }
    
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#000000')
       .text(asientoTexto, startX, infoY + 30, {
         width: boletoWidth,
         align: 'center'
       });
  } else if (mesa && mesa.numero_mesa) {
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#000000')
       .text(`Mesa: M${mesa.numero_mesa}`, startX, infoY + 30, {
         width: boletoWidth,
         align: 'center'
       });
  }

  // Número de orden (código único de la compra)
      doc.fontSize(8)
     .font('Helvetica')
     .fillColor('#666666')
     .text(`Número de orden: ${compra.codigo_unico}`, startX, infoY + 45, {
       width: boletoWidth,
           align: 'center'
         });
};

/**
 * Genera la factura/comprobante (similar a la imagen)
 */
const generarFactura = async (doc, compra, evento, asientos, mesas, entradasGenerales) => {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const contentWidth = pageWidth - (margin * 2);

  doc.addPage();

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
 * Genera un PDF del boleto de entrada con nuevo diseño compacto
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

      // Generar boletos individuales
      let globalIndex = 0;
      const boletoHeight = 200;
      const margin = 20;
      const boletoSpacing = boletoHeight + margin * 2;
      
      // Asientos
        for (let i = 0; i < asientos.length; i++) {
        // Calcular posición Y
        let currentY = margin + (globalIndex * boletoSpacing);
        
        // Si no cabe en la página, crear nueva página
        if (currentY + boletoHeight > 842 - margin) {
            doc.addPage();
          currentY = margin;
          globalIndex = 0; // Reiniciar índice en nueva página
        }
        
        const precio = parseFloat(asientos[i].precio || 0);
        await generarBoletoIndividual(doc, compra, evento, asientos[i], null, null, globalIndex, totalEntradas, precio, currentY);
        globalIndex++;
      }

      // Mesas
        for (let i = 0; i < mesas.length; i++) {
        // Calcular posición Y
        let currentY = margin + (globalIndex * boletoSpacing);
        
        // Si no cabe en la página, crear nueva página
        if (currentY + boletoHeight > 842 - margin) {
            doc.addPage();
          currentY = margin;
          globalIndex = 0; // Reiniciar índice en nueva página
        }
        
        const precio = parseFloat(mesas[i].precio_total || 0) / (mesas[i].cantidad_sillas || 1);
        await generarBoletoIndividual(doc, compra, evento, null, mesas[i], null, globalIndex, totalEntradas, precio, currentY);
        globalIndex++;
      }

      // Entradas generales
        for (let i = 0; i < entradasGenerales.length; i++) {
        // Calcular posición Y
        let currentY = margin + (globalIndex * boletoSpacing);
        
        // Si no cabe en la página, crear nueva página
        if (currentY + boletoHeight > 842 - margin) {
            doc.addPage();
          currentY = margin;
          globalIndex = 0; // Reiniciar índice en nueva página
        }
        
        const precio = parseFloat(compra.total || 0) / totalEntradas;
        await generarBoletoIndividual(doc, compra, evento, null, null, entradasGenerales[i], globalIndex, totalEntradas, precio, currentY);
        globalIndex++;
      }

      // Si no hay entradas específicas, generar un boleto general
      if (totalEntradas === 0 || (asientos.length === 0 && mesas.length === 0 && entradasGenerales.length === 0)) {
        const precio = parseFloat(compra.total || 0) / (compra.cantidad || 1);
        await generarBoletoIndividual(doc, compra, evento, null, null, null, 0, 1, precio, margin);
      }

      // Generar factura/comprobante al final
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
