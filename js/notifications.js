// =========================================================
// notifications.js – WhatsApp & SMS Reminder Management
// =========================================================

window.requireAdmin();

let allAppointments = [];
let allPatients     = [];
let allDoctors      = [];
let clinicName      = 'العيادة';

const tbody    = document.getElementById('notify-tbody');
const statusEl = document.getElementById('notify-status');
const searchEl = document.getElementById('search-notify');
const filterEl = document.getElementById('filter-date-notify');

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('logout-btn')?.addEventListener('click', async e => {
    e.preventDefault();
    try { window.adminSignOut(); } catch(_) {}
  });

  searchEl?.addEventListener('input', renderTable);
  filterEl?.addEventListener('change', renderTable);

  try {
    const s = window.isFirebaseConfigured
      ? (await db.collection('clinics').doc('settings').get()).data()
      : JSON.parse(localStorage.getItem('mock_firestore_clinics_settings') || '{}');
    if (s?.name) clinicName = s.name;
  } catch(_) {}

  await loadData();
});

async function loadData() {
  try {
    if (window.isFirebaseConfigured) {
      const [apptsSnap, patSnap, docSnap] = await Promise.all([
        db.collection('appointments').get(),
        db.collection('patients').get(),
        db.collection('doctors').get()
      ]);
      allAppointments = []; apptsSnap.forEach(d => allAppointments.push({ id: d.id, ...d.data() }));
      allPatients     = []; patSnap.forEach(d => allPatients.push({ id: d.id, ...d.data() }));
      allDoctors      = []; docSnap.forEach(d => allDoctors.push({ id: d.id, ...d.data() }));
    } else {
      allAppointments = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
      allPatients     = JSON.parse(localStorage.getItem('mock_patients') || '[]');
      allDoctors      = JSON.parse(localStorage.getItem('mock_doctors') || '[]');
    }

    renderTable();
  } catch (err) {
    console.error('loadData error:', err);
    showStatus('فشل تحميل البيانات: ' + err.message, 'error');
  }
}

function renderTable() {
  const query    = (searchEl?.value || '').trim().toLowerCase();
  const dateFilter = filterEl?.value || 'today';

  const todayStr    = new Date().toISOString().split('T')[0];
  const tomorrowObj = new Date(); tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowStr = tomorrowObj.toISOString().split('T')[0];

  let filtered = allAppointments.filter(a => a.status !== 'cancelled');

  if (dateFilter === 'today') {
    filtered = filtered.filter(a => a.appointmentDate === todayStr);
  } else if (dateFilter === 'tomorrow') {
    filtered = filtered.filter(a => a.appointmentDate === tomorrowStr);
  } else if (dateFilter === 'all') {
    filtered = filtered.filter(a => a.appointmentDate >= todayStr);
  }

  if (query) {
    filtered = filtered.filter(a => {
      const p = allPatients.find(x => x.id === a.patientId) || {};
      const name = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
      const phone = (p.phone || '').toLowerCase();
      return name.includes(query) || phone.includes(query) || (a.bookingRef || '').toLowerCase().includes(query);
    });
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7"><i class="fa-solid fa-bell-slash" style="font-size:2rem;color:var(--text-muted);"></i><p style="margin-top:.75rem;">لا توجد مواعيد مطابقة للتنبيه</p></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    const p = allPatients.find(x => x.id === a.patientId) || {};
    const d = allDoctors.find(doc => doc.id === a.doctorId) || {};
    const patientName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'غير معروف';
    const phone = p.phone || '';

    const formattedDate = a.appointmentDate
      ? new Date(a.appointmentDate + 'T00:00:00').toLocaleDateString('ar-EG', { weekday:'short', day:'numeric', month:'short' })
      : '--';

    const waLink = generateWhatsAppLink(phone, patientName, d.name || 'الطبيب', formattedDate, a.appointmentTime || '', a.queueNumber || '–', a.bookingRef || '–');

    return `
      <tr>
        <td style="font-weight:600;">${escHtml(patientName)}</td>
        <td dir="ltr" style="text-align:right;">${escHtml(phone || '--')}</td>
        <td>${escHtml(d.name || '--')}</td>
        <td>${formattedDate} (${a.appointmentTime || '--'})</td>
        <td><strong style="color:var(--secondary-color);">#${a.queueNumber || '–'}</strong></td>
        <td><span style="font-family:monospace;">${a.bookingRef || '--'}</span></td>
        <td>
          ${phone ? `
            <a href="${waLink}" target="_blank" class="whatsapp-btn">
              <i class="fa-brands fa-whatsapp"></i> إرسال واتساب
            </a>` : `<span style="color:var(--text-muted);font-size:.78rem;">لا يوجد رقم</span>`}
        </td>
      </tr>`;
  }).join('');
}

function generateWhatsAppLink(phone, patientName, doctorName, dateStr, timeStr, queueNum, bookingRef) {
  let cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '20' + cleanPhone.slice(1); // Default Egypt country code 20
  }

  const msg = `مرحباً ${patientName} 👋
نود تذكيركم بموعدكم القادم في ${clinicName}.
👨‍⚕️ الطبيب: ${doctorName}
📅 التاريخ: ${dateStr}
⏰ الوقت: ${timeStr}
🔢 رقمك في الدور: #${queueNum}
🔖 رقم الحجز: ${bookingRef}

يرجى الحضور قبل الموعد بـ 10 دقائق. نتمنى لكم دوام الصحة!`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
}

function showStatus(msg, type = 'success') {
  statusEl.textContent = msg;
  statusEl.className   = `status-bar ${type}`;
  statusEl.style.display = 'block';
  setTimeout(() => { statusEl.style.display = 'none'; }, 4000);
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
