const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// Which of the user's delivered orders contain this product, and are not yet reviewed?
router.get('/eligibility/:productId', requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT o.id AS order_id, o.created_at
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = ? AND oi.product_id = ? AND o.paid = 1
       AND o.id NOT IN (SELECT order_id FROM reviews WHERE user_id = ? AND product_id = ?)
     ORDER BY o.created_at DESC LIMIT 1`,
    [req.user.id, req.params.productId, req.user.id, req.params.productId]
  );
  res.json({ can_review: rows.length > 0, order_id: rows[0]?.order_id || null });
});

router.post('/', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { product_id, order_id, rating, comment } = req.body;
    const r = parseInt(rating);
    if (!product_id || !order_id || r < 1 || r > 5) {
      return res.status(400).json({ error: 'Please provide a valid rating between 1 and 5.' });
    }

    const [[eligible]] = await pool.query(
      `SELECT o.id FROM orders o JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = ? AND o.user_id = ? AND oi.product_id = ? AND o.paid = 1`,
      [order_id, req.user.id, product_id]
    );
    if (!eligible) return res.status(403).json({ error: 'You can only review products you have purchased and received.' });

    await conn.beginTransaction();
    await conn.query(
      'INSERT INTO reviews (product_id, user_id, order_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
      [product_id, req.user.id, order_id, r, (comment || '').slice(0, 2000)]
    );
    const [[agg]] = await conn.query(
      'SELECT AVG(rating) AS avg_rating, COUNT(*) AS cnt FROM reviews WHERE product_id = ?',
      [product_id]
    );
    await conn.query('UPDATE products SET rating_avg = ?, rating_count = ? WHERE id = ?', [
      Number(agg.avg_rating).toFixed(2), agg.cnt, product_id
    ]);
    await conn.commit();
    res.status(201).json({ ok: true });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'You already reviewed this order.' });
    console.error(err);
    res.status(500).json({ error: 'Could not submit your review.' });
  } finally {
    conn.release();
  }
});

module.exports = router;
