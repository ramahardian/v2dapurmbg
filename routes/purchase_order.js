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

    const dayRows = [];
    for (const s of siklusList) {
      const [items] = await db.query(
        `SELECT si.*, m.gramasi_total FROM siklus_menu_item si
         LEFT JOIN menu m ON m.id = si.menu_id
         WHERE si.siklus_id=? AND si.menu_id IS NOT NULL`,
        [s.id]
      );
      for (const it of items) {
        dayRows.push({ siklus_id: s.id, siklus_nama: s.nama, menu_id: it.menu_id, jumlah_porsi: Number(it.jumlah_porsi) || 0 });
      }
    }

    const menuIds = [...new Set(dayRows.map(r => r.menu_id))];
    if (!menuIds.length) {
      return res.json({ items: [], total_estimated: 0, siklus_refs: siklusList.map(s => s.nama) });
    }

    const mph = menuIds.map(() => '?').join(',');
    const [bahanRows] = await db.query(
      `SELECT mb.bahan_baku_id, b.nama as bahan_nama, b.satuan, b.harga_satuan,
              mb.jumlah, mb.menu_id, m.kategori_penerima
       FROM menu_bahan mb
       JOIN bahan_baku b ON b.id = mb.bahan_baku_id
       JOIN menu m ON m.id = mb.menu_id
       WHERE mb.menu_id IN (${mph})`,
      menuIds
    );

    const menuPorsiMap = {};
    for (const r of dayRows) {
      if (!menuPorsiMap[r.menu_id]) menuPorsiMap[r.menu_id] = { total_porsi: 0, siklus: new Set() };
      menuPorsiMap[r.menu_id].total_porsi += r.jumlah_porsi;
      menuPorsiMap[r.menu_id].siklus.add(r.siklus_nama);
    }

    const agg = {};
    for (const br of bahanRows) {
      const porsi = menuPorsiMap[br.menu_id]?.total_porsi || 0;
      if (!porsi) continue;
      const key = br.bahan_baku_id;
      if (!agg[key]) {
        agg[key] = { bahan_baku_id: br.bahan_baku_id, bahan_nama: br.bahan_nama, satuan: br.satuan, harga_satuan: Number(br.harga_satuan) || 0, total_qty: 0 };
      }
      agg[key].total_qty += Number(br.jumlah) * porsi;
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
        bahan_nama: b.bahan_nama,
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
