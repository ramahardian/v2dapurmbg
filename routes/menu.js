const express = require('express');
const db = require('../db');
const fs = require('fs');
const path = require('path');
// Mengimpor middleware untuk memvalidasi sesi pengguna (misalnya via token Supabase)
// Middleware ini menyisipkan req.user yang berisi informasi seperti tenant_id
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function saveBase64Foto(base64Data) {
  if (!base64Data || !base64Data.startsWith('data:image')) return base64Data || null;
  const matches = base64Data.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
  if (!matches) return null;
  try {
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const filepath = path.join(__dirname, '..', 'public', 'uploads', 'menu', filename);
    fs.writeFileSync(filepath, buffer);
    return '/uploads/menu/' + filename;
  } catch { return null; }
}

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
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Build WHERE clause for search
    let whereClause = 'WHERE m.tenant_id=?';
    const queryParams = [req.user.tenant_id];
    
    if (req.query.search) {
      whereClause += ' AND (m.nama LIKE ? OR m.kategori_penerima LIKE ? OR m.deskripsi LIKE ?)';
      const searchTerm = `%${req.query.search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }
    
    // Get total count for pagination
    const [totalCountResult] = await db.query(
      `SELECT COUNT(*) as count FROM menu m ${whereClause}`, 
      queryParams
    );
    const totalCount = totalCountResult[0].count;
    
    // Get paginated menus (tanpa JOIN, agar LIMIT/OFFSET tepat)
    const menuSql = `SELECT m.id, m.nama, m.kategori_penerima, m.deskripsi, m.gramasi_total, m.gramasi_besar, m.gramasi_kecil, m.kalori, m.protein, m.karbohidrat, m.lemak, m.serat
          FROM menu m
          ${whereClause}
          ORDER BY m.id DESC
          LIMIT ? OFFSET ?`;
    const [menus] = await db.query(menuSql, [...queryParams, Number(limit), Number(offset)]);
    
    // Batch-fetch bahan untuk semua menu di halaman ini
    const menuIds = menus.map(m => m.id);
    const bahanMap = {};
    if (menuIds.length > 0) {
      const [bahanRows] = await db.query(
       `SELECT mb.menu_id, mb.bahan_baku_id, bb.nama as bahan_nama, bb.satuan, bb.kategori_sp, bb.berat_1_sp, bb.persen_bdd, bb.berat_per_satuan, mb.jumlah, mb.keterangan
        FROM menu_bahan mb
         LEFT JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
         WHERE mb.menu_id IN (${menuIds.map(() => '?').join(',')})`,
        menuIds
      );
      bahanRows.forEach(row => {
        if (!bahanMap[row.menu_id]) bahanMap[row.menu_id] = [];
        bahanMap[row.menu_id].push({
          bahan_baku_id: row.bahan_baku_id,
          nama: row.bahan_nama,
          satuan: row.satuan,
          kategori_sp: row.kategori_sp,
          berat_1_sp: row.berat_1_sp,
          persen_bdd: row.persen_bdd,
          berat_per_satuan: row.berat_per_satuan,
          jumlah: row.jumlah,
          keterangan: row.keterangan || ''
        });
      });
    }
    
    // Attach bahan to each menu
    const menuList = menus.map(m => ({
      ...m,
      bahan: bahanMap[m.id] || []
    }));
    
    res.json({
      data: menuList,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (e) {
    console.error('GET /menu error:', e);
    res.status(500).json({ error: 'Gagal memuat menu: ' + e.message });
  }
});

/**
 * POST /menu
 * Membuat menu baru beserta komposisi bahan-bahannya.
 * Menggunakan Database Transaction untuk memastikan integritas data (header dan detail tersimpan bersamaan).
 */
router.post('/menu', async (req, res) => {
  const { nama, kategori_penerima, deskripsi, gramasi_total, gramasi_besar, gramasi_kecil, kalori, protein, karbohidrat, lemak, serat, bahan } = req.body;
  
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama menu wajib diisi' });
  
  // Cek duplikat nama menu dalam satu tenant
  const [existing] = await db.query('SELECT id FROM menu WHERE nama=? AND tenant_id=?', [nama.trim(), req.user.tenant_id]);
  if (existing.length) return res.status(409).json({ error: 'Menu dengan nama "' + nama.trim() + '" sudah ada' });
  
  const conn = await db.getConnection(); // Mengambil koneksi database dari pool
  
  // Pre-load SP values if menu has kategori_penerima
  let spMap = {};
  let jumlahPorsi = 0;
  if (kategori_penerima) {
    const [spRows] = await db.query('SELECT kategori_sp, sp_value FROM standar_sp WHERE jenjang=?', [kategori_penerima]);
    for (const r of spRows) spMap[r.kategori_sp] = Number(r.sp_value);
    const [pmRow] = await db.query('SELECT COALESCE(SUM(paket_besar + paket_kecil),0) AS total FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima=?', [req.user.tenant_id, kategori_penerima]);
    jumlahPorsi = Number(pmRow[0].total);
  }
  // Load sp_referensi_bahan dan bahan_baku untuk lookup nama
  const spRefMap = {};
  try { const [spRefRows] = await db.query('SELECT nama, berat_bersih, energi, protein, lemak, karbohidrat, serat FROM sp_referensi_bahan WHERE tenant_id=?', [req.user.tenant_id]); for (const r of spRefRows) spRefMap[r.nama] = { berat_bersih: Number(r.berat_bersih) || 0, energi: Number(r.energi) || 0, protein: Number(r.protein) || 0, lemak: Number(r.lemak) || 0, karbohidrat: Number(r.karbohidrat) || 0, serat: Number(r.serat) || 0 }; } catch (e) { /* table optional */ }
  const [bbRows] = await db.query('SELECT id, nama FROM bahan_baku WHERE tenant_id=?', [req.user.tenant_id]);
  const bbNamaMap = {};
  for (const r of bbRows) bbNamaMap[r.id] = r.nama;
  
  try {
    await conn.beginTransaction(); // Memulai transaksi
    
    // 1. Simpan data header menu
    const [r] = await conn.query(
      `INSERT INTO menu (tenant_id, nama, kategori_penerima, deskripsi, gramasi_total, gramasi_besar, gramasi_kecil, kalori, protein, karbohidrat, lemak, serat)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.tenant_id, nama, kategori_penerima || null, deskripsi || null, gramasi_total || 0, gramasi_besar || 0, gramasi_kecil || 0, kalori || 0, protein || 0, karbohidrat || 0, lemak || 0, serat || 0]);
      
    // 2. Jika ada data bahan baku, simpan ke tabel relasi (menu_bahan)
    let hasBahan = false;
    if (Array.isArray(bahan)) {
      // Batch-load bahan_baku IDs untuk verifikasi nama
      const bbCheckMap = {};
      for (const b of bahan) {
        const idB = Number(b.bahan_baku_id) || 0;
        if (idB && b.nama) bbCheckMap[idB] = null;
      }
      if (Object.keys(bbCheckMap).length) {
        const ids = Object.keys(bbCheckMap);
        const [bbRows] = await conn.query(
          `SELECT id, nama FROM bahan_baku WHERE id IN (${ids.map(() => '?').join(',')}) AND tenant_id=?`,
          [...ids, req.user.tenant_id]
        );
        for (const r of bbRows) bbCheckMap[r.id] = r.nama;
      }

      for (const b of bahan) {
        let idBahan = Number(b.bahan_baku_id) || 0;
        // Smart lookup: jika ID diberikan, verifikasi nama cocok
        // Jika ID tidak valid atau nama berubah, cari by nama
        if (idBahan && b.nama && bbCheckMap[idBahan] !== undefined && bbCheckMap[idBahan] !== b.nama) {
          // Nama berubah — cari by nama
          const [newBb] = await conn.query('SELECT id FROM bahan_baku WHERE tenant_id=? AND nama=?', [req.user.tenant_id, b.nama]);
          idBahan = newBb.length ? newBb[0].id : 0; // fallback ke auto-create
        }
        // Auto-create bahan_baku jika ID tidak ditemukan tapi nama tersedia
        if (!idBahan && b.nama) {
          const [existingBb] = await conn.query('SELECT id FROM bahan_baku WHERE tenant_id=? AND nama=?', [req.user.tenant_id, b.nama]);
          if (existingBb.length) {
            idBahan = existingBb[0].id;
          } else {
            const [bbInsert] = await conn.query(
              `INSERT INTO bahan_baku (tenant_id, nama, satuan, kategori_sp, berat_1_sp, persen_bdd, berat_per_satuan, kalori, protein, karbohidrat, lemak, serat)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
              [req.user.tenant_id, b.nama, b.satuan || 'g', b.kategori_sp || null,
               Number(b.berat_1_sp) || 0, Number(b.persen_bdd) || 100, Number(b.berat_per_satuan) || Number(b.berat_1_sp) || 0,
               Number(b.kalori) || 0, Number(b.protein) || 0, Number(b.karbohidrat) || 0, Number(b.lemak) || 0, Number(b.serat) || 0]
            );
            idBahan = bbInsert.insertId;
          }
        }
        if (!idBahan) continue;
        let jumlah = Number(b.jumlah) || 0;
        // Auto-calculate from SP if bahan has SP data and we have a matching SP value
        if (jumlah === 0 && b.kategori_sp && spMap[b.kategori_sp]) {
          const spVal = spMap[b.kategori_sp];
          const namaBahan = b.nama || bbNamaMap[idBahan] || '';
          const refData = spRefMap[namaBahan] || {};
          const berat1Sp = refData.berat_bersih || Number(b.berat_1_sp) || 0;
          jumlah = berat1Sp * spVal * (jumlahPorsi || 1);
        }
        if (jumlah > 0) {
          await conn.query('INSERT INTO menu_bahan (menu_id, bahan_baku_id, jumlah, keterangan) VALUES (?,?,?,?)', [r.insertId, idBahan, jumlah, b.keterangan || null]);
          hasBahan = true;
        }
      }
    }
    
    // Hitung dan simpan nilai gizi dari bahan yang baru disimpan
    if (hasBahan) {
      try {
        const [menuBahanRows] = await conn.query(
          `SELECT mb.jumlah, bb.nama, bb.kalori, bb.protein, bb.karbohidrat, bb.lemak, bb.serat
           FROM menu_bahan mb JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
           WHERE mb.menu_id=?`,
          [r.insertId]
        );
        let calcGramasi = 0, calcKalori = 0, calcProtein = 0, calcKarbohidrat = 0, calcLemak = 0, calcSerat = 0;
        for (const b of menuBahanRows) {
          const jml = Number(b.jumlah) || 0;
          const ref = spRefMap[b.nama] || {};
          calcGramasi += jml;
          calcKalori += jml / 100 * (Number(ref.energi || b.kalori) || 0);
          calcProtein += jml / 100 * (Number(ref.protein || b.protein) || 0);
          calcKarbohidrat += jml / 100 * (Number(ref.karbohidrat || b.karbohidrat) || 0);
          calcLemak += jml / 100 * (Number(ref.lemak || b.lemak) || 0);
          calcSerat += jml / 100 * (Number(ref.serat || b.serat) || 0);
        }
        if (calcKalori > 0 || calcProtein > 0 || calcKarbohidrat > 0 || calcLemak > 0 || calcSerat > 0) {
          await conn.query(
            'UPDATE menu SET gramasi_total=?, kalori=?, protein=?, karbohidrat=?, lemak=?, serat=? WHERE id=?',
            [Math.round(calcGramasi * 10) / 10, Math.round(calcKalori * 10) / 10, Math.round(calcProtein * 10) / 10,
             Math.round(calcKarbohidrat * 10) / 10, Math.round(calcLemak * 10) / 10, Math.round(calcSerat * 10) / 10, r.insertId]
          );
        }
      } catch (e2) { console.error('Gagal hitung nutrisi menu:', e2.message); }
    }

    // Sync siklus_menu_item_bahan jika menu dibuat dari siklus
    const siklusSource = req.body.siklus_source;
    if (siklusSource && siklusSource.siklus_id && Array.isArray(bahan)) {
      try {
        // Hapus existing siklus_menu_item_bahan untuk hari ini
        await conn.query(
          'DELETE FROM siklus_menu_item_bahan WHERE siklus_id=? AND hari_ke=?',
          [siklusSource.siklus_id, siklusSource.hari_ke]
        );
        // Insert ulang dengan bahan terbaru dari form
        for (const b of bahan) {
          let idBahan = Number(b.bahan_baku_id) || 0;
          if (idBahan) {
            await conn.query(
              'INSERT INTO siklus_menu_item_bahan (siklus_id, hari_ke, kategori_sp, bahan_baku_id) VALUES (?,?,?,?)',
              [siklusSource.siklus_id, siklusSource.hari_ke, b.kategori_sp || null, idBahan]
            );
          }
        }
      } catch (e3) { console.error('Gagal sync siklus:', e3.message); }
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
    
    if (!f.nama || !f.nama.trim()) return res.status(400).json({ error: 'Nama menu wajib diisi' });
    
    // Cek duplikat nama (kecuali dirinya sendiri)
    const [existing] = await conn.query('SELECT id FROM menu WHERE nama=? AND tenant_id=? AND id!=?', [f.nama.trim(), req.user.tenant_id, req.params.id]);
    if (existing.length) {
      await conn.rollback();
      return res.status(409).json({ error: 'Menu dengan nama "' + f.nama.trim() + '" sudah ada' });
    }
    
    // Pre-load SP values if menu has kategori_penerima
    let spMap = {};
    let jumlahPorsi = 0;
    if (f.kategori_penerima) {
      const [spRows] = await db.query('SELECT kategori_sp, sp_value FROM standar_sp WHERE jenjang=?', [f.kategori_penerima]);
      for (const r of spRows) spMap[r.kategori_sp] = Number(r.sp_value);
      const [pmRow] = await db.query('SELECT COALESCE(SUM(paket_besar + paket_kecil),0) AS total FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima=?', [req.user.tenant_id, f.kategori_penerima]);
      jumlahPorsi = Number(pmRow[0].total);
    }
    const spRefMap = {};
    try { const [spRefRows] = await db.query('SELECT nama, berat_bersih, energi, protein, lemak, karbohidrat, serat FROM sp_referensi_bahan WHERE tenant_id=?', [req.user.tenant_id]); for (const r of spRefRows) spRefMap[r.nama] = { berat_bersih: Number(r.berat_bersih) || 0, energi: Number(r.energi) || 0, protein: Number(r.protein) || 0, lemak: Number(r.lemak) || 0, karbohidrat: Number(r.karbohidrat) || 0, serat: Number(r.serat) || 0 }; } catch (e) { /* table optional */ }
    const [bbRows] = await db.query('SELECT id, nama FROM bahan_baku WHERE tenant_id=?', [req.user.tenant_id]);
    const bbNamaMap = {};
    for (const r of bbRows) bbNamaMap[r.id] = r.nama;
    
    // 1. Update data header menu sesuai ID dan kepemilikan tenant
    await conn.query(
      `UPDATE menu SET nama=?, kategori_penerima=?, deskripsi=?, gramasi_total=?, gramasi_besar=?, gramasi_kecil=?, kalori=?, protein=?, karbohidrat=?, lemak=?, serat=? WHERE id=? AND tenant_id=?`,
      [f.nama, f.kategori_penerima || null, f.deskripsi || null, f.gramasi_total || 0, f.gramasi_besar || 0, f.gramasi_kecil || 0, f.kalori || 0, f.protein || 0, f.karbohidrat || 0, f.lemak || 0, f.serat || 0, req.params.id, req.user.tenant_id]);
      
    // 2. Perbarui detail bahan baku
    let hasBahan = false;
    // 2. Perbarui detail bahan baku — delete & re-insert
    if (Array.isArray(f.bahan)) {
      // Hapus seluruh relasi bahan lama yang terkait dengan menu ini
      await conn.query('DELETE FROM menu_bahan WHERE menu_id=?', [req.params.id]);
      
      // Batch-load bahan_baku IDs untuk verifikasi nama
      const bbCheckMap = {};
      for (const b of f.bahan) {
        const idB = Number(b.bahan_baku_id) || 0;
        if (idB && b.nama) bbCheckMap[idB] = null;
      }
      if (Object.keys(bbCheckMap).length) {
        const ids = Object.keys(bbCheckMap);
        const [bbRows] = await conn.query(
          `SELECT id, nama FROM bahan_baku WHERE id IN (${ids.map(() => '?').join(',')}) AND tenant_id=?`,
          [...ids, req.user.tenant_id]
        );
        for (const r of bbRows) bbCheckMap[r.id] = r.nama;
      }

      // Masukkan ulang data bahan baku yang baru dikirimkan dari client
      for (const b of f.bahan) {
        let idBahan = Number(b.bahan_baku_id) || 0;
        // Smart lookup: jika ID diberikan, verifikasi nama cocok
        if (idBahan && b.nama && bbCheckMap[idBahan] !== undefined && bbCheckMap[idBahan] !== b.nama) {
          // Nama berubah — cari by nama
          const [newBb] = await conn.query('SELECT id FROM bahan_baku WHERE tenant_id=? AND nama=?', [req.user.tenant_id, b.nama]);
          idBahan = newBb.length ? newBb[0].id : 0; // fallback ke auto-create
        }
        // Auto-create bahan_baku jika ID tidak ditemukan tapi nama tersedia
        if (!idBahan && b.nama) {
          const [existingBb] = await conn.query('SELECT id FROM bahan_baku WHERE tenant_id=? AND nama=?', [req.user.tenant_id, b.nama]);
          if (existingBb.length) {
            idBahan = existingBb[0].id;
          } else {
            const [bbInsert] = await conn.query(
              `INSERT INTO bahan_baku (tenant_id, nama, satuan, kategori_sp, berat_1_sp, persen_bdd, berat_per_satuan, kalori, protein, karbohidrat, lemak, serat)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
              [req.user.tenant_id, b.nama, b.satuan || 'g', b.kategori_sp || null,
               Number(b.berat_1_sp) || 0, Number(b.persen_bdd) || 100, Number(b.berat_per_satuan) || Number(b.berat_1_sp) || 0,
               Number(b.kalori) || 0, Number(b.protein) || 0, Number(b.karbohidrat) || 0, Number(b.lemak) || 0, Number(b.serat) || 0]
            );
            idBahan = bbInsert.insertId;
          }
        }
        if (!idBahan) continue;
        let jumlah = Number(b.jumlah) || 0;
        // Auto-calculate from SP if bahan has SP data and we have a matching SP value
        if (jumlah === 0 && b.kategori_sp && spMap[b.kategori_sp]) {
          const spVal = spMap[b.kategori_sp];
          const namaBahan = b.nama || bbNamaMap[idBahan] || '';
          const refData = spRefMap[namaBahan] || {};
          const berat1Sp = refData.berat_bersih || Number(b.berat_1_sp) || 0;
          jumlah = berat1Sp * spVal * (jumlahPorsi || 1);
        }
        if (jumlah > 0) {
          await conn.query('INSERT INTO menu_bahan (menu_id, bahan_baku_id, jumlah, keterangan) VALUES (?,?,?,?)', [req.params.id, idBahan, jumlah, b.keterangan || null]);
          hasBahan = true;
        }
      }
    }
    
    // Hitung dan simpan nilai gizi dari bahan yang baru disimpan
    if (hasBahan) {
      try {
        const [menuBahanRows] = await conn.query(
          `SELECT mb.jumlah, bb.nama, bb.kalori, bb.protein, bb.karbohidrat, bb.lemak, bb.serat
           FROM menu_bahan mb JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
           WHERE mb.menu_id=?`,
          [req.params.id]
        );
        let calcGramasi = 0, calcKalori = 0, calcProtein = 0, calcKarbohidrat = 0, calcLemak = 0, calcSerat = 0;
        for (const b of menuBahanRows) {
          const jml = Number(b.jumlah) || 0;
          const ref = spRefMap[b.nama] || {};
          calcGramasi += jml;
          calcKalori += jml / 100 * (Number(ref.energi || b.kalori) || 0);
          calcProtein += jml / 100 * (Number(ref.protein || b.protein) || 0);
          calcKarbohidrat += jml / 100 * (Number(ref.karbohidrat || b.karbohidrat) || 0);
          calcLemak += jml / 100 * (Number(ref.lemak || b.lemak) || 0);
          calcSerat += jml / 100 * (Number(ref.serat || b.serat) || 0);
        }
        if (calcKalori > 0 || calcProtein > 0 || calcKarbohidrat > 0 || calcLemak > 0 || calcSerat > 0) {
          await conn.query(
            'UPDATE menu SET gramasi_total=?, kalori=?, protein=?, karbohidrat=?, lemak=?, serat=? WHERE id=? AND tenant_id=?',
            [Math.round(calcGramasi * 10) / 10, Math.round(calcKalori * 10) / 10, Math.round(calcProtein * 10) / 10,
             Math.round(calcKarbohidrat * 10) / 10, Math.round(calcLemak * 10) / 10, Math.round(calcSerat * 10) / 10,
             req.params.id, req.user.tenant_id]
          );
        }
      } catch (e2) { console.error('Gagal hitung nutrisi menu:', e2.message); }
    }

    // Sync siklus_menu_item_bahan jika menu diedit dari siklus
    const siklusSource = f.siklus_source;
    if (siklusSource && siklusSource.siklus_id && Array.isArray(f.bahan)) {
      try {
        // Hapus existing siklus_menu_item_bahan untuk hari ini
        await conn.query(
          'DELETE FROM siklus_menu_item_bahan WHERE siklus_id=? AND hari_ke=?',
          [siklusSource.siklus_id, siklusSource.hari_ke]
        );
        // Insert ulang dengan bahan terbaru dari form
        for (const b of f.bahan) {
          let idBahan = Number(b.bahan_baku_id) || 0;
          if (idBahan) {
            await conn.query(
              'INSERT INTO siklus_menu_item_bahan (siklus_id, hari_ke, kategori_sp, bahan_baku_id) VALUES (?,?,?,?)',
              [siklusSource.siklus_id, siklusSource.hari_ke, b.kategori_sp || null, idBahan]
            );
          }
        }
      } catch (e3) { console.error('Gagal sync siklus:', e3.message); }
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

router.post('/menu/bulk-delete', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'IDs wajib diisi' });
  const placeholders = ids.map(() => '?').join(',');
  await db.query(`DELETE FROM menu WHERE id IN (${placeholders}) AND tenant_id=?`, [...ids, req.user.tenant_id]);
  res.json({ ok: true, deleted: ids.length });
});

