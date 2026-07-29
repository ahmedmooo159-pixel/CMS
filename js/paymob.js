// =========================================================
// paymob.js  –  Paymob Payment Integration (Backend Refactor)
// =========================================================
//
// Flow:
//  1. initiatePaymobPayment() → calls Cloud Function `initiatePayment`
//  2. Cloud Function returns iframeUrl
//  3. Paymob posts back to the page via iframe message / callback URL
//  4. On success → saveAppointment() → redirect to confirmation
// =========================================================

// =========================================================
// Main entry point called from booking.js
// =========================================================
async function initiatePaymobPayment(patient, notes) {
  try {
    showStatus('جاري تهيئة بوابة الدفع...', 'info');

    // Make sure Firebase is initialized
    if (!window.isFirebaseConfigured) {
      console.warn('Firebase not configured. Running in demo mode.');
      await runPaymobDemo(patient, notes);
      return;
    }

    const specialty = window._bookingSpecialty;
    const amountCents = Math.round((specialty?.basePrice || 100) * 100);

    // Call Cloud Function
    const initiatePayment = firebase.functions().httpsCallable('initiatePayment');
    const result = await initiatePayment({
      amountCents,
      patient: {
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        phone: patient.phone
      }
    });

    const { iframeUrl, orderId } = result.data;

    if (!iframeUrl) {
      console.warn('No iframe URL returned (Demo mode or missing keys).');
      await runPaymobDemo(patient, notes);
      return;
    }

    // Step 4: Load iframe
    const iframe    = document.getElementById('paymob-iframe');
    iframe.src      = iframeUrl;
    document.getElementById('paymob-container').style.display = 'block';

    let paymentCompleted = false;

    // Step 5: Listen for Paymob iframe postMessage callback
    const messageListener = async (event) => {
      if (paymentCompleted) return;
      if (event.data && event.data.type === 'payment_success') {
        paymentCompleted = true;
        await onPaymentSuccess(patient, notes, event.data.transaction_id);
      } else if (event.data && event.data.type === 'payment_error') {
        paymentCompleted = true;
        onPaymentError(event.data.message || 'فشل عملية الدفع.');
      }
    };
    window.addEventListener('message', messageListener, { once: true });

    // Also watch iframe URL change (for redirect-based flow)
    iframe.addEventListener('load', () => {
      if (paymentCompleted) return;
      try {
        const iUrl = iframe.contentWindow.location.href;
        if (iUrl.includes('success=true') || iUrl.includes('is_voided=false&is_refunded=false&pending=false')) {
          paymentCompleted = true;
          const iParams = new URLSearchParams(iframe.contentWindow.location.search);
          const txId    = iParams.get('id') || iParams.get('transaction_id') || 'TXN' + Date.now();
          onPaymentSuccess(patient, notes, txId);
        } else if (iUrl.includes('success=false')) {
          paymentCompleted = true;
          onPaymentError('تم رفض عملية الدفع. يرجى المحاولة مرة أخرى.');
        }
      } catch (_) { /* cross-origin — ignore */ }
    });

    showStatus('', '');

  } catch (err) {
    console.error('Paymob init error:', err);
    showStatus('فشل الاتصال ببوابة الدفع: ' + err.message + ' — يمكنك الدفع عند الحضور.', 'error');
    // Fallback: offer cash
    document.getElementById('pm-cash').click();
  }
}

// =========================================================
// Payment Success callback
// =========================================================
async function onPaymentSuccess(patient, notes, transactionId) {
  showStatus('✔ تم الدفع بنجاح! جاري تأكيد الحجز...', 'info');
  await window.saveAppointment(patient, notes, 'paymob', 'paid', transactionId);
}

// =========================================================
// Payment Error callback
// =========================================================
function onPaymentError(message) {
  showStatus(message + ' — يمكنك اختيار الدفع عند الحضور.', 'error');
  const btn = document.getElementById('confirm-booking-btn');
  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-calendar-check"></i> تأكيد الحجز';
}

// =========================================================
// Demo mode: simulate payment UI → auto-succeed after 2s
// =========================================================
async function runPaymobDemo(patient, notes) {
  const container = document.getElementById('paymob-container');
  container.style.display = 'block';
  container.innerHTML = `
    <div style="padding:2rem;text-align:center;background:var(--bg-input);">
      <i class="fa-solid fa-credit-card" style="font-size:2.5rem;color:var(--secondary-color);margin-bottom:1rem;display:block;"></i>
      <h3 style="font-family:var(--font-display);margin-bottom:.5rem;">بوابة الدفع — وضع تجريبي</h3>
      <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:1.5rem;">
        لم يتم إعداد Paymob بعد. في الوضع التجريبي سيتم قبول الدفع تلقائياً.
      </p>
      <div id="paymob-demo-countdown" style="font-size:1.5rem;font-weight:700;color:var(--primary-color);margin-bottom:1rem;">3</div>
      <p style="color:var(--text-muted);font-size:.85rem;">جاري المعالجة...</p>
    </div>`;

  let count = 3;
  const interval = setInterval(() => {
    count--;
    const el = document.getElementById('paymob-demo-countdown');
    if (el) el.textContent = count;
    if (count <= 0) {
      clearInterval(interval);
      onPaymentSuccess(patient, notes, 'DEMO-' + Date.now());
    }
  }, 1000);
}

function showStatus(msg, type) {
  const el = document.getElementById('booking-status');
  if (!el) return;
  if (!msg) { el.style.display = 'none'; return; }
  el.textContent = msg;
  el.className = `status-bar ${type}`;
  el.style.display = 'block';
}

// Expose
window.initiatePaymobPayment = initiatePaymobPayment;
