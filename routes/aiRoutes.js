const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const HF_TOKEN = process.env.HF_API_TOKEN;
const HF_MODEL = process.env.HF_MODEL || 'meta-llama/Llama-3.1-8B-Instruct';
const HF_API = 'https://router.huggingface.co/v1/chat/completions';

async function askHF(prompt, opts) {
  const messages = [];
  if (opts?.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: prompt });
  const resp = await fetch(HF_API, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + HF_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: HF_MODEL,
      messages,
      max_tokens: opts?.maxTokens ?? 500,
      temperature: opts?.temperature ?? 0.7
    })
  });
  if (!resp.ok) {
    let msg = resp.status + ' ' + resp.statusText;
    try { const e = await resp.json(); msg = e.error?.message || JSON.stringify(e) || msg; } catch {}
    throw new Error('AI gagal: ' + msg);
  }
  const result = await resp.json();
  return (result.choices?.[0]?.message?.content || '').trim();
}

router.post('/ai/suggest-menu', async (req, res) => {
  const { kategori, catatan } = req.body;
  try {
    const prompt = 'Buatkan menu untuk kategori ' + kategori + '. ' + (catatan || '');

    const text = await askHF(prompt, {
      system: 'Anda ahli gizi. Jawab JSON valid: { "nama_menu":"", "deskripsi":"", "bahan":[{"nama":"","jumlah":0,"satuan":""}], "kandungan_gizi":{"kalori":0,"protein":0,"karbohidrat":0,"lemak":0,"serat":0}, "gramasi_total":0 }',
      maxTokens: 800
    });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'AI tidak menghasilkan JSON valid', raw: text.slice(0, 500) });
    }
    res.json({ suggestion: JSON.parse(jsonMatch[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/ai/suggest-nutrisi', async (req, res) => {
  const { nama } = req.body;
  if (!nama) return res.status(400).json({ error: 'Nama bahan wajib diisi' });
  try {
    const text = await askHF(nama, {
      system: 'Anda ahli gizi. Berikan informasi nutrisi per 100 gram bahan makanan ini. Jawab JSON valid tanpa teks lain: { "kalori":0, "protein":0, "karbohidrat":0, "lemak":0, "serat":0 }',
      maxTokens: 200,
      temperature: 0.3
    });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'AI tidak menghasilkan JSON valid', raw: text.slice(0, 200) });
    }
    const data = JSON.parse(jsonMatch[0]);
    res.json({
      kalori: Number(data.kalori) || 0,
      protein: Number(data.protein) || 0,
      karbohidrat: Number(data.karbohidrat) || 0,
      lemak: Number(data.lemak) || 0,
      serat: Number(data.serat) || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/ai/hitung-nutrisi', async (req, res) => {
  const { nama_menu, bahan } = req.body;
  if (!bahan || !bahan.length) return res.status(400).json({ error: 'Data bahan wajib diisi' });

  const daftarBahan = bahan.map(b => '- ' + b.nama + (b.jumlah ? ' ' + b.jumlah + 'g' : '')).join('\n');
  const prompt = 'Menu: ' + (nama_menu || 'Tanpa Nama') + '\nBahan:\n' + daftarBahan;

  try {
    const text = await askHF(prompt, {
      system: 'Anda ahli gizi. Hitung total nutrisi berdasarkan nama menu dan daftar bahan dengan jumlahnya. Jawab JSON valid tanpa teks lain: { "gramasi_total":0, "kalori":0, "protein":0, "karbohidrat":0, "lemak":0 }',
      maxTokens: 300,
      temperature: 0.3
    });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'AI tidak menghasilkan JSON valid', raw: text.slice(0, 300) });
    }
    const data = JSON.parse(jsonMatch[0]);
    res.json({
      gramasi_total: Number(data.gramasi_total) || 0,
      kalori: Number(data.kalori) || 0,
      protein: Number(data.protein) || 0,
      karbohidrat: Number(data.karbohidrat) || 0,
      lemak: Number(data.lemak) || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/ai/tanya', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt wajib diisi' });
  try {
    const text = await askHF(prompt, { system: 'Jawab singkat max 10 kata tentang divisi dapur.' });
    res.json({ text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
