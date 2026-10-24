/**
 * NAMA KODE / FILE: groqVision.js (Ekstraksi Teks/Data dari Gambar via Groq Vision)
 * DESKRIPSI: Endpoint untuk mengubah foto/scan dokumen menjadi teks atau data
 *            terstruktur (JSON) menggunakan model vision Groq.
 *
 * Endpoint:
 *   GET    /vision/status -> cek konfigurasi API key + daftar mode + model aktif
 *   POST   /vision/extract-> kirim gambar (data URL base64) & terima hasil ekstraksi
 *   PUT    /vision/key    -> (admin) simpan/update GROQ_API_KEY di database
 *   DELETE /vision/key    -> (admin) hapus key dari database (kembali ke .env)
 *
 * Catatan keamanan:
 *   - Semua endpoint wajib login (requireAuth).
 *   - Gambar dibatasi 6 MB (setelah decode base64) dan hanya PNG/JPEG/WEBP.
 *   - Rate limit 30 ekstraksi / 5 menit per user agar kuota Groq tidak habis.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireRole } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

// Wajib login untuk seluruh endpoint vision
router.use(requireAuth);

// Konfigurasi Groq (OpenAI-compatible API)
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = (process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b').trim();
const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB gambar asli
const REQUEST_TIMEOUT_MS = 90 * 1000;     // Groq vision bisa lambat untuk dokumen padat

// Daftar mode ekstraksi. Prompt dibuat ketat agar hasil konsisten & mudah dipakai.
const MODES = {
  teks: {
    label: 'Teks / OCR',
    json: false,
    prompt: [
      'Ekstrak SELURUH teks yang terlihat pada gambar ini.',
      'Pertahankan urutan, baris, dan struktur aslinya (paragraf, daftar, judul).',
      'Jika ada tabel, tulis ulang sebagai tabel Markdown.',
      'Jangan menambah, merangkum, atau mengarang informasi.',
      'Jika ada bagian yang tidak terbaca, tulis [tidak terbaca].',
      'Gunakan bahasa asli dokumen.',
    ].join(' '),
  },
  tabel: {
    label: 'Tabel → JSON',
    json: true,
    prompt: [
      'Baca tabel pada gambar ini dan ubah menjadi data JSON.',
      'Balas HANYA JSON valid tanpa penjelasan dan tanpa markdown fence.',
      'Format: {"judul":"","kolom":["..."],"baris":[{"nama_kolom":"nilai"}]}.',
      'Gunakan nama kolom persis seperti di gambar. Angka harus bertipe number (tanpa titik pemisah ribuan).',
      'Sel kosong isi dengan null. Jangan mengarang baris atau kolom yang tidak ada.',
    ].join(' '),
  },
  nota: {
    label: 'Nota / Invoice',
    json: true,
    prompt: [
      'Baca nota, invoice, struk, atau surat jalan pada gambar ini.',
      'Balas HANYA JSON valid tanpa penjelasan dan tanpa markdown fence.',
      'Format: {"jenis_dokumen":"","nomor":"","tanggal":"YYYY-MM-DD","supplier":"","pembeli":"","items":[{"nama":"","jumlah":0,"satuan":"","harga_satuan":0,"subtotal":0}],"total":0,"catatan":""}.',
      'Gunakan null untuk data yang tidak ada. Nominal berupa number tanpa pemisah ribuan.',
      'Jangan mengarang item; hanya tulis yang benar-benar terlihat.',
    ].join(' '),
  },
  menu: {
    label: 'Menu & Bahan',
    json: true,
    prompt: [
      'Baca dokumen menu, resep, atau daftar bahan pada gambar ini.',
      'Balas HANYA JSON valid tanpa penjelasan dan tanpa markdown fence.',
      'Format: {"nama_menu":"","kategori":"","porsi":0,"bahan":[{"nama":"","jumlah":0,"satuan":""}],"catatan":""}.',
      'Tulis nama bahan apa adanya. Jika jumlah/satuan tidak terlihat, isi null.',
      'Jangan menambah bahan atau angka yang tidak ada di gambar.',
    ].join(' '),
  },
};

// Rate limiter khusus ekstraksi (berbasis user id, fallback ke IP)
const visionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => 'vision:' + (req.user?.id || req.socket?.remoteAddress || 'unknown'),
  message: { error: 'Terlalu banyak permintaan ekstraksi. Coba lagi beberapa menit lagi.' },
});

// ── API key: DB (app_settings) dulu, fallback ke .env ──────────────────
// Key disimpan di tabel app_settings (setting_key='groq_api_key') sehingga
// bisa diganti lewat admin tanpa restart server. Hasil baca di-cache singkat
// agar request ekstraksi tidak menambah query DB tiap gambar.
const KEY_SETTING = 'groq_api_key';
const KEY_CACHE_TTL_MS = 60 * 1000;
let keyCache = { value: null, expires: 0 };

async function dbApiKey() {
  const now = Date.now();
  if (keyCache.expires > now) return keyCache.value;
  try {
    const [rows] = await db.query(
      'SELECT setting_value FROM app_settings WHERE setting_key = ?',
      [KEY_SETTING]
    );
    const val = rows.length ? String(rows[0].setting_value || '').trim() : '';
    keyCache = { value: val, expires: now + KEY_CACHE_TTL_MS };
    return val;
  } catch (e) {
    // Tabel belum ada (migrasi belum jalan) — pakai cache terakhir / kosong
    console.error('[groq-vision] gagal baca app_settings:', e.message);
    return keyCache.value || '';
  }
}

async function apiKey() {
  return (await dbApiKey()) || (process.env.GROQ_API_KEY || '').trim();
}

function invalidateKeyCache() {
  keyCache = { value: null, expires: 0 };
}

const SETTINGS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
  setting_value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB`;

// Tulis pengaturan; kalau tabel app_settings belum ada (server belum jalankan
// migrate.js), buat dulu otomatis lalu coba lagi — sekali saja.
async function upsertSetting(settingKey, settingValue) {
  const sql = 'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ' +
    'ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)';
  try {
    await db.query(sql, [settingKey, settingValue]);
  } catch (e) {
    if (e && (e.errno === 1146 || /doesn't exist/i.test(e.message || ''))) {
      await db.query(SETTINGS_TABLE_DDL);
      await db.query(sql, [settingKey, settingValue]);
      return;
    }
    throw e;
  }
}

// Validasi & normalisasi data URL gambar -> { mime, base64, bytes }
function parseImageDataUrl(image) {
  if (typeof image !== 'string' || !image.trim()) {
    return { error: 'Gambar wajib dikirim.' };
  }
  const m = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=\r\n\s]+)$/i.exec(image.trim());
  if (!m) {
    return { error: 'Format gambar harus data URL base64 (PNG, JPG, atau WEBP).' };
  }
  const mime = m[1].toLowerCase().replace('jpg', 'jpeg');
  const base64 = m[2].replace(/\s+/g, '');
  const bytes = Buffer.byteLength(base64, 'base64');
  if (!bytes) return { error: 'Gambar kosong atau rusak.' };
  if (bytes > MAX_IMAGE_BYTES) {
    return { error: 'Ukuran gambar maksimal 6 MB. Kompres atau perkecil gambar terlebih dahulu.' };
  }
  return { mime, base64, bytes };
}

// Ambil pesan error yang ramah dari respons Groq
function groqErrorMessage(status, body) {
  let detail = '';
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    detail = parsed?.error?.message || parsed?.message || '';
  } catch { /* body bukan JSON */ }
  if (status === 401) return 'GROQ_API_KEY tidak valid atau sudah dicabut. Periksa kembali di console.groq.com.';
  if (status === 403) return 'API key tidak memiliki akses ke model vision ini.';
  if (status === 413) return 'Gambar terlalu besar untuk Groq. Perkecil gambar lalu coba lagi.';
  if (status === 429) return 'Kuota/rate limit Groq tercapai. Tunggu beberapa saat lalu coba lagi.';
  return detail || ('Groq menolak permintaan (HTTP ' + status + ').');
}

