const express = require('express');
const pool = require('../db');
const router = express.Router();

// GET /api/products?category=men&search=hat&sort=price_asc&featured=1&page=1
router.get('/', async (req, res) => {
  try {
    const { category, search, sort, featured, page = 1, limit = 24 } = req.query;
    const where = ["p.status = 'active'"];
    const params = [];

    if (category) {
      where.push('c.slug = ?');
      params.push(category);
    }
    if (search) {
      where.push('(p.title LIKE ? OR p.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (featured) {
      where.push('p.is_featured = 1');
    }

    let orderBy = 'p.created_at DESC';
    if (sort === 'price_asc') orderBy = 'p.price ASC';
    if (sort === 'price_desc') orderBy = 'p.price DESC';
    if (sort === 'rating') orderBy = 'p.rating_avg DESC';

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const lim = Math.min(parseInt(limit) || 24, 60);
    const offset = (pageNum - 1) * lim;

    const sql = `
      SELECT p.id, p.title, p.slug, p.price, p.compare_at_price, p.stock, p.rating_avg, p.rating_count,
             (SELECT image_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) AS thumbnail
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`;
    const [rows] = await pool.query(sql, [...params, lim, offset]);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${where.join(' AND ')}`,
      params
    );

    res.json({ products: rows, total: countRows[0].total, page: pageNum, limit: lim });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load products.' });
  }
});

router.get('/categories', async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, slug FROM categories ORDER BY name');
  res.json({ categories: rows });
});

// GET /api/products/:slug
router.get('/:slug', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.slug = ? AND p.status = 'active'`,
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found.' });
    const product = rows[0];

    const [images] = await pool.query(
      'SELECT id, image_path, is_primary FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC',
      [product.id]
    );
    product.images = images;

    const [reviews] = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at, u.name AS user_name
       FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.product_id = ? ORDER BY r.created_at DESC LIMIT 50`,
      [product.id]
    );
    product.reviews = reviews;

    const [related] = await pool.query(
      `SELECT p2.id, p2.title, p2.slug, p2.price, p2.compare_at_price, p2.rating_avg,
              (SELECT image_path FROM product_images pi WHERE pi.product_id = p2.id ORDER BY is_primary DESC LIMIT 1) AS thumbnail
       FROM products p2
       WHERE p2.category_id <=> ? AND p2.id != ? AND p2.status = 'active'
       ORDER BY RAND() LIMIT 4`,
      [product.category_id, product.id]
    );
    product.related = related;

    res.json({ product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load this product.' });
  }
});

module.exports = router;
