const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { FIXED_KATEGORI, KATEGORI_MAP_DISPLAY, mapToDisplay, hitungBDD } = require('../services/spBddCalculator');

const router = express.Router();

router.use(requireAuth);
router.use((req, res, next) => {
  if (req.path.startsWith('/siklus') || req.path.startsWith('/bahan')) return requireRole('admin', 'ahli_gizi')(req, res, next);
  next();
});

// Helper: parse kategori_penerima (single string or JSON array) ke string[]
function parseKategoriPenerima(kp) {
  if (!kp) return [];
  try { const p = JSON.parse(kp); if (Array.isArray(p)) return p; } catch {}
  return [kp];
}

// ── Batch query helpers ──────────────────────────────────────────

async function batchLoadItems(siklusIds) {
  if (!siklusIds.length) return {};
  const ph = siklusIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT si.*, m.nama as menu_nama_lengkap
     FROM siklus_menu_item si
     LEFT JOIN menu m ON m.id = si.menu_id
     WHERE si.siklus_id IN (${ph})
     ORDER BY si.siklus_id, si.hari_ke ASC`,
    siklusIds
  );
  const map = {};
  for (const r of rows) {
    if (!map[r.siklus_id]) map[r.siklus_id] = [];
    map[r.siklus_id].push(r);
  }
  return map;
}

async function batchLoadBahanCounts(siklusIds) {
  if (!siklusIds.length) return {};
  const ph = siklusIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT siklus_id, hari_ke, COUNT(*) as bahan_count
     FROM siklus_menu_item_bahan
     WHERE siklus_id IN (${ph})
     GROUP BY siklus_id, hari_ke`,
    siklusIds
  );
  const map = {};
  for (const r of rows) {
    if (!map[r.siklus_id]) map[r.siklus_id] = {};
    map[r.siklus_id][r.hari_ke] = r.bahan_count;
  }
  return map;
}

