const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { mapJenjang, hitungSP, getSpMapByJenjang } = require('../services/spBddCalculator');

const router = express.Router();
router.use(requireAuth);

// Role middleware helpers
const roleFinance = requireRole('admin', 'keuangan');
const roleOps = requireRole('admin', 'keuangan', 'produksi', 'gudang', 'pimpinan');
const roleWarehouse = requireRole('admin', 'gudang', 'produksi', 'keuangan');
const roleHR = requireRole('admin', 'keuangan', 'hrd', 'pimpinan');
const roleAll = requireRole('admin', 'keuangan', 'produksi', 'gudang', 'pimpinan', 'hrd');

// 1. Laporan Pembelian (PO) - Gudang/Admin
router.get('/laporan/pembelian', roleWarehouse, async (req, res) => {
  const [rows] = await db.query(
    `SELECT * FROM purchase_order WHERE tenant_id=? ORDER BY tanggal DESC`,
    [req.user.tenant_id]
  );
  const stats = {
    total_po: rows.length,
    draft: rows.filter(r => r.status === 'Draft').length,
    disetujui: rows.filter(r => r.status === 'Disetujui').length,
    diterima: rows.filter(r => r.status === 'Diterima').length,
    dibayar: rows.filter(r => r.status === 'Dibayar').length,
    total_nilai: rows.reduce((s, r) => s + Number(r.total_nilai || 0), 0),
  };
  res.json({ rows, stats });
});

// 2. Laporan Penerimaan Barang - Gudang/Admin
router.get('/laporan/penerimaan', roleWarehouse, async (req, res) => {
  const [rows] = await db.query(
    `SELECT * FROM penerimaan_barang WHERE tenant_id=? ORDER BY tanggal_terima DESC`,
    [req.user.tenant_id]
  );
  const stats = {
    total: rows.length,
    lolos: rows.filter(r => r.status_qc === 'Lolos').length,
    retur: rows.filter(r => r.status_qc === 'Retur Sebagian').length,
    ditolak: rows.filter(r => r.status_qc === 'Ditolak').length,
    total_nilai: rows.reduce((s, r) => s + Number(r.total_nilai || 0), 0),
  };
  res.json({ rows, stats });
});

// 3. Mutasi Stok - Gudang/Admin
router.get('/laporan/mutasi-stok', roleWarehouse, async (req, res) => {
  const [masuk] = await db.query(
    `SELECT sm.*, bb.nama as bahan_nama, bb.satuan FROM stok_masuk sm
     JOIN bahan_baku bb ON bb.id=sm.bahan_baku_id
     WHERE sm.tenant_id=? ORDER BY sm.tanggal DESC`, [req.user.tenant_id]
  );
  const [keluar] = await db.query(
    `SELECT sk.*, bb.nama as bahan_nama, bb.satuan FROM stok_keluar sk
     JOIN bahan_baku bb ON bb.id=sk.bahan_baku_id
     WHERE sk.tenant_id=? ORDER BY sk.tanggal DESC`, [req.user.tenant_id]
  );
  const rows = [
    ...masuk.map(r => ({ ...r, jenis: 'Masuk', tanggal: r.tanggal })),
    ...keluar.map(r => ({ ...r, jenis: 'Keluar', tanggal: r.tanggal })),
  ].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
  const stats = {
    total_masuk: masuk.reduce((s, r) => s + Number(r.jumlah || 0), 0),
    total_keluar: keluar.reduce((s, r) => s + Number(r.jumlah || 0), 0),
    count_masuk: masuk.length,
    count_keluar: keluar.length,
  };
  res.json({ rows, stats });
});

