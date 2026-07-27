const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const upload = require('../utils/upload');
const { notifyOrderStatus, STATUS_LABELS } = require('../notifications');
const router = express.Router();

router.use(requireAuth, requireAdmin);

function slugify(str) {
  return str.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).slice(2, 7);
}

// ---------- Dashboard ----------
router.get('/stats', async (req, res) => {
  const [[{ totalOrders }]] = await pool.query('SELECT COUNT(*) AS totalOrders FROM orders WHERE paid = 1');
  const [[{ totalRevenue }]] = await pool.query('SELECT COALESCE(SUM(total),0) AS totalRevenue FROM orders WHERE paid = 1');
  const [[{ totalProducts }]] = await pool.query('SELECT COUNT(*) AS totalProducts FROM products');
  const [[{ totalUsers }]] = await pool.query('SELECT COUNT(*) AS totalUsers FROM users WHERE role = "customer"');
  const [[{ lowStock }]] = await pool.query('SELECT COUNT(*) AS lowStock FROM products WHERE stock <= 5');
  const [recentOrders] = await pool.query(
    `SELECT o.id, o.status, o.total, o.created_at, u.name AS customer_name
     FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 8`
  );
  res.json({ totalOrders, totalRevenue, totalProducts, totalUsers, lowStock, recentOrders });
});

