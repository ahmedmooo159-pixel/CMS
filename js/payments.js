// =========================================================
// payments.js  –  Admin Payments Management
// =========================================================

window.requireAdmin();

// ---- State ----
let allAppointments = [];
let allPatients     = [];
let allDoctors      = [];
let allSpecialties  = [];
let filtered        = [];

let clinicName = 'العيادة';

// ---- DOM ----
const tbody       = document.getElementById('pay-tbody');
const statusEl    = document.getElementById('pay-status');
const searchEl    = document.getElementById('search-input');
const filterPaySt = document.getElementById('filter-pay-status');
const filterMeth  = document.getElementById('filter-method');
const filterDate  = document.getElementById('filter-date');

// =========================================================
// Init
// =========================================================
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('logout-btn').addEventListener('click', async e => {
    e.preventDefault();
    try { await window.auth.signOut(); window.location.href = 'login.html'; } catch(err) {}
  });

  document.getElementById('close-receipt-btn').addEventListener('click', () =>
    document.getElementById('receipt-modal').style.display = 'none');

  document.getElementById('export-btn').addEventListener('click', exportCSV);
  document.getElementById('reset-btn').addEventListener('click', resetFilters);

  searchEl.addEventListener('input',      applyFilters);
  filterPaySt.addEventListener('change',  applyFilters);
  filterMeth.addEventListener('change',   applyFilters);
  filterDate.addEventListener('change',   applyFilters);

  // Load clinic name for receipts
  try {
    const settings = window.isFirebaseConfigured
      ? (await db.collection('clinics').doc('settings').get()).data()
      : JSON.parse(localStorage.getItem('mock_firestore_clinics_settings') || '{}');
    if (settings?.name) clinicName = settings.name;
  } catch (_) {}

  await Promise.all([loadLookups()]);
  await loadPayments();
});

// =========================================================
// Load lookups
// =========================================================
async function loadLookups() {
  const load = async (col, key) => {
    if (window.isFirebaseConfigured) {
      const snap = await db.collection(col).get();
      const arr  = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      return arr;
    }
    return JSON.parse(localStorage.getItem(key) || '[]');
  };

  [allPatients, allDoctors, allSpecialties] = await Promise.all([
    load('patients',    'mock_patients'),
    load('doctors',     'mock_doctors'),
    load('specialties', 'mock_specialties'),
  ]);
}

// =========================================================
// Load Payments (= appointments with payment info)
// =========================================================
async function loadPayments() {
  tbody.innerHTML = `<tr class="empty-row"><td colspan="8"><i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem;color:var(--primary-color);"></i><p style="margin-top:.75rem;">جاري التحميل...</p></td></tr>`;

  try {
    if (window.isFirebaseConfigured) {
      const snap = await db.collection('appointments').orderBy('createdAt','desc').get();
      allAppointments = [];
      snap.forEach(d => allAppointments.push({ id: d.id, ...d.data() }));
    } else {
      const raw = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
      allAppointments = raw.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
    }

    computeStats();
    buildChart();
    applyFilters();
  } catch (err) {
    console.error('loadPayments error:', err);
    showStatus('خطأ في التحميل: ' + err.message, 'error');
  }
}

// =========================================================
// Compute Revenue Stats
// =========================================================
function computeStats() {
  const today = new Date().toISOString().split('T')[0];
  const paid  = allAppointments.filter(a => a.paymentStatus === 'paid');
  const unpaid= allAppointments.filter(a => a.paymentStatus !== 'paid');

  const sum = arr => arr.reduce((s, a) => s + (Number(a.price) || 0), 0);

  document.getElementById('rev-total').textContent      = fmt(sum(paid));
  document.getElementById('rev-paid').textContent        = fmt(sum(paid));
  document.getElementById('rev-paid-count').textContent  = `${paid.length} معاملة`;
  document.getElementById('rev-unpaid').textContent      = fmt(sum(unpaid));
  document.getElementById('rev-unpaid-count').textContent= `${unpaid.length} معاملة`;

  const todayPaid = paid.filter(a => a.appointmentDate === today);
  document.getElementById('rev-today').textContent      = fmt(sum(todayPaid));
  document.getElementById('rev-today-count').textContent= `${todayPaid.length} حجز اليوم`;
}

