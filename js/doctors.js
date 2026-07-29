// =========================================================
// Doctors Management - CRUD + Slot Generation
// =========================================================

window.requireAdmin();

// ---- Constants ----
const DAYS_AR = [
  { en: 'Saturday',  ar: 'السبت'    },
  { en: 'Sunday',    ar: 'الأحد'    },
  { en: 'Monday',    ar: 'الإثنين'  },
  { en: 'Tuesday',   ar: 'الثلاثاء' },
  { en: 'Wednesday', ar: 'الأربعاء' },
  { en: 'Thursday',  ar: 'الخميس'  },
  { en: 'Friday',    ar: 'الجمعة'   },
];

// ---- State ----
let doctorsList     = [];
let specialtiesList = [];
let pendingDeleteId = null;
let editingPhotoUrl = '';

// ---- DOM Refs ----
const gridEl      = document.getElementById('doctors-grid');
const statusEl    = document.getElementById('doctors-status');
const modal       = document.getElementById('doctor-modal');
const confirmModal= document.getElementById('confirm-modal');

// =========================================================
// Init
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
  buildDaysGrid();
  bindGlobalEvents();
  Promise.all([loadSpecialties(), loadDoctors()]);
});

// =========================================================
// Build Days-Off checkboxes
// =========================================================
function buildDaysGrid() {
  const grid = document.getElementById('days-off-grid');
  grid.innerHTML = DAYS_AR.map(d => `
    <label class="day-checkbox-label">
      <input type="checkbox" class="day-off-cb" value="${d.en}">
      ${d.ar}
    </label>
  `).join('');
}

// =========================================================
// Bind Global Events
// =========================================================
function bindGlobalEvents() {
  // Logout
  document.getElementById('logout-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    window.adminSignOut();
  });

  // Open Add modal
  document.getElementById('add-doctor-btn').addEventListener('click', () => openModal());

  // Close modals
  document.getElementById('close-modal-btn').addEventListener('click', closeModal);
  document.getElementById('cancel-modal-btn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) closeConfirmModal(); });
  document.getElementById('confirm-cancel-btn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirm-delete-btn').addEventListener('click', executeDelete);

  // Photo preview
  document.getElementById('doctorPhotoInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      editingPhotoUrl = ev.target.result;
      setPhotoPreview(editingPhotoUrl);
    };
    reader.readAsDataURL(file);
  });

  // Add qualification row
  document.getElementById('add-qual-btn').addEventListener('click', addQualificationRow);

  // Form submit
  document.getElementById('doctorForm').addEventListener('submit', handleFormSubmit);
}

// =========================================================
// Load Specialties (for select dropdown)
// =========================================================
async function loadSpecialties() {
  try {
    if (window.isFirebaseConfigured) {
      const snap = await db.collection('specialties').where('isActive', '==', true).get();
      specialtiesList = [];
      snap.forEach(doc => specialtiesList.push({ id: doc.id, ...doc.data() }));
    } else {
      specialtiesList = JSON.parse(localStorage.getItem('mock_specialties') || '[]').filter(s => s.isActive !== false);
    }
    populateSpecialtyDropdown();
  } catch (err) {
    console.error('loadSpecialties error:', err);
  }
}

function populateSpecialtyDropdown() {
  const sel = document.getElementById('doctorSpecialtyInput');
  // Keep placeholder
  sel.innerHTML = '<option value="">-- اختر التخصص --</option>' +
    specialtiesList.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
}

