const express = require('express');
const db = require('../../db');
const { parseKategoriPenerima, expandJenjangToDbValues, buildDbToDisplay, batchLoadItems, batchLoadMenuBahan, batchLoadGridBahanBySiklus, hitungEstimasiGiziManual, resolveGridBeratPerSiswa } = require('./helpers');
const { loadSpRefMap, calculateNutrition } = require('../menu/helpers');
const { hitungBDD } = require('../../services/spBddCalculator');

const router = express.Router();

function hitungHariKerja(periode) {
  const [year, month] = periode.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  let workingDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0) workingDays++;
  }
  return workingDays;
}

async function kategoriBudgetSiklus(siklus, tenantId) {
  const jenjangList = parseKategoriPenerima(siklus.kategori_penerima);
  let dbVals = expandJenjangToDbValues(jenjangList);
  if (!dbVals.length) dbVals = ['Umum'];

  const dbToDisplay = buildDbToDisplay();
  const catMap = {};
  for (const dv of dbVals) {
    const display = dbToDisplay[dv] || dv;
    if (!catMap[display]) catMap[display] = [];
    catMap[display].push(dv);
  }

  const ph = dbVals.map(() => '?').join(',');
  const [pmRows] = await db.query(
    `SELECT kategori_penerima,
            COALESCE(SUM(paket_besar),0) AS besar,
            COALESCE(SUM(paket_kecil),0) AS kecil
     FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima IN (${ph})
     GROUP BY kategori_penerima`,
    [tenantId, ...dbVals]
  );
  const pmMap = {};
  for (const p of pmRows) pmMap[p.kategori_penerima] = { besar: Number(p.besar), kecil: Number(p.kecil) };

  const siklusPorsi = Number(siklus.jumlah_porsi) || 0;
  const displayList = Object.keys(catMap);
  return displayList.map(display => {
    let besar = 0, kecil = 0;
    for (const dv of catMap[display]) {
      const pm = pmMap[dv];
      if (pm) { besar += pm.besar; kecil += pm.kecil; }
    }
    if (besar + kecil <= 0) {
      besar = displayList.length ? Math.round(siklusPorsi / displayList.length) : 0;
      kecil = 0;
    }
    return { display, jumlah_penerima: besar + kecil, jumlah_besar: besar, jumlah_kecil: kecil };
  });
}

