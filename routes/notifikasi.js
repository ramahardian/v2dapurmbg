const express = require('express');
const router = express.Router();
const whatsappBot = require('../services/whatsappBot');

router.post('/notif/wa', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, message: 'Message is required' });
  }

  if (!process.env.WA_ADMIN_NUMBER) {
    return res.json({ success: false, message: 'WA_ADMIN_NUMBER belum diatur' });
  }

  // Prioritaskan bot sendiri jika diaktifkan
  if (process.env.WA_BOT_ENABLED === 'true') {
    try {
      await whatsappBot.sendMessage(process.env.WA_ADMIN_NUMBER, message);
      return res.json({ success: true, provider: 'bot' });
    } catch (e) {
      console.error('Gagal kirim via bot:', e.message);
      // Fallback ke Fonnte jika gagal
      if (process.env.WA_FALLBACK_TO_FONTTE === 'true') {
        console.log('Fallback ke Fonnte...');
      } else {
        return res.json({ success: false, message: e.message });
      }
    }
  }

  // Fallback via Fonnte
  const apiKey = process.env.WA_API_KEY;
  if (!apiKey) {
    return res.json({ success: false, message: 'WA_API_KEY tidak diatur (Fonnte)' });
  }

  let target = process.env.WA_ADMIN_NUMBER.replace(/[^0-9]/g, '');
  if (target.startsWith('0')) target = '62' + target.slice(1);
  if (!target.startsWith('62')) target = '62' + target;

  const gatewayUrl = process.env.WA_GATEWAY_URL || 'https://api.fonnte.com/send';

  try {
    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target,
        message,
        countryCode: '62',
      }),
    });

    const result = await response.json();
    res.json({ success: true, provider: 'fonnte', data: result });
  } catch (e) {
    console.error('Gagal kirim WA via Fonnte:', e);
    res.json({ success: false, message: e.message });
  }
});

module.exports = router;
