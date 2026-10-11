(async function () {
  const root = document.getElementById('pay-root');
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('order');

  if (!orderId) {
    root.innerHTML = `<h2>No order specified</h2><p><a href="shop.html">Back to shop</a></p>`;
    return;
  }

  root.innerHTML = flowerLoaderHTML('Loading your order…');

  let order;
  try {
    const data = await api(`/orders/${orderId}`);
    order = data.order;
  } catch (e) {
    root.innerHTML = `<h2>Couldn't load this order</h2><p>${e.message}</p><p><a href="dashboard.html">Go to my orders</a></p>`;
    return;
  }

  if (order.status !== 'pending_payment') {
    // Already confirmed (e.g. they refreshed after paying) - just send them onward.
    window.location.href = `checkout-success.html?order=${orderId}`;
    return;
  }

  render();

  function render() {
    root.innerHTML = `
      <h2 style="margin-bottom:6px;">Scan to Pay with JazzCash</h2>
      <p style="color:var(--text-soft);margin-bottom:24px;">Order #${order.id}</p>
      <div class="pay-amount">$${Number(order.total).toFixed(2)}</div>
      <p style="color:var(--text-soft);margin-bottom:20px;">Total amount due</p>

      <img src="assets/jazzcash-qr.png" alt="JazzCash payment QR code">

      <ol class="pay-steps">
        <li>Open your JazzCash app</li>
        <li>Scan the QR code above</li>
        <li>Pay the exact amount shown</li>
        <li>We'll confirm your payment shortly - no need to refresh this page</li>
      </ol>

      <div class="pay-waiting" id="waiting-indicator">
        <span class="dot-pulse"></span> Waiting for payment confirmation…
      </div>

      <div class="pay-confirmed" id="confirmed-box">
        <h3 style="color:var(--success);margin-bottom:10px;">✅ Payment Confirmed!</h3>
        <p style="color:var(--text-soft);margin-bottom:20px;">Your order is now being prepared.</p>
        <a href="checkout-success.html?order=${order.id}" class="btn btn-primary">Continue</a>
      </div>
    `;

    // Live confirmation via Socket.io - the admin's "Mark as Paid" click emits this.
    if (typeof io !== 'undefined') {
      const socket = io({ withCredentials: true });
      socket.on('connect', () => socket.emit('join:order', order.id));
      socket.on('order:update', (payload) => {
        if (payload.order_id === Number(order.id) && payload.status === 'preparing') {
          document.getElementById('waiting-indicator').style.display = 'none';
          document.getElementById('confirmed-box').classList.add('show');
        }
      });
    }

    // Fallback in case the socket misses it (e.g. tab was backgrounded) - check every
    // 15s whether the order has actually been confirmed in the meantime.
    const poll = setInterval(async () => {
      try {
        const { order: fresh } = await api(`/orders/${order.id}`);
        if (fresh.status !== 'pending_payment') {
          clearInterval(poll);
          window.location.href = `checkout-success.html?order=${order.id}`;
        }
      } catch (e) { /* ignore - will retry */ }
    }, 5000);
  }
})();
