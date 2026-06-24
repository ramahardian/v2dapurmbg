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
 * Mendukung query parameters: search (string), page (number), limit (number)
 */
router.get('/menu', async (req, res) => {
  const { search, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  
  // Build WHERE clause for search
  let whereClause = 'WHERE m.tenant_id=?';
  const queryParams = [req.user.tenant_id];
  
  if (search) {
    whereClause += ' AND (m.nama LIKE ? OR m.kategori_penerima LIKE ? OR m.deskripsi LIKE ?)';
    const searchTerm = `%${search}%`;
    queryParams.push(searchTerm, searchTerm, searchTerm);
  }
  
  // Get total count for pagination
  const [totalCountResult] = await db.query(
    `SELECT COUNT(*) as count FROM menu m ${whereClause}`, 
    queryParams
  );
  const totalCount = totalCountResult[0].count;
  
  // Get menus with ingredients using a single JOIN query
  const sql = `SELECT m.id, m.nama, m.kategori_penerima, m.deskripsi, m.gramasi_total, m.kalori, m.protein, m.karbohidrat, m.lemak, m.serata,
       mb.bahan_baku_id, bb.nama as bahan_nama, bb.satuan, mb.jumlah
       FROM menu m
       LEFT JOIN menu_bahan mb ON mb.menu_id = m.id
       LEFT JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
       ${whereClause}
       ORDER BY m.id DESC
       LIMIT ? OFFSET ?`;
  
  queryParams.push(limit, offset);
  const [rows] = await db.query(sql, queryParams);
  
  // Group ingredients by menu
  const menusMap = {};
  rows.forEach(row => {
    if (!menusMap[row.id]) {
      menusMap[row.id] = {
        id: row.id,
        nama: row.nama,
        kategori_penerima: row.kategori_penerima,
        deskripsi: row.deskripsi,
        gramasi_total: row.gramasi_total,
        kalori: row.kalori,
        protein: row.protein,
        karbohidrat: row.karbohidrat,
        lemak: row.lemak,
        serat: row.serata,
        bahan: []
      };
    }
    if (row.bahan_baku_id) {
      menusMap[row.id].bahan.push({
        bahan_baku_id: row.bahan_baku_id,
        nama: row.bahan_nama,
        satuan: row.satuan,
        jumlah: row.jumlah
      });
    }
  });
  
  const menus = Object.values(menusMap);
  
  res.json({
    data: menus,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit)
    }
  });
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

/**
 * GET /menu/:id
 * Mengambil detail menu beserta bahan-bahannya untuk diedit.
 */
router.get('/menu/:id', async (req, res) => {
  const [menus] = await db.query(
    `SELECT m.id, m.nama, m.kategori_penerima, m.deskripsi, m.gramasi_total, m.kalori, m.protein, m.karbohidrat, m.lemak, m.serata,
       mb.bahan_baku_id, bb.nama as bahan_nama, bb.satuan, mb.jumlah
       FROM menu m
       LEFT JOIN menu_bahan mb ON mb.menu_id = m.id
       LEFT JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
       WHERE m.id=? AND m.tenant_id=?`,
    [req.params.id, req.user.tenant_id]
  );
  if (!menus.length) return res.status(404).json({ error: 'Menu tidak ditemukan' });
  
  const m = {
    id: menus[0].id,
    nama: menus[0].nama,
    kategori_penerima: menus[0].kategori_penerima,
    deskripsi: menus[0].deskripsi,
    gramasi_total: menus[0].gramasi_total,
    kalori: menus[0].kalori,
    protein: menus[0].protein,
    karbohidrat: menus[0].karbohidrat,
    lemak: menus[0].lemak,
    serat: menus[0].serata,
    bahan: []
  };
  menus.forEach(row => {
    if (row.bahan_baku_id) {
      m.bahan.push({ bahan_baku_id: row.bahan_baku_id, nama: row.bahan_nama, satuan: row.satuan, jumlah: row.jumlah });
    }
  });
  res.json(m);
});

module.exports = router;