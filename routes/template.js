const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Dashboard template
router.get('/dashboard', async (req, res) => {
  try {
    const [penerima] = await db.query('SELECT COUNT(*) as total_penerima_manfaat, COALESCE(SUM(paket_besar),0) as paket_besar, COALESCE(SUM(paket_kecil),0) as paket_kecil FROM penerima_manfaat WHERE tenant_id=?', [req.user.tenant_id]);
    const [produksi] = await db.query('SELECT COALESCE(SUM(jumlah_porsi), 0) as total_porsi_diproduksi FROM produksi WHERE tenant_id=?', [req.user.tenant_id]);
    const [budget] = await db.query('SELECT COALESCE(SUM(total_budget), 0) as total_budget, COALESCE(SUM(realisasi), 0) as total_realisasi FROM budget WHERE tenant_id=?', [req.user.tenant_id]);
    const [bahan] = await db.query('SELECT COUNT(*) as jumlah_bahan_baku FROM bahan_baku WHERE tenant_id=?', [req.user.tenant_id]);
    const [lowStock] = await db.query('SELECT nama, satuan, stok_minimum as min, stok_saat_ini as stok FROM bahan_baku WHERE tenant_id=? AND stok_saat_ini < stok_minimum', [req.user.tenant_id]);
    
    const summary = {
      total_penerima_manfaat: penerima[0]?.total_penerima_manfaat || 0,
      paket_besar: penerima[0]?.paket_besar || 0,
      paket_kecil: penerima[0]?.paket_kecil || 0,
      total_porsi_diproduksi: produksi[0]?.total_porsi_diproduksi || 0,
      total_budget: budget[0]?.total_budget || 0,
      total_realisasi: budget[0]?.total_realisasi || 0,
      jumlah_bahan_baku: bahan[0]?.jumlah_bahan_baku || 0,
      stok_menipis: lowStock.length,
      low_stock_items: lowStock
    };
    
    res.render('partials/dashboard', { 
      summary,
      user: req.user || { nama: 'User' },
      tenant: req.tenant || { nama: 'Dapur' }
    });
  } catch (err) {
    console.error('Dashboard template error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Menu template - disabled, using API directly
router.get('/menu', async (req, res) => {
  res.render('partials/menu', { menus: [], bahan: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1 }, search: '' });
});

// Gudang template - only admin and gudang
router.get('/gudang', requireRole('admin', 'gudang'), async (req, res) => {
  try {
    const [bahan] = await db.query('SELECT * FROM bahan_baku WHERE tenant_id=?', [req.user.tenant_id]);
    const [masuk] = await db.query('SELECT sm.*, bb.nama as nama_bahan, bb.satuan FROM stok_masuk sm JOIN bahan_baku bb ON bb.id=sm.bahan_baku_id WHERE sm.tenant_id=? ORDER BY sm.tanggal DESC', [req.user.tenant_id]);
    const [keluar] = await db.query('SELECT sk.*, bb.nama as nama_bahan, bb.satuan FROM stok_keluar sk JOIN bahan_baku bb ON bb.id=sk.bahan_baku_id WHERE sk.tenant_id=? ORDER BY sk.tanggal DESC', [req.user.tenant_id]);
    
    res.render('partials/gudang', { bahan, masuk, keluar });
  } catch (err) {
    console.error('Gudang template error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bahan Baku template
router.get('/bahan-baku', (req, res) => {
  res.render('partials/bahan_baku');
});

// Karyawan detail template
router.get('/karyawan/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT k.*, j.name as jabatan_nama,
        (SELECT COUNT(*) FROM absensi a WHERE a.karyawan_id=k.id AND a.tanggal >= DATE_SUB(NOW(), INTERVAL 30 DAY)) as absensi_30hari
      FROM karyawan k
      LEFT JOIN jabatan j ON j.id=k.jabatan_id WHERE k.id=?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    res.render('partials/karyawan_detail', {
      k: rows[0],
      getInitials: (name) => (name || '').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
    });
  } catch (err) {
    console.error('Karyawan detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

// HPP template - only admin and ahli_gizi
router.get('/hpp', requireRole('admin', 'ahli_gizi'), async (req, res) => {
  try {
    const [menus] = await db.query('SELECT id, nama FROM menu WHERE tenant_id=? ORDER BY nama', [req.user.tenant_id]);
    res.render('partials/hpp', { menus });
  } catch (err) {
    console.error('HPP template error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Laporan template
router.get('/laporan', requireRole('admin', 'keuangan', 'ahli_gizi'), (req, res) => {
  res.render('partials/laporan', {}, (err, html) => {
    if (err) {
      console.error('Laporan template error:', err);
      return res.status(500).json({ error: err.message });
    }
    res.send(html);
  });
});

// Siklus template - only admin and ahli_gizi
router.get('/siklus', requireRole('admin', 'ahli_gizi'), (req, res) => {
  res.render('partials/siklus');
});

// Karyawan template - only admin and keuangan
router.get('/karyawan', requireRole('admin', 'keuangan'), (req, res) => {
  res.render('partials/karyawan');
});

// Absensi template - only admin and keuangan
router.get('/absensi', requireRole('admin', 'keuangan'), (req, res) => {
  res.render('partials/absensi');
});

// Payroll template - only admin and keuangan
router.get('/payroll', requireRole('admin', 'keuangan'), (req, res) => {
  res.render('partials/payroll');
});

// Shift template - only admin and keuangan
router.get('/shift', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const [shifts] = await db.query('SELECT * FROM shift WHERE tenant_id=? ORDER BY departemen, jam_masuk', [req.user.tenant_id]);
    const [departemens] = await db.query('SELECT DISTINCT departemen FROM karyawan WHERE departemen IS NOT NULL ORDER BY departemen');
    const [jabatanList] = await db.query('SELECT * FROM jabatan ORDER BY name');
    res.render('partials/shift', { shifts, departemens: departemens.map(d => d.departemen), jabatanList });
  } catch (err) {
    console.error('Shift template error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Akun template
router.get('/akun', (req, res) => {
  res.render('partials/akun', { user: req.user });
});

// Kelola User template — admin only
router.get('/kelola-user', requireRole('admin'), (req, res) => {
  res.render('partials/kelola_user');
});

module.exports = router;