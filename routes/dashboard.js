const express = require('express');
const db = require('../db');
// Mengimpor middleware autentikasi untuk memvalidasi user dan mendapatkan identitas tenant
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Terapkan middleware requireAuth agar seluruh data dashboard aman dan terisolasi per tenant
router.use(requireAuth);

/**
 * GET /dashboard/summary
 * Mengambil rangkuman data (agregasi) untuk ditampilkan di halaman utama Dashboard (Widget/Card).
 * Data mencakup statistik penerima manfaat, produksi, penyerapan anggaran, dan peringatan stok.
 */
router.get('/dashboard/summary', async (req, res) => {
  const t = req.user.tenant_id;
  
  // 1. Agregasi Penerima Manfaat
  const [[pm]] = await db.query(
    'SELECT COUNT(*) AS total, COALESCE(SUM(paket_besar),0) AS paket_besar, COALESCE(SUM(paket_kecil),0) AS paket_kecil FROM penerima_manfaat WHERE tenant_id=?', 
    [t]
  );
  
  // 2. Agregasi Produksi
  // Menghitung total porsi yang sudah direncanakan/diproduksi sejauh ini.
  const [[pr]] = await db.query(
    'SELECT COALESCE(SUM(jumlah_porsi),0) AS total FROM produksi WHERE tenant_id=?', 
    [t]
  );
  
  // 3. Agregasi Anggaran (Budgeting)
  // Mengambil total pagu anggaran (tb) dan total realisasi pengeluaran (tr) untuk melihat penyerapan dana.
  const [[bd]] = await db.query(
    'SELECT COALESCE(SUM(total_budget),0) AS tb, COALESCE(SUM(realisasi),0) AS tr FROM budget WHERE tenant_id=?', 
    [t]
  );
  
  // 4. Pengecekan Persediaan (Gudang)
  // Gunakan aggregate query di database, bukan filter di Node.js
  const [[countBahan]] = await db.query('SELECT COUNT(*) AS total FROM bahan_baku WHERE tenant_id=?', [t]);
  const [low] = await db.query(
    'SELECT nama, stok_saat_ini AS stok, stok_minimum AS `min`, satuan FROM bahan_baku WHERE tenant_id=? AND stok_saat_ini < stok_minimum LIMIT 5', 
    [t]
  );
  const [[stk]] = await db.query(
    'SELECT COUNT(*) AS count FROM bahan_baku WHERE tenant_id=? AND stok_saat_ini < stok_minimum', 
    [t]
  );
  
  // 5. Susun dan kirimkan respons JSON
  res.json({
    total_penerima_manfaat: Number(pm.total),
    paket_besar: Number(pm.paket_besar),
    paket_kecil: Number(pm.paket_kecil),
    total_porsi_diproduksi: Number(pr.total),
    
    // Status Anggaran
    total_budget: Number(bd.tb),
    total_realisasi: Number(bd.tr),
    selisih_budget: Number(bd.tb) - Number(bd.tr),
    
    // Status Gudang
    jumlah_bahan_baku: Number(countBahan.total),
    stok_menipis: Number(stk.count),
    
    // Ambil maksimal 5 item yang stoknya menipis
    low_stock_items: low.map(b => ({ 
      nama: b.nama, 
      stok: b.stok, 
      min: b.min, 
      satuan: b.satuan 
    })),
  });
});

/**
 * GET /dashboard/finance
 * Dashboard keuangan: saldo kas, pendapatan & biaya bulan ini, transaksi terbaru
 */
