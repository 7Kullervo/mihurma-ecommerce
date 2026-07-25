const jwt = require('jsonwebtoken');

// Reads the JWT from the httpOnly cookie, verifies it, attaches req.user.
function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Please log in to continue.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, name, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}

// Same as requireAuth but does not fail if no token - just leaves req.user undefined.
function optionalAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return next();
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    // ignore invalid token, treat as guest
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access only.' });
  }
  next();
}

module.exports = { requireAuth, optionalAuth, requireAdmin };
