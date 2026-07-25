const express = require('express');
const db = require('../../db');
const { FIXED_KATEGORI, KATEGORI_MAP_DISPLAY, mapToDisplay, hitungBDD } = require('../../services/spBddCalculator');
const { JENJANG_DISPLAY_ORDER, JENJANG_DB_MAP, KAT_ORDER, buildDbToDisplay, parseKategoriPenerima, batchLoadItems, batchLoadBahanCounts, batchLoadGridBahanBySiklus, batchLoadMenuBahan, rebuildMenuNama, hitungEstimasiGiziManual } = require('./helpers');

const router = express.Router();

/**
 * GET /siklus/laporan
 * Mengambil semua siklus dengan laporan agregat (coverage, rata-rata gizi, dll).
 */
router.get('/siklus/laporan', async (req, res) => {
  let siklusList;
  if (req.query.siklus_id) {
    [siklusList] = await db.query(
      'SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?',
      [req.query.siklus_id, req.user.tenant_id]
    );
  } else {
    [siklusList] = await db.query(
      'SELECT * FROM siklus_menu WHERE tenant_id=? ORDER BY id DESC',
      [req.user.tenant_id]
    );
  }

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

    // Hitung estimasi gizi untuk item manual
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
    ringkasan: { totalSiklus, totalHari: totalDays, totalFilled, totalKosong: totalDays - totalFilled, totalMenuUnik: allMenuSet.size, rataCoverage: totalDays ? Math.round((totalFilled / totalDays) * 100) : 0 }
  });
});

/**
 * GET /siklus/laporan/bahan
 * Rincian kebutuhan bahan baku per hari dari semua siklus.
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
        dayMap[dayKey] = { siklus_id: s.id, siklus_nama: s.nama, kategori_db: s.kategori_penerima || '-', hari_ke: it.hari_ke, hari_nama: it.hari_nama, jumlah_porsi: Number(it.jumlah_porsi) || 0, menu_ids: [] };
      }
      dayMap[dayKey].menu_ids.push(it.menu_id);
    }
  }

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
        dayRows.push({ hari_nama: day.hari_nama, hari_ke: day.hari_ke, siklus_id: day.siklus_id, siklus_nama: day.siklus_nama, kategori_db: katDb, kategori: katDisplay, bahan_id: br.bahan_baku_id, bahan_nama: br.nama, satuan: br.satuan, jumlah: beratKotor, jumlah_porsi: day.jumlah_porsi, gramasi_total: beratKotor });
      }
    }
  }

  // Aggregate
  const agg = {};
  for (const r of dayRows) {
    const key = `${r.hari_ke}|${r.hari_nama}|${r.bahan_id}|${r.kategori}`;
    if (!agg[key]) agg[key] = { ...r, jumlah: 0, gramasi_total: 0, jumlah_porsi: 0 };
    agg[key].jumlah += r.jumlah;
    agg[key].gramasi_total += r.gramasi_total;
    agg[key].jumlah_porsi += r.jumlah_porsi;
  }

  const byDay = {};
  for (const r of Object.values(agg)) {
    const dk = `${r.hari_ke}-${r.hari_nama}`;
    if (!byDay[dk]) byDay[dk] = { hari_ke: r.hari_ke, hari_nama: r.hari_nama, items: [], porsi_per_kat: {} };
    byDay[dk].items.push(r);
    byDay[dk].porsi_per_kat[r.kategori] = (byDay[dk].porsi_per_kat[r.kategori] || 0) + r.jumlah_porsi;
  }

  const result = [];
  for (const dk of Object.keys(byDay).sort((a, b) => { const [ka] = a.split('-'); const [kb] = b.split('-'); return Number(ka) - Number(kb); })) {
    const day = byDay[dk];
    const bahanGroup = {};
    for (const it of day.items) {
      if (!bahanGroup[it.bahan_nama]) bahanGroup[it.bahan_nama] = { bahan_nama: it.bahan_nama, satuan: it.satuan, per_kategori: {}, total: 0 };
      bahanGroup[it.bahan_nama].per_kategori[it.kategori] = (bahanGroup[it.bahan_nama].per_kategori[it.kategori] || 0) + it.jumlah;
      bahanGroup[it.bahan_nama].total += it.jumlah;
    }
    result.push({ hari_ke: day.hari_ke, hari_nama: day.hari_nama, label: day.hari_nama + ', ' + day.hari_ke, bahan: Object.values(bahanGroup), fixed_kategori: FIXED_KATEGORI, porsi_per_kat: day.porsi_per_kat });
  }

  res.json({ days: result, fixed_kategori: FIXED_KATEGORI, kategori_map: KATEGORI_MAP_DISPLAY });
});

/**
 * GET /siklus/laporan/bahan-per-jenjang
 * Kebutuhan bahan per menu/hari dipecah per jenjang penerima manfaat.
 */
