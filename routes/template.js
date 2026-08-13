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

    // Produksi 7 hari terakhir (untuk grafik)
    const [produksi7] = await db.query(
      `SELECT tanggal_produksi, SUM(jumlah_porsi) AS porsi
       FROM produksi WHERE tenant_id=? AND tanggal_produksi >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY tanggal_produksi ORDER BY tanggal_produksi`,
      [req.user.tenant_id]
    );

    // Ijin/cuti hari ini (disetujui & masih berlangsung) + yang menunggu persetujuan
    const [[ijinHariIni]] = await db.query(
      `SELECT COUNT(*) AS total FROM ijin_cuti
       WHERE tenant_id=? AND status='Disetujui' AND tanggal_mulai <= CURDATE() AND tanggal_selesai >= CURDATE()`,
      [req.user.tenant_id]
    );
    const [[ijinMenunggu]] = await db.query(
      `SELECT COUNT(*) AS total FROM ijin_cuti WHERE tenant_id=? AND status='Menunggu'`,
      [req.user.tenant_id]
    );

    // Menu aktif hari ini: pilih siklus status Aktif. Siklus yang periodenya sudah
    // habis TIDAK dipakai ulang (tidak dimodulo / diulang dari hari pertama).
    // Prioritas: siklus yang periodenya mencakup hari ini → preview siklus terdekat
    // yang akan datang → jika semua sudah selesai, tampilkan "Belum ada siklus aktif".
    const [siklusAktif] = await db.query(
      `SELECT id, nama, kategori_penerima, jumlah_porsi, total_hari, tanggal_mulai
       FROM siklus_menu WHERE tenant_id=? AND status='Aktif'
       ORDER BY tanggal_mulai DESC`,
      [req.user.tenant_id]
    );
    let menuAktifHariIni = null;
    let menuAktifList = [];
    if (siklusAktif.length > 0) {
      const todayKey = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
      const todayUtc = todayKey(new Date());
      const diffDay = (sc) => {
        const mulai = new Date(sc.tanggal_mulai);
        return Math.floor((todayUtc - todayKey(mulai)) / 86400000);
      };
      // 1) Siklus yang sedang berjalan (periodenya mencakup hari ini)
      let s = null;
      let hariKe = 1;
      for (const sc of siklusAktif) {
        if (!sc.tanggal_mulai) continue;
        const totalHari = Math.max(1, Number(sc.total_hari || 7));
        const diff = diffDay(sc);
        if (diff >= 0 && diff < totalHari) { s = sc; hariKe = diff + 1; break; }
      }
      // 2) Belum ada yang berjalan → preview siklus terdekat yang akan datang
      if (!s) {
        for (const sc of siklusAktif) {
          if (!sc.tanggal_mulai) continue;
          if (diffDay(sc) < 0) { s = sc; hariKe = 1; break; }
        }
      }
      // 3) Semua siklus Aktif sudah selesai → jangan tampilkan siklus lama (tanpa loop)
      if (s) {
        const totalHari = Math.max(1, Number(s.total_hari || 7));
        // Muat menu SEMUA hari sekaligus untuk navigasi prev/next di dashboard
        const [menuItems] = await db.query(
          `SELECT hari_ke, menu_id, menu_nama, jumlah_porsi, kalori, protein, karbohidrat, lemak, serat, foto
           FROM siklus_menu_item WHERE siklus_id=? ORDER BY hari_ke`,
          [s.id]
        );
        const menuByHari = {};
        for (const mi of menuItems) {
          const hk = Number(mi.hari_ke);
          if (!menuByHari[hk]) menuByHari[hk] = mi;
        }
        const fmtDate = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        for (let h = 1; h <= totalHari; h++) {
          const mi = menuByHari[h];
          let tanggal = null;
          if (s.tanggal_mulai) {
            const d = new Date(s.tanggal_mulai);
            d.setDate(d.getDate() + (h - 1));
            tanggal = fmtDate(d);
          }
          menuAktifList.push({
            siklus_nama: s.nama,
            kategori: s.kategori_penerima || '',
            jumlah_porsi: Number(s.jumlah_porsi || 0),
            hari_ke: h,
            total_hari: totalHari,
            tanggal: tanggal,
            menu_id: mi ? mi.menu_id : null,
            menu_nama: mi ? (mi.menu_nama || '-') : null,
            foto: mi ? (mi.foto || null) : null,
            porsi_item: mi ? Number(mi.jumlah_porsi || 0) : 0,
            kalori: mi ? Number(mi.kalori || 0) : 0,
            protein: mi ? Number(mi.protein || 0) : 0,
            karbohidrat: mi ? Number(mi.karbohidrat || 0) : 0,
            lemak: mi ? Number(mi.lemak || 0) : 0,
            serat: mi ? Number(mi.serat || 0) : 0
          });
        }
        menuAktifHariIni = menuAktifList[hariKe - 1] || (menuAktifList.length ? menuAktifList[0] : null);
      }
    }
    
    const totalBudget = Number(budget[0]?.total_budget || 0);
    const totalRealisasi = Number(budget[0]?.total_realisasi || 0);

    // Siapkan data grafik produksi 7 hari (isi 0 untuk tanggal tanpa produksi)
    const porsiByDate = {};
    produksi7.forEach(r => {
      const d = new Date(r.tanggal_produksi);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      porsiByDate[key] = Number(r.porsi || 0);
    });
    const grafikProduksi = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      grafikProduksi.push({
        tanggal: d.getDate() + '/' + (d.getMonth() + 1),
        label: i === 0 ? 'Hari Ini' : d.toLocaleDateString('id-ID', { weekday: 'short' }),
        porsi: porsiByDate[key] || 0
      });
    }
    const maxPorsi = Math.max(1, ...grafikProduksi.map(g => g.porsi));

    const summary = {
      total_penerima_manfaat: penerima[0]?.total_penerima_manfaat || 0,
      paket_besar: penerima[0]?.paket_besar || 0,
      paket_kecil: penerima[0]?.paket_kecil || 0,
      total_porsi_diproduksi: produksi[0]?.total_porsi_diproduksi || 0,
      total_budget: totalBudget,
      total_realisasi: totalRealisasi,
      persen_budget: totalBudget > 0 ? Math.round((totalRealisasi / totalBudget) * 100) : 0,
      jumlah_bahan_baku: bahan[0]?.jumlah_bahan_baku || 0,
      stok_menipis: lowStock.length,
      low_stock_items: lowStock,
      ijin_cuti_hari_ini: Number(ijinHariIni.total || 0),
      ijin_cuti_menunggu: Number(ijinMenunggu.total || 0),
      grafik_produksi: grafikProduksi,
      grafik_max_porsi: maxPorsi,
      grafik_total_7hari: grafikProduksi.reduce((s, g) => s + g.porsi, 0),
      menu_aktif: menuAktifHariIni,
      menu_aktif_list: menuAktifList
    };
    
    const [[tenant]] = await db.query('SELECT id, nama, alamat FROM tenants WHERE id=?', [req.user.tenant_id]);
    res.render('partials/dashboard', { 
      summary,
      user: req.user || { nama: 'User' },
      tenant: tenant || { id: req.user.tenant_id, nama: 'Dapur Sukaluyu', alamat: '' }
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
    const [bahan] = await db.query('SELECT id, kode, nama, kategori, kategori_sp, satuan, harga_satuan, stok_saat_ini, stok_minimum, berat_per_satuan, berat_1_sp, persen_bdd FROM bahan_baku WHERE tenant_id=?', [req.user.tenant_id]);
    const [masuk] = await db.query('SELECT sm.id, sm.tanggal, sm.bahan_baku_id, sm.jumlah, sm.sumber, sm.catatan, bb.nama as nama_bahan, bb.satuan FROM stok_masuk sm JOIN bahan_baku bb ON bb.id=sm.bahan_baku_id WHERE sm.tenant_id=? ORDER BY sm.tanggal DESC', [req.user.tenant_id]);
    const [keluar] = await db.query('SELECT sk.id, sk.tanggal, sk.bahan_baku_id, sk.jumlah, sk.tujuan, sk.catatan, bb.nama as nama_bahan, bb.satuan FROM stok_keluar sk JOIN bahan_baku bb ON bb.id=sk.bahan_baku_id WHERE sk.tenant_id=? ORDER BY sk.tanggal DESC', [req.user.tenant_id]);
    
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
  res.render('partials/laporan', { user: req.user }, (err, html) => {
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

// Ijin/Cuti template - only admin and keuangan
router.get('/ijin-cuti', requireRole('admin', 'keuangan'), (req, res) => {
  res.render('partials/ijin_cuti');
});

// Payroll template - only admin and keuangan
router.get('/payroll', requireRole('admin', 'keuangan'), (req, res) => {
  res.render('partials/payroll');
});

// Shift template - only admin and keuangan
router.get('/shift', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const [shifts] = await db.query('SELECT * FROM shift WHERE tenant_id=? ORDER BY jam_masuk', [req.user.tenant_id]);
    const [divisiList] = await db.query('SELECT * FROM divisi ORDER BY nama');
    res.render('partials/shift', { shifts, divisiList });
  } catch (err) {
    console.error('Shift template error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Perhitungan BDD template — khusus ahli gizi
router.get('/perhitungan-bdd', requireRole('admin', 'ahli_gizi'), (req, res) => {
  res.render('partials/perhitungan-bdd');
});

// Perencanaan Kebutuhan Bahan Pangan template — khusus ahli gizi
router.get('/perencanaan', requireRole('admin', 'ahli_gizi'), (req, res) => {
  res.render('partials/perencanaan');
});

// Total Kebutuhan Pangan template — khusus ahli gizi
router.get('/total-kebutuhan', requireRole('admin', 'ahli_gizi'), (req, res) => {
  res.render('partials/total-kebutuhan');
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
