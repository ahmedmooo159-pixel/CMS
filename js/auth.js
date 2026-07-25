// =========================================================
// auth.js  –  Admin Authentication (Persistent Session)
// =========================================================

const AUTH_STORAGE_KEY = 'clinic_admin_user';
const LOGIN_PAGE       = `${window.BASE_PATH || ''}/admin/login.html`;
const DASHBOARD_PAGE   = `${window.BASE_PATH || ''}/admin/index.html`;

// =========================================================
// 1. Persist / Retrieve cached user in localStorage
// =========================================================
function getCachedUser() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function persistUser(user) {
  if (user) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      uid:         user.uid,
      email:       user.email,
      displayName: user.displayName || user.email,
      photoURL:    user.photoURL || null,
      cachedAt:    Date.now()
    }));
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

// =========================================================
// 2. checkAuth() – called by each admin page to guard access
//    Shows page immediately if cached user exists,
//    then re-verifies with Firebase silently.
// =========================================================
window.checkAuth = function (onUser) {
  const cached = getCachedUser();

  // Fast-path: if we have a cached user, don't flash redirect
  if (!cached) {
    // No cached user → go to login immediately
    window.location.href = LOGIN_PAGE;
    return;
  }

  // Cached user found → let the page render, verify in background
  if (typeof onUser === 'function') onUser(cached);

  // Background verification with Firebase
  window.auth.onAuthStateChanged(user => {
    if (user) {
      persistUser(user);                              // refresh cache
      if (typeof onUser === 'function') onUser(user); // update UI if needed
    } else {
      // Firebase says session expired → clear cache and redirect
      persistUser(null);
      window.location.href = LOGIN_PAGE;
    }
  });
};

// =========================================================
// 3. signOut helper – clears session and redirects to login
// =========================================================
window.adminSignOut = async function () {
  try {
    await window.auth.signOut();
  } catch (_) {}
  persistUser(null);
  window.location.href = LOGIN_PAGE;
};

// =========================================================
// 4. Login form logic (only active on login.html)
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
  const loginForm   = document.getElementById('loginForm');
  const errorBanner = document.getElementById('login-error');
  const errorMsg    = document.getElementById('error-message');
  const submitBtn   = document.getElementById('login-submit-btn');

  // If already logged in, skip login page
  if (loginForm && getCachedUser()) {
    window.auth.onAuthStateChanged(user => {
      if (user) window.location.href = DASHBOARD_PAGE;
    });
  }

  if (!loginForm) return;

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    errorBanner.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled     = true;
      submitBtn.textContent  = 'جاري تسجيل الدخول...';
    }

    try {
      const credential = await window.auth.signInWithEmailAndPassword(email, password);
      persistUser(credential.user);
      window.location.href = DASHBOARD_PAGE;

    } catch (err) {
      console.error('Login failed:', err);
      const MESSAGES = {
        'auth/user-not-found':     'البريد الإلكتروني غير مسجل في النظام.',
        'auth/wrong-password':     'كلمة المرور غير صحيحة.',
        'auth/invalid-email':      'صيغة البريد الإلكتروني غير صحيحة.',
        'auth/too-many-requests':  'تم إيقاف الحساب مؤقتاً لمحاولات متعددة. حاول لاحقاً.',
        'auth/network-request-failed': 'خطأ في الاتصال. تحقق من الإنترنت.',
      };
      if (errorMsg) errorMsg.textContent = MESSAGES[err.code] || 'فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.';
      if (errorBanner) errorBanner.style.display = 'block';
    } finally {
      if (submitBtn) {
        submitBtn.disabled    = false;
        submitBtn.textContent = 'تسجيل الدخول';
      }
    }
  });
});
