// Firebase Initialization & Shared Helpers

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCi-yb5EjTH3_ovqZYGPeRmQETw46BPaTU",
  authDomain: "clinc-mangment-system.firebaseapp.com",
  projectId: "clinc-mangment-system",
  storageBucket: "clinc-mangment-system.firebasestorage.app",
  messagingSenderId: "233799362620",
  appId: "1:233799362620:web:67dd01f86cb55b6b33bb39",
  measurementId: "G-VE4RQ1BR3Q"
};

let db, auth, storage;
let isFirebaseConfigured = false;

// Initialize Firebase
try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey.startsWith("AIza")) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    storage = firebase.storage();
    isFirebaseConfigured = true;
    console.log("Firebase initialized successfully with project: clinc-mangment-system");
  } else {
    console.warn("Firebase credentials not set. Falling back to mockup / local mode.");
    setupMockFirebase();
  }
} catch (error) {
  console.error("Failed to initialize Firebase:", error);
  setupMockFirebase();
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

// Utility to check if user is admin
function requireAdmin() {
  auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = "/admin/login.html";
    }
  });
}

// Export global tools to window object
window.db = db;
window.auth = auth;
window.storage = storage;
window.isFirebaseConfigured = isFirebaseConfigured;
window.requireAdmin = requireAdmin;
