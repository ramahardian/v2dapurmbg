const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.path.startsWith('/purchase_order')) return requireRole('admin', 'keuangan', 'ahli_gizi')(req, res, next);
  next();
});

router.post('/purchase_order/generate-from-siklus', async (req, res) => {
  try {
    const { siklus_ids } = req.body;
    if (!siklus_ids || !Array.isArray(siklus_ids) || !siklus_ids.length) {
      return res.status(400).json({ error: 'Pilih minimal satu siklus' });
    }

    const ph = siklus_ids.map(() => '?').join(',');
    const [siklusList] = await db.query(
      `SELECT id, nama, kategori_penerima, jumlah_porsi FROM siklus_menu WHERE tenant_id=? AND id IN (${ph})`,
      [req.user.tenant_id, ...siklus_ids]
    );

    if (!siklusList.length) {
      return res.status(404).json({ error: 'Siklus tidak ditemukan' });
    }

    // Penerima manfaat per kategori (real-time)
    const [pmByJenjang] = await db.query(
      `SELECT COALESCE(kategori_penerima, 'Lainnya') AS jenjang,
              COALESCE(SUM(paket_besar + paket_kecil), 0) AS total_penerima
       FROM penerima_manfaat WHERE tenant_id=?
       GROUP BY kategori_penerima`,
      [req.user.tenant_id]
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
    function getJenjangList(kp) {
      if (!kp) return [];
      try { const p = JSON.parse(kp); if (Array.isArray(p)) return p; } catch {}
      return [kp];
    }

    const siklusPmMap = {};
    for (const s of siklusList) {
      const jenjangList = getJenjangList(s.kategori_penerima);
      siklusPmMap[s.id] = jenjangList.reduce((sum, k) => {
        const display = dbToDisplay[k] || k;
        return sum + (pmMap[display]?.total_penerima || 0);
      }, 0);
    }

    // ====================================================================
    // 1. KUMPULKAN DATA DARI SIKLUS MENU ITEM (menu composition)
    // ====================================================================
    const dayRows = [];
    const siklusJenjangMap = {};
    for (const s of siklusList) {
      const jenjangList = getJenjangList(s.kategori_penerima);
      siklusJenjangMap[s.id] = jenjangList[0] || '';
      const [items] = await db.query(
        `SELECT si.*, m.gramasi_total FROM siklus_menu_item si
         LEFT JOIN menu m ON m.id = si.menu_id
         WHERE si.siklus_id=? AND si.menu_id IS NOT NULL`,
        [s.id]
      );
      for (const it of items) {
        dayRows.push({
          siklus_id: s.id,
          siklus_nama: s.nama,
          menu_id: it.menu_id,
          hari_ke: it.hari_ke,
          jumlah_porsi: Number(it.jumlah_porsi) || 0,
        });
      }
    }

    const menuIds = [...new Set(dayRows.map(r => r.menu_id))];

    const agg = {};

    // ====================================================================
    // 2. BAHAN DARI MENU COMPOSITION (menu_bahan)
    // ====================================================================
    if (menuIds.length) {
      const mph = menuIds.map(() => '?').join(',');
      const [bahanRows] = await db.query(
        `SELECT mb.bahan_baku_id, b.nama as bahan_nama, b.satuan, b.harga_satuan,
                b.persen_bdd, b.kode as kode, mb.jumlah, mb.menu_id,
                b.kategori_sp, b.berat_per_satuan, b.berat_1_sp
         FROM menu_bahan mb
         JOIN bahan_baku b ON b.id = mb.bahan_baku_id
         WHERE mb.menu_id IN (${mph})`,
        menuIds
      );

      const menuPorsiMap = {};
      for (const r of dayRows) {
        if (!menuPorsiMap[r.menu_id]) menuPorsiMap[r.menu_id] = { total_porsi: 0 };
        menuPorsiMap[r.menu_id].total_porsi += r.jumlah_porsi;
      }

      for (const br of bahanRows) {
        const porsi = menuPorsiMap[br.menu_id]?.total_porsi || 0;
        if (!porsi) continue;
        const key = br.bahan_baku_id;
        if (!agg[key]) {
          agg[key] = { bahan_baku_id: br.bahan_baku_id, bahan_nama: br.bahan_nama, kode: br.kode || '', satuan: br.satuan, persen_bdd: Number(br.persen_bdd) || 100, harga_satuan: Number(br.harga_satuan) || 0, kategori_sp: br.kategori_sp, berat_per_satuan: Number(br.berat_per_satuan) || 0, berat_1_sp: Number(br.berat_1_sp) || 0, total_qty: 0 };
        }
        const beratBersih = Number(br.jumlah) * porsi;
        const bdd = Number(br.persen_bdd) || 100;
        const beratKotor = bdd > 0 ? Math.round(beratBersih / (bdd / 100)) : beratBersih;
        agg[key].total_qty += beratKotor;
      }
    }

    // ====================================================================
    // 3. BAHAN DARI GRID LANGSUNG (siklus_menu_item_bahan)
    //    Hitung qty berdasarkan SP: sp_value × berat_1_sp × jumlah_porsi
    //    Jika satu cell (hari_ke+kategori_sp) punya >1 bahan, SP dibagi rata
    // ====================================================================
    if (siklus_ids.length) {
      // Hanya untuk hari_ke yang sudah punya menu/resep
      const hariDenganMenu = new Set(dayRows.map(r => r.siklus_id + '-' + r.hari_ke));
      // Ambil semua grid item untuk siklus yang dipilih
      const [gridBahanRaw] = await db.query(
        `SELECT smib.siklus_id, smib.hari_ke, smib.kategori_sp, smib.bahan_baku_id,
                 bb.nama as bahan_nama, bb.satuan, bb.harga_satuan, bb.persen_bdd, bb.berat_1_sp,
                 bb.berat_per_satuan, bb.kategori_sp as bb_kategori_sp,
                 sm.kategori_penerima
         FROM siklus_menu_item_bahan smib
         JOIN siklus_menu sm ON sm.id=smib.siklus_id
         JOIN bahan_baku bb ON bb.id=smib.bahan_baku_id
         WHERE smib.siklus_id IN (${ph})
         AND sm.tenant_id=?`,
        [...siklus_ids, req.user.tenant_id]
      );
      const gridBahan = hariDenganMenu.size > 0
        ? gridBahanRaw.filter(gb => hariDenganMenu.has(gb.siklus_id + '-' + gb.hari_ke))
        : gridBahanRaw;

      if (gridBahan.length) {
        // Kumpulkan jenjang unik untuk ambil standar SP
        const jenjangSet = new Set();
        for (const gb of gridBahan) {
          const j = (gb.kategori_penerima || '').trim();
          if (j) jenjangSet.add(j);
        }

        // Ambil standar SP untuk semua jenjang terkait
        const spMap = {};
        if (jenjangSet.size) {
          const [spRows] = await db.query(
            `SELECT jenjang, kategori_sp, sp_value FROM standar_sp WHERE jenjang IN (${[...jenjangSet].map(() => '?').join(',')})`,
            [...jenjangSet]
          );
          for (const sr of spRows) {
            if (!spMap[sr.jenjang]) spMap[sr.jenjang] = {};
            spMap[sr.jenjang][sr.kategori_sp] = Number(sr.sp_value);
          }
        }

        // Hitung jumlah bahan per cell untuk bagi rata SP
        const cellCount = {};
        for (const gb of gridBahan) {
          const cellKey = gb.siklus_id + '-' + gb.hari_ke + '-' + gb.kategori_sp;
          if (!cellCount[cellKey]) cellCount[cellKey] = 0;
          cellCount[cellKey]++;
        }

        // Hitung qty per bahan grid
        for (const gb of gridBahan) {
          const jenjang = (gb.kategori_penerima || '').trim();
          const spValues = spMap[jenjang] || {};
          const spVal = spValues[gb.kategori_sp] || 0;
          const berat1Sp = Number(gb.berat_1_sp || 0);
          const jumlahPorsi = siklusPmMap[gb.siklus_id] || 0;
          if (spVal <= 0 || berat1Sp <= 0 || jumlahPorsi <= 0) continue;

          const cellKey = gb.siklus_id + '-' + gb.hari_ke + '-' + gb.kategori_sp;
          const bagi = cellCount[cellKey] || 1;

          // SP dibagi rata antar bahan dalam cell yang sama
          const spPerBahan = spVal / bagi;
          const beratBersih = berat1Sp * spPerBahan * jumlahPorsi;
          const bdd = Number(gb.persen_bdd || 100);
          const beratKotor = bdd > 0 ? Math.round(beratBersih / (bdd / 100)) : Math.round(beratBersih);

          const key = gb.bahan_baku_id;
          if (!agg[key]) {
            agg[key] = {
              bahan_baku_id: gb.bahan_baku_id,
              bahan_nama: gb.bahan_nama,
              kode: gb.kode || '',
              satuan: gb.satuan,
              persen_bdd: bdd,
              harga_satuan: Number(gb.harga_satuan) || 0,
              kategori_sp: gb.bb_kategori_sp,
              berat_per_satuan: Number(gb.berat_per_satuan) || 0,
              berat_1_sp: Number(gb.berat_1_sp) || 0,
              total_qty: 0,
            };
          }
          agg[key].total_qty += beratKotor;
        }
      }
    }

    // ====================================================================
    // 4. FORMAT OUTPUT
    // ====================================================================
    // Ambil id_koperasi & buffer_persen untuk mapping
    const bahanIds = Object.keys(agg);
    const idKoperasiMap = {};
    const bufferPersenMap = {};
    if (bahanIds.length) {
      const [rows] = await db.query(
        `SELECT id, id_koperasi, COALESCE(buffer_persen, 10) AS buffer_persen FROM bahan_baku WHERE id IN (${bahanIds.map(() => '?').join(',')}) AND tenant_id=?`,
        [...bahanIds, req.user.tenant_id]
      );
      for (const r of rows) {
        idKoperasiMap[r.id] = r.id_koperasi;
        bufferPersenMap[r.id] = Number(r.buffer_persen) || 10;
      }
    }

    const items = Object.values(agg).map(b => {
      let qty = b.total_qty;
      let satuan = b.satuan;

      const isGramSatuan = ['gram', 'g', 'gr', 'kg'].includes((b.satuan || '').toLowerCase());

      if (isGramSatuan) {
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

      const bp = bufferPersenMap[b.bahan_baku_id] || 10;
      const buffer = Math.round(qty * (1 + bp / 100) * 100) / 100;
      return {
        bahan_baku_id: b.bahan_baku_id,
        id_koperasi: idKoperasiMap[b.bahan_baku_id] || null,
        bahan_nama: b.bahan_nama,
        kode: b.kode || '',
        satuan,
        total_qty: Math.round(qty * 100) / 100,
        buffer_10: buffer,
        harga_satuan: b.harga_satuan,
        estimated_subtotal: Math.round(buffer * b.harga_satuan),
      };
    });

    res.json({
      items,
      total_estimated: items.reduce((s, i) => s + i.estimated_subtotal, 0),
      siklus_refs: siklusList.map(s => s.nama),
    });
  } catch (err) {
    console.error('Generate PO error:', err);
    res.status(500).json({ error: 'Gagal generate PO' });
  }
});

// ====================================================================
// TASK 4: Buat Draft Purchase Request (PR) dari siklus terpilih
// Endpoint ini mengambil data kebutuhan dari siklus, lalu langsung
// membuat entri purchase_order dengan status Draft dan no_po prefix PR-
// ====================================================================
router.post('/purchase_order/create-pr-from-siklus', async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const { siklus_ids, jumlah_penerima } = req.body;
    if (!siklus_ids || !Array.isArray(siklus_ids) || !siklus_ids.length) {
      return res.status(400).json({ error: 'Pilih minimal satu siklus' });
    }

    const ph = siklus_ids.map(() => '?').join(',');
    const [siklusList] = await db.query(
      `SELECT id, nama, kategori_penerima, jumlah_porsi FROM siklus_menu WHERE tenant_id=? AND id IN (${ph})`,
      [t, ...siklus_ids]
    );
    if (!siklusList.length) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

    // Penerima manfaat per kategori
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

    // SP Referensi Bahan untuk BDD
    const [spRefList] = await db.query(
      'SELECT nama, bdd_persen FROM sp_referensi_bahan WHERE tenant_id=?',
      [t]
    );
    const spRefByName = {};
    for (const r of spRefList) {
      const key = r.nama.trim().toLowerCase();
      spRefByName[key] = Math.round(Number(r.bdd_persen || 0) * 100);
    }

    function getJenjangList(kp) {
      if (!kp) return [];
      try { const p = JSON.parse(kp); if (Array.isArray(p)) return p; } catch {}
      return [kp];
    }

    const agg = {};
    let hasItems = false;

    for (const s of siklusList) {
      const jenjangList = getJenjangList(s.kategori_penerima);
      const penerimaCount = jenjangList.reduce((sum, k) => {
        const jenjang = dbToDisplay[k] || k;
        return sum + (pmMap[jenjang]?.total_penerima || 0);
      }, 0);
      if (!penerimaCount) continue;

      // --- A. Menu-based ingredients ---
      const [items] = await db.query(
        `SELECT si.* FROM siklus_menu_item si
         WHERE si.siklus_id=? AND si.menu_id IS NOT NULL`,
        [s.id]
      );
      if (items.length) hasItems = true;

      const menuPorsiMap = {};
      for (const it of items) {
        if (!menuPorsiMap[it.menu_id]) menuPorsiMap[it.menu_id] = 0;
        menuPorsiMap[it.menu_id] += penerimaCount;
      }

      const menuIds = Object.keys(menuPorsiMap);
      if (menuIds.length) {
        const mph = menuIds.map(() => '?').join(',');
        const [bahanRows] = await db.query(        `SELECT mb.menu_id, mb.bahan_baku_id, mb.jumlah, b.nama, b.satuan, b.harga_satuan,
          b.persen_bdd, b.kategori_sp, b.berat_per_satuan, b.berat_1_sp,
          COALESCE(b.buffer_persen, 10) AS buffer_persen
         FROM menu_bahan mb
         JOIN bahan_baku b ON b.id = mb.bahan_baku_id
         WHERE mb.menu_id IN (${mph})`,
          menuIds
        );

        for (const br of bahanRows) {
          const porsi = menuPorsiMap[br.menu_id] || 0;
          if (!porsi) continue;
          const beratBersih = Number(br.jumlah) * porsi;
          const spRefBdd = spRefByName[(br.nama || '').trim().toLowerCase()];
          const bdd = spRefBdd || Number(br.persen_bdd) || 100;
          const beratKotor = bdd > 0 ? beratBersih / (bdd / 100) : beratBersih;

          const key = br.bahan_baku_id;
          if (!agg[key]) {
            agg[key] = { bahan_baku_id: br.bahan_baku_id, nama: br.nama, satuan: br.satuan || 'g', harga_satuan: Number(br.harga_satuan) || 0, berat_per_satuan: Number(br.berat_per_satuan) || 0, berat_1_sp: Number(br.berat_1_sp) || 0, kategori_sp: br.kategori_sp, buffer_persen: Number(br.buffer_persen) || 10, total_berat_kotor: 0 };
          }
          agg[key].total_berat_kotor += beratKotor;
        }
      }

      // --- B. Grid-based ingredients ---
      // Hanya dipakai jika siklus ini TIDAK punya menu (resep)
      if (items.length === 0) {          const [gridBahanRaw] = await db.query(
          `SELECT smib.hari_ke, smib.kategori_sp, smib.bahan_baku_id,
                  bb.nama, bb.satuan, bb.harga_satuan, bb.persen_bdd, bb.berat_1_sp, bb.berat_per_satuan,
                  bb.kategori_sp AS bb_kategori_sp,
                  COALESCE(bb.buffer_persen, 10) AS buffer_persen
           FROM siklus_menu_item_bahan smib
           JOIN bahan_baku bb ON bb.id=smib.bahan_baku_id
           WHERE smib.siklus_id=?`,
          [s.id]
        );

        if (gridBahanRaw.length) {
          hasItems = true;

          const spSql = jenjangList.length === 1
            ? 'SELECT kategori_sp, sp_value FROM standar_sp WHERE jenjang=?'
            : `SELECT kategori_sp, MAX(sp_value) AS sp_value FROM standar_sp WHERE jenjang IN (${jenjangList.map(() => '?').join(',')}) GROUP BY kategori_sp`;
          const [spRows] = await db.query(spSql, jenjangList.length === 1 ? [jenjangList[0]] : jenjangList);
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
            if (spVal <= 0 || berat1Sp <= 0) continue;

            const cellKey = gb.hari_ke + '-' + gb.kategori_sp;
            const bagi = cellCount[cellKey] || 1;
            const spPerBahan = spVal / bagi;
            const beratBersih = berat1Sp * spPerBahan * penerimaCount;
            const spRefBdd = spRefByName[(gb.nama || '').trim().toLowerCase()];
            const bdd = spRefBdd || Number(gb.persen_bdd || 100);
            const beratKotor = bdd > 0 ? beratBersih / (bdd / 100) : beratBersih;

            const key = gb.bahan_baku_id;
            if (!agg[key]) {
              agg[key] = { bahan_baku_id: gb.bahan_baku_id, nama: gb.nama, satuan: gb.satuan || 'g', harga_satuan: Number(gb.harga_satuan) || 0, berat_per_satuan: Number(gb.berat_per_satuan) || 0, berat_1_sp: Number(gb.berat_1_sp) || 0, kategori_sp: gb.bb_kategori_sp, buffer_persen: Number(gb.buffer_persen) || 10, total_berat_kotor: 0 };
            }
            agg[key].total_berat_kotor += beratKotor;
          }
        }
      }
    }

    if (!hasItems) {
      return res.status(400).json({ error: 'Tidak ada menu atau bahan di siklus yang dipilih' });
    }

    // Format items — internal gram → konversi ke satuan display
    const poItems = Object.values(agg).filter(b => b.total_berat_kotor > 0).map(b => {
      let qty = b.total_berat_kotor;
      let satuan = b.satuan || 'g';

      const isGramSatuan = ['gram', 'g', 'gr', 'kg'].includes(satuan.toLowerCase());

      if (isGramSatuan) {
        // Satuan gram/kg → konversi ke kg
        qty = Math.round(qty / 1000 * 100) / 100;
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
          // Fallback ke kg jika tidak ada info berat per unit
          qty = Math.round(qty / 1000 * 100) / 100;
          satuan = 'kg';
        }
      }

      const bp = b.buffer_persen || 10;
      const buffer = Math.round(qty * (1 + bp / 100) * 100) / 100;
      return {
        bahan_baku_id: b.bahan_baku_id,
        bahan_nama: b.nama,
        satuan,
        qty,
        qty_buffer: buffer,
        harga_satuan: b.harga_satuan,
        subtotal: Math.round(buffer * b.harga_satuan),
      };
    }).filter(i => i.qty > 0);

    if (!poItems.length) return res.status(400).json({ error: 'Tidak ada bahan yang perlu dibeli' });

    // Buat PR
    const totalNilai = poItems.reduce((s, i) => s + i.subtotal, 0);
    const noPr = `PR/${Date.now().toString(36).toUpperCase()}`;
    const siklusRef = siklusList.map(s => s.nama).join(', ');

    await db.query(
      `INSERT INTO purchase_order (tenant_id, no_po, tanggal, supplier_nama, item, total_nilai, status, catatan)
       VALUES (?, ?, CURDATE(), ?, ?, ?, 'Draft', ?)`,
      [t, noPr, 'PR Otomatis dari Siklus',
       JSON.stringify(poItems), totalNilai,
       `Dibuat otomatis dari siklus: ${siklusRef}`]
    );

    res.json({
      ok: true,
      no_pr: noPr,
      total_items: poItems.length,
      total_nilai: totalNilai,
      siklus_refs: siklusList.map(s => s.nama),
      items: poItems,
    });
  } catch (err) {
    console.error('Create PR error:', err);
    res.status(500).json({ error: 'Gagal membuat PR: ' + err.message });
  }
});


