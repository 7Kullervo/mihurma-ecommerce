// ============================================================================
// EASYPAISA PROVIDER - NOT YET IMPLEMENTED
// ============================================================================
// This file is a placeholder that matches the same interface as ../stripe.js,
// so once it's filled in, NOTHING else in the codebase needs to change - just
// set PAYMENT_PROVIDER=easypaisa in .env and this file takes over.
//
// What's needed to finish this file:
//   1. An approved EasyPaisa merchant account (see easypaisa.com.pk/online-payment-gateway)
//   2. The Store ID + API credentials + integration guide EasyPaisa sends you after
//      approval - their exact request/response format isn't public, so this can't
//      be written correctly until you have that document.
//   3. Bring that guide back and I'll fill in createCheckout() and the callback
//      handler below using the real field names and auth method.
//
// A few things to figure out from their integration guide when you have it:
//   - Do they redirect the customer to an EasyPaisa-hosted page (like Stripe does),
//     or do you collect payment details yourself and call their API directly?
//   - Do they PUSH a confirmation to a webhook URL you provide, or do you have to
//     POLL a "transaction status" endpoint after redirecting back? (Their public
//     docs mention an "Inquire Transaction Status" API, which suggests it may be
//     poll-based rather than webhook-based - different from how Stripe works.)
//   - What authentication do their API calls need (API key header? signed request?)
// ============================================================================
const configured = false; // flip this on once real credentials exist below

async function createCheckout({ items, order, customerEmail, successUrl, cancelUrl }) {
  const err = new Error('EasyPaisa is not configured yet - see server/payments/providers/easypaisa.js for setup steps.');
  err.statusCode = 503;
  throw err;

  // --- once you have EasyPaisa's integration guide, replace the above with
  // something like this shape (exact fields will differ - this is illustrative only):
  //
  // const response = await fetch('https://easypay.easypaisa.com.pk/easypay/Index.jsf', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     storeId: process.env.EASYPAISA_STORE_ID,
  //     amount: items.reduce((s, i) => s + i.price * i.quantity, 0),
  //     orderRefNum: String(order.id),
  //     ... // whatever fields their real docs specify
  //   })
  // });
  // const data = await response.json();
  // return { redirectUrl: data.paymentUrl, providerSessionId: data.transactionId };
}

// Placeholder callback/webhook handler - EasyPaisa's confirmation mechanism needs to
// be confirmed from their integration guide (see notes above) before this can be real.
async function webhookHandler(req, res) {
  res.status(501).json({ error: 'EasyPaisa callback handling not implemented yet.' });

  // --- once confirmed, this should ultimately do the same thing stripe.js's
  // webhookHandler does: verify the callback is legitimate, then call
  // fulfillPaidOrder(orderId, { paymentReference }) from ../fulfillOrder.js,
  // then emit the socket update and call notifyOrderStatus() - reuse that same
  // shared logic rather than duplicating it here.
}

module.exports = { name: 'easypaisa', configured, createCheckout, webhookMiddleware: null, webhookHandler };