// =========================================================
// Load Doctors
// =========================================================
async function loadDoctors() {
  gridEl.innerHTML = `
    <div class="empty-state" style="grid-column:1/-1;">
      <div class="empty-icon"><i class="fa-solid fa-spinner fa-spin" style="color:var(--primary-color);"></i></div>
      <h4>جاري تحميل الأطباء...</h4>
    </div>`;

  try {
    if (window.isFirebaseConfigured) {
      const snap = await db.collection('doctors').get();
      doctorsList = [];
      snap.forEach(doc => doctorsList.push({ id: doc.id, ...doc.data() }));
    } else {
      doctorsList = JSON.parse(localStorage.getItem('mock_doctors') || '[]');
    }
    renderDoctors();
  } catch (err) {
    console.error('loadDoctors error:', err);
    showStatus('حدث خطأ أثناء تحميل الأطباء: ' + err.message, 'error');
    gridEl.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-icon"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger);"></i></div>
        <h4>خطأ في التحميل</h4><p>${err.message}</p>
      </div>`;
  }
}

// =========================================================
// Render Doctors Grid
// =========================================================
function renderDoctors() {
  if (doctorsList.length === 0) {
    gridEl.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-icon"><i class="fa-solid fa-user-doctor"></i></div>
        <h4>لا يوجد أطباء مضافون بعد</h4>
        <p style="font-size:.9rem;">اضغط "إضافة طبيب جديد" للبدء.</p>
      </div>`;
    return;
  }

  gridEl.innerHTML = doctorsList.map(d => {
    const specName = (specialtiesList.find(s => s.id === d.specialtyId) || {}).name || d.specialtyId || '';
    const quals = (d.qualifications || []).slice(0, 3);
    const daysOff = (d.daysOff || []).map(day => DAYS_AR.find(x => x.en === day)?.ar || day);

    return `
    <div class="doctor-card" id="doc-card-${d.id}">
      ${d.isActive === false ? '<div class="inactive-overlay"><i class="fa-solid fa-ban" style="margin-left:.4rem;"></i> غير نشط</div>' : ''}

      <div class="doctor-card-header">
        <div class="doctor-avatar">
          ${d.photo && window.isValidImageUrl(d.photo) ? `<img src="${d.photo}" alt="${window.escHtml(d.name)}">` : `<i class="fa-solid fa-user-doctor"></i>`}
        </div>
        <div>
          <div class="doctor-name">${escapeHtml(d.name)}</div>
          <div class="doctor-specialty">${escapeHtml(specName)}</div>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        ${d.phone ? `<div class="doctor-info-row"><i class="fa-solid fa-phone"></i>${escapeHtml(d.phone)}</div>` : ''}
        ${d.email ? `<div class="doctor-info-row"><i class="fa-solid fa-envelope"></i>${escapeHtml(d.email)}</div>` : ''}
        <div class="doctor-info-row"><i class="fa-solid fa-clock"></i>${d.workingHoursStart || '09:00'} – ${d.workingHoursEnd || '17:00'}</div>
        <div class="doctor-info-row"><i class="fa-solid fa-calendar-day"></i>مدة الموعد: ${d.appointmentDuration || 30} دقيقة</div>
        <div class="doctor-info-row"><i class="fa-solid fa-calendar-xmark"></i>إجازة: ${daysOff.length ? daysOff.join('، ') : 'لا توجد'}</div>
      </div>

      ${quals.length ? `
        <div class="doctor-tags">
          ${quals.map(q => `<span class="tag">${escapeHtml(q)}</span>`).join('')}
          ${d.qualifications.length > 3 ? `<span class="tag">+${d.qualifications.length - 3}</span>` : ''}
        </div>` : ''}

      <div class="doctor-card-actions">
        <button class="btn btn-secondary flex-1 edit-btn" data-id="${d.id}" style="font-size:.85rem;padding:.5rem;">
          <i class="fa-solid fa-pen"></i> تعديل
        </button>
        <button class="icon-btn danger delete-btn" data-id="${d.id}" title="حذف">
          <i class="fa-solid fa-trash"></i>
        </button>
        <button class="icon-btn toggle-btn" data-id="${d.id}" title="${d.isActive === false ? 'تفعيل' : 'تعطيل'}">
          <i class="fa-solid ${d.isActive === false ? 'fa-eye' : 'fa-eye-slash'}"></i>
        </button>
      </div>
    </div>`;
  }).join('');

  // Bind events
  gridEl.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.id)));
  gridEl.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => openConfirmDelete(btn.dataset.id)));
  gridEl.querySelectorAll('.toggle-btn').forEach(btn => btn.addEventListener('click', () => toggleActive(btn.dataset.id)));
}