async function batchLoadGridBahanBySiklus(siklusIds) {
  if (!siklusIds.length) return {};
  const ph = siklusIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT sb.siklus_id, sb.hari_ke, sb.kategori_sp, sb.bahan_baku_id,
            COALESCE(b.nama, '(bahan dihapus)') AS nama, b.kalori, b.protein,
            b.karbohidrat, b.lemak, b.serat, b.berat_1_sp, b.persen_bdd,
            b.satuan, b.buffer_persen
     FROM siklus_menu_item_bahan sb
     LEFT JOIN bahan_baku b ON b.id = sb.bahan_baku_id
     WHERE sb.siklus_id IN (${ph})`,
    siklusIds
  );
  const bySiklus = {};
  for (const r of rows) {
    if (!bySiklus[r.siklus_id]) bySiklus[r.siklus_id] = [];
    bySiklus[r.siklus_id].push(r);
  }
  return bySiklus;
}

async function batchLoadMenuBahan(menuIds) {
  if (!menuIds.length) return {};
  const ph = menuIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT mb.menu_id, mb.jumlah, mb.bahan_baku_id, mb.keterangan,
            b.nama, b.satuan, b.kategori_sp, b.persen_bdd, b.berat_1_sp,
            b.kalori, b.protein, b.karbohidrat, b.lemak, b.serat, b.berat_per_satuan, b.kode, b.harga_satuan,
            b.buffer_persen,
            m.kategori_penerima
     FROM menu_bahan mb
     JOIN bahan_baku b ON b.id = mb.bahan_baku_id
     JOIN menu m ON m.id = mb.menu_id
     WHERE mb.menu_id IN (${ph})`,
    menuIds
  );
  const map = {};
  for (const r of rows) {
    if (!map[r.menu_id]) map[r.menu_id] = [];
    map[r.menu_id].push(r);
  }
  return map;
}

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

  const siklusIds = rows.map(s => s.id);
  if (!siklusIds.length) return res.json([]);

  // Ambil count items yang terisi (menu_id OR ada grid bahan di hari yg sama)
  // Kirim count saja, bukan items — items detail di-fetch via /siklus/:id
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

  // Batch-load PM totals for all distinct jenjang
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
  const allJenjang = [...new Set(rows.flatMap(s => parseKategoriPenerima(s.kategori_penerima)).filter(Boolean))];
  // Expand display labels to DB variants
  const allDbVals = [...new Set(allJenjang.flatMap(j => JENJANG_DB_MAP[j] || [j]))];
  const pmTotalMap = {};
  if (allDbVals.length) {
    const ph = allDbVals.map(() => '?').join(',');
    const [pmRows] = await db.query(
      `SELECT kategori_penerima, COALESCE(SUM(paket_besar + paket_kecil),0) AS total
       FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima IN (${ph})
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
 * GET /siklus/laporan
 * Mengambil semua siklus dengan laporan agregat (coverage, rata-rata gizi, dll).
 */
router.get('/siklus/laporan', async (req, res) => {
  const [siklusList] = await db.query(
    'SELECT * FROM siklus_menu WHERE tenant_id=? ORDER BY id DESC',
    [req.user.tenant_id]
  );

  const siklusIds = siklusList.map(s => s.id);
  const itemsBySiklus = await batchLoadItems(siklusIds);
  const bahanCountsBySiklus = await batchLoadBahanCounts(siklusIds);
  const gridBahanBySiklus = await batchLoadGridBahanBySiklus(siklusIds);

  const result = [];
  let totalSiklus = 0, totalFilled = 0, totalDays = 0, totalUniqueMenus = 0;
  const allMenuSet = new Set();

  for (const s of siklusList) {
    const items = itemsBySiklus[s.id] || [];
    const bahanMap = bahanCountsBySiklus[s.id] || {};

    const totalHari = s.total_hari || items.length || 7;
    const filledDays = items.filter(it => it.menu_id || (bahanMap[it.hari_ke] || 0) > 0).length;
    const coverage = totalHari ? Math.round((filledDays / totalHari) * 100) : 0;
    const uniqueMenus = new Set(items.filter(it => it.menu_id).map(it => it.menu_id));

    // Hitung estimasi gizi untuk item manual (via grid picker tanpa menu_id)
    const hasManual = items.some(it => !it.menu_id && (bahanMap[it.hari_ke] || 0) > 0);
    if (hasManual) {
      const gridBahan = gridBahanBySiklus[s.id] || [];
      const gridByHari = {};
      for (const g of gridBahan) {
        if (!gridByHari[g.hari_ke]) gridByHari[g.hari_ke] = [];
        gridByHari[g.hari_ke].push(g);
      }
      const porsi = Number(s.jumlah_porsi || 1);
      for (const it of items) {
        if (!it.menu_id && (bahanMap[it.hari_ke] || 0) > 0) {
          const dayBahan = gridByHari[it.hari_ke] || [];
          let estKalori = 0, estProtein = 0, estKarbohidrat = 0, estLemak = 0, estSerat = 0;
          for (const b of dayBahan) {
            const estWeight = Number(b.berat_1_sp || 0) * porsi;
            estKalori  += (Number(b.kalori || 0) / 100) * estWeight;
            estProtein += (Number(b.protein || 0) / 100) * estWeight;
            estKarbohidrat += (Number(b.karbohidrat || 0) / 100) * estWeight;
            estLemak   += (Number(b.lemak || 0) / 100) * estWeight;
            estSerat   += (Number(b.serat || 0) / 100) * estWeight;
          }
          it.kalori = Math.round(estKalori * 100) / 100;
          it.protein = Math.round(estProtein * 100) / 100;
          it.karbohidrat = Math.round(estKarbohidrat * 100) / 100;
          it.lemak = Math.round(estLemak * 100) / 100;
          it.serat = Math.round(estSerat * 100) / 100;
        }
      }
    }

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

  const siklusIds = siklusList.map(s => s.id);
  const itemsBySiklus = await batchLoadItems(siklusIds);

  const dayRows = [];
  const dayMap = {};

  for (const s of siklusList) {
    const items = (itemsBySiklus[s.id] || []).filter(it => it.menu_id);

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

  // Collect all unique menu_ids and batch-load their bahan
  const allMenuIds = [...new Set(Object.values(dayMap).flatMap(d => d.menu_ids))];
  const menuBahanMap = await batchLoadMenuBahan(allMenuIds);

  for (const day of Object.values(dayMap)) {
    if (!day.menu_ids.length) continue;
    for (const menuId of day.menu_ids) {
      const bahanRows = menuBahanMap[menuId] || [];
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
          bahan_nama: br.nama,
          satuan: br.satuan,
          jumlah: beratKotor,
          jumlah_porsi: day.jumlah_porsi,
          gramasi_total: beratKotor,
        });
      }
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

  const siklusIds = siklusList.map(s => s.id);
  const itemsBySiklus = await batchLoadItems(siklusIds);
  const allMenuIds = [...new Set(Object.values(itemsBySiklus).flatMap(arr => arr.filter(it => it.menu_id).map(it => it.menu_id)))];
  const menuBahanMap = await batchLoadMenuBahan(allMenuIds);

  const menus = [];
  let menuCounter = 0;

  for (const s of siklusList) {
    const items = (itemsBySiklus[s.id] || []).filter(it => it.menu_id);

    for (const it of items) {
      menuCounter++;
      const bahanRows = menuBahanMap[it.menu_id] || [];

      const bahanList = bahanRows.map(br => {
        const beratBersih = Number(br.jumlah || 0);
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
      bahanMap[key].push({ id: br.bahan_baku_id, nama: br.bahan_nama });
    }

    // Buat map per hari untuk aggregasi bahan dari grid picker (dengan kategori_sp)
    const bahanByDay = {};
    for (const br of bahanRows) {
      if (!bahanByDay[br.hari_ke]) bahanByDay[br.hari_ke] = [];
      if (!bahanByDay[br.hari_ke].some(function(b) { return b.id === br.bahan_baku_id; })) {
        bahanByDay[br.hari_ke].push({ id: br.bahan_baku_id, nama: br.bahan_nama, kategori_sp: br.kategori_sp });
      }
    }

    // Track which (hari_ke, kategori_sp) are already covered by resep_map entries
    const resepCovered = new Set();

    const names = [];
    for (const it of items) {
      // Track resep_map coverage so grid-based resep doesn't duplicate
      // HANYA kategori dengan nama non-kosong yang dianggap covered
      if (it.resep_map) {
        try {
          const map = typeof it.resep_map === 'string' ? JSON.parse(it.resep_map) : it.resep_map;
          for (const [kat, nama] of Object.entries(map)) {
            if (nama && nama.trim()) {
              resepCovered.add(it.hari_ke + '::' + kat);
            }
          }
        } catch (e) {}
      }

      // 1. Menu items (from menu_nama) — import seluruh bahan hari itu
      if (it.menu_nama && it.menu_nama.trim()) {
        const dayBahan = bahanByDay[it.hari_ke] || [];
        names.push({ source: 'menu', hari_ke: it.hari_ke, hari_nama: it.hari_nama, nama: it.menu_nama.trim(), bahan: dayBahan });
      }

      // 2. Resep items (from resep_map) — per kategori dengan nama yang diisi user
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

      // 3. Grid-based resep items — untuk kategori yang TIDAK ada di resep_map
      //    Tapi hanya jika item tidak punya menu_nama (jika ada menu_nama, berarti user pilih "Ambil dari Menu")
      //    Atau selalu generate jika ada bahan grid yang belum tercakup resep_map
      for (const [key, bahan] of Object.entries(bahanMap)) {
        const parts = key.split('::');
        const hk = Number(parts[0]);
        const kat = parts[1];
        if (hk === it.hari_ke && !resepCovered.has(key)) {
          names.push({
            source: 'resep',
            kategori_sp: kat,
            hari_ke: it.hari_ke,
            hari_nama: it.hari_nama,
            nama: kat, // Gunakan nama kategori sebagai nama resep
            bahan: bahan,
          });
        }
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
 * GET /siklus/cek-resep-map
 * Menampilkan data resep_map dari siklus_menu_item dalam format HTML.
 * Bisa diakses dari browser untuk debugging.
 */
router.get('/siklus/cek-resep-map', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        si.id,
        si.siklus_id,
        sm.nama AS siklus_nama,
        si.hari_ke,
        si.hari_nama,
        si.menu_nama,
        si.resep_map
      FROM siklus_menu_item si
      JOIN siklus_menu sm ON sm.id = si.siklus_id
      WHERE si.resep_map IS NOT NULL AND si.resep_map != '' AND si.resep_map != '{}'
        AND sm.tenant_id=?
      ORDER BY sm.id DESC, si.hari_ke ASC
    `, [req.user.tenant_id]);

    // Stats
    const [stats] = await db.query(`
      SELECT 
        COUNT(*) AS total_item,
        SUM(CASE WHEN resep_map IS NULL OR resep_map = '' OR resep_map = '{}' THEN 1 ELSE 0 END) AS kosong,
        SUM(CASE WHEN resep_map IS NOT NULL AND resep_map != '' AND resep_map != '{}' THEN 1 ELSE 0 END) AS terisi
      FROM siklus_menu_item
    `);

    // Items with grid bahan but no resep_map
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
        <p class="text-sm text-amber-700 mb-2">Item ini seharusnya dapat grid-based resep dari fix terbaru</p>
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
            <div class="text-sm text-stone-500 mb-2">resep_map (TEXT):</div>
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
                <span class="text-[10px] text-stone-400">(akan tampil sebagai green "Resep" item)</span>
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

    html += `
      <div class="text-center py-4 text-xs text-stone-400">
        <a href="/menu" class="text-blue-600 hover:underline">← Kembali ke Menu</a>
      </div>
    </div></body></html>`;

    res.send(html);
  } catch (e) {
    res.status(500).send(`<div class="p-8 text-red-600">Error: ${escHtml(e.message)}</div>`);
  }
});

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

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
  
  // Check which items have bahan (ingredients) assigned via grid picker
  const [bahanCounts] = await db.query(
    'SELECT hari_ke, COUNT(*) as bahan_count FROM siklus_menu_item_bahan WHERE siklus_id=? GROUP BY hari_ke',
    [req.params.id]
  );
  const bahanMap = {};
  for (const bc of bahanCounts) {
    bahanMap[bc.hari_ke] = bc.bahan_count;
  }
  
  // Also load grid bahan names for building combined names
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

  const KAT_ORDER = ['Karbohidrat','Protein Hewani','Protein Nabati','Sayur','Buah','Susu','Minyak'];

  // Helper: build combined name from grid bahan
  function buildGridNama(hariKe) {
    const dayBahan = gridNamaByHari[hariKe] || [];
    if (!dayBahan.length) return null;
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
    return parts.length ? parts.join(' + ') : null;
  }

  // Mark items that have ingredients even without menu_id
  for (const it of items) {
    it._has_bahan = (bahanMap[it.hari_ke] || 0) > 0;
    // Fix up existing manual items: set porsi from siklus header and rebuild menu name
    if (it._has_bahan && !it.menu_id) {
      if (!it.jumlah_porsi || it.jumlah_porsi === 0) {
        it.jumlah_porsi = Number(siklus.jumlah_porsi) || 1;
      }
      // Always rebuild menu_nama from resep_map or grid, ignoring any DB placeholder
      it.menu_nama = null;
      // Priority 1: resep_map (explicit recipe names like "Nasi Kebuli")
      if (it.resep_map) {
        try {
          const map = typeof it.resep_map === 'string' ? JSON.parse(it.resep_map) : it.resep_map;
          const names = Object.values(map).filter(v => v && v.trim());
          if (names.length) it.menu_nama = names.join(' + ');
        } catch (e) { /* ignore */ }
      }
      // Priority 2: grid bahan names
      if (!it.menu_nama || !it.menu_nama.trim()) {
        const gridNama = buildGridNama(it.hari_ke);
        if (gridNama) it.menu_nama = gridNama;
      }
      // Final fallback
      if (!it.menu_nama || !it.menu_nama.trim()) {
        it.menu_nama = 'Menu Hari ' + it.hari_ke;
      }
    }
  }
  
  // Hitung estimasi gizi untuk item manual (via grid picker tanpa menu_id)
  const hasManual = items.some(it => it._has_bahan && !it.menu_id);
  if (hasManual) {
    const [gridBahan] = await db.query(
      `SELECT sb.hari_ke, b.kalori, b.protein, b.karbohidrat, b.lemak, b.serat, b.berat_1_sp
       FROM siklus_menu_item_bahan sb
       JOIN bahan_baku b ON b.id = sb.bahan_baku_id
       WHERE sb.siklus_id=?`,
      [req.params.id]
    );
    const gridByHari = {};
    for (const g of gridBahan) {
      if (!gridByHari[g.hari_ke]) gridByHari[g.hari_ke] = [];
      gridByHari[g.hari_ke].push(g);
    }
    for (const it of items) {
      if (it._has_bahan && !it.menu_id) {
        const dayBahan = gridByHari[it.hari_ke] || [];
        let estKalori = 0, estProtein = 0, estKarbohidrat = 0, estLemak = 0, estSerat = 0;
        for (const b of dayBahan) {
          const estWeight = Number(b.berat_1_sp || 0);
          estKalori  += (Number(b.kalori || 0) / 100) * estWeight;
          estProtein += (Number(b.protein || 0) / 100) * estWeight;
          estKarbohidrat += (Number(b.karbohidrat || 0) / 100) * estWeight;
          estLemak   += (Number(b.lemak || 0) / 100) * estWeight;
          estSerat   += (Number(b.serat || 0) / 100) * estWeight;
        }
        it.kalori = Math.round(estKalori * 100) / 100;
        it.protein = Math.round(estProtein * 100) / 100;
        it.karbohidrat = Math.round(estKarbohidrat * 100) / 100;
        it.lemak = Math.round(estLemak * 100) / 100;
        it.serat = Math.round(estSerat * 100) / 100;
      }
    }
  }

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
  const { nama, kategori_penerima, jumlah_porsi, total_hari, status, catatan, tanggal_mulai, items } = req.body;
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama siklus wajib diisi' });
  
  // Cek duplikat nama siklus dalam satu tenant
  const [existing] = await db.query('SELECT id FROM siklus_menu WHERE nama=? AND tenant_id=?', [nama.trim(), req.user.tenant_id]);
  if (existing.length) return res.status(409).json({ error: 'Siklus dengan nama "' + nama.trim() + '" sudah ada' });
  
  // Auto-hitung jumlah_porsi dari PM berdasarkan jenjang
  const JENJANG_DB_MAP = {
    'TK/PAUD': ['TK/PAUD', 'TK', 'PAUD'],
    'SD/MI (1-3)': ['SD 1-3', 'SD/MI (1-3)', 'SD'],
    'SD/MI (4-6)': ['SD 4-6', 'SD/MI (4-6)'],
    'SMP/MTs, SMA/SMK': ['SMP', 'SMA', 'SMP/MTs, SMA/SMK'],
    'Bumil/Busui': ['Ibu Hamil', 'Ibu Menyusui', 'Bumil/Busui'],
    'Balita': ['Balita'],
  };
  const jenjangList = parseKategoriPenerima(kategori_penerima);
  const allDbVals = [...new Set(jenjangList.flatMap(j => JENJANG_DB_MAP[j] || [j]))];
  const porsiFromPm = allDbVals.length ? await (async () => {
    const ph = allDbVals.map(() => '?').join(',');
    const [[{total}]] = await db.query(
      `SELECT COALESCE(SUM(paket_besar + paket_kecil),0) AS total FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima IN (${ph})`,
      [req.user.tenant_id, ...allDbVals]
    );
    return Number(total) || 0;
  })() : 0;
  const finalPorsi = (jumlah_porsi || 0) || porsiFromPm;
  
  const conn = await db.getConnection(); // Pinjam koneksi dari pool untuk transaksi
  
  try {
    await conn.beginTransaction(); // Mulai transaksi
    
    // 1. Insert data utama/header siklus menu
    const [r] = await conn.query(
      `INSERT INTO siklus_menu (tenant_id, nama, kategori_penerima, jumlah_porsi, total_hari, status, catatan, tanggal_mulai)
       VALUES (?,?,?,?,?,?,?,?)`,
      [req.user.tenant_id, nama, kategori_penerima || null, finalPorsi, total_hari || 7, status || 'Draft', catatan || null, tanggal_mulai || null]
    );
    
    // 2. Insert detail menu per hari (jika array items tersedia)
    if (Array.isArray(items) && items.length) {
      for (const it of items) {
        await conn.query(
          `INSERT INTO siklus_menu_item (siklus_id, hari_ke, hari_nama, menu_id, menu_nama, jumlah_porsi, kalori, protein, karbohidrat, lemak, serat)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [r.insertId, it.hari_ke, it.hari_nama, it.menu_id || null, it.menu_nama || null, it.jumlah_porsi || 0,
           it.kalori || 0, it.protein || 0, it.karbohidrat || 0, it.lemak || 0, it.serat || 0]
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
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'ID siklus tidak valid' });

  const { nama, kategori_penerima, jumlah_porsi, total_hari, status, catatan, tanggal_mulai, items } = req.body;
  if (nama !== undefined && (!nama || !nama.trim())) return res.status(400).json({ error: 'Nama siklus wajib diisi' });
  
  // Cek duplikat nama saat update (kecuali dirinya sendiri)
  if (nama !== undefined) {
    const [existing] = await db.query('SELECT id FROM siklus_menu WHERE nama=? AND tenant_id=? AND id!=?',       [nama.trim(), req.user.tenant_id, id]);
    if (existing.length) return res.status(409).json({ error: 'Siklus dengan nama "' + nama.trim() + '" sudah ada' });
  }
  
  // Auto-hitung jumlah_porsi dari PM berdasarkan jenjang
  const JENJANG_DB_MAP = {
    'TK/PAUD': ['TK/PAUD', 'TK', 'PAUD'],
    'SD/MI (1-3)': ['SD 1-3', 'SD/MI (1-3)', 'SD'],
    'SD/MI (4-6)': ['SD 4-6', 'SD/MI (4-6)'],
    'SMP/MTs, SMA/SMK': ['SMP', 'SMA', 'SMP/MTs, SMA/SMK'],
    'Bumil/Busui': ['Ibu Hamil', 'Ibu Menyusui', 'Bumil/Busui'],
    'Balita': ['Balita'],
  };
  const jenjangList = parseKategoriPenerima(kategori_penerima);
  const allDbVals = [...new Set(jenjangList.flatMap(j => JENJANG_DB_MAP[j] || [j]))];
  const porsiFromPm = allDbVals.length ? await (async () => {
    const ph = allDbVals.map(() => '?').join(',');
    const [[{total}]] = await db.query(
      `SELECT COALESCE(SUM(paket_besar + paket_kecil),0) AS total FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima IN (${ph})`,
      [req.user.tenant_id, ...allDbVals]
    );
    return Number(total) || 0;
  })() : 0;
  const finalPorsi = (jumlah_porsi || 0) || porsiFromPm;
  
  const conn = await db.getConnection();
  
  try {
    await conn.beginTransaction();
    
    // 1. Update data header siklus
    await conn.query(
      `UPDATE siklus_menu SET nama=?, kategori_penerima=?, jumlah_porsi=?, total_hari=?, status=?, catatan=?, tanggal_mulai=? WHERE id=? AND tenant_id=?`,
      [nama, kategori_penerima || null, finalPorsi, total_hari || 7, status || 'Draft', catatan || null, tanggal_mulai || null, id, req.user.tenant_id]
    );
    
    // 2. Hapus semua detail item lama berdasarkan siklus_id
    await conn.query('DELETE FROM siklus_menu_item WHERE siklus_id=?', [id]);
    
    // 3. Masukkan kembali detail item yang baru
    if (Array.isArray(items) && items.length) {
      for (const it of items) {
        await conn.query(
          `INSERT INTO siklus_menu_item (siklus_id, hari_ke, hari_nama, menu_id, menu_nama, jumlah_porsi, kalori, protein, karbohidrat, lemak, serat)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [id, it.hari_ke, it.hari_nama, it.menu_id || null, it.menu_nama || null, it.jumlah_porsi || 0,
           it.kalori || 0, it.protein || 0, it.karbohidrat || 0, it.lemak || 0, it.serat || 0]
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
  
  // Also check which items have manually-assigned ingredients via grid picker
  const [bahanCounts] = await db.query(
    'SELECT hari_ke, COUNT(*) as bahan_count FROM siklus_menu_item_bahan WHERE siklus_id=? GROUP BY hari_ke',
    [req.params.id]
  );
  const bahanMap = {};
  for (const bc of bahanCounts) {
    bahanMap[bc.hari_ke] = bc.bahan_count;
  }

  // Load grid bahan names for building combined names
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

  const KAT_ORDER_2 = ['Karbohidrat','Protein Hewani','Protein Nabati','Sayur','Buah','Susu','Minyak'];

  // Helper: build combined name from grid bahan
  function buildGridNama(hariKe) {
    const dayBahan = gridNamaByHari[hariKe] || [];
    if (!dayBahan.length) return null;
    const grouped = {};
    for (const b of dayBahan) {
      const kat = b.kategori_sp || 'Lainnya';
      if (!grouped[kat]) grouped[kat] = [];
      grouped[kat].push(b.nama);
    }
    const parts = [];
    for (const kat of KAT_ORDER_2) {
      if (grouped[kat] && grouped[kat].length) {
        parts.push(grouped[kat].join(', '));
      }
    }
    for (const [kat, names] of Object.entries(grouped)) {
      if (!KAT_ORDER_2.includes(kat)) {
        parts.push(names.join(', ') + ' (' + kat + ')');
      }
    }
    return parts.length ? parts.join(' + ') : null;
  }

  // Mark items that have ingredients even without menu_id
  for (const it of items) {
    it._has_bahan = (bahanMap[it.hari_ke] || 0) > 0;
    // Fix up existing manual items (saved before frontend fix)
    if (it._has_bahan && !it.menu_id) {
      // Set jumlah_porsi from siklus header if missing
      if (!it.jumlah_porsi || it.jumlah_porsi === 0) {
        it.jumlah_porsi = Number(siklus.jumlah_porsi) || 1;
      }
      // Always rebuild menu_nama from resep_map or grid, ignoring any DB placeholder
      it.menu_nama = null;
      // Priority 1: resep_map (explicit recipe names like "Nasi Kebuli")
      if (it.resep_map) {
        try {
          const map = typeof it.resep_map === 'string' ? JSON.parse(it.resep_map) : it.resep_map;
          const names = Object.values(map).filter(v => v && v.trim());
          if (names.length) it.menu_nama = names.join(' + ');
        } catch (e) { /* ignore */ }
      }
      // Priority 2: grid bahan names
      if (!it.menu_nama || !it.menu_nama.trim()) {
        const gridNama = buildGridNama(it.hari_ke);
        if (gridNama) it.menu_nama = gridNama;
      }
      // Final fallback
      if (!it.menu_nama || !it.menu_nama.trim()) {
        it.menu_nama = 'Menu Hari ' + it.hari_ke;
      }
    }
  }
  
  const filledDays = items.filter(it => it.menu_id || it._has_bahan).length; // Hari yang sudah diisi
  const emptyDays = totalDays - filledDays; // Hari yang masih kosong
  const uniqueMenus = new Set(items.filter(it => it.menu_id).map(it => it.menu_id)).size; // Jumlah menu unik (menghindari duplikasi)
  const coverage = totalDays ? Math.round((filledDays / totalDays) * 100) : 0; // Persentase kelengkapan (%)

  // 4. Untuk item yang diisi manual (via grid picker tanpa menu_id), hitung estimasi gizi
  //    menggunakan SP (Satuan Porsi): estimasi berat = 1 SP × berat_1_sp × jumlah_porsi
  //    lalu kalikan dengan nilai gizi per 100g dari bahan_baku
  const hasManualItems = items.some(it => it._has_bahan && !it.menu_id);
  if (hasManualItems) {
    const [gridBahan] = await db.query(
      `SELECT sb.hari_ke, b.kalori, b.protein, b.karbohidrat, b.lemak, b.serat, b.berat_1_sp
       FROM siklus_menu_item_bahan sb
       JOIN bahan_baku b ON b.id = sb.bahan_baku_id
       WHERE sb.siklus_id=?`,
      [req.params.id]
    );
    const gridByHari = {};
    for (const g of gridBahan) {
      if (!gridByHari[g.hari_ke]) gridByHari[g.hari_ke] = [];
      gridByHari[g.hari_ke].push(g);
    }
    for (const it of items) {
      if (it._has_bahan && !it.menu_id) {
        const dayBahan = gridByHari[it.hari_ke] || [];
        const porsi = Number(siklus.jumlah_porsi || 1);
        let estKalori = 0, estProtein = 0, estKarbohidrat = 0, estLemak = 0, estSerat = 0;
        for (const b of dayBahan) {
          // Gunakan 1 SP sebagai estimasi berat per bahan per orang
          const estWeight = Number(b.berat_1_sp || 0) * porsi;
          estKalori  += (Number(b.kalori || 0) / 100) * estWeight;
          estProtein += (Number(b.protein || 0) / 100) * estWeight;
          estKarbohidrat += (Number(b.karbohidrat || 0) / 100) * estWeight;
          estLemak   += (Number(b.lemak || 0) / 100) * estWeight;
          estSerat   += (Number(b.serat || 0) / 100) * estWeight;
        }
        // Simpan estimasi ke item untuk dipakai oleh kalkulasi totals
        it.kalori = Math.round(estKalori * 100) / 100;
        it.protein = Math.round(estProtein * 100) / 100;
        it.karbohidrat = Math.round(estKarbohidrat * 100) / 100;
        it.lemak = Math.round(estLemak * 100) / 100;
        it.serat = Math.round(estSerat * 100) / 100;
      }
    }
  }

  // 5. Hitung total akumulasi nilai gizi selama siklus berlangsung
  const totals = items.reduce((acc, it) => ({
    kalori: acc.kalori + Number(it.kalori || 0),
    protein: acc.protein + Number(it.protein || 0),
    karbohidrat: acc.karbohidrat + Number(it.karbohidrat || 0),
    lemak: acc.lemak + Number(it.lemak || 0),
    serat: acc.serat + Number(it.serat || 0),
  }), { kalori: 0, protein: 0, karbohidrat: 0, lemak: 0, serat: 0 });

  // 6. Hitung rata-rata asupan gizi harian (dibagi dengan hari yang ada menunya saja)
  const avg = filledDays ? {
    kalori: Math.round(totals.kalori / filledDays),
    protein: Math.round(totals.protein / filledDays),
    karbohidrat: Math.round(totals.karbohidrat / filledDays),
    lemak: Math.round(totals.lemak / filledDays),
    serat: Math.round(totals.serat / filledDays),
  } : { kalori: 0, protein: 0, karbohidrat: 0, lemak: 0, serat: 0 };

  // 7. SP Comparison: Target (standar_sp) vs Realisasi (actual ingredients)
  let spComparison = [];
  const spJenjangList = parseKategoriPenerima(siklus.kategori_penerima);
  if (spJenjangList.length) {
    // 7a. Get target SP from standar_sp for all assigned jenjang (max value per kategori)
    const spSql = spJenjangList.length === 1
      ? 'SELECT kategori_sp, sp_value FROM standar_sp WHERE jenjang=?'
      : `SELECT kategori_sp, MAX(sp_value) AS sp_value FROM standar_sp WHERE jenjang IN (${spJenjangList.map(() => '?').join(',')}) GROUP BY kategori_sp`;
    const [spTargets] = await db.query(spSql, spJenjangList.length === 1 ? [spJenjangList[0]] : spJenjangList);

    // 7b. Get realisasi SP from actual ingredients in this siklus
    const realSpByKat = {};
    const spItemCount = {};

    // Items with menu_id → get ingredients from menu_bahan
    const menuIds = items.filter(it => it.menu_id).map(it => it.menu_id);
    if (menuIds.length) {
      const placeholders = menuIds.map(() => '?').join(',');
      const [bahanRows] = await db.query(
        `SELECT mb.menu_id, b.kategori_sp, b.berat_1_sp, mb.jumlah
         FROM menu_bahan mb
         JOIN bahan_baku b ON b.id = mb.bahan_baku_id
         WHERE mb.menu_id IN (${placeholders})`,
        menuIds
      );
      for (const br of bahanRows) {
        const kat = br.kategori_sp || 'Lainnya';
        // Find the siklus item that has this menu_id to get jumlah_porsi
        const item = items.find(it => it.menu_id === br.menu_id);
        const porsi = Number(item?.jumlah_porsi || siklus.jumlah_porsi || 1);
        const totalGrams = Number(br.jumlah || 0) * porsi;
        const berat1sp = Number(br.berat_1_sp || 0);
        const sp = berat1sp > 0 ? totalGrams / berat1sp : 0;
        realSpByKat[kat] = (realSpByKat[kat] || 0) + sp;
        spItemCount[kat] = (spItemCount[kat] || 0) + 1;
      }
    }

    // Items with manual grid ingredients
    const hasGridItems = items.some(it => !it.menu_id && it._has_bahan);
    if (hasGridItems) {
      const [gridBahan] = await db.query(
        `SELECT sb.hari_ke, sb.kategori_sp, b.berat_1_sp
         FROM siklus_menu_item_bahan sb
         JOIN bahan_baku b ON b.id = sb.bahan_baku_id
         WHERE sb.siklus_id=?`,
        [req.params.id]
      );
      // Group by hari_ke to count unique items per day
      const gridByHariKat = {};
      for (const gb of gridBahan) {
        const key = gb.hari_ke + '|' + (gb.kategori_sp || 'Lainnya');
        if (!gridByHariKat[key]) gridByHariKat[key] = { sp_total: 0 };
        const berat1sp = Number(gb.berat_1_sp || 0);
        gridByHariKat[key].sp_total += berat1sp > 0 ? 1 : 0; // 1 item = ~1 SP
      }
      for (const [key, val] of Object.entries(gridByHariKat)) {
        const [, kat] = key.split('|');
        realSpByKat[kat] = (realSpByKat[kat] || 0) + val.sp_total;
        spItemCount[kat] = (spItemCount[kat] || 0) + 1;
      }
    }

    // 7c. Calculate per-day average and build comparison
    const fDays = Math.max(1, filledDays);
    const KAT_ORDER = ['Karbohidrat', 'Protein Hewani', 'Protein Nabati', 'Sayur', 'Buah', 'Susu', 'Minyak'];
    
    // Use KAT_ORDER to sort, add any extra categories not in the standard list
    const extraKats = Object.keys(realSpByKat).filter(k => !KAT_ORDER.includes(k)).sort();
    const allKats = [...KAT_ORDER.filter(k => {
      const hasTarget = spTargets.some(t => t.kategori_sp === k);
      const hasRealisasi = realSpByKat[k];
      return hasTarget || hasRealisasi;
    }), ...extraKats];

    for (const kat of allKats) {
      const targetRow = spTargets.find(t => t.kategori_sp === kat);
      const targetSp = targetRow ? Number(targetRow.sp_value) || 0 : 0;
      const realSp = (realSpByKat[kat] || 0) / fDays;
      const selisih = realSp - targetSp;
      spComparison.push({
        kategori: kat,
        target: Math.round(targetSp * 100) / 100,
        realisasi: Math.round(realSp * 100) / 100,
        selisih: Math.round(selisih * 100) / 100,
        persen: targetSp > 0 ? Math.round((realSp / targetSp) * 100) : (realSp > 0 ? 100 : 0),
        status: !targetRow ? 'no_target' : (realSp >= targetSp ? 'terpenuhi' : 'kurang'),
      });
    }
  }

  // 8. Kembalikan data lengkap untuk dirender di frontend (chart, tabel, ringkasan, SP comparison)
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
    spComparison,
  });
});

