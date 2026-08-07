// =========================================================
// doctors-list.js  –  Doctors listing page for a specialty
// =========================================================

const params      = new URLSearchParams(window.location.search);
const specialtyId = params.get('specialtyId') || '';
const specialtyName = decodeURIComponent(params.get('specialtyName') || 'التخصص');

document.addEventListener('DOMContentLoaded', async () => {
  // Set specialty labels
  document.getElementById('bc-specialty').textContent     = specialtyName;
  document.getElementById('specialty-name-heading').textContent = specialtyName;
  document.title = `${specialtyName} - اختر طبيبك`;

  // Back link
  document.querySelector('nav a').href = 'index.html';

  await loadDoctors();
});

async function loadDoctors() {
  const grid = document.getElementById('doctors-grid');

  try {
    let doctors = [], specialties = [];

    if (window.isFirebaseConfigured) {
      const [docSnap, specSnap] = await Promise.all([
        db.collection('doctors')
          .where('specialtyId', '==', specialtyId)
          .where('isActive', '==', true)
          .get(),
        db.collection('specialties').doc(specialtyId).get()
      ]);
      docSnap.forEach(d => doctors.push({ id: d.id, ...d.data() }));
      if (specSnap.exists) specialties = [{ id: specSnap.id, ...specSnap.data() }];
    } else {
      const all = JSON.parse(localStorage.getItem('mock_doctors') || '[]');
      doctors    = all.filter(d => d.specialtyId === specialtyId && d.isActive !== false);
      const allSpecs = JSON.parse(localStorage.getItem('mock_specialties') || '[]');
      specialties = allSpecs.filter(s => s.id === specialtyId);
    }

    const specialty = specialties[0] || {};

    if (doctors.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i class="fa-solid fa-user-doctor"></i></div>
          <h4>لا يوجد أطباء متاحون في هذا التخصص حالياً</h4>
          <p style="font-size:.9rem;">يرجى اختيار تخصص آخر أو التواصل مع العيادة مباشرة.</p>
          <a href="index.html" class="btn btn-primary" style="margin-top:1rem;">
            <i class="fa-solid fa-arrow-right"></i> العودة للتخصصات
          </a>
        </div>`;
      return;
    }

    grid.innerHTML = doctors.map(d => {
      const quals  = (d.qualifications || []).slice(0, 3);
      const price  = specialty.basePrice || 0;
      const bookUrl = `appointment-booking.html?doctorId=${encodeURIComponent(d.id)}&specialtyId=${encodeURIComponent(specialtyId)}&specialtyName=${encodeURIComponent(specialtyName)}`;

      return `
      <div class="doctor-select-card" onclick="window.location.href='${bookUrl}'">
        <div class="flex align-center gap-3">
          <div class="doc-avatar">
            ${d.photo ? `<img src="${d.photo}" alt="${d.name}">` : `<i class="fa-solid fa-user-doctor"></i>`}
          </div>
          <div>
            <div class="doc-name">${escapeHtml(d.name)}</div>
            <div class="doc-spec">${escapeHtml(specialtyName)}</div>
          </div>
        </div>

        ${d.bio ? `<p style="font-size:.85rem;color:var(--text-muted);line-height:1.5;">${escapeHtml(d.bio)}</p>` : ''}

        <div class="doc-meta">
          <div class="doc-meta-row"><i class="fa-solid fa-clock"></i>${d.workingHoursStart || '09:00'} – ${d.workingHoursEnd || '17:00'}</div>
          <div class="doc-meta-row"><i class="fa-solid fa-calendar-day"></i>مدة الكشف: ${d.appointmentDuration || 30} دقيقة</div>
          ${price ? `<div class="doc-meta-row"><i class="fa-solid fa-coins"></i>سعر الكشف: <strong style="color:var(--secondary-color);margin-right:.25rem;">${price} ج.م</strong></div>` : ''}
        </div>

        ${quals.length ? `
          <div class="doc-quals">
            ${quals.map(q => `<span class="qual-tag">${escapeHtml(q)}</span>`).join('')}
            ${d.qualifications.length > 3 ? `<span class="qual-tag">+${d.qualifications.length - 3} مزيد</span>` : ''}
          </div>` : ''}

        <button class="book-btn">
          <i class="fa-solid fa-calendar-check" style="margin-left:.4rem;"></i> احجز مع ${escapeHtml(d.name.replace('د. ','').replace('د.',''))}
        </button>
      </div>`;
    }).join('');

  } catch (err) {
    console.error('loadDoctors error:', err);
    grid.innerHTML = `
      <div class="empty-state">
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
