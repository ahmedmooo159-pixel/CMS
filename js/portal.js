// =========================================================
// portal.js  –  Patient Portal Homepage Logic
// =========================================================

document.addEventListener('DOMContentLoaded', async () => {
  await loadClinicBranding();
  await loadPortalData();
});

// ---- Clinic branding ----
async function loadClinicBranding() {
  try {
    let settings = {};
    if (window.isFirebaseConfigured) {
      const doc = await db.collection('clinics').doc('settings').get();
      if (doc.exists) settings = doc.data();
    } else {
      settings = JSON.parse(localStorage.getItem('mock_firestore_clinics_settings') || '{}');
    }
    if (settings.name) {
      document.getElementById('clinic-name').textContent = settings.name;
      document.getElementById('hero-clinic-name').textContent = `مع أفضل أطباء ${settings.name}`;
    }
    if (settings.description) {
      document.getElementById('clinic-tagline').textContent = settings.description;
    }
    if (settings.logo) {
      document.getElementById('nav-logo-container').innerHTML =
        `<img src="${settings.logo}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`;
    }
  } catch (err) {
    console.error('loadClinicBranding error:', err);
  }
}

// ---- Portal data: specialties, doctors count, slots count ----
async function loadPortalData() {
  const grid = document.getElementById('specialties-grid');

  try {
    let specialties = [], doctors = [], slots = [];

    if (window.isFirebaseConfigured) {
      const [specSnap, docSnap, slotSnap] = await Promise.all([
        db.collection('specialties').where('isActive', '==', true).orderBy('displayOrder').get(),
        db.collection('doctors').where('isActive', '==', true).get(),
        db.collection('availableSlots').where('isBooked', '==', false).get()
      ]);
      specSnap.forEach(d => specialties.push({ id: d.id, ...d.data() }));
      docSnap.forEach(d => doctors.push({ id: d.id, ...d.data() }));
      slotSnap.forEach(d => slots.push({ id: d.id, ...d.data() }));
    } else {
      specialties = JSON.parse(localStorage.getItem('mock_specialties') || '[]').filter(s => s.isActive !== false);
      doctors     = JSON.parse(localStorage.getItem('mock_doctors') || '[]').filter(d => d.isActive !== false);
      slots       = JSON.parse(localStorage.getItem('mock_slots') || '[]').filter(s => !s.isBooked);
    }

    // Update stats
    document.getElementById('stat-specialties').textContent = specialties.length;
    document.getElementById('stat-doctors').textContent     = doctors.length;
    document.getElementById('stat-slots').textContent       = slots.length > 999 ? '999+' : slots.length;

    // Render specialty cards
    if (specialties.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-icon"><i class="fa-solid fa-briefcase-medical"></i></div>
          <h4>لا توجد تخصصات متاحة</h4>
          <p style="font-size:.9rem;">يرجى مراجعة الإدارة لإضافة التخصصات.</p>
        </div>`;
      return;
    }

    grid.innerHTML = specialties.map(s => `
      <a href="doctors-list.html?specialtyId=${encodeURIComponent(s.id)}&specialtyName=${encodeURIComponent(s.name)}"
         class="specialty-card">
        <div class="specialty-card-icon">
          ${s.icon ? `<img src="${s.icon}" alt="${s.name}">` : `<i class="fa-solid fa-stethoscope"></i>`}
        </div>
        <div class="specialty-card-name">${escapeHtml(s.name)}</div>
        ${s.basePrice ? `<div class="specialty-card-price">يبدأ من ${s.basePrice} ج.م</div>` : ''}
      </a>
    `).join('');

  } catch (err) {
    console.error('loadPortalData error:', err);
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-icon"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger);"></i></div>
        <h4>خطأ في التحميل</h4><p>${err.message}</p>
      </div>`;
  }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
