// Stripe implementation of the payment provider interface (see ../index.js for what
// "the interface" means). This file is the ONLY place that knows anything Stripe-
// specific - orders.js just calls createCheckout()/webhookHandler() generically.
const express = require('express');
const Stripe = require('stripe');
const { confirmOrder, announceOrderConfirmed } = require('../fulfillOrder');

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const configured = !!stripe;

/**
 * Creates a hosted Stripe Checkout session and returns where to send the browser.
 * @param {object} params - { items: [{title, price, quantity}], order: {id}, customerEmail, successUrl, cancelUrl }
 */
async function createCheckout({ items, order, customerEmail, successUrl, cancelUrl }) {
  if (!configured) {
    const err = new Error('Payments are not configured yet. Add your Stripe keys in server/.env.');
    err.statusCode = 503;
    throw err;
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: customerEmail,
    line_items: items.map(it => ({
      price_data: { currency: 'usd', product_data: { name: it.title }, unit_amount: Math.round(Number(it.price) * 100) },
      quantity: it.quantity
    })),
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { order_id: String(order.id) }
  });

  return { redirectUrl: session.url, providerSessionId: session.id };
}

// Stripe requires the RAW request body to verify its webhook signature, so this
// middleware must run before express.json() - see how it's mounted in server/index.js.
const webhookMiddleware = express.raw({ type: 'application/json' });

async function webhookHandler(req, res) {
  if (!configured) return res.status(503).end();

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata?.order_id;
    if (orderId) {
      try {
        const { userId } = await confirmOrder(orderId, { paymentReference: session.payment_intent, paid: true });
        await announceOrderConfirmed(req, orderId, userId);
      } catch (err) {
        console.error('Stripe webhook fulfillment failed:', err);
      }
    }
  }

  res.json({ received: true });
}

module.exports = { name: 'stripe', configured, createCheckout, webhookMiddleware, webhookHandler };
