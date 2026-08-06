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

let selectedPayment = 'vodafone';   // 'cash' | 'online' | 'vodafone' | 'instapay'
let selectedGender  = '';
let receiptDataUrl  = null;  // base64 receipt image

// Transfer account numbers (can be fetched from settings if needed)
const TRANSFER_ACCOUNTS = {
  vodafone: { number: '01XXXXXXXXXX', label: 'رقم فودافون كاش', icon: 'fa-mobile-screen-button', color: '#dc2626', title: 'تحويل عبر فودافون كاش' },
  instapay: { number: 'clinic@instapay', label: 'معرف InstaPay', icon: 'fa-bolt', color: 'var(--primary-color)', title: 'تحويل عبر InstaPay' }
};

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

    if (doctor) {
      document.getElementById('sum-doctor').textContent    = doctor.name;
      // Dynamically load doctor's own transfer accounts
      TRANSFER_ACCOUNTS.vodafone.number = doctor.vodafoneNumber || 'غير متوفر حالياً';
      TRANSFER_ACCOUNTS.instapay.number = doctor.instapayId || 'غير متوفر حالياً';
      
      // Refresh the instructions UI if a transfer method is selected
      if (selectedPayment === 'vodafone' || selectedPayment === 'instapay') {
        selectPayment(selectedPayment);
      }
    }
    if (specialty) document.getElementById('sum-specialty').textContent = specialty.name;
    
    const selectedPrice = parseFloat(sessionStorage.getItem('booking_servicePrice')) || specialty?.basePrice || 0;
    document.getElementById('sum-price').textContent = `${selectedPrice} ج.م`;

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

  const paymobContainer    = document.getElementById('paymob-container');
  const transferBox        = document.getElementById('transfer-instructions-box');
  const confirmBtn         = document.getElementById('confirm-booking-btn');

  // Reset all panels
  paymobContainer.style.display = 'none';

  if (method === 'online') {
    transferBox.style.display = 'none';
    confirmBtn.innerHTML = '<i class="fa-solid fa-credit-card"></i> الدفع الإلكتروني وتأكيد الحجز';
    paymobContainer.style.display = 'block';
  } else if (method === 'vodafone' || method === 'instapay') {
    const acc = TRANSFER_ACCOUNTS[method];
    transferBox.style.display = 'block';
    document.getElementById('transfer-title').textContent = acc.title;
    document.getElementById('transfer-number').textContent = acc.number;
    document.getElementById('transfer-label').textContent = acc.label;
    document.getElementById('transfer-icon').className = `fa-solid ${acc.icon}`;
    document.getElementById('transfer-method-icon').className = `fa-solid ${acc.icon}`;
    document.getElementById('transfer-icon').style.color = acc.color;
    document.getElementById('transfer-method-icon').style.color = acc.color;
    transferBox.style.background = method === 'vodafone' ? 'rgba(220,38,38,.06)' : 'rgba(79,70,229,.06)';
    transferBox.style.borderColor = method === 'vodafone' ? 'rgba(220,38,38,.2)' : 'rgba(79,70,229,.2)';
    confirmBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال طلب الحجز (بانتظار مراجعة الدفع)';
  } else {
    transferBox.style.display = 'none';
    confirmBtn.innerHTML = '<i class="fa-solid fa-calendar-check"></i> تأكيد الحجز';
  }
}

