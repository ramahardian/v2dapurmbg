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
      _validation: { level: 'no_siklus', message: 'Belum ada siklus aktif', detail: 'Buat siklus baru dengan status Aktif untuk menampilkan perencanaan kebutuhan pangan.' }
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

  // PM totals — split paket_besar and paket_kecil
  const [pmRows] = await db.query(
    `SELECT COALESCE(kategori_penerima, 'Lainnya') AS jenjang, COALESCE(SUM(paket_besar),0) AS paket_besar, COALESCE(SUM(paket_kecil),0) AS paket_kecil FROM penerima_manfaat WHERE tenant_id=? GROUP BY kategori_penerima`,
    [req.user.tenant_id]
  );
  const pmByDb = {},
        pmBesarByDb = {},
        pmKecilByDb = {};
  for (const p of pmRows) {
    pmByDb[p.jenjang] = Number(p.paket_besar) + Number(p.paket_kecil);
    pmBesarByDb[p.jenjang] = Number(p.paket_besar);
    pmKecilByDb[p.jenjang] = Number(p.paket_kecil);
  }
  const pmByDisplay = {},
        pmByDisplayBesar = {},
        pmByDisplayKecil = {};
  for (const [dbJenjang, total] of Object.entries(pmByDb)) {
    const display = dbToDisplay[dbJenjang] || dbJenjang;
    pmByDisplay[display] = (pmByDisplay[display] || 0) + total;
    pmByDisplayBesar[display] = (pmByDisplayBesar[display] || 0) + (pmBesarByDb[dbJenjang] || 0);
    pmByDisplayKecil[display] = (pmByDisplayKecil[display] || 0) + (pmKecilByDb[dbJenjang] || 0);
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

  // Helper: build siklus data for a given PM count
  function buildSiklusData(jmlPm) {
    const siklusData = [];
    for (const s of siklusList) {
      const allItems = itemsBySiklus[s.id] || [];
      const menuItems = allItems.filter(it => it.menu_id);
      const gridItems = allItems.filter(it => !it.menu_id);
      const gridBahan = gridBahanBySiklus[s.id] || [];
      const hasMenuItems = menuItems.length > 0;
      const hasGridItems = gridBahan.length > 0;
      if (!hasMenuItems && !hasGridItems) continue;

      const dayData = [];
      const processedDays = new Set();

      for (const it of menuItems) {
        processedDays.add(it.hari_ke);
        const bahanRows = menuBahanMap[it.menu_id] || [];
        const bahanItems = bahanRows.map(br => {
          const ref = spRefMap[br.nama] || {};
          const persenBdd = ref.bdd_persen || Number(br.persen_bdd) || 100;
          const beratBersih = Number(br.jumlah) * jmlPm;
          const beratKotor = hitungBDD(beratBersih, persenBdd);
          return { bahan_baku_id: br.bahan_baku_id, nama: br.nama, nama_display: br.nama, satuan: br.satuan, kategori_sp: br.kategori_sp, persen_bdd: persenBdd, berat_bersih: Math.round(beratBersih * 100) / 100, berat_kotor: Math.round(beratKotor * 100) / 100, kebutuhan_kg: Math.round((beratKotor / 1000) * 100) / 100 };
        });
        dayData.push({ hari_ke: it.hari_ke, hari_nama: it.hari_nama, menu_nama: it.menu_nama || '-', menu_label: 'Menu', bahan: bahanItems });
      }

      for (const g of gridBahan) {
        const hk = g.hari_ke;
        const gridItem = gridItems.find(it => it.hari_ke === hk);
        const hariNama = gridItem ? gridItem.hari_nama : 'Hari ' + hk;
        const menuNama = gridItem ? (gridItem.menu_nama || '-') : '-';
        const persenBdd = Number(g.persen_bdd || 100);
        const beratBersih = Number(g.berat_1_sp || 0) * jmlPm;
        const beratKotor = hitungBDD(beratBersih, persenBdd);
        const label = processedDays.has(hk) ? 'Bahan Tambahan' : 'Menu';

        if (!processedDays.has(hk)) {
          dayData.push({ hari_ke: hk, hari_nama: hariNama, menu_nama: menuNama, menu_label: label, bahan: [] });
          processedDays.add(hk);
        }
        const dayEntry = dayData.find(d => d.hari_ke === hk);
        if (dayEntry) {
          dayEntry.bahan.push({ bahan_baku_id: g.bahan_baku_id, nama: g.nama, nama_display: g.nama, satuan: g.satuan || 'g', kategori_sp: g.kategori_sp, persen_bdd: persenBdd, berat_bersih: Math.round(beratBersih * 100) / 100, berat_kotor: Math.round(beratKotor * 100) / 100, kebutuhan_kg: Math.round((beratKotor / 1000) * 100) / 100 });
        }
      }
      siklusData.push({ siklus_id: s.id, siklus_nama: s.nama, hari: dayData });
    }
    return siklusData;
  }

  // Build data per jenjang — split by total, besar, kecil
  const dataByJenjang = {};
  for (const j of activeJenjang) {
    const jmlPm = pmByDisplay[j] || 0;
    const jmlBesar = pmByDisplayBesar[j] || 0;
    const jmlKecil = pmByDisplayKecil[j] || 0;
    if (!jmlPm) continue;

    const dbVals = JENJANG_DB_MAP[j] || [j];
    const spKey = dbVals.find(v => spByJenjangKat[v]) || j;
    const spTarget = spByJenjangKat[spKey] || {};

    dataByJenjang[j] = {
      jumlah_siswa: jmlPm,
      jumlah_besar: jmlBesar,
      jumlah_kecil: jmlKecil,
      sp_target: spTarget,
      siklus: buildSiklusData(jmlPm)
    };
  }

  // ── Apply overrides ──
  try {
    const [overrides] = await db.query(
      `SELECT ov.*, b.nama as new_nama
       FROM perencanaan_override ov
       LEFT JOIN bahan_baku b ON b.id = ov.new_bahan_baku_id
       WHERE ov.tenant_id=?`,
      [req.user.tenant_id]
    );
    if (overrides.length) {
      const ovMap = {};
      for (const ov of overrides) {
        const key = ov.siklus_id + '::' + ov.hari_ke + '::' + ov.jenjang + '::' + (ov.original_bahan_baku_id || '');
        ovMap[key] = ov;
      }
      for (const j of activeJenjang) {
        const jData = dataByJenjang[j];
        if (!jData) continue;
        const jmlPm = pmByDisplay[j] || 0;
        for (const sData of jData.siklus) {
          for (const day of sData.hari) {
            const newBahan = [];
            for (const b of day.bahan) {
              const key = sData.siklus_id + '::' + day.hari_ke + '::' + j + '::' + (b.bahan_baku_id || '');
              const ov = ovMap[key];
              if (ov) {
                const beratBersih = Number(ov.jumlah) * jmlPm;
                const beratKotor = hitungBDD(beratBersih, Number(ov.persen_bdd));
                newBahan.push({
                  bahan_baku_id: ov.new_bahan_baku_id,
                  nama: ov.new_nama || b.nama,
                  nama_display: ov.new_nama || b.nama,
                  overridden: true,
                  override_id: ov.id,
                  sumber_bdd: 'override',
                  satuan: b.satuan,
                  kategori_sp: b.kategori_sp,
                  persen_bdd: Number(ov.persen_bdd),
                  berat_bersih: Math.round(beratBersih * 100) / 100,
                  berat_kotor: Math.round(beratKotor * 100) / 100,
                  kebutuhan_kg: Math.round((beratKotor / 1000) * 100) / 100
                });
              } else {
                newBahan.push(b);
              }
            }
            day.bahan = newBahan;
          }
        }
      }
    }
  } catch (e) { /* table might not exist yet */ }

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
  const { tanggal_mulai, tanggal_selesai, siklus_id } = req.query;

  // Optional filter by siklus (dipakai halaman /perencanaan agar sinkron dgn filter siklus).
  // Konsisten dgn route kebutuhan-per-menu: saat siklus_id diberikan, abaikan status agar
  // siklus non-Aktif yg dipilih user tetap bisa dirender rekap + matriksnya.
  let siklusSql = 'SELECT * FROM siklus_menu WHERE tenant_id=?';
  const siklusParams = [req.user.tenant_id];
  if (siklus_id) {
    siklusSql += ' AND id=?';
    siklusParams.push(parseInt(siklus_id, 10));
  } else {
    siklusSql += ' AND status="Aktif"';
  }
  siklusSql += ' ORDER BY id';
  const [siklusList] = await db.query(siklusSql, siklusParams);

  if (!siklusList.length) {
    return res.json({
      jenjang_list: [], hari: [], pm_map: {},
      _validation: { level: 'no_siklus', message: 'Belum ada siklus aktif', detail: 'Buat siklus baru dengan status Aktif untuk menampilkan total kebutuhan pangan.' }
    });
  }

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
  // Filter by siklus target jenjang
  const siklusTargetJenjang = new Set();
  for (const s of siklusList) {
    const parsed = parseKategoriPenerima(s.kategori_penerima);
    for (const p of parsed) {
      const display = dbToDisplay[p] || p;
      siklusTargetJenjang.add(display);
    }
  }
  let activeJenjang = JENJANG_DISPLAY_ORDER.filter(j =>
    siklusTargetJenjang.has(j) && pmByDisplay[j] && pmByDisplay[j] > 0
  );

  // Fallback: if no PM match, use siklus target jenjang with default count
  if (!activeJenjang.length && siklusTargetJenjang.size) {
    const targetArr = [...siklusTargetJenjang];
    for (const j of targetArr) {
      pmByDisplay[j] = pmByDisplay[j] || 1;
    }
    activeJenjang = targetArr;
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

  // ── Load overrides for perencanaan ──
  let ovIndex = {};
  try {
    const [overrides] = await db.query(
      `SELECT ov.*, b.nama as new_nama
       FROM perencanaan_override ov
       LEFT JOIN bahan_baku b ON b.id = ov.new_bahan_baku_id
       WHERE ov.tenant_id=?`,
      [req.user.tenant_id]
    );
    for (const ov of overrides) {
      const key = ov.siklus_id + '::' + ov.hari_ke + '::' + ov.jenjang + '::' + (ov.original_bahan_baku_id || '');
      ovIndex[key] = ov;
    }
  } catch (e) { /* table might not exist */ }

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
    d.setDate(d.getDate() + 29); // default 1 bulan (30 hari)
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

    const dayPlan = { tanggal: dateStr, hari_nama: dayNames[dayOfWeek], header_tanggal: dateStr, total_porsi: 0, menu_names: [], bahan: [] };
    const bahanMap = {};

    for (const s of siklusList) {
      let siklusStart;
      if (s.tanggal_mulai) {
        siklusStart = new Date(s.tanggal_mulai);
      } else {
        siklusStart = startDate;
      }
      const diffDays = Math.floor((curDate - siklusStart) / (1000 * 60 * 60 * 24));
      const totalHari = s.total_hari || 30;
      const hariKe = diffDays + 1;
      if (hariKe < 1 || hariKe > totalHari) continue;

      const items = (itemsBySiklus[s.id] || []).filter(it => it.hari_ke === hariKe);
      if (!items.length) continue;

      for (const it of items) {
        if (it.menu_id) {
          const bahanRows = menuBahanMap[it.menu_id] || [];
          for (const br of bahanRows) {
            for (const b of activeJenjang) {
              const jmlPm = pmByDisplay[b] || Number(s.jumlah_porsi) || 0;
              if (!jmlPm) continue;

              // Check override
              const ovKey = s.id + '::' + hariKe + '::' + b + '::' + (br.bahan_baku_id || '');
              const ov = ovIndex[ovKey];

              let persenBdd, beratPerSiswa, namaDisplay;
              if (ov) {
                persenBdd = Number(ov.persen_bdd);
                beratPerSiswa = Number(ov.jumlah);
                namaDisplay = ov.new_nama || br.nama;
              } else {
                const ref = spRefMap[br.nama] || {};
                persenBdd = ref.bdd_persen || Number(br.persen_bdd) || 100;
                beratPerSiswa = Number(br.jumlah);
                namaDisplay = br.nama;
              }

              const beratKotorPerSiswa = hitungBDD(beratPerSiswa, persenBdd);
              const kebutuhanKg = Math.round((beratKotorPerSiswa * jmlPm / 1000) * 100) / 100;

              // Use namaDisplay as key so overridden items don't mix with originals in the same day
              const keyNama = ov ? (namaDisplay + '__ov') : br.nama;
              if (!bahanMap[keyNama]) bahanMap[keyNama] = { nama: namaDisplay, nama_display: namaDisplay, per_jenjang: {}, buffer_persen: Number(br.buffer_persen) || 0 };
              if (!bahanMap[keyNama].per_jenjang[b]) {
                bahanMap[keyNama].per_jenjang[b] = { kebutuhan_kg: 0, jumlah_siswa: jmlPm, berat_bersih: Math.round(beratPerSiswa * 100) / 100, persen_bdd: persenBdd, berat_kotor: Math.round(beratKotorPerSiswa * 100) / 100 };
              }
              bahanMap[keyNama].per_jenjang[b].kebutuhan_kg += kebutuhanKg;
            }
          }
        }

        dayPlan.total_porsi += Number(it.jumlah_porsi || s.jumlah_porsi || 0);
        if (it.menu_nama) dayPlan.menu_names.push(it.menu_nama);
      }

      // Grid items
      const gridBahan = gridBahanBySiklus[s.id] || [];
      const gridDay = gridBahan.filter(g => g.hari_ke === hariKe);

      for (const g of gridDay) {
        for (const b of activeJenjang) {
          const jmlPm = pmByDisplay[b] || Number(s.jumlah_porsi) || 0;
          if (!jmlPm) continue;

          // Check override
          const ovKey = s.id + '::' + hariKe + '::' + b + '::' + (g.bahan_baku_id || '');
          const ov = ovIndex[ovKey];

          let persenBdd, beratPerSiswa, namaDisplay;
          if (ov) {
            persenBdd = Number(ov.persen_bdd);
            beratPerSiswa = Number(ov.jumlah);
            namaDisplay = ov.new_nama || g.nama;
          } else {
            persenBdd = Number(g.persen_bdd || 100);
            beratPerSiswa = Number(g.berat_1_sp || 0);
            namaDisplay = g.nama;
          }

          const beratKotorPerSiswa = hitungBDD(beratPerSiswa, persenBdd);
          const kebutuhanKg = Math.round((beratKotorPerSiswa * jmlPm / 1000) * 100) / 100;

          const keyNama = ov ? (namaDisplay + '__ov') : g.nama;
          if (!bahanMap[keyNama]) bahanMap[keyNama] = { nama: namaDisplay, nama_display: namaDisplay, per_jenjang: {}, buffer_persen: Number(g.buffer_persen) || 0 };
          if (!bahanMap[keyNama].per_jenjang[b]) {
            bahanMap[keyNama].per_jenjang[b] = { kebutuhan_kg: 0, jumlah_siswa: jmlPm, berat_bersih: Math.round(beratPerSiswa * 100) / 100, persen_bdd: persenBdd, berat_kotor: Math.round(beratKotorPerSiswa * 100) / 100 };
          }
          bahanMap[keyNama].per_jenjang[b].kebutuhan_kg += kebutuhanKg;
        }
      }
    }

    dayPlan.bahan = Object.values(bahanMap);
    if (dayPlan.menu_names.length || dayPlan.bahan.length) {
      hari.push(dayPlan);
    }

    curDate.setDate(curDate.getDate() + 1);
  }

  // Filter pm_map to only include active jenjang
  const filteredPmMap = {};
  for (const j of activeJenjang) {
    if (pmByDisplay[j]) filteredPmMap[j] = pmByDisplay[j];
  }

  res.json({ jenjang_list: activeJenjang, hari, pm_map: filteredPmMap, tanggal_mulai: mulai, tanggal_selesai: selesai });
});

