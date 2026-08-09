const express = require('express');
const db = require('../../db');
const { parseKategoriPenerima, expandJenjangToDbValues, autoHitungPorsi, computeTanggalSelesai, autoArchiveSiklus } = require('./helpers');

const router = express.Router();

// Siklus Aktif wajib punya tanggal_selesai ≥ hari ini; kalau tidak,
// autoArchiveSiklus akan langsung membaliknya ke Arsip secara diam-diam.
// Validasi ini mencegah flip-flop status tanpa peringatan.
async function validasiStatusAktif(status, tanggalSelesai) {
  if (status !== 'Aktif' || !tanggalSelesai) return null;
  // DATE_FORMAT wajib: mysql2 mengembalikan CURDATE() sebagai objek Date,
  // dan String(Date).slice(0,10) = "Sat Aug 08" (bukan YYYY-MM-DD) yang
  // membuat perbandingan tanggal selalu salah. DATE_FORMAT menjamin string YYYY-MM-DD.
  const [[{ today }]] = await db.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");
  if (String(tanggalSelesai).slice(0, 10) < String(today).slice(0, 10)) {
    return 'Siklus Aktif wajib memiliki tanggal selesai ≥ hari ini. Ubah rentang tanggal ke periode baru, atau gunakan tombol "Reaktivasi" untuk memakai ulang siklus arsip.';
  }
  return null;
}

// Parse kategori_penerima siklus (bisa string tunggal atau JSON array) → Set jenjang.
function parseJenjangSet(kp) {
  if (!kp) return new Set();
  try {
    const p = JSON.parse(kp);
    if (Array.isArray(p)) return new Set(p.map(String).filter(Boolean));
  } catch (e) { /* bukan JSON */ }
  return new Set([String(kp)]);
}

function jenjangTumpangTindih(setA, setB) {
  if (!setA.size || !setB.size) return false;
  for (const v of setA) if (setB.has(v)) return true;
  return false;
}

// Cek bentrok: ada siklus Aktif lain dengan jenjang yang sama di rentang tanggal
// yang tumpang tindih. Mengembalikan { nama, tanggal_mulai, tanggal_selesai, message } atau null.
// Tanggal dipakai DATE_FORMAT → string YYYY-MM-DD agar perbandingan konsisten.
async function cekBentrokSiklusAktif(tenantId, excludeId, kategoriPenerima, tanggalMulai, tanggalSelesai) {
  if (!kategoriPenerima || !tanggalMulai || !tanggalSelesai) return null;
  const [rows] = await db.query(
    `SELECT id, nama, kategori_penerima,
            DATE_FORMAT(tanggal_mulai, '%Y-%m-%d') AS tgl_mulai,
            DATE_FORMAT(tanggal_selesai, '%Y-%m-%d') AS tgl_selesai
     FROM siklus_menu
     WHERE tenant_id=? AND id!=? AND status='Aktif'
       AND tanggal_mulai IS NOT NULL AND tanggal_selesai IS NOT NULL`,
    [tenantId, excludeId]
  );
  const setBaru = parseJenjangSet(kategoriPenerima);
  const mulai = String(tanggalMulai).slice(0, 10);
  const selesai = String(tanggalSelesai).slice(0, 10);
  for (const r of rows) {
    const overlapTanggal = String(r.tgl_mulai).slice(0, 10) <= selesai && String(r.tgl_selesai).slice(0, 10) >= mulai;
    if (!overlapTanggal) continue;
    if (!jenjangTumpangTindih(setBaru, parseJenjangSet(r.kategori_penerima))) continue;
    return {
      nama: r.nama,
      tanggal_mulai: r.tgl_mulai,
      tanggal_selesai: r.tgl_selesai,
      message: 'Ada siklus aktif lain untuk jenjang yang sama pada rentang waktu tersebut: "' + r.nama + '" (' + r.tgl_mulai + ' s.d. ' + r.tgl_selesai + '). Arsipkan siklus itu terlebih dahulu atau pilih rentang waktu yang lain.',
    };
  }
  return null;
}

/**
 * GET /siklus
 * Mengambil semua data siklus menu milik tenant yang sedang login.
 */
router.get('/siklus', async (req, res) => {
  await autoArchiveSiklus();
  const [rows] = await db.query(
    'SELECT * FROM siklus_menu WHERE tenant_id=? ORDER BY id DESC',
    [req.user.tenant_id]
  );

  const siklusIds = rows.map(s => s.id);
  if (!siklusIds.length) return res.json([]);

  const ph = siklusIds.map(() => '?').join(',');
  const [itemCounts] = await db.query(
    `SELECT si.siklus_id,
            COUNT(*) as item_count,
            SUM(CASE WHEN si.menu_id IS NOT NULL THEN 1 ELSE 0 END) as with_menu,
            SUM(CASE WHEN si.menu_id IS NULL AND sb.bahan_count > 0 THEN 1 ELSE 0 END) as with_manual
     FROM siklus_menu_item si
     LEFT JOIN (SELECT siklus_id, hari_ke, COUNT(*) as bahan_count FROM siklus_menu_item_bahan WHERE siklus_id IN (${ph}) GROUP BY siklus_id, hari_ke) sb
       ON sb.siklus_id = si.siklus_id AND sb.hari_ke = si.hari_ke
     WHERE si.siklus_id IN (${ph})
     GROUP BY si.siklus_id`,
    [...siklusIds, ...siklusIds]
  );

  const countMap = {};
  for (const r of itemCounts) countMap[r.siklus_id] = r;

  const JENJANG_DB_MAP = require('./helpers').JENJANG_DB_MAP;
  const dbToDisplay = require('./helpers').buildDbToDisplay();
  const allJenjang = [...new Set(rows.flatMap(s => parseKategoriPenerima(s.kategori_penerima)).filter(Boolean))];
  const allDbVals = [...new Set(allJenjang.flatMap(j => JENJANG_DB_MAP[j] || Object.entries(JENJANG_DB_MAP).find(([,v]) => v.includes(j))?.[1] || [j]))];
  const pmTotalMap = {};
  if (allDbVals.length) {
    const ph2 = allDbVals.map(() => '?').join(',');
    const [pmRows] = await db.query(
      `SELECT kategori_penerima, COALESCE(SUM(paket_besar + paket_kecil),0) AS total
       FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima IN (${ph2})
       GROUP BY kategori_penerima`,
      [req.user.tenant_id, ...allDbVals]
    );
    for (const p of pmRows) pmTotalMap[dbToDisplay[p.kategori_penerima] || p.kategori_penerima] = Number(p.total);
  }

  for (const s of rows) {
    const c = countMap[s.id] || { item_count: 0, with_menu: 0, with_manual: 0 };
    s.item_count = c.item_count;
    s.menu_count = Number(c.with_menu);
    s.filled_count = Number(c.with_menu) + Number(c.with_manual);
    s.pm_porsi = parseKategoriPenerima(s.kategori_penerima).reduce((sum, k) => sum + (pmTotalMap[k] || 0), 0);
  }
  res.json(rows);
});

/**
 * GET /siklus/:id
 * Mengambil data header siklus beserta detail item per hari.
 */
router.get('/siklus/:id', async (req, res) => {
  await autoArchiveSiklus();
  const [[siklus]] = await db.query(
    'SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?',
    [req.params.id, req.user.tenant_id]
  );
  if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

  const [items] = await db.query(
    'SELECT * FROM siklus_menu_item WHERE siklus_id=? ORDER BY hari_ke ASC',
    [req.params.id]
  );

  const [bahanCounts] = await db.query(
    'SELECT hari_ke, COUNT(*) as bahan_count FROM siklus_menu_item_bahan WHERE siklus_id=? GROUP BY hari_ke',
    [req.params.id]
  );
  const bahanMap = {};
  for (const bc of bahanCounts) bahanMap[bc.hari_ke] = bc.bahan_count;

  let gridNamaByHari = {};
  {
    const [gridRows] = await db.query(
      `SELECT sb.hari_ke, sb.kategori_sp, COALESCE(b.nama, '(bahan dihapus)') AS nama
       FROM siklus_menu_item_bahan sb
       LEFT JOIN bahan_baku b ON b.id = sb.bahan_baku_id
       WHERE sb.siklus_id=?`,
      [req.params.id]
    );
    for (const g of gridRows) {
      if (!gridNamaByHari[g.hari_ke]) gridNamaByHari[g.hari_ke] = [];
      gridNamaByHari[g.hari_ke].push({ kategori_sp: g.kategori_sp, nama: g.nama });
    }
  }

  const KAT_ORDER = require('./helpers').KAT_ORDER;

  for (const it of items) {
    it._has_bahan = (bahanMap[it.hari_ke] || 0) > 0;
    if (it._has_bahan && !it.menu_id) {
      if (!it.jumlah_porsi || it.jumlah_porsi === 0) {
        it.jumlah_porsi = Number(siklus.jumlah_porsi) || 1;
      }
      const { rebuildMenuNama } = require('./helpers');
      rebuildMenuNama(it, gridNamaByHari);
    }
  }

  // Hitung estimasi gizi untuk item manual
  const hasManual = items.some(it => it._has_bahan && !it.menu_id);
  if (hasManual) {
    const [gridBahan] = await db.query(
      `SELECT sb.hari_ke, b.kalori, b.protein, b.karbohidrat, b.lemak, b.serat, b.berat_1_sp
       FROM siklus_menu_item_bahan sb
       JOIN bahan_baku b ON b.id = sb.bahan_baku_id
       WHERE sb.siklus_id=?`,
      [req.params.id]
    );
    const { hitungEstimasiGiziManual } = require('./helpers');
    hitungEstimasiGiziManual(items, gridBahan);
  }

  res.json({ ...siklus, items });
});

