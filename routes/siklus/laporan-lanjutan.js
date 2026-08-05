const express = require('express');
const path = require('path');
const ExcelJS = require('exceljs');
const db = require('../../db');
const { hitungBDD } = require('../../services/spBddCalculator');
const { JENJANG_DISPLAY_ORDER, JENJANG_DB_MAP, KAT_ORDER, buildDbToDisplay, parseKategoriPenerima, expandSiklusTargetJenjang, buildPmDisplayMaps, expandJenjangToDbValues, batchLoadItems, batchLoadMenuBahan, batchLoadGridBahanBySiklus, loadMenuBahanByName, lookupMenuIdByName, resolveGridBeratPerSiswa } = require('./helpers');

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

  // Collect target jenjang from siklus (hanya yang dipilih di data siklus).
  // 'Posyandu' dipecah menjadi Bumil/Busui + Balita.
  const siklusTargetJenjang = new Set();
  for (const s of siklusList) {
    for (const p of expandSiklusTargetJenjang(parseKategoriPenerima(s.kategori_penerima))) {
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
  // Pecah kategori 'Posyandu' (paket besar = Bumil/Busui, paket kecil = Balita)
  const { pmByDisplay, pmByDisplayBesar, pmByDisplayKecil } = buildPmDisplayMaps(pmRows);

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

  // PM totals — split paket_besar & paket_kecil; kategori 'Posyandu' dipecah
  // menjadi Bumil/Busui (paket besar) + Balita (paket kecil).
  const [pmRows] = await db.query(
    `SELECT COALESCE(kategori_penerima, 'Lainnya') AS jenjang,
            COALESCE(SUM(paket_besar),0) AS paket_besar,
            COALESCE(SUM(paket_kecil),0) AS paket_kecil
     FROM penerima_manfaat WHERE tenant_id=? GROUP BY kategori_penerima`,
    [tenant_id]
  );
  const { pmByDisplay, pmByDisplayBesar, pmByDisplayKecil } = buildPmDisplayMaps(pmRows);
  // Filter by siklus target jenjang — 'Posyandu' dipecah menjadi Bumil/Busui + Balita
  const siklusTargetJenjang = new Set();
  for (const s of siklusList) {
    for (const p of expandSiklusTargetJenjang(parseKategoriPenerima(s.kategori_penerima))) {
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
  const syncInfo = (() => {
    const storedTotal = siklusList.reduce((sum, s) => sum + (Number(s.jumlah_porsi) || 0), 0);
    const pmTotal = activeJenjang.reduce((sum, j) => sum + (Number(pmByDisplay[j]) || 0), 0);
    let factor = null;
    if (storedTotal > 0 && pmTotal > 0) factor = Math.round((storedTotal / pmTotal) * 100) / 100;
    return {
      stored_total: storedTotal,
      pm_total: pmTotal,
      factor,
      inflating: factor !== null && factor > 1.2,
    };
  })();
  syncPorsiDenganSiklus(siklusList, activeJenjang, pmByDisplay, pmByDisplayBesar, pmByDisplayKecil);

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

  // Determine date range — pakai tanggal lokal (YYYY-MM-DD) agar label tanggal
  // tidak bergeser akibat konversi zona waktu UTC vs lokal pada tanggal_mulai.
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const parseYmd = s => {
    const p = String(s || '').split('-').map(Number);
    return (p.length === 3 && !isNaN(p[0]) && !isNaN(p[1]) && !isNaN(p[2])) ? new Date(p[0], p[1] - 1, p[2]) : null;
  };

  let mulaiStr = tanggal_mulai ? String(tanggal_mulai).slice(0, 10) : '';
  let selesaiStr = tanggal_selesai ? String(tanggal_selesai).slice(0, 10) : '';

  if (!mulaiStr) {
    // Get earliest tanggal_mulai from active siklus
    for (const s of siklusList) {
      if (s.tanggal_mulai) {
        const sd = ymd(new Date(s.tanggal_mulai));
        if (!mulaiStr || sd < mulaiStr) mulaiStr = sd;
      }
    }
    if (!mulaiStr) {
      // Fallback: use current date
      mulaiStr = ymd(new Date());
    }
  }

  const mulai = parseYmd(mulaiStr);
  if (!selesaiStr) {
    const d = new Date(mulai);
    d.setDate(d.getDate() + 29); // default 1 bulan (30 hari)
    selesaiStr = ymd(d);
  }
  const selesai = parseYmd(selesaiStr);

  // Generate daily plan
  const hari = [];
  const startDate = new Date(mulai);
  const endDate = new Date(selesai);
  const curDate = new Date(startDate);

  while (curDate <= endDate) {
    const dateStr = ymd(curDate);
    const dayOfWeek = curDate.getDay(); // 0=Sun, 1=Mon, ...
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    const dayPlan = { tanggal: dateStr, hari_nama: dayNames[dayOfWeek], header_tanggal: dateStr, total_porsi: 0, menu_names: [], bahan: [] };
    const bahanMap = {};

    for (const s of siklusList) {
      let siklusStart;
      if (s.tanggal_mulai) {
        siklusStart = parseYmd(ymd(new Date(s.tanggal_mulai)));
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
  const totalBesar = activeJenjang.reduce((s, j) => s + (Number(pmByDisplayBesar[j]) || 0), 0);
  const totalKecil = activeJenjang.reduce((s, j) => s + (Number(pmByDisplayKecil[j]) || 0), 0);
  return { jenjang_list: activeJenjang, hari, pm_map: filteredPmMap, tanggal_mulai: mulaiStr, tanggal_selesai: selesaiStr, total_porsi: totalPorsi, total_besar: totalBesar, total_kecil: totalKecil, sync: syncInfo };
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

/**
 * GET /siklus/laporan/kebutuhan-pangan/export
 * Export Perhitungan Kebutuhan Pangan per hari (format contoh:
 * MENU | Bahan Pangan | Berat Bersih (gram) | Persen BDD | Berat Kotor (gram) |
 * Jumlah <kategori> | Kebutuhan Bahan Pangan (kg)) dalam satu workbook berisi
 * 4 sheet: Bumil Busui, Balita, Porsi Besar, Porsi Kecil.
 */
router.get('/siklus/laporan/kebutuhan-pangan/export', async (req, res) => {
  try {
    const data = await buildPerencanaanData({ tenant_id: req.user.tenant_id, query: req.query });
    const days = (data.hari || []).filter(d => d.bahan && d.bahan.length);
    if (!days.length) return res.status(400).json({ error: 'Tidak ada data kebutuhan pangan untuk diexport. Isi menu & bahan siklus terlebih dahulu.' });

    const pm = data.pm_map || {};
    const refJenjang = (data.jenjang_list && data.jenjang_list[0]) || null;
    const totalBesar = Number(data.total_besar) || 0;
    const totalKecil = Number(data.total_kecil) || 0;

    // ── Definisi 4 sheet ──
    const sheets = [
      { name: 'Bumil Busui', title: 'Perhitungan Kebutuhan Pangan Bumil Busui', jumlahLabel: 'Jumlah Bumil Busui', count: Number(pm['Bumil/Busui']) || 0, mode: 'jenjang', jenjang: 'Bumil/Busui' },
      { name: 'Balita', title: 'Perhitungan Kebutuhan Pangan Balita', jumlahLabel: 'Jumlah Balita', count: Number(pm['Balita']) || 0, mode: 'jenjang', jenjang: 'Balita' },
      { name: 'Porsi Besar', title: 'Perhitungan Kebutuhan Pangan Porsi Besar', jumlahLabel: 'Jumlah Porsi Besar', count: totalBesar, mode: 'aggregate', jenjang: null },
      { name: 'Porsi Kecil', title: 'Perhitungan Kebutuhan Pangan Porsi Kecil', jumlahLabel: 'Jumlah Porsi Kecil', count: totalKecil, mode: 'aggregate', jenjang: null },
    ];

    const wb = new ExcelJS.Workbook();
    wb.creator = 'MBG';
    wb.created = new Date();

    // Styling dasar
    const borderThin = { style: 'thin', color: { argb: 'FFC9C9C9' } };
    const borderBox = { top: borderThin, left: borderThin, bottom: borderThin, right: borderThin };
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    const menuFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    for (const cfg of sheets) {
      const ws = wb.addWorksheet(cfg.name);
      ws.columns = [
        { width: 10 }, { width: 28 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 18 }, { width: 20 }
      ];

      // ── Judul (row 1, merged) ──
      ws.mergeCells(1, 1, 1, 7);
      const titleCell = ws.getCell(1, 1);
      titleCell.value = cfg.title;
      titleCell.font = { bold: true, size: 14 };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 26;

      // ── Header (row 2) ──
      const headers = ['MENU', 'Bahan Pangan', 'Berat Bersih (gram)', 'Persen BDD', 'Berat Kotor (gram)', cfg.jumlahLabel, 'Kebutuhan Bahan Pangan (kg)'];
      const hRow = ws.getRow(2);
      headers.forEach((h, i) => {
        const cell = hRow.getCell(i + 1);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = headerFill;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = borderBox;
      });
      hRow.height = 32;

      // ── Baris data per hari ──
      let row = 3;
      let anyData = false;
      for (let d = 0; d < days.length; d++) {
        const day = days[d];
        const label = tkFmtTanggal(day.header_tanggal, day.hari_nama);
        const menuNo = 'MENU ' + (d + 1);

        // Kategori tanpa penerima → cukup catatan kosong (jangan deretan 0)
        if (!cfg.count) continue;

        // Kumpulkan baris bahan untuk kategori ini
        const bahanRows = [];
        for (const b of day.bahan) {
          const pj = b.per_jenjang || {};
          let rec = null;
          if (cfg.mode === 'jenjang') {
            rec = pj[cfg.jenjang] || null;
          } else {
            rec = (refJenjang && pj[refJenjang]) || pj[Object.keys(pj)[0]] || null;
          }
          if (!rec) continue;
          const beratBersih = Number(rec.berat_bersih) || 0;
          const persenBdd = Number(rec.persen_bdd) || 100;
          const beratKotor = Number(rec.berat_kotor) || 0;
          const jumlah = cfg.count || 0;
          const kg = cfg.mode === 'jenjang'
            ? (Number(rec.kebutuhan_kg) || 0)
            : Math.round((beratKotor * jumlah / 1000) * 100) / 100;
          bahanRows.push({ nama: b.nama_display || b.nama || '-', beratBersih, persenBdd, beratKotor, jumlah, kg });
        }
        if (!bahanRows.length) continue;
        anyData = true;

        // Baris MENU
        const menuRow = ws.getRow(row);
        menuRow.height = 20;
        const c1 = menuRow.getCell(1); c1.value = menuNo;
        const c2 = menuRow.getCell(2); c2.value = label;
        for (let c = 1; c <= 7; c++) {
          const cell = menuRow.getCell(c);
          cell.fill = menuFill;
          cell.border = borderBox;
        }
        c1.font = { bold: true };
        c2.font = { bold: true };
        row++;

        // Baris bahan
        for (const br of bahanRows) {
          const r = ws.getRow(row);
          r.getCell(1).value = '';
          r.getCell(2).value = br.nama;
          r.getCell(3).value = br.beratBersih;
          r.getCell(4).value = br.persenBdd + '%';
          r.getCell(5).value = br.beratKotor;
          r.getCell(6).value = br.jumlah;
          r.getCell(7).value = br.kg;
          for (let c = 1; c <= 7; c++) {
            const cell = r.getCell(c);
            cell.border = borderBox;
            cell.alignment = { vertical: 'middle' };
          }
          r.getCell(2).alignment = { vertical: 'middle', wrapText: true };
          for (let c = 3; c <= 7; c++) r.getCell(c).alignment = { horizontal: 'right', vertical: 'middle' };
          r.getCell(3).numFmt = '0.##';
          r.getCell(5).numFmt = '0.##';
          r.getCell(7).numFmt = '0.00';
          row++;
        }
      }

      if (!anyData) {
        const note = ws.getCell(3, 2);
        note.value = 'Belum ada penerima untuk kategori ini.';
        note.font = { italic: true, color: { argb: 'FF9CA3AF' } };
      }
    }

    const fileTag = data.tanggal_mulai || new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Kebutuhan-Pangan-' + fileTag + '.xlsx"');
    await wb.xlsx.write(res);
  } catch (err) {
    console.error('Export Kebutuhan Pangan error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
});

/**
 * Helper qty belanja (port dari public/modul/total-kebutuhan.js) —
 * untuk kolom "Kg/pcs/btl" pada export Total Kebutuhan Pangan.
 */
function tkIsSatuanHitung(s) {
  const t = String(s || '').toLowerCase();
  return ['pcs', 'btl', 'renceng', 'ctn', 'karton', 'kardus', 'dus', 'pack', 'ikat', 'ekor', 'butir', 'bungkus'].includes(t);
}
function tkBeratPerSatuanEfektif(satuan, kategoriSp, beratPerSatuan) {
  const b = Number(beratPerSatuan) || 0;
  if (String(kategoriSp || '').toLowerCase() === 'minyak') {
    const s = String(satuan || '').toLowerCase();
    if ((s === 'karton' || s === 'ctn' || s === 'kardus' || s === 'dus') && b > 0) return b;
    return 11000;
  }
  return b;
}
function tkAutoQty(satuan, totalKg, jumlahSiswa, kategoriSp, beratPerSatuan) {
  const s = String(satuan || 'kg').toLowerCase();
  if (String(kategoriSp || '').toLowerCase() === 'minyak') {
    if (!totalKg || totalKg <= 0) return '';
    const bps = tkBeratPerSatuanEfektif(satuan, kategoriSp, beratPerSatuan);
    return Math.ceil((totalKg * 1000) / bps) + ' karton';
  }
  if (s === 'kg' || s === 'g' || s === 'gram' || s === 'gr') {
    if (s === 'kg') return Math.ceil(totalKg) + ' kg';
    return Math.ceil(totalKg * 1000) + ' g';
  }
  if (tkIsSatuanHitung(s)) {
    const bps = tkBeratPerSatuanEfektif(satuan, kategoriSp, beratPerSatuan);
    if (bps > 0 && totalKg > 0) return Math.ceil((totalKg * 1000) / bps) + ' ' + s;
    if (s === 'karton' || s === 'kardus' || s === 'dus' || s === 'ctn') return '';
    return (Math.ceil(jumlahSiswa) || 0) + ' ' + s;
  }
  return '';
}

/**
 * GET /siklus/laporan/total-kebutuhan/export
 * Export Total Kebutuhan Pangan memakai template public/template/total-kebutuhan.xlsx.
 * Setiap hari menjadi 1 sheet: tanggal → baris per menu → header
 * (Bahan | Kg/pcs/btl | Ket | Kebutuhan (kg)) → baris bahan.
 */
router.get('/siklus/laporan/total-kebutuhan/export', async (req, res) => {
  try {
    const data = await buildPerencanaanData({ tenant_id: req.user.tenant_id, query: req.query });
    const days = (data.hari || []).filter(d => d.bahan && d.bahan.length);
    if (!days.length) return res.status(400).json({ error: 'Tidak ada data total kebutuhan untuk diexport. Isi menu & bahan siklus terlebih dahulu.' });

    // ── Muat template untuk gaya dasar ──
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(__dirname, '..', '..', 'public', 'template', 'total-kebutuhan.xlsx'));
    const tmpl = wb.getWorksheet(1);
    if (!tmpl) return res.status(500).json({ error: 'Template total-kebutuhan.xlsx tidak memiliki sheet' });

    const cap = (r, c) => { const cell = tmpl.getCell(r, c); return { style: cell.style, numFmt: cell.numFmt }; };
    const colWidths = (tmpl.columns || []).slice(0, 4).map(col => (col && col.width) || 12);
    const tglStyle = cap(1, 1);
    const menuStyle = cap(2, 1);
    const hdrStyle = [cap(4, 1), cap(4, 2), cap(4, 3), cap(4, 4)];
    const dataStyle = [cap(5, 1), cap(5, 2), cap(5, 3), cap(5, 4)];
    const dataStyle2 = [cap(6, 1), cap(6, 2), cap(6, 3), cap(6, 4)];
    wb.removeWorksheet(tmpl.id);

    const borderThin = { style: 'thin', color: { argb: 'FFC9C9C9' } };
    const borderBox = { top: borderThin, left: borderThin, bottom: borderThin, right: borderThin };
    const MONTHS_ID = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];

    const cloneStyle = (s) => JSON.parse(JSON.stringify(s));
    const put = (ws, r, c, v, styleObj, numFmt) => {
      const cell = ws.getCell(r, c);
      cell.value = v;
      if (styleObj && styleObj.style) cell.style = cloneStyle(styleObj.style);
      else if (styleObj) cell.style = cloneStyle(styleObj);
      if (numFmt) cell.numFmt = numFmt;
      return cell;
    };
    const merge = (ws, r1, c1, r2, c2) => { try { ws.mergeCells(r1, c1, r2, c2); } catch (e) {} };

    // ── Bangun sheet per hari ──
    for (let d = 0; d < days.length; d++) {
      const day = days[d];
      const dObj = new Date(String(day.header_tanggal || '').slice(0, 10) + 'T00:00:00');
      const sheetName = isNaN(dObj.getTime())
        ? 'Hari ' + (d + 1)
        : dObj.getDate() + ' ' + MONTHS_ID[dObj.getMonth()] + ' ' + dObj.getFullYear();
      const ws = wb.addWorksheet(sheetName);
      ws.columns = colWidths.map(w => ({ width: w }));

      let row = 1;
      // Tanggal (merged A:D)
      const label = tkFmtTanggal(day.header_tanggal, day.hari_nama);
      put(ws, row, 1, label, tglStyle);
      merge(ws, row, 1, row, 4);
      ws.getRow(row).height = 22;
      row++;

      // Menu per baris (merged A:D, bold)
      const menus = (day.menu_names || []).filter(Boolean);
      if (!menus.length) menus.push('-');
      for (const m of menus) {
        put(ws, row, 1, m, menuStyle);
        merge(ws, row, 1, row, 4);
        row++;
      }

      // Header (row terpisah dari menu)
      const headers = ['Bahan', 'Kg/pcs/btl', 'Ket', 'Kebutuhan (kg)'];
      const hRow = ws.getRow(row);
      headers.forEach((h, i) => put(ws, row, i + 1, h, hdrStyle[i]));
      hRow.height = 20;
      row++;

      // Data bahan
      let any = false;
      let bi = 0;
      for (const b of day.bahan) {
        if (!b.per_jenjang) continue;
        let rowKg = 0, rowSiswa = 0;
        for (const jn in b.per_jenjang) {
          const pj = b.per_jenjang[jn];
          rowKg += Number(pj.kebutuhan_kg) || 0;
          rowSiswa += Number(pj.jumlah_siswa) || 0;
        }
        const bufferPersen = Number(b.buffer_persen) || 0;
        const bufferKg = Math.round(rowKg * (1 + bufferPersen / 100) * 100) / 100;
        const satuan = b.satuan || 'kg';
        const qtyText = tkAutoQty(satuan, bufferKg, rowSiswa, b.kategori_sp || '', Number(b.berat_per_satuan) || 0);
        if (!qtyText) continue;
        any = true;

        const st = (bi % 2 === 0) ? dataStyle : dataStyle2; // variasi baris genap/ganjil
        bi++;
        const nama = b.nama_display || b.nama || '-';
        put(ws, row, 1, nama, st[0]);
        put(ws, row, 2, qtyText.replace(/\s+/g, ''), st[1]);
        put(ws, row, 3, b.keterangan || '', st[2]);
        put(ws, row, 4, Math.round(rowKg * 100) / 100, st[3], '0.00');
        for (let c = 1; c <= 4; c++) ws.getCell(row, c).border = borderBox;
        row++;
      }

      if (!any) {
        put(ws, row, 1, 'Tidak ada bahan dengan jumlah untuk ditampilkan.', dataStyle[0]);
      }
    }

    const mulai = data.tanggal_mulai || new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="TOTAL-KEBUTUHAN-' + mulai + '.xlsx"');
    await wb.xlsx.write(res);
  } catch (err) {
    console.error('Export Total Kebutuhan error:', err);
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