// ── Override CRUD ──────────────────────────────────────────────────

/**
 * POST /siklus/laporan/override
 * Save or update an override for a specific siklus+hari+jenjang+ingredient.
 * Body: { siklus_id, hari_ke, jenjang, original_bahan_baku_id, new_bahan_baku_id }
 */
router.post('/siklus/laporan/override', async (req, res) => {
  const { siklus_id, hari_ke, jenjang, original_bahan_baku_id, new_bahan_baku_id } = req.body;
  if (!siklus_id || !hari_ke || !jenjang || !new_bahan_baku_id) {
    return res.status(400).json({ error: 'siklus_id, hari_ke, jenjang, new_bahan_baku_id wajib diisi' });
  }

  // Lookup new ingredient data
  const [[bahan]] = await db.query(
    'SELECT id, nama, berat_1_sp, persen_bdd FROM bahan_baku WHERE id=? AND tenant_id=?',
    [new_bahan_baku_id, req.user.tenant_id]
  );
  if (!bahan) return res.status(404).json({ error: 'Bahan tidak ditemukan' });

  const jumlah = Number(bahan.berat_1_sp) || 0;
  const persenBdd = Number(bahan.persen_bdd) || 100;

  // Upsert override
  const origId = original_bahan_baku_id || null;
  const [existing] = await db.query(
    'SELECT id FROM perencanaan_override WHERE tenant_id=? AND siklus_id=? AND hari_ke=? AND jenjang=? AND COALESCE(original_bahan_baku_id,0)=?',
    [req.user.tenant_id, siklus_id, hari_ke, jenjang, origId || 0]
  );

  // Get original name if available
  let originalNama = null;
  if (original_bahan_baku_id) {
    const [[orig]] = await db.query('SELECT nama FROM bahan_baku WHERE id=?', [original_bahan_baku_id]);
    if (orig) originalNama = orig.nama;
  }

  if (existing.length) {
    await db.query(
      'UPDATE perencanaan_override SET new_bahan_baku_id=?, jumlah=?, persen_bdd=?, original_nama=? WHERE id=?',
      [new_bahan_baku_id, jumlah, persenBdd, originalNama, existing[0].id]
    );
  } else {
    const [r] = await db.query(
      'INSERT INTO perencanaan_override (tenant_id, siklus_id, hari_ke, jenjang, original_bahan_baku_id, original_nama, new_bahan_baku_id, jumlah, persen_bdd) VALUES (?,?,?,?,?,?,?,?,?)',
      [req.user.tenant_id, siklus_id, hari_ke, jenjang, origId, originalNama, new_bahan_baku_id, jumlah, persenBdd]
    );
    existing[0] = { id: r.insertId };
  }

  res.json({
    ok: true,
    override_id: existing[0].id,
    new_nama: bahan.nama,
    jumlah,
    persen_bdd: persenBdd,
  });
});

