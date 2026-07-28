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

    let karyawanId = req.user.karyawan_id;
    if (!karyawanId) {
      const [k] = await db.query('SELECT id FROM karyawan WHERE tenant_id=? AND email=? LIMIT 1', [t, req.user.email]);
      if (k.length) karyawanId = k[0].id;
    }

    if (isAdminOrKeuangan) {
      if (type === 'inbox') {
        if (!karyawanId) return res.json([]);
        const [rows] = await db.query(
          `SELECT n.*, u.nama as nama_pengirim
           FROM notifikasi n
           LEFT JOIN users u ON u.id=n.pengirim_id
           WHERE n.tenant_id=? AND n.penerima_id=? AND n.deleted_by_penerima=0
           ORDER BY n.created_at DESC`,
          [t, karyawanId]
        );
        return res.json(rows);
      }

      const [rows] = await db.query(
        `SELECT n.*, k.nama as nama_penerima
         FROM notifikasi n
         LEFT JOIN karyawan k ON k.id=n.penerima_id
         WHERE n.tenant_id=? AND n.pengirim_id=? AND n.deleted_by_pengirim=0
         ORDER BY n.created_at DESC`,
        [t, req.user.id]
      );
      return res.json(rows);
    }

    if (karyawanId) {
      const [rows] = await db.query(
        `SELECT n.*, u.nama as nama_pengirim
         FROM notifikasi n
         LEFT JOIN users u ON u.id=n.pengirim_id
         WHERE n.tenant_id=? AND n.penerima_id=? AND n.deleted_by_penerima=0
         ORDER BY n.created_at DESC`,
        [t, karyawanId]
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
    let karyawanId = req.user.karyawan_id;
    if (!karyawanId) {
      const [k] = await db.query('SELECT id FROM karyawan WHERE tenant_id=? AND email=? LIMIT 1', [t, req.user.email]);
      if (k.length) karyawanId = k[0].id;
    }
    const [rows] = await db.query(
      'SELECT id FROM notifikasi WHERE id=? AND tenant_id=? AND penerima_id=?',
      [req.params.id, t, karyawanId]
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
    let karyawanId = req.user.karyawan_id;
    if (!karyawanId) {
      const [k] = await db.query('SELECT id FROM karyawan WHERE tenant_id=? AND email=? LIMIT 1', [t, req.user.email]);
      if (k.length) karyawanId = k[0].id;
    }
    if (karyawanId) {
      await db.query(
        'UPDATE notifikasi SET is_read=1 WHERE tenant_id=? AND penerima_id=? AND is_read=0',
        [t, karyawanId]
      );
    }
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

    const [rows] = await db.query(
      `SELECT id, pengirim_id, penerima_id, deleted_by_pengirim, deleted_by_penerima FROM notifikasi WHERE id=? AND tenant_id=? AND (pengirim_id=? OR penerima_id=?)`,
      [id, t, req.user.id, req.user.karyawan_id || null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Notifikasi tidak ditemukan atau tidak bisa dihapus' });

    const row = rows[0];

    if (Number(row.pengirim_id) === Number(req.user.id)) {
      if (row.deleted_by_penerima) {
        await db.query('DELETE FROM notifikasi WHERE id=?', [id]);
      } else {
        await db.query('UPDATE notifikasi SET deleted_by_pengirim=1 WHERE id=?', [id]);
      }
    } else {
      if (row.deleted_by_pengirim) {
        await db.query('DELETE FROM notifikasi WHERE id=?', [id]);
      } else {
        await db.query('UPDATE notifikasi SET deleted_by_penerima=1 WHERE id=?', [id]);
      }
    }

    res.json({ ok: true, pesan: 'Pesan berhasil dihapus' });
  } catch (err) {
    console.error('DELETE /notifikasi/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/notifikasi/belum-dibaca', async (req, res) => {
  try {
    const t = req.user.tenant_id;
    let karyawanId = req.user.karyawan_id;
    if (!karyawanId) {
      const [k] = await db.query('SELECT id FROM karyawan WHERE tenant_id=? AND email=? LIMIT 1', [t, req.user.email]);
      if (k.length) karyawanId = k[0].id;
    }
    if (!karyawanId) return res.json({ count: 0 });

    const [[{ count }]] = await db.query(
      'SELECT COUNT(*) as count FROM notifikasi WHERE tenant_id=? AND penerima_id=? AND is_read=0 AND deleted_by_penerima=0',
      [t, karyawanId]
    );
    res.json({ count });
  } catch (err) {
    console.error('GET /notifikasi/belum-dibaca error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Daftar admin/keuangan untuk pemilih penerima di halaman karyawan
router.get('/notifikasi/daftar-admin', async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const [rows] = await db.query(
      `SELECT u.id, u.nama, u.role FROM users u
       WHERE u.tenant_id=? AND (u.role='admin' OR u.role='keuangan') AND u.id!=?
       ORDER BY u.role, u.nama`,
      [t, req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /notifikasi/daftar-admin error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Kirim pesan dari karyawan ke admin/keuangan
router.post('/notifikasi/kirim-dari-karyawan', async (req, res) => {
  try {
    const { judul, pesan, reply_to, penerima_id, kirim_ke_semua } = req.body;
    if (!judul) return res.status(400).json({ error: 'Judul wajib diisi' });
    if (!req.user.karyawan_id && !req.user.email) return res.status(400).json({ error: 'Akun tidak terhubung ke karyawan' });

    const t = req.user.tenant_id;

    if (reply_to) {
      const [target] = await db.query(
        `SELECT u.id as uid, u.karyawan_id, k.id as kid
         FROM users u
         LEFT JOIN karyawan k ON (k.id=u.karyawan_id OR k.email=u.email)
         WHERE u.tenant_id=? AND u.id=?
         LIMIT 1`,
        [t, reply_to]
      );
      if (!target.length) return res.status(400).json({ error: 'Penerima tidak ditemukan' });
      const penerimaKaryawanId = target[0].karyawan_id || target[0].kid;
      if (!penerimaKaryawanId) return res.status(400).json({ error: 'Penerima tidak memiliki data karyawan' });
      await db.query(
        `INSERT INTO notifikasi (tenant_id, pengirim_id, penerima_id, judul, pesan) VALUES (?,?,?,?,?)`,
        [t, req.user.id, penerimaKaryawanId, judul, pesan || null]
      );
      return res.json({ ok: true, pesan: 'Balasan terkirim' });
    }

    if (penerima_id && penerima_id !== 'semua') {
      // Kirim ke admin/keuangan tertentu
      const [target] = await db.query(
        `SELECT u.id as uid, u.karyawan_id, k.id as kid
         FROM users u
         LEFT JOIN karyawan k ON (k.id=u.karyawan_id OR k.email=u.email)
         WHERE u.tenant_id=? AND u.id=? AND (u.role='admin' OR u.role='keuangan')
         LIMIT 1`,
        [t, penerima_id]
      );
      if (!target.length) return res.status(400).json({ error: 'Penerima tidak ditemukan' });
      const penerimaKaryawanId = target[0].karyawan_id || target[0].kid;
      if (!penerimaKaryawanId) return res.status(400).json({ error: 'Penerima tidak memiliki data karyawan' });
      await db.query(
        `INSERT INTO notifikasi (tenant_id, pengirim_id, penerima_id, judul, pesan) VALUES (?,?,?,?,?)`,
        [t, req.user.id, penerimaKaryawanId, judul, pesan || null]
      );
      return res.json({ ok: true, pesan: 'Pesan terkirim' });
    }

    // Kirim ke semua admin/keuangan
    const [admins] = await db.query(
      `SELECT u.id as uid, u.karyawan_id, k.id as kid
       FROM users u
       LEFT JOIN karyawan k ON (k.id=u.karyawan_id OR k.email=u.email)
       WHERE u.tenant_id=? AND (u.role='admin' OR u.role='keuangan') AND u.id!=?
       GROUP BY u.id`,
      [t, req.user.id]
    );

    if (!admins.length) return res.status(400).json({ error: 'Tidak ada admin/keuangan yang bisa dikirimi pesan' });

    for (const a of admins) {
      const penerimaKaryawanId = a.karyawan_id || a.kid;
      if (!penerimaKaryawanId) continue;
      await db.query(
        `INSERT INTO notifikasi (tenant_id, pengirim_id, penerima_id, judul, pesan) VALUES (?,?,?,?,?)`,
        [t, req.user.id, penerimaKaryawanId, judul, pesan || null]
      );
    }
    res.json({ ok: true, pesan: 'Pesan terkirim ke admin/keuangan' });
  } catch (err) {
    console.error('POST /notifikasi/kirim-dari-karyawan error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
