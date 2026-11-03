/**
 * SOCIAL POSTS — editor postingan media sosial (per tenant).
 *
 * Endpoint:
 *   GET    /social-posts          → daftar riwayat postingan
 *   GET    /social-posts/:id      → detail + draft editor
 *   POST   /social-posts          → simpan postingan baru
 *   PUT    /social-posts/:id      → perbarui postingan
 *   DELETE /social-posts/:id      → hapus baris DB + semua file gambar terkait
 *
 * Gambar final & aset editor dikirim sebagai data URL (base64) dari browser.
 * Server menyimpannya sebagai file di public/uploads/social/ dan DB hanya
 * menyimpan URL-nya. Dengan begitu database tidak membengkak oleh base64.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('ahli_gizi'));

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'social');
const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB per gambar (setelah kompresi browser)
const MAX_DRAFT_CHARS = 250000;
const FORMATS = new Set(['square', 'portrait', 'story']);

function httpError(message, status) {
  const err = new Error(message);
  err.status = status || 400;
  return err;
}

function cleanText(v, max) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanMultiline(v, max) {
  return String(v == null ? '' : v)
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanDate(v) {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function cleanMenuId(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function cleanFormat(v) {
  return FORMATS.has(String(v)) ? String(v) : 'portrait';
}

/** Simpan data URL gambar ke public/uploads/social. */
function saveDataUrl(dataUrl, prefix, tenantId) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) return null;
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,([\s\S]+)$/);
  if (!m) throw httpError('Format gambar harus PNG, JPG, atau WEBP');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const buffer = Buffer.from(m[2], 'base64');
  if (!buffer.length) throw httpError('Gambar kosong');
  if (buffer.length > MAX_IMAGE_BYTES) throw httpError('Ukuran gambar maksimal 6 MB');
  const filename = prefix + '-t' + tenantId + '-' + Date.now() + '-' +
    Math.random().toString(36).slice(2, 8) + '.' + ext;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return '/uploads/social/' + filename;
}

/** Hapus file hanya bila URL benar-benar berada di folder uploads/social. */
function deleteUploaded(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('/uploads/social/')) return;
  const fp = path.join(UPLOAD_DIR, path.basename(url));
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (e) {
    console.error('Gagal hapus file social:', fp, e.message);
  }
}

function safeDraftJson(v) {
  if (v == null) return null;
  let obj = v;
  if (typeof v === 'string') {
    try { obj = JSON.parse(v); } catch (e) { throw httpError('Draft editor tidak valid'); }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw httpError('Draft editor tidak valid');
  }
  const json = JSON.stringify(obj);
  if (json.length > MAX_DRAFT_CHARS) throw httpError('Draft editor terlalu besar');
  return json;
}

function parseDraft(json) {
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : null;
  } catch (e) {
    return null;
  }
}

function rowToPost(r, withDraft) {
  const out = {
    id: r.id,
    menu_id: r.menu_id || null,
    menu_nama: r.menu_nama || '',
    tanggal: r.tanggal || null,
    format: r.format || 'portrait',
    caption: r.caption || '',
    hashtags: r.hashtags || '',
    image_url: r.image_url,
    background_url: r.background_url || '',
    photo_url: r.photo_url || '',
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
  if (withDraft) out.draft = parseDraft(r.draft_json);
  return out;
}

const LIST_COLUMNS = `id, menu_id, menu_nama, DATE_FORMAT(tanggal, '%Y-%m-%d') AS tanggal,
  format, caption, hashtags, image_url, background_url, photo_url, created_at, updated_at`;

// GET — riwayat postingan
router.get('/social-posts', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const [rows] = await db.query(
      `SELECT ${LIST_COLUMNS} FROM social_posts WHERE tenant_id=? ORDER BY id DESC LIMIT ?`,
      [req.user.tenant_id, limit]
    );
    res.json({ data: rows.map(r => rowToPost(r, false)) });
  } catch (e) {
    console.error('GET /social-posts:', e);
    res.status(500).json({ error: 'Gagal memuat riwayat postingan: ' + e.message });
  }
});

// GET — detail termasuk draft editor
router.get('/social-posts/:id(\\d+)', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ${LIST_COLUMNS}, draft_json FROM social_posts WHERE id=? AND tenant_id=?`,
      [req.params.id, req.user.tenant_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Postingan tidak ditemukan' });
    res.json(rowToPost(rows[0], true));
  } catch (e) {
    console.error('GET /social-posts/:id:', e);
    res.status(500).json({ error: 'Gagal memuat postingan: ' + e.message });
  }
});

// POST — simpan postingan baru
router.post('/social-posts', async (req, res) => {
  const body = req.body || {};
  let imageUrl = null;
  let backgroundUrl = null;
  let photoUrl = null;
  let committed = false;
  try {
    if (!body.image_base64) throw httpError('Gambar postingan wajib dibuat terlebih dahulu');
    imageUrl = saveDataUrl(body.image_base64, 'post', req.user.tenant_id);
    if (!imageUrl) throw httpError('Gambar postingan tidak valid');
    if (body.background_base64) {
      backgroundUrl = saveDataUrl(body.background_base64, 'bg', req.user.tenant_id);
      if (!backgroundUrl) throw httpError('Gambar latar tidak valid');
    }
    if (body.photo_base64) {
      photoUrl = saveDataUrl(body.photo_base64, 'photo', req.user.tenant_id);
      if (!photoUrl) throw httpError('Foto menu tidak valid');
    }

    const [result] = await db.query(
      `INSERT INTO social_posts
        (tenant_id, menu_id, menu_nama, tanggal, format, caption, hashtags,
         image_url, background_url, photo_url, draft_json, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.user.tenant_id,
        cleanMenuId(body.menu_id),
        cleanText(body.menu_nama, 255),
        cleanDate(body.tanggal),
        cleanFormat(body.format),
        cleanMultiline(body.caption, 2200),
        cleanMultiline(body.hashtags, 1000),
        imageUrl,
        backgroundUrl,
        photoUrl,
        safeDraftJson(body.draft),
        req.user.id || null,
      ]
    );
    committed = true;

    const [rows] = await db.query(
      `SELECT ${LIST_COLUMNS}, draft_json FROM social_posts WHERE id=? AND tenant_id=?`,
      [result.insertId, req.user.tenant_id]
    );
    res.status(201).json(rowToPost(rows[0], true));
  } catch (e) {
    if (!committed) {
      if (imageUrl) deleteUploaded(imageUrl);
      if (backgroundUrl) deleteUploaded(backgroundUrl);
      if (photoUrl) deleteUploaded(photoUrl);
    }
    console.error('POST /social-posts:', e);
    res.status(e.status || 500).json({ error: e.message || 'Gagal menyimpan postingan' });
  }
});