// =========================================================
// 7-Day Bar Chart (pure CSS/HTML)
// =========================================================
function buildChart() {
  const chart = document.getElementById('revenue-chart');
  const days  = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }

  const dayRevenue = days.map(dateStr => ({
    dateStr,
    label: new Date(dateStr + 'T00:00:00').toLocaleDateString('ar-EG', { weekday:'short', day:'numeric' }),
    total: allAppointments
      .filter(a => a.appointmentDate === dateStr && a.paymentStatus === 'paid')
      .reduce((s, a) => s + (Number(a.price) || 0), 0)
  }));

  const maxVal = Math.max(...dayRevenue.map(d => d.total), 1);

  chart.innerHTML = dayRevenue.map(d => {
    const pct    = Math.round((d.total / maxVal) * 100);
    const height = Math.max(pct, d.total > 0 ? 6 : 2);
    return `
      <div class="chart-bar-col">
        <div class="chart-bar" style="height:${height}%;" data-tip="${fmt(d.total)}"></div>
        <span class="chart-bar-label">${d.label}</span>
      </div>`;
  }).join('');
}

// =========================================================
// Filters
// =========================================================
function applyFilters() {
  const q      = searchEl.value.trim().toLowerCase();
  const payS   = filterPaySt.value;
  const method = filterMeth.value;
  const date   = filterDate.value;

  filtered = allAppointments.filter(a => {
    const patient  = allPatients.find(p => p.id === a.patientId) || {};
    const fullName = `${patient.firstName || ''} ${patient.lastName || ''}`.toLowerCase();
    const phone    = (patient.phone || '').toLowerCase();
    const ref      = (a.bookingRef || '').toLowerCase();

    if (q && !fullName.includes(q) && !phone.includes(q) && !ref.includes(q)) return false;
    if (payS   && a.paymentStatus !== payS) return false;
    if (method) {
      const m = a.paymentMethod || '';
      if (method === 'paymob' && m !== 'paymob') return false;
      if (method === 'cash'   && m !== 'cash')   return false;
    }
    if (date && a.appointmentDate !== date) return false;
    return true;
  });

  renderTable();
}

function resetFilters() {
  searchEl.value       = '';
  filterPaySt.value    = '';
  filterMeth.value     = '';
  filterDate.value     = '';
  applyFilters();
}

