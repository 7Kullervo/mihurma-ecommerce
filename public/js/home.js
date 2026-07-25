(async function () {
  const grid = document.getElementById('featured-grid');
  grid.innerHTML = flowerLoaderHTML('Gathering featured picks…');
  try {
    const { products } = await api('/products?featured=1&limit=8');
    if (!products.length) {
      // fall back to newest products if nothing is marked featured yet
      const fallback = await api('/products?limit=8');
      renderProducts(fallback.products);
    } else {
      renderProducts(products);
    }
  } catch (e) {
    grid.innerHTML = `<div class="empty-state"><h3>Couldn't load products</h3><p>${e.message}</p></div>`;
  }

  function renderProducts(products) {
    if (!products.length) {
      grid.innerHTML = `<div class="empty-state"><h3>No products yet</h3><p>Add your first product from the admin panel.</p></div>`;
      return;
    }
    grid.innerHTML = products.map(productCardHTML).join('');
    wireQuickBuyButtons(grid);
  }
})();
