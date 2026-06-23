const express = require('express');
const db = require('../db');
// Middleware autentikasi (Supabase) yang akan memvalidasi token 
// dan menyisipkan data user (termasuk tenant_id) ke dalam object req.user
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Menerapkan middleware autentikasi secara global untuk seluruh endpoint di router ini
router.use(requireAuth);
// Terapkan role-based access control: hanya admin dan ahli_gizi yang bisa akses
router.use(requireRole('admin', 'ahli_gizi'));

/**
 * GET /siklus
 * Mengambil semua data siklus menu milik tenant yang sedang login.
 * Data diurutkan dari yang terbaru (id DESC).
 */
router.get('/siklus', async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM siklus_menu WHERE tenant_id=? ORDER BY id DESC',
    [req.user.tenant_id]
  );
  res.json(rows);
});

/**
 * GET /siklus/:id
 * Mengambil detail satu siklus spesifik beserta seluruh item menu di dalamnya.
 */
router.get('/siklus/:id', async (req, res) => {
  // Ambil header siklus
  const [[siklus]] = await db.query(
    'SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?',
    [req.params.id, req.user.tenant_id]
  );
  
  if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });
  
  // Ambil detail hari dan menu dalam siklus tersebut
  const [items] = await db.query(
    'SELECT * FROM siklus_menu_item WHERE siklus_id=? ORDER BY hari_ke ASC',
    [req.params.id]
  );
  
  // Gabungkan header dan detail item ke dalam satu response
  res.json({ ...siklus, items });
});

/**
 * POST /siklus
 * Membuat siklus menu baru beserta item-itemnya.
 * Menggunakan DB Transaction agar jika terjadi error saat insert item, 
 * header siklus tidak terbuat separuh jalan (menjaga konsistensi data).
 */
router.post('/siklus', async (req, res) => {
  const { nama, kategori_penerima, jumlah_porsi, total_hari, status, catatan, items } = req.body;
  const conn = await db.getConnection(); // Pinjam koneksi dari pool untuk transaksi
  
  try {
    await conn.beginTransaction(); // Mulai transaksi
    
    // 1. Insert data utama/header siklus menu
    const [r] = await conn.query(
      `INSERT INTO siklus_menu (tenant_id, nama, kategori_penerima, jumlah_porsi, total_hari, status, catatan)
       VALUES (?,?,?,?,?,?,?)`,
      [req.user.tenant_id, nama, kategori_penerima || null, jumlah_porsi || 0, total_hari || 7, status || 'Draft', catatan || null]
    );
    
    // 2. Insert detail menu per hari (jika array items tersedia)
    if (Array.isArray(items) && items.length) {
      for (const it of items) {
        await conn.query(
          `INSERT INTO siklus_menu_item (siklus_id, hari_ke, hari_nama, menu_id, menu_nama, jumlah_porsi, kalori, protein, karbohidrat, lemak, serat)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [r.insertId, it.hari_ke, it.hari_nama, it.menu_id || null, it.menu_nama || null, it.jumlah_porsi || 0,
           it.kalori || 0, it.protein || 0, it.karbohidrat || 0, it.lemak || 0, it.serat || 0]
        );
      }
    }
    
    await conn.commit(); // Simpan permanen jika semua operasi sukses
    res.json({ id: r.insertId, ...req.body, tenant_id: req.user.tenant_id });
    
  } catch (e) { 
    await conn.rollback(); // Batalkan semua insert jika terjadi error
    console.error(e); 
    res.status(400).json({ error: 'Gagal menyimpan siklus' }); 
  } finally { 
    conn.release(); // Selalu kembalikan koneksi ke pool
  }
});

/**
 * PUT /siklus/:id
 * Memperbarui data siklus.
 * Strategi yang digunakan untuk detail item adalah "Delete & Re-insert" (Hapus semua item lama, lalu masukkan yang baru).
 */
router.put('/siklus/:id', async (req, res) => {
  const { nama, kategori_penerima, jumlah_porsi, total_hari, status, catatan, items } = req.body;
  const conn = await db.getConnection();
  
  try {
    await conn.beginTransaction();
    
    // 1. Update data header siklus
    await conn.query(
      `UPDATE siklus_menu SET nama=?, kategori_penerima=?, jumlah_porsi=?, total_hari=?, status=?, catatan=? WHERE id=? AND tenant_id=?`,
      [nama, kategori_penerima || null, jumlah_porsi || 0, total_hari || 7, status || 'Draft', catatan || null, req.params.id, req.user.tenant_id]
    );
    
    // 2. Hapus semua detail item lama berdasarkan siklus_id
    await conn.query('DELETE FROM siklus_menu_item WHERE siklus_id=?', [req.params.id]);
    
    // 3. Masukkan kembali detail item yang baru
    if (Array.isArray(items) && items.length) {
      for (const it of items) {
        await conn.query(
          `INSERT INTO siklus_menu_item (siklus_id, hari_ke, hari_nama, menu_id, menu_nama, jumlah_porsi, kalori, protein, karbohidrat, lemak, serat)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [req.params.id, it.hari_ke, it.hari_nama, it.menu_id || null, it.menu_nama || null, it.jumlah_porsi || 0,
           it.kalori || 0, it.protein || 0, it.karbohidrat || 0, it.lemak || 0, it.serat || 0]
        );
      }
    }
    
    await conn.commit();
    res.json({ ok: true });
    
  } catch (e) { 
    await conn.rollback(); 
    console.error(e); 
    res.status(400).json({ error: 'Gagal mengupdate siklus' }); 
  } finally { 
    conn.release(); 
  }
});

