/**
 * NAMA KODE / FILE: aiRouter.js (Route Layanan AI Nutrisi & Rekomendasi Menu)
 * DESKRIPSI: Router Express.js untuk mengintegrasikan layanan AI dari Hugging Face API
 *            guna memberikan rekomendasi menu, analisis informasi nutrisi bahan,
 *            penghitungan nutrisi total, serta fitur Q&A singkat terkait dapur.
 */

// Mengimpor framework Express untuk membuat router API
const express = require('express');

// Mengimpor middleware autentikasi pengguna
const { requireAuth } = require('../middleware/auth');

// Membuat instance Express Router
const router = express.Router();

// Menerapkan middleware autentikasi ke seluruh endpoint pada router ini
router.use(requireAuth);

// Mengambil Token API Hugging Face dari Environment Variables (.env)
const HF_TOKEN = process.env.HF_API_TOKEN;

// Menentukan model LLM default dari Hugging Face atau menggunakan alternatif Llama-3.1-8B
const HF_MODEL = process.env.HF_MODEL || 'meta-llama/Llama-3.1-8B-Instruct';

// URL endpoint API kustom untuk layanan Chat Completions pada Hugging Face Router
const HF_API = 'https://router.huggingface.co/v1/chat/completions';

// Helper Function: Mengirimkan prompt ke API Hugging Face dan mengembalikan respons teksnya
async function askHF(prompt, opts) {
  // Inisialisasi array untuk menyimpan struktur riwayat pesan (messages)
  const messages = [];

  // Jika terdapat instruksi sistem (system prompt), tambahkan ke daftar pesan sebagai role 'system'
  if (opts?.system) messages.push({ role: 'system', content: opts.system });

  // Menambahkan prompt dari pengguna ke daftar pesan sebagai role 'user'
  messages.push({ role: 'user', content: prompt });

  // Melakukan HTTP Request POST ke Hugging Face API menggunakan Fetch API
  const resp = await fetch(HF_API, {
    method: 'POST', // Metode HTTP
    headers: {
      'Authorization': 'Bearer ' + HF_TOKEN, // Kirim token otentikasi via Bearer Header
      'Content-Type': 'application/json'      // Menyatakan format payload adalah JSON
    },
    body: JSON.stringify({
      model: HF_MODEL,                           // Nama model AI yang dipanggil
      messages,                                  // Array kumpulan pesan/prompt
      max_tokens: opts?.maxTokens ?? 500,        // Batas maksimum token keluaran (default: 500)
      temperature: opts?.temperature ?? 0.7      // Nilai kreativitas respon AI (default: 0.7)
    })
  });

  // Memeriksa jika HTTP response mengembalikan status error (bukan 2xx)
  if (!resp.ok) {
    let msg = resp.status + ' ' + resp.statusText; // Pesan error default berdasarkan status code
    try { 
      const e = await resp.json();                 // Mencoba parsing data error dari server
      msg = e.error?.message || JSON.stringify(e) || msg; 
    } catch {}
    throw new Error('AI gagal: ' + msg);            // Melempar error untuk ditangkap di blok catch
  }

  // Parsing hasil balasan dari Hugging Face ke dalam bentuk JSON
  const result = await resp.json();

  // Mengambil konten pesan hasil generasi AI dan menghapus spasi/newline berlebih di awal & akhir
  return (result.choices?.[0]?.message?.content || '').trim();
}

