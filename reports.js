// =========================================================
// reports.js – Clinic Analytics and Reporting Logic
// =========================================================

window.requireAdmin();

let allAppointments = [];
let allDoctors      = [];
let allSpecialties  = [];

// Current active date range (YYYY-MM-DD strings, null = no limit)
let activeStartDate = null;
let activeEndDate   = null;

const statusEl = document.getElementById('reports-status');

// =========================================================
// Helpers – compute current month bounds
// =========================================================
function getCurrentMonthRange() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().split('T')[0],
    end:   end.toISOString().split('T')[0],
  };
}

function formatDateAr(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
}

function updateRangeLabel() {
  const el = document.getElementById('report-range-label');
  if (!el) return;
  if (!activeStartDate && !activeEndDate) {
    el.textContent = 'عرض: جميع السجلات';
  } else {
    const s = activeStartDate ? formatDateAr(activeStartDate) : '—';
    const e = activeEndDate   ? formatDateAr(activeEndDate)   : '—';
    el.textContent = `عرض الفترة: ${s} ← ${e}`;
  }
}

function setActivePresetStyle(presetId) {
  ['preset-today','preset-7days','preset-month','preset-all'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.className = id === presetId ? 'btn btn-primary' : 'btn btn-secondary';
    btn.style.cssText = 'padding:.4rem .9rem;font-size:.82rem;';
  });
}

// =========================================================
// Preset quick filters (callable from HTML onclick)
// =========================================================
function applyPreset(preset) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  if (preset === 'today') {
    activeStartDate = todayStr;
    activeEndDate   = todayStr;
    setActivePresetStyle('preset-today');
  } else if (preset === '7days') {
    const d = new Date(today);
    d.setDate(today.getDate() - 6);
    activeStartDate = d.toISOString().split('T')[0];
    activeEndDate   = todayStr;
    setActivePresetStyle('preset-7days');
  } else if (preset === 'month') {
    const r = getCurrentMonthRange();
    activeStartDate = r.start;
    activeEndDate   = r.end;
    setActivePresetStyle('preset-month');
  } else {
    activeStartDate = null;
    activeEndDate   = null;
    setActivePresetStyle('preset-all');
  }

  // Sync date inputs
  const fromEl = document.getElementById('date-from');
  const toEl   = document.getElementById('date-to');
  if (fromEl) fromEl.value = activeStartDate || '';
  if (toEl)   toEl.value   = activeEndDate   || '';

  updateRangeLabel();
  loadData();
}

// Apply custom range from the date inputs
function applyCustomRange() {
  const fromEl = document.getElementById('date-from');
  const toEl   = document.getElementById('date-to');
  activeStartDate = fromEl?.value || null;
  activeEndDate   = toEl?.value   || null;
  setActivePresetStyle(null);
  updateRangeLabel();
  loadData();
}

// =========================================================
// Init
// =========================================================
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('logout-btn')?.addEventListener('click', async e => {
    e.preventDefault();
    try { window.adminSignOut(); } catch(_) {}
  });

  document.getElementById('export-full-report-btn')?.addEventListener('click', exportFullReport);

  // Default to current month
  const r = getCurrentMonthRange();
  activeStartDate = r.start;
  activeEndDate   = r.end;

  const fromEl = document.getElementById('date-from');
  const toEl   = document.getElementById('date-to');
  if (fromEl) fromEl.value = activeStartDate;
  if (toEl)   toEl.value   = activeEndDate;

  updateRangeLabel();
  await loadData();
});

// =========================================================
// Load data from Firestore with date range filter
// =========================================================
async function loadData() {
  // Show loading in rank lists
  const docRankEl  = document.getElementById('doctors-ranking-list');
  const specRankEl = document.getElementById('specialties-ranking-list');
  if (docRankEl)  docRankEl.innerHTML  = `<div style="color:var(--text-muted);font-size:.85rem;"><i class="fa-solid fa-spinner fa-spin" style="margin-left:.4rem;"></i>جاري التحميل...</div>`;
  if (specRankEl) specRankEl.innerHTML = `<div style="color:var(--text-muted);font-size:.85rem;"><i class="fa-solid fa-spinner fa-spin" style="margin-left:.4rem;"></i>جاري التحميل...</div>`;

  try {
    if (window.isFirebaseConfigured) {
      // Build appointments query with optional date bounds
      let apptQuery = db.collection('appointments');
      if (activeStartDate) apptQuery = apptQuery.where('appointmentDate', '>=', activeStartDate);
      if (activeEndDate)   apptQuery = apptQuery.where('appointmentDate', '<=', activeEndDate);

      const [apptsSnap, docSnap, specSnap] = await Promise.all([
        apptQuery.get(),
        db.collection('doctors').get(),
        db.collection('specialties').get()
      ]);

      if (apptsSnap.size > 100) {
        console.warn(`Warning: reports.js fetched ${apptsSnap.size} appointments from Firestore – consider tightening the date range.`);
      }

      allAppointments = []; apptsSnap.forEach(d => allAppointments.push({ id: d.id, ...d.data() }));
      allDoctors      = []; docSnap.forEach(d => allDoctors.push({ id: d.id, ...d.data() }));
      allSpecialties  = []; specSnap.forEach(d => allSpecialties.push({ id: d.id, ...d.data() }));
    } else {
      // Mock mode – filter locally
      const raw = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
      allAppointments = raw.filter(a => {
        if (activeStartDate && a.appointmentDate < activeStartDate) return false;
        if (activeEndDate   && a.appointmentDate > activeEndDate)   return false;
        return true;
      });
      allDoctors     = JSON.parse(localStorage.getItem('mock_doctors')     || '[]');
      allSpecialties = JSON.parse(localStorage.getItem('mock_specialties') || '[]');
    }

    renderAnalytics();
  } catch (err) {
    console.error('loadData error:', err);
    showStatus('فشل تحميل التقارير: ' + err.message, 'error');
  }
}

// =========================================================
// Render analytics
// =========================================================
function renderAnalytics() {
  const total     = allAppointments.length;
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

// =========================================================
// Export CSV (exports current filtered data)
// =========================================================
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

  const rangeTag = activeStartDate ? `_${activeStartDate}_to_${activeEndDate || 'now'}` : '_all';
  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `clinic_report${rangeTag}.csv`;
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
