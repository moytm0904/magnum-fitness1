// server.js
require('dotenv').config(); // <-- LEER ARCHIVO .env
const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cloudinary = require('cloudinary').v2; // <-- AÑADIDO
const { generateInvoicePdfBuffer } = require('./generators/pdfGenerator');



// En la parte superior de server.js, junto a los otros 'require'

const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const { Chart } = require('chart.js');
// Chart.js 3+ requiere que registremos los componentes que vamos a usar
const { ArcElement, DoughnutController, Legend } = require('chart.js');
Chart.register(ArcElement, DoughnutController, Legend);


// --- SDK DE PAYPAL ---
const paypal = require('@paypal/checkout-server-sdk');
const multer = require('multer'); // <--- 1. IMPORTAR MULTER
const geoip = require('geoip-lite'); // <-- AÑADIDO
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args)); // <-- AÑADIDO

// --- Importar los módulos ---
const db = require('./database'); // <-- MODIFICADO
const { generateInvoicePdf } = require('./generators/pdfGenerator');
const { generateXML } = require('./generators/xmlGenerator');


const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use(cookieParser());
// Confianza en el proxy (necesario si estás en Render/Heroku para obtener la IP real)
app.set('trust proxy', true);


// ==========================================================
// === CONFIGURACIÓN DE SESIONES CON PostgreSQL ===
// ==========================================================
const pg = require('pg');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple')(session);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(session({
  store: new connectPgSimple({
    pool: pool,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET || 'un_secreto_muy_largo_y_dificil_de_adivinar',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 1 día
    secure: false, // poner true si usas HTTPS
    sameSite: 'lax'
  }
}));



// --- CONFIGURACIÓN DE PAYPAL ---
// CAMBIA ESTO por tus credenciales LIVE (Producción)
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const environment = new paypal.core.LiveEnvironment(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET);
const client = new paypal.core.PayPalHttpClient(environment);

// --- CONFIGURACIÓN DEL CORREO (TRANSPORTER) ---
const nodemailer = require('nodemailer');

// 🔹 Crear el transporter con Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'digitalbiblioteca48@gmail.com', // tu correo
    pass: process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS   // clave de app (no contraseña normal)
  }
});

// 🔹 Verificar la conexión con Gmail al iniciar el servidor
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Error al conectar con Gmail:', error);
  } else {
    console.log('✅ Conexión con Gmail establecida correctamente');
  }
});


// ==========================================================
// === FUNCIÓN PARA CREAR PLANTILLAS DE CORREO HTML ===
// ==========================================================
function createStyledEmail(title, content) {
    return `
        <body style="margin: 0; background-color: #1e1e1e; font-family: Arial, sans-serif; color: #f0f0f0;">
            <div style="width: 100%; max-width: 600px; margin: 20px auto; background-color: #2d2d30; border-radius: 8px; overflow: hidden; border: 1px solid #444444;">
                <div style="background-color: #f7a610; padding: 20px; text-align: center;">
                    <h1 style="color: #1e1e1e; margin: 0; font-size: 24px;">${title}</h1>
                </div>
                <div style="padding: 30px 20px; color: #aaaaaa; font-size: 16px; line-height: 1.6;">
                    ${content}
                </div>
                <div style="background-color: #1a1a1a; padding: 15px; text-align: center; font-size: 12px; color: #888888;">
                    <p style="margin: 0;">&copy; ${new Date().getFullYear()} Mi Portal. Todos los derechos reservados.</p>
                </div>
            </div>
        </body>
    `;
}

// ==========================================================
// === NUEVO: CONFIGURACIÓN DE CLOUDINARY ===
// ==========================================================
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, // <-- DESDE .env
  api_key: process.env.CLOUDINARY_API_KEY,       // <-- DESDE .env
  api_secret: process.env.CLOUDINARY_API_SECRET,  // <-- DESDE .env
  secure: true
});

// ==========================================================
// === CONFIGURACIÓN DE MULTER (PARA CLOUDINARY) ===
// ==========================================================
// Usar memoria temporal en lugar de disco
const storage = multer.memoryStorage(); 
const upload = multer({ storage: storage });
const uploadReviews = multer({ storage: storage }); // Usar la misma config para reseñas

// --- Función Auxiliar para subir a Cloudinary ---
const uploadToCloudinary = (fileBuffer, options) => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) return reject(error);
            resolve(result);
        }).end(fileBuffer);
    });
};


// ==========================================================
// === NUEVO: LÓGICA DE MONEDA Y GEOLOCALIZACIÓN ===
// ==========================================================
const EXCHANGE_RATE_API_KEY = '259dea087c98ba3bc01fe430';
let exchangeRates = {}; // Caché para guardar las tasas de cambio

// Mapeo simple de país a moneda
const countryToCurrency = {
    'MX': 'MXN', // México
    'US': 'USD', // Estados Unidos
    'CA': 'CAD', // Canadá
    'ES': 'EUR', // España
    'FR': 'EUR', // Francia
    'DE': 'EUR', // Alemania
    'GB': 'GBP', // Reino Unido
    // ... puedes añadir más países
};

