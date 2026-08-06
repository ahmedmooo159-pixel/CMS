// =========================================================
// confirmation.js  –  Booking Confirmation Page
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
  loadClinicName();
  renderConfirmation();
});

async function loadClinicName() {
  try {
    let name = 'العيادة';
    if (window.isFirebaseConfigured) {
      const doc = await db.collection('clinics').doc('settings').get();
      if (doc.exists && doc.data().name) name = doc.data().name;
    } else {
      const s = JSON.parse(localStorage.getItem('mock_firestore_clinics_settings') || '{}');
      if (s.name) name = s.name;
    }
    document.getElementById('clinic-name').textContent = name;
  } catch (_) {}
}

function renderConfirmation() {
  try {
    // Try sessionStorage first, then URL params as fallback
    const raw = sessionStorage.getItem('booking_confirmation');
    
    if (!raw) {
      console.warn('No booking confirmation data found in sessionStorage');
      // Fallback: show generic success if no data
      document.getElementById('booking-ref').textContent = 'REF-' + Date.now().toString(36).toUpperCase();
      document.getElementById('conf-subtitle').textContent = 'تم تأكيد حجزك. سيتم التواصل معك قريباً.';
      showGenericTracking();
      return;
    }

    const data = JSON.parse(raw);
    console.log('Booking confirmation data:', data);

    // ========== Reference ==========
    if (data.ref) {
      document.getElementById('booking-ref').textContent = data.ref;
    }

    // ========== Doctor / Specialty ==========
    if (data.doctor) {
      document.getElementById('conf-doctor').textContent = data.doctor.name || '--';
    }
    if (data.specialty) {
      document.getElementById('conf-specialty').textContent = data.specialty.name || '--';
    }

    // ========== Date / Time ==========
    if (data.date) {
      const d = new Date(data.date + 'T00:00:00');
      document.getElementById('conf-date').textContent = d.toLocaleDateString('ar-EG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
    if (data.startTime && data.endTime) {
      document.getElementById('conf-time').textContent = `${data.startTime} – ${data.endTime}`;
    }

    // ========== Patient ==========
    if (data.patient) {
      const firstName = data.patient.firstName || '';
      const lastName = data.patient.lastName || '';
      document.getElementById('conf-patient').textContent = `${firstName} ${lastName}`.trim();
      document.getElementById('conf-phone').textContent = data.patient.phone || '--';
    }

    // ========== Price ==========
    if (data.price) {
      document.getElementById('conf-price').textContent = `${data.price} ج.م`;
    }

    // ========== Queue Number ==========
    if (data.queueNumber) {
      document.getElementById('conf-queue').textContent = `رقم ${data.queueNumber}`;
    }

    // ========== Payment Status ==========
    const payEl = document.getElementById('conf-payment-status');
    if (data.paymentStatus === 'paid') {
      payEl.innerHTML = `<span class="payment-badge paid"><i class="fa-solid fa-circle-check"></i> مدفوع إلكترونياً</span>`;
    } else {
      const method = data.paymentMethod === 'cash' ? 'الدفع عند الحضور' : 'في انتظار الدفع';
      payEl.innerHTML = `<span class="payment-badge unpaid"><i class="fa-solid fa-clock"></i> ${method}</span>`;
    }

    // ========== Subtitle ==========
    const queueMsg = data.queueNumber ? ` وأنت رقم ${data.queueNumber} في الدور.` : '';
    if (data.paymentStatus === 'paid') {
      document.getElementById('conf-subtitle').textContent = `تم الدفع وتأكيد الحجز بنجاح${queueMsg} نراك قريباً!`;
    } else {
      document.getElementById('conf-subtitle').textContent = `تم تسجيل حجزك${queueMsg} يرجى الحضور في الموعد المحدد وإحضار هذا الرقم المرجعي.`;
    }

    // ========== Tracking Link ==========
    if (data.ref) {
      const trackingUrl = `queue-radar.html?ref=${encodeURIComponent(data.ref)}`;
      const trackingLink = document.getElementById('queue-radar-btn');
      if (trackingLink) {
        trackingLink.href = trackingUrl;
        trackingLink.innerHTML = '<i class="fa-solid fa-satellite-dish"></i> تتبع دورك الآن 📍';
      }
      
      // Also set WhatsApp share link
      const whatsappBtn = document.getElementById('whatsapp-share-btn');
      if (whatsappBtn) {
        const docName = data.doctor?.name || 'الطبيب';
        const whatsappMsg = `أهلاً، يمكنك تتبع دورك وموعد دخولك عيادة د. ${docName} عبر رادار الانتظار الحي:\n${trackingUrl}`;
        whatsappBtn.href = `https://wa.me/?text=${encodeURIComponent(whatsappMsg)}`;
      }
    }

    // ========== Cancel Booking Link ==========
    const cancelLink = document.getElementById('cancel-booking-link');
    if (cancelLink && data.ref) {
      cancelLink.href = `cancel-booking.html?ref=${encodeURIComponent(data.ref)}`;
    }

    // ========== Clear session after reading ==========
    sessionStorage.removeItem('booking_confirmation');

  } catch (err) {
    console.error('Error rendering confirmation:', err);
    document.getElementById('booking-ref').textContent = 'خطأ';
    document.getElementById('conf-subtitle').textContent = 'حدث خطأ في تحميل بيانات الحجز.';
  }
}

// ========== Fallback: Show generic tracking if no data ==========
function showGenericTracking() {
  const trackingLink = document.getElementById('queue-radar-btn');
  if (trackingLink) {
    trackingLink.style.display = 'none';
  }
}