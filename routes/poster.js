/**
 * TEMPLATE POSTER — Pengaturan template foto share menu harian (per tenant).
 *
 * Endpoint:
 *   GET  /template-poster          → baca template (semua user login; dipakai tombol Bagikan menu)
 *   PUT  /template-poster          → simpan template (admin & ahli gizi)
 *   POST /template-poster/reset    → kembalikan ke default (admin & ahli gizi)
 *
 * Gambar logo/background dikirim sebagai base64 lalu disimpan ke
 * public/uploads/poster/ agar tidak membebani kolom database.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const DEFAULT_CATATAN = [
  'Karbohidrat, lauk, sayur & buah dalam satu porsi',
  'Protein hewani & nabati untuk tumbuh kembang',
  'Serat tinggi membantu kesehatan pencernaan',
  'Diolah higienis sesuai standar gizi MBG',
];

const DEFAULTS = {
  judul: 'Informasi Nilai Gizi',
  tagline: 'Partner Nutrisi & Gaya Hidup Sehat',
  badge1: '✓   Menu MBG',
  badge2: 'Makanan Bergizi Gratis',
  catatan_judul: 'Catatan',
  catatan_mode: 'manual',
  catatan: DEFAULT_CATATAN.slice(),
  footer_text: '',
  warna_utama: '#14532D',
  warna_aksen: '#F97316',
  logo_url: '',
  background_url: '',
  tampilkan_foto: 1,
};

function cleanText(v, max, fallback, allowEmpty) {
  if (v == null) return fallback;
  const s = String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  if (!s) return allowEmpty ? '' : fallback;
  return s;
}

function cleanColor(v, fallback) {
  const s = String(v || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : fallback;
}

function cleanCatatan(v) {
  let arr = v;
  if (typeof arr === 'string') arr = arr.split(/\r?\n/);
  if (!Array.isArray(arr)) return [];
  return arr
    .map(s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 6);
}

function rowToTemplate(row) {
  if (!row) return Object.assign({}, DEFAULTS, { catatan: DEFAULT_CATATAN.slice() });
  let catatan = null;
  try {
    const p = JSON.parse(row.catatan_json || 'null');
    if (Array.isArray(p)) catatan = p.map(s => String(s)).slice(0, 6);
  } catch (e) { /* pakai default */ }
  return {
    judul: row.judul || DEFAULTS.judul,
    tagline: row.tagline || '',
    badge1: row.badge1 || '',
    badge2: row.badge2 || '',
    catatan_judul: row.catatan_judul || DEFAULTS.catatan_judul,
    catatan_mode: row.catatan_mode === 'menu' ? 'menu' : 'manual',
    catatan: catatan !== null ? catatan : DEFAULT_CATATAN.slice(),
    footer_text: row.footer_text || '',
    warna_utama: cleanColor(row.warna_utama, DEFAULTS.warna_utama),
    warna_aksen: cleanColor(row.warna_aksen, DEFAULTS.warna_aksen),
    logo_url: row.logo_url || '',
    background_url: row.background_url || '',
    tampilkan_foto: row.tampilkan_foto ? 1 : 0,
  };
}

/**
 * Simpan data URL gambar ke public/uploads/poster.
 * Mengembalikan URL publik, atau null bila data bukan gambar valid.
 */
function saveBase64Image(base64, prefix, tenantId) {
  if (!base64 || typeof base64 !== 'string' || !base64.startsWith('data:image')) return null;
  const m = base64.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,([\s\S]+)$/);
  if (!m) return null;
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const buffer = Buffer.from(m[2], 'base64');
  if (!buffer.length) return null;
  if (buffer.length > 4 * 1024 * 1024) {
    const err = new Error('Ukuran gambar maksimal 4 MB');
    err.status = 400;
    throw err;
  }
  const filename = prefix + '-t' + tenantId + '-' + Date.now() + '-' +
    Math.random().toString(36).slice(2, 8) + '.' + ext;
  const dir = path.join(__dirname, '..', 'public', 'uploads', 'poster');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer);
  return '/uploads/poster/' + filename;
}