// =========================================================
// Render Table
// =========================================================
function renderTable() {
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8"><i class="fa-solid fa-file-invoice-dollar" style="font-size:2rem;color:var(--text-muted);"></i><p style="margin-top:.75rem;">لا توجد سجلات تطابق البحث</p></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    const patient  = allPatients.find(p => p.id === a.patientId) || {};
    const doctor   = allDoctors.find(d => d.id === a.doctorId)   || {};
    const name     = `${patient.firstName||''} ${patient.lastName||''}`.trim() || 'غير معروف';

    const dateLabel = a.appointmentDate
      ? new Date(a.appointmentDate + 'T00:00:00').toLocaleDateString('ar-EG',{ year:'numeric',month:'short',day:'numeric' })
      : '--';

    const isPaid = a.paymentStatus === 'paid';
    const payBadge = isPaid
      ? `<span class="badge badge-paid"><i class="fa-solid fa-circle-check"></i> مدفوع</span>`
      : `<span class="badge badge-unpaid"><i class="fa-solid fa-clock"></i> غير مدفوع</span>`;

    const methodBadge = a.paymentMethod === 'paymob'
      ? `<span class="badge badge-paymob"><i class="fa-solid fa-credit-card"></i> Paymob</span>`
      : `<span class="badge badge-cash"><i class="fa-solid fa-money-bill-wave"></i> نقدي</span>`;

    const markBtn = !isPaid
      ? `<button class="tbl-btn mark-paid" onclick="markAsPaid('${a.id}')"><i class="fa-solid fa-check"></i> تسجيل كمدفوع</button>`
      : '';

    return `
      <tr>
        <td><span style="font-family:monospace;font-size:.8rem;color:var(--text-muted);">${a.bookingRef || '--'}</span></td>
        <td>
          <div style="font-weight:600;">${escHtml(name)}</div>
          ${patient.phone ? `<div style="font-size:.78rem;color:var(--text-muted);">${escHtml(patient.phone)}</div>` : ''}
        </td>
        <td>${escHtml(doctor.name || '--')}</td>
        <td style="white-space:nowrap;">${dateLabel}</td>
        <td><strong style="color:var(--secondary-color);">${fmt(a.price || 0)}</strong></td>
        <td>${methodBadge}</td>
        <td>${payBadge}</td>
        <td>
          <div style="display:flex;gap:.35rem;">
            ${markBtn}
            <button class="tbl-btn receipt" onclick="showReceipt('${a.id}')">
              <i class="fa-solid fa-receipt"></i> إيصال
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// =========================================================
// Mark as Paid
// =========================================================
async function markAsPaid(id) {
  try {
    const now = new Date().toISOString();
    if (window.isFirebaseConfigured) {
      await db.collection('appointments').doc(id).update({ paymentStatus: 'paid', updatedAt: now });
    } else {
      const appts = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
      const idx   = appts.findIndex(a => a.id === id);
      if (idx !== -1) { appts[idx].paymentStatus = 'paid'; appts[idx].updatedAt = now; }
      localStorage.setItem('mock_appointments', JSON.stringify(appts));
    }
    const idx2 = allAppointments.findIndex(a => a.id === id);
    if (idx2 !== -1) allAppointments[idx2].paymentStatus = 'paid';

    computeStats();
    buildChart();
    applyFilters();
    showStatus('✔ تم تسجيل الدفع بنجاح.', 'success');
  } catch (err) {
    showStatus('فشل تسجيل الدفع: ' + err.message, 'error');
  }
}

// =========================================================
// Receipt Modal
// =========================================================
function showReceipt(id) {
  const a = allAppointments.find(x => x.id === id);
  if (!a) return;

  const patient   = allPatients.find(p => p.id === a.patientId)     || {};
  const doctor    = allDoctors.find(d => d.id === a.doctorId)       || {};
  const specialty = allSpecialties.find(s => s.id === a.specialtyId) || {};
  const name      = `${patient.firstName||''} ${patient.lastName||''}`.trim() || 'غير معروف';

  const dateLabel = a.appointmentDate
    ? new Date(a.appointmentDate + 'T00:00:00').toLocaleDateString('ar-EG',{ weekday:'long', year:'numeric', month:'long', day:'numeric' })
    : '--';

  const isPaid = a.paymentStatus === 'paid';

  document.getElementById('receipt-content').innerHTML = `
    <div class="receipt-logo">
      <i class="fa-solid fa-hospital" style="margin-left:.4rem;color:var(--primary-color);"></i>
      ${escHtml(clinicName)}
    </div>
    <div style="text-align:center;color:var(--text-muted);font-size:.78rem;margin-bottom:1rem;">
      إيصال رقم: <strong>${a.bookingRef || a.id?.slice(0,8) || '--'}</strong>
      &nbsp;|&nbsp;
      ${new Date().toLocaleDateString('ar-EG')}
    </div>
    <div class="receipt-row"><span>المريض</span><span>${escHtml(name)}</span></div>
    <div class="receipt-row"><span>الطبيب</span><span>${escHtml(doctor.name || '--')}</span></div>
    <div class="receipt-row"><span>التخصص</span><span>${escHtml(specialty.name || '--')}</span></div>
    <div class="receipt-row"><span>التاريخ</span><span>${dateLabel}</span></div>
    <div class="receipt-row"><span>الوقت</span><span>${a.appointmentTime || '--'}</span></div>
    <div class="receipt-row"><span>طريقة الدفع</span><span>${a.paymentMethod === 'paymob' ? 'بطاقة / Paymob' : 'نقدي'}</span></div>
    <div class="receipt-row"><span>حالة الدفع</span><span style="color:${isPaid ? 'var(--success)' : 'var(--warning)'};">${isPaid ? 'مدفوع ✓' : 'لم يُدفع بعد'}</span></div>
    <div class="receipt-row receipt-total"><span>الإجمالي</span><span>${fmt(a.price || 0)}</span></div>
    <div style="text-align:center;margin-top:1rem;font-size:.75rem;color:var(--text-muted);">
      شكراً لثقتكم — ${escHtml(clinicName)}
    </div>`;

  document.getElementById('receipt-modal').style.display = 'flex';
}

// =========================================================
// CSV Export
// =========================================================
function exportCSV() {
  const headers = ['رقم الحجز','المريض','الهاتف','الطبيب','التاريخ','المبلغ','طريقة الدفع','حالة الدفع'];
  const rows = filtered.map(a => {
    const patient = allPatients.find(p => p.id === a.patientId) || {};
    const doctor  = allDoctors.find(d => d.id === a.doctorId)   || {};
    const name    = `${patient.firstName||''} ${patient.lastName||''}`.trim();
    return [
      a.bookingRef || '',
      name,
      patient.phone || '',
      doctor.name || '',
      a.appointmentDate || '',
      a.price || '0',
      a.paymentMethod || '',
      a.paymentStatus || '',
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
  });
  const csv  = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const el   = document.createElement('a');
  el.href = url; el.download = `payments_${new Date().toISOString().split('T')[0]}.csv`;
  el.click(); URL.revokeObjectURL(url);
}

// =========================================================
// Helpers
// =========================================================
function fmt(num) {
  return Number(num).toLocaleString('ar-EG') + ' ج.م';
}

function showStatus(msg, type = 'success') {
  statusEl.textContent = msg;
  statusEl.className   = `status-bar ${type}`;
  statusEl.style.display = 'block';
  setTimeout(() => { statusEl.style.display = 'none'; }, 4000);
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
