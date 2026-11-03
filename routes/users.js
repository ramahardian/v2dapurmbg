const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { requireAuth, requireRole, invalidateUserCache } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /users — daftar semua user dalam satu tenant
router.get('/users', requireRole('admin'), async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.email, u.nama, u.role, u.foto, u.karyawan_id, u.created_at, k.nama as karyawan_nama 
       FROM users u LEFT JOIN karyawan k ON k.id = u.karyawan_id 
       WHERE u.tenant_id=? ORDER BY u.id ASC`,
      [req.user.tenant_id]
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /users error:', e);
    res.status(500).json({ error: 'Gagal memuat data user' });
  }
});

// POST /users — tambah user baru
router.post('/users', requireRole('admin'), async (req, res) => {
  const { email, password, nama, role, karyawan_id } = req.body;
  if (!email || !password || !nama) return res.status(400).json({ error: 'Email, password, dan nama wajib' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const [u] = await db.query(
      'INSERT INTO users (tenant_id, email, password_hash, nama, role, karyawan_id) VALUES (?,?,?,?,?,?)',
      [req.user.tenant_id, email.toLowerCase(), hash, nama, role || 'produksi', karyawan_id || null]
    );
    res.json({ id: u.insertId, email: email.toLowerCase(), nama, role: role || 'produksi', karyawan_id: karyawan_id || null });
  } catch (e) {
    console.error('Gagal menyimpan user:', e);
    res.status(400).json({ error: e.code === 'ER_DUP_ENTRY' ? 'Email sudah ada' : 'Gagal menyimpan user' });
  }
});

// PUT /users/:id — update user
router.put('/users/:id', requireRole('admin'), async (req, res) => {
  const { email, password, nama, role, karyawan_id } = req.body;
  try {
    if (email) {
      const [exist] = await db.query('SELECT id FROM users WHERE email=? AND id!=? AND tenant_id=?', [email.toLowerCase(), req.params.id, req.user.tenant_id]);
      if (exist.length) return res.status(400).json({ error: 'Email sudah digunakan' });
    }
    const sets = [];
    const vals = [];
    if (nama !== undefined) { sets.push('nama=?'); vals.push(nama); }
    if (email !== undefined) { sets.push('email=?'); vals.push(email.toLowerCase()); }
    if (role !== undefined) { sets.push('role=?'); vals.push(role); }
    if (karyawan_id !== undefined) { sets.push('karyawan_id=?'); vals.push(karyawan_id || null); }
    if (password) { sets.push('password_hash=?'); vals.push(await bcrypt.hash(password, 10)); }
    if (!sets.length) return res.status(400).json({ error: 'Tidak ada data diupdate' });
    vals.push(req.params.id, req.user.tenant_id);
    await db.query(`UPDATE users SET ${sets.join(',')} WHERE id=? AND tenant_id=?`, vals);
    invalidateUserCache(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Gagal update user' });
  }
});

// DELETE /users/:id — hapus user (cegah hapus diri sendiri)
router.delete('/users/:id', requireRole('admin'), async (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri' });
    await db.query('DELETE FROM users WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /users error:', e);
    res.status(500).json({ error: 'Gagal hapus user' });
  }
});

module.exports = router;