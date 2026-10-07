// ============================================================================
// NOTIFICATION DISPATCHER
// ============================================================================
// This is the ONLY place channels are wired together. Each channel below is a
// completely independent, self-contained file - it decides for itself whether
// it's "enabled" based on whether its own env vars are set.
//
// TO REMOVE A CHANNEL ENTIRELY: delete (or comment out) its one line below.
// That's it - nothing else in the codebase needs to change, and the other
// channels keep working exactly as before.
//
// TO TEMPORARILY DISABLE A CHANNEL WITHOUT TOUCHING CODE: just remove/blank out
// its env vars in .env (e.g. clear TWILIO_ACCOUNT_SID) - it'll auto-disable itself.
// ============================================================================
const channels = [
  require('./channels/email'),
  require('./channels/sms'),
  require('./channels/whatsapp'),
  require('./channels/push'),
];

const STATUS_MESSAGES = {
  pending_payment: (id) => `Your order #${id} has been placed! Scan the JazzCash QR code shown at checkout to pay - we'll confirm your payment shortly.`,
  preparing: (id) => `Good news! Your order #${id} is now being prepared.`,
  prepared: (id) => `Your order #${id} has been prepared and will be handed to a courier shortly.`,
  on_the_way: (id, courier) => `Your order #${id} is on the way${courier ? `, with ${courier}` : ''}!`,
  arriving_today: (id) => `Your order #${id} might be delivered today - keep an eye out!`,
  delivered: (id) => `Your order #${id} has been delivered. Enjoy! We'd love a review if you have a moment.`,
  cancelled: (id) => `Your order #${id} has been cancelled. Contact us if this wasn't expected.`
};

const STATUS_LABELS = {
  pending_payment: 'Payment Pending',
  preparing: 'Product Being Prepared',
  prepared: 'Product Prepared',
  on_the_way: 'Product On The Way',
  arriving_today: 'Product Might Be Delivered Today',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};

// Shared by every notify function below - loops every enabled channel, isolating
// each one in its own try/catch so a failing channel (bad key, rate limit, etc.)
// never blocks the others or whatever action triggered the notification.
async function dispatch(ctx) {
  for (const channel of channels) {
    if (!channel.enabled) continue;
    try {
      await channel.send(ctx);
    } catch (err) {
      console.error(`[notifications] "${channel.name}" channel failed:`, err.message);
    }
  }
}

/**
 * Fires every enabled channel for an order status update.
 * @param {object} order  - the order row (needs at least id, courier name if available)
 * @param {object} user   - the customer row (needs at least email; phone/push_token optional)
 * @param {string} status - one of the keys in STATUS_LABELS above
 * @param {string} [courierName] - optional, used to personalize the "on the way" message
 */
async function notifyOrderStatus(order, user, status, courierName) {
  const statusLabel = STATUS_LABELS[status] || status;
  const messageFn = STATUS_MESSAGES[status];
  const message = messageFn ? messageFn(order.id, courierName) : `Order #${order.id} status: ${statusLabel}`;
  await dispatch({ user, order, status, statusLabel, message });
}

/**
 * Fires every enabled channel with a one-off custom message - used for things that
 * aren't a status change, like handing out a courier tracking number.
 * @param {object} order
 * @param {object} user
 * @param {string} message - the full message text to send
 * @param {string} [label] - short label some channels (push, email subject) use as a title
 */
async function notifyCustomMessage(order, user, message, label = 'Order Update') {
  await dispatch({ user, order, status: null, statusLabel: label, message });
}

module.exports = { notifyOrderStatus, notifyCustomMessage, STATUS_LABELS };
