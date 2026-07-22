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

// 6. Laba/Rugi (Formal) - Keuangan/Admin
router.get('/laporan/laba-rugi', roleFinance, async (req, res) => {
  const t = req.user.tenant_id;
  const { bulan, tahun } = req.query;
  const now = new Date();
  const filterBulan = bulan || String(now.getMonth() + 1).padStart(2, '0');
  const filterTahun = tahun || String(now.getFullYear());
  const periode = `${filterTahun}-${filterBulan}`;

  // Ambil semua transaksi
  const [allTrans] = await db.query(
    `SELECT k.*, a.kelompok, a.kode as akun_kode, a.nama as akun_nama
     FROM kas_bank k
     LEFT JOIN akun a ON a.id = k.akun_id
     WHERE k.tenant_id=? AND DATE_FORMAT(k.tanggal,'%Y-%m')=?
     ORDER BY k.tanggal ASC`,
    [t, periode]
  );

  // Pendapatan (kas masuk) per kategori
  const pendapatanKat = {};
  let totalPendapatan = 0;
  for (const trx of allTrans.filter(k => k.tipe === 'masuk')) {
    const kat = trx.kategori || 'Penerimaan Dana';
    if (!pendapatanKat[kat]) pendapatanKat[kat] = 0;
    pendapatanKat[kat] += Number(trx.jumlah);
    totalPendapatan += Number(trx.jumlah);
  }

  // Biaya (kas keluar) per kategori
  const biayaKat = {};
  let totalBiaya = 0;
  for (const trx of allTrans.filter(k => k.tipe === 'keluar')) {
    const kat = trx.kategori || 'Lainnya';
    if (!biayaKat[kat]) biayaKat[kat] = 0;
    biayaKat[kat] += Number(trx.jumlah);
    totalBiaya += Number(trx.jumlah);
  }

  // Struktur data untuk frontend
  const pendapatanRows = Object.entries(pendapatanKat).map(([kategori, jumlah]) => ({
    kategori, jumlah, persen: totalPendapatan > 0 ? (jumlah / totalPendapatan * 100) : 0,
  })).sort((a, b) => b.jumlah - a.jumlah);

  const biayaRows = Object.entries(biayaKat).map(([kategori, jumlah]) => ({
    kategori, jumlah, persen: totalBiaya > 0 ? (jumlah / totalBiaya * 100) : 0,
  })).sort((a, b) => b.jumlah - a.jumlah);

  // Per-periode summary (untuk tabel multi-periode)
  const [kasMasuk] = await db.query(
    `SELECT DATE_FORMAT(tanggal,'%Y-%m') as periode, SUM(jumlah) as total
     FROM kas_bank WHERE tenant_id=? AND tipe='masuk' GROUP BY periode ORDER BY periode DESC`,
    [t]
  );
  const [kasKeluar] = await db.query(
    `SELECT DATE_FORMAT(tanggal,'%Y-%m') as periode, SUM(jumlah) as total
     FROM kas_bank WHERE tenant_id=? AND tipe='keluar' GROUP BY periode ORDER BY periode DESC`,
    [t]
  );
  const periodMap = {};
  for (const r of kasMasuk) periodMap[r.periode] = { periode: r.periode, pendapatan: Number(r.total), biaya: 0 };
  for (const r of kasKeluar) {
    if (!periodMap[r.periode]) periodMap[r.periode] = { periode: r.periode, pendapatan: 0, biaya: 0 };
    periodMap[r.periode].biaya += Number(r.total);
  }
  const rows = Object.values(periodMap).sort((a, b) => b.periode.localeCompare(a.periode));

  res.json({
    periode,
    pendapatan: { total: totalPendapatan, rincian: pendapatanRows },
    biaya: { total: totalBiaya, rincian: biayaRows },
    laba_rugi: totalPendapatan - totalBiaya,
    margin: totalPendapatan > 0 ? ((totalPendapatan - totalBiaya) / totalPendapatan * 100) : 0,
    rows,
    totalPendapatan,
    totalBiayaAll: totalBiaya,
    labaRugi: totalPendapatan - totalBiaya,
  });
});

// 7. HPP per Menu - Keuangan/Admin
// Menghitung Harga Pokok Produksi per menu dari harga_satuan bahan baku
// Yang sudah diupdate otomatis saat PO diterima (P1)
router.get('/laporan/hpp', roleFinance, async (req, res) => {
  const t = req.user.tenant_id;
  try {
    // Ambil semua menu dengan total HPP
    const [menuRows] = await db.query(`
      SELECT
        m.id AS menu_id,
        m.nama AS menu_nama,
        m.kategori_penerima,
        COUNT(mb.id) AS jumlah_bahan,
        COALESCE(SUM(
          CASE
            WHEN b.berat_per_satuan IS NOT NULL AND b.berat_per_satuan > 0
            THEN mb.jumlah * (b.harga_satuan / b.berat_per_satuan)
            ELSE mb.jumlah * b.harga_satuan
          END
        ), 0) AS total_hpp
      FROM menu m
      LEFT JOIN menu_bahan mb ON mb.menu_id = m.id
      LEFT JOIN bahan_baku b ON b.id = mb.bahan_baku_id
      WHERE m.tenant_id = ?
      GROUP BY m.id, m.nama, m.kategori_penerima
      ORDER BY total_hpp DESC
    `, [t]);

    // Hitung statistik
    const totalHppAll = menuRows.reduce((s, r) => s + Number(r.total_hpp), 0);
    const menuDenganBahan = menuRows.filter(r => Number(r.jumlah_bahan) > 0);
    const menuTanpaBahan = menuRows.filter(r => Number(r.jumlah_bahan) === 0);
    const rataHpp = menuDenganBahan.length > 0
      ? totalHppAll / menuDenganBahan.length
      : 0;

    // Ambil detail bahan untuk setiap menu
    const menuIds = menuRows.map(r => r.menu_id);
    const detailBahan = {};

    if (menuIds.length > 0) {
      // Batch query detail bahan untuk semua menu
      const placeholders = menuIds.map(() => '?').join(',');
      const [bahanDetails] = await db.query(`
        SELECT
          mb.menu_id,
          b.nama AS bahan_nama,
          mb.jumlah,
          b.satuan,
          b.harga_satuan,
          b.berat_per_satuan,
          CASE
            WHEN b.berat_per_satuan IS NOT NULL AND b.berat_per_satuan > 0
            THEN mb.jumlah * (b.harga_satuan / b.berat_per_satuan)
            ELSE mb.jumlah * b.harga_satuan
          END AS subtotal
        FROM menu_bahan mb
        JOIN bahan_baku b ON b.id = mb.bahan_baku_id
        WHERE mb.menu_id IN (${placeholders})
        ORDER BY mb.menu_id, b.nama ASC
      `, menuIds);

      // Group by menu_id
      for (const b of bahanDetails) {
        if (!detailBahan[b.menu_id]) detailBahan[b.menu_id] = [];
        detailBahan[b.menu_id].push({
          bahan_nama: b.bahan_nama,
          jumlah: Number(b.jumlah),
          satuan: b.satuan || 'g',
          harga: Number(b.harga_satuan),
          subtotal: Number(b.subtotal),
        });
      }
    }

    // Format response untuk frontend
    const rows = menuRows.map(r => ({
      menu_id: r.menu_id,
      menu_nama: r.menu_nama,
      kategori_penerima: r.kategori_penerima || '-',
      jumlah_bahan: Number(r.jumlah_bahan),
      total_hpp: Number(r.total_hpp),
    }));

    res.json({
      rows,
      stats: {
        total_hpp_all: totalHppAll,
        rata_hpp: rataHpp,
        menu_tanpa_bahan: menuTanpaBahan.length,
        total_menu: menuRows.length,
      },
      detail_bahan: detailBahan,
    });
  } catch (err) {
    console.error('HPP error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 8. RAB Bulanan (agregat per periode) - Operasional/Produksi/Admin
// Mendukung filter bulan & tahun untuk melihat detail per periode
router.get('/laporan/rab-bulanan', roleOps, async (req, res) => {
  const t = req.user.tenant_id;
  const { bulan, tahun } = req.query;
  const now = new Date();
  const filterBulan = bulan || '';
  const filterTahun = tahun || '';

  let whereExtra = '';
  const params = [t];
  if (filterBulan && filterTahun) {
    const periode = `${filterTahun}-${String(filterBulan).padStart(2, '0')}`;
    whereExtra = ' AND periode=?';
    params.push(periode);
  }

  const [rows] = await db.query(
    `SELECT periode,
            COUNT(*) as item_count,
            SUM(jumlah_penerima) as total_penerima,
            AVG(harga_per_porsi) as rata_harga_per_porsi,
            SUM(biaya_operasional) as total_biaya_operasional,
            SUM(total_budget) as total_budget,
            SUM(realisasi) as total_realisasi
     FROM budget
     WHERE tenant_id=?${whereExtra}
     GROUP BY periode
     ORDER BY periode DESC`,
    params
  );

  // Ambil detail per kategori untuk periode yang difilter
  let detailKategori = [];
  let produksiInfo = null;
  if (filterBulan && filterTahun) {
    const periode = `${filterTahun}-${String(filterBulan).padStart(2, '0')}`;

    // Detail per kategori dari budget
    const [kategoriRows] = await db.query(
      `SELECT * FROM budget WHERE tenant_id=? AND periode=? ORDER BY kategori_penerima`,
      [t, periode]
    );
    detailKategori = kategoriRows.map(r => ({
      id: r.id,
      kategori_penerima: r.kategori_penerima,
      jumlah_penerima: Number(r.jumlah_penerima),
      harga_per_porsi: Number(r.harga_per_porsi),
      biaya_operasional: Number(r.biaya_operasional),
      total_budget: Number(r.total_budget),
      realisasi: Number(r.realisasi),
      catatan: r.catatan,
    }));

    // Info produksi periode ini
    const [[{ total_hari, total_porsi_produksi } = { total_hari: 0, total_porsi_produksi: 0 }]] = await db.query(
      `SELECT COUNT(DISTINCT tanggal_produksi) as total_hari,
              COALESCE(SUM(jumlah_porsi),0) as total_porsi_produksi
       FROM produksi WHERE tenant_id=? AND DATE_FORMAT(tanggal_produksi, '%Y-%m')=?`,
      [t, periode]
    );

    // Realisasi dari kas_bank (total pengeluaran)
    const [[{ realisasi_kas } = { realisasi_kas: 0 }]] = await db.query(
      `SELECT COALESCE(SUM(jumlah),0) AS realisasi_kas
       FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
       AND DATE_FORMAT(tanggal, '%Y-%m')=?`,
      [t, periode]
    );

    // Realisasi per kategori dari kas_bank
    const [realisasiPerKat] = await db.query(
      `SELECT kategori, SUM(jumlah) as total
       FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
       AND DATE_FORMAT(tanggal, '%Y-%m')=?
       GROUP BY kategori ORDER BY total DESC`,
      [t, periode]
    );

    produksiInfo = {
      total_hari,
      total_porsi_produksi,
      realisasi_kas: Number(realisasi_kas),
      realisasi_per_kategori: realisasiPerKat.map(r => ({
        kategori: r.kategori,
        total: Number(r.total),
      })),
    };
  }

  // Ringkasan keuangan dari kas_bank per periode
  const [ringkasanKeuangan] = await db.query(
    `SELECT DATE_FORMAT(tanggal,'%Y-%m') as periode,
            COALESCE(SUM(CASE WHEN tipe='masuk' THEN jumlah ELSE 0 END),0) as total_masuk,
            COALESCE(SUM(CASE WHEN tipe='keluar' THEN jumlah ELSE 0 END),0) as total_keluar
     FROM kas_bank
     WHERE tenant_id=?
     GROUP BY DATE_FORMAT(tanggal,'%Y-%m')
     ORDER BY periode DESC`,
    [t]
  );
  const keuanganMap = {};
  for (const r of ringkasanKeuangan) {
    keuanganMap[r.periode] = {
      total_masuk: Number(r.total_masuk),
      total_keluar: Number(r.total_keluar),
    };
  }

  // Gabungkan data budget dengan data keuangan
  const mergedRows = rows.map(r => {
    const keu = keuanganMap[r.periode] || { total_masuk: 0, total_keluar: 0 };
    const budget = Number(r.total_budget) || 0;
    const realisasiBudget = Number(r.total_realisasi) || 0;
    const realisasiKas = keu.total_keluar || 0;
    return {
      periode: r.periode,
      item_count: Number(r.item_count),
      total_penerima: Number(r.total_penerima),
      rata_harga_per_porsi: Number(r.rata_harga_per_porsi),
      total_biaya_operasional: Number(r.total_biaya_operasional),
      total_budget: budget,
      total_realisasi_budget: realisasiBudget,
      total_realisasi_kas: realisasiKas,
      total_masuk: keu.total_masuk,
      selisih_budget: budget - realisasiBudget,
      selisih_kas: budget - realisasiKas,
      capaian_budget: budget > 0 ? (realisasiBudget / budget * 100) : 0,
      capaian_kas: budget > 0 ? (realisasiKas / budget * 100) : 0,
    };
  });

  const stats = {
    total_periode: mergedRows.length,
    total_budget: mergedRows.reduce((s, r) => s + r.total_budget, 0),
    total_realisasi_budget: mergedRows.reduce((s, r) => s + r.total_realisasi_budget, 0),
    total_realisasi_kas: mergedRows.reduce((s, r) => s + r.total_realisasi_kas, 0),
    total_penerima: mergedRows.reduce((s, r) => s + r.total_penerima, 0),
    rata_capaian_budget: mergedRows.length > 0
      ? mergedRows.reduce((s, r) => s + r.capaian_budget, 0) / mergedRows.length
      : 0,
    rata_capaian_kas: mergedRows.length > 0
      ? mergedRows.reduce((s, r) => s + r.capaian_kas, 0) / mergedRows.length
      : 0,
  };

  res.json({ rows: mergedRows, stats, detail_kategori: detailKategori, produksi_info: produksiInfo });
});

// 8b. RAB Detail Per Periode — rincian lengkap budget vs realisasi
router.get('/laporan/rab-detail-periode', roleOps, async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const { periode } = req.query;
    if (!periode) return res.status(400).json({ error: 'Periode wajib diisi (YYYY-MM)' });

    // 1. Budget entries per kategori
    const [budgetRows] = await db.query(
      `SELECT * FROM budget WHERE tenant_id=? AND periode=? ORDER BY kategori_penerima`,
      [t, periode]
    );

    // 2. Produksi info
    const [[{ total_hari } = { total_hari: 0 }]] = await db.query(
      `SELECT COUNT(DISTINCT tanggal_produksi) as total_hari
       FROM produksi WHERE tenant_id=? AND DATE_FORMAT(tanggal_produksi, '%Y-%m')=?`,
      [t, periode]
    );

    // 3. Penerima manfaat
    const [penerima] = await db.query(
      `SELECT kategori_penerima, SUM(paket_besar + paket_kecil) as total_penerima
       FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima IS NOT NULL
       GROUP BY kategori_penerima ORDER BY kategori_penerima`,
      [t]
    );
    const penerimaMap = {};
    for (const p of penerima) penerimaMap[p.kategori_penerima] = Number(p.total_penerima);

    // 4. Realisasi dari kas_bank per kategori
    const [realisasiPerKat] = await db.query(
      `SELECT kategori, SUM(jumlah) as total
       FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
       AND DATE_FORMAT(tanggal, '%Y-%m')=?
       GROUP BY kategori ORDER BY total DESC`,
      [t, periode]
    );
    const realisasiKatMap = {};
    for (const r of realisasiPerKat) realisasiKatMap[r.kategori] = Number(r.total);

    // 5. Total realisasi
    const [[{ total_realisasi_kas } = { total_realisasi_kas: 0 }]] = await db.query(
      `SELECT COALESCE(SUM(jumlah),0) AS total_realisasi_kas
       FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
       AND DATE_FORMAT(tanggal, '%Y-%m')=?`,
      [t, periode]
    );

    const totalBudget = budgetRows.reduce((s, r) => s + Number(r.total_budget), 0);
    const totalRealisasiBudget = budgetRows.reduce((s, r) => s + Number(r.realisasi), 0);

    // Detail per kategori
    const detail = budgetRows.map(b => ({
      id: b.id,
      kategori_penerima: b.kategori_penerima,
      jumlah_penerima: Number(b.jumlah_penerima),
      harga_per_porsi: Number(b.harga_per_porsi),
      biaya_operasional: Number(b.biaya_operasional),
      total_budget: Number(b.total_budget),
      realisasi_budget: Number(b.realisasi),
      // Estimasi kebutuhan: harga_per_porsi * jumlah_penerima * total_hari
      estimasi_kebutuhan: Number(b.harga_per_porsi) * (Number(b.jumlah_penerima) || 0) * total_hari,
    }));

    // Realisasi per kategori untuk display
    const realisasiDisplay = Object.entries(realisasiKatMap).map(([kategori, total]) => ({
      kategori,
      total,
      persen_budget: totalBudget > 0 ? (total / totalBudget * 100) : 0,
    }));

    res.json({
      periode,
      total_hari,
      total_penerima: Object.values(penerimaMap).reduce((s, v) => s + v, 0),
      total_budget: totalBudget,
      total_realisasi_budget: totalRealisasiBudget,
      total_realisasi_kas: Number(total_realisasi_kas),
      selisih_budget: totalBudget - totalRealisasiBudget,
      selisih_kas: totalBudget - Number(total_realisasi_kas),
      serapan_budget: totalBudget > 0 ? (totalRealisasiBudget / totalBudget * 100) : 0,
      serapan_kas: totalBudget > 0 ? (Number(total_realisasi_kas) / totalBudget * 100) : 0,
      detail_kategori: detail,
      realisasi_per_kategori: realisasiDisplay,
      penerima_per_kategori: penerima.map(p => ({
        kategori: p.kategori_penerima,
        jumlah: Number(p.total_penerima),
      })),
    });
  } catch (err) {
    console.error('RAB detail periode error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 8c. Generate Budget dari RAB Sinkron — otomatis buat entri budget dari data aktual
router.post('/laporan/rab-generate-budget', roleFinance, async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const { periode } = req.body;

    if (!periode) {
      return res.status(400).json({ error: 'Periode wajib diisi (YYYY-MM)' });
    }

    // Cek apakah sudah ada budget untuk periode ini
    const [existing] = await db.query(
      `SELECT COUNT(*) as cnt FROM budget WHERE tenant_id=? AND periode=?`,
      [t, periode]
    );

    let overwrite = req.query.overwrite === 'true';
    if (existing[0].cnt > 0 && !overwrite) {
      return res.json({
        message: 'Budget sudah ada untuk periode ' + periode,
        existing: existing[0].cnt,
        can_overwrite: true,
        hint: 'Gunakan ?overwrite=true untuk menimpa',
      });
    }

    // Hapus budget lama jika overwrite
    if (overwrite && existing[0].cnt > 0) {
      await db.query(`DELETE FROM budget WHERE tenant_id=? AND periode=?`, [t, periode]);
    }

    // Hitung total hari produksi
    const [[{ total_hari } = { total_hari: 0 }]] = await db.query(
      `SELECT COUNT(DISTINCT tanggal_produksi) as total_hari
       FROM produksi WHERE tenant_id=? AND DATE_FORMAT(tanggal_produksi, '%Y-%m')=?`,
      [t, periode]
    );

    // Ambil penerima manfaat per kategori
    const [penerima] = await db.query(
      `SELECT kategori_penerima, SUM(paket_besar + paket_kecil) as total_penerima
       FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima IS NOT NULL
       GROUP BY kategori_penerima ORDER BY kategori_penerima`,
      [t]
    );

    // Ambil harga per porsi dari budget yang sudah ada (jika ada) atau dari default
    // Coba ambil dari budget periode lain untuk kategori yang sama
    const [hargaReferensi] = await db.query(
      `SELECT b1.kategori_penerima, b1.harga_per_porsi
       FROM budget b1
       INNER JOIN (
         SELECT kategori_penerima, MAX(periode) as max_periode
         FROM budget WHERE tenant_id=? AND periode < ? AND harga_per_porsi > 0
         GROUP BY kategori_penerima
       ) b2 ON b1.kategori_penerima = b2.kategori_penerima AND b1.periode = b2.max_periode`,
      [t, periode]
    );
    const hargaRefMap = {};
    for (const h of hargaReferensi) hargaRefMap[h.kategori_penerima] = Number(h.harga_per_porsi);

    // Biaya operasional default: dari budget sebelumnya atau 0
    const [[{ ref_biaya_operasional } = { ref_biaya_operasional: 0 }]] = await db.query(
      `SELECT COALESCE(AVG(biaya_operasional),0) as ref_biaya_operasional
       FROM budget WHERE tenant_id=? AND periode < ? AND biaya_operasional > 0`,
      [t, periode]
    );

    // Buat entri budget untuk setiap kategori penerima
    let created = 0;
    for (const p of penerima) {
      const kategori = p.kategori_penerima;
      const jmlPenerima = Number(p.total_penerima);
      const harga = hargaRefMap[kategori] || 0;
      const biayaOp = Math.round(Number(ref_biaya_operasional) / Math.max(penerima.length, 1));
      const totalBudget = Math.round(harga * jmlPenerima * total_hari);

      await db.query(
        `INSERT INTO budget (tenant_id, periode, kategori_penerima, jumlah_penerima, harga_per_porsi, biaya_operasional, total_budget, realisasi, catatan)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'Auto-generate dari RAB Sinkron')`,
        [t, periode, kategori, jmlPenerima, harga, biayaOp, totalBudget]
      );
      created++;
    }

    // Jika tidak ada penerima, buat satu entri default
    if (created === 0) {
      const biayaOp = Math.round(Number(ref_biaya_operasional) || 0);
      await db.query(
        `INSERT INTO budget (tenant_id, periode, kategori_penerima, jumlah_penerima, harga_per_porsi, biaya_operasional, total_budget, realisasi, catatan)
         VALUES (?, ?, 'Umum', 0, 0, ?, 0, 0, 'Auto-generate (default)')`,
        [t, periode, biayaOp]
      );
      created = 1;
    }

    res.json({
      message: 'Budget berhasil digenerate',
      periode,
      total_hari,
      kategori_count: created,
      created,
    });
  } catch (err) {
    console.error('RAB generate budget error:', err);
    res.status(500).json({ error: err.message });
  }
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

// 14. Laporan Arus Kas (Cash Flow) - Keuangan/Admin
router.get('/laporan/arus-kas', roleFinance, async (req, res) => {
  const t = req.user.tenant_id;
  const { bulan, tahun } = req.query;
  const now = new Date();
  const filterBulan = bulan || String(now.getMonth() + 1).padStart(2, '0');
  const filterTahun = tahun || String(now.getFullYear());
  const startDate = `${filterTahun}-${filterBulan}-01`;
  const [y, m] = [parseInt(filterTahun), parseInt(filterBulan)];
  const endDate = new Date(y, m, 1).toISOString().slice(0, 10);

  // Saldo awal (sebelum periode ini)
  const [[{ saldo_awal_tenant } = { saldo_awal_tenant: 0 }]] = await db.query(
    'SELECT COALESCE(saldo_awal,0) AS saldo_awal_tenant FROM tenants WHERE id=?', [t]
  );
  const [[{ saldo_sebelum } = { saldo_sebelum: 0 }]] = await db.query(
    `SELECT COALESCE(SUM(CASE WHEN tipe='masuk' THEN jumlah ELSE -jumlah END), 0) AS saldo_sebelum
     FROM kas_bank WHERE tenant_id=? AND tanggal < ?`,
    [t, startDate]
  );
  const saldoAwal = Number(saldo_awal_tenant) + Number(saldo_sebelum);

  // Transaksi periode ini
  const [transaksi] = await db.query(
    `SELECT k.*, a.kelompok, a.kode as akun_kode, a.nama as akun_nama
     FROM kas_bank k
     LEFT JOIN akun a ON a.id = k.akun_id
     WHERE k.tenant_id=? AND k.tanggal >= ? AND k.tanggal < ?
     ORDER BY k.tanggal ASC, k.id ASC`,
    [t, startDate, endDate]
  );

  // Kas Masuk per kategori
  const masukKat = {};
  let totalMasuk = 0;
  for (const trx of transaksi.filter(k => k.tipe === 'masuk')) {
    const kat = trx.kategori || 'Penerimaan Dana';
    if (!masukKat[kat]) masukKat[kat] = { kategori: kat, jumlah: 0, transaksi: [] };
    masukKat[kat].jumlah += Number(trx.jumlah);
    masukKat[kat].transaksi.push({ id: trx.id, tanggal: trx.tanggal, deskripsi: trx.deskripsi, jumlah: Number(trx.jumlah) });
    totalMasuk += Number(trx.jumlah);
  }

  // Kas Keluar per kategori
  const keluarKat = {};
  let totalKeluar = 0;
  for (const trx of transaksi.filter(k => k.tipe === 'keluar')) {
    const kat = trx.kategori || 'Lainnya';
    if (!keluarKat[kat]) keluarKat[kat] = { kategori: kat, jumlah: 0, transaksi: [] };
    keluarKat[kat].jumlah += Number(trx.jumlah);
    keluarKat[kat].transaksi.push({ id: trx.id, tanggal: trx.tanggal, deskripsi: trx.deskripsi, jumlah: Number(trx.jumlah) });
    totalKeluar += Number(trx.jumlah);
  }

  const saldoAkhir = saldoAwal + totalMasuk - totalKeluar;

  res.json({
    periode: `${filterTahun}-${filterBulan}`,
    saldo_awal: saldoAwal,
    kas_masuk: {
      total: totalMasuk,
      rincian: Object.values(masukKat).sort((a, b) => b.jumlah - a.jumlah),
    },
    kas_keluar: {
      total: totalKeluar,
      rincian: Object.values(keluarKat).sort((a, b) => b.jumlah - a.jumlah),
    },
    selisih: totalMasuk - totalKeluar,
    saldo_akhir: saldoAkhir,
  });
});

// ===== RAB Sinkron — otomatis dari data aktual, plus realisasi =====
router.get('/laporan/rab-sinkron', roleOps, async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const periode = req.query.periode || new Date().toISOString().slice(0, 7);

    let [[{ total_hari }]] = await db.query(
      `SELECT COUNT(DISTINCT tanggal_produksi) as total_hari
       FROM produksi WHERE tenant_id=? AND DATE_FORMAT(tanggal_produksi, '%Y-%m')=?`,
      [t, periode]
    );
    if (!total_hari) {
      const [[{ siklus_hari }]] = await db.query(
        `SELECT COALESCE(MAX(total_hari), 0) as siklus_hari
         FROM siklus_menu WHERE tenant_id=? AND status IN ('Aktif','Draft')`,
        [t]
      );
      total_hari = siklus_hari || 0;
    }

    const JENJANG_DISPLAY_ORDER = ['TK/PAUD', 'SD/MI (1-3)', 'SD/MI (4-6)', 'SMP/MTs, SMA/SMK', 'Bumil/Busui', 'Balita'];
    const JENJANG_DB_MAP = {
      'TK/PAUD': ['TK/PAUD', 'TK', 'PAUD'],
      'SD/MI (1-3)': ['SD 1-3', 'SD/MI (1-3)', 'SD'],
      'SD/MI (4-6)': ['SD 4-6', 'SD/MI (4-6)'],
      'SMP/MTs, SMA/SMK': ['SMP', 'SMA', 'SMP/MTs, SMA/SMK'],
      'Bumil/Busui': ['Ibu Hamil', 'Ibu Menyusui', 'Bumil/Busui'],
      'Balita': ['Balita'],
    };
    const dbToDisplay = {};
    for (const [display, dbVals] of Object.entries(JENJANG_DB_MAP)) {
      for (const dv of dbVals) dbToDisplay[dv] = display;
    }

    const [penerima] = await db.query(
      `SELECT kategori_penerima, SUM(paket_besar + paket_kecil) as total_penerima
       FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima IS NOT NULL
       GROUP BY kategori_penerima ORDER BY kategori_penerima`,
      [t]
    );

    const [hargaList] = await db.query(
      `SELECT kategori_penerima, harga_per_porsi, total_budget, realisasi FROM budget
       WHERE tenant_id=? AND periode=?`,
      [t, periode]
    );
    const hargaMap = {};
    const budgetMap = {};
    const realisasiMap = {};
    for (const h of hargaList) {
      const displayKey = dbToDisplay[h.kategori_penerima] || h.kategori_penerima;
      hargaMap[displayKey] = Number(h.harga_per_porsi);
      budgetMap[displayKey] = Number(h.total_budget || 0);
      realisasiMap[displayKey] = Number(h.realisasi || 0);
    }

    // Realisasi dari kas_bank (Pembayaran Supplier)
    const [[{ realisasi_kas } = { realisasi_kas: 0 }]] = await db.query(
      `SELECT COALESCE(SUM(jumlah),0) AS realisasi_kas
       FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
       AND kategori='Pembayaran Supplier'
       AND DATE_FORMAT(tanggal, '%Y-%m')=?`,
      [t, periode]
    );

    // Total budget dari tabel budget
    const [[budgetAgg]] = await db.query(
      `SELECT COALESCE(SUM(total_budget),0) AS total_budget,
              COALESCE(SUM(realisasi),0) AS total_realisasi_manual
       FROM budget WHERE tenant_id=? AND periode=?`,
      [t, periode]
    );
    const totalBudgetAgg = Number(budgetAgg.total_budget) || 0;
    const totalRealisasiManual = Number(budgetAgg.total_realisasi_manual) || 0;

    // Realisasi total dari kas_bank (semua pengeluaran)
    const [[{ total_biaya_kas } = { total_biaya_kas: 0 }]] = await db.query(
      `SELECT COALESCE(SUM(jumlah),0) AS total_biaya_kas
       FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
       AND DATE_FORMAT(tanggal, '%Y-%m')=?`,
      [t, periode]
    );

    let grandPenerima = 0;
    let grandTotal = 0;
    const rows = penerima.map(p => {
      const kategori = dbToDisplay[p.kategori_penerima] || p.kategori_penerima;
      const harga = hargaMap[kategori] || 0;
      const jmlPenerima = Number(p.total_penerima);
      const jmlHari = total_hari || 0;
      const total = harga * jmlPenerima * jmlHari;
      grandPenerima += jmlPenerima;
      grandTotal += total;
      return {
        kategori,
        harga_per_porsi: harga,
        jumlah_penerima: jmlPenerima,
        jumlah_hari: jmlHari,
        budget: budgetMap[kategori] || 0,
        realisasi: realisasiMap[kategori] || 0,
        total,
      };
    });

    const selisih = totalBudgetAgg - totalRealisasiManual;
    const serapan = totalBudgetAgg > 0 ? (totalRealisasiManual / totalBudgetAgg * 100) : 0;

    res.json({
      rows,
      grand_penerima: grandPenerima,
      grand_total: grandTotal,
      total_hari: total_hari || 0,
      periode,
      // Budget & realisasi summary
      budget: {
        total_budget: totalBudgetAgg,
        total_realisasi_manual: totalRealisasiManual,
        total_realisasi_kas: realisasi_kas,
        total_biaya_kas: total_biaya_kas,
        selisih,
        serapan_persen: serapan,
      },
    });
  } catch (err) {
    console.error('RAB sinkron error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== RAB Hitung Realisasi — auto-hitung budget.realisasi dari kas_bank =====
router.post('/laporan/rab-hitung-realisasi', roleFinance, async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const { periode } = req.body;

    if (!periode) {
      return res.status(400).json({ error: 'Periode wajib diisi (YYYY-MM)' });
    }

    // Hitung realisasi dari kas_bank per periode
    const [rows] = await db.query(
      `SELECT DATE_FORMAT(tanggal, '%Y-%m') AS periode,
              COALESCE(SUM(jumlah),0) AS total_keluar
       FROM kas_bank
       WHERE tenant_id=? AND tipe='keluar'
         AND DATE_FORMAT(tanggal, '%Y-%m')=?
       GROUP BY DATE_FORMAT(tanggal, '%Y-%m')`,
      [t, periode]
    );

    const totalRealisasi = rows.length > 0 ? Number(rows[0].total_keluar) : 0;

    // Update budget.realisasi untuk periode ini
    // Bagi rata ke semua item budget di periode yang sama
    const [budgetItems] = await db.query(
      `SELECT id FROM budget WHERE tenant_id=? AND periode=?`,
      [t, periode]
    );

    if (budgetItems.length === 0) {
      return res.json({ message: 'Tidak ada budget untuk periode ' + periode, updated: 0, totalRealisasi });
    }

    // Bagi realisasi merata ke semua item budget
    const perItem = Math.round(totalRealisasi / budgetItems.length);
    for (const item of budgetItems) {
      await db.query(
        `UPDATE budget SET realisasi=? WHERE id=? AND tenant_id=?`,
        [perItem, item.id, t]
      );
    }

    res.json({
      message: 'Realisasi berhasil dihitung',
      periode,
      totalRealisasi,
      item_count: budgetItems.length,
      per_item: perItem,
      updated: budgetItems.length,
    });
  } catch (err) {
    console.error('RAB hitung realisasi error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== RAB Hitung Realisasi — auto-hitung semua periode =====
router.post('/laporan/rab-hitung-realisasi-semua', roleFinance, async (req, res) => {
  try {
    const t = req.user.tenant_id;

    // Dapatkan semua periode unik dari budget
    const [periodeList] = await db.query(
      `SELECT DISTINCT periode FROM budget WHERE tenant_id=? ORDER BY periode`,
      [t]
    );

    let totalUpdated = 0;
    const results = [];

    for (const { periode } of periodeList) {
      // Hitung realisasi dari kas_bank
      const [[{ totalRealisasi } = { totalRealisasi: 0 }]] = await db.query(
        `SELECT COALESCE(SUM(jumlah),0) AS totalRealisasi
         FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
           AND DATE_FORMAT(tanggal, '%Y-%m')=?`,
        [t, periode]
      );

      // Dapatkan item budget
      const [budgetItems] = await db.query(
        `SELECT id FROM budget WHERE tenant_id=? AND periode=?`,
        [t, periode]
      );

      if (budgetItems.length > 0) {
        const perItem = Math.round(Number(totalRealisasi) / budgetItems.length);
        for (const item of budgetItems) {
          await db.query(
            `UPDATE budget SET realisasi=? WHERE id=? AND tenant_id=?`,
            [perItem, item.id, t]
          );
        }
        totalUpdated += budgetItems.length;
        results.push({ periode, realisasi: totalRealisasi, items: budgetItems.length });
      }
    }

    res.json({
      message: 'Semua realisasi berhasil dihitung ulang',
      total_periode: periodeList.length,
      total_updated: totalUpdated,
      results,
    });
  } catch (err) {
    console.error('RAB hitung realisasi semua error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== RAB Pembelian per Supplier/Koperasi — gabungan RAB dengan realisasi pembelian =====
router.get('/laporan/rab-pembelian-suplier', roleOps, async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const periode = req.query.periode || new Date().toISOString().slice(0, 7);
    const filterTahun = periode.slice(0, 4);
    const filterBulan = periode.slice(5, 7);

    // 1. RAB Budget periode ini
    const [[budgetRow]] = await db.query(
      `SELECT COALESCE(SUM(total_budget), 0) AS total_budget,
              COALESCE(SUM(realisasi), 0) AS total_realisasi,
              COALESCE(AVG(harga_per_porsi), 0) AS rata_harga_per_porsi,
              COUNT(*) AS item_count
       FROM budget WHERE tenant_id=? AND periode=?`,
      [t, periode]
    );

    // 2. Total penerima manfaat
    const [[penerimaRow]] = await db.query(
      `SELECT COALESCE(SUM(paket_besar + paket_kecil), 0) AS total_penerima
       FROM penerima_manfaat WHERE tenant_id=?`,
      [t]
    );

    // 3. Hari produksi periode ini
    const [[{ total_hari } = { total_hari: 0 }]] = await db.query(
      `SELECT COUNT(DISTINCT tanggal_produksi) AS total_hari
       FROM produksi WHERE tenant_id=? AND DATE_FORMAT(tanggal_produksi, '%Y-%m')=?`,
      [t, periode]
    );

    // 4. Purchase Orders per supplier (grouped by supplier_nama)
    const [poRows] = await db.query(
      `SELECT supplier_nama,
              COUNT(*) AS total_po,
              SUM(total_nilai) AS total_nilai,
              SUM(CASE WHEN status='Draft' THEN 1 ELSE 0 END) AS draft_count,
              SUM(CASE WHEN status='Disetujui' THEN 1 ELSE 0 END) AS disetujui_count,
              SUM(CASE WHEN status='Dikirim' THEN 1 ELSE 0 END) AS dikirim_count,
              SUM(CASE WHEN status='Diterima' THEN 1 ELSE 0 END) AS diterima_count,
              SUM(CASE WHEN status='Dibayar' THEN 1 ELSE 0 END) AS dibayar_count,
              MAX(tanggal) AS last_po_tanggal
       FROM purchase_order
       WHERE tenant_id=? AND DATE_FORMAT(tanggal, '%Y-%m')=?
       GROUP BY supplier_nama
       ORDER BY total_nilai DESC`,
      [t, periode]
    );

    const totalBelanjaPO = poRows.reduce((s, r) => s + Number(r.total_nilai), 0);
    const grandBudget = Number(budgetRow.total_budget) || 0;

    // Map supplier dengan persentase budget
    const suppliers = poRows.map(r => ({
      supplier_nama: r.supplier_nama || '(Tanpa Nama)',
      total_po: Number(r.total_po),
      total_nilai: Number(r.total_nilai),
      porsi_budget: grandBudget > 0 ? (Number(r.total_nilai) / grandBudget * 100) : 0,
      status: {
        draft: Number(r.draft_count),
        disetujui: Number(r.disetujui_count),
        dikirim: Number(r.dikirim_count),
        diterima: Number(r.diterima_count),
        dibayar: Number(r.dibayar_count),
      },
      last_po_tanggal: r.last_po_tanggal,
    }));

    // 5. Koperasi view — parse item JSON dari PO untuk extract id_koperasi
    const [allPoItems] = await db.query(
      `SELECT id, no_po, supplier_nama, tanggal, item, total_nilai
       FROM purchase_order
       WHERE tenant_id=? AND DATE_FORMAT(tanggal, '%Y-%m')=?
         AND item IS NOT NULL AND item != '[]'
       ORDER BY tanggal DESC`,
      [t, periode]
    );

    const koperasiMap = {}; // id_koperasi -> { id_koperasi, nama_koperasi, total_nilai, supplier_set, bahan_ids, po_count }
    const bahanKoperasiMap = {}; // bahan_baku_id -> id_koperasi

    // Collect all bahan_baku_ids from items
    const allBahanIds = new Set();
    for (const po of allPoItems) {
      try {
        const items = JSON.parse(po.item || '[]');
        for (const it of items) {
          if (it.bahan_baku_id) allBahanIds.add(it.bahan_baku_id);
        }
      } catch (e) { /* skip invalid JSON */ }
    }

    // Lookup id_koperasi for all bahan_baku_ids
    if (allBahanIds.size) {
      const ids = [...allBahanIds];
      const ph = ids.map(() => '?').join(',');
      const [bahanRows] = await db.query(
        `SELECT id, id_koperasi, nama FROM bahan_baku WHERE id IN (${ph}) AND tenant_id=?`,
        [...ids, t]
      );
      for (const br of bahanRows) {
        if (br.id_koperasi) {
          bahanKoperasiMap[br.id] = { id_koperasi: br.id_koperasi, nama: br.nama };
        }
      }
    }

    // Group PO items by koperasi
    for (const po of allPoItems) {
      try {
        const items = JSON.parse(po.item || '[]');
        for (const it of items) {
          const kb = it.bahan_baku_id ? bahanKoperasiMap[it.bahan_baku_id] : null;
          if (!kb) continue;
          const kId = kb.id_koperasi;
          if (!koperasiMap[kId]) {
            koperasiMap[kId] = {
              id_koperasi: kId,
              nama: kb.nama,
              total_nilai: 0,
              supplier_set: new Set(),
              po_count: 0,
              po_set: new Set(),
            };
          }
          // Hitung proporsional nilai berdasarkan item
          const itemQty = Number(it.total_qty || it.jumlah || 0);
          const itemHarga = Number(it.harga_satuan || 0);
          const itemNilai = itemQty * itemHarga;
          // Atau gunakan total_nilai PO dibagi jumlah item (approximation)
          // Lebih akurat: sum of item subtotals
          const subTotal = Number(it.estimated_subtotal || it.subtotal || (itemQty * itemHarga) || 0);
          koperasiMap[kId].total_nilai += subTotal;
          koperasiMap[kId].supplier_set.add(po.supplier_nama || 'Unknown');
          koperasiMap[kId].po_set.add(po.id);
        }
      } catch (e) { /* skip */ }
    }

    const koperasiView = Object.values(koperasiMap).map(k => ({
      id_koperasi: k.id_koperasi,
      nama_koperasi: k.nama,
      total_nilai: k.total_nilai,
      supplier_count: k.supplier_set.size,
      po_count: k.po_set.size,
      suppliers: [...k.supplier_set],
    })).sort((a, b) => b.total_nilai - a.total_nilai);

    // 6. Pembayaran dari kas_bank (realisasi bayar untuk PO periode ini)
    const [[{ total_bayar } = { total_bayar: 0 }]] = await db.query(
      `SELECT COALESCE(SUM(jumlah),0) AS total_bayar
       FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
       AND kategori='Pembayaran Supplier'
       AND DATE_FORMAT(tanggal, '%Y-%m')=?`,
      [t, periode]
    );

    const suppliersWithPayment = suppliers.map(s => ({
      ...s,
      total_bayar: totalBelanjaPO > 0 ? Math.round(Number(s.total_nilai) / totalBelanjaPO * total_bayar) : 0,
      sisa_tagihan: Number(s.total_nilai) - (totalBelanjaPO > 0 ? Math.round(Number(s.total_nilai) / totalBelanjaPO * total_bayar) : 0),
    }));

    const sisa_bayar = totalBelanjaPO - total_bayar;

    res.json({
      periode,
      budget: {
        total_budget: Number(budgetRow.total_budget),
        total_realisasi: Number(budgetRow.total_realisasi),
        rata_harga_per_porsi: Number(budgetRow.rata_harga_per_porsi),
        item_count: Number(budgetRow.item_count),
        sisa: Number(budgetRow.total_budget) - Number(budgetRow.total_realisasi),
      },
      penerima: {
        total_penerima: Number(penerimaRow.total_penerima),
        total_hari: Number(total_hari),
      },
      suppliers: suppliersWithPayment,
      koperasi: koperasiView,
      grand_total_po: totalBelanjaPO,
      total_budget: grandBudget,
      total_bayar,
      sisa_bayar,
      selisih: grandBudget - totalBelanjaPO,
      serapan_persen: grandBudget > 0 ? (totalBelanjaPO / grandBudget * 100) : 0,
    });
  } catch (err) {
    console.error('RAB Pembelian Supplier error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