function deleteUploadedFile(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('/uploads/poster/')) return;
  const fp = path.join(__dirname, '..', 'public', url.replace(/^\//, ''));
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (e) { /* abaikan */ }
}

async function loadTemplate(tenantId) {
  const [rows] = await db.query(
    'SELECT * FROM tenant_poster_template WHERE tenant_id=?',
    [tenantId]
  );
  return rowToTemplate(rows[0]);
}

// GET — dipakai halaman pengaturan & tombol "Bagikan menu" di dashboard
router.get('/template-poster', async (req, res) => {
  try {
    res.json(await loadTemplate(req.user.tenant_id));
  } catch (e) {
    res.status(500).json({ error: 'Gagal memuat template poster: ' + e.message });
  }
});

// PUT — simpan perubahan (admin & ahli gizi)
router.put('/template-poster', requireRole('ahli_gizi'), async (req, res) => {
  try {
    const body = req.body || {};
    const tenantId = req.user.tenant_id;

    const [rows] = await db.query(
      'SELECT logo_url, background_url FROM tenant_poster_template WHERE tenant_id=?',
      [tenantId]
    );
    const existing = rows[0] || {};

    let logoUrl = existing.logo_url || null;
    let bgUrl = existing.background_url || null;

    if (Number(body.remove_logo)) {
      logoUrl = null;
    } else if (body.logo_base64) {
      logoUrl = saveBase64Image(body.logo_base64, 'logo', tenantId);
    }
    if (Number(body.remove_background)) {
      bgUrl = null;
    } else if (body.background_base64) {
      bgUrl = saveBase64Image(body.background_base64, 'background', tenantId);
    }

    const tpl = {
      judul: cleanText(body.judul, 120, DEFAULTS.judul, false),
      tagline: cleanText(body.tagline, 180, '', true),
      badge1: cleanText(body.badge1, 80, '', true),
      badge2: cleanText(body.badge2, 80, '', true),
      catatan_judul: cleanText(body.catatan_judul, 80, DEFAULTS.catatan_judul, false),
      catatan_mode: body.catatan_mode === 'menu' ? 'menu' : 'manual',
      catatan: body.catatan === undefined ? DEFAULT_CATATAN.slice() : cleanCatatan(body.catatan),
      footer_text: cleanText(body.footer_text, 200, '', true),
      warna_utama: cleanColor(body.warna_utama, DEFAULTS.warna_utama),
      warna_aksen: cleanColor(body.warna_aksen, DEFAULTS.warna_aksen),
      logo_url: logoUrl,
      background_url: bgUrl,
      tampilkan_foto: Number(body.tampilkan_foto) ? 1 : 0,
    };

    await db.query(
      `INSERT INTO tenant_poster_template
        (tenant_id, judul, tagline, badge1, badge2, catatan_judul, catatan_mode,
         catatan_json, footer_text, warna_utama, warna_aksen, logo_url, background_url, tampilkan_foto)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         judul=VALUES(judul), tagline=VALUES(tagline), badge1=VALUES(badge1),
         badge2=VALUES(badge2), catatan_judul=VALUES(catatan_judul),
         catatan_mode=VALUES(catatan_mode), catatan_json=VALUES(catatan_json),
         footer_text=VALUES(footer_text), warna_utama=VALUES(warna_utama),
         warna_aksen=VALUES(warna_aksen), logo_url=VALUES(logo_url),
         background_url=VALUES(background_url), tampilkan_foto=VALUES(tampilkan_foto)`,
      [
        tenantId, tpl.judul, tpl.tagline, tpl.badge1, tpl.badge2, tpl.catatan_judul,
        tpl.catatan_mode, JSON.stringify(tpl.catatan), tpl.footer_text,
        tpl.warna_utama, tpl.warna_aksen, tpl.logo_url, tpl.background_url,
        tpl.tampilkan_foto,
      ]
    );

    // Hapus file lama yang sudah diganti/dihapus (hanya file di uploads/poster)
    if (existing.logo_url && existing.logo_url !== logoUrl) deleteUploadedFile(existing.logo_url);
    if (existing.background_url && existing.background_url !== bgUrl) deleteUploadedFile(existing.background_url);

    res.json(await loadTemplate(tenantId));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Gagal menyimpan template poster' });
  }
});

// POST reset — kembali ke template default (admin)
router.post('/template-poster/reset', requireRole('ahli_gizi'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const [rows] = await db.query(
      'SELECT logo_url, background_url FROM tenant_poster_template WHERE tenant_id=?',
      [tenantId]
    );
    if (rows[0]) {
      deleteUploadedFile(rows[0].logo_url);
      deleteUploadedFile(rows[0].background_url);
      await db.query('DELETE FROM tenant_poster_template WHERE tenant_id=?', [tenantId]);
    }
    res.json(rowToTemplate(null));
  } catch (e) {
    res.status(500).json({ error: 'Gagal reset template poster: ' + e.message });
  }
});

module.exports = router;