// =========================================================
// Modal: Open / Close
// =========================================================
function openModal(id = null) {
  const form = document.getElementById('doctorForm');
  form.reset();
  editingPhotoUrl = '';
  setPhotoPreview(null);
  clearQualifications();
  buildDaysGrid(); // reset checkboxes

  if (id) {
    const d = doctorsList.find(x => x.id === id);
    if (!d) return;
    document.getElementById('modal-title').textContent = 'تعديل بيانات الطبيب';
    document.getElementById('doctorIdInput').value     = d.id;
    document.getElementById('doctorNameInput').value   = d.name || '';
    document.getElementById('doctorPhoneInput').value  = d.phone || '';
    document.getElementById('doctorEmailInput').value  = d.email || '';
    document.getElementById('doctorBioInput').value    = d.bio || '';
    document.getElementById('hoursStartInput').value   = d.workingHoursStart || '09:00';
    document.getElementById('hoursEndInput').value     = d.workingHoursEnd   || '17:00';
    document.getElementById('apptDurationInput').value = d.appointmentDuration || 30;
    document.getElementById('maxApptInput').value      = d.maxAppointmentsPerDay || 10;
    document.getElementById('doctorActiveInput').checked = d.isActive !== false;

    // Specialty
    document.getElementById('doctorSpecialtyInput').value = d.specialtyId || '';

    // Photo
    editingPhotoUrl = d.photo || '';
    setPhotoPreview(d.photo || null);

    // Qualifications
    (d.qualifications || []).forEach(q => addQualificationRow(q));

    // Days off
    (d.daysOff || []).forEach(day => {
      const cb = document.querySelector(`#days-off-grid input[value="${day}"]`);
      if (cb) cb.checked = true;
    });
  } else {
    document.getElementById('modal-title').textContent = 'إضافة طبيب جديد';
    document.getElementById('doctorIdInput').value = '';
    document.getElementById('doctorActiveInput').checked = true;
    addQualificationRow(); // start with one row
  }

  modal.style.display = 'flex';
}

function closeModal() {
  modal.style.display = 'none';
}

