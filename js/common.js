// Firebase Initialization & Shared Helpers
//
// Unified Appointment Status Lifecycle:
// pending -> confirmed -> arrived -> in_session -> completed
// (Any state -> cancelled)
//
// Firebase Configuration
const firebaseConfig = window.ENV && window.ENV.FIREBASE_CONFIG ? window.ENV.FIREBASE_CONFIG : {};

 let db, auth;
let isFirebaseConfigured = false;

const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && window.location.protocol !== 'file:';

// Initialize Firebase
try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey.startsWith("AIza")) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    isFirebaseConfigured = true;
    console.log("Firebase initialized successfully with project: clinc-mangment-system");

    // Enable Firestore offline persistence (IndexedDB-based)
    // This means repeated reads on the same data won't hit the network.
    db.enablePersistence({ synchronizeTabs: true })
      .then(() => console.log('[Cache] Firestore offline persistence enabled.'))
      .catch(err => {
        if (err.code === 'failed-precondition') {
          console.warn('[Cache] Persistence: multiple tabs open, falling back to memory.');
        } else if (err.code === 'unimplemented') {
          console.warn('[Cache] Persistence: browser does not support IndexedDB.');
        }
      });
  } else {
    if (isProduction) {
      alert("Critical Error: Firebase is not configured in a production environment.");
      throw new Error("Firebase config missing in production");
    } else {
      console.warn("Firebase credentials not set. Falling back to mockup / local mode.");
      setupMockFirebase();
    }
  }
} catch (error) {
  console.error("Failed to initialize Firebase:", error);
  if (isProduction) {
    alert("Critical Error: Failed to initialize Firebase.");
  } else {
    setupMockFirebase();
  }
}

// Simple Mock Firebase implementation for local dev testing
function setupMockFirebase() {
  db = {
    collection: (name) => ({
      doc: (id) => ({
        get: () => Promise.resolve({ exists: true, data: () => ({}) }),
        set: (data) => {
          localStorage.setItem(`mock_firestore_${name}_${id}`, JSON.stringify(data));
          return Promise.resolve();
        },
        update: (data) => Promise.resolve()
      }),
      get: () => Promise.resolve({
        forEach: (callback) => {
          const items = JSON.parse(localStorage.getItem(`mock_firestore_list_${name}`) || "[]");
          items.forEach(item => callback({ id: item.id, data: () => item }));
        }
      }),
      add: (data) => {
        const id = Math.random().toString(36).substring(2);
        localStorage.setItem(`mock_firestore_${name}_${id}`, JSON.stringify(data));
        return Promise.resolve({ id });
      }
    })
  };
  
  auth = {
    signInWithEmailAndPassword: (email, password) => {
      // Allow testing login
      if (email && password) {
        const mockUser = { uid: "mock-uid-123", email, role: "admin" };
        localStorage.setItem("mock_session_user", JSON.stringify(mockUser));
        return Promise.resolve({ user: mockUser });
      }
      return Promise.reject(new Error("Email and password are required"));
    },
    signOut: () => {
      localStorage.removeItem("mock_session_user");
      return Promise.resolve();
    },
    onAuthStateChanged: (callback) => {
      const stored = localStorage.getItem("mock_session_user");
      callback(stored ? JSON.parse(stored) : null);
    }
  };

  // storage = {
  //   ref: () => ({
  //     put: () => Promise.resolve({ ref: { getDownloadURL: () => Promise.resolve("https://placehold.co/150") } })
  //   })
  // };
}

// Base Path helper for GitHub Pages compatibility
const BASE_PATH = window.location.hostname.includes("github.io") ? "/CMS" : "";
window.BASE_PATH = BASE_PATH;

// ---- requireAdmin: guard for admin pages ----
// Delegates to checkAuth() defined in auth.js (must be loaded before)
function requireAdmin(onUser) {
  if (typeof window.checkAuth === 'function') {
    window.checkAuth(onUser);
  } else {
    // Fallback if auth.js hasn't loaded yet: use onAuthStateChanged directly
    auth.onAuthStateChanged(user => {
      if (!user) {
        window.location.href = `${BASE_PATH}/admin/login.html`;
      } else if (typeof onUser === 'function') {
        onUser(user);
      }
    });
  }
}

