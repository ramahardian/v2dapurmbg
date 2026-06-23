const express = require('express');
const db = require('../db');
// Mengimpor middleware autentikasi untuk memvalidasi akses dan mendapatkan tenant_id
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Terapkan perlindungan endpoint agar hanya bisa diakses oleh pengguna yang sudah login
router.use(requireAuth);
// Terapkan role-based access control: hanya admin dan ahli_gizi yang bisa akses
router.use(requireRole('admin', 'ahli_gizi'));

/**
 * POST /hpp/calculate
 * Endpoint kalkulator untuk menghitung Harga Pokok Produksi (HPP) dari sebuah menu.
 * HPP dihitung berdasarkan biaya bahan baku, ditambah biaya tenaga kerja dan overhead (opsional).
 */
router.post('/hpp/calculate', async (req, res) => {
  // 1. Ekstrak data dari request body.
  // Jika biaya_tenaga_kerja atau biaya_overhead tidak dikirim dari frontend, set nilai default ke 0.
  const { menu_id, jumlah_porsi, biaya_tenaga_kerja = 0, biaya_overhead = 0 } = req.body;
  
  // 2. Validasi Menu: Pastikan menu yang diminta ada dan milik tenant yang sedang aktif
  const [[menu]] = await db.query('SELECT * FROM menu WHERE id=? AND tenant_id=?', [menu_id, req.user.tenant_id]);
  if (!menu) return res.status(404).json({ error: 'Menu tidak ditemukan' });
  
  // 3. Ambil daftar bahan baku yang dibutuhkan untuk 1 porsi menu tersebut
  // JOIN digunakan untuk mengambil nama bahan, satuan, dan harga satuannya secara bersamaan
  const [bahan] = await db.query(
    `SELECT mb.jumlah, bb.nama, bb.satuan, bb.harga_satuan 
     FROM menu_bahan mb 
     JOIN bahan_baku bb ON bb.id=mb.bahan_baku_id 
     WHERE mb.menu_id=?`,
    [menu_id]
  );
  
  let perPorsi = 0; // Variabel untuk menyimpan total biaya bahan baku untuk 1 porsi
  
  // 4. Kalkulasi Biaya Bahan Baku per Item
  const detail = bahan.map(b => {
    // subtotal bahan = kebutuhan gramasi per porsi * harga per gram/satuan
    const sub = Number(b.jumlah) * Number(b.harga_satuan); 
    
    // Akumulasikan ke total biaya bahan per porsi
    perPorsi += sub; 
    
    // Kembalikan objek detail untuk dilampirkan di laporan JSON (berguna untuk struk/tabel detail)
    return { nama: b.nama, jumlah: b.jumlah, satuan: b.satuan, harga_satuan: b.harga_satuan, subtotal: sub };
  });
  
  // 5. Kalkulasi Total Keseluruhan (Bahan Baku + Tenaga Kerja + Overhead)
  const totalBahan = perPorsi * Number(jumlah_porsi); // Total biaya bahan untuk seluruh porsi yang dipesan
  const tk = Number(biaya_tenaga_kerja); // Konversi ke Number untuk mencegah bug string concatenation
  const oh = Number(biaya_overhead);
  
  // Total HPP keseluruhan = Biaya Bahan + Biaya Pekerja + Biaya Lain-lain (Overhead/Gas/Listrik dll)
  const totalHpp = totalBahan + tk + oh;
  
  // 6. Kirim hasil kalkulasi ke frontend
  res.json({
    menu_nama: menu.nama,
    jumlah_porsi: Number(jumlah_porsi),
    detail_bahan: detail, // Rincian biaya per bahan (Array)
    biaya_bahan_per_porsi: perPorsi, // Modal bahan untuk 1 porsi
    total_biaya_bahan: totalBahan, // Modal bahan untuk X porsi
    biaya_tenaga_kerja: tk,
    biaya_overhead: oh,
    total_hpp: totalHpp, // Total seluruh biaya (Grand Total)
    // HPP Final per Porsi = Grand Total dibagi jumlah porsi. 
    // Menggunakan ternary operator (jumlah_porsi ? ...) untuk mencegah error "Division by Zero" (dibagi 0)
    hpp_per_porsi: jumlah_porsi ? totalHpp / Number(jumlah_porsi) : 0, 
  });
});

module.exports = router;