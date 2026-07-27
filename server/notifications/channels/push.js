// Push notifications via Firebase Cloud Messaging. Requires the customer's browser to
// have registered a push token first (see /api/auth/push-token in routes/auth.js) -
// if a user has no token saved, this silently skips them, no error.
// Fully self-contained: if FIREBASE_SERVICE_ACCOUNT_JSON isn't set, this channel no-ops.
// TO REMOVE THIS CHANNEL: delete this file's require() line in ../index.js. Nothing else changes.
const enabled = !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

let messaging = null;
if (enabled) {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
  }
  messaging = admin.messaging();
}

async function send({ user, order, statusLabel, message }) {
  if (!enabled || !user.push_token) return;
  await messaging.send({
    token: user.push_token,
    notification: { title: `Order #${order.id}`, body: statusLabel },
    data: { orderId: String(order.id), message }
  });
}

module.exports = { name: 'push', enabled, send };
