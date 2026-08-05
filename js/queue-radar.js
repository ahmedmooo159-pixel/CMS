// =========================================================
// queue-radar.js – Live Patient Queue Traffic Radar Logic
// =========================================================

const params = new URLSearchParams(window.location.search);
const apptRef = params.get('ref') || '';
const apptId  = params.get('id')  || '';

let currentAppt = null;
let doctorData  = null;
let unsubscribeAppt = null;
let unsubscribeQueue = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!apptRef && !apptId) {
    alert('رابط التتبع غير كامل. يرجى التأكد من الرابط أو فتح صفحة التأكيد مرة أخرى.');
    return;
  }

  console.log('Queue Radar Init - ref:', apptRef, 'id:', apptId);
  initRadar();
});

async function initRadar() {
  if (window.isFirebaseConfigured) {
    try {
      // 1. Try to find appointment by ID first (if provided)
      if (apptId) {
        console.log('Searching by appointment ID:', apptId);
        const docSnap = await db.collection('appointments').doc(apptId).get();
        if (docSnap.exists) {
          console.log('✅ Found appointment by ID');
          listenToAppointmentDoc(docSnap.ref);
          return;
        }
      }

      // 2. Try to find appointment by bookingRef
      if (apptRef) {
        console.log('Searching by bookingRef:', apptRef);
        const snap = await db.collection('appointments')
          .where('bookingRef', '==', apptRef)
          .limit(1)
          .get();
        
        if (!snap.empty) {
          console.log('✅ Found appointment by bookingRef');
          const doc = snap.docs[0];
          listenToAppointmentDoc(doc.ref);
          return;
        }
      }

      // 3. Fallback: search all appointments and find manually
      console.warn('⚠️ Could not find by ID or bookingRef, searching all appointments...');
      const allSnap = await db.collection('appointments').limit(100).get();
      
      let found = null;
      allSnap.forEach(doc => {
        const data = doc.data();
        if ((apptRef && data.bookingRef === apptRef) || (apptId && doc.id === apptId)) {
          found = doc;
        }
      });

      if (found) {
        console.log('✅ Found appointment by manual search');
        listenToAppointmentDoc(found.ref);
        return;
      }

      // 4. Still not found
      console.error('❌ Appointment not found');
      showErrorState('لم يتم العثور على موعد بهذا الرقم. قد لم يتم حفظ الحجز بعد. حاول مرة أخرى.');
      
    } catch (err) {
      console.error('Error in initRadar:', err);
      showErrorState('خطأ في البحث: ' + err.message);
    }
  } else {
    // Mock Mode
    console.log('Mock mode - searching in localStorage');
    const appts = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
    const found = appts.find(a => a.bookingRef === apptRef || a.id === apptId);
    
    if (!found) {
      showErrorState('لم يتم العثور على هذا الموعد في النظام التجريبي.');
      return;
    }
    
    console.log('✅ Found in mock:', found);
    renderRadarUI(found, appts.filter(a => a.doctorId === found.doctorId && a.appointmentDate === found.appointmentDate));
  }
}

function listenToAppointmentDoc(docRef) {
  unsubscribeAppt = docRef.onSnapshot(
    async (snapshot) => {
      if (!snapshot.exists) {
        console.error('❌ Appointment doc no longer exists');
        showErrorState('الموعد غير موجود أو تم حذفه.');
        return;
      }

      const data = { id: snapshot.id, ...snapshot.data() };
      console.log('✅ Appointment data received:', data);
      currentAppt = data;

      // Fetch Doctor Info
      if (data.doctorId && !doctorData) {
        try {
          const dDoc = await db.collection('doctors').doc(data.doctorId).get();
          if (dDoc.exists) doctorData = dDoc.data();
        } catch (err) {
          console.warn('Could not fetch doctor info:', err);
        }
      }

      // Listen to all appointments on the same date for the doctor to calculate live queue
      listenToQueueList(data.doctorId, data.appointmentDate);
    },
    (err) => {
      console.error('Radar Firestore listener error:', err);
      showErrorState('خطأ في الاتصال: ' + err.message);
    }
  );
}

function listenToQueueList(doctorId, appointmentDate) {
  if (unsubscribeQueue) unsubscribeQueue();

  unsubscribeQueue = db.collection('appointments')
    .where('doctorId', '==', doctorId)
    .where('appointmentDate', '==', appointmentDate)
    .onSnapshot(
      (snapshot) => {
        const allAppts = [];
        snapshot.forEach(doc => allAppts.push({ id: doc.id, ...doc.data() }));
        console.log('✅ Queue list updated:', allAppts.length, 'appointments');
        renderRadarUI(currentAppt, allAppts);
      },
      (err) => {
        console.error('Queue listener error:', err);
      }
    );
}