// Global XSS Sanitizer Helper
function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
window.escHtml = escHtml;

// Global URL Validator Helper
function isValidImageUrl(url) {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/') || url.startsWith('data:image/');
}
window.isValidImageUrl = isValidImageUrl;

// Export global tools to window object
window.db                  = db;
window.auth                = auth;
window.isFirebaseConfigured = isFirebaseConfigured;
window.requireAdmin        = requireAdmin;

// Local Date Formatter Helper
function getLocalISODate(date) {
  if (!date) date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
window.getLocalISODate = getLocalISODate;

// =========================================================
// AppCache – sessionStorage cache with TTL
// =========================================================
// Usage:
//   AppCache.get('doctors')              → array or null
//   AppCache.set('doctors', data)        → saves with default TTL
//   AppCache.set('settings', data, 60)   → saves with 60-min TTL
//   AppCache.invalidate('doctors')       → clear one key
//   AppCache.invalidateGroup('admin')    → clear all admin-tagged keys
//
// TTL defaults (minutes):
//   doctors, patients, specialties → sessionStorage (per tab session, no TTL needed)
//   settings/branding              → localStorage, 60 min TTL
// =========================================================
const AppCache = (() => {
  // Keys that go to localStorage with explicit TTL (persist across tabs)
  const PERSISTENT_KEYS = new Set(['settings', 'branding']);
  // Default in-session TTL for sessionStorage (very large = session lifetime)
  const SESSION_TTL_MS  = 60 * 60 * 1000; // 60 min, effectively entire session

  function _storage(key) {
    return PERSISTENT_KEYS.has(key) ? localStorage : sessionStorage;
  }

  function _ttlMs(key, ttlMinutes) {
    if (ttlMinutes !== undefined) return ttlMinutes * 60 * 1000;
    return PERSISTENT_KEYS.has(key) ? 60 * 60 * 1000 : SESSION_TTL_MS;
  }

  return {
    /**
     * Get cached value for key. Returns null if missing or expired.
     */
    get(key) {
      try {
        const raw = _storage(key).getItem(`appcache_${key}`);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (Date.now() > entry.exp) {
          _storage(key).removeItem(`appcache_${key}`);
          return null;
        }
        return entry.data;
      } catch (_) { return null; }
    },

    /**
     * Store value for key.
     * @param {string} key
     * @param {*} data
     * @param {number} [ttlMinutes] override TTL in minutes
     */
    set(key, data, ttlMinutes) {
      try {
        const exp = Date.now() + _ttlMs(key, ttlMinutes);
        _storage(key).setItem(`appcache_${key}`, JSON.stringify({ exp, data }));
      } catch (e) {
        // Quota exceeded or private mode – silently skip caching
        console.warn('[AppCache] Could not write cache:', e.message);
      }
    },

    /**
     * Remove a specific key from cache (call after mutations).
     */
    invalidate(key) {
      localStorage.removeItem(`appcache_${key}`);
      sessionStorage.removeItem(`appcache_${key}`);
    },

    /**
     * Remove all cache keys matching a prefix.
     * e.g. AppCache.invalidateGroup('doctors') clears 'doctors'
     */
    invalidateGroup(...keys) {
      keys.forEach(k => this.invalidate(k));
    },
  };
})();
window.AppCache = AppCache;

// Cloudinary image upload helper
async function uploadImageToCloudinary(file) {
  const cloudName = window.ENV?.CLOUDINARY_CLOUD_NAME || 'nfzcflqv';
  const uploadPreset = window.ENV?.CLOUDINARY_UPLOAD_PRESET || 'clinc_mangment_system';
  
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);
  
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      throw new Error('فشل رفع الصورة. يرجى المحاولة مرة أخرى.');
    }
    const data = await res.json();
    return data.secure_url;
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    throw new Error('حدث خطأ أثناء رفع الصورة. تحقق من اتصالك بالإنترنت.');
  }
}
window.uploadImageToCloudinary = uploadImageToCloudinary;