/**
 * POST /siklus
 * Membuat siklus menu baru beserta item-itemnya.
 */
router.post('/siklus', async (req, res) => {
  const { nama, kategori_penerima, jumlah_porsi, total_hari, status, catatan, tanggal_mulai, tanggal_selesai, items } = req.body;
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama siklus wajib diisi' });

  // Auto-hitung total_hari dari tanggal_mulai jika tidak disediakan
  let finalTotalHari = total_hari;
  if (!finalTotalHari && tanggal_mulai) {
    const d = new Date(tanggal_mulai);
    finalTotalHari = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }
  if (!finalTotalHari) finalTotalHari = 30;

  const [existing] = await db.query('SELECT id FROM siklus_menu WHERE nama=? AND tenant_id=?', [nama.trim(), req.user.tenant_id]);
  if (existing.length) return res.status(409).json({ error: 'Siklus dengan nama "' + nama.trim() + '" sudah ada' });

  const finalPorsi = await autoHitungPorsi(req.user.tenant_id, kategori_penerima, jumlah_porsi);
  const finalTanggalSelesai = computeTanggalSelesai(tanggal_mulai, tanggal_selesai, finalTotalHari);

  const errAktif = await validasiStatusAktif(status, finalTanggalSelesai);
  if (errAktif) return res.status(400).json({ error: errAktif });

  const bentrok = status === 'Aktif' ? await cekBentrokSiklusAktif(req.user.tenant_id, 0, kategori_penerima, tanggal_mulai, finalTanggalSelesai) : null;
  if (bentrok) return res.status(409).json({ error: bentrok.message, conflict: bentrok });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO siklus_menu (tenant_id, nama, kategori_penerima, jumlah_porsi, total_hari, status, catatan, tanggal_mulai, tanggal_selesai)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.user.tenant_id, nama, kategori_penerima || null, finalPorsi, finalTotalHari, status || 'Draft', catatan || null, tanggal_mulai || null, finalTanggalSelesai]
    );
    if (Array.isArray(items) && items.length) {
      for (const it of items) {
        await conn.query(
          `INSERT INTO siklus_menu_item (siklus_id, hari_ke, hari_nama, menu_id, menu_nama, jumlah_porsi, kalori, protein, karbohidrat, lemak, serat, foto)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [r.insertId, it.hari_ke, it.hari_nama, it.menu_id || null, it.menu_nama || null, it.jumlah_porsi || finalPorsi || 0,
           it.kalori || 0, it.protein || 0, it.karbohidrat || 0, it.lemak || 0, it.serat || 0, it.foto || null]
        );
      }
    }
    await conn.commit();
    res.json({ id: r.insertId, ...req.body, tenant_id: req.user.tenant_id });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(400).json({ error: 'Gagal menyimpan siklus' });
  } finally {
    conn.release();
  }
});

/**
 * PUT /siklus/:id
 * Memperbarui data siklus.
 */
router.put('/siklus/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'ID siklus tidak valid' });

  const { nama, kategori_penerima, jumlah_porsi, total_hari, status, catatan, tanggal_mulai, tanggal_selesai, items } = req.body;
  if (nama !== undefined && (!nama || !nama.trim())) return res.status(400).json({ error: 'Nama siklus wajib diisi' });

  if (nama !== undefined) {
    const [existing] = await db.query('SELECT id FROM siklus_menu WHERE nama=? AND tenant_id=? AND id!=?', [nama.trim(), req.user.tenant_id, id]);
    if (existing.length) return res.status(409).json({ error: 'Siklus dengan nama "' + nama.trim() + '" sudah ada' });
  }

  // Auto-hitung total_hari dari tanggal_mulai jika tidak disediakan
  let finalTotalHari = total_hari;
  if (!finalTotalHari && tanggal_mulai) {
    const d = new Date(tanggal_mulai);
    finalTotalHari = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }
  if (!finalTotalHari) finalTotalHari = 30;

  const finalPorsi = await autoHitungPorsi(req.user.tenant_id, kategori_penerima, jumlah_porsi);
  const finalTanggalSelesai = computeTanggalSelesai(tanggal_mulai, tanggal_selesai, finalTotalHari);

  const errAktif = await validasiStatusAktif(status, finalTanggalSelesai);
  if (errAktif) return res.status(400).json({ error: errAktif });

  const bentrok = status === 'Aktif' ? await cekBentrokSiklusAktif(req.user.tenant_id, id, kategori_penerima, tanggal_mulai, finalTanggalSelesai) : null;
  if (bentrok) return res.status(409).json({ error: bentrok.message, conflict: bentrok });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE siklus_menu SET nama=?, kategori_penerima=?, jumlah_porsi=?, total_hari=?, status=?, catatan=?, tanggal_mulai=?, tanggal_selesai=? WHERE id=? AND tenant_id=?`,
      [nama, kategori_penerima || null, finalPorsi, finalTotalHari, status || 'Draft', catatan || null, tanggal_mulai || null, finalTanggalSelesai, id, req.user.tenant_id]
    );
    await conn.query('DELETE FROM siklus_menu_item WHERE siklus_id=?', [id]);
    if (Array.isArray(items) && items.length) {
      for (const it of items) {
        await conn.query(
          `INSERT INTO siklus_menu_item (siklus_id, hari_ke, hari_nama, menu_id, menu_nama, jumlah_porsi, kalori, protein, karbohidrat, lemak, serat, foto)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, it.hari_ke, it.hari_nama, it.menu_id || null, it.menu_nama || null, it.jumlah_porsi || finalPorsi || 0,
           it.kalori || 0, it.protein || 0, it.karbohidrat || 0, it.lemak || 0, it.serat || 0, it.foto || null]
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
 * POST /siklus/:id/reactivate
 * Reaktivasi siklus arsip: pilih tanggal mulai baru, sistem menghitung tanggal
 * selesai otomatis (mulai + total_hari - 1), lalu status kembali Aktif.
 * Menghindari flip-flop diam-diam dari autoArchiveSiklus.
 */
router.post('/siklus/:id/reactivate', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'ID siklus tidak valid' });

  const tanggalMulai = String(req.body.tanggal_mulai || '').slice(0, 10);
  if (!tanggalMulai) return res.status(400).json({ error: 'Tanggal mulai baru wajib diisi' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalMulai)) {
    return res.status(400).json({ error: 'Format tanggal mulai tidak valid (harus YYYY-MM-DD)' });
  }

  try {
    const [[siklus]] = await db.query('SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?', [id, req.user.tenant_id]);
    if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

    const totalHari = Number(siklus.total_hari) || 7;
    const tanggalSelesai = computeTanggalSelesai(tanggalMulai, null, totalHari);
    if (!tanggalSelesai) return res.status(400).json({ error: 'Gagal menghitung tanggal selesai dari tanggal mulai "' + tanggalMulai + '"' });

    const errAktif = await validasiStatusAktif('Aktif', tanggalSelesai);
    if (errAktif) {
      return res.status(400).json({ error: 'Tanggal mulai "' + tanggalMulai + '" menghasilkan periode yang sudah lewat. Pilih tanggal mulai yang belum lewat.' });
    }

    const bentrok = await cekBentrokSiklusAktif(req.user.tenant_id, id, siklus.kategori_penerima, tanggalMulai, tanggalSelesai);
    if (bentrok) return res.status(409).json({ error: bentrok.message, conflict: bentrok });

    await db.query(
      "UPDATE siklus_menu SET status='Aktif', tanggal_mulai=?, tanggal_selesai=? WHERE id=? AND tenant_id=?",
      [tanggalMulai, tanggalSelesai, id, req.user.tenant_id]
    );
    res.json({
      ok: true,
      message: 'Siklus "' + siklus.nama + '" diaktifkan kembali (' + tanggalMulai + ' s.d. ' + tanggalSelesai + ')',
      tanggal_mulai: tanggalMulai,
      tanggal_selesai: tanggalSelesai,
    });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Gagal reaktivasi siklus: ' + (e.message || '') });
  }
});

/**
 * DELETE /siklus/:id
 */
router.delete('/siklus/:id', async (req, res) => {
  await db.query('DELETE FROM siklus_menu WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

/**
 * POST /siklus/bulk-delete
 */
router.post('/siklus/bulk-delete', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'IDs wajib diisi' });
  const placeholders = ids.map(() => '?').join(',');
  await db.query(`DELETE FROM siklus_menu WHERE id IN (${placeholders}) AND tenant_id=?`, [...ids, req.user.tenant_id]);
  res.json({ ok: true, deleted: ids.length });
});

/**
 * POST /siklus/:id/duplicate
 * Duplikasi siklus — bisa seluruh hari atau rentang tertentu (hari_mulai & hari_akhir).
 */
router.post('/siklus/:id/duplicate', async (req, res) => {
  const [[siklus]] = await db.query(
    'SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?',
    [req.params.id, req.user.tenant_id]
  );
  if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

  // Rentang hari
  const hariMulai = parseInt(req.body.hari_mulai) || 1;
  const hariAkhir = parseInt(req.body.hari_akhir) || siklus.total_hari;
  if (hariMulai < 1 || hariAkhir > siklus.total_hari || hariMulai > hariAkhir) {
    return res.status(400).json({ error: 'Rentang hari tidak valid (1-' + siklus.total_hari + ')' });
  }
  const rangeTotal = hariAkhir - hariMulai + 1;

  // Generate nama baru unik
  const rangeLabel = (hariMulai === 1 && hariAkhir === siklus.total_hari) ? '' : ' (Hari ' + hariMulai + '-' + hariAkhir + ')';
  let newNama = siklus.nama + rangeLabel + ' (Duplikat)';
  const [existing] = await db.query(
    'SELECT id FROM siklus_menu WHERE nama=? AND tenant_id=?',
    [newNama, req.user.tenant_id]
  );
  if (existing.length) {
    let counter = 2;
    while (true) {
      newNama = siklus.nama + rangeLabel + ' (Duplikat ' + counter + ')';
      const [cek] = await db.query(
        'SELECT id FROM siklus_menu WHERE nama=? AND tenant_id=?',
        [newNama, req.user.tenant_id]
      );
      if (!cek.length) break;
      counter++;
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Duplikasi header siklus (status selalu Draft, total_hari = range)
    const [r] = await conn.query(
      `INSERT INTO siklus_menu (tenant_id, nama, kategori_penerima, jumlah_porsi, total_hari, status, catatan, tanggal_mulai, tanggal_selesai)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.user.tenant_id, newNama, siklus.kategori_penerima, siklus.jumlah_porsi, rangeTotal, 'Draft', siklus.catatan, siklus.tanggal_mulai, computeTanggalSelesai(siklus.tanggal_mulai, siklus.tanggal_selesai, rangeTotal)]
    );
    const newId = r.insertId;

    // 2. Duplikasi item per hari (filter berdasarkan rentang)
    const [items] = await conn.query(
      'SELECT * FROM siklus_menu_item WHERE siklus_id=? AND hari_ke >= ? AND hari_ke <= ? ORDER BY hari_ke ASC',
      [req.params.id, hariMulai, hariAkhir]
    );
    for (const it of items) {
      await conn.query(
        `INSERT INTO siklus_menu_item (siklus_id, hari_ke, hari_nama, menu_id, menu_nama, jumlah_porsi, kalori, protein, karbohidrat, lemak, serat, resep_map, foto)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [newId, it.hari_ke, it.hari_nama, it.menu_id, it.menu_nama, it.jumlah_porsi,
         it.kalori || 0, it.protein || 0, it.karbohidrat || 0, it.lemak || 0, it.serat || 0, it.resep_map || null, it.foto || null]
      );
    }

    // 3. Duplikasi bahan grid (filter berdasarkan rentang)
    const [bahanGrid] = await conn.query(
      'SELECT * FROM siklus_menu_item_bahan WHERE siklus_id=? AND hari_ke >= ? AND hari_ke <= ?',
      [req.params.id, hariMulai, hariAkhir]
    );
    for (const bg of bahanGrid) {
      await conn.query(
        'INSERT INTO siklus_menu_item_bahan (siklus_id, hari_ke, kategori_sp, bahan_baku_id) VALUES (?,?,?,?)',
        [newId, bg.hari_ke, bg.kategori_sp, bg.bahan_baku_id]
      );
    }

    await conn.commit();
    res.json({ id: newId, nama: newNama, ok: true });
  } catch (e) {
    await conn.rollback();
    console.error('Duplikasi siklus error:', e);
    res.status(400).json({ error: 'Gagal menduplikasi siklus: ' + (e.message || '') });
  } finally {
    conn.release();
  }
});

module.exports = router;