// Función para cargar las tasas de cambio (se llama al iniciar el server)
async function updateExchangeRates() {
    try {
        const response = await fetch(`https://v6.exchangerate-api.com/v6/${EXCHANGE_RATE_API_KEY}/latest/MXN`);
        const data = await response.json();
        if (data.result === 'success') {
            exchangeRates = data.conversion_rates;
            console.log('Tasas de cambio actualizadas.');
        }
    } catch (error) {
        console.error('Error al actualizar tasas de cambio:', error);
    }
}

// Endpoint para que el frontend obtenga la moneda y la tasa
app.get('/api/location-currency', (req, res) => {
    let userCurrency = 'MXN'; // Moneda por defecto
    let conversionRate = 1;
    
    const userIp = req.ip; // Obtener la IP del visitante
    const geo = geoip.lookup(userIp);
    
    if (geo && countryToCurrency[geo.country]) {
        const currency = countryToCurrency[geo.country];
        if (exchangeRates[currency]) {
            userCurrency = currency;
            conversionRate = exchangeRates[currency];
        }
    }
    
    res.json({
        currencyCode: userCurrency,
        conversionRate: conversionRate
    });
});

// ==========================================================
// === ENDPOINTS DE AUTENTICACIÓN (POSTGRES) ===
// ==========================================================
const crypto = require('crypto');

// --- 1. REGISTRO ---
app.post('/register', async (req, res) => {
  const { email, name, password } = req.body;
  const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

  try {
    const existing = await db.get('SELECT * FROM users WHERE email = $1', [email]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'El correo ya está registrado.' });
    }

    const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();

    await db.run(
      'INSERT INTO users (email, name, password, verificationtoken, isverified) VALUES ($1, $2, $3, $4, FALSE)',
      [email, name, hashedPassword, verificationToken]
    );

    const emailContent = `
      <p>Hola ${name},</p>
      <p>Tu código para activar tu cuenta es:</p>
      <div style="font-size: 36px; letter-spacing: 10px; margin: 20px 0; padding: 15px; background-color: #1e1e1e; border-radius: 5px; text-align: center; color: #f7a610;">
        <b>${verificationToken}</b>
      </div>
      <p>Ingrésalo en la página para completar tu registro.</p>
    `;

    await transporter.sendMail({
      from: '"Magnum Fitness" <digitalbiblioteca48@gmail.com>',
      to: email,
      subject: 'Código para Activar tu Cuenta',
      html: createStyledEmail('Activa tu Cuenta', emailContent)
    });

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error en /register:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor.' });
  }
});

