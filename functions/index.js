const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const crypto = require("crypto");

admin.initializeApp();

// Load from environment config
const PAYMOB_API_KEY = process.env.PAYMOB_API_KEY || functions.config().paymob?.api_key;
const PAYMOB_INTEGRATION = process.env.PAYMOB_INTEGRATION || functions.config().paymob?.integration_id;
const PAYMOB_HMAC = process.env.PAYMOB_HMAC || functions.config().paymob?.hmac;
const PAYMOB_IFRAME_ID = process.env.PAYMOB_IFRAME_ID || functions.config().paymob?.iframe_id;

exports.initiatePayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
  }

  const { amountCents, patient, appointmentId } = data;

  if (!PAYMOB_API_KEY) {
    // Demo mode if no key
    return { iframeUrl: null, orderId: null };
  }

  try {
    // 1. Authenticate
    const authRes = await fetch("https://accept.paymob.com/api/auth/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: PAYMOB_API_KEY })
    }).then(r => r.json());
    const token = authRes.token;

    // 2. Create Order
    const orderRes = await fetch("https://accept.paymob.com/api/ecommerce/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: token,
        delivery_needed: false,
        amount_cents: amountCents,
        currency: "EGP",
        items: []
      })
    }).then(r => r.json());

    // 3. Get Payment Key
    const keyRes = await fetch("https://accept.paymob.com/api/acceptance/payment_keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: token,
        amount_cents: amountCents,
        expiration: 3600,
        order_id: orderRes.id,
        currency: "EGP",
        integration_id: Number(PAYMOB_INTEGRATION),
        billing_data: {
          first_name: patient.firstName || "NA",
          last_name: patient.lastName || "NA",
          email: patient.email || "NA",
          phone_number: patient.phone || "NA",
          apartment: "NA", floor: "NA", street: "NA", building: "NA",
          shipping_method: "NA", postal_code: "NA", city: "NA",
          country: "EG", state: "NA"
        }
      })
    }).then(r => r.json());

    const paymentKey = keyRes.token;
    const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${PAYMOB_IFRAME_ID}?payment_token=${paymentKey}`;

    return { iframeUrl, orderId: orderRes.id };
  } catch (err) {
    console.error("Paymob Error:", err);
    throw new functions.https.HttpsError("internal", "Payment initialization failed");
  }
});

exports.paymobCallback = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // Paymob sends data in req.body.obj and hmac in req.query.hmac
  const hmacReceived = req.query.hmac;
  const data = req.body.obj;

  if (!hmacReceived || !data) {
    return res.status(400).send('Bad Request');
  }

  // Calculate HMAC
  // The string to be hashed is a concatenation of specific keys
  const keys = [
    'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction',
    'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded',
    'is_standalone_payment', 'is_voided', 'order', 'owner', 'pending', 'source_data.pan',
    'source_data.sub_type', 'source_data.type', 'success'
  ];

  let stringToHash = '';
  keys.forEach(key => {
    let val = data;
    key.split('.').forEach(k => {
      if (val) val = val[k];
    });
    if (val === true) val = 'true';
    if (val === false) val = 'false';
    stringToHash += (val || '');
  });

  const hmacCalculated = crypto.createHmac('sha512', PAYMOB_HMAC).update(stringToHash).digest('hex');

  if (hmacCalculated !== hmacReceived) {
    console.warn("Invalid HMAC signature");
    return res.status(403).send('Invalid signature');
  }

  // Idempotent processing
  const transactionId = data.id.toString();
  const txRef = admin.firestore().collection('transactions').doc(transactionId);
  
  await admin.firestore().runTransaction(async (t) => {
    const doc = await t.get(txRef);
    if (doc.exists) {
      return; // Already processed
    }
    
    t.set(txRef, {
      orderId: data.order.id,
      success: data.success,
      amount: data.amount_cents,
      processedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Logic to update appointment status could go here
    // But since order ID doesn't necessarily map to appointment directly without custom logic,
    // we assume the frontend still marks as paid after the transaction completes, but relies on verification.
  });

  res.status(200).send('OK');
});

// =========================================================
// Automated WhatsApp Message Trigger
// =========================================================
exports.onAppointmentCreated = functions.firestore
  .document("appointments/{appointmentId}")
  .onCreate(async (snap, context) => {
    const appt = snap.data();
    if (!appt || !appt.patientPhone) return null;

    const patientName = appt.patientName || "عزيزنا المريض";
    const bookingRef  = appt.bookingRef   || snap.id;
    const date        = appt.appointmentDate || "";
    const time        = appt.appointmentTime || "";
    const queueNum    = appt.queueNumber ? `#${appt.queueNumber}` : "#1";

    const radarUrl = `https://clinic-mangment-system.web.app/public/queue-radar.html?ref=${bookingRef}`;

    const message = 
      `أهلاً بك أستاذ/ة ${patientName} 🌸\n` +
      `تم تأكيد حجز موعدك بنجاح في العيادة.\n\n` +
      `📌 رقم الحجز: ${bookingRef}\n` +
      `📅 التاريخ: ${date}\n` +
      `⏰ الوقت: ${time}\n` +
      `🔢 رقم دورك في القائمة: ${queueNum}\n\n` +
      `📡 يمكنك تتبع دورك والوقت المتوقع لدخولك حياً ومباشرة عبر رادار الانتظار:\n${radarUrl}\n\n` +
      `نتمنى لك دوام الصحة والعافية! 🏥`;

    try {
      const WHATSAPP_GATEWAY_URL = process.env.WHATSAPP_GATEWAY_URL || "http://localhost:3001/send-whatsapp";
      await fetch(WHATSAPP_GATEWAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: appt.patientPhone,
          message: message
        })
      });
      console.log(`Automated WhatsApp triggered for appointment ${bookingRef}`);
    } catch (err) {
      console.error("Failed to send automated WhatsApp message:", err);
    }
    return null;
  });

