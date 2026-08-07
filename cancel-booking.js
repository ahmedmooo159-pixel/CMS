// =========================================================
// cancel-booking.js  –  Patient Self-Cancellation Logic
// =========================================================

let foundAppointment = null; // The appointment object found by lookup

// =========================================================
// Load clinic name for branding
// =========================================================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (window.isFirebaseConfigured) {
      const doc = await db.collection('clinics').doc('settings').get();
      if (doc.exists && doc.data().name) {
        document.getElementById('clinic-name').textContent = doc.data().name;
      }
    } else {
      const s = JSON.parse(localStorage.getItem('mock_firestore_clinics_settings') || '{}');
      if (s.name) document.getElementById('clinic-name').textContent = s.name;
    }
  } catch (_) {}

  // Allow pressing Enter in the form inputs to trigger search
  document.getElementById('input-ref').addEventListener('keydown', e => { if (e.key === 'Enter') searchAppointment(); });
  document.getElementById('input-phone').addEventListener('keydown', e => { if (e.key === 'Enter') searchAppointment(); });

  // Pre-fill booking ref from URL param if present (e.g. ?ref=BK-XXXX)
  const urlRef = new URLSearchParams(window.location.search).get('ref');
  if (urlRef) document.getElementById('input-ref').value = urlRef.trim().toUpperCase();
});

// =========================================================
// Search for appointment by booking ref + phone
// =========================================================
async function searchAppointment() {
  const rawRef   = document.getElementById('input-ref').value.trim().toUpperCase();
  const rawPhone = document.getElementById('input-phone').value.trim();

  if (!rawRef || !rawPhone) {
    showStatus('يرجى إدخال رقم الحجز ورقم الهاتف.', 'error');
    return;
  }

  const btn = document.getElementById('search-btn');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري البحث...`;
  hideStatus();

  try {
    let appt = null;

    if (window.isFirebaseConfigured) {
      // Search by bookingRef
      const snap = await db.collection('appointments')
        .where('bookingRef', '==', rawRef)
        .limit(1)
        .get();

      if (!snap.empty) {
        const doc = snap.docs[0];
        appt = { id: doc.id, ...doc.data() };
      }
    } else {
      // Mock mode
      const all  = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
      appt = all.find(a => (a.bookingRef || '').toUpperCase() === rawRef) || null;
    }

    if (!appt) {
      showStatus('لم يتم العثور على حجز بهذا الرقم. تأكد من الرقم المرجعي.', 'error');
      return;
    }

    // Verify phone matches (patientPhone field stored at booking, or look up patient)
    const apptPhone = (appt.patientPhone || '').replace(/\s/g, '');
    const inputPhone = rawPhone.replace(/\s/g, '');

    if (!apptPhone) {
      // Try patients collection
      let matchPhone = false;
      if (window.isFirebaseConfigured && appt.patientId) {
        const pDoc = await db.collection('patients').doc(appt.patientId).get();
        if (pDoc.exists) {
          matchPhone = (pDoc.data().phone || '').replace(/\s/g, '') === inputPhone;
        }
      } else if (appt.patientId) {
        const patients = JSON.parse(localStorage.getItem('mock_patients') || '[]');
        const p = patients.find(x => x.id === appt.patientId);
        matchPhone = p && (p.phone || '').replace(/\s/g, '') === inputPhone;
      }
      if (!matchPhone) {
        showStatus('رقم الهاتف غير مطابق للحجز. تأكد من الرقم المسجّل.', 'error');
        return;
      }
    } else if (apptPhone !== inputPhone) {
      showStatus('رقم الهاتف غير مطابق للحجز. تأكد من الرقم المسجّل.', 'error');
      return;
    }

    foundAppointment = appt;
    renderResult(appt);

  } catch (err) {
    console.error('searchAppointment error:', err);
    showStatus('حدث خطأ أثناء البحث: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> البحث عن الحجز`;
  }
}

