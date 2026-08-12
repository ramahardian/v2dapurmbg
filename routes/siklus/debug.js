const express = require('express');
const db = require('../../db');
const { batchLoadItems, batchLoadGridBahanBySiklus, escHtml, autoArchiveSiklus } = require('./helpers');

const router = express.Router();

/**
 * GET /siklus/recipe-names
 * Mengambil semua siklus dengan daftar nama menu/resep dari setiap item.
 */
router.get('/siklus/recipe-names', async (req, res) => {
  // Auto-arsip + sembunyikan siklus yang sudah lewat rentang waktu
  await autoArchiveSiklus();
  const [siklusList] = await db.query(
        'SELECT id, nama, kategori_penerima, total_hari, status, jumlah_porsi FROM siklus_menu WHERE tenant_id=? AND status != \'Arsip\' ORDER BY id DESC',
    [req.user.tenant_id]
  );

  const siklusIds = siklusList.map(s => s.id);
  const itemsBySiklus = await batchLoadItems(siklusIds);
  const gridBahanBySiklus = await batchLoadGridBahanBySiklus(siklusIds);

  const result = [];
  for (const s of siklusList) {
    const items = itemsBySiklus[s.id] || [];
    const bahanRows = gridBahanBySiklus[s.id] || [];
    const bahanMap = {};
    for (const br of bahanRows) {
      const key = br.hari_ke + '::' + br.kategori_sp;
      if (!bahanMap[key]) bahanMap[key] = [];
      bahanMap[key].push({ id: br.bahan_baku_id, nama: br.nama });
    }

    const bahanByDay = {};
    for (const br of bahanRows) {
      if (!bahanByDay[br.hari_ke]) bahanByDay[br.hari_ke] = [];
      if (!bahanByDay[br.hari_ke].some(function(b) { return b.id === br.bahan_baku_id; })) {
        bahanByDay[br.hari_ke].push({ id: br.bahan_baku_id, nama: br.nama, kategori_sp: br.kategori_sp });
      }
    }

    const resepCovered = new Set();
    const names = [];
    for (const it of items) {
      if (it.resep_map) {
        try {
          const map = typeof it.resep_map === 'string' ? JSON.parse(it.resep_map) : it.resep_map;
          for (const [kat, nama] of Object.entries(map)) {
            if (nama && nama.trim()) resepCovered.add(it.hari_ke + '::' + kat);
          }
        } catch (e) {}
      }

      if (it.menu_nama && it.menu_nama.trim()) {
        const dayBahan = bahanByDay[it.hari_ke] || [];
        names.push({ source: 'menu', hari_ke: it.hari_ke, hari_nama: it.hari_nama, nama: it.menu_nama.trim(), bahan: dayBahan });
      }

      if (it.resep_map) {
        try {
          const map = typeof it.resep_map === 'string' ? JSON.parse(it.resep_map) : it.resep_map;
          for (const [kat, nama] of Object.entries(map)) {
            if (nama && nama.trim()) {
              const bahan = bahanMap[it.hari_ke + '::' + kat] || [];
              names.push({ source: 'resep', kategori_sp: kat, hari_ke: it.hari_ke, hari_nama: it.hari_nama, nama: nama.trim(), bahan });
            }
          }
        } catch (e) {}
      }

      for (const [key, bahan] of Object.entries(bahanMap)) {
        const parts = key.split('::');
        const hk = Number(parts[0]);
        const kat = parts[1];
        if (hk === it.hari_ke && !resepCovered.has(key)) {
          names.push({ source: 'resep', kategori_sp: kat, hari_ke: it.hari_ke, hari_nama: it.hari_nama, nama: kat, bahan });
        }
      }
    }

    result.push({
      id: s.id, nama: s.nama, kategori_penerima: s.kategori_penerima,
      total_hari: s.total_hari, status: s.status, jumlah_porsi: s.jumlah_porsi, names,
    });
  }
  res.json(result);
});

/**
 * GET /siklus/cek-resep-map
 * Debug endpoint menampilkan data resep_map dalam format HTML.
 */
