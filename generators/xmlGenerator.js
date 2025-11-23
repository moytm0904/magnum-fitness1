// generators/xmlGenerator.js

function generateXML(data) {
    // ==========================================================
    // === 1. RECIBIR DATOS DE MONEDA Y TIPO DE CAMBIO ===
    // ==========================================================
    // Estos datos ya vienen calculados correctamente desde server.js
    const currency = data.Moneda || 'MXN';
    
    // El SAT requiere que si es MXN, el TipoCambio se omita.
    // Si es otra moneda, se debe incluir el valor del día (ej. 18.5000).
    const exchangeRate = data.TipoCambio || '1';
    
    // Construir el atributo condicionalmente
    // Si es MXN no se pone, si es otra moneda se agrega TipoCambio="..."
    const tipoCambioAttr = currency !== 'MXN' ? ` TipoCambio="${exchangeRate}"` : '';

    // ==========================================================
    // === 2. CÁLCULOS DE IMPUESTOS ===
    // ==========================================================
    // IMPORTANTE: Estos montos son en la moneda de la factura (ej. 50.00 USD)
    // El XML se llena con los valores de la divisa extranjera, no la conversión a pesos.
    const totalConIva = parseFloat(data.totalCompra || data.total || 0);
    
    // Desglosar IVA (16%)
    const subtotal = (totalConIva / 1.16).toFixed(2);
    const iva = (totalConIva - parseFloat(subtotal)).toFixed(2);

    const description = data.productName || 'Producto o servicio según folio de compra';

    // ==========================================================
    // === 3. GENERACIÓN DEL XML ===
    // ==========================================================
    const xmlString = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"
    Version="4.0" Serie="MAG" Folio="001" Fecha="${new Date().toISOString()}"
    Sello="PLACEHOLDER_SELLO_GENERADO_POR_BACKEND"
    FormaPago="${data.formaPago}" NoCertificado="PLACEHOLDER_NUMERO_DE_CERTIFICADO_CSD" Certificado="PLACEHOLDER_CERTIFICADO_EN_BASE64"
    SubTotal="${subtotal}" Moneda="${currency}"${tipoCambioAttr} Total="${totalConIva.toFixed(2)}" TipoDeComprobante="I" Exportacion="01"
    MetodoPago="${data.metodoPago}" LugarExpedicion="62740">
  <cfdi:Emisor Rfc="MAGM250101M99" Nombre="Magnum Fitness S.A. de C.V." RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="${data.rfc}" Nombre="${data.razonSocial}" DomicilioFiscalReceptor="${data.domicilioFiscalReceptor}" RegimenFiscalReceptor="${data.regimenFiscal}" UsoCFDI="${data.usoCFDI}"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="E48" Descripcion="${description}" ValorUnitario="${subtotal}" Importe="${subtotal}" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="${subtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva}"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${iva}">
    <cfdi:Traslados>
      <cfdi:Traslado Base="${subtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva}"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
</cfdi:Comprobante>`;
    
    return xmlString;
}

module.exports = { generateXML };