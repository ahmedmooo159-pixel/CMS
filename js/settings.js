// Clinic Settings form logic (Arabic Translation)

// Protect route
window.requireAdmin();

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("settingsForm");
  const primaryColorInput = document.getElementById("primaryColorInput");
  const secondaryColorInput = document.getElementById("secondaryColorInput");
  const primaryHexVal = document.getElementById("primaryHexVal");
  const secondaryHexVal = document.getElementById("secondaryHexVal");
  const statusDiv = document.getElementById("settings-status");
  const logoInput = document.getElementById("clinicLogoInput");
  const logoPreview = document.getElementById("settings-logo-preview");
  const logoutBtn = document.getElementById("logout-btn");

  let logoUrl = "";

  // Dynamic Hex text updating
  primaryColorInput.addEventListener("input", (e) => {
    primaryHexVal.textContent = e.target.value;
  });

  secondaryColorInput.addEventListener("input", (e) => {
    secondaryHexVal.textContent = e.target.value;
  });

  // Handle Logout
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await window.adminSignOut();
        window.location.href = `${window.BASE_PATH || ''}/admin/login.html`;
      } catch (err) {
        console.error("Sign out error:", err);
      }
    });
  }

  // Pre-load current settings
  loadCurrentSettings();

  // Logo Preview
  logoInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        logoPreview.innerHTML = `<img src="${event.target.result}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
        logoUrl = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  });

  // Handle Form Submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideStatus();

    const clinicSettings = {
      name: document.getElementById("clinicNameInput").value.trim(),
      description: document.getElementById("clinicDescriptionInput").value.trim(),
      phone: document.getElementById("clinicPhoneInput").value.trim(),
      email: document.getElementById("clinicEmailInput").value.trim(),
      address: document.getElementById("clinicAddressInput").value.trim(),
      primaryColor: primaryColorInput.value,
      secondaryColor: secondaryColorInput.value,
      workingDaysStart: document.getElementById("workingDaysStart").value,
      workingDaysEnd: document.getElementById("workingDaysEnd").value,
      workingHoursStart: document.getElementById("workingHoursStart").value,
      workingHoursEnd: document.getElementById("workingHoursEnd").value,
      timezone: document.getElementById("timezoneSelect").value,
      updatedAt: window.isFirebaseConfigured ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString()
    };

    if (logoUrl) {
      clinicSettings.logo = logoUrl;
    }

    try {
      if (window.isFirebaseConfigured) {
        // Upload logo if file selected
        const file = logoInput.files[0];
        if (file) {
          showStatus("جاري رفع الشعار الجديد...", "info");
          const storageRef = window.storage.ref().child(`clinics/settings/logo_${Date.now()}`);
          const uploadTask = await storageRef.put(file);
          clinicSettings.logo = await uploadTask.ref.getDownloadURL();
        }

        // Save to Firestore
        showStatus("جاري حفظ الإعدادات في فايرستور...", "info");
        await db.collection("clinics").doc("settings").set(clinicSettings, { merge: true });
      } else {
        // Save to Mock Local Storage
        showStatus("جاري حفظ الإعدادات محلياً...", "info");
        const existing = JSON.parse(localStorage.getItem("mock_firestore_clinics_settings") || "{}");
        const merged = { ...existing, ...clinicSettings };
        localStorage.setItem("mock_firestore_clinics_settings", JSON.stringify(merged));
      }

      showStatus("تم حفظ الإعدادات بنجاح! جاري تحديث الهوية الطبية لموقعك...", "success");
      
      // Update global colors dynamically immediately
      if (typeof window.applyTheme === "function") {
        window.applyTheme(clinicSettings.primaryColor, clinicSettings.secondaryColor);
      }
      
    } catch (err) {
      console.error("Save settings error:", err);
      showStatus(`حدث خطأ أثناء حفظ الإعدادات: ${err.message}`, "danger");
    }
  });

  async function loadCurrentSettings() {
    try {
      let data = {};
      if (window.isFirebaseConfigured) {
        const doc = await db.collection("clinics").doc("settings").get();
        if (doc.exists) {
          data = doc.data();
        }
      } else {
        data = JSON.parse(localStorage.getItem("mock_firestore_clinics_settings") || "{}");
      }

      if (data.name) {
        document.getElementById("clinicNameInput").value = data.name;
        document.getElementById("clinicDescriptionInput").value = data.description || "";
        document.getElementById("clinicPhoneInput").value = data.phone || "";
        document.getElementById("clinicEmailInput").value = data.email || "";
        document.getElementById("clinicAddressInput").value = data.address || "";
        
        if (data.primaryColor) {
          primaryColorInput.value = data.primaryColor;
          primaryHexVal.textContent = data.primaryColor;
        }
        if (data.secondaryColor) {
          secondaryColorInput.value = data.secondaryColor;
          secondaryHexVal.textContent = data.secondaryColor;
        }

        document.getElementById("workingDaysStart").value = data.workingDaysStart || "Saturday";
        document.getElementById("workingDaysEnd").value = data.workingDaysEnd || "Thursday";
        document.getElementById("workingHoursStart").value = data.workingHoursStart || "09:00";
        document.getElementById("workingHoursEnd").value = data.workingHoursEnd || "17:00";
        document.getElementById("timezoneSelect").value = data.timezone || "Africa/Cairo";

        if (data.logo) {
          logoPreview.innerHTML = `<img src="${data.logo}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
        }
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    }
  }

  function showStatus(msg, type) {
    statusDiv.textContent = msg;
    statusDiv.style.display = "block";
    statusDiv.className = ""; // clear
    
    if (type === "success") {
      statusDiv.style.backgroundColor = "rgba(16, 185, 129, 0.15)";
      statusDiv.style.border = "1px solid rgba(16, 185, 129, 0.3)";
      statusDiv.style.color = "var(--success)";
    } else if (type === "danger") {
      statusDiv.style.backgroundColor = "rgba(239, 68, 68, 0.15)";
      statusDiv.style.border = "1px solid rgba(239, 68, 68, 0.3)";
      statusDiv.style.color = "var(--danger)";
    } else {
      statusDiv.style.backgroundColor = "rgba(59, 130, 246, 0.15)";
      statusDiv.style.border = "1px solid rgba(59, 130, 246, 0.3)";
      statusDiv.style.color = "var(--info)";
    }
  }

  function hideStatus() {
    statusDiv.style.display = "none";
  }
  
  // Attach showStatus to window so the new functions can use it
  window.showSettingsStatus = showStatus;
});

