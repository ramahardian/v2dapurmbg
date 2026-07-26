/**
 * LAPORAN RAB (Rencana Anggaran Biaya)
 * Module untuk endpoint laporan RAB dan budgeting.
 */
const db = require('../../db');
const { roleFinance, roleOps } = require('./config');
const { parseKategoriPenerima, expandJenjangToDbValues, buildDbToDisplay, JENJANG_DISPLAY_ORDER, JENJANG_DB_MAP } = require('../siklus/helpers');

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
      const periode = req.query.periode || new Date().toISOString().slice(0, 7);
      const siklusId = req.query.siklus_id || '';

      let siklusInfo = null;
      let total_hari = 0;

      if (siklusId) {
        const [[siklus]] = await db.query(
          `SELECT id, nama, total_hari, kategori_penerima, jumlah_porsi
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
      const penerimaQuery = `SELECT kategori_penerima,
        SUM(paket_besar) as total_besar, SUM(paket_kecil) as total_kecil,
        SUM(paket_besar + paket_kecil) as total_penerima
        FROM penerima_manfaat WHERE tenant_id=?`;
      if (siklusInfo && siklusInfo.kategori_penerima) {
        const katList = parseKategoriPenerima(siklusInfo.kategori_penerima);
        const dbKatList = expandJenjangToDbValues(katList);
        if (dbKatList.length) {
          const ph = dbKatList.map(() => '?').join(',');
          [penerima] = await db.query(
            penerimaQuery + ` AND kategori_penerima IN (${ph}) GROUP BY kategori_penerima ORDER BY kategori_penerima`,
            [t, ...dbKatList]
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
        `SELECT kategori_penerima, harga_per_porsi, total_budget, realisasi FROM budget
         WHERE tenant_id=? AND periode=?`,
        [t, periode]
      );
      const hargaMap = {};
      const budgetMap = {};
      const realisasiMap = {};
      for (const h of hargaList) {
        const displayKey = dbToDisplay[h.kategori_penerima] || h.kategori_penerima;
        hargaMap[displayKey] = Number(h.harga_per_porsi);
        budgetMap[displayKey] = Number(h.total_budget || 0);
        realisasiMap[displayKey] = Number(h.realisasi || 0);
      }

      const [[{ realisasi_kas } = { realisasi_kas: 0 }]] = await db.query(
        `SELECT COALESCE(SUM(jumlah),0) AS realisasi_kas
         FROM kas_bank WHERE tenant_id=? AND tipe='keluar'
         AND kategori='Pembayaran Supplier'
         AND DATE_FORMAT(tanggal, '%Y-%m')=?`,
        [t, periode]
      );

      const [[budgetAgg]] = await db.query(
        `SELECT COALESCE(SUM(total_budget),0) AS total_budget,
                COALESCE(SUM(realisasi),0) AS total_realisasi_manual
         FROM budget WHERE tenant_id=? AND periode=?`,
        [t, periode]
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

      let grandPenerima = 0;
      let grandTotal = 0;
      const POSYANDU_SLICE = [
        { display: 'Bumil/Busui', col: 'total_besar' },
        { display: 'Balita', col: 'total_kecil' },
      ];
      const rows = [];
      for (const p of penerima) {
        const kategori = dbToDisplay[p.kategori_penerima] || p.kategori_penerima;
        const rawKat = p.kategori_penerima;
        if (rawKat === 'Posyandu') {
          for (const sl of POSYANDU_SLICE) {
            const subJml = Number(p[sl.col]) || 0;
            if (!subJml) continue;
            const harga = hargaMap[sl.display] || 0;
            const total = harga * subJml * (total_hari || 0);
            grandPenerima += subJml;
            grandTotal += total;
            rows.push({
              kategori: 'Posyandu (' + sl.display + ')',
              harga_per_porsi: harga,
              jumlah_penerima: subJml,
              jumlah_hari: total_hari || 0,
              budget: budgetMap[sl.display] || 0,
              realisasi: realisasiMap[sl.display] || 0,
              total,
            });
          }
        } else {
          const harga = hargaMap[kategori] || 0;
          const jmlPenerima = Number(p.total_penerima);
          const jmlHari = total_hari || 0;
          const total = harga * jmlPenerima * jmlHari;
          grandPenerima += jmlPenerima;
          grandTotal += total;
          rows.push({
            kategori,
            harga_per_porsi: harga,
            jumlah_penerima: jmlPenerima,
            jumlah_hari: jmlHari,
            budget: budgetMap[kategori] || 0,
            realisasi: realisasiMap[kategori] || 0,
            total,
          });
        }
      }

      const selisih = totalBudgetAgg - totalRealisasiManual;
      const serapan = totalBudgetAgg > 0 ? (totalRealisasiManual / totalBudgetAgg * 100) : 0;

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
}

module.exports = { registerRabRoutes };