// 4. Laporan Produksi - Operasional/Produksi/Admin
router.get('/laporan/produksi', roleOps, async (req, res) => {
  const [rows] = await db.query(
    `SELECT * FROM produksi WHERE tenant_id=? ORDER BY tanggal_produksi DESC`,
    [req.user.tenant_id]
  );
  const stats = {
    total: rows.length,
    total_porsi: rows.reduce((s, r) => s + Number(r.jumlah_porsi || 0), 0),
    direncanakan: rows.filter(r => r.status === 'Direncanakan').length,
    diproduksi: rows.filter(r => r.status === 'Diproduksi').length,
    selesai: rows.filter(r => r.status === 'Selesai').length,
  };
  res.json({ rows, stats });
});

// 5. Laporan Payroll - Keuangan/Admin
router.get('/laporan/payroll', roleFinance, async (req, res) => {
  const [rows] = await db.query(
    `SELECT p.*, CONCAT(p.tahun, '-', LPAD(p.bulan,2,'0')) as periode,
            k.nama as karyawan_nama, k.jabatan
     FROM payroll p
     JOIN karyawan k ON k.id=p.karyawan_id
     WHERE p.tenant_id=? ORDER BY p.tahun DESC, p.bulan DESC`, [req.user.tenant_id]
  );
  const total_gaji = rows.reduce((s, r) => s + Number(r.total_gaji || 0), 0);
  const uniqPeriods = [...new Set(rows.map(r => r.periode))];
  res.json({ rows, stats: { total_karyawan: rows.length, total_gaji, periode_count: uniqPeriods.length } });
});

// 6. Laba/Rugi - Keuangan/Admin
router.get('/laporan/laba-rugi', roleFinance, async (req, res) => {
  const [kasMasuk] = await db.query(
    `SELECT DATE_FORMAT(tanggal,'%Y-%m') as periode, SUM(jumlah) as total
     FROM kas_bank WHERE tenant_id=? AND tipe='masuk' GROUP BY periode ORDER BY periode DESC`,
    [req.user.tenant_id]
  );
  const [kasKeluar] = await db.query(
    `SELECT DATE_FORMAT(tanggal,'%Y-%m') as periode, SUM(jumlah) as total
     FROM kas_bank WHERE tenant_id=? AND tipe='keluar' GROUP BY periode ORDER BY periode DESC`,
    [req.user.tenant_id]
  );
  // Gabung per periode
  const periodMap = {};
  for (const r of kasMasuk) periodMap[r.periode] = { periode: r.periode, pendapatan: Number(r.total), biaya: 0 };
  for (const r of kasKeluar) {
    if (!periodMap[r.periode]) periodMap[r.periode] = { periode: r.periode, pendapatan: 0, biaya: 0 };
    periodMap[r.periode].biaya += Number(r.total);
  }
  const rows = Object.values(periodMap).sort((a, b) => b.periode.localeCompare(a.periode));
  const totalPendapatan = rows.reduce((s, r) => s + r.pendapatan, 0);
  const totalBiaya = rows.reduce((s, r) => s + r.biaya, 0);
  res.json({ rows, totalPendapatan, totalBiayaAll: totalBiaya, labaRugi: totalPendapatan - totalBiaya });
});

// 7. HPP per Menu - Keuangan/Admin

// 8. RAB Bulanan (agregat per periode) - Operasional/Produksi/Admin
router.get('/laporan/rab-bulanan', roleOps, async (req, res) => {
  const [rows] = await db.query(
    `SELECT periode,
            COUNT(*) as item_count,
            SUM(jumlah_penerima) as total_penerima,
            AVG(harga_per_porsi) as rata_harga_per_porsi,
            SUM(biaya_operasional) as total_biaya_operasional,
            SUM(total_budget) as total_budget,
            SUM(realisasi) as total_realisasi
     FROM budget
     WHERE tenant_id=?
     GROUP BY periode
     ORDER BY periode DESC`,
    [req.user.tenant_id]
  );
  const stats = {
    total_periode: rows.length,
    total_budget: rows.reduce((s, r) => s + Number(r.total_budget), 0),
    total_realisasi: rows.reduce((s, r) => s + Number(r.total_realisasi), 0),
    total_penerima: rows.reduce((s, r) => s + Number(r.total_penerima), 0),
    rata_capaian: rows.length > 0
      ? rows.reduce((s, r) => {
          const b = Number(r.total_budget);
          return s + (b > 0 ? Number(r.total_realisasi) / b * 100 : 0);
        }, 0) / rows.length
      : 0,
  };
  res.json({ rows, stats });
});

