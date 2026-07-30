/**
 * inquiries.js — Admin: Load and manage patient contact tickets.
 * Reads from Firestore collection "inquiries" or localStorage fallback.
 */

(function () {
  const tbody       = document.getElementById('inquiries-tbody');
  const searchInput = document.getElementById('search-inquiries');
  const filterSel   = document.getElementById('filter-inquiry-status');
  const badge       = document.getElementById('new-inquiries-badge');

  if (!tbody) return;

  let allInquiries = [];

  const subjectLabels = {
    booking:   'استفسار عن الحجز',
    price:     'استفسار عن الأسعار',
    doctor:    'الاستفسار عن طبيب',
    complaint: 'شكوى أو ملاحظة',
    other:     'أخرى',
  };

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('ar-EG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function statusBadge(status) {
    const map = {
      new:      { label: 'جديد',    cls: 'new'      },
      read:     { label: 'مقروء',   cls: 'read'     },
      resolved: { label: 'تم الحل', cls: 'resolved' },
    };
    const s = map[status] || { label: status, cls: 'read' };
    return `<span class="inquiry-status ${s.cls}">${s.label}</span>`;
  }

  function renderRows(list) {
    if (!list.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7"><i class="fa-solid fa-inbox" style="font-size:2rem;opacity:.3;"></i><p style="margin-top:.75rem;">لا توجد استفسارات بعد.</p></td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(item => `
      <tr data-id="${item.id}">
        <td><strong>${window.escHtml ? window.escHtml(item.name) : item.name}</strong></td>
        <td><a href="https://wa.me/${item.phone.replace(/\D/g,'')}" target="_blank" class="whatsapp-btn" style="font-size:.75rem;">
          <i class="fa-brands fa-whatsapp"></i> ${item.phone}
        </a></td>
        <td>${subjectLabels[item.subject] || item.subjectLabel || item.subject}</td>
        <td style="max-width:220px; white-space:pre-wrap; font-size:.8rem; color:var(--text-muted);">${window.escHtml ? window.escHtml(item.message) : item.message}</td>
        <td style="font-size:.8rem;">${formatDate(item.createdAt)}</td>
        <td>${statusBadge(item.status || 'new')}</td>
        <td>
          <div style="display:flex;gap:.4rem;flex-wrap:wrap;">
            ${item.status !== 'resolved' ? `<button class="tbl-btn" onclick="markInquiry('${item.id}', 'resolved')" title="تم الحل"><i class="fa-solid fa-circle-check"></i></button>` : ''}
            ${item.status === 'new' ? `<button class="tbl-btn" onclick="markInquiry('${item.id}', 'read')" title="تمييز مقروء"><i class="fa-solid fa-eye"></i></button>` : ''}
            <button class="tbl-btn" style="color:var(--danger);border-color:rgba(220,38,38,.3);" onclick="deleteInquiry('${item.id}')" title="حذف"><i class="fa-solid fa-trash"></i></button>
          </div>
        </td>
      </tr>`).join('');
  }

  function applyFilters() {
    const q = (searchInput ? searchInput.value : '').toLowerCase();
    const f = (filterSel   ? filterSel.value   : 'all');
    const filtered = allInquiries.filter(item => {
      const matchQ = !q || item.name.toLowerCase().includes(q) || item.phone.includes(q);
      const matchF = f === 'all' || (item.status || 'new') === f;
      return matchQ && matchF;
    });
    renderRows(filtered);
  }

  window.loadInquiries = async function () {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7"><i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem;color:var(--primary-color);"></i><p style="margin-top:.75rem;">جاري تحميل الاستفسارات...</p></td></tr>`;
    try {
      if (window.isFirebaseConfigured && window.db) {
        const snap = await window.db.collection('inquiries').orderBy('createdAtMs', 'desc').limit(100).get();
        allInquiries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } else {
        const stored = JSON.parse(localStorage.getItem('clinic_inquiries') || '[]');
        allInquiries = stored.map((t, i) => ({ ...t, id: t.id || 'local_' + i }));
      }

      // Update badge
      const newCount = allInquiries.filter(i => (i.status || 'new') === 'new').length;
      if (badge) {
        badge.textContent = newCount;
        badge.style.display = newCount > 0 ? 'inline-block' : 'none';
      }

      applyFilters();
    } catch (err) {
      console.error('Error loading inquiries:', err);
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">حدث خطأ أثناء تحميل الاستفسارات.</td></tr>`;
    }
  };

  window.markInquiry = async function (id, newStatus) {
    try {
      if (window.isFirebaseConfigured && window.db) {
        await window.db.collection('inquiries').doc(id).update({ status: newStatus });
      } else {
        const stored = JSON.parse(localStorage.getItem('clinic_inquiries') || '[]');
        const idx = stored.findIndex(t => t.id === id);
        if (idx !== -1) { stored[idx].status = newStatus; localStorage.setItem('clinic_inquiries', JSON.stringify(stored)); }
      }
      const item = allInquiries.find(i => i.id === id);
      if (item) item.status = newStatus;
      applyFilters();
      // Re-compute badge
      const newCount = allInquiries.filter(i => (i.status || 'new') === 'new').length;
      if (badge) { badge.textContent = newCount; badge.style.display = newCount > 0 ? 'inline-block' : 'none'; }
    } catch (err) { console.error('markInquiry error:', err); }
  };

  window.deleteInquiry = async function (id) {
    if (!confirm('هل أنت متأكد من حذف هذا الاستفسار؟')) return;
    try {
      if (window.isFirebaseConfigured && window.db) {
        await window.db.collection('inquiries').doc(id).delete();
      } else {
        const stored = JSON.parse(localStorage.getItem('clinic_inquiries') || '[]');
        localStorage.setItem('clinic_inquiries', JSON.stringify(stored.filter(t => t.id !== id)));
      }
      allInquiries = allInquiries.filter(i => i.id !== id);
      applyFilters();
    } catch (err) { console.error('deleteInquiry error:', err); }
  };

  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (filterSel)   filterSel.addEventListener('change', applyFilters);

  // Auto-load after auth is ready
  const checkAuth = setInterval(() => {
    if (window.db !== undefined || window.isFirebaseConfigured === false) {
      clearInterval(checkAuth);
      window.loadInquiries();
    }
  }, 400);
})();
