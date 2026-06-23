const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { sign, requireAuth } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Terlalu banyak percobaan' } });

// Register tenant baru (sign up SaaS)
router.post('/signup', async (req, res) => {
  const { nama_tenant, alamat, email, password, nama } = req.body;
  if (!nama_tenant || !email || !password || !nama) return res.status(400).json({ error: 'Field wajib tidak lengkap' });
  try {
    const [exist] = await db.query('SELECT id FROM users WHERE email=?', [email.toLowerCase()]);
    if (exist.length) return res.status(400).json({ error: 'Email sudah terdaftar' });
    const [t] = await db.query('INSERT INTO tenants (nama, alamat, plan) VALUES (?,?,?)', [nama_tenant, alamat || null, 'free']);
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
    res.json({ user: { id: u.id, tenant_id: u.tenant_id, email: u.email, nama: u.nama, role: u.role } });
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
  const [t] = await db.query('SELECT id, nama, plan FROM tenants WHERE id=?', [req.user.tenant_id]);
  res.json({ user: req.user, tenant: t[0] });
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

module.exports = router;
