// =========================================================
// reception.js  –  Reception Queue Screen
// =========================================================

window.requireAdmin();

// ---- State ----
let todayStr     = new Date().toISOString().split('T')[0];
let appointments = [];   // today's appointments enriched
let allDoctors   = [];
let allPatients  = [];
let activeDocFilter = 'all';
let refreshTimer = null;
let clinicName   = 'العيادة';

// ---- Status config ----
const RECEPTION_STATUSES = {
  pending:    { label:'في الانتظار',  badge:'badge-waiting',    icon:'fa-clock' },
  confirmed:  { label:'تم التأكيد',   badge:'badge-arrived',    icon:'fa-check' },
  arrived:    { label:'وصل',           badge:'badge-arrived',    icon:'fa-walking' },
  in_session: { label:'داخل العيادة', badge:'badge-in_session', icon:'fa-stethoscope' },
  completed:  { label:'مكتملة',       badge:'badge-done',       icon:'fa-circle-check' },
  cancelled:  { label:'ملغي',          badge:'badge-cancelled',  icon:'fa-ban' },
};

// =========================================================
// Init
// =========================================================
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('logout-btn').addEventListener('click', async e => {
    e.preventDefault();
    try { window.adminSignOut(); } catch(_) {}
  });

  document.getElementById('refresh-btn').addEventListener('click', loadQueue);
  document.getElementById('display-mode-btn').addEventListener('click', enterDisplayMode);

  // Load clinic name
  try {
    const s = window.isFirebaseConfigured
      ? (await db.collection('clinics').doc('settings').get()).data()
      : JSON.parse(localStorage.getItem('mock_firestore_clinics_settings') || '{}');
    if (s?.name) { clinicName = s.name; document.getElementById('disp-clinic-name').textContent = clinicName; }
  } catch(_) {}

  // Today label
  const todayFormatted = new Date(todayStr + 'T00:00:00').toLocaleDateString('ar-EG', {
    weekday:'long', year:'numeric', month:'long', day:'numeric'
  });
  document.getElementById('today-label').textContent = `مواعيد يوم: ${todayFormatted}`;

  startClock();
  await loadDoctors();
  await loadPatients();
  await loadQueue();

  // Auto-refresh every 30s
  refreshTimer = setInterval(loadQueue, 30000);
});

