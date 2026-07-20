const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  JENJANG_ORDER, KATEGORI_SP, mapJenjang, hitungSP, getSpMapByJenjang, getSpMapByJenjangList, fmtNum
} = require('../services/spBddCalculator');

const router = express.Router();
router.use(requireAuth);

// GET /sp/standar - get all standar SP values
router.get('/sp/standar', requireRole('admin', 'ahli_gizi'), async (req, res) => {
  const [rows] = await db.query('SELECT * FROM standar_sp ORDER BY FIELD(jenjang, ?), FIELD(kategori_sp, ?)', [JENJANG_ORDER.join(','), KATEGORI_SP.join(',')]);
  res.json(rows);
});

// GET /sp/standar/:jenjang - get SP values for a specific jenjang
router.get('/sp/standar/:jenjang', async (req, res) => {
  const [rows] = await db.query('SELECT kategori_sp, sp_value FROM standar_sp WHERE jenjang=?', [req.params.jenjang]);
  res.json(rows);
});

// PUT /sp/standar/:id - update a standar SP value
router.put('/sp/standar/:id', requireRole('admin', 'ahli_gizi'), async (req, res) => {
  const { sp_value } = req.body;
  if (sp_value === undefined) return res.status(400).json({ error: 'sp_value wajib diisi' });
  await db.query('UPDATE standar_sp SET sp_value=? WHERE id=?', [sp_value, req.params.id]);
  const [[row]] = await db.query('SELECT * FROM standar_sp WHERE id=?', [req.params.id]);
  res.json(row);
});

// POST /sp/hitung - calculate SP-based ingredient amounts for a given menu and jenjang
// Body: { menu_id, jenjang? (optional, uses menu's kategori_penerima if not provided) }
router.post('/sp/hitung', requireRole('admin', 'ahli_gizi'), async (req, res) => {
  const { menu_id, jenjang } = req.body;
  if (!menu_id) return res.status(400).json({ error: 'menu_id wajib diisi' });

  const [[menu]] = await db.query(
    'SELECT * FROM menu WHERE id=? AND tenant_id=?',
    [menu_id, req.user.tenant_id]
  );
  if (!menu) return res.status(404).json({ error: 'Menu tidak ditemukan' });

  const targetJenjang = mapJenjang(jenjang || menu.kategori_penerima);
  if (!targetJenjang) return res.status(400).json({ error: 'Jenjang tidak dikenal: ' + (jenjang || menu.kategori_penerima) });

  const [bahan] = await db.query(
    `SELECT mb.id as menu_bahan_id, mb.bahan_baku_id, mb.jumlah as jumlah_existing,
            b.nama, b.kategori_sp, b.berat_1_sp, b.persen_bdd
     FROM menu_bahan mb
     JOIN bahan_baku b ON b.id = mb.bahan_baku_id
     WHERE mb.menu_id=?`,
    [menu_id]
  );

  const spMap = await getSpMapByJenjang(targetJenjang);

  const result = bahan.map(b => {
    const h = hitungSP(b, spMap);
    return {
      bahan_baku_id: b.bahan_baku_id,
      nama: b.nama,
      kategori_sp: b.kategori_sp,
      sp_value: h.sp_value,
      berat_1_sp: h.berat_1_sp,
      berat_bersih: h.berat_bersih,
      persen_bdd: h.persen_bdd,
      berat_kotor: h.berat_kotor,
    };
  });

  res.json({
    menu_id: Number(menu_id),
    menu_nama: menu.nama,
    jenjang: targetJenjang,
    jumlah_porsi: Number(menu.jumlah_porsi) || 0,
    bahan: result,
  });
});

// POST /sp/hitung-kebutuhan - calculate total kebutuhan from siklus
// Body: { siklus_ids: number[], jumlah_penerima: number }
router.post('/sp/hitung-kebutuhan', requireRole('admin', 'ahli_gizi', 'keuangan'), async (req, res) => {
  const { siklus_ids, jumlah_penerima } = req.body;
  if (!siklus_ids || !Array.isArray(siklus_ids) || !siklus_ids.length) {
    return res.status(400).json({ error: 'Pilih minimal satu siklus' });
  }

  const ph = siklus_ids.map(() => '?').join(',');
  const [siklusList] = await db.query(
    `SELECT id, nama, kategori_penerima, jumlah_porsi FROM siklus_menu WHERE tenant_id=? AND id IN (${ph})`,
    [req.user.tenant_id, ...siklus_ids]
  );

  const dayRows = [];
  for (const s of siklusList) {
    const [items] = await db.query(
      `SELECT si.*, m.kategori_penerima as menu_kat FROM siklus_menu_item si
       LEFT JOIN menu m ON m.id = si.menu_id
       WHERE si.siklus_id=? AND si.menu_id IS NOT NULL`,
      [s.id]
    );
    for (const it of items) {
      dayRows.push({
        menu_id: it.menu_id,
        jumlah_porsi: Number(it.jumlah_porsi) || 0,
        kategori_db: it.menu_kat || s.kategori_penerima,
      });
    }
  }

  const menuIds = [...new Set(dayRows.map(r => r.menu_id))];
  if (!menuIds.length) {
    return res.json({ bahan: [], siklus_refs: siklusList.map(s => s.nama) });
  }

  const mph = menuIds.map(() => '?').join(',');
  const [bahanRows] = await db.query(
    `SELECT mb.menu_id, mb.bahan_baku_id, mb.jumlah as jumlah_existing,
            b.nama, b.kategori_sp, b.berat_1_sp, b.persen_bdd, b.satuan
     FROM menu_bahan mb
     JOIN bahan_baku b ON b.id = mb.bahan_baku_id
     WHERE mb.menu_id IN (${mph})`,
    menuIds
  );

  const menuBahanMap = {};
  for (const br of bahanRows) {
    if (!menuBahanMap[br.menu_id]) menuBahanMap[br.menu_id] = [];
    menuBahanMap[br.menu_id].push(br);
  }

  // Get all SP standards needed
  const allJenjang = [...new Set(dayRows.map(r => mapJenjang(r.kategori_db)))].filter(Boolean);
  const spMap = await getSpMapByJenjangList(allJenjang);

  const penerima = jumlah_penerima || 0;
  const agg = {};

  for (const day of dayRows) {
    const jenjang = mapJenjang(day.kategori_db);
    const spValues = spMap[jenjang] || {};
    const bahanList = menuBahanMap[day.menu_id] || [];

    for (const b of bahanList) {
      const h = hitungSP(b, spValues);
      const key = b.bahan_baku_id;
      if (!agg[key]) {
        agg[key] = {
          bahan_baku_id: b.bahan_baku_id,
          nama: b.nama,
          satuan: b.satuan || 'g',
          kategori_sp: b.kategori_sp,
          berat_1_sp: h.berat_1_sp,
          sp_value: h.sp_value,
          persen_bdd: h.persen_bdd,
          berat_bersih: h.berat_bersih,
          berat_kotor: h.berat_kotor,
          total_berat_kotor: 0,
        };
      }
      agg[key].total_berat_kotor += h.berat_kotor * day.jumlah_porsi;
    }
  }

  const items = Object.values(agg).map(b => ({
    ...b,
    kebutuhan_kg: fmtNum(b.total_berat_kotor / 1000),
    total_berat_kotor: b.total_berat_kotor,
  }));

  res.json({
    items,
    total_kebutuhan_kg: items.reduce((s, i) => s + parseFloat(i.kebutuhan_kg), 0).toFixed(2),
    siklus_refs: siklusList.map(s => s.nama),
    jumlah_penerima: penerima,
  });
});

module.exports = router;
