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
let currentWeekIndex = 0;
let availableDates = [];
let unsubscribeSlots = null;  // 🔥 real-time listener

// =========================================================
// Init
// =========================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Breadcrumb
  document.getElementById('bc-specialty-link').textContent = specialtyName || 'التخصص';
  document.getElementById('bc-specialty-link').href = `doctors-list.html?specialtyId=${encodeURIComponent(specialtyId)}&specialtyName=${encodeURIComponent(specialtyName)}`;
  document.getElementById('back-btn').href = `doctors-list.html?specialtyId=${encodeURIComponent(specialtyId)}&specialtyName=${encodeURIComponent(specialtyName)}`;

  await loadDoctor();   // must load first so fallback slot gen can use doctor object
  await startSlotsListener();
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
// 🔥 Real-time Slots Listener (بدل loadSlots القديمة)
// =========================================================
async function startSlotsListener() {
  const today = new Date().toISOString().split('T')[0];

  if (!window.isFirebaseConfigured) {
    // Mock mode: load once
    await loadSlotsMock();
    return;
  }

  // Real Firebase: real-time listener
  unsubscribeSlots = db.collection('availableSlots')
    .where('doctorId', '==', doctorId)
    .where('isBooked', '==', false)
    .onSnapshot(
      (snapshot) => {
        allSlots = [];
        snapshot.forEach(d => allSlots.push({ id: d.id, ...d.data() }));

        // Filter past slots
        allSlots = allSlots.filter(s => s.date >= today);

        // Fallback: generate on-the-fly if no saved slots
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

        availableDates = Object.keys(slotsByDate).sort();

        // Re-render UI
        renderAvailableDays();
        if (selectedDate) {
          renderSlots(selectedDate);
        }
      },
      (err) => {
        console.error('Real-time slots listener error:', err);
        // Fallback to one-time load
        loadSlotsMock();
      }
    );
}

// =========================================================
// Mock Mode: Load Slots Once
// =========================================================
async function loadSlotsMock() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const raw = JSON.parse(localStorage.getItem('mock_slots') || '[]');
    allSlots  = raw.filter(s => s.doctorId === doctorId && !s.isBooked);

    // Filter past slots
    allSlots = allSlots.filter(s => s.date >= today);

    // Fallback: generate on-the-fly if no saved slots
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
    console.error('loadSlotsMock error:', err);
  }
}

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

      if (doctor.photo && window.isValidImageUrl(doctor.photo)) {
        document.getElementById('sidebar-avatar').innerHTML =
          `<img src="${doctor.photo}" alt="${window.escHtml(doctor.name)}">`;
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
// Render Available Days List
// =========================================================
function renderAvailableDays() {
  const listElem = document.getElementById('available-days-list');
  const navElem  = document.getElementById('week-nav');
  if (!listElem) return;
  
  if (availableDates.length === 0) {
    availableDates = Object.keys(slotsByDate).sort();
  }

  if (availableDates.length === 0) {
    listElem.innerHTML = `<div class="empty-slots" style="width:100%;padding:1rem;">لا توجد أيام متاحة للحجز حالياً</div>`;
    if(navElem) navElem.style.display = 'none';
    return;
  }
  
  // Calculate total weeks (7 days per week)
  const totalWeeks = Math.ceil(availableDates.length / 7);
  
  if(navElem) {
    if(totalWeeks > 1) {
      navElem.style.display = 'flex';
      document.getElementById('week-label').textContent = `الأسبوع ${currentWeekIndex + 1}`;
      document.getElementById('prev-week-btn').disabled = currentWeekIndex === 0;
      document.getElementById('next-week-btn').disabled = currentWeekIndex === totalWeeks - 1;
    } else {
      navElem.style.display = 'none';
    }
  }
  
  const startIndex = currentWeekIndex * 7;
  const currentWeekDates = availableDates.slice(startIndex, startIndex + 7);
  
  let html = '';
  currentWeekDates.forEach(dateStr => {
    const slots = slotsByDate[dateStr] || [];
    const dateObj = new Date(dateStr + 'T00:00:00');
    
    const dayName = dateObj.toLocaleDateString('ar-EG', { weekday: 'short' });
    const dayNum = dateObj.getDate();
    const monthName = dateObj.toLocaleDateString('ar-EG', { month: 'short' });
    
    const isSelected = dateStr === selectedDate ? 'selected' : '';

    html += `
      <div class="day-card ${isSelected}" onclick="onDaySelectChange('${dateStr}')">
        <div class="day-name">${dayName}</div>
        <div class="day-date">${dayNum}</div>
        <div class="day-month">${monthName}</div>
      </div>
    `;
  });

  listElem.innerHTML = html;
}

// =========================================================
// Change Week
// =========================================================
function changeWeek(direction) {
  const totalWeeks = Math.ceil(availableDates.length / 7);
  // Note: direction is -1 for next (left arrow in RTL) and 1 for prev (right arrow in RTL)
  if (direction === -1 && currentWeekIndex < totalWeeks - 1) {
    currentWeekIndex++;
    renderAvailableDays();
  } else if (direction === 1 && currentWeekIndex > 0) {
    currentWeekIndex--;
    renderAvailableDays();
  }
}

// =========================================================
// Day Select Change
// =========================================================
function onDaySelectChange(date) {
  selectedDate = date;
  selectedSlot = null;
  
  if (!date) {
    document.getElementById('selected-date-label').textContent = '';
    document.getElementById('sum-date').textContent = '-- لم يُحدَّد --';
    document.getElementById('sum-time').textContent = '-- لم يُحدَّد --';
    document.getElementById('proceed-btn').disabled = true;
    document.getElementById('slots-grid').innerHTML = '<div class="empty-slots">اختر يوماً من التقويم لعرض المواعيد المتاحة</div>';
    renderAvailableDays();
    return;
  }

  // Update label
  const dateObj = new Date(date + 'T00:00:00');
  const label   = dateObj.toLocaleDateString('ar-EG', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  document.getElementById('selected-date-label').textContent = `– ${label}`;
  document.getElementById('sum-date').textContent = label;
  document.getElementById('sum-time').textContent = '-- لم يُحدَّد --';
  document.getElementById('proceed-btn').disabled = true;

  renderAvailableDays();
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
    return `<div class="${cls}" data-slot-id="${slot.id}" ${onclick}>${slot.startTime}</div>`;
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

// =========================================================
// Cleanup on page unload
// =========================================================
window.addEventListener('beforeunload', () => {
  if (unsubscribeSlots) unsubscribeSlots();
});