// =========================================================
// Live Clock
// =========================================================
function startClock() {
  function tick() {
    const now   = new Date();
    const timeStr = now.toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
    const dateStr = now.toLocaleDateString('ar-EG', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    document.getElementById('live-clock').textContent = timeStr;
    document.getElementById('live-date').textContent  = dateStr;
    if (document.getElementById('disp-clock')) {
      document.getElementById('disp-clock').textContent = timeStr;
      document.getElementById('disp-date').textContent  = dateStr;
    }
  }
  tick();
  setInterval(tick, 1000);
}

// =========================================================
// Load Doctors
// =========================================================
async function loadDoctors() {
  if (window.isFirebaseConfigured) {
    const snap = await db.collection('doctors').where('isActive','==',true).get();
    allDoctors = [];
    snap.forEach(d => allDoctors.push({ id: d.id, ...d.data() }));
  } else {
    const raw = JSON.parse(localStorage.getItem('mock_doctors') || '[]');
    allDoctors = raw.filter(d => d.isActive !== false);
  }
}

// =========================================================
// Load Patients
// =========================================================
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
// Load Today's Queue
// =========================================================
async function loadQueue() {
  try {
    let raw = [];

    if (window.isFirebaseConfigured) {
      const snap = await db.collection('appointments')
        .where('appointmentDate', '==', todayStr)
        .get();
      snap.forEach(d => raw.push({ id: d.id, ...d.data() }));
    } else {
      raw = JSON.parse(localStorage.getItem('mock_appointments') || '[]')
        .filter(a => a.appointmentDate === todayStr);
    }

    // Sort by queue number then by time
    raw.sort((a, b) => {
      if (a.queueNumber && b.queueNumber) return a.queueNumber - b.queueNumber;
      return (a.appointmentTime || '').localeCompare(b.appointmentTime || '');
    });

    appointments = raw;
    renderTabs();
    renderQueue();
    if (document.body.classList.contains('display-mode')) renderDisplayMode();

  } catch (err) {
    console.error('loadQueue error:', err);
    showStatus('خطأ في تحميل القائمة: ' + err.message, 'error');
  }
}

// =========================================================
// Render Doctor Filter Tabs
// =========================================================
function renderTabs() {
  const tabsEl = document.getElementById('doc-tabs');

  // Find doctors who have appointments today
  const docIdsWithAppts = [...new Set(appointments.map(a => a.doctorId).filter(Boolean))];
  const docsToday = allDoctors.filter(d => docIdsWithAppts.includes(d.id));

  const totalActive = appointments.filter(a => !['completed','cancelled'].includes(a.status || 'pending')).length;

  let html = `
    <button class="doc-tab ${activeDocFilter === 'all' ? 'active' : ''}" onclick="setDocFilter('all')">
      <i class="fa-solid fa-users"></i> الكل
      <span class="tab-count">${totalActive}</span>
    </button>`;

  docsToday.forEach(doc => {
    const docAppts   = appointments.filter(a => a.doctorId === doc.id);
    const waiting    = docAppts.filter(a => !['completed','cancelled'].includes(a.status || 'pending')).length;
    const isActive   = activeDocFilter === doc.id;
    html += `
      <button class="doc-tab ${isActive ? 'active' : ''}" onclick="setDocFilter('${doc.id}')">
        <i class="fa-solid fa-user-doctor"></i> ${escHtml(doc.name)}
        <span class="tab-count">${waiting}</span>
      </button>`;
  });

  tabsEl.innerHTML = html;
}

function setDocFilter(id) {
  activeDocFilter = id;
  renderTabs();
  renderQueue();
}

// =========================================================
// Render Queue Grid
// =========================================================
function renderQueue() {
  const grid = document.getElementById('queue-grid');

  let list = activeDocFilter === 'all'
    ? appointments
    : appointments.filter(a => a.doctorId === activeDocFilter);

  // Separate active vs completed/cancelled
  const active    = list.filter(a => !['completed','cancelled'].includes(a.status || 'pending'));
  const finished  = list.filter(a => ['completed','cancelled'].includes(a.status || 'pending'));
  const displayed = [...active, ...finished];

  if (displayed.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <i class="fa-solid fa-calendar-check"></i>
        <p>لا توجد مواعيد لهذا اليوم</p>
      </div>`;
    return;
  }

  grid.innerHTML = displayed.map(a => renderQueueItem(a)).join('');
}

function renderQueueItem(a) {
  const patient = allPatients.find(p => p.id === a.patientId) || {};
  const doctor  = allDoctors.find(d => d.id === a.doctorId)   || {};
  const name    = a.patientName || `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'مريض بدون اسم';
  const phone   = a.patientPhone || patient.phone || '';
  const status  = a.status || 'pending';
  const stConf  = RECEPTION_STATUSES[status] || RECEPTION_STATUSES.pending;
  const isPaid  = a.paymentStatus === 'paid';

  // Build action buttons
  let actions = '';
  if (status === 'pending' || status === 'confirmed') {
    actions += `<button class="q-btn arrived" onclick="setStatus('${a.id}','arrived')"><i class="fa-solid fa-walking"></i> تأكيد الوصول</button>`;
  }
  if (status === 'arrived') {
    actions += `<button class="q-btn session" onclick="setStatus('${a.id}','in_session')"><i class="fa-solid fa-stethoscope"></i> أدخل للدكتور</button>`;
  }
  if (status === 'in_session') {
    actions += `<button class="q-btn done" onclick="setStatus('${a.id}','completed')"><i class="fa-solid fa-check"></i> إنهاء الكشف</button>`;
  }
  if (!['completed','cancelled'].includes(status)) {
    actions += `<button class="q-btn cancel" onclick="setStatus('${a.id}','cancelled')"><i class="fa-solid fa-ban"></i> إلغاء</button>`;
  }

  return `
    <div class="queue-item status-${status}" id="qi-${a.id}">
      <div class="queue-num" title="رقم الدور">#${a.queueNumber || '–'}</div>
      <div class="queue-info">
        <div class="queue-name">${escHtml(name)}</div>
        ${phone ? `<div class="queue-phone"><i class="fa-solid fa-phone" style="font-size:.7rem;margin-left:.3rem;"></i>${escHtml(phone)}</div>` : ''}
        <div class="queue-time">
          <i class="fa-solid fa-clock" style="font-size:.7rem;margin-left:.3rem;"></i>${a.appointmentTime || '--'}
          ${activeDocFilter === 'all' ? `&nbsp;·&nbsp;<i class="fa-solid fa-user-doctor" style="font-size:.7rem;margin-left:.2rem;"></i>${escHtml(doctor.name || '')}` : ''}
        </div>
        <div style="margin-top:.4rem; display:flex; gap:.3rem; flex-wrap:wrap; align-items:center;">
          <span class="queue-status-badge ${stConf.badge}">
            <i class="fa-solid ${stConf.icon}" style="font-size:.65rem;margin-left:.25rem;"></i>
            ${stConf.label}
          </span>
          <span class="queue-status-badge ${isPaid ? 'badge-done' : 'badge-waiting'}" style="font-size:.65rem;">
            <i class="fa-solid ${isPaid ? 'fa-money-bill-check' : 'fa-hand-holding-dollar'}" style="margin-left:.2rem;"></i>
            ${isPaid ? 'مدفوع' : 'غير مدفوع (نقداً)'}
          </span>
        </div>
      </div>
      ${actions ? `<div class="queue-actions">${actions}</div>` : ''}
    </div>`;
}

// =========================================================
// Update Queue Status
// =========================================================
async function setStatus(id, newStatus) {
  try {
    const now = new Date().toISOString();

    // Automatic Payment Confirmation:
    // When marked arrived, in_session, or completed, auto-mark cash appointments as paid!
    const currentAppt = appointments.find(a => a.id === id);
    let shouldAutoPay = false;
    if (['arrived', 'in_session', 'completed'].includes(newStatus)) {
      if (!currentAppt || currentAppt.paymentStatus !== 'paid') {
        shouldAutoPay = true;
      }
    }

    const updateFields = {
      status: newStatus,
      updatedAt: now
    };
    if (shouldAutoPay) {
      updateFields.paymentStatus = 'paid';
    }

    if (window.isFirebaseConfigured) {
      await db.collection('appointments').doc(id).update(updateFields);
    } else {
      const appts = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
      const idx   = appts.findIndex(a => a.id === id);
      if (idx !== -1) {
        Object.assign(appts[idx], updateFields);
      }
      localStorage.setItem('mock_appointments', JSON.stringify(appts));
    }

    // Update local state
    const idx2 = appointments.findIndex(a => a.id === id);
    if (idx2 !== -1) {
      Object.assign(appointments[idx2], updateFields);
    }

    renderTabs();
    renderQueue();
    if (document.body.classList.contains('display-mode')) renderDisplayMode();

  } catch (err) {
    showStatus('فشل التحديث: ' + err.message, 'error');
  }
}

// =========================================================
// Display Mode (TV Screen)
// =========================================================
function enterDisplayMode() {
  document.body.classList.add('display-mode');
  renderDisplayMode();
}

function exitDisplayMode() {
  document.body.classList.remove('display-mode');
}

function renderDisplayMode() {
  const body = document.getElementById('display-body');

  // Group by doctor
  const docIds = [...new Set(appointments.map(a => a.doctorId).filter(Boolean))];

  if (docIds.length === 0) {
    body.innerHTML = `<div class="empty-state" style="padding:5rem;"><i class="fa-solid fa-calendar-check" style="font-size:4rem;opacity:.3;display:block;margin-bottom:1rem;"></i><p style="font-size:1.5rem;">لا توجد مواعيد اليوم</p></div>`;
    return;
  }

  body.innerHTML = docIds.map(docId => {
    const doc      = allDoctors.find(d => d.id === docId) || {};
    const docAppts = appointments.filter(a => a.doctorId === docId);
    const current  = docAppts.find(a => a.status === 'in_session');
    const waiting  = docAppts.filter(a => ['pending','confirmed','arrived'].includes(a.status || 'pending'));

    const currentPatient = current ? (allPatients.find(p => p.id === current.patientId) || {}) : null;
    const currentName    = currentPatient ? `${currentPatient.firstName||''} ${currentPatient.lastName||''}`.trim() : null;

    return `
      <div class="display-doctor-section">
        <div class="display-doctor-name">
          <i class="fa-solid fa-user-doctor" style="color:var(--primary-color);margin-left:.5rem;"></i>
          ${escHtml(doc.name || 'طبيب')}
        </div>

        ${current ? `
          <div class="display-current-card">
            <div class="display-queue-num">${current.queueNumber || '–'}</div>
            <div>
              <div class="display-current-label">داخل العيادة الآن</div>
              <div class="display-current-name">${escHtml(currentName || 'مريض')}</div>
              <div style="color:var(--text-muted);font-size:.85rem;margin-top:.25rem;">
                <i class="fa-solid fa-clock" style="margin-left:.3rem;"></i>${current.appointmentTime || ''}
              </div>
            </div>
          </div>` : `
          <div class="display-current-card" style="opacity:.4;">
            <div class="display-queue-num" style="color:var(--text-muted);">–</div>
            <div>
              <div class="display-current-label">لا يوجد مريض حالياً</div>
              <div class="display-current-name" style="color:var(--text-muted);">في انتظار المرضى</div>
            </div>
          </div>`}

        ${waiting.length > 0 ? `
          <div style="color:var(--text-muted);font-size:.8rem;margin-bottom:.5rem;">
            في الانتظار (${waiting.length}):
          </div>
          <div class="display-waiting-list">
            ${waiting.map(a => {
              const p = allPatients.find(x => x.id === a.patientId) || {};
              const n = `${p.firstName||''} ${p.lastName||''}`.trim() || 'مريض';
              return `<div class="display-waiting-pill">
                <span style="color:var(--primary-color);font-weight:800;">#${a.queueNumber||'–'}</span>
                ${escHtml(n)}
              </div>`;
            }).join('')}
          </div>` : `<div style="color:var(--text-muted);font-size:.85rem;">لا يوجد مرضى في الانتظار</div>`}
      </div>`;
  }).join('');
}

// =========================================================
// Helpers
// =========================================================
function showStatus(msg, type = 'success') {
  const el = document.getElementById('rec-status');
  el.textContent = msg;
  el.className   = `status-bar ${type}`;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}
