const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { STATUS_LABELS, notifyOrderStatus } = require('../notifications');
const router = express.Router();

// Create an order from the user's cart (or a single "buy now" item). Payment is via
// JazzCash QR - the customer scans the code shown on the next page and pays in the
// JazzCash app directly; there's no gateway callback, so the order simply waits in
// "pending_payment" until an admin manually confirms it (see admin.js's /mark-paid).
router.post('/checkout', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { shipping_name, shipping_address, shipping_phone, buy_now } = req.body;
    if (!shipping_name || !shipping_address || !shipping_phone) {
      return res.status(400).json({ error: 'Please fill in your name, address and phone number.' });
    }

    let items;
    if (buy_now && buy_now.product_id) {
      const [[product]] = await pool.query(
        'SELECT id, title, price, stock FROM products WHERE id = ? AND status = "active"',
        [buy_now.product_id]
      );
      if (!product) return res.status(404).json({ error: 'Product not found.' });
      const qty = Math.max(1, Math.min(parseInt(buy_now.quantity) || 1, product.stock));
      items = [{ product_id: product.id, title: product.title, price: product.price, quantity: qty }];
    } else {
      const [rows] = await pool.query(
        `SELECT p.id AS product_id, p.title, p.price, p.stock, ci.quantity
         FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.user_id = ?`,
        [req.user.id]
      );
      items = rows;
    }

    if (!items.length) return res.status(400).json({ error: 'Your cart is empty.' });
    for (const it of items) {
      if (it.quantity > it.stock) {
        return res.status(400).json({ error: `Only ${it.stock} of "${it.title}" left in stock.` });
      }
    }

    const subtotal = items.reduce((s, it) => s + Number(it.price) * it.quantity, 0);
    const total = subtotal; // hook for tax/shipping calc later

    await conn.beginTransaction();
    const [orderResult] = await conn.query(
      `INSERT INTO orders (user_id, status, subtotal, total, shipping_name, shipping_address, shipping_phone, payment_method)
       VALUES (?, 'pending_payment', ?, ?, ?, ?, ?, 'jazzcash_qr')`,
      [req.user.id, subtotal, total, shipping_name, shipping_address, shipping_phone]
    );
    const orderId = orderResult.insertId;

    for (const it of items) {
      const [[img]] = await conn.query(
        'SELECT image_path FROM product_images WHERE product_id = ? ORDER BY is_primary DESC LIMIT 1',
        [it.product_id]
      );
      await conn.query(
        'INSERT INTO order_items (order_id, product_id, title, price, quantity, image_path) VALUES (?, ?, ?, ?, ?, ?)',
        [orderId, it.product_id, it.title, it.price, it.quantity, img ? img.image_path : null]
      );
    }
    await conn.query('INSERT INTO order_status_history (order_id, status, note) VALUES (?, ?, ?)', [
      orderId, 'pending_payment', 'Order placed, awaiting JazzCash payment confirmation.'
    ]);
    await conn.commit();

    // Let the customer know right away how to pay - this fires in the background and
    // never blocks the response, same isolation as every other notification call.
    // (req.user is just the JWT payload and doesn't carry phone/push_token, so the
    // full row is fetched here to make sure SMS/WhatsApp/push can actually reach them.)
    const [[customer]] = await pool.query('SELECT id, name, email, phone, push_token FROM users WHERE id = ?', [req.user.id]);
    if (customer) notifyOrderStatus({ id: orderId }, customer, 'pending_payment').catch(() => {});

    res.json({ order_id: orderId, total });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Checkout failed. Please try again.' });
  } finally {
    conn.release();
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  const [orders] = await pool.query(
    'SELECT id, status, total, paid, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json({ orders: orders.map(o => ({ ...o, status_label: STATUS_LABELS[o.status] })) });
});

router.get('/:id', requireAuth, async (req, res) => {
  const [[order]] = await pool.query(
    `SELECT o.*, c.name AS courier_name, c.phone AS courier_phone
     FROM orders o LEFT JOIN couriers c ON c.id = o.courier_id WHERE o.id = ?`,
    [req.params.id]
  );
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You do not have access to this order.' });
  }
  const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  const [history] = await pool.query('SELECT status, note, created_at FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC', [order.id]);
  res.json({ order: { ...order, status_label: STATUS_LABELS[order.status] }, items, history });
});

module.exports = router;
