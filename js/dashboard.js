// Admin Dashboard Logic

// Protect this route - require authenticated admin
window.requireAdmin();

document.addEventListener("DOMContentLoaded", () => {
  // Update header auth display
  window.auth.onAuthStateChanged((user) => {
    if (user) {
      document.getElementById("current-user-email").textContent = user.email;
    }
  });

  // Display DB status
  if (window.isFirebaseConfigured) {
    document.getElementById("db-status-badge").textContent = "قاعدة بيانات حية";
    document.getElementById("db-status-badge").className = "badge badge-completed";
    document.getElementById("auth-status-badge").textContent = "توثيق فايربيز";
    document.getElementById("auth-status-badge").className = "badge badge-completed";
  }

  // Handle Logout
  document.getElementById("logout-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await window.auth.signOut();
      window.location.href = "login.html";
    } catch (err) {
      console.error("Sign out error:", err);
    }
  });

  // Load Dashboard Stats & Data
  loadDashboardData();
});

async function loadDashboardData() {
  const appointmentsListEl = document.getElementById("recent-appointments-list");
  
  try {
    let todayAppointments = [];
    let revenueToday = 0;
    let newPatientsThisMonth = 0;
    let pendingPayments = 0;

    if (window.isFirebaseConfigured) {
      // Fetch appointments from Firestore
      const snapshot = await db.collection("appointments").get();
      const docs = [];
      snapshot.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
      
      const todayStr = new Date().toISOString().split('T')[0];
      
      docs.forEach(appt => {
        if (appt.appointmentDate === todayStr) {
          todayAppointments.push(appt);
          if (appt.status === "completed" || appt.paymentStatus === "paid") {
            revenueToday += appt.price || 0;
          }
        }
        if (appt.paymentStatus === "unpaid") {
          pendingPayments += appt.price || 0;
        }
      });
      
      const patientsSnap = await db.collection("patients").get();
      let patientCount = 0;
      patientsSnap.forEach(() => patientCount++);
      newPatientsThisMonth = patientCount;

      renderAppointments(docs.slice(0, 5), appointmentsListEl);
      
    } else {
      // Mock Data Mode
      todayAppointments = [
        { id: "1", patientName: "أحمد علي", doctorName: "د. منى حسن", appointmentTime: "10:30", status: "confirmed", paymentStatus: "paid", price: 200 },
        { id: "2", patientName: "سارة كمال", doctorName: "د. منى حسن", appointmentTime: "11:00", status: "pending", paymentStatus: "unpaid", price: 200 },
        { id: "3", patientName: "عمر شريف", doctorName: "د. طارق عيد", appointmentTime: "13:00", status: "completed", paymentStatus: "paid", price: 150 },
      ];
      revenueToday = 350;
      newPatientsThisMonth = 12;
      pendingPayments = 200;

      const mockAll = [
        ...todayAppointments,
        { id: "4", patientName: "ياسمين عادل", doctorName: "د. منى حسن", appointmentTime: "أمس", status: "completed", paymentStatus: "paid", price: 200 },
        { id: "5", patientName: "مريم سيد", doctorName: "د. طارق عيد", appointmentTime: "أمس", status: "cancelled", paymentStatus: "unpaid", price: 150 }
      ];
      
      renderAppointments(mockAll, appointmentsListEl);
    }

    // Update Widgets
    document.getElementById("widget-appointments-count").textContent = todayAppointments.length;
    document.getElementById("widget-revenue-count").textContent = `${revenueToday} ج.م`;
    document.getElementById("widget-new-patients").textContent = newPatientsThisMonth;
    document.getElementById("widget-pending-payments").textContent = `${pendingPayments} ج.م`;

  } catch (error) {
    console.error("Error loading dashboard data:", error);
    appointmentsListEl.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--danger); padding: 2rem;">
          <i class="fa-solid fa-triangle-exclamation"></i> حدث خطأ أثناء تحميل بيانات لوحة التحكم.
        </td>
      </tr>
    `;
  }
}

function renderAppointments(appointments, container) {
  if (!appointments || appointments.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          لا توجد حجوزات حديثة حالياً.
        </td>
      </tr>
    `;
    return;
  }

  // Translating state keys
  const statusLabels = {
    pending: "قيد الانتظار",
    confirmed: "مؤكد",
    completed: "مكتمل",
    cancelled: "ملغى"
  };

  const paymentLabels = {
    paid: "مدفوع",
    unpaid: "غير مدفوع"
  };

  container.innerHTML = appointments.map(appt => {
    const patientName = appt.patientName || appt.patientId || "مريض مجهول";
    const doctorName = appt.doctorName || appt.doctorId || "طبيب مجهول";
    const time = appt.appointmentTime || appt.appointmentDate || "--:--";
    const status = appt.status || "pending";
    const paymentStatus = appt.paymentStatus || "unpaid";
    
    const displayStatus = statusLabels[status] || status;
    const displayPayment = paymentLabels[paymentStatus] || paymentStatus;

    return `
      <tr>
        <td style="font-weight: 500;">${patientName}</td>
        <td>${doctorName}</td>
        <td>${time}</td>
        <td><span class="badge badge-${status}">${displayStatus}</span></td>
        <td><span class="badge badge-${paymentStatus === 'paid' ? 'completed' : 'pending'}">${displayPayment}</span></td>
      </tr>
    `;
  }).join('');
}
