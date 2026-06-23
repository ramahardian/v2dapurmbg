const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('admin', 'keuangan'));

router.get('/absensi', async (req, res) => {
  const { karyawan_id, bulan, tahun, status } = req.query;
  let sql = `SELECT a.*, k.nama as nama_karyawan, k.jabatan, k.departemen FROM absensi a
    JOIN karyawan k ON k.id=a.karyawan_id WHERE a.tenant_id=?`;
  const params = [req.user.tenant_id];
  if (karyawan_id) { sql += ` AND a.karyawan_id=?`; params.push(karyawan_id); }
  if (bulan) { sql += ` AND MONTH(a.tanggal)=?`; params.push(bulan); }
  if (tahun) { sql += ` AND YEAR(a.tanggal)=?`; params.push(tahun); }
  if (status) { sql += ` AND a.status=?`; params.push(status); }
  sql += ` ORDER BY a.tanggal DESC, k.nama ASC`;
  const [rows] = await db.query(sql, params);
  res.json(rows);
});

router.post('/absensi', async (req, res) => {
  const { karyawan_id, tanggal, status, jam_masuk, jam_keluar, keterangan } = req.body;
  const [r] = await db.query(
    `INSERT INTO absensi (tenant_id, karyawan_id, tanggal, status, jam_masuk, jam_keluar, keterangan) VALUES (?,?,?,?,?,?,?)`,
    [req.user.tenant_id, karyawan_id, tanggal, status || 'Hadir', jam_masuk || null, jam_keluar || null, keterangan || null]
  );
  const [rows] = await db.query(`SELECT a.*, k.nama as nama_karyawan FROM absensi a JOIN karyawan k ON k.id=a.karyawan_id WHERE a.id=?`, [r.insertId]);
  res.json(rows[0]);
});

router.put('/absensi/:id', async (req, res) => {
  const { status, jam_masuk, jam_keluar, keterangan } = req.body;
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

router.delete('/absensi/:id', async (req, res) => {
  await db.query(`DELETE FROM absensi WHERE id=? AND tenant_id=?`, [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

module.exports = router;
