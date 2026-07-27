// Email notifications via Nodemailer (any SMTP provider - Gmail, SendGrid, Mailgun, etc).
// Fully self-contained: if the SMTP_* env vars aren't set, this channel silently no-ops.
// TO REMOVE THIS CHANNEL: delete this file's require() line in ../index.js. Nothing else changes.
const nodemailer = require('nodemailer');

const enabled = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
if (enabled) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function send({ user, order, statusLabel, message }) {
  if (!enabled || !user.email) return;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Mihurma" <no-reply@mihurma.com>`,
    to: user.email,
    subject: `Order #${order.id}: ${statusLabel}`,
    text: message,
    html: `<p>${message}</p><p style="color:#888;font-size:13px;">— The Mihurma Team</p>`
  });
}

module.exports = { name: 'email', enabled, send };
