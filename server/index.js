require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const reviewRoutes = require('./routes/reviews');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_URL, credentials: true } });
app.set('io', io);

app.use(helmet({ contentSecurityPolicy: false })); // CSP left off for simplicity with inline demo assets; tighten before production
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---- Socket.io: real-time order tracking ----
// The JWT lives in an httpOnly cookie (not readable by client JS), so we read it
// straight off the socket handshake's cookie header - same trust boundary as normal HTTP requests.
function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').filter(Boolean).map(p => {
    const idx = p.indexOf('=');
    return [decodeURIComponent(p.slice(0, idx).trim()), decodeURIComponent(p.slice(idx + 1).trim())];
  }));
}

io.use((socket, next) => {
  try {
    const cookies = parseCookies(socket.handshake.headers.cookie || '');
    if (cookies.token) socket.user = jwt.verify(cookies.token, process.env.JWT_SECRET);
  } catch (err) {
    // allow anonymous connections; they just won't be able to join the user-specific room
  }
  next();
});

const pool = require('./db');

io.on('connection', (socket) => {
  socket.on('join:order', async (orderId) => {
    if (!socket.user || !orderId) return;
    try {
      const [[order]] = await pool.query('SELECT user_id FROM orders WHERE id = ?', [orderId]);
      if (order && (order.user_id === socket.user.id || socket.user.role === 'admin')) {
        socket.join(`order_${orderId}`);
      }
    } catch (err) { /* ignore */ }
  });
  socket.on('join:user', () => {
    if (socket.user) socket.join(`user_${socket.user.id}`);
  });
  socket.on('join:adminRoom', () => {
    if (socket.user?.role === 'admin') socket.join('admins');
  });
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mihurma server running on port ${PORT}`);
});
