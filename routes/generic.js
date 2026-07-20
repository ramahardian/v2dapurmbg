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
  penerima_manfaat: ['nama_kelompok', 'paket_besar', 'paket_kecil', 'lokasi', 'keterangan', 'kategori_penerima', 'provinsi', 'kota', 'kecamatan', 'nomor_telepon', 'nama_kontak', 'email', 'status_kepemilikan'],
  bahan_baku: ['kode', 'nama', 'kategori', 'kategori_sp', 'berat_1_sp', 'persen_bdd', 'berat_per_satuan', 'satuan', 'harga_satuan', 'harga_sebelumnya', 'stok_saat_ini', 'stok_minimum', 'sumber', 'kalori', 'protein', 'karbohidrat', 'lemak', 'serat'],
  supplier: ['nama', 'kategori_supply', 'kontak_person', 'telepon', 'email', 'alamat', 'npwp'],
  purchase_order: ['no_po', 'tanggal', 'supplier_id', 'supplier_nama', 'item', 'total_nilai', 'status', 'unit_dapur', 'catatan'],
  penerimaan_barang: ['no_dokumen', 'tanggal_terima', 'supplier_id', 'ref_po', 'item', 'total_nilai', 'status_qc', 'catatan'],
  produksi: ['tanggal_produksi', 'menu_id', 'menu_nama', 'kategori_penerima', 'jumlah_porsi', 'status', 'catatan'],
  distribusi: ['tanggal_distribusi', 'titik_distribusi', 'penerima_manfaat_id', 'kategori_penerima', 'jumlah_porsi', 'kurir', 'status', 'catatan'],
  budget: ['periode', 'kategori_penerima', 'jumlah_penerima', 'harga_per_porsi', 'biaya_operasional', 'total_budget', 'realisasi', 'catatan'],
  kas_bank: ['tanggal', 'no_transaksi', 'tipe', 'kategori', 'akun', 'akun_id', 'deskripsi', 'jumlah'],
  divisi: ['nama'],
  sp_referensi_bahan: ['nama', 'kategori', 'berat_bersih', 'bdd_persen', 'berat_kotor', 'energi', 'protein', 'lemak', 'karbohidrat', 'serat'],
  akun: ['kode', 'nama', 'bp', 'tipe', 'is_active'],
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
  sp_referensi_bahan: ['nama', 'berat_bersih'],
  akun: ['kode', 'nama', 'bp'],
};

/**
 * Field yang harus unik per-tenant (cek duplikat sebelum insert).
 * Format: { nama_tabel: { field_db: 'label_untuk_pesan_error' } }
 */
const UNIQUE_FIELDS = {
  penerima_manfaat: { nama_kelompok: 'Nama Kelompok' },
  bahan_baku: { nama: 'Nama Bahan' },
  supplier: { nama: 'Nama Supplier' },
  sp_referensi_bahan: { nama: 'Nama Bahan' },
  akun: { kode: 'Kode Akun', nama: 'Nama Akun' },
};

/**
 * Field yang bisa dicari (search) per tabel.
 */
