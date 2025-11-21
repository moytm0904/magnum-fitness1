// generators/xmlGenerator.js

function generateXML(data) {
    // ==========================================================
    // === DATOS DE MONEDA Y TIPO DE CAMBIO ===
    // ==========================================================
    // Leemos la moneda enviada desde el endpoint (o usamos MXN por defecto)
    const currency = data.Moneda || 'MXN';
    const exchangeRate = data.TipoCambio || '1';
    
    // Regla del SAT: Si la moneda no es MXN, se debe incluir el TipoCambio.
    // Construimos el atributo dinámicamente.
    const tipoCambioAttr = currency !== 'MXN' ? ` TipoCambio="${exchangeRate}"` : '';

    // ==========================================================
    // === CÁLCULOS DE IMPUESTOS ===
    // ==========================================================
    // Aseguramos que totalCompra sea un número (puede venir como string del frontend)
    const totalConIva = parseFloat(data.totalCompra || data.total || 0);
    
    // Cálculos básicos (asumiendo IVA 16% incluido)
    // Nota: Para producción real, estos cálculos deben ser muy precisos con decimales.
    const subtotal = (totalConIva / 1.16).toFixed(2);
    const iva = (totalConIva - parseFloat(subtotal)).toFixed(2);

    const description = data.productName || 'Producto o servicio según folio de compra';

    // ==========================================================
    // === GENERACIÓN DE LA CADENA XML ===
    // ==========================================================
    // Se inyecta ${tipoCambioAttr} dentro de la etiqueta <cfdi:Comprobante>
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