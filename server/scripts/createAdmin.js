// Run with: npm run seed:admin
// Creates (or promotes) an admin account so you can log into /admin.
require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const pool = require('../db');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

(async () => {
  try {
    const name = (await ask('Admin name: ')) || 'Store Admin';
    const email = (await ask('Admin email: ')).trim().toLowerCase();
    const password = await ask('Admin password (min 8 chars): ');
    if (!email || !password || password.length < 8) {
      console.log('Email and an 8+ character password are required.');
      process.exit(1);
    }
    const hash = await bcrypt.hash(password, 12);
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      await pool.query('UPDATE users SET role = "admin", password_hash = ?, name = ? WHERE email = ?', [hash, name, email]);
      console.log(`Existing user ${email} promoted to admin.`);
    } else {
      await pool.query('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, "admin")', [name, email, hash]);
      console.log(`Admin account created: ${email}`);
    }
  } catch (err) {
    console.error('Failed to create admin:', err.message);
  } finally {
    rl.close();
    process.exit(0);
  }
})();