// ====================================================================
// TASK 5: Laporan Biaya Produksi per Siklus
// Endpoint ini mengembalikan estimasi biaya bahan baku per siklus
// ====================================================================
router.get('/laporan/biaya-produksi', async (req, res) => {
  try {
    const t = req.user.tenant_id;

    // Ambil semua siklus (hanya Aktif)
    const [siklusList] = await db.query(
      'SELECT id, nama, kategori_penerima, jumlah_porsi, total_hari FROM siklus_menu WHERE tenant_id=? AND status="Aktif" ORDER BY id',
      [t]
    );

    const result = [];
    let grandTotal = 0;
    let grandTotalPorsi = 0;

    for (const s of siklusList) {
      const [items] = await db.query(
        `SELECT si.*, m.nama as menu_nama_lengkap, m.gramasi_total
         FROM siklus_menu_item si
         LEFT JOIN menu m ON m.id = si.menu_id
         WHERE si.siklus_id=? AND si.menu_id IS NOT NULL
         ORDER BY si.hari_ke ASC`,
        [s.id]
      );

      if (!items.length) continue;

      let totalBiaya = 0;
      const menuIds = [...new Set(items.filter(it => it.menu_id).map(it => it.menu_id))];

      // Ambil komposisi bahan + harga
      const menuBahanMap = {};
      if (menuIds.length) {
        const mph = menuIds.map(() => '?').join(',');
        const [bahanRows] = await db.query(
          `SELECT mb.menu_id, b.nama, b.satuan, b.harga_satuan, mb.jumlah
           FROM menu_bahan mb
           JOIN bahan_baku b ON b.id = mb.bahan_baku_id
           WHERE mb.menu_id IN (${mph})`,
          menuIds
        );
        for (const br of bahanRows) {
          if (!menuBahanMap[br.menu_id]) menuBahanMap[br.menu_id] = [];
          menuBahanMap[br.menu_id].push(br);
        }
      }

      // Hitung biaya per hari
      const biayaPerHari = [];
      for (const it of items) {
        const porsi = Number(it.jumlah_porsi) || 0;
        if (!porsi || !it.menu_id) continue;
        const bahanList = menuBahanMap[it.menu_id] || [];
        let biayaHari = 0;
        for (const b of bahanList) {
          biayaHari += (Number(b.jumlah) || 0) * porsi * (Number(b.harga_satuan) || 0);
        }
        biayaPerHari.push({ hari_ke: it.hari_ke, hari_nama: it.hari_nama, menu_nama: it.menu_nama || it.menu_nama_lengkap || '', biaya: Math.round(biayaHari), porsi });
        totalBiaya += biayaHari;
      }

      const totalPorsi = items.reduce((s, it) => s + (Number(it.jumlah_porsi) || 0), 0);
      grandTotal += totalBiaya;
      grandTotalPorsi += totalPorsi;

      result.push({
        id: s.id,
        nama: s.nama,
        kategori_penerima: s.kategori_penerima,
        total_hari: s.total_hari || items.length,
        total_porsi: totalPorsi,
        total_biaya: Math.round(totalBiaya),
        rata_biaya_per_hari: items.length ? Math.round(totalBiaya / items.length) : 0,
        biaya_per_porsi: totalPorsi ? Math.round(totalBiaya / totalPorsi) : 0,
        rincian_hari: biayaPerHari,
      });
    }

    res.json({
      siklus: result,
      ringkasan: {
        total_siklus: result.length,
        grand_total_biaya: Math.round(grandTotal),
        grand_total_porsi: grandTotalPorsi,
        rata_biaya_per_siklus: result.length ? Math.round(grandTotal / result.length) : 0,
      }
    });
  } catch (err) {
    console.error('Laporan biaya produksi error:', err);
    res.status(500).json({ error: 'Gagal memuat laporan biaya produksi' });
  }
});

