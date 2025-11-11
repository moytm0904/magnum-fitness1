// database.js
const { Pool } = require('pg'); // <-- Importar el driver de PostgreSQL

class Database {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL, // <-- Lee la URL desde .env
            ssl: {
                rejectUnauthorized: false
            }
        });
        this.init();
    }

    async init() {
        try {
            // Conectar y crear tablas si no existen
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS users (
                    email TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    password TEXT NOT NULL,
                    isVerified BOOLEAN DEFAULT FALSE,
                    verificationToken TEXT
                );
            `);
            
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS purchases (
                    id SERIAL PRIMARY KEY,
                    folio TEXT NOT NULL,
                    invoiceId TEXT NOT NULL,
                    userEmail TEXT NOT NULL,
                    productName TEXT NOT NULL,
                    total NUMERIC(10, 2) NOT NULL,
                    purchaseDate TIMESTAMPTZ NOT NULL,
                    status TEXT DEFAULT 'COMPLETADO' 
                );
            `);
            
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS products (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    price NUMERIC(10, 2) NOT NULL,
                    image_url TEXT,
                    image_public_id TEXT, -- ID de Cloudinary
                    category TEXT,
                    pdf_url TEXT,
                    pdf_public_id TEXT,   -- ID de Cloudinary
                    preview_pages INTEGER DEFAULT 1
                );
            `);
            
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS reviews (
                    id SERIAL PRIMARY KEY,
                    product_id INTEGER NOT NULL,
                    user_name TEXT NOT NULL,
                    user_email TEXT NOT NULL,
                    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                    comment TEXT,
                    image_url TEXT,
                    image_public_id TEXT, -- ID de Cloudinary
                    video_url TEXT,
                    video_public_id TEXT, -- ID de Cloudinary
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
                );
            `);

            console.log('Base de datos PostgreSQL conectada y tablas aseguradas.');
            
            // Insertar productos iniciales (solo si la tabla está vacía)
            const countRes = await this.pool.query('SELECT COUNT(id) as count FROM products');
            if (countRes.rows[0].count == 0) {
                await this.pool.query(
                    `INSERT INTO products (name, description, price, image_url, category, pdf_url, preview_pages) VALUES
                    ('Plan: Fuerza Bruta', 'Programa de 8 semanas...', 1.0, 'imagenes/fuerza1.png', 'plan', 'assets/pdf/plan_fuerza.pdf', 1),
                    ('Plan: Hipertrofia Estética', 'Plan detallado de hipertrofia...', 1.0, 'imagenes/estetica.jpeg', 'plan', 'assets/pdf/plan_estetica.pdf', 1),
                    ('Libro PDF: Guía de Nutrición', 'Una guía completa sobre nutrición...', 1.0, 'imagenes/nutricion.jpeg', 'libro', 'assets/pdf/libro_nutricion.pdf', 4),
                    ('Libro PDF: Mentalidad de Acero', 'Aprende a forjar la disciplina...', 1.0, 'imagenes/mentalidad_de acero.jpeg', 'libro', 'assets/pdf/libro_mentalidad.pdf', 4),
                    ('Straps de Levantamiento', 'Maximiza tu agarre...', 1.0, 'imagenes/straps.jpeg', 'producto', null, 0),
                    ('Vendas para Muñeca', 'Soporte y estabilidad...', 1.0, 'imagenes/vendas.jpeg', 'producto', null, 0),
                    ('Ligas de Resistencia (Set)', 'Set de 3 niveles...', 1.0, 'imagenes/ligas.jpg', 'producto', null, 0)`
                );
            }
        } catch (err) {
            console.error('❌ Error al inicializar la base de datos PostgreSQL:', err);
        }
    }

    // Funciones para interactuar con la BD (reemplazan las de SQLite)
    async get(sql, params = []) {
        const res = await this.pool.query(sql, params);
        return res.rows[0];
    }
    
    async all(sql, params = []) {
        const res = await this.pool.query(sql, params);
        return res.rows;
    }

    async run(sql, params = []) {
        const res = await this.pool.query(sql, params);
        return res;
    }
}

// Exportar una sola instancia de la base de datos
module.exports = new Database();