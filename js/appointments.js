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
let lastVisibleAppt = null;
let isLoadingMore   = false;
let unsubscribeAppts = null;  // 🔥 real-time listener


// ---- DOM ----
const tbody      = document.getElementById('appt-tbody');
const statusEl   = document.getElementById('appt-status');
const searchEl   = document.getElementById('search-input');
const filterStatus = document.getElementById('filter-status');
const filterDoctor = document.getElementById('filter-doctor');
const filterDate   = document.getElementById('filter-date');

// ---- Status Labels ----
const STATUS_LABELS = {
  pending:    { label:'في الانتظار',  cls:'badge-pending',   icon:'fa-clock' },
  confirmed:  { label:'مؤكدة',        cls:'badge-confirmed', icon:'fa-check' },
  arrived:    { label:'وصل',          cls:'badge-confirmed', icon:'fa-walking' },
  in_session: { label:'داخل العيادة',  cls:'badge-confirmed', icon:'fa-stethoscope' },
  completed:  { label:'مكتملة',       cls:'badge-completed', icon:'fa-star' },
  cancelled:  { label:'ملغاة',        cls:'badge-cancelled', icon:'fa-ban' },
};

const PAY_LABELS = {
  paid:             { label:'مدفوع',                    cls:'badge-pay-paid' },
  unpaid:           { label:'غير مدفوع',               cls:'badge-pay-unpaid' },
  pending_approval: { label:'بانتظار مراجعة الإيصال', cls:'badge-pending' },
  rejected:         { label:'رفض الإيصال',             cls:'badge-cancelled' },
};

// =========================================================
// Init
// =========================================================
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('logout-btn').addEventListener('click', async e => {
    e.preventDefault();
    try { window.adminSignOut(); } catch(err) {}
  });

  document.getElementById('close-detail-btn').addEventListener('click', closeDetailModal);
  document.getElementById('detail-modal').addEventListener('click', e => { if (e.target.id === 'detail-modal') closeDetailModal(); });
  document.getElementById('export-btn').addEventListener('click', exportCSV);
  document.getElementById('reset-filters-btn').addEventListener('click', resetFilters);

  // History modal close
  document.getElementById('close-history-btn').addEventListener('click', () => {
    document.getElementById('history-modal').style.display = 'none';
  });
  document.getElementById('history-modal').addEventListener('click', e => {
    if (e.target.id === 'history-modal') document.getElementById('history-modal').style.display = 'none';
  });

  // Manual cleanup button (optional, injected by HTML if present)
  const cleanupBtn = document.getElementById('cleanup-expired-btn');
  if (cleanupBtn) cleanupBtn.addEventListener('click', () => autoCleanupExpiredAppointments(true));

  searchEl.addEventListener('input',       applyFilters);
  filterStatus.addEventListener('change',  applyFilters);
  filterDoctor.addEventListener('change',  applyFilters);
  filterDate.addEventListener('change',    applyFilters);

  await Promise.all([loadDoctors(), loadSpecialties(), loadPatients()]);
  await startAppointmentsListener();

  // Run cleanup silently in background (max once per day)
  autoCleanupExpiredAppointments(false);
});

// =========================================================
// Load helpers  (all use AppCache to avoid repeated reads)
// =========================================================
async function loadDoctors() {
  const cached = window.AppCache?.get('doctors');
  if (cached) {
    allDoctors = cached;
  } else if (window.isFirebaseConfigured) {
    const snap = await db.collection('doctors').get();
    if (snap.size > 100) console.warn('Warning: Fetched >100 docs in appointments.js from doctors without limit');
    allDoctors = [];
    snap.forEach(d => allDoctors.push({ id: d.id, ...d.data() }));
    window.AppCache?.set('doctors', allDoctors);
  } else {
    allDoctors = JSON.parse(localStorage.getItem('mock_doctors') || '[]');
  }

  // Populate filter dropdown
  filterDoctor.innerHTML = '<option value="">كل الأطباء</option>' +
    allDoctors.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
}

