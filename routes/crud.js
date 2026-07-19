const express = require('express');
const db = require('../db');
// Middleware autentikasi (menggunakan Supabase sesuai setup arsitektur)
// untuk memastikan keamanan dan mengisolasi data per tenant
const { requireAuth, requireRole } = require('../middleware/auth');
const { autoPostKasBankToJurnal } = require('./jurnal');

/**
 * Konfigurasi Tabel (Whitelist)
 * Daftar tabel dan kolom yang diizinkan untuk operasi CRUD dinamis.
 * Diekspor agar bisa digunakan oleh modul lain (misalnya untuk validasi di middleware lain).
 */
const TABLES = {
  penerima_manfaat: ['nama_kelompok', 'paket_besar', 'paket_kecil', 'lokasi', 'keterangan'],
  bahan_baku: ['kode', 'nama', 'kategori', 'satuan', 'berat_per_satuan', 'harga_satuan', 'stok_saat_ini', 'stok_minimum', 'sumber', 'kalori', 'protein', 'karbohidrat', 'lemak', 'serat'],
  supplier: ['nama', 'kategori_supply', 'kontak_person', 'telepon', 'email', 'alamat', 'npwp'],
  purchase_order: ['no_po', 'tanggal', 'supplier_id', 'supplier_nama', 'item', 'total_nilai', 'status', 'unit_dapur', 'catatan'],
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
 * Auto Stok Masuk: Parse item JSON dari Penerimaan Barang (Lolos QC)
 * lalu INSERT ke stok_masuk + UPDATE stok_saat_ini di bahan_baku.
 * Pakai TRANSACTION agar atomic, cegah duplikat via sumber LIKE.
 */
async function autoStokMasukFromPenerimaan(penerimaan, tenant_id) {
  let items = [];
  try { items = JSON.parse(penerimaan.item || '[]'); } catch { return; }
  if (!items.length) return;

  const validItems = items.filter(i => i.bahan_baku_id && (Number(i.qty) > 0 || Number(i.jumlah) > 0));
  if (!validItems.length) return;

  // Cegah duplikat: sudah pernah di-stok masuk?
  const sourcePrefix = `Penerimaan: ${penerimaan.no_dokumen}`;
  const [[{ cnt } = { cnt: 0 }]] = await db.query(
    'SELECT COUNT(*) AS cnt FROM stok_masuk WHERE tenant_id=? AND sumber LIKE ?',
    [tenant_id, sourcePrefix + '%']
  );
  if (cnt > 0) return;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    for (const item of validItems) {
      const jumlah = Number(item.qty || item.jumlah || 0);
      if (jumlah <= 0) continue;

      await conn.query(
        `INSERT INTO stok_masuk (tenant_id, tanggal, bahan_baku_id, jumlah, sumber, catatan)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tenant_id, penerimaan.tanggal_terima, item.bahan_baku_id, jumlah,
         sourcePrefix,
         (`Dari ${penerimaan.supplier_nama || 'Supplier'}${item.nama ? ' - ' + item.nama : ''}`)]
      );

      await conn.query(
        `UPDATE bahan_baku SET stok_saat_ini = stok_saat_ini + ? WHERE id=? AND tenant_id=?`,
        [jumlah, item.bahan_baku_id, tenant_id]
      );
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error('❌ Auto stok masuk rollback:', e);
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Auto Stok Keluar: Produksi (Diproduksi/Selesai) → Stok Keluar
 * Ambil komposisi bahan dari menu_bahan, hitung per porsi,
 * INSERT ke stok_keluar + UPDATE stok_saat_ini di bahan_baku.
 * Pakai TRANSACTION agar atomic, cegah duplikat via tujuan LIKE.
 */
async function autoStokKeluarFromProduksi(produksi, tenant_id) {
  if (!produksi.menu_id || !produksi.jumlah_porsi) return;

  // Cegah duplikat: sudah pernah di-stok keluar?
  const tujuanPrefix = `Produksi: ${produksi.id}`;
  const [[{ cnt } = { cnt: 0 }]] = await db.query(
    'SELECT COUNT(*) AS cnt FROM stok_keluar WHERE tenant_id=? AND tujuan LIKE ?',
    [tenant_id, tujuanPrefix + '%']
  );
  if (cnt > 0) return;

  // Ambil komposisi bahan dari menu_bahan
  const [bahanRows] = await db.query(
    `SELECT mb.bahan_baku_id, b.nama AS bahan_nama, b.satuan,
            mb.jumlah AS jumlah_per_porsi
     FROM menu_bahan mb
     JOIN bahan_baku b ON b.id = mb.bahan_baku_id
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
        `INSERT INTO stok_keluar (tenant_id, tanggal, bahan_baku_id, jumlah, tujuan, catatan)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tenant_id, produksi.tanggal_produksi, bahan.bahan_baku_id, jumlah,
         tujuanPrefix,
         `Produksi ${produksi.menu_nama || ''} - ${produksi.jumlah_porsi} porsi`]
      );

      await conn.query(
        `UPDATE bahan_baku SET stok_saat_ini = stok_saat_ini - ? WHERE id=? AND tenant_id=?`,
        [jumlah, bahan.bahan_baku_id, tenant_id]
      );
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error('❌ Auto stok keluar rollback:', e);
    throw e;
  } finally {
    conn.release();
  }
}

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

        // 🔁 AUTO STOK MASUK: Penerimaan Barang (Lolos QC) → Stok Masuk
        if (table === 'penerimaan_barang' && req.body.status_qc === 'Lolos' && rows.length) {
          await autoStokMasukFromPenerimaan(rows[0], req.user.tenant_id).catch(e => {
            console.error('Auto stok masuk gagal (CREATE):', e);
          });
        }

        // 🔁 AUTO STOK KELUAR: Produksi (Diproduksi/Selesai) → Stok Keluar
        if (table === 'produksi' && (req.body.status === 'Diproduksi' || req.body.status === 'Selesai') && rows.length) {
          await autoStokKeluarFromProduksi(rows[0], req.user.tenant_id).catch(e => {
            console.error('Auto stok keluar gagal (CREATE):', e);
          });
        }

        // 🔁 AUTO JURNAL: Kas Bank → Jurnal Umum (double entry)
        if (table === 'kas_bank' && rows.length) {
          await autoPostKasBankToJurnal(rows[0], req.user.tenant_id).catch(e => {
            console.error('Auto jurnal gagal (CREATE):', e);
          });
        }

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

        // 🔁 AUTO STOK MASUK: Penerimaan Barang (Lolos QC) → Stok Masuk
        if (table === 'penerimaan_barang' && req.body.status_qc === 'Lolos' && rows.length) {
          await autoStokMasukFromPenerimaan(rows[0], req.user.tenant_id).catch(e => {
            console.error('Auto stok masuk gagal (UPDATE):', e);
          });
        }

        // 🔁 AUTO STOK KELUAR: Produksi (Diproduksi/Selesai) → Stok Keluar
        if (table === 'produksi' && (req.body.status === 'Diproduksi' || req.body.status === 'Selesai') && rows.length) {
          await autoStokKeluarFromProduksi(rows[0], req.user.tenant_id).catch(e => {
            console.error('Auto stok keluar gagal (UPDATE):', e);
          });
        }

        // 🔁 AUTO JURNAL: Kas Bank → Jurnal Umum (double entry)
        if (table === 'kas_bank' && rows.length) {
          await autoPostKasBankToJurnal(rows[0], req.user.tenant_id).catch(e => {
            console.error('Auto jurnal gagal (UPDATE):', e);
          });
        }

        // 🔁 AUTO-JOURNAL: Purchase Order Dibayar → Kas Bank (Pembayaran Supplier)
        if (table === 'purchase_order' && req.body.status === 'Dibayar' && rows.length) {
          const po = rows[0];
          const t = req.user.tenant_id;
          const noTransaksi = `PO/${po.id}`;

          // Cegah duplikat — jangan sampai entry kas_bank dibuat 2x
          const [existing] = await db.query(
            'SELECT id FROM kas_bank WHERE tenant_id=? AND no_transaksi=? AND tipe="keluar"',
            [t, noTransaksi]
          );

          if (!existing.length) {
            // Cari akun default (sama seperti pola payroll di routes/payroll.js)
            const [[akun]] = await db.query(
              'SELECT id FROM akun WHERE tenant_id=? AND kode=?',
              [t, '2100']
            );

            await db.query(
              `INSERT INTO kas_bank (tenant_id, tanggal, no_transaksi, tipe, kategori, akun, akun_id, deskripsi, jumlah)
               VALUES (?, ?, ?, 'keluar', 'Pembayaran Supplier', 'Dana Operasional', ?, ?, ?)`,
              [t, po.tanggal || new Date(), noTransaksi,
               akun?.id || null,
               (`Pembayaran PO ${po.no_po}${po.supplier_nama ? ' - ' + po.supplier_nama : ''}`),
               Number(po.total_nilai) || 0]
            );
          }
        }

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