/**
 * GET /siklus/laporan/override
 * Get overrides for a specific siklus+hari+jenjang (all by default).
 * Query: ?siklus_id=X&hari_ke=Y&jenjang=Z
 */
router.get('/siklus/laporan/override', async (req, res) => {
  let sql = 'SELECT ov.*, b.nama as new_nama FROM perencanaan_override ov LEFT JOIN bahan_baku b ON b.id=ov.new_bahan_baku_id WHERE ov.tenant_id=?';
  const params = [req.user.tenant_id];

  if (req.query.siklus_id) { sql += ' AND ov.siklus_id=?'; params.push(parseInt(req.query.siklus_id)); }
  if (req.query.hari_ke) { sql += ' AND ov.hari_ke=?'; params.push(parseInt(req.query.hari_ke)); }
  if (req.query.jenjang) { sql += ' AND ov.jenjang=?'; params.push(req.query.jenjang); }

  sql += ' ORDER BY ov.siklus_id, ov.hari_ke, ov.jenjang';
  const [rows] = await db.query(sql, params);
  res.json(rows);
});

/**
 * DELETE /siklus/laporan/override/:id
 * Remove an override.
 */
router.delete('/siklus/laporan/override/:id', async (req, res) => {
  const [[ov]] = await db.query('SELECT id FROM perencanaan_override WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
  if (!ov) return res.status(404).json({ error: 'Override tidak ditemukan' });
  await db.query('DELETE FROM perencanaan_override WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
