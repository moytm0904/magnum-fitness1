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

            // --- DATOS DE MONEDA ---
            const currency = data.Moneda || 'MXN';
            // Aseguramos que sea un número para cálculos
            const exchangeRateVal = parseFloat(data.TipoCambio) || 1;
            // Formato visual (ej: 18.5000)
            const exchangeRateText = exchangeRateVal.toFixed(4);

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
                // Si tienes logo, descomenta esta línea:
                // doc.image('path/to/logo.png', 40, 5, { fit: [90, 90], align: 'center', valign: 'center' });
            } catch (e) {
                console.warn("⚠️ Imagen de logo no encontrada");
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

            // --- Datos Emisor/Receptor ---
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
            // 'data.total' viene en la moneda de pago (ej. USD)
            const totalCompra = parseFloat(data.total || 0);
            
            // Si es moneda extranjera, calculamos el equivalente en pesos para mostrarlo
            // (Opcional, pero útil en facturas mexicanas)
            const totalEnPesos = (totalCompra * exchangeRateVal).toFixed(2);

            const subtotal = totalCompra / 1.16;
            const iva = totalCompra - subtotal;

            // --- Tabla de Conceptos ---
            doc.font(boldFont).fontSize(11).text('CONCEPTOS', 40);
            const tableTop = doc.y + 5;
            const headers = ['Clave Prod', 'Cant', 'Unidad', 'Descripción', 'Valor Unit.', 'IVA', 'Importe'];
            const colWidths = [60, 30, 50, 180, 70, 40, 70]; // Ajustado para caber
            let currentX = 40;
            
            doc.rect(currentX, tableTop, doc.page.width - 80, 20).fill(primaryColor);
            doc.fillColor('#FFFFFF').fontSize(8).font(boldFont);
            
            headers.forEach((header, i) => {
                doc.text(header, currentX + 5, tableTop + 6, { width: colWidths[i] - 10 });
                currentX += colWidths[i];
            });

            const rowY = tableTop + 25;
            currentX = 40;
            const description = (data.productName || 'Producto/Servicio').substring(0, 45); // Cortar si es muy largo
            const rowData = [
                '84111506', '1', 'E48', description,
                `$${subtotal.toFixed(2)}`, '16%', `$${subtotal.toFixed(2)}`
            ];
            
            doc.fillColor(fontColor).fontSize(8).font(normalFont);
            rowData.forEach((cell, i) => {
                doc.text(cell, currentX + 5, rowY, { width: colWidths[i] - 10 });
                currentX += colWidths[i];
            });

            // --- Totales y Datos de Pago ---
            let finalY = rowY + 40; // Espacio después de la tabla
            
            // Columna Izquierda: Datos de Pago
            doc.font(boldFont).fontSize(9).text('Método de Pago:', 40, finalY, { continued: true })
                .font(normalFont).text(` ${data.metodoPagoNombre || data.metodoPago}`);
            doc.font(boldFont).text('Forma de Pago:', 40, doc.y, { continued: true })
                .font(normalFont).text(` ${data.formaPagoNombre || data.formaPago}`);
            
            // --- MOSTRAR MONEDA Y TIPO DE CAMBIO ---
            doc.font(boldFont).text('Moneda:', 40, doc.y, { continued: true })
                .font(normalFont).text(` ${currency}`);

            if (currency !== 'MXN') {
                doc.moveDown(0.2);
                doc.font(boldFont).text('Tipo de Cambio:', 40, doc.y, { continued: true })
                   .font(normalFont).text(` $${exchangeRateText} MXN`);
                   
                // Opcional: Mostrar el total en pesos también
                doc.moveDown(0.2);
                doc.fillColor('#777777');
                doc.font(boldFont).text('Equivalente en Pesos:', 40, doc.y, { continued: true })
                   .font(normalFont).text(` $${totalEnPesos} MXN`);
            }
            // ---------------------------------------

            // Columna Derecha: Totales Numéricos
            const totalsX = 380;
            doc.fillColor(fontColor); // Restaurar color negro
            
            doc.font(normalFont).fontSize(10)
                .text('Subtotal:', totalsX, finalY).text(`$${subtotal.toFixed(2)}`, { align: 'right' });
            doc.text('IVA (16%):', totalsX, doc.y).text(`$${iva.toFixed(2)}`, { align: 'right' });
            
            doc.moveTo(totalsX - 10, doc.y + 5).lineTo(doc.page.width - 40, doc.y + 5).stroke(primaryColor);
            doc.moveDown(0.5);
            
            // --- TOTAL FINAL ---
            doc.font(boldFont).fontSize(12).fillColor(primaryColor)
                .text('TOTAL:', totalsX, doc.y)
                .text(`$${totalCompra.toFixed(2)} ${currency}`, { align: 'right' });

            // --- Footer (Sellos) ---
            const footerY = doc.page.height - 130;
            doc.fillColor('#AAAAAA').fontSize(7);
            
            // Sello Digital
            doc.font(boldFont).text('Sello Digital del CFDI:', 40, footerY);
            doc.font(normalFont).text('||1.1|UUID|FECHA|SELLO_DIGITAL_MUY_LARGO_DEL_SAT_QUE_VA_AQUI||', { width: 500 });
            
            doc.moveDown(0.5);
            
            // Sello SAT
            doc.font(boldFont).text('Sello del SAT:', 40, doc.y);
            doc.font(normalFont).text('||SELLO_DEL_SAT_MUY_LARGO_QUE_VA_AQUI_PARA_VALIDAR||', { width: 500 });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { generateInvoicePdfBuffer };