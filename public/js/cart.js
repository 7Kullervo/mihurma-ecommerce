(async function () {
  const root = document.getElementById('cart-root');
  const params = new URLSearchParams(window.location.search);
  const buyNowMode = params.get('mode') === 'buy-now';

  if (params.get('cancelled')) toast('Checkout was cancelled — your cart is untouched.', 'error');

  root.innerHTML = `<div class="skeleton" style="height:300px;"></div><div class="skeleton" style="height:220px;"></div>`;

  let items = [];
  let buyNowItem = null;

  try {
    // make sure they're logged in before showing a real cart
    await api('/auth/me');
  } catch (e) {
    root.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><h3>Please log in to view your cart</h3><p><a href="login.html?next=cart.html" class="btn btn-primary" style="margin-top:14px;">Log In</a></p></div>`;
    return;
  }

  if (buyNowMode) {
    const raw = sessionStorage.getItem('mihurma-buy-now');
    if (!raw) { window.location.href = 'cart.html'; return; }
    buyNowItem = JSON.parse(raw);
    document.getElementById('cart-page-title').textContent = 'Checkout';
    renderBuyNow();
  } else {
    try {
      const data = await api('/cart');
      items = data.items;
      renderCart();
    } catch (e) {
      root.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><h3>Couldn't load your cart</h3><p>${e.message}</p></div>`;
    }
  }

  function money(n) { return '$' + Number(n).toFixed(2); }

  function renderCart() {
    if (!items.length) {
      root.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
        <h3>Your cart is empty</h3>
        <p>Looks like you haven't added anything yet.</p>
        <a href="shop.html" class="btn btn-primary" style="margin-top:16px;">Continue Shopping</a>
      </div>`;
      return;
    }
    const subtotal = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
    root.innerHTML = `
      <div>
        ${items.map(itemLineHTML).join('')}
      </div>
      ${summaryHTML(subtotal, false)}
    `;
    wireLineControls();
    wireCheckoutForm(false, subtotal);
  }

  function renderBuyNow() {
    const subtotal = Number(buyNowItem.price) * buyNowItem.quantity;
    root.innerHTML = `
      <div>${itemLineHTML({
        id: 'buy-now', product_id: buyNowItem.product_id, title: buyNowItem.title,
        price: buyNowItem.price, quantity: buyNowItem.quantity, thumbnail: buyNowItem.thumbnail
      }, true)}</div>
      ${summaryHTML(subtotal, true)}
    `;
    wireCheckoutForm(true, subtotal);
    // quantity edits in buy-now mode just update sessionStorage
    document.getElementById('qm').addEventListener('click', () => adjustBuyNow(-1));
    document.getElementById('qp').addEventListener('click', () => adjustBuyNow(1));
  }

  function adjustBuyNow(delta) {
    buyNowItem.quantity = Math.max(1, buyNowItem.quantity + delta);
    sessionStorage.setItem('mihurma-buy-now', JSON.stringify(buyNowItem));
    renderBuyNow();
  }

  function itemLineHTML(item, readonly) {
    return `
    <div class="cart-line" data-id="${item.id}">
      <img src="${item.thumbnail || 'https://picsum.photos/seed/mihurma-placeholder/200/200'}" alt="${item.title}">
      <div>
        <div class="name">${item.title}</div>
        <div class="unit-price">${money(item.price)} each</div>
      </div>
      <div class="qty-stepper small">
        <button ${readonly ? 'id="qm"' : `class="line-minus" data-id="${item.id}"`}>−</button>
        <span>${item.quantity}</span>
        <button ${readonly ? 'id="qp"' : `class="line-plus" data-id="${item.id}"`}>+</button>
      </div>
      ${readonly ? '' : `<button class="remove-btn" data-id="${item.id}" title="Remove"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg></button>`}
    </div>`;
  }

  function summaryHTML(subtotal, buyNow) {
    return `
    <div class="summary-card">
      <h3 style="margin-bottom:20px;">Order Summary</h3>
      <div class="summary-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
      <div class="summary-row"><span>Shipping</span><span>${subtotal >= 75 ? 'Free' : money(6.99)}</span></div>
      <div class="summary-row total"><span>Total</span><span id="grand-total">${money(subtotal >= 75 ? subtotal : subtotal + 6.99)}</span></div>

      <div style="margin-top:22px;">
        <div class="field"><label>Full name</label><input id="ship-name" placeholder="Jane Doe"></div>
        <div class="field"><label>Shipping address</label><textarea id="ship-address" rows="2" placeholder="Street, city, postal code, country"></textarea></div>
        <div class="field"><label>Phone number</label><input id="ship-phone" placeholder="+1 555 000 0000"></div>
        <button id="checkout-btn" class="btn btn-primary btn-block">Proceed to Payment</button>
        <p class="field-hint" style="text-align:center;margin-top:10px;">🔒 Payments securely processed by Stripe.</p>
      </div>
    </div>`;
  }

  function wireLineControls() {
    root.querySelectorAll('.line-minus').forEach(b => b.addEventListener('click', () => changeQty(b.dataset.id, -1)));
    root.querySelectorAll('.line-plus').forEach(b => b.addEventListener('click', () => changeQty(b.dataset.id, 1)));
    root.querySelectorAll('.remove-btn').forEach(b => b.addEventListener('click', () => removeItem(b.dataset.id)));
  }

  async function changeQty(id, delta) {
    const item = items.find(i => String(i.id) === String(id));
    if (!item) return;
    const newQty = Math.max(0, item.quantity + delta);
    try {
      const data = await api(`/cart/${id}`, { method: 'PUT', body: { quantity: newQty } });
      items = data.items;
      renderCart();
      refreshCartBadge();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function removeItem(id) {
    try {
      const data = await api(`/cart/${id}`, { method: 'DELETE' });
      items = data.items;
      renderCart();
      refreshCartBadge();
      toast('Item removed from cart.');
    } catch (e) { toast(e.message, 'error'); }
  }

  function wireCheckoutForm(buyNow) {
    document.getElementById('checkout-btn').addEventListener('click', async () => {
      const shipping_name = document.getElementById('ship-name').value.trim();
      const shipping_address = document.getElementById('ship-address').value.trim();
      const shipping_phone = document.getElementById('ship-phone').value.trim();
      if (!shipping_name || !shipping_address || !shipping_phone) {
        return toast('Please fill in your name, address and phone number.', 'error');
      }
      const btn = document.getElementById('checkout-btn');
      btn.disabled = true;
      btn.textContent = 'Redirecting to payment…';
      try {
        const body = { shipping_name, shipping_address, shipping_phone };
        if (buyNow) body.buy_now = { product_id: buyNowItem.product_id, quantity: buyNowItem.quantity };
        const data = await api('/orders/checkout', { method: 'POST', body });
        if (buyNow) sessionStorage.removeItem('mihurma-buy-now');
        window.location.href = data.url;
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Proceed to Payment';
      }
    });
  }
})();
