const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Helper: cek apakah tanggal tertentu adalah hari libur
async function cekHariLibur(tenant_id, tanggal) {
  const [rows] = await db.query(
    'SELECT id, nama FROM hari_libur WHERE tenant_id=? AND tanggal=?',
    [tenant_id, tanggal]
  );
  return rows.length > 0 ? rows[0] : null;
}

router.get('/absensi', requireRole('admin', 'keuangan'), async (req, res) => {
  const { karyawan_id, tanggal_awal, tanggal_akhir, status, page = '1', limit = '50' } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(500, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  let where = 'WHERE a.tenant_id=?';
  const params = [req.user.tenant_id];
  if (karyawan_id) { where += ` AND a.karyawan_id=?`; params.push(karyawan_id); }
  if (tanggal_awal) { where += ` AND a.tanggal >= ?`; params.push(tanggal_awal); }
  if (tanggal_akhir) { where += ` AND a.tanggal <= ?`; params.push(tanggal_akhir); }
  if (status) { where += ` AND a.status=?`; params.push(status); }
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM absensi a ${where}`, params);
  const [rows] = await db.query(
    `SELECT a.*, k.nama as nama_karyawan, j.name as jabatan, k.departemen FROM absensi a
     JOIN karyawan k ON k.id=a.karyawan_id
     LEFT JOIN jabatan j ON j.id=k.jabatan_id ${where}
     ORDER BY a.tanggal DESC, k.nama ASC LIMIT ? OFFSET ?`,
    [...params, limitNum, offset]
  );
  res.json({ data: rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
});

router.post('/absensi', requireRole('admin', 'keuangan'), async (req, res) => {
  const { karyawan_id, tanggal, status, jam_masuk, jam_keluar, keterangan } = req.body;
  if (!karyawan_id) return res.status(400).json({ error: 'Karyawan wajib dipilih' });
  if (!tanggal) return res.status(400).json({ error: 'Tanggal wajib diisi' });

  // Cek apakah tanggal adalah hari libur
  const libur = await cekHariLibur(req.user.tenant_id, tanggal);
  if (libur) {
    return res.status(403).json({
      error: `Tidak bisa input absensi: ${tanggal} adalah hari libur (${libur.nama})`,
      libur: true,
      nama_libur: libur.nama,
    });
  }

  const [r] = await db.query(
    `INSERT INTO absensi (tenant_id, karyawan_id, tanggal, status, jam_masuk, jam_keluar, keterangan) VALUES (?,?,?,?,?,?,?)`,
    [req.user.tenant_id, karyawan_id, tanggal, status || 'Hadir', jam_masuk || null, jam_keluar || null, keterangan || null]
  );
  const [rows] = await db.query(`SELECT a.*, k.nama as nama_karyawan FROM absensi a JOIN karyawan k ON k.id=a.karyawan_id WHERE a.id=?`, [r.insertId]);
  res.json(rows[0]);
});

router.put('/absensi/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  const { status, jam_masuk, jam_keluar, keterangan } = req.body;

  // Cek tanggal dari record absensi
  const [[existing]] = await db.query('SELECT tanggal FROM absensi WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
  if (existing) {
    const libur = await cekHariLibur(req.user.tenant_id, existing.tanggal);
    if (libur) {
      return res.status(403).json({
        error: `Tidak bisa edit absensi: ${existing.tanggal} adalah hari libur (${libur.nama})`,
        libur: true,
        nama_libur: libur.nama,
      });
    }
  }

  const sets = []; const vals = [];
  if (status !== undefined) { sets.push('status=?'); vals.push(status); }
  if (jam_masuk !== undefined) { sets.push('jam_masuk=?'); vals.push(jam_masuk); }
  if (jam_keluar !== undefined) { sets.push('jam_keluar=?'); vals.push(jam_keluar); }
  if (keterangan !== undefined) { sets.push('keterangan=?'); vals.push(keterangan); }
  if (!vals.length) return res.status(400).json({ error: 'Tidak ada perubahan' });
  vals.push(req.params.id, req.user.tenant_id);
  await db.query(`UPDATE absensi SET ${sets.join(',')} WHERE id=? AND tenant_id=?`, vals);
  const [rows] = await db.query(`SELECT a.*, k.nama as nama_karyawan FROM absensi a JOIN karyawan k ON k.id=a.karyawan_id WHERE a.id=?`, [req.params.id]);
  res.json(rows[0]);
});

router.delete('/absensi/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  const [[existing]] = await db.query('SELECT tanggal FROM absensi WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
  if (existing) {
    const libur = await cekHariLibur(req.user.tenant_id, existing.tanggal);
    if (libur) {
      return res.status(403).json({
        error: `Tidak bisa hapus absensi: ${existing.tanggal} adalah hari libur (${libur.nama})`,
        libur: true,
        nama_libur: libur.nama,
      });
    }
  }
  await db.query(`DELETE FROM absensi WHERE id=? AND tenant_id=?`, [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

module.exports = router;
