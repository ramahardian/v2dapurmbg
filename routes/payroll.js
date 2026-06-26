const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('admin', 'keuangan'));

router.get('/payroll', async (req, res) => {
  const { karyawan_id, bulan, tahun, status } = req.query;
  let sql = `SELECT p.*, k.nama as nama_karyawan, j.name as jabatan, k.departemen FROM payroll p
    JOIN karyawan k ON k.id=p.karyawan_id
    LEFT JOIN jabatan j ON j.id=k.jabatan_id WHERE p.tenant_id=?`;
  const params = [req.user.tenant_id];
  if (karyawan_id) { sql += ` AND p.karyawan_id=?`; params.push(karyawan_id); }
  if (bulan) { sql += ` AND p.bulan=?`; params.push(bulan); }
  if (tahun) { sql += ` AND p.tahun=?`; params.push(tahun); }
  if (status) { sql += ` AND p.status=?`; params.push(status); }
  sql += ` ORDER BY p.tahun DESC, p.bulan DESC, k.nama ASC`;
  const [rows] = await db.query(sql, params);
  res.json(rows);
});

router.post('/payroll', async (req, res) => {
  const { karyawan_id, bulan, tahun, gaji_pokok, tunjangan, potongan, status } = req.body;
  if (!karyawan_id) return res.status(400).json({ error: 'Karyawan wajib dipilih' });
  if (!bulan || bulan < 1 || bulan > 12) return res.status(400).json({ error: 'Bulan tidak valid (1-12)' });
  if (!tahun || tahun < 2000) return res.status(400).json({ error: 'Tahun tidak valid' });
  const total_gaji = (Number(gaji_pokok) || 0) + (Number(tunjangan) || 0) - (Number(potongan) || 0);
  const [r] = await db.query(
    `INSERT INTO payroll (tenant_id, karyawan_id, bulan, tahun, gaji_pokok, tunjangan, potongan, total_gaji, status) VALUES (?,?,?,?,?,?,?,?,?)`,
    [req.user.tenant_id, karyawan_id, bulan, tahun, gaji_pokok || 0, tunjangan || 0, potongan || 0, total_gaji, status || 'Draft']
  );
  const [rows] = await db.query(`SELECT p.*, k.nama as nama_karyawan FROM payroll p JOIN karyawan k ON k.id=p.karyawan_id WHERE p.id=?`, [r.insertId]);
  res.json(rows[0]);
});

router.put('/payroll/:id', async (req, res) => {
  const { gaji_pokok, tunjangan, potongan, total_gaji, status } = req.body;
  const sets = []; const vals = [];
  if (gaji_pokok !== undefined) { sets.push('gaji_pokok=?'); vals.push(gaji_pokok); }
  if (tunjangan !== undefined) { sets.push('tunjangan=?'); vals.push(tunjangan); }
  if (potongan !== undefined) { sets.push('potongan=?'); vals.push(potongan); }
  if (total_gaji !== undefined) { sets.push('total_gaji=?'); vals.push(total_gaji); }
  if (status !== undefined) { sets.push('status=?'); vals.push(status); }
  if (!vals.length) return res.status(400).json({ error: 'Tidak ada perubahan' });
  const finalTotal = total_gaji || ((Number(gaji_pokok)||0) + (Number(tunjangan)||0) - (Number(potongan)||0));
  if (!sets.includes('total_gaji=?')) { sets.push('total_gaji=?'); vals.push(finalTotal); }
  vals.push(req.params.id, req.user.tenant_id);
  await db.query(`UPDATE payroll SET ${sets.join(',')} WHERE id=? AND tenant_id=?`, vals);
  const [rows] = await db.query(`SELECT p.*, k.nama as nama_karyawan FROM payroll p JOIN karyawan k ON k.id=p.karyawan_id WHERE p.id=?`, [req.params.id]);
  res.json(rows[0]);
});

router.delete('/payroll/:id', async (req, res) => {
  await db.query(`DELETE FROM payroll WHERE id=? AND tenant_id=?`, [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

module.exports = router;
