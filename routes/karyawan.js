const express = require('express');
const db = require('../db');
const fs = require('fs');
const path = require('path');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function saveBase64Photo(base64Data) {
  if (!base64Data || !base64Data.startsWith('data:image')) return base64Data || null;
  const matches = base64Data.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
  if (!matches) return null;
  try {
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const filepath = path.join(__dirname, '..', 'public', 'uploads', 'karyawan', filename);
    fs.writeFileSync(filepath, buffer);
    return '/uploads/karyawan/' + filename;
  } catch { return null; }
}

router.get('/karyawan', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const { status, departemen, jabatan, search, page, limit } = req.query;
    let where = ' WHERE 1=1';
    const params = [];
    if (status) { where += ' AND k.status=?'; params.push(status); }
    if (departemen) { where += ' AND k.departemen=?'; params.push(departemen); }
    if (jabatan) { where += ' AND j.name LIKE ?'; params.push(`%${jabatan}%`); }
    if (search) { where += ' AND (k.nama LIKE ? OR k.nik LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    if (page && limit) {
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;
      const [countResult] = await db.query(
        `SELECT COUNT(*) as count FROM karyawan k${where}`, params);
      const total = countResult[0].count;
      const [rows] = await db.query(
        `SELECT k.*, j.name as jabatan_nama,
           (SELECT COUNT(*) FROM absensi a WHERE a.karyawan_id=k.id AND a.tanggal >= DATE_SUB(NOW(), INTERVAL 30 DAY)) as absensi_30hari
          FROM karyawan k
          LEFT JOIN jabatan j ON j.id = k.jabatan_id
          ${where} ORDER BY k.nama ASC LIMIT ? OFFSET ?`,
        [...params, limitNum, offset]);
      return res.json({ data: rows, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } });
    }

    const sql = `SELECT k.*, j.name as jabatan_nama,
      (SELECT COUNT(*) FROM absensi a WHERE a.karyawan_id=k.id AND a.tanggal >= DATE_SUB(NOW(), INTERVAL 30 DAY)) as absensi_30hari
      FROM karyawan k
      LEFT JOIN jabatan j ON j.id = k.jabatan_id
      ${where} ORDER BY k.nama ASC`;
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Karyawan GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/karyawan', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const { nama, nik, jabatan_id, departemen, gaji_pokok, status, tanggal_masuk, email, phone, address, photo } = req.body;
    if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama karyawan wajib diisi' });
    
    const [existing] = await db.query('SELECT id FROM karyawan WHERE nama=?', [nama.trim()]);
    if (existing.length) return res.status(409).json({ error: 'Karyawan dengan nama "' + nama.trim() + '" sudah ada' });
    
    const photoUrl = saveBase64Photo(photo);
    const [r] = await db.query(
      `INSERT INTO karyawan (nama, nik, jabatan_id, departemen, gaji_pokok, status, tanggal_masuk, email, phone, address, photo) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [nama, nik || null, jabatan_id || null, departemen || null, gaji_pokok || 0, status || 'Aktif', tanggal_masuk || null, email || null, phone || null, address || null, photoUrl]
    );
    const [rows] = await db.query(`SELECT k.*, j.name as jabatan_nama FROM karyawan k LEFT JOIN jabatan j ON j.id = k.jabatan_id WHERE k.id=?`, [r.insertId]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Karyawan POST error:', err);
    res.status(500).json({ error: err.message || 'Gagal menambah karyawan' });
  }
});

router.put('/karyawan/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const { nama, nik, jabatan_id, departemen, gaji_pokok, status, tanggal_masuk, email, phone, address, photo } = req.body;
    if (nama !== undefined && (!nama || !nama.trim())) return res.status(400).json({ error: 'Nama karyawan wajib diisi' });
    
    if (nama !== undefined) {
      const [existing] = await db.query('SELECT id FROM karyawan WHERE nama=? AND id!=?', [nama.trim(), req.params.id]);
      if (existing.length) return res.status(409).json({ error: 'Karyawan dengan nama "' + nama.trim() + '" sudah ada' });
    }
    
    const sets = []; const vals = [];
    if (nama !== undefined) { sets.push('nama=?'); vals.push(nama); }
    if (nik !== undefined) { sets.push('nik=?'); vals.push(nik || null); }
    if (jabatan_id !== undefined) { sets.push('jabatan_id=?'); vals.push(jabatan_id || null); }
    if (departemen !== undefined) { sets.push('departemen=?'); vals.push(departemen || null); }
    if (gaji_pokok !== undefined) { sets.push('gaji_pokok=?'); vals.push(gaji_pokok); }
    if (status !== undefined) { sets.push('status=?'); vals.push(status); }
    if (tanggal_masuk !== undefined) { sets.push('tanggal_masuk=?'); vals.push(tanggal_masuk || null); }
    if (email !== undefined) { sets.push('email=?'); vals.push(email || null); }
    if (phone !== undefined) { sets.push('phone=?'); vals.push(phone || null); }
    if (address !== undefined) { sets.push('address=?'); vals.push(address || null); }
    if (photo !== undefined) { sets.push('photo=?'); vals.push(saveBase64Photo(photo)); }
    if (!vals.length) return res.status(400).json({ error: 'Tidak ada perubahan' });
    vals.push(req.params.id);
    await db.query(`UPDATE karyawan SET ${sets.join(',')} WHERE id=?`, vals);
    const [rows] = await db.query(`SELECT k.*, j.name as jabatan_nama FROM karyawan k LEFT JOIN jabatan j ON j.id = k.jabatan_id WHERE k.id=?`, [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Karyawan PUT error:', err);
    res.status(500).json({ error: err.message || 'Gagal menyimpan karyawan' });
  }
});

router.delete('/karyawan/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    await db.query(`DELETE FROM karyawan WHERE id=?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Karyawan DELETE error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/departemen', requireRole('admin', 'keuangan'), async (req, res) => {
  const [rows] = await db.query(`SELECT DISTINCT departemen FROM karyawan WHERE departemen IS NOT NULL ORDER BY departemen`);
  res.json(rows.map(r => r.departemen));
});

router.get('/jabatan', requireRole('admin', 'keuangan'), async (req, res) => {
  const [rows] = await db.query(`SELECT * FROM jabatan ORDER BY id`);
  res.json(rows);
});

router.post('/jabatan', requireRole('admin', 'keuangan'), async (req, res) => {
  const { name, description, shift_id } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nama jabatan wajib diisi' });
  const [r] = await db.query('INSERT INTO jabatan (name, description, shift_id) VALUES (?,?,?)', [name.trim(), description || null, shift_id || null]);
  const [rows] = await db.query('SELECT * FROM jabatan WHERE id=?', [r.insertId]);
  res.json(rows[0]);
});

router.put('/jabatan/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  const { name, description, shift_id } = req.body;
  const sets = []; const vals = [];
  if (name !== undefined) { sets.push('name=?'); vals.push(name); }
  if (description !== undefined) { sets.push('description=?'); vals.push(description); }
  if (shift_id !== undefined) { sets.push('shift_id=?'); vals.push(shift_id); }
  if (!vals.length) return res.status(400).json({ error: 'Tidak ada perubahan' });
  vals.push(req.params.id);
  await db.query(`UPDATE jabatan SET ${sets.join(',')} WHERE id=?`, vals);
  const [rows] = await db.query('SELECT * FROM jabatan WHERE id=?', [req.params.id]);
  res.json(rows[0]);
});

router.delete('/jabatan/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  await db.query('DELETE FROM jabatan WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;