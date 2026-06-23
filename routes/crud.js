const express = require('express');
const db = require('../db');
// Middleware autentikasi (menggunakan Supabase sesuai setup arsitektur)
// untuk memastikan keamanan dan mengisolasi data per tenant
const { requireAuth, requireRole } = require('../middleware/auth');

/**
 * Konfigurasi Tabel (Whitelist)
 * Daftar tabel dan kolom yang diizinkan untuk operasi CRUD dinamis.
 * Diekspor agar bisa digunakan oleh modul lain (misalnya untuk validasi di middleware lain).
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
 * Helper: Merakit Query INSERT
 * Mencegah SQL Injection dengan menggunakan parameterized query (?) 
 * dan hanya memasukkan kolom yang terdaftar di whitelist.
 */
function buildInsert(table, body, tenant_id) {
  const allowed = TABLES[table];
  const cols = ['tenant_id']; // Paksa sisipkan tenant_id
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
 * Helper: Merakit Query UPDATE
 * Membuat klausa SET secara dinamis berdasarkan data yang dikirim client.
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
 * Factory Function: Membuat dan Mengembalikan Router CRUD
 * Membungkus logika router ke dalam fungsi membuat kode lebih bersih saat di-mount di app utama (misal: app.use('/api', createCrudRouter())).
 */
function createCrudRouter() {
  const router = express.Router();
  
  // Pasang guard autentikasi (tanpa role guard yang rumit, cukup pastikan user login)
  router.use(requireAuth);

  // Looping untuk men-generate endpoint secara otomatis berdasarkan objek TABLES
  for (const table of Object.keys(TABLES)) {
    
    // Role restrictions for specific tables
    const tableRoles = {
      penerima_manfaat: ['admin', 'keuangan'],
      bahan_baku: ['admin', 'keuangan', 'gudang'],
      stok_masuk: ['admin', 'keuangan', 'gudang'],
      stok_keluar: ['admin', 'keuangan', 'gudang']
    };
    
    const roleMiddleware = tableRoles[table] ? requireRole(...tableRoles[table]) : (req, res, next) => next();
    
    // READ
    router.get(`/${table}`, roleMiddleware, async (req, res) => {
      // Clean URL digunakan (tanpa ekstensi .php dsb)
      const [rows] = await db.query(`SELECT * FROM ${table} WHERE tenant_id=? ORDER BY id DESC`, [req.user.tenant_id]);
      res.json(rows);
    });
    
    // CREATE
    router.post(`/${table}`, roleMiddleware, async (req, res) => {
      try {
        const { sql, vals } = buildInsert(table, req.body, req.user.tenant_id);
        const [r] = await db.query(sql, vals);
        // Kembalikan data yang baru di-insert sebagai respons
        const [rows] = await db.query(`SELECT * FROM ${table} WHERE id=?`, [r.insertId]);
        res.json(rows[0]);
      } catch (e) { 
        console.error(e); 
        res.status(400).json({ error: 'Gagal menyimpan' }); 
      }
    });
    
    // UPDATE
    router.put(`/${table}/:id`, roleMiddleware, async (req, res) => {
      try {
        const { sql, vals } = buildUpdate(table, req.body);
        if (!vals.length) return res.status(400).json({ error: 'Tidak ada perubahan' });
        
        // Amankan klausa WHERE dengan tenant_id
        vals.push(req.params.id, req.user.tenant_id);
        await db.query(`UPDATE ${table} ${sql} WHERE id=? AND tenant_id=?`, vals);
        
        const [rows] = await db.query(`SELECT * FROM ${table} WHERE id=?`, [req.params.id]);
        res.json(rows[0]);
      } catch (e) { 
        console.error(e); 
        res.status(400).json({ error: 'Gagal' }); 
      }
    });
    
    // DELETE
    router.delete(`/${table}/:id`, roleMiddleware, async (req, res) => {
      await db.query(`DELETE FROM ${table} WHERE id=? AND tenant_id=?`, [req.params.id, req.user.tenant_id]);
      res.json({ ok: true });
    });
  }

  // Kembalikan router yang sudah dirakit
  return router;
}

// Mengekspor fungsi generator dan objek konfigurasi
module.exports = { createCrudRouter, TABLES };