// 9. Laporan Perhitungan Kebutuhan Pangan (per Program Makan / siklus) - Gudang/Operasional/Admin
router.get('/laporan/kebutuhan-pangan/:siklus_id', roleWarehouse, async (req, res) => {
  const { siklus_id } = req.params;
  const jumlahSiswa = parseInt(req.query.jumlah_siswa) || 0;

  const [[siklus]] = await db.query(
    'SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?',
    [siklus_id, req.user.tenant_id]
  );
  if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

  const [items] = await db.query(
    'SELECT * FROM siklus_menu_item WHERE siklus_id=? ORDER BY hari_ke ASC',
    [siklus_id]
  );

  const targetJenjang = mapJenjang(siklus.kategori_penerima);
  const spMap = await getSpMapByJenjang(targetJenjang);

  const days = [];

  for (const item of items) {
    if (!item.menu_id) {
      days.push({ hari_ke: item.hari_ke, hari_nama: item.hari_nama, menu_nama: null, bahan: [], jumlah_porsi: item.jumlah_porsi || 0 });
      continue;
    }

    const [[menu]] = await db.query(
      'SELECT * FROM menu WHERE id=?', [item.menu_id]
    );
    if (!menu) continue;

    const [bahanRows] = await db.query(
      `SELECT mb.jumlah as jumlah_existing, b.id, b.nama, b.kategori_sp,
              b.berat_1_sp, b.persen_bdd, b.satuan
       FROM menu_bahan mb
       JOIN bahan_baku b ON b.id = mb.bahan_baku_id
       WHERE mb.menu_id=?`,
      [item.menu_id]
    );

    const bahan = bahanRows.map(b => {
      const h = hitungSP(b, spMap);
      const kebutuhanKg = jumlahSiswa > 0 ? Number((h.berat_kotor * jumlahSiswa / 1000).toFixed(2)) : 0;

      return {
        bahan_id: b.id,
        nama: b.nama,
        kategori_sp: b.kategori_sp,
        sp_value: h.sp_value,
        berat_1_sp: h.berat_1_sp,
        berat_bersih: h.berat_bersih,
        persen_bdd: h.persen_bdd,
        berat_kotor: h.berat_kotor,
        jumlah_siswa: jumlahSiswa,
        kebutuhan_kg: kebutuhanKg,
        satuan: b.satuan,
      };
    });

    const gramasiBersih = bahan.reduce((s, b) => s + b.berat_bersih, 0);
    const gramasiKotor = bahan.reduce((s, b) => s + b.berat_kotor, 0);

    days.push({
      hari_ke: item.hari_ke,
      hari_nama: item.hari_nama,
      menu_id: item.menu_id,
      menu_nama: menu.nama,
      jumlah_porsi: item.jumlah_porsi || 0,
      gramasi_bersih: gramasiBersih,
      gramasi_kotor: gramasiKotor,
      gramasi_total: Number(menu.gramasi_total || 0),
      bahan,
    });
  }

  const totalKebutuhanKg = days.reduce((s, d) =>
    s + (d.bahan || []).reduce((s2, b) => s2 + b.kebutuhan_kg, 0), 0
  );

  res.json({
    siklus: { id: siklus.id, nama: siklus.nama, kategori_penerima: siklus.kategori_penerima, jumlah_porsi: siklus.jumlah_porsi, total_hari: siklus.total_hari },
    jenjang: targetJenjang,
    jumlah_siswa: jumlahSiswa,
    days,
    total_kebutuhan_kg: Number(totalKebutuhanKg.toFixed(2)),
  });
});

