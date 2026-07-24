// =========================================================
// appointments.js  –  Admin Appointments Management
// =========================================================

window.requireAdmin();

// ---- State ----
let allAppointments = [];
let allDoctors      = [];
let allPatients     = [];
let allSpecialties  = [];
let filtered        = [];

// ---- DOM ----
const tbody      = document.getElementById('appt-tbody');
const statusEl   = document.getElementById('appt-status');
const searchEl   = document.getElementById('search-input');
const filterStatus = document.getElementById('filter-status');
const filterDoctor = document.getElementById('filter-doctor');
const filterDate   = document.getElementById('filter-date');

// ---- Status Labels ----
const STATUS_LABELS = {
  pending:   { label:'في الانتظار',  cls:'badge-pending',   icon:'fa-clock' },
  confirmed: { label:'مؤكدة',        cls:'badge-confirmed',  icon:'fa-circle-check' },
  completed: { label:'مكتملة',       cls:'badge-completed',  icon:'fa-star' },
  cancelled: { label:'ملغاة',        cls:'badge-cancelled',  icon:'fa-ban' },
};

const PAY_LABELS = {
  paid:   { label:'مدفوع',        cls:'badge-pay-paid' },
  unpaid: { label:'غير مدفوع',   cls:'badge-pay-unpaid' },
};

// =========================================================
// Init
// =========================================================
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('logout-btn').addEventListener('click', async e => {
    e.preventDefault();
    try { await window.auth.signOut(); window.location.href = 'login.html'; } catch(err) {}
  });

  document.getElementById('close-detail-btn').addEventListener('click', closeDetailModal);
  document.getElementById('detail-modal').addEventListener('click', e => { if (e.target.id === 'detail-modal') closeDetailModal(); });
  document.getElementById('export-btn').addEventListener('click', exportCSV);
  document.getElementById('reset-filters-btn').addEventListener('click', resetFilters);

  searchEl.addEventListener('input',       applyFilters);
  filterStatus.addEventListener('change',  applyFilters);
  filterDoctor.addEventListener('change',  applyFilters);
  filterDate.addEventListener('change',    applyFilters);

  await Promise.all([loadDoctors(), loadSpecialties(), loadPatients()]);
  await loadAppointments();
});

// =========================================================
// Load helpers
// =========================================================
async function loadDoctors() {
  if (window.isFirebaseConfigured) {
    const snap = await db.collection('doctors').get();
    allDoctors = [];
    snap.forEach(d => allDoctors.push({ id: d.id, ...d.data() }));
  } else {
    allDoctors = JSON.parse(localStorage.getItem('mock_doctors') || '[]');
  }

  // Populate filter dropdown
  filterDoctor.innerHTML = '<option value="">كل الأطباء</option>' +
    allDoctors.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
}

async function loadSpecialties() {
  if (window.isFirebaseConfigured) {
    const snap = await db.collection('specialties').get();
    allSpecialties = [];
    snap.forEach(d => allSpecialties.push({ id: d.id, ...d.data() }));
  } else {
    allSpecialties = JSON.parse(localStorage.getItem('mock_specialties') || '[]');
  }
}

async function loadPatients() {
  if (window.isFirebaseConfigured) {
    const snap = await db.collection('patients').get();
    allPatients = [];
    snap.forEach(d => allPatients.push({ id: d.id, ...d.data() }));
  } else {
    allPatients = JSON.parse(localStorage.getItem('mock_patients') || '[]');
  }
}

// =========================================================
// Load Appointments
// =========================================================
async function loadAppointments() {
  tbody.innerHTML = `<tr class="empty-row"><td colspan="10"><i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem;color:var(--primary-color);"></i><p style="margin-top:.75rem;">جاري التحميل...</p></td></tr>`;

  try {
    if (window.isFirebaseConfigured) {
      const snap = await db.collection('appointments').orderBy('createdAt', 'desc').get();
      allAppointments = [];
      snap.forEach(d => allAppointments.push({ id: d.id, ...d.data() }));
    } else {
      const raw = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
      // Sort by createdAt desc
      allAppointments = raw.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }

    updateStats();
    applyFilters();
  } catch (err) {
    console.error('loadAppointments error:', err);
    tbody.innerHTML = `<tr class="empty-row"><td colspan="10" style="color:var(--danger);">خطأ في التحميل: ${err.message}</td></tr>`;
  }
}

// =========================================================
// Stats
// =========================================================
function updateStats() {
  document.getElementById('stat-total').textContent     = allAppointments.length;
  document.getElementById('stat-pending').textContent   = allAppointments.filter(a => a.status === 'pending').length;
  document.getElementById('stat-confirmed').textContent = allAppointments.filter(a => a.status === 'confirmed').length;
  document.getElementById('stat-completed').textContent = allAppointments.filter(a => a.status === 'completed').length;
  document.getElementById('stat-cancelled').textContent = allAppointments.filter(a => a.status === 'cancelled').length;
}