/**
 * GET /menu/by-siklus
 * Mengembalikan menu yang dikelompokkan berdasarkan siklus (jika ada),
 * plus menu yang tidak terpakai di siklus manapun (standalone).
 */
router.get('/menu/by-siklus', async (req, res) => {
  // 1. Ambil semua siklus dengan itemnya
  const [siklusList] = await db.query(
    'SELECT id, nama, kategori_penerima, jumlah_porsi, total_hari, status FROM siklus_menu WHERE tenant_id=? ORDER BY id DESC',
    [req.user.tenant_id]
  );

  // 2. Ambil semua menu milik tenant
  const [allMenus] = await db.query(
    'SELECT id, nama, kategori_penerima, deskripsi, gramasi_total, kalori, protein, karbohidrat, lemak, serat FROM menu WHERE tenant_id=? ORDER BY nama ASC',
    [req.user.tenant_id]
  );

  // 3. Batch-load items untuk semua siklus
  const siklusIds = siklusList.map(s => s.id);
  const allItems = {};
  const usedMenuIds = new Set();
  if (siklusIds.length) {
    const ph = siklusIds.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT si.siklus_id, si.hari_ke, si.hari_nama, si.menu_id, si.menu_nama, si.jumlah_porsi, si.kalori, si.protein, si.karbohidrat, si.lemak, si.serat,
              si.resep_map,
              m.nama AS menu_nama_lengkap, m.gramasi_total, m.kategori_penerima AS menu_kategori
       FROM siklus_menu_item si
       LEFT JOIN menu m ON m.id = si.menu_id
       WHERE si.siklus_id IN (${ph})
       ORDER BY si.siklus_id, si.hari_ke ASC`,
      siklusIds
    );
    for (const r of rows) {
      if (!allItems[r.siklus_id]) allItems[r.siklus_id] = [];
      allItems[r.siklus_id].push(r);
      if (r.menu_id) usedMenuIds.add(r.menu_id);
    }
  }

  // 3b. Batch-load grid bahan data (siklus_menu_item_bahan) untuk fallback nama
  let gridBahanBySiklus = {};
  if (siklusIds.length) {
    const ph = siklusIds.map(() => '?').join(',');
    const [gridRows] = await db.query(
      `SELECT sb.siklus_id, sb.hari_ke, sb.kategori_sp, COALESCE(b.nama, '(bahan dihapus)') AS bahan_nama
       FROM siklus_menu_item_bahan sb
       LEFT JOIN bahan_baku b ON b.id = sb.bahan_baku_id
       WHERE sb.siklus_id IN (${ph})`,
      siklusIds
    );
    for (const g of gridRows) {
      if (!gridBahanBySiklus[g.siklus_id]) gridBahanBySiklus[g.siklus_id] = {};
      if (!gridBahanBySiklus[g.siklus_id][g.hari_ke]) gridBahanBySiklus[g.siklus_id][g.hari_ke] = [];
      gridBahanBySiklus[g.siklus_id][g.hari_ke].push({ kategori_sp: g.kategori_sp, nama: g.bahan_nama });
    }
  }

  // 4. Build siklus groups
  const KAT_ORDER = ['Karbohidrat','Protein Hewani','Protein Nabati','Sayur','Buah','Susu','Minyak'];
  const siklusGroups = [];
  for (const s of siklusList) {
    const items = allItems[s.id] || [];
    const days = items.map(it => {
      // For items with menu_id, use menu name from DB. For items without, rebuild always.
      let menuNama = it.menu_id ? (it.menu_nama || it.menu_nama_lengkap || null) : null;
      let hasContent = !!it.menu_id;

      if (!it.menu_id) {
        // Priority 1: resep_map (explicit recipe names like "Nasi Kebuli")
        if (it.resep_map) {
          try {
            const map = typeof it.resep_map === 'string' ? JSON.parse(it.resep_map) : it.resep_map;
            const names = Object.values(map).filter(v => v && v.trim());
            if (names.length) {
              menuNama = names.join(' + ');
            }
          } catch (e) { /* ignore parse error */ }
        }

        // Priority 2: fallback ke nama bahan dari grid picker
        if (!menuNama) {
          const dayBahan = (gridBahanBySiklus[s.id] || {})[it.hari_ke] || [];
          if (dayBahan.length) {
            const grouped = {};
            for (const b of dayBahan) {
              const kat = b.kategori_sp || 'Lainnya';
              if (!grouped[kat]) grouped[kat] = [];
              grouped[kat].push(b.nama);
            }
            const parts = [];
            for (const kat of KAT_ORDER) {
              if (grouped[kat] && grouped[kat].length) {
                parts.push(grouped[kat].join(', '));
              }
            }
            for (const [kat, names] of Object.entries(grouped)) {
              if (!KAT_ORDER.includes(kat)) {
                parts.push(names.join(', ') + ' (' + kat + ')');
              }
            }
            if (parts.length) {
              menuNama = parts.join(' + ');
            }
          }
        }

        if (menuNama) {
          hasContent = true;
        }
      }

      return {
        hari_ke: it.hari_ke,
        hari_nama: it.hari_nama,
        menu_id: it.menu_id,
        menu_nama: menuNama || '-',
        jumlah_porsi: Number(it.jumlah_porsi) || 0,
        kalori: Number(it.kalori || it.kalori) || 0,
        gramasi_total: Number(it.gramasi_total) || 0,
        _has_content: hasContent,
      };
    });

    siklusGroups.push({
      id: s.id,
      nama: s.nama,
      kategori_penerima: s.kategori_penerima,
      jumlah_porsi: Number(s.jumlah_porsi) || 0,
      total_hari: Number(s.total_hari) || 7,
      status: s.status,
      days,
      menu_count: new Set(items.filter(it => it.menu_id).map(it => it.menu_id)).size,
    });
  }

  // 4. Menu yang tidak dipakai di siklus manapun
  const standaloneMenus = allMenus.filter(m => !usedMenuIds.has(m.id));

  // 5. Siapkan juga data menu lengkap dengan bahannya untuk kemudahan
  const menuDetails = {};
  for (const m of allMenus) {
    menuDetails[m.id] = m;
  }

  res.json({
    siklus_groups: siklusGroups,
    standalone: standaloneMenus,
    total_menu: allMenus.length,
    used_in_siklus: usedMenuIds.size,
  });
});

/**
 * GET /menu/:id
 * Mengambil detail menu beserta bahan-bahannya untuk diedit.
 */
router.get('/menu/:id', async (req, res) => {
  const [menus] = await db.query(
    `SELECT m.id, m.nama, m.kategori_penerima, m.deskripsi, m.gramasi_total, m.gramasi_besar, m.gramasi_kecil, m.kalori, m.protein, m.karbohidrat, m.lemak, m.serat,
        mb.bahan_baku_id, bb.nama as bahan_nama, bb.satuan, bb.kategori_sp, bb.berat_1_sp, bb.persen_bdd, bb.berat_per_satuan, mb.jumlah, mb.keterangan
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
    gramasi_besar: menus[0].gramasi_besar,
    gramasi_kecil: menus[0].gramasi_kecil,
    kalori: menus[0].kalori,
    protein: menus[0].protein,
    karbohidrat: menus[0].karbohidrat,
    lemak: menus[0].lemak,
    serat: menus[0].serat,
    bahan: []
  };
  menus.forEach(row => {
    if (row.bahan_baku_id) {
      m.bahan.push({ bahan_baku_id: row.bahan_baku_id, nama: row.bahan_nama, satuan: row.satuan, kategori_sp: row.kategori_sp, berat_1_sp: row.berat_1_sp, persen_bdd: row.persen_bdd, berat_per_satuan: row.berat_per_satuan, jumlah: row.jumlah, keterangan: row.keterangan || '' });
    }
  });
  res.json(m);
});

