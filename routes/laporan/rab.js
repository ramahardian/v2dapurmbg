/**
 * LAPORAN RAB (Rencana Anggaran Biaya)
 * Module untuk endpoint laporan RAB dan budgeting.
 */
const db = require('../../db');
const path = require('path');
const ExcelJS = require('exceljs');
const { requireRole } = require('../../middleware/auth');
const { roleFinance, roleOps } = require('./config');
const { hitungBDD } = require('../../services/spBddCalculator');
const { parseKategoriPenerima, expandJenjangToDbValues, buildDbToDisplay, batchLoadMenuIdByName, lookupMenuIdByName, JENJANG_DISPLAY_ORDER, JENJANG_DB_MAP, tkQtyBelanja, batchLoadGridBahanBySiklus, resolveGridBeratPerSiswa } = require('../siklus/helpers');

const MONTHS_ID = ['JANUARI','FEBRUARI','MARET','APRIL','MEI','JUNI','JULI','AGUSTUS','SEPTEMBER','OKTOBER','NOVEMBER','DESEMBER'];
const HARI_ID = ['MINGGU','SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];
const MONEY_FMT = '"Rp"* #,###';
const MONEY_FMT2 = '"Rp"#,##0.00';
const pad2 = n => String(n).padStart(2, '0');
const ymdStr = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const daySheetName = d => d.getDate() + ' ' + MONTHS_ID[d.getMonth()] + ' ' + d.getFullYear();
function mondayOf(tanggal) {
  const d = new Date(tanggal + 'T00:00:00');
  if (isNaN(d.getTime())) throw new Error('tanggal tidak valid');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
const COL_LETTER = c => {
  let s = '';
  while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
  return s;
};

function registerRabRoutes(router) {
  // 8. RAB Bulanan (agregat per periode) - Operasional/Produksi/Admin
  router.get('/laporan/rab-bulanan', roleOps, async (req, res) => {
    const t = req.user.tenant_id;
    const { bulan, tahun } = req.query;
    const now = new Date();
    const filterBulan = bulan || '';
    const filterTahun = tahun || '';

    let whereExtra = '';
    const params = [t];
    if (filterBulan && filterTahun) {
      const periode = `${filterTahun}-${String(filterBulan).padStart(2, '0')}`;
      whereExtra = ' AND periode=?';
      params.push(periode);
    }

    const [rows] = await db.query(
      `SELECT periode,
              COUNT(*) as item_count,
              SUM(jumlah_penerima) as total_penerima,
              AVG(harga_per_porsi) as rata_harga_per_porsi,
              SUM(biaya_operasional) as total_biaya_operasional,
              SUM(total_budget) as total_budget,
              SUM(realisasi) as total_realisasi
       FROM budget
       WHERE tenant_id=?${whereExtra}
       GROUP BY periode
       ORDER BY periode DESC`,
      params
    );

    let detailKategori = [];
    let produksiInfo = null;
    if (filterBulan && filterTahun) {
      const periode = `${filterTahun}-${String(filterBulan).padStart(2, '0')}`;

      const [kategoriRows] = await db.query(
        `SELECT id, kategori_penerima, jumlah_penerima, harga_per_porsi, biaya_operasional, total_budget, realisasi, catatan FROM budget WHERE tenant_id=? AND periode=? ORDER BY kategori_penerima`,
        [t, periode]
      );
      detailKategori = kategoriRows.map(r => ({
        id: r.id,
        kategori_penerima: r.kategori_penerima,
        jumlah_penerima: Number(r.jumlah_penerima),
        harga_per_porsi: Number(r.harga_per_porsi),
        biaya_operasional: Number(r.biaya_operasional),
        total_budget: Number(r.total_budget),
        realisasi: Number(r.realisasi),
        catatan: r.catatan,
      }));

      const [[{ total_hari, total_porsi_produksi } = { total_hari: 0, total_porsi_produksi: 0 }]] = await db.query(
        `SELECT COUNT(DISTINCT tanggal_produksi) as total_hari,
                COALESCE(SUM(jumlah_porsi),0) as total_porsi_produksi
         FROM produksi WHERE tenant_id=? AND DATE_FORMAT(tanggal_produksi, '%Y-%m')=?`,
        [t, periode]
      );

      const [[{ realisasi_kas } = { realisasi_kas: 0 }]] = await db.query(
        `SELECT COALESCE(SUM(jumlah),0) AS realisasi_kas
         FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
         AND DATE_FORMAT(tanggal, '%Y-%m')=?`,
        [t, periode]
      );

      const [realisasiPerKat] = await db.query(
        `SELECT kategori, SUM(jumlah) as total
         FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
         AND DATE_FORMAT(tanggal, '%Y-%m')=?
         GROUP BY kategori ORDER BY total DESC`,
        [t, periode]
      );

      produksiInfo = {
        total_hari,
        total_porsi_produksi,
        realisasi_kas: Number(realisasi_kas),
        realisasi_per_kategori: realisasiPerKat.map(r => ({
          kategori: r.kategori,
          total: Number(r.total),
        })),
      };
    }

    const [ringkasanKeuangan] = await db.query(
      `SELECT DATE_FORMAT(tanggal,'%Y-%m') as periode,
              COALESCE(SUM(CASE WHEN tipe='masuk' THEN jumlah ELSE 0 END),0) as total_masuk,
              COALESCE(SUM(CASE WHEN tipe='keluar' THEN jumlah ELSE 0 END),0) as total_keluar
       FROM kas_bank
       WHERE tenant_id=?
       GROUP BY DATE_FORMAT(tanggal,'%Y-%m')
       ORDER BY periode DESC`,
      [t]
    );
    const keuanganMap = {};
    for (const r of ringkasanKeuangan) {
      keuanganMap[r.periode] = {
        total_masuk: Number(r.total_masuk),
        total_keluar: Number(r.total_keluar),
      };
    }

    const mergedRows = rows.map(r => {
      const keu = keuanganMap[r.periode] || { total_masuk: 0, total_keluar: 0 };
      const budget = Number(r.total_budget) || 0;
      const realisasiBudget = Number(r.total_realisasi) || 0;
      const realisasiKas = keu.total_keluar || 0;
      return {
        periode: r.periode,
        item_count: Number(r.item_count),
        total_penerima: Number(r.total_penerima),
        rata_harga_per_porsi: Number(r.rata_harga_per_porsi),
        total_biaya_operasional: Number(r.total_biaya_operasional),
        total_budget: budget,
        total_realisasi_budget: realisasiBudget,
        total_realisasi_kas: realisasiKas,
        total_masuk: keu.total_masuk,
        selisih_budget: budget - realisasiBudget,
        selisih_kas: budget - realisasiKas,
        capaian_budget: budget > 0 ? (realisasiBudget / budget * 100) : 0,
        capaian_kas: budget > 0 ? (realisasiKas / budget * 100) : 0,
      };
    });

    const stats = {
      total_periode: mergedRows.length,
      total_budget: mergedRows.reduce((s, r) => s + r.total_budget, 0),
      total_realisasi_budget: mergedRows.reduce((s, r) => s + r.total_realisasi_budget, 0),
      total_realisasi_kas: mergedRows.reduce((s, r) => s + r.total_realisasi_kas, 0),
      total_penerima: mergedRows.reduce((s, r) => s + r.total_penerima, 0),
      rata_capaian_budget: mergedRows.length > 0
        ? mergedRows.reduce((s, r) => s + r.capaian_budget, 0) / mergedRows.length
        : 0,
      rata_capaian_kas: mergedRows.length > 0
        ? mergedRows.reduce((s, r) => s + r.capaian_kas, 0) / mergedRows.length
        : 0,
    };

    res.json({ rows: mergedRows, stats, detail_kategori: detailKategori, produksi_info: produksiInfo });
  });

  // 8b. RAB Detail Per Periode
  router.get('/laporan/rab-detail-periode', roleOps, async (req, res) => {
    try {
      const t = req.user.tenant_id;
      const { periode } = req.query;
      if (!periode) return res.status(400).json({ error: 'Periode wajib diisi (YYYY-MM)' });

      const [budgetRows] = await db.query(
        `SELECT id, kategori_penerima, jumlah_penerima, harga_per_porsi, biaya_operasional, total_budget, realisasi, catatan FROM budget WHERE tenant_id=? AND periode=? ORDER BY kategori_penerima`,
        [t, periode]
      );

      const [[{ total_hari } = { total_hari: 0 }]] = await db.query(
        `SELECT COUNT(DISTINCT tanggal_produksi) as total_hari
         FROM produksi WHERE tenant_id=? AND DATE_FORMAT(tanggal_produksi, '%Y-%m')=?`,
        [t, periode]
      );

      const [penerima] = await db.query(
        `SELECT kategori_penerima, SUM(paket_besar + paket_kecil) as total_penerima
         FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima IS NOT NULL
         GROUP BY kategori_penerima ORDER BY kategori_penerima`,
        [t]
      );
      const penerimaMap = {};
      for (const p of penerima) penerimaMap[p.kategori_penerima] = Number(p.total_penerima);

      const [realisasiPerKat] = await db.query(
        `SELECT kategori, SUM(jumlah) as total
         FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
         AND DATE_FORMAT(tanggal, '%Y-%m')=?
         GROUP BY kategori ORDER BY total DESC`,
        [t, periode]
      );
      const realisasiKatMap = {};
      for (const r of realisasiPerKat) realisasiKatMap[r.kategori] = Number(r.total);

      const [[{ total_realisasi_kas } = { total_realisasi_kas: 0 }]] = await db.query(
        `SELECT COALESCE(SUM(jumlah),0) AS total_realisasi_kas
         FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
         AND DATE_FORMAT(tanggal, '%Y-%m')=?`,
        [t, periode]
      );

      const totalBudget = budgetRows.reduce((s, r) => s + Number(r.total_budget), 0);
      const totalRealisasiBudget = budgetRows.reduce((s, r) => s + Number(r.realisasi), 0);

      const detail = budgetRows.map(b => ({
        id: b.id,
        kategori_penerima: b.kategori_penerima,
        jumlah_penerima: Number(b.jumlah_penerima),
        harga_per_porsi: Number(b.harga_per_porsi),
        biaya_operasional: Number(b.biaya_operasional),
        total_budget: Number(b.total_budget),
        realisasi_budget: Number(b.realisasi),
        estimasi_kebutuhan: Number(b.harga_per_porsi) * (Number(b.jumlah_penerima) || 0) * total_hari,
      }));

      const realisasiDisplay = Object.entries(realisasiKatMap).map(([kategori, total]) => ({
        kategori,
        total,
        persen_budget: totalBudget > 0 ? (total / totalBudget * 100) : 0,
      }));

      res.json({
        periode,
        total_hari,
        total_penerima: Object.values(penerimaMap).reduce((s, v) => s + v, 0),
        total_budget: totalBudget,
        total_realisasi_budget: totalRealisasiBudget,
        total_realisasi_kas: Number(total_realisasi_kas),
        selisih_budget: totalBudget - totalRealisasiBudget,
        selisih_kas: totalBudget - Number(total_realisasi_kas),
        serapan_budget: totalBudget > 0 ? (totalRealisasiBudget / totalBudget * 100) : 0,
        serapan_kas: totalBudget > 0 ? (Number(total_realisasi_kas) / totalBudget * 100) : 0,
        detail_kategori: detail,
        realisasi_per_kategori: realisasiDisplay,
        penerima_per_kategori: penerima.map(p => ({
          kategori: p.kategori_penerima,
          jumlah: Number(p.total_penerima),
        })),
      });
    } catch (err) {
      console.error('RAB detail periode error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 8c. Generate Budget dari RAB Sinkron
  router.post('/laporan/rab-generate-budget', roleFinance, async (req, res) => {
    try {
      const t = req.user.tenant_id;
      const { periode } = req.body;

      if (!periode) {
        return res.status(400).json({ error: 'Periode wajib diisi (YYYY-MM)' });
      }

      const [existing] = await db.query(
        `SELECT COUNT(*) as cnt FROM budget WHERE tenant_id=? AND periode=?`,
        [t, periode]
      );

      let overwrite = req.query.overwrite === 'true';
      if (existing[0].cnt > 0 && !overwrite) {
        return res.json({
          message: 'Budget sudah ada untuk periode ' + periode,
          existing: existing[0].cnt,
          can_overwrite: true,
          hint: 'Gunakan ?overwrite=true untuk menimpa',
        });
      }

      if (overwrite && existing[0].cnt > 0) {
        await db.query(`DELETE FROM budget WHERE tenant_id=? AND periode=?`, [t, periode]);
      }

      const [[{ total_hari } = { total_hari: 0 }]] = await db.query(
        `SELECT COUNT(DISTINCT tanggal_produksi) as total_hari
         FROM produksi WHERE tenant_id=? AND DATE_FORMAT(tanggal_produksi, '%Y-%m')=?`,
        [t, periode]
      );

      const [penerima] = await db.query(
        `SELECT kategori_penerima, SUM(paket_besar + paket_kecil) as total_penerima
         FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima IS NOT NULL
         GROUP BY kategori_penerima ORDER BY kategori_penerima`,
        [t]
      );

      const [hargaReferensi] = await db.query(
        `SELECT b1.kategori_penerima, b1.harga_per_porsi
         FROM budget b1
         INNER JOIN (
           SELECT kategori_penerima, MAX(periode) as max_periode
           FROM budget WHERE tenant_id=? AND periode < ? AND harga_per_porsi > 0
           GROUP BY kategori_penerima
         ) b2 ON b1.kategori_penerima = b2.kategori_penerima AND b1.periode = b2.max_periode`,
        [t, periode]
      );
      const hargaRefMap = {};
      for (const h of hargaReferensi) hargaRefMap[h.kategori_penerima] = Number(h.harga_per_porsi);

      const [[{ ref_biaya_operasional } = { ref_biaya_operasional: 0 }]] = await db.query(
        `SELECT COALESCE(AVG(biaya_operasional),0) as ref_biaya_operasional
         FROM budget WHERE tenant_id=? AND periode < ? AND biaya_operasional > 0`,
        [t, periode]
      );

      let created = 0;
      for (const p of penerima) {
        const kategori = p.kategori_penerima;
        const jmlPenerima = Number(p.total_penerima);
        const harga = hargaRefMap[kategori] || 0;
        const biayaOp = Math.round(Number(ref_biaya_operasional) / Math.max(penerima.length, 1));
        const totalBudget = Math.round(harga * jmlPenerima * total_hari);

        await db.query(
          `INSERT INTO budget (tenant_id, periode, kategori_penerima, jumlah_penerima, harga_per_porsi, biaya_operasional, total_budget, realisasi, catatan)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'Auto-generate dari RAB Sinkron')`,
          [t, periode, kategori, jmlPenerima, harga, biayaOp, totalBudget]
        );
        created++;
      }

      if (created === 0) {
        const biayaOp = Math.round(Number(ref_biaya_operasional) || 0);
        await db.query(
          `INSERT INTO budget (tenant_id, periode, kategori_penerima, jumlah_penerima, harga_per_porsi, biaya_operasional, total_budget, realisasi, catatan)
           VALUES (?, ?, 'Umum', 0, 0, ?, 0, 0, 'Auto-generate (default)')`,
          [t, periode, biayaOp]
        );
        created = 1;
      }

      res.json({
        message: 'Budget berhasil digenerate',
        periode,
        total_hari,
        kategori_count: created,
        created,
      });
    } catch (err) {
      console.error('RAB generate budget error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ===== RAB Sinkron — otomatis dari data aktual, plus realisasi =====
  router.get('/laporan/rab-sinkron', roleOps, async (req, res) => {
    try {
      const t = req.user.tenant_id;
      const requestedPeriode = req.query.periode || '';
      let periode = requestedPeriode;
      if (!periode) {
        const [[{ p }]] = await db.query(
          `SELECT MAX(periode) as p FROM budget WHERE tenant_id=? AND periode <= ?`,
          [t, new Date().toISOString().slice(0, 7)]
        );
        if (p) periode = p;
      }
      if (!periode) periode = new Date().toISOString().slice(0, 7);
      const siklusId = req.query.siklus_id || '';

      let siklusInfo = null;
      let total_hari = 0;

      if (siklusId) {
        const [[siklus]] = await db.query(
          `SELECT id, nama, total_hari, kategori_penerima, jumlah_porsi, tanggal_mulai
           FROM siklus_menu WHERE id=? AND tenant_id=?`,
          [siklusId, t]
        );
        if (siklus) {
          total_hari = Number(siklus.total_hari) || 0;
          siklusInfo = {
            id: siklus.id,
            nama: siklus.nama,
            total_hari,
            kategori_penerima: siklus.kategori_penerima,
            jumlah_porsi: Number(siklus.jumlah_porsi) || 0,
            tanggal_mulai: siklus.tanggal_mulai || null,
          };
        }
      }

      if (!siklusId || !total_hari) {
        const [[{ prod_hari }]] = await db.query(
          `SELECT COUNT(DISTINCT tanggal_produksi) as prod_hari
           FROM produksi WHERE tenant_id=? AND DATE_FORMAT(tanggal_produksi, '%Y-%m')=?`,
          [t, periode]
        );
        total_hari = prod_hari || 0;
        if (!total_hari) {
          const [[{ siklus_hari }]] = await db.query(
            `SELECT COALESCE(MAX(total_hari), 0) as siklus_hari
             FROM siklus_menu WHERE tenant_id=? AND status IN ('Aktif','Draft')`,
            [t]
          );
          total_hari = siklus_hari || 0;
        }
      }

      const dbToDisplay = buildDbToDisplay();

      let penerima;
      let siklusDbKat = [];
      const penerimaQuery = `SELECT kategori_penerima,
        SUM(paket_besar) as total_besar, SUM(paket_kecil) as total_kecil,
        SUM(paket_besar + paket_kecil) as total_penerima
        FROM penerima_manfaat WHERE tenant_id=?`;
      if (siklusInfo && siklusInfo.kategori_penerima) {
        const katList = parseKategoriPenerima(siklusInfo.kategori_penerima);
        siklusDbKat = expandJenjangToDbValues(katList);
        if (siklusDbKat.length) {
          const ph = siklusDbKat.map(() => '?').join(',');
          [penerima] = await db.query(
            penerimaQuery + ` AND kategori_penerima IN (${ph}) GROUP BY kategori_penerima ORDER BY kategori_penerima`,
            [t, ...siklusDbKat]
          );
        } else {
          [penerima] = [[], []];
        }
      } else {
        [penerima] = await db.query(
          penerimaQuery + ` AND kategori_penerima IS NOT NULL GROUP BY kategori_penerima ORDER BY kategori_penerima`,
          [t]
        );
      }

      const [hargaList] = await db.query(
        `SELECT kategori_penerima, harga_per_porsi, harga_besar, harga_kecil, jumlah_penerima, total_budget, realisasi FROM budget
         WHERE tenant_id=? AND periode=?`,
        [t, periode]
      );
      const hargaBesarMap = {};
      const hargaKecilMap = {};
      const budgetMap = {};
      const jumlahPenerimaMap = {};
      const realisasiMap = {};
      const budgetSet = new Set();
      for (const h of hargaList) {
        const displayKey = dbToDisplay[h.kategori_penerima] || h.kategori_penerima;
        hargaBesarMap[displayKey] = Number(h.harga_besar) || Number(h.harga_per_porsi) || 0;
        hargaKecilMap[displayKey] = Number(h.harga_kecil) || Number(h.harga_per_porsi) || 0;
        budgetMap[displayKey] = Number(h.total_budget || 0);
        jumlahPenerimaMap[displayKey] = Number(h.jumlah_penerima || 0);
        realisasiMap[displayKey] = Number(h.realisasi || 0);
        budgetSet.add(displayKey);
      }

      // Harga referensi untuk estimasi (kategori tanpa budget periode ini):
      // pakai harga dari periode budget terakhir sebagai dasar perkiraan.
      const [refHarga] = await db.query(
        `SELECT b1.kategori_penerima, b1.harga_besar, b1.harga_kecil, b1.harga_per_porsi
         FROM budget b1
         INNER JOIN (
           SELECT kategori_penerima, MAX(periode) AS max_periode
           FROM budget WHERE tenant_id=? AND periode < ? AND (harga_besar > 0 OR harga_kecil > 0 OR harga_per_porsi > 0)
           GROUP BY kategori_penerima
         ) b2 ON b1.kategori_penerima = b2.kategori_penerima AND b1.periode = b2.max_periode`,
        [t, periode]
      );
      for (const h of refHarga) {
        const displayKey = dbToDisplay[h.kategori_penerima] || h.kategori_penerima;
        if (!budgetSet.has(displayKey)) {
          hargaBesarMap[displayKey] = Number(h.harga_besar) || Number(h.harga_per_porsi) || 0;
          hargaKecilMap[displayKey] = Number(h.harga_kecil) || Number(h.harga_per_porsi) || 0;
        }
      }

      const [[{ realisasi_kas } = { realisasi_kas: 0 }]] = await db.query(
        `SELECT COALESCE(SUM(jumlah),0) AS realisasi_kas
         FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
         AND kategori='Pembayaran Supplier'
         AND DATE_FORMAT(tanggal, '%Y-%m')=?`,
        [t, periode]
      );

      // Agregasi budget ikut difilter ke kategori yang tampil (konsisten dengan rows)
      // supaya kartu Anggaran = kartu Budget bahkan saat filter siklus aktif.
      let budgetAggWhere = '';
      const budgetAggParams = [t, periode];
      if (siklusDbKat.length) {
        const ph = siklusDbKat.map(() => '?').join(',');
        budgetAggWhere = ` AND kategori_penerima IN (${ph})`;
        budgetAggParams.push(...siklusDbKat);
      }
      const [[budgetAgg]] = await db.query(
        `SELECT COALESCE(SUM(total_budget),0) AS total_budget,
                COALESCE(SUM(realisasi),0) AS total_realisasi_manual
         FROM budget WHERE tenant_id=? AND periode=?${budgetAggWhere}`,
        budgetAggParams
      );
      const totalBudgetAgg = Number(budgetAgg.total_budget) || 0;
      const totalRealisasiManual = Number(budgetAgg.total_realisasi_manual) || 0;

      const [[{ total_biaya_kas } = { total_biaya_kas: 0 }]] = await db.query(
        `SELECT COALESCE(SUM(jumlah),0) AS total_biaya_kas
         FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
         AND DATE_FORMAT(tanggal, '%Y-%m')=?`,
        [t, periode]
      );

      const [pengeluaranByKat] = await db.query(
        `SELECT kategori, SUM(jumlah) AS total
         FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
         AND DATE_FORMAT(tanggal, '%Y-%m')=?
         GROUP BY kategori`,
        [t, periode]
      );
      const byKat = {};
      for (const p of pengeluaranByKat) byKat[p.kategori] = Number(p.total);
      const biaya_bahan_baku = byKat['Pembayaran Supplier'] || 0;
      const biaya_operasional = byKat['Biaya Operasional'] || 0;
      const biaya_gaji = byKat['Gaji'] || 0;
      const biaya_lainnya = byKat['Lainnya'] || 0;

      // Supplier purchase details
      const [supplierPayments] = await db.query(
        `SELECT k.id, k.tanggal, k.no_transaksi, k.deskripsi, k.jumlah, s.nama as supplier_nama, po.item as po_item
         FROM kas_bank k
         LEFT JOIN purchase_order po ON po.no_po = k.no_transaksi AND po.tenant_id = k.tenant_id
         LEFT JOIN supplier s ON s.id = po.supplier_id
         WHERE k.tenant_id=? AND k.tipe='keluar'
           AND k.kategori='Pembayaran Supplier'
           AND DATE_FORMAT(k.tanggal, '%Y-%m')=?
         ORDER BY k.tanggal DESC`,
        [t, periode]
      );
      const supplierRincian = supplierPayments.map(sp => {
        let items = [];
        try {
          if (sp.po_item) {
            const parsed = JSON.parse(sp.po_item);
            if (Array.isArray(parsed)) {
              items = parsed.map(it => ({
                nama: it.nama || it.bahan_nama || '',
                qty: Number(it.qty || it.qty_buffer || it.total_qty || 0),
                satuan: it.satuan || '',
                harga: Number(it.harga || it.harga_satuan || 0),
              }));
            }
          }
        } catch (e) { /* ignore parse error */ }
        return {
          id: sp.id,
          tanggal: sp.tanggal,
          no_transaksi: sp.no_transaksi,
          deskripsi: sp.deskripsi,
          supplier: sp.supplier_nama || '-',
          jumlah: Number(sp.jumlah),
          items,
        };
      });

      let grandPenerima = 0;
      let grandTotal = 0;
      const rows = [];
      for (const p of penerima) {
        const kategori = dbToDisplay[p.kategori_penerima] || p.kategori_penerima;
        const rawKat = p.kategori_penerima;
        if (rawKat === 'Posyandu') {
          // Gabung Posyandu jadi satu baris: hitung rata-rata tertimbang harga besar & kecil
          const totalBesar = Number(p.total_besar) || 0;
          const totalKecil = Number(p.total_kecil) || 0;
          const totalPenerima = totalBesar + totalKecil;
          if (!totalPenerima) continue;

          const hargaBesar = hargaBesarMap['Bumil/Busui'] || hargaBesarMap['Posyandu'] || 0;
          const hargaKecil = hargaKecilMap['Balita'] || hargaKecilMap['Posyandu'] || 0;

          // Weighted average harga per porsi (pembulatan ke rupiah terdekat)
          const hargaRata = Math.round((hargaBesar * totalBesar + hargaKecil * totalKecil) / totalPenerima);

          // Gabung budget & realisasi dari sub-kategori + entri ber-kategori 'Posyandu'
          const budgetGabung = (budgetMap['Bumil/Busui'] || 0) + (budgetMap['Balita'] || 0) + (budgetMap['Posyandu'] || 0);
          const realisasiGabung = (realisasiMap['Bumil/Busui'] || 0) + (realisasiMap['Balita'] || 0) + (realisasiMap['Posyandu'] || 0);
          const jmlGabung = (jumlahPenerimaMap['Bumil/Busui'] || 0) + (jumlahPenerimaMap['Balita'] || 0) + (jumlahPenerimaMap['Posyandu'] || 0);
          // Satu sumber kebenaran: kalau ada budget di periode ini, pakai angka tersimpan
          // (jumlah_penerima & total_budget) supaya Anggaran = Budget. Kalau belum ada
          // budget, hitung estimasi dari master PM dan tandai sumber 'estimasi'.
          const hasBudget = budgetSet.has('Bumil/Busui') || budgetSet.has('Balita') || budgetSet.has('Posyandu');
          const jmlTampil = hasBudget ? (jmlGabung || totalPenerima) : totalPenerima;
          const total = hasBudget ? budgetGabung : hargaRata * totalPenerima * (total_hari || 0);

          grandPenerima += jmlTampil;
          grandTotal += total;
          rows.push({
            kategori: 'Posyandu',
            harga_besar: hargaBesar,
            harga_kecil: hargaKecil,
            jumlah_penerima: jmlTampil,
            jumlah_hari: total_hari || 0,
            budget: budgetGabung,
            realisasi: realisasiGabung,
            total,
            sumber: hasBudget ? 'budget' : 'estimasi',
          });
        } else {
          const hargaBesar = hargaBesarMap[kategori] || 0;
          const hargaKecil = hargaKecilMap[kategori] || 0;
          const totalBesar = Number(p.total_besar) || 0;
          const totalKecil = Number(p.total_kecil) || 0;
          const jmlHari = total_hari || 0;
          // Satu sumber kebenaran: kalau ada budget di periode ini, pakai angka tersimpan
          // (jumlah_penerima & total_budget) supaya Anggaran = Budget. Kalau belum ada
          // budget, hitung estimasi dari master PM dan tandai sumber 'estimasi'.
          const hasBudget = budgetSet.has(kategori);
          const jmlPenerima = hasBudget ? (jumlahPenerimaMap[kategori] || Number(p.total_penerima)) : Number(p.total_penerima);
          const total = hasBudget ? (budgetMap[kategori] || 0) : (hargaBesar * totalBesar + hargaKecil * totalKecil) * jmlHari;
          grandPenerima += jmlPenerima;
          grandTotal += total;
          rows.push({
            kategori,
            harga_besar: hargaBesar,
            harga_kecil: hargaKecil,
            jumlah_penerima: jmlPenerima,
            jumlah_hari: jmlHari,
            budget: budgetMap[kategori] || 0,
            realisasi: realisasiMap[kategori] || 0,
            total,
            sumber: hasBudget ? 'budget' : 'estimasi',
          });
        }
      }

      const selisih = totalBudgetAgg - totalRealisasiManual;
      const serapan = totalBudgetAgg > 0 ? (totalRealisasiManual / totalBudgetAgg * 100) : 0;

      // Menu per jenjang per hari (hanya jika siklus dipilih)
      let menuPerJenjang = [];
      if (siklusId) {
        // Get siklus menu items with their bahan
        const [menuItems] = await db.query(
          `SELECT si.hari_ke, si.hari_nama, si.menu_id, si.menu_nama, si.jumlah_porsi
           FROM siklus_menu_item si
           WHERE si.siklus_id=?
           ORDER BY si.hari_ke ASC`,
          [siklusId]
        );

        // Get bahan for all menus
        const menuIds = [...new Set(menuItems.filter(m => m.menu_id).map(m => m.menu_id))];
        const bahanByMenu = {};
        if (menuIds.length) {
          const mph = menuIds.map(() => '?').join(',');
          const [bahanRows] = await db.query(
            `SELECT mb.menu_id, mb.bahan_baku_id, mb.jumlah, b.nama as bahan_nama, b.satuan
             FROM menu_bahan mb
             JOIN bahan_baku b ON b.id = mb.bahan_baku_id
             WHERE mb.menu_id IN (${mph})`,
            menuIds
          );
          for (const br of bahanRows) {
            if (!bahanByMenu[br.menu_id]) bahanByMenu[br.menu_id] = [];
            bahanByMenu[br.menu_id].push({
              bahan_baku_id: br.bahan_baku_id,
              bahan_nama: br.bahan_nama,
              satuan: br.satuan || 'g',
              jumlah_per_porsi: Number(br.jumlah) || 0,
            });
          }
        }

        // Map the bahan to each menu item
        for (const mi of menuItems) {
          mi.bahan = bahanByMenu[mi.menu_id] || [];
        }

        // Group by jenjang (from siklus kategori_penerima)
        const siklusKat = siklusInfo ? parseKategoriPenerima(siklusInfo.kategori_penerima || '') : [];
        const displayKats = siklusKat.length > 0 ? siklusKat.map(k => dbToDisplay[k] || k) : ['Umum'];

        // Get PM counts for each jenjang
        const allDbVals = expandJenjangToDbValues(siklusKat);
        const pmMap = {};
        if (allDbVals.length) {
          const ph = allDbVals.map(() => '?').join(',');
          const [pmRows] = await db.query(
            `SELECT kategori_penerima, COALESCE(SUM(paket_besar + paket_kecil),0) AS total
             FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima IN (${ph})
             GROUP BY kategori_penerima`,
            [t, ...allDbVals]
          );
          for (const p of pmRows) pmMap[p.kategori_penerima] = Number(p.total);
        }

        // Calculate total porsi and aggregate bahan per jenjang
        for (const kat of displayKats) {
          const dbKeys = Object.keys(pmMap).filter(k => (dbToDisplay[k] || k) === kat);
          const totalPm = dbKeys.reduce((s, k) => s + (pmMap[k] || 0), 0) || Number(siklusInfo?.jumlah_porsi || 0) || 1;

          const hariData = [];
          const allBahanAgg = {}; // aggregate bahan across all days

          for (const mi of menuItems) {
            const porsi = Number(mi.jumlah_porsi) || totalPm;
      const hariBahan = mi.bahan.map(b => {
        const totalGram = Math.round((b.jumlah_per_porsi * porsi) * 100) / 100;
        const totalKg = Math.round((totalGram / 1000) * 100) / 100;
        // Aggregate for total
        if (!allBahanAgg[b.bahan_baku_id]) {
          allBahanAgg[b.bahan_baku_id] = { bahan_baku_id: b.bahan_baku_id, bahan_nama: b.bahan_nama, satuan: b.satuan, total_gram: 0, total_kg: 0 };
        }
        allBahanAgg[b.bahan_baku_id].total_gram += totalGram;
        allBahanAgg[b.bahan_baku_id].total_kg += totalKg;
        return { bahan_nama: b.bahan_nama, satuan: b.satuan, gram_per_porsi: Math.round(b.jumlah_per_porsi * 100) / 100, total_gram: totalGram, total_kg: totalKg };
      });

            hariData.push({
              hari_ke: mi.hari_ke,
              hari_nama: mi.hari_nama,
              menu_nama: mi.menu_nama || (mi.menu_id ? 'Menu #' + mi.menu_id : '-'),
              jumlah_porsi: porsi,
              bahan: hariBahan,
            });
          }

          menuPerJenjang.push({
            jenjang: kat,
            jumlah_penerima: totalPm,
            total_hari: new Set(menuItems.map(m => m.hari_ke)).size,
            hari: hariData,
            total_kebutuhan: Object.values(allBahanAgg).sort((a, b) => b.total_kg - a.total_kg),
          });
        }
      }

      res.json({
        rows,
        grand_penerima: grandPenerima,
        grand_total: grandTotal,
        total_hari: total_hari || 0,
        periode,
        siklus: siklusInfo,
        budget: {
          total_budget: totalBudgetAgg,
          total_realisasi_manual: totalRealisasiManual,
          total_realisasi_kas: realisasi_kas,
          total_biaya_kas: total_biaya_kas,
          biaya_bahan_baku,
          biaya_operasional,
          biaya_gaji,
          biaya_lainnya,
          selisih,
          serapan_persen: serapan,
        },
        supplier_pembelian: supplierRincian,
        total_pembelian_supplier: supplierRincian.reduce((s, sp) => s + sp.jumlah, 0),
        menu_per_jenjang: menuPerJenjang,
      });
    } catch (err) {
      console.error('RAB sinkron error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ===== RAB Hitung Realisasi — auto-hitung budget.realisasi dari kas_bank =====
  router.post('/laporan/rab-hitung-realisasi', roleFinance, async (req, res) => {
    try {
      const t = req.user.tenant_id;
      const { periode } = req.body;

      if (!periode) {
        return res.status(400).json({ error: 'Periode wajib diisi (YYYY-MM)' });
      }

      const [rows] = await db.query(
        `SELECT DATE_FORMAT(tanggal, '%Y-%m') AS periode,
                COALESCE(SUM(jumlah),0) AS total_keluar
         FROM kas_bank
         WHERE tenant_id=? AND tipe='keluar'
           AND DATE_FORMAT(tanggal, '%Y-%m')=?
         GROUP BY DATE_FORMAT(tanggal, '%Y-%m')`,
        [t, periode]
      );

      const totalRealisasi = rows.length > 0 ? Number(rows[0].total_keluar) : 0;

      const [budgetItems] = await db.query(
        `SELECT id FROM budget WHERE tenant_id=? AND periode=?`,
        [t, periode]
      );

      if (budgetItems.length === 0) {
        return res.json({ message: 'Tidak ada budget untuk periode ' + periode, updated: 0, totalRealisasi });
      }

      const perItem = Math.round(totalRealisasi / budgetItems.length);
      for (const item of budgetItems) {
        await db.query(
          `UPDATE budget SET realisasi=? WHERE id=? AND tenant_id=?`,
          [perItem, item.id, t]
        );
      }

      res.json({
        message: 'Realisasi berhasil dihitung',
        periode,
        totalRealisasi,
        item_count: budgetItems.length,
        per_item: perItem,
        updated: budgetItems.length,
      });
    } catch (err) {
      console.error('RAB hitung realisasi error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ===== RAB Hitung Realisasi — auto-hitung semua periode =====
  router.post('/laporan/rab-hitung-realisasi-semua', roleFinance, async (req, res) => {
    try {
      const t = req.user.tenant_id;

      const [periodeList] = await db.query(
        `SELECT DISTINCT periode FROM budget WHERE tenant_id=? ORDER BY periode`,
        [t]
      );

      let totalUpdated = 0;
      const results = [];

      for (const { periode } of periodeList) {
        const [[{ totalRealisasi } = { totalRealisasi: 0 }]] = await db.query(
          `SELECT COALESCE(SUM(jumlah),0) AS totalRealisasi
           FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
             AND DATE_FORMAT(tanggal, '%Y-%m')=?`,
          [t, periode]
        );

        const [budgetItems] = await db.query(
          `SELECT id FROM budget WHERE tenant_id=? AND periode=?`,
          [t, periode]
        );

        if (budgetItems.length > 0) {
          const perItem = Math.round(Number(totalRealisasi) / budgetItems.length);
          for (const item of budgetItems) {
            await db.query(
              `UPDATE budget SET realisasi=? WHERE id=? AND tenant_id=?`,
              [perItem, item.id, t]
            );
          }
          totalUpdated += budgetItems.length;
          results.push({ periode, realisasi: totalRealisasi, items: budgetItems.length });
        }
      }

      res.json({
        message: 'Semua realisasi berhasil dihitung ulang',
        total_updated: totalUpdated,
        total_periode: results.length,
        results,
      });
    } catch (err) {
      console.error('RAB hitung realisasi semua error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ===== RAB Harian — kebutuhan bahan per hari dengan harga dari bahan_baku =====
  async function getRabHarianData(t, tanggal, siklusId) {
    try {
      let siklusInfo = null;
      let hariKe = 0;
      let menuItems = [];

      if (siklusId) {
        const [[siklus]] = await db.query(
          `SELECT id, nama, total_hari, kategori_penerima, jumlah_porsi, tanggal_mulai
           FROM siklus_menu WHERE id=? AND tenant_id=?`,
          [siklusId, t]
        );
        if (siklus) {
          siklusInfo = {
            id: siklus.id,
            nama: siklus.nama,
            total_hari: Number(siklus.total_hari) || 0,
            kategori_penerima: siklus.kategori_penerima,
            jumlah_porsi: Number(siklus.jumlah_porsi) || 0,
            tanggal_mulai: siklus.tanggal_mulai,
          };

          if (siklus.tanggal_mulai) {
            const msDiff = new Date(tanggal).getTime() - new Date(siklus.tanggal_mulai).getTime();
            hariKe = Math.floor(msDiff / (1000 * 60 * 60 * 24)) + 1;
            if (hariKe < 1 || hariKe > (siklusInfo.total_hari || 99)) hariKe = 0;
          }

          // Get menu items for this day
          if (hariKe > 0) {
            [menuItems] = await db.query(
              `SELECT si.id, si.hari_ke, si.hari_nama, si.menu_id, si.menu_nama, si.jumlah_porsi
               FROM siklus_menu_item si
               WHERE si.siklus_id=? AND si.hari_ke=?
               ORDER BY si.id ASC`,
              [siklusId, hariKe]
            );
          } else {
            // If no tanggal_mulai, return all days
            [menuItems] = await db.query(
              `SELECT si.id, si.hari_ke, si.hari_nama, si.menu_id, si.menu_nama, si.jumlah_porsi
               FROM siklus_menu_item si
               WHERE si.siklus_id=?
               ORDER BY si.hari_ke ASC`,
              [siklusId]
            );
          }
        }
      } else {
        // Find active siklus
        const [[siklus]] = await db.query(
          `SELECT id, nama, total_hari, kategori_penerima, jumlah_porsi, tanggal_mulai
           FROM siklus_menu WHERE tenant_id=? AND status='Aktif' LIMIT 1`,
          [t]
        );
        if (siklus) {
          siklusInfo = {
            id: siklus.id,
            nama: siklus.nama,
            total_hari: Number(siklus.total_hari) || 0,
            kategori_penerima: siklus.kategori_penerima,
            jumlah_porsi: Number(siklus.jumlah_porsi) || 0,
            tanggal_mulai: siklus.tanggal_mulai,
          };
          if (siklus.tanggal_mulai) {
            const msDiff = new Date(tanggal).getTime() - new Date(siklus.tanggal_mulai).getTime();
            hariKe = Math.floor(msDiff / (1000 * 60 * 60 * 24)) + 1;
          }
          if (hariKe > 0) {
            [menuItems] = await db.query(
              `SELECT si.id, si.hari_ke, si.hari_nama, si.menu_id, si.menu_nama, si.jumlah_porsi
               FROM siklus_menu_item si
               WHERE si.siklus_id=? AND si.hari_ke=?
               ORDER BY si.id ASC`,
              [siklus.id, hariKe]
            );
          }
        }
      }

      if (!menuItems.length) {
        // Anggaran belanja harian tetap dihitung dari budget periode agar
        // fallback "Total Kebutuhan" bisa menampilkan ANGGARAN & SISA.
        const periode = tanggal.slice(0, 7);
        const [[{ total_budget_periode, total_hari_periode } = { total_budget_periode: 0, total_hari_periode: 0 }]] = await db.query(
          `SELECT COALESCE(SUM(total_budget),0) AS total_budget_periode,
                  COALESCE(MAX(sm.total_hari),0) AS total_hari_periode
           FROM budget b
           LEFT JOIN siklus_menu sm ON sm.id=? AND sm.tenant_id=?
           WHERE b.tenant_id=? AND b.periode=?`,
          [siklusId || 0, t, t, periode]
        );
        const totalHariBudget = total_hari_periode || siklusInfo?.total_hari || 1;
        const anggaranBelanjaHarian = Math.round(total_budget_periode / Math.max(totalHariBudget, 1));
        return {
          tanggal,
          siklus: siklusInfo,
          hari_ke: hariKe,
          menu_deskripsi: '',
          items: [],
          total: 0,
          anggaran_belanja_harian: anggaranBelanjaHarian,
          message: 'Tidak ada menu untuk tanggal ini',
        };
      }

      // Load bahan with prices for all menus

      // Menu yang direferensikan via menu_nama (menu_id null) → resolusi ke id menu
      const unmatchedNames = [...new Set(menuItems.filter(m => !m.menu_id && m.menu_nama).map(m => String(m.menu_nama || '').trim()).filter(Boolean))];
      const menuIdByName = await batchLoadMenuIdByName(unmatchedNames, t);
      const effMenuId = mi => mi.menu_id || lookupMenuIdByName(menuIdByName, mi);

      const menuIds = [...new Set(menuItems.map(mi => effMenuId(mi)).filter(Boolean))];

      // Get PM counts per jenjang
      const siklusKat = siklusInfo ? parseKategoriPenerima(siklusInfo.kategori_penerima || '') : [];
      const allDbVals = expandJenjangToDbValues(siklusKat);
      const pmMap = {};
      if (allDbVals.length) {
        const ph = allDbVals.map(() => '?').join(',');
        const [pmRows] = await db.query(
          `SELECT kategori_penerima, COALESCE(SUM(paket_besar + paket_kecil),0) AS total
           FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima IN (${ph})
           GROUP BY kategori_penerima`,
          [t, ...allDbVals]
        );
        for (const p of pmRows) pmMap[p.kategori_penerima] = Number(p.total);
      }

      // Load bahan for all menus
      const bahanByMenu = {};
      if (menuIds.length) {
        const mph = menuIds.map(() => '?').join(',');
        const [bahanRows] = await db.query(
          `SELECT mb.menu_id, mb.bahan_baku_id, mb.jumlah, mb.keterangan,
                  b.nama as bahan_nama, b.satuan, b.harga_satuan, b.berat_per_satuan,
                  b.persen_bdd, b.buffer_persen, b.kategori_sp
           FROM menu_bahan mb
           JOIN bahan_baku b ON b.id = mb.bahan_baku_id
           WHERE mb.menu_id IN (${mph})`,
          menuIds
        );
        for (const br of bahanRows) {
          if (!bahanByMenu[br.menu_id]) bahanByMenu[br.menu_id] = [];
          bahanByMenu[br.menu_id].push({
            bahan_baku_id: br.bahan_baku_id,
            bahan_nama: br.bahan_nama,
            satuan: br.satuan || 'g',
            jumlah_per_porsi: Number(br.jumlah) || 0,
            harga_satuan: Number(br.harga_satuan) || 0,
            berat_per_satuan: Number(br.berat_per_satuan) || 0,
            persen_bdd: Number(br.persen_bdd) || 100,
            buffer_persen: Number(br.buffer_persen) || 0,
            kategori_sp: br.kategori_sp || '',
            keterangan: br.keterangan || '',
          });
        }
      }

      // Aggregate bahan across all menus for this day.
      // Total porsi = gabungan SEMUA jenjang target siklus (konsisten dgn Total
      // Kebutuhan), bukan hanya jenjang pertama seperti sebelumnya.
      const totalPm = Object.values(pmMap).reduce((s, v) => s + (Number(v) || 0), 0)
        || Number(siklusInfo?.jumlah_porsi || 0) || 1;
      let grandTotal = 0;
      const bahanAgg = {}; // key: bahan_baku_id

      // Referensi berat bahan (nama → berat_bersih & BDD) utk bahan GRID
      // (siklus_menu_item_bahan) yang tidak punya berat_1_sp di master bahan.
      let spRefMap = {};
      try {
        const [refs] = await db.query(
          'SELECT nama, bdd_persen, berat_bersih FROM sp_referensi_bahan WHERE tenant_id=?',
          [t]
        );
        for (const r of refs) {
          spRefMap[r.nama] = { bdd_persen: Math.round(Number(r.bdd_persen) * 100) || 100, berat_bersih: Number(r.berat_bersih) || 0 };
        }
      } catch (e) { /* tabel optional */ }

      // Kebutuhan dari resep menu (menu_bahan). Bahan yang sudah dihitung dari
      // resep dicatat supaya bahan grid hari yang sama TIDAK dihitung dua kali.
      const coveredBahan = new Set(); // `${hari_ke}::${bahan_baku_id}`

      for (const mi of menuItems) {
        const porsi = Number(mi.jumlah_porsi) || totalPm;

        const mid = effMenuId(mi);
        const bahanList = bahanByMenu[mid] || [];
        const menuNama = mi.menu_nama || 'Menu #' + mid;

        for (const b of bahanList) {
          // Berat KOTOR per porsi (dgn BDD) — sama dgn Total Kebutuhan, agar RAB
          // = angka belanja (mis. ketik 0,5 kg → tampil 1/2 kg, bukan 500,33 g).
          // Dijumlahkan dgn presisi penuh (tanpa pembulatan per menu) agar
          // pembulatan per baris tidak melebar saat dikalikan ribuan porsi.
          const beratKotorPerPorsi = hitungBDD(b.jumlah_per_porsi, b.persen_bdd);
          const totalGram = beratKotorPerPorsi * porsi;

          if (!bahanAgg[b.bahan_baku_id]) {
            bahanAgg[b.bahan_baku_id] = {
              bahan_baku_id: b.bahan_baku_id,
              bahan_nama: b.bahan_nama,
              satuan: b.satuan,
              total_gram: 0,
              harga_satuan: b.harga_satuan,
              berat_per_satuan: b.berat_per_satuan,
              buffer_persen: b.buffer_persen,
              kategori_sp: b.kategori_sp,
              keterangan: b.keterangan || '',
            };
          }
          bahanAgg[b.bahan_baku_id].total_gram += totalGram;
          coveredBahan.add(mi.hari_ke + '::' + b.bahan_baku_id);
        }
      }

      // Bahan GRID (siklus_menu_item_bahan) — dipakai utk hari yang resepnya
      // belum tersimpan sebagai menu (menu_nama tidak cocok dgn tabel menu),
      // konsisten dgn Total Kebutuhan. Bahan yang sudah masuk resep menu
      // (coveredBahan) dilewati agar tidak menghitung dua kali.
      const gridSiklusId = siklusId || (siklusInfo ? siklusInfo.id : 0);
      if (gridSiklusId && menuItems.length) {
        const selectedDays = new Set(menuItems.map(mi => mi.hari_ke));
        const gridBahanBySiklus = await batchLoadGridBahanBySiklus([gridSiklusId]);
        const gridBahan = (gridBahanBySiklus[gridSiklusId] || [])
          .filter(g => selectedDays.has(g.hari_ke) && !coveredBahan.has(g.hari_ke + '::' + g.bahan_baku_id));
        for (const g of gridBahan) {
          const { beratPerSiswa, persenBdd } = resolveGridBeratPerSiswa(g, spRefMap);
          // Bahan TIDAK boleh hilang dari RAB: tanpa berat (0) tetap masuk daftar
          // dengan kebutuhan 0 (konsisten dengan bahan resep menu yang jumlahnya 0),
          // agar bahan yang belum dilengkapi berat tetap terlihat di RAB.
          const dayItem = menuItems.find(mi => mi.hari_ke === g.hari_ke);
          const porsi = (dayItem && Number(dayItem.jumlah_porsi)) || totalPm;
          const totalGram = beratPerSiswa > 0 ? hitungBDD(beratPerSiswa, persenBdd) * porsi : 0;

          if (!bahanAgg[g.bahan_baku_id]) {
            bahanAgg[g.bahan_baku_id] = {
              bahan_baku_id: g.bahan_baku_id,
              bahan_nama: g.nama || '',
              satuan: g.satuan || 'g',
              total_gram: 0,
              harga_satuan: Number(g.harga_satuan) || 0,
              berat_per_satuan: Number(g.berat_per_satuan) || 0,
              buffer_persen: Number(g.buffer_persen) || 0,
              kategori_sp: g.kategori_sp || '',
              keterangan: (beratPerSiswa > 0 ? '' : 'Berat bahan kosong'),
            };
          }
          bahanAgg[g.bahan_baku_id].total_gram += totalGram;
        }
      }

      // Calculate totals with prices and build items array.
      // QTY belanja persis seperti Total Kebutuhan: kebutuhan total + buffer,
      // pecahan untuk kg < 1 (mis. 1/2 kg), pembulatan ke atas untuk ≥ 1 kg,
      // konversi satuan unit (pcs/btl/karton) via berat_per_satuan.
      let no = 0;
      const items = Object.values(bahanAgg)
        .sort((a, b) => b.total_gram - a.total_gram)
        .map(b => {
          no++;
          const totalKg = b.total_gram / 1000;
          const bufferKg = Math.round(totalKg * (1 + b.buffer_persen / 100) * 100) / 100;
          const qtyInfo = tkQtyBelanja(b.satuan, bufferKg, totalPm, b.kategori_sp, b.berat_per_satuan);

          const displayQty = qtyInfo.qty;
          const displaySatuan = qtyInfo.satuan || String(b.satuan || '').toUpperCase();
          const qtyText = qtyInfo.qty_text || '0';

          const jumlah = Math.round(b.harga_satuan * displayQty);
          grandTotal += jumlah;

          return {
            no,
            nama: b.bahan_nama,
            qty: displayQty,
            qty_text: qtyText,
            satuan: displaySatuan,
            harga: b.harga_satuan,
            jumlah,
            keterangan: b.keterangan,
          };
        });

      // Get anggaran belanja harian from budget table
      const periode = tanggal.slice(0, 7);
      const [[{ total_budget_periode, total_hari_periode } = { total_budget_periode: 0, total_hari_periode: 0 }]] = await db.query(
        `SELECT COALESCE(SUM(total_budget),0) AS total_budget_periode,
                COALESCE(MAX(sm.total_hari),0) AS total_hari_periode
         FROM budget b
         LEFT JOIN siklus_menu sm ON sm.id=? AND sm.tenant_id=?
         WHERE b.tenant_id=? AND b.periode=?`,
        [siklusId || 0, t, t, periode]
      );

      const totalHariBudget = total_hari_periode || siklusInfo?.total_hari || 1;
      const anggaranBelanjaHarian = Math.round(total_budget_periode / Math.max(totalHariBudget, 1));

      // Build menu description
      const menuDeskripsi = menuItems.map(m => m.menu_nama).filter(Boolean).join(' + ');
      const hariNama = menuItems[0]?.hari_nama || '';

      return {
        tanggal,
        hari: hariNama,
        siklus: siklusInfo,
        hari_ke: hariKe,
        menu_deskripsi: menuDeskripsi,
        items,
        total: grandTotal,
        anggaran_belanja_harian: anggaranBelanjaHarian,
        sisa: anggaranBelanjaHarian - grandTotal,
        item_count: items.length,
      };
    } catch (err) {
      console.error('RAB harian error:', err);
      throw err;
    }
  }

  router.get('/laporan/rab-harian', roleOps, async (req, res) => {
    try {
      const t = req.user.tenant_id;
      const tanggal = req.query.tanggal || new Date().toISOString().slice(0, 10);
      const siklusId = req.query.siklus_id || '';
      res.json(await getRabHarianData(t, tanggal, siklusId));
    } catch (err) {
      console.error('RAB harian error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ===== Export RAB Harian ke Excel (template public/template/RAB.xlsx) =====
  function captureStyles(ws) {
    const cap = (r, c) => { const cell = ws.getCell(r, c); return { style: cell.style, numFmt: cell.numFmt }; };
    const itemStyle = []; for (let c = 1; c <= 7; c++) itemStyle.push(cap(8, c));
    const labelStyle = cap(9, 1);
    const valStyle = cap(9, 6);
    const anggLabelStyle = cap(10, 1);
    const anggValStyle = cap(10, 6);
    const sisaLabelStyle = cap(11, 1);
    const sisaValStyle = cap(11, 6);
    const hdr2Style = []; for (let c = 1; c <= 6; c++) hdr2Style.push(cap(14, c));
    const titikSekolahStyle = []; for (let c = 1; c <= 6; c++) titikSekolahStyle.push(cap(15, c));
    const titikPosyanduStyle = []; for (let c = 1; c <= 6; c++) titikPosyanduStyle.push(cap(17, c));
    const total2Style = { d: cap(21, 4), f: cap(21, 6) };
    return { itemStyle, labelStyle, valStyle, anggLabelStyle, anggValStyle, sisaLabelStyle, sisaValStyle, hdr2Style, titikSekolahStyle, titikPosyanduStyle, total2Style };
  }

  function clearDataRegion(ws) {
    const merges = ws._merges || {};
    for (const k of Object.keys(merges)) {
      const m = merges[k];
      if (m.top >= 8) {
        try { ws.unMergeCells(COL_LETTER(m.left) + m.top + ':' + COL_LETTER(m.right) + m.bottom); } catch (e) {}
      }
    }
    const maxRow = Math.min(ws.rowCount, 100);
    for (let r = 8; r <= maxRow; r++) {
      for (let c = 1; c <= 10; c++) {
        const cell = ws.getCell(r, c);
        cell.value = null;
        cell.style = {};
      }
    }
  }

  function fillDaySheet(ws, data, S) {
    const items = data.rab.items || [];
    // Anggaran = nilai dari tabel budget (konsisten dgn web RAB Harian, dan
    // dengan fitur Budget Harian di Siklus). Fallback ke pagu per-titik bila
    // periode belum punya budget.
    const anggaran = Number(data.rab.anggaran_belanja_harian) || Number(data.titik.grand_total) || 0;
    const totalBahan = Number(data.rab.total) || 0;
    const sisa = anggaran - totalBahan;
    const dlabel = data.d.getDate() + ' ' + MONTHS_ID[data.d.getMonth()] + ' ' + data.d.getFullYear();

    ws.getCell('A5').value = 'MENU: ' + (data.rab.menu_deskripsi || '');
    ws.getCell('A6').value = 'Hari : ' + HARI_ID[data.d.getDay()] + ' ' + dlabel;

    clearDataRegion(ws);

    const put = (r, c, v, styleObj, numFmt) => {
      const cell = ws.getCell(r, c);
      cell.value = v;
      if (styleObj) cell.style = JSON.parse(JSON.stringify(styleObj));
      if (numFmt) cell.numFmt = numFmt;
    };
    const merge = (r1, c1, r2, c2) => { try { ws.mergeCells(r1, c1, r2, c2); } catch (e) {} };

    let row = 8;
    items.forEach((it, i) => {
      // QTY: pecahan (mis. "1/2") ditulis teks; angka biasa ditulis numerik agar
      // bisa dijumlah di Excel (hindari "number stored as text").
      const qtyCell = (it.qty_text && /\//.test(String(it.qty_text))) ? it.qty_text : (Number(it.qty) || 0);
      put(row, 1, i + 1, S.itemStyle[0].style);
      put(row, 2, it.nama, S.itemStyle[1].style);
      put(row, 3, qtyCell, S.itemStyle[2].style);
      put(row, 4, it.satuan, S.itemStyle[3].style);
      put(row, 5, Number(it.harga) || 0, S.itemStyle[4].style, MONEY_FMT);
      put(row, 6, Number(it.jumlah) || 0, S.itemStyle[5].style, MONEY_FMT);
      put(row, 7, it.keterangan || null, S.itemStyle[6].style);
      row++;
    });

    const totRow = row, anggRow = totRow + 1, sisaRow = totRow + 2;
    const putLabel = (r, label, v, ls, vs) => { put(r, 1, label, ls.style); put(r, 6, v, vs.style, MONEY_FMT); merge(r, 1, r, 5); };
    putLabel(totRow, 'TOTAL', totalBahan, S.labelStyle, S.valStyle);
    putLabel(anggRow, 'ANGGARAN BELANJA HARIAN', anggaran, S.anggLabelStyle, S.anggValStyle);
    putLabel(sisaRow, 'SISA', sisa, S.sisaLabelStyle, S.sisaValStyle);

    const hdr2Row = sisaRow + 3;
    const titikStart = hdr2Row + 1;
    const h2 = ['NO', 'TANGGAL / SEKOLAH', 'KLASIFIKASI', 'JUMLAH SISWA & GURU', 'PAGU HARGA', 'JUMLAH'];
    h2.forEach((h, i) => put(hdr2Row, i + 1, h, S.hdr2Style[i].style));

    let tr = titikStart, no = 0, totalSiswa = 0;
    const writeTitik = (titik, isPosyandu) => {
      const rows = titik.rows || [];
      const st = isPosyandu ? S.titikPosyanduStyle : S.titikSekolahStyle;
      const start = tr;
      let first = true;
      for (const r of rows) {
        put(tr, 1, first ? ++no : null, st[0].style);
        put(tr, 2, first ? titik.nama : null, st[1].style);
        put(tr, 3, r.klasifikasi, st[2].style);
        totalSiswa += Number(r.jumlah) || 0;
        put(tr, 4, Number(r.jumlah) || 0, st[3].style);
        put(tr, 5, Number(r.pagu) || 0, st[4].style, MONEY_FMT);
        put(tr, 6, Number(r.total) || 0, st[5].style, MONEY_FMT);
        first = false; tr++;
      }
      if (rows.length > 1) { merge(start, 1, tr - 1, 1); merge(start, 2, tr - 1, 2); }
    };
    (data.titik.sekolah || []).forEach(t => writeTitik(t, false));
    (data.titik.posyandu || []).forEach(t => writeTitik(t, true));

    const total2Row = tr + 1;
    put(total2Row, 4, totalSiswa, S.total2Style.d.style);
    put(total2Row, 6, Number(data.titik.grand_total) || 0, S.total2Style.f.style, MONEY_FMT);
  }

  function fillTotalSheet(ws, dayData) {
    const d0 = dayData[0].d;
    const label = dayData.length > 1
      ? d0.getDate() + '-' + dayData[dayData.length - 1].d.getDate() + ' ' + MONTHS_ID[d0.getMonth()] + ' ' + d0.getFullYear()
      : d0.getDate() + ' ' + MONTHS_ID[d0.getMonth()] + ' ' + d0.getFullYear();
    ws.getCell('A1').value = 'TOTAL RAB BAHAN BAKU ' + label;
    ['TANGGAL', 'ANGGARAN', 'REALISASI', 'SELISIH'].forEach((h, i) => { ws.getCell(3, i + 1).value = h; });
    let r = 4, sumA = 0, sumR = 0, sumS = 0;
    for (const dd of dayData) {
      // Anggaran harian dari tabel budget dulu (konsisten dgn sheet harian);
      // fallback ke pagu per-titik.
      const angg = Number(dd.rab.anggaran_belanja_harian) || Number(dd.titik.grand_total) || 0;
      const real = Number(dd.rab.total) || 0;
      const sel = angg - real;
      sumA += angg; sumR += real; sumS += sel;
      const row = ws.getRow(r);
      row.getCell(1).value = dd.d.getDate() + ' ' + MONTHS_ID[dd.d.getMonth()];
      row.getCell(2).value = angg; row.getCell(2).numFmt = MONEY_FMT2;
      row.getCell(3).value = real; row.getCell(3).numFmt = MONEY_FMT2;
      row.getCell(4).value = sel; row.getCell(4).numFmt = MONEY_FMT2;
      r++;
    }
    const row = ws.getRow(r);
    row.getCell(1).value = 'TOTAL';
    row.getCell(2).value = sumA; row.getCell(2).numFmt = MONEY_FMT2;
    row.getCell(3).value = sumR; row.getCell(3).numFmt = MONEY_FMT2;
    row.getCell(4).value = sumS; row.getCell(4).numFmt = MONEY_FMT2;
  }

  // ===== Cek apakah ada data RAB harian =====
  router.get('/laporan/rab-harian/check', roleOps, async (req, res) => {
    try {
      const t = req.user.tenant_id;
      const tanggal = req.query.tanggal || '';
      const tanggalSampai = req.query.tanggal_sampai || '';
      if (!tanggal) return res.status(400).json({ error: 'tanggal wajib diisi' });

      const d0 = new Date(tanggal + 'T00:00:00');
      if (isNaN(d0.getTime())) return res.status(400).json({ error: 'tanggal tidak valid' });

      // Bangun daftar hari (1 hari bila tanggal_sampai kosong, atau rentang).
      const days = [d0];
      if (tanggalSampai) {
        const dN = new Date(tanggalSampai + 'T00:00:00');
        if (isNaN(dN.getTime())) return res.status(400).json({ error: 'tanggal_sampai tidak valid' });
        if (dN < d0) return res.status(400).json({ error: 'tanggal_sampai tidak boleh lebih awal dari tanggal' });
        const rangeDays = Math.round((dN - d0) / 86400000) + 1;
        if (rangeDays > 31) return res.status(400).json({ error: 'Rentang maksimal 31 hari' });
        for (let i = 1; i < rangeDays; i++) {
          const dd = new Date(d0);
          dd.setDate(dd.getDate() + i);
          days.push(dd);
        }
      }

      let hasData = false;
      for (const d of days) {
        const ymd = ymdStr(d);
        const [rab, titik] = await Promise.all([
          getRabHarianData(t, ymd, ''),
          getRabPerTitikData(t, ymd, ''),
        ]);
        if (rab && rab.items && rab.items.length > 0) {
          hasData = true;
          break;
        }
      }

      res.json({ hasData });
    } catch (err) {
      console.error('Check RAB data error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ===== Export RAB Harian ke Excel (template public/template/RAB.xlsx) =====
  // Bila ?tanggal_sampai diisi, export menghasilkan 1 sheet per hari.
  function cloneTemplateSheet(wb, pristineModel, merges, name) {
    const model = JSON.parse(JSON.stringify(pristineModel));
    model.name = name;
    model.merges = [];
    const ws = wb.addWorksheet(name);
    ws.model = model;
    for (const r of merges) ws.mergeCells(r);
    return ws;
  }

  router.get('/laporan/rab-harian/export', roleOps, async (req, res) => {
    try {
      const t = req.user.tenant_id;
      const tanggal = req.query.tanggal || '';
      const tanggalSampai = req.query.tanggal_sampai || '';
      const siklusId = req.query.siklus_id || '';
      if (!tanggal) return res.status(400).json({ error: 'tanggal wajib diisi' });

      const d0 = new Date(tanggal + 'T00:00:00');
      if (isNaN(d0.getTime())) return res.status(400).json({ error: 'tanggal tidak valid' });

      // Bangun daftar hari (1 hari bila tanggal_sampai kosong, atau rentang).
      const days = [d0];
      if (tanggalSampai) {
        const dN = new Date(tanggalSampai + 'T00:00:00');
        if (isNaN(dN.getTime())) return res.status(400).json({ error: 'tanggal_sampai tidak valid' });
        if (dN < d0) return res.status(400).json({ error: 'tanggal_sampai tidak boleh lebih awal dari tanggal' });
        const rangeDays = Math.round((dN - d0) / 86400000) + 1;
        if (rangeDays > 31) return res.status(400).json({ error: 'Rentang maksimal 31 hari' });
        for (let i = 1; i < rangeDays; i++) {
          const dd = new Date(d0);
          dd.setDate(dd.getDate() + i);
          days.push(dd);
        }
      }

      const allDayData = [];
      for (const d of days) {
        const ymd = ymdStr(d);
        const [rab, titik] = await Promise.all([
          getRabHarianData(t, ymd, siklusId),
          getRabPerTitikData(t, ymd, ''),
        ]);
        allDayData.push({ d, rab, titik });
      }

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(path.join(__dirname, '..', '..', 'public', 'template', 'RAB.xlsx'));

  const halWs = wb.getWorksheet('hal 1');
  if (!halWs) throw new Error('Template RAB tidak memiliki sheet "hal 1"');

  // Check if there's any data to export
  if (!allDayData.length || !allDayData.some(day => day.rab && day.rab.items && day.rab.items.length > 0)) {
    return res.status(400).json({ error: 'Tidak ada data RAB untuk tanggal yang dipilih' });
  }

      // Template dipakai apa adanya: judul/SPPG/YAYASAN (baris 2-6) & header
      // kolom (baris 7) dibiarkan dari RAB.xlsx, hanya area data (baris 8+)
      // yang diisi ulang oleh fillDaySheet. Gaya diambil dari baris contoh
      // template agar hasil export seragam dengan template.
      const S = captureStyles(halWs);
      const pristineModel = JSON.parse(JSON.stringify(halWs.model));
      const pristineMerges = JSON.parse(JSON.stringify(pristineModel.merges));

      // Hari pertama memakai sheet "hal 1" (direname), sisanya hasil clone.
      const first = allDayData[0];
      halWs.name = daySheetName(first.d);
      fillDaySheet(halWs, first, S);
      for (let i = 1; i < allDayData.length; i++) {
        const dd = allDayData[i];
        const ws = cloneTemplateSheet(wb, pristineModel, pristineMerges, daySheetName(dd.d));
        fillDaySheet(ws, dd, S);
      }

      const tWs = wb.getWorksheet('total');
      if (tWs) {
        // Nama sheet maksimal 31 karakter & tidak boleh mengandung '/' — pakai
        // label ringkas "TOTAL RAB 10-12 AGUSTUS 2026" utk rentang hari.
        const last = allDayData[allDayData.length - 1].d;
        const totalName = allDayData.length > 1
          ? 'TOTAL RAB ' + first.d.getDate() + '-' + last.getDate() + ' ' + MONTHS_ID[first.d.getMonth()] + ' ' + last.getFullYear()
          : 'TOTAL RAB ' + daySheetName(first.d);
        if (tWs.name !== totalName) tWs.name = totalName;
        fillTotalSheet(tWs, allDayData);
      }

      const fileTag = allDayData.length > 1
        ? tanggal + '-' + tanggalSampai
        : tanggal;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="RAB-' + fileTag + '.xlsx"');
      await wb.xlsx.write(res);
    } catch (err) {
      console.error('Export RAB error:', err);
      res.status(500).json({ error: err.message });
    }
  });

    // ===== API untuk cek data RAB untuk Akuntan =====
    router.get('/laporan/rab-harian/check-akuntan', roleFinance, async (req, res) => {
      try {
        const t = req.user.tenant_id;
        const tanggal = req.query.tanggal || '';
        const tanggalSampai = req.query.tanggal_sampai || '';
        if (!tanggal) return res.status(400).json({ error: 'tanggal wajib diisi' });

        const d0 = new Date(tanggal + 'T00:00:00');
        if (isNaN(d0.getTime())) return res.status(400).json({ error: 'tanggal tidak valid' });

        const days = [d0];
        if (tanggalSampai) {
          const dN = new Date(tanggalSampai + 'T00:00:00');
          if (isNaN(dN.getTime())) return res.status(400).json({ error: 'tanggal_sampai tidak valid' });
          if (dN < d0) return res.status(400).json({ error: 'tanggal_sampai tidak boleh lebih awal dari tanggal' });
          const rangeDays = Math.round((dN - d0) / 86400000) + 1;
          if (rangeDays > 31) return res.status(400).json({ error: 'Rentang maksimal 31 hari' });
          for (let i = 1; i < rangeDays; i++) {
            const dd = new Date(d0);
            dd.setDate(dd.getDate() + i);
            days.push(dd);
          }
        }

        let hasData = false;
        for (const d of days) {
          const ymd = ymdStr(d);
          const [rab, titik] = await Promise.all([
            getRabHarianData(t, ymd, ''),
            getRabPerTitikData(t, ymd, ''),
          ]);
          if (rab && rab.items && rab.items.length > 0) {
            hasData = true;
            break;
          }
        }

        res.json({
          hasData,
          warning: hasData ? null : 'Tidak ada data RAB untuk tanggal yang dipilih. Mohon cek dengan akuntan.'
        });
      } catch (err) {
        console.error('Check RAB data for accountant error:', err);
        res.status(500).json({ error: err.message });
      }
    });

    // ===== API untuk cek data RAB untuk Ahli Gizi =====
    router.get('/laporan/rab-harian/check-ahli-gizi', roleOps, async (req, res) => {
      try {
        const t = req.user.tenant_id;
        const tanggal = req.query.tanggal || '';
        const tanggalSampai = req.query.tanggal_sampai || '';
        if (!tanggal) return res.status(400).json({ error: 'tanggal wajib diisi' });

        const d0 = new Date(tanggal + 'T00:00:00');
        if (isNaN(d0.getTime())) return res.status(400).json({ error: 'tanggal tidak valid' });

        const days = [d0];
        if (tanggalSampai) {
          const dN = new Date(tanggalSampai + 'T00:00:00');
          if (isNaN(dN.getTime())) return res.status(400).json({ error: 'tanggal_sampai tidak valid' });
          if (dN < d0) return res.status(400).json({ error: 'tanggal_sampai tidak boleh lebih awal dari tanggal' });
          const rangeDays = Math.round((dN - d0) / 86400000) + 1;
          if (rangeDays > 31) return res.status(400).json({ error: 'Rentang maksimal 31 hari' });
          for (let i = 1; i < rangeDays; i++) {
            const dd = new Date(d0);
            dd.setDate(dd.getDate() + i);
            days.push(dd);
          }
        }

        let hasData = false;
        for (const d of days) {
          const ymd = ymdStr(d);
          const [rab, titik] = await Promise.all([
            getRabHarianData(t, ymd, ''),
            getRabPerTitikData(t, ymd, ''),
          ]);
          if (rab && rab.items && rab.items.length > 0) {
            hasData = true;
            break;
          }
        }

        res.json({
          hasData,
          warning: hasData ? null : 'Tidak ada data RAB untuk tanggal yang dipilih. Mohon cek dengan ahli gizi.'
        });
      } catch (err) {
        console.error('Check RAB data for nutritionist error:', err);
        res.status(500).json({ error: err.message });
      }
    });

  // ===== Export RAB per Periode ke Excel (data budget yang dibuat akuntan) =====
  router.get('/laporan/rab-periode/export', roleOps, async (req, res) => {
    try {
      const t = req.user.tenant_id;
      const { periode } = req.query;
      if (!periode) return res.status(400).json({ error: 'Periode wajib diisi (YYYY-MM)' });
      if (!/^\d{4}-\d{2}$/.test(periode)) return res.status(400).json({ error: 'Format periode tidak valid (YYYY-MM)' });

      const [budgetRows] = await db.query(
        `SELECT id, kategori_penerima, jumlah_penerima, harga_per_porsi, biaya_operasional, total_budget, realisasi, catatan
         FROM budget WHERE tenant_id=? AND periode=? ORDER BY kategori_penerima`,
        [t, periode]
      );

      const [[{ total_hari } = { total_hari: 0 }]] = await db.query(
        `SELECT COUNT(DISTINCT tanggal_produksi) as total_hari
         FROM produksi WHERE tenant_id=? AND DATE_FORMAT(tanggal_produksi, '%Y-%m')=?`,
        [t, periode]
      );

      const [realisasiPerKat] = await db.query(
        `SELECT kategori, SUM(jumlah) as total
         FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
         AND DATE_FORMAT(tanggal, '%Y-%m')=?
         GROUP BY kategori ORDER BY total DESC`,
        [t, periode]
      );

      const [[{ total_realisasi_kas } = { total_realisasi_kas: 0 }]] = await db.query(
        `SELECT COALESCE(SUM(jumlah),0) AS total_realisasi_kas
         FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
         AND DATE_FORMAT(tanggal, '%Y-%m')=?`,
        [t, periode]
      );

      const totalBudget = budgetRows.reduce((s, r) => s + Number(r.total_budget), 0);
      const totalRealisasiBudget = budgetRows.reduce((s, r) => s + Number(r.realisasi), 0);

      const wb = new ExcelJS.Workbook();
      wb.creator = req.user.nama || '';
      wb.created = new Date();
      const ws = wb.addWorksheet('RAB ' + periode);

      const [y, m] = periode.split('-');
      const bulanLbl = MONTHS_ID[parseInt(m, 10) - 1];
      ws.columns = [
        { key: 'no', width: 6 },
        { key: 'kategori', width: 28 },
        { key: 'penerima', width: 14 },
        { key: 'harga', width: 16 },
        { key: 'biaya', width: 18 },
        { key: 'budget', width: 18 },
        { key: 'realisasi', width: 18 },
        { key: 'selisih', width: 18 },
        { key: 'capaian', width: 12 },
      ];

      const title = ws.getCell('A1');
      title.value = 'RENCANA ANGGARAN BIAYA (RAB) — ' + bulanLbl + ' ' + y;
      title.font = { name: 'Calibri', size: 14, bold: true };
      ws.mergeCells('A1:I1');
      ws.getCell('A2').value = 'Periode : ' + periode + '  •  Hari Produksi : ' + total_hari;
      ws.getCell('A2').font = { name: 'Calibri', size: 10, italic: true };
      ws.mergeCells('A2:I2');

      const header = ['NO', 'KATEGORI PENERIMA', 'JML PENERIMA', 'HARGA/PORSI', 'BIAYA OPERASIONAL', 'TOTAL BUDGET', 'REALISASI', 'SELISIH', 'CAPAIAN'];
      const hdrRow = ws.getRow(4);
      header.forEach((h, i) => {
        const cell = hdrRow.getCell(i + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
      ws.views = [{ state: 'frozen', ySplit: 4 }];

      let r = 5;
      budgetRows.forEach((b, idx) => {
        const budget = Number(b.total_budget) || 0;
        const real = Number(b.realisasi) || 0;
        const selisih = budget - real;
        const capaian = budget > 0 ? (real / budget * 100) : 0;
        const cells = [
          idx + 1,
          b.kategori_penerima || 'Umum',
          Number(b.jumlah_penerima) || 0,
          Number(b.harga_per_porsi) || 0,
          Number(b.biaya_operasional) || 0,
          budget,
          real,
          selisih,
          capaian,
        ];
        cells.forEach((v, ci) => {
          const cell = ws.getCell(r, ci + 1);
          cell.value = v;
          cell.font = { name: 'Calibri', size: 10 };
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          if (ci === 0) { cell.alignment = { horizontal: 'center' }; }
          if (ci >= 2 && ci <= 7) cell.numFmt = MONEY_FMT;
          if (ci === 8) { cell.numFmt = '0.0"%"'; cell.alignment = { horizontal: 'right' }; }
        });
        r++;
      });

      const totalCells = [
        '',
        'TOTAL',
        budgetRows.reduce((s, b) => s + (Number(b.jumlah_penerima) || 0), 0),
        '',
        budgetRows.reduce((s, b) => s + (Number(b.biaya_operasional) || 0), 0),
        totalBudget,
        totalRealisasiBudget,
        totalBudget - totalRealisasiBudget,
        totalBudget > 0 ? (totalRealisasiBudget / totalBudget * 100) : 0,
      ];
      totalCells.forEach((v, ci) => {
        const cell = ws.getCell(r, ci + 1);
        cell.value = v;
        cell.font = { name: 'Calibri', size: 10, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4FF' } };
        cell.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
        if (ci >= 2 && ci <= 7) cell.numFmt = MONEY_FMT;
        if (ci === 8) { cell.numFmt = '0.0"%"'; cell.alignment = { horizontal: 'right' }; }
      });

      const rk = r + 2;
      ws.getCell('A' + rk).value = 'REALISASI KAS KELUAR PER KATEGORI';
      ws.getCell('A' + rk).font = { name: 'Calibri', size: 11, bold: true };
      ws.mergeCells('A' + rk + ':I' + rk);
      const rkHdr = rk + 1;
      ['KATEGORI', 'JUMLAH', 'PERSENTASE'].forEach((h, i) => {
        const cell = ws.getCell(rkHdr, i + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
        cell.alignment = { horizontal: 'center' };
      });
      let rr = rkHdr + 1;
      realisasiPerKat.forEach(x => {
        ws.getCell('A' + rr).value = x.kategori;
        ws.getCell('B' + rr).value = Number(x.total) || 0;
        ws.getCell('B' + rr).numFmt = MONEY_FMT;
        ws.getCell('C' + rr).value = total_realisasi_kas > 0 ? (Number(x.total) / total_realisasi_kas * 100) : 0;
        ws.getCell('C' + rr).numFmt = '0.0"%"';
        rr++;
      });
      ws.getCell('A' + rr).value = 'TOTAL';
      ws.getCell('A' + rr).font = { name: 'Calibri', size: 10, bold: true };
      ws.getCell('B' + rr).value = total_realisasi_kas;
      ws.getCell('B' + rr).numFmt = MONEY_FMT;
      ws.getCell('B' + rr).font = { name: 'Calibri', size: 10, bold: true };
      ws.getCell('C' + rr).value = 100;
      ws.getCell('C' + rr).numFmt = '0.0"%"';
      ws.getCell('C' + rr).font = { name: 'Calibri', size: 10, bold: true };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="RAB-' + periode + '.xlsx"');
      await wb.xlsx.write(res);
    } catch (err) {
      console.error('Export RAB per periode error:', err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
      else res.end();
    }
  });

  // ===== RAB Pembelian Supplier — rincian biaya pembelian per periode =====
  router.get('/laporan/rab-pembelian-suplier', roleFinance, async (req, res) => {
    try {
      const t = req.user.tenant_id;
      const { bulan, tahun } = req.query;
      const now = new Date();
      const filterBulan = bulan || String(now.getMonth() + 1).padStart(2, '0');
      const filterTahun = tahun || String(now.getFullYear());
      const periode = `${filterTahun}-${filterBulan}`;

      // 1. Budget info
      const [budgetRows] = await db.query(
        `SELECT kategori_penerima, jumlah_penerima, harga_per_porsi, total_budget, realisasi
         FROM budget WHERE tenant_id=? AND periode=?`,
        [t, periode]
      );

      // 2. Penerima manfaat
      const [penerima] = await db.query(
        `SELECT kategori_penerima, SUM(paket_besar + paket_kecil) as total_penerima
         FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima IS NOT NULL
         GROUP BY kategori_penerima`,
        [t]
      );

      // 3. Pembayaran Supplier detail from kas_bank (kategori = 'Pembayaran Supplier')
      const [supplierPayments] = await db.query(
        `SELECT k.id, k.tanggal, k.no_transaksi, k.tipe, k.kategori, k.akun, k.akun_id, k.deskripsi, k.jumlah, s.nama as supplier_nama
         FROM kas_bank k
         LEFT JOIN purchase_order po ON po.no_po = k.no_transaksi AND po.tenant_id = k.tenant_id
         LEFT JOIN supplier s ON s.id = po.supplier_id
         WHERE k.tenant_id=? AND k.tipe='keluar'
           AND k.kategori='Pembayaran Supplier'
           AND DATE_FORMAT(k.tanggal, '%Y-%m')=?
         ORDER BY k.tanggal DESC`,
        [t, periode]
      );

      const totalPembayaranSupplier = supplierPayments.reduce((s, p) => s + Number(p.jumlah), 0);

      // 4. Total pengeluaran
      const [[{ total_pengeluaran } = { total_pengeluaran: 0 }]] = await db.query(
        `SELECT COALESCE(SUM(jumlah),0) AS total_pengeluaran
         FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
           AND DATE_FORMAT(tanggal, '%Y-%m')=?`,
        [t, periode]
      );

      // 5. Sisa budget
      const totalBudget = budgetRows.reduce((s, b) => s + Number(b.total_budget), 0);
      const totalRealisasiBudget = budgetRows.reduce((s, b) => s + Number(b.realisasi), 0);

      res.json({
        periode,
        penerima: penerima.map(p => ({
          kategori: p.kategori_penerima,
          jumlah: Number(p.total_penerima),
        })),
        budget: {
          total_budget: totalBudget,
          total_realisasi_budget: totalRealisasiBudget,
          sisa_budget: totalBudget - totalRealisasiBudget,
        },
        pembayaran_supplier: {
          total: totalPembayaranSupplier,
          rincian: supplierPayments.map(sp => ({
            id: sp.id,
            tanggal: sp.tanggal,
            no_transaksi: sp.no_transaksi,
            deskripsi: sp.deskripsi,
            supplier: sp.supplier_nama || '-',
            jumlah: Number(sp.jumlah),
          })),
          persentase_dari_total: total_pengeluaran > 0
            ? (totalPembayaranSupplier / total_pengeluaran * 100).toFixed(1)
            : 0,
        },
        total_pengeluaran: Number(total_pengeluaran),
      });
    } catch (err) {
      console.error('RAB pembelian supplier error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 9. RAB per titik (sekolah/posyandu) - Operasional/Produksi/Admin
  async function getRabPerTitikData(t, tanggalFilter, periodeFilter) {
    try {
      let pmRows;
      let pakaiSnapshot = false;
      if (tanggalFilter) {
        const attrs = 'penerima_manfaat_id as id, nama_titik as nama_kelompok, paket_besar, paket_kecil, kategori_penerima, NULL as lokasi';
        const [[{ cnt } = { cnt: 0 }]] = await db.query(
          `SELECT COUNT(*) as c FROM pm_harian WHERE tenant_id=? AND tanggal=? LIMIT 1`,
          [t, tanggalFilter]
        );
        if (Number(cnt) > 0) {
          [pmRows] = await db.query(
            `SELECT ${attrs} FROM pm_harian
             WHERE tenant_id=? AND tanggal=?
             ORDER BY nama_titik ASC`,
            [t, tanggalFilter]
          );
          pakaiSnapshot = true;
        }
      }
      if (!pmRows) {
        [pmRows] = await db.query(
          `SELECT id, nama_kelompok, paket_besar, paket_kecil, kategori_penerima, lokasi
           FROM penerima_manfaat
           WHERE tenant_id=?
           ORDER BY nama_kelompok ASC`,
          [t]
        );
      }

      const [budgetCols] = await db.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'budget'"
      );
      const colNames = budgetCols.map(c => c.COLUMN_NAME);
      const hasHargaBesar = colNames.includes('harga_besar');
      const hasHargaKecil = colNames.includes('harga_kecil');

      const budgetSelect =
        'SELECT periode, kategori_penerima, harga_per_porsi' +
        (hasHargaBesar ? ', harga_besar' : '') +
        (hasHargaKecil ? ', harga_kecil' : '') +
        ' FROM budget WHERE tenant_id=? ORDER BY periode DESC, id ASC';

      const [budgetRows] = await db.query(budgetSelect, [t]);

      const byPeriode = {};
      for (const b of budgetRows) {
        if (!byPeriode[b.periode]) byPeriode[b.periode] = [];
        byPeriode[b.periode].push(b);
      }
      const periodeKeys = Object.keys(byPeriode).sort().reverse();
      const usePeriode = periodeKeys.find(p => !periodeFilter || p === periodeFilter) || periodeKeys[0] || '';
      const useBudget = usePeriode ? byPeriode[usePeriode] : [];

      const dbToDisplay = buildDbToDisplay();

      const budgetByKategori = {};
      for (const b of useBudget) {
        const bKey = dbToDisplay[b.kategori_penerima] || b.kategori_penerima;
        if (!budgetByKategori[bKey]) {
          const hargaBesar = hasHargaBesar ? (Number(b.harga_besar) || Number(b.harga_per_porsi) || 0) : (Number(b.harga_per_porsi) || 0);
          const hargaKecil = hasHargaKecil ? (Number(b.harga_kecil) || Number(b.harga_per_porsi) || 0) : (Number(b.harga_per_porsi) || 0);
          budgetByKategori[bKey] = { harga_besar: hargaBesar, harga_kecil: hargaKecil };
        }
      }

      const POSYANDU_KAT = ['Ibu Hamil', 'Ibu Menyusui', 'Balita', 'Bumil/Busui', 'Bumil', 'Busui'];

      function isPosyandu(pm) {
        if (/posyandu/i.test(pm.nama_kelompok || '')) return true;
        return parseKategoriPenerima(pm.kategori_penerima).some(k => POSYANDU_KAT.includes(k));
      }

      function buildTitik(pm) {
        const rawKat = (parseKategoriPenerima(pm.kategori_penerima)[0] || '').trim();
        const kat = dbToDisplay[rawKat] || rawKat;
        const pagu = budgetByKategori[kat] || budgetByKategori[rawKat] || { harga_besar: 0, harga_kecil: 0 };
        const kecil = Number(pm.paket_kecil) || 0;
        const besar = Number(pm.paket_besar) || 0;
        const posyandu = isPosyandu(pm);
        const labelKecil = posyandu ? 'Porsi Kecil' : 'Paud & Kelas 1-3';
        const labelBesar = posyandu ? 'Porsi Besar' : 'Kelas 4-12 + Guru';
        const rows = [
          { klasifikasi: labelKecil, jumlah: kecil, pagu: pagu.harga_kecil, total: kecil * pagu.harga_kecil },
          { klasifikasi: labelBesar, jumlah: besar, pagu: pagu.harga_besar, total: besar * pagu.harga_besar },
        ];
        const sub_total = rows.reduce((s, r) => s + r.total, 0);
        return { id: pm.id, nama: pm.nama_kelompok, kategori: kat, lokasi: pm.lokasi || '', rows, sub_total };
      }

      const sekolah = [];
      const posyandu = [];
      for (const pm of pmRows) {
        const titik = buildTitik(pm);
        if (isPosyandu(pm)) posyandu.push(titik);
        else sekolah.push(titik);
      }

      const sum = arr => arr.reduce((s, it) => s + (it.sub_total || 0), 0);

      return {
        periode: usePeriode || periodeFilter,
        tanggal: tanggalFilter,
        sumber: pakaiSnapshot ? 'snapshot' : 'live',
        sekolah,
        posyandu,
        total_sekolah: sum(sekolah),
        total_posyandu: sum(posyandu),
        grand_total: sum(sekolah) + sum(posyandu),
      };
    } catch (err) {
      console.error('RAB per titik error:', err);
      throw err;
    }
  }

  router.get('/laporan/rab-per-titik', roleOps, async (req, res) => {
    try {
      const t = req.user.tenant_id;
      res.json(await getRabPerTitikData(t, (req.query.tanggal || '').trim(), req.query.periode || ''));
    } catch (err) {
      console.error('RAB per titik error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ===== PM Harian — edit jumlah porsi besar/kecil per tanggal =====
  // GET /laporan/rab-pm-harian?tanggal=YYYY-MM-DD
  //   → daftar semua titik + nilai snapshot utk tanggal tsb (atau default dari penerima_manfaat)
  router.get('/laporan/rab-pm-harian', roleOps, async (req, res) => {
    try {
      const t = req.user.tenant_id;
      const tanggal = (req.query.tanggal || new Date().toISOString().slice(0, 10)).trim();

      const [snap] = await db.query(
        `SELECT penerima_manfaat_id, nama_titik, kategori_penerima, paket_besar, paket_besar_utama, paket_kecil, sample, guru_tendik
         FROM pm_harian WHERE tenant_id=? AND tanggal=?`,
        [t, tanggal]
      );
      const snapMap = {};
      for (const s of snap) snapMap[s.penerima_manfaat_id] = s;

      const [pmList] = await db.query(
        `SELECT id, nama_kelompok, paket_besar, paket_besar_utama, paket_kecil, sample, guru_tendik, kategori_penerima
         FROM penerima_manfaat WHERE tenant_id=? ORDER BY nama_kelompok ASC`,
        [t]
      );

      const rows = pmList.map(p => ({
        penerima_manfaat_id: p.id,
        nama_titik: p.nama_kelompok,
        kategori_penerima: p.kategori_penerima,
        paket_besar: snapMap[p.id] ? Number(snapMap[p.id].paket_besar) : Number(p.paket_besar || 0),
        paket_besar_utama: snapMap[p.id] ? Number(snapMap[p.id].paket_besar_utama) : Number(p.paket_besar_utama || 0),
        paket_kecil: snapMap[p.id] ? Number(snapMap[p.id].paket_kecil) : Number(p.paket_kecil || 0),
        sample: snapMap[p.id] ? Number(snapMap[p.id].sample) : Number(p.sample || 0),
        guru_tendik: snapMap[p.id] ? Number(snapMap[p.id].guru_tendik) : Number(p.guru_tendik || 0),
        is_snapshot: !!snapMap[p.id],
      }));

      res.json({ tanggal, total: rows.length, terisi: snap.length, rows });
    } catch (err) {
      console.error('RAB PM harian error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /laporan/rab-pm-harian  { tanggal, rows:[{penerima_manfaat_id,paket_besar,paket_kecil}] }
  router.post('/laporan/rab-pm-harian', roleOps, async (req, res) => {
    try {
      const t = req.user.tenant_id;
      const { tanggal, rows } = req.body || {};
      if (!tanggal) return res.status(400).json({ error: 'Tanggal wajib diisi (YYYY-MM-DD)' });
      if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows harus berupa array' });

      let saved = 0, failed = 0;

      // Ulangi daftar penerima_manfaat utk ambil nama_titik & kategori saat ini
      const [pmList] = await db.query(
        `SELECT id, nama_kelompok, kategori_penerima FROM penerima_manfaat WHERE tenant_id=?`,
        [t]
      );
      const pmMap = {};
      for (const p of pmList) pmMap[p.id] = p;

      for (const r of rows) {
        const pm = pmMap[r.penerima_manfaat_id];
        if (!pm) { failed++; continue; }
        const besar = Math.max(0, parseInt(r.paket_besar, 10) || 0);
        const besarUtama = Math.max(0, parseInt(r.paket_besar_utama, 10) || 0);
        const kecil = Math.max(0, parseInt(r.paket_kecil, 10) || 0);
        const sample = Math.max(0, parseInt(r.sample, 10) || 0);
        const guruTendik = Math.max(0, parseInt(r.guru_tendik, 10) || 0);

        await db.query(
          `INSERT INTO pm_harian (tenant_id, tanggal, penerima_manfaat_id, nama_titik, kategori_penerima, paket_besar, paket_besar_utama, paket_kecil, sample, guru_tendik)
           VALUES (?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             nama_titik=VALUES(nama_titik),
             kategori_penerima=VALUES(kategori_penerima),
             paket_besar=VALUES(paket_besar),
             paket_besar_utama=VALUES(paket_besar_utama),
             paket_kecil=VALUES(paket_kecil),
             sample=VALUES(sample),
             guru_tendik=VALUES(guru_tendik)`,
          [t, tanggal, r.penerima_manfaat_id, pm.nama_kelompok, pm.kategori_penerima, besar, besarUtama, kecil, sample, guruTendik]
        );
        saved++;
      }

      res.json({ ok: true, message: 'PM harian tersimpan', tanggal, saved, failed });
    } catch (err) {
      console.error('RAB PM harian save error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Setup: buat tabel pm_harian jika belum ada (hanya admin)
  router.get('/laporan/rab-pm-harian/setup', requireRole('admin'), async (req, res) => {
    try {
      const sql = `
        CREATE TABLE IF NOT EXISTS pm_harian (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NOT NULL,
          tanggal DATE NOT NULL,
          penerima_manfaat_id INT NOT NULL,
          nama_titik VARCHAR(200) NOT NULL,
          kategori_penerima VARCHAR(100) DEFAULT NULL,
          paket_besar INT DEFAULT 0,
          paket_besar_utama INT DEFAULT 0,
          paket_kecil INT DEFAULT 0,
          sample INT DEFAULT 0,
          guru_tendik INT DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_pm_harian (tenant_id, tanggal, penerima_manfaat_id),
          INDEX idx_pm_harian_tenant (tenant_id),
          INDEX idx_pm_harian_tanggal (tenant_id, tanggal)
        ) ENGINE=InnoDB`;
      await db.query(sql);

      // Tambahkan kolom baru jika tabel pm_harian sudah ada (instalasi lama)
      const [pmCols] = await db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pm_harian' AND COLUMN_NAME IN ('paket_besar_utama','sample','guru_tendik')");
      const pmExisting = new Set(pmCols.map(c => c.COLUMN_NAME));
      const pmAdds = [];
      if (!pmExisting.has('paket_besar_utama')) pmAdds.push('ADD COLUMN paket_besar_utama INT DEFAULT 0 AFTER paket_besar');
      if (!pmExisting.has('sample')) pmAdds.push('ADD COLUMN sample INT DEFAULT 0 AFTER paket_kecil');
      if (!pmExisting.has('guru_tendik')) pmAdds.push('ADD COLUMN guru_tendik INT DEFAULT 0 AFTER sample');
      if (pmAdds.length) {
        await db.query('ALTER TABLE pm_harian ' + pmAdds.join(', '));
      }
      const [[{ c } = { c: 0 }]] = await db.query(
        `SELECT COUNT(*) AS c FROM information_schema.tables
         WHERE table_schema=DATABASE() AND table_name='pm_harian'`
      );
      res.json({ ok: true, tabel: 'pm_harian', exists: Number(c) > 0 });
    } catch (err) {
      console.error('Setup pm_harian error:', err);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerRabRoutes };
