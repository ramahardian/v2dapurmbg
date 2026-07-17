const express = require('express');
const db = require('../db');
const fs = require('fs');
const path = require('path');
const { requireAuth, requireRole } = require('../middleware/auth');
const { FIXED_KATEGORI, KATEGORI_MAP_DISPLAY, mapToDisplay, hitungBDD } = require('../services/spBddCalculator');

function saveBase64Foto(base64Data) {
  if (!base64Data || !base64Data.startsWith('data:image')) return base64Data || null;
  const matches = base64Data.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
  if (!matches) return null;
  try {
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const filepath = path.join(__dirname, '..', 'public', 'uploads', 'siklus', filename);
    fs.writeFileSync(filepath, buffer);
    return '/uploads/siklus/' + filename;
  } catch { return null; }
}

const router = express.Router();

router.use(requireAuth);
router.use((req, res, next) => {
  if (req.path.startsWith('/siklus') || req.path.startsWith('/bahan')) return requireRole('admin', 'ahli_gizi')(req, res, next);
  next();
});

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
  for (const s of rows) {
    const [items] = await db.query(
      'SELECT * FROM siklus_menu_item WHERE siklus_id=? ORDER BY hari_ke ASC',
      [s.id]
    );
    s.items = items;
  }
  res.json(rows);
});

/**
 * GET /siklus/laporan
 * Mengambil semua siklus dengan laporan agregat (coverage, rata-rata gizi, dll).
 */
router.get('/siklus/laporan', async (req, res) => {
  const [siklusList] = await db.query(
    'SELECT * FROM siklus_menu WHERE tenant_id=? ORDER BY id DESC',
    [req.user.tenant_id]
  );

  const result = [];
  let totalSiklus = 0, totalFilled = 0, totalDays = 0, totalUniqueMenus = 0;
  const allMenuSet = new Set();

  for (const s of siklusList) {
    const [items] = await db.query(
      'SELECT * FROM siklus_menu_item WHERE siklus_id=? ORDER BY hari_ke ASC',
      [s.id]
    );

    const totalHari = s.total_hari || items.length || 7;
    const filledDays = items.filter(it => it.menu_id).length;
    const coverage = totalHari ? Math.round((filledDays / totalHari) * 100) : 0;
    const uniqueMenus = new Set(items.filter(it => it.menu_id).map(it => it.menu_id));

    const totals = items.reduce((acc, it) => ({
      kalori: acc.kalori + Number(it.kalori || 0),
      protein: acc.protein + Number(it.protein || 0),
      karbohidrat: acc.karbohidrat + Number(it.karbohidrat || 0),
      lemak: acc.lemak + Number(it.lemak || 0),
      serat: acc.serat + Number(it.serat || 0),
    }), { kalori: 0, protein: 0, karbohidrat: 0, lemak: 0, serat: 0 });

    const avg = filledDays ? {
      kalori: Math.round(totals.kalori / filledDays),
      protein: Math.round(totals.protein / filledDays),
      karbohidrat: Math.round(totals.karbohidrat / filledDays),
      lemak: Math.round(totals.lemak / filledDays),
      serat: Math.round(totals.serat / filledDays),
    } : { kalori: 0, protein: 0, karbohidrat: 0, lemak: 0, serat: 0 };

    result.push({ ...s, stats: { totalDays: totalHari, filledDays, coverage, uniqueMenus: uniqueMenus.size, totals, avg } });
    totalSiklus++;
    totalFilled += filledDays;
    totalDays += totalHari;
    uniqueMenus.forEach(m => allMenuSet.add(m));
  }

  res.json({
    siklus: result,
    ringkasan: {
      totalSiklus,
      totalHari: totalDays,
      totalFilled,
      totalKosong: totalDays - totalFilled,
      totalMenuUnik: allMenuSet.size,
      rataCoverage: totalDays ? Math.round((totalFilled / totalDays) * 100) : 0,
    }
  });
});

/**
 * GET /siklus/laporan/bahan
 * Mengambil rincian kebutuhan bahan baku per hari dari semua siklus.
 * Menggabungkan siklus_menu_item → menu → menu_bahan → bahan_baku.
 */
router.get('/siklus/laporan/bahan', async (req, res) => {
  const [siklusList] = await db.query(
    'SELECT id, nama, kategori_penerima, jumlah_porsi FROM siklus_menu WHERE tenant_id=? ORDER BY id DESC',
    [req.user.tenant_id]
  );

  const dayRows = [];
  const dayMap = {};

  for (const s of siklusList) {
    const [items] = await db.query(
      `SELECT si.*, m.gramasi_total
       FROM siklus_menu_item si
       LEFT JOIN menu m ON m.id = si.menu_id
       WHERE si.siklus_id=? AND si.menu_id IS NOT NULL
       ORDER BY si.hari_ke ASC`,
      [s.id]
    );

    for (const it of items) {
      const dayKey = `${s.id}-${it.hari_ke}`;
      if (!dayMap[dayKey]) {
        dayMap[dayKey] = {
          siklus_id: s.id,
          siklus_nama: s.nama,
          kategori_db: s.kategori_penerima || '-',
          hari_ke: it.hari_ke,
          hari_nama: it.hari_nama,
          jumlah_porsi: Number(it.jumlah_porsi) || 0,
          menu_ids: [],
        };
      }
      dayMap[dayKey].menu_ids.push(it.menu_id);
    }
  }

  for (const [key, day] of Object.entries(dayMap)) {
    if (!day.menu_ids.length) continue;
    const placeholders = day.menu_ids.map(() => '?').join(',');
    const [bahanRows] = await db.query(
      `SELECT mb.bahan_baku_id, b.nama as bahan_nama, b.satuan, b.persen_bdd, mb.jumlah, mb.menu_id, m.kategori_penerima
       FROM menu_bahan mb
       JOIN bahan_baku b ON b.id = mb.bahan_baku_id
       JOIN menu m ON m.id = mb.menu_id
       WHERE mb.menu_id IN (${placeholders})`,
      day.menu_ids
    );

    for (const br of bahanRows) {
      const katDb = br.kategori_penerima || day.kategori_db;
      const katDisplay = mapToDisplay(katDb);
      const beratBersih = Number(br.jumlah) * day.jumlah_porsi;
      const beratKotor = hitungBDD(beratBersih, br.persen_bdd);
      dayRows.push({
        hari_nama: day.hari_nama,
        hari_ke: day.hari_ke,
        siklus_id: day.siklus_id,
        siklus_nama: day.siklus_nama,
        kategori_db: katDb,
        kategori: katDisplay,
        bahan_id: br.bahan_baku_id,
        bahan_nama: br.bahan_nama,
        satuan: br.satuan,
        jumlah: beratKotor,
        jumlah_porsi: day.jumlah_porsi,
        gramasi_total: beratKotor,
      });
    }
  }

  // Aggregate by (hari_ke, hari_nama, bahan_id, kategori_display)
  const agg = {};
  for (const r of dayRows) {
    const key = `${r.hari_ke}|${r.hari_nama}|${r.bahan_id}|${r.kategori}`;
    if (!agg[key]) agg[key] = { ...r, jumlah: 0, gramasi_total: 0, jumlah_porsi: 0 };
    agg[key].jumlah += r.jumlah;
    agg[key].gramasi_total += r.gramasi_total;
    agg[key].jumlah_porsi += r.jumlah_porsi;
  }

  const aggregated = Object.values(agg);

  // Group by hari
  const byDay = {};
  for (const r of aggregated) {
    const dk = `${r.hari_ke}-${r.hari_nama}`;
    if (!byDay[dk]) byDay[dk] = { hari_ke: r.hari_ke, hari_nama: r.hari_nama, items: [], porsi_per_kat: {} };
    byDay[dk].items.push(r);
    byDay[dk].porsi_per_kat[r.kategori] = (byDay[dk].porsi_per_kat[r.kategori] || 0) + r.jumlah_porsi;
  }

  // Build matrix per day: each row = bahan, columns = fixed kategori
  const result = [];
  for (const dk of Object.keys(byDay).sort((a, b) => {
    const [ka] = a.split('-');
    const [kb] = b.split('-');
    return Number(ka) - Number(kb);
  })) {
    const day = byDay[dk];
    const bahanGroup = {};
    for (const it of day.items) {
      if (!bahanGroup[it.bahan_nama]) {
        bahanGroup[it.bahan_nama] = { bahan_nama: it.bahan_nama, satuan: it.satuan, per_kategori: {}, total: 0 };
      }
      bahanGroup[it.bahan_nama].per_kategori[it.kategori] = (bahanGroup[it.bahan_nama].per_kategori[it.kategori] || 0) + it.jumlah;
      bahanGroup[it.bahan_nama].total += it.jumlah;
    }
    result.push({
      hari_ke: day.hari_ke,
      hari_nama: day.hari_nama,
      label: day.hari_nama + ', ' + day.hari_ke,
      bahan: Object.values(bahanGroup),
      fixed_kategori: FIXED_KATEGORI,
      porsi_per_kat: day.porsi_per_kat,
    });
  }

  res.json({ days: result, fixed_kategori: FIXED_KATEGORI, kategori_map: KATEGORI_MAP_DISPLAY });
});

/**
 * GET /siklus/laporan/bahan-per-jenjang
 * Mengembalikan data kebutuhan bahan per menu/hari, dipecah per jenjang penerima manfaat.
 * Setiap baris bahan menampilkan berat bersih, BDD%, berat kotor, jumlah siswa per jenjang, dan kebutuhan (kg).
 * Format gabung 1 tabel: kolom [Jumlah | Kebutuhan] diulang untuk setiap jenjang.
 */
router.get('/siklus/laporan/bahan-per-jenjang', async (req, res) => {
  const JENJANG_DISPLAY_ORDER = ['TK/PAUD', 'SD/MI (1-3)', 'SD/MI (4-6)', 'SMP/MTs, SMA/SMK', 'Bumil/Busui', 'Balita'];
  const JENJANG_DB_MAP = {
    'TK/PAUD': ['TK/PAUD', 'TK', 'PAUD'],
    'SD/MI (1-3)': ['SD 1-3', 'SD/MI (1-3)', 'SD'],
    'SD/MI (4-6)': ['SD 4-6', 'SD/MI (4-6)'],
    'SMP/MTs, SMA/SMK': ['SMP', 'SMA', 'SMP/MTs, SMA/SMK'],
    'Bumil/Busui': ['Ibu Hamil', 'Ibu Menyusui', 'Bumil/Busui'],
    'Balita': ['Balita'],
  };
  const dbToDisplay = {};
  for (const [display, dbVals] of Object.entries(JENJANG_DB_MAP)) {
    for (const dv of dbVals) dbToDisplay[dv] = display;
  }

  const [siklusList] = await db.query(
    'SELECT id, nama, kategori_penerima, jumlah_porsi FROM siklus_menu WHERE tenant_id=? AND status="Aktif" ORDER BY id',
    [req.user.tenant_id]
  );

  const [pmRows] = await db.query(
    `SELECT COALESCE(kategori_penerima, 'Lainnya') AS jenjang,
            COALESCE(SUM(paket_besar + paket_kecil),0) AS total_penerima
     FROM penerima_manfaat WHERE tenant_id=?
     GROUP BY kategori_penerima`,
    [req.user.tenant_id]
  );
  const pmByDb = {};
  for (const p of pmRows) {
    pmByDb[p.jenjang] = Number(p.total_penerima);
  }
  const pmByDisplay = {};
  for (const [dbJenjang, total] of Object.entries(pmByDb)) {
    const display = dbToDisplay[dbJenjang] || dbJenjang;
    pmByDisplay[display] = (pmByDisplay[display] || 0) + total;
  }
  const activeJenjang = JENJANG_DISPLAY_ORDER.filter(j => pmByDisplay[j] && pmByDisplay[j] > 0);

  const menus = [];
  let menuCounter = 0;

  for (const s of siklusList) {
    const [items] = await db.query(
      `SELECT si.hari_ke, si.hari_nama, si.menu_id, m.nama AS menu_nama, m.gramasi_total
       FROM siklus_menu_item si
       LEFT JOIN menu m ON m.id = si.menu_id
       WHERE si.siklus_id=? AND si.menu_id IS NOT NULL
       ORDER BY si.hari_ke ASC`,
      [s.id]
    );

    for (const it of items) {
      menuCounter++;
      const [bahanRows] = await db.query(
        `SELECT b.nama, b.satuan, b.persen_bdd, b.kategori_sp, mb.jumlah AS berat_bersih
         FROM menu_bahan mb
         JOIN bahan_baku b ON b.id = mb.bahan_baku_id
         WHERE mb.menu_id=?`,
        [it.menu_id]
      );

      const bahanList = bahanRows.map(br => {
        const beratBersih = Number(br.berat_bersih || 0);
        const persenBdd = Number(br.persen_bdd || 100);
        const beratKotor = persenBdd > 0
          ? Math.round((beratBersih / (persenBdd / 100)) * 100) / 100
          : beratBersih;

        const perJenjang = {};
        for (const j of activeJenjang) {
          const jml = pmByDisplay[j] || 0;
          perJenjang[j] = {
            jumlah: jml,
            kebutuhan_kg: jml > 0
              ? Math.round((beratKotor * jml / 1000) * 100) / 100
              : 0,
          };
        }

        return {
          nama: br.nama,
          satuan: br.satuan,
          kategori_sp: br.kategori_sp,
          berat_bersih: beratBersih,
          persen_bdd: persenBdd,
          berat_kotor: beratKotor,
          per_jenjang: perJenjang,
        };
      });

      menus.push({
        menu_ke: menuCounter,
        hari_ke: it.hari_ke,
        hari_nama: it.hari_nama,
        menu_nama: it.menu_nama || 'Menu ' + menuCounter,
        bahan: bahanList,
      });
    }
  }

  res.json({
    menus,
    jenjang_list: activeJenjang,
    penerima_manfaat: pmByDisplay,
  });
});

/**
 * GET /siklus/recipe-names
 * Mengambil semua siklus dengan daftar nama menu/resep dari setiap item.
 * Digunakan oleh form Tambah Menu untuk mengambil nama menu dari siklus.
 */