// =========================================================
// Render appointment details in the result card
// =========================================================
async function renderResult(appt) {
  // Lookup doctor name
  let doctorName = appt.doctorId || '--';
  try {
    if (window.isFirebaseConfigured) {
      const dDoc = await db.collection('doctors').doc(appt.doctorId).get();
      if (dDoc.exists) doctorName = dDoc.data().name || doctorName;
    } else {
      const docs = JSON.parse(localStorage.getItem('mock_doctors') || '[]');
      const d = docs.find(x => x.id === appt.doctorId);
      if (d) doctorName = d.name;
    }
  } catch (_) {}

  // Populate fields
  document.getElementById('res-ref').textContent    = appt.bookingRef || appt.id || '--';
  document.getElementById('res-doctor').textContent = doctorName;

  if (appt.appointmentDate) {
    const d = new Date(appt.appointmentDate + 'T00:00:00');
    document.getElementById('res-date').textContent =
      d.toLocaleDateString('ar-EG', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  }

  document.getElementById('res-time').textContent = appt.appointmentTime || '--';

  // Status badge
  const statusMap = {
    pending:    { label:'في الانتظار',  cls:'badge-pending'   },
    confirmed:  { label:'مؤكدة',        cls:'badge-confirmed' },
    completed:  { label:'مكتملة',       cls:'badge-completed' },
    cancelled:  { label:'ملغاة مسبقاً', cls:'badge-cancelled' },
  };
  const st = statusMap[appt.status] || { label: appt.status, cls:'badge-pending' };
  document.getElementById('res-status').innerHTML = `<span class="badge ${st.cls}">${st.label}</span>`;

  // Show/hide cancel button based on status and date
  const cancelBtnWrap = document.getElementById('cancel-btn-wrap');
  const todayStr      = new Date().toISOString().split('T')[0];
  const isCancellable = (appt.status === 'pending' || appt.status === 'confirmed')
                        && appt.appointmentDate >= todayStr;

  if (!isCancellable) {
    cancelBtnWrap.innerHTML = '';
    if (appt.status === 'cancelled') {
      showStatus('هذا الحجز ملغى بالفعل.', 'info');
    } else if (appt.status === 'completed') {
      showStatus('لا يمكن إلغاء حجز مكتمل.', 'info');
    } else if (appt.appointmentDate < todayStr) {
      showStatus('لا يمكن إلغاء موعد منتهي.', 'info');
    }
  }

  // Show result, hide lookup form
  document.getElementById('lookup-card').style.display   = 'none';
  document.getElementById('result-card').style.display   = 'block';
  document.getElementById('cancelled-state').style.display = 'none';
  hideConfirmBox();
}

// =========================================================
// Show / hide the two-step confirm box
// =========================================================
function showConfirmBox() {
  document.getElementById('confirm-cancel-box').style.display = 'block';
  document.getElementById('cancel-appt-btn').style.display    = 'none';
}

function hideConfirmBox() {
  document.getElementById('confirm-cancel-box').style.display = 'none';
  const b = document.getElementById('cancel-appt-btn');
  if (b) b.style.display = '';
}

// =========================================================
// Execute cancellation
// =========================================================
async function confirmCancel() {
  if (!foundAppointment) return;

  const btn = document.getElementById('confirm-cancel-btn');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري الإلغاء...`;

  try {
    const now    = new Date().toISOString();
    const apptId = foundAppointment.id;
    const slotId = foundAppointment.slotId || null;

    if (window.isFirebaseConfigured) {
      // Use a batch: cancel appointment + free the slot atomically
      const batch = db.batch();

      const apptRef = db.collection('appointments').doc(apptId);
      batch.update(apptRef, { status: 'cancelled', updatedAt: now, cancelledBy: 'patient' });

      if (slotId) {
        const slotRef = db.collection('availableSlots').doc(slotId);
        const slotDoc = await slotRef.get();
        if (slotDoc.exists) {
          batch.update(slotRef, { isBooked: false, updatedAt: now });
        }
      }

      await batch.commit();
    } else {
      // Mock mode
      const appts = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
      const idx   = appts.findIndex(a => a.id === apptId);
      if (idx !== -1) {
        appts[idx].status      = 'cancelled';
        appts[idx].updatedAt   = now;
        appts[idx].cancelledBy = 'patient';
      }
      localStorage.setItem('mock_appointments', JSON.stringify(appts));

      if (slotId) {
        const slots = JSON.parse(localStorage.getItem('mock_slots') || '[]');
        const si    = slots.findIndex(s => s.id === slotId);
        if (si !== -1) {
          slots[si].isBooked = false;
          localStorage.setItem('mock_slots', JSON.stringify(slots));
        }
      }
    }

    // Show success state
    document.getElementById('result-card').style.display     = 'none';
    document.getElementById('cancelled-state').style.display = 'block';

  } catch (err) {
    console.error('confirmCancel error:', err);
    showStatus('فشل إلغاء الحجز: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-ban"></i> نعم، إلغاء الحجز`;
  }
}

// =========================================================
// Reset form to allow a new search
// =========================================================
function resetForm() {
  foundAppointment = null;
  document.getElementById('lookup-card').style.display     = 'block';
  document.getElementById('result-card').style.display     = 'none';
  document.getElementById('cancelled-state').style.display = 'none';
  document.getElementById('cancel-btn-wrap').innerHTML = `
    <button class="btn btn-secondary" onclick="resetForm()" style="flex:1;">
      <i class="fa-solid fa-rotate-left"></i> بحث جديد
    </button>
    <button class="btn btn-danger" id="cancel-appt-btn" onclick="showConfirmBox()" style="flex:1;">
      <i class="fa-solid fa-ban"></i> إلغاء الحجز
    </button>`;
  hideStatus();
  document.getElementById('input-ref').value   = '';
  document.getElementById('input-phone').value = '';
}

// =========================================================
// Helpers
// =========================================================
function showStatus(msg, type = 'error') {
  const el = document.getElementById('page-status');
  el.textContent   = msg;
  el.className     = `status-bar ${type}`;
  el.style.display = 'block';
}

function hideStatus() {
  const el = document.getElementById('page-status');
  el.style.display = 'none';
}
