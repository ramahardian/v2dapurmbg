/**
 * routes/siklus/templates.js
 *
 * Template Menu Manual — menyimpan menu manual (bahan grid) secara terpisah
 * dari siklus, agar bisa dipakai ulang di siklus aktif maupun siklus mendatang.
 *
 * Endpoint:
 *   POST   /siklus/templates                — simpan template baru (payload grid)
 *   POST   /siklus/templates/dari-hari      — simpan satu hari siklus sebagai template
 *   GET    /siklus/templates                — daftar semua template tenant
 *   GET    /siklus/templates/:id            — detail template (bahan per kategori)
 *   DELETE /siklus/templates/:id            — hapus template
 *   POST   /siklus/:id/terapkan-template    — terapkan template ke satu hari siklus
 */

const express = require('express');
const db = require('../../db');
const { KAT_ORDER } = require('./helpers');

const router = express.Router();

const ROW_KEYS = ['Karbohidrat', 'Protein Hewani', 'Protein Nabati', 'Sayur', 'Buah', 'Susu'];

// ── Internal helpers ──────────────────────────────────────────────

// Ambil bahan grid per kategori untuk satu template (atau langsung dari db).
async function loadTemplateBahan(templateId) {
  const [rows] = await db.query(
    `SELECT stb.kategori_sp, stb.bahan_baku_id, COALESCE(b.nama, '(bahan dihapus)') AS nama,
            b.satuan, b.berat_1_sp, b.persen_bdd, b.kalori, b.protein, b.karbohidrat, b.lemak, b.serat
     FROM siklus_menu_template_bahan stb
     LEFT JOIN bahan_baku b ON b.id = stb.bahan_baku_id
     WHERE stb.template_id=?
     ORDER BY stb.kategori_sp`,
    [templateId]
  );
  return rows;
}

