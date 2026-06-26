const express = require('express');
const db = require('../db');
// Mengimpor middleware autentikasi (misal: memvalidasi JWT/Supabase token)
// Middleware ini memastikan hanya user yang login yang bisa mengakses route di bawahnya,
// serta menyisipkan data req.user (seperti tenant_id)
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Terapkan middleware requireAuth ke semua endpoint di dalam router ini
router.use(requireAuth);

/**
 * GET /laporan/keuangan
 * Endpoint untuk menghasilkan ringkasan laporan arus kas (masuk/keluar)
 * dan menghitung total saldo saat ini berdasarkan riwayat transaksi.
 */
router.get('/laporan/keuangan', async (req, res) => {
  const t = req.user.tenant_id;
  
  const [[{ masuk } = { masuk: 0 }]] = await db.query(
    'SELECT COALESCE(SUM(jumlah),0) AS masuk FROM kas_bank WHERE tenant_id=? AND tipe="masuk"', [t]
  );
  const [[{ keluar } = { keluar: 0 }]] = await db.query(
    'SELECT COALESCE(SUM(jumlah),0) AS keluar FROM kas_bank WHERE tenant_id=? AND tipe="keluar"', [t]
  );
  const [rows] = await db.query('SELECT * FROM kas_bank WHERE tenant_id=? ORDER BY tanggal DESC', [t]);
  
  res.json({ 
    total_kas_masuk: Number(masuk), 
    total_kas_keluar: Number(keluar), 
    saldo: Number(masuk) - Number(keluar), 
    transaksi: rows 
  });
});

module.exports = router;