const express = require('express');
const db = require('../../db');
const { batchLoadItems, batchLoadGridBahanBySiklus, escHtml } = require('./helpers');

const router = express.Router();

/**
 * GET /siklus/recipe-names
 * Mengambil semua siklus dengan daftar nama menu/resep dari setiap item.
 */
router.get('/siklus/recipe-names', async (req, res) => {
  const [siklusList] = await db.query(
        'SELECT id, nama, kategori_penerima, total_hari, status, jumlah_porsi FROM siklus_menu WHERE tenant_id=? ORDER BY id DESC',
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

module.exports = router;
