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
  // Mengambil ID tenant dari objek user yang disisipkan oleh middleware requireAuth
  const t = req.user.tenant_id;
  
  // Mengambil seluruh riwayat transaksi kas/bank milik tenant tersebut, 
  // diurutkan dari yang paling baru (tanggal DESC)
  const [rows] = await db.query('SELECT * FROM kas_bank WHERE tenant_id=? ORDER BY tanggal DESC', [t]);
  
  // Kalkulasi Total Pemasukan:
  // 1. Filter array 'rows' hanya untuk transaksi dengan tipe 'masuk'
  // 2. Gunakan reduce() untuk menjumlahkan nilai 'jumlah' dari setiap baris
  // 3. Number(r.jumlah) digunakan untuk memastikan tipe datanya adalah angka sebelum dijumlahkan
  const masuk = rows.filter(r => r.tipe === 'masuk').reduce((s, r) => s + Number(r.jumlah), 0);
  
  // Kalkulasi Total Pengeluaran:
  // Logika yang sama dengan pemasukan, namun difilter berdasarkan tipe 'keluar'
  const keluar = rows.filter(r => r.tipe === 'keluar').reduce((s, r) => s + Number(r.jumlah), 0);
  
  // Mengirimkan respons JSON yang berisi ringkasan data:
  // - Total uang masuk
  // - Total uang keluar
  // - Saldo akhir (masuk dikurangi keluar)
  // - Detail seluruh transaksi (untuk ditampilkan di tabel UI frontend)
  res.json({ 
    total_kas_masuk: masuk, 
    total_kas_keluar: keluar, 
    saldo: masuk - keluar, 
    transaksi: rows 
  });
});

module.exports = router;

/* * CATATAN OPTIMASI UNTUK SKALA BESAR:
 * Pendekatan di atas (menghitung total menggunakan filter & reduce di Node.js) sangat baik dan praktis 
 * jika jumlah datanya masih ratusan/ribuan.
 * * Namun, jika data transaksi sudah mencapai puluhan ribu baris, menarik semua data ke memori Node.js 
 * hanya untuk dijumlahkan akan membebani RAM server. Pada kondisi tersebut, sangat disarankan 
 * untuk memindahkan beban kalkulasi ke Database menggunakan SQL (misal: melakukan query 
 * SELECT SUM(jumlah) WHERE tipe='masuk').
 */