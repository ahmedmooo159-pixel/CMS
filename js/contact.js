/**
 * contact.js — Patient Contact Ticket Submission
 * Saves inquiry to Firestore (collection: "inquiries") or localStorage fallback.
 */

(function () {
  const form    = document.getElementById('contactTicketForm');
  const statusEl = document.getElementById('ticket-status');
  const submitBtn = document.getElementById('ticket-submit-btn');

  if (!form) return;

  function showStatus(msg, type) {
    statusEl.style.display = 'block';
    statusEl.textContent = msg;
    if (type === 'success') {
      statusEl.style.background = 'rgba(5,150,105,0.1)';
      statusEl.style.border     = '1px solid rgba(5,150,105,0.25)';
      statusEl.style.color      = 'var(--success)';
    } else {
      statusEl.style.background = 'rgba(220,38,38,0.1)';
      statusEl.style.border     = '1px solid rgba(220,38,38,0.25)';
      statusEl.style.color      = 'var(--danger)';
    }
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const name    = document.getElementById('ticket-name').value.trim();
    const phone   = document.getElementById('ticket-phone').value.trim();
    const subject = document.getElementById('ticket-subject').value;
    const message = document.getElementById('ticket-message').value.trim();

    if (!name || !phone || !message) {
      showStatus('يرجى ملء جميع الحقول المطلوبة.', 'error');
      return;
    }

    const subjectLabels = {
      booking:   'استفسار عن الحجز',
      price:     'استفسار عن الأسعار',
      doctor:    'الاستفسار عن طبيب',
      complaint: 'شكوى أو ملاحظة',
      other:     'أخرى',
    };

    const ticket = {
      name,
      phone,
      subject,
      subjectLabel: subjectLabels[subject] || subject,
      message,
      status:  'new',       // new | read | resolved
      createdAt: new Date().toISOString(),
      createdAtMs: Date.now(),
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال...';

    try {
      if (window.isFirebaseConfigured && window.db) {
        await window.db.collection('inquiries').add(ticket);
      } else {
        // LocalStorage fallback
        const existing = JSON.parse(localStorage.getItem('clinic_inquiries') || '[]');
        ticket.id = 'local_' + Date.now();
        existing.unshift(ticket);
        localStorage.setItem('clinic_inquiries', JSON.stringify(existing));
      }

      showStatus('✅ تم إرسال رسالتك بنجاح! سنتواصل معك قريباً.', 'success');
      form.reset();
    } catch (err) {
      console.error('Ticket submission error:', err);
      showStatus('حدث خطأ أثناء الإرسال. يرجى المحاولة مرة أخرى.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال الرسالة';
    }
  });
})();