/**
 * GET /menu/batch?ids=1,2,3
 * Batch load menu dengan bahan-nya untuk menghindari N+1 di frontend.
 */
router.get('/menu/batch', async (req, res) => {
  const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean);
  if (!ids.length) return res.json({});
  const ph = ids.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT m.id, m.nama, m.kategori_penerima, m.deskripsi, m.gramasi_total, m.gramasi_besar, m.gramasi_kecil, m.kalori, m.protein, m.karbohidrat, m.lemak, m.serat,
        mb.bahan_baku_id, bb.nama as bahan_nama, bb.satuan, bb.kategori_sp, bb.berat_1_sp, bb.persen_bdd, bb.berat_per_satuan, mb.jumlah, mb.keterangan
     FROM menu m
     LEFT JOIN menu_bahan mb ON mb.menu_id = m.id
     LEFT JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
     WHERE m.id IN (${ph}) AND m.tenant_id=?`,
    [...ids, req.user.tenant_id]
  );
  const map = {};
  for (const row of rows) {
    if (!map[row.id]) {
      map[row.id] = {
        id: row.id, nama: row.nama, kategori_penerima: row.kategori_penerima,
        deskripsi: row.deskripsi, gramasi_total: row.gramasi_total,
        gramasi_besar: row.gramasi_besar, gramasi_kecil: row.gramasi_kecil,
        kalori: row.kalori, protein: row.protein, karbohidrat: row.karbohidrat,
        lemak: row.lemak, serat: row.serat, bahan: []
      };
    }
    if (row.bahan_baku_id) {
      map[row.id].bahan.push({
        bahan_baku_id: row.bahan_baku_id, nama: row.bahan_nama, satuan: row.satuan,
        kategori_sp: row.kategori_sp, berat_1_sp: row.berat_1_sp,
        persen_bdd: row.persen_bdd, berat_per_satuan: row.berat_per_satuan,
        jumlah: row.jumlah, keterangan: row.keterangan || ''
      });
    }
  }
  res.json(map);
});

// Hitung ulang nutrisi semua menu — prioritaskan sp_referensi_bahan, fallback ke bahan_baku
router.post('/menu/recalculate-nutrisi', async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    // Load sp_referensi_bahan for nutrition lookup
    const spRefNutri = {};
    try { const [rows] = await db.query('SELECT nama, energi, protein, lemak, karbohidrat, serat FROM sp_referensi_bahan WHERE tenant_id=?', [tenantId]); for (const r of rows) spRefNutri[r.nama] = r; } catch (e) {}
    const [menuBahanJoin] = await db.query(
      `SELECT DISTINCT mb.menu_id, mb.jumlah, bb.nama, bb.kalori, bb.protein, bb.karbohidrat, bb.lemak, bb.serat
       FROM menu_bahan mb
       JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
       WHERE mb.menu_id IN (SELECT id FROM menu WHERE tenant_id=?)`,
      [tenantId]
    );
    const bahanByMenu = {};
    for (const b of menuBahanJoin) {
      if (!bahanByMenu[b.menu_id]) bahanByMenu[b.menu_id] = [];
      bahanByMenu[b.menu_id].push(b);
    }
    const [menus] = await db.query('SELECT id FROM menu WHERE tenant_id=?', [tenantId]);
    let recalculated = 0;
    for (const menu of menus) {
      const bahan = bahanByMenu[menu.id] || [];
      let gramasi = 0, kalori = 0, protein = 0, karbohidrat = 0, lemak = 0, serat = 0;
      for (const b of bahan) {
        const jml = Number(b.jumlah) || 0;
        const ref = spRefNutri[b.nama] || {};
        gramasi += jml;
        kalori += jml / 100 * (Number(ref.energi || b.kalori) || 0);
        protein += jml / 100 * (Number(ref.protein || b.protein) || 0);
        karbohidrat += jml / 100 * (Number(ref.karbohidrat || b.karbohidrat) || 0);
        lemak += jml / 100 * (Number(ref.lemak || b.lemak) || 0);
        serat += jml / 100 * (Number(ref.serat || b.serat) || 0);
      }
      await db.query(
        `UPDATE menu SET gramasi_total=?, kalori=?, protein=?, karbohidrat=?, lemak=?, serat=? WHERE id=? AND tenant_id=?`,
        [Math.round(gramasi * 10) / 10, Math.round(kalori * 10) / 10, Math.round(protein * 10) / 10,
         Math.round(karbohidrat * 10) / 10, Math.round(lemak * 10) / 10, Math.round(serat * 10) / 10,
         menu.id, tenantId]
      );
      recalculated++;
    }
    res.json({ ok: true, recalculated, total: menus.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal recalculate' });
  }
});

module.exports = router;