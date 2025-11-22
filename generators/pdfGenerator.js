const PDFDocument = require('pdfkit');

// ==========================================================
// === FUNCIÓN AUXILIAR: NÚMERO A LETRAS (SIN LIBRERÍAS) ===
// ==========================================================
function numeroALetras(amount, currency) {
    // Mapeo de monedas a texto
    const currencyMap = {
        'MXN': { singular: 'PESO MEXICANO', plural: 'PESOS MEXICANOS' },
        'USD': { singular: 'DOLAR AMERICANO', plural: 'DOLARES AMERICANOS' },
        'EUR': { singular: 'EURO', plural: 'EUROS' },
        'CAD': { singular: 'DOLAR CANADIENSE', plural: 'DOLARES CANADIENSES' },
        'GBP': { singular: 'LIBRA ESTERLINA', plural: 'LIBRAS ESTERLINAS' },
        'JPY': { singular: 'YEN JAPONES', plural: 'YENES JAPONESES' }
    };

    const currencyText = currencyMap[currency] || { singular: currency, plural: currency };
    
    // Separar parte entera y decimal
    const amountStr = parseFloat(amount).toFixed(2);
    const parts = amountStr.split('.');
    const integerPart = parseInt(parts[0]);
    const decimalPart = parts[1];

    if (integerPart === 0) return `CERO ${currencyText.plural} ${decimalPart}/100 M.N.`;

    // Función recursiva para convertir grupos
    function getGroup(n) {
        const units = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
        const teens = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
        const tens = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
        const hundreds = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

        let output = '';

        if (n === 100) return 'CIEN';

        // Centenas
        if (n >= 100) {
            output += hundreds[Math.floor(n / 100)] + ' ';
            n %= 100;
        }

        // Decenas
        if (n >= 20) {
            output += tens[Math.floor(n / 10)];
            n %= 10;
            if (n > 0) output += ' Y ';
        } else if (n >= 10) {
            output += teens[n - 10] + ' ';
            n = 0;
        }

        // Unidades
        if (n > 0) {
            output += units[n] + ' ';
        }

        return output;
    }

    // Procesar millones, miles y unidades
    let text = '';
    let millions = Math.floor(integerPart / 1000000);
    let remainder = integerPart % 1000000;
    let thousands = Math.floor(remainder / 1000);
    let units = remainder % 1000;

    if (millions > 0) {
        if (millions === 1) text += 'UN MILLON ';
        else text += getGroup(millions) + ' MILLONES ';
    }

    if (thousands > 0) {
        if (thousands === 1) text += 'MIL ';
        else text += getGroup(thousands) + ' MIL ';
    }

    if (units > 0) {
        text += getGroup(units);
    }

    // Limpieza final de espacios
    text = text.trim();
    
    // Selección de moneda singular/plural
    const currencyLabel = integerPart === 1 ? currencyText.singular : currencyText.plural;
    
    // Formato final estándar factura: "SON: [TEXTO] [PESOS] 00/100 M.N."
    // Si es moneda extranjera, generalmente se pone el nombre de la moneda (ej. USD)
    const suffix = currency === 'MXN' ? 'M.N.' : '';
    
    return `SON: ${text} ${currencyLabel} ${decimalPart}/100 ${suffix}`.trim();
}


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
            const sectionBgColor = '#f8f9fa'; 
            const sectionBorderColor = '#dee2e6'; 

            // --- DATOS DE MONEDA ---
            const currency = data.Moneda || 'MXN';
            let exchangeRateVal = parseFloat(data.TipoCambio);
            if (isNaN(exchangeRateVal)) exchangeRateVal = 1;

            // Corrección de tasa visual si está invertida
            if ((currency === 'USD' || currency === 'EUR' || currency === 'GBP' || currency === 'CAD') && exchangeRateVal < 1) {
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

            // --- Sección de Totales ---
            let finalY = rowY + 40;
            const totalsX = 380;
            doc.fillColor(fontColor); 
            
            doc.font(normalFont).fontSize(10)
                .text('Subtotal:', totalsX, finalY).text(`$${subtotal.toFixed(2)}`, { align: 'right' });
            doc.text('IVA (16%):', totalsX, doc.y).text(`$${iva.toFixed(2)}`, { align: 'right' });
            
            doc.moveTo(totalsX - 10, doc.y + 5).lineTo(doc.page.width - 40, doc.y + 5).stroke(primaryColor);
            doc.moveDown(0.5);
            
            // TOTAL PAGADO (En la moneda del usuario)
            doc.font(boldFont).fontSize(12).fillColor(primaryColor)
                .text('TOTAL PAGADO:', totalsX, doc.y)
                .text(`$${totalCompra.toFixed(2)} ${currency}`, { align: 'right' });

            doc.y += 25;

            // ======================================================================
            // === NUEVAS SECCIONES (SIN LIBRERÍA EXTERNA) ===
            // ======================================================================
            
            let currentY = doc.y;
            
            // Usamos nuestra función propia 'numeroALetras'
            const importeConLetra = numeroALetras(totalCompra, currency);

            // Fondo gris
            doc.rect(40, currentY, doc.page.width - 80, 75).fillAndStroke(sectionBgColor, sectionBorderColor);
            
            doc.fillColor(fontColor).fontSize(9);
            let textY = currentY + 10;
            let col1X = 50;
            let col2X = 300;

            // Fila 1: Importe con letra
            doc.font(boldFont).text('Importe con letra:', col1X, textY);
            doc.font(normalFont).text(importeConLetra, col1X + 100, textY, { width: 380 });
            textY += 25; // Espacio si el texto es largo

            // Fila 2: Moneda y Tipo de Cambio
            doc.font(boldFont).text('Moneda:', col1X, textY);
            doc.font(normalFont).text(currency, col1X + 50, textY);
            
            if (currency !== 'MXN') {
                doc.font(boldFont).text('Tipo de Cambio:', col2X, textY);
                doc.font(normalFont).text(`1 ${currency} = $${exchangeRateText} MXN`, col2X + 90, textY);
            }
            
            textY += 15;

            // Fila 3: Método y Forma de Pago
            doc.font(boldFont).text('Método de Pago:', col1X, textY);
            const metodoPagoCompleto = (data.metodoPago || '') + ' - ' + (data.metodoPagoNombre || '');
            doc.font(normalFont).text(metodoPagoCompleto, col1X + 90, textY);

            doc.font(boldFont).text('Forma de Pago:', col2X, textY);
            const formaPagoCompleta = (data.formaPago || '') + ' - ' + (data.formaPagoNombre || '');
            doc.font(normalFont).text(formaPagoCompleta, col2X + 90, textY);
            
            textY += 15;

            // Fila 4: Equivalente en Pesos (Nuevo requerimiento)
            if (currency !== 'MXN') {
                 doc.font(boldFont).text('Equivalente en Pesos:', col1X, textY);
                 doc.font(normalFont).text(`$${totalEnPesos} MXN`, col1X + 110, textY);
            }

            // --- CFDI Relacionado ---
            currentY += 85; 
            doc.rect(40, currentY, doc.page.width - 80, 40).fillAndStroke(sectionBgColor, sectionBorderColor);
            doc.fillColor(primaryColor).font(boldFont).fontSize(10).text('CFDI Relacionado', 50, currentY + 5);
            
            doc.fillColor(fontColor).fontSize(9);
            textY = currentY + 20;
            doc.font(boldFont).text('Tipo de relación:', col1X, textY);
            doc.font(normalFont).text('', col1X + 90, textY); 
            doc.font(boldFont).text('CFDI Relacionado:', col2X, textY);
            doc.font(normalFont).text('', col2X + 95, textY); 

            // --- Footer ---
            const footerY = Math.max(doc.page.height - 150, currentY + 50); 
            doc.fillColor('#AAAAAA').fontSize(7);
            doc.font(boldFont).text('Sello Digital del CFDI:', 40, footerY);
            doc.font(normalFont).text('||1.1|UUID|FECHA|SELLO_DIGITAL_MUY_LARGO_DEL_SAT_QUE_VA_AQUI||', { width: 500 });
            doc.moveDown(0.5);
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