router.get('/dashboard/finance', async (req, res) => {
  const t = req.user.tenant_id;
  const now = new Date();
  const bulan = now.getMonth() + 1;
  const tahun = now.getFullYear();
  const prevBulan = bulan === 1 ? 12 : bulan - 1;
  const prevTahun = bulan === 1 ? tahun - 1 : tahun;

  // 1. Saldo kas saat ini: total masuk - total keluar
  const [[saldo]] = await db.query(
    `SELECT COALESCE(SUM(CASE WHEN tipe='masuk' THEN jumlah ELSE 0 END),0) -
            COALESCE(SUM(CASE WHEN tipe='keluar' THEN jumlah ELSE 0 END),0) AS saldo
     FROM kas_bank WHERE tenant_id=?`,
    [t]
  );

  // 2. Pendapatan bulan ini (kas masuk)
  const [[pendapatan]] = await db.query(
    `SELECT COALESCE(SUM(jumlah),0) AS total
     FROM kas_bank WHERE tenant_id=? AND tipe='masuk' AND MONTH(tanggal)=? AND YEAR(tanggal)=?`,
    [t, bulan, tahun]
  );

  // 3. Biaya bulan ini (kas keluar)
  const [[biaya]] = await db.query(
    `SELECT COALESCE(SUM(jumlah),0) AS total
     FROM kas_bank WHERE tenant_id=? AND tipe='keluar' AND MONTH(tanggal)=? AND YEAR(tanggal)=?`,
    [t, bulan, tahun]
  );

  // 4. Pendapatan bulan lalu (untuk perbandingan)
  const [[pendapatanPrev]] = await db.query(
    `SELECT COALESCE(SUM(jumlah),0) AS total
     FROM kas_bank WHERE tenant_id=? AND tipe='masuk' AND MONTH(tanggal)=? AND YEAR(tanggal)=?`,
    [t, prevBulan, prevTahun]
  );
  
  // 5. Biaya bulan lalu
  const [[biayaPrev]] = await db.query(
    `SELECT COALESCE(SUM(jumlah),0) AS total
     FROM kas_bank WHERE tenant_id=? AND tipe='keluar' AND MONTH(tanggal)=? AND YEAR(tanggal)=?`,
    [t, prevBulan, prevTahun]
  );

  // 6. Transaksi terbaru (10 terakhir)
  const [transaksi] = await db.query(
    `SELECT id, tanggal, tipe, kategori, deskripsi, jumlah
     FROM kas_bank WHERE tenant_id=? ORDER BY tanggal DESC, id DESC LIMIT 10`,
    [t]
  );

  // 7. Low stock count
  const [[stk]] = await db.query(
    'SELECT COUNT(*) AS count FROM bahan_baku WHERE tenant_id=? AND stok_saat_ini < stok_minimum',
    [t]
  );

  const pendapatanBulanIni = Number(pendapatan.total);
  const biayaBulanIni = Number(biaya.total);
  const labaRugi = pendapatanBulanIni - biayaBulanIni;
  const pendapatanBulanLalu = Number(pendapatanPrev.total);
  const biayaBulanLalu = Number(biayaPrev.total);

  // Growth % (hindari division by zero)
  const pendapatanGrowth = pendapatanBulanLalu > 0 ? ((pendapatanBulanIni - pendapatanBulanLalu) / pendapatanBulanLalu * 100).toFixed(1) : null;
  const biayaGrowth = biayaBulanLalu > 0 ? ((biayaBulanIni - biayaBulanLalu) / biayaBulanLalu * 100).toFixed(1) : null;

  res.json({
    saldo_kas: Number(saldo.saldo),
    pendapatan_bulan_ini: pendapatanBulanIni,
    biaya_bulan_ini: biayaBulanIni,
    laba_rugi: labaRugi,
    margin: pendapatanBulanIni > 0 ? (labaRugi / pendapatanBulanIni * 100).toFixed(1) : 0,
    pendapatan_bulan_lalu: pendapatanBulanLalu,
    biaya_bulan_lalu: biayaBulanLalu,
    pendapatan_growth: pendapatanGrowth,
    biaya_growth: biayaGrowth,
    stok_menipis: Number(stk.count),
    transaksi_terbaru: transaksi.map(t => ({
      id: t.id,
      tanggal: t.tanggal,
      tipe: t.tipe,
      kategori: t.kategori,
      deskripsi: t.deskripsi,
      jumlah: t.jumlah
    })),
    bulan: bulan,
    tahun: tahun
  });
});

/**
 * GET /dashboard/low-stock
 * Endpoint khusus untuk notifikasi stok menipis (ringan, cepat)
 */
