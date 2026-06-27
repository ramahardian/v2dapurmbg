const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// 1. Laporan Pembelian (PO)
router.get('/laporan/pembelian', async (req, res) => {
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

// 2. Laporan Penerimaan Barang
router.get('/laporan/penerimaan', async (req, res) => {
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

// 3. Mutasi Stok
router.get('/laporan/mutasi-stok', async (req, res) => {
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

// 4. Laporan Produksi
router.get('/laporan/produksi', async (req, res) => {
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

// 5. Laporan Payroll
router.get('/laporan/payroll', async (req, res) => {
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

// 6. Laba/Rugi
router.get('/laporan/laba-rugi', async (req, res) => {
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
  // Tambah biaya gaji
  const [gaji] = await db.query(
    `SELECT COALESCE(SUM(total_gaji),0) as total FROM payroll WHERE tenant_id=? AND status='Dibayar'`,
    [req.user.tenant_id]
  );
  const totalGaji = Number(gaji[0]?.total || 0);
  // Tambah biaya pembelian (PO yang Dibayar)
  const [pembelian] = await db.query(
    `SELECT COALESCE(SUM(total_nilai),0) as total FROM purchase_order WHERE tenant_id=? AND status='Dibayar'`,
    [req.user.tenant_id]
  );
  const totalPembelian = Number(pembelian[0]?.total || 0);
  const totalBiayaAll = totalBiaya + totalGaji + totalPembelian;
  res.json({ rows, totalPendapatan, totalBiayaAll, totalGaji, totalPembelian, labaRugi: totalPendapatan - totalBiayaAll });
});

// 7. HPP per Menu
router.get('/laporan/hpp', async (req, res) => {
  const [menus] = await db.query(
    `SELECT m.id, m.nama, m.gramasi_total, m.kategori_penerima,
            COALESCE(SUM(mb.jumlah * bb.harga_satuan), 0) as total_biaya_bahan
     FROM menu m
     LEFT JOIN menu_bahan mb ON mb.menu_id = m.id
     LEFT JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
     WHERE m.tenant_id=?
     GROUP BY m.id ORDER BY m.nama`,
    [req.user.tenant_id]
  );
  const rows = menus.map(m => ({
    ...m,
    hpp_per_porsi: m.gramasi_total > 0 ? Math.round(Number(m.total_biaya_bahan) / (Number(m.gramasi_total) / 100)) : 0,
  }));
  const rataHPP = rows.length ? Math.round(rows.reduce((s, r) => s + r.hpp_per_porsi, 0) / rows.length) : 0;
  res.json({ rows, stats: { total_menu: rows.length, rata_hpp: rataHPP, total_biaya: rows.reduce((s, r) => s + Number(r.total_biaya_bahan), 0) } });
});

module.exports = router;