router.get('/siklus/laporan/bahan-per-jenjang', async (req, res) => {
  const dbToDisplay = buildDbToDisplay();

  const [siklusList] = await db.query(
    'SELECT id, nama, kategori_penerima, jumlah_porsi FROM siklus_menu WHERE tenant_id=? AND status="Aktif" ORDER BY id',
    [req.user.tenant_id]
  );

  const [pmRows] = await db.query(
    `SELECT COALESCE(kategori_penerima, 'Lainnya') AS jenjang, COALESCE(SUM(paket_besar + paket_kecil),0) AS total_penerima FROM penerima_manfaat WHERE tenant_id=? GROUP BY kategori_penerima`,
    [req.user.tenant_id]
  );
  const pmByDb = {};
  for (const p of pmRows) pmByDb[p.jenjang] = Number(p.total_penerima);
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
        const beratKotor = persenBdd > 0 ? Math.round((beratBersih / (persenBdd / 100)) * 100) / 100 : beratBersih;
        const perJenjang = {};
        for (const j of activeJenjang) {
          const jml = pmByDisplay[j] || 0;
          perJenjang[j] = { jumlah: jml, kebutuhan_kg: jml > 0 ? Math.round((beratKotor * jml / 1000) * 100) / 100 : 0 };
        }
        return { nama: br.nama, satuan: br.satuan, kategori_sp: br.kategori_sp, berat_bersih: beratBersih, persen_bdd: persenBdd, berat_kotor: beratKotor, per_jenjang: perJenjang };
      });
      menus.push({ menu_ke: menuCounter, hari_ke: it.hari_ke, hari_nama: it.hari_nama, menu_nama: it.menu_nama || 'Menu ' + menuCounter, bahan: bahanList });
    }
  }

  res.json({ menus, jenjang_list: activeJenjang, penerima_manfaat: pmByDisplay });
});

/**
 * GET /siklus/:id/laporan
 * Menghasilkan kalkulasi statistik dan laporan gizi sebuah siklus.
 */
