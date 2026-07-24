const express = require('express');
const db = require('../../db');
const { KAT_ORDER, hitungEstimasiGiziManual, rebuildMenuNama } = require('./helpers');

const router = express.Router();

/**
 * GET /siklus/:id/bahan-grid
 * Fetch ingredient grid for a specific siklus.
 */
router.get('/siklus/:id/bahan-grid', async (req, res) => {
  const [rows] = await db.query(
    `SELECT sb.*, COALESCE(b.nama, '(bahan dihapus)') AS bahan_nama, b.satuan, b.kategori_sp, b.berat_1_sp, b.persen_bdd, b.kalori, b.protein, b.karbohidrat, b.lemak, b.serat
     FROM siklus_menu_item_bahan sb
     LEFT JOIN bahan_baku b ON b.id = sb.bahan_baku_id
     WHERE sb.siklus_id=?
     ORDER BY sb.hari_ke, sb.kategori_sp`,
    [req.params.id]
  );

  // Group by hari_ke then kategori_sp
  const byDay = {};
  for (const r of rows) {
    if (!byDay[r.hari_ke]) byDay[r.hari_ke] = {};
    if (!byDay[r.hari_ke][r.kategori_sp]) byDay[r.hari_ke][r.kategori_sp] = [];
    byDay[r.hari_ke][r.kategori_sp].push({
      id: r.bahan_baku_id,
      bahan_baku_id: r.bahan_baku_id,
      nama: r.bahan_nama,
      kategori_sp: r.kategori_sp,
      berat_1_sp: Number(r.berat_1_sp || 0),
      persen_bdd: Number(r.persen_bdd || 100),
      satuan: r.satuan,
      kalori: Number(r.kalori || 0),
      protein: Number(r.protein || 0),
      karbohidrat: Number(r.karbohidrat || 0),
      lemak: Number(r.lemak || 0),
      serat: Number(r.serat || 0),
    });
  }

  res.json({ byDay, kategori_order: KAT_ORDER });
});

/**
 * POST /siklus/:id/bahan-grid
 * Save ingredient grid and recipe maps.
 */