// --- 2. VERIFICACIÓN DE CORREO ---
app.post('/verify-email', async (req, res) => {
  const { email, token } = req.body;
  try {
    const user = await db.get('SELECT verificationtoken FROM users WHERE email = $1', [email]);
    if (user && user.verificationtoken && user.verificationtoken.trim() === token.trim()) {
      await db.run('UPDATE users SET isverified = TRUE, verificationtoken = NULL WHERE email = $1', [email]);
      return res.json({ success: true });
    }
    res.status(400).json({ success: false, message: 'El código no es válido o ha expirado.' });
  } catch (error) {
    console.error('❌ Error en /verify-email:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// --- 3. INICIO DE SESIÓN ---
// --- 3. INICIO DE SESIÓN ---
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('🟦 /login recibido:', email); // log para depurar

  try {
    const user = await db.get('SELECT * FROM users WHERE email = $1', [email]);
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

    if (!user) {
      console.log('❌ Usuario no encontrado');
      return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
    }

    if (user.password !== hashedPassword) {
      console.log('❌ Contraseña incorrecta');
      return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
    }

    if (!user.isverified) {
      console.log('⚠️ Usuario no verificado');
      return res.status(401).json({ success: false, message: 'Tu cuenta no ha sido verificada.' });
    }

    const loginToken = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('🔢 Token generado:', loginToken);

    await db.run('UPDATE users SET verificationtoken = $1 WHERE email = $2', [loginToken, email]);
    console.log('📦 Token guardado en BD');

    const emailContent = `
      <p>Hola ${user.name},</p>
      <p>Tu código para completar el inicio de sesión es:</p>
      <div style="font-size: 36px; letter-spacing: 10px; margin: 20px 0; padding: 15px; background-color: #1e1e1e; border-radius: 5px; text-align: center; color: #f7a610;">
        <b>${loginToken}</b>
      </div>
    `;

    const mailOptions = {
      from: '"Magnum Fitness" <digitalbiblioteca48@gmail.com>',
      to: email,
      subject: 'Código para Iniciar Sesión',
      html: createStyledEmail('Verifica tu Inicio de Sesión', emailContent)
    };

    console.log('📨 Intentando enviar correo...');
    await transporter.sendMail(mailOptions);
    console.log('✅ Correo enviado correctamente');

    res.json({ success: true });

  } catch (error) {
    console.error('❌ Error en /login:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor.' });
  }
});


// --- 4. VERIFICACIÓN DE CÓDIGO LOGIN (2FA) ---
app.post('/verify-login-code', async (req, res) => {
  const { email, token } = req.body;
  try {
    const user = await db.get('SELECT * FROM users WHERE email = $1', [email]);
    if (user && user.verificationtoken && user.verificationtoken.trim() === token.trim()) {
      await db.run('UPDATE users SET verificationtoken = NULL WHERE email = $1', [email]);
      req.session.user = { email: user.email, name: user.name };

      await transporter.sendMail({
        from: '"Magnum Fitness" <digitalbiblioteca48@gmail.com>',
        to: email,
        subject: 'Alerta de Seguridad: Nuevo Inicio de Sesión',
        html: createStyledEmail('Alerta de Seguridad', `<p>Hola ${user.name}, se detectó un nuevo inicio de sesión.</p>`)
      });

      return res.json({ success: true });
    }
    res.status(400).json({ success: false, message: 'Código incorrecto o expirado.' });
  } catch (error) {
    console.error('❌ Error en /verify-login-code:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// --- 5. SOLICITAR CAMBIO DE CONTRASEÑA ---
app.post('/request-password-reset', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await db.get('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) return res.status(404).json({ success: false, message: 'No se encontró un usuario con ese correo.' });

    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
    await db.run('UPDATE users SET verificationtoken = $1 WHERE email = $2', [resetToken, email]);

    const emailContent = `
      <p>Hola ${user.name},</p>
      <p>Tu código para restablecer la contraseña es:</p>
      <div style="font-size: 36px; letter-spacing: 10px; margin: 20px 0; padding: 15px; background-color: #1e1e1e; border-radius: 5px; text-align: center; color: #f7a610;">
        <b>${resetToken}</b>
      </div>
    `;

    await transporter.sendMail({
      from: '"Magnum Fitness" <digitalbiblioteca48@gmail.com>',
      to: email,
      subject: 'Código para Restablecer Contraseña',
      html: createStyledEmail('Restablecer Contraseña', emailContent)
    });

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error en /request-password-reset:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// --- 6. CAMBIAR CONTRASEÑA ---
app.post('/reset-password-with-code', async (req, res) => {
  const { email, code, newPassword } = req.body;
  try {
    const user = await db.get('SELECT * FROM users WHERE email = $1', [email]);
    if (user && user.verificationtoken && user.verificationtoken.trim() === code.trim()) {
      const newHashedPassword = crypto.createHash('sha256').update(newPassword).digest('hex');
      await db.run('UPDATE users SET password = $1, verificationtoken = NULL WHERE email = $2', [newHashedPassword, email]);
      return res.json({ success: true });
    }
    res.status(400).json({ success: false, message: 'El código es incorrecto o ha expirado.' });
  } catch (error) {
    console.error('❌ Error en /reset-password-with-code:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// --- 5. CERRAR SESIÓN ---
app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) { return res.status(500).json({ success: false, message: 'No se pudo cerrar la sesión.' }); }
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// --- 6. VERIFICAR SI HAY UNA SESIÓN ACTIVA ---
app.get('/check-session', (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

// ==========================================================
// === ENDPOINTS DE PAGO CON PAYPAL (MODIFICADO) ===
// ==========================================================
app.post('/api/orders', async (req, res) => {
    // AHORA RECIBE LA MONEDA DESDE EL FRONTEND
    const { totalAmount, currencyCode } = req.body; 
    
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
            amount: {
                currency_code: currencyCode || 'MXN', // Usa la moneda del usuario
                value: totalAmount // Usa el total ya convertido
            }
        }]
    });

    try {
        const order = await client.execute(request);
        res.status(200).json({ id: order.result.id });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/api/orders/:orderID/capture', async (req, res) => {
    const { orderID } = req.params;
    const request = new paypal.orders.OrdersCaptureRequest(orderID);
    request.requestBody({});

    try {
        const capture = await client.execute(request);
        // Aquí es donde obtienes la respuesta exitosa de PayPal
        res.status(200).json(capture.result);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});



// ==========================================================
// === MIDDLEWARE DE SEGURIDAD PARA ADMIN ===
// ==========================================================
const ADMIN_EMAIL = 'digitalbiblioteca48@gmail.com';

function isAdmin(req, res, next) {
    if (!req.session.user) {
        console.log('⚠️ Intento de acceso sin sesión');
        return res.status(401).json({ message: 'No autorizado: Debes iniciar sesión.' });
    }
    if (req.session.user.email !== ADMIN_EMAIL) {
        console.log('⚠️ Usuario no autorizado:', req.session.user.email);
        return res.status(403).json({ message: 'Prohibido: No tienes permisos de administrador.' });
    }
    next();
}
app.get('/admin/test-products', async (req, res) => {
  try {
    const products = await db.all('SELECT * FROM products');
    console.log('🟢 Productos encontrados:', products.length);
    res.json(products);
  } catch (error) {
    console.error('❌ Error al obtener productos:', error);
    res.status(500).json({ message: 'Error al obtener productos.' });
  }
});
app.get('/admin/data', async (req, res) => {
  try {
    const users = await db.all('SELECT name, email FROM users');
    const productsRaw = await db.all('SELECT * FROM products');
    const purchases = await db.all(`
      SELECT p.*, u.name AS username 
      FROM purchases p 
      LEFT JOIN users u ON p.useremail = u.email
    `);

    // Convertir precios a número
    const products = productsRaw.map(p => ({
      ...p,
      price: parseFloat(p.price)
    }));

    res.json({ users, products, purchases });
  } catch (error) {
    console.error('❌ Error en /admin/data:', error);
    res.status(500).json({ message: 'Error al cargar datos del panel.' });
  }
});


app.post('/admin/update-password', isAdmin, async (req, res) => {
    const { email, newPassword } = req.body;
    const newHashedPassword = crypto.createHash('sha256').update(newPassword).digest('hex');
    try {
        await db.run('UPDATE users SET password = $1 WHERE email = $2', [newHashedPassword, email]);
        res.json({ success: true, message: 'Contraseña actualizada.' });
    } catch (error) { 
        console.error('❌ Error al actualizar contraseña:', error);
        res.status(500).json({ success: false, message: 'Error al actualizar contraseña.' }); 
    }
});

// ✅ Corrección aplicada en todos los JOINs (LEFT JOIN)
app.get('/admin/sales-report', isAdmin, async (req, res) => {
    const { date } = req.query;
    if (!date) { return res.status(400).json({ message: 'Se requiere una fecha.' }); }
    try {
        const sales = await db.all(
            "SELECT productName, total FROM purchases WHERE purchaseDate::TEXT LIKE $1 AND status = 'COMPLETADO'",
            [`${date}%`]
        );

        let totalRevenue = 0;
        let totalProductsSold = 0;
        const productSummary = {};

        sales.forEach(sale => {
            totalRevenue += Number(sale.total);
            const products = sale.productname ? sale.productname.split(', ') : [];
            products.forEach(name => {
                if (name) {
                    totalProductsSold++;
                    productSummary[name] = (productSummary[name] || 0) + 1;
                }
            });
        });

        res.json({ date, totalRevenue, totalProductsSold, productSummary });
    } catch (error) { 
        console.error('❌ Error en /admin/sales-report:', error);
        res.status(500).json({ message: 'Error al generar el reporte.' }); 
    }
});


// --- PROCESAR REEMBOLSO ---
app.post('/admin/process-refund', async (req, res) => {
  try {
    // ✅ Convertir siempre a número y validar
    const purchaseId = parseInt(req.body.purchaseId, 10);

    if (isNaN(purchaseId)) {
      return res.status(400).json({ success: false, message: 'ID de compra inválido.' });
    }

    // ✅ Buscar la compra por ID
    const purchase = await db.get('SELECT * FROM purchases WHERE id = $1', [purchaseId]);
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Compra no encontrada.' });
    }

    // ✅ Comprobar si ya fue devuelta
    if (purchase.status === 'DEVUELTO') {
      return res.json({ success: false, message: 'La compra ya fue reembolsada.' });
    }

    // --- Aquí podrías agregar integración con PayPal API si corresponde ---
    // await paypal.refundPayment(purchase.invoiceId);

    // ✅ Actualizar el estado en la base de datos
    await db.run('UPDATE purchases SET status = $1 WHERE id = $2', ['DEVUELTO', purchaseId]);

    res.json({ success: true, message: `Reembolso procesado correctamente (ID: ${purchaseId}).` });
  } catch (error) {
    console.error('Error al procesar reembolso:', error);
    res.status(500).json({ success: false, message: 'Error interno al procesar el reembolso.' });
  }
});


// --- Endpoint para agregar producto (MODIFICADO para Cloudinary) ---
app.post('/admin/add-product', isAdmin, upload.fields([
    { name: 'prod-image-file', maxCount: 1 },
    { name: 'prod-pdf-file', maxCount: 1 }
]), async (req, res) => {
    const { name, description, price, category, preview_pages } = req.body;
    let imageUrl = null, imagePublicId = null, pdfUrl = null, pdfPublicId = null;
    try {
        if (req.files['prod-image-file']) {
            const imgFile = req.files['prod-image-file'][0];
            const imgResult = await uploadToCloudinary(imgFile.buffer, { folder: "magfit_products" });
            imageUrl = imgResult.secure_url;
            imagePublicId = imgResult.public_id;
        }
        if (req.files['prod-pdf-file']) {
            const pdfFile = req.files['prod-pdf-file'][0];
            const pdfResult = await uploadToCloudinary(pdfFile.buffer, { resource_type: "raw", folder: "magfit_pdfs" });
            pdfUrl = pdfResult.secure_url;
            pdfPublicId = pdfResult.public_id;
        }
        await db.run(
            `INSERT INTO products (name, description, price, image_url, image_public_id, category, pdf_url, pdf_public_id, preview_pages) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [name, description, parseFloat(price), imageUrl, imagePublicId, category, pdfUrl, pdfPublicId, parseInt(preview_pages)]
        );
        res.json({ success: true, message: 'Producto agregado con éxito.' });
    } catch (error) { res.status(500).json({ success: false, message: 'Error al agregar el producto.' }); }
});

// ==========================================================
// === ENDPOINT PARA DESCARGAR INFORME EN PDF (CON GRÁFICA) ===
// ==========================================================
app.get('/admin/download-report', isAdmin, async (req, res) => {
    const { date } = req.query;
    if (!date) {
        return res.status(400).json({ message: 'Se requiere una fecha.' });
    }

    try {
        // ✅ Filtro por fecha local (México)
        const sales = await db.all(
            `
            SELECT productname, total
            FROM purchases
            WHERE DATE(purchasedate AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City') = $1
              AND status = 'COMPLETADO'
            `,
            [date]
        );

        let totalRevenue = 0;
        let totalProductsSold = 0;
        const productSummary = {};

        sales.forEach(sale => {
            totalRevenue += Number(sale.total);
            const products = sale.productname.split(', ');
            products.forEach(name => {
                if (name.trim()) {
                    totalProductsSold += 1;
                    productSummary[name] = (productSummary[name] || 0) + 1;
                }
            });
        });

        // --- Generar gráfica ---
        const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
        const width = 600;
        const height = 300;
        const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: '#ffffff' });

        const configuration = {
            type: 'doughnut',
            data: {
                labels: Object.keys(productSummary),
                datasets: [
                    {
                        data: Object.values(productSummary),
                        backgroundColor: ['#ff8800', '#ff5500', '#28a745', '#dc3545', '#0dcaf0', '#adb5bd'],
                        borderColor: '#ffffff'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: { color: '#000' },
                        position: 'bottom'
                    }
                }
            }
        };

        const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);

        // --- Generar PDF ---
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ size: 'letter', margin: 40 });
        const filename = `Reporte-Ventas-${date}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        doc.pipe(res);

        // --- Estilos ---
        const primaryColor = '#ff8800';
        const textColor = '#333333';
        const bold = 'Helvetica-Bold';
        const regular = 'Helvetica';

        // --- Encabezado ---
        doc.font(bold).fontSize(20).fillColor(primaryColor).text(`Corte de Caja - ${date}`, { align: 'center' });
        doc.moveDown(2);

        doc.font(bold).fontSize(14).fillColor(textColor).text('Resumen del Día');
        doc.moveDown(0.5);
        doc.font(regular).fontSize(12)
            .text(`Ingresos Totales: $${totalRevenue.toFixed(2)} MXN`)
            .text(`Total Productos Vendidos: ${totalProductsSold}`);
        doc.moveDown(2);

        // --- Gráfica ---
        if (sales.length > 0) {
            doc.font(bold).fontSize(14).fillColor(textColor).text('Ventas por Producto (Gráfica)');
            doc.image(imageBuffer, {
                fit: [500, 250],
                align: 'center'
            });
            doc.moveDown(2);
        }

        // --- Tabla de productos ---
        doc.font(bold).fontSize(14).fillColor(textColor).text('Desglose de Productos (Tabla)');

        const tableTop = doc.y + 15;
        doc.font(bold).fontSize(10);
        doc.text('Producto', 50, tableTop);
        doc.text('Cantidad Vendida', 400, tableTop, { width: 150, align: 'right' });
        doc.moveTo(40, doc.y + 5).lineTo(doc.page.width - 40, doc.y + 5).stroke(primaryColor);
        doc.y += 15;

        doc.font(regular).fontSize(10);
        if (Object.keys(productSummary).length === 0) {
            doc.text('No se registraron ventas en esta fecha.', 50, doc.y);
        } else {
            for (const [name, qty] of Object.entries(productSummary)) {
                const y = doc.y;
                doc.text(name, 50, y, { width: 350 });
                doc.text(qty.toString(), 400, y, { width: 150, align: 'right' });
                doc.y += 20;
            }
        }

        doc.end();

    } catch (error) {
        console.error('❌ Error al generar PDF:', error);
        res.status(500).send('Error al generar el PDF.');
    }
});


// ===================== 🧹 FUNCIÓN PARA ELIMINAR ARCHIVOS DE CLOUDINARY =====================
async function deleteFromCloudinary(publicId, resourceType = "image") {
  if (!publicId) return; // Si no hay ID, no intenta borrar nada
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    console.log(`✅ Eliminado de Cloudinary: ${publicId} (${resourceType})`);
  } catch (err) {
    console.warn(`⚠️ No se pudo eliminar ${publicId} de Cloudinary:`, err.message);
  }
}

// ===================== 🗑️ ENDPOINT PARA ELIMINAR PRODUCTOS =====================
// --- Endpoint para eliminar un producto (versión corregida PostgreSQL + Cloudinary) ---
app.delete('/admin/delete-product/:id', isAdmin, async (req, res) => {
  const { id } = req.params;

  console.log("🗑️ Intentando eliminar producto ID:", id);

  try {
    // Validar que el id sea numérico
    const productId = parseInt(id);
    if (isNaN(productId)) {
      return res.status(400).json({ success: false, message: "ID de producto inválido." });
    }

    // Buscar producto en la base de datos
    const product = await db.get(
      "SELECT image_public_id, pdf_public_id FROM products WHERE id = $1",
      [productId]
    );

    if (!product) {
      console.log("⚠️ Producto no encontrado en la base de datos.");
      return res.status(404).json({ success: false, message: "Producto no encontrado." });
    }

    console.log("🧾 Producto encontrado:", product);

    // Eliminar archivos de Cloudinary si existen
    try {
      if (product.image_public_id) {
        await deleteFromCloudinary(product.image_public_id, "image");
      }
      if (product.pdf_public_id) {
        await deleteFromCloudinary(product.pdf_public_id, "raw");
      }
    } catch (cloudErr) {
      console.error("⚠️ Error al eliminar de Cloudinary:", cloudErr);
    }

    // Eliminar de la base de datos
    await db.run("DELETE FROM products WHERE id = $1", [productId]);

    console.log("✅ Producto eliminado correctamente:", productId);
    res.json({ success: true, message: "Producto eliminado correctamente." });

  } catch (error) {
    console.error("❌ Error al eliminar producto:", error);
    res.status(500).json({ success: false, message: "Error interno al eliminar el producto." });
  }
});


// --- Endpoint para ACTUALIZAR un producto (MODIFICADO para Cloudinary) ---
app.post('/admin/update-product/:id', isAdmin, upload.fields([
    { name: 'edit-prod-image-file', maxCount: 1 },
    { name: 'edit-prod-pdf-file', maxCount: 1 }
]), async (req, res) => {
    const { id } = req.params;
    const { name, description, price, category, preview_pages, existing_image_url, existing_pdf_url } = req.body;
    const oldProduct = await db.get('SELECT image_public_id, pdf_public_id FROM products WHERE id = $1', [id]);
    let imageUrl = existing_image_url, imagePublicId = oldProduct.image_public_id;
    let pdfUrl = existing_pdf_url, pdfPublicId = oldProduct.pdf_public_id;
    try {
        if (req.files['edit-prod-image-file']) {
            const imgFile = req.files['edit-prod-image-file'][0];
            const imgResult = await uploadToCloudinary(imgFile.buffer, { folder: "magfit_products" });
            imageUrl = imgResult.secure_url;
            imagePublicId = imgResult.public_id;
            await deleteFromCloudinary(oldProduct.image_public_id, "image");
        }
        if (req.files['edit-prod-pdf-file']) {
            const pdfFile = req.files['edit-prod-pdf-file'][0];
            const pdfResult = await uploadToCloudinary(pdfFile.buffer, { resource_type: "raw", folder: "magfit_pdfs" });
            pdfUrl = pdfResult.secure_url;
            pdfPublicId = pdfResult.public_id;
            await deleteFromCloudinary(oldProduct.pdf_public_id, "raw");
        }
        await db.run(
            `UPDATE products SET name = $1, description = $2, price = $3, image_url = $4, image_public_id = $5, category = $6, pdf_url = $7, pdf_public_id = $8, preview_pages = $9 WHERE id = $10`,
            [name, description, parseFloat(price), imageUrl, imagePublicId, category, pdfUrl, pdfPublicId, parseInt(preview_pages), id]
        );
        res.json({ success: true, message: 'Producto actualizado con éxito.' });
    } catch (error) { res.status(500).json({ success: false, message: 'Error al actualizar el producto.' }); }
});

// ==========================================================
// === API PÚBLICA PARA PRODUCTOS (NUEVO) ===
// ==========================================================

app.get('/api/products', async (req, res) => {
    try {
        const products = await db.all(`
            SELECT p.*, AVG(r.rating) as avg_rating, COUNT(r.id) as review_count
            FROM products p
            LEFT JOIN reviews r ON p.id = r.product_id
            GROUP BY p.id
        `);
        res.json(products);
    } catch (error) { res.status(500).json({ message: 'Error al cargar productos.' }); }
});

// --- Endpoint para OBTENER las reseñas de UN producto ---
app.get('/api/products/:id/reviews', async (req, res) => {
    const { id } = req.params;
    try {
        const reviews = await db.all("SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC", [id]);
        res.json(reviews);
    } catch (error) { res.status(500).json({ message: 'Error al cargar reseñas.' }); }
});

app.post('/api/products/:id/reviews', uploadReviews.fields([
    { name: 'review-image', maxCount: 1 },
    { name: 'review-video', maxCount: 1 }
]), async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Debes iniciar sesión.' });
    }

    const { id: product_id } = req.params;
    const { name: user_name, email: user_email } = req.session.user;
    const { rating, comment } = req.body;

    console.log("🟡 Publicando reseña:", { product_id, user_name, user_email, rating, comment });

    try {
        // Verificar si el producto existe
        const productInfo = await db.get('SELECT name FROM products WHERE id = $1', [product_id]);
        if (!productInfo) {
            return res.status(404).json({ success: false, message: 'El producto no existe.' });
        }

        const cleanProductName = productInfo.name;

        // Comprobar si el usuario ha comprado el producto
        const purchases = await db.all(
            'SELECT productName FROM purchases WHERE userEmail = $1 AND status = $2',
            [user_email, 'COMPLETADO']
        );
        const hasPurchased = purchases.some(p => p.productname.includes(cleanProductName));

        if (!hasPurchased) {
            return res.status(403).json({
                success: false,
                message: 'Solo los usuarios que compraron este producto pueden dejar una reseña.'
            });
        }

        // Subir archivos si existen
        let imageUrl = null, imagePublicId = null, videoUrl = null, videoPublicId = null;
        if (req.files['review-image']) {
            const imgFile = req.files['review-image'][0];
            const imgResult = await uploadToCloudinary(imgFile.buffer, { folder: "magfit_reviews" });
            imageUrl = imgResult.secure_url;
            imagePublicId = imgResult.public_id;
        }
        if (req.files['review-video']) {
            const vidFile = req.files['review-video'][0];
            const vidResult = await uploadToCloudinary(vidFile.buffer, { resource_type: "video", folder: "magfit_reviews" });
            videoUrl = vidResult.secure_url;
            videoPublicId = vidResult.public_id;
        }

        // Insertar reseña en PostgreSQL
        await db.run(`
            INSERT INTO reviews 
                (product_id, user_name, user_email, rating, comment, image_url, image_public_id, video_url, video_public_id)
            VALUES 
                ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [product_id, user_name, user_email, parseInt(rating), comment, imageUrl, imagePublicId, videoUrl, videoPublicId]);

        console.log("✅ Reseña publicada correctamente.");
        res.json({ success: true, message: 'Reseña publicada con éxito.' });

    } catch (error) {
        console.error("❌ Error al publicar reseña:", error);
        res.status(500).json({
            success: false,
            message: 'Error al publicar la reseña.',
            error: error.message
        });
    }
});


// ==========================================================
// === ENDPOINT DE TIENDA Y FACTURACIÓN (CORREGIDO) ===
// ==========================================================

// --- ENDPOINT PARA VALIDAR COMPRA ---
app.post('/validate-purchase', async (req, res) => {
    const { fecha, folio, invoiceId } = req.body;

    // 🔐 Verificar sesión activa
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Debes iniciar sesión.' });
    }

    try {
        console.log('🟡 Validando compra:', { fecha, folio, invoiceId });

        // 🔎 Buscar por folio, invoiceId y día local (zona horaria México)
        const query = `
            SELECT total,
                   (purchasedate AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')::date AS fecha_local
            FROM purchases
            WHERE folio = $1
              AND invoiceid = $2
              AND (purchasedate AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')::date = $3
        `;

        const result = await db.pool.query(query, [folio, invoiceId, fecha]);

        if (result.rows.length > 0) {
            const purchase = result.rows[0];
            console.log('✅ Compra encontrada:', purchase);
            res.json({ success: true, total: parseFloat(purchase.total) });
        } else {
            console.warn('⚠️ No se encontró la compra con los datos:', { folio, invoiceId, fecha });
            res.status(404).json({ success: false, message: 'No se encontró la compra.' });
        }

    } catch (error) {
        console.error('❌ Error en /validate-purchase:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
});




app.post('/process-purchase', async (req, res) => {
    if (!req.session.user) { return res.status(401).json({ success: false, message: 'No has iniciado sesión.' }); }
    const data = req.body;
    const folio = `A${Date.now()}`;
    const invoiceId = data.paypalTransactionId;
    const purchaseDate = new Date().toISOString();
    const total = parseFloat(data.price);
    try {
        await db.run(
            'INSERT INTO purchases (userEmail, folio, invoiceId, productName, total, purchaseDate) VALUES ($1, $2, $3, $4, $5, $6)',
            [data.userEmail, folio, invoiceId, data.productName, total, purchaseDate]
        );
        res.json({ success: true });

        // Pasamos el MISMO invoiceId a la función del correo
        const emailHtml = generateReceiptEmail(data, folio, invoiceId); 
        const mailOptions = { 
            from: '"Tu Tienda en Línea" <digitalbiblioteca48@gmail.com>', 
            to: data.userEmail, 
            subject: `¡GRACIAS POR TU COMPRA! ID de factura: ${invoiceId}`, // El asunto coincide
            html: emailHtml
        };
        
        transporter.sendMail(mailOptions);
    } catch (error) { res.status(500).json({ success: false, message: 'No se pudo registrar la compra.' }); }
});

// --- Endpoint para OBTENER historial de compras ---
app.get('/my-purchases', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json([]);
    }

    const userEmail = req.session.user.email;

    try {
        // Consulta mejorada con JOIN para traer el producto completo
        const query = `
            SELECT 
                p.id,
                p.folio,
                p.invoiceid,
                p.useremail,
                p.productname,
                p.total,
                p.purchasedate,
                p.status,
                pr.name AS "product_name",
                pr.description AS "product_description",
                pr.image_url AS "product_image",
                pr.pdf_url AS "pdf_url"
            FROM purchases p
            LEFT JOIN products pr ON p.productname = pr.name
            WHERE p.useremail = $1
            ORDER BY p.purchasedate DESC
        `;

        const purchases = await db.all(query, [userEmail]);
        res.json(purchases);

    } catch (error) {
        console.error('❌ Error al obtener compras:', error);
        res.status(500).json({ message: "Error al obtener las compras.", error: error.message });
    }
});


app.post('/request-return', async (req, res) => {
    if (!req.session.user) { return res.status(401).json({ success: false, message: 'No autenticado' }); }
    const { purchaseId } = req.body;
    const userEmail = req.session.user.email;
    try {
        const purchase = await db.get('SELECT * FROM purchases WHERE id = $1 AND userEmail = $2', [purchaseId, userEmail]);
        if (!purchase) { return res.status(404).json({ success: false, message: 'Compra no encontrada.' }); }
        if (purchase.status !== 'COMPLETADO') { return res.status(400).json({ success: false, message: 'Esta compra ya tiene una solicitud.' }); }
        await db.run('UPDATE purchases SET status = $1 WHERE id = $2', ['DEVOLUCIÓN SOLICITADA', purchaseId]);

        // Enviar correo de confirmación de solicitud
        const emailContent = `
            <p>Hola ${req.session.user.name},</p>
            <p>Hemos recibido tu solicitud de devolución para el producto: <b>${purchase.productName}</b> (Folio: ${purchase.folio}).</p>
            <p>Nuestro equipo revisará tu caso y se pondrá en contacto contigo pronto.</p>
        `;
        const mailOptions = {
            from: '"Tu Tienda en Línea" <digitalbiblioteca48@gmail.com>',
            to: userEmail,
            subject: 'Solicitud de Devolución Recibida',
            html: createStyledEmail('Devolución en Proceso', emailContent)
        };
        transporter.sendMail(mailOptions);

        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, message: 'Error en el servidor.' }); }
});

// --- Endpoint de Facturación (100% en memoria y compatible con hosting) ---
app.post('/enviar-factura', async (req, res) => {
    try {
        const data = req.body;

        // 1️⃣ Generar el XML directamente como Buffer (sin escribir archivo)
        const xmlContent = generateXML(data);
        const xmlBuffer = Buffer.from(xmlContent, 'utf-8');

        // 2️⃣ Generar el PDF directamente en memoria
        const pdfBuffer = await generateInvoicePdfBuffer(data);

        // 3️⃣ Preparar el contenido del correo
        const emailContent = `
            <p>Estimado cliente,</p>
            <p>Adjuntamos su factura electrónica con RFC <b>${data.rfc}</b> en formatos PDF y XML.</p>
        `;

        const mailOptions = {
            from: '"Tu Portal de Facturación" <digitalbiblioteca48@gmail.com>',
            to: data.emailReceptor,
            subject: `Factura Electrónica de su Compra`,
            html: createStyledEmail('Factura Electrónica', emailContent),
            attachments: [
                { filename: `Factura-${data.rfc}.pdf`, content: pdfBuffer },
                { filename: `Factura-${data.rfc}.xml`, content: xmlBuffer }
            ]
        };

        // 4️⃣ Enviar el correo
        await transporter.sendMail(mailOptions);

        res.json({ success: true, message: "Factura enviada exitosamente al correo del cliente." });

    } catch (error) {
        console.error("❌ Error al generar o enviar la factura:", error);
        res.status(500).json({ success: false, message: "Error al generar o enviar la factura." });
    }
});




// --- Iniciar el Servidor y la Base de Datos ---
const PORT = process.env.PORT || 4000;

// Iniciar la DB (que ahora es una clase) y luego el servidor
try {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Servidor escuchando en el puerto ${PORT}`);
        updateExchangeRates();
        // Actualiza tasas de cambio cada 12 horas
        setInterval(updateExchangeRates, 1000 * 60 * 60 * 12);
    });
} catch (err) {
    console.error('❌ No se pudo iniciar el servidor:', err);
}


/// ==========================================================
// === FUNCIÓN DE CORREO DE COMPRA (CORREGIDA) ===
// ==========================================================
function generateReceiptEmail(data, folio, invoiceId) { // <-- Ahora recibe el invoiceId
    const purchaseDate = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
    const emailHtml = `
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f0f2f5;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f0f2f5;">
            <tr><td align="center">
                <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; margin: 20px auto; border: 1px solid #e0e0e0;">
                    <tr><td align="center" style="padding: 20px; border-bottom: 1px solid #e0e0e0;"><h1 style="color: #000000; font-size: 32px; margin: 0; font-weight: bold;">¡Gracias!</h1></td></tr>
                    <tr><td style="padding: 30px 25px;">
                        <p style="color: #333; margin: 0;">Hola ${data.cardName},</p>
                        <p style="color: #888; font-size: 14px;">¡Gracias por tu compra!</p>
                        <div style="text-align: center; margin: 30px 0;"><p style="color: #888; font-size: 14px; margin: 0;">ID DE LA FACTURA:</p><p style="color: #000; font-size: 28px; font-weight: bold; margin: 5px 0;">${invoiceId}</p></div>
                        <p style="color: #888; font-size: 12px; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px; margin-bottom: 15px; text-transform: uppercase;">Información sobre tu pedido:</p>
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size: 14px;">
                            <tr><td style="color: #888; padding-bottom: 10px;">Folio de la compra:</td><td style="color: #333;">${folio}</td><td style="color: #888;">Facturado a:</td><td style="color: #007bff;">${data.userEmail}</td></tr>
                            <tr><td style="color: #888;">Fecha del pedido:</td><td style="color: #333;">${purchaseDate}</td><td style="color: #888;">Fuente:</td><td style="color: #333;">Mi Portal</td></tr>
                        </table>
                        <p style="color: #888; font-size: 12px; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px; margin-top: 30px; margin-bottom: 15px; text-transform: uppercase;">Este es tu pedido:</p>
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size: 14px;">
                            <tr style="color: #888;"><th style="text-align: left; padding: 8px 0;">Descripción</th><th style="text-align: left; padding: 8px 0;">Distribuidor</th><th style="text-align: right; padding: 8px 0;">Precio:</th></tr>
                            <tr style="color: #333;"><td style="padding: 10px 0;">${data.productName}</td><td>Mi Empresa</td><td style="text-align: right;">$${parseFloat(data.price).toFixed(2)} MXN</td></tr>
                        </table>
                        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                        <p style="font-size: 18px; font-weight: bold; text-align: right; color: #000; margin: 0;">TOTAL: <span>$${parseFloat(data.price).toFixed(2)} MXN</span></p>
                    </td></tr>
                </table>
            </td></tr>
        </table>
    </body>`;
    // Ya no es necesario retornar el ID, solo el HTML
    return emailHtml;
}