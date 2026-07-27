// WhatsApp notifications via Meta's WhatsApp Cloud API (no extra npm package needed -
// it's a plain HTTPS call using Node's built-in fetch).
// Fully self-contained: if WHATSAPP_* env vars aren't set, this channel silently no-ops.
// TO REMOVE THIS CHANNEL: delete this file's require() line in ../index.js. Nothing else changes.
const enabled = !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

async function send({ user, message }) {
  if (!enabled || !user.phone) return;
  const to = user.phone.replace(/[^\d]/g, ''); // Cloud API wants digits only, e.g. 15551234567
  const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: message } })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WhatsApp API responded ${res.status}: ${body}`);
  }
}

module.exports = { name: 'whatsapp', enabled, send };