// =========================================================
// Qualification rows
// =========================================================
function addQualificationRow(value = '') {
  const container = document.getElementById('qualifications-list');
  const row = document.createElement('div');
  row.className = 'qual-item';
  row.innerHTML = `
    <input type="text" class="form-input qual-input" placeholder="مثال: ماجستير طب الأسنان - جامعة القاهرة" value="${escapeHtml(value)}">
    <button type="button" class="icon-btn danger remove-qual-btn" title="حذف">
      <i class="fa-solid fa-xmark"></i>
    </button>`;
  row.querySelector('.remove-qual-btn').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function clearQualifications() {
  document.getElementById('qualifications-list').innerHTML = '';
}

function getQualifications() {
  return [...document.querySelectorAll('.qual-input')]
    .map(i => i.value.trim())
    .filter(Boolean);
}

// =========================================================
// Photo preview helper
// =========================================================
function setPhotoPreview(url) {
  const el = document.getElementById('photo-preview');
  if (url) {
    if (!window.isValidImageUrl(url)) {
      el.innerHTML = '<span style="color:var(--danger);">رابط غير صالح</span>';
      return;
    }
    el.innerHTML = `<img src="${url}" alt="photo">`;
  } else {
    el.innerHTML = `<i class="fa-solid fa-user-doctor"></i>`;
  }
}

// =========================================================
// Handle Form Submit
// =========================================================
async function handleFormSubmit(e) {
  e.preventDefault();

  const id     = document.getElementById('doctorIdInput').value.trim();
  const name   = document.getElementById('doctorNameInput').value.trim();
  const specId = document.getElementById('doctorSpecialtyInput').value;
  const phone  = document.getElementById('doctorPhoneInput').value.trim();
  const email  = document.getElementById('doctorEmailInput').value.trim();
  const bio    = document.getElementById('doctorBioInput').value.trim();
  const hsStart= document.getElementById('hoursStartInput').value;
  const hsEnd  = document.getElementById('hoursEndInput').value;
  const dur    = parseInt(document.getElementById('apptDurationInput').value) || 30;
  const maxA   = parseInt(document.getElementById('maxApptInput').value) || 10;
  const active = document.getElementById('doctorActiveInput').checked;
  const quals  = getQualifications();
  const daysOff= [...document.querySelectorAll('.day-off-cb:checked')].map(c => c.value);
  const file   = document.getElementById('doctorPhotoInput').files[0];

  if (!name)   { showStatus('يرجى إدخال اسم الطبيب.', 'error'); return; }
  if (!specId) { showStatus('يرجى اختيار التخصص.', 'error'); return; }

  const saveBtn = document.getElementById('save-modal-btn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';

  try {
    let photoUrl = editingPhotoUrl;

    if (file) {
      if (window.isFirebaseConfigured) {
        showStatus('جاري رفع الصورة...', 'info');
        const ref  = window.storage.ref().child(`doctors/${Date.now()}_${file.name}`);
        const snap = await ref.put(file);
        photoUrl   = await snap.ref.getDownloadURL();
      }
      // Mock mode: editingPhotoUrl is already base64
    }

    const data = {
      name, specialtyId: specId, phone, email, bio,
      workingHoursStart: hsStart, workingHoursEnd: hsEnd,
      appointmentDuration: dur, maxAppointmentsPerDay: maxA,
      qualifications: quals, daysOff,
      isActive: active, photo: photoUrl || '',
      updatedAt: new Date().toISOString()
    };

    if (id) {
      // --- UPDATE ---
      if (window.isFirebaseConfigured) {
        await db.collection('doctors').doc(id).update(data);
      }
      const idx = doctorsList.findIndex(d => d.id === id);
      if (idx !== -1) doctorsList[idx] = { ...doctorsList[idx], ...data };
      if (!window.isFirebaseConfigured) saveMockDoctors();
      showStatus('✔ تم تحديث البيانات، جاري تحديث المواعيد...', 'success');
      // Re-generate slots after update
      const updatedDoc = doctorsList.find(d => d.id === id);
      if (updatedDoc) await generateSlotsForDoctor(updatedDoc, 30);
      showStatus('✔ تم تحديث بيانات الطبيب والمواعيد المتاحة.', 'success');
    } else {
      // --- CREATE ---
      const newData = { ...data, createdAt: new Date().toISOString() };
      let newDoctor;
      if (window.isFirebaseConfigured) {
        const docRef = await db.collection('doctors').add(newData);
        newDoctor = { id: docRef.id, ...newData };
        doctorsList.push(newDoctor);
      } else {
        const newId = 'mock-doc-' + Date.now();
        newDoctor = { id: newId, ...newData };
        doctorsList.push(newDoctor);
        saveMockDoctors();
      }
      showStatus('✔ تمت إضافة الطبيب، جاري توليد المواعيد المتاحة...', 'success');
      // Auto-generate slots for next 30 days
      const count = await generateSlotsForDoctor(newDoctor, 30);
      showStatus(`✔ تمت إضافة الطبيب وتوليد ${count || 0} موعد متاح.`, 'success');
    }

    closeModal();
    renderDoctors();
  } catch (err) {
    console.error('handleFormSubmit error:', err);
    showStatus('حدث خطأ: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ الطبيب';
  }
}

// =========================================================
// Toggle Active
// =========================================================
async function toggleActive(id) {
  const doc = doctorsList.find(d => d.id === id);
  if (!doc) return;
  const newActive = doc.isActive === false ? true : false;
  try {
    if (window.isFirebaseConfigured) {
      await db.collection('doctors').doc(id).update({ isActive: newActive, updatedAt: new Date().toISOString() });
    }
    doc.isActive = newActive;
    if (!window.isFirebaseConfigured) saveMockDoctors();
    renderDoctors();
    showStatus(newActive ? '✔ تم تفعيل الطبيب.' : '✔ تم تعطيل الطبيب.', 'success');
  } catch (err) {
    showStatus('فشل تغيير الحالة: ' + err.message, 'error');
  }
}

// =========================================================
// Delete
// =========================================================
function openConfirmDelete(id) {
  const d = doctorsList.find(x => x.id === id);
  if (!d) return;
  pendingDeleteId = id;
  document.getElementById('confirm-delete-msg').textContent =
    `هل أنت متأكد من حذف الطبيب "${d.name}"؟ سيتم حذف جميع بياناته نهائياً.`;
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
      await db.collection('doctors').doc(id).delete();
    }
    doctorsList = doctorsList.filter(d => d.id !== id);
    if (!window.isFirebaseConfigured) saveMockDoctors();
    renderDoctors();
    showStatus('✔ تم حذف الطبيب بنجاح.', 'success');
  } catch (err) {
    showStatus('فشل الحذف: ' + err.message, 'error');
  }
}

// =========================================================
// Helpers
// =========================================================
function showStatus(msg, type = 'info') {
  statusEl.textContent = msg;
  statusEl.className = `status-bar ${type}`;
  statusEl.style.display = 'block';
  setTimeout(() => { statusEl.style.display = 'none'; }, 4500);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function saveMockDoctors() {
  localStorage.setItem('mock_doctors', JSON.stringify(doctorsList));
}

// =========================================================
// Slot Generation Algorithm (called after save if needed)
// generateSlotsForDoctor(doctor, daysAhead = 30)
// Stores to Firestore: availableSlots collection
// =========================================================
async function generateSlotsForDoctor(doctor, daysAhead = 30) {
  if (!doctor || !doctor.id) return;

  const slots       = [];
  const today       = new Date();
  const duration    = doctor.appointmentDuration || 30; // minutes
  const startTime   = doctor.workingHoursStart   || '09:00';
  const endTime     = doctor.workingHoursEnd      || '17:00';
  const daysOff     = doctor.daysOff || [];

  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);

    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    if (daysOff.includes(dayName)) continue;

    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);

    let curMin = sh * 60 + sm;
    const endMin = eh * 60 + em;

    while (curMin + duration <= endMin) {
      const hh = String(Math.floor(curMin / 60)).padStart(2, '0');
      const mm = String(curMin % 60).padStart(2, '0');
      const endMin2 = curMin + duration;
      const hh2 = String(Math.floor(endMin2 / 60)).padStart(2, '0');
      const mm2 = String(endMin2 % 60).padStart(2, '0');

      slots.push({
        doctorId: doctor.id,
        clinicId: 'settings',
        date: dateStr,
        startTime: `${hh}:${mm}`,
        endTime: `${hh2}:${mm2}`,
        isBooked: false,
        createdAt: new Date().toISOString()
      });

      curMin += duration;
    }
  }

  // Save to Firestore or mock storage
  if (window.isFirebaseConfigured) {
    const todayStr = new Date().toISOString().split('T')[0];
    const oldSlotsSnap = await db.collection('availableSlots')
       .where('doctorId', '==', doctor.id)
       .where('isBooked', '==', false)
       .where('date', '>=', todayStr)
       .get();

    // Use multiple batches if we exceed the 500 operation limit
    let batch = db.batch();
    let opCount = 0;

    oldSlotsSnap.forEach(doc => {
       batch.delete(doc.ref);
       opCount++;
       if (opCount === 490) {
           batch.commit();
           batch = db.batch();
           opCount = 0;
       }
    });

    slots.forEach(slot => {
      const ref = db.collection('availableSlots').doc();
      batch.set(ref, slot);
      opCount++;
      if (opCount === 490) {
          batch.commit();
          batch = db.batch();
          opCount = 0;
      }
    });
    
    if (opCount > 0) {
       await batch.commit();
    }
  } else {
    // Assign IDs to each slot in mock mode
    const slotsWithIds = slots.map((s, i) => ({
      ...s,
      id: `mock-slot-${doctor.id}-${s.date}-${i}`
    }));
    
    const todayStr = new Date().toISOString().split('T')[0];
    // clear old future unbooked slots for doctor
    const existing = JSON.parse(localStorage.getItem('mock_slots') || '[]')
      .filter(s => !(s.doctorId === doctor.id && !s.isBooked && s.date >= todayStr));
    
    localStorage.setItem('mock_slots', JSON.stringify([...existing, ...slotsWithIds]));
  }

  console.log(`Generated ${slots.length} slots for doctor ${doctor.name}`);
  return slots.length;
}

// Expose for external use
window.generateSlotsForDoctor = generateSlotsForDoctor;
