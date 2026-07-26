/**
 * NOTIFIKASI — Internal messaging system
 * 
 * Endpoints untuk mengirim dan membaca notifikasi/pesan internal
 * antara admin/keuangan ke karyawan.
 */
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

/**
 * POST /api/notifikasi/kirim
 * Mengirim notifikasi ke satu atau banyak karyawan.
 * Body: { penerima_ids: number[], judul: string, pesan?: string, link?: string }
 * Hanya bisa oleh admin atau keuangan.
 */
router.post('/notifikasi/kirim', async (req, res) => {
  try {
    const role = req.user.role;
    if (role !== 'admin' && role !== 'keuangan') {
      return res.status(403).json({ error: 'Hanya admin dan keuangan yang bisa mengirim notifikasi' });
    }

    const { penerima_ids, judul, pesan, link } = req.body;
    if (!penerima_ids || !Array.isArray(penerima_ids) || !penerima_ids.length) {
      return res.status(400).json({ error: 'Penerima wajib diisi' });
    }
    if (!judul || !judul.trim()) {
      return res.status(400).json({ error: 'Judul notifikasi wajib diisi' });
    }

    const t = req.user.tenant_id;
    const pengirimId = req.user.id;
    const values = penerima_ids.map(id => [t, pengirimId, id, judul.trim(), pesan || null, link || null]);
    const ph = values.map(() => '(?,?,?,?,?,?)').join(',');

    await db.query(
      `INSERT INTO notifikasi (tenant_id, pengirim_id, penerima_id, judul, pesan, link) VALUES ${ph}`,
      values.flat()
    );

    res.json({ ok: true, pesan: 'Notifikasi berhasil dikirim ke ' + penerima_ids.length + ' karyawan', jumlah: penerima_ids.length });
  } catch (err) {
    console.error('Kirim notifikasi error:', err);
    res.status(500).json({ error: 'Gagal mengirim notifikasi: ' + err.message });
  }
});

/**
 * GET /api/notifikasi/saya
 * Mendapatkan daftar notifikasi untuk karyawan yang sedang login.
 * Query params: page, limit, unread_only
 */
router.get('/notifikasi/saya', async (req, res) => {
  try {
    // Cari karyawan_id dari user yang login
    let karyawanId = req.user.karyawan_id;
    if (!karyawanId) {
      const [k] = await db.query('SELECT id FROM karyawan WHERE email=? AND tenant_id=? LIMIT 1', [req.user.email, req.user.tenant_id]);
      if (!k.length) return res.json({ data: [], pagination: { total: 0 }, unread_count: 0 });
      karyawanId = k[0].id;
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const unreadOnly = req.query.unread_only === 'true';

    let where = 'WHERE n.penerima_id=? AND n.tenant_id=?';
    const params = [karyawanId, req.user.tenant_id];
    if (unreadOnly) { where += ' AND n.is_read=0'; }

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM notifikasi n ${where}`, params
    );

    const [rows] = await db.query(
      `SELECT n.id, n.judul, n.pesan, n.link, n.is_read, n.created_at,
              u.nama as pengirim_nama
       FROM notifikasi n
       LEFT JOIN users u ON u.id=n.pengirim_id
       ${where}
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ unread_count }]] = await db.query(
      `SELECT COUNT(*) AS unread_count FROM notifikasi WHERE penerima_id=? AND tenant_id=? AND is_read=0`,
      [karyawanId, req.user.tenant_id]
    );

    res.json({
      data: rows,
      unread_count,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Ambil notifikasi error:', err);
    res.status(500).json({ error: 'Gagal memuat notifikasi' });
  }
});

/**
 * GET /api/notifikasi/unread-count
 * Mendapatkan jumlah notifikasi yang belum dibaca.
 */
router.get('/notifikasi/unread-count', async (req, res) => {
  try {
    let karyawanId = req.user.karyawan_id;
    if (!karyawanId) {
      const [k] = await db.query('SELECT id FROM karyawan WHERE email=? AND tenant_id=? LIMIT 1', [req.user.email, req.user.tenant_id]);
      if (!k.length) return res.json({ count: 0 });
      karyawanId = k[0].id;
    }

    const [[{ count }]] = await db.query(
      `SELECT COUNT(*) AS count FROM notifikasi WHERE penerima_id=? AND tenant_id=? AND is_read=0`,
      [karyawanId, req.user.tenant_id]
    );

    res.json({ count });
  } catch (err) {
    console.error('Unread count error:', err);
    res.json({ count: 0 });
  }
});

/**
 * PUT /api/notifikasi/:id/baca
 * Menandai notifikasi sebagai sudah dibaca.
 */
router.put('/notifikasi/:id/baca', async (req, res) => {
  try {
    let karyawanId = req.user.karyawan_id;
    if (!karyawanId) {
      const [k] = await db.query('SELECT id FROM karyawan WHERE email=? AND tenant_id=? LIMIT 1', [req.user.email, req.user.tenant_id]);
      if (k.length) karyawanId = k[0].id;
    }

    const whereExtra = karyawanId ? 'AND penerima_id=?' : '';
    const params = [req.params.id];
    if (karyawanId) params.push(karyawanId);

    await db.query(
      `UPDATE notifikasi SET is_read=1 WHERE id=? ${whereExtra} AND tenant_id=?`,
      [...params, req.user.tenant_id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Baca notifikasi error:', err);
    res.status(500).json({ error: 'Gagal memperbarui notifikasi' });
  }
});

/**
 * PUT /api/notifikasi/baca-semua
 * Menandai semua notifikasi sebagai sudah dibaca.
 */
router.put('/notifikasi/baca-semua', async (req, res) => {
  try {
    let karyawanId = req.user.karyawan_id;
    if (!karyawanId) {
      const [k] = await db.query('SELECT id FROM karyawan WHERE email=? AND tenant_id=? LIMIT 1', [req.user.email, req.user.tenant_id]);
      if (k.length) karyawanId = k[0].id;
    }

    if (karyawanId) {
      await db.query(
        `UPDATE notifikasi SET is_read=1 WHERE penerima_id=? AND tenant_id=? AND is_read=0`,
        [karyawanId, req.user.tenant_id]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Baca semua notifikasi error:', err);
    res.status(500).json({ error: 'Gagal memperbarui notifikasi' });
  }
});

/**
 * GET /api/notifikasi/karyawan-list
 * Untuk admin: daftar karyawan yang bisa dikirimi notifikasi.
 */
router.get('/notifikasi/karyawan-list', async (req, res) => {
  try {
    const role = req.user.role;
    if (role !== 'admin' && role !== 'keuangan') {
      return res.status(403).json({ error: 'Akses ditolak' });
    }

    const [rows] = await db.query(
      `SELECT k.id, k.nama, k.nik, k.departemen, k.jabatan_id, j.name as jabatan
       FROM karyawan k
       LEFT JOIN jabatan j ON j.id=k.jabatan_id
       WHERE k.tenant_id=? AND k.status='Aktif'
       ORDER BY k.nama ASC`,
      [req.user.tenant_id]
    );

    res.json(rows);
  } catch (err) {
    console.error('Karyawan list error:', err);
    res.status(500).json({ error: 'Gagal memuat daftar karyawan' });
  }
});

module.exports = router;