// Bersihkan markdown fence pada output JSON
function stripCodeFence(text) {
  return String(text || '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

// GET /vision/status -> info konfigurasi untuk halaman frontend
router.get('/status', async (req, res) => {
  const dbKey = await dbApiKey();
  const envKey = (process.env.GROQ_API_KEY || '').trim();
  res.json({
    configured: !!(dbKey || envKey),
    source: dbKey ? 'db' : (envKey ? 'env' : null),
    model: GROQ_MODEL,
    max_image_mb: Math.round(MAX_IMAGE_BYTES / (1024 * 1024)),
    modes: Object.entries(MODES).map(([key, v]) => ({ key, label: v.label, json: !!v.json })),
  });
});

// POST /vision/extract -> { image, mode, prompt }
router.post('/extract', visionLimiter, async (req, res) => {
  const key = await apiKey();
  if (!key) {
    return res.status(503).json({
      error: 'GROQ_API_KEY belum diset. Masukkan API key Groq pada bagian "API Key Groq" di halaman Ekstrak Gambar (khusus admin), atau set di .env lalu restart server.',
    });
  }

  const { image, mode = 'teks', prompt } = req.body || {};
  const selected = MODES[mode] || MODES.teks;

  const parsed = parseImageDataUrl(image);
  if (parsed.error) return res.status(parsed.error.startsWith('Ukuran') ? 413 : 400).json({ error: parsed.error });

  // Susun prompt: aturan mode + instruksi tambahan (opsional, dibatasi panjangnya)
  const extra = typeof prompt === 'string' ? prompt.trim().slice(0, 2000) : '';
  const userPrompt = extra
    ? selected.prompt + '\n\nInstruksi tambahan dari pengguna (utamakan bila tidak bertentangan):\n' + extra
    : selected.prompt;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const payload = {
      model: GROQ_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: 'data:' + parsed.mime + ';base64,' + parsed.base64 } },
        ],
      }],
      temperature: selected.json ? 0.1 : 0.2,
      max_completion_tokens: 4096,
      stream: false,
    };
    // Qwen 3.8 mendukung thinking & instruct mode. Untuk OCR/ekstraksi,
    // instruct mode ("none") lebih cepat & hemat token. Model lain bisa saja
    // tidak mendukung parameter ini, jadi default hanya untuk Qwen 3.8.
    const envReasoning = process.env.GROQ_VISION_REASONING;
    const reasoningEffort = (envReasoning !== undefined
      ? envReasoning
      : (GROQ_MODEL.includes('qwen3.8') ? 'none' : '')).trim();
    if (reasoningEffort) payload.reasoning_effort = reasoningEffort;
    if (selected.json) payload.response_format = { type: 'json_object' };

    const resp = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const rawBody = await resp.text();
    if (!resp.ok) {
      console.error('[groq-vision] Groq error', resp.status, rawBody.slice(0, 500));
      return res.status(502).json({ error: groqErrorMessage(resp.status, rawBody) });
    }

    let result;
    try {
      result = JSON.parse(rawBody);
    } catch {
      return res.status(502).json({ error: 'Respons Groq tidak dapat dibaca.' });
    }

    const text = String(result.choices?.[0]?.message?.content || '').trim();
    if (!text) {
      return res.status(502).json({ error: 'Groq tidak mengembalikan teks. Coba gambar yang lebih jelas.' });
    }

    // Untuk mode JSON: coba parse, tapi tetap kirim teks mentah bila gagal
    let data = null;
    const textForParse = selected.json ? stripCodeFence(text) : text;
    try { data = JSON.parse(textForParse); } catch { /* bukan JSON valid */ }

    res.json({
      text: selected.json ? textForParse : text,
      data,
      mode,
      model: GROQ_MODEL,
      usage: {
        prompt_tokens: result.usage?.prompt_tokens ?? null,
        completion_tokens: result.usage?.completion_tokens ?? null,
        total_tokens: result.usage?.total_tokens ?? null,
      },
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      return res.status(504).json({ error: 'Permintaan ke Groq melebihi batas waktu 90 detik. Coba gambar yang lebih kecil.' });
    }
    console.error('[groq-vision]', err);
    res.status(502).json({ error: 'Gagal menghubungi Groq: ' + (err.message || 'kesalahan jaringan') });
  } finally {
    clearTimeout(timer);
  }
});

