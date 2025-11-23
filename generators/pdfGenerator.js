const PDFDocument = require('pdfkit');

// ==========================================================
// === 1. FUNCIÓN INTERNA: NÚMERO A LETRAS ===
// ==========================================================
function numeroALetras(amount, currency) {
    const currencyMap = {
        'MXN': { singular: 'PESO MEXICANO', plural: 'PESOS MEXICANOS' },
        'USD': { singular: 'DOLAR AMERICANO', plural: 'DOLARES AMERICANOS' },
        'EUR': { singular: 'EURO', plural: 'EUROS' },
        'CAD': { singular: 'DOLAR CANADIENSE', plural: 'DOLARES CANADIENSES' },
        'GBP': { singular: 'LIBRA ESTERLINA', plural: 'LIBRAS ESTERLINAS' },
        'JPY': { singular: 'YEN JAPONES', plural: 'YENES JAPONESES' }
    };

    const currencyText = currencyMap[currency] || { singular: currency, plural: currency };
    
    const amountStr = parseFloat(amount).toFixed(2);
    const parts = amountStr.split('.');
    const integerPart = parseInt(parts[0]);
    const decimalPart = parts[1];

    if (integerPart === 0) return `CERO ${currencyText.plural} ${decimalPart}/100 M.N.`;

    function getGroup(n) {
        const units = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
        const teens = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
        const tens = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
        const hundreds = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
        let output = '';
        if (n === 100) return 'CIEN';
        if (n >= 100) { output += hundreds[Math.floor(n / 100)] + ' '; n %= 100; }
        if (n >= 20) { output += tens[Math.floor(n / 10)]; n %= 10; if (n > 0) output += ' Y '; } 
        else if (n >= 10) { output += teens[n - 10] + ' '; n = 0; }
        if (n > 0) { output += units[n] + ' '; }
        return output;
    }

    let text = '';
    let millions = Math.floor(integerPart / 1000000);
    let remainder = integerPart % 1000000;
    let thousands = Math.floor(remainder / 1000);
    let units = remainder % 1000;

    if (millions > 0) { text += (millions === 1 ? 'UN MILLON ' : getGroup(millions) + ' MILLONES '); }
    if (thousands > 0) { text += (thousands === 1 ? 'MIL ' : getGroup(thousands) + ' MIL '); }
    if (units > 0) { text += getGroup(units); }

    text = text.trim();
    const currencyLabel = integerPart === 1 ? currencyText.singular : currencyText.plural;
    const suffix = currency === 'MXN' ? 'M.N.' : '';
    
    return `SON: ${text} ${currencyLabel} ${decimalPart}/100 ${suffix}`.trim();
}

