// =========================================================
// Specialties Management - CRUD + Drag & Drop Reordering
// =========================================================

// Protect route
window.requireAdmin();

// ---- State ----
let specialtiesList = [];     // [{id, name, desc, basePrice, icon, isActive, displayOrder}]
let dragSrcId = null;         // ID of item being dragged
let pendingDeleteId = null;   // ID waiting for delete confirmation
let editingIconUrl = '';      // Holds base64 or existing URL for current icon

// ---- DOM Refs ----
const listEl          = document.getElementById('specialties-list');
const countBadgeEl    = document.getElementById('specialties-count');
const statusEl        = document.getElementById('specialties-status');
const modal           = document.getElementById('specialty-modal');
const confirmModal    = document.getElementById('confirm-modal');

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  bindGlobalEvents();
  loadSpecialties();
});

// =========================================================
// Bind non-list UI events
// =========================================================
function bindGlobalEvents() {
  // Logout
  document.getElementById('logout-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    window.adminSignOut();
  });

  // Open Add modal
  document.getElementById('add-specialty-btn').addEventListener('click', () => openModal());

  // Close modal
  document.getElementById('close-modal-btn').addEventListener('click', closeModal);
  document.getElementById('cancel-modal-btn').addEventListener('click', closeModal);

  // Close on backdrop click
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) closeConfirmModal(); });

  // Icon preview
  document.getElementById('specialtyIconInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      editingIconUrl = ev.target.result;
      setIconPreview('modal-icon-preview', editingIconUrl);
    };
    reader.readAsDataURL(file);
  });

  // Form submit
  document.getElementById('specialtyForm').addEventListener('submit', handleFormSubmit);

  // Confirm Delete dialog
  document.getElementById('confirm-cancel-btn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirm-delete-btn').addEventListener('click', executeDelete);
}

// =========================================================
// Load Specialties
// =========================================================
async function loadSpecialties() {
  listEl.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon"><i class="fa-solid fa-spinner fa-spin" style="color: var(--primary-color);"></i></div>
      <h4>جاري تحميل التخصصات...</h4>
    </div>`;

  try {
    if (window.isFirebaseConfigured) {
      const snap = await db.collection('specialties').orderBy('displayOrder', 'asc').get();
      specialtiesList = [];
      snap.forEach(doc => specialtiesList.push({ id: doc.id, ...doc.data() }));
    } else {
      // Mock mode: load from localStorage
      specialtiesList = JSON.parse(localStorage.getItem('mock_specialties') || '[]');
      specialtiesList.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    }
    renderList();
  } catch (err) {
    console.error('loadSpecialties error:', err);
    showStatus('حدث خطأ أثناء تحميل التخصصات: ' + err.message, 'error');
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="fa-solid fa-triangle-exclamation" style="color: var(--danger);"></i></div>
        <h4>خطأ في التحميل</h4>
        <p>${err.message}</p>
      </div>`;
  }
}

