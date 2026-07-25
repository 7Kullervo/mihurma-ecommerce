const express = require('express');
const Stripe = require('stripe');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const STATUS_LABELS = {
  pending_payment: 'Payment pending',
  processing: 'Processing',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};

// Create an order from the user's cart (or a single "buy now" item) and start a Stripe Checkout session.
router.post('/checkout', requireAuth, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Payments are not configured yet. Add your Stripe keys in server/.env.' });
  }
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
      `INSERT INTO orders (user_id, status, subtotal, total, shipping_name, shipping_address, shipping_phone)
       VALUES (?, 'pending_payment', ?, ?, ?, ?, ?)`,
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
      orderId, 'pending_payment', 'Order created, awaiting payment.'
    ]);
    await conn.commit();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: req.user.email,
      line_items: items.map(it => ({
        price_data: {
          currency: 'usd',
          product_data: { name: it.title },
          unit_amount: Math.round(Number(it.price) * 100)
        },
        quantity: it.quantity
      })),
      success_url: `${process.env.CLIENT_URL}/checkout-success.html?order=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/cart.html?cancelled=1`,
      metadata: { order_id: String(orderId), user_id: String(req.user.id) }
    });

    await pool.query('UPDATE orders SET stripe_session_id = ? WHERE id = ?', [session.id, orderId]);
    res.json({ url: session.url, order_id: orderId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Checkout failed. Please try again.' });
  } finally {
    conn.release();
  }
});

// Stripe webhook - marks order paid, decrements stock, clears cart, emits real-time update.
// NOTE: this handler is mounted directly in index.js (with raw body parsing) BEFORE express.json(),
// so it never runs through this router - it's exported separately as `webhookHandler` below.
async function webhookHandler(req, res) {
  if (!stripe) return res.status(503).end();
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata?.order_id;
    const userId = session.metadata?.user_id;
    if (orderId) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          'UPDATE orders SET paid = 1, status = "processing", stripe_payment_intent = ? WHERE id = ?',
          [session.payment_intent, orderId]
        );
        await conn.query('INSERT INTO order_status_history (order_id, status, note) VALUES (?, "processing", "Payment received. Order is being prepared.")', [orderId]);

        const [items] = await conn.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId]);
        for (const it of items) {
          if (it.product_id) {
            await conn.query('UPDATE products SET stock = GREATEST(stock - ?, 0) WHERE id = ?', [it.quantity, it.product_id]);
          }
        }
        if (userId) await conn.query('DELETE FROM cart_items WHERE user_id = ?', [userId]);
        await conn.commit();

        const io = req.app.get('io');
        io?.to(`order_${orderId}`).emit('order:update', { order_id: Number(orderId), status: 'processing', label: STATUS_LABELS.processing });
        if (userId) io?.to(`user_${userId}`).emit('order:paid', { order_id: Number(orderId) });
      } catch (err) {
        await conn.rollback();
        console.error(err);
      } finally {
        conn.release();
      }
    }
  }
  res.json({ received: true });
}

router.get('/mine', requireAuth, async (req, res) => {
  const [orders] = await pool.query(
    'SELECT id, status, total, paid, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json({ orders: orders.map(o => ({ ...o, status_label: STATUS_LABELS[o.status] })) });
});

router.get('/:id', requireAuth, async (req, res) => {
  const [[order]] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You do not have access to this order.' });
  }
  const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  const [history] = await pool.query('SELECT status, note, created_at FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC', [order.id]);
  res.json({ order: { ...order, status_label: STATUS_LABELS[order.status] }, items, history });
});

module.exports = router;
module.exports.webhookHandler = webhookHandler;
