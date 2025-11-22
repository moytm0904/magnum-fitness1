const PDFDocument = require('pdfkit');
// IMPORTANTE: Asegúrate de instalar esta librería: npm i @NumeroALetras/numero-a-letras
const { numeroALetras } = require('@NumeroALetras/numero-a-letras');

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
            const sectionBgColor = '#f8f9fa'; // Color de fondo para las nuevas secciones
            const sectionBorderColor = '#dee2e6'; // Color de borde para las nuevas secciones

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
            
            // -- Derecha: Totales Numéricos --
            const totalsX = 380;
            doc.fillColor(fontColor); // Reset color a negro
            
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

            doc.y += 20; // Espacio después de los totales

            // ======================================================================
            // === NUEVAS SECCIONES (Importe con letra, Moneda, Pago y CFDI Rel.) ===
            // ======================================================================
            
            let currentY = doc.y;
            
            // --- 1. Sección de Importe con Letra y Datos de Pago ---
            // Preparamos la moneda para la conversión a letras
            const letraCurrency = currency === 'MXN' ? 'PESOS MEXICANOS' : currency;
            const importeConLetra = numeroALetras(totalCompra, {
                plural: letraCurrency,
                singular: letraCurrency.replace('S', ''), // Intento simple de singularizar
                centPlural: 'CENTAVOS',
                centSingular: 'CENTAVO'
            });

            // Dibujar fondo y borde del bloque
            doc.rect(40, currentY, doc.page.width - 80, 65)
               .fillAndStroke(sectionBgColor, sectionBorderColor);
            
            doc.fillColor(fontColor).fontSize(9);
            let textY = currentY + 10;
            let col1X = 50;
            let col2X = 300;

            // Fila 1: Importe con letra
            doc.font(boldFont).text('Importe con letra:', col1X, textY);
            doc.font(normalFont).text(`${importeConLetra} ${currency === 'MXN' ? 'M.N.' : ''}`, col1X + 100, textY, { width: 380 });
            
            textY += 20;

            // Fila 2: Moneda y Tipo de Cambio
            doc.font(boldFont).text('Moneda:', col1X, textY);
            doc.font(normalFont).text(currency, col1X + 50, textY);
            
            if (currency !== 'MXN') {
                doc.font(boldFont).text('Tipo de Cambio:', col2X, textY);
                doc.font(normalFont).text(`1 ${currency} = $${exchangeRateText} MXN`, col2X + 90, textY);
            }
            
            textY += 15;

            // Fila 3: Método de Pago y Forma de Pago
            doc.font(boldFont).text('Método de Pago:', col1X, textY);
            // Concatenamos código y nombre para que se vea completo (ej: PUE - Pago en una sola exhibición)
            const metodoPagoCompleto = (data.metodoPago || '') + ' - ' + (data.metodoPagoNombre || '');
            doc.font(normalFont).text(metodoPagoCompleto, col1X + 90, textY);

            doc.font(boldFont).text('Forma de Pago:', col2X, textY);
            const formaPagoCompleta = (data.formaPago || '') + ' - ' + (data.formaPagoNombre || '');
            doc.font(normalFont).text(formaPagoCompleta, col2X + 90, textY);


            // --- 2. Sección de CFDI Relacionado ---
            currentY += 75; // Mover hacia abajo para la siguiente sección
            
            // Dibujar fondo y borde del bloque
            doc.rect(40, currentY, doc.page.width - 80, 45)
               .fillAndStroke(sectionBgColor, sectionBorderColor);

            // Título de la sección
            doc.fillColor(primaryColor).font(boldFont).fontSize(10)
               .text('CFDI Relacionado', 50, currentY + 5);
            
            doc.fillColor(fontColor).fontSize(9);
            textY = currentY + 22;

            // Fila 1: Tipo de relación y CFDI
            // NOTA: Estos datos suelen estar vacíos en una factura inicial, se dejan como placeholders.
            doc.font(boldFont).text('Tipo de relación:', col1X, textY);
            doc.font(normalFont).text('', col1X + 90, textY); // Valor vacío por ahora
            
            doc.font(boldFont).text('CFDI Relacionado:', col2X, textY);
            doc.font(normalFont).text('', col2X + 95, textY); // Valor vacío por ahora

            // ======================================================================
            // ======================================================================

            // --- Footer ---
            // Calculamos la posición Y del footer para que no se solape con las nuevas secciones
            // Nos aseguramos de que haya al menos 150px desde abajo, o más si las secciones nuevas empujan el contenido.
            const footerY = Math.max(doc.page.height - 150, currentY + 60); 

            doc.fillColor('#AAAAAA').fontSize(7);
            
            // Sello Digital
            doc.font(boldFont).text('Sello Digital del CFDI:', 40, footerY);
            doc.font(normalFont).text('||1.1|UUID|FECHA|SELLO_DIGITAL_MUY_LARGO_DEL_SAT_QUE_VA_AQUI||', { width: 500 });
            
            doc.moveDown(0.5);
            
            // Sello SAT
            doc.font(boldFont).text('Sello del SAT:', 40, doc.y);
            doc.font(normalFont).text('||SELLO_DEL_SAT_MUY_LARGO_QUE_VA_AQUI_PARA_VALIDAR||', { width: 500 });

            doc.moveDown(1);
            doc.fillColor(fontColor).fontSize(8).text('Este documento es una representación impresa de un CFDI.', 40, doc.y, { align: 'center', width: doc.page.width - 80 });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { generateInvoicePdfBuffer };