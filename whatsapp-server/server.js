// =========================================================
// server.js – WhatsApp Automated Message Gateway
// =========================================================

const express = require('express');
const cors    = require('cors');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode  = require('qrcode-terminal');

const app = express();
app.use(cors());
app.use(express.json());

let sock = null;
let isConnected = false;

// 1. Connect to WhatsApp Engine
async function connectToWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        console.log('\n==================================================');
        console.log('📌 امسح رمز الـ QR Code التالي من هاتف العيادة:');
        console.log('==================================================\n');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        isConnected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`🔌 انقطع الاتصال بـ WhatsApp. إعادة الاتصال... (${shouldReconnect})`);
        if (shouldReconnect) {
          setTimeout(connectToWhatsApp, 3000);
        }
      } else if (connection === 'open') {
        isConnected = true;
        console.log('✅ تم الاتصال برقم واتساب العيادة بنجاح والخدمة جاهزة لإرسال الرسائل التلقائية!');
      }
    });

  } catch (err) {
    console.error('فشل بدء محرك الواتساب:', err);
  }
}

// Start connection
connectToWhatsApp();

// Endpoint: Health Check
app.get('/status', (req, res) => {
  res.json({
    status: isConnected ? 'connected' : 'connecting_or_disconnected',
    timestamp: new Date().toISOString()
  });
});

// Endpoint: Send WhatsApp Message
app.post('/send-whatsapp', async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone and message are required' });
    }

    if (!sock || !isConnected) {
      console.warn('⚠️ محاولة إرسال رسالة بينما خادم الواتساب غير غير متصل.');
      return res.status(503).json({ error: 'WhatsApp engine not connected yet. Scan QR code first.' });
    }

    // Format phone number to international format (e.g. 2010xxxxxxxx@s.whatsapp.net)
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('01')) {
      cleanPhone = '20' + cleanPhone;
    }
    const jid = `${cleanPhone}@s.whatsapp.net`;

    console.log(`✉️ جاري إرسال رسالة واتساب تلقائية إلى: ${cleanPhone}...`);
    
    await sock.sendMessage(jid, { text: message });

    res.json({ success: true, recipient: cleanPhone });
  } catch (err) {
    console.error('خطأ أثناء إرسال رسالة الواتساب:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 خادم الواتساب التلقائي يعمل بنجاح على المنفذ: http://localhost:${PORT}\n`);
});
