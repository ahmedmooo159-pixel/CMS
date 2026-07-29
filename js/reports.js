// =========================================================
// reports.js – Clinic Analytics and Reporting Logic
// =========================================================

window.requireAdmin();

let allAppointments = [];
let allDoctors      = [];
let allSpecialties  = [];

const statusEl = document.getElementById('reports-status');

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('logout-btn')?.addEventListener('click', async e => {
    e.preventDefault();
    try { window.adminSignOut(); } catch(_) {}
  });

  document.getElementById('export-full-report-btn')?.addEventListener('click', exportFullReport);

  await loadData();
});

async function loadData() {
  try {
    if (window.isFirebaseConfigured) {
      const [apptsSnap, docSnap, specSnap] = await Promise.all([
        db.collection('appointments').get(),
        db.collection('doctors').get(),
        db.collection('specialties').get()
      ]);
      allAppointments = []; apptsSnap.forEach(d => allAppointments.push({ id: d.id, ...d.data() }));
      allDoctors      = []; docSnap.forEach(d => allDoctors.push({ id: d.id, ...d.data() }));
      allSpecialties  = []; specSnap.forEach(d => allSpecialties.push({ id: d.id, ...d.data() }));
    } else {
      allAppointments = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
      allDoctors      = JSON.parse(localStorage.getItem('mock_doctors') || '[]');
      allSpecialties  = JSON.parse(localStorage.getItem('mock_specialties') || '[]');
    }

    renderAnalytics();
  } catch (err) {
    console.error('loadData error:', err);
    showStatus('فشل تحميل التقارير: ' + err.message, 'error');
  }
}

function renderAnalytics() {
  const total = allAppointments.length;
  const completed = allAppointments.filter(a => a.status === 'completed').length;
  const activeOrPaid = allAppointments.filter(a => a.status !== 'cancelled');

  // 1. Completion Rate
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
  document.getElementById('stat-completion-rate').textContent = `${rate}%`;
  document.getElementById('stat-completion-sub').textContent  = `${completed} من أصل ${total} حجز مكتمل`;

  // 2. Average Ticket Value
  const totalPrice = activeOrPaid.reduce((s, a) => s + (Number(a.price) || 0), 0);
  const avg = activeOrPaid.length > 0 ? Math.round(totalPrice / activeOrPaid.length) : 0;
  document.getElementById('stat-avg-ticket').textContent = `${avg.toLocaleString('ar-EG')} ج.م`;

  // 3. Doctor Rankings
  const docCounts = {};
  allAppointments.forEach(a => {
    if (a.doctorId && a.status !== 'cancelled') {
      docCounts[a.doctorId] = (docCounts[a.doctorId] || 0) + 1;
    }
  });

  const sortedDocs = Object.keys(docCounts)
    .map(id => ({ doctor: allDoctors.find(d => d.id === id), count: docCounts[id] }))
    .filter(item => item.doctor)
    .sort((a, b) => b.count - a.count);

  if (sortedDocs.length > 0) {
    document.getElementById('stat-top-doctor').textContent       = sortedDocs[0].doctor.name;
    document.getElementById('stat-top-doctor-count').textContent = `${sortedDocs[0].count} حجز مؤكد/مكتمل`;
  } else {
    document.getElementById('stat-top-doctor').textContent       = 'لا يوجد';
    document.getElementById('stat-top-doctor-count').textContent = '0 حجز';
  }

  const docRankEl = document.getElementById('doctors-ranking-list');
  if (sortedDocs.length === 0) {
    docRankEl.innerHTML = `<div style="color:var(--text-muted);font-size:.85rem;">لا توجد بيانات كافية</div>`;
  } else {
    docRankEl.innerHTML = sortedDocs.slice(0, 5).map(item => `
      <div class="ranking-item">
        <span class="ranking-name">${escHtml(item.doctor.name)}</span>
        <span class="ranking-val">${item.count} حجز</span>
      </div>
    `).join('');
  }

  // 4. Specialty Rankings
  const specCounts = {};
  allAppointments.forEach(a => {
    if (a.specialtyId && a.status !== 'cancelled') {
      specCounts[a.specialtyId] = (specCounts[a.specialtyId] || 0) + 1;
    }
  });

  const sortedSpecs = Object.keys(specCounts)
    .map(id => ({ specialty: allSpecialties.find(s => s.id === id), count: specCounts[id] }))
    .filter(item => item.specialty)
    .sort((a, b) => b.count - a.count);

  const specRankEl = document.getElementById('specialties-ranking-list');
  if (sortedSpecs.length === 0) {
    specRankEl.innerHTML = `<div style="color:var(--text-muted);font-size:.85rem;">لا توجد بيانات كافية</div>`;
  } else {
    specRankEl.innerHTML = sortedSpecs.slice(0, 5).map(item => `
      <div class="ranking-item">
        <span class="ranking-name">${escHtml(item.specialty.name)}</span>
        <span class="ranking-val">${item.count} حجز</span>
      </div>
    `).join('');
  }
}

function exportFullReport() {
  const headers = ['رقم الحجز', 'التاريخ', 'الوقت', 'الطبيب', 'التخصص', 'السعر', 'الحالة', 'تاريخ الإنشاء'];
  const rows = allAppointments.map(a => {
    const d = allDoctors.find(doc => doc.id === a.doctorId) || {};
    const s = allSpecialties.find(spec => spec.id === a.specialtyId) || {};
    return [
      a.bookingRef || a.id,
      a.appointmentDate || '',
      a.appointmentTime || '',
      d.name || '',
      s.name || '',
      a.price || 0,
      a.status || '',
      a.createdAt || ''
    ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `clinic_full_report_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function showStatus(msg, type = 'success') {
  statusEl.textContent = msg;
  statusEl.className   = `status-bar ${type}`;
  statusEl.style.display = 'block';
  setTimeout(() => { statusEl.style.display = 'none'; }, 4000);
}

// escHtml is provided globally by common.js — no local copy needed