/**
 * DELETE /siklus/:id
 * Menghapus siklus. 
 * Catatan: Pastikan di struktur tabel database (MySQL/PostgreSQL), foreign key di `siklus_menu_item`
 * sudah dikonfigurasi dengan "ON DELETE CASCADE" agar baris item ikut terhapus secara otomatis.
 */
router.delete('/siklus/:id', async (req, res) => {
  await db.query('DELETE FROM siklus_menu WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

/**
 * GET /siklus/:id/laporan
 * Menghasilkan kalkulasi statistik dan laporan gizi dari sebuah siklus.
 */
router.get('/siklus/:id/laporan', async (req, res) => {
  // 1. Ambil header siklus
  const [[siklus]] = await db.query(
    'SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?',
    [req.params.id, req.user.tenant_id]
  );
  if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

  // 2. Ambil detail item
  const [items] = await db.query(
    'SELECT * FROM siklus_menu_item WHERE siklus_id=? ORDER BY hari_ke ASC',
    [req.params.id]
  );

  // 3. Kalkulasi metrik kelengkapan siklus
  const totalDays = siklus.total_hari || items.length; // Total target hari dalam siklus
  const filledDays = items.filter(it => it.menu_id).length; // Hari yang sudah diisi menu
  const emptyDays = totalDays - filledDays; // Hari yang masih kosong
  const uniqueMenus = new Set(items.filter(it => it.menu_id).map(it => it.menu_id)).size; // Jumlah menu unik (menghindari duplikasi)
  const coverage = totalDays ? Math.round((filledDays / totalDays) * 100) : 0; // Persentase kelengkapan (%)

  // 4. Hitung total akumulasi nilai gizi selama siklus berlangsung
  const totals = items.reduce((acc, it) => ({
    kalori: acc.kalori + Number(it.kalori || 0),
    protein: acc.protein + Number(it.protein || 0),
    karbohidrat: acc.karbohidrat + Number(it.karbohidrat || 0),
    lemak: acc.lemak + Number(it.lemak || 0),
    serat: acc.serat + Number(it.serat || 0),
  }), { kalori: 0, protein: 0, karbohidrat: 0, lemak: 0, serat: 0 });

  // 5. Hitung rata-rata asupan gizi harian (dibagi dengan hari yang ada menunya saja)
  const avg = filledDays ? {
    kalori: Math.round(totals.kalori / filledDays),
    protein: Math.round(totals.protein / filledDays),
    karbohidrat: Math.round(totals.karbohidrat / filledDays),
    lemak: Math.round(totals.lemak / filledDays),
    serat: Math.round(totals.serat / filledDays),
  } : { kalori: 0, protein: 0, karbohidrat: 0, lemak: 0, serat: 0 };

  // 6. Kembalikan data lengkap untuk dirender di frontend (chart, tabel, ringkasan)
  res.json({
    siklus: { ...siklus },
    stats: {
      totalDays,
      filledDays,
      emptyDays,
      uniqueMenus,
      coverage,
      totals,
      avg,
    },
    items,
  });
});

module.exports = router;