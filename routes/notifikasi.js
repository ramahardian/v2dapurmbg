const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/notifikasi', async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const role = req.user.role;
    const type = req.query.type || 'sent';

    const isAdminOrKeuangan = role === 'admin' || role === 'keuangan';

    // Admin/keuangan: bisa lihat inbox (diterima) atau sent (dikirim)
    if (isAdminOrKeuangan) {
      if (type === 'inbox') {
        // Notifikasi yang diterima admin (lewat relasi karyawan)
        if (!req.user.karyawan_id) return res.json([]);
        const [rows] = await db.query(
          `SELECT n.*, u.nama as nama_pengirim
           FROM notifikasi n
           LEFT JOIN users u ON u.id=n.pengirim_id
           WHERE n.tenant_id=? AND n.penerima_id=?
           ORDER BY n.created_at DESC`,
          [t, req.user.karyawan_id]
        );
        return res.json(rows);
      }

      // Sent (dikirim oleh admin)
      const [rows] = await db.query(
        `SELECT n.*, k.nama as nama_penerima
         FROM notifikasi n
         LEFT JOIN karyawan k ON k.id=n.penerima_id
         WHERE n.tenant_id=? AND n.pengirim_id=?
         ORDER BY n.created_at DESC`,
        [t, req.user.id]
      );
      return res.json(rows);
    }

    // Karyawan biasa: inbox
    if (req.user.karyawan_id) {
      const [rows] = await db.query(
        `SELECT n.*, u.nama as nama_pengirim
         FROM notifikasi n
         LEFT JOIN users u ON u.id=n.pengirim_id
         WHERE n.tenant_id=? AND n.penerima_id=?
         ORDER BY n.created_at DESC`,
        [t, req.user.karyawan_id]
      );
      return res.json(rows);
    }

    res.json([]);
  } catch (err) {
    console.error('GET /notifikasi error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifikasi/kirim', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const { penerima_id, judul, pesan, kirim_ke_semua } = req.body;
    if (!judul) return res.status(400).json({ error: 'Judul wajib diisi' });

    const t = req.user.tenant_id;

    if (kirim_ke_semua) {
      const [karyawan] = await db.query(
        'SELECT id FROM karyawan WHERE tenant_id=? AND status="Aktif"',
        [t]
      );
      if (!karyawan.length) return res.status(400).json({ error: 'Tidak ada karyawan aktif' });

      for (const k of karyawan) {
        await db.query(
          `INSERT INTO notifikasi (tenant_id, pengirim_id, penerima_id, judul, pesan) VALUES (?,?,?,?,?)`,
          [t, req.user.id, k.id, judul, pesan || null]
        );
      }
      return res.json({ ok: true, pesan: `Notifikasi terkirim ke ${karyawan.length} karyawan` });
    }

    if (!penerima_id) return res.status(400).json({ error: 'Pilih penerima atau centang "Kirim ke Semua"' });

    await db.query(
      `INSERT INTO notifikasi (tenant_id, pengirim_id, penerima_id, judul, pesan) VALUES (?,?,?,?,?)`,
      [t, req.user.id, penerima_id, judul, pesan || null]
    );

    res.json({ ok: true, pesan: 'Notifikasi terkirim' });
  } catch (err) {
    console.error('POST /notifikasi/kirim error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/notifikasi/:id/baca', async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const [rows] = await db.query(
      'SELECT id FROM notifikasi WHERE id=? AND tenant_id=? AND penerima_id=?',
      [req.params.id, t, req.user.karyawan_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Notifikasi tidak ditemukan' });

    await db.query('UPDATE notifikasi SET is_read=1 WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /notifikasi/baca error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/notifikasi/baca-semua', async (req, res) => {
  try {
    const t = req.user.tenant_id;
    await db.query(
      'UPDATE notifikasi SET is_read=1 WHERE tenant_id=? AND penerima_id=? AND is_read=0',
      [t, req.user.karyawan_id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /notifikasi/baca-semua error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/notifikasi/:id', async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const id = req.params.id;

    // Bisa dihapus oleh pengirim (admin/keuangan) atau penerima (karyawan)
    const [rows] = await db.query(
      `SELECT id, pengirim_id FROM notifikasi WHERE id=? AND tenant_id=? AND (pengirim_id=? OR penerima_id=?)`,
      [id, t, req.user.id, req.user.karyawan_id || null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Notifikasi tidak ditemukan atau tidak bisa dihapus' });

    await db.query('DELETE FROM notifikasi WHERE id=?', [id]);
    res.json({ ok: true, pesan: 'Pesan berhasil dihapus' });
  } catch (err) {
    console.error('DELETE /notifikasi/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/notifikasi/belum-dibaca', async (req, res) => {
  try {
    const t = req.user.tenant_id;
    if (!req.user.karyawan_id) return res.json({ count: 0 });

    const [[{ count }]] = await db.query(
      'SELECT COUNT(*) as count FROM notifikasi WHERE tenant_id=? AND penerima_id=? AND is_read=0',
      [t, req.user.karyawan_id]
    );
    res.json({ count });
  } catch (err) {
    console.error('GET /notifikasi/belum-dibaca error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
