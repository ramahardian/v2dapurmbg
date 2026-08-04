const express = require('express');
const path = require('path');
const ExcelJS = require('exceljs');
const db = require('../../db');
const { hitungBDD } = require('../../services/spBddCalculator');
const { JENJANG_DISPLAY_ORDER, JENJANG_DB_MAP, KAT_ORDER, buildDbToDisplay, parseKategoriPenerima, expandJenjangToDbValues, batchLoadItems, batchLoadMenuBahan, batchLoadGridBahanBySiklus, loadMenuBahanByName, lookupMenuIdByName, resolveGridBeratPerSiswa } = require('./helpers');

const router = express.Router();

// ── Helper: sinkronkan total porsi dgn jumlah_porsi tersimpan di siklus ──
// /menu menampilkan siklus.jumlah_porsi (tersimpan). Agar /total-kebutuhan dan
// /perencanaan konsisten, total porsi live (dari penerima_manfaat) diskala
// proporsional per jenjang sehingga total = SUM(jumlah_porsi) siklus terpilih/aktif.
function syncPorsiDenganSiklus(siklusList, activeJenjang, pmByDisplay, pmBesar, pmKecil) {
  const storedTotal = siklusList.reduce((sum, s) => sum + (Number(s.jumlah_porsi) || 0), 0);
  if (storedTotal <= 0) return; // tidak ada acuan tersimpan → pakai live PM
  const liveTotal = activeJenjang.reduce((sum, j) => sum + (Number(pmByDisplay[j]) || 0), 0);
  if (liveTotal <= 0) return;
  const factor = storedTotal / liveTotal;
  const scaled = {};
  let acc = 0;
  for (const j of activeJenjang) {
    if (pmByDisplay[j] === undefined || pmByDisplay[j] === null) continue;
    scaled[j] = Math.round(Number(pmByDisplay[j]) * factor);
    acc += scaled[j];
  }
  // Koreksi selisih pembulatan pada jenjang pertama agar total selalu pas
  const diff = storedTotal - acc;
  for (const j of activeJenjang) {
    if (scaled[j] === undefined) continue;
    scaled[j] += diff;
    break;
  }
  for (const j of activeJenjang) {
    if (scaled[j] === undefined) continue;
    const oldVal = Number(pmByDisplay[j]) || 0;
    pmByDisplay[j] = scaled[j];
    // Ikutkan skala ke pecahan besar/kecil agar jumlah_besar + jumlah_kecil = jumlah_siswa
    if (pmBesar && pmKecil && oldVal > 0) {
      const bf = scaled[j] / oldVal;
      const nb = Math.round((Number(pmBesar[j]) || 0) * bf);
      const nk = Math.round((Number(pmKecil[j]) || 0) * bf);
      pmBesar[j] = nb;
      pmKecil[j] = nk + (scaled[j] - (nb + nk)); // jaga besar+kecil = total
    }
  }
}

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

  // Sinkronkan total porsi dgn jumlah_porsi tersimpan siklus (konsisten dgn /menu)
  syncPorsiDenganSiklus(siklusList, activeJenjang, pmByDisplay, pmByDisplayBesar, pmByDisplayKecil);

  // SP referensi
  let spRefMap = {};
  try {
    const [refs] = await db.query('SELECT nama, bdd_persen, berat_bersih FROM sp_referensi_bahan WHERE tenant_id=?', [req.user.tenant_id]);
    for (const r of refs) spRefMap[r.nama] = { bdd_persen: Math.round(Number(r.bdd_persen) * 100) || 100, berat_bersih: Number(r.berat_bersih) || 0 };
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
  // Item tanpa menu_id tapi menu_nama cocok dgn menu → ikuti resep menu (live)
  const { menuIdByName, menuBahanByNameMap } = await loadMenuBahanByName(itemsBySiklus, req.user.tenant_id);

  // Helper: build siklus data for a given PM count
  function buildSiklusData(jmlPm) {
    const siklusData = [];
    for (const s of siklusList) {
      const allItems = itemsBySiklus[s.id] || [];
      const menuItems = allItems.filter(it => lookupMenuIdByName(menuIdByName, it));
      const gridItems = allItems.filter(it => !lookupMenuIdByName(menuIdByName, it));
      const gridBahan = gridBahanBySiklus[s.id] || [];
      const hasMenuItems = menuItems.length > 0;
      const hasGridItems = gridBahan.length > 0;
      if (!hasMenuItems && !hasGridItems) continue;

      const dayData = [];
      const processedDays = new Set();

      const coveredBahan = new Set();
      for (const it of menuItems) {
        processedDays.add(it.hari_ke);
        const matchedMenuId = lookupMenuIdByName(menuIdByName, it);
        const bahanRows = (it.menu_id ? menuBahanMap : menuBahanByNameMap)[matchedMenuId] || [];
        for (const br of bahanRows) coveredBahan.add(it.hari_ke + '::' + (br.bahan_baku_id || ''));
        const bahanItems = bahanRows.map(br => {
          const resolved = resolveGridBeratPerSiswa(br, spRefMap);
          const beratBersih = resolved.beratPerSiswa * jmlPm;
          const beratKotor = hitungBDD(beratBersih, resolved.persenBdd);
          return { bahan_baku_id: br.bahan_baku_id, nama: br.nama, nama_display: br.nama, satuan: br.satuan, kategori_sp: br.kategori_sp, persen_bdd: resolved.persenBdd, berat_bersih: Math.round(beratBersih * 100) / 100, berat_kotor: Math.round(beratKotor * 100) / 100, kebutuhan_kg: Math.round((beratKotor / 1000) * 100) / 100 };
        });
        dayData.push({ hari_ke: it.hari_ke, hari_nama: it.hari_nama, menu_nama: it.menu_nama || '-', menu_label: 'Menu', bahan: bahanItems });
      }

      for (const g of gridBahan) {
        const hk = g.hari_ke;
        if (coveredBahan.has(hk + '::' + (g.bahan_baku_id || ''))) continue; // sudah dihitung dari resep menu
        const gridItem = gridItems.find(it => it.hari_ke === hk);
        const hariNama = gridItem ? gridItem.hari_nama : 'Hari ' + hk;
        const menuNama = gridItem ? (gridItem.menu_nama || '-') : '-';
        const { beratPerSiswa: berat1sp, persenBdd } = resolveGridBeratPerSiswa(g, spRefMap);
        const beratBersih = berat1sp * jmlPm;
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
 * buildPerencanaanData
 * Generate comprehensive daily planning data (perencanaan final) untuk siklus
 * aktif/terpilih. Dipakai bersama oleh endpoint JSON dan export XLSX.
 */
async function buildPerencanaanData({ tenant_id, query }) {
  const dbToDisplay = buildDbToDisplay();
  const { tanggal_mulai, tanggal_selesai, siklus_id } = query || {};

  // Optional filter by siklus (dipakai halaman /perencanaan agar sinkron dgn filter siklus).
  // Konsisten dgn route kebutuhan-per-menu: saat siklus_id diberikan, abaikan status agar
  // siklus non-Aktif yg dipilih user tetap bisa dirender rekap + matriksnya.
  let siklusSql = 'SELECT * FROM siklus_menu WHERE tenant_id=?';
  const siklusParams = [tenant_id];
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
    [tenant_id]
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

  // Sinkronkan total porsi dgn jumlah_porsi tersimpan siklus (konsisten dgn /menu)
  syncPorsiDenganSiklus(siklusList, activeJenjang, pmByDisplay);

  // SP referensi
  let spRefMap = {};
  try {
    const [refs] = await db.query('SELECT nama, bdd_persen, berat_bersih FROM sp_referensi_bahan WHERE tenant_id=?', [tenant_id]);
    for (const r of refs) spRefMap[r.nama] = { bdd_persen: Math.round(Number(r.bdd_persen) * 100) || 100, berat_bersih: Number(r.berat_bersih) || 0 };
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
  // Item tanpa menu_id tapi menu_nama cocok dgn menu → ikuti resep menu (live)
  const { menuIdByName, menuBahanByNameMap } = await loadMenuBahanByName(itemsBySiklus, tenant_id);

  // ── Load overrides for perencanaan ──
  let ovIndex = {};
  try {
    const [overrides] = await db.query(
      `SELECT ov.*, b.nama as new_nama
       FROM perencanaan_override ov
       LEFT JOIN bahan_baku b ON b.id = ov.new_bahan_baku_id
       WHERE ov.tenant_id=?`,
      [tenant_id]
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

      const coveredBahan = new Set();
      for (const it of items) {
        const matchedMenuId = lookupMenuIdByName(menuIdByName, it);
        if (matchedMenuId) {
          const bahanRows = (it.menu_id ? menuBahanMap : menuBahanByNameMap)[matchedMenuId] || [];
          for (const br of bahanRows) {
            coveredBahan.add(String(br.bahan_baku_id));
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
                const resolved = resolveGridBeratPerSiswa(br, spRefMap);
                persenBdd = resolved.persenBdd;
                beratPerSiswa = resolved.beratPerSiswa;
                namaDisplay = br.nama;
              }

              const beratKotorPerSiswa = hitungBDD(beratPerSiswa, persenBdd);
              const kebutuhanKg = Math.round((beratKotorPerSiswa * jmlPm / 1000) * 100) / 100;

              // Use namaDisplay as key so overridden items don't mix with originals in the same day
              const keyNama = ov ? (namaDisplay + '__ov') : br.nama;
              if (!bahanMap[keyNama]) bahanMap[keyNama] = { nama: namaDisplay, nama_display: namaDisplay, per_jenjang: {}, buffer_persen: Number(br.buffer_persen) || 0, satuan: br.satuan || '', kategori_sp: br.kategori_sp || '', keterangan: br.keterangan || '', berat_per_satuan: Number(br.berat_per_satuan) || 0, harga_satuan: Number(br.harga_satuan) || 0 };
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
        if (coveredBahan.has(String(g.bahan_baku_id))) continue; // sudah dihitung dari resep menu
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
            const resolved = resolveGridBeratPerSiswa(g, spRefMap);
            persenBdd = resolved.persenBdd;
            beratPerSiswa = resolved.beratPerSiswa;
            namaDisplay = g.nama;
          }

          const beratKotorPerSiswa = hitungBDD(beratPerSiswa, persenBdd);
          const kebutuhanKg = Math.round((beratKotorPerSiswa * jmlPm / 1000) * 100) / 100;

          const keyNama = ov ? (namaDisplay + '__ov') : g.nama;
          if (!bahanMap[keyNama]) bahanMap[keyNama] = { nama: namaDisplay, nama_display: namaDisplay, per_jenjang: {}, buffer_persen: Number(g.buffer_persen) || 0, satuan: g.satuan || '', kategori_sp: g.kategori_sp || '', keterangan: '', berat_per_satuan: Number(g.berat_per_satuan) || 0, harga_satuan: Number(g.harga_satuan) || 0 };
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

  const totalPorsi = Object.values(filteredPmMap).reduce((s, v) => s + (Number(v) || 0), 0);
  return { jenjang_list: activeJenjang, hari, pm_map: filteredPmMap, tanggal_mulai: mulai, tanggal_selesai: selesai, total_porsi: totalPorsi };
}

/**
 * GET /siklus/laporan/perencanaan
 * Generate comprehensive daily planning report for active siklus.
 */
router.get('/siklus/laporan/perencanaan', async (req, res) => {
  try {
    const data = await buildPerencanaanData({ tenant_id: req.user.tenant_id, query: req.query });
    res.json(data);
  } catch (err) {
    console.error('Perencanaan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Helpers export XLSX Perencanaan Final ────────────────────────────
const TK_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const TK_JENJANG = ['TK/PAUD', 'SD/MI (1-3)', 'SD/MI (4-6)', 'SMP/MTs, SMA/SMK', 'Bumil/Busui', 'Balita'];

function tkFmtTanggal(headerTanggal, hariNama) {
  const p = String(headerTanggal || '').split('-');
  const dd = parseInt(p[2], 10);
  const mm = parseInt(p[1], 10) - 1;
  if (p.length !== 3 || isNaN(dd) || isNaN(mm) || !TK_BULAN[mm]) return headerTanggal || (hariNama || '');
  return (hariNama || '') + ', ' + dd + ' ' + TK_BULAN[mm] + ' ' + p[0];
}

/**
 * GET /siklus/laporan/perencanaan/export
 * Export Perencanaan Final (kebutuhan bahan per hari) memakai template
 * public/template/FINAL-PERENCANAAN.xlsx. Semua hari berurutan dalam satu
 * sheet: judul + header kolom di atas, lalu blok per hari (label tanggal +
 * baris bahan) ditumpuk ke bawah.
 */
router.get('/siklus/laporan/perencanaan/export', async (req, res) => {
  try {
    const data = await buildPerencanaanData({ tenant_id: req.user.tenant_id, query: req.query });
    const days = (data.hari || []).filter(d => d.bahan && d.bahan.length);
    if (!days.length) return res.status(400).json({ error: 'Tidak ada data perencanaan untuk diexport. Isi menu & bahan siklus terlebih dahulu.' });

    const totalPorsi = Number(data.total_porsi) || 0;

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(__dirname, '..', '..', 'public', 'template', 'FINAL-PERENCANAAN.xlsx'));
    const ws = wb.getWorksheet('Format Final');
    if (!ws) throw new Error('Template FINAL-PERENCANAAN.xlsx tidak memiliki sheet "Format Final"');

    // Capture styles template
    const cap = (r, c) => { const cell = ws.getCell(r, c); return { style: cell.style, numFmt: cell.numFmt }; };
    const dateStyle = cap(3, 1);
    const dataRowStyles = [];
    for (let c = 1; c <= 11; c++) dataRowStyles.push({ even: cap(4, c), odd: cap(5, c) });

    // Bersihkan baris contoh (row 3 s/d 5) termasuk merge label tanggal
    try { ws.unMergeCells('A3:K3'); } catch (e) { /* ignore */ }
    for (let r = 3; r <= 5; r++) {
      for (let c = 1; c <= 11; c++) {
        const cell = ws.getCell(r, c);
        cell.value = null;
        cell.style = {};
      }
    }

    const put = (r, c, v, styleObj, numFmt) => {
      const cell = ws.getCell(r, c);
      cell.value = v;
      if (styleObj) cell.style = JSON.parse(JSON.stringify(styleObj));
      if (numFmt) cell.numFmt = numFmt;
    };
    const merge = (r1, c1, r2, c2) => { try { ws.mergeCells(r1, c1, r2, c2); } catch (e) {} };

    let row = 3;
    for (let d = 0; d < days.length; d++) {
      const day = days[d];

      // ── Label tanggal hari ──
      const label = tkFmtTanggal(day.header_tanggal, day.hari_nama);
      for (let c = 1; c <= 11; c++) put(row, c, label, dateStyle.style);
      merge(row, 1, row, 11);
      row++;

      // ── Baris bahan ──
      const colTotal = {};
      let grandKg = 0;
      let grandBuffer = 0;
      for (let bi = 0; bi < day.bahan.length; bi++) {
        const b = day.bahan[bi];
        const st = (bi % 2 === 0) ? dataRowStyles.map(x => x.even) : dataRowStyles.map(x => x.odd);
        const pj = b.per_jenjang || {};
        let rowKg = 0;
        for (let jc = 0; jc < TK_JENJANG.length; jc++) {
          const jn = TK_JENJANG[jc];
          const v = Number((pj[jn] || {}).kebutuhan_kg) || 0;
          rowKg += v;
          colTotal[jn] = (colTotal[jn] || 0) + v;
          put(row, jc + 2, v, st[jc + 1].style, '0.00');
        }
        const bufferPersen = Number(b.buffer_persen) || 0;
        const bufferKg = Math.round(rowKg * (1 + bufferPersen / 100) * 100) / 100;
        grandKg += rowKg;
        grandBuffer += bufferKg;

        put(row, 1, b.nama_display || b.nama || '', st[0].style);
        put(row, 8, totalPorsi, st[7].style);
        put(row, 9, Math.round(rowKg * 100) / 100, st[8].style, '0.00');
        put(row, 10, bufferKg, st[9].style, '0.00');
        put(row, 11, '', st[10].style);
        row++;
      }

      // ── Baris total per hari ──
      const tStyle = dataRowStyles.map(x => x.even);
      for (let c = 1; c <= 11; c++) put(row, c, null, tStyle[c - 1].style);
      const fontBold = { bold: true };
      put(row, 1, 'TOTAL', { ...tStyle[0].style, font: { ...(tStyle[0].style.font || {}), bold: true } });
      for (let jc = 0; jc < TK_JENJANG.length; jc++) {
        put(row, jc + 2, Math.round((colTotal[TK_JENJANG[jc]] || 0) * 100) / 100, { ...tStyle[jc + 1].style, font: { ...(tStyle[jc + 1].style.font || {}), bold: true } }, '0.00');
      }
      put(row, 8, totalPorsi, { ...tStyle[7].style, font: { ...(tStyle[7].style.font || {}), bold: true } });
      put(row, 9, Math.round(grandKg * 100) / 100, { ...tStyle[8].style, font: { ...(tStyle[8].style.font || {}), bold: true } }, '0.00');
      put(row, 10, Math.round(grandBuffer * 100) / 100, { ...tStyle[9].style, font: { ...(tStyle[9].style.font || {}), bold: true } }, '0.00');
      put(row, 11, '', { ...tStyle[10].style, font: { ...(tStyle[10].style.font || {}), bold: true } });
      row++;
    }

    const mulai = data.tanggal_mulai || '';
    const selesai = data.tanggal_selesai || '';
    const fileTag = mulai && selesai && mulai !== selesai ? mulai + '_' + selesai : (mulai || new Date().toISOString().slice(0, 10));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="FINAL-PERENCANAAN-' + fileTag + '.xlsx"');
    await wb.xlsx.write(res);
  } catch (err) {
    console.error('Export Perencanaan Final error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
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
