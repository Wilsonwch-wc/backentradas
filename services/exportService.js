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
    resumenSheet.getCell('A1').value = 'REPORTE DE VENTAS - PlusTicket';
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
        const row = comprasSheet.addRow([
          compra.id,
          compra.codigo_unico,
          compra.cliente_nombre,
          compra.cliente_email || '',
          compra.cliente_telefono || '',
          compra.cantidad,
          parseFloat(compra.total || 0).toFixed(2),
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
 * Genera un reporte en formato PDF
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

      // Encabezado
      doc.fontSize(24)
         .font('Helvetica-Bold')
         .fillColor('#2C3E50')
         .text('REPORTE DE VENTAS', { align: 'center' });

      doc.moveDown();
      doc.fontSize(10)
         .font('Helvetica')
         .fillColor('#7F8C8D')
         .text(`Generado el: ${new Date().toLocaleString('es-ES')}`, { align: 'center' });

      // Información del evento
      if (datos.evento) {
        doc.moveDown(1.5);
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#34495E')
           .text(`Evento: ${datos.evento.titulo}`, { align: 'center' });
      }

      let yPos = 150;

      // Estadísticas
      if (datos.estadisticas) {
        yPos += 20;
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#2C3E50')
           .text('ESTADÍSTICAS GENERALES', 50, yPos);

        yPos += 25;
        const stats = datos.estadisticas;

        if (stats.tipo_evento === 'general' && stats.generales) {
          const gen = stats.generales;
          doc.fontSize(11)
             .font('Helvetica')
             .fillColor('#34495E')
             .text(`Límite Total: ${gen.limite_total !== null ? gen.limite_total : 'N/A'}`, 70, yPos);
          yPos += 20;
          doc.text(`Vendidas: ${gen.vendidas}`, 70, yPos);
          yPos += 20;
          doc.text(`Disponibles: ${gen.disponibles !== null ? gen.disponibles : 'N/A'}`, 70, yPos);
          yPos += 20;
          doc.text(`Escaneadas: ${gen.escaneadas}`, 70, yPos);
          yPos += 20;
          doc.text(`Faltantes por Escanear: ${gen.total_faltantes}`, 70, yPos);
        } else if (stats.tipo_evento === 'especial') {
          if (stats.asientos) {
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .text('Asientos Individuales:', 70, yPos);
            yPos += 20;
            doc.fontSize(11)
               .font('Helvetica')
               .text(`  Límite Total: ${stats.asientos.limite_total !== null ? stats.asientos.limite_total : 'N/A'}`, 90, yPos);
            yPos += 20;
            doc.text(`  Vendidos: ${stats.asientos.vendidas}`, 90, yPos);
            yPos += 20;
            doc.text(`  Escaneados: ${stats.asientos.escaneadas}`, 90, yPos);
            yPos += 25;
          }
          if (stats.mesas) {
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .text('Mesas:', 70, yPos);
            yPos += 20;
            doc.fontSize(11)
               .font('Helvetica')
               .text(`  Límite Total: ${stats.mesas.limite_total !== null ? stats.mesas.limite_total : 'N/A'}`, 90, yPos);
            yPos += 20;
            doc.text(`  Vendidas: ${stats.mesas.vendidas}`, 90, yPos);
            yPos += 20;
            doc.text(`  Escaneadas: ${stats.mesas.escaneadas}`, 90, yPos);
          }
        }
      }

      // Tabla de compras
      if (datos.compras && datos.compras.length > 0) {
        yPos += 40;
        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }

        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#2C3E50')
           .text('COMPRAS', 50, yPos);

        yPos += 25;

        // Encabezados de tabla
        const tableTop = yPos;
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#FFFFFF')
           .rect(50, tableTop, 495, 25)
           .fill('#34495E')
           .fillColor('#FFFFFF')
           .text('ID', 55, tableTop + 8)
           .text('Código', 85, tableTop + 8)
           .text('Cliente', 160, tableTop + 8)
           .text('Cantidad', 270, tableTop + 8)
           .text('Total', 330, tableTop + 8)
           .text('Estado', 390, tableTop + 8)
           .text('Fecha', 460, tableTop + 8);

        yPos = tableTop + 25;

        // Datos de la tabla
        datos.compras.slice(0, 20).forEach((compra, index) => {
          if (yPos > 750) {
            doc.addPage();
            yPos = 50;
          }

          const rowColor = index % 2 === 0 ? '#F8F9FA' : '#FFFFFF';
          doc.rect(50, yPos, 495, 20)
             .fill(rowColor);

          doc.fontSize(8)
             .font('Helvetica')
             .fillColor('#2C3E50')
             .text(compra.id.toString(), 55, yPos + 6)
             .text(compra.codigo_unico.substring(0, 10), 85, yPos + 6)
             .text(compra.cliente_nombre.substring(0, 20), 160, yPos + 6)
             .text(compra.cantidad.toString(), 270, yPos + 6)
             .text(`Bs. ${parseFloat(compra.total || 0).toFixed(2)}`, 330, yPos + 6)
             .text(compra.estado, 390, yPos + 6)
             .text(
               compra.fecha_compra 
                 ? new Date(compra.fecha_compra).toLocaleDateString('es-ES') 
                 : '',
               460,
               yPos + 6
             );

          yPos += 20;
        });

        if (datos.compras.length > 20) {
          doc.fontSize(9)
             .fillColor('#7F8C8D')
             .text(`... y ${datos.compras.length - 20} compras más`, 50, yPos + 10);
        }
      }

      // Footer
      const pageHeight = doc.page.height;
      const pageWidth = doc.page.width;
      doc.fontSize(8)
         .fillColor('#95A5A6')
         .text('plustiket.com - Tu plataforma de confianza', pageWidth / 2, pageHeight - 30, {
           align: 'center'
         });

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

