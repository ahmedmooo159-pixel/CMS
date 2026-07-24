// =========================================================
// appointment-booking.js  –  Available Days Cards + Slot Selection Page
// =========================================================

const params      = new URLSearchParams(window.location.search);
const doctorId    = params.get('doctorId')    || '';
const specialtyId = params.get('specialtyId') || '';
const specialtyName = decodeURIComponent(params.get('specialtyName') || '');

// ---- State ----
let doctor        = null;
let specialty     = null;
let allSlots      = [];       // all available (unbooked) slots for this doctor
let slotsByDate   = {};       // { "YYYY-MM-DD": [slot, ...] }
let selectedDate  = null;     // "YYYY-MM-DD"
let selectedSlot  = null;     // slot object

// =========================================================
// Init
// =========================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Breadcrumb
  document.getElementById('bc-specialty-link').textContent = specialtyName || 'التخصص';
  document.getElementById('bc-specialty-link').href = `doctors-list.html?specialtyId=${encodeURIComponent(specialtyId)}&specialtyName=${encodeURIComponent(specialtyName)}`;
  document.getElementById('back-btn').href = `doctors-list.html?specialtyId=${encodeURIComponent(specialtyId)}&specialtyName=${encodeURIComponent(specialtyName)}`;

  await loadDoctor();   // must load first so fallback slot gen can use doctor object
  await loadSlots();
  renderAvailableDays();

  // Proceed button
  document.getElementById('proceed-btn').addEventListener('click', () => {
    if (!selectedSlot) return;
    const url = `booking-form.html?doctorId=${encodeURIComponent(doctorId)}`
      + `&specialtyId=${encodeURIComponent(specialtyId)}`
      + `&specialtyName=${encodeURIComponent(specialtyName)}`
      + `&slotId=${encodeURIComponent(selectedSlot.id)}`
      + `&date=${encodeURIComponent(selectedSlot.date)}`
      + `&startTime=${encodeURIComponent(selectedSlot.startTime)}`
      + `&endTime=${encodeURIComponent(selectedSlot.endTime)}`;
    window.location.href = url;
  });
});

// =========================================================
// Load Doctor Info
// =========================================================
async function loadDoctor() {
  try {
    if (window.isFirebaseConfigured) {
      const [docSnap, specSnap] = await Promise.all([
        db.collection('doctors').doc(doctorId).get(),
        db.collection('specialties').doc(specialtyId).get()
      ]);
      if (docSnap.exists)  doctor    = { id: docSnap.id,  ...docSnap.data() };
      if (specSnap.exists) specialty = { id: specSnap.id, ...specSnap.data() };
    } else {
      const allDocs  = JSON.parse(localStorage.getItem('mock_doctors') || '[]');
      const allSpecs = JSON.parse(localStorage.getItem('mock_specialties') || '[]');
      doctor    = allDocs.find(d => d.id === doctorId)    || null;
      specialty = allSpecs.find(s => s.id === specialtyId) || null;
    }

    if (doctor) {
      document.getElementById('bc-doctor').textContent       = doctor.name;
      document.getElementById('sidebar-doc-name').textContent = doctor.name;
      document.getElementById('sidebar-doc-spec').textContent = specialtyName;
      document.title = `${doctor.name} - احجز موعدك`;

      if (doctor.photo) {
        document.getElementById('sidebar-avatar').innerHTML =
          `<img src="${doctor.photo}" alt="${doctor.name}">`;
      }
    }

    if (specialty?.basePrice) {
      document.getElementById('sum-price').textContent = `${specialty.basePrice} ج.م`;
    }
  } catch (err) {
    console.error('loadDoctor error:', err);
  }
}

// =========================================================
// Load Available Slots
// =========================================================
async function loadSlots() {
  try {
    const today = new Date().toISOString().split('T')[0];

    if (window.isFirebaseConfigured) {
      const snap = await db.collection('availableSlots')
        .where('doctorId', '==', doctorId)
        .where('isBooked', '==', false)
        .get();
      allSlots = [];
      snap.forEach(d => allSlots.push({ id: d.id, ...d.data() }));
    } else {
      const raw = JSON.parse(localStorage.getItem('mock_slots') || '[]');
      allSlots  = raw.filter(s => s.doctorId === doctorId && !s.isBooked);
    }

    // Filter past slots
    allSlots = allSlots.filter(s => s.date >= today);

    // --- Fallback: generate on-the-fly from doctor schedule if no saved slots ---
    if (allSlots.length === 0 && doctor) {
      allSlots = generateSlotsOnTheFly(doctor, 30);
    }

    // Group by date
    slotsByDate = {};
    allSlots.forEach(slot => {
      if (!slotsByDate[slot.date]) slotsByDate[slot.date] = [];
      slotsByDate[slot.date].push(slot);
    });

    // Sort slots in each date by startTime
    Object.keys(slotsByDate).forEach(date => {
      slotsByDate[date].sort((a, b) => a.startTime.localeCompare(b.startTime));
    });

  } catch (err) {
    console.error('loadSlots error:', err);
  }
}

