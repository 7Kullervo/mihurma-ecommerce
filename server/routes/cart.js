const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.use(requireAuth);

async function getCart(userId) {
  const [rows] = await pool.query(
    `SELECT ci.id, ci.quantity, p.id AS product_id, p.title, p.price, p.stock, p.slug,
            (SELECT image_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY is_primary DESC LIMIT 1) AS thumbnail
     FROM cart_items ci JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = ? ORDER BY ci.created_at DESC`,
    [userId]
  );
  return rows;
}

router.get('/', async (req, res) => {
  const items = await getCart(req.user.id);
  res.json({ items });
});

router.post('/', async (req, res) => {
  try {
    const { product_id, quantity = 1 } = req.body;
    const [[product]] = await pool.query('SELECT id, stock FROM products WHERE id = ? AND status = "active"', [product_id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const qty = Math.max(1, Math.min(parseInt(quantity) || 1, product.stock || 1));
    await pool.query(
      `INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = LEAST(quantity + VALUES(quantity), ?)`,
      [req.user.id, product_id, qty, product.stock]
    );
    res.json({ items: await getCart(req.user.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not add item to cart.' });
  }
});

router.put('/:itemId', async (req, res) => {
  const { quantity } = req.body;
  if (!quantity || quantity < 1) {
    await pool.query('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [req.params.itemId, req.user.id]);
  } else {
    await pool.query('UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?', [quantity, req.params.itemId, req.user.id]);
  }
  res.json({ items: await getCart(req.user.id) });
});

router.delete('/:itemId', async (req, res) => {
  await pool.query('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [req.params.itemId, req.user.id]);
  res.json({ items: await getCart(req.user.id) });
});

router.delete('/', async (req, res) => {
  await pool.query('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
  res.json({ items: [] });
});

module.exports = router;
