// ============================================================================
// PAYMENT PROVIDER REGISTRY
// ============================================================================
// Exactly one provider is active at a time, chosen by PAYMENT_PROVIDER in .env
// (defaults to "stripe" if not set). Every provider file implements the same
// shape: { name, configured, createCheckout(), webhookMiddleware, webhookHandler() }
//
// TO SWITCH PROVIDERS: change PAYMENT_PROVIDER in .env - e.g. PAYMENT_PROVIDER=easypaisa
// TO ADD A NEW PROVIDER: create providers/yourgateway.js matching the same shape,
// then add it to the PROVIDERS map below.
// ============================================================================
const PROVIDERS = {
  stripe: require('./providers/stripe'),
  easypaisa: require('./providers/easypaisa'),
};

const activeName = process.env.PAYMENT_PROVIDER || 'stripe';
const activeProvider = PROVIDERS[activeName];

if (!activeProvider) {
  throw new Error(`Unknown PAYMENT_PROVIDER "${activeName}". Valid options: ${Object.keys(PROVIDERS).join(', ')}`);
}

module.exports = activeProvider;