// =========================================================
// Render List
// =========================================================
function renderList() {
  countBadgeEl.textContent = `${specialtiesList.length} تخصصات`;

  if (specialtiesList.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="fa-solid fa-briefcase-medical"></i></div>
        <h4>لا توجد تخصصات مضافة بعد</h4>
        <p style="font-size:0.9rem;">اضغط على "إضافة تخصص جديد" للبدء.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = specialtiesList.map(s => `
    <div class="specialty-item"
         draggable="true"
         data-id="${s.id}"
         id="spec-item-${s.id}">

      <!-- Drag Handle -->
      <div class="drag-handle" title="اسحب لإعادة الترتيب">
        <i class="fa-solid fa-grip-vertical"></i>
      </div>

      <!-- Icon -->
      <div class="specialty-icon-preview" id="icon-${s.id}">
          ${s.icon && window.isValidImageUrl(s.icon)
            ? `<img src="${s.icon}" alt="${window.escHtml(s.name)}">`
          : `<i class="fa-solid fa-briefcase-medical"></i>`}
      </div>

      <!-- Details -->
      <div class="specialty-info">
        <div class="specialty-name">${escapeHtml(s.name)}</div>
        ${s.description ? `<div class="specialty-desc">${escapeHtml(s.description)}</div>` : ''}
      </div>

      <!-- Price -->
      <div class="specialty-price">${s.basePrice ? s.basePrice + ' ج.م' : '--'}</div>

      <!-- Status Toggle -->
      <label class="toggle-switch" title="${s.isActive ? 'نشط' : 'غير نشط'}">
        <input type="checkbox" class="toggle-active" data-id="${s.id}" ${s.isActive !== false ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>

      <!-- Actions -->
      <div class="specialty-actions">
        <button class="icon-btn edit-btn" data-id="${s.id}" title="تعديل">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="icon-btn danger delete-btn" data-id="${s.id}" title="حذف">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');

  // Bind list-level events
  listEl.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.id)));
  listEl.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => openConfirmDelete(btn.dataset.id)));
  listEl.querySelectorAll('.toggle-active').forEach(cb => cb.addEventListener('change', (e) => toggleActive(e.target.dataset.id, e.target.checked)));

  // Drag-and-drop
  listEl.querySelectorAll('.specialty-item').forEach(item => {
    item.addEventListener('dragstart', onDragStart);
    item.addEventListener('dragover', onDragOver);
    item.addEventListener('dragleave', onDragLeave);
    item.addEventListener('drop', onDrop);
    item.addEventListener('dragend', onDragEnd);
  });
}

// =========================================================
// Modal: Open / Close
// =========================================================
function openModal(id = null) {
  const form = document.getElementById('specialtyForm');
  form.reset();
  editingIconUrl = '';
  setIconPreview('modal-icon-preview', null);

  if (id) {
    const s = specialtiesList.find(x => x.id === id);
    if (!s) return;
    document.getElementById('modal-title').textContent = 'تعديل التخصص';
    document.getElementById('specialtyIdInput').value = s.id;
    document.getElementById('specialtyNameInput').value = s.name || '';
    document.getElementById('specialtyDescInput').value = s.description || '';
    document.getElementById('specialtyPriceInput').value = s.basePrice || '';
    document.getElementById('specialtyActiveInput').checked = s.isActive !== false;
    editingIconUrl = s.icon || '';
    setIconPreview('modal-icon-preview', s.icon || null);
  } else {
    document.getElementById('modal-title').textContent = 'إضافة تخصص جديد';
    document.getElementById('specialtyIdInput').value = '';
    document.getElementById('specialtyActiveInput').checked = true;
  }

  modal.style.display = 'flex';
}

function closeModal() {
  modal.style.display = 'none';
}

// =========================================================
// Modal: Save (Add / Edit)
// =========================================================
async function handleFormSubmit(e) {
  e.preventDefault();

  const id     = document.getElementById('specialtyIdInput').value.trim();
  const name   = document.getElementById('specialtyNameInput').value.trim();
  const desc   = document.getElementById('specialtyDescInput').value.trim();
  const price  = parseFloat(document.getElementById('specialtyPriceInput').value) || 0;
  const active = document.getElementById('specialtyActiveInput').checked;
  const file   = document.getElementById('specialtyIconInput').files[0];

  if (!name) { showStatus('يرجى إدخال اسم التخصص.', 'error'); return; }

  const saveBtn = document.getElementById('save-modal-btn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';

  try {
    let iconUrl = editingIconUrl;

    // Upload new icon if selected
    if (file) {
      if (window.isFirebaseConfigured) {
        showStatus('جاري رفع الأيقونة...', 'info');
        const ref = window.storage.ref().child(`specialties/${Date.now()}_${file.name}`);
        const snap = await ref.put(file);
        iconUrl = await snap.ref.getDownloadURL();
      }
      // In mock mode, editingIconUrl is already the base64 data URI from FileReader
    }

    if (id) {
      // --- UPDATE ---
      await saveSpecialty(id, { name, description: desc, basePrice: price, isActive: active, icon: iconUrl || '' });
      showStatus('✔ تم تحديث التخصص بنجاح.', 'success');
    } else {
      // --- CREATE ---
      const maxOrder = specialtiesList.reduce((m, s) => Math.max(m, s.displayOrder || 0), 0);
      const newData  = { name, description: desc, basePrice: price, isActive: active, icon: iconUrl || '', displayOrder: maxOrder + 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

      if (window.isFirebaseConfigured) {
        const docRef = await db.collection('specialties').add(newData);
        specialtiesList.push({ id: docRef.id, ...newData });
      } else {
        const newId = 'mock-spec-' + Date.now();
        specialtiesList.push({ id: newId, ...newData });
        saveMockList();
      }
      showStatus('✔ تمت إضافة التخصص بنجاح.', 'success');
    }

    closeModal();
    renderList();
  } catch (err) {
    console.error('handleFormSubmit error:', err);
    showStatus('حدث خطأ: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ التخصص';
  }
}

// =========================================================
// Save Specialty helper (edit path)
// =========================================================
async function saveSpecialty(id, fields) {
  const updatedFields = { ...fields, updatedAt: new Date().toISOString() };

  if (window.isFirebaseConfigured) {
    await db.collection('specialties').doc(id).update(updatedFields);
  }

  // Update local state
  const idx = specialtiesList.findIndex(s => s.id === id);
  if (idx !== -1) specialtiesList[idx] = { ...specialtiesList[idx], ...updatedFields };

  if (!window.isFirebaseConfigured) saveMockList();
}

// =========================================================
// Toggle Active / Inactive
// =========================================================
async function toggleActive(id, active) {
  try {
    await saveSpecialty(id, { isActive: active });
    const item = specialtiesList.find(s => s.id === id);
    const badge = document.getElementById(`spec-item-${id}`) ?.querySelector('.toggle-switch');
    if (badge) badge.title = active ? 'نشط' : 'غير نشط';
    showStatus(active ? '✔ تم تفعيل التخصص.' : '✔ تم تعطيل التخصص.', 'success');
  } catch (err) {
    showStatus('فشل تغيير الحالة: ' + err.message, 'error');
  }
}

// =========================================================
// Delete: Open Confirm → Execute
// =========================================================
function openConfirmDelete(id) {
  const s = specialtiesList.find(x => x.id === id);
  if (!s) return;
  pendingDeleteId = id;
  document.getElementById('confirm-delete-message').textContent =
    `هل أنت متأكد من حذف تخصص "${s.name}"؟ لا يمكن التراجع عن هذا الإجراء.`;
  confirmModal.style.display = 'flex';
}

function closeConfirmModal() {
  confirmModal.style.display = 'none';
  pendingDeleteId = null;
}

async function executeDelete() {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  closeConfirmModal();

  try {
    if (window.isFirebaseConfigured) {
      await db.collection('specialties').doc(id).delete();
    }
    specialtiesList = specialtiesList.filter(s => s.id !== id);
    if (!window.isFirebaseConfigured) saveMockList();
    renderList();
    showStatus('✔ تم حذف التخصص بنجاح.', 'success');
  } catch (err) {
    showStatus('فشل الحذف: ' + err.message, 'error');
  }
}

// =========================================================
// Drag-and-Drop Reorder
// =========================================================
function onDragStart(e) {
  dragSrcId = this.dataset.id;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrcId);
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (this.dataset.id !== dragSrcId) this.classList.add('drag-over');
  return false;
}

function onDragLeave() {
  this.classList.remove('drag-over');
}

async function onDrop(e) {
  e.stopPropagation();
  const targetId = this.dataset.id;
  this.classList.remove('drag-over');

  if (dragSrcId && targetId && dragSrcId !== targetId) {
    const srcIdx = specialtiesList.findIndex(s => s.id === dragSrcId);
    const tgtIdx = specialtiesList.findIndex(s => s.id === targetId);

    if (srcIdx !== -1 && tgtIdx !== -1) {
      // Reorder array
      const [moved] = specialtiesList.splice(srcIdx, 1);
      specialtiesList.splice(tgtIdx, 0, moved);

      // Reassign displayOrder values
      specialtiesList.forEach((s, i) => { s.displayOrder = i + 1; });

      // Persist to DB
      await persistOrder();
      renderList();
    }
  }
  return false;
}

function onDragEnd() {
  this.classList.remove('dragging');
  listEl.querySelectorAll('.specialty-item').forEach(el => el.classList.remove('drag-over'));
  dragSrcId = null;
}

async function persistOrder() {
  try {
    if (window.isFirebaseConfigured) {
      const batch = db.batch();
      specialtiesList.forEach(s => {
        batch.update(db.collection('specialties').doc(s.id), { displayOrder: s.displayOrder });
      });
      await batch.commit();
    } else {
      saveMockList();
    }
    showStatus('✔ تم حفظ الترتيب الجديد.', 'success');
  } catch (err) {
    showStatus('فشل حفظ الترتيب: ' + err.message, 'error');
  }
}

// =========================================================
// Helpers
// =========================================================
function setIconPreview(containerId, url) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (url) {
    if (!window.isValidImageUrl(url)) {
      el.innerHTML = '<span style="color:var(--danger);">رابط غير صالح</span>';
      return;
    }
    el.innerHTML = `<img src="${url}" alt="icon">`;
  } else {
    el.innerHTML = `<i class="fa-solid fa-briefcase-medical"></i>`;
  }
}

function showStatus(msg, type = 'info') {
  statusEl.textContent = msg;
  statusEl.className = `status-bar ${type}`;
  statusEl.style.display = 'block';
  setTimeout(() => { statusEl.style.display = 'none'; }, 4500);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function saveMockList() {
  localStorage.setItem('mock_specialties', JSON.stringify(specialtiesList));
}
