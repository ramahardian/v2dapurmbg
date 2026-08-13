/**
 * CREATE PR FROM SIKLUS
 * POST /purchase_order/create-pr-from-siklus
 * Membuat Purchase Request (PR) draft dari siklus terpilih,
 * termasuk perhitungan berbasis menu dan grid.
 */
const db = require('../../db');
const {
  getJenjangList,
  expandJenjang,
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

function registerCreatePrRoutes(router) {
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

      const pmByJenjang = await loadPmByJenjang(t);
      const dbToDisplay = createDbToDisplay();
      const pmMap = buildPmMap(pmByJenjang, dbToDisplay);

      // SP Referensi Bahan untuk BDD
      const [spRefList] = await db.query(
        'SELECT nama, bdd_persen FROM sp_referensi_bahan WHERE tenant_id=?', [t]
      );
      const spRefByName = {};
      for (const r of spRefList) {
        spRefByName[r.nama.trim().toLowerCase()] = Math.round(Number(r.bdd_persen || 0) * 100);
      }

      const agg = {};
      let hasItems = false;

      for (const s of siklusList) {
        const jenjangList = getJenjangList(s.kategori_penerima);
        if (!jenjangList.length) continue;

        const matchingDisplay = [];
        for (const k of jenjangList) {
          const display = dbToDisplay[k] || k;
          if (pmMap[display]?.total_penerima > 0) matchingDisplay.push(display);
        }
        if (!matchingDisplay.length) continue;

        // Load data siklus
        let items = await loadSiklusItems(s.id);
        if (items.length) hasItems = true;

        // Load menu_bahan per menu_id
        const menuIds = [...new Set(items.map(it => it.menu_id).filter(Boolean))];
        let menuBahanById = await loadMenuBahan(menuIds);

        // Load grid items (ketika tidak ada menu assigned)
        let gridBahanRaw = [];
        if (items.length === 0) {
          gridBahanRaw = await loadGridBahan(s.id);
        }
        const useGrid = gridBahanRaw.length > 0;
        if (useGrid) hasItems = true;

        const gridCellCount = useGrid ? buildGridCellCount(gridBahanRaw) : {};

        // LOOP PER JENJANG
        for (const jDisplay of matchingDisplay) {
          const porsiCount = pmMap[jDisplay].total_penerima;
          if (!porsiCount) continue;

          // Load SP spesifik untuk jenjang ini
          const spMap = await loadSpMap(t, [jDisplay]);

          // A. Menu-based calculation
          for (const it of items) {
            const brList = menuBahanById[it.menu_id] || [];
            for (const br of brList) {
              const spVal = br.kategori_sp ? (spMap[br.kategori_sp] || 0) : 0;
              const actualSp = spVal || 1;
              const beratBersih = Number(br.jumlah) * actualSp * porsiCount;
              const nonGramSatuan = !isGramSatuan(br.satuan);
              const spRefBdd = spRefByName[(br.nama || '').trim().toLowerCase()];
              const bdd = spRefBdd || Number(br.persen_bdd) || 100;
              const beratKotor = bdd > 0 ? beratBersih / (bdd / 100) : beratBersih;

              const key = br.bahan_baku_id;
              if (!agg[key]) {
                agg[key] = {
                  bahan_baku_id: br.bahan_baku_id, nama: br.nama,
                  satuan: br.satuan || 'g', harga_satuan: Number(br.harga_satuan) || 0,
                  berat_per_satuan: Number(br.berat_per_satuan) || 0,
                  berat_1_sp: Number(br.berat_1_sp) || 0,
                  kategori_sp: br.kategori_sp,
                  // Hati-hati: Number(0) || 10 = 10 (fallback menghapus buffer 0). Default kosong → 0.
                  buffer_persen: Number(br.buffer_persen) || 0,
                  total_berat_kotor: 0, total_porsi: 0, non_gram: false,
                };
              }
              agg[key].total_berat_kotor += beratKotor;
              if (nonGramSatuan) {
                agg[key].total_porsi += porsiCount;
                agg[key].non_gram = true;
              }
            }
          }

          // B. Grid-based calculation
          if (useGrid) {
            for (const gb of gridBahanRaw) {
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
              if (!agg[key]) {
                agg[key] = {
                  bahan_baku_id: gb.bahan_baku_id, nama: gb.nama,
                  satuan: gb.satuan || 'g', harga_satuan: Number(gb.harga_satuan) || 0,
                  berat_per_satuan: Number(gb.berat_per_satuan) || 0,
                  berat_1_sp: Number(gb.berat_1_sp) || 0,
                  kategori_sp: gb.bb_kategori_sp,
                  // Hati-hati: Number(0) || 10 = 10 (fallback menghapus buffer 0). Default kosong → 0.
                  buffer_persen: Number(gb.buffer_persen) || 0,
                  total_berat_kotor: 0, total_porsi: 0, non_gram: false,
                };
              }
              agg[key].total_berat_kotor += beratKotor;
              if (!isGramSatuan(gb.satuan)) {
                agg[key].total_porsi += porsiCount;
                agg[key].non_gram = true;
              }
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

        if (isGramSatuan(satuan)) {
          qty = Math.round(qty / 1000 * 100) / 100;
          satuan = 'kg';
        } else {
          const perUnitBerat = Number(b.berat_per_satuan) > 0 ? Number(b.berat_per_satuan) : 0;
          if (perUnitBerat > 0) {
            qty = Math.round(qty / perUnitBerat);
          } else if (b.non_gram && b.total_porsi > 0) {
            qty = b.total_porsi;
          } else {
            qty = Math.round(qty / 1000 * 100) / 100;
            satuan = 'kg';
          }
        }

        const bp = b.buffer_persen || 0;
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
        [t, noPr, 'PR Otomatis dari Siklus', JSON.stringify(poItems), totalNilai,
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
}

module.exports = { registerCreatePrRoutes };