function renderRadarUI(appt, allDayAppts) {
  if (!appt) return;

  console.log('Rendering radar UI for:', appt.patientName);

  // Basic Info
  document.getElementById('queue-number').textContent = appt.queueNumber || '#1';
  document.getElementById('patient-name-display').textContent = appt.patientName || 'المريض';
  document.getElementById('doctor-name-display').textContent = doctorData ? `د. ${doctorData.name}` : `موعد عيادة`;

  // Status Badge & Colors
  const badgeEl = document.getElementById('status-badge');
  const status  = appt.status || 'pending';
  const statusLabels = {
    pending:      '⌛ حجز قيد الانتظار',
    confirmed:    '✅ موعد مؤكد',
    arrived:      '📍 وصل العيادة (في صالة الانتظار)',
    in_session:   '🩺 دخل غرفة الكشف الآن',
    completed:    '🏁 اكتمل الكشف بنجاح',
    cancelled:    '❌ تم إلغاء الموعد'
  };

  badgeEl.textContent = statusLabels[status] || status;
  badgeEl.className = `status-badge badge-${status}`;

  // Calculate patients ahead
  const activeAppts = allDayAppts.filter(a => a.status !== 'cancelled');
  const myQueueNum  = appt.queueNumber || 1;

  // Count patients ahead who are either in_session, arrived, or pending before this queue number
  const ahead = activeAppts.filter(a => (a.queueNumber < myQueueNum) && (a.status === 'arrived' || a.status === 'in_session' || a.status === 'confirmed' || a.status === 'pending')).length;
  
  document.getElementById('patients-ahead').textContent = ahead > 0 ? ahead : (status === 'in_session' ? 'دورك الآن!' : '0 (أنت التالي)');

  // Calculate Estimated Time of Arrival (ETA)
  // Default doctor pace: 15 mins / patient
  const avgPaceMinutes = doctorData?.avgConsultationMinutes || 15;
  const minutesToWait = ahead * avgPaceMinutes;

  if (status === 'in_session') {
    document.getElementById('eta-time').textContent = 'في الكشف الان';
  } else if (status === 'completed') {
    document.getElementById('eta-time').textContent = 'مكتمل';
  } else if (status === 'cancelled') {
    document.getElementById('eta-time').textContent = 'ملغى';
  } else {
    // Calculate estimated time from appt start time or current time
    const now = new Date();
    const estTime = new Date(now.getTime() + minutesToWait * 60000);
    const hours   = estTime.getHours();
    const minutes = estTime.getMinutes().toString().padStart(2, '0');
    const ampm    = hours >= 12 ? 'م' : 'ص';
    const formattedHours = (hours % 12 || 12).toString().padStart(2, '0');

    document.getElementById('eta-time').textContent = `${formattedHours}:${minutes} ${ampm}`;
  }

  // Update Timeline steps
  updateTimeline(status);

  // Setup WhatsApp share button
  const currentUrl = window.location.href;
  const whatsappMsg = `أهلاً، يمكنك تتبع دورك وموعد دخولك عيادة د. ${doctorData ? doctorData.name : ''} عبر رادار الانتظار الحي:\n${currentUrl}`;
  document.getElementById('whatsapp-share-btn').href = `https://wa.me/?text=${encodeURIComponent(whatsappMsg)}`;
}

function updateTimeline(status) {
  const stepBooked  = document.getElementById('step-booked');
  const stepArrived = document.getElementById('step-arrived');
  const stepSession = document.getElementById('step-session');

  stepBooked.classList.remove('active');
  stepArrived.classList.remove('active');
  stepSession.classList.remove('active');

  if (status === 'confirmed' || status === 'pending') {
    stepBooked.classList.add('active');
  } else if (status === 'arrived') {
    stepBooked.classList.add('active');
    stepArrived.classList.add('active');
  } else if (status === 'in_session' || status === 'completed') {
    stepBooked.classList.add('active');
    stepArrived.classList.add('active');
    stepSession.classList.add('active');
  }
}

function showErrorState(msg) {
  const badgeEl = document.getElementById('status-badge');
  badgeEl.textContent = msg;
  badgeEl.className = 'status-badge badge-cancelled';
  document.getElementById('queue-number').textContent = '--';
  document.getElementById('eta-time').textContent = '--';
  document.getElementById('patients-ahead').textContent = '--';
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (unsubscribeAppt) unsubscribeAppt();
  if (unsubscribeQueue) unsubscribeQueue();
});
