// generators/pdfGenerator.js

const PDFDocument = require('pdfkit');

function generateInvoicePdfBuffer(data) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'letter', margin: 40 });
            const chunks = [];

            // Acumular los fragmentos del PDF en memoria
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));

            // --- Colores y Fuentes ---
            const primaryColor = '#007BFF';
            const fontColor = '#333333';
            const boldFont = 'Helvetica-Bold';
            const normalFont = 'Helvetica';

            // --- Encabezado Azul ---
            doc.rect(0, 0, doc.page.width, 100).fill(primaryColor);
            doc.fillColor('#FFFFFF')
                .font(boldFont)
                .fontSize(22)
                .text('FACTURA MAGNUM FITNESS', 0, 30, { align: 'right', width: doc.page.width - 40 });
            doc.font(normalFont).fontSize(9);
            doc.text('Serie: MAG-001', { align: 'right' });
            doc.text(`Folio Fiscal (UUID): ${Date.now()}-${Math.floor(Math.random() * 1000000)}`, { align: 'right' });
            doc.text(`Fecha: ${new Date().toISOString().split('T')[0]}`, { align: 'right' });

            try {
                // Si tienes la imagen en una ruta accesible, úsala
                doc.image('icono_1.png', 40, 5, { fit: [90, 90], align: 'center', valign: 'center' });
            } catch (e) {
                // Si no existe la imagen (por ejemplo en hosting), no falla el PDF
                console.warn("⚠️ Imagen de logo no encontrada, se omitirá en el PDF");
            }

            doc.y = 120;

            // --- Función auxiliar para dibujar secciones ---
            function drawSectionWithColumns(title, leftContent, rightContent) {
                doc.fillColor(fontColor).font(boldFont).fontSize(11).text(title, 40);
                doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke(primaryColor);
                doc.moveDown(0.5);
                const leftColX = 50, rightColX = 320, colWidth = 250, startY = doc.y;
                doc.font(normalFont).fontSize(9).text(leftContent, leftColX, startY, { width: colWidth });
                doc.text(rightContent, rightColX, startY, { width: colWidth });
                const leftHeight = doc.heightOfString(leftContent, { width: colWidth });
                const rightHeight = doc.heightOfString(rightContent, { width: colWidth });
                doc.y = startY + Math.max(leftHeight, rightHeight) + 20;
            }

            // --- Contenido de la Factura ---
            drawSectionWithColumns(
                'DATOS DEL EMISOR',
                `Nombre: Magnum Fitness S.A. de C.V.\nRFC: MAGM250101M99`,
                `Régimen Fiscal: 601 - General de Ley Personas Morales\nLugar de Expedición: 62740`
            );

            drawSectionWithColumns(
                'DATOS DEL RECEPTOR',
                `Nombre: ${data.razonSocial || 'SIN NOMBRE'}\nRFC: ${data.rfc || 'XAXX010101000'}`,
                `Régimen Fiscal: ${data.regimenFiscalNombre || data.regimenFiscal}\nUso de CFDI: ${data.usoCFDINombre || data.usoCFDI}`
            );

            // --- Cálculos de impuestos ---
            const totalCompra = data.totalCompra;
            const subtotal = totalCompra / 1.16;
            const iva = totalCompra - subtotal;

            // --- Tabla de Conceptos ---
            doc.font(boldFont).fontSize(11).text('CONCEPTOS', 40);
            const tableTop = doc.y + 5;
            const headers = ['Clave Prod/Serv', 'Cant.', 'Unidad', 'Descripción', 'Valor Unitario', 'IVA', 'Importe'];
            const colWidths = [80, 40, 50, 150, 80, 40, 80];
            let currentX = 40;
            doc.rect(currentX, tableTop, doc.page.width - 80, 20).fill(primaryColor);
            doc.fillColor('#FFFFFF').fontSize(8).font(boldFont);
            headers.forEach((header, i) => {
                doc.text(header, currentX + 5, tableTop + 6, { width: colWidths[i] - 10 });
                currentX += colWidths[i];
            });

            const rowY = tableTop + 25;
            currentX = 40;
            const description = data.productName || 'Producto o servicio según folio de compra';
            const rowData = [
                '84111506', '1', 'Servicio', description,
                `$${subtotal.toFixed(2)}`, '16%', `$${subtotal.toFixed(2)}`
            ];
            doc.fillColor(fontColor).fontSize(8).font(normalFont);
            rowData.forEach((cell, i) => {
                doc.text(cell, currentX + 5, rowY, { width: colWidths[i] - 10 });
                currentX += colWidths[i];
            });

            // --- Totales y Método de Pago ---
            let finalY = rowY + 30;
            doc.font(boldFont).fontSize(9).text('Método de Pago:', 40, finalY, { continued: true })
                .font(normalFont).text(` ${data.metodoPagoNombre || data.metodoPago}`);
            doc.font(boldFont).text('Forma de Pago:', 40, doc.y, { continued: true })
                .font(normalFont).text(` ${data.formaPagoNombre || data.formaPago}`);
            doc.font(boldFont).text('Moneda:', 40, doc.y, { continued: true })
                .font(normalFont).text(' MXN');

            const totalsX = 380;
            doc.font(normalFont).fontSize(10)
                .text('Subtotal:', totalsX, finalY).text(`$${subtotal.toFixed(2)}`, { align: 'right' });
            doc.text('IVA (16%):', totalsX, doc.y).text(`$${iva.toFixed(2)}`, { align: 'right' });
            doc.moveTo(totalsX - 10, doc.y + 15).lineTo(doc.page.width - 40, doc.y + 15).stroke(primaryColor);
            doc.moveDown(0.5);
            doc.font(boldFont).fontSize(12).fillColor(primaryColor)
                .text('TOTAL:', totalsX, doc.y).text(`$${totalCompra.toFixed(2)} MXN`, { align: 'right' });

            const footerY = doc.page.height - 150;
            doc.fillColor('#AAAAAA').fontSize(8);
            doc.rect(40, footerY, 100, 100).dash(5, { space: 5 }).stroke();
            doc.font(boldFont).text('Sello Digital del CFDI:', 160, footerY)
                .font(normalFont).text('(Placeholder - Generado por sistema de timbrado)', { width: 350 });
            doc.moveDown(0.5);
            doc.font(boldFont).text('Sello del SAT:', 160, doc.y)
                .font(normalFont).text('(Placeholder - Generado por sistema de timbrado)', { width: 350 });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { generateInvoicePdfBuffer };
