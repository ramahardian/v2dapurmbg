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

module.exports = router;

