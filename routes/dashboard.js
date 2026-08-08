const express = require('express');
const db = require('../db');
// Mengimpor middleware autentikasi untuk memvalidasi user dan mendapatkan identitas tenant
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Deteksi kolom login_count (migrasi user_activity_log) — dicek sekali lalu di-cache.
let hasLoginCountCol = null;
async function loginCountExpr() {
  if (hasLoginCountCol === null) {
    try {
      const [[c]] = await db.query(
        "SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_activity_log' AND COLUMN_NAME = 'login_count'"
      );
      hasLoginCountCol = !!c.n;
    } catch (e) {
      hasLoginCountCol = false;
    }
  }
  return hasLoginCountCol ? 'al.login_count' : 'al.event = ?';
}

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
  // Auto-arsip dulu agar siklus yang sudah lewat rentang waktu tidak tampil di notifikasi.
  const { autoArchiveSiklus } = require('./siklus/helpers');
  await autoArchiveSiklus();
  const [rows] = await db.query(
    `SELECT s.id, s.nama, s.kategori_penerima, s.total_hari, s.status,
            COUNT(si.id) as item_count,
            SUM(CASE WHEN si.menu_id IS NOT NULL THEN 1 ELSE 0 END) as with_menu
     FROM siklus_menu s
     LEFT JOIN siklus_menu_item si ON si.siklus_id = s.id
     WHERE s.tenant_id = ? AND s.status <> 'Arsip'
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

  let notifItems = [];
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

  // Notif khusus: menu aktif HARI INI belum diisi (prioritas pertama).
  const [siklusAktif] = await db.query(
    `SELECT id, nama, kategori_penerima, total_hari, status, tanggal_mulai
     FROM siklus_menu WHERE tenant_id=? AND status='Aktif' ORDER BY tanggal_mulai DESC`,
    [t]
  );
  const todayKey = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const todayUtc = todayKey(new Date());
  let sAktif = null;
  let hariKe = 1;
  for (const sc of siklusAktif) {
    if (!sc.tanggal_mulai) continue;
    const totalHari = Math.max(1, Number(sc.total_hari || 7));
    const diff = Math.floor((todayUtc - todayKey(new Date(sc.tanggal_mulai))) / 86400000);
    if (diff >= 0 && diff < totalHari) { sAktif = sc; hariKe = diff + 1; break; }
  }
  if (!sAktif) {
    for (const sc of siklusAktif) {
      if (!sc.tanggal_mulai) continue;
      if (todayUtc - todayKey(new Date(sc.tanggal_mulai)) < 0) { sAktif = sc; hariKe = 1; break; }
    }
  }
  if (sAktif) {
    const [dayItems] = await db.query(
      `SELECT si.id, si.menu_id,
              (SELECT COUNT(*) FROM siklus_menu_item_bahan sb WHERE sb.siklus_id=si.siklus_id AND sb.hari_ke=si.hari_ke) AS bahan_count
       FROM siklus_menu_item si WHERE si.siklus_id=? AND si.hari_ke=? LIMIT 1`,
      [sAktif.id, hariKe]
    );
    const terisi = dayItems.length && (dayItems[0].menu_id || Number(dayItems[0].bahan_count) > 0);
    if (!terisi) {
      notifItems.push({
        id: 'hari_ini',
        siklus_id: sAktif.id,
        tipe: 'hari_ini',
        nama: sAktif.nama,
        kategori_penerima: sAktif.kategori_penerima,
        total_hari: Math.max(1, Number(sAktif.total_hari || 7)),
        filled: 0,
        kosong: 1,
        coverage: 0,
        status: sAktif.status,
        hari_ke: hariKe,
      });
      notifItems = notifItems.filter(it => String(it.id) !== String(sAktif.id));
    }
  }

  notifItems.sort((a, b) => {
    if (a.tipe === 'hari_ini') return -1;
    if (b.tipe === 'hari_ini') return 1;
    return a.coverage - b.coverage;
  });
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
     WHERE tenant_id = ? 
       AND last_activity IS NOT NULL 
       AND TIMESTAMPDIFF(SECOND, last_activity, NOW()) <= 600
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
    is_online: u.seconds_ago <= 600
  }));

  res.json({ 
    count: onlineUsers.length, 
    users: onlineUsers 
  });
});

/**
 * GET /dashboard/online-history
 * Riwayat aktivitas user online (login + heartbeat) untuk modal Riwayat di kartu User Online.
 * Query: ?days=7 (default, maks 90) & user_id (opsional, filter per user)
 */
router.get('/dashboard/online-history', async (req, res) => {
  const t = req.user.tenant_id;
  const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 7));
  const uid = req.query.user_id ? parseInt(req.query.user_id, 10) : null;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  let where = 'WHERE al.tenant_id = ? AND al.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)';
  const params = [t, days];
  if (uid) { where += ' AND al.user_id = ?'; params.push(uid); }

  try {
    const lcExpr = await loginCountExpr();
    const loginParams = hasLoginCountCol ? params : [...params, 'login'];
    const [[range]] = await db.query(
      `SELECT MIN(DATE(al.created_at)) AS awal, MAX(DATE(al.created_at)) AS akhir, COUNT(*) AS total,
              COALESCE(SUM(${lcExpr}), 0) AS logins
       FROM user_activity_log al ${where}`,
      loginParams
    );

    // Ringkasan per user: logins dijumlahkan & waktu diambil yang terbaru.
    // (user_activity_log kini menyimpan baris per kejadian login/heartbeat,
    //  bukan 1 baris per user, jadi dipakai GROUP BY + agregasi.)
    // Nama/role pakai nilai SAAT INI dari tabel users (u2) — bukan MAX dari
    // baris historis — agar chip ringkasan selalu menampilkan nama terbaru.
    const [users] = await db.query(
      `SELECT al.user_id,
              COALESCE(MAX(u2.nama), MAX(al.nama)) AS nama,
              COALESCE(MAX(u2.role), MAX(al.role)) AS role,
              MAX(u2.foto) AS foto,
              ${hasLoginCountCol ? 'COALESCE(SUM(al.login_count),0)' : 'COALESCE(SUM(al.event = \'login\'),0)'} AS logins,
              MAX(al.created_at) AS last_activity
       FROM user_activity_log al
       LEFT JOIN users u2 ON u2.id = al.user_id
       ${where}
       GROUP BY al.user_id
       ORDER BY last_activity DESC`,
      params
    );

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total_entries FROM user_activity_log al ${where}`,
      params
    );
    const totalEntries = countRows[0].total_entries;
    const totalPages = Math.max(1, Math.ceil(totalEntries / limit));

    const [entries] = await db.query(
      `SELECT al.id, al.user_id, al.nama, al.role, u2.foto AS foto, al.event, al.created_at
       FROM user_activity_log al
       LEFT JOIN users u2 ON u2.id = al.user_id
       ${where}
       ORDER BY al.created_at DESC, al.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      range_days: days,
      mulai: range.awal,
      sampai: range.akhir,
      total: range.total,
      logins: range.logins,
      users,
      entries,
      page,
      limit,
      total_entries: totalEntries,
      total_pages: totalPages,
    });
  } catch (e) {
    console.error('Gagal ambil riwayat aktivitas:', e.message);
    res.status(500).json({ error: 'Gagal memuat riwayat: ' + e.message });
  }
});

module.exports = router;

