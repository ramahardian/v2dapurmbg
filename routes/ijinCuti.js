const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /summary — statistik ringkasan
router.get('/summary', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
         COUNT(*) AS total,
         SUM(CASE WHEN status='Menunggu' THEN 1 ELSE 0 END) AS menunggu,
         SUM(CASE WHEN status='Disetujui' THEN 1 ELSE 0 END) AS disetujui,
         SUM(CASE WHEN status='Ditolak' THEN 1 ELSE 0 END) AS ditolak
       FROM ijin_cuti WHERE tenant_id=?`,
      [req.user.tenant_id]
    );
    res.json({
      total: Number(rows[0]?.total || 0),
      menunggu: Number(rows[0]?.menunggu || 0),
      disetujui: Number(rows[0]?.disetujui || 0),
      ditolak: Number(rows[0]?.ditolak || 0),
    });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET / — daftar ijin/cuti dengan filter dan pagination
router.get('/', requireRole('admin', 'keuangan'), async (req, res) => {
  const { karyawan_id, jenis, status, tanggal_awal, tanggal_akhir, page = '1', limit = '20' } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(500, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;
  
  let where = 'WHERE ic.tenant_id=?';
  const params = [req.user.tenant_id];
  
  if (karyawan_id) { where += ' AND ic.karyawan_id=?'; params.push(karyawan_id); }
  if (jenis) { where += ' AND ic.jenis=?'; params.push(jenis); }
  if (status) { where += ' AND ic.status=?'; params.push(status); }
  if (tanggal_awal) { where += ' AND ic.tanggal_mulai >= ?'; params.push(tanggal_awal); }
  if (tanggal_akhir) { where += ' AND ic.tanggal_mulai <= ?'; params.push(tanggal_akhir); }
  
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM ijin_cuti ic ${where}`, params);
  
  const [rows] = await db.query(
    `SELECT ic.id, ic.karyawan_id, ic.jenis, ic.tanggal_mulai, ic.tanggal_selesai, ic.alasan, ic.dokumen, ic.status, ic.approved_by, ic.created_at, k.nama as nama_karyawan, k.nik, j.name as jabatan_nama
     FROM ijin_cuti ic
     JOIN karyawan k ON k.id=ic.karyawan_id
     LEFT JOIN jabatan j ON j.id = k.jabatan_id
     ${where}
     ORDER BY ic.tanggal_mulai DESC, ic.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limitNum, offset]
  );
  
  res.json({
    data: rows,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum)
  });
});

// POST / — tambah baru (status default: Menunggu)
router.post('/', requireRole('admin', 'keuangan'), async (req, res) => {
  const { karyawan_id, jenis, tanggal_mulai, tanggal_selesai, alasan, dokumen } = req.body;
  if (!karyawan_id) return res.status(400).json({ error: 'Karyawan wajib dipilih' });
  if (!tanggal_mulai) return res.status(400).json({ error: 'Tanggal mulai wajib diisi' });
  if (!jenis) return res.status(400).json({ error: 'Jenis wajib dipilih' });
  
  const [r] = await db.query(
    `INSERT INTO ijin_cuti (tenant_id, karyawan_id, jenis, tanggal_mulai, tanggal_selesai, alasan, dokumen, status) VALUES (?,?,?,?,?,?,?,?)`,
    [req.user.tenant_id, karyawan_id, jenis, tanggal_mulai, tanggal_selesai || null, alasan || null, dokumen || null, 'Menunggu']
  );
  
  const [rows] = await db.query(
    `SELECT ic.id, ic.karyawan_id, ic.jenis, ic.tanggal_mulai, ic.tanggal_selesai, ic.alasan, ic.dokumen, ic.status, ic.approved_by, ic.created_at, k.nama as nama_karyawan, k.nik, j.name as jabatan_nama
     FROM ijin_cuti ic 
     JOIN karyawan k ON k.id=ic.karyawan_id 
     LEFT JOIN jabatan j ON j.id = k.jabatan_id
     WHERE ic.id=?`, 
    [r.insertId]
  );
  res.json(rows[0]);
});

// PUT /:id — update data (termasuk approve/tolak)
router.put('/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  const { jenis, tanggal_mulai, tanggal_selesai, alasan, dokumen, status } = req.body;
  const sets = []; 
  const vals = [];
  
  if (jenis !== undefined) { sets.push('jenis=?'); vals.push(jenis); }
  if (tanggal_mulai !== undefined) { sets.push('tanggal_mulai=?'); vals.push(tanggal_mulai); }
  if (tanggal_selesai !== undefined) { sets.push('tanggal_selesai=?'); vals.push(tanggal_selesai); }
  if (alasan !== undefined) { sets.push('alasan=?'); vals.push(alasan); }
  if (dokumen !== undefined) { sets.push('dokumen=?'); vals.push(dokumen); }
  if (status !== undefined) { 
    sets.push('status=?'); vals.push(status); 
    sets.push('approved_by=?'); vals.push(req.user.id);
  }
  
  if (!vals.length) return res.status(400).json({ error: 'Tidak ada perubahan' });
  vals.push(req.params.id, req.user.tenant_id);
  
  await db.query(`UPDATE ijin_cuti SET ${sets.join(',')} WHERE id=? AND tenant_id=?`, vals);
  
  const [rows] = await db.query(
    `SELECT ic.id, ic.karyawan_id, ic.jenis, ic.tanggal_mulai, ic.tanggal_selesai, ic.alasan, ic.dokumen, ic.status, ic.approved_by, ic.created_at, k.nama as nama_karyawan, k.nik, j.name as jabatan_nama
     FROM ijin_cuti ic 
     JOIN karyawan k ON k.id=ic.karyawan_id 
     LEFT JOIN jabatan j ON j.id = k.jabatan_id
     WHERE ic.id=?`, 
    [req.params.id]
  );
  res.json(rows[0]);
});

// GET /:id — ambil detail satu record
router.get('/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  const [rows] = await db.query(
    `SELECT ic.id, ic.karyawan_id, ic.jenis, ic.tanggal_mulai, ic.tanggal_selesai, ic.alasan, ic.dokumen, ic.status, ic.approved_by, ic.created_at, k.nama as nama_karyawan, k.nik, j.name as jabatan_nama
     FROM ijin_cuti ic 
     JOIN karyawan k ON k.id=ic.karyawan_id 
     LEFT JOIN jabatan j ON j.id = k.jabatan_id
     WHERE ic.id=? AND ic.tenant_id=?`,
    [req.params.id, req.user.tenant_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Data tidak ditemukan' });
  res.json(rows[0]);
});

// DELETE /:id
router.delete('/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  await db.query(`DELETE FROM ijin_cuti WHERE id=? AND tenant_id=?`, [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

module.exports = router;