async function refHargaKategori(tenantId, display, periode) {
  const dbVals = expandJenjangToDbValues([display]);
  const candidates = [...new Set([...dbVals, display])];
  const ph = candidates.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT harga_besar, harga_kecil, harga_per_porsi FROM budget
     WHERE tenant_id=? AND kategori_penerima IN (${ph})
     ORDER BY (COALESCE(harga_besar,0) > 0) DESC, (periode = ?) DESC, periode DESC
     LIMIT 1`,
    [tenantId, ...candidates, periode]
  );
  if (rows.length) {
    const r = rows[0];
    const hargaBesar = Number(r.harga_besar) || Number(r.harga_per_porsi) || 0;
    return { harga_besar: hargaBesar, harga_kecil: Number(r.harga_kecil) || hargaBesar };
  }
  return { harga_besar: 0, harga_kecil: 0 };
}

/**
 * POST /siklus/generate-produksi
 * Generate single produksi entry for a specific date based on a siklus.
 */
router.post('/siklus/generate-produksi', async (req, res) => {
  const { siklus_id, tanggal_produksi } = req.body;
  if (!siklus_id || !tanggal_produksi) return res.status(400).json({ error: 'siklus_id dan tanggal_produksi wajib diisi' });

  const [[siklus]] = await db.query('SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?', [siklus_id, req.user.tenant_id]);
  if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

  // Find items for this siklus to get menu info
  const [items] = await db.query('SELECT * FROM siklus_menu_item WHERE siklus_id=? ORDER BY hari_ke ASC', [siklus_id]);

  // Hitung hari_ke berdasarkan offset tanggal (1 bulan kalender, tanpa modulo)
  if (!siklus.tanggal_mulai) return res.status(400).json({ error: 'Siklus belum memiliki tanggal_mulai' });
  const startDate = new Date(siklus.tanggal_mulai);
  const prodDate = new Date(tanggal_produksi);
  const diffDays = Math.floor((prodDate - startDate) / (1000 * 60 * 60 * 24));
  const totalHari = siklus.total_hari || 30;
  const hariKe = diffDays + 1;
  if (hariKe < 1 || hariKe > totalHari) {
    return res.status(404).json({ error: 'Tanggal ' + tanggal_produksi + ' tidak dalam rentang siklus (hari ke-' + hariKe + ')' });
  }

  const dayItems = items.filter(it => it.hari_ke === hariKe);
  if (!dayItems.length) return res.status(404).json({ error: 'Tidak ada menu untuk hari ke-' + hariKe });

  let created = 0;
  for (const it of dayItems) {
    // Check duplicate
    const [existing] = await db.query(
      'SELECT id FROM produksi WHERE tenant_id=? AND tanggal_produksi=? AND menu_id=?',
      [req.user.tenant_id, tanggal_produksi, it.menu_id]
    );
    if (existing.length) continue;

    await db.query(
      'INSERT INTO produksi (tenant_id, tanggal_produksi, menu_id, menu_nama, kategori_penerima, jumlah_porsi, status) VALUES (?,?,?,?,?,?,?)',
      [req.user.tenant_id, tanggal_produksi, it.menu_id, it.menu_nama, siklus.kategori_penerima, it.jumlah_porsi || siklus.jumlah_porsi, 'Direncanakan']
    );
    created++;
  }

  res.json({ ok: true, message: created + ' produksi berhasil dibuat untuk ' + tanggal_produksi + ' (hari ke-' + hariKe + ')', created_count: created });
});

/**
 * POST /siklus/generate-produksi-batch
 * Generate multiple produksi entries for a date range.
 */
router.post('/siklus/generate-produksi-batch', async (req, res) => {
  const { siklus_id, tanggal_mulai, tanggal_selesai } = req.body;
  if (!siklus_id || !tanggal_mulai || !tanggal_selesai) return res.status(400).json({ error: 'siklus_id, tanggal_mulai, tanggal_selesai wajib diisi' });

  const [[siklus]] = await db.query('SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?', [siklus_id, req.user.tenant_id]);
  if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

  const [items] = await db.query('SELECT * FROM siklus_menu_item WHERE siklus_id=? ORDER BY hari_ke ASC', [siklus_id]);

  let created_count = 0, skipped_count = 0;
  const start = new Date(tanggal_mulai);
  const end = new Date(tanggal_selesai);
  const cur = new Date(start);

  while (cur <= end) {
    const dateStr = cur.toISOString().split('T')[0];

    // Hitung hari_ke berdasarkan offset tanggal (1 bulan kalender, tanpa modulo)
    if (!siklus.tanggal_mulai) { cur.setDate(cur.getDate() + 1); continue; }
    const siklusStart = new Date(siklus.tanggal_mulai);
    const diffDays = Math.floor((cur - siklusStart) / (1000 * 60 * 60 * 24));
    const totalHari = siklus.total_hari || 30;
    const hariKe = diffDays + 1;
    if (hariKe < 1 || hariKe > totalHari) { cur.setDate(cur.getDate() + 1); continue; }

    const dayItems = items.filter(it => it.hari_ke === hariKe);
    if (!dayItems.length) { cur.setDate(cur.getDate() + 1); continue; }

    for (const it of dayItems) {
      const [existing] = await db.query(
        'SELECT id FROM produksi WHERE tenant_id=? AND tanggal_produksi=? AND menu_id=?',
        [req.user.tenant_id, dateStr, it.menu_id]
      );
      if (existing.length) { skipped_count++; continue; }

      await db.query(
        'INSERT INTO produksi (tenant_id, tanggal_produksi, menu_id, menu_nama, kategori_penerima, jumlah_porsi, status) VALUES (?,?,?,?,?,?,?)',
        [req.user.tenant_id, dateStr, it.menu_id, it.menu_nama, siklus.kategori_penerima, it.jumlah_porsi || siklus.jumlah_porsi, 'Direncanakan']
      );
      created_count++;
    }
    cur.setDate(cur.getDate() + 1);
  }

  res.json({ ok: true, created_count, skipped_count });
});

/**
 * POST /siklus/hitung-budget
 * Calculate budget for a specific siklus and month.
 */
router.post('/siklus/hitung-budget', async (req, res) => {
  const { siklus_id, periode } = req.body;
  if (!siklus_id || !periode) return res.status(400).json({ error: 'siklus_id dan periode (YYYY-MM) wajib diisi' });

  const [[siklus]] = await db.query('SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?', [siklus_id, req.user.tenant_id]);
  if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

  const workingDays = hitungHariKerja(periode);
  const kategoriList = await kategoriBudgetSiklus(siklus, req.user.tenant_id);

  let totalBudget = 0, created = 0, updated = 0;
  for (const kat of kategoriList) {
    const harga = await refHargaKategori(req.user.tenant_id, kat.display, periode);
    const rowTotal = workingDays * (harga.harga_besar * kat.jumlah_besar + harga.harga_kecil * kat.jumlah_kecil);
    totalBudget += rowTotal;

    const [existing] = await db.query(
      'SELECT id FROM budget WHERE tenant_id=? AND periode=? AND kategori_penerima=?',
      [req.user.tenant_id, periode, kat.display]
    );
    if (existing.length) {
      await db.query(
        'UPDATE budget SET jumlah_penerima=?, harga_besar=?, harga_kecil=?, total_budget=? WHERE id=? AND tenant_id=?',
        [kat.jumlah_penerima, harga.harga_besar, harga.harga_kecil, rowTotal, existing[0].id, req.user.tenant_id]
      );
      updated++;
    } else {
      await db.query(
        'INSERT INTO budget (tenant_id, periode, kategori_penerima, jumlah_penerima, harga_besar, harga_kecil, total_budget) VALUES (?,?,?,?,?,?,?)',
        [req.user.tenant_id, periode, kat.display, kat.jumlah_penerima, harga.harga_besar, harga.harga_kecil, rowTotal]
      );
      created++;
    }
  }

  res.json({
    ok: true,
    message: 'Budget ' + periode + ' untuk ' + siklus.nama + ': Rp ' + totalBudget.toLocaleString('id-ID') + ' (' + kategoriList.length + ' kategori: ' + created + ' baru, ' + updated + ' update)',
    total_budget: totalBudget,
    created,
    updated,
    kategori: kategoriList.map(k => k.display),
  });
});

/**
 * POST /siklus/hitung-budget-semua
 * Calculate budget for all active siklus for a given month.
 */
router.post('/siklus/hitung-budget-semua', async (req, res) => {
  const { periode } = req.body;
  if (!periode) return res.status(400).json({ error: 'Periode (YYYY-MM) wajib diisi' });

  const [siklusList] = await db.query(
    'SELECT * FROM siklus_menu WHERE tenant_id=? AND status="Aktif"',
    [req.user.tenant_id]
  );

  if (!siklusList.length) return res.json({ ok: true, message: 'Tidak ada siklus aktif', updated: 0 });

  const workingDays = hitungHariKerja(periode);

  // Normalisasi kategori dari setiap siklus aktif lalu agregasi per kategori display
  const agg = {};
  for (const s of siklusList) {
    const kategoriList = await kategoriBudgetSiklus(s, req.user.tenant_id);
    for (const kat of kategoriList) {
      if (!agg[kat.display]) agg[kat.display] = { jumlah_besar: 0, jumlah_kecil: 0 };
      agg[kat.display].jumlah_besar += kat.jumlah_besar;
      agg[kat.display].jumlah_kecil += kat.jumlah_kecil;
    }
  }

  let totalBudget = 0, created = 0, updated = 0;
  for (const display of Object.keys(agg)) {
    const kat = agg[display];
    const harga = await refHargaKategori(req.user.tenant_id, display, periode);
    const rowTotal = workingDays * (harga.harga_besar * kat.jumlah_besar + harga.harga_kecil * kat.jumlah_kecil);
    totalBudget += rowTotal;
    const jumlahPenerima = kat.jumlah_besar + kat.jumlah_kecil;

    const [existing] = await db.query(
      'SELECT id FROM budget WHERE tenant_id=? AND periode=? AND kategori_penerima=?',
      [req.user.tenant_id, periode, display]
    );
    if (existing.length) {
      await db.query(
        'UPDATE budget SET jumlah_penerima=?, harga_besar=?, harga_kecil=?, total_budget=? WHERE id=? AND tenant_id=?',
        [jumlahPenerima, harga.harga_besar, harga.harga_kecil, rowTotal, existing[0].id, req.user.tenant_id]
      );
      updated++;
    } else {
      await db.query(
        'INSERT INTO budget (tenant_id, periode, kategori_penerima, jumlah_penerima, harga_besar, harga_kecil, total_budget) VALUES (?,?,?,?,?,?,?)',
        [req.user.tenant_id, periode, display, jumlahPenerima, harga.harga_besar, harga.harga_kecil, rowTotal]
      );
      created++;
    }
  }

  res.json({
    ok: true,
    message: (created + updated) + ' budget berhasil dihitung (total Rp ' + totalBudget.toLocaleString('id-ID') + ')',
    updated: created + updated,
    total_budget: totalBudget,
    kategori: Object.keys(agg),
  });
});

/**
 * POST /siklus/budget-harian
 * Isi ANGGARAN BELANJA HARIAN (Rp/hari) langsung dari halaman Siklus.
 * Total Budget periode = anggaran_harian × total_hari siklus, lalu dibagi
 * proporsional per kategori (berat jumlah penerima) agar konsisten dgn
 * struktur budget per kategori (RAB Bulanan tetap rinci). Idempotent:
 * baris (periode, kategori) yang sudah ada di-UPDATE, sisanya di-INSERT.
 */
router.post('/siklus/budget-harian', async (req, res) => {
  const { siklus_id, periode, anggaran_harian, ganti_semua } = req.body;
  if (!siklus_id || !periode) return res.status(400).json({ error: 'siklus_id dan periode (YYYY-MM) wajib diisi' });
  if (!/^\d{4}-\d{2}$/.test(periode)) return res.status(400).json({ error: 'Format periode harus YYYY-MM' });
  const harian = Number(anggaran_harian);
  if (!(Number.isFinite(harian) && harian > 0)) return res.status(400).json({ error: 'Anggaran per hari harus lebih dari 0' });

  const [[siklus]] = await db.query('SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?', [siklus_id, req.user.tenant_id]);
  if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

  // Pembagi anggaran per hari = total_hari siklus (konsisten dgn getRabHarianData
  // yang memakai total_hari siklus). Jika belum diisi, tolak — agar tidak ada
  // ketidakcocokan hint vs hasil (fallback hari kerja tidak dipakai di sini).
  const totalHari = Number(siklus.total_hari);
  if (!(totalHari > 0)) return res.status(400).json({ error: 'Siklus belum memiliki total_hari — atur dulu lewat Edit Siklus' });
  const totalBudget = Math.round(harian * totalHari);

  const kategoriList = await kategoriBudgetSiklus(siklus, req.user.tenant_id);
  const totalPenerima = kategoriList.reduce((s, k) => s + (Number(k.jumlah_penerima) || 0), 0);

  // Opsi "ganti semua": hapus baris budget lain periode ini (kategori di luar
  // siklus) agar SUM(total_budget) periode = totalBudget PERSIS → ANGGARAN
  // BELANJA HARIAN di RAB = angka yang diketik, tanpa sisa baris lama menambah.
  let deleted = 0;
  if (ganti_semua && kategoriList.length) {
    const ph = kategoriList.map(() => '?').join(',');
    const [del] = await db.query(
      'DELETE FROM budget WHERE tenant_id=? AND periode=? AND kategori_penerima NOT IN (' + ph + ')',
      [req.user.tenant_id, periode, ...kategoriList.map(k => k.display)]
    );
    deleted = del.affectedRows || 0;
  }

  // Distribusi proporsional: floor untuk semua baris, lalu sisa pembulatan
  // diberikan ke baris dengan penerima TERBANYAK (bukan baris terakhir) agar
  // tidak mendarat di kategori kosong. SUM(total_budget) = totalBudget persis.
  const rowTotals = kategoriList.map(k => {
    const jml = Number(k.jumlah_penerima) || 0;
    const share = totalPenerima > 0 ? (jml / totalPenerima) : (1 / kategoriList.length);
    return Math.floor(totalBudget * share);
  });
  const sumRows = rowTotals.reduce((a, b) => a + b, 0);
  let idxRem = kategoriList.length - 1;
  if (totalPenerima > 0) {
    let maxJ = -1;
    kategoriList.forEach((k, i) => {
      const jml = Number(k.jumlah_penerima) || 0;
      if (jml > maxJ) { maxJ = jml; idxRem = i; }
    });
  }
  rowTotals[idxRem] += (totalBudget - sumRows);

  let created = 0, updated = 0;
  for (let i = 0; i < kategoriList.length; i++) {
    const kat = kategoriList[i];
    const jml = Number(kat.jumlah_penerima) || 0;
    const rowTotal = rowTotals[i];
    // Harga porsi implisit agar RAB Bulanan tetap konsisten (total ÷ (jml × hari))
    const hargaPorsi = (jml > 0) ? Math.round(rowTotal / (jml * totalHari)) : 0;

    const [existing] = await db.query(
      'SELECT id FROM budget WHERE tenant_id=? AND periode=? AND kategori_penerima=?',
      [req.user.tenant_id, periode, kat.display]
    );
    if (existing.length) {
      await db.query(
        'UPDATE budget SET jumlah_penerima=?, harga_besar=?, harga_kecil=?, total_budget=?, catatan=? WHERE id=? AND tenant_id=?',
        [kat.jumlah_penerima, hargaPorsi, hargaPorsi, rowTotal, 'Budget Harian', existing[0].id, req.user.tenant_id]
      );
      updated++;
    } else {
      await db.query(
        'INSERT INTO budget (tenant_id, periode, kategori_penerima, jumlah_penerima, harga_besar, harga_kecil, total_budget, realisasi, catatan) VALUES (?,?,?,?,?,?,?,0,?)',
        [req.user.tenant_id, periode, kat.display, kat.jumlah_penerima, hargaPorsi, hargaPorsi, rowTotal, 'Budget Harian']
      );
      created++;
    }
  }

  // Info: baris budget lain periode ini yang TIDAK diubah (kalau ganti_semua
  // mati) — agar tidak mengejutkan saat SUM di RAB Harian lebih besar.
  let lainInfo = '';
  if (!ganti_semua && kategoriList.length) {
    const ph = kategoriList.map(() => '?').join(',');
    const [others] = await db.query(
      `SELECT COUNT(*) AS c FROM budget WHERE tenant_id=? AND periode=? AND kategori_penerima NOT IN (${ph})`,
      [req.user.tenant_id, periode, ...kategoriList.map(k => k.display)]
    );
    if (others[0].c > 0) lainInfo = '. Catatan: ' + others[0].c + ' baris budget lain periode ini tidak diubah';
  }

  res.json({
    ok: true,
    message: 'Budget Harian ' + periode + ': Rp ' + harian.toLocaleString('id-ID') + '/hari × ' + totalHari + ' hari = Rp ' + totalBudget.toLocaleString('id-ID') + ' (' + created + ' baru, ' + updated + ' update' + (deleted > 0 ? ', ' + deleted + ' dihapus' : '') + ')' + lainInfo,
    anggaran_harian: harian,
    total_hari: totalHari,
    total_budget: totalBudget,
    created,
    updated,
    deleted,
    kategori: kategoriList.map(k => k.display),
  });
});

/**
 * POST /siklus/buat-pr
 * Auto-generate Purchase Request from total ingredient requirements for a period.
 */
router.post('/siklus/buat-pr', async (req, res) => {
  const { periode } = req.body;
  if (!periode) return res.status(400).json({ error: 'Periode (YYYY-MM) wajib diisi' });

  // Get all active siklus
  const [siklusList] = await db.query(
    'SELECT * FROM siklus_menu WHERE tenant_id=? AND status="Aktif"',
    [req.user.tenant_id]
  );

  if (!siklusList.length) return res.json({ ok: true, message: 'Tidak ada siklus aktif', created: 0 });

  const [year, month] = periode.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  let workingDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0) workingDays++;
  }

  const siklusIds = siklusList.map(s => s.id);
  const itemsBySiklus = await batchLoadItems(siklusIds);
  const allMenuIds = [...new Set(Object.values(itemsBySiklus).flatMap(arr => arr.filter(it => it.menu_id).map(it => it.menu_id)))];
  const menuBahanMap = await batchLoadMenuBahan(allMenuIds);
  const gridBahanBySiklus = await batchLoadGridBahanBySiklus(siklusIds);

  // Aggregate all ingredients
  const bahanTotal = {};

  for (const s of siklusList) {
    const items = (itemsBySiklus[s.id] || []).filter(it => it.menu_id);
    const porsiPerHari = Number(s.jumlah_porsi) || 0;

    for (const it of items) {
      const bahanRows = menuBahanMap[it.menu_id] || [];
      for (const br of bahanRows) {
        if (!bahanTotal[br.bahan_baku_id]) {
          bahanTotal[br.bahan_baku_id] = { nama: br.nama, satuan: br.satuan, total: 0, harga_satuan: Number(br.harga_satuan) || 0, buffer_persen: Number(br.buffer_persen) || 0, berat_per_satuan: Number(br.berat_per_satuan) || 0 };
        }
        const dailyNeed = hitungBDD(Number(br.jumlah) * porsiPerHari, br.persen_bdd);
        bahanTotal[br.bahan_baku_id].total += dailyNeed * workingDays;
      }
    }

    // Grid-based ingredients
    const gridBahan = gridBahanBySiklus[s.id] || [];
    for (const g of gridBahan) {
      if (!bahanTotal[g.bahan_baku_id]) {
        bahanTotal[g.bahan_baku_id] = { nama: g.nama || '(bahan dihapus)', satuan: g.satuan || 'g', total: 0, harga_satuan: 0, buffer_persen: Number(g.buffer_persen) || 0, berat_per_satuan: Number(g.berat_per_satuan) || 0 };
      }
      const dailyNeed = hitungBDD(Number(g.berat_1_sp || 0) * porsiPerHari, g.persen_bdd);
      bahanTotal[g.bahan_baku_id].total += dailyNeed * workingDays;
    }
  }

  // Map id_koperasi from bahan_baku
  const bahanIds = Object.keys(bahanTotal).map(Number);
  if (bahanIds.length) {
    const ph = bahanIds.map(() => '?').join(',');
    const [bahanRefs] = await db.query(`SELECT id, id_koperasi, satuan, COALESCE(buffer_persen, 0) AS buffer_persen, COALESCE(berat_per_satuan, 0) AS berat_per_satuan FROM bahan_baku WHERE id IN (${ph}) AND tenant_id=?`, [...bahanIds, req.user.tenant_id]);
    for (const ref of bahanRefs) {
      if (bahanTotal[ref.id]) {
        bahanTotal[ref.id].id_koperasi = ref.id_koperasi;
        // Hati-hati: Number(0) || 10 = 10 (fallback menghapus buffer 0). Default kosong → 0.
        bahanTotal[ref.id].buffer_persen = Number(ref.buffer_persen) || 0;
        if (!bahanTotal[ref.id].satuan) bahanTotal[ref.id].satuan = ref.satuan || 'g';
        if (!bahanTotal[ref.id].berat_per_satuan) bahanTotal[ref.id].berat_per_satuan = Number(ref.berat_per_satuan) || 0;
      }
    }
  }

  // Build PR items array — konversi kebutuhan gram → satuan beli (kg/botol/karton/pcs)
  const gramSatuan = ['g', 'gr', 'gram', 'kg'];
  const items = Object.entries(bahanTotal)
    .filter(([, v]) => v.total > 0)
    .map(([id, v]) => {
      const buffer = 1 + (v.buffer_persen / 100);
      const kebutuhanDenganBuffer = Math.round(v.total * buffer);
      const satuanLower = String(v.satuan || '').toLowerCase();
      const isGram = gramSatuan.includes(satuanLower);
      let qtyBeli, satuanBeli;
      if (isGram) {
        qtyBeli = Math.round((kebutuhanDenganBuffer / 1000) * 100) / 100;
        satuanBeli = 'kg';
      } else {
        const bps = Number(v.berat_per_satuan) || 0;
        if (bps > 0) {
          // Toleransi noise penyimpanan (gram) agar kebutuhan nyaris bulat tidak lompat +1 satuan.
          // Minimal 1 satuan bila ada kebutuhan nyata (kebutuhanDenganBuffer selalu > 0 di sini).
          qtyBeli = Math.max(1, Math.ceil((kebutuhanDenganBuffer - 10) / bps));
          satuanBeli = v.satuan || 'unit';
        } else {
          qtyBeli = Math.round((kebutuhanDenganBuffer / 1000) * 100) / 100;
          satuanBeli = 'kg';
        }
      }
      const subTotal = qtyBeli * v.harga_satuan;
      const qtyBuffer = Math.round(qtyBeli * 100) / 100;
      return {
        bahan_baku_id: Number(id),
        nama: v.nama,
        satuan: satuanBeli,
        total_qty: qtyBuffer,
        buffer_10: qtyBuffer,
        harga_satuan: v.harga_satuan,
        subtotal: Math.round(subTotal),
        // Legacy fields for backward compat
        kebutuhan: Math.round(kebutuhanDenganBuffer * 100) / 100,
        kebutuhan_dengan_buffer: qtyBuffer,
        sub_total: Math.round(subTotal),
      };
    })
    .sort((a, b) => a.nama.localeCompare(b.nama));

  const totalNilai = items.reduce((sum, i) => sum + i.sub_total, 0);
  const budgetWarning = totalNilai > 0;

  // Create PR
  const noPr = 'PR/' + periode + '/' + Date.now();
  await db.query(
    'INSERT INTO purchase_order (tenant_id, no_po, tanggal, item, total_nilai, status, catatan) VALUES (?,?,?,?,?,?,?)',
    [req.user.tenant_id, noPr, periode + '-01', JSON.stringify(items), totalNilai, 'Draft', 'Auto-generated PR from siklus for ' + periode]
  );

  res.json({
    ok: true,
    message: 'PR berhasil dibuat',
    no_pr: noPr,
    total_item: items.length,
    total_nilai: totalNilai,
    budget_warning: budgetWarning,
    items,
  });
});

// menu.kategori_penerima adalah VARCHAR(50) — siklus bisa punya array jenjang
// yang lebih panjang, jadi normalisasi: ambil jenjang pertama jika terlalu panjang.
function normalizeMenuKategori(kp) {
  if (!kp) return null;
  const s = String(kp);
  if (s.length <= 50) return s;
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr) && arr.length) return String(arr[0]).slice(0, 50);
  } catch (e) { /* bukan JSON */ }
  return s.slice(0, 50);
}

/**
 * POST /siklus/:id/jadikan-resep
 * Konversi menu manual (bahan grid + identifikasi resep) pada satu hari menjadi
 * resep master di Menu & Gizi, lalu hubungkan hari tsb ke menu yang baru dibuat.
 * Berat per porsi diambil dari resolveGridBeratPerSiswa (jumlah → berat_1_sp → referensi SP),
 * gizi dihitung ulang konsisten dengan modul Menu (calculateNutrition).
 */
router.post('/siklus/:id/jadikan-resep', async (req, res) => {
  const siklusId = parseInt(req.params.id, 10);
  const hariKe = parseInt(req.body.hari_ke, 10);
  if (!siklusId || !hariKe) return res.status(400).json({ error: 'siklus_id dan hari_ke wajib diisi' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[siklus]] = await conn.query('SELECT * FROM siklus_menu WHERE id=? AND tenant_id=?', [siklusId, req.user.tenant_id]);
    if (!siklus) { await conn.rollback(); return res.status(404).json({ error: 'Siklus tidak ditemukan' }); }

    const [items] = await conn.query('SELECT * FROM siklus_menu_item WHERE siklus_id=? AND hari_ke=?', [siklusId, hariKe]);
    if (!items.length) { await conn.rollback(); return res.status(404).json({ error: 'Hari ke-' + hariKe + ' tidak ada di siklus ini' }); }
    const item = items[0];

    // Sudah terhubung ke menu master → idempotent
    if (item.menu_id) {
      await conn.rollback();
      return res.json({ ok: true, id: item.menu_id, nama: item.menu_nama || '', linked: true, already: true });
    }

    const nama = String(req.body.nama || '').trim() || String(item.menu_nama || '').trim() || ('Menu Hari ' + hariKe);

    const [existing] = await conn.query('SELECT id FROM menu WHERE nama=? AND tenant_id=?', [nama, req.user.tenant_id]);
    if (existing.length) {
      await conn.rollback();
      return res.status(409).json({ error: 'Menu dengan nama "' + nama + '" sudah ada di Menu & Gizi', existing_menu_id: existing[0].id });
    }

    const [gridRows] = await conn.query(
      `SELECT sb.bahan_baku_id, b.nama, b.satuan, b.kategori_sp, b.berat_1_sp, b.persen_bdd,
              b.kalori, b.protein, b.karbohidrat, b.lemak, b.serat
       FROM siklus_menu_item_bahan sb
       JOIN bahan_baku b ON b.id = sb.bahan_baku_id
       WHERE sb.siklus_id=? AND sb.hari_ke=?`,
      [siklusId, hariKe]
    );
    if (!gridRows.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'Hari ke-' + hariKe + ' belum punya bahan grid — isi bahan lewat form Edit terlebih dahulu' });
    }

    const spRefMap = await loadSpRefMap(req.user.tenant_id);

    // Resolusi berat per porsi per bahan (sama seperti di laporan/perencanaan)
    const bahanList = [];
    for (const g of gridRows) {
      const { beratPerSiswa } = resolveGridBeratPerSiswa(g, spRefMap);
      if (beratPerSiswa <= 0) continue;
      bahanList.push({ ...g, jumlah: beratPerSiswa });
    }
    if (!bahanList.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'Tidak ada bahan dengan berat valid untuk hari ke-' + hariKe });
    }

    const nut = calculateNutrition(bahanList, spRefMap);
    const jumlahPorsi = Number(siklus.jumlah_porsi) || 0;
    const kategoriPenerima = normalizeMenuKategori(req.body.kategori_penerima !== undefined ? req.body.kategori_penerima : (siklus.kategori_penerima || null));
    const deskripsi = req.body.deskripsi || ('Dibuat dari siklus "' + siklus.nama + '" — hari ke-' + hariKe + ' (' + item.hari_nama + ')');

    // Insert header menu master (foto ikut disalin dari hari siklus jika ada)
    const [r] = await conn.query(
      `INSERT INTO menu (tenant_id, nama, kategori_penerima, deskripsi, gramasi_total, gramasi_besar, gramasi_kecil, kalori, protein, karbohidrat, lemak, serat, jumlah_porsi, foto)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.tenant_id, nama, kategoriPenerima, deskripsi, nut.gramasi, 0, 0,
       nut.kalori, nut.protein, nut.karbohidrat, nut.lemak, nut.serat, jumlahPorsi, item.foto || null]
    );

    // Insert komposisi bahan
    for (const b of bahanList) {
      await conn.query(
        'INSERT INTO menu_bahan (menu_id, bahan_baku_id, jumlah, keterangan) VALUES (?,?,?,?)',
        [r.insertId, b.bahan_baku_id, b.jumlah, null]
      );
    }

    // Hubungkan hari ke menu master + sinkronkan nilai gizi item
    await conn.query(
      'UPDATE siklus_menu_item SET menu_id=?, menu_nama=?, kalori=?, protein=?, karbohidrat=?, lemak=?, serat=? WHERE siklus_id=? AND hari_ke=?',
      [r.insertId, nama, nut.kalori, nut.protein, nut.karbohidrat, nut.lemak, nut.serat, siklusId, hariKe]
    );

    await conn.commit();
    res.json({
      ok: true,
      id: r.insertId,
      nama,
      linked: true,
      message: 'Menu "' + nama + '" berhasil dijadikan resep master di Menu & Gizi dan dihubungkan ke hari ke-' + hariKe,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(400).json({ error: 'Gagal menjadikan resep: ' + (e.message || '') });
  } finally {
    conn.release();
  }
});

