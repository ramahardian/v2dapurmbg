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
  bahan_baku: ['kode', 'nama', 'kategori', 'kategori_sp', 'berat_1_sp', 'persen_bdd', 'satuan', 'harga_satuan', 'harga_sebelumnya', 'stok_saat_ini', 'stok_minimum', 'kalori', 'protein', 'karbohidrat', 'lemak', 'serat'],
  supplier: ['nama', 'kategori_supply', 'kontak_person', 'telepon', 'email', 'alamat', 'npwp'],
  purchase_order: ['no_po', 'tanggal', 'supplier_id', 'supplier_nama', 'item', 'total_nilai', 'status', 'catatan'],
  penerimaan_barang: ['no_dokumen', 'tanggal_terima', 'supplier_nama', 'ref_po', 'item', 'total_nilai', 'status_qc', 'catatan'],
  produksi: ['tanggal_produksi', 'menu_id', 'menu_nama', 'kategori_penerima', 'jumlah_porsi', 'status', 'catatan'],
  distribusi: ['tanggal_distribusi', 'titik_distribusi', 'kategori_penerima', 'jumlah_porsi', 'kurir', 'status', 'catatan'],
  budget: ['periode', 'kategori_penerima', 'jumlah_penerima', 'harga_per_porsi', 'biaya_operasional', 'total_budget', 'realisasi', 'catatan'],
  kas_bank: ['tanggal', 'no_transaksi', 'tipe', 'kategori', 'akun', 'deskripsi', 'jumlah'],
  divisi: ['nama'],
};

/**
 * Field yang wajib diisi (NOT NULL di database).
 * Digunakan agar input kosong tidak lolos ke query INSERT.
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
  divisi: ['nama'],
};

/**
 * Field yang harus unik per-tenant (cek duplikat sebelum insert).
 * Format: { nama_tabel: { field_db: 'label_untuk_pesan_error' } }
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
    budget: ['admin', 'keuangan', 'ahli_gizi'],
    kas_bank: ['admin', 'keuangan'],
    penerima_manfaat: ['admin', 'keuangan'],
    bahan_baku: ['admin', 'keuangan', 'gudang', 'ahli_gizi'],
    supplier: ['admin', 'keuangan', 'ahli_gizi'],
    purchase_order: ['admin', 'keuangan', 'gudang', 'ahli_gizi'],
    penerimaan_barang: ['admin', 'keuangan', 'ahli_gizi'],
    stok_masuk: ['admin', 'keuangan', 'gudang'],
    stok_keluar: ['admin', 'keuangan', 'gudang'],
    produksi: ['admin', 'produksi', 'gudang', 'keuangan', 'ahli_gizi'],
    distribusi: ['admin', 'produksi', 'gudang', 'keuangan', 'ahli_gizi']
  };
  
  const roleMiddleware = tableRoles[table] ? requireRole(...tableRoles[table]) : (req, res, next) => next();
    
  // 1. READ ALL (GET /nama_tabel)
  router.get(`/${table}`, roleMiddleware, async (req, res) => {
    const { search, page, limit } = req.query;
    const searchable = SEARCHABLE_FIELDS[table] || [];
    
    let whereClause = 'WHERE tenant_id=?';
    const params = [req.user.tenant_id];
    
    // Search: filter berdasarkan kolom yang sudah ditentukan
    if (search && searchable.length) {
      const conditions = searchable.map(f => `${f} LIKE ?`);
      whereClause += ` AND (${conditions.join(' OR ')})`;
      searchable.forEach(() => params.push(`%${search}%`));
    }
    
    // Hitung total sebelum pagination
    const [countResult] = await db.query(`SELECT COUNT(*) as count FROM ${table} ${whereClause}`, params);
    const total = countResult[0].count;
    
    // Pagination
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
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } else {
      // Tanpa pagination: return array biasa (backward compatible)
      const [rows] = await db.query(`SELECT * FROM ${table} ${whereClause} ORDER BY id DESC`, params);
      res.json(rows);
    }
  });
  
  // 2. CREATE (POST /nama_tabel)
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
      if (table === 'bahan_baku' && req.user.role === 'ahli_gizi') {
        delete req.body.harga_satuan; delete req.body.harga_sebelumnya;
      }
      // Track perubahan harga bahan_baku
      if (table === 'bahan_baku' && req.body.harga_satuan !== undefined) {
        const [[cur]] = await db.query('SELECT harga_satuan FROM bahan_baku WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
        if (cur && Number(cur.harga_satuan) !== Number(req.body.harga_satuan)) {
          req.body.harga_sebelumnya = cur.harga_satuan;
        }
      }
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

// Endpoint: total penerima manfaat per kategori
router.get('/penerima_manfaat/total', async (req, res) => {
  const { kategori } = req.query;
  let sql = 'SELECT COALESCE(SUM(paket_besar + paket_kecil),0) AS total FROM penerima_manfaat WHERE tenant_id=?';
  const params = [req.user.tenant_id];
  if (kategori) { sql += ' AND (nama_kelompok LIKE ? OR lokasi LIKE ?)'; const s = `%${kategori}%`; params.push(s, s); }
  const [[row]] = await db.query(sql, params);
  res.json({ total: Number(row.total) });
});

module.exports = router;