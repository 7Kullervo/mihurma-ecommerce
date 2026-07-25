// Shared across every page: theme persistence, mobile nav, auth-aware nav links,
// cart badge count, and a tiny toast system used by every page's JS.

(function initTheme() {
  const saved = localStorage.getItem('mihurma-theme');
  const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
})();

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('mihurma-theme', next);
}

function toast(message, type = 'success') {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3200);
}
window.toast = toast;

function flowerLoaderHTML(label) {
  return `<div class="flower-loader" role="status" aria-live="polite">
    <svg viewBox="0 0 64 64" fill="none">
      <g>
        ${[0,60,120,180,240,300].map(deg => `<ellipse class="petal" cx="32" cy="18" rx="7" ry="14" fill="var(--gold)" transform="rotate(${deg} 32 32)"></ellipse>`).join('')}
        <circle cx="32" cy="32" r="6" fill="var(--brown)"></circle>
      </g>
    </svg>
    ${label ? `<span style="color:var(--text-soft);font-size:.85rem;">${label}</span>` : ''}
  </div>`;
}
window.flowerLoaderHTML = flowerLoaderHTML;

async function refreshCartBadge() {
  const badge = document.getElementById('cart-count');
  if (!badge) return;
  try {
    const { items } = await api('/cart');
    const count = items.reduce((s, i) => s + i.quantity, 0);
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  } catch (e) {
    badge.style.display = 'none'; // guest or error - just hide the badge
  }
}
window.refreshCartBadge = refreshCartBadge;

async function updateNavForAuth() {
  const loginSlot = document.getElementById('nav-account-slot');
  if (!loginSlot) return;
  try {
    const { user } = await api('/auth/me');
    loginSlot.innerHTML = `<a href="dashboard.html" title="My account" class="icon-btn">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
    </a>`;
    if (user.role === 'admin') {
      const adminLink = document.createElement('a');
      adminLink.href = 'admin/index.html';
      adminLink.className = 'icon-btn';
      adminLink.title = 'Admin panel';
      adminLink.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2 3 6v6c0 5 4 8 9 10 5-2 9-5 9-10V6l-9-4Z"/></svg>`;
      loginSlot.appendChild(adminLink);
    }
    refreshCartBadge();
  } catch (e) {
    loginSlot.innerHTML = `<a href="login.html" class="icon-btn" title="Log in">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
    </a>`;
    const badge = document.getElementById('cart-count');
    if (badge) badge.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('page-enter');
});

document.addEventListener('partials:loaded', () => {
  const themeBtn = document.querySelector('.theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  const mobileToggle = document.querySelector('.mobile-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
  }

  const searchForm = document.getElementById('nav-search-form');
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = searchForm.querySelector('input').value.trim();
      window.location.href = `shop.html${q ? '?search=' + encodeURIComponent(q) : ''}`;
    });
  }

  updateNavForAuth();
});
