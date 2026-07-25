(async function () {
  const root = document.getElementById('pdp-root');
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  root.innerHTML = flowerLoaderHTML('Loading product…');

  if (!slug) {
    root.innerHTML = `<div class="empty-state"><h3>Product not found</h3></div>`;
    return;
  }

  let product, qty = 1;
  try {
    const data = await api(`/products/${slug}`);
    product = data.product;
  } catch (e) {
    root.innerHTML = `<div class="empty-state"><h3>We couldn't find that product</h3><p><a href="shop.html">Back to shop</a></p></div>`;
    return;
  }

  document.title = `${product.title} — Mihurma`;
  const images = product.images.length ? product.images : [{ image_path: 'https://picsum.photos/seed/mihurma-placeholder/700/700' }];

  root.innerHTML = `
    <div>
      <div class="gallery-main"><img id="gallery-main-img" src="${images[0].image_path}" alt="${escapeHTML(product.title)}"></div>
      <div class="gallery-thumbs">
        ${images.map((img, i) => `<img src="${img.image_path}" data-idx="${i}" class="${i === 0 ? 'active' : ''}" alt="View ${i + 1}">`).join('')}
      </div>
    </div>
    <div>
      <h1 class="pdp-title">${escapeHTML(product.title)}</h1>
      <div class="pdp-stars">
        <span class="stars" style="font-size:1.1rem;">${starString(product.rating_avg)}</span>
        <span style="color:var(--text-soft);font-size:.9rem;">${product.rating_count} review${product.rating_count === 1 ? '' : 's'}</span>
      </div>
      <div class="pdp-price-row">
        <span class="pdp-price">${money(product.price)}</span>
        ${product.compare_at_price && Number(product.compare_at_price) > Number(product.price) ? `<span class="price-old" style="font-size:1.1rem;">${money(product.compare_at_price)}</span>` : ''}
      </div>
      <p class="pdp-desc">${escapeHTML(product.description || 'No description provided yet.').replace(/\n/g, '<br>')}</p>

      <div class="qty-row">
        <div class="qty-stepper">
          <button id="qty-minus" aria-label="Decrease quantity">−</button>
          <span id="qty-value">1</span>
          <button id="qty-plus" aria-label="Increase quantity">+</button>
        </div>
        <span class="stock-note ${product.stock <= 5 ? 'low' : ''}">
          ${product.stock <= 0 ? 'Out of stock' : product.stock <= 5 ? `Only ${product.stock} left!` : `${product.stock} in stock`}
        </span>
      </div>

      <div class="pdp-actions">
        <button id="add-to-cart" class="btn btn-outline" ${product.stock <= 0 ? 'disabled' : ''}>Add to Cart</button>
        <button id="buy-now" class="btn btn-primary" ${product.stock <= 0 ? 'disabled' : ''}>Buy Now</button>
      </div>

      <div class="pdp-meta">
        <span>📦 Free shipping over $75</span>
        <span>↩ 30-day returns</span>
        <span>🔒 Secure checkout</span>
      </div>
    </div>
  `;

  // Gallery thumbnail switching
  root.querySelectorAll('.gallery-thumbs img').forEach(thumb => {
    thumb.addEventListener('click', () => {
      document.getElementById('gallery-main-img').src = thumb.src;
      root.querySelectorAll('.gallery-thumbs img').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });

  // Quantity stepper
  const qtyValueEl = document.getElementById('qty-value');
  document.getElementById('qty-minus').addEventListener('click', () => {
    qty = Math.max(1, qty - 1);
    qtyValueEl.textContent = qty;
  });
  document.getElementById('qty-plus').addEventListener('click', () => {
    qty = Math.min(product.stock || 1, qty + 1);
    qtyValueEl.textContent = qty;
  });

  document.getElementById('add-to-cart').addEventListener('click', async () => {
    try {
      await api('/cart', { method: 'POST', body: { product_id: product.id, quantity: qty } });
      toast('Added to your cart.');
      refreshCartBadge();
    } catch (e) {
      if (e.status === 401) { toast('Please log in to add items to your cart.', 'error'); window.location.href = `login.html?next=product.html?slug=${slug}`; }
      else toast(e.message, 'error');
    }
  });

  document.getElementById('buy-now').addEventListener('click', () => {
    sessionStorage.setItem('mihurma-buy-now', JSON.stringify({ product_id: product.id, quantity: qty, title: product.title, price: product.price, thumbnail: images[0].image_path }));
    window.location.href = 'cart.html?mode=buy-now';
  });

  if (params.get('buy') === '1') {
    document.getElementById('buy-now').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------- Reviews ----------
  const summaryEl = document.getElementById('review-summary');
  summaryEl.innerHTML = `
    <div class="review-big-score">${Number(product.rating_avg || 0).toFixed(1)}</div>
    <div>
      <div class="stars" style="font-size:1.3rem;">${starString(product.rating_avg)}</div>
      <div style="color:var(--text-soft);font-size:.9rem;">Based on ${product.rating_count} review${product.rating_count === 1 ? '' : 's'}</div>
    </div>`;

  const listEl = document.getElementById('reviews-list');
  listEl.innerHTML = product.reviews.length
    ? product.reviews.map(r => `
      <div class="review-card">
        <div class="head">
          <span class="name">${escapeHTML(r.user_name)}</span>
          <span class="date">${new Date(r.created_at).toLocaleDateString()}</span>
        </div>
        <div class="stars">${starString(r.rating)}</div>
        ${r.comment ? `<p style="margin-top:8px;color:var(--text-soft);">${escapeHTML(r.comment)}</p>` : ''}
      </div>`).join('')
    : `<p style="color:var(--text-soft);">No reviews yet — be the first to share your thoughts.</p>`;

  const formSlot = document.getElementById('review-form-slot');
  try {
    const me = await api('/auth/me');
    const eligibility = await api(`/reviews/eligibility/${product.id}`);
    if (eligibility.can_review) {
      formSlot.innerHTML = `
        <div class="form-card" style="margin-bottom:30px;max-width:520px;">
          <h4 style="margin-bottom:14px;">Write a review</h4>
          <div class="star-picker" id="star-picker">
            ${[1,2,3,4,5].map(n => `<span data-star="${n}">★</span>`).join('')}
          </div>
          <div class="field">
            <textarea id="review-comment" rows="3" placeholder="Tell others what you thought…"></textarea>
          </div>
          <button id="submit-review" class="btn btn-primary btn-sm">Submit Review</button>
        </div>`;
      let rating = 0;
      const stars = formSlot.querySelectorAll('.star-picker span');
      stars.forEach(s => s.addEventListener('click', () => {
        rating = parseInt(s.dataset.star);
        stars.forEach(st => st.classList.toggle('filled', parseInt(st.dataset.star) <= rating));
      }));
      document.getElementById('submit-review').addEventListener('click', async () => {
        if (!rating) return toast('Please select a star rating.', 'error');
        try {
          await api('/reviews', { method: 'POST', body: {
            product_id: product.id, order_id: eligibility.order_id, rating,
            comment: document.getElementById('review-comment').value
          }});
          toast('Thanks for your review!');
          setTimeout(() => window.location.reload(), 700);
        } catch (e) { toast(e.message, 'error'); }
      });
    }
  } catch (e) { /* not logged in - no review form shown */ }

  // ---------- Related products ----------
  const relatedGrid = document.getElementById('related-grid');
  if (product.related && product.related.length) {
    relatedGrid.innerHTML = product.related.map(productCardHTML).join('');
    wireQuickBuyButtons(relatedGrid);
  } else {
    document.querySelector('.related-section').style.display = 'none';
  }
})();
