// One-time setup for a hosted MySQL database (Aiven, TiDB, PlanetScale, Railway, ...).
// Creates all tables if they don't exist, then creates/updates the admin account.
//
//   Windows PowerShell, from the server folder, with your hosted DB values in server/.env:
//     npm run setup:db
//   Admin login comes from ADMIN_EMAIL / ADMIN_PASSWORD in .env (or you'll be asked).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
    ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {})
  });
  try {
    const [t] = await conn.query("SHOW TABLES LIKE 'users'");
    if (t.length) {
      console.log('Tables already exist - leaving them alone.');
      const [c] = await conn.query("SHOW COLUMNS FROM product_images LIKE 'data'");
      if (!c.length) {
        await conn.query('ALTER TABLE product_images ADD COLUMN mime VARCHAR(50) NULL, ADD COLUMN data MEDIUMBLOB NULL');
        console.log('Added image storage columns to product_images.');
      }
    } else {
      let sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
      sql = sql.replace(/^\s*CREATE DATABASE[^;]*;/im, '').replace(/^\s*USE\s+\w+\s*;/im, '');
      await conn.query(sql);
      console.log('Database tables created.');
    }

    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || '';
    if (email && password.length >= 8) {
      const hash = await bcrypt.hash(password, 12);
      const [ex] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
      if (ex.length) await conn.query('UPDATE users SET role="admin", password_hash=? WHERE email=?', [hash, email]);
      else await conn.query('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,"admin")', ['Store Admin', email, hash]);
      console.log(`Admin ready: ${email}`);
    } else {
      console.log('No ADMIN_EMAIL / ADMIN_PASSWORD (8+ chars) in .env - skipped admin creation.');
    }
  } catch (e) {
    console.error('Setup failed:', e.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
