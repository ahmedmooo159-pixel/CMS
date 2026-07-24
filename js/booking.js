// =========================================================
// booking.js  –  Booking Form Logic
// =========================================================

const params = new URLSearchParams(window.location.search);
const doctorId    = params.get('doctorId')    || '';
const specialtyId = params.get('specialtyId') || '';
const specialtyName = decodeURIComponent(params.get('specialtyName') || '');
const slotId      = params.get('slotId')      || '';
const slotDate    = params.get('date')         || '';
const slotStart   = params.get('startTime')    || '';
const slotEnd     = params.get('endTime')      || '';

let selectedPayment = 'cash';   // 'cash' | 'online'
let selectedGender  = '';

// =========================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Back link
  document.getElementById('back-btn').href =
    `appointment-booking.html?doctorId=${encodeURIComponent(doctorId)}&specialtyId=${encodeURIComponent(specialtyId)}&specialtyName=${encodeURIComponent(specialtyName)}`;

  document.getElementById('bc-doctors-link').href =
    `doctors-list.html?specialtyId=${encodeURIComponent(specialtyId)}&specialtyName=${encodeURIComponent(specialtyName)}`;

  await populateSummary();
});

// =========================================================
// Populate right-hand summary sidebar
// =========================================================
async function populateSummary() {
  try {
    let doctor = null, specialty = null;

    if (window.isFirebaseConfigured) {
      const [dSnap, sSnap] = await Promise.all([
        db.collection('doctors').doc(doctorId).get(),
        db.collection('specialties').doc(specialtyId).get()
      ]);
      if (dSnap.exists)  doctor    = { id: dSnap.id,  ...dSnap.data() };
      if (sSnap.exists)  specialty = { id: sSnap.id,  ...sSnap.data() };
    } else {
      const allDocs  = JSON.parse(localStorage.getItem('mock_doctors')      || '[]');
      const allSpecs = JSON.parse(localStorage.getItem('mock_specialties')  || '[]');
      doctor    = allDocs.find(d => d.id === doctorId)    || null;
      specialty = allSpecs.find(s => s.id === specialtyId) || null;
    }

    if (doctor)    document.getElementById('sum-doctor').textContent    = doctor.name;
    if (specialty) document.getElementById('sum-specialty').textContent = specialty.name;
    if (specialty?.basePrice) document.getElementById('sum-price').textContent = `${specialty.basePrice} ج.م`;

    if (slotDate) {
      const d = new Date(slotDate + 'T00:00:00');
      document.getElementById('sum-date').textContent = d.toLocaleDateString('ar-EG',{ weekday:'long',year:'numeric',month:'long',day:'numeric'});
    }
    if (slotStart && slotEnd) document.getElementById('sum-time').textContent = `${slotStart} – ${slotEnd}`;

    // Store doctor/specialty for submit
    window._bookingDoctor    = doctor;
    window._bookingSpecialty = specialty;

  } catch (err) {
    console.error('populateSummary error:', err);
  }
}

// =========================================================
// Gender selector
// =========================================================
function selectGender(val) {
  selectedGender = val;
  document.querySelectorAll('.gender-option').forEach(el => el.classList.remove('selected'));
  document.getElementById('gender-' + val).classList.add('selected');
}

// =========================================================
// Payment method selector
// =========================================================
function selectPayment(method) {
  selectedPayment = method;
  document.querySelectorAll('.payment-method-option').forEach(el => el.classList.remove('selected'));
  document.getElementById('pm-' + method).classList.add('selected');

  const container = document.getElementById('paymob-container');
  if (method === 'online') {
    container.style.display = 'block';
    document.getElementById('confirm-booking-btn').textContent = '';
    document.getElementById('confirm-booking-btn').innerHTML =
      '<i class="fa-solid fa-credit-card"></i> الدفع الإلكتروني وتأكيد الحجز';
  } else {
    container.style.display = 'none';
    document.getElementById('confirm-booking-btn').innerHTML =
      '<i class="fa-solid fa-calendar-check"></i> تأكيد الحجز';
  }
}

// =========================================================
// Validate form
// =========================================================
function validateForm() {
  const first = document.getElementById('patientFirstName').value.trim();
  const last  = document.getElementById('patientLastName').value.trim();
  const phone = document.getElementById('patientPhone').value.trim();

  if (!first || !last) return 'يرجى إدخال الاسم الأول والأخير.';
  if (!phone)          return 'يرجى إدخال رقم الهاتف.';
  if (phone.length < 10) return 'رقم الهاتف يجب أن يكون 10 أرقام على الأقل.';
  return null;
}

