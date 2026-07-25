// Injects the shared header/footer into every page, then fires 'partials:loaded'
// so layout.js (and page scripts) can safely wire up elements that live inside them.
async function loadPartial(selector, url) {
  const el = document.querySelector(selector);
  if (!el) return;
  const html = await fetch(url).then(r => r.text());
  el.innerHTML = html;
}

(async function () {
  await Promise.all([
    loadPartial('#site-header', 'partials/header.html'),
    loadPartial('#site-footer', 'partials/footer.html')
  ]);
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const current = document.body.dataset.page;
  if (current) {
    const link = document.querySelector(`.nav-links a[data-nav="${current}"]`);
    if (link) link.classList.add('active');
  }
  document.dispatchEvent(new CustomEvent('partials:loaded'));
})();