router.get('/siklus/cek-resep-map', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT si.id, si.siklus_id, sm.nama AS siklus_nama, si.hari_ke, si.hari_nama, si.menu_nama, si.resep_map
      FROM siklus_menu_item si
      JOIN siklus_menu sm ON sm.id = si.siklus_id
      WHERE si.resep_map IS NOT NULL AND si.resep_map != '' AND si.resep_map != '{}'
        AND sm.tenant_id=?
      ORDER BY sm.id DESC, si.hari_ke ASC
    `, [req.user.tenant_id]);

    const [stats] = await db.query(`
      SELECT COUNT(*) AS total_item,
        SUM(CASE WHEN resep_map IS NULL OR resep_map = '' OR resep_map = '{}' THEN 1 ELSE 0 END) AS kosong,
        SUM(CASE WHEN resep_map IS NOT NULL AND resep_map != '' AND resep_map != '{}' THEN 1 ELSE 0 END) AS terisi
      FROM siklus_menu_item
    `);

    const [gridItems] = await db.query(`
      SELECT DISTINCT si.siklus_id, sm.nama AS siklus_nama, si.hari_ke, si.hari_nama, si.menu_nama
      FROM siklus_menu_item si
      JOIN siklus_menu sm ON sm.id = si.siklus_id AND sm.tenant_id=?
      WHERE EXISTS (
        SELECT 1 FROM siklus_menu_item_bahan sb
        WHERE sb.siklus_id = si.siklus_id AND sb.hari_ke = si.hari_ke
      )
      AND (si.resep_map IS NULL OR si.resep_map = '' OR si.resep_map = '{}')
      ORDER BY sm.id DESC, si.hari_ke ASC
    `, [req.user.tenant_id]);

    let html = `<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>Cek Resep Map</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head><body class="bg-stone-50 p-6 font-sans">
      <div class="max-w-5xl mx-auto">
        <h1 class="text-2xl font-bold text-stone-800 mb-2">📋 Data resep_map</h1>
        <div class="flex gap-3 mb-6">
          <span class="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full">Total: ${stats[0].total_item} item</span>
          <span class="bg-emerald-100 text-emerald-800 text-sm px-3 py-1 rounded-full">Terisi: ${stats[0].terisi}</span>
          <span class="bg-stone-100 text-stone-600 text-sm px-3 py-1 rounded-full">Kosong: ${stats[0].kosong}</span>
        </div>`;

    if (gridItems.length) {
      html += `<div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <h3 class="font-semibold text-amber-800 mb-2">⚠️ Item dengan grid bahan TAPI tanpa resep_map (${gridItems.length})</h3>
        <ul class="space-y-1">`;
      for (const r of gridItems) {
        html += `<li class="text-sm text-amber-800">• ${escHtml(r.siklus_nama)} | H${r.hari_ke} (${r.hari_nama}) | Menu: ${escHtml(r.menu_nama || '-')}</li>`;
      }
      html += `</ul></div>`;
    }

    if (!rows.length) {
      html += `<div class="bg-stone-100 border border-stone-200 rounded-xl p-8 text-center text-stone-500">Tidak ada data resep_map yang terisi.</div>`;
    } else {
      for (const r of rows) {
        html += `<div class="bg-white border border-stone-200 rounded-xl overflow-hidden mb-4">
          <div class="px-4 py-3 bg-stone-50 border-b border-stone-200 flex items-center gap-3">
            <span class="font-semibold text-stone-700">${escHtml(r.siklus_nama)}</span>
            <span class="text-xs text-stone-400">Siklus #${r.siklus_id}</span>
            <span class="text-xs text-stone-400">H${r.hari_ke} (${r.hari_nama})</span>
            <span class="text-xs text-stone-500 ml-auto">Item ID: ${r.id}</span>
          </div>
          <div class="p-4">
            <div class="text-sm text-stone-500 mb-2">Menu: <span class="font-medium text-stone-700">${escHtml(r.menu_nama || '-')}</span></div>
            <div class="text-sm text-stone-500 mb-2">resep_map:</div>
            <pre class="bg-stone-100 p-3 rounded-lg text-xs overflow-x-auto mb-3">${escHtml(r.resep_map)}</pre>
            <div class="text-sm text-stone-500 mb-2">resep_map (PARSED):</div>`;
        try {
          const parsed = typeof r.resep_map === 'string' ? JSON.parse(r.resep_map) : r.resep_map;
          html += `<div class="space-y-1">`;
          for (const [kat, nama] of Object.entries(parsed)) {
            if (nama && nama.trim()) {
              html += `<div class="flex items-center gap-2 text-sm">
                <span class="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-medium w-28 text-center">${escHtml(kat)}</span>
                <span class="text-stone-700">→ ${escHtml(nama)}</span>
              </div>`;
            } else {
              html += `<div class="flex items-center gap-2 text-sm text-stone-400">
                <span class="bg-stone-100 text-stone-400 text-[10px] px-2 py-0.5 rounded-full font-medium w-28 text-center">${escHtml(kat)}</span>
                <span class="italic">(kosong)</span>
              </div>`;
            }
          }
          html += `</div>`;
        } catch (e) {
          html += `<div class="text-red-600 text-sm">⚠️ Gagal parse JSON: ${escHtml(e.message)}</div>`;
        }
        html += `</div></div>`;
      }
    }
    html += `</div></body></html>`;
    res.send(html);
  } catch (e) {
    res.status(500).send(`<div class="p-8 text-red-600">Error: ${escHtml(e.message)}</div>`);
  }
});

/**
 * GET /siklus/fix-telor-ayam-13kg
 * [SUPERSEDED] Gunakan /siklus/fix-target-belanja (generik) untuk kasus baru —
 * endpoint ini dipertahankan agar URL lama tetap berfungsi.
 *
 * Terapkan/putar-balik target kebutuhan Telor Ayam (bahan id 87) agar
 * /total-kebutuhan tampil sesuai target belanja (default 13 kg).
 *
 * Pola sama seperti fix_telor_ayam_target_13kg.sql: porsi per siswa
 * dihitung ulang dari target_kg, lalu disinkronkan di 3 tempat:
 *   1) menu_bahan.jumlah (resep menu 142 — diprioritaskan)
 *   2) bahan_baku.berat_1_sp (master — dipakai hari tanpa resep/grid)
 *   3) sp_referensi_bahan "Telor Ayam 1 SP" (bdd_persen = pecahan 0.9)
 *
 * Query params:
 *   ?target_kg=13   target belanja (kg) yang diinginkan (default 13)
 *   ?bdd=89         persen BDD bahan (default 89)
 *   ?revert=1       kembalikan nilai lama dari tabel backup_*
 *
 * Contoh:
 *   GET /api/siklus/fix-telor-ayam-13kg?target_kg=13
 *   GET /api/siklus/fix-telor-ayam-13kg?revert=1
 */
router.get('/siklus/fix-telor-ayam-13kg', async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const bahanId = 87; // Telor Ayam
    const menuId = 142; // resep Nasi Uduk + Rendang Telur
    const bddPersen = parseFloat(req.query.bdd) || 89;

    if (req.query.revert === '1' || req.query.revert === 'true') {
      const [[mbBackup]] = await db.query(
        `SELECT COUNT(*) AS n FROM information_schema.tables
         WHERE table_schema=DATABASE() AND table_name='backup_telor_ayam_target13'`
      );
      if (!Number(mbBackup.n)) {
        return res.status(400).json({ ok: false, error: 'Tabel backup belum ada. Jalankan endpoint tanpa ?revert=1 terlebih dahulu.' });
      }
      const [mb] = await db.query(
        `UPDATE menu_bahan mb JOIN backup_telor_ayam_target13 bk ON bk.menu_id=mb.menu_id AND bk.bahan_baku_id=mb.bahan_baku_id
         SET mb.jumlah = bk.jumlah WHERE mb.menu_id=? AND mb.bahan_baku_id=?`,
        [menuId, bahanId]
      );
      const [bb] = await db.query(
        `UPDATE bahan_baku SET berat_1_sp = (SELECT berat_1_sp FROM backup_bahan_baku_telor_13 WHERE id=?) WHERE id=? AND tenant_id=?`,
        [bahanId, bahanId, tenantId]
      );
      const [sp] = await db.query(
        `UPDATE sp_referensi_bahan sb JOIN backup_sp_ref_telor_13 bk ON bk.nama=sb.nama AND bk.tenant_id=sb.tenant_id
         SET sb.berat_bersih=bk.berat_bersih, sb.berat_kotor=bk.berat_kotor
         WHERE sb.tenant_id=? AND sb.nama='Telor Ayam 1 SP'`,
        [tenantId]
      );
      return res.json({ ok: true, action: 'revert', menu_bahan_changed: mb.changedRows, bahan_baku_changed: bb.changedRows, sp_ref_changed: sp.changedRows });
    }

    const targetKg = parseFloat(req.query.target_kg);
    if (!targetKg || isNaN(targetKg) || targetKg <= 0) {
      return res.status(400).json({ ok: false, error: 'target_kg wajib angka > 0 (contoh: ?target_kg=13)' });
    }

    const [[porsiRow]] = await db.query('SELECT jumlah_porsi FROM menu WHERE id=? AND tenant_id=?', [menuId, tenantId]);
    const porsi = Number(porsiRow && porsiRow.jumlah_porsi) || 0;
    if (!porsi) return res.status(400).json({ ok: false, error: 'Menu ' + menuId + ' tidak ditemukan untuk tenant ini.' });

    // bersih/porsi = (target_kg × 1000 g × bdd%) ÷ jumlah_porsi
    const bersih = Math.round(((targetKg * 1000 * (bddPersen / 100)) / porsi) * 10000) / 10000;
    const kotor = Math.round((bersih / (bddPersen / 100)) * 10000) / 10000;

    // Backup sekali (idempotent — TABEL DIBUAT ULANG agar selalu mencerminkan
    // nilai sebelum perubahan terakhir, tanpa menumpuk baris backup lama).
    await db.query('DROP TABLE IF EXISTS backup_telor_ayam_target13');
    await db.query(`CREATE TABLE backup_telor_ayam_target13 AS
      SELECT mb.*, m.tenant_id AS menu_tenant FROM menu_bahan mb
      JOIN menu m ON m.id=mb.menu_id WHERE mb.bahan_baku_id=?`, [bahanId]);
    await db.query('DROP TABLE IF EXISTS backup_bahan_baku_telor_13');
    await db.query(`CREATE TABLE backup_bahan_baku_telor_13 AS SELECT * FROM bahan_baku WHERE id=?`, [bahanId]);
    await db.query('DROP TABLE IF EXISTS backup_sp_ref_telor_13');
    await db.query(`CREATE TABLE backup_sp_ref_telor_13 AS
      SELECT * FROM sp_referensi_bahan WHERE tenant_id=? AND nama LIKE 'Telor Ayam%'`, [tenantId]);

    // 1) Resep menu
    await db.query('UPDATE menu_bahan SET jumlah=? WHERE menu_id=? AND bahan_baku_id=?', [bersih, menuId, bahanId]);
    // 2) Master bahan (dipakai hari tanpa resep / grid)
    await db.query('UPDATE bahan_baku SET berat_1_sp=? WHERE id=? AND tenant_id=?', [bersih, bahanId, tenantId]);
    // 3) Referensi SP 1 (bdd_persen tersimpan PECAHAN 0.9 → kotor = bersih ÷ bdd)
    await db.query(`UPDATE sp_referensi_bahan SET berat_bersih=?, berat_kotor=? WHERE tenant_id=? AND nama='Telor Ayam 1 SP'`, [bersih, bersih / 0.9, tenantId]);

    // Verifikasi perhitungan kebutuhan (kg)
    const kebutuhanKg = Math.round((bersih * porsi / (bddPersen / 100) / 1000) * 100) / 100;
    const qty = Math.ceil(kebutuhanKg - 0.01);
    const harga = 27000;
    res.json({
      ok: true,
      action: 'apply',
      target_kg: targetKg,
      bdd_persen: bddPersen,
      jumlah_porsi: porsi,
      berat_bersih_per_porsi: bersih,
      berat_kotor_per_porsi: kotor,
      perkiraan_kebutuhan_kg: kebutuhanKg,
      qty_belanja_kg: qty,
      jumlah_rupiah: qty * harga,
    });
  } catch (e) {
    console.error('fix-telor-ayam error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /siklus/fix-target-belanja
 * GENERIK: set target belanja harian (kg) untuk bahan baku MANA PUN.
 *
 * Pola sama seperti fix telor/ayam/semangka, tapi tanpa hardcode: bahan
 * ditemukan otomatis (by id atau nama), porsi diambil dari siklus Aktif
 * tenant (fallback: jumlah_porsi resep), lalu disinkronkan di 3 tempat:
 *   1) menu_bahan.jumlah  — SEMUA resep menu yang memakai bahan ini
 *                           (dibatasi ?menu_id= bila perlu)
 *   2) bahan_baku.berat_1_sp — master (dipakai hari grid tanpa resep)
 *   3) sp_referensi_bahan "<nama> 1 SP" / "<nama>" — referensi ikut sinkron
 *
 * Query params:
 *   ?bahan=<id|nama>   bahan baku (id atau nama, wajib)
 *   ?target_kg=13      target belanja per hari (kg) — ATAU:
 *   ?target_butir=2859 target belanja per hari dalam satuan unit (butir/pcs/dll.)
 *                      — otomatis dikonversi via bahan_baku.berat_per_satuan (g/satuan)
 *   ?bdd=89            persen BDD (default: bahan_baku.persen_bdd)
 *   ?menu_id=142       batasi perubahan hanya ke resep menu tertentu
 *   ?porsi=2859        override jumlah porsi (default: siklus aktif)
 *   ?force=1           terapkan ulang walau nilainya sudah sesuai
 *   ?revert=1          kembalikan nilai lama dari tabel backup_*
 *
 * Contoh:
 *   GET /api/siklus/fix-target-belanja?bahan=87&target_kg=13
 *   GET /api/siklus/fix-target-belanja?bahan=87&target_butir=2859
 *   GET /api/siklus/fix-target-belanja?bahan=Telor%20Ayam&target_kg=13
 *   GET /api/siklus/fix-target-belanja?bahan=87&revert=1
 */
router.get('/siklus/fix-target-belanja', async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const bahan = String(req.query.bahan || '').trim();
    if (!bahan) {
      return res.status(400).json({ ok: false, error: 'bahan wajib diisi (id atau nama). Contoh: ?bahan=87&target_kg=13' });
    }

    // ── 1) Temukan bahan (id atau nama, tenant-scoped) ──
    let bbRows;
    if (/^\d+$/.test(bahan)) {
      [bbRows] = await db.query(
        `SELECT id, nama, berat_1_sp, persen_bdd, buffer_persen, satuan, harga_satuan, berat_per_satuan
         FROM bahan_baku WHERE id=? AND tenant_id=?`,
        [Number(bahan), tenantId]
      );
    } else {
      [bbRows] = await db.query(
        `SELECT id, nama, berat_1_sp, persen_bdd, buffer_persen, satuan, harga_satuan, berat_per_satuan
         FROM bahan_baku
         WHERE tenant_id=? AND (nama=? OR nama LIKE CONCAT(?, ' %') OR nama LIKE CONCAT(?, ' 1 SP'))
         ORDER BY (nama=?) DESC, id LIMIT 1`,
        [tenantId, bahan, bahan, bahan, bahan]
      );
    }
    if (!bbRows.length) {
      return res.status(404).json({ ok: false, error: 'Bahan "' + bahan + '" tidak ditemukan untuk tenant ini.' });
    }
    const bb = bbRows[0];
    const bahanId = bb.id;
    const namaBahan = bb.nama;

    // ── 2) Resep menu yang memakai bahan ini (opsional filter ?menu_id=) ──
    const menuFilter = /^\d+$/.test(String(req.query.menu_id || '')) ? ' AND mb.menu_id=?' : '';
    const menuParams = menuFilter ? [bahanId, tenantId, Number(req.query.menu_id)] : [bahanId, tenantId];
    const [mbRows] = await db.query(
      `SELECT mb.menu_id, mb.jumlah, m.nama AS menu_nama, m.jumlah_porsi
       FROM menu_bahan mb JOIN menu m ON m.id=mb.menu_id
       WHERE mb.bahan_baku_id=? AND m.tenant_id=?${menuFilter}`,
      menuParams
    );

    // Nama tabel backup generik per bahan
    const bakMenu = 'backup_target_menu_' + bahanId;
    const bakBahan = 'backup_target_bahan_' + bahanId;
    const bakSp = 'backup_target_spref_' + bahanId;

    // ── 3) Revert ──
    if (req.query.revert === '1' || req.query.revert === 'true') {
      const [[chk]] = await db.query(
        `SELECT COUNT(*) AS n FROM information_schema.tables
         WHERE table_schema=DATABASE() AND table_name=?`, [bakMenu]
      );
      if (!Number(chk.n)) {
        return res.status(400).json({ ok: false, error: 'Backup belum ada. Jalankan endpoint tanpa ?revert=1 terlebih dahulu.' });
      }
      const [m] = await db.query(
        `UPDATE menu_bahan mb JOIN ${bakMenu} bk ON bk.menu_id=mb.menu_id AND bk.bahan_baku_id=mb.bahan_baku_id
         SET mb.jumlah=bk.jumlah WHERE mb.bahan_baku_id=?`, [bahanId]
      );
      const [b] = await db.query(
        `UPDATE bahan_baku SET berat_1_sp=(SELECT berat_1_sp FROM ${bakBahan} WHERE id=?)
         WHERE id=? AND tenant_id=?`, [bahanId, bahanId, tenantId]
      );
      const [s] = await db.query(
        `UPDATE sp_referensi_bahan sb JOIN ${bakSp} bk ON bk.nama=sb.nama AND bk.tenant_id=sb.tenant_id
         SET sb.berat_bersih=bk.berat_bersih, sb.berat_kotor=bk.berat_kotor, sb.bdd_persen=bk.bdd_persen
         WHERE sb.tenant_id=? AND (sb.nama=? OR sb.nama=?)`, [tenantId, namaBahan + ' 1 SP', namaBahan]
      );
      return res.json({ ok: true, action: 'revert', menu_bahan_changed: m.changedRows, bahan_baku_changed: b.changedRows, sp_ref_changed: s.changedRows });
    }

    // ── 4) Parameter target (kg ATAU butir — butir dikonversi via berat_per_satuan) ──
    const targetKg = parseFloat(req.query.target_kg);
    let targetButir = null;
    if (req.query.target_butir) {
      targetButir = parseFloat(req.query.target_butir);
      if (!targetButir || isNaN(targetButir) || targetButir <= 0) {
        return res.status(400).json({ ok: false, error: 'target_butir wajib angka > 0 (contoh: ?bahan=87&target_butir=2859)' });
      }
    }
    if ((!targetKg || isNaN(targetKg) || targetKg <= 0) && !targetButir) {
      return res.status(400).json({ ok: false, error: 'target_kg atau target_butir wajib diisi (contoh: ?bahan=87&target_kg=13 atau ?bahan=87&target_butir=2859)' });
    }
    const bps = Number(bb.berat_per_satuan) || 0;
    if (targetButir && bps <= 0) {
      return res.status(400).json({ ok: false, error: 'Bahan "' + namaBahan + '" belum punya berat_per_satuan (g/satuan) di master bahan — isi dulu agar target_butir bisa dihitung.' });
    }
    // Target dalam kg efektif (butir × berat/satuan), dipakai untuk semua perhitungan gram/porsi
    const effTargetKg = targetButir ? Math.round(targetButir * bps / 1000 * 100) / 100 : targetKg;
    const bddPersen = parseFloat(req.query.bdd) || Number(bb.persen_bdd) || 100;
    if (bddPersen <= 0 || bddPersen > 100) {
      return res.status(400).json({ ok: false, error: 'bdd harus 1-100 (persen).' });
    }

    // ── 5) Porsi yang dipakai /total-kebutuhan = siklus Aktif tenant ──
    let porsi = 0;
    const [sik] = await db.query(
      'SELECT jumlah_porsi FROM siklus_menu WHERE tenant_id=? AND status="Aktif" ORDER BY id LIMIT 1', [tenantId]
    );
    if (sik[0]) porsi = Number(sik[0].jumlah_porsi) || 0;
    if (!porsi) porsi = Math.max(0, ...mbRows.map(r => Number(r.jumlah_porsi) || 0));
    if (req.query.porsi) porsi = parseFloat(req.query.porsi) || porsi;
    if (!porsi) {
      return res.status(400).json({ ok: false, error: 'jumlah_porsi tidak ditemukan — isi jumlah_porsi di siklus aktif atau pakai ?porsi=2859.' });
    }

    // ── 6) Hitung gram/porsi agar belanja pas target ──
    // bersih/porsi = (target_kg × 1000 g × bdd%) ÷ jumlah_porsi
    const bersih = Math.round(((effTargetKg * 1000 * (bddPersen / 100)) / porsi) * 10000) / 10000;
    const kotor = Math.round((bersih / (bddPersen / 100)) * 10000) / 10000;
    // bdd sebagai pecahan (untuk kolom sp_referensi_bahan.bdd_persen, mis. 0.89)
    const bddFrac = Math.round((bddPersen / 100) * 10000) / 10000;

    // ── 7) Idempoten: sudah sesuai & tanpa ?force=1 → lapor tanpa mengubah ──
    // Catatan: bahan_baku.berat_1_sp tersimpan DECIMAL(15,2) (2 desimal), jadi
    // toleransinya 0.01 (bukan 0.001 seperti menu_bahan.jumlah yang 3 desimal).
    const sudahBahan = Math.abs(Number(bb.berat_1_sp || 0) - bersih) < 0.01;
    const sudahMenu = mbRows.length === 0 || mbRows.every(r => r.jumlah !== null && r.jumlah !== undefined && Math.abs(Number(r.jumlah) - bersih) < 0.001);
    const [spRefRows] = await db.query(
      `SELECT berat_bersih, bdd_persen FROM sp_referensi_bahan WHERE tenant_id=? AND (nama=? OR nama=?)`,
      [tenantId, namaBahan + ' 1 SP', namaBahan]
    );
    const sudahSpRef = spRefRows.length === 0 || spRefRows.every(r =>
      Math.abs(Number(r.berat_bersih || 0) - bersih) < 0.01 &&
      Math.abs(Number(r.bdd_persen || 0) - bddFrac) < 0.01
    );
    if (sudahBahan && sudahMenu && sudahSpRef && req.query.force !== '1') {
      return res.json({ ok: true, action: 'noop', message: 'Sudah sesuai target ' + effTargetKg + ' kg/hari.' });
    }

    // ── 8) Backup (hanya sekali — jangan menimpa backup asli) ──
    const bak = async (tbl, buildSql, getSql, getP, insSql, insP) => {
      await db.query(`CREATE TABLE IF NOT EXISTS ${tbl} ${buildSql}`);
      const [[hit]] = await db.query(getSql, getP);
      if (!hit) await db.query(insSql, insP);
    };
    await bak(bakMenu,
      'AS SELECT mb.*, m.tenant_id AS menu_tenant FROM menu_bahan mb JOIN menu m ON m.id=mb.menu_id WHERE 1=0',
      'SELECT id FROM ' + bakMenu + ' WHERE bahan_baku_id=? AND menu_tenant=? LIMIT 1', [bahanId, tenantId],
      'INSERT INTO ' + bakMenu + ' SELECT mb.*, m.tenant_id FROM menu_bahan mb JOIN menu m ON m.id=mb.menu_id WHERE mb.bahan_baku_id=? AND m.tenant_id=?', [bahanId, tenantId]);
    await bak(bakBahan,
      'AS SELECT * FROM bahan_baku WHERE 1=0',
      'SELECT id FROM ' + bakBahan + ' WHERE id=? LIMIT 1', [bahanId],
      'INSERT INTO ' + bakBahan + ' SELECT * FROM bahan_baku WHERE id=?', [bahanId]);
    await bak(bakSp,
      'AS SELECT * FROM sp_referensi_bahan WHERE 1=0',
      'SELECT id FROM ' + bakSp + ' WHERE tenant_id=? LIMIT 1', [tenantId],
      'INSERT INTO ' + bakSp + ' SELECT * FROM sp_referensi_bahan WHERE tenant_id=? AND (nama=? OR nama=?)', [tenantId, namaBahan + ' 1 SP', namaBahan]);

    // ── 9) Terapkan di 3 tempat ──
    if (mbRows.length) {
      const where = menuFilter ? ' AND menu_id=?' : '';
      const params = menuFilter ? [bersih, bahanId, tenantId, Number(req.query.menu_id)] : [bersih, bahanId, tenantId];
      await db.query(
        `UPDATE menu_bahan SET jumlah=? WHERE bahan_baku_id=? AND menu_id IN (SELECT id FROM menu WHERE tenant_id=?)${where}`,
        params
      );
    }
    await db.query('UPDATE bahan_baku SET berat_1_sp=? WHERE id=? AND tenant_id=?', [bersih, bahanId, tenantId]);
    // Referensi SP: berat_bersih + berat_kotor + bdd_persen (pecahan) ikut disamakan
    // agar konsisten dgn master bahan (mis. bdd 89% → bdd_persen 0,89).
    await db.query(
      `UPDATE sp_referensi_bahan SET berat_bersih=?, berat_kotor=?, bdd_persen=?
       WHERE tenant_id=? AND (nama=? OR nama=?)`,
      [bersih, kotor, bddFrac, tenantId, namaBahan + ' 1 SP', namaBahan]
    );

    // ── 10) Verifikasi ──
    const kebutuhanKg = Math.round((bersih * porsi / (bddPersen / 100) / 1000) * 100) / 100;
    const qty = Math.ceil(kebutuhanKg - 0.01);
    // Satuan unit (butir/pcs/ekor/dll.) → belanja dihitung per satuan (butir × harga/butir),
    // bukan per kg — supaya jumlah rupiah konsisten dengan QTY yang tampil di RAB.
    // Syaratnya satuan bahan memang unit (bukan kg yang kebetulan punya berat_per_satuan).
    const satuanBahan = String(bb.satuan || 'kg').toLowerCase();
    const isUnitSatuan = ['pcs','btl','botol','renceng','ctn','karton','kardus','dus','pack','ikat','ekor','butir','bungkus','porsi'].indexOf(satuanBahan) !== -1;
    const perkiraanButir = bps > 0 ? Math.ceil((kebutuhanKg * 1000 - 10) / bps) : null;
    const harga = Number(bb.harga_satuan) || 0;
    const qtyTampil = (isUnitSatuan && perkiraanButir != null) ? perkiraanButir : qty;
    const jumlahRupiah = Math.round(qtyTampil * harga);
    res.json({
      ok: true,
      action: 'apply',
      bahan_id: bahanId,
      bahan_nama: namaBahan,
      satuan: bb.satuan,
      berat_per_satuan: bps,
      target_kg: effTargetKg,
      target_butir: targetButir,
      bdd_persen: bddPersen,
      jumlah_porsi: porsi,
      berat_bersih_per_porsi: bersih,
      berat_kotor_per_porsi: kotor,
      perkiraan_kebutuhan_kg: kebutuhanKg,
      perkiraan_butir: perkiraanButir,
      qty_belanja_kg: qty,
      qty_belanja_butir: perkiraanButir,
      jumlah_rupiah: jumlahRupiah,
      menu_count: mbRows.length,
      menu_ids: mbRows.map(r => r.menu_id),
      catatan: 'Disinkronkan di menu_bahan.jumlah, bahan_baku.berat_1_sp & sp_referensi_bahan. Rollback: ?revert=1',
    });
  } catch (e) {
    console.error('fix-target-belanja error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