// =========================================================
// Submit Booking
// =========================================================
async function submitBooking() {
  const statusEl = document.getElementById('booking-status');
  const btn      = document.getElementById('confirm-booking-btn');

  const err = validateForm();
  if (err) { showStatus(err, 'error'); return; }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري تأكيد الحجز...';

  try {
    const patient = {
      firstName: document.getElementById('patientFirstName').value.trim(),
      lastName:  document.getElementById('patientLastName').value.trim(),
      phone:     document.getElementById('patientPhone').value.trim(),
    };

    // If online payment — trigger Paymob flow
    if (selectedPayment === 'online') {
      await window.initiatePaymobPayment(patient, '');
      return;
    }

    // Cash: save appointment directly
    await saveAppointment(patient, '', 'cash', 'unpaid', null);

  } catch (err) {
    console.error('submitBooking error:', err);
    showStatus('حدث خطأ أثناء تأكيد الحجز: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-calendar-check"></i> تأكيد الحجز';
  }
}

// =========================================================
// Save Appointment to Firestore / localStorage
// =========================================================
async function saveAppointment(patient, notes, paymentMethod, paymentStatus, paymentId) {
  const doctor    = window._bookingDoctor;
  const specialty = window._bookingSpecialty;
  const ref       = generateBookingRef();
  const now       = new Date().toISOString();

  // Calculate queue number: count existing active appointments for doctor on slotDate before or equal to this slot time + 1
  let queueNumber = 1;
  if (window.isFirebaseConfigured) {
    const snap = await db.collection('appointments')
      .where('doctorId', '==', doctorId)
      .where('appointmentDate', '==', slotDate)
      .get();
    
    snap.forEach(doc => {
      const appt = doc.data();
      if (appt.status !== 'cancelled' && appt.appointmentTime <= slotStart) {
        queueNumber++;
      }
    });
  } else {
    const appts = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
    const docAppts = appts.filter(a => a.doctorId === doctorId && a.appointmentDate === slotDate && a.status !== 'cancelled');
    docAppts.forEach(appt => {
      if (appt.appointmentTime <= slotStart) {
        queueNumber++;
      }
    });
  }

  // 1. Save / find patient record
  let patientId = '';
  if (window.isFirebaseConfigured) {
    const pDoc = await db.collection('patients').add({
      ...patient,
      clinicId: 'settings',
      notes: notes,
      createdAt: now, updatedAt: now
    });
    patientId = pDoc.id;
  } else {
    patientId = 'mock-pat-' + Date.now();
    const patients = JSON.parse(localStorage.getItem('mock_patients') || '[]');
    patients.push({ id: patientId, ...patient, notes, clinicId:'settings', createdAt:now });
    localStorage.setItem('mock_patients', JSON.stringify(patients));
  }

  // 2. Save appointment
  const appointment = {
    clinicId:        'settings',
    patientId,
    doctorId,
    specialtyId,
    slotId,
    appointmentDate: slotDate,
    appointmentTime: slotStart,
    status:          'pending',
    paymentStatus,
    paymentMethod,
    paymentId:       paymentId || '',
    price:           specialty?.basePrice || 0,
    notes,
    bookingRef:      ref,
    queueNumber:     queueNumber,
    reminderSMSSent: false,
    receiptSent:     false,
    createdAt: now, updatedAt: now
  };

  if (window.isFirebaseConfigured) {
    const aDoc = await db.collection('appointments').add(appointment);
    appointment.id = aDoc.id;
    // 3. Mark slot as booked
    if (slotId) {
      await db.collection('availableSlots').doc(slotId).update({ isBooked: true, updatedAt: now });
    }
  } else {
    appointment.id = 'mock-appt-' + Date.now();
    const appts = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
    appts.push(appointment);
    localStorage.setItem('mock_appointments', JSON.stringify(appts));
    // Mark slot booked in mock
    const slots = JSON.parse(localStorage.getItem('mock_slots') || '[]');
    const idx   = slots.findIndex(s => s.id === slotId);
    if (idx !== -1) { slots[idx].isBooked = true; localStorage.setItem('mock_slots', JSON.stringify(slots)); }
  }

  // 4. Store confirmation data for confirmation page
  const confData = {
    ref, patient, doctor, specialty,
    date: slotDate, startTime: slotStart, endTime: slotEnd,
    paymentMethod, paymentStatus, price: specialty?.basePrice || 0,
    appointmentId: appointment.id,
    queueNumber
  };
  sessionStorage.setItem('booking_confirmation', JSON.stringify(confData));

  // 5. Redirect to confirmation
  window.location.href = 'confirmation.html';
}

// =========================================================
// Helpers
// =========================================================
function generateBookingRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let ref = '';
  for (let i = 0; i < 8; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

function showStatus(msg, type) {
  const el = document.getElementById('booking-status');
  el.textContent = msg;
  el.className = `status-bar ${type}`;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Expose for paymob.js callback
window.saveAppointment = saveAppointment;