/**
 * POST /siklus/:id/link-menu
 * Hubungkan satu hari siklus ke menu master yang sudah ada (tanpa menulis ulang),
 * lalu sinkronkan nama & nilai gizi item dari menu tersebut.
 */
router.post('/siklus/:id/link-menu', async (req, res) => {
  const siklusId = parseInt(req.params.id, 10);
  const hariKe = parseInt(req.body.hari_ke, 10);
  const menuId = parseInt(req.body.menu_id, 10);
  if (!siklusId || !hariKe || !menuId) return res.status(400).json({ error: 'siklus_id, hari_ke, dan menu_id wajib diisi' });

  const [[siklus]] = await db.query('SELECT id FROM siklus_menu WHERE id=? AND tenant_id=?', [siklusId, req.user.tenant_id]);
  if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

  const [items] = await db.query('SELECT id FROM siklus_menu_item WHERE siklus_id=? AND hari_ke=?', [siklusId, hariKe]);
  if (!items.length) return res.status(404).json({ error: 'Hari ke-' + hariKe + ' tidak ada di siklus ini' });

  const [[menu]] = await db.query('SELECT id, nama, kalori, protein, karbohidrat, lemak, serat FROM menu WHERE id=? AND tenant_id=?', [menuId, req.user.tenant_id]);
  if (!menu) return res.status(404).json({ error: 'Menu tidak ditemukan' });

  await db.query(
    'UPDATE siklus_menu_item SET menu_id=?, menu_nama=?, kalori=?, protein=?, karbohidrat=?, lemak=?, serat=? WHERE siklus_id=? AND hari_ke=?',
    [menu.id, menu.nama, menu.kalori || 0, menu.protein || 0, menu.karbohidrat || 0, menu.lemak || 0, menu.serat || 0, siklusId, hariKe]
  );
  res.json({ ok: true, message: 'Hari ke-' + hariKe + ' dihubungkan ke menu "' + menu.nama + '"' });
});

module.exports = router;
