const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ===== SHIFT MASTER =====

// GET /shift — all shifts for tenant
router.get('/shift', requireRole('admin', 'keuangan'), async (req, res) => {
  const [rows] = await db.query(`SELECT * FROM shift WHERE tenant_id=? ORDER BY jam_masuk ASC`, [req.user.tenant_id]);
  res.json(rows);
});

// POST /shift
router.post('/shift', requireRole('admin', 'keuangan'), async (req, res) => {
  const { nama, jam_masuk, jam_keluar, warna } = req.body;
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama shift wajib diisi' });
  if (!jam_masuk || !jam_keluar) return res.status(400).json({ error: 'Jam masuk dan jam keluar wajib diisi' });
  const [r] = await db.query(
    `INSERT INTO shift (tenant_id, nama, jam_masuk, jam_keluar, warna) VALUES (?,?,?,?,?)`,
    [req.user.tenant_id, nama.trim(), jam_masuk, jam_keluar, warna || '#3B82F6']
  );
  const [rows] = await db.query(`SELECT * FROM shift WHERE id=?`, [r.insertId]);
  res.json(rows[0]);
});

// PUT /shift/:id
router.put('/shift/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  const { nama, jam_masuk, jam_keluar, warna, is_active } = req.body;
  const sets = []; const vals = [];
  if (nama !== undefined) { sets.push('nama=?'); vals.push(nama); }
  if (jam_masuk !== undefined) { sets.push('jam_masuk=?'); vals.push(jam_masuk); }
  if (jam_keluar !== undefined) { sets.push('jam_keluar=?'); vals.push(jam_keluar); }
  if (warna !== undefined) { sets.push('warna=?'); vals.push(warna); }
  if (is_active !== undefined) { sets.push('is_active=?'); vals.push(is_active); }
  if (!vals.length) return res.status(400).json({ error: 'Tidak ada perubahan' });
  vals.push(req.params.id, req.user.tenant_id);
  await db.query(`UPDATE shift SET ${sets.join(',')} WHERE id=? AND tenant_id=?`, vals);
  const [rows] = await db.query(`SELECT * FROM shift WHERE id=?`, [req.params.id]);
  res.json(rows[0]);
});

// DELETE /shift/:id
router.delete('/shift/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  await db.query(`DELETE FROM shift WHERE id=? AND tenant_id=?`, [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

// ===== JADWAL KARYAWAN =====

// GET /jadwal — schedule assignments, optional filter by karyawan_id or tanggal
router.get('/jadwal', requireRole('admin', 'keuangan'), async (req, res) => {
  const { karyawan_id, tanggal } = req.query;
  let sql = `SELECT jk.*, s.nama as shift_nama,
    s.jam_masuk, s.jam_keluar, s.warna, k.nama as nama_karyawan, j.name as jabatan
    FROM jadwal_karyawan jk
    JOIN shift s ON s.id=jk.shift_id
    JOIN karyawan k ON k.id=jk.karyawan_id
    LEFT JOIN jabatan j ON j.id=k.jabatan_id
    WHERE jk.tenant_id=?`;
  const params = [req.user.tenant_id];
  if (karyawan_id) { sql += ` AND jk.karyawan_id=?`; params.push(karyawan_id); }
  if (tanggal) { sql += ` AND jk.tanggal_mulai <= ? AND (jk.tanggal_selesai IS NULL OR jk.tanggal_selesai >= ?)`; params.push(tanggal, tanggal); }
  sql += ` ORDER BY jk.tanggal_mulai DESC, k.nama ASC`;
  const [rows] = await db.query(sql, params);
  res.json(rows);
});

// GET /jadwal/:id
router.get('/jadwal/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  const [rows] = await db.query(
    `SELECT jk.*, s.nama as shift_nama, s.jam_masuk, s.jam_keluar, s.warna, k.nama as nama_karyawan
     FROM jadwal_karyawan jk
     JOIN shift s ON s.id=jk.shift_id
     JOIN karyawan k ON k.id=jk.karyawan_id
     WHERE jk.id=? AND jk.tenant_id=?`,
    [req.params.id, req.user.tenant_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Jadwal tidak ditemukan' });
  res.json(rows[0]);
});

// POST /jadwal
router.post('/jadwal', requireRole('admin', 'keuangan'), async (req, res) => {
  const { karyawan_id, shift_id, tanggal_mulai, tanggal_selesai, hari_kerja } = req.body;
  if (!karyawan_id) return res.status(400).json({ error: 'Karyawan wajib dipilih' });
  if (!shift_id) return res.status(400).json({ error: 'Shift wajib dipilih' });
  if (!tanggal_mulai) return res.status(400).json({ error: 'Tanggal mulai wajib diisi' });
  
  const [r] = await db.query(
    `INSERT INTO jadwal_karyawan (tenant_id, karyawan_id, shift_id, tanggal_mulai, tanggal_selesai, hari_kerja) VALUES (?,?,?,?,?,?)`,
    [req.user.tenant_id, karyawan_id, shift_id, tanggal_mulai, tanggal_selesai || null, hari_kerja || '1,2,3,4,5,6,7']
  );
  const [rows] = await db.query(`SELECT jk.*, s.nama as shift_nama, s.jam_masuk, s.jam_keluar, s.warna, k.nama as nama_karyawan
    FROM jadwal_karyawan jk JOIN shift s ON s.id=jk.shift_id JOIN karyawan k ON k.id=jk.karyawan_id WHERE jk.id=?`, [r.insertId]);
  res.json(rows[0]);
});

// PUT /jadwal/:id
router.put('/jadwal/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  const { karyawan_id, shift_id, tanggal_mulai, tanggal_selesai, hari_kerja } = req.body;
  const sets = []; const vals = [];
  if (karyawan_id !== undefined) { sets.push('karyawan_id=?'); vals.push(karyawan_id); }
  if (shift_id !== undefined) { sets.push('shift_id=?'); vals.push(shift_id); }
  if (tanggal_mulai !== undefined) { sets.push('tanggal_mulai=?'); vals.push(tanggal_mulai); }
  if (tanggal_selesai !== undefined) { sets.push('tanggal_selesai=?'); vals.push(tanggal_selesai); }
  if (hari_kerja !== undefined) { sets.push('hari_kerja=?'); vals.push(hari_kerja); }
  if (!vals.length) return res.status(400).json({ error: 'Tidak ada perubahan' });
  vals.push(req.params.id, req.user.tenant_id);
  await db.query(`UPDATE jadwal_karyawan SET ${sets.join(',')} WHERE id=? AND tenant_id=?`, vals);
  const [rows] = await db.query(`SELECT jk.*, s.nama as shift_nama, s.jam_masuk, s.jam_keluar, s.warna, k.nama as nama_karyawan
    FROM jadwal_karyawan jk JOIN shift s ON s.id=jk.shift_id JOIN karyawan k ON k.id=jk.karyawan_id WHERE jk.id=?`, [req.params.id]);
  res.json(rows[0]);
});

