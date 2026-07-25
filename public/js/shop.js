(async function () {
  const grid = document.getElementById('shop-grid');
  const params = new URLSearchParams(window.location.search);
  let page = parseInt(params.get('page')) || 1;

  const categoryListEl = document.getElementById('category-list');
  try {
    const { categories } = await api('/products/categories');
    categoryListEl.innerHTML = `<li><a href="shop.html" data-cat="">All Products</a></li>` +
      categories.map(c => `<li><a href="shop.html?category=${c.slug}" data-cat="${c.slug}">${c.name}</a></li>`).join('');
    const activeCat = params.get('category') || '';
    categoryListEl.querySelectorAll('a').forEach(a => {
      if (a.dataset.cat === activeCat) a.classList.add('active');
    });
  } catch (e) { /* categories are non-critical */ }

  const sortSelect = document.getElementById('sort-select');
  sortSelect.value = params.get('sort') || '';
  sortSelect.addEventListener('change', () => {
    const p = new URLSearchParams(window.location.search);
    if (sortSelect.value) p.set('sort', sortSelect.value); else p.delete('sort');
    p.delete('page');
    window.location.search = p.toString();
  });

  const title = document.getElementById('shop-title');
  if (params.get('search')) title.textContent = `Results for "${params.get('search')}"`;
  else if (params.get('category')) title.textContent = params.get('category').replace(/^\w/, c => c.toUpperCase());
  else if (params.get('featured')) title.textContent = 'Featured Products';

  grid.innerHTML = flowerLoaderHTML('Finding great products…');
  try {
    const qs = new URLSearchParams();
    ['category', 'search', 'sort', 'featured'].forEach(k => { if (params.get(k)) qs.set(k, params.get(k)); });
    qs.set('page', page);
    qs.set('limit', 12);
    const { products, total, limit } = await api('/products?' + qs.toString());

    if (!products.length) {
      grid.innerHTML = `<div class="empty-state"><h3>No products found</h3><p>Try a different category or search term.</p></div>`;
    } else {
      grid.innerHTML = products.map(productCardHTML).join('');
      wireQuickBuyButtons(grid);
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pager = document.getElementById('shop-pagination');
    if (totalPages > 1) {
      let html = '';
      for (let i = 1; i <= totalPages; i++) {
        const p = new URLSearchParams(window.location.search);
        p.set('page', i);
        html += `<a href="shop.html?${p.toString()}" class="btn ${i === page ? 'btn-primary' : 'btn-outline'} btn-sm">${i}</a>`;
      }
      pager.innerHTML = html;
    }
  } catch (e) {
    grid.innerHTML = `<div class="empty-state"><h3>Couldn't load products</h3><p>${e.message}</p></div>`;
  }
})();
