import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Genera un reporte en formato Excel
 */
export const generarReporteExcel = async (datos, nombreArchivo = 'reporte') => {
  try {
    const workbook = new ExcelJS.Workbook();
    
    // Crear hoja de resumen
    const resumenSheet = workbook.addWorksheet('Resumen');
    
    // Estilos
    const headerStyle = {
      font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF3498DB' }
      },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      }
    };

    const titleStyle = {
      font: { bold: true, size: 16, color: { argb: 'FF2C3E50' } },
      alignment: { horizontal: 'center', vertical: 'middle' }
    };

    // Título
    resumenSheet.mergeCells('A1:E1');
    resumenSheet.getCell('A1').value = 'REPORTE DE VENTAS - PlusTiket';
    resumenSheet.getCell('A1').style = titleStyle;
    resumenSheet.getRow(1).height = 30;

    // Fecha de generación
    resumenSheet.mergeCells('A2:E2');
    resumenSheet.getCell('A2').value = `Generado el: ${new Date().toLocaleString('es-ES')}`;
    resumenSheet.getCell('A2').style = {
      font: { size: 10, italic: true },
      alignment: { horizontal: 'center' }
    };
    resumenSheet.getRow(2).height = 20;

    // Información del evento
    if (datos.evento) {
      resumenSheet.mergeCells('A3:E3');
      resumenSheet.getCell('A3').value = `Evento: ${datos.evento.titulo}`;
      resumenSheet.getCell('A3').style = {
        font: { bold: true, size: 12 },
        alignment: { horizontal: 'center' }
      };
      resumenSheet.getRow(3).height = 25;
    }

    let rowIndex = 5;

    // Resumen por tipo de pago
    if (datos.resumenTipoPago) {
      const rtp = datos.resumenTipoPago;
      resumenSheet.mergeCells(`A${rowIndex}:E${rowIndex}`);
      resumenSheet.getCell(`A${rowIndex}`).value = 'RESUMEN POR TIPO DE PAGO';
      resumenSheet.getCell(`A${rowIndex}`).style = {
        font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
        fill: {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF25D366' }
        }
      };
      rowIndex++;
      resumenSheet.getCell(`A${rowIndex}`).value = 'Pagos QR:';
      resumenSheet.getCell(`B${rowIndex}`).value = rtp.pagos_qr;
      resumenSheet.getCell(`C${rowIndex}`).value = `Bs. ${parseFloat(rtp.total_qr || 0).toFixed(2)}`;
      rowIndex++;
      resumenSheet.getCell(`A${rowIndex}`).value = 'Pagos Efectivo:';
      resumenSheet.getCell(`B${rowIndex}`).value = rtp.pagos_efectivo;
      resumenSheet.getCell(`C${rowIndex}`).value = `Bs. ${parseFloat(rtp.total_efectivo || 0).toFixed(2)}`;
      rowIndex += 2;
    }

    // Estadísticas generales
    if (datos.estadisticas) {
      const stats = datos.estadisticas;
      resumenSheet.mergeCells(`A${rowIndex}:E${rowIndex}`);
      resumenSheet.getCell(`A${rowIndex}`).value = 'ESTADÍSTICAS GENERALES';
      resumenSheet.getCell(`A${rowIndex}`).style = headerStyle;
      resumenSheet.getRow(rowIndex).height = 25;
      rowIndex++;

      if (stats.tipo_evento === 'general' && stats.generales) {
        const gen = stats.generales;
        resumenSheet.getCell(`A${rowIndex}`).value = 'Límite Total:';
        resumenSheet.getCell(`B${rowIndex}`).value = gen.limite_total !== null ? gen.limite_total : 'N/A';
        rowIndex++;
        resumenSheet.getCell(`A${rowIndex}`).value = 'Vendidas:';
        resumenSheet.getCell(`B${rowIndex}`).value = gen.vendidas;
        rowIndex++;
        resumenSheet.getCell(`A${rowIndex}`).value = 'Disponibles:';
        resumenSheet.getCell(`B${rowIndex}`).value = gen.disponibles !== null ? gen.disponibles : 'N/A';
        rowIndex++;
        resumenSheet.getCell(`A${rowIndex}`).value = 'Escaneadas:';
        resumenSheet.getCell(`B${rowIndex}`).value = gen.escaneadas;
        rowIndex++;
        resumenSheet.getCell(`A${rowIndex}`).value = 'Faltantes por Escanear:';
        resumenSheet.getCell(`B${rowIndex}`).value = gen.total_faltantes;
        rowIndex += 2;
      } else if (stats.tipo_evento === 'especial') {
        if (stats.asientos) {
          resumenSheet.getCell(`A${rowIndex}`).value = 'ASIENTOS INDIVIDUALES';
          resumenSheet.getCell(`A${rowIndex}`).style = { font: { bold: true } };
          rowIndex++;
          resumenSheet.getCell(`A${rowIndex}`).value = '  Límite Total:';
          resumenSheet.getCell(`B${rowIndex}`).value = stats.asientos.limite_total !== null ? stats.asientos.limite_total : 'N/A';
          rowIndex++;
          resumenSheet.getCell(`A${rowIndex}`).value = '  Vendidos:';
          resumenSheet.getCell(`B${rowIndex}`).value = stats.asientos.vendidas;
          rowIndex++;
          resumenSheet.getCell(`A${rowIndex}`).value = '  Escaneados:';
          resumenSheet.getCell(`B${rowIndex}`).value = stats.asientos.escaneadas;
          rowIndex += 2;
        }
        if (stats.mesas) {
          resumenSheet.getCell(`A${rowIndex}`).value = 'MESAS';
          resumenSheet.getCell(`A${rowIndex}`).style = { font: { bold: true } };
          rowIndex++;
          resumenSheet.getCell(`A${rowIndex}`).value = '  Límite Total:';
          resumenSheet.getCell(`B${rowIndex}`).value = stats.mesas.limite_total !== null ? stats.mesas.limite_total : 'N/A';
          rowIndex++;
          resumenSheet.getCell(`A${rowIndex}`).value = '  Vendidas:';
          resumenSheet.getCell(`B${rowIndex}`).value = stats.mesas.vendidas;
          rowIndex++;
          resumenSheet.getCell(`A${rowIndex}`).value = '  Escaneadas:';
          resumenSheet.getCell(`B${rowIndex}`).value = stats.mesas.escaneadas;
          rowIndex += 2;
        }
        if (stats.zonas_generales) {
          const zg = stats.zonas_generales;
          resumenSheet.getCell(`A${rowIndex}`).value = 'ZONAS GENERALES (PERSONAS DE PIE)';
          resumenSheet.getCell(`A${rowIndex}`).style = { font: { bold: true } };
          rowIndex++;
          resumenSheet.getCell(`A${rowIndex}`).value = '  Capacidad Total:';
          resumenSheet.getCell(`B${rowIndex}`).value = zg.limite_total !== null ? zg.limite_total : 'N/A';
          rowIndex++;
          resumenSheet.getCell(`A${rowIndex}`).value = '  Vendidas:';
          resumenSheet.getCell(`B${rowIndex}`).value = zg.vendidas;
          rowIndex++;
          resumenSheet.getCell(`A${rowIndex}`).value = '  Escaneadas:';
          resumenSheet.getCell(`B${rowIndex}`).value = zg.escaneadas;
          rowIndex += 2;
        }
      }
    }

    // Hoja de compras
    if (datos.compras && datos.compras.length > 0) {
      const comprasSheet = workbook.addWorksheet('Compras');
      
      // Encabezados
      const headers = [
        'ID',
        'Código Único',
        'Cliente',
        'Email',
        'Teléfono',
        'Cantidad',
        'Total',
        'Tipo Venta',
        'Tipo Pago',
        'Estado',
        'Fecha Compra',
        'Fecha Pago'
      ];

      comprasSheet.getRow(1).values = headers;
      comprasSheet.getRow(1).font = { bold: true, size: 11 };
      comprasSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF34495E' }
      };
      comprasSheet.getRow(1).font = { ...comprasSheet.getRow(1).font, color: { argb: 'FFFFFFFF' } };
      comprasSheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
      comprasSheet.getRow(1).height = 25;

      // Datos
      datos.compras.forEach((compra, index) => {
        const tipoVentaLabel = compra.tipo_venta === 'REGALO_ADMIN' ? 'Regalo Admin' : compra.tipo_venta === 'OFERTA_ADMIN' ? 'Oferta' : 'Normal';
        const row = comprasSheet.addRow([
          compra.id,
          compra.codigo_unico,
          compra.cliente_nombre,
          compra.cliente_email || '',
          compra.cliente_telefono || '',
          compra.cantidad,
          parseFloat(compra.total || 0).toFixed(2),
          tipoVentaLabel,
          compra.tipo_pago || '-',
          compra.estado,
          compra.fecha_compra ? new Date(compra.fecha_compra).toLocaleString('es-ES') : '',
          compra.fecha_pago ? new Date(compra.fecha_pago).toLocaleString('es-ES') : ''
        ]);
        
        // Colores alternados
        if (index % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8F9FA' }
          };
        }
      });

      // Ajustar ancho de columnas
      comprasSheet.columns.forEach((column) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        });
        column.width = Math.min(maxLength + 2, 30);
      });
    }

    // Guardar archivo
    const exportDir = path.join(__dirname, '../uploads/reportes');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const filename = `${nombreArchivo}_${Date.now()}.xlsx`;
    const filepath = path.join(exportDir, filename);

    await workbook.xlsx.writeFile(filepath);

    return `/uploads/reportes/${filename}`;
  } catch (error) {
    console.error('Error al generar reporte Excel:', error);
    throw error;
  }
};