// =========================================================
// Receipt Upload Helpers
// =========================================================
function handleReceiptUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert('حجم الصورة كبير جداً. يرجى اختيار صورة أصغر من 5MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    receiptDataUrl = e.target.result;
    document.getElementById('receipt-img-preview').src = receiptDataUrl;
    document.getElementById('receipt-preview').style.display = 'block';
    document.getElementById('receipt-upload-label').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function clearReceipt() {
  receiptDataUrl = null;
  document.getElementById('receipt-upload').value = '';
  document.getElementById('receipt-img-preview').src = '';
  document.getElementById('receipt-preview').style.display = 'none';
  document.getElementById('receipt-upload-label').style.display = 'flex';
}

function copyTransferNumber() {
  const num = document.getElementById('transfer-number').textContent;
  navigator.clipboard.writeText(num).then(() => {
    const btn = event.target.closest('button');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> تم النسخ';
    setTimeout(() => btn.innerHTML = orig, 2000);
  });
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

  // [M3] Validate required URL params
  if (!doctorId || !slotId || !slotDate) {
    showStatus('رابط الحجز غير مكتمل. يرجى العودة واختيار موعد مرة أخرى.', 'error');
    return;
  }

  const err = validateForm();
  if (err) { showStatus(err, 'error'); return; }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري تأكيد الحجز...';

  try {
    const patient = {
      firstName: document.getElementById('patientFirstName').value.trim(),
      lastName:  document.getElementById('patientLastName').value.trim(),
      phone:     document.getElementById('patientPhone').value.trim(),
      gender:    selectedGender,   // [M3] persist gender
    };

    // [M4] Enforce daily appointment cap
    const doctor = window._bookingDoctor;
    if (doctor && doctor.maxAppointmentsPerDay) {
      const currentCount = await window.dataService.countDoctorAppointmentsOnDate(doctorId, slotDate);
      if (currentCount >= doctor.maxAppointmentsPerDay) {
        showStatus(`عذراً، الطبيب وصل للحد الأقصى من المواعيد في هذا اليوم (${doctor.maxAppointmentsPerDay} مواعيد).`, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-calendar-check"></i> تأكيد الحجز';
        return;
      }
    }

    // If online payment — trigger Paymob flow
    if (selectedPayment === 'online') {
      await window.initiatePaymobPayment(patient, '');
      return;
    }

    // Vodafone Cash / InstaPay: require receipt
    if (selectedPayment === 'vodafone' || selectedPayment === 'instapay') {
      if (!receiptDataUrl) {
        showStatus('يرجى رفع صورة إيصال التحويل أولاً قبل تأكيد الحجز.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال طلب الحجز';
        return;
      }
      // Upload receipt to Firebase Storage or keep as base64 in mock
      let receiptUrl = receiptDataUrl;
      if (window.isFirebaseConfigured && window.storage) {
        try {
          showStatus('جاري رفع صورة الإيصال...', 'info');
          const blob = await fetch(receiptDataUrl).then(r => r.blob());
          const filename = `receipts/${Date.now()}_receipt.jpg`;
          const storageRef = window.storage.ref(filename);
          await storageRef.put(blob);
          receiptUrl = await storageRef.getDownloadURL();
        } catch (uploadErr) {
          console.warn('Receipt upload failed, using base64:', uploadErr);
        }
      }
      await saveAppointment(patient, '', selectedPayment, 'pending_approval', null, receiptUrl);
      return;
    }

    // Cash: save appointment directly
    await saveAppointment(patient, '', 'cash', 'unpaid', null, null);

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
async function saveAppointment(patient, notes, paymentMethod, paymentStatus, paymentId, receiptUrl = null) {
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

  // 1. Find existing patient by phone or create new one (M5)
  let patientId = '';
  if (window.isFirebaseConfigured) {
    const existingPatient = await window.dataService.findPatientByPhone(patient.phone);
    if (existingPatient) {
      patientId = existingPatient.id;
      // Note: We don't update the patient doc here because public users shouldn't have update permissions.
    } else {
      const pDoc = await db.collection('patients').add({
        ...patient,
        clinicId: 'settings',
        notes: notes,
        createdAt: now, updatedAt: now
      });
      patientId = pDoc.id;
    }
  } else {
    const patients = JSON.parse(localStorage.getItem('mock_patients') || '[]');
    const existing = patients.find(p => p.phone === patient.phone);
    if (existing) {
      patientId = existing.id;
    } else {
      patientId = 'mock-pat-' + Date.now();
      patients.push({ id: patientId, ...patient, notes, clinicId:'settings', createdAt:now });
      localStorage.setItem('mock_patients', JSON.stringify(patients));
    }
  }

  // 2. Setup appointment object
  const patientFullName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim();
  const appointment = {
    clinicId:        'settings',
    patientId,
    patientName:     patientFullName,
    patientPhone:    patient.phone || '',
    patientGender:   patient.gender || '',   // [M3]
    doctorId,
    specialtyId,
    slotId,
    appointmentDate: slotDate,
    appointmentTime: slotStart,
    status:          'pending',
    paymentStatus,
    paymentMethod,
    paymentId:       paymentId || '',
    price:           parseFloat(sessionStorage.getItem('booking_servicePrice')) || specialty?.basePrice || 0,
    notes,
    bookingRef:      ref,
    queueNumber:     queueNumber,
    consultationType: sessionStorage.getItem('booking_consultationType') || 'in-person',
    serviceName:     sessionStorage.getItem('booking_serviceName') || '',
    reminderSMSSent: false,
    receiptSent:     false,
    receiptUrl:      receiptUrl || '',
    createdAt: now, updatedAt: now
  };

  // 3. Save appointment and update slot in a transaction
  if (window.isFirebaseConfigured) {
    await db.runTransaction(async (t) => {
      // Slot validation & update/creation
      if (slotId) {
        const slotRef = db.collection('availableSlots').doc(slotId);
        const slotDoc = await t.get(slotRef);
        
        if (slotDoc.exists) {
          if (slotDoc.data().isBooked) {
            throw new Error('عذراً، هذا الموعد تم حجزه من قبل شخص آخر للتو.');
          }
          t.update(slotRef, { isBooked: true, updatedAt: now });
        } else {
          // It's a "fly" slot that doesn't exist yet, so we persist it
          if (slotId.startsWith('fly-')) {
            t.set(slotRef, {
              doctorId,
              appointmentDate: slotDate,
              startTime: slotStart,
              endTime: slotEnd,
              isBooked: true,
              createdAt: now,
              updatedAt: now
            });
          } else {
            throw new Error('الموعد غير موجود.');
          }
        }
      }

      // Create appointment
      const aRef = db.collection('appointments').doc();
      t.set(aRef, appointment);
      appointment.id = aRef.id;
    });
  } else {
    appointment.id = 'mock-appt-' + Date.now();
    const appts = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
    appts.push(appointment);
    localStorage.setItem('mock_appointments', JSON.stringify(appts));
    // Mark slot booked in mock
    const slots = JSON.parse(localStorage.getItem('mock_slots') || '[]');
    const idx   = slots.findIndex(s => s.id === slotId);
    if (idx !== -1) { 
      slots[idx].isBooked = true; 
      localStorage.setItem('mock_slots', JSON.stringify(slots)); 
    }
  }

  // 4. Store confirmation data for confirmation page
  const confData = {
    ref, patient, doctor, specialty,
    date: slotDate, startTime: slotStart, endTime: slotEnd,
    paymentMethod, paymentStatus, price: parseFloat(sessionStorage.getItem('booking_servicePrice')) || specialty?.basePrice || 0,
    appointmentId: appointment.id,
    queueNumber,
    consultationType: appointment.consultationType,
    bookingRef: ref
  };
  sessionStorage.setItem('booking_confirmation', JSON.stringify(confData));

  // If online booking, also persist to localStorage so homepage banner can detect it
  if (appointment.consultationType === 'online') {
    sessionStorage.setItem('last_online_booking', JSON.stringify(appointment));
    // Also refresh mock_appointments entry with latest paymentStatus for banner
  }

  // Trigger local WhatsApp Gateway if running
  try {
    const radarUrl = `${window.location.origin}${window.BASE_PATH || ''}/public/queue-radar.html?ref=${ref}`;
    const msg = `أهلاً بك أستاذ/ة ${patient.firstName} ${patient.lastName} 🌸\n` +
      `تم تأكيد حجز موعدك بنجاح في العيادة.\n\n` +
      `📌 رقم الحجز: ${ref}\n` +
      `📅 التاريخ: ${slotDate}\n` +
      `⏰ الوقت: ${slotStart}\n` +
      `🔢 رقم دورك: #${queueNumber}\n\n` +
      `📡 يمكنك تتبع دورك والوقت المتوقع لدخولك حياً ومباشرة عبر رادار الانتظار:\n${radarUrl}\n\n` +
      `نتمنى لك دوام الصحة والعافية! 🏥`;

    fetch('http://localhost:3001/send-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: patient.phone, message: msg })
    }).catch(() => {/* Gateway off — ignore */});
  } catch (_) {}

  // 5. Redirect
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
