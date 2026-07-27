// SMS notifications via Twilio. Fully self-contained: if TWILIO_* env vars aren't
// set, this channel silently no-ops.
// TO REMOVE THIS CHANNEL: delete this file's require() line in ../index.js. Nothing else changes.
const enabled = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);

let client = null;
if (enabled) {
  // twilio is only require()'d if actually configured, so it's fine even if the
  // package were removed from package.json when this channel is deleted.
  client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

async function send({ user, message }) {
  if (!enabled || !user.phone) return;
  await client.messages.create({
    body: message,
    from: process.env.TWILIO_FROM_NUMBER,
    to: user.phone
  });
}

module.exports = { name: 'sms', enabled, send };