router.get('/dashboard/low-stock', async (req, res) => {
  const t = req.user.tenant_id;
  const [items] = await db.query(
    `SELECT id, nama, satuan, stok_saat_ini AS stok, stok_minimum AS min
     FROM bahan_baku WHERE tenant_id=? AND stok_saat_ini < stok_minimum
     ORDER BY (stok_minimum - stok_saat_ini) DESC LIMIT 20`,
    [t]
  );
  const [[{ count }]] = await db.query(
    'SELECT COUNT(*) AS count FROM bahan_baku WHERE tenant_id=? AND stok_saat_ini < stok_minimum',
    [t]
  );
  res.json({ count, items });
});

/**
 * GET /dashboard/siklus-notif
 * Notifikasi siklus menu yang belum terisi penuh (coverage < 100%)
 */
router.get('/dashboard/siklus-notif', async (req, res) => {
  const t = req.user.tenant_id;
  const [rows] = await db.query(
    `SELECT s.id, s.nama, s.kategori_penerima, s.total_hari, s.status,
            COUNT(si.id) as item_count,
            SUM(CASE WHEN si.menu_id IS NOT NULL THEN 1 ELSE 0 END) as with_menu
     FROM siklus_menu s
     LEFT JOIN siklus_menu_item si ON si.siklus_id = s.id
     WHERE s.tenant_id = ?
     GROUP BY s.id`,
    [t]
  );

  // Batch check which items have grid bahan
  const siklusIds = rows.map(r => r.id);
  const filledBySiklus = {};
  if (siklusIds.length) {
    const ph = siklusIds.map(() => '?').join(',');
    const [bahanDays] = await db.query(
      `SELECT DISTINCT sb.siklus_id, sb.hari_ke
       FROM siklus_menu_item_bahan sb
       WHERE sb.siklus_id IN (${ph})`,
      siklusIds
    );
    for (const b of bahanDays) {
      if (!filledBySiklus[b.siklus_id]) filledBySiklus[b.siklus_id] = new Set();
      filledBySiklus[b.siklus_id].add(b.hari_ke);
    }
  }

  const notifItems = [];
  for (const r of rows) {
    const menuFilled = Number(r.with_menu) || 0;
    const manualDays = filledBySiklus[r.id] ? filledBySiklus[r.id].size : 0;
    const totalFilled = Math.max(menuFilled, manualDays);
    const coverage = r.total_hari > 0 ? Math.round((totalFilled / r.total_hari) * 100) : 0;

    if (coverage < 100) {
      notifItems.push({
        id: r.id,
        nama: r.nama,
        kategori_penerima: r.kategori_penerima,
        total_hari: Number(r.total_hari),
        filled: totalFilled,
        kosong: Number(r.total_hari) - totalFilled,
        coverage,
        status: r.status,
      });
    }
  }

  notifItems.sort((a, b) => a.coverage - b.coverage);
  res.json({ count: notifItems.length, items: notifItems.slice(0, 20) });
});

/**
 * GET /dashboard/online-users
 * Mendapatkan daftar user yang online (aktivitas < 5 menit lalu)
 */
router.get('/dashboard/online-users', async (req, res) => {
  const t = req.user.tenant_id;
  // Tandai user yang sedang request sebagai aktif SEBELUM query, agar dirinya sendiri
  // langsung muncul di daftar online (tanpa menunggu auto-refresh 30 detik).
  await db.query('UPDATE users SET last_activity = NOW() WHERE id = ?', [req.user.id]);
  const [users] = await db.query(
    `SELECT id, nama, email, role, foto, last_activity,
            TIMESTAMPDIFF(SECOND, last_activity, NOW()) as seconds_ago
     FROM users 
     WHERE tenant_id = ? AND last_activity IS NOT NULL 
       AND TIMESTAMPDIFF(SECOND, last_activity, NOW()) <= 300
     ORDER BY last_activity DESC`,
    [t]
  );
  
  const onlineUsers = users.map(u => ({
    id: u.id,
    nama: u.nama,
    email: u.email,
    role: u.role,
    foto: u.foto,
    last_activity: u.last_activity,
    seconds_ago: u.seconds_ago,
    is_online: u.seconds_ago <= 300
  }));

  res.json({ 
    count: onlineUsers.length, 
    users: onlineUsers 
  });
});

module.exports = router;