router.get('/siklus/recipe-names', async (req, res) => {
  const [siklusList] = await db.query(
    'SELECT id, nama, kategori_penerima, total_hari, status FROM siklus_menu WHERE tenant_id=? ORDER BY id DESC',
    [req.user.tenant_id]
  );

  const result = [];
  for (const s of siklusList) {
    const [items] = await db.query(
      'SELECT hari_ke, hari_nama, menu_id, menu_nama, resep_map FROM siklus_menu_item WHERE siklus_id=? ORDER BY hari_ke ASC',
      [s.id]
    );

    const names = [];
    for (const it of items) {
      if (it.menu_nama && it.menu_nama.trim()) {
        names.push({ source: 'menu', hari_ke: it.hari_ke, hari_nama: it.hari_nama, nama: it.menu_nama.trim() });
      }
      if (it.resep_map) {
        try {
          const map = typeof it.resep_map === 'string' ? JSON.parse(it.resep_map) : it.resep_map;
          for (const [kat, nama] of Object.entries(map)) {
            if (nama && nama.trim()) {
              names.push({ source: 'resep', kategori_sp: kat, hari_ke: it.hari_ke, hari_nama: it.hari_nama, nama: nama.trim() });
            }
          }
        } catch (e) {}
      }
    }

    result.push({
      id: s.id,
      nama: s.nama,
      kategori_penerima: s.kategori_penerima,
      total_hari: s.total_hari,
      status: s.status,
      names,
    });
  }

  res.json(result);
});

/**
 * GET /siklus/:id
 * Mengambil data header siklus beserta detail item per hari.
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
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama siklus wajib diisi' });
  
  // Cek duplikat nama siklus dalam satu tenant
  const [existing] = await db.query('SELECT id FROM siklus_menu WHERE nama=? AND tenant_id=?', [nama.trim(), req.user.tenant_id]);
  if (existing.length) return res.status(409).json({ error: 'Siklus dengan nama "' + nama.trim() + '" sudah ada' });
  
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
        const fotoUrl = it.foto ? saveBase64Foto(it.foto) : null;
        await conn.query(
          `INSERT INTO siklus_menu_item (siklus_id, hari_ke, hari_nama, menu_id, menu_nama, jumlah_porsi, kalori, protein, karbohidrat, lemak, serat, foto)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [r.insertId, it.hari_ke, it.hari_nama, it.menu_id || null, it.menu_nama || null, it.jumlah_porsi || 0,
           it.kalori || 0, it.protein || 0, it.karbohidrat || 0, it.lemak || 0, it.serat || 0, fotoUrl]
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
  if (nama !== undefined && (!nama || !nama.trim())) return res.status(400).json({ error: 'Nama siklus wajib diisi' });
  
  // Cek duplikat nama saat update (kecuali dirinya sendiri)
  if (nama !== undefined) {
    const [existing] = await db.query('SELECT id FROM siklus_menu WHERE nama=? AND tenant_id=? AND id!=?', [nama.trim(), req.user.tenant_id, req.params.id]);
    if (existing.length) return res.status(409).json({ error: 'Siklus dengan nama "' + nama.trim() + '" sudah ada' });
  }
  
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
        const fotoUrl = it.foto ? saveBase64Foto(it.foto) : null;
        await conn.query(
          `INSERT INTO siklus_menu_item (siklus_id, hari_ke, hari_nama, menu_id, menu_nama, jumlah_porsi, kalori, protein, karbohidrat, lemak, serat, foto)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [req.params.id, it.hari_ke, it.hari_nama, it.menu_id || null, it.menu_nama || null, it.jumlah_porsi || 0,
           it.kalori || 0, it.protein || 0, it.karbohidrat || 0, it.lemak || 0, it.serat || 0, fotoUrl]
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
 * POST /siklus/bulk-delete
 * Menghapus banyak siklus sekaligus berdasarkan array ID.
 */
router.post('/siklus/bulk-delete', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'IDs wajib diisi' });
  const placeholders = ids.map(() => '?').join(',');
  await db.query(`DELETE FROM siklus_menu WHERE id IN (${placeholders}) AND tenant_id=?`, [...ids, req.user.tenant_id]);
  res.json({ ok: true, deleted: ids.length });
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

/**
 * GET /siklus/laporan/siklus-menu
 * Mengembalikan data siklus menu per hari yang dikelompokkan berdasarkan kategori_sp (kelompok bahan).
 * Untuk ditampilkan dalam laporan Siklus Menu 10 Hari dan Identifikasi Resep.
 * Dilengkapi data Penerima Manfaat per jenjang dan sinkronisasi dengan SP Referensi Bahan.
 */
