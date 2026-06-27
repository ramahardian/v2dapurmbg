const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { sign, requireAuth } = require('../middleware/auth');
//rama
function saveBase64Foto(base64Data) {
  if (!base64Data || !base64Data.startsWith('data:image')) return null;
  const matches = base64Data.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
  if (!matches) return null;
  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const filename = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  const dir = path.join(__dirname, '..', 'public', 'uploads', 'users');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer);
  return '/uploads/users/' + filename;
}

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Terlalu banyak percobaan' } });

// Register tenant baru (sign up SaaS)
router.post('/signup', async (req, res) => {
  const { nama_tenant, alamat, email, password, nama } = req.body;
  if (!nama_tenant || !email || !password || !nama) return res.status(400).json({ error: 'Field wajib tidak lengkap' });
  try {
    const [exist] = await db.query('SELECT id FROM users WHERE email=?', [email.toLowerCase()]);
    if (exist.length) return res.status(400).json({ error: 'Email sudah terdaftar' });
    const [t] = await db.query('INSERT INTO tenants (nama, alamat) VALUES (?,?)', [nama_tenant, alamat || null]);
    const hash = await bcrypt.hash(password, 10);
    const [u] = await db.query('INSERT INTO users (tenant_id, email, password_hash, nama, role) VALUES (?,?,?,?,?)',
      [t.insertId, email.toLowerCase(), hash, nama, 'admin']);
    const user = { id: u.insertId, tenant_id: t.insertId, email: email.toLowerCase(), nama, role: 'admin' };
    const token = sign(user);
    res.cookie('access_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 3600 * 1000 });
    res.json({ user, tenant_id: t.insertId });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'Gagal mendaftar' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email & password wajib' });
    const [rows] = await db.query('SELECT * FROM users WHERE email=?', [email.toLowerCase()]);
    if (!rows.length) return res.status(401).json({ error: 'Email atau password salah' });
    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Email atau password salah' });
    const token = sign(u);
    res.cookie('access_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 3600 * 1000 });
    res.json({ user: { id: u.id, tenant_id: u.tenant_id, email: u.email, nama: u.nama, role: u.role, foto: u.foto } });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Gagal login: ' + e.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('access_token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const [rows] = await db.query('SELECT id, tenant_id, email, nama, role, foto FROM users WHERE id=?', [req.user.id]);
  const [t] = await db.query('SELECT id, nama FROM tenants WHERE id=?', [req.user.tenant_id]);
  res.json({ user: rows[0] || null, tenant: t[0] });
});

// Tambah user (admin tenant only)
router.post('/users', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Hanya admin' });
  const { email, password, nama, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const [u] = await db.query('INSERT INTO users (tenant_id, email, password_hash, nama, role) VALUES (?,?,?,?,?)',
      [req.user.tenant_id, email.toLowerCase(), hash, nama, role || 'produksi']);
    res.json({ id: u.insertId, email, nama, role });
  } catch (e) {
    res.status(400).json({ error: e.code === 'ER_DUP_ENTRY' ? 'Email sudah ada' : 'Gagal' });
  }
});

// Update profil user saat ini
router.put('/profile', requireAuth, async (req, res) => {
  const { nama, email, foto } = req.body;
  try {
    if (email && email !== req.user.email) {
      const [exist] = await db.query('SELECT id FROM users WHERE email=? AND id!=?', [email.toLowerCase(), req.user.id]);
      if (exist.length) return res.status(400).json({ error: 'Email sudah digunakan' });
    }
    const sets = ['nama=?', 'email=?'];
    const vals = [nama || req.user.nama, (email || req.user.email).toLowerCase()];
    let fotoUrl;
    if (foto === 'hapus') {
      sets.push('foto=NULL');
    } else {
      fotoUrl = foto ? saveBase64Foto(foto) : undefined;
      if (fotoUrl) { sets.push('foto=?'); vals.push(fotoUrl); }
    }
    vals.push(req.user.id, req.user.tenant_id);
    await db.query(`UPDATE users SET ${sets.join(',')} WHERE id=? AND tenant_id=?`, vals);
    const updated = { ...req.user, nama: nama || req.user.nama, email: (email || req.user.email).toLowerCase() };
    if (foto === 'hapus') updated.foto = null;
    else if (fotoUrl) updated.foto = fotoUrl;
    res.json({ ok: true, user: updated });
  } catch (e) {
    res.status(500).json({ error: 'Gagal update profil' });
  }
});

// Ganti password
router.put('/password', requireAuth, async (req, res) => {
  const { password_lama, password_baru } = req.body;
  if (!password_lama || !password_baru) return res.status(400).json({ error: 'Password lama & baru wajib' });
  if (password_baru.length < 6) return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
  try {
    const [rows] = await db.query('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
    const ok = await bcrypt.compare(password_lama, rows[0].password_hash);
    if (!ok) return res.status(400).json({ error: 'Password lama salah' });
    const hash = await bcrypt.hash(password_baru, 10);
    await db.query('UPDATE users SET password_hash=? WHERE id=?', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Gagal ganti password' });
  }
});

module.exports = router;
