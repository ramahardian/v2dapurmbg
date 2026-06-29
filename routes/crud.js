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
  bahan_baku: ['kode', 'nama', 'kategori', 'satuan', 'harga_satuan', 'stok_saat_ini', 'stok_minimum', 'kalori', 'protein', 'karbohidrat', 'lemak', 'serat'],
  supplier: ['nama', 'kategori_supply', 'kontak_person', 'telepon', 'email', 'alamat', 'npwp'],
  purchase_order: ['no_po', 'tanggal', 'supplier_id', 'supplier_nama', 'item', 'total_nilai', 'status', 'catatan'],
  penerimaan_barang: ['no_dokumen', 'tanggal_terima', 'supplier_nama', 'ref_po', 'item', 'total_nilai', 'status_qc', 'catatan'],
  produksi: ['tanggal_produksi', 'menu_id', 'menu_nama', 'kategori_penerima', 'jumlah_porsi', 'status', 'catatan'],
  distribusi: ['tanggal_distribusi', 'titik_distribusi', 'kategori_penerima', 'jumlah_porsi', 'kurir', 'status', 'catatan'],
  budget: ['periode', 'kategori_penerima', 'jumlah_penerima', 'harga_per_porsi', 'biaya_operasional', 'total_budget', 'realisasi', 'catatan'],
  kas_bank: ['tanggal', 'no_transaksi', 'tipe', 'kategori', 'akun', 'deskripsi', 'jumlah'],
};

/**
 * Field yang wajib diisi (NOT NULL di database).
 */
const REQUIRED_FIELDS = {
  penerima_manfaat: ['nama_kelompok'],
  bahan_baku: ['nama', 'satuan'],
  supplier: ['nama'],
  purchase_order: ['no_po', 'tanggal'],
  penerimaan_barang: ['no_dokumen', 'tanggal_terima'],
  produksi: ['tanggal_produksi'],
  distribusi: ['tanggal_distribusi'],
  budget: ['periode'],
  kas_bank: ['tanggal', 'tipe', 'jumlah'],
};

/**
 * Field yang harus unik per-tenant (cek duplikat sebelum insert).
 */
const UNIQUE_FIELDS = {
  penerima_manfaat: { nama_kelompok: 'Nama Kelompok' },
  bahan_baku: { nama: 'Nama Bahan' },
  supplier: { nama: 'Nama Supplier' },
};

/**
 * Field yang bisa dicari (search) per tabel.
 */
const SEARCHABLE_FIELDS = {
  penerima_manfaat: ['nama_kelompok', 'lokasi'],
  bahan_baku: ['nama', 'kode', 'kategori'],
  supplier: ['nama', 'kategori_supply', 'kontak_person'],
  purchase_order: ['no_po', 'supplier_nama', 'status'],
  penerimaan_barang: ['no_dokumen', 'supplier_nama', 'status_qc'],
  produksi: ['menu_nama', 'kategori_penerima', 'status'],
  distribusi: ['titik_distribusi', 'kategori_penerima', 'status', 'kurir'],
  budget: ['periode', 'kategori_penerima'],
  kas_bank: ['tipe', 'kategori', 'akun', 'deskripsi', 'no_transaksi'],
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
      bahan_baku: ['admin', 'keuangan', 'gudang', 'ahli_gizi'],
      stok_masuk: ['admin', 'keuangan', 'gudang'],
      stok_keluar: ['admin', 'keuangan', 'gudang'],
      produksi: ['admin', 'produksi', 'gudang', 'keuangan'],
      distribusi: ['admin', 'produksi', 'gudang', 'keuangan']
    };
    
    const roleMiddleware = tableRoles[table] ? requireRole(...tableRoles[table]) : (req, res, next) => next();
    
    // READ
    router.get(`/${table}`, roleMiddleware, async (req, res) => {
      const { search, page, limit } = req.query;
      const searchable = SEARCHABLE_FIELDS[table] || [];
      
      let whereClause = 'WHERE tenant_id=?';
      const params = [req.user.tenant_id];
      
      if (search && searchable.length) {
        const conditions = searchable.map(f => `${f} LIKE ?`);
        whereClause += ` AND (${conditions.join(' OR ')})`;
        searchable.forEach(() => params.push(`%${search}%`));
      }
      
      const [countResult] = await db.query(`SELECT COUNT(*) as count FROM ${table} ${whereClause}`, params);
      const total = countResult[0].count;
      
      if (page && limit) {
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;
        
        const [rows] = await db.query(
          `SELECT * FROM ${table} ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
          [...params, limitNum, offset]
        );
        
        res.json({
          data: rows,
          pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
        });
      } else {
        const [rows] = await db.query(`SELECT * FROM ${table} ${whereClause} ORDER BY id DESC`, params);
        res.json(rows);
      }
    });
    
    // CREATE
    router.post(`/${table}`, roleMiddleware, async (req, res) => {
      try {
        if (table === 'bahan_baku' && req.user.role === 'ahli_gizi') {
          delete req.body.harga_satuan; delete req.body.harga_sebelumnya;
        }
        // Validasi field wajib sebelum menyimpan
        const required = REQUIRED_FIELDS[table] || [];
        const missing = required.filter(f => !req.body[f] || (typeof req.body[f] === 'string' && !req.body[f].trim()));
        if (missing.length) {
          return res.status(400).json({ error: `Field wajib harus diisi: ${missing.join(', ')}` });
        }
        
        // Cek duplikat field unik per-tenant
        const uniqueFields = UNIQUE_FIELDS[table] || {};
        for (const [field, label] of Object.entries(uniqueFields)) {
          if (req.body[field]) {
            const [dupe] = await db.query(`SELECT id FROM ${table} WHERE ${field}=? AND tenant_id=?`, [req.body[field].trim(), req.user.tenant_id]);
            if (dupe.length) {
              return res.status(409).json({ error: `${label} "${req.body[field].trim()}" sudah ada` });
            }
          }
        }
        
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
        if (table === 'bahan_baku' && req.user.role === 'ahli_gizi') {
          delete req.body.harga_satuan; delete req.body.harga_sebelumnya;
        }
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