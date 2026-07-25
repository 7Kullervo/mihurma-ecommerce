function starString(avg) {
  const rounded = Math.round(avg || 0);
  let out = '';
  for (let i = 1; i <= 5; i++) out += i <= rounded ? '★' : '<span class="muted">★</span>';
  return out;
}

function money(n) {
  return '$' + Number(n).toFixed(2);
}

function productCardHTML(p) {
  const img = p.thumbnail || 'https://picsum.photos/seed/mihurma-placeholder/500/500';
  const onSale = p.compare_at_price && Number(p.compare_at_price) > Number(p.price);
  const lowStock = p.stock !== undefined && p.stock > 0 && p.stock <= 5;
  const outOfStock = p.stock !== undefined && p.stock <= 0;
  return `
  <div class="product-card">
    <a href="product.html?slug=${p.slug}" class="product-thumb">
      <img src="${img}" alt="${escapeHTML(p.title)}" loading="lazy">
      ${onSale ? '<span class="badge">Sale</span>' : ''}
      ${outOfStock ? '<span class="badge low">Sold out</span>' : (lowStock ? '<span class="badge low">Low stock</span>' : '')}
      <div class="product-buy-overlay">
        <button class="btn btn-primary quick-buy" data-slug="${p.slug}" ${outOfStock ? 'disabled' : ''}>${outOfStock ? 'Sold Out' : 'Buy'}</button>
      </div>
    </a>
    <div class="product-info">
      <a href="product.html?slug=${p.slug}" class="title">${escapeHTML(p.title)}</a>
      <div class="stars">${starString(p.rating_avg)} <span style="color:var(--text-soft);font-size:.8rem;">(${p.rating_count || 0})</span></div>
      <div class="price-row">
        <span class="price">${money(p.price)}</span>
        ${onSale ? `<span class="price-old">${money(p.compare_at_price)}</span>` : ''}
      </div>
    </div>
  </div>`;
}

function escapeHTML(str = '') {
  return str.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function wireQuickBuyButtons(root = document) {
  root.querySelectorAll('.quick-buy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = `product.html?slug=${btn.dataset.slug}&buy=1`;
    });
  });
}