router.get('/siklus/laporan/siklus-menu', async (req, res) => {
  const [siklusList] = await db.query(
    'SELECT id, nama, kategori_penerima, jumlah_porsi FROM siklus_menu WHERE tenant_id=? AND status="Aktif" ORDER BY id',
    [req.user.tenant_id]
  );

  // Ambil Penerima Manfaat per jenjang (kategori_penerima)
  const [pmByJenjang] = await db.query(
    `SELECT COALESCE(kategori_penerima, 'Lainnya') AS jenjang,
            COUNT(*) AS total_kelompok,
            COALESCE(SUM(paket_besar),0) AS total_paket_besar,
            COALESCE(SUM(paket_kecil),0) AS total_paket_kecil,
            COALESCE(SUM(paket_besar + paket_kecil),0) AS total_penerima
     FROM penerima_manfaat WHERE tenant_id=?
     GROUP BY kategori_penerima`,
    [req.user.tenant_id]
  );
  const pmMap = {};
  let grandTotalPenerima = 0;
  for (const p of pmByJenjang) {
    pmMap[p.jenjang] = {
      total_kelompok: Number(p.total_kelompok),
      total_paket_besar: Number(p.total_paket_besar),
      total_paket_kecil: Number(p.total_paket_kecil),
      total_penerima: Number(p.total_penerima),
    };
    grandTotalPenerima += Number(p.total_penerima);
  }

  // Urutan jenjang yang ditampilkan sebagai kolom
  const JENJANG_DISPLAY_ORDER = ['TK/PAUD', 'SD/MI (1-3)', 'SD/MI (4-6)', 'SMP/MTs, SMA/SMK', 'Bumil/Busui', 'Balita'];
  const JENJANG_DB_MAP = {
    'TK/PAUD': ['TK/PAUD', 'TK', 'PAUD'],
    'SD/MI (1-3)': ['SD 1-3', 'SD/MI (1-3)', 'SD'],
    'SD/MI (4-6)': ['SD 4-6', 'SD/MI (4-6)'],
    'SMP/MTs, SMA/SMK': ['SMP', 'SMA', 'SMP/MTs, SMA/SMK'],
    'Bumil/Busui': ['Ibu Hamil', 'Ibu Menyusui', 'Bumil/Busui'],
    'Balita': ['Balita'],
  };
  // Balik mapping: DB value -> display label
  const dbToDisplay = {};
  for (const [display, dbVals] of Object.entries(JENJANG_DB_MAP)) {
    for (const dv of dbVals) dbToDisplay[dv] = display;
  }
  // Map penerima_manfaat jenjang -> display label
  const pmByDisplay = {};
  for (const [dbJenjang, data] of Object.entries(pmMap)) {
    const display = dbToDisplay[dbJenjang] || dbJenjang;
    if (!pmByDisplay[display]) pmByDisplay[display] = { total_kelompok: 0, total_paket_besar: 0, total_paket_kecil: 0, total_penerima: 0 };
    pmByDisplay[display].total_kelompok += data.total_kelompok;
    pmByDisplay[display].total_paket_besar += data.total_paket_besar;
    pmByDisplay[display].total_paket_kecil += data.total_paket_kecil;
    pmByDisplay[display].total_penerima += data.total_penerima;
  }
  // Hanya tampilkan jenjang yang memiliki penerima
  const activeJenjang = JENJANG_DISPLAY_ORDER.filter(j => pmByDisplay[j] && pmByDisplay[j].total_penerima > 0);

  // Ambil semua data SP Referensi Bahan untuk sinkronisasi BDD & berat
  const [spRefList] = await db.query(
    'SELECT nama, bdd_persen, berat_bersih, berat_kotor FROM sp_referensi_bahan WHERE tenant_id=?',
    [req.user.tenant_id]
  );
  const spRefByName = {};
  for (const r of spRefList) {
    const key = r.nama.trim().toLowerCase();
    spRefByName[key] = {
      bdd_persen: Math.round(Number(r.bdd_persen || 0) * 100),
      berat_bersih: Number(r.berat_bersih || 0),
      berat_kotor: Number(r.berat_kotor || 0),
    };
  }

  // Kelompokkan siklus per jenjang
  const siklusByJenjang = {};
  for (const s of siklusList) {
    const j = s.kategori_penerima || 'Lainnya';
    if (!siklusByJenjang[j]) siklusByJenjang[j] = [];
    siklusByJenjang[j].push(s);
  }

  // Hitung kebutuhan per jenjang: { jenjang_display: { menu_id: { nama: ..., kebutuhan_kg: ... } } }
  const kebutuhanPerJenjang = {};
  const allIngredients = {}; // nama -> { berat_bersih, persen_bdd, berat_kotor, sumber_bdd, kategori_sp }

  for (const [dbJenjang, siklusArr] of Object.entries(siklusByJenjang)) {
    const displayJenjang = dbToDisplay[dbJenjang] || dbJenjang;
    const pmData = pmByDisplay[displayJenjang];
    const penerimaCount = pmData ? pmData.total_penerima : 0;
    if (penerimaCount < 1) continue;

    if (!kebutuhanPerJenjang[displayJenjang]) kebutuhanPerJenjang[displayJenjang] = {};

    for (const s of siklusArr) {
      const [items] = await db.query(
        `SELECT si.*, m.nama as menu_nama_lengkap, m.gramasi_total
         FROM siklus_menu_item si
         LEFT JOIN menu m ON m.id = si.menu_id
         WHERE si.siklus_id=? AND si.menu_id IS NOT NULL
         ORDER BY si.hari_ke ASC`,
        [s.id]
      );

      for (const it of items) {
        const [bahan] = await db.query(
          `SELECT b.nama, b.kategori_sp, b.persen_bdd, mb.jumlah as berat_bersih
           FROM menu_bahan mb
           JOIN bahan_baku b ON b.id = mb.bahan_baku_id
           WHERE mb.menu_id=?`,
          [it.menu_id]
        );

        for (const b of bahan) {
          const namaLower = b.nama.trim().toLowerCase();
          const spRef = spRefByName[namaLower];
          const persenBdd = spRef ? spRef.bdd_persen : Number(b.persen_bdd || 100);
          const beratBersih = Number(b.berat_bersih || 0);
          const beratKotor = persenBdd > 0 ? Math.round(beratBersih / (persenBdd / 100) * 100) / 100 : beratBersih;
          const kebutuhanKg = penerimaCount > 0 ? Math.round((beratKotor * penerimaCount / 1000) * 100) / 100 : 0;

          // Simpan info dasar bahan
          if (!allIngredients[b.nama]) {
            allIngredients[b.nama] = {
              nama: b.nama,
              kategori_sp: b.kategori_sp,
              berat_bersih: beratBersih,
              persen_bdd: persenBdd,
              berat_kotor: beratKotor,
              sumber_bdd: spRef ? 'sp_referensi' : 'bahan_baku',
            };
          }

          // Akumulasi kebutuhan per jenjang
          if (!kebutuhanPerJenjang[displayJenjang][b.nama]) {
            kebutuhanPerJenjang[displayJenjang][b.nama] = 0;
          }
          kebutuhanPerJenjang[displayJenjang][b.nama] += kebutuhanKg;
        }
      }
    }
  }

  // Gabung jadi array per bahan dengan kolom per jenjang
  const allBahanList = Object.keys(allIngredients).sort();
  const tableRows = allBahanList.map(nama => {
    const info = allIngredients[nama];
    const row = {
      nama,
      kategori_sp: info.kategori_sp,
      berat_bersih: info.berat_bersih,
      persen_bdd: info.persen_bdd,
      berat_kotor: info.berat_kotor,
      sumber_bdd: info.sumber_bdd,
      per_jenjang: {},
      total: 0,
    };
    for (const j of activeJenjang) {
      const val = kebutuhanPerJenjang[j]?.[nama] || 0;
      row.per_jenjang[j] = val;
      row.total += val;
    }
    row.total = Math.round(row.total * 100) / 100;
    return row;
  });

  // Total per jenjang
  const totalPerJenjang = {};
  for (const j of activeJenjang) {
    let total = 0;
    for (const r of tableRows) total += r.per_jenjang[j] || 0;
    totalPerJenjang[j] = Math.round(total * 100) / 100;
  }

  res.json({
    columns: activeJenjang,
    rows: tableRows,
    penerima_manfaat: pmByDisplay,
    total_per_jenjang: totalPerJenjang,
    grand_total: tableRows.reduce((s, r) => s + r.total, 0),
    sp_referensi: {
      terpakai: Object.keys(spRefByName).length,
      total_database: spRefList.length,
    },
  });
});

/**
 * GET /siklus/laporan/menu-harian
 * Mengembalikan data per siklus per hari dengan rincian bahan per kategori SP.
 * Untuk ditampilkan dalam laporan Siklus Menu 10 Hari dan Identifikasi Resep.
 */