// ---------- Products ----------
router.get('/products', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT p.id, p.title, p.price, p.stock, p.status, p.is_featured, c.name AS category_name,
            (SELECT image_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY is_primary DESC LIMIT 1) AS thumbnail
     FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.created_at DESC`
  );
  res.json({ products: rows });
});

router.get('/products/:id', async (req, res) => {
  const [[product]] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  const [images] = await pool.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC', [product.id]);
  product.images = images;
  res.json({ product });
});

// Create product with up to 8 images uploaded directly from device.
// Form field "primary_index" (0-based) marks which uploaded image is the thumbnail.
router.post('/products', upload.array('images', 8), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { title, description, price, compare_at_price, stock, category_id, is_featured, primary_index } = req.body;
    if (!title || !price) {
      return res.status(400).json({ error: 'Title and price are required.' });
    }
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO products (title, slug, description, price, compare_at_price, stock, category_id, is_featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, slugify(title), description || '', price, compare_at_price || null, stock || 0, category_id || null, is_featured ? 1 : 0]
    );
    const productId = result.insertId;
    const files = req.files || [];
    const primaryIdx = parseInt(primary_index) || 0;
    for (let i = 0; i < files.length; i++) {
      await conn.query(
        'INSERT INTO product_images (product_id, image_path, is_primary, sort_order) VALUES (?, ?, ?, ?)',
        [productId, `/uploads/products/${files[i].filename}`, i === primaryIdx ? 1 : 0, i]
      );
    }
    await conn.commit();
    res.status(201).json({ ok: true, product_id: productId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Could not create product.' });
  } finally {
    conn.release();
  }
});

router.put('/products/:id', upload.array('images', 8), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { title, description, price, compare_at_price, stock, category_id, is_featured, status, primary_image_id } = req.body;
    await conn.beginTransaction();
    await conn.query(
      `UPDATE products SET title=?, description=?, price=?, compare_at_price=?, stock=?, category_id=?, is_featured=?, status=?
       WHERE id = ?`,
      [title, description || '', price, compare_at_price || null, stock || 0, category_id || null, is_featured ? 1 : 0, status || 'active', req.params.id]
    );

    // Add any newly uploaded images
    const files = req.files || [];
    const [[maxSort]] = await conn.query('SELECT COALESCE(MAX(sort_order),-1) AS m FROM product_images WHERE product_id = ?', [req.params.id]);
    for (let i = 0; i < files.length; i++) {
      await conn.query(
        'INSERT INTO product_images (product_id, image_path, is_primary, sort_order) VALUES (?, ?, 0, ?)',
        [req.params.id, `/uploads/products/${files[i].filename}`, maxSort.m + 1 + i]
      );
    }

    // Update which image is primary/thumbnail
    if (primary_image_id) {
      await conn.query('UPDATE product_images SET is_primary = 0 WHERE product_id = ?', [req.params.id]);
      await conn.query('UPDATE product_images SET is_primary = 1 WHERE id = ? AND product_id = ?', [primary_image_id, req.params.id]);
    }

    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Could not update product.' });
  } finally {
    conn.release();
  }
});

router.delete('/products/:id/images/:imageId', async (req, res) => {
  const [[img]] = await pool.query('SELECT * FROM product_images WHERE id = ? AND product_id = ?', [req.params.imageId, req.params.id]);
  if (img) {
    const filePath = path.join(__dirname, '..', img.image_path.replace('/uploads', 'uploads'));
    fs.unlink(filePath, () => {});
    await pool.query('DELETE FROM product_images WHERE id = ?', [req.params.imageId]);
  }
  res.json({ ok: true });
});

router.delete('/products/:id', async (req, res) => {
  const [images] = await pool.query('SELECT * FROM product_images WHERE product_id = ?', [req.params.id]);
  images.forEach(img => {
    const filePath = path.join(__dirname, '..', img.image_path.replace('/uploads', 'uploads'));
    fs.unlink(filePath, () => {});
  });
  await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

router.get('/categories', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM categories ORDER BY name');
  res.json({ categories: rows });
});

router.post('/categories', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required.' });
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
  await pool.query('INSERT INTO categories (name, slug) VALUES (?, ?)', [name, slug]);
  res.status(201).json({ ok: true });
});

// ---------- Orders ----------
router.get('/orders', async (req, res) => {
  const { status } = req.query;
  let sql = `SELECT o.id, o.status, o.total, o.paid, o.created_at, o.courier_id,
                    u.name AS customer_name, u.email AS customer_email,
                    c.name AS courier_name
             FROM orders o
             JOIN users u ON u.id = o.user_id
             LEFT JOIN couriers c ON c.id = o.courier_id`;
  const params = [];
  if (status) { sql += ' WHERE o.status = ?'; params.push(status); }
  sql += ' ORDER BY o.created_at DESC';
  const [rows] = await pool.query(sql, params);
  res.json({ orders: rows.map(o => ({ ...o, status_label: STATUS_LABELS[o.status] })) });
});

const VALID_STATUSES = Object.keys(STATUS_LABELS);
router.put('/orders/:id/status', async (req, res) => {
  const { status, note } = req.body;
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

  const [[order]] = await pool.query(
    `SELECT o.*, c.name AS courier_name FROM orders o LEFT JOIN couriers c ON c.id = o.courier_id WHERE o.id = ?`,
    [req.params.id]
  );
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
  await pool.query('INSERT INTO order_status_history (order_id, status, note) VALUES (?, ?, ?)', [
    req.params.id, status, note || `Status updated to ${STATUS_LABELS[status]}.`
  ]);

  const io = req.app.get('io');
  io?.to(`order_${req.params.id}`).emit('order:update', { order_id: Number(req.params.id), status, label: STATUS_LABELS[status] });
  io?.to(`user_${order.user_id}`).emit('order:update', { order_id: Number(req.params.id), status, label: STATUS_LABELS[status] });

  // Fire-and-forget: notify the customer through every enabled channel (email/SMS/
  // WhatsApp/push). This never blocks or fails the status update itself - see
  // notifications/index.js for how each channel isolates its own errors.
  const [[customer]] = await pool.query('SELECT id, name, email, phone, push_token FROM users WHERE id = ?', [order.user_id]);
  if (customer) notifyOrderStatus(order, customer, status, order.courier_name).catch(() => {});

  res.json({ ok: true });
});

// ---------- Couriers ----------
router.get('/couriers', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM couriers ORDER BY name');
  res.json({ couriers: rows });
});

router.post('/couriers', async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Courier name is required.' });
  const [result] = await pool.query('INSERT INTO couriers (name, phone) VALUES (?, ?)', [name.trim(), phone || null]);
  res.status(201).json({ ok: true, courier_id: result.insertId });
});

router.delete('/couriers/:id', async (req, res) => {
  await pool.query('DELETE FROM couriers WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// Assign (or unassign, with courier_id: null) a courier to an order.
router.put('/orders/:id/courier', async (req, res) => {
  const { courier_id } = req.body;
  await pool.query('UPDATE orders SET courier_id = ? WHERE id = ?', [courier_id || null, req.params.id]);
  res.json({ ok: true });
});

// ---------- Users ----------
router.get('/users', async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC');
  res.json({ users: rows });
});

router.put('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['customer', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