// =========================================================
// Security Settings: Update Email & Password
// =========================================================

async function _reauthenticateUser(currentPassword) {
  if (!window.auth || !window.auth.currentUser) throw new Error("not_logged_in");
  const user = window.auth.currentUser;
  const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
  return user.reauthenticateWithCredential(credential);
}

function handleAuthError(err) {
  console.error("Auth Error:", err);
  switch(err.code) {
    case 'auth/wrong-password': return "كلمة المرور الحالية غير صحيحة.";
    case 'auth/weak-password': return "كلمة المرور ضعيفة جداً. يجب أن تتكون من 6 أحرف على الأقل.";
    case 'auth/email-already-in-use': return "البريد الإلكتروني الجديد مستخدم بالفعل في حساب آخر.";
    case 'auth/invalid-email': return "صيغة البريد الإلكتروني غير صحيحة.";
    case 'auth/requires-recent-login': return "يرجى تسجيل الخروج وتسجيل الدخول مرة أخرى لإتمام هذه العملية.";
    default: return err.message === "not_logged_in" ? "أنت غير مسجل الدخول." : ("حدث خطأ: " + err.message);
  }
}

window.updateAdminEmail = async function() {
  const currentPass = document.getElementById('currentPasswordEmail').value;
  const newEmail = document.getElementById('newEmailInput').value.trim();
  
  if (!currentPass) { window.showSettingsStatus("يرجى إدخال كلمة المرور الحالية أولاً.", "danger"); return; }
  if (!newEmail) { window.showSettingsStatus("يرجى إدخال البريد الإلكتروني الجديد.", "danger"); return; }
  
  try {
    if (window.isFirebaseConfigured) {
      window.showSettingsStatus("جاري تغيير البريد الإلكتروني...", "info");
      await _reauthenticateUser(currentPass);
      await window.auth.currentUser.updateEmail(newEmail);
      window.showSettingsStatus("تم تغيير البريد الإلكتروني بنجاح!", "success");
      document.getElementById('currentPasswordEmail').value = '';
      document.getElementById('newEmailInput').value = '';
    } else {
      window.showSettingsStatus("وضع المطور (Mock Mode): تم تجاهل التغيير.", "info");
    }
  } catch (err) {
    window.showSettingsStatus(handleAuthError(err), "danger");
  }
};

window.updateAdminPassword = async function() {
  const currentPass = document.getElementById('currentPasswordPass').value;
  const newPass = document.getElementById('newPasswordInput').value;
  
  if (!currentPass) { window.showSettingsStatus("يرجى إدخال كلمة المرور الحالية أولاً.", "danger"); return; }
  if (!newPass || newPass.length < 6) { window.showSettingsStatus("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.", "danger"); return; }
  
  try {
    if (window.isFirebaseConfigured) {
      window.showSettingsStatus("جاري تغيير كلمة المرور...", "info");
      await _reauthenticateUser(currentPass);
      await window.auth.currentUser.updatePassword(newPass);
      window.showSettingsStatus("تم تغيير كلمة المرور بنجاح!", "success");
      document.getElementById('currentPasswordPass').value = '';
      document.getElementById('newPasswordInput').value = '';
    } else {
      window.showSettingsStatus("وضع المطور (Mock Mode): تم تجاهل التغيير.", "info");
    }
  } catch (err) {
    window.showSettingsStatus(handleAuthError(err), "danger");
  }
};