/**
 * Genera un reporte en formato PDF mejorado
 */
export const generarReportePDF = async (datos, nombreArchivo = 'reporte') => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });

      const exportDir = path.join(__dirname, '../uploads/reportes');
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }

      const filename = `${nombreArchivo}_${Date.now()}.pdf`;
      const filepath = path.join(exportDir, filename);
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // ========== ENCABEZADO SIMPLE ==========
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .fillColor('#2C3E50')
         .text('REPORTE DE VENTAS', 50, 50, { align: 'left' });

      doc.fontSize(9)
         .font('Helvetica')
         .fillColor('#666')
         .text(`Generado el: ${new Date().toLocaleString('es-ES')}`, 50, 75, { align: 'left' });

      // Información del evento
      if (datos.evento) {
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#34495E')
           .text(`Evento: ${datos.evento.titulo}`, 50, 95, { align: 'left' });
      }

      let yPos = 130;

      // ========== RESUMEN POR TIPO DE PAGO EN TABLA ==========
      if (datos.resumenTipoPago) {
        const rtp = datos.resumenTipoPago;
        const totalVentas = rtp.pagos_qr + rtp.pagos_efectivo;
        const totalIngresos = parseFloat(rtp.total_qr || 0) + parseFloat(rtp.total_efectivo || 0);
        
        yPos += 15;
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#2C3E50')
           .text('RESUMEN POR TIPO DE PAGO', 50, yPos);
        
        yPos += 20;
        
        // Tabla de resumen (más compacta)
        const resumenTableWidth = 350;
        const resumenTableX = 50;
        const resumenRowHeight = 18;
        
        // Encabezado de tabla
        doc.rect(resumenTableX, yPos, resumenTableWidth, resumenRowHeight)
           .fill('#34495E')
           .stroke('#2C3E50')
           .lineWidth(1);
        
        doc.fontSize(8)
           .font('Helvetica-Bold')
           .fillColor('#FFFFFF')
           .text('Tipo de Pago', resumenTableX + 8, yPos + 5)
           .text('Ventas', resumenTableX + 140, yPos + 5)
           .text('Total', resumenTableX + 210, yPos + 5);
        
        yPos += resumenRowHeight;
        
        // Fila QR
        doc.rect(resumenTableX, yPos, resumenTableWidth, resumenRowHeight)
           .fill('#E8F5E9')
           .stroke('#E0E0E0')
           .lineWidth(0.5);
        
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#2C3E50')
           .text('Pagos QR', resumenTableX + 8, yPos + 5)
           .text(`${rtp.pagos_qr} venta(s)`, resumenTableX + 140, yPos + 5)
           .font('Helvetica-Bold')
           .text(`Bs.${parseFloat(rtp.total_qr || 0).toFixed(2)}`, resumenTableX + 210, yPos + 5);
        
        yPos += resumenRowHeight;
        
        // Fila Efectivo
        doc.rect(resumenTableX, yPos, resumenTableWidth, resumenRowHeight)
           .fill('#FFF3E0')
           .stroke('#E0E0E0')
           .lineWidth(0.5);
        
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#2C3E50')
           .text('Pagos Efectivo', resumenTableX + 8, yPos + 5)
           .text(`${rtp.pagos_efectivo} venta(s)`, resumenTableX + 140, yPos + 5)
           .font('Helvetica-Bold')
           .text(`Bs.${parseFloat(rtp.total_efectivo || 0).toFixed(2)}`, resumenTableX + 210, yPos + 5);
        
        yPos += resumenRowHeight;
        
        // Fila Total General
        doc.rect(resumenTableX, yPos, resumenTableWidth, resumenRowHeight)
           .fill('#E3F2FD')
           .stroke('#2196F3')
           .lineWidth(2);
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#2C3E50')
           .text('TOTAL GENERAL', resumenTableX + 8, yPos + 5)
           .text(`${totalVentas} venta(s)`, resumenTableX + 140, yPos + 5)
           .fillColor('#2196F3')
           .text(`Bs.${totalIngresos.toFixed(2)}`, resumenTableX + 210, yPos + 5);
        
        yPos += resumenRowHeight + 12;
      }

      // ========== ESTADÍSTICAS GENERALES EN TABLA ==========
      if (datos.estadisticas) {
        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }
        
        yPos += 15;
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#2C3E50')
           .text('ESTADÍSTICAS GENERALES', 50, yPos);
        
        yPos += 20;
        const stats = datos.estadisticas;
        
        const statsTableWidth = doc.page.width - 100;
        const statsTableX = 50;
        const statsRowHeight = 16;
        
        // Encabezado de tabla de estadísticas (más compacto)
        doc.rect(statsTableX, yPos, statsTableWidth, statsRowHeight)
           .fill('#34495E')
           .stroke('#2C3E50')
           .lineWidth(1);
        
        doc.fontSize(8)
           .font('Helvetica-Bold')
           .fillColor('#FFFFFF')
           .text('Tipo', statsTableX + 8, yPos + 4)
           .text('Límite', statsTableX + 100, yPos + 4)
           .text('Vendidos', statsTableX + 170, yPos + 4)
           .text('Dispon.', statsTableX + 240, yPos + 4)
           .text('Escaneados', statsTableX + 310, yPos + 4)
           .text('Faltantes', statsTableX + 390, yPos + 4);
        
        yPos += statsRowHeight;

        if (stats.tipo_evento === 'general' && stats.generales) {
          const gen = stats.generales;
          doc.rect(statsTableX, yPos, statsTableWidth, statsRowHeight)
             .fill('#E3F2FD')
             .stroke('#E0E0E0')
             .lineWidth(0.5);
          
          doc.fontSize(8)
             .font('Helvetica')
             .fillColor('#2C3E50')
             .text('Entradas Generales', statsTableX + 8, yPos + 4)
             .text(gen.limite_total !== null ? gen.limite_total.toString() : 'N/A', statsTableX + 100, yPos + 4)
             .text(gen.vendidas.toString(), statsTableX + 170, yPos + 4)
             .text(gen.disponibles !== null ? gen.disponibles.toString() : 'N/A', statsTableX + 240, yPos + 4)
             .text(gen.escaneadas.toString(), statsTableX + 310, yPos + 4)
             .text(gen.total_faltantes.toString(), statsTableX + 390, yPos + 4);
          
          yPos += statsRowHeight + 8;
        } else if (stats.tipo_evento === 'especial') {
          if (stats.asientos) {
            doc.rect(statsTableX, yPos, statsTableWidth, statsRowHeight)
               .fill('#E8F5E9')
               .stroke('#E0E0E0')
               .lineWidth(0.5);
            
            doc.fontSize(8)
               .font('Helvetica')
               .fillColor('#2C3E50')
               .text('Asientos Individuales', statsTableX + 8, yPos + 4)
               .text(stats.asientos.limite_total !== null ? stats.asientos.limite_total.toString() : 'N/A', statsTableX + 100, yPos + 4)
               .text(stats.asientos.vendidas.toString(), statsTableX + 170, yPos + 4)
               .text((stats.asientos.limite_total !== null && stats.asientos.limite_total > 0) ? (stats.asientos.limite_total - stats.asientos.vendidas).toString() : 'N/A', statsTableX + 240, yPos + 4)
               .text(stats.asientos.escaneadas.toString(), statsTableX + 310, yPos + 4)
               .text((stats.asientos.vendidas - stats.asientos.escaneadas).toString(), statsTableX + 390, yPos + 4);
            
            yPos += statsRowHeight;
          }
          
          if (stats.mesas) {
            doc.rect(statsTableX, yPos, statsTableWidth, statsRowHeight)
               .fill('#FFF3E0')
               .stroke('#E0E0E0')
               .lineWidth(0.5);
            
            doc.fontSize(8)
               .font('Helvetica')
               .fillColor('#2C3E50')
               .text('Mesas', statsTableX + 8, yPos + 4)
               .text(stats.mesas.limite_total !== null ? stats.mesas.limite_total.toString() : 'N/A', statsTableX + 100, yPos + 4)
               .text(stats.mesas.vendidas.toString(), statsTableX + 170, yPos + 4)
               .text((stats.mesas.limite_total !== null && stats.mesas.limite_total > 0) ? (stats.mesas.limite_total - stats.mesas.vendidas).toString() : 'N/A', statsTableX + 240, yPos + 4)
               .text(stats.mesas.escaneadas.toString(), statsTableX + 310, yPos + 4)
               .text((stats.mesas.vendidas - stats.mesas.escaneadas).toString(), statsTableX + 390, yPos + 4);
            
            yPos += statsRowHeight;
          }
          
          if (stats.zonas_generales) {
            const zg = stats.zonas_generales;
            doc.rect(statsTableX, yPos, statsTableWidth, statsRowHeight)
               .fill('#F3E5F5')
               .stroke('#E0E0E0')
               .lineWidth(0.5);
            
            doc.fontSize(8)
               .font('Helvetica')
               .fillColor('#2C3E50')
               .text('Zonas Generales', statsTableX + 8, yPos + 4)
               .text(zg.limite_total !== null ? zg.limite_total.toString() : 'N/A', statsTableX + 100, yPos + 4)
               .text(zg.vendidas.toString(), statsTableX + 170, yPos + 4)
               .text((zg.limite_total !== null && zg.limite_total > 0) ? (zg.limite_total - zg.vendidas).toString() : 'N/A', statsTableX + 240, yPos + 4)
               .text(zg.escaneadas.toString(), statsTableX + 310, yPos + 4)
               .text((zg.vendidas - zg.escaneadas).toString(), statsTableX + 390, yPos + 4);
            
            yPos += statsRowHeight;
          }
          
          yPos += 8;
        }
      }

      // ========== COMPRAS DEL EVENTO - EN FORMATO TABLA ==========
      if (datos.compras && datos.compras.length > 0) {
        yPos += 25;
        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }

        // Título de sección
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#2C3E50')
           .text('COMPRAS DEL EVENTO', 50, yPos);
        
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#666')
           .text(`Total: ${datos.compras.length} compra(s)`, 50, yPos + 18);

        yPos += 35;

        // Encabezados de la tabla
        const tableTop = yPos;
        const tableWidth = doc.page.width - 100; // 495 puntos disponibles
        const rowHeight = 16;
        
        // Anchos de columnas optimizados para que quepa todo en una hoja
        // Total debe ser <= 495 puntos
        const colWidths = {
          id: 25,
          codigo: 65,
          cliente: 75,
          email: 85,
          telefono: 60,
          cantidad: 30,
          total: 55,
          tipo: 45,
          estado: 60,
          fecha: 60
        };
        
        // Verificar que la suma no exceda el ancho disponible
        const totalWidth = Object.values(colWidths).reduce((sum, width) => sum + width, 0);
        if (totalWidth > tableWidth) {
          // Ajustar proporcionalmente si es necesario
          const scale = tableWidth / totalWidth;
          Object.keys(colWidths).forEach(key => {
            colWidths[key] = Math.floor(colWidths[key] * scale);
          });
        }

        // Encabezado de tabla con fondo
        doc.rect(50, tableTop, tableWidth, rowHeight + 3)
           .fill('#34495E')
           .stroke('#2C3E50')
           .lineWidth(1);
        
        let headerX = 51;
        doc.fontSize(7)
           .font('Helvetica-Bold')
           .fillColor('#FFFFFF');
        
        doc.text('ID', headerX, tableTop + 5);
        headerX += colWidths.id;
        doc.text('Código', headerX, tableTop + 5);
        headerX += colWidths.codigo;
        doc.text('Cliente', headerX, tableTop + 5);
        headerX += colWidths.cliente;
        doc.text('Email', headerX, tableTop + 5);
        headerX += colWidths.email;
        doc.text('Tel.', headerX, tableTop + 5);
        headerX += colWidths.telefono;
        doc.text('Cant.', headerX, tableTop + 5);
        headerX += colWidths.cantidad;
        doc.text('Total', headerX, tableTop + 5);
        headerX += colWidths.total;
        doc.text('Tipo', headerX, tableTop + 5);
        headerX += colWidths.tipo;
        doc.text('Estado', headerX, tableTop + 5);
        headerX += colWidths.estado;
        doc.text('Fecha', headerX, tableTop + 5);

        yPos = tableTop + rowHeight + 3;

        // Función para dibujar encabezados en nueva página
        const dibujarEncabezados = (y) => {
          doc.rect(50, y, tableWidth, rowHeight + 3)
             .fill('#34495E')
             .stroke('#2C3E50')
             .lineWidth(1);
          
          let hX = 51;
          doc.fontSize(7)
             .font('Helvetica-Bold')
             .fillColor('#FFFFFF');
          
          doc.text('ID', hX, y + 5);
          hX += colWidths.id;
          doc.text('Código', hX, y + 5);
          hX += colWidths.codigo;
          doc.text('Cliente', hX, y + 5);
          hX += colWidths.cliente;
          doc.text('Email', hX, y + 5);
          hX += colWidths.email;
          doc.text('Tel.', hX, y + 5);
          hX += colWidths.telefono;
          doc.text('Cant.', hX, y + 5);
          hX += colWidths.cantidad;
          doc.text('Total', hX, y + 5);
          hX += colWidths.total;
          doc.text('Tipo', hX, y + 5);
          hX += colWidths.tipo;
          doc.text('Estado', hX, y + 5);
          hX += colWidths.estado;
          doc.text('Fecha', hX, y + 5);
        };

        // Mostrar TODAS las compras en formato tabla
        datos.compras.forEach((compra, index) => {
          // Verificar si necesitamos nueva página
          if (yPos > 750) {
            doc.addPage();
            yPos = 50;
            dibujarEncabezados(yPos);
            yPos += rowHeight + 3;
          }

          // Fondo de fila alternado
          const rowColor = index % 2 === 0 ? '#FFFFFF' : '#F8F9FA';
          doc.rect(50, yPos, tableWidth, rowHeight)
             .fill(rowColor)
             .stroke('#E0E0E0')
             .lineWidth(0.5);

          let cellX = 51;
          let cellY = yPos + 4;

          // ID
          doc.fontSize(6)
             .font('Helvetica')
             .fillColor('#666')
             .text(compra.id.toString(), cellX, cellY);
          cellX += colWidths.id;

          // Código (solo últimos caracteres para ahorrar espacio)
          const codigoCorto = compra.codigo_unico.length > 8 
            ? compra.codigo_unico.substring(compra.codigo_unico.length - 8)
            : compra.codigo_unico;
          doc.fontSize(6)
             .font('Helvetica')
             .fillColor('#2C3E50')
             .text(codigoCorto, cellX, cellY);
          cellX += colWidths.codigo;

          // Cliente
          doc.fontSize(6)
             .font('Helvetica')
             .fillColor('#2C3E50')
             .text((compra.cliente_nombre || 'N/A').substring(0, 12), cellX, cellY);
          cellX += colWidths.cliente;

          // Email (solo parte antes del @)
          const emailCorto = compra.cliente_email 
            ? compra.cliente_email.split('@')[0].substring(0, 15)
            : '-';
          doc.fontSize(6)
             .font('Helvetica')
             .fillColor('#34495E')
             .text(emailCorto, cellX, cellY);
          cellX += colWidths.email;

          // Teléfono
          doc.fontSize(6)
             .font('Helvetica')
             .fillColor('#34495E')
             .text((compra.cliente_telefono || '-').substring(0, 8), cellX, cellY);
          cellX += colWidths.telefono;

          // Cantidad
          doc.fontSize(6)
             .font('Helvetica-Bold')
             .fillColor('#2196F3')
             .text(compra.cantidad.toString(), cellX, cellY);
          cellX += colWidths.cantidad;

          // Total
          const total = parseFloat(compra.total || 0);
          doc.fontSize(6)
             .font('Helvetica-Bold')
             .fillColor(total > 0 ? '#4CAF50' : '#666')
             .text(`${total.toFixed(2)}`, cellX, cellY);
          cellX += colWidths.total;

          // Tipo de pago (abreviado)
          const tipoCorto = compra.tipo_pago === 'QR' ? 'QR' : 
                           compra.tipo_pago === 'EFECTIVO' ? 'EF' : 
                           (compra.tipo_pago || '-').substring(0, 4);
          doc.fontSize(6)
             .font('Helvetica')
             .fillColor('#666')
             .text(tipoCorto, cellX, cellY);
          cellX += colWidths.tipo;

          // Estado (abreviado)
          const estadoColor = compra.estado === 'PAGO_REALIZADO' ? '#4CAF50' : 
                             compra.estado === 'PAGO_PENDIENTE' ? '#FF9800' : 
                             compra.estado === 'CANCELADO' ? '#F44336' : '#666';
          const estadoTexto = compra.estado === 'PAGO_REALIZADO' ? 'PAG' :
                             compra.estado === 'PAGO_PENDIENTE' ? 'PEND' :
                             compra.estado === 'CANCELADO' ? 'CANC' : compra.estado.substring(0, 5);
          doc.fontSize(6)
             .font('Helvetica-Bold')
             .fillColor(estadoColor)
             .text(estadoTexto, cellX, cellY);
          cellX += colWidths.estado;

          // Fecha (solo día/mes)
          if (compra.fecha_compra) {
            const fecha = new Date(compra.fecha_compra).toLocaleDateString('es-ES', { 
              day: '2-digit', 
              month: '2-digit'
            });
            doc.fontSize(6)
               .font('Helvetica')
               .fillColor('#666')
               .text(fecha, cellX, cellY);
          } else {
            doc.fontSize(6)
               .font('Helvetica')
               .fillColor('#666')
               .text('-', cellX, cellY);
          }

          yPos += rowHeight;
        });
      }

      // ========== FOOTER SIMPLE ==========
      const pageHeight = doc.page.height;
      const pageWidth = doc.page.width;
      
      // Número de página (si hay múltiples páginas)
      try {
        const pages = doc.bufferedPageRange();
        if (pages && pages.count > 0) {
          for (let i = pages.start; i < pages.start + pages.count; i++) {
            doc.switchToPage(i);
            const pageNum = i - pages.start + 1;
            doc.fontSize(8)
               .font('Helvetica')
               .fillColor('#95A5A6')
               .text(`Página ${pageNum} de ${pages.count}`, pageWidth / 2, pageHeight - 30, {
                 align: 'center'
               });
          }
        }
      } catch (error) {
        // Si hay error al agregar números de página, continuar sin ellos
        console.warn('No se pudieron agregar números de página:', error.message);
      }

      doc.end();

      stream.on('finish', () => {
        resolve(`/uploads/reportes/${filename}`);
      });

      stream.on('error', (error) => {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
};

