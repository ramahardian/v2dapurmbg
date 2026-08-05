/**
 * GENERATE FROM SIKLUS
 * POST /purchase_order/generate-from-siklus
 * Menghasilkan estimasi kebutuhan bahan baku (PO items) dari siklus terpilih.
 *
 * Respons berisi:
 *   - items       : agregat seluruh menu/hari (kompatibilitas & ringkasan total)
 *   - menus       : breakdown per menu/hari — [{ hari_ke, menu_nama, jumlah_porsi, items, subtotal }]
 *                   dipakai frontend untuk memilih menu mana yang dijadikan PO (1 PO per menu).
 */
const db = require('../../db');
const {
  getJenjangList,
  createDbToDisplay,
  loadPmByJenjang,
  buildPmMap,
  loadSpMap,
  loadSiklusItems,
  loadMenuBahan,
  loadGridBahan,
  buildGridCellCount,
  isGramSatuan,
} = require('./helpers');

// Format agg (gram) → item PO display (kg/unit + buffer). Dipakai untuk grup & agregat.
function formatItems(aggMap, idKoperasiMap, bufferPersenMap) {
  return Object.values(aggMap)
    .filter(b => b.total_qty > 0)
    .map(b => {
      let qty = b.total_qty;
      let satuan = b.satuan;

      if (isGramSatuan(satuan)) {
        qty = qty / 1000;
        satuan = 'kg';
      } else {
        if (b.non_gram && b.total_porsi > 0) {
          qty = b.total_porsi;
        } else {
          const perUnitBerat = Number(b.berat_per_satuan) > 0 ? Number(b.berat_per_satuan) : 0;
          if (perUnitBerat > 0) {
            qty = Math.round(qty / perUnitBerat);
          } else {
            qty = Math.round(qty / 1000 * 100) / 100;
            satuan = 'kg';
          }
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
}

function registerGenerateRoutes(router) {
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

      const pmByJenjang = await loadPmByJenjang(req.user.tenant_id);
      const dbToDisplay = createDbToDisplay();
      const pmMap = buildPmMap(pmByJenjang, dbToDisplay);

      // SP Referensi Bahan untuk BDD (fallback persen BDD yang lebih akurat)
      const [spRefList] = await db.query(
        'SELECT nama, bdd_persen FROM sp_referensi_bahan WHERE tenant_id=?', [req.user.tenant_id]
      );
      const spRefByName = {};
      for (const r of spRefList) {
        spRefByName[r.nama.trim().toLowerCase()] = Math.round(Number(r.bdd_persen || 0) * 100);
      }

      const agg = {};    // agregat global (gram)
      const groupAggs = []; // agg per menu/hari

      for (const s of siklusList) {
        const siklusId = s.id;
        const jenjangList = getJenjangList(s.kategori_penerima);
        if (!jenjangList.length) continue;

        // Daftar display jenjang yang match dengan PM
        const matchingDisplay = [];
        for (const k of jenjangList) {
          const display = dbToDisplay[k] || k;
          if (pmMap[display]?.total_penerima > 0) matchingDisplay.push(display);
        }
        if (!matchingDisplay.length) continue;

        // Nama menu per hari (semua baris, termasuk yang tanpa menu_id)
        const [dayItems] = await db.query(
          'SELECT id, hari_ke, menu_id, menu_nama, jumlah_porsi FROM siklus_menu_item WHERE siklus_id=? ORDER BY hari_ke ASC',
          [siklusId]
        );
        const dayNamaMap = {};
        const dayPorsiMap = {};
        for (const d of dayItems) {
          dayNamaMap[d.hari_ke] = d.menu_nama || null;
          dayPorsiMap[d.hari_ke] = Number(d.jumlah_porsi) || 0;
        }

        // Load data siklus (menu-based)
        const items = await loadSiklusItems(siklusId);

        // Load menu_bahan per menu_id
        const menuIds = [...new Set(items.map(it => it.menu_id).filter(Boolean))];
        const menuBahanById = await loadMenuBahan(menuIds);

        // Load grid items (siklus tanpa menu assigned — bahan disimpan langsung di grid)
        let gridBahanRaw = [];
        if (items.length === 0) {
          gridBahanRaw = await loadGridBahan(siklusId);
        }
        const useGrid = gridBahanRaw.length > 0;
        const gridCellCount = useGrid ? buildGridCellCount(gridBahanRaw) : {};
        if (!items.length && !useGrid) continue;

        // Bangun group per menu (hari): menu-based → per siklus_menu_item; grid → per hari_ke
        const groups = [];
        if (items.length) {
          for (const it of items) {
            groups.push({
              hari_ke: it.hari_ke,
              menu_nama: it.menu_nama || dayNamaMap[it.hari_ke] || 'Menu Hari ' + it.hari_ke,
              jumlah_porsi: it.jumlah_porsi || dayPorsiMap[it.hari_ke] || s.jumlah_porsi || 0,
              type: 'menu',
              rows: menuBahanById[it.menu_id] || [],
            });
          }
        } else if (useGrid) {
          const gridByDay = {};
          for (const gb of gridBahanRaw) {
            if (!gridByDay[gb.hari_ke]) gridByDay[gb.hari_ke] = [];
            gridByDay[gb.hari_ke].push(gb);
          }
          for (const [hariStr, rows] of Object.entries(gridByDay)) {
            const hariKe = Number(hariStr);
            groups.push({
              hari_ke: hariKe,
              menu_nama: dayNamaMap[hariKe] || 'Menu Hari ' + hariKe,
              jumlah_porsi: dayPorsiMap[hariKe] || s.jumlah_porsi || 0,
              type: 'grid',
              rows,
            });
          }
        }

        // SP map per jenjang — tidak bergantung grup, muat sekali per siklus
        const spMapByDisplay = {};
        for (const jDisplay of matchingDisplay) {
          spMapByDisplay[jDisplay] = await loadSpMap([jDisplay]);
        }

        // LOOP PER MENU
        for (const grp of groups) {
          const grpAgg = {};

          // LOOP PER JENJANG
          for (const jDisplay of matchingDisplay) {
            const porsiCount = pmMap[jDisplay].total_penerima;
            if (!porsiCount) continue;
            const spMap = spMapByDisplay[jDisplay];

            if (grp.type === 'menu') {
              // Menu-based calculation
              for (const br of grp.rows) {
                const spVal = br.kategori_sp ? (spMap[br.kategori_sp] || 0) : 0;
                const actualSp = spVal || 1;
                const beratBersih = Number(br.jumlah) * actualSp * porsiCount;
                const bdd = Number(br.persen_bdd) || 100;
                const beratKotor = bdd > 0 ? Math.round((beratBersih / (bdd / 100)) * 100) / 100 : beratBersih;

                const key = br.bahan_baku_id;
                if (!grpAgg[key]) {
                  grpAgg[key] = {
                    bahan_baku_id: br.bahan_baku_id, bahan_nama: br.nama,
                    kode: br.kode || '', satuan: br.satuan,
                    persen_bdd: bdd, harga_satuan: Number(br.harga_satuan) || 0,
                    kategori_sp: br.kategori_sp,
                    berat_per_satuan: Number(br.berat_per_satuan) || 0,
                    berat_1_sp: Number(br.berat_1_sp) || 0,
                    total_qty: 0, total_porsi: 0, non_gram: false,
                  };
                }
                grpAgg[key].total_qty += beratKotor;
                if (!isGramSatuan(br.satuan)) {
                  grpAgg[key].total_porsi += porsiCount;
                  grpAgg[key].non_gram = true;
                }
              }
            } else {
              // Grid-based calculation
              for (const gb of grp.rows) {
                const spVal = spMap[gb.kategori_sp] || 0;
                const berat1Sp = Number(gb.berat_1_sp || 0);
                if (spVal <= 0 || berat1Sp <= 0) continue;

                const cellKey = gb.hari_ke + '-' + gb.kategori_sp;
                const bagi = gridCellCount[cellKey] || 1;
                const spPerBahan = spVal / bagi;
                const beratBersih = berat1Sp * spPerBahan * porsiCount;
                const spRefBdd = spRefByName[(gb.nama || '').trim().toLowerCase()];
                const bdd = spRefBdd || Number(gb.persen_bdd || 100);
                const beratKotor = bdd > 0 ? beratBersih / (bdd / 100) : beratBersih;

                const key = gb.bahan_baku_id;
                if (!grpAgg[key]) {
                  grpAgg[key] = {
                    bahan_baku_id: gb.bahan_baku_id, bahan_nama: gb.nama,
                    kode: gb.kode || '', satuan: gb.satuan,
                    persen_bdd: bdd, harga_satuan: Number(gb.harga_satuan) || 0,
                    kategori_sp: gb.bb_kategori_sp,
                    berat_per_satuan: Number(gb.berat_per_satuan) || 0,
                    berat_1_sp: berat1Sp,
                    total_qty: 0, total_porsi: 0, non_gram: false,
                  };
                }
                grpAgg[key].total_qty += beratKotor;
                if (!isGramSatuan(gb.satuan)) {
                  grpAgg[key].total_porsi += porsiCount;
                  grpAgg[key].non_gram = true;
                }
              }
            }
          }

          // Simpan agg grup ini (masih gram) untuk diformat belakangan
          if (Object.keys(grpAgg).length) {
            groupAggs.push({ meta: grp, agg: grpAgg });
          }

          // Gabungkan ke agregat global
          for (const [key, v] of Object.entries(grpAgg)) {
            if (!agg[key]) {
              agg[key] = { ...v };
            } else {
              agg[key].total_qty += v.total_qty;
              agg[key].total_porsi += v.total_porsi;
              agg[key].non_gram = agg[key].non_gram || v.non_gram;
            }
          }
        }
      }

      // Map id_koperasi & buffer_persen dari bahan_baku (satu query untuk semua bahan)
      const allBahanIds = Object.keys(agg);
      const idKoperasiMap = {};
      const bufferPersenMap = {};
      if (allBahanIds.length) {
        const [rows] = await db.query(
          `SELECT id, id_koperasi, COALESCE(buffer_persen, 10) AS buffer_persen FROM bahan_baku WHERE id IN (${allBahanIds.map(() => '?').join(',')}) AND tenant_id=?`,
          [...allBahanIds, req.user.tenant_id]
        );
        for (const r of rows) {
          idKoperasiMap[r.id] = r.id_koperasi;
          bufferPersenMap[r.id] = Number(r.buffer_persen) || 10;
        }
      }

      // Format agregat (kompatibilitas)
      const items = formatItems(agg, idKoperasiMap, bufferPersenMap);

      // Format per menu
      const menus = groupAggs
        .map(g => {
          const grpItems = formatItems(g.agg, idKoperasiMap, bufferPersenMap);
          return {
            hari_ke: g.meta.hari_ke,
            menu_nama: g.meta.menu_nama,
            jumlah_porsi: g.meta.jumlah_porsi,
            items: grpItems,
            subtotal: grpItems.reduce((s, i) => s + i.estimated_subtotal, 0),
          };
        })
        .filter(m => m.items.length > 0)
        .sort((a, b) => a.hari_ke - b.hari_ke);

      res.json({
        items,
        menus,
        total_estimated: items.reduce((s, i) => s + i.estimated_subtotal, 0),
        siklus_refs: siklusList.map(s => s.nama),
      });
    } catch (err) {
      console.error('Generate PO error:', err);
      res.status(500).json({ error: 'Gagal generate PO' });
    }
  });
}

module.exports = { registerGenerateRoutes };