/**
 * GET /siklus/:id/laporan/produksi-harian
 * Laporan produksi harian dari grid bahan (siklus_menu_item_bahan).
 * Menampilkan per hari: menu name (combined dari resep_map), tabel bahan dengan kebutuhan kg
 * berdasarkan SP × berat_1_sp × jumlah_porsi / BDD.
 * jumlah_porsi = total penerima manfaat aktif untuk kategori_penerima siklus.
 */
router.get('/siklus/:id/laporan/produksi-harian', async (req, res) => {
  try {
    // 1. Ambil siklus
    const [[siklus]] = await db.query(
      'SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?',
      [req.params.id, req.user.tenant_id]
    );
    if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

    // 2. Ambil items per hari
    const [items] = await db.query(
      'SELECT * FROM siklus_menu_item WHERE siklus_id=? ORDER BY hari_ke ASC',
      [req.params.id]
    );

    // 3. Ambil grid bahan
    const [gridBahan] = await db.query(
      `SELECT sb.hari_ke, sb.kategori_sp, sb.bahan_baku_id,
              COALESCE(b.nama, '(bahan dihapus)') AS nama, 
              b.satuan, b.berat_1_sp, b.persen_bdd, b.buffer_persen
       FROM siklus_menu_item_bahan sb
       LEFT JOIN bahan_baku b ON b.id = sb.bahan_baku_id
       WHERE sb.siklus_id=?`,
      [req.params.id]
    );

    // 4. Standar SP untuk kategori_penerima siklus
    const spMap = {};
    if (siklus.kategori_penerima) {
      const [spRows] = await db.query(
        'SELECT kategori_sp, sp_value FROM standar_sp WHERE jenjang=?',
        [siklus.kategori_penerima]
      );
      for (const r of spRows) spMap[r.kategori_sp] = Number(r.sp_value);
    }

    // 5. Penerima Manfaat — total untuk semua jenjang siklus
    let jumlahPorsi = 0;
    const pmJenjangList = parseKategoriPenerima(siklus.kategori_penerima);
    if (pmJenjangList.length) {
      const ph = pmJenjangList.map(() => '?').join(',');
      const [[pmRow]] = await db.query(
        `SELECT COALESCE(SUM(paket_besar + paket_kecil),0) AS total FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima IN (${ph})`,
        [req.user.tenant_id, ...pmJenjangList]
      );
      jumlahPorsi = Number(pmRow.total) || 0;
    }
    if (!jumlahPorsi) {
      jumlahPorsi = Number(siklus.jumlah_porsi) || 0;
    }

    // 6. Siapkan buildGridNama helper (sama seperti endpoint lain)
    const gridNamaByHari = {};
    for (const g of gridBahan) {
      if (!gridNamaByHari[g.hari_ke]) gridNamaByHari[g.hari_ke] = [];
      gridNamaByHari[g.hari_ke].push({ kategori_sp: g.kategori_sp, nama: g.nama });
    }
    const KAT_ORDER = ['Karbohidrat','Protein Hewani','Protein Nabati','Sayur','Buah','Susu','Minyak'];
    function buildGridNama(hariKe) {
      const dayBahan = gridNamaByHari[hariKe] || [];
      if (!dayBahan.length) return null;
      const grouped = {};
      for (const b of dayBahan) {
        const kat = b.kategori_sp || 'Lainnya';
        if (!grouped[kat]) grouped[kat] = [];
        grouped[kat].push(b.nama);
      }
      const parts = [];
      for (const kat of KAT_ORDER) {
        if (grouped[kat] && grouped[kat].length) parts.push(grouped[kat].join(', '));
      }
      for (const [kat, names] of Object.entries(grouped)) {
        if (!KAT_ORDER.includes(kat)) parts.push(names.join(', ') + ' (' + kat + ')');
      }
      return parts.length ? parts.join(' + ') : null;
    }

    // 7. Hitung cell count: berapa bahan dalam satu (hari_ke + kategori_sp)
    const cellCount = {};
    for (const gb of gridBahan) {
      const key = gb.hari_ke + '|' + (gb.kategori_sp || 'Lainnya');
      if (!cellCount[key]) cellCount[key] = 0;
      cellCount[key]++;
    }

    // 8. Group grid bahan by hari_ke
    const bahanByDay = {};
    for (const gb of gridBahan) {
      if (!bahanByDay[gb.hari_ke]) bahanByDay[gb.hari_ke] = [];
      bahanByDay[gb.hari_ke].push(gb);
    }

    // 9. Build days data
    const days = items.map(it => {
      // Build combined menu name
      let menuNama = it.menu_nama || null;
      if (!it.menu_id) {
        menuNama = null;
        if (it.resep_map) {
          try {
            const map = typeof it.resep_map === 'string' ? JSON.parse(it.resep_map) : it.resep_map;
            const names = Object.values(map).filter(v => v && v.trim());
            if (names.length) menuNama = names.join(' + ');
          } catch (e) {}
        }
        if (!menuNama) {
          const gridNama = buildGridNama(it.hari_ke);
          if (gridNama) menuNama = gridNama;
        }
        if (!menuNama) menuNama = 'Menu Hari ' + it.hari_ke;
      }

      // Calculate ingredients for this day
      const dayBahan = bahanByDay[it.hari_ke] || [];
      const bahanRows = [];
      
      for (const gb of dayBahan) {
        const kat = gb.kategori_sp || 'Lainnya';
        const key = gb.hari_ke + '|' + kat;
        const countInCell = cellCount[key] || 1;
        const spValue = spMap[kat] || 0;
        const spPerItem = countInCell > 0 ? spValue / countInCell : 0;
        const berat1Sp = Number(gb.berat_1_sp || 0);
        const persenBdd = Number(gb.persen_bdd || 100);
        
        // Berat bersih per item = SP_per_item × berat_1_sp × jumlah_porsi
        const beratBersih = spPerItem * berat1Sp * jumlahPorsi;
        // Berat kotor = berat bersih / (BDD% / 100)
        const beratKotor = persenBdd > 0 ? Math.round((beratBersih / (persenBdd / 100)) * 100) / 100 : beratBersih;
        // Kebutuhan dalam kg
        const kebutuhanKg = Math.round((beratKotor / 1000) * 100) / 100;
        
        // Display value: jika satuan = pcs/buah, tampilkan pcs, selainnya kg
        const satuan = gb.satuan || 'kg';
        const isPcs = ['pcs', 'buah', 'btl', 'pack'].includes(satuan.toLowerCase());
        const displayQty = isPcs ? Math.round(kebutuhanKg) : kebutuhanKg;
        const displaySatuan = isPcs ? satuan : 'kg';
        
        bahanRows.push({
          bahan_baku_id: gb.bahan_baku_id,
          nama: gb.nama,
          satuan: gb.satuan,
          kategori_sp: kat,
          sp_value: spValue,
          sp_per_item: Math.round(spPerItem * 100) / 100,
          berat_1_sp: berat1Sp,
          persen_bdd: persenBdd,
          jumlah_porsi: jumlahPorsi,
          berat_bersih: Math.round(beratBersih * 100) / 100,
          berat_kotor: beratKotor,
          kebutuhan_kg: kebutuhanKg,
          buffer_persen: Number(gb.buffer_persen || 0),
          display_qty: displayQty,
          display_satuan: displaySatuan,
        });
      }

      return {
        hari_ke: it.hari_ke,
        hari_nama: it.hari_nama,
        menu_id: it.menu_id,
        menu_nama: menuNama,
        jumlah_porsi: jumlahPorsi,
        bahan: bahanRows,
        total_bahan: bahanRows.length,
        total_kebutuhan_kg: Math.round(bahanRows.reduce((s, b) => s + b.kebutuhan_kg, 0) * 100) / 100,
      };
    });

    // 10. Ringkasan
    const totalKebutuhan = days.reduce((s, d) => s + d.total_kebutuhan_kg, 0);
    const filledDays = days.filter(d => d.bahan.length > 0).length;

    res.json({
      siklus: {
        id: siklus.id,
        nama: siklus.nama,
        kategori_penerima: siklus.kategori_penerima,
        status: siklus.status,
        jumlah_porsi: jumlahPorsi,
      },
      ringkasan: {
        total_hari: days.length,
        hari_terisi: filledDays,
        hari_kosong: days.length - filledDays,
        total_penerima: jumlahPorsi,
        total_kebutuhan_kg: Math.round(totalKebutuhan * 100) / 100,
      },
      days,
    });
  } catch (err) {
    console.error('Produksi harian error:', err);
    res.status(500).json({ error: err.message });
  }
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

  // Batch-load items and bahan for all siklus
  const siklusIds = siklusList.map(s => s.id);
  const itemsBySiklus = await batchLoadItems(siklusIds);
  const allMenuIds = [...new Set(Object.values(itemsBySiklus).flatMap(arr => arr.filter(it => it.menu_id).map(it => it.menu_id)))];
  const menuBahanMap = await batchLoadMenuBahan(allMenuIds);

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
      const items = (itemsBySiklus[s.id] || []).filter(it => it.menu_id);

      for (const it of items) {
        const bahan = menuBahanMap[it.menu_id] || [];

        for (const b of bahan) {
          const namaLower = b.nama.trim().toLowerCase();
          const spRef = spRefByName[namaLower];
          const persenBdd = spRef ? spRef.bdd_persen : Number(b.persen_bdd || 100);
          const beratBersih = Number(b.jumlah || 0);
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
    'SELECT id, nama, kategori_penerima, jumlah_porsi FROM siklus_menu WHERE tenant_id=? ORDER BY id',
    [req.user.tenant_id]
  );

  const siklusIds = siklusList.map(s => s.id);
  const itemsBySiklus = await batchLoadItems(siklusIds);
  const allMenuIds = [...new Set(Object.values(itemsBySiklus).flatMap(arr => arr.filter(it => it.menu_id).map(it => it.menu_id)))];
  const menuBahanMap = await batchLoadMenuBahan(allMenuIds);
  const gridBahanBySiklus = await batchLoadGridBahanBySiklus(siklusIds);

  const KAT_DISPLAY = ['Karbohidrat', 'Protein Hewani', 'Protein Nabati', 'Sayur', 'Buah', 'Susu', 'Minyak'];

  const result = [];
  for (const s of siklusList) {
    const items = itemsBySiklus[s.id] || [];
    const gridBahan = gridBahanBySiklus[s.id] || [];
    const gridByHari = {};
    for (const gb of gridBahan) {
      if (!gridByHari[gb.hari_ke]) gridByHari[gb.hari_ke] = [];
      gridByHari[gb.hari_ke].push(gb);
    }

    const days = [];
    for (const it of items) {
      const day = {
        hari_ke: it.hari_ke,
        hari_nama: it.hari_nama,
        menu_id: it.menu_id,
        menu_nama: it.menu_nama_lengkap || it.menu_nama || null,
        kategori: {},
      };
      for (const kat of KAT_DISPLAY) day.kategori[kat] = [];

      if (it.menu_id) {
        const bahan = menuBahanMap[it.menu_id] || [];
        for (const b of bahan) {
          const kat = b.kategori_sp || 'Lainnya';
          if (day.kategori[kat]) {
            if (!day.kategori[kat].includes(b.nama)) {
              day.kategori[kat].push(b.nama);
            }
          }
        }
      }

      // Merge direct ingredient assignments from grid
      const dayGrid = gridByHari[it.hari_ke] || [];
      for (const b of dayGrid) {
        const kat = b.kategori_sp || 'Lainnya';
        if (day.kategori[kat]) {
          if (!day.kategori[kat].includes(b.nama)) {
            day.kategori[kat].push(b.nama);
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

  // Gunakan LEFT JOIN agar bahan tetap muncul meskipun sudah dihapus dari tabel bahan_baku
  const [gridRows] = await db.query(
    `SELECT sb.hari_ke, sb.kategori_sp, sb.bahan_baku_id, COALESCE(b.nama, '(bahan dihapus)') AS nama
     FROM siklus_menu_item_bahan sb
     LEFT JOIN bahan_baku b ON b.id = sb.bahan_baku_id
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

    // Hitung dan simpan nilai gizi untuk item manual berdasarkan grid yang baru disimpan
    const [giziBahan] = await conn.query(
      `SELECT sb.hari_ke, b.kalori, b.protein, b.karbohidrat, b.lemak, b.serat, b.berat_1_sp
       FROM siklus_menu_item_bahan sb
       JOIN bahan_baku b ON b.id = sb.bahan_baku_id
       WHERE sb.siklus_id=?`,
      [req.params.id]
    );
    const giziByHari = {};
    for (const g of giziBahan) {
      if (!giziByHari[g.hari_ke]) giziByHari[g.hari_ke] = [];
      giziByHari[g.hari_ke].push(g);
    }
    for (const [hariKe, bahanList] of Object.entries(giziByHari)) {
      let kalori = 0, protein = 0, karbohidrat = 0, lemak = 0, serat = 0;
      for (const b of bahanList) {
        const w = Number(b.berat_1_sp || 0);
        kalori += (Number(b.kalori || 0) / 100) * w;
        protein += (Number(b.protein || 0) / 100) * w;
        karbohidrat += (Number(b.karbohidrat || 0) / 100) * w;
        lemak += (Number(b.lemak || 0) / 100) * w;
        serat += (Number(b.serat || 0) / 100) * w;
      }
      await conn.query(
        'UPDATE siklus_menu_item SET kalori=?, protein=?, karbohidrat=?, lemak=?, serat=? WHERE siklus_id=? AND hari_ke=?',
        [Math.round(kalori * 100) / 100, Math.round(protein * 100) / 100, Math.round(karbohidrat * 100) / 100,
         Math.round(lemak * 100) / 100, Math.round(serat * 100) / 100, req.params.id, Number(hariKe)]
      );
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
 * POST /siklus/tambah-bahan
 * Menambahkan bahan baru ke bahan_baku dari grid siklus (oleh ahli gizi).
 * Body: { nama, kategori_sp, satuan }
 */
router.post('/siklus/tambah-bahan', async (req, res) => {
  const { nama, kategori_sp, satuan } = req.body;
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama bahan wajib diisi' });
  if (!kategori_sp) return res.status(400).json({ error: 'Kategori SP wajib diisi' });

  const [existing] = await db.query('SELECT id FROM bahan_baku WHERE tenant_id=? AND nama=?', [req.user.tenant_id, nama.trim()]);
  if (existing.length) return res.json({ id: existing[0].id, exists: true });

  const [r] = await db.query(
    'INSERT INTO bahan_baku (tenant_id, nama, kategori_sp, satuan, sumber) VALUES (?,?,?,?,?)',
    [req.user.tenant_id, nama.trim(), kategori_sp, satuan || 'g', 'ahli_gizi']
  );
  res.json({ id: r.insertId, exists: false });
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

  // Batch-load items and bahan for all selected siklus
  const matchingSiklusIds = selectedSiklus.map(s => s.id);
  const itemsBySiklus = await batchLoadItems(matchingSiklusIds);
  const allMenuIds = [...new Set(Object.values(itemsBySiklus).flatMap(arr => arr.filter(it => it.menu_id).map(it => it.menu_id)))];
  const menuBahanMap = await batchLoadMenuBahan(allMenuIds);
  const gridBahanBySiklus = await batchLoadGridBahanBySiklus(matchingSiklusIds);

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

    const matchingSiklus = selectedSiklus.filter(s => {
      if (!s.kategori_penerima) return true;
      const kps = parseKategoriPenerima(s.kategori_penerima);
      return kps.some(kp => jenjangDbVariants.includes(kp));
    });
    if (!matchingSiklus.length) continue;

    const jenjangSp = {};
    for (const dv of jenjangDbVariants) {
      if (spByJenjang[dv]) Object.assign(jenjangSp, spByJenjang[dv]);
    }

    const jenjangData = {
      jenjang: displayJenjang,
      jumlah_siswa: penerimaCount,
      siklus: [],
    };

    let menuCounter = 0;

    for (const s of matchingSiklus) {
      const items = itemsBySiklus[s.id] || [];
      const gridBahan = gridBahanBySiklus[s.id] || [];
      const gridByHari = {};
      for (const gb of gridBahan) {
        if (!gridByHari[gb.hari_ke]) gridByHari[gb.hari_ke] = [];
        gridByHari[gb.hari_ke].push(gb);
      }

      const hariList = [];

      for (const it of items) {
        menuCounter++;
        if (!it.menu_id) {
          const dayGrid = gridByHari[it.hari_ke] || [];
          const bahanList = [];
          for (const b of dayGrid) {
            const namaLower = b.nama.trim().toLowerCase();
            const spRef = spRefByName[namaLower];
            const persenBdd = spRef ? spRef.bdd_persen : Number(b.persen_bdd || 100);
            const spValue = b.kategori_sp ? (jenjangSp[b.kategori_sp] || null) : null;
            const beratBersih = spValue !== null ? (Number(b.berat_1_sp || 0) * spValue) : 0;
            const beratKotor = persenBdd > 0 ? Math.round(beratBersih / (persenBdd / 100) * 100) / 100 : beratBersih;
            const kebutuhanKg = penerimaCount > 0 ? Math.round((beratKotor * penerimaCount / 1000) * 100) / 100 : 0;

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
            menu_nama: it.menu_nama || '-',
            bahan: bahanList,
          });
          continue;
        }

        const bahanRows = menuBahanMap[it.menu_id] || [];

        const bahanList = [];

        for (const b of bahanRows) {
          const namaLower = b.nama.trim().toLowerCase();
          const spRef = spRefByName[namaLower];
          const persenBdd = spRef ? spRef.bdd_persen : Number(b.persen_bdd || 100);
          const beratBersih = Number(b.jumlah || 0);
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
  try {
  let tanggalMulai = req.query.tanggal_mulai || '';
  const tanggalSelesai = req.query.tanggal_selesai || '';

  // 1. Siklus list
  const [siklusList] = await db.query(
    'SELECT * FROM siklus_menu WHERE tenant_id=? ORDER BY id DESC',
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

  // 4. Bahan Baku info (buffer_persen, satuan) by name
  const [bahanBakuInfo] = await db.query(
    'SELECT nama, buffer_persen, satuan FROM bahan_baku WHERE tenant_id=?',
    [req.user.tenant_id]
  );
  const bakuInfoByName = {};
  for (const bb of bahanBakuInfo) {
    bakuInfoByName[bb.nama.trim().toLowerCase()] = {
      buffer_persen: Number(bb.buffer_persen) || 10,
      satuan: bb.satuan || 'kg',
    };
  }

  // 5. Standar SP per jenjang
  const [allStandarSp] = await db.query('SELECT jenjang, kategori_sp, sp_value FROM standar_sp');
  const spByJenjang = {};
  for (const r of allStandarSp) {
    if (!spByJenjang[r.jenjang]) spByJenjang[r.jenjang] = {};
    spByJenjang[r.jenjang][r.kategori_sp] = Number(r.sp_value);
  }

  // Batch-load all data before loops
  const activeIds = activeSiklus.map(s => s.id);
  const itemsBySiklus = await batchLoadItems(activeIds);
  const bahanCountsBySiklus = await batchLoadBahanCounts(activeIds);
  const allMenuIds = [...new Set(Object.values(itemsBySiklus).flatMap(arr => arr.filter(it => it.menu_id).map(it => it.menu_id)))];
  const menuBahanMap = await batchLoadMenuBahan(allMenuIds);
  const gridBahanBySiklus = await batchLoadGridBahanBySiklus(activeIds);

  // 5. Build per-hari × per-jenjang × per-bahan data
  // Data is keyed by siklus_id + hari_ke for proper date anchoring
  const perSiklusMap = {}; // siklus_id → { hari_ke → { jenjang → { bahan → data } } }
  const perSiklusPorsi = {}; // siklus_id → { hari_ke → total_porsi }
  const perSiklusMenu = {}; // siklus_id → { hari_ke → [menu_nama] }

  for (const displayJenjang of activeJenjang) {
    const pmData = pmMap[displayJenjang];
    const penerimaCount = pmData ? pmData.total_penerima : 0;
    if (penerimaCount < 1) continue;

    const jenjangDbVariants = JENJANG_DB_MAP[displayJenjang] || [displayJenjang];
    const matchingSiklus = activeSiklus.filter(s =>
      !s.kategori_penerima || parseKategoriPenerima(s.kategori_penerima).some(k => jenjangDbVariants.includes(k))
    );
    if (!matchingSiklus.length) continue;

    const jenjangSp = {};
    for (const dv of jenjangDbVariants) {
      if (spByJenjang[dv]) Object.assign(jenjangSp, spByJenjang[dv]);
    }

    for (const s of matchingSiklus) {
      const items = itemsBySiklus[s.id] || [];
      const bahanMap = bahanCountsBySiklus[s.id] || {};
      const gridBahan = gridBahanBySiklus[s.id] || [];
      const gridByHari = {};
      for (const gb of gridBahan) {
        if (!gridByHari[gb.hari_ke]) gridByHari[gb.hari_ke] = [];
        gridByHari[gb.hari_ke].push(gb);
      }

      if (!perSiklusMap[s.id]) {
        perSiklusMap[s.id] = {};
        perSiklusPorsi[s.id] = {};
        perSiklusMenu[s.id] = {};
      }

      for (const it of items) {
        const hk = it.hari_ke;
        const isManual = !it.menu_id && (bahanMap[hk] || 0) > 0;

        if (!it.menu_id && !isManual) continue;

        if (!perSiklusMap[s.id][hk]) perSiklusMap[s.id][hk] = {};
        if (!perSiklusMap[s.id][hk][displayJenjang]) perSiklusMap[s.id][hk][displayJenjang] = {};
        if (!perSiklusPorsi[s.id][hk]) perSiklusPorsi[s.id][hk] = 0;
        perSiklusPorsi[s.id][hk] += penerimaCount;
        if (!perSiklusMenu[s.id][hk]) perSiklusMenu[s.id][hk] = [];
        const menuNama = it.menu_nama_lengkap || it.menu_nama || '';
        if (menuNama && !perSiklusMenu[s.id][hk].includes(menuNama)) {
          perSiklusMenu[s.id][hk].push(menuNama);
        }

        let bahanRows;
        if (it.menu_id) {
          bahanRows = menuBahanMap[it.menu_id] || [];
        } else {
          bahanRows = gridByHari[hk] || [];
        }

        for (const b of bahanRows) {
          const namaLower = b.nama.trim().toLowerCase();
          const spRef = spRefByName[namaLower];
          const persenBdd = spRef ? spRef.bdd_persen : Number(b.persen_bdd || 100);

          let beratBersih, beratKotor, kebutuhanKg;

          if (it.menu_id) {
            // Apply standar_sp multiplier (consistent with grid-based path)
            const spVal = b.kategori_sp ? (jenjangSp[b.kategori_sp] || 0) : 0;
            const actualSp = spVal || 1;
            beratBersih = Number(b.jumlah || 0) * actualSp;
            beratKotor = persenBdd > 0 ? Math.round(beratBersih / (persenBdd / 100) * 100) / 100 : beratBersih;
            kebutuhanKg = penerimaCount > 0 ? Math.round((beratKotor * penerimaCount / 1000) * 100) / 100 : 0;
          } else {
            const spValue = b.kategori_sp ? (jenjangSp[b.kategori_sp] || 0) : 0;
            let beratPerSp = Number(b.berat_1_sp || 0);
            if (beratPerSp === 0) {
              const spRef = spRefByName[b.nama.trim().toLowerCase()];
              if (spRef && spRef.berat_bersih > 0) beratPerSp = spRef.berat_bersih;
            }
            const estWeightPerPerson = spValue * beratPerSp;
            beratBersih = estWeightPerPerson;
            beratKotor = persenBdd > 0 ? Math.round(beratBersih / (persenBdd / 100) * 100) / 100 : beratBersih;
            kebutuhanKg = penerimaCount > 0 ? Math.round((beratKotor * penerimaCount / 1000) * 100) / 100 : 0;
          }

          const spValue = b.kategori_sp ? (jenjangSp[b.kategori_sp] || null) : null;
          let namaDisplay = b.nama;
          if (spValue !== null) {
            namaDisplay = b.nama + ' ' + String(spValue).replace('.', ',') + ' SP';
          }

          const bakuKey = namaLower;
          const bakuInfo = bakuInfoByName[bakuKey] || {};
          const satuanBahan = b.satuan || bakuInfo.satuan || 'kg';
          const bufferPersen = Number(b.buffer_persen) || bakuInfo.buffer_persen || 10;

          if (!perSiklusMap[s.id][hk][displayJenjang][b.nama]) {
            perSiklusMap[s.id][hk][displayJenjang][b.nama] = {
              nama: b.nama,
              nama_display: namaDisplay,
              kategori_sp: b.kategori_sp,
              berat_bersih: beratBersih,
              persen_bdd: persenBdd,
              berat_kotor: beratKotor,
              kebutuhan_kg: 0,
              satuan: satuanBahan,
              buffer_persen: bufferPersen,
              keterangan: (it.menu_id && b.keterangan) || '',
            };
          }
          perSiklusMap[s.id][hk][displayJenjang][b.nama].kebutuhan_kg += kebutuhanKg;
          perSiklusMap[s.id][hk][displayJenjang][b.nama].berat_kotor = Math.max(
            perSiklusMap[s.id][hk][displayJenjang][b.nama].berat_kotor, beratKotor);
          if (!perSiklusMap[s.id][hk][displayJenjang][b.nama].berat_bersih) {
            perSiklusMap[s.id][hk][displayJenjang][b.nama].berat_bersih = beratBersih;
            perSiklusMap[s.id][hk][displayJenjang][b.nama].persen_bdd = persenBdd;
          }
        }
      }
    }
  }

  // 6. Tentukan filterStart — jika tidak ada tanggal_mulai dari user, pakai min(siklus.tanggal_mulai)
  //    atau created_at siklus sebagai fallback
  if (!tanggalMulai) {
    const tanggalList = activeSiklus
      .map(s => s.tanggal_mulai || (s.created_at ? new Date(s.created_at).toISOString().slice(0, 10) : null))
      .filter(Boolean)
      .sort();
    tanggalMulai = tanggalList.length > 0 ? tanggalList[0] : new Date().toISOString().slice(0, 10);
  }
  const filterStart = new Date(tanggalMulai);

  // totalHari = max durasi siklus aktif. Tapi batasi agar tidak overflow.
  let totalHari = Math.max(...activeSiklus.map(s => s.total_hari || 7), 7);
  if (tanggalSelesai) {
    const filterEnd = new Date(tanggalSelesai);
    const diffDays = Math.floor((filterEnd.getTime() - filterStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 0 && diffDays < totalHari) totalHari = diffDays;
  }

  const hariResult = [];

  for (let d = 0; d < totalHari; d++) {
    const currentDate = new Date(filterStart);
    currentDate.setDate(currentDate.getDate() + d);
    const dayName = currentDate.toLocaleDateString('id-ID', { weekday: 'long' });
    const tglNum = currentDate.getDate();
    const blnNama = currentDate.toLocaleDateString('id-ID', { month: 'long' });
    const tahun = currentDate.getFullYear();
    const headerTanggal = `${dayName}, ${tglNum} ${blnNama} ${tahun}`;

    // Aggregate ingredients across all relevant siklus for this date
    const merged = {}; // { jenjang: { bahan: data } }
    let dayTotalPorsi = 0;
    const dayMenuNames = [];

    for (const s of activeSiklus) {
      const siklusData = perSiklusMap[s.id];
      if (!siklusData) continue;

      // Tentukan hari_ke (hk) berdasarkan tanggal aktual siklus.
      // Kalau siklus tidak punya tanggal_mulai, fallback ke created_at
      // supaya pemfilteran tanggal tetap bermakna.
      const startDateStr = s.tanggal_mulai
        || (s.created_at ? new Date(s.created_at).toISOString().slice(0, 10) : null)
        || filterStart.toISOString().slice(0, 10);
      const siklusStart = new Date(startDateStr);
      const diffTime = currentDate.getTime() - siklusStart.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const hk = diffDays + 1;
      const maxHk = s.total_hari || 7;
      if (hk < 1 || hk > maxHk) continue; // this date is outside this siklus' range

      const dayData = siklusData[hk];
      if (!dayData) continue;

      for (const jenjang of Object.keys(dayData)) {
        if (!merged[jenjang]) merged[jenjang] = {};
        for (const nama of Object.keys(dayData[jenjang])) {
          const src = dayData[jenjang][nama];
          if (!merged[jenjang][nama]) {
            merged[jenjang][nama] = { ...src, kebutuhan_kg: 0 };
          }
          merged[jenjang][nama].kebutuhan_kg += src.kebutuhan_kg;
          merged[jenjang][nama].berat_kotor = Math.max(merged[jenjang][nama].berat_kotor, src.berat_kotor);
        }
        dayTotalPorsi += pmMap[jenjang] ? pmMap[jenjang].total_penerima : 0;

        const menus = perSiklusMenu[s.id] && perSiklusMenu[s.id][hk];
        if (menus) {
          for (const mn of menus) {
            if (!dayMenuNames.includes(mn)) dayMenuNames.push(mn);
          }
        }
      }
    }

    if (!Object.keys(merged).length) continue;

    // Build set of all unique ingredient names across all jenjang for this day
    const allBahan = new Set();
    for (const j of Object.keys(merged)) {
      for (const nama of Object.keys(merged[j])) {
        allBahan.add(nama);
      }
    }

    const bahanList = [];

    for (const namaBahan of allBahan) {
      const jenjangKeys = Object.keys(merged);
      const firstJenjang = jenjangKeys.find(j => merged[j][namaBahan]);
      const ref = firstJenjang ? merged[firstJenjang][namaBahan] : null;
      if (!ref) continue;

      const perJenjang = {};
      let totalKg = 0;
      for (const j of jenjangKeys) {
        const refJ = merged[j][namaBahan];
        const val = refJ ? refJ.kebutuhan_kg : 0;
        perJenjang[j] = refJ ? {
          kebutuhan_kg: refJ.kebutuhan_kg,
          berat_bersih: refJ.berat_bersih,
          persen_bdd: refJ.persen_bdd,
          berat_kotor: refJ.berat_kotor,
          jumlah_siswa: pmMap[j] ? pmMap[j].total_penerima : 0,
        } : null;
        totalKg += val;
      }

      const bufferPersen = ref.buffer_persen || 10;
      const bufferMultiplier = 1 + (bufferPersen / 100);
      const bufferKg = Math.round(totalKg * bufferMultiplier * 100) / 100;

      const satuan = ref.satuan || 'kg';
      const satLower = satuan.toLowerCase();
      let rincian;

      if (ref.kategori_sp === 'Susu' || ref.kategori_sp === 'Buah') {
        rincian = Math.round(dayTotalPorsi) + 'pcs';
      } else if (ref.kategori_sp === 'Minyak') {
        rincian = '';
      } else if (satLower === 'pcs' || satLower === 'buah' || satLower === 'item' || satLower === 'pack') {
        rincian = Math.round(dayTotalPorsi) + satuan;
      } else {
        rincian = Math.round(totalKg) + 'kg';
      }

      const isCounted = ref.kategori_sp === 'Susu' || ref.kategori_sp === 'Buah' || satLower === 'pcs' || satLower === 'buah';
      const ketValue = isCounted ? dayTotalPorsi : Math.round(totalKg * 100) / 100;

      bahanList.push({
        nama: ref.nama,
        nama_display: ref.nama_display,
        per_jenjang: perJenjang,
        total_kebutuhan_kg: Math.round(totalKg * 100) / 100,
        kebutuhan_buffer_kg: bufferKg,
        buffer_persen: bufferPersen,
        rincian: rincian,
        keterangan: ref.keterangan || '',
        ket_display: ketValue,
      });
    }

    const KATEGORI_ORDER = ['Karbohidrat', 'Protein Hewani', 'Protein Nabati', 'Sayur', 'Buah', 'Susu', 'Minyak'];
    bahanList.sort((a, b) => {
      const jKeys = Object.keys(merged);
      const aRef = jKeys.find(j => merged[j][a.nama]);
      const bRef = jKeys.find(j => merged[j][b.nama]);
      const aKat = aRef ? merged[aRef][a.nama].kategori_sp : '';
      const bKat = bRef ? merged[bRef][b.nama].kategori_sp : '';
      return KATEGORI_ORDER.indexOf(aKat) - KATEGORI_ORDER.indexOf(bKat);
    });

    hariResult.push({
      hari_ke: d + 1,
      hari_nama: dayName,
      header_tanggal: headerTanggal,
      total_porsi: dayTotalPorsi,
      menu_names: dayMenuNames,
      bahan: bahanList,
    });
  }

  res.json({
    jenjang_list: activeJenjang,
    hari: hariResult,
    pm_map: Object.fromEntries(activeJenjang.map(j => [j, pmMap[j] ? pmMap[j].total_penerima : 0])),
    tanggal_mulai: tanggalMulai,
    tanggal_selesai: tanggalSelesai || undefined,
  });
  } catch (e) {
    console.error('Perencanaan error:', e);
    res.status(500).json({ error: e.message || 'Gagal memuat perencanaan' });
  }
});

/**
 * POST /siklus/generate-produksi
 * Auto-generate produksi harian dari siklus Aktif untuk tanggal tertentu.
 * Body: { siklus_id, tanggal_produksi }
 * Membuat entry di tabel produksi untuk setiap menu/hari di siklus.
 */
router.post('/siklus/generate-produksi', async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const { siklus_id, tanggal_produksi } = req.body;
    if (!siklus_id || !tanggal_produksi) {
      return res.status(400).json({ error: 'siklus_id dan tanggal_produksi wajib diisi' });
    }

    // Ambil siklus
    const [[siklus]] = await db.query(
      'SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?',
      [siklus_id, t]
    );
    if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

    // Ambil hari ke-berapa dari tanggal (gunakan siklus.week_start atau hari biasa)
    // Default: gunakan tanggal produksi sebagai hari ke-1 dari siklus
    const tgl = new Date(tanggal_produksi + 'T00:00:00');
    const hariIdx = tgl.getDay(); // 0=Minggu, 1=Senin...
    const hariNames = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const hariNama = hariNames[hariIdx];

    // Cari item siklus untuk hari ini
    const [items] = await db.query(
      `SELECT si.*, m.nama as menu_nama_lengkap
       FROM siklus_menu_item si
       LEFT JOIN menu m ON m.id = si.menu_id
       WHERE si.siklus_id=? AND si.hari_nama=?
       LIMIT 1`,
      [siklus_id, hariNama]
    );

    if (!items.length) {
      return res.status(404).json({ error: 'Tidak ada menu untuk hari ' + hariNama + ' di siklus ini' });
    }

    const item = items[0];
    if (!item.menu_id && !item.menu_nama) {
      return res.status(400).json({ error: 'Menu untuk hari ' + hariNama + ' belum diisi' });
    }

    // Cek duplikat: sudah ada produksi untuk tanggal + menu ini?
    const [existing] = await db.query(
      `SELECT id FROM produksi
       WHERE tenant_id=? AND tanggal_produksi=? AND menu_id=?`,
      [t, tanggal_produksi, item.menu_id]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Produksi untuk tanggal ' + tanggal_produksi + ' dan menu ini sudah ada' });
    }

    // Buat entry produksi
    const menuNama = item.menu_nama || item.menu_nama_lengkap || 'Menu ' + item.hari_nama;
    const jumlahPorsi = item.jumlah_porsi || siklus.jumlah_porsi || 0;

    const prodKategori = parseKategoriPenerima(siklus.kategori_penerima);
    const prodJenjang = prodKategori[0] || '';

    const [result] = await db.query(
      `INSERT INTO produksi (tenant_id, tanggal_produksi, menu_id, menu_nama, kategori_penerima, jumlah_porsi, status, catatan)
       VALUES (?,?,?,?,?,?,?,?)`,
      [t, tanggal_produksi, item.menu_id, menuNama, prodJenjang, jumlahPorsi, 'Direncanakan',
       'Auto-generate dari siklus: ' + siklus.nama]
    );

    res.json({
      ok: true,
      id: result.insertId,
      tanggal: tanggal_produksi,
      menu_nama: menuNama,
      jumlah_porsi: jumlahPorsi,
      siklus_nama: siklus.nama,
      message: 'Produksi ' + tanggal_produksi + ' berhasil dibuat: ' + menuNama + ' (' + jumlahPorsi + ' porsi)',
    });
  } catch (err) {
    console.error('Generate produksi error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /siklus/generate-produksi-batch
 * Auto-generate produksi untuk RENTANG tanggal dari siklus Aktif.
 * Body: { siklus_id, tanggal_mulai, tanggal_selesai }
 */
router.post('/siklus/generate-produksi-batch', async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const { siklus_id, tanggal_mulai, tanggal_selesai } = req.body;
    if (!siklus_id || !tanggal_mulai || !tanggal_selesai) {
      return res.status(400).json({ error: 'siklus_id, tanggal_mulai, dan tanggal_selesai wajib diisi' });
    }

    // Ambil siklus
    const [[siklus]] = await db.query(
      'SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?',
      [siklus_id, t]
    );
    if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

    // Ambil semua item siklus
    const [items] = await db.query(
      `SELECT si.*, m.nama as menu_nama_lengkap
       FROM siklus_menu_item si
       LEFT JOIN menu m ON m.id = si.menu_id
       WHERE si.siklus_id=? AND (si.menu_id IS NOT NULL OR si.menu_nama IS NOT NULL)
       ORDER BY si.hari_ke ASC`,
      [siklus_id]
    );

    const hariNamaToItem = {};
    for (const it of items) {
      hariNamaToItem[it.hari_nama] = it;
    }

    // Generate untuk setiap tanggal
    const start = new Date(tanggal_mulai + 'T00:00:00');
    const end = new Date(tanggal_selesai + 'T00:00:00');
    const created = [];
    const skipped = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const hariNames = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
      const hariNama = hariNames[d.getDay()];
      const item = hariNamaToItem[hariNama];

      if (!item) {
        skipped.push({ tanggal: dateStr, alasan: 'Tidak ada menu untuk hari ' + hariNama });
        continue;
      }

      // Cek duplikat
      const [existing] = await db.query(
        `SELECT id FROM produksi WHERE tenant_id=? AND tanggal_produksi=? AND menu_id=?`,
        [t, dateStr, item.menu_id]
      );
      if (existing.length) {
        skipped.push({ tanggal: dateStr, alasan: 'Sudah ada', menu: item.menu_nama || item.menu_nama_lengkap });
        continue;
      }

      const menuNama = item.menu_nama || item.menu_nama_lengkap || 'Menu ' + hariNama;
      const jumlahPorsi = item.jumlah_porsi || siklus.jumlah_porsi || 0;

      const prodKategori = parseKategoriPenerima(siklus.kategori_penerima);
      const prodJenjang = prodKategori[0] || '';
      const [result] = await db.query(
        `INSERT INTO produksi (tenant_id, tanggal_produksi, menu_id, menu_nama, kategori_penerima, jumlah_porsi, status, catatan)
         VALUES (?,?,?,?,?,?,?,?)`,
        [t, dateStr, item.menu_id, menuNama, prodJenjang, jumlahPorsi, 'Direncanakan',
         'Auto-generate dari siklus: ' + siklus.nama]
      );

      created.push({ id: result.insertId, tanggal: dateStr, menu: menuNama, porsi: jumlahPorsi });
    }

    res.json({
      ok: true,
      siklus_nama: siklus.nama,
      created_count: created.length,
      skipped_count: skipped.length,
      created,
      skipped,
    });
  } catch (err) {
    console.error('Generate produksi batch error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /siklus/hitung-budget
 * Auto-kalkulasi budget dari siklus + penerima manfaat untuk periode tertentu.
 * Body: { siklus_id, periode (YYYY-MM) }
 * Membuat/update entry di tabel budget.
 */
router.post('/siklus/hitung-budget', async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const { siklus_id, periode } = req.body;
    if (!siklus_id || !periode) {
      return res.status(400).json({ error: 'siklus_id dan periode (YYYY-MM) wajib diisi' });
    }

    // Ambil siklus
    const [[siklus]] = await db.query(
      'SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?',
      [siklus_id, t]
    );
    if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

    // Hitung hari produksi dalam periode (hari kerja: Sen-Jum)
    const [y, m] = periode.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    let hariKerja = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m - 1, day);
      if (d.getDay() >= 1 && d.getDay() <= 5) hariKerja++; // Sen-Jum
    }

    const budgetJenjangList = parseKategoriPenerima(siklus.kategori_penerima);
    const budgetJenjang = budgetJenjangList[0] || ''; // Gunakan jenjang pertama untuk budget

    // Ambil harga_per_porsi dari budget yang sudah ada (jika ada)
    const [[existingBudget]] = budgetJenjang ? await db.query(
      `SELECT harga_per_porsi, biaya_operasional FROM budget
       WHERE tenant_id=? AND periode=? AND kategori_penerima=? LIMIT 1`,
      [t, periode, budgetJenjang]
    ) : [null];

    let hargaPerPorsi = existingBudget ? Number(existingBudget.harga_per_porsi) : 0;
    let biayaOperasional = existingBudget ? Number(existingBudget.biaya_operasional) : 0;

    // Jika belum ada harga, cari dari budget periode lain untuk kategori yang sama
    if (hargaPerPorsi === 0 && budgetJenjang) {
      const [[refHarga]] = await db.query(
        `SELECT harga_per_porsi FROM budget
         WHERE tenant_id=? AND kategori_penerima=? AND harga_per_porsi > 0
         ORDER BY periode DESC LIMIT 1`,
        [t, budgetJenjang]
      );
      if (refHarga) hargaPerPorsi = Number(refHarga.harga_per_porsi);
    }

    // Total penerima dari siklus
    const jumlahPorsi = Number(siklus.jumlah_porsi) || 0;
    const totalBudget = hargaPerPorsi * jumlahPorsi * hariKerja;

    // Cek apakah sudah ada entry budget untuk periode + kategori ini
    const [existingEntry] = budgetJenjang ? await db.query(
      `SELECT id FROM budget WHERE tenant_id=? AND periode=? AND kategori_penerima=?`,
      [t, periode, budgetJenjang]
    ) : [[]];

    if (existingEntry && existingEntry.length) {
      await db.query(
        `UPDATE budget SET jumlah_penerima=?, harga_per_porsi=?, total_budget=?
         WHERE id=? AND tenant_id=?`,
        [jumlahPorsi, hargaPerPorsi, totalBudget, existingEntry[0].id, t]
      );
    } else if (budgetJenjang) {
      await db.query(
        `INSERT INTO budget (tenant_id, periode, kategori_penerima, jumlah_penerima, harga_per_porsi, total_budget, biaya_operasional)
         VALUES (?,?,?,?,?,?,?)`,
        [t, periode, budgetJenjang, jumlahPorsi, hargaPerPorsi, totalBudget, biayaOperasional]
      );
    }

    res.json({
      ok: true,
      siklus_nama: siklus.nama,
      periode,
      kategori: budgetJenjang,
      jumlah_porsi: jumlahPorsi,
      harga_per_porsi: hargaPerPorsi,
      hari_kerja: hariKerja,
      total_budget: totalBudget,
      message: 'Budget ' + periode + ' untuk ' + siklus.nama + ' berhasil dihitung: Rp' + totalBudget.toLocaleString('id-ID'),
    });
  } catch (err) {
    console.error('Hitung budget error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /siklus/hitung-budget-semua
 * Auto-kalkulasi budget dari SEMUA siklus Aktif untuk periode tertentu.
 * Body: { periode (YYYY-MM) }
 */
router.post('/siklus/hitung-budget-semua', async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const { periode } = req.body;
    if (!periode) return res.status(400).json({ error: 'Periode (YYYY-MM) wajib diisi' });

    const [siklusList] = await db.query(
      'SELECT * FROM siklus_menu WHERE tenant_id=? AND status="Aktif" ORDER BY kategori_penerima',
      [t]
    );

    if (!siklusList.length) {
      return res.json({ message: 'Tidak ada siklus Aktif', created: 0 });
    }

    const [y, m] = periode.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    let hariKerja = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m - 1, day);
      if (d.getDay() >= 1 && d.getDay() <= 5) hariKerja++;
    }

    const results = [];

    // Batch-load existing budget entries for all siklus (flatten multi-jenjang)
    function flatJenjang(s) {
      const list = parseKategoriPenerima(s.kategori_penerima);
      return list.length ? list : [''];
    }
    const kategoriList = [...new Set(siklusList.flatMap(flatJenjang).filter(Boolean))];
    const [existingBudgets] = await db.query(
      `SELECT kategori_penerima, harga_per_porsi FROM budget
       WHERE tenant_id=? AND periode=? AND kategori_penerima IN (${kategoriList.map(() => '?').join(',')})`,
      [t, ...kategoriList]
    );
    const budgetPerKat = {};
    for (const b of existingBudgets) {
      budgetPerKat[b.kategori_penerima] = Number(b.harga_per_porsi);
    }

    // Batch-load reference prices for categories without existing budget
    const missingKats = kategoriList.filter(k => !budgetPerKat[k] || budgetPerKat[k] === 0);
    const refHargaMap = {};
    if (missingKats.length) {
      const [refRows] = await db.query(
        `SELECT kategori_penerima, harga_per_porsi FROM budget
         WHERE tenant_id=? AND kategori_penerima IN (${missingKats.map(() => '?').join(',')})
         AND harga_per_porsi > 0 ORDER BY periode DESC`,
        [t, ...missingKats]
      );
      for (const r of refRows) {
        if (!refHargaMap[r.kategori_penerima]) {
          refHargaMap[r.kategori_penerima] = Number(r.harga_per_porsi);
        }
      }
    }

    // Batch-load existing entry IDs
    const [existingEntries] = await db.query(
      `SELECT id, kategori_penerima FROM budget
       WHERE tenant_id=? AND periode=? AND kategori_penerima IN (${kategoriList.map(() => '?').join(',')})`,
      [t, ...kategoriList]
    );
    const existingEntryMap = {};
    for (const e of existingEntries) {
      existingEntryMap[e.kategori_penerima] = e.id;
    }

    for (const siklus of siklusList) {
      const katList = parseKategoriPenerima(siklus.kategori_penerima);
      const kat = katList[0] || '';
      let hargaPerPorsi = budgetPerKat[kat] || 0;
      if (hargaPerPorsi === 0) {
        hargaPerPorsi = refHargaMap[kat] || 0;
      }

      const jumlahPorsi = Number(siklus.jumlah_porsi) || 0;
      const totalBudget = hargaPerPorsi * jumlahPorsi * hariKerja;

      if (existingEntryMap[kat]) {
        await db.query(
          `UPDATE budget SET jumlah_penerima=?, harga_per_porsi=?, total_budget=?
           WHERE id=? AND tenant_id=?`,
          [jumlahPorsi, hargaPerPorsi, totalBudget, existingEntryMap[kat], t]
        );
      } else {
        await db.query(
          `INSERT INTO budget (tenant_id, periode, kategori_penerima, jumlah_penerima, harga_per_porsi, total_budget, biaya_operasional)
           VALUES (?,?,?,?,?,?,?)`,
          [t, periode, kat, jumlahPorsi, hargaPerPorsi, totalBudget, 0]
        );
      }

      results.push({
        siklus: siklus.nama,
        kategori: kat,
        porsi: jumlahPorsi,
        harga: hargaPerPorsi,
        budget: totalBudget,
      });
    }

    const grandTotal = results.reduce((s, r) => s + r.budget, 0);
    res.json({
      ok: true,
      periode,
      hari_kerja: hariKerja,
      total_siklus: siklusList.length,
      total_budget: grandTotal,
      results,
      message: 'Budget ' + periode + ' untuk ' + siklusList.length + ' siklus berhasil dihitung: Rp' + grandTotal.toLocaleString('id-ID'),
    });
  } catch (err) {
    console.error('Hitung budget semua error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /siklus/buat-pr
 * Auto-buat Purchase Request dari total kebutuhan bahan untuk periode tertentu.
 * Body: { periode (YYYY-MM), siklus_ids (optional, array) }
 * Membuat entry di purchase_request.
 */
router.post('/siklus/buat-pr', async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const { periode, siklus_ids } = req.body;
    if (!periode) return res.status(400).json({ error: 'Periode (YYYY-MM) wajib diisi' });

    // Ambil siklus yang akan diproses
    let siklusList;
    if (siklus_ids && siklus_ids.length) {
      const ph = siklus_ids.map(() => '?').join(',');
      [siklusList] = await db.query(
        `SELECT * FROM siklus_menu WHERE tenant_id=? AND id IN (${ph})`,
        [t, ...siklus_ids]
      );
    } else {
      [siklusList] = await db.query(
        'SELECT * FROM siklus_menu WHERE tenant_id=? AND status="Aktif" ORDER BY kategori_penerima',
        [t]
      );
    }

    if (!siklusList.length) {
      return res.status(404).json({ error: 'Tidak ada siklus ditemukan' });
    }

    // Filter hari ke
    const hariMulai = parseInt(req.body.hari_mulai) || 1;
    const hariSelesai = parseInt(req.body.hari_selesai) || 999;
    let totalHariIncluded = 0;

    // Ambil total penerima manfaat per kategori (real-time)
    const [pmByJenjang] = await db.query(
      `SELECT COALESCE(kategori_penerima, 'Lainnya') AS jenjang,
              COALESCE(SUM(paket_besar + paket_kecil), 0) AS total_penerima
       FROM penerima_manfaat WHERE tenant_id=?
       GROUP BY kategori_penerima`,
      [t]
    );

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
      if (!pmMap[display]) pmMap[display] = { total_penerima: 0 };
      pmMap[display].total_penerima += Number(p.total_penerima);
    }

    // SP Referensi Bahan untuk BDD override
    const [spRefList] = await db.query(
      'SELECT nama, bdd_persen FROM sp_referensi_bahan WHERE tenant_id=?',
      [t]
    );
    const spRefByName = {};
    for (const r of spRefList) {
      const key = r.nama.trim().toLowerCase();
      spRefByName[key] = Math.round(Number(r.bdd_persen || 0) * 100);
    }

    // Hitung hari kerja dalam periode
    const [y, m] = periode.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    let hariKerja = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m - 1, day);
      if (d.getDay() >= 1 && d.getDay() <= 5) hariKerja++;
    }

    // Kumpulkan semua siklus data (per hari per siklus)
    const agg = {};
    let hasItems = false;

    for (const s of siklusList) {
      const siklusId = s.id;
      const kategoriPenerima = s.kategori_penerima || '';
      const displayJenjang = dbToDisplay[kategoriPenerima] || kategoriPenerima;
      const penerimaCount = Number(s.jumlah_porsi) || pmMap[displayJenjang]?.total_penerima || 0;
      if (!penerimaCount) continue;

      // PR mengikuti durasi siklus (tanpa ekstrapolasi bulanan)
      const multiplier = 1;

      // --- A. Menu-based ingredients ---
      const [items] = await db.query(
        `SELECT si.* FROM siklus_menu_item si
         WHERE si.siklus_id=? AND si.menu_id IS NOT NULL
         AND si.hari_ke BETWEEN ? AND ?`,
        [siklusId, hariMulai, hariSelesai]
      );
      if (items.length) hasItems = true;

      const menuPorsiMap = {};
      for (const it of items) {
        if (!menuPorsiMap[it.menu_id]) menuPorsiMap[it.menu_id] = 0;
        menuPorsiMap[it.menu_id] += penerimaCount;
      }

      // Hitung jumlah hari unik yang di-filter
      if (items.length) {
        const hariSet = new Set(items.map(it => it.hari_ke));
        totalHariIncluded = Math.max(totalHariIncluded, hariSet.size);
      }

      const menuIds = Object.keys(menuPorsiMap);
      if (menuIds.length) {
        const mph = menuIds.map(() => '?').join(',');
        const [bahanRows] = await db.query(           `SELECT mb.bahan_baku_id, b.nama as bahan_nama, b.satuan, b.harga_satuan,
                   b.persen_bdd, b.kode, mb.jumlah, mb.menu_id, b.berat_per_satuan,
                   b.kategori_sp, b.berat_1_sp
            FROM menu_bahan mb
            JOIN bahan_baku b ON b.id = mb.bahan_baku_id
            WHERE mb.menu_id IN (${mph})`,
           menuIds
         );

         for (const br of bahanRows) {
           const porsi = menuPorsiMap[br.menu_id] || 0;
           if (!porsi) continue;
           const beratBersih = Number(br.jumlah) * porsi;
           const spRefBdd = spRefByName[(br.bahan_nama || '').trim().toLowerCase()];
           const bdd = spRefBdd || Number(br.persen_bdd) || 100;
           const beratKotor = bdd > 0 ? beratBersih / (bdd / 100) : beratBersih;

           const key = br.bahan_baku_id;
           if (!agg[key]) {
             agg[key] = { bahan_baku_id: br.bahan_baku_id, bahan_nama: br.bahan_nama, kode: br.kode || '', satuan: br.satuan, harga_satuan: Number(br.harga_satuan) || 0, berat_per_satuan: Number(br.berat_per_satuan) || 0, berat_1_sp: Number(br.berat_1_sp) || 0, kategori_sp: br.kategori_sp, total_qty: 0 };
           }
           agg[key].total_qty += beratKotor * multiplier;
         }
      }

      // --- B. Grid-based ingredients (siklus_menu_item_bahan) ---
      // Hanya dipakai jika siklus ini TIDAK punya menu (resep)
      // Jika sudah ada menu → bahan dihitung dari menu_bahan (akurat)
      // Grid SP hanya fallback untuk siklus tanpa menu
      if (items.length === 0) {
        const [gridBahanRaw] = await db.query(           `SELECT smib.hari_ke, smib.kategori_sp, smib.bahan_baku_id,
                   bb.nama as bahan_nama, bb.satuan, bb.harga_satuan, bb.persen_bdd, bb.berat_1_sp,
                   bb.kode, bb.berat_per_satuan, bb.kategori_sp AS bb_kategori_sp
            FROM siklus_menu_item_bahan smib
            JOIN bahan_baku bb ON bb.id=smib.bahan_baku_id
            WHERE smib.siklus_id=? AND smib.hari_ke BETWEEN ? AND ?`,
           [siklusId, hariMulai, hariSelesai]
         );

         if (gridBahanRaw.length) {
           hasItems = true;

           const [spRows] = await db.query(
             'SELECT kategori_sp, sp_value FROM standar_sp WHERE jenjang=?',
             [kategoriPenerima]
           );
          const spMap = {};
          for (const sr of spRows) spMap[sr.kategori_sp] = Number(sr.sp_value);

          const cellCount = {};
          for (const gb of gridBahanRaw) {
            const cellKey = gb.hari_ke + '-' + gb.kategori_sp;
            if (!cellCount[cellKey]) cellCount[cellKey] = 0;
            cellCount[cellKey]++;
          }

          for (const gb of gridBahanRaw) {
            const spVal = spMap[gb.kategori_sp] || 0;
            const berat1Sp = Number(gb.berat_1_sp || 0);
            const jumlahPorsi = penerimaCount;
            if (spVal <= 0 || berat1Sp <= 0 || jumlahPorsi <= 0) continue;

            const cellKey = gb.hari_ke + '-' + gb.kategori_sp;
            const bagi = cellCount[cellKey] || 1;
            const spPerBahan = spVal / bagi;
            const beratBersih = berat1Sp * spPerBahan * jumlahPorsi;
            const spRefBdd = spRefByName[(gb.bahan_nama || '').trim().toLowerCase()];
            const bdd = spRefBdd || Number(gb.persen_bdd || 100);
            const beratKotor = bdd > 0 ? beratBersih / (bdd / 100) : beratBersih;

            const key = gb.bahan_baku_id;             if (!agg[key]) {
               agg[key] = { bahan_baku_id: gb.bahan_baku_id, bahan_nama: gb.bahan_nama, kode: gb.kode || '', satuan: gb.satuan, harga_satuan: Number(gb.harga_satuan) || 0, berat_per_satuan: Number(gb.berat_per_satuan) || 0, berat_1_sp: Number(gb.berat_1_sp) || 0, kategori_sp: gb.bb_kategori_sp, total_qty: 0 };
             }
            agg[key].total_qty += beratKotor * multiplier;
          }
        }
      }
    }

    if (!hasItems) {
      return res.status(400).json({ error: 'Tidak ada menu terisi di siklus yang dipilih' });
    }

    // Ambil id_koperasi & buffer_persen untuk mapping
    const bahanIds = Object.keys(agg);
    const idKoperasiMap = {};
    const bufferPersenMap = {};
    if (bahanIds.length) {
      const [rows] = await db.query(
        `SELECT id, id_koperasi, COALESCE(buffer_persen, 10) AS buffer_persen FROM bahan_baku WHERE id IN (${bahanIds.map(() => '?').join(',')}) AND tenant_id=?`,
        [...bahanIds, t]
      );
      for (const r of rows) {
        idKoperasiMap[r.id] = r.id_koperasi;
        bufferPersenMap[r.id] = Number(r.buffer_persen) || 10;
      }
    }     // Format output dengan buffer dan konversi satuan
     const bahanList = Object.values(agg).map(b => {
       let qty = b.total_qty;
       let satuan = b.satuan;
       let harga = b.harga_satuan;
       const satuanAsli = (b.satuan || '').toLowerCase();        const isGramSatuan = ['gram', 'g', 'gr', 'kg'].includes(satuanAsli);

         if (isGramSatuan) {
           // Satuan gram/kg → konversi ke kg
           qty = qty / 1000;
           satuan = 'kg';
         } else {
           // Non-gram (Pcs, Karton, Botol, pack, dll) → hitung qty, pertahankan satuan asli
           const perUnitBerat = Number(b.berat_per_satuan) > 0
             ? Number(b.berat_per_satuan)
             : (Number(b.berat_1_sp) || 0);
           if (perUnitBerat > 0) {
             qty = Math.round(qty / perUnitBerat);
             // satuan tetap asli (Pcs, Karton, Botol, dll)
           } else {
             qty = Math.round(qty / 1000 * 100) / 100;
             satuan = 'kg';
           }
         }

        // Jika satuan display berubah ke kg (non-gram → kg), konversi harga
        if (satuan === 'kg' && b.berat_per_satuan > 0 && !['gram', 'g', 'gr', 'kg'].includes(satuanAsli)) {
          harga = b.harga_satuan / (b.berat_per_satuan / 1000);
        }
      const bp = bufferPersenMap[b.bahan_baku_id] || 10;
      const buffer = Math.round(qty * (1 + bp / 100) * 100) / 100;
      return {
        bahan_baku_id: b.bahan_baku_id,
        id_koperasi: idKoperasiMap[b.bahan_baku_id] || null,
        nama: b.bahan_nama,
        kode: b.kode || '',
        satuan,
        total_qty: Math.round(qty * 100) / 100,
        buffer_10: buffer,
        harga_satuan: Math.round(harga * 100) / 100,
        estimated_subtotal: Math.round(buffer * harga),
      };
    }).sort((a, b) => b.total_qty - a.total_qty);

    const totalEstimated = bahanList.reduce((s, i) => s + i.estimated_subtotal, 0);

    // Cek budget untuk periode ini
    let budgetWarning = null;
    const [budgetRows] = await db.query(
      'SELECT kategori_penerima, total_budget, realisasi FROM budget WHERE tenant_id=? AND periode=?',
      [t, periode]
    );
    if (budgetRows.length) {
      const totalBudget = budgetRows.reduce((s, b) => s + Number(b.total_budget || 0), 0);
      const totalRealisasi = budgetRows.reduce((s, b) => s + Number(b.realisasi || 0), 0);
      const sisaBudget = totalBudget - totalRealisasi;
      if (totalEstimated > sisaBudget) {
        budgetWarning = {
          total_budget: totalBudget,
          total_realisasi: totalRealisasi,
          sisa_budget: sisaBudget,
          estimated_total: totalEstimated,
          defisit: totalEstimated - sisaBudget,
          message: 'Estimasi PR (Rp ' + Number(totalEstimated).toLocaleString('id-ID') + ') melebihi sisa budget (Rp ' + Number(sisaBudget).toLocaleString('id-ID') + ') periode ' + periode,
        };
      }
    }

    // Buat PR
    const noPR = 'PR-' + periode + '-' + String(Date.now()).slice(-4);
    const itemJson = JSON.stringify(bahanList.map(b => ({
      bahan_baku_id: b.bahan_baku_id,
      id_koperasi: b.id_koperasi,
      kode: b.kode,
      nama: b.nama,
      qty: b.buffer_10,
      satuan: b.satuan,
      harga: b.harga_satuan,
      subtotal: b.estimated_subtotal,
    })));

    // Simpan ke purchase_order dengan prefix PR-
    const [result] = await db.query(
      `INSERT INTO purchase_order (tenant_id, no_po, tanggal, supplier_nama, item, total_nilai, status, catatan)
       VALUES (?,?,?,?,?,?,?,?)`,
      [t, noPR, periode + '-01', 'Auto PR Siklus', itemJson, totalEstimated, 'Draft',
       'Auto-generated dari siklus: ' + siklusList.map(s => s.nama).join(', ')]
    );

    res.json({
      ok: true,
      id: result.insertId,
      no_pr: noPR,
      item_count: bahanList.length,
      total_estimated: totalEstimated,
      total_hari: totalHariIncluded,
      hari_mulai: hariMulai,
      hari_selesai: hariSelesai,
      items: bahanList.map(b => ({
        nama: b.nama,
        total_qty: b.total_qty,
        buffer_10: b.buffer_10,
        satuan: b.satuan,
        harga_satuan: b.harga_satuan,
        subtotal: b.estimated_subtotal,
      })),
      siklus: siklusList.map(s => s.nama),
      budget_warning: budgetWarning,
      message: 'PR ' + noPR + ' berhasil dibuat dengan ' + bahanList.length + ' item bahan' + (totalHariIncluded ? ' untuk ' + totalHariIncluded + ' hari produksi' : '') + (budgetWarning ? ' (⚠️ ' + budgetWarning.message + ')' : ''),
    });
  } catch (err) {
    console.error('Buat PR error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;