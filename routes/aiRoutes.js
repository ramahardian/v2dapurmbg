const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.post('/ai/suggest-menu', async (req, res) => {
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'AI tidak dikonfigurasi (set OPENAI_API_KEY di .env)' });
  const { kategori, catatan } = req.body;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Anda ahli gizi MBG. Jawab HANYA JSON valid: {nama_menu, deskripsi, bahan:[{nama,jumlah,satuan}], kandungan_gizi:{kalori,protein,karbohidrat,lemak,serat}, gramasi_total}.' },
          { role: 'user', content: `Buatkan menu MBG untuk kategori ${kategori}. ${catatan || ''}` },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    res.json({ suggestion: JSON.parse(text) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Gagal panggil AI' }); }
});

module.exports = router;
