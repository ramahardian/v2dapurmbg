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
    res.cookie('access_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 8 * 3600 * 1000, path: '/' });
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
    res.cookie('access_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 8 * 3600 * 1000, path: '/' });
    res.json({ user: { id: u.id, tenant_id: u.tenant_id, email: u.email, nama: u.nama, role: u.role, foto: u.foto } });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Gagal login: ' + e.message });
  }
});

/**
 * POST /auth/login-phone — Login via nomor telepon (untuk mobile app)
 *
 * Mencocokkan nomor telepon dengan data karyawan,
 * lalu login sebagai user yang email-nya cocok.
 *
 * Body: { phone: "0891234567890" }
 * Response: { token, user, karyawan }
 */
router.post('/login-phone', loginLimiter, async (req, res) => {
  try {
    let { phone } = req.body;
    console.log('🔐 [Login-Phone] ➡️ Request masuk — Phone:', phone);
    if (!phone) return res.status(400).json({ error: 'Nomor telepon wajib diisi' });

    // Normalisasi: hapus semua non-digit
    phone = phone.replace(/[^0-9]/g, '');
    console.log('🔐 [Login-Phone] 🧹 Phone setelah normalisasi:', phone);

    // Jika diawali 0, simpan dengan dan tanpa 0 untuk fleksibilitas
    const variants = [phone];
    if (phone.startsWith('0')) variants.push(phone.slice(1));
    else variants.push('0' + phone);

    console.log('🔐 [Login-Phone] 🔢 Variants yang dicari:', variants);

    if (phone.length < 10) {
      return res.status(400).json({ error: 'Nomor telepon minimal 10 angka' });
    }

    // Cari karyawan berdasarkan nomor telepon
    const placeholders = variants.map(() => 'REPLACE(REPLACE(phone, " ", ""), "-", "") = ?').join(' OR ');
    console.log('🔐 [Login-Phone] 🔍 Mencari karyawan...');
    const [karyawan] = await db.query(
      `SELECT id, nama, nik, departemen, email, phone 
       FROM karyawan 
       WHERE (${placeholders}) AND status='Aktif'
       LIMIT 1`,
      variants
    );

    console.log('🔐 [Login-Phone] 📊 Hasil query karyawan — ditemukan:', karyawan.length, 'data:', JSON.stringify(karyawan[0] || null));

    if (!karyawan.length) {
      console.log('🔐 [Login-Phone] ❌ GAGAL — Nomor telepon tidak ditemukan di tabel karyawan');
      return res.status(401).json({ error: 'Nomor telepon tidak terdaftar' });
    }

    const k = karyawan[0];
    console.log('🔐 [Login-Phone] ✅ Karyawan ditemukan — ID:', k.id, '| Nama:', k.nama, '| Email:', k.email, '| Phone:', k.phone, '| Departemen:', k.departemen);

    // Cari user yang email-nya cocok dengan email karyawan
    if (!k.email) {
      console.log('🔐 [Login-Phone] ❌ GAGAL — Karyawan tidak memiliki email! Nama:', k.nama);
      return res.status(403).json({
        error: 'Akun ini tidak memiliki email terdaftar',
        solusi: 'Hubungi admin untuk menghubungkan data karyawan dengan akun login'
      });
    }

    console.log('🔐 [Login-Phone] 🔍 Mencari user dengan email:', k.email);
    const [users] = await db.query(
      'SELECT id, tenant_id, email, nama, role, foto FROM users WHERE email=? LIMIT 1',
      [k.email]
    );

    console.log('🔐 [Login-Phone] 📊 Hasil query user — ditemukan:', users.length, 'data:', JSON.stringify(users[0] || null));

    if (!users.length) {
      console.log('🔐 [Login-Phone] ❌ GAGAL — Tidak ada user dengan email:', k.email);
      return res.status(403).json({
        error: 'Email karyawan tidak terhubung ke akun pengguna',
        solusi: 'Hubungi admin untuk menghubungkan data karyawan dengan akun login'
      });
    }

    const u = users[0];
    console.log('🔐 [Login-Phone] ✅ User ditemukan — ID:', u.id, '| Email:', u.email, '| Nama:', u.nama, '| Role:', u.role, '| tenant_id:', u.tenant_id);

    // Buat token JWT — sertakan phone dari data karyawan
    const token = sign({ ...u, phone: k.phone });
    console.log('🔐 [Login-Phone] ✅ Token JWT berhasil dibuat — uid:', u.id, '| tenant_id:', u.tenant_id, '| role:', u.role);

    // Set cookie untuk kompatibilitas web
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 3600 * 1000,
      path: '/'
    });

    console.log('🔐 [Login-Phone] ✅ Login BERHASIL — redirect ke dashboard untuk:', k.nama);

    // Response sesuai format yang diharapkan frontend
    res.json({
      token,
      user: {
        id: u.id,
        phone: k.phone || phone,
        nama: u.nama,
        role: u.role
      },
      karyawan: {
        id: k.id,
        nama: k.nama,
        nik: k.nik,
        departemen: k.departemen
      }
    });
  } catch (e) {
    console.error('🔐 [Login-Phone] 💥 ERROR —', e.message, e.stack);
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
