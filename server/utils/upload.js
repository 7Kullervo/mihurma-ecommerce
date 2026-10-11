const multer = require('multer');
const crypto = require('crypto');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Memory storage: files go straight into the database (Vercel has no persistent disk).
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) =>
    ALLOWED_TYPES.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only JPG, PNG, WEBP or GIF images are allowed.')),
  limits: { fileSize: 4 * 1024 * 1024, files: 8 }
});

// Insert one uploaded file into product_images; returns the public path.
async function saveImage(conn, productId, file, isPrimary, sortOrder) {
  const key = crypto.randomBytes(16).toString('hex');
  const imagePath = `/api/images/${key}`;
  await conn.query(
    'INSERT INTO product_images (product_id, image_path, is_primary, sort_order, mime, data) VALUES (?, ?, ?, ?, ?, ?)',
    [productId, imagePath, isPrimary ? 1 : 0, sortOrder, file.mimetype, file.buffer]
  );
  return imagePath;
}

module.exports = upload;
module.exports.saveImage = saveImage;