// 10. Buku Pembantu Operasional - Keuangan/Admin
router.get('/laporan/bp-operasional', roleFinance, async (req, res) => {
  const t = req.user.tenant_id;
  const { bulan, tahun } = req.query;
  const now = new Date();
  const filterBulan = bulan || String(now.getMonth() + 1).padStart(2, '0');
  const filterTahun = tahun || String(now.getFullYear());
  const startDate = `${filterTahun}-${filterBulan}-01`;
  const [y, m] = [parseInt(filterTahun), parseInt(filterBulan)];
  const endDate = new Date(y, m, 1).toISOString().slice(0, 10);

  const [akunList] = await db.query(
    `SELECT * FROM akun WHERE tenant_id=? AND bp='BP Operasional' AND is_active=1 ORDER BY kode`,
    [t]
  );

  const [[{ saldo_awal } = { saldo_awal: 0 }]] = await db.query(
    'SELECT COALESCE(saldo_awal,0) AS saldo_awal FROM tenants WHERE id=?', [t]
  );

  const [transaksi] = await db.query(
    `SELECT k.*, a.kode as akun_kode, a.nama as akun_nama, a.bp as akun_bp
     FROM kas_bank k
     LEFT JOIN akun a ON a.id = k.akun_id
     WHERE k.tenant_id=?
       AND k.tanggal >= ? AND k.tanggal < ?
       AND (a.bp = 'BP Operasional' OR a.bp IS NULL)
     ORDER BY k.tanggal ASC, k.id ASC`,
    [t, startDate, endDate]
  );

  const perAkun = {};
  for (const trx of transaksi) {
    const key = trx.akun_id || 'tanpa-akun';
    if (!perAkun[key]) {
      perAkun[key] = {
        akun_id: trx.akun_id,
        akun_kode: trx.akun_kode || '-',
        akun_nama: trx.akun_nama || 'Tanpa Akun',
        transaksi: [],
        total_masuk: 0,
        total_keluar: 0,
      };
    }
    perAkun[key].transaksi.push({
      id: trx.id,
      tanggal: trx.tanggal,
      no_transaksi: trx.no_transaksi,
      tipe: trx.tipe,
      kategori: trx.kategori,
      deskripsi: trx.deskripsi,
      jumlah: Number(trx.jumlah),
    });
    if (trx.tipe === 'masuk') perAkun[key].total_masuk += Number(trx.jumlah);
    else perAkun[key].total_keluar += Number(trx.jumlah);
  }

  const akunIds = Object.keys(perAkun).filter(k => k !== 'tanpa-akun');
  if (akunIds.length) {
    const ph = akunIds.map(() => '?').join(',');
    const [saldoRows] = await db.query(
      `SELECT akun_id, COALESCE(SUM(CASE WHEN tipe='masuk' THEN jumlah ELSE -jumlah END), 0) as saldo_sebelum
       FROM kas_bank
       WHERE tenant_id=? AND akun_id IN (${ph}) AND tanggal < ?
       GROUP BY akun_id`,
      [t, ...akunIds, startDate]
    );
    const saldoMap = {};
    for (const r of saldoRows) saldoMap[r.akun_id] = Number(r.saldo_sebelum);
    for (const id of akunIds) {
      const s = saldoMap[id] || 0;
      perAkun[id].saldo_awal = s;
      perAkun[id].saldo_akhir = s + perAkun[id].total_masuk - perAkun[id].total_keluar;
    }
  }

  if (perAkun['tanpa-akun']) {
    const [[{ saldo_sebelum } = { saldo_sebelum: 0 }]] = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN tipe='masuk' THEN jumlah ELSE -jumlah END), 0) as saldo_sebelum
       FROM kas_bank
       WHERE tenant_id=? AND akun_id IS NULL AND tanggal < ?`,
      [t, startDate]
    );
    perAkun['tanpa-akun'].saldo_awal = Number(saldo_sebelum);
    perAkun['tanpa-akun'].saldo_akhir = Number(saldo_sebelum) + perAkun['tanpa-akun'].total_masuk - perAkun['tanpa-akun'].total_keluar;
  }

  const akunData = Object.values(perAkun).sort((a, b) => a.akun_kode.localeCompare(b.akun_kode));
  const totalMasuk = akunData.reduce((s, a) => s + a.total_masuk, 0);
  const totalKeluar = akunData.reduce((s, a) => s + a.total_keluar, 0);

  res.json({
    periode: `${filterTahun}-${filterBulan}`,
    saldo_awal: Number(saldo_awal),
    total_masuk: totalMasuk,
    total_keluar: totalKeluar,
    akun_data: akunData,
    akun_list: akunList,
  });
});

// 11. Catatan Pengeluaran Bulanan - Keuangan/Admin
router.get('/laporan/pengeluaran-bulanan', roleFinance, async (req, res) => {
  const t = req.user.tenant_id;
  const { bulan, tahun } = req.query;
  const now = new Date();
  const filterBulan = bulan || String(now.getMonth() + 1).padStart(2, '0');
  const filterTahun = tahun || String(now.getFullYear());
  const periode = `${filterTahun}-${filterBulan}`;

  // Ambil saldo_awal dari tenants
  const [[{ saldo_awal } = { saldo_awal: 0 }]] = await db.query(
    'SELECT COALESCE(saldo_awal, 0) AS saldo_awal FROM tenants WHERE id=?', [t]
  );

  // Sisa dana yang lalu: saldo_awal + semua transaksi sebelum periode ini
  const [[{ saldo_sebelum } = { saldo_sebelum: 0 }]] = await db.query(
    `SELECT COALESCE(SUM(CASE WHEN tipe='masuk' THEN jumlah ELSE -jumlah END), 0) AS saldo_sebelum
     FROM kas_bank
     WHERE tenant_id=? AND tanggal < STR_TO_DATE(CONCAT(?, '-', ?, '-01'), '%Y-%m-%d')`,
    [t, filterTahun, filterBulan]
  );
  const sisa_dana_lalu = Number(saldo_awal) + Number(saldo_sebelum);

  // Dana yang diterima saat ini
  const [[{ dana_diterima } = { dana_diterima: 0 }]] = await db.query(
    `SELECT COALESCE(SUM(jumlah), 0) AS dana_diterima
     FROM kas_bank
     WHERE tenant_id=? AND tipe='masuk' AND DATE_FORMAT(tanggal, '%Y-%m')=?`,
    [t, periode]
  );

  // Pengeluaran per kategori
  const [pengeluaran] = await db.query(
    `SELECT kategori, SUM(jumlah) AS total
     FROM kas_bank
     WHERE tenant_id=? AND tipe='keluar' AND DATE_FORMAT(tanggal, '%Y-%m')=?
     GROUP BY kategori`,
    [t, periode]
  );
  const byKat = {};
  for (const p of pengeluaran) byKat[p.kategori] = Number(p.total);

  const biaya_bahan_baku = byKat['Pembayaran Supplier'] || 0;
  const biaya_operasional = byKat['Biaya Operasional'] || 0;
  const biaya_insentif_fasilitas = byKat['Gaji'] || 0;
  const biaya_lainnya = byKat['Lainnya'] || 0;
  const total_pengeluaran = biaya_bahan_baku + biaya_operasional + biaya_insentif_fasilitas + biaya_lainnya;
  const dana_tersedia = sisa_dana_lalu + Number(dana_diterima);
  const sisa_dana_saat_ini = dana_tersedia - total_pengeluaran;

  // Detail transaksi periode ini
  const [transaksi] = await db.query(
    `SELECT k.*, a.kode AS akun_kode, a.nama AS akun_nama
     FROM kas_bank k
     LEFT JOIN akun a ON a.id = k.akun_id
     WHERE k.tenant_id=? AND DATE_FORMAT(k.tanggal, '%Y-%m')=?
     ORDER BY k.tanggal ASC, k.id ASC`,
    [t, periode]
  );

  res.json({
    periode: `${filterTahun}-${filterBulan}`,
    saldo_awal: Number(saldo_awal),
    sisa_dana_lalu,
    dana_diterima: Number(dana_diterima),
    dana_tersedia,
    biaya_bahan_baku,
    biaya_operasional,
    biaya_insentif_fasilitas,
    biaya_lainnya,
    total_pengeluaran,
    sisa_dana_saat_ini,
    transaksi: transaksi.map(k => ({
      ...k,
      jumlah: Number(k.jumlah),
    })),
  });
});

// 12. Laporan Penggunaan Anggaran - Keuangan/Admin
router.get('/laporan/penggunaan-anggaran', roleFinance, async (req, res) => {
  const t = req.user.tenant_id;
  const { bulan, tahun } = req.query;
  const now = new Date();
  const filterBulan = bulan || String(now.getMonth() + 1).padStart(2, '0');
  const filterTahun = tahun || String(now.getFullYear());
  const periode = `${filterTahun}-${filterBulan}`;

  // Dana Diajukan dari budget
  const [[budgetRow]] = await db.query(
    `SELECT COALESCE(SUM(total_budget), 0) AS total_budget,
            COALESCE(SUM(biaya_operasional), 0) AS total_biaya_operasional
     FROM budget WHERE tenant_id=? AND periode=?`,
    [t, periode]
  );

  const dana_diajukan_total = Number(budgetRow.total_budget);
  const dana_diajukan_operasional = Number(budgetRow.total_biaya_operasional);
  // Asumsikan Bahan Baku = total_budget - biaya_operasional, Insentif tidak dipisah di budget
  const dana_diajukan_bahan = Math.max(0, dana_diajukan_total - dana_diajukan_operasional);
  const dana_diajukan_insentif = 0;

  // Dana Terpakai dari kas_bank
  const [pengeluaran] = await db.query(
    `SELECT kategori, SUM(jumlah) AS total
     FROM kas_bank
     WHERE tenant_id=? AND tipe='keluar' AND DATE_FORMAT(tanggal, '%Y-%m')=?
     GROUP BY kategori`,
    [t, periode]
  );
  const byKat = {};
  for (const p of pengeluaran) byKat[p.kategori] = Number(p.total);

  const dana_terpakai_bahan = byKat['Pembayaran Supplier'] || 0;
  const dana_terpakai_operasional = (byKat['Biaya Operasional'] || 0) + (byKat['Lainnya'] || 0);
  const dana_terpakai_insentif = byKat['Gaji'] || 0;
  const dana_terpakai_total = dana_terpakai_bahan + dana_terpakai_operasional + dana_terpakai_insentif;

  res.json({
    periode,
    bahan_baku: {
      diajukan: dana_diajukan_bahan,
      terpakai: dana_terpakai_bahan,
      sisa: dana_diajukan_bahan - dana_terpakai_bahan,
    },
    operasional: {
      diajukan: dana_diajukan_operasional,
      terpakai: dana_terpakai_operasional,
      sisa: dana_diajukan_operasional - dana_terpakai_operasional,
    },
    insentif: {
      diajukan: dana_diajukan_insentif,
      terpakai: dana_terpakai_insentif,
      sisa: dana_diajukan_insentif - dana_terpakai_insentif,
    },
    total: {
      diajukan: dana_diajukan_total,
      terpakai: dana_terpakai_total,
      sisa: dana_diajukan_total - dana_terpakai_total,
    },
  });
});

// 13. Buku Pembantu BP Kas - Keuangan/Admin
router.get('/laporan/bp-kas', roleFinance, async (req, res) => {
  const t = req.user.tenant_id;
  const { bulan, tahun } = req.query;
  const now = new Date();
  const filterBulan = bulan || String(now.getMonth() + 1).padStart(2, '0');
  const filterTahun = tahun || String(now.getFullYear());

  // Ambil akun dengan BP Kas
  const [akunList] = await db.query(
    `SELECT * FROM akun WHERE tenant_id=? AND bp='BP Kas' AND is_active=1 ORDER BY kode`,
    [t]
  );

  // Ambil semua transaksi kas_bank untuk periode tertentu yang terkait akun BP Kas
  const [transaksi] = await db.query(
    `SELECT k.*, a.kode as akun_kode, a.nama as akun_nama, a.bp as akun_bp
     FROM kas_bank k
     LEFT JOIN akun a ON a.id = k.akun_id
     WHERE k.tenant_id=?
       AND DATE_FORMAT(k.tanggal, '%Y-%m') = CONCAT(?, '-', ?)
       AND a.bp = 'BP Kas'
     ORDER BY k.tanggal ASC, k.id ASC`,
    [t, filterTahun, filterBulan]
  );

  // Group transaksi per akun
  const perAkun = {};
  for (const trx of transaksi) {
    const key = trx.akun_id;
    if (!perAkun[key]) {
      perAkun[key] = {
        akun_id: trx.akun_id,
        akun_kode: trx.akun_kode || '-',
        akun_nama: trx.akun_nama || 'Tanpa Akun',
        transaksi: [],
        total_masuk: 0,
        total_keluar: 0,
      };
    }
    perAkun[key].transaksi.push({
      id: trx.id,
      tanggal: trx.tanggal,
      no_transaksi: trx.no_transaksi,
      tipe: trx.tipe,
      kategori: trx.kategori,
      deskripsi: trx.deskripsi,
      jumlah: Number(trx.jumlah),
    });
    if (trx.tipe === 'masuk') perAkun[key].total_masuk += Number(trx.jumlah);
    else perAkun[key].total_keluar += Number(trx.jumlah);
  }

  // Hitung saldo awal per akun (sebelum periode filter)
  for (const key of Object.keys(perAkun)) {
    const akunId = perAkun[key].akun_id;
    const [[{ saldo_sebelum } = { saldo_sebelum: 0 }]] = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN tipe='masuk' THEN jumlah ELSE -jumlah END), 0) as saldo_sebelum
       FROM kas_bank
       WHERE tenant_id=? AND akun_id=? AND tanggal < STR_TO_DATE(CONCAT(?, '-', ?, '-01'), '%Y-%m-%d')`,
      [t, akunId, filterTahun, filterBulan]
    );
    perAkun[key].saldo_awal = Number(saldo_sebelum);
    perAkun[key].saldo_akhir = Number(saldo_sebelum) + perAkun[key].total_masuk - perAkun[key].total_keluar;
  }

  const akunData = Object.values(perAkun).sort((a, b) => a.akun_kode.localeCompare(b.akun_kode));
  const totalSaldoAwal = akunData.reduce((s, a) => s + a.saldo_awal, 0);
  const totalMasuk = akunData.reduce((s, a) => s + a.total_masuk, 0);
  const totalKeluar = akunData.reduce((s, a) => s + a.total_keluar, 0);
  const totalSaldoAkhir = akunData.reduce((s, a) => s + a.saldo_akhir, 0);

  res.json({
    periode: `${filterTahun}-${filterBulan}`,
    total_saldo_awal: totalSaldoAwal,
    total_masuk: totalMasuk,
    total_keluar: totalKeluar,
    total_saldo_akhir: totalSaldoAkhir,
    akun_data: akunData,
    akun_list: akunList,
  });
});

module.exports = router;