const SEARCHABLE_FIELDS = {
  penerima_manfaat: ['nama_kelompok', 'lokasi', 'kategori_penerima', 'provinsi', 'kota', 'kecamatan', 'nama_kontak', 'email', 'status_kepemilikan'],
  bahan_baku: ['nama', 'kode', 'kategori'],
  supplier: ['nama', 'kategori_supply', 'kontak_person'],
  purchase_order: ['no_po', 'supplier_nama', 'status'],
  penerimaan_barang: ['no_dokumen', 'supplier_nama', 'status_qc'],
  produksi: ['menu_nama', 'kategori_penerima', 'status'],
  distribusi: ['titik_distribusi', 'kategori_penerima', 'status', 'kurir', 'pm_nama', 'pm_alamat'],
  budget: ['periode', 'kategori_penerima'],
  kas_bank: ['tipe', 'kategori', 'akun', 'deskripsi', 'no_transaksi'],
  akun: ['kode', 'nama', 'bp'],
  sp_referensi_bahan: ['nama', 'kategori'],
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
    if (body[k] !== undefined && body[k] !== '') { 
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
    supplier: ['admin', 'keuangan', 'gudang'],
    purchase_order: ['admin', 'keuangan', 'gudang', 'ahli_gizi'],
    penerimaan_barang: ['admin', 'keuangan', 'gudang'],
    stok_masuk: ['admin', 'keuangan', 'gudang'],
    stok_keluar: ['admin', 'keuangan', 'gudang'],
    produksi: ['admin', 'produksi', 'gudang', 'keuangan', 'ahli_gizi'],
    distribusi: ['admin', 'produksi', 'gudang', 'keuangan', 'ahli_gizi'],
    sp_referensi_bahan: ['admin', 'ahli_gizi'],
    akun: ['admin', 'keuangan']
  };
  
const roleMiddleware = tableRoles[table] ? requireRole(...tableRoles[table]) : (req, res, next) => next();
     
  // 1. READ ALL (GET /nama_tabel)
  router.get(`/${table}`, roleMiddleware, async (req, res) => {
    const { search, page, limit, bp } = req.query;
    const searchable = SEARCHABLE_FIELDS[table] || [];
    
    // Special query for distribusi - join with penerima_manfaat
    let selectClause = '*';
    let fromClause = `${table}`;
    let whereClause = 'WHERE tenant_id=?';
    let orderByClause = 'ORDER BY id DESC';
    const params = [req.user.tenant_id];
    
    if (table === 'distribusi') {
      selectClause = `d.*, pm.nama_kelompok as pm_nama, pm.lokasi as pm_alamat`;
      fromClause = `${table} d LEFT JOIN penerima_manfaat pm ON pm.id = d.penerima_manfaat_id AND pm.tenant_id = d.tenant_id`;
      whereClause = 'WHERE d.tenant_id=?';
      orderByClause = 'ORDER BY d.id DESC';
    } else if (table === 'penerimaan_barang') {
      selectClause = `pb.*, s.nama as supplier_nama`;
      fromClause = `${table} pb LEFT JOIN supplier s ON s.id = pb.supplier_id AND s.tenant_id = pb.tenant_id`;
      whereClause = 'WHERE pb.tenant_id=?';
      orderByClause = 'ORDER BY pb.id DESC';
    }
    
    // Filter: untuk purchase_order, bedakan PR vs PO via prefix no_po
    if ((table === 'purchase_order' || table === 'penerimaan_barang') && req.query.tipe) {
      if (req.query.tipe === 'po') {
        whereClause += ` AND no_po NOT LIKE 'PR-%'`;
      } else if (req.query.tipe === 'pr') {
        whereClause += ` AND no_po LIKE 'PR-%'`;
      }
    }

    // Search: filter berdasarkan kolom yang sudah ditentukan
    if (search && searchable.length) {
      const prefix = table === 'distribusi' ? 'd.' : '';
      const conditions = searchable.map(f => `${prefix}${f} LIKE ?`);
      whereClause += ` AND (${conditions.join(' OR ')})`;
      searchable.forEach(() => params.push(`%${search}%`));
    }
    // Direct filter: bp (untuk akun)
    if (bp && table === 'akun') {
      whereClause += ' AND bp=?';
      params.push(bp);
    }
    // Filter: sumber koperasi (id_koperasi IS NOT NULL)
    if (req.query.sumber === 'koperasi' && table === 'bahan_baku') {
      whereClause += ' AND id_koperasi IS NOT NULL';
    }
    
    // Hitung total sebelum pagination
    const countFrom = table === 'distribusi' ? `${table} d` : table === 'penerimaan_barang' ? `${table} pb` : table;
    const [countResult] = await db.query(`SELECT COUNT(*) as count FROM ${countFrom} ${whereClause}`, params);
    const total = countResult[0].count;
    
    // Pagination
    if (page && limit) {
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;
      
      const [rows] = await db.query(
        `SELECT ${selectClause} FROM ${fromClause} ${whereClause} ${orderByClause} LIMIT ? OFFSET ?`,
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
      const [rows] = await db.query(`SELECT ${selectClause} FROM ${fromClause} ${whereClause} ${orderByClause} LIMIT 500`, params);
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

      // 🔁 AUTO STOK MASUK: Penerimaan Barang Lolos QC → Stok Masuk
      if (table === 'penerimaan_barang' && req.body.status_qc === 'Lolos' && rows.length) {
        autoStokMasukFromPenerimaan(rows[0], req.user.tenant_id).catch(e => console.error('Auto stok masuk gagal (CREATE):', e));
      }
      // 🔁 AUTO STOK KELUAR: Produksi Diproduksi/Selesai → Stok Keluar
      if (table === 'produksi' && (req.body.status === 'Diproduksi' || req.body.status === 'Selesai') && rows.length) {
        autoStokKeluarFromProduksi(rows[0], req.user.tenant_id).catch(e => console.error('Auto stok keluar gagal (CREATE):', e));
      }

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

      // 🔁 AUTO STOK MASUK: Penerimaan Barang Lolos QC → Stok Masuk
      if (table === 'penerimaan_barang' && req.body.status_qc === 'Lolos' && rows.length) {
        autoStokMasukFromPenerimaan(rows[0], req.user.tenant_id).catch(e => console.error('Auto stok masuk gagal (UPDATE):', e));
      }
      // 🔁 AUTO STOK KELUAR: Produksi Diproduksi/Selesai → Stok Keluar
      if (table === 'produksi' && (req.body.status === 'Diproduksi' || req.body.status === 'Selesai') && rows.length) {
        autoStokKeluarFromProduksi(rows[0], req.user.tenant_id).catch(e => console.error('Auto stok keluar gagal (UPDATE):', e));
      }

      // Auto-journal: PO Dibayar → kas_bank
      if (table === 'purchase_order' && req.body.status === 'Dibayar' && rows.length) {
        const po = rows[0];
        const [existing] = await db.query(
          'SELECT id FROM kas_bank WHERE tenant_id=? AND no_transaksi=? AND tipe="keluar"',
          [req.user.tenant_id, po.no_po]
        );
        if (!existing.length) {
          const [[akun]] = await db.query('SELECT id FROM akun WHERE tenant_id=? AND kode=?', [req.user.tenant_id, '2000']);
          await db.query(
            `INSERT INTO kas_bank (tenant_id, tanggal, no_transaksi, tipe, kategori, akun, akun_id, deskripsi, jumlah)
             VALUES (?, ?, ?, 'keluar', 'Pembayaran Supplier', 'Dana Bahan Baku', ?, ?, ?)`,
            [req.user.tenant_id, po.tanggal || new Date(), po.no_po,
             akun?.id || null,
             `Pembayaran PO#${po.no_po} - ${po.supplier_nama || ''}`, po.total_nilai]
          );
          // Auto-recalculate budget realisasi
          await recalculateRealisasi(req.user.tenant_id);
        }
      }

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

// Sync nutrisi sp_referensi_bahan → bahan_baku
router.post('/sp_referensi_bahan/sync-bahan-baku', async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const [spRefs] = await db.query('SELECT * FROM sp_referensi_bahan WHERE tenant_id=?', [tenantId]);
    const validKategoriSp = ['Karbohidrat','Protein Hewani','Protein Nabati','Sayur','Buah','Susu','Minyak'];
    let updated = 0, imported = 0;
    for (const ref of spRefs) {
      const [bahan] = await db.query('SELECT id FROM bahan_baku WHERE tenant_id=? AND nama=?', [tenantId, ref.nama]);
      if (bahan.length) {
        const updates = {};
        if (ref.kategori != null && validKategoriSp.includes(ref.kategori)) updates.kategori_sp = ref.kategori;
        if (ref.berat_bersih != null) updates.berat_1_sp = ref.berat_bersih;
        if (ref.bdd_persen != null) updates.persen_bdd = Math.round(ref.bdd_persen * 100);
        if (ref.energi != null) updates.kalori = ref.energi;
        if (ref.protein != null) updates.protein = ref.protein;
        if (ref.karbohidrat != null) updates.karbohidrat = ref.karbohidrat;
        if (ref.lemak != null) updates.lemak = ref.lemak;
        if (ref.serat != null) updates.serat = ref.serat;
        if (Object.keys(updates).length) {
          const sets = Object.keys(updates).map(k => `${k}=?`).join(',');
          const vals = Object.values(updates);
          vals.push(bahan[0].id, tenantId);
          await db.query(`UPDATE bahan_baku SET ${sets} WHERE id=? AND tenant_id=?`, vals);
          updated++;
        }
      } else {
        await db.query(
          `INSERT INTO bahan_baku (tenant_id, nama, satuan, kategori, kategori_sp, berat_1_sp, persen_bdd, kalori, protein, karbohidrat, lemak, serat)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [tenantId, ref.nama, 'g', validKategoriSp.includes(ref.kategori) ? ref.kategori : null, validKategoriSp.includes(ref.kategori) ? ref.kategori : null, ref.berat_bersih || 0,
           ref.bdd_persen != null ? Math.round(ref.bdd_persen * 100) : 100,
           ref.energi || 0, ref.protein || 0, ref.karbohidrat || 0, ref.lemak || 0, ref.serat || 0]
        );
        imported++;
      }
    }
    res.json({ ok: true, updated, imported, total: spRefs.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal sync' });
  }
});

// Endpoint: total penerima manfaat per kategori
router.get('/penerima_manfaat/total', async (req, res) => {
  const { kategori, kategori_penerima } = req.query;
  let sql = 'SELECT COALESCE(SUM(paket_besar + paket_kecil),0) AS total FROM penerima_manfaat WHERE tenant_id=?';
  const params = [req.user.tenant_id];
  if (kategori_penerima) {
    const kats = kategori_penerima.split(',').map(s => s.trim()).filter(Boolean);
    if (kats.length > 1) { sql += ' AND kategori_penerima IN (' + kats.map(() => '?').join(',') + ')'; params.push(...kats); }
    else if (kats.length === 1) { sql += ' AND kategori_penerima=?'; params.push(kats[0]); }
  } else if (kategori) { sql += ' AND (nama_kelompok LIKE ? OR lokasi LIKE ?)'; const s = `%${kategori}%`; params.push(s, s); }
  const [[row]] = await db.query(sql, params);
  res.json({ total: Number(row.total) });
});

// Auto Stok Masuk: Penerimaan Barang (Lolos QC) → INSERT stok_masuk + UPDATE stok_saat_ini
async function autoStokMasukFromPenerimaan(penerimaan, tenantId) {
  let items = [];
  try { items = JSON.parse(penerimaan.item || '[]'); } catch { return; }
  const valid = items.filter(i => i.bahan_baku_id && (Number(i.qty) > 0 || Number(i.jumlah) > 0));
  if (!valid.length) return;

  const sourcePrefix = `Penerimaan: ${penerimaan.no_dokumen}`;
  const [[{ cnt } = { cnt: 0 }]] = await db.query(
    'SELECT COUNT(*) AS cnt FROM stok_masuk WHERE tenant_id=? AND sumber LIKE ?',
    [tenantId, sourcePrefix + '%']
  );
  if (cnt > 0) return;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let totalNilai = 0;
    for (const item of valid) {
      const jumlah = Number(item.qty || item.jumlah || 0);
      if (jumlah <= 0) continue;
      await conn.query(
        `INSERT INTO stok_masuk (tenant_id, tanggal, bahan_baku_id, jumlah, sumber, catatan) VALUES (?,?,?,?,?,?)`,
        [tenantId, penerimaan.tanggal_terima, item.bahan_baku_id, jumlah, sourcePrefix,
         `Dari ${penerimaan.supplier_nama || 'Supplier'}${item.nama ? ' - ' + item.nama : ''}`]
      );
      await conn.query(
        `UPDATE bahan_baku SET stok_saat_ini = stok_saat_ini + ? WHERE id=? AND tenant_id=?`,
        [jumlah, item.bahan_baku_id, tenantId]
      );
      // Hitung total nilai untuk jurnal
      let harga = Number(item.harga_satuan || item.harga || 0);
      if (!harga) {
        const [[bb]] = await db.query('SELECT harga_satuan FROM bahan_baku WHERE id=?', [item.bahan_baku_id]);
        harga = Number(bb?.harga_satuan || 0);
      }
      totalNilai += jumlah * harga;
    }
    await conn.commit();

    // 🔁 AUTO JURNAL: Stok Masuk (Pembelian) → Jurnal Umum
    if (totalNilai > 0) {
      try {
        await autoPostPembelianToJurnal(penerimaan, tenantId, totalNilai);
      } catch (e) {
        console.error('Auto jurnal stok masuk gagal:', e.message);
      }
    }
  } catch (e) {
    await conn.rollback();
    console.error('Auto stok masuk rollback:', e);
  } finally {
    conn.release();
  }
}

// 🔁 AUTO JURNAL: Pembelian Bahan Baku → Jurnal Double Entry
async function autoPostPembelianToJurnal(penerimaan, tenantId, totalNilai) {
  // Cek duplikat
  const [[existing]] = await db.query(
    'SELECT id FROM jurnal WHERE tenant_id=? AND sumber_transaksi=? AND sumber_id=?',
    [tenantId, 'penerimaan_barang', penerimaan.id]
  );
  if (existing) return;

  // Cari akun Persediaan Bahan Baku (1300) & Hutang Usaha (3000)
  const [[akunPersediaan]] = await db.query(
    'SELECT id FROM akun WHERE tenant_id=? AND kode=?',
    [tenantId, '1300']
  );
  const [[akunHutang]] = await db.query(
    'SELECT id FROM akun WHERE tenant_id=? AND kode=?',
    [tenantId, '3000']
  );
  if (!akunPersediaan || !akunHutang) {
    console.warn('⚠️ Auto-jurnal pembelian skip (akun 1300/3000 belum ada):', penerimaan.id);
    return;
  }

  const noJurnal = `JRN-B/${penerimaan.id}/${Date.now().toString(36).toUpperCase()}`;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [jr] = await conn.query(
      `INSERT INTO jurnal (tenant_id, no_jurnal, tanggal, sumber_transaksi, sumber_id, deskripsi)
       VALUES (?, ?, ?, 'penerimaan_barang', ?, ?)`,
      [tenantId, noJurnal, penerimaan.tanggal_terima, penerimaan.id,
       `Pembelian Bahan: ${penerimaan.supplier_nama || 'Supplier'} (${penerimaan.no_dokumen})`]
    );
    const jurnalId = jr.insertId;

    // Debit: Persediaan Bahan Baku
    await conn.query(
      `INSERT INTO jurnal_detail (jurnal_id, akun_id, debit, kredit, deskripsi)
       VALUES (?, ?, ?, 0, ?)`,
      [jurnalId, akunPersediaan.id, totalNilai,
       `Pembelian ${items.length} jenis bahan - ${penerimaan.no_dokumen}`]
    );

    // Kredit: Hutang Usaha
    await conn.query(
      `INSERT INTO jurnal_detail (jurnal_id, akun_id, debit, kredit, deskripsi)
       VALUES (?, ?, 0, ?, ?)`,
      [jurnalId, akunHutang.id, totalNilai,
       `Hutang ke ${penerimaan.supplier_nama || 'Supplier'} - ${penerimaan.no_dokumen}`]
    );

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error('❌ Auto jurnal pembelian rollback:', e);
  } finally {
    conn.release();
  }
}

// Auto Stok Keluar: Produksi (Diproduksi/Selesai) → INSERT stok_keluar + UPDATE stok_saat_ini
async function autoStokKeluarFromProduksi(produksi, tenantId) {
  if (!produksi.menu_id || !produksi.jumlah_porsi) return;

  const tujuanPrefix = `Produksi: ${produksi.id}`;
  const [[{ cnt } = { cnt: 0 }]] = await db.query(
    'SELECT COUNT(*) AS cnt FROM stok_keluar WHERE tenant_id=? AND tujuan LIKE ?',
    [tenantId, tujuanPrefix + '%']
  );
  if (cnt > 0) return;

  const [bahanRows] = await db.query(
    `SELECT mb.bahan_baku_id, b.nama AS bahan_nama, mb.jumlah AS jumlah_per_porsi
     FROM menu_bahan mb JOIN bahan_baku b ON b.id = mb.bahan_baku_id
     WHERE mb.menu_id=?`,
    [produksi.menu_id]
  );
  if (!bahanRows.length) return;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const bahan of bahanRows) {
      const jumlah = Number(bahan.jumlah_per_porsi) * Number(produksi.jumlah_porsi);
      if (jumlah <= 0) continue;
      await conn.query(
        `INSERT INTO stok_keluar (tenant_id, tanggal, bahan_baku_id, jumlah, tujuan, catatan) VALUES (?,?,?,?,?,?)`,
        [tenantId, produksi.tanggal_produksi, bahan.bahan_baku_id, jumlah, tujuanPrefix,
         `Produksi ${produksi.menu_nama || ''} - ${produksi.jumlah_porsi} porsi`]
      );
      await conn.query(
        `UPDATE bahan_baku SET stok_saat_ini = stok_saat_ini - ? WHERE id=? AND tenant_id=?`,
        [jumlah, bahan.bahan_baku_id, tenantId]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error('Auto stok keluar rollback:', e);
  } finally {
    conn.release();
  }
}

// 6. Reusable: Recalculate Budget Realisasi
async function recalculateRealisasi(tenantId) {
  const t = tenantId;
  const [budgets] = await db.query('SELECT * FROM budget WHERE tenant_id=? ORDER BY periode', [t]);
  const [kasKeluar] = await db.query(
    `SELECT DATE_FORMAT(tanggal,'%Y-%m') as periode, SUM(jumlah) as total
     FROM kas_bank WHERE tenant_id=? AND tipe='keluar' GROUP BY periode`,
    [t]
  );
  const kasMap = {};
  for (const k of kasKeluar) kasMap[k.periode] = Number(k.total);

  const perPeriode = {};
  for (const b of budgets) {
    if (!perPeriode[b.periode]) perPeriode[b.periode] = [];
    perPeriode[b.periode].push(b);
  }

  let updated = 0;
  for (const [periode, entries] of Object.entries(perPeriode)) {
    const totalKas = kasMap[periode] || 0;
    if (totalKas <= 0) continue;
    const totalBudget = entries.reduce((s, e) => s + Number(e.total_budget), 0);
    if (totalBudget <= 0) {
      const share = totalKas / entries.length;
      for (const e of entries) {
        await db.query('UPDATE budget SET realisasi=? WHERE id=? AND tenant_id=?', [share, e.id, t]);
        updated++;
      }
    } else {
      for (const e of entries) {
        const share = totalKas * (Number(e.total_budget) / totalBudget);
        await db.query('UPDATE budget SET realisasi=? WHERE id=? AND tenant_id=?', [share, e.id, t]);
        updated++;
      }
    }
  }
  return updated;
}

router.post('/budget/recalculate-realisasi', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const updated = await recalculateRealisasi(req.user.tenant_id);
    res.json({ ok: true, updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal recalculate realisasi' });
  }
});

// 7. Backfill: buat kas_bank entries untuk PO & Payroll yang sudah Dibayar sebelumnya
router.post('/keuangan/backfill-journal', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const t = req.user.tenant_id;
    let created = 0;

    const [[akunBahan]] = await db.query('SELECT id FROM akun WHERE tenant_id=? AND kode=?', [t, '2000']);
    const [[akunOps]] = await db.query('SELECT id FROM akun WHERE tenant_id=? AND kode=?', [t, '2100']);

    // Backfill PO yang Dibayar
    const [pos] = await db.query(
      'SELECT * FROM purchase_order WHERE tenant_id=? AND status="Dibayar"', [t]
    );
    for (const po of pos) {
      const [existing] = await db.query(
        'SELECT id FROM kas_bank WHERE tenant_id=? AND no_transaksi=? AND tipe="keluar"',
        [t, po.no_po]
      );
      if (!existing.length) {
        await db.query(
          `INSERT INTO kas_bank (tenant_id, tanggal, no_transaksi, tipe, kategori, akun, akun_id, deskripsi, jumlah)
           VALUES (?, ?, ?, 'keluar', 'Pembayaran Supplier', 'Dana Bahan Baku', ?, ?, ?)`,
          [t, po.tanggal || new Date(), po.no_po,
           akunBahan?.id || null,
           `Pembayaran PO#${po.no_po} - ${po.supplier_nama || ''}`, po.total_nilai]
        );
        created++;
      }
    }

    // Backfill Payroll yang Dibayar
    const [payrolls] = await db.query(
      `SELECT p.*, k.nama as nama_karyawan FROM payroll p
       JOIN karyawan k ON k.id=p.karyawan_id
       WHERE p.tenant_id=? AND p.status="Dibayar"`, [t]
    );
    for (const p of payrolls) {
      const [existing] = await db.query(
        'SELECT id FROM kas_bank WHERE tenant_id=? AND no_transaksi=? AND tipe="keluar"',
        [t, `PAY/${p.id}`]
      );
      if (!existing.length) {
        await db.query(
          `INSERT INTO kas_bank (tenant_id, tanggal, no_transaksi, tipe, kategori, akun, akun_id, deskripsi, jumlah)
           VALUES (?, CURDATE(), ?, 'keluar', 'Gaji', 'Dana Operasional', ?, ?, ?)`,
          [t, `PAY/${p.id}`,
           akunOps?.id || null,
           `Pembayaran Gaji - ${p.nama_karyawan} (${p.bulan}/${p.tahun})`, p.total_gaji]
        );
        created++;
      }
    }

    res.json({ ok: true, created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal backfill' });
  }
});

module.exports = router;