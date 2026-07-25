/**
 * DYNAMIC ROUTES & EXTRA ENDPOINTS
 * Generator rute dinamis (GET/POST/PUT/DELETE) untuk setiap tabel yang terdaftar,
 * serta endpoint-endpoint tambahan (sync, backfill, dll).
 */
const express = require('express');
const db = require('../../db');
const { requireRole } = require('../../middleware/auth');
const { TABLES, REQUIRED_FIELDS, UNIQUE_FIELDS, SEARCHABLE_FIELDS, TABLE_ROLES } = require('./config');
const { buildInsert, buildUpdate } = require('./helpers');
const { autoStokMasukFromPenerimaan, autoStokKeluarFromProduksi } = require('./auto-stok');
const { recalculateRealisasi } = require('./auto-jurnal');

/**
 * Mendaftarkan seluruh rute dinamis dan endpoint tambahan ke dalam router.
 * @param {express.Router} router - Instance Express Router
 */
function registerDynamicRoutes(router) {
  // ─── DYNAMIC ROUTE GENERATOR ──────────────────────
  // Loop setiap tabel untuk membuat 4 endpoint standar (GET, POST, PUT, DELETE)
  for (const table of Object.keys(TABLES)) {
    const roleMiddleware = TABLE_ROLES[table]
      ? requireRole(...TABLE_ROLES[table])
      : (req, res, next) => next();

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
      } else if (table === 'hari_libur') {
        orderByClause = 'ORDER BY tanggal DESC, id DESC';
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

        // Cek duplikat + INSERT dalam 1 transaksi (cegah TOCTOU race)
        const conn = await db.getConnection();
        try {
          await conn.beginTransaction();
          const uniqueFields = UNIQUE_FIELDS[table] || {};
          for (const [field, label] of Object.entries(uniqueFields)) {
            if (req.body[field]) {
              const [dupe] = await conn.query(`SELECT id FROM ${table} WHERE ${field}=? AND tenant_id=? FOR UPDATE`, [req.body[field].trim(), req.user.tenant_id]);
              if (dupe.length) {
                await conn.rollback();
                conn.release();
                return res.status(409).json({ error: `${label} "${req.body[field].trim()}" sudah ada` });
              }
            }
          }

          const { sql, vals } = buildInsert(TABLES, table, req.body, req.user.tenant_id);
          const [r] = await conn.query(sql, vals);

          const [rows] = await conn.query(`SELECT * FROM ${table} WHERE id=? AND tenant_id=?`, [r.insertId, req.user.tenant_id]);
          await conn.commit();
          conn.release();

          // 🔁 AUTO STOK MASUK: Penerimaan Barang Lolos QC → Stok Masuk
          if (table === 'penerimaan_barang' && req.body.status_qc === 'Lolos' && rows.length) {
            autoStokMasukFromPenerimaan(rows[0], req.user.tenant_id).catch(e => console.error('Auto stok masuk gagal (CREATE):', e));
          }
          // 🔁 AUTO STOK KELUAR: Produksi Diproduksi/Selesai → Stok Keluar
          if (table === 'produksi' && (req.body.status === 'Diproduksi' || req.body.status === 'Selesai') && rows.length) {
            autoStokKeluarFromProduksi(rows[0], req.user.tenant_id).catch(e => console.error('Auto stok keluar gagal (CREATE):', e));
          }

          res.json(rows[0]);
        } catch (innerErr) {
          await conn.rollback();
          conn.release();
          throw innerErr;
        }
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Gagal menyimpan' });
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
        const { sql, vals } = buildUpdate(TABLES, table, req.body);

        // Cegah eksekusi jika tidak ada data valid yang dikirim
        if (!vals.length) return res.status(400).json({ error: 'Tidak ada perubahan' });

        // Tambahkan parameter untuk klausa WHERE (id dan tenant_id)
        vals.push(req.params.id, req.user.tenant_id);
        await db.query(`UPDATE ${table} ${sql} WHERE id=? AND tenant_id=?`, vals);

        // Ambil data terbaru setelah di-update
        const [rows] = await db.query(`SELECT * FROM ${table} WHERE id=? AND tenant_id=?`, [req.params.id, req.user.tenant_id]);

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
          try {
            await autoPostPODibayarToKasBank(rows[0], req.user.tenant_id);
          } catch (e) {
            console.error('Auto-journal PO Dibayar gagal:', e);
          }
        }

        res.json(rows[0]);
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Gagal' });
      }
    });

    // 4. DELETE (DELETE /nama_tabel/:id)
    router.delete(`/${table}/:id`, roleMiddleware, async (req, res) => {
      await db.query(`DELETE FROM ${table} WHERE id=? AND tenant_id=?`, [req.params.id, req.user.tenant_id]);
      res.json({ ok: true });
    });

    // 5. BULK DELETE (POST /nama_tabel/bulk-delete)
    router.post(`/${table}/bulk-delete`, roleMiddleware, async (req, res) => {
      try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'IDs wajib diisi' });
        const placeholders = ids.map(() => '?').join(',');
        await db.query(`DELETE FROM ${table} WHERE id IN (${placeholders}) AND tenant_id=?`, [...ids, req.user.tenant_id]);
        res.json({ ok: true, deleted: ids.length });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Gagal menghapus' });
      }
    });
  }

  // ─── EXTRA: Sync nutrisi sp_referensi_bahan → bahan_baku ──────
  router.post('/sp_referensi_bahan/sync-bahan-baku', async (req, res) => {
    try {
      const tenantId = req.user.tenant_id;
      const [spRefs] = await db.query('SELECT * FROM sp_referensi_bahan WHERE tenant_id=?', [tenantId]);
      const validKategoriSp = ['Karbohidrat', 'Protein Hewani', 'Protein Nabati', 'Sayur', 'Buah', 'Susu', 'Minyak'];
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

  // ─── EXTRA: Total penerima manfaat per kategori ──────
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

  // ─── EXTRA: Recalculate Budget Realisasi ──────
  router.post('/budget/recalculate-realisasi', requireRole('admin', 'keuangan'), async (req, res) => {
    try {
      const updated = await recalculateRealisasi(req.user.tenant_id);
      res.json({ ok: true, updated });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Gagal recalculate realisasi' });
    }
  });

  // ─── EXTRA: Backfill kas_bank untuk PO & Payroll ──────
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
}

/**
 * Helper: Auto-journal saat PO Dibayar → Insert ke kas_bank
 * (dipisahkan agar bisa digunakan oleh dynamic route UPDATE purchase_order)
 */
async function autoPostPODibayarToKasBank(po, tenantId) {
  const [existing] = await db.query(
    'SELECT id FROM kas_bank WHERE tenant_id=? AND no_transaksi=? AND tipe="keluar"',
    [tenantId, po.no_po]
  );
  if (!existing.length) {
    const [[akun]] = await db.query('SELECT id FROM akun WHERE tenant_id=? AND kode=?', [tenantId, '2000']);
    await db.query(
      `INSERT INTO kas_bank (tenant_id, tanggal, no_transaksi, tipe, kategori, akun, akun_id, deskripsi, jumlah)
       VALUES (?, ?, ?, 'keluar', 'Pembayaran Supplier', 'Dana Bahan Baku', ?, ?, ?)`,
      [tenantId, po.tanggal || new Date(), po.no_po,
       akun?.id || null,
       `Pembayaran PO#${po.no_po} - ${po.supplier_nama || ''}`, po.total_nilai]
    );
    // Auto-recalculate budget realisasi
    await recalculateRealisasi(tenantId);
  }
}

module.exports = { registerDynamicRoutes };