// Group rows (dari loadTemplateBahan) menjadi { kategori_sp: [ {id, nama, ...} ] }
function groupBahanByKategori(rows) {
  const byKat = {};
  for (const r of rows) {
    if (!byKat[r.kategori_sp]) byKat[r.kategori_sp] = [];
    byKat[r.kategori_sp].push({
      id: r.bahan_baku_id,
      bahan_baku_id: r.bahan_baku_id,
      nama: r.nama,
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
  return byKat;
}

// Hitung estimasi gizi untuk satu hari grid (daftar bahan baku id per kategori).
// Hanya bahan yang milik tenant yang ikut dihitung (cegah bocor nama/nutrisi lintas-tenant).
async function hitungGiziGrid(kategoriSpIds, tenantId) {
  // kategoriSpIds: [{ kategori_sp, bahan_baku_ids: [...] }, ...]
  const flat = [];
  for (const e of kategoriSpIds || []) {
    for (const id of (e.bahan_baku_ids || [])) {
      const n = Number(id);
      if (n && n > 0) flat.push(n);
    }
  }
  if (!flat.length) return { kalori: 0, protein: 0, karbohidrat: 0, lemak: 0, serat: 0 };

  const ph = flat.map(() => '?').join(',');
  const [bahanRows] = await db.query(
    `SELECT id, kalori, protein, karbohidrat, lemak, serat, berat_1_sp
     FROM bahan_baku WHERE id IN (${ph}) AND tenant_id=?`,
    [...flat, tenantId]
  );
  let kalori = 0, protein = 0, karbohidrat = 0, lemak = 0, serat = 0;
  for (const b of bahanRows) {
    const w = Number(b.berat_1_sp || 0);
    kalori += (Number(b.kalori || 0) / 100) * w;
    protein += (Number(b.protein || 0) / 100) * w;
    karbohidrat += (Number(b.karbohidrat || 0) / 100) * w;
    lemak += (Number(b.lemak || 0) / 100) * w;
    serat += (Number(b.serat || 0) / 100) * w;
  }
  return {
    kalori: Math.round(kalori * 100) / 100,
    protein: Math.round(protein * 100) / 100,
    karbohidrat: Math.round(karbohidrat * 100) / 100,
    lemak: Math.round(lemak * 100) / 100,
    serat: Math.round(serat * 100) / 100,
  };
}

// ── POST /siklus/templates — simpan template baru ─────────────────
router.post('/siklus/templates', async (req, res) => {
  const t = req.user.tenant_id;
  const nama = String((req.body && req.body.nama) || '').trim();
  if (!nama) return res.status(400).json({ error: 'Nama template wajib diisi' });

  // grid: [{ kategori_sp, bahan_baku_ids: [...] }, ...]
  const grid = Array.isArray(req.body && req.body.grid) ? req.body.grid : [];
  const resepMap = (req.body && req.body.resep_map) || null;
  const foto = (req.body && req.body.foto) || null;
  const jumlahPorsi = Number((req.body && req.body.jumlah_porsi) || 0);

  const [existing] = await db.query('SELECT id FROM siklus_menu_template WHERE nama=? AND tenant_id=?', [nama, t]);
  if (existing.length) {
    return res.status(409).json({ error: 'Template dengan nama "' + nama + '" sudah ada. Gunakan nama lain.' });
  }

  // Validasi: semua bahan wajib milik tenant ini (cegah insert id lintas-tenant
  // yang lolos FK karena bahan_baku adalah tabel global per-id).
  const allIds = [...new Set((grid || []).flatMap(e => (e.bahan_baku_ids || []).map(Number).filter(n => n > 0)))];
  if (allIds.length) {
    const ph = allIds.map(() => '?').join(',');
    const [[{ n }]] = await db.query(
      `SELECT COUNT(*) AS n FROM bahan_baku WHERE id IN (${ph}) AND tenant_id=?`,
      [...allIds, t]
    );
    if (Number(n) !== allIds.length) {
      return res.status(400).json({ error: 'Ada bahan yang tidak valid atau bukan milik dapur ini. Muat ulang halaman lalu coba lagi.' });
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const gizi = await hitungGiziGrid(grid, t);
    const [r] = await conn.query(
      `INSERT INTO siklus_menu_template (tenant_id, nama, jumlah_porsi, kalori, protein, karbohidrat, lemak, serat, foto, resep_map)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [t, nama, jumlahPorsi, gizi.kalori, gizi.protein, gizi.karbohidrat, gizi.lemak, gizi.serat, foto, resepMap ? JSON.stringify(resepMap) : null]
    );

    for (const entry of grid) {
      if (!entry || !entry.kategori_sp || !Array.isArray(entry.bahan_baku_ids)) continue;
      for (const bahanId of entry.bahan_baku_ids) {
        await conn.query(
          'INSERT INTO siklus_menu_template_bahan (template_id, kategori_sp, bahan_baku_id) VALUES (?,?,?)',
          [r.insertId, entry.kategori_sp, bahanId]
        );
      }
    }

    await conn.commit();
    res.json({ ok: true, id: r.insertId, nama, ...gizi });
  } catch (e) {
    await conn.rollback();
    console.error('Simpan template error:', e.message);
    res.status(400).json({ error: 'Gagal menyimpan template: ' + (e.message || '') });
  } finally {
    conn.release();
  }
});

// ── POST /siklus/templates/dari-hari — simpan 1 hari siklus ───────
router.post('/siklus/templates/dari-hari', async (req, res) => {
  const t = req.user.tenant_id;
  const siklusId = parseInt(req.body && req.body.siklus_id, 10);
  const hariKe = parseInt(req.body && req.body.hari_ke, 10);
  let nama = String((req.body && req.body.nama) || '').trim();

  if (!siklusId || !hariKe) return res.status(400).json({ error: 'siklus_id dan hari_ke wajib diisi' });

  const [[siklus]] = await db.query('SELECT id FROM siklus_menu WHERE id=? AND tenant_id=?', [siklusId, t]);
  if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

  const [items] = await db.query('SELECT * FROM siklus_menu_item WHERE siklus_id=? AND hari_ke=?', [siklusId, hariKe]);
  if (!items.length) return res.status(404).json({ error: 'Hari ke-' + hariKe + ' tidak ada di siklus ini' });
  const item = items[0];

  // Ambil grid bahan hari tsb
  const [gridRows] = await db.query(
    'SELECT kategori_sp, bahan_baku_id FROM siklus_menu_item_bahan WHERE siklus_id=? AND hari_ke=?',
    [siklusId, hariKe]
  );
  if (!gridRows.length) {
    return res.status(400).json({ error: 'Hari ke-' + hariKe + ' belum punya bahan grid — isi bahan terlebih dahulu' });
  }

  if (!nama) {
    // Fallback ke nama resep/identifikasi jika ada
    nama = String(item.menu_nama || '').trim() || ('Template Menu Hari ' + hariKe);
  }

  const [existing] = await db.query('SELECT id FROM siklus_menu_template WHERE nama=? AND tenant_id=?', [nama, t]);
  if (existing.length) {
    return res.status(409).json({ error: 'Template dengan nama "' + nama + '" sudah ada. Gunakan nama lain.', existing_template_id: existing[0].id });
  }

  // Susun grid untuk hitungGiziGrid
  const byKat = {};
  for (const g of gridRows) {
    if (!byKat[g.kategori_sp]) byKat[g.kategori_sp] = [];
    byKat[g.kategori_sp].push(g.bahan_baku_id);
  }
  const gridPayload = Object.entries(byKat).map(([kategori_sp, bahan_baku_ids]) => ({ kategori_sp, bahan_baku_ids }));

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const gizi = await hitungGiziGrid(gridPayload, t);
    const [r] = await conn.query(
      `INSERT INTO siklus_menu_template (tenant_id, nama, jumlah_porsi, kalori, protein, karbohidrat, lemak, serat, foto, resep_map)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [t, nama, item.jumlah_porsi || 0, gizi.kalori, gizi.protein, gizi.karbohidrat, gizi.lemak, gizi.serat, item.foto || null, item.resep_map || null]
    );
    for (const g of gridRows) {
      await conn.query(
        'INSERT INTO siklus_menu_template_bahan (template_id, kategori_sp, bahan_baku_id) VALUES (?,?,?)',
        [r.insertId, g.kategori_sp, g.bahan_baku_id]
      );
    }
    await conn.commit();
    res.json({ ok: true, id: r.insertId, nama, ...gizi });
  } catch (e) {
    await conn.rollback();
    console.error('Simpan template dari hari error:', e.message);
    res.status(400).json({ error: 'Gagal menyimpan template: ' + (e.message || '') });
  } finally {
    conn.release();
  }
});

// ── GET /siklus/templates — daftar semua template tenant ──────────
router.get('/siklus/templates', async (req, res) => {
  const t = req.user.tenant_id;
  const [templates] = await db.query(
    `SELECT st.*,
            (SELECT COUNT(*) FROM siklus_menu_template_bahan stb WHERE stb.template_id = st.id) AS bahan_count
     FROM siklus_menu_template st
     WHERE st.tenant_id=?
     ORDER BY st.id DESC`,
    [t]
  );
  res.json(templates);
});

// ── GET /siklus/templates/:id — detail template ───────────────────
router.get('/siklus/templates/:id', async (req, res) => {
  const t = req.user.tenant_id;
  const id = parseInt(req.params.id, 10);
  const [[template]] = await db.query(
    'SELECT * FROM siklus_menu_template WHERE id=? AND tenant_id=?',
    [id, t]
  );
  if (!template) return res.status(404).json({ error: 'Template tidak ditemukan' });

  const rows = await loadTemplateBahan(id);
  let resepMap = null;
  if (template.resep_map) {
    try { resepMap = typeof template.resep_map === 'string' ? JSON.parse(template.resep_map) : template.resep_map; }
    catch (e) { resepMap = null; }
  }

  res.json({
    ...template,
    bahan: groupBahanByKategori(rows),
    kategori_order: KAT_ORDER,
    resep_map: resepMap,
  });
});

// ── DELETE /siklus/templates/:id ──────────────────────────────────
router.delete('/siklus/templates/:id', async (req, res) => {
  const t = req.user.tenant_id;
  const id = parseInt(req.params.id, 10);
  const [r] = await db.query('DELETE FROM siklus_menu_template WHERE id=? AND tenant_id=?', [id, t]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Template tidak ditemukan' });
  res.json({ ok: true });
});

// ── POST /siklus/:id/terapkan-template — terapkan ke satu hari ────
router.post('/siklus/:id/terapkan-template', async (req, res) => {
  const t = req.user.tenant_id;
  const siklusId = parseInt(req.params.id, 10);
  const hariKe = parseInt(req.body && req.body.hari_ke, 10);
  const templateId = parseInt(req.body && req.body.template_id, 10);
  if (!siklusId || !hariKe || !templateId) {
    return res.status(400).json({ error: 'siklus_id, hari_ke, dan template_id wajib diisi' });
  }

  const [[siklus]] = await db.query('SELECT id, jumlah_porsi FROM siklus_menu WHERE id=? AND tenant_id=?', [siklusId, t]);
  if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

  const [[template]] = await db.query(
    'SELECT * FROM siklus_menu_template WHERE id=? AND tenant_id=?',
    [templateId, t]
  );
  if (!template) return res.status(404).json({ error: 'Template tidak ditemukan' });

  const [itemRows] = await db.query('SELECT id FROM siklus_menu_item WHERE siklus_id=? AND hari_ke=?', [siklusId, hariKe]);
  if (!itemRows.length) return res.status(404).json({ error: 'Hari ke-' + hariKe + ' tidak ada di siklus ini' });

  const bahanRows = await loadTemplateBahan(templateId);
  if (!bahanRows.length) return res.status(400).json({ error: 'Template ini tidak punya bahan' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Ganti grid hari tsb dengan bahan template
    await conn.query(
      'DELETE FROM siklus_menu_item_bahan WHERE siklus_id=? AND hari_ke=?',
      [siklusId, hariKe]
    );
    for (const b of bahanRows) {
      await conn.query(
        'INSERT INTO siklus_menu_item_bahan (siklus_id, hari_ke, kategori_sp, bahan_baku_id) VALUES (?,?,?,?)',
        [siklusId, hariKe, b.kategori_sp, b.bahan_baku_id]
      );
    }

    // 2. Update item: nama, gizi, foto (menu_id tetap NULL = manual)
    await conn.query(
      `UPDATE siklus_menu_item
       SET menu_id=NULL, menu_nama=?, jumlah_porsi=?, kalori=?, protein=?, karbohidrat=?, lemak=?, serat=?, foto=?, resep_map=?
       WHERE siklus_id=? AND hari_ke=?`,
      [template.nama, template.jumlah_porsi || siklus.jumlah_porsi || 0,
       template.kalori || 0, template.protein || 0, template.karbohidrat || 0, template.lemak || 0, template.serat || 0,
       template.foto || null, template.resep_map || null, siklusId, hariKe]
    );

    await conn.commit();
    res.json({ ok: true, message: 'Template "' + template.nama + '" diterapkan ke hari ke-' + hariKe });
  } catch (e) {
    await conn.rollback();
    console.error('Terapkan template error:', e.message);
    res.status(400).json({ error: 'Gagal menerapkan template: ' + (e.message || '') });
  } finally {
    conn.release();
  }
});

module.exports = router;
