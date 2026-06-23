const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.post('/ai/suggest-menu', async (req, res) => {
  if (!process.env.HUGGINGFACE_API_KEY) return res.status(503).json({ error: 'AI tidak dikonfigurasi (set HUGGINGFACE_API_KEY di .env)' });
  const { kategori, catatan } = req.body;
  const model = process.env.HUGGINGFACE_MODEL || 'google/flan-t5-large';
  const prompt = `Kamu adalah ahli gizi MBG. Jawab HANYA JSON valid tanpa markdown, tanpa teks lain: {nama_menu, deskripsi, bahan:[{nama,jumlah,satuan}], kandungan_gizi:{kalori,protein,karbohidrat,lemak,serat}, gramasi_total}. Buatkan menu MBG untuk kategori ${kategori}. ${catatan || ''}`;
  try {
    const r = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { max_new_tokens: 512, return_full_text: false },
        options: { wait_for_model: true },
      }),
    });
    
    const data = await r.json();
    const text = data?.[0]?.generated_text || data?.generated_text || '{}';
    const cleaned = text.replace(/```json?/g, '').replace(/```/g, '').trim();
    res.json({ suggestion: JSON.parse(cleaned) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Gagal panggil AI' }); }
});

module.exports = router;
