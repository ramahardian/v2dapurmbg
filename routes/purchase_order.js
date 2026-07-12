const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('admin', 'keuangan', 'ahli_gizi'));

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

    // ====================================================================
    // 1. KUMPULKAN DATA DARI SIKLUS MENU ITEM (menu composition)
    // ====================================================================
    const dayRows = [];
    const siklusJenjangMap = {};
    for (const s of siklusList) {
      siklusJenjangMap[s.id] = s.kategori_penerima || '';
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
                b.persen_bdd, b.kode as kode, mb.jumlah, mb.menu_id
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
          agg[key] = { bahan_baku_id: br.bahan_baku_id, bahan_nama: br.bahan_nama, kode: br.kode || '', satuan: br.satuan, persen_bdd: Number(br.persen_bdd) || 100, harga_satuan: Number(br.harga_satuan) || 0, total_qty: 0 };
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
      // Ambil semua grid item untuk siklus yang dipilih
      const [gridBahan] = await db.query(
        `SELECT smib.siklus_id, smib.hari_ke, smib.kategori_sp, smib.bahan_baku_id,
                 bb.nama as bahan_nama, bb.satuan, bb.harga_satuan, bb.persen_bdd, bb.berat_1_sp,
                 bb.kode as kode, bb.kategori_sp as bb_kategori_sp,
                smi.jumlah_porsi, sm.kategori_penerima
         FROM siklus_menu_item_bahan smib
         JOIN siklus_menu_item smi ON smi.siklus_id=smib.siklus_id AND smi.hari_ke=smib.hari_ke
         JOIN siklus_menu sm ON sm.id=smib.siklus_id
         JOIN bahan_baku bb ON bb.id=smib.bahan_baku_id
         WHERE smib.siklus_id IN (${ph})
         AND sm.tenant_id=?`,
        [...siklus_ids, req.user.tenant_id]
      );

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
          const jumlahPorsi = Number(gb.jumlah_porsi) || 0;
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
    // Ambil id_koperasi untuk mapping
    const bahanIds = Object.keys(agg);
    const idKoperasiMap = {};
    if (bahanIds.length) {
      const [rows] = await db.query(
        `SELECT id, id_koperasi FROM bahan_baku WHERE id IN (${bahanIds.map(() => '?').join(',')}) AND tenant_id=?`,
        [...bahanIds, req.user.tenant_id]
      );
      for (const r of rows) {
        idKoperasiMap[r.id] = r.id_koperasi;
      }
    }

    const items = Object.values(agg).map(b => {
      let qty = b.total_qty;
      let satuan = b.satuan;
      if (['gram', 'g', 'gr'].includes(b.satuan?.toLowerCase())) {
        qty = qty / 1000;
        satuan = 'kg';
      }
      const buffer = Math.round(qty * 1.1 * 100) / 100;
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

module.exports = router;
