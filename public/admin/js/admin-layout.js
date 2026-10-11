const HELP_TEXT = {
  dashboard: `<p><strong>This is your control center.</strong> It shows total sales, orders, products, and customers at a glance. Low-stock items are flagged so you know what to restock.</p>`,
  products: `<p><strong>Manage everything you sell here.</strong> Click a product to edit its price, stock, or photos. Click "Add Product" to create a new listing. Toggle "Featured" to show an item on the homepage.</p>`,
  'add-product': `<p><strong>Step 1:</strong> Fill in the title, price and description.<br><strong>Step 2:</strong> Click the upload box and choose photos straight from your device — no links needed.<br><strong>Step 3:</strong> Click a photo to mark it as the main thumbnail customers see first.<br><strong>Step 4:</strong> Click "Save Product" — it goes live immediately.</p>`,
  orders: `<p><strong>New orders wait for payment confirmation.</strong> Customers pay by scanning your JazzCash QR code - check your JazzCash account, and once you see the payment land, click "Mark as Paid" on that order. This notifies the customer and unlocks the status buttons.<br><br><strong>Tracking numbers:</strong> once you have a courier/postal tracking number for an order, type it into the "Tracking #" box and click Save - the customer is notified with the number and a link to track it at ep.gov.pk.<br><br><strong>Status buttons:</strong> click to move a paid order forward (e.g. Being Prepared → On The Way). Updates reach the customer's dashboard instantly.</p>`,
  users: `<p><strong>See everyone who has an account.</strong> You can promote a trusted customer to admin here if you ever need a second store manager.</p>`
};

async function initAdminLayout(page) {
  const sidebarHtml = await fetch('partials/sidebar.html').then(r => r.text());
  document.getElementById('admin-sidebar-slot').innerHTML = sidebarHtml;

  document.querySelectorAll('.admin-nav a[data-nav]').forEach(a => {
    if (a.dataset.nav === page) a.classList.add('active');
  });
  const helpBox = document.getElementById('sidebar-help');
  if (helpBox && HELP_TEXT[page]) {
    helpBox.innerHTML = `<h5>💡 How this page works</h5>${HELP_TEXT[page]}`;
  }

  // Admin auth guard - every admin page calls this before rendering data.
  try {
    const { user } = await api('/auth/me');
    if (user.role !== 'admin') {
      window.location.href = '../index.html';
      return null;
    }
    return user;
  } catch (e) {
    window.location.href = '../login.html?next=admin/index.html';
    return null;
  }
}
