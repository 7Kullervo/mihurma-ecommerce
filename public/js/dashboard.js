const STATUS_STEPS = ['preparing', 'prepared', 'on_the_way', 'arriving_today', 'delivered'];
const STATUS_LABELS = {
  pending_payment: 'Payment Pending', preparing: 'Product Being Prepared', prepared: 'Product Prepared',
  on_the_way: 'Product On The Way', arriving_today: 'Product Might Be Delivered Today',
  delivered: 'Delivered', cancelled: 'Cancelled'
};

(async function () {
  let user;
  try {
    const data = await api('/auth/me');
    user = data.user;
  } catch (e) {
    window.location.href = 'login.html?next=dashboard.html';
    return;
  }

  document.getElementById('dash-name').textContent = user.name;
  document.getElementById('dash-email').textContent = user.email;
  document.getElementById('dash-avatar').textContent = user.name.charAt(0).toUpperCase();
  document.getElementById('profile-name').value = user.name || '';
  document.getElementById('profile-phone').value = user.phone || '';
  document.getElementById('profile-address').value = user.address || '';

  document.querySelectorAll('.dash-nav .tab[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dash-nav .tab[data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-orders').style.display = btn.dataset.tab === 'orders' ? 'block' : 'none';
      document.getElementById('tab-profile').style.display = btn.dataset.tab === 'profile' ? 'block' : 'none';
    });
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    window.location.href = 'index.html';
  });

  document.getElementById('save-profile').addEventListener('click', async () => {
    try {
      await api('/auth/me', { method: 'PUT', body: {
        name: document.getElementById('profile-name').value,
        phone: document.getElementById('profile-phone').value,
        address: document.getElementById('profile-address').value
      }});
      toast('Profile updated.');
    } catch (e) { toast(e.message, 'error'); }
  });

  // ---------- Orders ----------
  const ordersRoot = document.getElementById('orders-root');
  ordersRoot.innerHTML = flowerLoaderHTML('Loading your orders…');
  let orders = [];
  try {
    const data = await api('/orders/mine');
    orders = data.orders;
  } catch (e) {
    ordersRoot.innerHTML = `<div class="empty-state"><h3>Couldn't load orders</h3><p>${e.message}</p></div>`;
    return;
  }

  if (!orders.length) {
    ordersRoot.innerHTML = `<div class="empty-state"><h3>No orders yet</h3><p>When you place an order, you'll see live tracking here.</p><a href="shop.html" class="btn btn-primary" style="margin-top:14px;">Start Shopping</a></div>`;
    return;
  }

  ordersRoot.innerHTML = orders.map(orderCardSkeleton).join('');

  // Fetch full detail (items + history) for each order to render timelines/items
  for (const o of orders) {
    try {
      const { order, items, history } = await api(`/orders/${o.id}`);
      fillOrderCard(order, items, history);
    } catch (e) { /* skip */ }
  }

  // ---------- Real-time updates ----------
  if (typeof io !== 'undefined') {
    const socket = io({ withCredentials: true });
    socket.on('connect', () => {
      socket.emit('join:user');
      orders.forEach(o => socket.emit('join:order', o.id));
    });
    socket.on('order:update', ({ order_id, status, label }) => {
      updateOrderCardStatus(order_id, status, label);
      toast(`Order #${order_id} is now: ${label}`);
    });
    socket.on('order:paid', ({ order_id }) => {
      toast(`Payment confirmed for order #${order_id}.`);
    });
    socket.on('order:tracking', ({ order_id, tracking_number }) => {
      showTrackingNumber(order_id, tracking_number);
      toast(`Tracking number added to order #${order_id}.`);
    });
  } else {
    // No websockets (e.g. hosted on Vercel): poll every 8s for status changes.
    const seen = {};
    orders.forEach(o => { seen[o.id] = o.status; });
    setInterval(async () => {
      for (const o of orders) {
        try {
          const { order, items, history } = await api(`/orders/${o.id}`);
          if (order.status !== seen[o.id]) {
            seen[o.id] = order.status;
            fillOrderCard(order, items, history);
            updateOrderCardStatus(o.id, order.status, order.status_label || order.status);
            toast(`Order #${o.id} is now: ${order.status_label || order.status}`);
          }
        } catch (e) { /* retry next tick */ }
      }
    }, 8000);
  }

  function orderCardSkeleton(o) {
    return `<div class="order-card" id="order-${o.id}">
      <div class="top-row">
        <div>
          <strong>Order #${o.id}</strong>
          <span style="color:var(--text-soft);font-size:.85rem;margin-left:10px;">${new Date(o.created_at).toLocaleDateString()}</span>
        </div>
        <span class="status-pill ${pillClass(o.status)}" id="status-pill-${o.id}">${o.status_label}</span>
      </div>
      <div id="order-body-${o.id}"><div class="skeleton" style="height:60px;"></div></div>
    </div>`;
  }

  function pillClass(status) {
    if (status === 'delivered') return 'delivered';
    if (status === 'cancelled') return 'cancelled';
    if (status === 'pending_payment') return '';
    return 'live';
  }

  function fillOrderCard(order, items, history) {
    const body = document.getElementById(`order-body-${order.id}`);
    if (!body) return;
    const cancelled = order.status === 'cancelled';
    body.innerHTML = `
      <div class="order-items-mini">
        ${items.map(it => `<img src="${it.image_path || 'https://picsum.photos/seed/mihurma-placeholder/100/100'}" title="${it.title} × ${it.quantity}">`).join('')}
      </div>
      <div style="margin-top:10px;color:var(--text-soft);font-size:.88rem;">${items.length} item${items.length === 1 ? '' : 's'} · Total $${Number(order.total).toFixed(2)}</div>
      ${order.courier_name ? `<div style="margin-top:6px;color:var(--text-soft);font-size:.85rem;">🚴 Courier: <strong style="color:var(--text);">${order.courier_name}</strong>${order.courier_phone ? ` · ${order.courier_phone}` : ''}</div>` : ''}
      <div id="tracking-box-${order.id}">${trackingNumberHTML(order.tracking_number)}</div>
      ${cancelled ? '' : `<div class="track-timeline">
        ${STATUS_STEPS.map(step => `
          <div class="track-step ${STATUS_STEPS.indexOf(order.status) >= STATUS_STEPS.indexOf(step) ? 'done' : ''}" data-step="${step}">
            <div class="dot"></div><span>${STATUS_LABELS[step]}</span>
          </div>`).join('')}
      </div>`}
    `;
  }

  function trackingNumberHTML(trackingNumber) {
    if (!trackingNumber) return '';
    return `<div style="margin-top:6px;color:var(--text-soft);font-size:.85rem;">
      📦 Tracking #: <strong style="color:var(--text);">${trackingNumber}</strong>
      · <a href="https://ep.gov.pk/" target="_blank" rel="noopener" style="color:var(--gold-strong);font-weight:600;">Track at ep.gov.pk →</a>
    </div>`;
  }

  function showTrackingNumber(orderId, trackingNumber) {
    const box = document.getElementById(`tracking-box-${orderId}`);
    if (box) box.innerHTML = trackingNumberHTML(trackingNumber);
  }

  function updateOrderCardStatus(orderId, status, label) {
    const pill = document.getElementById(`status-pill-${orderId}`);
    if (pill) { pill.textContent = label; pill.className = `status-pill ${pillClass(status)}`; }
    const card = document.getElementById(`order-${orderId}`);
    if (!card) return;
    card.querySelectorAll('.track-step').forEach(step => {
      const idx = STATUS_STEPS.indexOf(step.dataset.step);
      step.classList.toggle('done', idx <= STATUS_STEPS.indexOf(status));
    });
  }
})();