router.get('/siklus/laporan/menu-harian', async (req, res) => {
  const [siklusList] = await db.query(
    'SELECT id, nama, kategori_penerima, jumlah_porsi FROM siklus_menu WHERE tenant_id=? AND status="Aktif" ORDER BY id',
    [req.user.tenant_id]
  );

  const KAT_DISPLAY = ['Karbohidrat', 'Protein Hewani', 'Protein Nabati', 'Sayur', 'Buah', 'Susu', 'Minyak'];

  const result = [];
  for (const s of siklusList) {
    const [items] = await db.query(
      `SELECT si.*, m.nama as menu_nama_lengkap
       FROM siklus_menu_item si
       LEFT JOIN menu m ON m.id = si.menu_id
       WHERE si.siklus_id=? ORDER BY si.hari_ke ASC`,
      [s.id]
    );

    const days = [];
    for (const it of items) {
      const day = {
        hari_ke: it.hari_ke,
        hari_nama: it.hari_nama,
        menu_id: it.menu_id,
        menu_nama: it.menu_nama || null,
        kategori: {},
      };
      for (const kat of KAT_DISPLAY) day.kategori[kat] = [];

      if (it.menu_id) {
        const [bahan] = await db.query(
          `SELECT b.nama, COALESCE(b.kategori_sp, 'Lainnya') as kategori_sp
           FROM menu_bahan mb
           JOIN bahan_baku b ON b.id = mb.bahan_baku_id
           WHERE mb.menu_id=?`,
          [it.menu_id]
        );
        for (const b of bahan) {
          if (day.kategori[b.kategori_sp]) {
            if (!day.kategori[b.kategori_sp].includes(b.nama)) {
              day.kategori[b.kategori_sp].push(b.nama);
            }
          }
        }
      }

      // Merge direct ingredient assignments from grid
      const [gridBahan] = await db.query(
        `SELECT b.nama, sb.kategori_sp
         FROM siklus_menu_item_bahan sb
         JOIN bahan_baku b ON b.id = sb.bahan_baku_id
         WHERE sb.siklus_id=? AND sb.hari_ke=?`,
        [s.id, it.hari_ke]
      );
      for (const b of gridBahan) {
        if (day.kategori[b.kategori_sp]) {
          if (!day.kategori[b.kategori_sp].includes(b.nama)) {
            day.kategori[b.kategori_sp].push(b.nama);
          }
        }
      }
      days.push(day);
    }

    result.push({
      id: s.id,
      nama: s.nama,
      kategori_penerima: s.kategori_penerima,
      jumlah_porsi: s.jumlah_porsi,
      days,
    });
  }

  res.json({ siklus: result, kategori_order: KAT_DISPLAY });
});

/**
 * GET /siklus/:id/bahan-grid
 * Mengembalikan data grid per hari: { hari_ke, hari_nama, menu_nama, bahan: { Karbohidrat: [{id, nama}], ... } }
 */
router.get('/siklus/:id/bahan-grid', async (req, res) => {
  const [items] = await db.query(
    `SELECT si.*, m.nama as menu_nama_lengkap
     FROM siklus_menu_item si
     LEFT JOIN menu m ON m.id = si.menu_id
     WHERE si.siklus_id=? ORDER BY si.hari_ke ASC`,
    [req.params.id]
  );

  const KAT_ORDER = ['Karbohidrat', 'Protein Hewani', 'Protein Nabati', 'Sayur', 'Buah', 'Susu'];

  const [gridRows] = await db.query(
    `SELECT sb.hari_ke, sb.kategori_sp, sb.bahan_baku_id, b.nama
     FROM siklus_menu_item_bahan sb
     JOIN bahan_baku b ON b.id = sb.bahan_baku_id
     WHERE sb.siklus_id=?
     ORDER BY sb.hari_ke, sb.kategori_sp`,
    [req.params.id]
  );

  const grid = {};
  for (const r of gridRows) {
    if (!grid[r.hari_ke]) grid[r.hari_ke] = {};
    if (!grid[r.hari_ke][r.kategori_sp]) grid[r.hari_ke][r.kategori_sp] = [];
    grid[r.hari_ke][r.kategori_sp].push({ id: r.bahan_baku_id, nama: r.nama });
  }

  const days = items.map(it => {
    const dayBahan = {};
    for (const kat of KAT_ORDER) {
      dayBahan[kat] = (grid[it.hari_ke] && grid[it.hari_ke][kat]) || [];
    }
    return {
      hari_ke: it.hari_ke,
      hari_nama: it.hari_nama,
      menu_nama: it.menu_nama || '',
      resep_map: it.resep_map ? JSON.parse(it.resep_map) : {},
      bahan: dayBahan,
    };
  });

  res.json({ days });
});

/**
 * POST /siklus/:id/bahan-grid
 * Menyimpan data grid: [{ hari_ke, kategori_sp, bahan_baku_id[], resep_nama? }]
 * serta resep_map per hari: { hari_ke, resep_map: {} }
 */
router.post('/siklus/:id/bahan-grid', async (req, res) => {
  const { grid, resepMap } = req.body; // resepMap: { hari_ke: { kategori_sp: nama_resep } }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    if (Array.isArray(grid)) {
      // Hapus semua data grid lama
      await conn.query('DELETE FROM siklus_menu_item_bahan WHERE siklus_id=?', [req.params.id]);

      // Insert data baru
      const stmt = 'INSERT INTO siklus_menu_item_bahan (siklus_id, hari_ke, kategori_sp, bahan_baku_id) VALUES ?';
      const values = [];
      for (const cell of grid) {
        if (!cell.bahan_baku_ids || !cell.bahan_baku_ids.length) continue;
        for (const bid of cell.bahan_baku_ids) {
          values.push([req.params.id, cell.hari_ke, cell.kategori_sp, bid]);
        }
      }
      if (values.length) {
        await conn.query(stmt, [values]);
      }
    }

    // Simpan resep_map per hari
    if (resepMap) {
      for (const [hariKe, map] of Object.entries(resepMap)) {
        await conn.query(
          'UPDATE siklus_menu_item SET resep_map=? WHERE siklus_id=? AND hari_ke=?',
          [JSON.stringify(map), req.params.id, Number(hariKe)]
        );
      }
    }

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(400).json({ error: 'Gagal menyimpan grid' });
  } finally {
    conn.release();
  }
});

/**
 * POST /siklus/:id/foto
 * Upload foto untuk item tertentu dalam siklus berdasarkan hari_ke.
 * Body: { hari_ke: number, foto: "data:image/...;base64,..." }
 */
router.post('/siklus/:id/foto', async (req, res) => {
  const { hari_ke, foto } = req.body;
  if (!hari_ke || !foto) return res.status(400).json({ error: 'Parameter hari_ke dan foto harus diisi' });
  const fotoUrl = saveBase64Foto(foto);
  if (!fotoUrl) return res.status(400).json({ error: 'Format foto tidak valid' });
  try {
    const [result] = await db.query(
      'UPDATE siklus_menu_item SET foto=? WHERE siklus_id=? AND hari_ke=?',
      [fotoUrl, req.params.id, hari_ke]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Item tidak ditemukan' });
    res.json({ ok: true, foto: fotoUrl });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Gagal menyimpan foto' });
  }
});

/**
 * DELETE /siklus/:id/foto/:hariKe
 * Menghapus foto dari item tertentu dalam siklus.
 */
router.delete('/siklus/:id/foto/:hariKe', async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE siklus_menu_item SET foto=NULL WHERE siklus_id=? AND hari_ke=?',
      [req.params.id, req.params.hariKe]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Item tidak ditemukan' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Gagal menghapus foto' });
  }
});

/**
 * GET /bahan/by-sp
 * Mengembalikan bahan_baku yang dikelompokkan berdasarkan kategori_sp
 */
