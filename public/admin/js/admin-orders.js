const STATUS_FLOW = [
  { key: 'preparing', label: 'Being Prepared' },
  { key: 'prepared', label: 'Prepared' },
  { key: 'on_the_way', label: 'On The Way' },
  { key: 'arriving_today', label: 'Might Be Delivered Today' },
  { key: 'delivered', label: 'Delivered' }
];
const CANCEL_STATUS = { key: 'cancelled', label: 'Cancel Order' };

let couriers = [];

(async function () {
  const user = await initAdminLayout('orders');
  if (!user) return;

  await loadCouriers();
  wireCourierForm();
  await loadOrders();
})();

async function loadCouriers() {
  try {
    const { couriers: list } = await api('/admin/couriers');
    couriers = list;
    renderCourierChips();
  } catch (e) { /* non-critical */ }
}

function renderCourierChips() {
  const el = document.getElementById('courier-chips');
  if (!couriers.length) {
    el.innerHTML = `<p style="color:var(--text-soft);font-size:.85rem;">No couriers added yet.</p>`;
    return;
  }
  el.innerHTML = couriers.map(c => `
    <span class="courier-chip">
      ${c.name}${c.phone ? ` · ${c.phone}` : ''}
      <button data-remove-courier="${c.id}" title="Remove courier">✕</button>
    </span>`).join('');
  el.querySelectorAll('[data-remove-courier]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this courier? Orders already assigned to them will show "Unassigned".')) return;
      try {
        await api(`/admin/couriers/${btn.dataset.removeCourier}`, { method: 'DELETE' });
        await loadCouriers();
        await loadOrders();
        toast('Courier removed.');
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

function wireCourierForm() {
  document.getElementById('add-courier-btn').addEventListener('click', async () => {
    const name = document.getElementById('courier-name').value.trim();
    const phone = document.getElementById('courier-phone').value.trim();
    if (!name) return toast('Please enter a courier name.', 'error');
    try {
      await api('/admin/couriers', { method: 'POST', body: { name, phone } });
      document.getElementById('courier-name').value = '';
      document.getElementById('courier-phone').value = '';
      await loadCouriers();
      toast('Courier added.');
    } catch (e) { toast(e.message, 'error'); }
  });
}

async function loadOrders() {
  const root = document.getElementById('orders-root');
  root.innerHTML = `<div class="skeleton" style="height:300px;"></div>`;
  try {
    const { orders } = await api('/admin/orders');
    if (!orders.length) {
      root.innerHTML = `<div class="empty-state"><h3>No orders yet</h3></div>`;
      return;
    }
    root.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Date</th><th>Courier</th><th>Status</th><th>Tracking #</th></tr></thead>
        <tbody>
          ${orders.map(orderRowHTML).join('')}
        </tbody>
      </table>`;
    wireOrderControls();
  } catch (e) {
    root.innerHTML = `<div class="empty-state"><h3>Couldn't load orders</h3><p>${e.message}</p></div>`;
  }
}

function orderRowHTML(o) {
  const isCancelled = o.status === 'cancelled';
  const isPendingPayment = o.status === 'pending_payment';
  return `<tr data-order-id="${o.id}">
    <td>#${o.id}</td>
    <td>${o.customer_name}<br><span style="color:var(--text-soft);font-size:.8rem;">${o.customer_email}</span></td>
    <td>$${Number(o.total).toFixed(2)}</td>
    <td>
      ${o.paid
        ? '✅ Paid'
        : `<button class="btn btn-primary btn-sm mark-paid-btn" data-order-id="${o.id}">Mark as Paid</button>`}
    </td>
    <td>${new Date(o.created_at).toLocaleDateString()}</td>
    <td>
      <select class="courier-select" data-order-id="${o.id}" ${isPendingPayment ? 'disabled title="Wait for payment confirmation first"' : ''}>
        <option value="">Unassigned</option>
        ${couriers.map(c => `<option value="${c.id}" ${o.courier_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
      </select>
    </td>
    <td>
      ${isPendingPayment ? `<span class="pill pending_payment">Awaiting payment</span>` : `
      <div class="status-btn-row" data-order-id="${o.id}">
        ${STATUS_FLOW.map(s => `<button class="status-btn ${o.status === s.key ? 'current' : ''}" data-status="${s.key}">${s.label}</button>`).join('')}
        <button class="status-btn cancel-btn ${isCancelled ? 'current' : ''}" data-status="${CANCEL_STATUS.key}">${isCancelled ? 'Cancelled' : CANCEL_STATUS.label}</button>
      </div>`}
    </td>
    <td>
      <div style="display:flex;gap:6px;">
        <input type="text" class="tracking-input" data-order-id="${o.id}" value="${o.tracking_number || ''}" placeholder="e.g. EP123456789PK" style="width:140px;padding:6px 8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:.8rem;">
        <button class="btn btn-outline btn-sm save-tracking-btn" data-order-id="${o.id}">Save</button>
      </div>
    </td>
  </tr>`;
}

function wireOrderControls() {
  document.querySelectorAll('.status-btn-row').forEach(row => {
    const orderId = row.dataset.orderId;
    row.querySelectorAll('.status-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (btn.classList.contains('current')) return;
        const status = btn.dataset.status;
        if (status === 'cancelled' && !confirm('Cancel this order? The customer will be notified.')) return;
        try {
          await api(`/admin/orders/${orderId}/status`, { method: 'PUT', body: { status } });
          toast(`Order #${orderId} updated.`);
          await loadOrders();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  });

  document.querySelectorAll('.courier-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      try {
        await api(`/admin/orders/${sel.dataset.orderId}/courier`, { method: 'PUT', body: { courier_id: sel.value || null } });
        toast('Courier assigned.');
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  document.querySelectorAll('.mark-paid-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Confirm you\'ve checked your JazzCash account and this payment has actually been received?')) return;
      btn.disabled = true;
      btn.textContent = 'Confirming…';
      try {
        await api(`/admin/orders/${btn.dataset.orderId}/mark-paid`, { method: 'PUT' });
        toast(`Order #${btn.dataset.orderId} marked as paid - customer notified.`);
        await loadOrders();
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Mark as Paid';
      }
    });
  });

  document.querySelectorAll('.save-tracking-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const input = document.querySelector(`.tracking-input[data-order-id="${btn.dataset.orderId}"]`);
      const tracking_number = input.value.trim();
      if (!tracking_number) return toast('Please enter a tracking number.', 'error');
      try {
        await api(`/admin/orders/${btn.dataset.orderId}/tracking`, { method: 'PUT', body: { tracking_number } });
        toast(`Tracking number saved - customer notified with the ep.gov.pk tracking link.`);
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}