router.get('/siklus/:id/laporan', async (req, res) => {
  const [[siklus]] = await db.query('SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
  if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

  const [items] = await db.query('SELECT * FROM siklus_menu_item WHERE siklus_id=? ORDER BY hari_ke ASC', [req.params.id]);

  const totalDays = siklus.total_hari || items.length;

  const [bahanCounts] = await db.query('SELECT hari_ke, COUNT(*) as bahan_count FROM siklus_menu_item_bahan WHERE siklus_id=? GROUP BY hari_ke', [req.params.id]);
  const bahanMap = {};
  for (const bc of bahanCounts) bahanMap[bc.hari_ke] = bc.bahan_count;

  // Build grid names
  let gridNamaByHari = {};
  {
    const [gridRows] = await db.query(`SELECT sb.hari_ke, sb.kategori_sp, COALESCE(b.nama, '(bahan dihapus)') AS nama FROM siklus_menu_item_bahan sb LEFT JOIN bahan_baku b ON b.id = sb.bahan_baku_id WHERE sb.siklus_id=?`, [req.params.id]);
    for (const g of gridRows) {
      if (!gridNamaByHari[g.hari_ke]) gridNamaByHari[g.hari_ke] = [];
      gridNamaByHari[g.hari_ke].push({ kategori_sp: g.kategori_sp, nama: g.nama });
    }
  }

  for (const it of items) {
    it._has_bahan = (bahanMap[it.hari_ke] || 0) > 0;
    if (it._has_bahan && !it.menu_id) {
      if (!it.jumlah_porsi || it.jumlah_porsi === 0) it.jumlah_porsi = Number(siklus.jumlah_porsi) || 1;
      rebuildMenuNama(it, gridNamaByHari);
    }
  }

  const filledDays = items.filter(it => it.menu_id || it._has_bahan).length;
  const emptyDays = totalDays - filledDays;
  const uniqueMenus = new Set(items.filter(it => it.menu_id).map(it => it.menu_id)).size;
  const coverage = totalDays ? Math.round((filledDays / totalDays) * 100) : 0;

  // Hitung gizi untuk manual items
  const hasManualItems = items.some(it => it._has_bahan && !it.menu_id);
  if (hasManualItems) {
    const [gridBahan] = await db.query(`SELECT sb.hari_ke, b.kalori, b.protein, b.karbohidrat, b.lemak, b.serat, b.berat_1_sp FROM siklus_menu_item_bahan sb JOIN bahan_baku b ON b.id = sb.bahan_baku_id WHERE sb.siklus_id=?`, [req.params.id]);
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

  // SP Comparison
  const jenjangList = parseKategoriPenerima(siklus.kategori_penerima);
  const [spStandar] = await db.query(
    'SELECT kategori_sp, sp_value FROM standar_sp WHERE jenjang=?',
    [jenjangList[0] || '']
  );
  const spByKat = {};
  for (const s of spStandar) spByKat[s.kategori_sp] = Number(s.sp_value) || 0;

  // Collect realized SP from items
  const [menuItems] = await db.query(
    `SELECT mi.menu_id, mb.bahan_baku_id, b.kategori_sp
     FROM siklus_menu_item mi
     JOIN menu_bahan mb ON mb.menu_id = mi.menu_id
     JOIN bahan_baku b ON b.id = mb.bahan_baku_id
     WHERE mi.siklus_id=? AND mi.menu_id IS NOT NULL`,
    [req.params.id]
  );
  const realizedSp = {};
  for (const mi of menuItems) {
    const kat = mi.kategori_sp || 'Lainnya';
    realizedSp[kat] = (realizedSp[kat] || 0) + 1;
  }

  // Also count from grid items
  const [gridItems] = await db.query(
    `SELECT sb.kategori_sp, COUNT(DISTINCT sb.bahan_baku_id) as cnt
     FROM siklus_menu_item_bahan sb
     JOIN siklus_menu_item si ON si.siklus_id = sb.siklus_id AND si.hari_ke = sb.hari_ke
     WHERE sb.siklus_id=? AND si.menu_id IS NULL
     GROUP BY sb.kategori_sp`,
    [req.params.id]
  );
  for (const gi of gridItems) {
    realizedSp[gi.kategori_sp] = (realizedSp[gi.kategori_sp] || 0) + Number(gi.cnt);
  }

  const spComparison = [];
  for (const kat of KAT_ORDER) {
    const target = spByKat[kat] || 0;
    const realized = realizedSp[kat] || 0;
    const selisih = realized - target;
    const persen = target > 0 ? Math.round((realized / target) * 100) : 0;
    spComparison.push({ kategori: kat, target, realized, selisih, persen });
  }

  const stats = { totalDays, filledDays, emptyDays, uniqueMenus, coverage, totals, avg };
  res.json({ siklus, stats, items, spComparison });
});

/**
 * GET /siklus/laporan/siklus-menu
 * Material requirement report per food category and jenjang.
 */
router.get('/siklus/laporan/siklus-menu', async (req, res) => {
  const dbToDisplay = buildDbToDisplay();

  const [siklusList] = await db.query(
    'SELECT id, nama, kategori_penerima, jumlah_porsi FROM siklus_menu WHERE tenant_id=? AND status="Aktif" ORDER BY id',
    [req.user.tenant_id]
  );

  const [pmRows] = await db.query(
    `SELECT kategori_penerima, COALESCE(SUM(paket_besar + paket_kecil),0) AS total FROM penerima_manfaat WHERE tenant_id=? GROUP BY kategori_penerima`,
    [req.user.tenant_id]
  );
  const pmByDb = {};
  for (const p of pmRows) pmByDb[p.kategori_penerima] = Number(p.total);
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

  // Aggregate by ingredient + kategori
  const agg = {};
  for (const s of siklusList) {
    const items = (itemsBySiklus[s.id] || []).filter(it => it.menu_id);
    for (const it of items) {
      const bahanRows = menuBahanMap[it.menu_id] || [];
      for (const br of bahanRows) {
        const katDb = br.kategori_penerima || s.kategori_penerima || '-';
        const katDisplay = dbToDisplay[katDb] || katDb;
        const key = `${br.bahan_baku_id}|${katDisplay}`;
        if (!agg[key]) agg[key] = { bahan_id: br.bahan_baku_id, bahan_nama: br.nama, satuan: br.satuan, per_jenjang: {} };
        for (const j of activeJenjang) {
          if (!agg[key].per_jenjang[j]) agg[key].per_jenjang[j] = { total_berat: 0 };
          const jml = pmByDisplay[j] || 0;
          const beratKotor = hitungBDD(Number(br.jumlah) * jml, br.persen_bdd);
          agg[key].per_jenjang[j].total_berat += beratKotor;
        }
      }
    }
  }

  const rows = Object.values(agg).map(r => ({
    ...r,
    grand_total: Object.values(r.per_jenjang).reduce((sum, p) => sum + p.total_berat, 0),
  }));

  res.json({ rows, jenjang_list: activeJenjang, penerima_manfaat: pmByDisplay });
});

/**
 * GET /siklus/laporan/menu-harian
 * Daily breakdown of ingredients within each menu cycle.
 */
router.get('/siklus/laporan/menu-harian', async (req, res) => {
  let siklusList;
  if (req.query.siklus_id) {
    [siklusList] = await db.query(
      'SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?',
      [req.query.siklus_id, req.user.tenant_id]
    );
  } else {
    [siklusList] = await db.query(
      'SELECT * FROM siklus_menu WHERE tenant_id=? ORDER BY id DESC',
      [req.user.tenant_id]
    );
  }

  const siklusIds = siklusList.map(s => s.id);
  const itemsBySiklus = await batchLoadItems(siklusIds);
  const gridBahanBySiklus = await batchLoadGridBahanBySiklus(siklusIds);
  const allMenuIds = [...new Set(Object.values(itemsBySiklus).flatMap(arr => arr.filter(it => it.menu_id).map(it => it.menu_id)))];
  const menuBahanMap = await batchLoadMenuBahan(allMenuIds);

  const KAT_DISPLAY = { 'Karbohidrat': 'Karbo', 'Protein Hewani': 'ProHe', 'Protein Nabati': 'ProNa', 'Sayur': 'Sayur', 'Buah': 'Buah', 'Susu': 'Susu', 'Minyak': 'Minyak' };

  const result = [];
  for (const s of siklusList) {
    const items = itemsBySiklus[s.id] || [];
    const gridBahan = gridBahanBySiklus[s.id] || [];
    const gridByDayKat = {};
    for (const g of gridBahan) {
      const key = `${g.hari_ke}::${g.kategori_sp}`;
      if (!gridByDayKat[key]) gridByDayKat[key] = [];
      gridByDayKat[key].push(g);
    }

    const days = items.map(it => {
      const menuBahan = menuBahanMap[it.menu_id] || [];
      const byKat = {};
      for (const mb of menuBahan) {
        const kat = mb.kategori_sp || 'Lainnya';
        if (!byKat[kat]) byKat[kat] = [];
        byKat[kat].push(mb);
      }
      // Grid-based ingredients
      for (const [key, bahanList] of Object.entries(gridByDayKat)) {
        const [hk, kat] = key.split('::');
        if (Number(hk) === it.hari_ke) {
          if (!byKat[kat]) byKat[kat] = [];
          byKat[kat].push(...bahanList);
        }
      }

      return {
        hari_ke: it.hari_ke,
        hari_nama: it.hari_nama,
        menu_nama: it.menu_nama,
        bahan_by_kat: Object.entries(byKat).map(([kat, items]) => ({
          kategori: KAT_DISPLAY[kat] || kat,
          items: items.map(b => ({ nama: b.nama, jumlah: Number(b.jumlah || 0), satuan: b.satuan })),
        })),
      };
    });

    result.push({ id: s.id, nama: s.nama, total_hari: s.total_hari, status: s.status, days });
  }

  res.json(result);
});

/**
 * GET /siklus/:id/laporan/produksi-harian
 * Daily production report for a given menu cycle.
 */
router.get('/siklus/:id/laporan/produksi-harian', async (req, res) => {
  const [[siklus]] = await db.query('SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
  if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

  const [items] = await db.query('SELECT * FROM siklus_menu_item WHERE siklus_id=? ORDER BY hari_ke ASC', [req.params.id]);

  // Get grid bahan
  const [gridBahan] = await db.query(
    `SELECT sb.hari_ke, sb.kategori_sp, sb.bahan_baku_id, b.nama, b.satuan, b.berat_1_sp, b.persen_bdd, b.kategori_sp as b_kat_sp, COALESCE(b.berat_per_satuan, 0) AS berat_per_satuan, COALESCE(b.buffer_persen, 0) AS buffer_persen
     FROM siklus_menu_item_bahan sb
     LEFT JOIN bahan_baku b ON b.id = sb.bahan_baku_id
     WHERE sb.siklus_id=?`,
    [req.params.id]
  );
  const gridByDay = {};
  for (const g of gridBahan) {
    if (!gridByDay[g.hari_ke]) gridByDay[g.hari_ke] = [];
    gridByDay[g.hari_ke].push(g);
  }

  // Determine jumlah_porsi from siklus header or penerima_manfaat
  const jenjangList = parseKategoriPenerima(siklus.kategori_penerima);
  let jumlahPorsi = Number(siklus.jumlah_porsi) || 0;
  if (!jumlahPorsi && jenjangList.length) {
    const dbToDisplay = buildDbToDisplay();
    const allDbVals = [...new Set(jenjangList.flatMap(j => JENJANG_DB_MAP[j] || Object.entries(JENJANG_DB_MAP).find(([,v]) => v.includes(j))?.[1] || [j]))];
    if (allDbVals.length) {
      const ph = allDbVals.map(() => '?').join(',');
      const [[{ total }]] = await db.query(`SELECT COALESCE(SUM(paket_besar + paket_kecil),0) AS total FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima IN (${ph})`, [req.user.tenant_id, ...allDbVals]);
      jumlahPorsi = Number(total) || 0;
    }
  }

  // SP values
  const [spStandar] = await db.query('SELECT kategori_sp, sp_value FROM standar_sp WHERE jenjang=?', [jenjangList[0] || '']);
  const spMap = {};
  for (const s of spStandar) spMap[s.kategori_sp] = Number(s.sp_value) || 1;

  // Menu bahan lookup
  const allMenuIds = [...new Set(items.filter(it => it.menu_id).map(it => it.menu_id))];
  const menuBahanMap = await batchLoadMenuBahan(allMenuIds);

  const days = items.map(it => {
    const menuBahan = menuBahanMap[it.menu_id] || [];
    const dayGrid = gridByDay[it.hari_ke] || [];

    const bahanByKat = {};
    // Menu-based
    for (const mb of menuBahan) {
      const kat = mb.kategori_sp || 'Lainnya';
      if (!bahanByKat[kat]) bahanByKat[kat] = [];
      const beratBersih = Number(mb.jumlah) * jumlahPorsi;
      const beratKotor = hitungBDD(beratBersih, mb.persen_bdd);
      bahanByKat[kat].push({ nama: mb.nama, satuan: mb.satuan, kategori_sp: kat, persen_bdd: mb.persen_bdd, berat_1_sp: mb.berat_1_sp, berat_per_satuan: Number(mb.berat_per_satuan) || 0, buffer_persen: Number(mb.buffer_persen) || 0, keterangan: mb.keterangan || '', berat_bersih: Math.round(beratBersih * 100) / 100, berat_kotor: Math.round(beratKotor * 100) / 100, kebutuhan_kg: Math.round((beratKotor / 1000) * 100) / 100 });
    }
    // Grid-based
    for (const g of dayGrid) {
      const kat = g.kategori_sp || 'Lainnya';
      if (!bahanByKat[kat]) bahanByKat[kat] = [];
      const beratBersih = Number(g.berat_1_sp || 0) * jumlahPorsi;
      const beratKotor = hitungBDD(beratBersih, g.persen_bdd);
      bahanByKat[kat].push({ nama: g.nama, satuan: g.satuan, kategori_sp: kat, persen_bdd: g.persen_bdd, berat_1_sp: Number(g.berat_1_sp) || 0, berat_per_satuan: Number(g.berat_per_satuan) || 0, buffer_persen: Number(g.buffer_persen) || 0, berat_bersih: Math.round(beratBersih * 100) / 100, berat_kotor: Math.round(beratKotor * 100) / 100, kebutuhan_kg: Math.round((beratKotor / 1000) * 100) / 100 });
    }

    const dayBahanList = Object.entries(bahanByKat).map(([kat, list]) => ({ kategori: kat, items: list }));
    const dayTotalKg = dayBahanList.reduce((s, g) => s + g.items.reduce((s2, i) => s2 + Number(i.kebutuhan_kg), 0), 0);
    return {
      hari_ke: it.hari_ke,
      hari_nama: it.hari_nama,
      menu_nama: it.menu_nama || 'Menu Hari ' + it.hari_ke,
      jumlah_porsi: jumlahPorsi,
      total_kebutuhan_kg: Math.round(dayTotalKg * 100) / 100,
      bahan_by_kat: dayBahanList,
      sp_target: KAT_ORDER.reduce((acc, k) => { acc[k] = spMap[k] || 0; return acc; }, {}),
    };
  });

  const hariTerisi = items.filter(it => it.menu_id).length;
  const totalKebutuhanKg = days.reduce((s, d) => s + (d.total_kebutuhan_kg || 0), 0);

  res.json({
    siklus: { id: siklus.id, nama: siklus.nama, status: siklus.status, total_hari: siklus.total_hari, jumlah_porsi: jumlahPorsi, kategori_penerima: siklus.kategori_penerima },
    ringkasan: { total_hari: siklus.total_hari, hari_terisi: hariTerisi, total_penerima: jumlahPorsi, total_kebutuhan_kg: Math.round(totalKebutuhanKg * 100) / 100 },
    days,
  });
});

module.exports = router;