async function loadSpecialties() {
  const cached = window.AppCache?.get('specialties');
  if (cached) {
    allSpecialties = cached;
  } else if (window.isFirebaseConfigured) {
    const snap = await db.collection('specialties').get();
    if (snap.size > 100) console.warn('Warning: Fetched >100 docs in appointments.js from specialties without limit');
    allSpecialties = [];
    snap.forEach(d => allSpecialties.push({ id: d.id, ...d.data() }));
    window.AppCache?.set('specialties', allSpecialties);
  } else {
    allSpecialties = JSON.parse(localStorage.getItem('mock_specialties') || '[]');
  }
}

async function loadPatients() {
  const cached = window.AppCache?.get('patients');
  if (cached) {
    allPatients = cached;
  } else if (window.isFirebaseConfigured) {
    const snap = await db.collection('patients').get();
    if (snap.size > 100) console.warn('Warning: Fetched >100 docs in appointments.js from patients without limit');
    allPatients = [];
    snap.forEach(d => allPatients.push({ id: d.id, ...d.data() }));
    window.AppCache?.set('patients', allPatients);
  } else {
    allPatients = JSON.parse(localStorage.getItem('mock_patients') || '[]');
  }
}

// =========================================================
// 🔥 Real-time Appointments Listener
// =========================================================
async function startAppointmentsListener() {
  tbody.innerHTML = `<tr class="empty-row"><td colspan="10"><i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem;color:var(--primary-color);"></i><p style="margin-top:.75rem;">جاري التحميل...</p></td></tr>`;

  try {
    if (window.isFirebaseConfigured) {
      // Real-time listener for all appointments, sorted by createdAt desc
      unsubscribeAppts = db.collection('appointments')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .onSnapshot(
          (snapshot) => {
            allAppointments = [];
            lastVisibleAppt = snapshot.docs[snapshot.docs.length - 1] || null;
            snapshot.forEach(d => allAppointments.push({ id: d.id, ...d.data() }));

            updateStats();
            applyFilters();
            toggleLoadMoreBtn();
          },
          (err) => {
            console.error('Real-time appointments listener error:', err);
            tbody.innerHTML = `<tr class="empty-row"><td colspan="10" style="color:var(--danger);">خطأ في الاتصال: ${err.message}</td></tr>`;
          }
        );
    } else {
      // Mock mode: load once
      await loadAppointmentsMock();
    }
  } catch (err) {
    console.error('startAppointmentsListener error:', err);
    tbody.innerHTML = `<tr class="empty-row"><td colspan="10" style="color:var(--danger);">خطأ في التحميل: ${err.message}</td></tr>`;
  }
}

// =========================================================
// Mock Mode: Load Appointments Once
// =========================================================
async function loadAppointmentsMock() {
  const raw = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
  allAppointments = raw.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 50);
  lastVisibleAppt = allAppointments.length === 50 ? true : null;

  updateStats();
  applyFilters();
  toggleLoadMoreBtn();
}

