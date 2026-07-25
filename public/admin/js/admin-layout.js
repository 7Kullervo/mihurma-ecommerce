const HELP_TEXT = {
  dashboard: `<p><strong>This is your control center.</strong> It shows total sales, orders, products, and customers at a glance. Low-stock items are flagged so you know what to restock.</p>`,
  products: `<p><strong>Manage everything you sell here.</strong> Click a product to edit its price, stock, or photos. Click "Add Product" to create a new listing. Toggle "Featured" to show an item on the homepage.</p>`,
  'add-product': `<p><strong>Step 1:</strong> Fill in the title, price and description.<br><strong>Step 2:</strong> Click the upload box and choose photos straight from your device — no links needed.<br><strong>Step 3:</strong> Click a photo to mark it as the main thumbnail customers see first.<br><strong>Step 4:</strong> Click "Save Product" — it goes live immediately.</p>`,
  orders: `<p><strong>Track and update every order here.</strong> Use the status dropdown on each row to move an order forward (e.g. Processing → Shipped). The customer sees this update instantly on their dashboard — no refresh needed.</p>`,
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