// PUT /vision/key -> simpan/update API key Groq di database (admin only)
// Body: { api_key: 'gsk_...' }. Kosongkan ?clear=1 untuk menghapus.
router.put('/key', requireRole('admin'), async (req, res) => {
  const key = String(req.body?.api_key || '').trim();
  if (!key) {
    return res.status(400).json({ error: 'API key tidak boleh kosong.' });
  }
  if (key.length > 255) {
    return res.status(400).json({ error: 'API key terlalu panjang (maks 255 karakter).' });
  }
  try {
    await upsertSetting(KEY_SETTING, key);
    invalidateKeyCache();
    res.json({ ok: true, source: 'db', configured: true });
  } catch (e) {
    console.error('[groq-vision] gagal simpan key:', e);
    res.status(500).json({ error: 'Gagal menyimpan API key ke database.' });
  }
});

// DELETE /vision/key -> hapus key dari database (kembali pakai .env)
router.delete('/key', requireRole('admin'), async (req, res) => {
  try {
    try {
      await db.query('DELETE FROM app_settings WHERE setting_key = ?', [KEY_SETTING]);
    } catch (e) {
      // Tabel belum ada = memang tidak ada key tersimpan — bukan kegagalan
      if (!(e && (e.errno === 1146 || /doesn't exist/i.test(e.message || '')))) throw e;
    }
    invalidateKeyCache();
    const envKey = (process.env.GROQ_API_KEY || '').trim();
    res.json({ ok: true, source: envKey ? 'env' : null, configured: !!envKey });
  } catch (e) {
    console.error('[groq-vision] gagal hapus key:', e);
    res.status(500).json({ error: 'Gagal menghapus API key dari database.' });
  }
});

module.exports = router;
module.exports.MODES = MODES;
