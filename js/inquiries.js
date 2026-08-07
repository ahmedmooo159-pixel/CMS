// =========================================================
// inquiries.js  –  Patient Booking Inquiry Logic
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

  const inputPhone = document.getElementById('input-phone');
  if (inputPhone) {
    inputPhone.addEventListener('keydown', e => { if (e.key === 'Enter') searchAppointments(); });
  }
});

async function searchAppointments() {
  const rawPhone = document.getElementById('input-phone').value.trim();

  if (!rawPhone) {
    showStatus('يرجى إدخال رقم الهاتف.', 'error');
    return;
  }

  const btn = document.getElementById('search-btn');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري البحث...`;
  hideStatus();

  try {
    let appointments = [];
    const inputPhone = rawPhone.replace(/\s/g, '');
    let patientIds = [];

    if (window.isFirebaseConfigured) {
      // Find patients with this phone
      const pSnap = await db.collection('patients').where('phone', '==', inputPhone).get();
      pSnap.forEach(doc => patientIds.push(doc.id));

      if (patientIds.length > 0) {
        // limit 'in' queries to 10
        const batchIds = patientIds.slice(0, 10);
        const apptSnap = await db.collection('appointments').where('patientId', 'in', batchIds).get();
        apptSnap.forEach(doc => appointments.push({ id: doc.id, ...doc.data() }));
      }
      
      // Also search by patientPhone directly on appointments just in case
      const apptPhoneSnap = await db.collection('appointments').where('patientPhone', '==', inputPhone).get();
      apptPhoneSnap.forEach(doc => {
        if (!appointments.find(a => a.id === doc.id)) {
          appointments.push({ id: doc.id, ...doc.data() });
        }
      });
    } else {
      // Mock mode
      const allAppts  = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
      const allPatients = JSON.parse(localStorage.getItem('mock_patients') || '[]');
      
      const patientsWithPhone = allPatients.filter(p => (p.phone || '').replace(/\s/g, '') === inputPhone).map(p => p.id);
      
      appointments = allAppts.filter(a => 
        (a.patientPhone || '').replace(/\s/g, '') === inputPhone || 
        (a.patientId && patientsWithPhone.includes(a.patientId))
      );
    }

    if (appointments.length === 0) {
      showStatus('لم يتم العثور على حجوزات مسجلة برقم الهاتف هذا.', 'error');
      return;
    }

    // Sort and separate upcoming vs past
    const todayStr = window.getLocalISODate ? window.getLocalISODate() : new Date().toISOString().split('T')[0];
    
    // Also get current time to check if session can be joined
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();

    let upcoming = [];
    let past = [];

    appointments.forEach(appt => {
      // If it has no date, treat as past/invalid
      if (!appt.appointmentDate) { past.push(appt); return; }
      
      if (appt.appointmentDate > todayStr) {
        upcoming.push(appt);
      } else if (appt.appointmentDate === todayStr) {
        // Today, check time. Assuming appointments today are upcoming until marked completed/cancelled
        if (appt.status === 'completed' || appt.status === 'cancelled') {
           past.push(appt);
        } else {
           upcoming.push(appt);
        }
      } else {
        past.push(appt);
      }
    });

    // sort upcoming by date asc, past by date desc
    upcoming.sort((a, b) => {
       const da = a.appointmentDate + ' ' + (a.appointmentTime || '');
       const db = b.appointmentDate + ' ' + (b.appointmentTime || '');
       return da.localeCompare(db);
    });
    
    past.sort((a, b) => {
       const da = a.appointmentDate + ' ' + (a.appointmentTime || '');
       const db = b.appointmentDate + ' ' + (b.appointmentTime || '');
       return db.localeCompare(da); // desc
    });

    await renderResults(upcoming, past, currentMin, todayStr);
    
    document.getElementById('lookup-card').style.display = 'none';
    document.getElementById('results-area').style.display = 'block';

  } catch (err) {
    console.error('searchAppointments error:', err);
    showStatus('حدث خطأ أثناء البحث: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> البحث عن الحجوزات`;
  }
}

async function renderResults(upcoming, past, currentMin, todayStr) {
  const upContainer = document.getElementById('upcoming-appointments');
  const pastContainer = document.getElementById('past-appointments');
  
  upContainer.innerHTML = '<h3 class="section-title"><i class="fa-solid fa-calendar-day" style="color:var(--primary-color);margin-left:.5rem;"></i> الحجوزات القادمة</h3>';
  pastContainer.innerHTML = '<h3 class="section-title"><i class="fa-solid fa-clock-rotate-left" style="color:var(--text-muted);margin-left:.5rem;"></i> التاريخ المرضي (الجلسات السابقة)</h3>';

  if (upcoming.length === 0) {
    upContainer.innerHTML += '<p style="color:var(--text-muted);font-size:.9rem;">لا توجد حجوزات قادمة.</p>';
  } else {
    for (let appt of upcoming) {
      upContainer.innerHTML += await buildApptCard(appt, true, currentMin, todayStr);
    }
  }

  if (past.length === 0) {
    pastContainer.innerHTML += '<p style="color:var(--text-muted);font-size:.9rem;">لا يوجد تاريخ مرضي مسجل.</p>';
  } else {
    for (let appt of past) {
      pastContainer.innerHTML += await buildApptCard(appt, false, currentMin, todayStr);
    }
  }
}

