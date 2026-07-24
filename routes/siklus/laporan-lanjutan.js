const express = require('express');
const db = require('../../db');
const { hitungBDD } = require('../../services/spBddCalculator');
const { JENJANG_DISPLAY_ORDER, JENJANG_DB_MAP, KAT_ORDER, buildDbToDisplay, parseKategoriPenerima, expandJenjangToDbValues, batchLoadItems, batchLoadMenuBahan, batchLoadGridBahanBySiklus } = require('./helpers');

const router = express.Router();

/**
 * GET /siklus/laporan/kebutuhan-per-menu
 * Calculate required ingredients per menu for different beneficiary groups.
 */
router.get('/siklus/laporan/kebutuhan-per-menu', async (req, res) => {
  const dbToDisplay = buildDbToDisplay();

  // Determine which siklus to use
  const siklusIdParam = req.query.siklus_id ? parseInt(req.query.siklus_id) : null;
  let siklusList;
  if (siklusIdParam) {
    const [rows] = await db.query('SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?', [siklusIdParam, req.user.tenant_id]);
    siklusList = rows;
  } else {
    [siklusList] = await db.query('SELECT * FROM siklus_menu WHERE tenant_id=? AND status="Aktif" ORDER BY id', [req.user.tenant_id]);
  }

  if (!siklusList.length) {
    return res.json({
      siklus_list: [], jenjang_list: [], data: [],
      _validation: { level: 'no_siklus', message: 'Belum ada siklus aktif. Buat siklus terlebih dahulu di menu Siklus.', detail: 'Siklus dengan status Aktif diperlukan untuk menampilkan perencanaan kebutuhan pangan.' }
    });
  }

  // Collect target jenjang from siklus (hanya yang dipilih di data siklus)
  const siklusTargetJenjang = new Set();
  for (const s of siklusList) {
    const parsed = parseKategoriPenerima(s.kategori_penerima);
    for (const p of parsed) {
      const display = dbToDisplay[p] || p;
      siklusTargetJenjang.add(display);
    }
  }

  // Validasi: siklus belum punya target penerima
  if (!siklusTargetJenjang.size) {
    const siklusNames = siklusList.map(s => s.nama).join(', ');
    return res.json({
      siklus_list: siklusList, jenjang_list: [], data: [],
      _validation: { level: 'no_target', message: 'Siklus belum memiliki target penerima manfaat', detail: 'Edit siklus "' + siklusNames + '" untuk memilih kategori penerima (TK/PAUD, SD, SMP, dll).' }
    });
  }

  // PM totals
  const [pmRows] = await db.query(
    `SELECT COALESCE(kategori_penerima, 'Lainnya') AS jenjang, COALESCE(SUM(paket_besar + paket_kecil),0) AS total FROM penerima_manfaat WHERE tenant_id=? GROUP BY kategori_penerima`,
    [req.user.tenant_id]
  );
  const pmByDb = {};
  for (const p of pmRows) pmByDb[p.jenjang] = Number(p.total);
  const pmByDisplay = {};
  for (const [dbJenjang, total] of Object.entries(pmByDb)) {
    const display = dbToDisplay[dbJenjang] || dbJenjang;
    pmByDisplay[display] = (pmByDisplay[display] || 0) + total;
  }

  // Hanya tampilkan jenjang yang: ada di siklus target DAN punya penerima manfaat
  const activeJenjang = JENJANG_DISPLAY_ORDER.filter(j =>
    siklusTargetJenjang.has(j) && pmByDisplay[j] && pmByDisplay[j] > 0
  );

  // Validasi: target siklus tidak cocok dengan penerima manfaat
  if (!activeJenjang.length) {
    const targetList = [...siklusTargetJenjang].join(', ');
    return res.json({
      siklus_list: siklusList, jenjang_list: [], data: [],
      _validation: {
        level: 'no_pm_match',
        message: 'Target penerima di siklus tidak memiliki data penerima manfaat',
        detail: 'Siklus menargetkan: ' + targetList + '. Pastikan data penerima manfaat untuk jenjang tersebut sudah diisi di menu Master Data → Penerima Manfaat.'
      }
    });
  }

  // SP referensi
  let spRefMap = {};
  try {
    const [refs] = await db.query('SELECT nama, bdd_persen, berat_bersih FROM sp_referensi_bahan WHERE tenant_id=?', [req.user.tenant_id]);
    for (const r of refs) spRefMap[r.nama] = { bdd_persen: Number(r.bdd_persen) || 100, berat_bersih: Number(r.berat_bersih) || 0 };
  } catch (e) { /* table optional */ }

  // Standar SP
  const [spStandar] = await db.query('SELECT DISTINCT jenjang, kategori_sp, sp_value FROM standar_sp');
  const spByJenjangKat = {};
  for (const s of spStandar) {
    if (!spByJenjangKat[s.jenjang]) spByJenjangKat[s.jenjang] = {};
    spByJenjangKat[s.jenjang][s.kategori_sp] = Number(s.sp_value) || 0;
  }

  const siklusIds = siklusList.map(s => s.id);
  const itemsBySiklus = await batchLoadItems(siklusIds);
  const allMenuIds = [...new Set(Object.values(itemsBySiklus).flatMap(arr => arr.filter(it => it.menu_id).map(it => it.menu_id)))];
  const menuBahanMap = await batchLoadMenuBahan(allMenuIds);
  const gridBahanBySiklus = await batchLoadGridBahanBySiklus(siklusIds);

  // Build data per jenjang
  const dataByJenjang = {};
  for (const j of activeJenjang) {
    const jmlPm = pmByDisplay[j] || 0;
    if (!jmlPm) continue;

    const dbVals = JENJANG_DB_MAP[j] || [j];
    // Find matching sp key
    const spKey = dbVals.find(v => spByJenjangKat[v]) || j;
    const spTarget = spByJenjangKat[spKey] || {};

    const siklusData = [];
    for (const s of siklusList) {
      const items = (itemsBySiklus[s.id] || []).filter(it => it.menu_id);
      if (!items.length) continue;

      const dayData = [];
      for (const it of items) {
        const bahanRows = menuBahanMap[it.menu_id] || [];
        const bahanItems = bahanRows.map(br => {
          const ref = spRefMap[br.nama] || {};
          const persenBdd = ref.bdd_persen || Number(br.persen_bdd) || 100;
          const beratBersih = Number(br.jumlah) * jmlPm;
          const beratKotor = hitungBDD(beratBersih, persenBdd);
          return { nama: br.nama, nama_display: br.nama, satuan: br.satuan, kategori_sp: br.kategori_sp, persen_bdd: persenBdd, berat_bersih: Math.round(beratBersih * 100) / 100, berat_kotor: Math.round(beratKotor * 100) / 100, kebutuhan_kg: Math.round((beratKotor / 1000) * 100) / 100 };
        });
        dayData.push({ hari_ke: it.hari_ke, hari_nama: it.hari_nama, menu_nama: it.menu_nama || '-', menu_label: 'Menu', bahan: bahanItems });
      }

      // Add grid-based items
      const gridBahan = gridBahanBySiklus[s.id] || [];
      const gridByDay = {};
      for (const g of gridBahan) {
        if (!gridByDay[g.hari_ke]) gridByDay[g.hari_ke] = [];
        gridByDay[g.hari_ke].push(g);
      }

      siklusData.push({ siklus_id: s.id, siklus_nama: s.nama, hari: dayData, grid_days: Object.entries(gridByDay).map(([hk, items]) => ({ hari_ke: Number(hk), bahan: items.map(g => ({ nama: g.nama, kategori_sp: g.kategori_sp, kebutuhan_kg: Math.round(((Number(g.berat_1_sp || 0) * jmlPm * (100 / (Number(g.persen_bdd) || 100))) / 1000) * 100) / 100 })) })) });
    }

    dataByJenjang[j] = { jumlah_siswa: jmlPm, sp_target: spTarget, siklus: siklusData };
  }

  // Convert to sorted array for frontend
  const dataArray = JENJANG_DISPLAY_ORDER
    .filter(j => dataByJenjang[j])
    .map(j => ({ jenjang: j, ...dataByJenjang[j] }));

  res.json({ siklus_list: siklusList, selected_siklus_id: siklusIdParam, jenjang_list: activeJenjang, data: dataArray });
});

