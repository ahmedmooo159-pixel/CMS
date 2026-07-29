// Firebase Initialization & Shared Helpers
//
// Unified Appointment Status Lifecycle:
// pending -> confirmed -> arrived -> in_session -> completed
// (Any state -> cancelled)
//
// Firebase Configuration
const firebaseConfig = window.ENV && window.ENV.FIREBASE_CONFIG ? window.ENV.FIREBASE_CONFIG : {};

let db, auth, storage;
let isFirebaseConfigured = false;

const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && window.location.protocol !== 'file:';

// Initialize Firebase
try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey.startsWith("AIza")) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    storage = firebase.storage();
    window.storage = storage; // Fix C4
    isFirebaseConfigured = true;
    console.log("Firebase initialized successfully with project: clinc-mangment-system");
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

  storage = {
    ref: () => ({
      put: () => Promise.resolve({ ref: { getDownloadURL: () => Promise.resolve("https://placehold.co/150") } })
    })
  };
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
