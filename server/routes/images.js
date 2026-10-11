const express = require('express');
const pool = require('../db');
const router = express.Router();

// Serves product images stored in the database (Vercel has no writable disk).
router.get('/:key', async (req, res) => {
  try {
    const [[img]] = await pool.query(
      'SELECT mime, data FROM product_images WHERE image_path = ? LIMIT 1',
      [`/api/images/${req.params.key}`]
    );
    if (!img || !img.data) return res.status(404).end();
    res.set('Content-Type', img.mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(img.data);
  } catch (e) { res.status(500).end(); }
});

module.exports = router;