// DELETE /jadwal/:id
router.delete('/jadwal/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  await db.query(`DELETE FROM jadwal_karyawan WHERE id=? AND tenant_id=?`, [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

// ===== SHIFT DIVISI (many-to-many) =====

// GET /shift/:id/divisi — divisi assigned to a shift
router.get('/shift/:id/divisi', requireRole('admin', 'keuangan'), async (req, res) => {
  const [rows] = await db.query(
    `SELECT d.* FROM shift_divisi sd
     JOIN divisi d ON d.id=sd.divisi_id
     WHERE sd.shift_id=? AND sd.tenant_id=?`,
    [req.params.id, req.user.tenant_id]
  );
  res.json(rows);
});

// POST /shift/:id/divisi — assign a divisi to a shift
router.post('/shift/:id/divisi', requireRole('admin', 'keuangan'), async (req, res) => {
  const { divisi_id } = req.body;
  if (!divisi_id) return res.status(400).json({ error: 'Divisi wajib dipilih' });
  try {
    await db.query(
      `INSERT INTO shift_divisi (shift_id, divisi_id, tenant_id) VALUES (?,?,?)`,
      [req.params.id, divisi_id, req.user.tenant_id]
    );
    const [rows] = await db.query(`SELECT * FROM divisi WHERE id=?`, [divisi_id]);
    res.json(rows[0]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Divisi sudah terdaftar di shift ini' });
    throw e;
  }
});

// DELETE /shift/:id/divisi/:divisi_id — remove assignment
router.delete('/shift/:id/divisi/:divisi_id', requireRole('admin', 'keuangan'), async (req, res) => {
  await db.query(
    `DELETE FROM shift_divisi WHERE shift_id=? AND divisi_id=? AND tenant_id=?`,
    [req.params.id, req.params.divisi_id, req.user.tenant_id]
  );
  res.json({ ok: true });
});

// PUT /shift/:id/divisi — replace all divisi assignments at once
router.put('/shift/:id/divisi', requireRole('admin', 'keuangan'), async (req, res) => {
  const { divisi_ids } = req.body;
  if (!Array.isArray(divisi_ids)) return res.status(400).json({ error: 'divisi_ids harus array' });
  const tenant_id = req.user.tenant_id;
  const shift_id = req.params.id;
  await db.query(`DELETE FROM shift_divisi WHERE shift_id=? AND tenant_id=?`, [shift_id, tenant_id]);
  for (const did of divisi_ids) {
    await db.query(`INSERT IGNORE INTO shift_divisi (shift_id, divisi_id, tenant_id) VALUES (?,?,?)`, [shift_id, did, tenant_id]);
  }
  res.json({ ok: true });
});

module.exports = router;