// =========================================================
// Filters
// =========================================================
function applyFilters() {
  const q      = searchEl.value.trim().toLowerCase();
  const status = filterStatus.value;
  const docId  = filterDoctor.value;
  const date   = filterDate.value;

  filtered = allAppointments.filter(a => {
    const patient  = allPatients.find(p => p.id === a.patientId) || {};
    const fullName = `${patient.firstName || ''} ${patient.lastName || ''}`.toLowerCase();
    const phone    = (patient.phone || '').toLowerCase();
    const ref      = (a.bookingRef || '').toLowerCase();

    if (q && !fullName.includes(q) && !phone.includes(q) && !ref.includes(q)) return false;
    if (status && a.status !== status) return false;
    if (docId  && a.doctorId !== docId) return false;
    if (date   && a.appointmentDate !== date) return false;
    return true;
  });

  renderTable();
}

function resetFilters() {
  searchEl.value        = '';
  filterStatus.value    = '';
  filterDoctor.value    = '';
  filterDate.value      = '';
  applyFilters();
}

// =========================================================
// Render Table
// =========================================================
function renderTable() {
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="10"><i class="fa-solid fa-calendar-xmark" style="font-size:2rem;color:var(--text-muted);"></i><p style="margin-top:.75rem;">لا توجد حجوزات تطابق البحث</p></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    const patient   = allPatients.find(p => p.id === a.patientId)   || {};
    const doctor    = allDoctors.find(d => d.id === a.doctorId)     || {};
    const specialty = allSpecialties.find(s => s.id === a.specialtyId) || {};
    const st        = STATUS_LABELS[a.status] || { label: a.status, cls:'badge-pending', icon:'fa-circle' };
    const pay       = PAY_LABELS[a.paymentStatus] || PAY_LABELS.unpaid;

    const dateFormatted = a.appointmentDate
      ? new Date(a.appointmentDate + 'T00:00:00').toLocaleDateString('ar-EG', { weekday:'short', year:'numeric', month:'short', day:'numeric' })
      : '--';

    const patientName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'غير معروف';

    // Action buttons based on current status
    const actions = buildActionButtons(a);

    return `
      <tr>
        <td><span style="font-family:monospace;font-size:.8rem;color:var(--text-muted);">${a.bookingRef || a.id?.slice(0,8) || '--'}</span></td>
        <td>
          <div style="font-weight:600;">${escHtml(patientName)}</div>
          ${patient.phone ? `<div style="font-size:.78rem;color:var(--text-muted);">${escHtml(patient.phone)}</div>` : ''}
        </td>
        <td>${escHtml(doctor.name || '--')}</td>
        <td>${escHtml(specialty.name || '--')}</td>
        <td style="white-space:nowrap;">${dateFormatted}</td>
        <td style="white-space:nowrap;">${a.appointmentTime || '--'}</td>
        <td><span style="font-weight:700;color:var(--secondary-color);">${a.queueNumber ? `#${a.queueNumber}` : '--'}</span></td>
        <td><span class="badge ${st.cls}"><i class="fa-solid ${st.icon}"></i>${st.label}</span></td>
        <td><span class="badge ${pay.cls}">${pay.label}</span></td>
        <td>
          <div class="tbl-actions">
            <button class="tbl-btn view" onclick="openDetailModal('${a.id}')"><i class="fa-solid fa-eye"></i></button>
            ${actions}
          </div>
        </td>
      </tr>`;
  }).join('');
}

function buildActionButtons(a) {
  let btns = '';
  if (a.status === 'pending') {
    btns += `<button class="tbl-btn confirm" onclick="updateStatus('${a.id}','confirmed')">تأكيد</button>`;
    btns += `<button class="tbl-btn cancel" onclick="updateStatus('${a.id}','cancelled')">إلغاء</button>`;
  } else if (a.status === 'confirmed') {
    btns += `<button class="tbl-btn complete" onclick="updateStatus('${a.id}','completed')">مكتمل</button>`;
    btns += `<button class="tbl-btn cancel" onclick="updateStatus('${a.id}','cancelled')">إلغاء</button>`;
  } else if (a.status === 'cancelled') {
    btns += `<button class="tbl-btn confirm" onclick="updateStatus('${a.id}','pending')">إعادة</button>`;
  }
  return btns;
}

// =========================================================
// Update Status
// =========================================================
async function updateStatus(id, newStatus) {
  try {
    const now = new Date().toISOString();
    if (window.isFirebaseConfigured) {
      await db.collection('appointments').doc(id).update({ status: newStatus, updatedAt: now });
    } else {
      const appts = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
      const idx   = appts.findIndex(a => a.id === id);
      if (idx !== -1) { appts[idx].status = newStatus; appts[idx].updatedAt = now; }
      localStorage.setItem('mock_appointments', JSON.stringify(appts));
    }

    const idx2 = allAppointments.findIndex(a => a.id === id);
    if (idx2 !== -1) allAppointments[idx2].status = newStatus;

    updateStats();
    applyFilters();

    const labelMap = { confirmed:'مؤكدة', completed:'مكتملة', cancelled:'ملغاة', pending:'معلقة' };
    showStatus(`✔ تم تحديث حالة الحجز إلى "${labelMap[newStatus] || newStatus}".`, 'success');
  } catch (err) {
    showStatus('فشل التحديث: ' + err.message, 'error');
  }
}

// =========================================================
// Detail Modal
// =========================================================
function openDetailModal(id) {
  const a = allAppointments.find(x => x.id === id);
  if (!a) return;

  const patient   = allPatients.find(p => p.id === a.patientId)     || {};
  const doctor    = allDoctors.find(d => d.id === a.doctorId)       || {};
  const specialty = allSpecialties.find(s => s.id === a.specialtyId) || {};
  const st        = STATUS_LABELS[a.status] || { label: a.status, cls:'badge-pending' };
  const pay       = PAY_LABELS[a.paymentStatus] || PAY_LABELS.unpaid;

  const dateFormatted = a.appointmentDate
    ? new Date(a.appointmentDate + 'T00:00:00').toLocaleDateString('ar-EG', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
    : '--';

  const createdAt = a.createdAt
    ? new Date(a.createdAt).toLocaleString('ar-EG')
    : '--';

  document.getElementById('detail-body').innerHTML = `
    <div class="detail-row"><span class="detail-label">رقم الحجز</span><span class="detail-val" style="font-family:monospace;">${a.bookingRef || '--'}</span></div>
    <div class="detail-row"><span class="detail-label">المريض</span><span class="detail-val">${escHtml(`${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'غير معروف')}</span></div>
    <div class="detail-row"><span class="detail-label">الهاتف</span><span class="detail-val">${escHtml(patient.phone || '--')}</span></div>
    <div class="detail-row"><span class="detail-label">الطبيب</span><span class="detail-val">${escHtml(doctor.name || '--')}</span></div>
    <div class="detail-row"><span class="detail-label">التخصص</span><span class="detail-val">${escHtml(specialty.name || '--')}</span></div>
    <div class="detail-row"><span class="detail-label">التاريخ</span><span class="detail-val">${dateFormatted}</span></div>
    <div class="detail-row"><span class="detail-label">الوقت</span><span class="detail-val">${a.appointmentTime || '--'}</span></div>
    <div class="detail-row"><span class="detail-label">رقم الدور</span><span class="detail-val" style="color:var(--secondary-color);">${a.queueNumber ? `#${a.queueNumber}` : '--'}</span></div>
    <div class="detail-row"><span class="detail-label">الحالة</span><span class="badge ${st.cls}">${st.label}</span></div>
    <div class="detail-row"><span class="detail-label">الدفع</span><span class="badge ${pay.cls}">${pay.label}</span></div>
    <div class="detail-row"><span class="detail-label">سعر الكشف</span><span class="detail-val" style="color:var(--success);">${a.price ? a.price + ' ج.م' : '--'}</span></div>
    <div class="detail-row"><span class="detail-label">تاريخ الحجز</span><span class="detail-val" style="font-size:.85rem;">${createdAt}</span></div>`;

  // Action buttons inside modal
  document.getElementById('detail-actions').innerHTML = `
    <button class="btn btn-secondary" onclick="closeDetailModal()">إغلاق</button>
    ${a.status === 'pending' ? `
      <button class="btn btn-primary" onclick="updateStatus('${a.id}','confirmed');closeDetailModal();">
        <i class="fa-solid fa-circle-check"></i> تأكيد الحجز
      </button>` : ''}
    ${(a.status === 'pending' || a.status === 'confirmed') ? `
      <button class="btn btn-danger" onclick="updateStatus('${a.id}','cancelled');closeDetailModal();">
        <i class="fa-solid fa-ban"></i> إلغاء
      </button>` : ''}
    ${a.status === 'confirmed' ? `
      <button class="btn btn-success" onclick="updateStatus('${a.id}','completed');closeDetailModal();" style="background:var(--success);border-color:var(--success);">
        <i class="fa-solid fa-star"></i> إتمام الزيارة
      </button>` : ''}`;

  document.getElementById('detail-modal').style.display = 'flex';
}

function closeDetailModal() {
  document.getElementById('detail-modal').style.display = 'none';
}

// =========================================================
// Export CSV
// =========================================================
function exportCSV() {
  const headers = ['رقم الحجز','المريض','الهاتف','الطبيب','التخصص','التاريخ','الوقت','الدور','الحالة','الدفع','السعر'];

  const rows = filtered.map(a => {
    const patient   = allPatients.find(p => p.id === a.patientId)     || {};
    const doctor    = allDoctors.find(d => d.id === a.doctorId)       || {};
    const specialty = allSpecialties.find(s => s.id === a.specialtyId) || {};
    const name      = `${patient.firstName || ''} ${patient.lastName || ''}`.trim();
    return [
      a.bookingRef || '',
      name,
      patient.phone || '',
      doctor.name || '',
      specialty.name || '',
      a.appointmentDate || '',
      a.appointmentTime || '',
      a.queueNumber || '',
      a.status || '',
      a.paymentStatus || '',
      a.price || ''
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
  });

  const csv  = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `appointments_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// =========================================================
// Helpers
// =========================================================
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
