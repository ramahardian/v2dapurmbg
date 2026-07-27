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

          const hargaBesar = hargaMap['Bumil/Busui'] || 0;
          const hargaKecil = hargaMap['Balita'] || 0;

          // Weighted average harga per porsi (pembulatan ke rupiah terdekat)
          const hargaRata = Math.round((hargaBesar * totalBesar + hargaKecil * totalKecil) / totalPenerima);

          // Gabung budget & realisasi dari kedua sub-kategori
          const budgetGabung = (budgetMap['Bumil/Busui'] || 0) + (budgetMap['Balita'] || 0);
          const realisasiGabung = (realisasiMap['Bumil/Busui'] || 0) + (realisasiMap['Balita'] || 0);
          const total = hargaRata * totalPenerima * (total_hari || 0);

          grandPenerima += totalPenerima;
          grandTotal += total;
          rows.push({
            kategori: 'Posyandu',
            harga_besar: hargaBesar,
            harga_kecil: hargaKecil,
            jumlah_penerima: totalPenerima,
            jumlah_hari: total_hari || 0,
            budget: budgetGabung,
            realisasi: realisasiGabung,
            total,
          });
        } else {
          const harga = hargaMap[kategori] || 0;
          const jmlPenerima = Number(p.total_penerima);
          const jmlHari = total_hari || 0;
          const total = harga * jmlPenerima * jmlHari;
          grandPenerima += jmlPenerima;
          grandTotal += total;
          rows.push({
            kategori,
            harga_besar: harga,
            harga_kecil: harga,
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
  router.get('/laporan/rab-harian', roleOps, async (req, res) => {
    try {
      const t = req.user.tenant_id;
      const tanggal = req.query.tanggal || new Date().toISOString().slice(0, 10);
      const siklusId = req.query.siklus_id || '';

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
        return res.json({
          tanggal,
          siklus: siklusInfo,
          hari_ke: hariKe,
          menu_harian: '',
          items: [],
          total: 0,
          message: 'Tidak ada menu untuk tanggal ini',
        });
      }

      // Load bahan with prices for all menus
      const menuIds = [...new Set(menuItems.filter(m => m.menu_id).map(m => m.menu_id))];
      const dbToDisplay = buildDbToDisplay();

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
                  b.nama as bahan_nama, b.satuan, b.harga_satuan, b.berat_per_satuan
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
            keterangan: br.keterangan || '',
          });
        }
      }

      // Aggregate bahan across all menus for this day
      const displayKats = siklusKat.length > 0 ? siklusKat.map(k => dbToDisplay[k] || k) : ['Umum'];
      let grandTotal = 0;
      const bahanAgg = {}; // key: bahan_baku_id

      for (const mi of menuItems) {
        const dbKeys = Object.keys(pmMap).filter(k => (dbToDisplay[k] || k) === displayKats[0]);
        const totalPm = dbKeys.reduce((s, k) => s + (pmMap[k] || 0), 0) || Number(siklusInfo?.jumlah_porsi || 0) || 1;
        const porsi = Number(mi.jumlah_porsi) || totalPm;

        const bahanList = bahanByMenu[mi.menu_id] || [];
        const menuNama = mi.menu_nama || 'Menu #' + mi.menu_id;

        for (const b of bahanList) {
          const totalGram = b.jumlah_per_porsi * porsi;
          const totalKg = Math.round((totalGram / 1000) * 1000) / 1000;

          if (!bahanAgg[b.bahan_baku_id]) {
            bahanAgg[b.bahan_baku_id] = {
              bahan_baku_id: b.bahan_baku_id,
              bahan_nama: b.bahan_nama,
              satuan: b.satuan,
              total_gram: 0,
              total_kg: 0,
              harga_satuan: b.harga_satuan,
              total_harga: 0,
              keterangan: b.keterangan || '',
            };
          }
          bahanAgg[b.bahan_baku_id].total_gram += totalGram;
          bahanAgg[b.bahan_baku_id].total_kg += totalKg;
        }
      }

      // Calculate totals with prices and build items array
      let no = 0;
      const items = Object.values(bahanAgg)
        .sort((a, b) => b.total_kg - a.total_kg)
        .map(b => {
          no++;
          // Determine display qty and unit - convert to KG if gram >= 1000, else keep as satuan
          let displayQty, displaySatuan;
          if (b.total_gram >= 1000) {
            displayQty = b.total_kg;
            displaySatuan = 'KG';
          } else if (b.total_gram > 0) {
            displayQty = Math.round(b.total_gram * 100) / 100;
            displaySatuan = b.satuan === 'g' ? 'GRAM' : b.satuan.toUpperCase();
          } else {
            displayQty = 0;
            displaySatuan = b.satuan.toUpperCase();
          }

          const jumlah = Math.round(b.harga_satuan * displayQty);
          grandTotal += jumlah;

          return {
            no,
            nama: b.bahan_nama,
            qty: displayQty,
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

      res.json({
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
      });
    } catch (err) {
      console.error('RAB harian error:', err);
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
