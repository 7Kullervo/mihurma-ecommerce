(async function () {
  const user = await initAdminLayout('add-product');
  if (!user) return;

  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');
  const isEdit = !!productId;

  if (isEdit) {
    document.getElementById('page-title').textContent = 'Edit Product';
    document.getElementById('status-field').style.display = 'block';
  }

  // Load categories
  const categorySelect = document.getElementById('f-category');
  try {
    const { categories } = await api('/admin/categories');
    categorySelect.innerHTML += categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  } catch (e) { /* non-critical */ }

  // newFiles: locally-picked File objects not yet uploaded.
  // existingImages: images already saved on the server (edit mode only).
  let newFiles = [];
  let existingImages = [];
  let primaryIsExisting = null; // id of existing image marked primary, if any
  let primaryNewIndex = 0; // index within newFiles marked primary, used only if no existing image is primary

  if (isEdit) {
    try {
      const { product } = await api(`/admin/products/${productId}`);
      document.getElementById('f-title').value = product.title;
      document.getElementById('f-description').value = product.description || '';
      document.getElementById('f-price').value = product.price;
      document.getElementById('f-compare').value = product.compare_at_price || '';
      document.getElementById('f-stock').value = product.stock;
      document.getElementById('f-featured').checked = !!product.is_featured;
      document.getElementById('f-status').value = product.status;
      if (product.category_id) categorySelect.value = product.category_id;
      existingImages = product.images;
      const primary = existingImages.find(i => i.is_primary);
      primaryIsExisting = primary ? primary.id : (existingImages[0]?.id ?? null);
    } catch (e) {
      toast('Could not load this product.', 'error');
    }
  }

  const previewGrid = document.getElementById('preview-grid');
  const uploadZone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    addFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });

  function addFiles(fileList) {
    const total = existingImages.length + newFiles.length + fileList.length;
    if (total > 8) return toast('You can upload up to 8 photos per product.', 'error');
    Array.from(fileList).forEach(f => {
      if (!f.type.startsWith('image/')) return;
      newFiles.push(f);
    });
    renderPreviews();
  }

  function renderPreviews() {
    const existingHTML = existingImages.map(img => `
      <div class="image-preview ${primaryIsExisting === img.id ? 'primary' : ''}" data-existing-id="${img.id}">
        <img src="${img.image_path}">
        ${primaryIsExisting === img.id ? '<div class="primary-tag">Main Photo</div>' : ''}
        <div class="remove-x" data-remove-existing="${img.id}">✕</div>
      </div>`).join('');
    const newHTML = newFiles.map((f, i) => `
      <div class="image-preview ${primaryIsExisting === null && primaryNewIndex === i ? 'primary' : ''}" data-new-idx="${i}">
        <img src="${URL.createObjectURL(f)}">
        ${primaryIsExisting === null && primaryNewIndex === i ? '<div class="primary-tag">Main Photo</div>' : ''}
        <div class="remove-x" data-remove-new="${i}">✕</div>
      </div>`).join('');
    previewGrid.innerHTML = existingHTML + newHTML;
    if (!previewGrid.children.length) {
      previewGrid.innerHTML = `<p style="color:var(--text-soft);font-size:.85rem;">No photos added yet.</p>`;
    }

    previewGrid.querySelectorAll('[data-existing-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.remove-x')) return;
        primaryIsExisting = parseInt(el.dataset.existingId);
        renderPreviews();
        persistPrimaryChoice();
      });
    });
    previewGrid.querySelectorAll('[data-new-idx]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.remove-x')) return;
        primaryIsExisting = null;
        primaryNewIndex = parseInt(el.dataset.newIdx);
        renderPreviews();
      });
    });
    previewGrid.querySelectorAll('[data-remove-existing]').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(el.dataset.removeExisting);
        try {
          await api(`/admin/products/${productId}/images/${id}`, { method: 'DELETE' });
          existingImages = existingImages.filter(i => i.id !== id);
          if (primaryIsExisting === id) primaryIsExisting = existingImages[0]?.id ?? null;
          renderPreviews();
          toast('Photo removed.');
        } catch (err) { toast(err.message, 'error'); }
      });
    });
    previewGrid.querySelectorAll('[data-remove-new]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(el.dataset.removeNew);
        newFiles.splice(idx, 1);
        if (primaryNewIndex >= newFiles.length) primaryNewIndex = 0;
        renderPreviews();
      });
    });
  }
  renderPreviews();

  // Instantly persist a primary-image change on an existing photo (edit mode) so it's never lost.
  async function persistPrimaryChoice() {
    if (!isEdit || primaryIsExisting === null) return;
    const fd = new FormData();
    fd.append('primary_image_id', primaryIsExisting);
    appendCurrentFields(fd, false);
    try {
      await api(`/admin/products/${productId}`, { method: 'PUT', body: fd, isForm: true });
    } catch (e) { /* will also be sent on full save */ }
  }

  function appendCurrentFields(fd, includeFiles) {
    fd.append('title', document.getElementById('f-title').value.trim());
    fd.append('description', document.getElementById('f-description').value.trim());
    fd.append('price', document.getElementById('f-price').value);
    fd.append('compare_at_price', document.getElementById('f-compare').value);
    fd.append('stock', document.getElementById('f-stock').value);
    fd.append('category_id', categorySelect.value);
    fd.append('is_featured', document.getElementById('f-featured').checked ? '1' : '');
    if (isEdit) fd.append('status', document.getElementById('f-status').value);
    if (includeFiles) newFiles.forEach(f => fd.append('images', f));
  }

  document.getElementById('save-btn').addEventListener('click', async () => {
    const title = document.getElementById('f-title').value.trim();
    const price = document.getElementById('f-price').value;
    if (!title) return toast('Please enter a product title.', 'error');
    if (!price || Number(price) < 0) return toast('Please enter a valid price.', 'error');
    if (!isEdit && existingImages.length + newFiles.length === 0) {
      return toast('Please add at least one photo.', 'error');
    }

    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const fd = new FormData();
      appendCurrentFields(fd, true);
      if (!isEdit) {
        fd.append('primary_index', primaryIsExisting === null ? primaryNewIndex : 0);
      } else if (primaryIsExisting !== null) {
        fd.append('primary_image_id', primaryIsExisting);
      }

      if (isEdit) {
        await api(`/admin/products/${productId}`, { method: 'PUT', body: fd, isForm: true });
        toast('Product updated.');
      } else {
        await api('/admin/products', { method: 'POST', body: fd, isForm: true });
        toast('Product created.');
      }
      setTimeout(() => window.location.href = 'products.html', 700);
    } catch (e) {
      toast(e.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Save Product';
    }
  });
})();
