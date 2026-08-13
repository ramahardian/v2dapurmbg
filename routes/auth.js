const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { sign, requireAuth, logUserActivity, invalidateUserCache } = require('../middleware/auth');
const { seedBranch } = require('../services/seedBranch');

// Tenant utama (Dapur 001 / Dapur Sukaluyu) — satu-satunya yang boleh mengelola cabang.
const MAIN_TENANT_ID = parseInt(process.env.MAIN_TENANT_ID, 10) || 1;

function saveBase64Foto(base64Data) {
  if (!base64Data || !base64Data.startsWith('data:image')) return null;
  const matches = base64Data.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
  if (!matches) return null;
  return base64Data;
}

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Terlalu banyak percobaan login. Coba lagi 15 menit.' } });
const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: { error: 'Terlalu banyak pendaftaran. Coba lagi 1 jam.' } });

// Daftarkan cabang dapur baru (SaaS) — HANYA admin tenant utama (Dapur 001) yang boleh.
// Cabang baru mulai dengan data kosong (akun, menu, bahan, SDM transaksi) —
// kecuali master data yang di-seed per cabang: Referensi SP Bahan, Standar SP,
// dan master SDM (jabatan, shift, divisi, shift_divisi) yang disalin dari dapur utama.
router.post('/signup', signupLimiter, requireAuth, async (req, res) => {
  if (req.user.tenant_id !== MAIN_TENANT_ID) return res.status(403).json({ error: 'Hanya admin Dapur 001 yang boleh menambah cabang' });
  const { nama_tenant, alamat, email, password, nama } = req.body;
  if (!nama_tenant || !email || !password || !nama) return res.status(400).json({ error: 'Field wajib tidak lengkap' });
  const conn = await db.getConnection();
  try {
    const [exist] = await conn.query('SELECT id FROM users WHERE email=?', [email.toLowerCase()]);
    if (exist.length) return res.status(400).json({ error: 'Email sudah terdaftar' });
    await conn.beginTransaction();
    const [t] = await conn.query('INSERT INTO tenants (nama, alamat, saldo_awal) VALUES (?,?,0)', [nama_tenant, alamat || null]);
    const hash = await bcrypt.hash(password, 10);
    const [u] = await conn.query('INSERT INTO users (tenant_id, email, password_hash, nama, role, karyawan_id, updated_at) VALUES (?,?,?,?,?,0,NOW())',
      [t.insertId, email.toLowerCase(), hash, nama, 'admin']);
    // Salin master data gizi & SDM dari dapur utama ke cabang baru
    await seedBranch(conn, t.insertId, MAIN_TENANT_ID);
    await conn.commit();
    const user = { id: u.insertId, tenant_id: t.insertId, email: email.toLowerCase(), nama, role: 'admin' };
    res.json({ ok: true, user, tenant_id: t.insertId });
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error(e); res.status(500).json({ error: 'Gagal mendaftar' });
  } finally {
    conn.release();
  }
});

