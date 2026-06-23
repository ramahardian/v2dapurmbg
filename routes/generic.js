const express = require('express');
const db = require('../db');
// Middleware untuk memvalidasi token dan mendapatkan req.user.tenant_id
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Terapkan perlindungan endpoint ke semua rute di bawahnya
router.use(requireAuth);

/**
 * Konfigurasi Tabel (Whitelist)
 * Objek ini mendefinisikan tabel apa saja yang diizinkan untuk diakses secara dinamis,
 * sekaligus mendaftarkan kolom-kolom apa saja yang boleh diisi/diubah (Mass Assignment Protection).
 * Ini sangat penting untuk mencegah SQL Injection atau manipulasi data yang tidak diinginkan.
 */
const TABLES = {
  penerima_manfaat: ['nama_kelompok', 'paket_besar', 'paket_kecil', 'lokasi', 'keterangan'],
  bahan_baku: ['kode', 'nama', 'kategori', 'satuan', 'harga_satuan', 'stok_saat_ini', 'stok_minimum'],
  supplier: ['nama', 'kategori_supply', 'kontak_person', 'telepon', 'email', 'alamat', 'npwp'],
  purchase_order: ['no_po', 'tanggal', 'supplier_id', 'supplier_nama', 'item', 'total_nilai', 'status', 'catatan'],
  penerimaan_barang: ['no_dokumen', 'tanggal_terima', 'supplier_nama', 'ref_po', 'item', 'total_nilai', 'status_qc', 'catatan'],
  produksi: ['tanggal_produksi', 'menu_id', 'menu_nama', 'kategori_penerima', 'jumlah_porsi', 'status', 'catatan'],
  distribusi: ['tanggal_distribusi', 'titik_distribusi', 'kategori_penerima', 'jumlah_porsi', 'kurir', 'status', 'catatan'],
  budget: ['periode', 'kategori_penerima', 'jumlah_penerima', 'harga_per_porsi', 'biaya_operasional', 'total_budget', 'realisasi', 'catatan'],
  kas_bank: ['tanggal', 'no_transaksi', 'tipe', 'kategori', 'akun', 'deskripsi', 'jumlah'],
};

/**
 * Helper: Membangun query INSERT secara dinamis
 * Hanya memproses kolom yang ada di whitelist (TABLES) dan ada nilainya di req.body.
 */
function buildInsert(table, body, tenant_id) {
  const allowed = TABLES[table];
  const cols = ['tenant_id']; // tenant_id disisipkan secara paksa demi keamanan (Multi-tenant)
  const vals = [tenant_id];
  const placeholders = ['?'];
  
  for (const k of allowed) {
    if (body[k] !== undefined && body[k] !== '') {
      cols.push(k); 
      vals.push(body[k]); 
      placeholders.push('?');
    }
  }
  return { sql: `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders.join(',')})`, vals };
}

/**
 * Helper: Membangun query UPDATE (SET) secara dinamis
 * Hanya memproses kolom yang ada di whitelist dan yang dikirim oleh client.
 */
function buildUpdate(table, body) {
  const allowed = TABLES[table];
  const sets = []; 
  const vals = [];
  
  for (const k of allowed) {
    if (body[k] !== undefined) { 
      sets.push(`${k}=?`); 
      vals.push(body[k]); 
    }
  }
  return { sql: `SET ${sets.join(',')}`, vals };
}

/**
 * Generator Rute Dinamis
 * Melakukan perulangan (loop) pada setiap tabel yang terdaftar di konfigurasi TABLES
 * untuk membuatkan 4 endpoint standar (GET, POST, PUT, DELETE) secara otomatis.
 */
for (const table of Object.keys(TABLES)) {
  
  // Role restrictions for specific tables
  const tableRoles = {
    penerima_manfaat: ['admin', 'keuangan'],
    bahan_baku: ['admin', 'keuangan', 'gudang'],
    stok_masuk: ['admin', 'keuangan', 'gudang'],
    stok_keluar: ['admin', 'keuangan', 'gudang']
  };
  
  const roleMiddleware = tableRoles[table] ? requireRole(...tableRoles[table]) : (req, res, next) => next();
  
  // 1. READ ALL (GET /nama_tabel)
  router.get(`/${table}`, roleMiddleware, async (req, res) => {
    // Selalu filter berdasarkan tenant_id untuk keamanan data
    const [rows] = await db.query(`SELECT * FROM ${table} WHERE tenant_id=? ORDER BY id DESC`, [req.user.tenant_id]);
    res.json(rows);
  });
  
  // 2. CREATE (POST /nama_tabel)
  router.post(`/${table}`, roleMiddleware, async (req, res) => {
    try {
      // Panggil helper untuk merakit query INSERT
      const { sql, vals } = buildInsert(table, req.body, req.user.tenant_id);
      const [r] = await db.query(sql, vals);
      
      // Ambil kembali data yang baru saja dimasukkan untuk dikembalikan sebagai response
      const [rows] = await db.query(`SELECT * FROM ${table} WHERE id=?`, [r.insertId]);
      res.json(rows[0]);
    } catch (e) { 
      console.error(e); 
      res.status(400).json({ error: 'Gagal menyimpan' }); 
    }
  });
  
  // 3. UPDATE (PUT /nama_tabel/:id)
  router.put(`/${table}/:id`, roleMiddleware, async (req, res) => {
    try {
      // Panggil helper untuk merakit klausa SET pada query UPDATE
      const { sql, vals } = buildUpdate(table, req.body);
      
      // Cegah eksekusi jika tidak ada data valid yang dikirim
      if (!vals.length) return res.status(400).json({ error: 'Tidak ada perubahan' });
      
      // Tambahkan parameter untuk klausa WHERE (id dan tenant_id)
      vals.push(req.params.id, req.user.tenant_id);
      await db.query(`UPDATE ${table} ${sql} WHERE id=? AND tenant_id=?`, vals);
      
      // Ambil data terbaru setelah di-update
      const [rows] = await db.query(`SELECT * FROM ${table} WHERE id=?`, [req.params.id]);
      res.json(rows[0]);
    } catch (e) { 
      console.error(e); 
      res.status(400).json({ error: 'Gagal' }); 
    }
  });
  
  // 4. DELETE (DELETE /nama_tabel/:id)
  router.delete(`/${table}/:id`, roleMiddleware, async (req, res) => {
    // Hapus data, pastikan mencocokkan ID dan tenant_id agar tidak bisa menghapus data tenant lain
    await db.query(`DELETE FROM ${table} WHERE id=? AND tenant_id=?`, [req.params.id, req.user.tenant_id]);
    res.json({ ok: true });
  });
  
}

module.exports = router;