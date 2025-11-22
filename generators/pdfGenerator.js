const PDFDocument = require('pdfkit');

function generateInvoicePdfBuffer(data) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'letter', margin: 40 });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));

            // --- Colores y Fuentes ---
            const primaryColor = '#007BFF';
            const fontColor = '#333333';
            const boldFont = 'Helvetica-Bold';
            const normalFont = 'Helvetica';

            // --- DATOS DE MONEDA ---
            const currency = data.Moneda || 'MXN';
            // Aseguramos que sea número
            let exchangeRateVal = parseFloat(data.TipoCambio);
            if (isNaN(exchangeRateVal)) exchangeRateVal = 1;

            // CORRECCIÓN VISUAL DE TASA:
            // Si por alguna razón llega invertida (ej. 0.05), la volteamos para mostrarla estilo "1 USD = 18 MXN"
            if ((currency === 'USD' || currency === 'EUR' || currency === 'GBP') && exchangeRateVal < 1) {
                exchangeRateVal = 1 / exchangeRateVal;
            }
            
            const exchangeRateText = exchangeRateVal.toFixed(4);

            // --- Encabezado ---
            doc.rect(0, 0, doc.page.width, 100).fill(primaryColor);
            doc.fillColor('#FFFFFF')
                .font(boldFont).fontSize(22)
                .text('FACTURA MAGNUM FITNESS', 0, 30, { align: 'right', width: doc.page.width - 40 });
            doc.font(normalFont).fontSize(9);
            doc.text('Serie: MAG-001', { align: 'right' });
            doc.text(`Folio Fiscal (UUID): ${Date.now()}-${Math.floor(Math.random() * 1000000)}`, { align: 'right' });
            doc.text(`Fecha: ${new Date().toISOString().split('T')[0]}`, { align: 'right' });

            doc.y = 120;

            // --- Función auxiliar columnas ---
            function drawSectionWithColumns(title, leftContent, rightContent) {
                doc.fillColor(fontColor).font(boldFont).fontSize(11).text(title, 40);
                doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke(primaryColor);
                doc.moveDown(0.5);
                const startY = doc.y;
                doc.font(normalFont).fontSize(9).text(leftContent, 50, startY, { width: 250 });
                doc.text(rightContent, 320, startY, { width: 250 });
                doc.y = startY + 45; 
            }

            // --- Datos ---
            drawSectionWithColumns(
                'DATOS DEL EMISOR',
                `Nombre: Magnum Fitness S.A. de C.V.\nRFC: MAGM250101M99\nRégimen: 601 - General de Ley PM`,
                `Lugar de Expedición: 62740`
            );

            drawSectionWithColumns(
                'DATOS DEL RECEPTOR',
                `Nombre: ${data.razonSocial || 'SIN NOMBRE'}\nRFC: ${data.rfc || 'XAXX010101000'}`,
                `Régimen: ${data.regimenFiscalNombre || data.regimenFiscal}\nUso CFDI: ${data.usoCFDINombre || data.usoCFDI}`
            );

            // --- Cálculos ---
            const totalCompra = parseFloat(data.total || data.totalCompra || 0);
            const totalEnPesos = (totalCompra * exchangeRateVal).toFixed(2);
            
            // Desglose de impuestos (sobre el total en divisa)
            const subtotal = totalCompra / 1.16;
            const iva = totalCompra - subtotal;

            // --- Tabla ---
            doc.font(boldFont).fontSize(11).text('CONCEPTOS', 40);
            const tableTop = doc.y + 5;
            const headers = ['Cant', 'Unidad', 'Descripción', 'Valor Unit.', 'Importe'];
            const colWidths = [40, 50, 220, 80, 80]; 
            let currentX = 40;
            
            doc.rect(currentX, tableTop, doc.page.width - 80, 20).fill(primaryColor);
            doc.fillColor('#FFFFFF').fontSize(8).font(boldFont);
            headers.forEach((header, i) => {
                doc.text(header, currentX + 5, tableTop + 6, { width: colWidths[i] - 10 });
                currentX += colWidths[i];
            });

            const rowY = tableTop + 25;
            currentX = 40;
            const description = (data.productName || 'Servicios').substring(0, 60);
            const rowData = [
                '1', 'E48', description,
                `$${subtotal.toFixed(2)}`, `$${subtotal.toFixed(2)}`
            ];
            
            doc.fillColor(fontColor).fontSize(8).font(normalFont);
            rowData.forEach((cell, i) => {
                doc.text(cell, currentX + 5, rowY, { width: colWidths[i] - 10 });
                currentX += colWidths[i];
            });

            // --- Sección de Totales y Moneda ---
            let finalY = rowY + 40;
            
            // -- Izquierda: Datos de Moneda --
            doc.font(boldFont).fontSize(9).text('Forma de Pago:', 40, finalY, { continued: true })
                .font(normalFont).text(` ${data.formaPagoNombre || data.formaPago}`);
            
            doc.font(boldFont).text('Método de Pago:', 40, doc.y, { continued: true })
                .font(normalFont).text(` ${data.metodoPagoNombre || data.metodoPago}`);

            doc.moveDown(0.5);
            doc.font(boldFont).text('Moneda:', 40, doc.y, { continued: true })
                .font(normalFont).text(` ${currency}`);

            if (currency !== 'MXN') {
                doc.moveDown(0.2);
                doc.font(boldFont).text('Tipo de Cambio:', 40, doc.y, { continued: true })
                   .font(normalFont).text(` 1 ${currency} = $${exchangeRateText} MXN`);
                
                doc.moveDown(0.2);
                doc.fillColor('#555555');
                doc.font(boldFont).text('Equivalente en Pesos:', 40, doc.y, { continued: true })
                   .font(normalFont).text(` $${totalEnPesos} MXN`);
            }

            // -- Derecha: Totales Numéricos --
            const totalsX = 380;
            doc.fillColor(fontColor); // Reset color
            
            // Subtotal e IVA en la moneda de pago
            doc.font(normalFont).fontSize(10)
                .text('Subtotal:', totalsX, finalY).text(`$${subtotal.toFixed(2)}`, { align: 'right' });
            doc.text('IVA (16%):', totalsX, doc.y).text(`$${iva.toFixed(2)}`, { align: 'right' });
            
            doc.moveTo(totalsX - 10, doc.y + 5).lineTo(doc.page.width - 40, doc.y + 5).stroke(primaryColor);
            doc.moveDown(0.5);
            
            // TOTAL PAGADO (En la moneda del usuario)
            doc.font(boldFont).fontSize(12).fillColor(primaryColor)
                .text('TOTAL PAGADO:', totalsX, doc.y)
                .text(`$${totalCompra.toFixed(2)} ${currency}`, { align: 'right' });

            // --- Footer ---
            const footerY = doc.page.height - 100;
            doc.fillColor('#AAAAAA').fontSize(7);
            doc.text('Este documento es una representación impresa de un CFDI.', 40, footerY, { align: 'center', width: doc.page.width - 80 });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { generateInvoicePdfBuffer };