// Endpoint POST /ai/suggest-menu: Menghasilkan rekomendasi menu beserta resep dan nutrisinya
router.post('/ai/suggest-menu', async (req, res) => {
  // Mengambil data kategori dan catatan tambahan dari body request
  const { kategori, catatan } = req.body;

  try {
    // Menyusun prompt perintah untuk dikirimkan ke model AI
    const prompt = 'Buatkan menu untuk kategori ' + kategori + '. ' + (catatan || '');

    // Memanggil fungsi askHF dengan system prompt ketat agar AI hanya membalas dengan JSON valid
    const text = await askHF(prompt, {
      system: 'Anda ahli gizi. Jawab JSON valid: { "nama_menu":"", "deskripsi":"", "bahan":[{"nama":"","jumlah":0,"satuan":""}], "kandungan_gizi":{"kalori":0,"protein":0,"karbohidrat":0,"lemak":0,"serat":0}, "gramasi_total":0 }',
      maxTokens: 800
    });

    // Mengisolasi/mengekstrak string blok JSON ({ ... }) menggunakan RegEx
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    // Jika sintaks JSON tidak ditemukan dari balasan AI, kirimkan respons error HTTP 500
    if (!jsonMatch) {
      return res.status(500).json({ error: 'AI tidak menghasilkan JSON valid', raw: text.slice(0, 500) });
    }

    // Mengirimkan hasil rekomendasi menu yang telah di-parse sebagai respons JSON
    res.json({ suggestion: JSON.parse(jsonMatch[0]) });
  } catch (err) {
    // Tangani error server dan kirim respons HTTP 500
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint POST /ai/suggest-nutrisi: Mengambil estimasi nutrisi per 100g untuk nama bahan tertentu
router.post('/ai/suggest-nutrisi', async (req, res) => {
  // Mengambil nama bahan dari body request
  const { nama } = req.body;

  // Validasi: memastikan parameter nama bahan tidak kosong
  if (!nama) return res.status(400).json({ error: 'Nama bahan wajib diisi' });

  try {
    // Meminta AI menganalisis data nutrisi per 100 gram untuk bahan tersebut
    const text = await askHF(nama, {
      system: 'Anda ahli gizi. Berikan informasi nutrisi per 100 gram bahan makanan ini. Jawab JSON valid tanpa teks lain: { "kalori":0, "protein":0, "karbohidrat":0, "lemak":0, "serat":0 }',
      maxTokens: 200,      // Membatasi keluaran token untuk hemat kuota dan performa lebih cepat
      temperature: 0.3     // Temperature rendah untuk menjaga jawaban konsisten/faktual
    });

    // Mengisolasi/mengekstrak pola JSON dari teks balasan AI
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    // Jika struktur JSON tidak ditemukan, kembalikan respons error HTTP 500
    if (!jsonMatch) {
      return res.status(500).json({ error: 'AI tidak menghasilkan JSON valid', raw: text.slice(0, 200) });
    }

    // Parsing data JSON dari balasan AI
    const data = JSON.parse(jsonMatch[0]);

    // Sanitasi data: memastikan seluruh nilai nutrisi bertipe data Number (default 0 jika invalid)
    res.json({
      kalori: Number(data.kalori) || 0,
      protein: Number(data.protein) || 0,
      karbohidrat: Number(data.karbohidrat) || 0,
      lemak: Number(data.lemak) || 0,
      serat: Number(data.serat) || 0
    });
  } catch (err) {
    // Tangani error server dan kirim respons HTTP 500
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint POST /ai/hitung-nutrisi: Menghitung akumulasi total gizi berdasarkan daftar bahan resep
router.post('/ai/hitung-nutrisi', async (req, res) => {
  // Mengambil data nama_menu dan array daftar bahan dari body request
  const { nama_menu, bahan } = req.body;

  // Validasi: memastikan daftar bahan dikirimkan dan bukan array kosong
  if (!bahan || !bahan.length) return res.status(400).json({ error: 'Data bahan wajib diisi' });

  // Mengonversi array objek bahan menjadi format string daftar bullet-point
  const daftarBahan = bahan.map(b => '- ' + b.nama + (b.jumlah ? ' ' + b.jumlah + 'g' : '')).join('\n');

  // Menyusun gabungan prompt berupa Nama Menu dan Rincian Bahan
  const prompt = 'Menu: ' + (nama_menu || 'Tanpa Nama') + '\nBahan:\n' + daftarBahan;

  try {
    // Mengirimkan instruksi perhitungan ke AI
    const text = await askHF(prompt, {
      system: 'Anda ahli gizi. Hitung total nutrisi berdasarkan nama menu dan daftar bahan dengan jumlahnya. Jawab JSON valid tanpa teks lain: { "gramasi_total":0, "kalori":0, "protein":0, "karbohidrat":0, "lemak":0 }',
      maxTokens: 300,      // Batasan jumlah token keluaran
      temperature: 0.3     // Nilai temperatur rendah agar kalkulasi deterministik
    });

    // Mengambil substring blok JSON dari teks respons
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    // Mengembalikan error jika parsing JSON gagal dilakukan
    if (!jsonMatch) {
      return res.status(500).json({ error: 'AI tidak menghasilkan JSON valid', raw: text.slice(0, 300) });
    }

    // Parsing teks hasil ekstraksi ke objek JavaScript
    const data = JSON.parse(jsonMatch[0]);

    // Memastikan respons berupa angka (Number) yang valid
    res.json({
      gramasi_total: Number(data.gramasi_total) || 0,
      kalori: Number(data.kalori) || 0,
      protein: Number(data.protein) || 0,
      karbohidrat: Number(data.karbohidrat) || 0,
      lemak: Number(data.lemak) || 0,
    });
  } catch (err) {
    // Tangani error server dan kirim respons HTTP 500
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint POST /ai/tanya: Fitur konsultasi/tanya-jawab singkat seputar operasional divisi dapur
router.post('/ai/tanya', async (req, res) => {
  // Mengambil prompt/pertanyaan dari body request
  const { prompt } = req.body;

  // Validasi: memastikan field prompt telah diisi
  if (!prompt) return res.status(400).json({ error: 'Prompt wajib diisi' });

  try {
    // Mengirim pertanyaan ke AI dengan batas ringkas maksimal 10 kata
    const text = await askHF(prompt, { system: 'Jawab singkat max 10 kata tentang divisi dapur.' });

    // Mengembalikan teks jawaban AI dalam bentuk JSON
    res.json({ text });
  } catch (err) {
    // Tangani error server dan kirim respons HTTP 500
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Mengekspor router agar dapat diimpor dan digunakan pada file konfigurasi server utama
module.exports = router;