// PUT — perbarui postingan + bersihkan file lama yang diganti/dihapus
router.put('/social-posts/:id(\\d+)', async (req, res) => {
  const body = req.body || {};
  const tenantId = req.user.tenant_id;
  let newImage = null;
  let newBackground = null;
  let newPhoto = null;
  let oldImageToDelete = null;
  let oldBackgroundToDelete = null;
  let oldPhotoToDelete = null;
  let committed = false;

  try {
    const [rows] = await db.query(
      'SELECT image_url, background_url, photo_url FROM social_posts WHERE id=? AND tenant_id=?',
      [req.params.id, tenantId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Postingan tidak ditemukan' });
    const old = rows[0];

    let imageUrl = old.image_url || null;
    let backgroundUrl = old.background_url || null;
    let photoUrl = old.photo_url || null;

    if (body.image_base64) {
      newImage = saveDataUrl(body.image_base64, 'post', tenantId);
      if (!newImage) throw httpError('Gambar postingan tidak valid');
      oldImageToDelete = imageUrl;
      imageUrl = newImage;
    }
    if (Number(body.remove_background)) {
      oldBackgroundToDelete = backgroundUrl;
      backgroundUrl = null;
    } else if (body.background_base64) {
      newBackground = saveDataUrl(body.background_base64, 'bg', tenantId);
      if (!newBackground) throw httpError('Gambar latar tidak valid');
      oldBackgroundToDelete = backgroundUrl;
      backgroundUrl = newBackground;
    }
    if (Number(body.remove_photo)) {
      oldPhotoToDelete = photoUrl;
      photoUrl = null;
    } else if (body.photo_base64) {
      newPhoto = saveDataUrl(body.photo_base64, 'photo', tenantId);
      if (!newPhoto) throw httpError('Foto menu tidak valid');
      oldPhotoToDelete = photoUrl;
      photoUrl = newPhoto;
    }

    await db.query(
      `UPDATE social_posts SET
         menu_id=?, menu_nama=?, tanggal=?, format=?, caption=?, hashtags=?,
         image_url=?, background_url=?, photo_url=?, draft_json=?
       WHERE id=? AND tenant_id=?`,
      [
        cleanMenuId(body.menu_id),
        cleanText(body.menu_nama, 255),
        cleanDate(body.tanggal),
        cleanFormat(body.format),
        cleanMultiline(body.caption, 2200),
        cleanMultiline(body.hashtags, 1000),
        imageUrl,
        backgroundUrl,
        photoUrl,
        safeDraftJson(body.draft),
        req.params.id,
        tenantId,
      ]
    );
    committed = true;

    // Hapus file lama setelah update DB berhasil.
    if (oldImageToDelete && oldImageToDelete !== imageUrl) deleteUploaded(oldImageToDelete);
    if (oldBackgroundToDelete && oldBackgroundToDelete !== backgroundUrl) deleteUploaded(oldBackgroundToDelete);
    if (oldPhotoToDelete && oldPhotoToDelete !== photoUrl) deleteUploaded(oldPhotoToDelete);

    const [updated] = await db.query(
      `SELECT ${LIST_COLUMNS}, draft_json FROM social_posts WHERE id=? AND tenant_id=?`,
      [req.params.id, tenantId]
    );
    res.json(rowToPost(updated[0], true));
  } catch (e) {
    // Jangan tinggalkan file baru yang tidak jadi dipakai (hanya jika DB
    // belum ter-update; kalau sudah commit, file baru justru dipakai baris DB).
    if (!committed) {
      if (newImage) deleteUploaded(newImage);
      if (newBackground) deleteUploaded(newBackground);
      if (newPhoto) deleteUploaded(newPhoto);
    }
    console.error('PUT /social-posts/:id:', e);
    res.status(e.status || 500).json({ error: e.message || 'Gagal memperbarui postingan' });
  }
});

// DELETE — hapus baris DB lalu file gambar asli/asetnya
router.delete('/social-posts/:id(\\d+)', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT image_url, background_url, photo_url FROM social_posts WHERE id=? AND tenant_id=?',
      [req.params.id, req.user.tenant_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Postingan tidak ditemukan' });
    const row = rows[0];

    await db.query('DELETE FROM social_posts WHERE id=? AND tenant_id=?', [
      req.params.id,
      req.user.tenant_id,
    ]);

    deleteUploaded(row.image_url);
    deleteUploaded(row.background_url);
    deleteUploaded(row.photo_url);

    res.json({ ok: true, id: Number(req.params.id) });
  } catch (e) {
    console.error('DELETE /social-posts/:id:', e);
    res.status(500).json({ error: 'Gagal menghapus postingan: ' + e.message });
  }
});

module.exports = router;
