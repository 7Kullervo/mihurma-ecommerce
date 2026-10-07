// Whatever confirms an order - an automatic gateway webhook, or (as of the JazzCash
// QR flow) an admin manually clicking "Mark as Paid" after checking their JazzCash
// account - THIS is what actually happens next: move it to "preparing", decrement
// stock, clear the customer's cart, push the live update, and notify them. Every
// confirmation path calls this same function, so nothing is duplicated.
const pool = require('../db');
const { notifyOrderStatus } = require('../notifications');

/**
 * @param {number} orderId
 * @param {object} opts
 * @param {string} [opts.paymentReference] - a gateway transaction ID, if any (JazzCash
 *   QR has none - it's a manual confirmation, so this stays null for those orders).
 * @param {boolean} [opts.paid=true] - whether payment has actually been confirmed received.
 */
async function confirmOrder(orderId, { paymentReference, paid = true } = {}) {
  const conn = await pool.getConnection();
  let userId = null;
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query('SELECT user_id, status FROM orders WHERE id = ?', [orderId]);
    if (!existing) throw new Error(`confirmOrder: order #${orderId} not found`);
    if (existing.status !== 'pending_payment') {
      // Already confirmed (e.g. an admin double-click, or a duplicate webhook retry) -
      // don't double-decrement stock or re-clear the cart.
      await conn.commit();
      return { userId: existing.user_id, alreadyConfirmed: true };
    }

    userId = existing.user_id;

    // Note: the column is still named stripe_payment_intent from the original build -
    // it now just stores whichever provider's payment reference, or stays null for a
    // manually-confirmed JazzCash QR payment. Not worth a migration to rename it.
    await conn.query(
      'UPDATE orders SET paid = ?, status = "preparing", stripe_payment_intent = ? WHERE id = ?',
      [paid ? 1 : 0, paymentReference || null, orderId]
    );
    await conn.query(
      'INSERT INTO order_status_history (order_id, status, note) VALUES (?, "preparing", ?)',
      [orderId, paid ? 'Payment confirmed. Order is being prepared.' : 'Order confirmed. Order is being prepared.']
    );

    const [items] = await conn.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId]);
    for (const it of items) {
      if (it.product_id) {
        await conn.query('UPDATE products SET stock = GREATEST(stock - ?, 0) WHERE id = ?', [it.quantity, it.product_id]);
      }
    }
    await conn.query('DELETE FROM cart_items WHERE user_id = ?', [userId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return { userId, alreadyConfirmed: false };
}

// Handles the socket push + customer notification once an order is confirmed - shared
// by both online-payment webhook handlers and the admin's manual "Mark as Paid" action.
async function announceOrderConfirmed(req, orderId, userId) {
  const { STATUS_LABELS } = require('../notifications');
  const io = req.app.get('io');
  io?.to(`order_${orderId}`).emit('order:update', { order_id: Number(orderId), status: 'preparing', label: STATUS_LABELS.preparing });
  if (userId) io?.to(`user_${userId}`).emit('order:paid', { order_id: Number(orderId) });

  if (userId) {
    const [[order]] = await pool.query('SELECT id FROM orders WHERE id = ?', [orderId]);
    const [[customer]] = await pool.query('SELECT id, name, email, phone, push_token FROM users WHERE id = ?', [userId]);
    if (order && customer) notifyOrderStatus(order, customer, 'preparing').catch(() => {});
  }
}

module.exports = { confirmOrder, announceOrderConfirmed };
