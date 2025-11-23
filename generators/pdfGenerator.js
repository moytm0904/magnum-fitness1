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
                const leftColX = 45;
                const rightColX = 310; // Segunda columna alineada a la derecha del centro
                
                doc.font(normalFont).fontSize(8.5);

                // Renderizar datos izquierda
                let currentYLeft = startY;
                dataLeft.forEach(item => {
                    doc.text(`${item.label} ${item.value}`, leftColX, currentYLeft);
                    currentYLeft += 12;
                });

                // Renderizar datos derecha
                let currentYRight = startY;
                dataRight.forEach(item => {
                    doc.text(`${item.label} ${item.value}`, rightColX, currentYRight);
                    currentYRight += 12;
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
                    // En tu imagen "Empresariales" estaba en una segunda línea, aquí se ajustará solo
                    { label: 'Uso de CFDI:', value: data.usoCFDINombre || data.usoCFDI }
                ]
            );
            
            // Añadimos un pequeño espacio extra antes de conceptos
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
            // Columnas: Clave Prod, Cant, Unidad, Descripción, Valor Unit., IVA, Importe
            const headers = ['Clave Prod', 'Cant', 'Unidad', 'Descripción', 'Valor Unit.', 'IVA', 'Importe'];
            // Ajuste de anchos para coincidir mejor con la imagen
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
            const desc = (data.productName || 'Producto/Servicio').substring(0, 75); // Descripción un poco más larga permitida
            
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
            
            // Línea separadora de totales
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

            doc.y = finalY + 60; // Mover cursor debajo de los totales

            // ======================================================================
            // === SECCIÓN DE DATOS DE PAGO Y MONEDA (Reacomodada) ===
            // ======================================================================
            let currentY = doc.y;
            const importeConLetra = numeroALetras(totalCompra, currency);
            
            // Altura de la caja gris
            const boxHeight = currency !== 'MXN' ? 110 : 90; 

            // Fondo gris claro con borde suave
            doc.rect(40, currentY, doc.page.width - 80, boxHeight).fillAndStroke(sectionBgColor, sectionBorderColor);
            doc.fillColor(fontColor).fontSize(8.5);
            
            let textY = currentY + 10;
            let col1X = 50; 
            let col2X = 330; 

            // 2. Moneda y Tipo de Cambio
            doc.font(boldFont).text('Moneda:', col1X, textY);
            doc.font(normalFont).text(currency, col1X + 50, textY);

            if (currency !== 'MXN') {
                doc.font(boldFont).text('Tipo de Cambio:', col2X, textY);
                doc.font(normalFont).text(`1 ${currency} = $${exchangeRateText} MXN`, col2X + 90, textY);
            }
            
            textY += 15;

            // 3. Total Pagado y Equivalente (Solo si es moneda extranjera)
            if (currency !== 'MXN') {
                doc.font(boldFont).text('Total Pagado:', col1X, textY);
                doc.font(normalFont).text(`$${totalCompra.toFixed(2)} ${currency}`, col1X + 80, textY);

                doc.font(boldFont).text('Equivalente a pesos:', col2X, textY);
                doc.font(normalFont).text(`$${totalEnPesos} MXN`, col2X + 90, textY);
                textY += 15;
            }

            // 4. Método y Forma de Pago (En filas separadas para evitar superposición)
            // Fila: Método
            doc.font(boldFont).text('Método de Pago:', col1X, textY);
            const metodoPagoCompleto = `${data.metodoPago} - ${data.metodoPagoNombre || ''}`;
            doc.font(normalFont).text(metodoPagoCompleto, col1X + 90, textY);
            
            // Fila: Forma (Bajamos una línea si está muy apretado o la ponemos a la derecha si cabe)
            // Para asegurar que quede bien, en este diseño la pondremos a la derecha en la misma línea, 
            // pero con cuidado del espacio.
            doc.font(boldFont).text('Forma de Pago:', col2X, textY);
            const formaPagoCompleta = `${data.formaPago} - ${data.formaPagoNombre || ''}`;
            // Cortamos el texto si es demasiado largo para que no se encime
            doc.font(normalFont).text(formaPagoCompleta.substring(0, 35), col2X + 90, textY);


            // --- CFDI Relacionado ---
            currentY += boxHeight + 15;
            doc.rect(40, currentY, doc.page.width - 80, 40).fillAndStroke(sectionBgColor, sectionBorderColor);
            doc.fillColor(primaryColor).font(boldFont).fontSize(9).text('CFDI Relacionado', 50, currentY + 5);
            doc.fillColor(fontColor).fontSize(8.5);
            
            textY = currentY + 22;
            doc.font(boldFont).text('Tipo relación:', col1X, textY);
            doc.font(normalFont).text('N/A', col1X + 70, textY);
            doc.font(boldFont).text('UUID:', col2X, textY);
            doc.font(normalFont).text('N/A', col2X + 40, textY);

            // --- Footer ---
            const footerY = Math.max(doc.page.height - 120, currentY + 60); 
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