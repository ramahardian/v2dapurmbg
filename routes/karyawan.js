const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('admin', 'keuangan'));

router.get('/karyawan', async (req, res) => {
  const { status, departemen } = req.query;
  let sql = `SELECT k.*, 
    (SELECT COUNT(*) FROM absensi a WHERE a.karyawan_id=k.id AND a.tanggal >= DATE_SUB(NOW(), INTERVAL 30 DAY)) as absensi_30hari
    FROM karyawan k WHERE k.tenant_id=?`;
  const params = [req.user.tenant_id];
  if (status) { sql += ` AND k.status=?`; params.push(status); }
  if (departemen) { sql += ` AND k.departemen=?`; params.push(departemen); }
  sql += ` ORDER BY k.nama ASC`;
  const [rows] = await db.query(sql, params);
  res.json(rows);
});

router.post('/karyawan', async (req, res) => {
  const { nama, nik, jabatan, departemen, gaji_pokok, status, tanggal_masuk } = req.body;
  const [r] = await db.query(
    `INSERT INTO karyawan (tenant_id, nama, nik, jabatan, departemen, gaji_pokok, status, tanggal_masuk) VALUES (?,?,?,?,?,?,?,?)`,
    [req.user.tenant_id, nama, nik || null, jabatan || null, departemen || null, gaji_pokok || 0, status || 'Aktif', tanggal_masuk || null]
  );
  const [rows] = await db.query(`SELECT * FROM karyawan WHERE id=?`, [r.insertId]);
  res.json(rows[0]);
});

router.put('/karyawan/:id', async (req, res) => {
  const { nama, nik, jabatan, departemen, gaji_pokok, status, tanggal_masuk } = req.body;
  const sets = []; const vals = [];
  if (nama !== undefined) { sets.push('nama=?'); vals.push(nama); }
  if (nik !== undefined) { sets.push('nik=?'); vals.push(nik); }
  if (jabatan !== undefined) { sets.push('jabatan=?'); vals.push(jabatan); }
  if (departemen !== undefined) { sets.push('departemen=?'); vals.push(departemen); }
  if (gaji_pokok !== undefined) { sets.push('gaji_pokok=?'); vals.push(gaji_pokok); }
  if (status !== undefined) { sets.push('status=?'); vals.push(status); }
  if (tanggal_masuk !== undefined) { sets.push('tanggal_masuk=?'); vals.push(tanggal_masuk); }
  if (!vals.length) return res.status(400).json({ error: 'Tidak ada perubahan' });
  vals.push(req.params.id, req.user.tenant_id);
  await db.query(`UPDATE karyawan SET ${sets.join(',')} WHERE id=? AND tenant_id=?`, vals);
  const [rows] = await db.query(`SELECT * FROM karyawan WHERE id=?`, [req.params.id]);
  res.json(rows[0]);
});

router.delete('/karyawan/:id', async (req, res) => {
  await db.query(`DELETE FROM karyawan WHERE id=? AND tenant_id=?`, [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

// Departemen options
router.get('/departemen', async (req, res) => {
  const [rows] = await db.query(`SELECT DISTINCT departemen FROM karyawan WHERE tenant_id=? AND departemen IS NOT NULL ORDER BY departemen`, [req.user.tenant_id]);
  res.json(rows.map(r => r.departemen));
});

module.exports = router;
