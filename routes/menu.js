const express = require('express');
const db = require('../db');
// Mengimpor middleware untuk memvalidasi sesi pengguna (misalnya via token Supabase)
// Middleware ini menyisipkan req.user yang berisi informasi seperti tenant_id
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Menerapkan middleware autentikasi secara global pada router ini
// Semua endpoint di bawah ini hanya bisa diakses oleh pengguna yang sudah login
router.use(requireAuth);

/**
 * GET /menu
 * Mengambil daftar semua menu yang dimiliki oleh tenant yang sedang aktif.
 * Endpoint ini juga mengambil detail bahan baku pembentuk setiap menu.
 */
router.get('/menu', async (req, res) => {
  // Mengambil data utama (header) dari tabel menu
  const [menus] = await db.query('SELECT * FROM menu WHERE tenant_id=? ORDER BY id DESC', [req.user.tenant_id]);
  
  // Looping untuk mengambil komposisi bahan (ingredients) pada masing-masing menu.
  // Catatan: Pendekatan ini (query di dalam loop) dikenal sebagai N+1 query. 
  // Untuk data skala besar, lebih optimal menggunakan query JOIN tunggal lalu dikelompokkan di sisi server.
  for (const m of menus) {
    const [bahan] = await db.query(
      `SELECT mb.*, bb.nama, bb.satuan FROM menu_bahan mb JOIN bahan_baku bb ON bb.id=mb.bahan_baku_id WHERE mb.menu_id=?`,
      [m.id]);
    // Menyisipkan array bahan baku ke dalam objek menu saat ini
    m.bahan = bahan;
  }
  
  res.json(menus);
});

/**
 * POST /menu
 * Membuat menu baru beserta komposisi bahan-bahannya.
 * Menggunakan Database Transaction untuk memastikan integritas data (header dan detail tersimpan bersamaan).
 */
router.post('/menu', async (req, res) => {
  const { nama, kategori_penerima, deskripsi, gramasi_total, kalori, protein, karbohidrat, lemak, serat, bahan } = req.body;
  const conn = await db.getConnection(); // Mengambil koneksi database dari pool
  
  try {
    await conn.beginTransaction(); // Memulai transaksi
    
    // 1. Simpan data header menu
    const [r] = await conn.query(
      `INSERT INTO menu (tenant_id, nama, kategori_penerima, deskripsi, gramasi_total, kalori, protein, karbohidrat, lemak, serat)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.user.tenant_id, nama, kategori_penerima || null, deskripsi || null, gramasi_total || 0, kalori || 0, protein || 0, karbohidrat || 0, lemak || 0, serat || 0]);
      
    // 2. Jika ada data bahan baku, simpan ke tabel relasi (menu_bahan)
    if (Array.isArray(bahan)) {
      for (const b of bahan) {
        // Validasi sederhana memastikan bahan_baku_id dan jumlah dikirim oleh client
        if (b.bahan_baku_id && b.jumlah) {
          await conn.query('INSERT INTO menu_bahan (menu_id, bahan_baku_id, jumlah) VALUES (?,?,?)', [r.insertId, b.bahan_baku_id, b.jumlah]);
        }
      }
    }
    
    await conn.commit(); // Permanenkan data ke database jika tidak ada error
    res.json({ id: r.insertId, ...req.body }); // Kembalikan response sukses
    
  } catch (e) { 
    await conn.rollback(); // Batalkan semua insert jika terjadi kegagalan di tengah proses
    console.error(e); 
    res.status(400).json({ error: 'Gagal' }); 
  } finally { 
    conn.release(); // Bebaskan koneksi kembali ke pool agar tidak terjadi memory leak
  }
});

/**
 * PUT /menu/:id
 * Memperbarui data menu dan komposisi bahannya.
 * Untuk tabel detail (menu_bahan), menggunakan metode "Delete & Re-insert".
 */
router.put('/menu/:id', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const f = req.body;
    
    // 1. Update data header menu sesuai ID dan kepemilikan tenant
    await conn.query(
      `UPDATE menu SET nama=?, kategori_penerima=?, deskripsi=?, gramasi_total=?, kalori=?, protein=?, karbohidrat=?, lemak=?, serat=? WHERE id=? AND tenant_id=?`,
      [f.nama, f.kategori_penerima || null, f.deskripsi || null, f.gramasi_total || 0, f.kalori || 0, f.protein || 0, f.karbohidrat || 0, f.lemak || 0, f.serat || 0, req.params.id, req.user.tenant_id]);
      
    // 2. Perbarui detail bahan baku
    if (Array.isArray(f.bahan)) {
      // Hapus seluruh relasi bahan lama yang terkait dengan menu ini
      await conn.query('DELETE FROM menu_bahan WHERE menu_id=?', [req.params.id]);
      
      // Masukkan ulang data bahan baku yang baru dikirimkan dari client
      for (const b of f.bahan) {
        if (b.bahan_baku_id && b.jumlah) {
          await conn.query('INSERT INTO menu_bahan (menu_id, bahan_baku_id, jumlah) VALUES (?,?,?)', [req.params.id, b.bahan_baku_id, b.jumlah]);
        }
      }
    }
    
    await conn.commit();
    res.json({ ok: true });
    
  } catch (e) { 
    await conn.rollback(); 
    res.status(400).json({ error: 'Gagal' }); 
  } finally { 
    conn.release(); 
  }
});

/**
 * DELETE /menu/:id
 * Menghapus data menu.
 * Catatan: Untuk mencegah data yatim (orphan data) di tabel menu_bahan,
 * pastikan Foreign Key di tabel tersebut sudah diset "ON DELETE CASCADE" pada level database.
 */
router.delete('/menu/:id', async (req, res) => {
  await db.query('DELETE FROM menu WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

module.exports = router;