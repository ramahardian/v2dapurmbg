const express = require('express');
const db = require('../../db');
const { parseKategoriPenerima, expandJenjangToDbValues, batchLoadItems, batchLoadMenuBahan, batchLoadGridBahanBySiklus, hitungEstimasiGiziManual } = require('./helpers');
const { hitungBDD } = require('../../services/spBddCalculator');

const router = express.Router();

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

  // Calculate hari_ke from tanggal_mulai
  if (!siklus.tanggal_mulai) return res.status(400).json({ error: 'Siklus belum memiliki tanggal_mulai' });
  const startDate = new Date(siklus.tanggal_mulai);
  const prodDate = new Date(tanggal_produksi);
  const diffDays = Math.floor((prodDate - startDate) / (1000 * 60 * 60 * 24));
  const hariKe = (diffDays % (siklus.total_hari || 7)) + 1;

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

    // Calculate hari_ke
    if (!siklus.tanggal_mulai) { cur.setDate(cur.getDate() + 1); continue; }
    const siklusStart = new Date(siklus.tanggal_mulai);
    const diffDays = Math.floor((cur - siklusStart) / (1000 * 60 * 60 * 24));
    const hariKe = (diffDays % (siklus.total_hari || 7)) + 1;

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

  // Determine working days in month
  const [year, month] = periode.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  let workingDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0) workingDays++; // Exclude Sundays
  }

  // Get budget rate from existing budget or use default
  const [existingBudget] = await db.query(
    'SELECT * FROM budget WHERE tenant_id=? AND periode=? AND kategori_penerima=?',
    [req.user.tenant_id, periode, siklus.kategori_penerima || '-']
  );

  let hargaPerPorsi = 0;
  if (existingBudget.length) {
    hargaPerPorsi = Number(existingBudget[0].harga_per_porsi) || 0;
  } else {
    // Try to get from reference
    const [refBudget] = await db.query('SELECT harga_per_porsi FROM budget WHERE tenant_id=? AND kategori_penerima=? LIMIT 1', [req.user.tenant_id, siklus.kategori_penerima || '-']);
    if (refBudget.length) hargaPerPorsi = Number(refBudget[0].harga_per_porsi) || 0;
  }

  const jumlahPorsi = Number(siklus.jumlah_porsi) || 0;
  const totalBudget = workingDays * jumlahPorsi * hargaPerPorsi;

  if (existingBudget.length) {
    await db.query(
      'UPDATE budget SET jumlah_penerima=?, harga_per_porsi=?, total_budget=? WHERE id=? AND tenant_id=?',
      [jumlahPorsi, hargaPerPorsi, totalBudget, existingBudget[0].id, req.user.tenant_id]
    );
  } else {
    await db.query(
      'INSERT INTO budget (tenant_id, periode, kategori_penerima, jumlah_penerima, harga_per_porsi, total_budget) VALUES (?,?,?,?,?,?)',
      [req.user.tenant_id, periode, siklus.kategori_penerima || '-', jumlahPorsi, hargaPerPorsi, totalBudget]
    );
  }

  res.json({ ok: true, message: 'Budget ' + periode + ' untuk ' + siklus.nama + ': Rp ' + totalBudget.toLocaleString('id-ID') });
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

  const [year, month] = periode.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  let workingDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0) workingDays++;
  }

  // Load existing budgets for this period
  const [existingBudgets] = await db.query('SELECT * FROM budget WHERE tenant_id=? AND periode=?', [req.user.tenant_id, periode]);
  const budgetMap = {};
  for (const b of existingBudgets) budgetMap[b.kategori_penerima] = b;

  // Load reference prices
  const [refs] = await db.query('SELECT kategori_penerima, harga_per_porsi FROM budget WHERE tenant_id=? GROUP BY kategori_penerima', [req.user.tenant_id]);
  const refMap = {};
  for (const r of refs) refMap[r.kategori_penerima] = Number(r.harga_per_porsi) || 0;

  let updated = 0;
  for (const s of siklusList) {
    const kat = s.kategori_penerima || '-';
    const jumlahPorsi = Number(s.jumlah_porsi) || 0;
    const hargaPerPorsi = refMap[kat] || 0;
    const totalBudget = workingDays * jumlahPorsi * hargaPerPorsi;

    if (budgetMap[kat]) {
      await db.query('UPDATE budget SET jumlah_penerima=?, harga_per_porsi=?, total_budget=? WHERE id=?', [jumlahPorsi, hargaPerPorsi, totalBudget, budgetMap[kat].id]);
    } else {
      await db.query('INSERT INTO budget (tenant_id, periode, kategori_penerima, jumlah_penerima, harga_per_porsi, total_budget) VALUES (?,?,?,?,?,?)', [req.user.tenant_id, periode, kat, jumlahPorsi, hargaPerPorsi, totalBudget]);
    }
    updated++;
  }

  res.json({ ok: true, message: updated + ' budget berhasil dihitung', updated });
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
          bahanTotal[br.bahan_baku_id] = { nama: br.nama, satuan: br.satuan, total: 0, harga_satuan: Number(br.harga_satuan) || 0, buffer_persen: Number(br.buffer_persen) || 0 };
        }
        const dailyNeed = hitungBDD(Number(br.jumlah) * porsiPerHari, br.persen_bdd);
        bahanTotal[br.bahan_baku_id].total += dailyNeed * workingDays;
      }
    }

    // Grid-based ingredients
    const gridBahan = gridBahanBySiklus[s.id] || [];
    for (const g of gridBahan) {
      if (!bahanTotal[g.bahan_baku_id]) {
        bahanTotal[g.bahan_baku_id] = { nama: g.nama || '(bahan dihapus)', satuan: g.satuan || 'g', total: 0, harga_satuan: 0, buffer_persen: Number(g.buffer_persen) || 0 };
      }
      const dailyNeed = hitungBDD(Number(g.berat_1_sp || 0) * porsiPerHari, g.persen_bdd);
      bahanTotal[g.bahan_baku_id].total += dailyNeed * workingDays;
    }
  }

  // Map id_koperasi from bahan_baku
  const bahanIds = Object.keys(bahanTotal).map(Number);
  if (bahanIds.length) {
    const ph = bahanIds.map(() => '?').join(',');
    const [bahanRefs] = await db.query(`SELECT id, id_koperasi, COALESCE(buffer_persen, 10) AS buffer_persen FROM bahan_baku WHERE id IN (${ph}) AND tenant_id=?`, [...bahanIds, req.user.tenant_id]);
    for (const ref of bahanRefs) {
      if (bahanTotal[ref.id]) {
        bahanTotal[ref.id].id_koperasi = ref.id_koperasi;
        bahanTotal[ref.id].buffer_persen = Number(ref.buffer_persen) || 10;
      }
    }
  }

  // Build PR items array
  const items = Object.entries(bahanTotal)
    .filter(([, v]) => v.total > 0)
    .map(([id, v]) => {
      const buffer = 1 + (v.buffer_persen / 100);
      const kebutuhanDenganBuffer = Math.round(v.total * buffer);
      const kg = v.satuan === 'Kg' || v.satuan === 'kg' ? kebutuhanDenganBuffer / 1000 : kebutuhanDenganBuffer;
      const subTotal = kg * v.harga_satuan;
      return {
        bahan_baku_id: Number(id),
        nama: v.nama,
        satuan: v.satuan,
        kebutuhan: Math.round(kebutuhanDenganBuffer * 100) / 100,
        kebutuhan_dengan_buffer: Math.round(kg * 100) / 100,
        harga_satuan: v.harga_satuan,
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

module.exports = router;
