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
  // Menarik seluruh data bahan baku untuk menghitung total item dan mencari stok yang menipis.
  const [bb] = await db.query('SELECT * FROM bahan_baku WHERE tenant_id=?', [t]);
  
  // Melakukan filter di level Node.js: mencari item yang stok saat ini kurang dari batas minimum (reorder point)
  const low = bb.filter(b => Number(b.stok_saat_ini) < Number(b.stok_minimum));
  
  // 5. Susun dan kirimkan respons JSON untuk dikonsumsi oleh UI Dashboard
  res.json({
    total_penerima_manfaat: Number(pm.total),
    paket_besar: Number(pm.paket_besar),
    paket_kecil: Number(pm.paket_kecil),
    total_porsi_diproduksi: Number(pr.total),
    
    // Status Anggaran
    total_budget: Number(bd.tb),
    total_realisasi: Number(bd.tr),
    selisih_budget: Number(bd.tb) - Number(bd.tr), // Sisa anggaran yang belum terserap
    
    // Status Gudang
    jumlah_bahan_baku: bb.length, // Total variasi bahan di gudang
    stok_menipis: low.length, // Indikator badge (angka merah) untuk alert stok menipis
    
    // Ambil maksimal 5 item pertama yang stoknya menipis untuk ditampilkan di tabel/list mini dashboard
    low_stock_items: low.slice(0, 5).map(b => ({ 
      nama: b.nama, 
      stok: b.stok_saat_ini, 
      min: b.stok_minimum, 
      satuan: b.satuan 
    })),
  });
});

module.exports = router;

/* * CATATAN OPTIMASI:
 * Pada baris pengecekan persediaan: `const [bb] = await db.query('SELECT * FROM bahan_baku WHERE tenant_id=?', [t]);`
 * Menarik SELURUH data bahan baku (SELECT *) hanya untuk menghitung total dan memfilter stok menipis 
 * bisa menjadi lambat jika tenant tersebut memiliki ribuan item bahan baku.
 * * Alternatif yang lebih cepat (beban ada di Database, bukan RAM server):
 * 1. Query Total Bahan: 
 * SELECT COUNT(*) as total_item FROM bahan_baku WHERE tenant_id=?
 * 2. Query Stok Menipis (Hanya tarik yang kurang dari minimum dengan LIMIT):
 * SELECT nama, stok_saat_ini, stok_minimum, satuan FROM bahan_baku 
 * WHERE tenant_id=? AND stok_saat_ini < stok_minimum LIMIT 5
 */