router.get('/bahan/by-sp', async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, nama, COALESCE(kategori_sp, 'Lainnya') as kategori_sp
     FROM bahan_baku WHERE tenant_id=? AND kategori_sp IS NOT NULL AND kategori_sp != ''
     ORDER BY kategori_sp, nama`,
    [req.user.tenant_id]
  );
  const groups = {};
  for (const r of rows) {
    if (!groups[r.kategori_sp]) groups[r.kategori_sp] = [];
    groups[r.kategori_sp].push({ id: r.id, nama: r.nama });
  }
  res.json(groups);
});

/**
 * GET /siklus/laporan/kebutuhan-per-menu
 * Halaman khusus Ahli Gizi: Perhitungan BDD & Kebutuhan Bahan Pangan per Menu per Jenjang.
 * Format: setiap jenjang → daftar menu per hari → rincian bahan dengan BDD dan kebutuhan (kg).
 * Mendukung filter berdasarkan siklus_id (opsional).
 */
router.get('/siklus/laporan/kebutuhan-per-menu', async (req, res) => {
  const siklusId = req.query.siklus_id ? Number(req.query.siklus_id) : null;

  const [siklusList] = await db.query(
    'SELECT id, nama, kategori_penerima, jumlah_porsi, total_hari, status FROM siklus_menu WHERE tenant_id=? ORDER BY id DESC',
    [req.user.tenant_id]
  );

  const selectedSiklus = siklusId
    ? siklusList.filter(s => s.id === siklusId)
    : siklusList.filter(s => s.status === 'Aktif');

  // Ambil Penerima Manfaat per jenjang
  const [pmByJenjang] = await db.query(
    `SELECT COALESCE(kategori_penerima, 'Lainnya') AS jenjang,
            COUNT(*) AS total_kelompok,
            COALESCE(SUM(paket_besar),0) AS total_paket_besar,
            COALESCE(SUM(paket_kecil),0) AS total_paket_kecil,
            COALESCE(SUM(paket_besar + paket_kecil),0) AS total_penerima
     FROM penerima_manfaat WHERE tenant_id=?
     GROUP BY kategori_penerima`,
    [req.user.tenant_id]
  );

  const JENJANG_DISPLAY_ORDER = ['TK/PAUD', 'SD/MI (1-3)', 'SD/MI (4-6)', 'SMP/MTs, SMA/SMK', 'Bumil/Busui', 'Balita'];
  const JENJANG_DB_MAP = {
    'TK/PAUD': ['TK/PAUD', 'TK', 'PAUD'],
    'SD/MI (1-3)': ['SD 1-3', 'SD/MI (1-3)', 'SD'],
    'SD/MI (4-6)': ['SD 4-6', 'SD/MI (4-6)'],
    'SMP/MTs, SMA/SMK': ['SMP', 'SMA', 'SMP/MTs, SMA/SMK'],
    'Bumil/Busui': ['Ibu Hamil', 'Ibu Menyusui', 'Bumil/Busui'],
    'Balita': ['Balita'],
  };
  const dbToDisplay = {};
  for (const [display, dbVals] of Object.entries(JENJANG_DB_MAP)) {
    for (const dv of dbVals) dbToDisplay[dv] = display;
  }

  const pmMap = {};
  for (const p of pmByJenjang) {
    const display = dbToDisplay[p.jenjang] || p.jenjang;
    if (!pmMap[display]) pmMap[display] = { total_kelompok: 0, total_paket_besar: 0, total_paket_kecil: 0, total_penerima: 0 };
    pmMap[display].total_kelompok += Number(p.total_kelompok);
    pmMap[display].total_paket_besar += Number(p.total_paket_besar);
    pmMap[display].total_paket_kecil += Number(p.total_paket_kecil);
    pmMap[display].total_penerima += Number(p.total_penerima);
  }
  const activeJenjang = JENJANG_DISPLAY_ORDER.filter(j => pmMap[j] && pmMap[j].total_penerima > 0);

  // SP Referensi Bahan
  const [spRefList] = await db.query(
    'SELECT nama, bdd_persen, berat_bersih, berat_kotor FROM sp_referensi_bahan WHERE tenant_id=?',
    [req.user.tenant_id]
  );
  const spRefByName = {};
  for (const r of spRefList) {
    const key = r.nama.trim().toLowerCase();
    spRefByName[key] = {
      bdd_persen: Math.round(Number(r.bdd_persen || 0) * 100),
      berat_bersih: Number(r.berat_bersih || 0),
      berat_kotor: Number(r.berat_kotor || 0),
    };
  }

  // Standar SP per jenjang
  const [allStandarSp] = await db.query('SELECT jenjang, kategori_sp, sp_value FROM standar_sp');
  const spByJenjang = {};
  for (const r of allStandarSp) {
    if (!spByJenjang[r.jenjang]) spByJenjang[r.jenjang] = {};
    spByJenjang[r.jenjang][r.kategori_sp] = Number(r.sp_value);
  }

  // Build data per jenjang
  const data = [];

  for (const displayJenjang of activeJenjang) {
    const pmData = pmMap[displayJenjang];
    const penerimaCount = pmData ? pmData.total_penerima : 0;
    if (penerimaCount < 1) continue;

    // Cari siklus yang cocok dengan jenjang ini
    const jenjangDbVariants = Object.keys(JENJANG_DB_MAP).find(k => JENJANG_DB_MAP[k].includes(displayJenjang))
      ? JENJANG_DB_MAP[Object.keys(JENJANG_DB_MAP).find(k => JENJANG_DB_MAP[k].includes(displayJenjang))]
      : [displayJenjang];

    const matchingSiklus = selectedSiklus.filter(s =>
      s.kategori_penerima && jenjangDbVariants.includes(s.kategori_penerima)
    );
    if (!matchingSiklus.length) continue;

    const jenjangSp = spByJenjang[displayJenjang] || {};

    const jenjangData = {
      jenjang: displayJenjang,
      jumlah_siswa: penerimaCount,
      siklus: [],
    };

    let menuCounter = 0;

    for (const s of matchingSiklus) {
      const [items] = await db.query(
        `SELECT si.*, m.nama as menu_nama_lengkap
         FROM siklus_menu_item si
         LEFT JOIN menu m ON m.id = si.menu_id
         WHERE si.siklus_id=?
         ORDER BY si.hari_ke ASC`,
        [s.id]
      );

      const hariList = [];

      for (const it of items) {
        menuCounter++;
        if (!it.menu_id) {
          hariList.push({
            hari_ke: it.hari_ke,
            hari_nama: it.hari_nama,
            menu_label: 'MENU ' + menuCounter,
            menu_nama: it.menu_nama || '-',
            bahan: [],
          });
          continue;
        }

        const [bahanRows] = await db.query(
          `SELECT b.id, b.nama, b.kategori_sp, b.persen_bdd, b.berat_1_sp, mb.jumlah as berat_bersih
           FROM menu_bahan mb
           JOIN bahan_baku b ON b.id = mb.bahan_baku_id
           WHERE mb.menu_id=?`,
          [it.menu_id]
        );

        const bahanList = [];

        for (const b of bahanRows) {
          const namaLower = b.nama.trim().toLowerCase();
          const spRef = spRefByName[namaLower];
          const persenBdd = spRef ? spRef.bdd_persen : Number(b.persen_bdd || 100);
          const beratBersih = Number(b.berat_bersih || 0);
          const beratKotor = persenBdd > 0 ? Math.round(beratBersih / (persenBdd / 100) * 100) / 100 : beratBersih;
          const kebutuhanKg = penerimaCount > 0 ? Math.round((beratKotor * penerimaCount / 1000) * 100) / 100 : 0;
          const spValue = b.kategori_sp ? (jenjangSp[b.kategori_sp] || null) : null;

          let namaDisplay = b.nama;
          if (spValue !== null) {
            namaDisplay = b.nama + ' ' + String(spValue).replace('.', ',') + ' SP';
          }

          bahanList.push({
            nama_display: namaDisplay,
            nama: b.nama,
            kategori_sp: b.kategori_sp,
            sp_value: spValue,
            berat_1_sp: Number(b.berat_1_sp || 0),
            berat_bersih: beratBersih,
            persen_bdd: persenBdd,
            berat_kotor: beratKotor,
            sumber_bdd: spRef ? 'sp_referensi' : 'bahan_baku',
            kebutuhan_kg: kebutuhanKg,
          });
        }

        hariList.push({
          hari_ke: it.hari_ke,
          hari_nama: it.hari_nama,
          menu_label: 'MENU ' + menuCounter,
          menu_nama: it.menu_nama || it.menu_nama_lengkap || '-',
          bahan: bahanList,
        });
      }

      jenjangData.siklus.push({
        siklus_nama: s.nama,
        hari: hariList,
      });
    }

    data.push(jenjangData);
  }

  res.json({
    siklus_list: siklusList,
    selected_siklus_id: siklusId,
    jenjang_list: activeJenjang,
    data,
  });
});

/**
 * GET /siklus/laporan/perencanaan
 * Halaman Perencanaan — rekap kebutuhan bahan per hari lintas jenjang.
 * Format: per hari → tabel bahan dengan kolom per jenjang, total porsi, total kg, buffer, rincian.
 */
router.get('/siklus/laporan/perencanaan', async (req, res) => {
  const tanggalMulai = req.query.tanggal_mulai || new Date().toISOString().slice(0, 10);

  // 1. Siklus list
  const [siklusList] = await db.query(
    'SELECT id, nama, kategori_penerima, jumlah_porsi, total_hari, status FROM siklus_menu WHERE tenant_id=? ORDER BY id DESC',
    [req.user.tenant_id]
  );
  const activeSiklus = siklusList.filter(s => s.status === 'Aktif');

  // 2. Penerima Manfaat totals per jenjang
  const [pmByJenjang] = await db.query(
    `SELECT COALESCE(kategori_penerima, 'Lainnya') AS jenjang,
            COUNT(*) AS total_kelompok,
            COALESCE(SUM(paket_besar),0) AS total_paket_besar,
            COALESCE(SUM(paket_kecil),0) AS total_paket_kecil,
            COALESCE(SUM(paket_besar + paket_kecil),0) AS total_penerima
     FROM penerima_manfaat WHERE tenant_id=?
     GROUP BY kategori_penerima`,
    [req.user.tenant_id]
  );

  const JENJANG_DISPLAY_ORDER = ['TK/PAUD', 'SD/MI (1-3)', 'SD/MI (4-6)', 'SMP/MTs, SMA/SMK', 'Bumil/Busui', 'Balita'];
  const JENJANG_DB_MAP = {
    'TK/PAUD': ['TK/PAUD', 'TK', 'PAUD'],
    'SD/MI (1-3)': ['SD 1-3', 'SD/MI (1-3)', 'SD'],
    'SD/MI (4-6)': ['SD 4-6', 'SD/MI (4-6)'],
    'SMP/MTs, SMA/SMK': ['SMP', 'SMA', 'SMP/MTs, SMA/SMK'],
    'Bumil/Busui': ['Ibu Hamil', 'Ibu Menyusui', 'Bumil/Busui'],
    'Balita': ['Balita'],
  };
  const dbToDisplay = {};
  for (const [display, dbVals] of Object.entries(JENJANG_DB_MAP)) {
    for (const dv of dbVals) dbToDisplay[dv] = display;
  }

  const pmMap = {};
  for (const p of pmByJenjang) {
    const display = dbToDisplay[p.jenjang] || p.jenjang;
    if (!pmMap[display]) pmMap[display] = { total_kelompok: 0, total_paket_besar: 0, total_paket_kecil: 0, total_penerima: 0 };
    pmMap[display].total_kelompok += Number(p.total_kelompok);
    pmMap[display].total_paket_besar += Number(p.total_paket_besar);
    pmMap[display].total_paket_kecil += Number(p.total_paket_kecil);
    pmMap[display].total_penerima += Number(p.total_penerima);
  }
  const activeJenjang = JENJANG_DISPLAY_ORDER.filter(j => pmMap[j] && pmMap[j].total_penerima > 0);

  // 3. SP Referensi Bahan
  const [spRefList] = await db.query(
    'SELECT nama, bdd_persen, berat_bersih, berat_kotor FROM sp_referensi_bahan WHERE tenant_id=?',
    [req.user.tenant_id]
  );
  const spRefByName = {};
  for (const r of spRefList) {
    const key = r.nama.trim().toLowerCase();
    spRefByName[key] = {
      bdd_persen: Math.round(Number(r.bdd_persen || 0) * 100),
      berat_bersih: Number(r.berat_bersih || 0),
      berat_kotor: Number(r.berat_kotor || 0),
    };
  }

  // 4. Standar SP per jenjang
  const [allStandarSp] = await db.query('SELECT jenjang, kategori_sp, sp_value FROM standar_sp');
  const spByJenjang = {};
  for (const r of allStandarSp) {
    if (!spByJenjang[r.jenjang]) spByJenjang[r.jenjang] = {};
    spByJenjang[r.jenjang][r.kategori_sp] = Number(r.sp_value);
  }

  // 5. Build per-hari × per-jenjang × per-bahan data
  // Structure: { hari_ke: { "TK/PAUD": { bahan_nama: { kebutuhan_kg, ... } }, ... } }
  const hariMap = {};     // hari_ke → { jenjang_display → { bahan_nama → { kebutuhan_kg } } }
  const totalPorsiByHari = {}; // hari_ke → total porsi across jenjang
  const menuNamesByHari = {}; // hari_ke → [menu_nama, ...]

  for (const displayJenjang of activeJenjang) {
    const pmData = pmMap[displayJenjang];
    const penerimaCount = pmData ? pmData.total_penerima : 0;
    if (penerimaCount < 1) continue;

    const jenjangDbVariants = JENJANG_DB_MAP[displayJenjang] || [displayJenjang];
    const matchingSiklus = activeSiklus.filter(s =>
      s.kategori_penerima && jenjangDbVariants.includes(s.kategori_penerima)
    );
    if (!matchingSiklus.length) continue;

    const jenjangSp = spByJenjang[displayJenjang] || {};

    for (const s of matchingSiklus) {
      const [items] = await db.query(
        `SELECT si.*, m.nama as menu_nama_lengkap
         FROM siklus_menu_item si
         LEFT JOIN menu m ON m.id = si.menu_id
         WHERE si.siklus_id=? AND si.menu_id IS NOT NULL
         ORDER BY si.hari_ke ASC`,
        [s.id]
      );

      for (const it of items) {
        const hk = it.hari_ke;
        if (!hariMap[hk]) hariMap[hk] = {};
        if (!hariMap[hk][displayJenjang]) hariMap[hk][displayJenjang] = {};
        if (!totalPorsiByHari[hk]) totalPorsiByHari[hk] = 0;
        totalPorsiByHari[hk] += penerimaCount;
        if (!menuNamesByHari[hk]) menuNamesByHari[hk] = [];
        if (it.menu_nama_lengkap && !menuNamesByHari[hk].includes(it.menu_nama_lengkap)) {
          menuNamesByHari[hk].push(it.menu_nama_lengkap);
        }

        // Get menu bahan
        const [bahanRows] = await db.query(
          `SELECT b.id, b.nama, b.kategori_sp, b.persen_bdd, b.berat_1_sp, mb.jumlah as berat_bersih
           FROM menu_bahan mb
           JOIN bahan_baku b ON b.id = mb.bahan_baku_id
           WHERE mb.menu_id=?`,
          [it.menu_id]
        );

        for (const b of bahanRows) {
          const namaLower = b.nama.trim().toLowerCase();
          const spRef = spRefByName[namaLower];
          const persenBdd = spRef ? spRef.bdd_persen : Number(b.persen_bdd || 100);
          const beratBersih = Number(b.berat_bersih || 0);
          const beratKotor = persenBdd > 0 ? Math.round(beratBersih / (persenBdd / 100) * 100) / 100 : beratBersih;
          const kebutuhanKg = penerimaCount > 0 ? Math.round((beratKotor * penerimaCount / 1000) * 100) / 100 : 0;

          const spValue = b.kategori_sp ? (jenjangSp[b.kategori_sp] || null) : null;
          let namaDisplay = b.nama;
          if (spValue !== null) {
            namaDisplay = b.nama + ' ' + String(spValue).replace('.', ',') + ' SP';
          }

          if (!hariMap[hk][displayJenjang][namaDisplay]) {
            hariMap[hk][displayJenjang][namaDisplay] = {
              nama: b.nama,
              nama_display: namaDisplay,
              kategori_sp: b.kategori_sp,
              berat_kotor: beratKotor,
              kebutuhan_kg: 0,
            };
          }
          // Aggregate across multiple menu items on the same day (e.g., same ingredient in different menus)
          hariMap[hk][displayJenjang][namaDisplay].kebutuhan_kg += kebutuhanKg;
          // Add per-porsi berat_kotor (use the max if multiple entries for same ingredient)
          hariMap[hk][displayJenjang][namaDisplay].berat_kotor = Math.max(hariMap[hk][displayJenjang][namaDisplay].berat_kotor, beratKotor);
        }
      }
    }
  }

  // 6. Transform to final response
  const maxHari = Math.max(...Object.keys(hariMap).map(Number), 0);
  const hariResult = [];

  for (let hk = 1; hk <= maxHari; hk++) {
    if (!hariMap[hk]) continue;

    // Build set of all unique ingredient names across all jenjang for this day
    const allBahan = new Set();
    for (const j of activeJenjang) {
      if (hariMap[hk][j]) {
        for (const nama of Object.keys(hariMap[hk][j])) {
          allBahan.add(nama);
        }
      }
    }

    // Compute date
    const tgl = new Date(tanggalMulai);
    tgl.setDate(tgl.getDate() + (hk - 1));
    const tanggalStr = tgl.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    // Short date for display header
    const tglShort = tgl.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const dayName = tgl.toLocaleDateString('id-ID', { weekday: 'long' });
    const tglNum = tgl.getDate();
    const blnNama = tgl.toLocaleDateString('id-ID', { month: 'long' });
    const tahun = tgl.getFullYear();
    const headerTanggal = `${dayName}, ${tglNum} ${blnNama} ${tahun}`;

    const bahanList = [];
    let dayTotalPorsi = 0;

    for (const jenjang of activeJenjang) {
      if (hariMap[hk][jenjang]) {
        dayTotalPorsi += pmMap[jenjang] ? pmMap[jenjang].total_penerima : 0;
      }
    }

    for (const namaBahan of allBahan) {
      const firstJenjang = activeJenjang.find(j => hariMap[hk][j] && hariMap[hk][j][namaBahan]);
      const ref = firstJenjang ? hariMap[hk][firstJenjang][namaBahan] : null;
      if (!ref) continue;

      const perJenjang = {};
      let totalKg = 0;
      for (const j of activeJenjang) {
        const val = hariMap[hk][j] && hariMap[hk][j][namaBahan]
          ? hariMap[hk][j][namaBahan].kebutuhan_kg
          : 0;
        perJenjang[j] = val;
        totalKg += val;
      }

      const bufferKg = Math.round(totalKg * 1.1 * 100) / 100;

      // Rincian: if total porsi matches a "per pcs" ingredient, show pcs; else show kg
      const isPcs = ref.kategori_sp === 'Buah' || ref.kategori_sp === 'Susu';
      let rincian;
      if (isPcs) {
        rincian = Math.round(dayTotalPorsi) + 'pcs';
      } else {
        rincian = Math.round(totalKg) + 'kg';
      }

      bahanList.push({
        nama: ref.nama,
        nama_display: ref.nama_display,
        per_jenjang: perJenjang,
        total_kebutuhan_kg: Math.round(totalKg * 100) / 100,
        kebutuhan_buffer_kg: bufferKg,
        rincian: rincian,
      });
    }

    // Sort bahan by kategori_sp order: Karbohidrat, Protein Hewani, Protein Nabati, Sayur, Buah, Susu, Minyak
    const KATEGORI_ORDER = ['Karbohidrat', 'Protein Hewani', 'Protein Nabati', 'Sayur', 'Buah', 'Susu', 'Minyak'];
    bahanList.sort((a, b) => {
      const aRef = activeJenjang.find(j => hariMap[hk][j] && hariMap[hk][j][a.nama_display]);
      const bRef = activeJenjang.find(j => hariMap[hk][j] && hariMap[hk][j][b.nama_display]);
      const aKat = aRef ? hariMap[hk][aRef][a.nama_display].kategori_sp : '';
      const bKat = bRef ? hariMap[hk][bRef][b.nama_display].kategori_sp : '';
      return KATEGORI_ORDER.indexOf(aKat) - KATEGORI_ORDER.indexOf(bKat);
    });

    hariResult.push({
      hari_ke: hk,
      hari_nama: dayName,
      header_tanggal: headerTanggal,
      total_porsi: dayTotalPorsi,
      menu_names: menuNamesByHari[hk] || [],
      bahan: bahanList,
    });
  }

  res.json({
    jenjang_list: activeJenjang,
    hari: hariResult,
    pm_map: Object.fromEntries(activeJenjang.map(j => [j, pmMap[j] ? pmMap[j].total_penerima : 0])),
    tanggal_mulai: tanggalMulai,
  });
});

module.exports = router;