/**
 * GET /siklus/laporan/perencanaan
 * Generate comprehensive daily planning report for active siklus.
 */
router.get('/siklus/laporan/perencanaan', async (req, res) => {
  const dbToDisplay = buildDbToDisplay();
  const { tanggal_mulai, tanggal_selesai } = req.query;

  const [siklusList] = await db.query(
    'SELECT * FROM siklus_menu WHERE tenant_id=? AND status="Aktif" ORDER BY id',
    [req.user.tenant_id]
  );

  if (!siklusList.length) return res.json({ jenjang_list: [], hari: [], pm_map: {} });

  // PM totals
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

  // SP referensi
  let spRefMap = {};
  try {
    const [refs] = await db.query('SELECT nama, bdd_persen, berat_bersih FROM sp_referensi_bahan WHERE tenant_id=?', [req.user.tenant_id]);
    for (const r of refs) spRefMap[r.nama] = { bdd_persen: Number(r.bdd_persen) || 100, berat_bersih: Number(r.berat_bersih) || 0 };
  } catch (e) { /* table optional */ }

  // Standar SP
  const [spStandar] = await db.query('SELECT DISTINCT jenjang, kategori_sp, sp_value FROM standar_sp');
  const spByJenjangKat = {};
  for (const s of spStandar) {
    if (!spByJenjangKat[s.jenjang]) spByJenjangKat[s.jenjang] = {};
    spByJenjangKat[s.jenjang][s.kategori_sp] = Number(s.sp_value) || 0;
  }

  const siklusIds = siklusList.map(s => s.id);
  const itemsBySiklus = await batchLoadItems(siklusIds);
  const allMenuIds = [...new Set(Object.values(itemsBySiklus).flatMap(arr => arr.filter(it => it.menu_id).map(it => it.menu_id)))];
  const menuBahanMap = await batchLoadMenuBahan(allMenuIds);
  const gridBahanBySiklus = await batchLoadGridBahanBySiklus(siklusIds);

  // Determine date range
  let mulai = tanggal_mulai || null;
  let selesai = tanggal_selesai || null;

  if (!mulai) {
    // Get earliest tanggal_mulai from active siklus
    for (const s of siklusList) {
      if (s.tanggal_mulai) {
        if (!mulai || s.tanggal_mulai < mulai) mulai = s.tanggal_mulai;
      }
    }
    if (!mulai) {
      // Fallback: use current date
      const now = new Date();
      mulai = now.toISOString().split('T')[0];
    }
  }

  if (!selesai) {
    const d = new Date(mulai);
    d.setDate(d.getDate() + 30);
    selesai = d.toISOString().split('T')[0];
  }

  // Generate daily plan
  const hari = [];
  const startDate = new Date(mulai);
  const endDate = new Date(selesai);
  const curDate = new Date(startDate);

  while (curDate <= endDate) {
    const dateStr = curDate.toISOString().split('T')[0];
    const dayOfWeek = curDate.getDay(); // 0=Sun, 1=Mon, ...
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    // For each siklus, determine which hari_ke maps to this date
    const dayPlan = { tanggal: dateStr, hari_nama: dayNames[dayOfWeek], total_porsi: 0, menu: [], bahan_by_jenjang: {} };

    for (const s of siklusList) {
      if (!s.tanggal_mulai) continue;
      const siklusStart = new Date(s.tanggal_mulai);
      const diffDays = Math.floor((curDate - siklusStart) / (1000 * 60 * 60 * 24));
      const hariKe = (diffDays % (s.total_hari || 7)) + 1;

      // Find items for this hari_ke
      const items = (itemsBySiklus[s.id] || []).filter(it => it.hari_ke === hariKe);
      if (!items.length) continue;

      for (const it of items) {
        if (it.menu_id) {
          const bahanRows = menuBahanMap[it.menu_id] || [];
          for (const br of bahanRows) {
            const katDb = br.kategori_penerima || s.kategori_penerima || '-';
            const katDisplay = dbToDisplay[katDb] || katDb;
            if (!dayPlan.bahan_by_jenjang[katDisplay]) dayPlan.bahan_by_jenjang[katDisplay] = {};

            for (const b of activeJenjang) {
              const jmlPm = pmByDisplay[b] || 0;
              if (!jmlPm) continue;
              const ref = spRefMap[br.nama] || {};
              const persenBdd = ref.bdd_persen || Number(br.persen_bdd) || 100;
              const beratBersih = Number(br.jumlah) * jmlPm;
              const beratKotor = hitungBDD(beratBersih, persenBdd);

              if (!dayPlan.bahan_by_jenjang[katDisplay][br.nama]) {
                dayPlan.bahan_by_jenjang[katDisplay][br.nama] = { satuan: br.satuan, total_kg: 0 };
              }
              dayPlan.bahan_by_jenjang[katDisplay][br.nama].total_kg += Math.round((beratKotor / 1000) * 100) / 100;
            }
          }
        }

        dayPlan.total_porsi += Number(it.jumlah_porsi || 0);
        if (it.menu_nama) dayPlan.menu.push(it.menu_nama);
      }

      // Grid items
      const gridBahan = gridBahanBySiklus[s.id] || [];
      const gridDay = gridBahan.filter(g => g.hari_ke === hariKe);

      for (const g of gridDay) {
        for (const b of activeJenjang) {
          const jmlPm = pmByDisplay[b] || 0;
          if (!jmlPm) continue;
          if (!dayPlan.bahan_by_jenjang[b]) dayPlan.bahan_by_jenjang[b] = {};
          const persenBdd = Number(g.persen_bdd || 100);
          const beratKotor = hitungBDD(Number(g.berat_1_sp || 0) * jmlPm, persenBdd);
          if (!dayPlan.bahan_by_jenjang[b][g.nama]) {
            dayPlan.bahan_by_jenjang[b][g.nama] = { satuan: g.satuan, total_kg: 0 };
          }
          dayPlan.bahan_by_jenjang[b][g.nama].total_kg += Math.round((beratKotor / 1000) * 100) / 100;
        }
      }
    }

    if (dayPlan.menu.length || Object.keys(dayPlan.bahan_by_jenjang).length) {
      hari.push(dayPlan);
    }

    curDate.setDate(curDate.getDate() + 1);
  }

  res.json({ jenjang_list: activeJenjang, hari, pm_map: pmByDisplay, tanggal_mulai: mulai, tanggal_selesai: selesai });
});

module.exports = router;