async function buildApptCard(appt, isUpcoming, currentMin, todayStr) {
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

  const d = appt.appointmentDate ? new Date(appt.appointmentDate + 'T00:00:00') : null;
  const dateLabel = d ? d.toLocaleDateString('ar-EG', { weekday:'long', year:'numeric', month:'long', day:'numeric' }) : '--';

  const statusMap = {
    pending:    { label:'في الانتظار',  cls:'badge-pending'   },
    confirmed:  { label:'مؤكدة',        cls:'badge-confirmed' },
    arrived:    { label:'وصل',          cls:'badge-confirmed' },
    in_session: { label:'الجلسة مستمرة',cls:'badge-confirmed' },
    completed:  { label:'مكتملة',       cls:'badge-completed' },
    cancelled:  { label:'ملغاة',        cls:'badge-cancelled' },
  };
  const st = statusMap[appt.status] || { label: appt.status, cls:'badge-pending' };
  
  // Logic for "Join Session"
  let joinBtnHtml = '';
  if (isUpcoming && appt.consultationType === 'online' && appt.status !== 'cancelled') {
     let canJoin = false;
     
     if (appt.sessionStartedByDoctor === true) {
        canJoin = true;
     } else if (appt.appointmentDate === todayStr && appt.appointmentTime) {
        const [hh, mm] = appt.appointmentTime.split(':').map(Number);
        const apptMin = (hh * 60) + (mm || 0);
        // Allow joining 5 minutes before or if it's time
        if (currentMin >= apptMin - 5) {
           canJoin = true;
        }
     }
     
     if (canJoin) {
        const joinRef = appt.bookingRef || appt.id;
        joinBtnHtml = `
          <div style="margin-top: 1rem;">
             <a href="video-call.html?ref=${joinRef}&role=patient" class="btn btn-primary" style="width:100%;background:linear-gradient(135deg,#10b981,#059669);border-color:transparent;">
                <i class="fa-solid fa-video"></i> الانضمام إلى الجلسة
             </a>
          </div>
        `;
     } else {
        joinBtnHtml = `
          <div style="margin-top: 1rem;">
             <button class="btn btn-secondary" style="width:100%;" disabled title="لا يمكن الانضمام الآن. سيفتح الزر في موعد الجلسة أو عند بدء الدكتور للجلسة.">
                <i class="fa-solid fa-video-slash"></i> الانضمام إلى الجلسة (مغلق)
             </button>
             <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; margin-top: 0.25rem;">يُتاح الانضمام في موعد الجلسة أو عندما يبدأ الطبيب</div>
          </div>
        `;
     }
  }

  return `
    <div class="appointment-card">
      <div class="detail-row">
        <div class="detail-icon"><i class="fa-solid fa-hashtag"></i></div>
        <div><div class="detail-label">رقم الحجز</div><div class="detail-val" style="font-family:monospace;font-size:1.1rem;color:var(--primary-color);">${appt.bookingRef || appt.id || '--'}</div></div>
        <div style="margin-right:auto;"><span class="badge ${st.cls}">${st.label}</span></div>
      </div>
      <div class="detail-row">
        <div class="detail-icon"><i class="fa-solid fa-user-doctor"></i></div>
        <div><div class="detail-label">الطبيب</div><div class="detail-val">${doctorName}</div></div>
      </div>
      <div class="detail-row">
        <div class="detail-icon"><i class="fa-solid fa-calendar-day"></i></div>
        <div><div class="detail-label">التاريخ</div><div class="detail-val">${dateLabel}</div></div>
      </div>
      <div class="detail-row">
        <div class="detail-icon"><i class="fa-solid fa-clock"></i></div>
        <div><div class="detail-label">الوقت</div><div class="detail-val">${appt.appointmentTime || '--'}</div></div>
      </div>
      <div class="detail-row">
        <div class="detail-icon"><i class="fa-solid ${appt.consultationType === 'online' ? 'fa-video' : 'fa-building'}"></i></div>
        <div><div class="detail-label">نوع الجلسة</div><div class="detail-val">${appt.consultationType === 'online' ? 'أونلاين' : 'في العيادة'}</div></div>
      </div>
      
      ${joinBtnHtml}
    </div>
  `;
}

function showStatus(msg, type = 'info') {
  const el = document.getElementById('page-status');
  el.textContent = msg;
  el.className = `status-bar ${type}`;
  el.style.display = 'block';
}

function hideStatus() {
  document.getElementById('page-status').style.display = 'none';
}

function resetForm() {
  document.getElementById('input-phone').value = '';
  document.getElementById('lookup-card').style.display = 'block';
  document.getElementById('results-area').style.display = 'none';
  hideStatus();
}
