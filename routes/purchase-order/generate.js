/**
 * GENERATE FROM SIKLUS
 * POST /purchase_order/generate-from-siklus
 * Menghasilkan estimasi kebutuhan bahan baku (PO items) dari siklus terpilih.
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
  isGramSatuan,
} = require('./helpers');

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

      const agg = {};

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

        // Load data siklus
        const items = await loadSiklusItems(siklusId);
        if (!items.length) continue;

        // Load menu_bahan per menu_id
        const menuIds = [...new Set(items.map(it => it.menu_id).filter(Boolean))];
        const menuBahanById = await loadMenuBahan(menuIds);

        // LOOP PER JENJANG
        for (const jDisplay of matchingDisplay) {
          const porsiCount = pmMap[jDisplay].total_penerima;
          if (!porsiCount) continue;

          // Load SP spesifik untuk jenjang ini
          const spMap = await loadSpMap([jDisplay]);

          // Menu-based calculation
          for (const it of items) {
            const brList = menuBahanById[it.menu_id] || [];
            for (const br of brList) {
              const spVal = br.kategori_sp ? (spMap[br.kategori_sp] || 0) : 0;
              const actualSp = spVal || 1;
              const beratBersih = Number(br.jumlah) * actualSp * porsiCount;
              const bdd = Number(br.persen_bdd) || 100;
              const beratKotor = bdd > 0 ? Math.round((beratBersih / (bdd / 100)) * 100) / 100 : beratBersih;

              const key = br.bahan_baku_id;
              if (!agg[key]) {
                agg[key] = {
                  bahan_baku_id: br.bahan_baku_id, bahan_nama: br.nama,
                  kode: br.kode || '', satuan: br.satuan,
                  persen_bdd: bdd, harga_satuan: Number(br.harga_satuan) || 0,
                  kategori_sp: br.kategori_sp,
                  berat_per_satuan: Number(br.berat_per_satuan) || 0,
                  berat_1_sp: Number(br.berat_1_sp) || 0,
                  total_qty: 0, total_porsi: 0, non_gram: false,
                };
              }
              agg[key].total_qty += beratKotor;
              if (!isGramSatuan(br.satuan)) {
                agg[key].total_porsi += porsiCount;
                agg[key].non_gram = true;
              }
            }
          }
        }
      }

      // FORMAT OUTPUT
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
}

module.exports = { registerGenerateRoutes };
