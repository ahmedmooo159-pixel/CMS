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
        (window.isValidImageUrl(settings.logo) ? `<img src="${settings.logo}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">` : '');
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
      const now = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(now.getDate() + 7);

      // Specialties & doctors use AppCache; slots are real-time so no cache
      const cachedSpecs = window.AppCache?.get('specialties');
      const cachedDocs  = window.AppCache?.get('doctors');

      const [specSnap, docSnap, slotSnap] = await Promise.all([
        cachedSpecs ? null : db.collection('specialties').where('isActive', '==', true).orderBy('displayOrder').get(),
        cachedDocs  ? null : db.collection('doctors').where('isActive', '==', true).get(),
        db.collection('availableSlots')
          .where('isBooked', '==', false)
          .where('date', '>=', now.toISOString().split('T')[0])
          .where('date', '<=', nextWeek.toISOString().split('T')[0])
          .get()
      ]);

      if (cachedSpecs) {
        specialties = cachedSpecs;
      } else {
        specSnap.forEach(d => specialties.push({ id: d.id, ...d.data() }));
        window.AppCache?.set('specialties', specialties);
      }

      if (cachedDocs) {
        doctors = cachedDocs;
      } else {
        docSnap.forEach(d => doctors.push({ id: d.id, ...d.data() }));
        window.AppCache?.set('doctors', doctors);
      }

      slotSnap.forEach(d => slots.push({ id: d.id, ...d.data() }));
    } else {
      const todayStr = new Date().toISOString().split('T')[0];
      const nextWeekStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      specialties = JSON.parse(localStorage.getItem('mock_specialties') || '[]').filter(s => s.isActive !== false);
      doctors     = JSON.parse(localStorage.getItem('mock_doctors') || '[]').filter(d => d.isActive !== false);
      slots       = JSON.parse(localStorage.getItem('mock_slots') || '[]').filter(s => !s.isBooked && s.date >= todayStr && s.date <= nextWeekStr);
    }

    // Animate stats
    function animateCount(id, target) {
      const el = document.getElementById(id);
      if (!el) return;
      const duration = 1500;
      const startTime = performance.now();
      function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const current = Math.floor((1 - Math.pow(1 - progress, 4)) * target);
        el.textContent = current;
        if (progress < 1) requestAnimationFrame(update);
        else el.textContent = target;
      }
      requestAnimationFrame(update);
    }

    animateCount('stat-specialties', specialties.length);
    animateCount('stat-doctors', doctors.length);
    animateCount('stat-slots', slots.length);

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

    const pagePrefix = window.location.pathname.includes('/public/') ? '' : 'public/';

    grid.innerHTML = specialties.map(s => `
      <a href="${pagePrefix}doctors-list.html?specialtyId=${encodeURIComponent(s.id)}&specialtyName=${encodeURIComponent(s.name)}"
         class="specialty-card">
        <div class="specialty-card-icon">
          ${s.icon && window.isValidImageUrl(s.icon) ? `<img src="${s.icon}" alt="${window.escHtml(s.name)}">` : `<i class="fa-solid fa-stethoscope"></i>`}
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