// ====================================================================
// P1: Terima Barang — update stok otomatis
// ====================================================================

/**
 * POST /purchase_order/:id/terima
 * Menerima barang PO → update stok otomatis
 */
router.post('/purchase_order/:id/terima', async (req, res) => {
  try {
    const id = req.params.id;
    const t = req.user.tenant_id;
    
    // Ambil data PO
    const [[po]] = await db.query('SELECT * FROM purchase_order WHERE id=? AND tenant_id=?', [id, t]);
    if (!po) return res.status(404).json({ error: 'PO tidak ditemukan' });
    if (po.status === 'Diterima') return res.status(400).json({ error: 'PO sudah diterima sebelumnya' });
    
    // Parse items
    let items = [];
    try { items = JSON.parse(po.item); } catch { items = []; }
    if (!items.length) return res.status(400).json({ error: 'PO tidak memiliki item' });
    
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      
      const hasil = [];
      for (const item of items) {
        const namaBahan = item.nama || item.bahan_nama || '';
        const qty = Number(item.qty || item.qty_buffer || item.total_qty || 0);
        const satuan = item.satuan || 'kg';
        
        if (!namaBahan || qty <= 0) {
          hasil.push({ nama: namaBahan || '?', status: 'skip', alasan: 'qty 0' });
          continue;
        }
        
        // Cari bahan_baku_id
        let bahanBakuId = Number(item.bahan_baku_id) || 0;
        if (!bahanBakuId) {
          const [[bb]] = await conn.query('SELECT id FROM bahan_baku WHERE tenant_id=? AND nama=?', [t, namaBahan]);
          if (bb) bahanBakuId = bb.id;
        }
        
        if (!bahanBakuId) {
          hasil.push({ nama: namaBahan, status: 'skip', alasan: 'bahan tidak ditemukan di master' });
          continue;
        }
        
        // Konversi qty ke gram jika satuan = kg
        let qtyGram = qty;
        if (['kg', 'kilogram'].includes(satuan.toLowerCase())) {
          qtyGram = qty * 1000;
        }
        
        // 1. Update stok_saat_ini di bahan_baku
        await conn.query(
          'UPDATE bahan_baku SET stok_saat_ini = COALESCE(stok_saat_ini, 0) + ? WHERE id=? AND tenant_id=?',
          [qtyGram, bahanBakuId, t]
        );
        
        // 2. Insert ke stok_masuk
        await conn.query(
          'INSERT INTO stok_masuk (tenant_id, tanggal, bahan_baku_id, jumlah, sumber, catatan) VALUES (?, CURDATE(), ?, ?, ?, ?)',
          [t, bahanBakuId, qtyGram, 'PO: ' + (po.no_po || ''), 'Penerimaan dari PO #' + id]
        );
        
        // 3. Update harga_satuan jika ada harga baru
        const harga = Number(item.harga || item.harga_satuan || 0);
        if (harga > 0) {
          // Simpan harga lama ke harga_sebelumnya, update harga_satuan
          await conn.query(
            'UPDATE bahan_baku SET harga_sebelumnya = harga_satuan, harga_satuan = ? WHERE id=? AND tenant_id=?',
            [harga, bahanBakuId, t]
          );
        }
        
        hasil.push({ nama: namaBahan, qty: qtyGram, satuan: 'g', status: 'ok' });
      }
      
      // Update status PO
      await conn.query('UPDATE purchase_order SET status=? WHERE id=? AND tenant_id=?', ['Diterima', id, t]);
      
      // Insert ke penerimaan_barang
      const noDokumen = 'PB-' + (po.no_po || id);
      await conn.query(
        'INSERT INTO penerimaan_barang (tenant_id, no_dokumen, tanggal_terima, supplier_id, supplier_nama, ref_po, item, total_nilai, status_qc, catatan) VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?)',
        [t, noDokumen, po.supplier_id || null, po.supplier_nama || '', po.no_po || '', po.item, po.total_nilai || 0, 'Lolos', 'Penerimaan otomatis dari PO']
      );
      
      await conn.commit();
      
      const sukses = hasil.filter(h => h.status === 'ok').length;
      const gagal = hasil.filter(h => h.status === 'skip').length;
      res.json({
        ok: true,
        message: `${sukses} bahan diterima, ${gagal} gagal`,
        detail: hasil,
        no_dokumen: noDokumen,
      });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('Terima PO error:', e);
    res.status(500).json({ error: 'Gagal menerima PO: ' + e.message });
  }
});

module.exports = router;