router.post('/siklus/:id/bahan-grid', async (req, res) => {
  const { grid, resepMap } = req.body;
  if (!grid || typeof grid !== 'object') return res.status(400).json({ error: 'Grid harus berupa object' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Hapus grid lama
    await conn.query('DELETE FROM siklus_menu_item_bahan WHERE siklus_id=?', [req.params.id]);

    // 2. Insert grid baru
    // grid format from frontend: [{ hari_ke, kategori_sp, bahan_baku_ids: [...] }, ...]
    if (Array.isArray(grid)) {
      for (const entry of grid) {
        if (!entry.bahan_baku_ids || !entry.bahan_baku_ids.length) continue;
        for (const bahanId of entry.bahan_baku_ids) {
          await conn.query(
            'INSERT INTO siklus_menu_item_bahan (siklus_id, hari_ke, kategori_sp, bahan_baku_id) VALUES (?,?,?,?)',
            [req.params.id, entry.hari_ke, entry.kategori_sp, bahanId]
          );
        }
      }
    } else {
      // legacy format: { "1": { "Karbohidrat": [{ bahan_baku_id, ... }], ... }, ... }
      for (const [hariKe, categories] of Object.entries(grid)) {
        for (const [kategoriSp, items] of Object.entries(categories)) {
          for (const item of items) {
            await conn.query(
              'INSERT INTO siklus_menu_item_bahan (siklus_id, hari_ke, kategori_sp, bahan_baku_id) VALUES (?,?,?,?)',
              [req.params.id, Number(hariKe), kategoriSp, item.bahan_baku_id]
            );
          }
        }
      }
    }

    // 3. Update resep_map per item
    if (resepMap && typeof resepMap === 'object') {
      for (const [hariKe, mapData] of Object.entries(resepMap)) {
        const mapStr = typeof mapData === 'string' ? mapData : JSON.stringify(mapData);
        await conn.query(
          'UPDATE siklus_menu_item SET resep_map=? WHERE siklus_id=? AND hari_ke=?',
          [mapStr, req.params.id, Number(hariKe)]
        );
      }
    }

    // 4. Recalculates gizi
    const [[siklus]] = await conn.query('SELECT jumlah_porsi FROM siklus_menu WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
    const [items] = await conn.query('SELECT * FROM siklus_menu_item WHERE siklus_id=? ORDER BY hari_ke ASC', [req.params.id]);
    const [bahanCounts] = await conn.query('SELECT hari_ke, COUNT(*) as bahan_count FROM siklus_menu_item_bahan WHERE siklus_id=? GROUP BY hari_ke', [req.params.id]);
    const bahanMap = {};
    for (const bc of bahanCounts) bahanMap[bc.hari_ke] = bc.bahan_count;

    for (const it of items) {
      it._has_bahan = (bahanMap[it.hari_ke] || 0) > 0;
    }

    // Recalculate nutrition
    const [gridBahan] = await conn.query(
      `SELECT sb.hari_ke, b.kalori, b.protein, b.karbohidrat, b.lemak, b.serat, b.berat_1_sp
       FROM siklus_menu_item_bahan sb
       JOIN bahan_baku b ON b.id = sb.bahan_baku_id
       WHERE sb.siklus_id=?`,
      [req.params.id]
    );
    hitungEstimasiGiziManual(items, gridBahan);

    // Update items with new nutrition values
    for (const it of items) {
      if (it._has_bahan && !it.menu_id) {
        await conn.query(
          'UPDATE siklus_menu_item SET kalori=?, protein=?, karbohidrat=?, lemak=?, serat=? WHERE id=?',
          [it.kalori || 0, it.protein || 0, it.karbohidrat || 0, it.lemak || 0, it.serat || 0, it.id]
        );
      }
    }

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(400).json({ error: 'Gagal menyimpan grid: ' + (e.message || '') });
  } finally {
    conn.release();
  }
});

/**
 * POST /siklus/tambah-bahan
 * Add a new ingredient to bahan_baku.
 */
router.post('/siklus/tambah-bahan', async (req, res) => {
  const { nama, kategori_sp, satuan } = req.body;
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama bahan wajib diisi' });

  const [existing] = await db.query('SELECT id FROM bahan_baku WHERE nama=? AND tenant_id=?', [nama.trim(), req.user.tenant_id]);
  if (existing.length) return res.json({ id: existing[0].id, existing: true });

  // Map kategori_sp to proper kategori
  const katLabel = kategori_sp || 'Lainnya';
  const [r] = await db.query(
    'INSERT INTO bahan_baku (tenant_id, nama, kategori, kategori_sp, satuan, berat_1_sp, persen_bdd) VALUES (?,?,?,?,?,?,?)',
    [req.user.tenant_id, nama.trim(), katLabel, katLabel, satuan || 'g', 50, 100]
  );
  res.json({ id: r.insertId, existing: false });
});

/**
 * GET /bahan/by-sp
 * Returns all ingredients grouped by kategori_sp.
 */
router.get('/bahan/by-sp', async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, nama, kategori, kategori_sp, satuan, berat_1_sp, persen_bdd,
            kalori, protein, karbohidrat, lemak, serat
     FROM bahan_baku WHERE tenant_id=? AND kategori_sp IS NOT NULL AND kategori_sp != ''
     ORDER BY kategori_sp, nama`,
    [req.user.tenant_id]
  );

  const byKat = {};
  for (const r of rows) {
    const kat = r.kategori_sp || 'Lainnya';
    if (!byKat[kat]) byKat[kat] = [];
    byKat[kat].push({
      id: r.id,
      nama: r.nama,
      satuan: r.satuan,
      berat_1_sp: Number(r.berat_1_sp || 0),
      persen_bdd: Number(r.persen_bdd || 100),
      kalori: Number(r.kalori || 0),
      protein: Number(r.protein || 0),
      karbohidrat: Number(r.karbohidrat || 0),
      lemak: Number(r.lemak || 0),
      serat: Number(r.serat || 0),
    });
  }

  res.json({ byKat, kategori_order: KAT_ORDER });
});

module.exports = router;
