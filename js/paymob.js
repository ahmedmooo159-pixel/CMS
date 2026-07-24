// =========================================================
// paymob.js  –  Paymob Payment Integration
// =========================================================
//
// Flow:
//  1. Admin must set PAYMOB_API_KEY in localStorage (or env via backend)
//  2. initiatePaymobPayment() → get auth token → create order → get payment key → show iframe
//  3. Paymob posts back to the page via iframe message / callback URL
//  4. On success → saveAppointment() → redirect to confirmation
//
// NOTE: Paymob requires a backend for production (to keep API key secret).
//       In this implementation we detect mock mode and skip to a simulated success.
// =========================================================

const PAYMOB_API_KEY     = localStorage.getItem('PAYMOB_API_KEY')     || 'ZXlKaGJHY2lPaUpJVXpVeE1pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SmpiR0Z6Y3lJNklrMWxjbU5vWVc1MElpd2ljSEp2Wm1sc1pWOXdheUk2TVRFNU1EazJNQ3dpYm1GdFpTSTZJbWx1YVhScFlXd2lmUS5rU0RodzROd1lUbVdJOS1iZ3ZIZnRXRmtGRnhpNHFwOGNMSjBnNzFqZHNHUDl5MktHa0REMmhnTTlubFNGRzVWTUdGOEFmX1dRWlVEcXRtOHNzNmV0dw==';
const PAYMOB_PUBLIC_KEY  = localStorage.getItem('PAYMOB_PUBLIC_KEY')  || 'egy_pk_test_bsgLBJovVUdGJ14mQdtJYL4b2L3tXIGB';
const PAYMOB_SECRET_KEY  = localStorage.getItem('PAYMOB_SECRET_KEY')  || 'egy_sk_test_ed1818be34d1e7423e72f4f1190e765a95fd47c1a46562c7b73d05745351d879';
const PAYMOB_HMAC        = localStorage.getItem('PAYMOB_HMAC')        || 'E54BBAF7AEABA1411EE8A2A5CEA56CDC';
const PAYMOB_IFRAME_ID   = localStorage.getItem('PAYMOB_IFRAME_ID')   || '783284';
const PAYMOB_INTEGRATION = localStorage.getItem('PAYMOB_INTEGRATION') || '4428178';

// =========================================================
// Main entry point called from booking.js
// =========================================================
async function initiatePaymobPayment(patient, notes) {
  if (!PAYMOB_API_KEY || !PAYMOB_IFRAME_ID || !PAYMOB_INTEGRATION) {
    // ---- Mock / Demo mode ----
    console.warn('Paymob credentials not configured. Running in demo mode.');
    await runPaymobDemo(patient, notes);
    return;
  }

  try {
    showStatus('جاري تهيئة بوابة الدفع...', 'info');

    // Step 1: Authenticate
    const authRes  = await paymobRequest('https://accept.paymob.com/api/auth/tokens', { api_key: PAYMOB_API_KEY });
    const token    = authRes.token;

    // Step 2: Create Order
    const specialty = window._bookingSpecialty;
    const amountCents = Math.round((specialty?.basePrice || 100) * 100);

    const orderRes = await paymobRequest('https://accept.paymob.com/api/ecommerce/orders', {
      auth_token:    token,
      delivery_needed: false,
      amount_cents:  amountCents,
      currency:      'EGP',
      items:         []
    });

    // Step 3: Get Payment Key
    const doctor  = window._bookingDoctor;
    const keyRes  = await paymobRequest('https://accept.paymob.com/api/acceptance/payment_keys', {
      auth_token:         token,
      amount_cents:       amountCents,
      expiration:         3600,
      order_id:           orderRes.id,
      currency:           'EGP',
      integration_id:     Number(PAYMOB_INTEGRATION),
      billing_data: {
        first_name:       patient.firstName,
        last_name:        patient.lastName,
        email:            patient.email || 'NA',
        phone_number:     patient.phone,
        apartment:        'NA', floor:'NA', street:'NA', building:'NA',
        shipping_method:  'NA', postal_code:'NA', city:'NA',
        country:          'EG', state:'NA'
      }
    });

    const paymentKey = keyRes.token;

    // Step 4: Load iframe
    const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${PAYMOB_IFRAME_ID}?payment_token=${paymentKey}`;
    const iframe    = document.getElementById('paymob-iframe');
    iframe.src      = iframeUrl;
    document.getElementById('paymob-container').style.display = 'block';

    // Step 5: Listen for Paymob iframe postMessage callback
    window.addEventListener('message', async (event) => {
      // Paymob sends success/failure via URL params on redirect (handled below)
      // OR via postMessage in some implementations
      if (event.data && event.data.type === 'payment_success') {
        await onPaymentSuccess(patient, notes, event.data.transaction_id);
      } else if (event.data && event.data.type === 'payment_error') {
        onPaymentError(event.data.message || 'فشل عملية الدفع.');
      }
    });

    // Also watch iframe URL change (for redirect-based flow)
    iframe.addEventListener('load', () => {
      try {
        const iUrl = iframe.contentWindow.location.href;
        if (iUrl.includes('success=true') || iUrl.includes('is_voided=false&is_refunded=false&pending=false')) {
          const iParams = new URLSearchParams(iframe.contentWindow.location.search);
          const txId    = iParams.get('id') || iParams.get('transaction_id') || 'TXN' + Date.now();
          onPaymentSuccess(patient, notes, txId);
        } else if (iUrl.includes('success=false')) {
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

// =========================================================
// Fetch helper for Paymob API
// =========================================================
async function paymobRequest(url, body) {
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Paymob API error: ${res.status}`);
  return res.json();
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
