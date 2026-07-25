const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts. Please try again in a few minutes.' }
});

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

router.post('/signup', authLimiter, async (req, res) => {
  try {
    let { name, email, password } = req.body;
    name = (name || '').trim();
    email = (email || '').trim().toLowerCase();

    if (!name || name.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
    if (!validator.isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) return res.status(409).json({ error: 'An account with this email already exists.' });

    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, 'customer']
    );

    const user = { id: result.insertId, name, email, role: 'customer' };
    const token = signToken(user);
    setAuthCookie(res, token);
    res.status(201).json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating your account.' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    let { email, password } = req.body;
    email = (email || '').trim().toLowerCase();
    if (!validator.isEmail(email) || !password) {
      return res.status(400).json({ error: 'Please enter a valid email and password.' });
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Incorrect email or password.' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Incorrect email or password.' });

    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong logging you in.' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, email, role, phone, address FROM users WHERE id = ?', [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: rows[0] });
});

router.put('/me', requireAuth, async (req, res) => {
  const { name, phone, address } = req.body;
  await pool.query('UPDATE users SET name = ?, phone = ?, address = ? WHERE id = ?', [
    (name || '').trim() || req.user.name, phone || null, address || null, req.user.id
  ]);
  res.json({ ok: true });
});

module.exports = router;
