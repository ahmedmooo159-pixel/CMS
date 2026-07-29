// =========================================================
// data.js  –  Shared Data Service Layer
// Provides reusable async helpers for loading Firestore or
// localStorage (mock) collections. Depends on common.js.
// =========================================================

/**
 * Load a single Firestore document (or mock equivalent).
 * @param {string} collection  – e.g. 'doctors'
 * @param {string} id          – document id
 * @returns {Promise<object|null>}
 */
async function loadDocument(collection, id) {
  if (!id) return null;
  if (window.isFirebaseConfigured) {
    const snap = await db.collection(collection).doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  } else {
    const list = JSON.parse(localStorage.getItem(`mock_${collection}`) || '[]');
    return list.find(d => d.id === id) || null;
  }
}

/**
 * Load all documents from a collection.
 * @param {string} collection  – e.g. 'specialties'
 * @returns {Promise<Array>}
 */
async function loadCollection(collection) {
  if (window.isFirebaseConfigured) {
    const snap = await db.collection(collection).get();
    const result = [];
    snap.forEach(doc => result.push({ id: doc.id, ...doc.data() }));
    return result;
  } else {
    return JSON.parse(localStorage.getItem(`mock_${collection}`) || '[]');
  }
}

/**
 * Load appointments with optional filters.
 * Supported filters: { doctorId, patientId, date, status, specialtyId }
 * @param {object} filters
 * @returns {Promise<Array>}
 */
async function loadAppointments(filters = {}) {
  if (window.isFirebaseConfigured) {
    let query = db.collection('appointments');
    if (filters.doctorId)    query = query.where('doctorId',         '==', filters.doctorId);
    if (filters.patientId)   query = query.where('patientId',        '==', filters.patientId);
    if (filters.date)        query = query.where('appointmentDate',  '==', filters.date);
    if (filters.status)      query = query.where('status',           '==', filters.status);
    if (filters.specialtyId) query = query.where('specialtyId',      '==', filters.specialtyId);
    const snap = await query.get();
    const result = [];
    snap.forEach(doc => result.push({ id: doc.id, ...doc.data() }));
    return result;
  } else {
    let list = JSON.parse(localStorage.getItem('mock_appointments') || '[]');
    if (filters.doctorId)    list = list.filter(a => a.doctorId    === filters.doctorId);
    if (filters.patientId)   list = list.filter(a => a.patientId   === filters.patientId);
    if (filters.date)        list = list.filter(a => a.appointmentDate === filters.date);
    if (filters.status)      list = list.filter(a => a.status      === filters.status);
    if (filters.specialtyId) list = list.filter(a => a.specialtyId === filters.specialtyId);
    return list;
  }
}

/**
 * Find a patient by phone number. Returns the first match or null.
 * @param {string} phone
 * @returns {Promise<object|null>}
 */
async function findPatientByPhone(phone) {
  if (!phone) return null;
  if (window.isFirebaseConfigured) {
    const snap = await db.collection('patients').where('phone', '==', phone).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  } else {
    const list = JSON.parse(localStorage.getItem('mock_patients') || '[]');
    return list.find(p => p.phone === phone) || null;
  }
}

/**
 * Count appointments for a doctor on a specific date (excluding cancelled).
 * @param {string} doctorId
 * @param {string} date  – 'YYYY-MM-DD'
 * @returns {Promise<number>}
 */
async function countDoctorAppointmentsOnDate(doctorId, date) {
  const appts = await loadAppointments({ doctorId, date });
  return appts.filter(a => a.status !== 'cancelled').length;
}

// Expose on window for use by all modules
window.dataService = {
  loadDocument,
  loadCollection,
  loadAppointments,
  findPatientByPhone,
  countDoctorAppointmentsOnDate,
};