// =========================================================
// Load More Appointments
// =========================================================
async function loadMoreAppointments() {
  if (isLoadingMore || !lastVisibleAppt) return;
  
  isLoadingMore = true;
  const btn = document.getElementById('load-more-btn');
  if (btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...`;

  try {
    if (window.isFirebaseConfigured) {
      const snap = await db.collection('appointments')
        .orderBy('createdAt', 'desc')
        .startAfter(lastVisibleAppt)
        .limit(50)
        .get();

      lastVisibleAppt = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      snap.forEach(d => allAppointments.push({ id: d.id, ...d.data() }));
    } else {
      const raw = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
      const sorted = raw.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      const nextBatch = sorted.slice(allAppointments.length, allAppointments.length + 50);
      allAppointments.push(...nextBatch);
      lastVisibleAppt = nextBatch.length === 50 ? true : null;
    }

    updateStats();
    applyFilters();
    toggleLoadMoreBtn();
  } catch (err) {
    console.error('loadMoreAppointments error:', err);
    showStatus('خطأ في تحميل المزيد: ' + err.message, 'error');
  } finally {
    isLoadingMore = false;
    if (btn) btn.innerHTML = `عرض المزيد`;
  }
}

function toggleLoadMoreBtn() {
  const btn = document.getElementById('load-more-btn');
  if (btn) {
    btn.style.display = lastVisibleAppt ? 'inline-block' : 'none';
  }
}

// =========================================================
// Auto-Cancel Expired Appointments
// Runs in background after page loads (max once per day).
// Finds all pending/confirmed with appointmentDate < today
// and cancels them + frees their availableSlots.
// Pass forceRun=true to skip the once-per-day guard.
// =========================================================
async function autoCleanupExpiredAppointments(forceRun = false) {
  const todayStr    = new Date().toISOString().split('T')[0];
  const storageKey  = 'appt_cleanup_last_run';
  const lastRun     = localStorage.getItem(storageKey);

  // Skip if already ran today (unless forced)
  if (!forceRun && lastRun === todayStr) return;

  try {
    let expiredAppts = [];

    if (window.isFirebaseConfigured) {
      const [pendingSnap, confirmedSnap] = await Promise.all([
        db.collection('appointments').where('status', '==', 'pending').get(),
        db.collection('appointments').where('status', '==', 'confirmed').get()
      ]);

      pendingSnap.forEach(d => {
        const data = d.data();
        if (data.appointmentDate && data.appointmentDate <= todayStr)
          expiredAppts.push({ id: d.id, ...data });
      });
      confirmedSnap.forEach(d => {
        const data = d.data();
        if (data.appointmentDate && data.appointmentDate <= todayStr)
          expiredAppts.push({ id: d.id, ...data });
      });

      if (expiredAppts.length === 0) {
        localStorage.setItem(storageKey, todayStr);
        return;
      }

      const now = new Date().toISOString();

      // Batch update in chunks of 490 (Firestore limit is 500 ops/batch)
      const CHUNK = 490;
      for (let i = 0; i < expiredAppts.length; i += CHUNK) {
        const chunk = expiredAppts.slice(i, i + CHUNK);
        const batch = db.batch();

        for (const appt of chunk) {
          // Cancel the appointment
          const apptRef = db.collection('appointments').doc(appt.id);
          batch.update(apptRef, { status: 'cancelled', updatedAt: now, cancelledBy: 'auto_expired' });

          // Free the slot if it has one
          if (appt.slotId) {
            const slotRef = db.collection('availableSlots').doc(appt.slotId);
            batch.update(slotRef, { isBooked: false, updatedAt: now });
          }
        }

        await batch.commit();
      }

      console.log(`[Cleanup] Auto-cancelled ${expiredAppts.length} expired appointment(s).`);

    } else {
      // Mock mode — cancel in localStorage
      const now   = new Date().toISOString();
      const appts = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
      const slots = JSON.parse(localStorage.getItem('mock_slots') || '[]');
      let changed = 0;

      appts.forEach(appt => {
        if ((appt.status === 'pending' || appt.status === 'confirmed')
            && appt.appointmentDate && appt.appointmentDate <= todayStr) {
          appt.status      = 'cancelled';
          appt.updatedAt   = now;
          appt.cancelledBy = 'auto_expired';
          changed++;

          // Free the slot
          if (appt.slotId) {
            const si = slots.findIndex(s => s.id === appt.slotId);
            if (si !== -1) slots[si].isBooked = false;
          }
        }
      });

      if (changed > 0) {
        localStorage.setItem('mock_appointments', JSON.stringify(appts));
        localStorage.setItem('mock_slots',        JSON.stringify(slots));
        console.log(`[Cleanup] Auto-cancelled ${changed} expired appointment(s) in mock.`);
      }
    }

    // Mark ran today
    localStorage.setItem(storageKey, todayStr);

    // Refresh the local list to reflect cancelled status
    const updatedIds = new Set(expiredAppts?.map(a => a.id) || []);
    if (updatedIds.size > 0) {
      allAppointments.forEach(a => {
        if (updatedIds.has(a.id)) a.status = 'cancelled';
      });
      updateStats();
      applyFilters();

      if (forceRun) {
        showStatus(`✔ تم تلقائياً إلغاء ${updatedIds.size} موعد منتهٍ وتحرير مواعيده.`, 'success');
      }
    }

  } catch (err) {
    console.error('[Cleanup] autoCleanupExpiredAppointments error:', err);
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
        <td style="white-space:nowrap;">
          ${a.appointmentTime || '--'}
          ${a.consultationType === 'online' ? '<br><span class="badge badge-success" style="font-size:.65rem;padding:.2rem .4rem;margin-top:.2rem;"><i class="fa-solid fa-video"></i> أونلاين</span>' : ''}
        </td>
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
    const now  = new Date().toISOString();
    const appt = allAppointments.find(a => a.id === id);
    const slotId = appt?.slotId || null;

    if (window.isFirebaseConfigured) {
      // Update appointment status
      await db.collection('appointments').doc(id).update({ status: newStatus, updatedAt: now });

      // Sync the slot availability
      if (slotId) {
        const slotRef = db.collection('availableSlots').doc(slotId);
        const slotDoc = await slotRef.get();
        if (slotDoc.exists) {
          if (newStatus === 'cancelled') {
            // Free the slot so others can book it
            await slotRef.update({ isBooked: false, updatedAt: now });
          } else if (newStatus === 'pending' || newStatus === 'confirmed') {
            // Re-lock the slot if restoring from cancelled
            await slotRef.update({ isBooked: true, updatedAt: now });
          }
        }
      }
    } else {
      // Mock mode
      const appts = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
      const idx   = appts.findIndex(a => a.id === id);
      if (idx !== -1) { appts[idx].status = newStatus; appts[idx].updatedAt = now; }
      localStorage.setItem('mock_appointments', JSON.stringify(appts));

      // Sync slot in mock storage
      if (slotId) {
        const slots = JSON.parse(localStorage.getItem('mock_slots') || '[]');
        const si    = slots.findIndex(s => s.id === slotId);
        if (si !== -1) {
          slots[si].isBooked = newStatus !== 'cancelled';
          localStorage.setItem('mock_slots', JSON.stringify(slots));
        }
      }
    }

    // Update local array
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
    ${a.serviceName ? `<div class="detail-row"><span class="detail-label">الخدمة</span><span class="detail-val" style="color:var(--secondary-color);font-weight:700;">${escHtml(a.serviceName)}</span></div>` : ''}
    <div class="detail-row"><span class="detail-label">نوع الكشف</span><span class="detail-val">${a.consultationType === 'online' ? '💻 أونلاين' : '🏥 في العيادة'}</span></div>
    <div class="detail-row"><span class="detail-label">التاريخ</span><span class="detail-val">${dateFormatted}</span></div>
    <div class="detail-row"><span class="detail-label">الوقت</span><span class="detail-val">${a.appointmentTime || '--'}</span></div>
    <div class="detail-row"><span class="detail-label">رقم الدور</span><span class="detail-val" style="color:var(--secondary-color);">${a.queueNumber ? `#${a.queueNumber}` : '--'}</span></div>
    <div class="detail-row"><span class="detail-label">الحالة</span><span class="badge ${st.cls}">${st.label}</span></div>
    <div class="detail-row"><span class="detail-label">طريقة الدفع</span><span class="detail-val">${a.paymentMethod === 'vodafone' ? 'فودافون كاش' : a.paymentMethod === 'instapay' ? 'InstaPay' : a.paymentMethod === 'online' ? 'دفع إلكتروني' : 'كاش عند الحضور'}</span></div>
    <div class="detail-row"><span class="detail-label">حالة الدفع</span><span class="badge ${pay.cls}">${pay.label}</span></div>
    <div class="detail-row"><span class="detail-label">سعر الكشف</span><span class="detail-val" style="color:var(--success);">${a.price ? a.price + ' ج.م' : '--'}</span></div>
    <div class="detail-row"><span class="detail-label">تاريخ الحجز</span><span class="detail-val" style="font-size:.85rem;">${createdAt}</span></div>
    ${a.receiptUrl ? `
    <div style="margin-top:1rem;">
      <div style="font-weight:700;font-size:.9rem;margin-bottom:.5rem;color:var(--text-primary);"><i class="fa-solid fa-file-image" style="color:var(--secondary-color);margin-left:.4rem;"></i> إيصال التحويل</div>
      <img src="${a.receiptUrl}" alt="إيصال" style="width:100%;max-height:280px;object-fit:contain;border-radius:10px;border:1px solid var(--border-color);cursor:pointer;" onclick="window.open('${a.receiptUrl}','_blank')">
      <div style="font-size:.75rem;color:var(--text-muted);margin-top:.3rem;text-align:center;"><i class="fa-solid fa-magnifying-glass"></i> اضغط للتكبير</div>
    </div>` : ''}`;

  // Action buttons inside modal
  // Build WhatsApp link if patient has phone and appointment is online
  const patientPhone = (patient.phone || '').replace(/\D/g, '');
  const waPhone = patientPhone.startsWith('0') ? '20' + patientPhone.slice(1) : patientPhone;
  const videoLink = `${window.location.origin}/public/video-call.html?ref=${encodeURIComponent(a.bookingRef || a.id)}&role=patient`;
  const waMsg = encodeURIComponent(
    `مرحباً 👋
تم تأكيد جلستك الأونلاين بتاريخ ${a.appointmentDate || '--'} الساعة ${a.appointmentTime || '--'}.
رابط دخول الجلسة:
${videoLink}
رقم الحجز: ${a.bookingRef || a.id}`
  );

  document.getElementById('detail-actions').innerHTML = `
    <button class="btn btn-secondary" onclick="closeDetailModal()"><i class="fa-solid fa-xmark"></i> إغلاق</button>
    ${a.paymentStatus === 'pending_approval' ? `
      <button class="btn btn-primary" onclick="approveReceipt('${a.id}');" style="background:var(--success);border-color:var(--success);">
        <i class="fa-solid fa-circle-check"></i> تأكيد الدفع
      </button>
      <button class="btn btn-danger" onclick="rejectReceipt('${a.id}');">
        <i class="fa-solid fa-xmark"></i> رفض الإيصال
      </button>` : ''}
    ${(a.consultationType === 'online' && a.status !== 'cancelled' && a.status !== 'completed') ? `
      <a href="../public/video-call.html?ref=${encodeURIComponent(a.bookingRef)}&role=doctor" target="_blank" class="btn btn-primary" style="background:linear-gradient(135deg, #10b981, #059669);border-color:transparent;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:0.4rem;">
        <i class="fa-solid fa-video"></i> بدء الجلسة 🎥
      </a>` : ''}
    ${(a.consultationType === 'online' && waPhone.length >= 10 && a.status !== 'cancelled' && a.status !== 'completed') ? `
      <a href="https://wa.me/${waPhone}?text=${waMsg}" target="_blank" class="btn" style="background:linear-gradient(135deg,#22c55e,#16a34a);border-color:transparent;color:#fff;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:0.4rem;">
        <i class="fa-brands fa-whatsapp"></i> إرسال رابط الجلسة عبر واتساب
      </a>` : ''}
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
      </button>` : ''}
    ${(a.consultationType === 'online' && (a.status === 'confirmed' || a.status === 'pending') && !a.sessionStartedByDoctor) ? `
      <button class="btn btn-primary" onclick="startSessionNow('${a.id}')" style="background:linear-gradient(135deg,#6d28d9,#7c3aed);border-color:transparent;">
        <i class="fa-solid fa-play"></i> فتح الجلسة الآن
      </button>` : ''}
    ${(a.consultationType === 'online' && a.sessionStartedByDoctor) ? `
      <span style="display:inline-flex;align-items:center;gap:.4rem;padding:.4rem .8rem;border-radius:8px;background:rgba(16,185,129,.1);color:var(--success);font-size:.85rem;font-weight:600;border:1px solid rgba(16,185,129,.3);">
        <i class="fa-solid fa-circle fa-beat" style="font-size:.5rem;"></i> الجلسة مفتوحة للمريض
      </span>` : ''}
    <button class="btn btn-secondary" onclick="openHistoryModal('${a.patientId}')" style="border-color:var(--secondary-color);color:var(--secondary-color);">
      <i class="fa-solid fa-clock-rotate-left"></i> التاريخ المرضي
    </button>`;

  document.getElementById('detail-modal').style.display = 'flex';
}

function closeDetailModal() {
  document.getElementById('detail-modal').style.display = 'none';
}

// =========================================================
// Export CSV
// =========================================================
function exportCSV() {
  const headers = ['رقم الحجز','المريض','الهاتف','الطبيب','التخصص','التاريخ','الوقت','نوع الجلسة','الدور','الحالة','الدفع','السعر'];

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
      a.consultationType === 'online' ? 'أونلاين' : 'في العيادة',
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
// Cleanup on page unload
// =========================================================
window.addEventListener('beforeunload', () => {
  if (unsubscribeAppts) unsubscribeAppts();
});

// =========================================================
// Receipt Approve / Reject
// =========================================================
async function approveReceipt(id) {
  try {
    const update = { paymentStatus: 'paid', status: 'confirmed', updatedAt: new Date().toISOString() };
    if (window.isFirebaseConfigured) {
      await db.collection('appointments').doc(id).update(update);
    }
    const appt = allAppointments.find(a => a.id === id);
    if (appt) Object.assign(appt, update);
    if (!window.isFirebaseConfigured) localStorage.setItem('mock_appointments', JSON.stringify(allAppointments));
    closeDetailModal();
    renderTable();
    showStatus('✔ تم تأكيد الدفع وتأكيد الحجز بنجاح.', 'success');
  } catch (err) {
    showStatus('خطأ في تأكيد الدفع: ' + err.message, 'error');
  }
}

async function rejectReceipt(id) {
  if (!confirm('هل أنت متأكد من رفض الإيصال؟ سيظل الحجز بحالة غير مدفوع.')) return;
  try {
    const update = { paymentStatus: 'rejected', updatedAt: new Date().toISOString() };
    if (window.isFirebaseConfigured) {
      await db.collection('appointments').doc(id).update(update);
    }
    const appt = allAppointments.find(a => a.id === id);
    if (appt) Object.assign(appt, update);
    if (!window.isFirebaseConfigured) localStorage.setItem('mock_appointments', JSON.stringify(allAppointments));
    closeDetailModal();
    renderTable();
    showStatus('❌ تم رفض الإيصال. يرجى التواصل مع المريض لإعادة التحويل.', 'error');
  } catch (err) {
    showStatus('خطأ في رفض الإيصال: ' + err.message, 'error');
  }
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

// =========================================================
// Start Session Now (Doctor opens online session)
// =========================================================
async function startSessionNow(apptId) {
  try {
    const now = new Date().toISOString();
    if (window.isFirebaseConfigured) {
      await db.collection('appointments').doc(apptId).update({ sessionStartedByDoctor: true, updatedAt: now });
    } else {
      const appts = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
      const idx   = appts.findIndex(a => a.id === apptId);
      if (idx !== -1) { appts[idx].sessionStartedByDoctor = true; appts[idx].updatedAt = now; }
      localStorage.setItem('mock_appointments', JSON.stringify(appts));
    }

    // Update local state
    const appt = allAppointments.find(a => a.id === apptId);
    if (appt) appt.sessionStartedByDoctor = true;

    showStatus('✔ تم فتح الجلسة. يمكن للمريض الآن الانضمام.', 'success');
    closeDetailModal();
    renderTable();
  } catch (err) {
    showStatus('فشل فتح الجلسة: ' + err.message, 'error');
  }
}

// =========================================================
// Patient History Modal
// =========================================================
async function openHistoryModal(patientId) {
  if (!patientId) {
    alert('لا يوجد معرف مريض لهذا الحجز.');
    return;
  }

  const modal = document.getElementById('history-modal');
  const body  = document.getElementById('history-body');
  body.innerHTML = '<div style="text-align:center;padding:2rem;"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</div>';
  modal.style.display = 'flex';

  try {
    const patient = allPatients.find(p => p.id === patientId) || {};
    const patientName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'مريض';

    let history = [];

    if (window.isFirebaseConfigured) {
      const snap = await db.collection('appointments')
        .where('patientId', '==', patientId)
        .get();
      snap.forEach(d => history.push({ id: d.id, ...d.data() }));
    } else {
      const all = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
      history = all.filter(a => a.patientId === patientId);
    }

    // Sort client-side to avoid Firebase composite index requirement
    history.sort((a, b) => {
      const dateA = a.appointmentDate || '';
      const dateB = b.appointmentDate || '';
      return dateB.localeCompare(dateA); // Descending order
    });

    if (history.length === 0) {
      body.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted);"><i class="fa-solid fa-folder-open" style="font-size:2.5rem;opacity:.4;"></i><p style="margin-top:1rem;">لا يوجد تاريخ مرضي مسجّل لهذا المريض.</p></div>`;
      return;
    }

    const STATUS_LABELS_LOCAL = {
      pending:    { label:'في الانتظار', cls:'badge-pending'   },
      confirmed:  { label:'مؤكدة',       cls:'badge-confirmed' },
      arrived:    { label:'وصل',         cls:'badge-confirmed' },
      in_session: { label:'داخل الجلسة',  cls:'badge-confirmed' },
      completed:  { label:'مكتملة',      cls:'badge-completed' },
      cancelled:  { label:'ملغاة',       cls:'badge-cancelled' },
    };

    body.innerHTML = `
      <div style="margin-bottom:1rem;padding-bottom:.75rem;border-bottom:1px solid var(--border-color);">
        <div style="font-size:.85rem;color:var(--text-muted);">المريض</div>
        <div style="font-weight:700;font-size:1.05rem;">${escHtml(patientName)}</div>
        ${patient.phone ? `<div style="font-size:.8rem;color:var(--secondary-color);">${escHtml(patient.phone)}</div>` : ''}
        <div style="margin-top:.5rem;font-size:.8rem;color:var(--text-muted);">إجمالي الجلسات: <strong style="color:var(--primary-color);">${history.length}</strong></div>
      </div>
      ${history.map(a => {
        const doctor    = allDoctors.find(d => d.id === a.doctorId) || {};
        const specialty = allSpecialties.find(s => s.id === a.specialtyId) || {};
        const st        = STATUS_LABELS_LOCAL[a.status] || { label: a.status, cls:'badge-pending' };
        const dateLabel = a.appointmentDate
          ? new Date(a.appointmentDate + 'T00:00:00').toLocaleDateString('ar-EG', { weekday:'short', year:'numeric', month:'short', day:'numeric' })
          : '--';
        const createdAtLabel = a.createdAt ? new Date(a.createdAt).toLocaleDateString('ar-EG') : '--';
        return `
          <div style="background:rgba(255,255,255,.03);border:1px solid var(--border-color);border-radius:10px;padding:1rem;margin-bottom:.75rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem;flex-wrap:wrap;gap:.3rem;">
              <span style="font-family:monospace;font-size:.8rem;color:var(--text-muted);">${a.bookingRef || a.id?.slice(0,8) || '--'}</span>
              <span class="badge ${st.cls}">${st.label}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem .75rem;font-size:.85rem;">
              <div><span style="color:var(--text-muted);">الطبيب: </span><strong>${escHtml(doctor.name || '--')}</strong></div>
              <div><span style="color:var(--text-muted);">التخصص: </span><strong>${escHtml(specialty.name || '--')}</strong></div>
              <div><span style="color:var(--text-muted);">التاريخ: </span><strong>${dateLabel}</strong></div>
              <div><span style="color:var(--text-muted);">الوقت: </span><strong>${a.appointmentTime || '--'}</strong></div>
              ${a.serviceName ? `<div><span style="color:var(--text-muted);">الخدمة: </span><strong style="color:var(--secondary-color);">${escHtml(a.serviceName)}</strong></div>` : ''}
              ${a.price ? `<div><span style="color:var(--text-muted);">السعر: </span><strong style="color:var(--success);">${a.price} ج.م</strong></div>` : ''}
              <div><span style="color:var(--text-muted);">النوع: </span><strong>${a.consultationType === 'online' ? '💻 أونلاين' : '🏥 عيادة'}</strong></div>
              <div><span style="color:var(--text-muted);">تاريخ الحجز: </span><strong>${createdAtLabel}</strong></div>
            </div>
          </div>`;
      }).join('')}`;

  } catch (err) {
    console.error('openHistoryModal error:', err);
    body.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--danger);">خطأ في تحميل البيانات: ${err.message}</div>`;
  }
}