// ==========================================================
// === 2. GENERADOR DE PDF ===
// ==========================================================
function generateInvoicePdfBuffer(data) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'letter', margin: 40 });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));

            // --- Estilos ---
            const primaryColor = '#007BFF';
            const fontColor = '#333333';
            const boldFont = 'Helvetica-Bold';
            const normalFont = 'Helvetica';
            const sectionBgColor = '#f8f9fa'; 
            const sectionBorderColor = '#dee2e6'; 

            // --- Datos de Moneda ---
            const currency = data.Moneda || 'MXN';
            let exchangeRateVal = parseFloat(data.TipoCambio);
            if (isNaN(exchangeRateVal)) exchangeRateVal = 1;

            if ((currency === 'USD' || currency === 'EUR' || currency === 'GBP' || currency === 'CAD') && exchangeRateVal < 1) {
                exchangeRateVal = 1 / exchangeRateVal;
            }
            const exchangeRateText = exchangeRateVal.toFixed(4);

            // --- Encabezado ---
            doc.rect(0, 0, doc.page.width, 100).fill(primaryColor);
            doc.fillColor('#FFFFFF').font(boldFont).fontSize(22).text('FACTURA MAGNUM FITNESS', 0, 30, { align: 'right', width: doc.page.width - 40 });
            doc.font(normalFont).fontSize(9);
            doc.text('Serie: MAG-001', { align: 'right' });
            doc.text(`Folio Fiscal (UUID): ${Date.now()}-${Math.floor(Math.random() * 1000000)}`, { align: 'right' });
            doc.text(`Fecha: ${new Date().toISOString().split('T')[0]}`, { align: 'right' });
            
            try { /* doc.image('icono_1.png', 40, 5, { fit: [90, 90] }); */ } catch (e) {}

            doc.y = 120;

            // --- Función para dibujar secciones (Ajustada al estilo de tu imagen) ---
            function drawSectionWithColumns(title, dataLeft, dataRight) {
                // Título de la sección
                doc.fillColor(fontColor).font(boldFont).fontSize(10).text(title.toUpperCase(), 40);
                
                // Línea azul debajo del título
                doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke(primaryColor);
                doc.moveDown(0.5);
                
                const startY = doc.y;
                const leftColX = 40; // Alineado al margen
                const rightColX = 310; // Segunda columna
                
                doc.font(normalFont).fontSize(9);

                // Renderizar datos izquierda
                let currentYLeft = startY;
                dataLeft.forEach(item => {
                    // Concatenamos etiqueta y valor
                    const text = `${item.label} ${item.value}`;
                    doc.text(text, leftColX, currentYLeft, { width: 260 });
                    // Calculamos altura real por si el texto hace salto de línea
                    const height = doc.heightOfString(text, { width: 260 });
                    currentYLeft += height + 2; 
                });

                // Renderizar datos derecha
                let currentYRight = startY;
                dataRight.forEach(item => {
                    const text = `${item.label} ${item.value}`;
                    doc.text(text, rightColX, currentYRight, { width: 250 });
                    const height = doc.heightOfString(text, { width: 250 });
                    currentYRight += height + 2;
                });

                // Mover cursor al final de la sección más larga
                doc.y = Math.max(currentYLeft, currentYRight) + 15;
            }

            // --- DATOS DEL EMISOR ---
            drawSectionWithColumns(
                'DATOS DEL EMISOR',
                [
                    { label: 'Nombre:', value: 'Magnum Fitness S.A. de C.V.' },
                    { label: 'RFC:', value: 'MAGM250101M99' }
                ],
                [
                    { label: 'Régimen Fiscal:', value: '601 - General de Ley Personas Morales' },
                    { label: 'Lugar de Expedición:', value: '62740' }
                ]
            );

            // --- DATOS DEL RECEPTOR ---
            drawSectionWithColumns(
                'DATOS DEL RECEPTOR',
                [
                    { label: 'Nombre:', value: (data.razonSocial || 'SIN NOMBRE').toUpperCase() },
                    { label: 'RFC:', value: (data.rfc || 'XAXX010101000').toUpperCase() }
                ],
                [
                    { label: 'Régimen Fiscal:', value: data.regimenFiscalNombre || data.regimenFiscal },
                    { label: 'Uso de CFDI:', value: data.usoCFDINombre || data.usoCFDI }
                ]
            );
            
            // Espacio antes de conceptos
            doc.moveDown(0.5);
            doc.fillColor(fontColor).font(boldFont).fontSize(10).text('CONCEPTOS', 40);
            doc.moveDown(0.2);

            // --- CÁLCULOS ---
            const totalCompra = parseFloat(data.total || data.totalCompra || 0);
            const totalEnPesos = (totalCompra * exchangeRateVal).toFixed(2);
            const subtotal = totalCompra / 1.16;
            const iva = totalCompra - subtotal;

            // --- TABLA DE CONCEPTOS (Estilo Imagen) ---
            const tableTop = doc.y;
            // Columnas ajustadas a la imagen
            const headers = ['Clave Prod', 'Cant', 'Unidad', 'Descripción', 'Valor Unit.', 'IVA', 'Importe'];
            const colWidths = [60, 35, 45, 200, 70, 40, 70]; 
            let currentX = 40;
            
            // Fondo azul del encabezado
            doc.rect(currentX, tableTop, doc.page.width - 80, 18).fill(primaryColor);
            doc.fillColor('#FFFFFF').fontSize(8).font(boldFont);
            
            // Texto del encabezado
            headers.forEach((h, i) => { 
                doc.text(h, currentX + 5, tableTop + 5, { width: colWidths[i] - 10 }); 
                currentX += colWidths[i]; 
            });

            const rowY = tableTop + 22;
            currentX = 40;
            const desc = (data.productName || 'Producto/Servicio').substring(0, 75);
            
            // Datos de la fila
            const rowData = [
                '84111506', 
                '1', 
                'E48', 
                desc, 
                `$${subtotal.toFixed(2)}`, 
                '16%', 
                `$${subtotal.toFixed(2)}`
            ];
            
            doc.fillColor(fontColor).fontSize(8).font(normalFont);
            rowData.forEach((cell, i) => { 
                doc.text(cell, currentX + 5, rowY, { width: colWidths[i] - 10 }); 
                currentX += colWidths[i]; 
            });

            // --- TOTALES ---
            let finalY = rowY + 35;
            const totalsX = 380;
            
            // Línea separadora
            doc.moveTo(totalsX - 10, finalY).lineTo(doc.page.width - 40, finalY).stroke(primaryColor);
            doc.moveDown(0.5);
            
            // Subtotal e IVA
            doc.fillColor(fontColor).font(normalFont).fontSize(9);
            doc.text('Subtotal:', totalsX, finalY + 5);
            doc.text(`$${subtotal.toFixed(2)}`, totalsX, finalY + 5, { align: 'right' });
            
            doc.text('IVA (16%):', totalsX, finalY + 18);
            doc.text(`$${iva.toFixed(2)}`, totalsX, finalY + 18, { align: 'right' });
            
            // Total Final
            doc.fillColor(primaryColor).font(boldFont).fontSize(11);
            doc.text('TOTAL:', totalsX, finalY + 35);
            doc.text(`$${totalCompra.toFixed(2)} ${currency}`, totalsX, finalY + 35, { align: 'right' });

            doc.y = finalY + 60;

            // ======================================================================
            // === SECCIÓN DE DATOS DE PAGO Y MONEDA (Acomodada) ===
            // ======================================================================
            let currentY = doc.y;
            const importeConLetra = numeroALetras(totalCompra, currency);
            
            // Altura de la caja gris
            const boxHeight = currency !== 'MXN' ? 110 : 90; 

            // Fondo gris claro
            doc.rect(40, currentY, doc.page.width - 80, boxHeight).fillAndStroke(sectionBgColor, sectionBorderColor);
            doc.fillColor(fontColor).fontSize(8.5);
            
            let textY = currentY + 10;
            let col1X = 50; 
            let col2X = 330; 

            // 1. Importe con letra
            doc.font(boldFont).text('Importe con letra:', col1X, textY);
            doc.font(normalFont).text(importeConLetra, col1X + 100, textY, { width: 380 });
            textY += 25;

            // 2. Moneda y Tipo de Cambio
            doc.font(boldFont).text('Moneda:', col1X, textY);
            doc.font(normalFont).text(currency, col1X + 50, textY);

            if (currency !== 'MXN') {
                doc.font(boldFont).text('Tipo de Cambio:', col2X, textY);
                doc.font(normalFont).text(`1 ${currency} = $${exchangeRateText} MXN`, col2X + 90, textY);
            }
            textY += 18;

            // 3. Total Pagado y Equivalente
            if (currency !== 'MXN') {
                doc.font(boldFont).text('Total Pagado:', col1X, textY);
                doc.font(normalFont).text(`$${totalCompra.toFixed(2)} ${currency}`, col1X + 80, textY);

                doc.font(boldFont).text('Equivalente:', col2X, textY);
                doc.font(normalFont).text(`$${totalEnPesos} MXN`, col2X + 90, textY);
                textY += 18;
            }

            // 4. Método y Forma de Pago
            doc.font(boldFont).text('Método de Pago:', col1X, textY);
            const metodoPagoCompleto = `${data.metodoPago} - ${data.metodoPagoNombre || ''}`;
            doc.font(normalFont).text(metodoPagoCompleto, col1X + 90, textY, { width: 190, ellipsis: true });

            doc.font(boldFont).text('Forma de Pago:', col2X, textY);
            const formaPagoCompleta = `${data.formaPago} - ${data.formaPagoNombre || ''}`;
            doc.font(normalFont).text(formaPagoCompleta, col2X + 90, textY, { width: 150, ellipsis: true });


            // ======================================================================
            // === SECCIÓN DE SELLOS DIGITALES Y QR (DISEÑO REAL) ===
            // ======================================================================
            // Calculamos la posición del footer para asegurar que quepa todo
            
            // Espacio para el QR y los sellos
            currentY += boxHeight + 20;
            
            // Si no cabe en la página actual, agregamos nueva
            if (currentY + 150 > doc.page.height - 50) {
                doc.addPage();
                currentY = 50;
            }

            // --- Código QR (Simulado) ---
            const qrSize = 100;
            const qrX = 40;
            
            // Dibujamos un cuadro placeholder para el QR
            // Si tienes un generador de QR real, aquí pondrías doc.image(qrBuffer, qrX, currentY, ...)
            doc.rect(qrX, currentY, qrSize, qrSize).stroke('#CCCCCC');
            doc.fillColor('#999999').fontSize(8)
               .text('Código QR', qrX, currentY + 45, { width: qrSize, align: 'center' });
            
            // --- Sellos Digitales (A la derecha del QR) ---
            const sellosX = qrX + qrSize + 15; // 15px de margen a la derecha del QR
            const sellosWidth = doc.page.width - sellosX - 40; // Ancho restante
            let sellosY = currentY;

            doc.fillColor(fontColor).fontSize(7); // Letra pequeña para sellos

            // 1. Cadena Original (Simulada)
            doc.font(boldFont).text('Cadena Original del complemento de certificación digital del SAT:', sellosX, sellosY);
            sellosY += 10;
            const cadenaOriginal = `||1.1|${Date.now()}|${new Date().toISOString()}|PPD101129EA3|EsteEsUnSelloDigitalDePruebaMuyLargoParaSimularUnaFacturaRealQueOcupaVariasLineasDeTextoYSeVeProfesional||`;
            doc.font(normalFont).text(cadenaOriginal, sellosX, sellosY, { width: sellosWidth, align: 'justify' });
            sellosY = doc.y + 5;

            // 2. Sello Digital del Emisor (Simulado)
            doc.font(boldFont).text('Sello Digital del Emisor:', sellosX, sellosY);
            sellosY += 10;
            const selloEmisor = 'AbCdEfGhIjKlMnOpQrStUvWxYz1234567890AbCdEfGhIjKlMnOpQrStUvWxYz1234567890AbCdEfGhIjKlMnOpQrStUvWxYz1234567890==';
            doc.font(normalFont).text(selloEmisor, sellosX, sellosY, { width: sellosWidth, align: 'justify', break: true });
            sellosY = doc.y + 5;

            // 3. Sello Digital del SAT (Simulado)
            doc.font(boldFont).text('Sello Digital del SAT:', sellosX, sellosY);
            sellosY += 10;
            const selloSAT = 'ZaYxWvUtSrQpOnMlKjIhGfEdCbA0987654321ZaYxWvUtSrQpOnMlKjIhGfEdCbA0987654321ZaYxWvUtSrQpOnMlKjIhGfEdCbA0987654321==';
            doc.font(normalFont).text(selloSAT, sellosX, sellosY, { width: sellosWidth, align: 'justify', break: true });

            // --- Leyenda Final ---
            const finalYPos = Math.max(doc.y, currentY + qrSize) + 15;
            doc.fontSize(8).fillColor(fontColor)
               .text('Este documento es una representación impresa de un CFDI.', 40, finalYPos, { align: 'center', width: doc.page.width - 80 });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { generateInvoicePdfBuffer };