// Daftar semua cabang (admin tenant utama only)
router.get('/branches', requireAuth, async (req, res) => {
  if (req.user.tenant_id !== MAIN_TENANT_ID) return res.status(403).json({ error: 'Hanya admin Dapur 001 yang boleh melihat daftar cabang' });
  try {
    const [rows] = await db.query(
      `SELECT t.id, t.nama, t.alamat, t.telepon, t.is_active, t.created_at,
              (SELECT u.email FROM users u WHERE u.tenant_id=t.id AND u.role='admin' ORDER BY u.id LIMIT 1) AS admin_email
       FROM tenants t ORDER BY t.id`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Gagal memuat daftar cabang' });
  }
});

// Edit cabang (admin tenant utama only)
router.put('/branches/:id', requireAuth, async (req, res) => {
  if (req.user.tenant_id !== MAIN_TENANT_ID) return res.status(403).json({ error: 'Hanya admin Dapur 001 yang boleh mengubah cabang' });
  const { nama, alamat, telepon, is_active } = req.body;
  try {
    const [exist] = await db.query('SELECT id FROM tenants WHERE id=?', [req.params.id]);
    if (!exist.length) return res.status(404).json({ error: 'Cabang tidak ditemukan' });
    const set = [];
    const vals = [];
    if (typeof nama === 'string') { set.push('nama=?'); vals.push(nama); }
    if (typeof alamat === 'string') { set.push('alamat=?'); vals.push(alamat || null); }
    if (typeof telepon === 'string') { set.push('telepon=?'); vals.push(telepon || null); }
    if (typeof is_active !== 'undefined') { set.push('is_active=?'); vals.push(is_active === false || is_active === 0 ? 0 : 1); }
    if (!set.length) return res.status(400).json({ error: 'Tidak ada field untuk diubah' });
    vals.push(req.params.id);
    await db.query(`UPDATE tenants SET ${set.join(', ')} WHERE id=?`, vals);
    res.json({ ok: true, id: Number(req.params.id) });
  } catch (e) {
    res.status(500).json({ error: 'Gagal mengubah cabang' });
  }
});

// Hapus cabang berikut seluruh datanya (admin tenant utama only)
router.delete('/branches/:id', requireAuth, async (req, res) => {
  if (req.user.tenant_id !== MAIN_TENANT_ID) return res.status(403).json({ error: 'Hanya admin Dapur 001 yang boleh menghapus cabang' });
  const id = Number(req.params.id);
  if (id === MAIN_TENANT_ID) return res.status(400).json({ error: 'Cabang utama tidak boleh dihapus' });
  const conn = await db.getConnection();
  try {
    const [exist] = await conn.query('SELECT id FROM tenants WHERE id=?', [id]);
    if (!exist.length) return res.status(404).json({ error: 'Cabang tidak ditemukan' });
    await conn.beginTransaction();
    // RESTRICT constraints harus dibersihkan dulu sebelum DELETE tenants (CASCADE).
    await conn.query('DELETE FROM notifikasi WHERE tenant_id=?', [id]);
    await conn.query('DELETE FROM jurnal_detail WHERE jurnal_id IN (SELECT id FROM jurnal WHERE tenant_id=?)', [id]);
    await conn.query('DELETE FROM siklus_menu_item_bahan WHERE siklus_id IN (SELECT id FROM siklus_menu WHERE tenant_id=?)', [id]);
    await conn.query('DELETE FROM siklus_menu_template_bahan WHERE template_id IN (SELECT id FROM siklus_menu_template WHERE tenant_id=?)', [id]);
    await conn.query('DELETE FROM stok_keluar WHERE tenant_id=?', [id]);
    await conn.query('DELETE FROM stok_masuk WHERE tenant_id=?', [id]);
    // Tabel tenant_id tanpa FK CASCADE ke tenants — bersihkan eksplisit
    await conn.query('DELETE FROM pm_harian WHERE tenant_id=?', [id]);
    await conn.query('DELETE FROM karyawan WHERE tenant_id=?', [id]);
    await conn.query('DELETE FROM penerima_manfaat WHERE tenant_id=?', [id]);
    // Master data per-cabang (diseed saat signup)
    await conn.query('DELETE FROM shift_divisi WHERE tenant_id=?', [id]);
    await conn.query('DELETE FROM jabatan WHERE tenant_id=?', [id]);
    await conn.query('DELETE FROM standar_sp WHERE tenant_id=?', [id]);
    await conn.query('DELETE FROM shift WHERE tenant_id=?', [id]);
    await conn.query('DELETE FROM divisi WHERE tenant_id=?', [id]);
    await conn.query('DELETE FROM sp_referensi_bahan WHERE tenant_id=?', [id]);
    await conn.query('DELETE FROM users WHERE tenant_id=?', [id]);
    await conn.query('DELETE FROM tenants WHERE id=?', [id]);
    await conn.commit();
    res.json({ ok: true, id });
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error(e);
    res.status(500).json({ error: 'Gagal menghapus cabang' });
  } finally {
    conn.release();
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
    logUserActivity(u.tenant_id, u.id, u.nama, u.role, 'login');
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
      'SELECT id, tenant_id, email, nama, role, foto, karyawan_id FROM users WHERE email=? LIMIT 1',
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

    logUserActivity(u.tenant_id, u.id, u.nama, u.role, 'login');

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
  const [rows] = await db.query('SELECT id, tenant_id, email, nama, role, foto, karyawan_id FROM users WHERE id=?', [req.user.id]);
  const [t] = await db.query('SELECT id, nama, alamat, telepon FROM tenants WHERE id=?', [req.user.tenant_id]);
  res.json({ user: rows[0] || null, tenant: t[0] });
});

// Tambah user (admin tenant only)
router.post('/users', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Hanya admin' });
  const { email, password, nama, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const [u] = await db.query('INSERT INTO users (tenant_id, email, password_hash, nama, role, karyawan_id, updated_at) VALUES (?,?,?,?,?,0,NOW())',
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
    invalidateUserCache(req.user.id);
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