// =========================================================
// On-the-fly slot generation (used as fallback when no saved slots)
// =========================================================
function generateSlotsOnTheFly(doc, daysAhead = 30) {
  const DAYS_EN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const slots     = [];
  const today     = new Date();
  const duration  = doc.appointmentDuration || 30;
  const startTime = doc.workingHoursStart   || '09:00';
  const endTime   = doc.workingHoursEnd     || '17:00';
  const daysOff   = doc.daysOff || [];

  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);

    const dayName = DAYS_EN[date.getDay()];
    if (daysOff.includes(dayName)) continue;

    const dateStr = date.toISOString().split('T')[0];
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);

    let curMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    let idx = 0;

    while (curMin + duration <= endMin) {
      const hh  = String(Math.floor(curMin / 60)).padStart(2, '0');
      const mm  = String(curMin % 60).padStart(2, '0');
      const end2 = curMin + duration;
      const hh2 = String(Math.floor(end2 / 60)).padStart(2, '0');
      const mm2 = String(end2 % 60).padStart(2, '0');

      slots.push({
        id: `fly-${doc.id}-${dateStr}-${idx}`,
        doctorId: doc.id,
        date: dateStr,
        startTime: `${hh}:${mm}`,
        endTime:   `${hh2}:${mm2}`,
        isBooked: false
      });

      curMin += duration;
      idx++;
    }
  }

  // Persist generated slots to mock_slots so booking flow works
  if (!window.isFirebaseConfigured) {
    const existing = JSON.parse(localStorage.getItem('mock_slots') || '[]')
      .filter(s => s.doctorId !== doc.id);
    localStorage.setItem('mock_slots', JSON.stringify([...existing, ...slots]));
  }

  return slots;
}

// =========================================================
// Render Available Days Cards
// =========================================================
function renderAvailableDays() {
  const container = document.getElementById('available-days-container');
  const availableDates = Object.keys(slotsByDate).sort();

  if (availableDates.length === 0) {
    container.innerHTML = `
      <div class="empty-slots" style="width: 100%;">
        <i class="fa-solid fa-calendar-xmark" style="font-size: 2.5rem; margin-bottom: 0.75rem; color: var(--text-muted); display: block;"></i>
        لا توجد أيام متاحة للحجز حالياً لهذا الطبيب
      </div>`;
    return;
  }

  container.innerHTML = availableDates.map(dateStr => {
    const slots = slotsByDate[dateStr] || [];
    const dateObj = new Date(dateStr + 'T00:00:00');
    
    // Format weekday (e.g., الإثنين)
    const dayName = dateObj.toLocaleDateString('ar-EG', { weekday: 'long' });
    // Format day number and month name (e.g., 24 يوليو)
    const formattedDate = dateObj.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
    
    const isSelected = dateStr === selectedDate;
    const cls = isSelected ? 'day-card selected' : 'day-card';

    return `
      <div class="${cls}" data-date="${dateStr}" onclick="onDayClick(this)">
        <span class="day-card-name">${dayName}</span>
        <span class="day-card-date">${formattedDate}</span>
        <span class="day-card-slots">${slots.length} مواعيد</span>
      </div>
    `;
  }).join('');
}

// =========================================================
// Day Click
// =========================================================
function onDayClick(el) {
  const date = el.dataset.date;
  selectedDate = date;
  selectedSlot = null;

  renderAvailableDays();

  // Update label
  const dateObj = new Date(date + 'T00:00:00');
  const label   = dateObj.toLocaleDateString('ar-EG', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  document.getElementById('selected-date-label').textContent = `– ${label}`;
  document.getElementById('sum-date').textContent = label;
  document.getElementById('sum-time').textContent = '-- لم يُحدَّد --';
  document.getElementById('proceed-btn').disabled = true;

  renderSlots(date);
}

// =========================================================
// Render Time Slots
// =========================================================
function renderSlots(date) {
  const slotsGrid = document.getElementById('slots-grid');
  const slots     = slotsByDate[date] || [];

  if (slots.length === 0) {
    slotsGrid.innerHTML = `<div class="empty-slots"><i class="fa-solid fa-calendar-xmark" style="margin-left:.4rem;"></i>لا توجد مواعيد متاحة في هذا اليوم</div>`;
    return;
  }

  slotsGrid.innerHTML = slots.map(slot => {
    const cls = slot.isBooked ? 'slot-btn booked' : 'slot-btn';
    const onclick = slot.isBooked ? '' : `onclick="onSlotClick(this, '${slot.id}')"`;
    return `<button class="${cls}" data-slot-id="${slot.id}" ${onclick}>${slot.startTime}</button>`;
  }).join('');
}

// =========================================================
// Slot Click
// =========================================================
function onSlotClick(el, slotId) {
  // Deselect all
  document.querySelectorAll('.slot-btn.selected').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');

  selectedSlot = allSlots.find(s => s.id === slotId);
  if (!selectedSlot) return;

  document.getElementById('sum-time').textContent = `${selectedSlot.startTime} – ${selectedSlot.endTime}`;
  document.getElementById('proceed-btn').disabled = false;
}
