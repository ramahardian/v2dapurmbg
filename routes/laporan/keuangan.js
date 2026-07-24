/**
 * LAPORAN KEUANGAN
 * Module untuk endpoint laporan keuangan (payroll, laba-rugi, HPP, BP, arus kas, dll).
 */
const db = require('../../db');
const { roleFinance } = require('./config');

function registerKeuanganRoutes(router) {
  // 5. Laporan Payroll - Keuangan/Admin
  router.get('/laporan/payroll', roleFinance, async (req, res) => {
    const [rows] = await db.query(
      `SELECT p.*, CONCAT(p.tahun, '-', LPAD(p.bulan,2,'0')) as periode,
              k.nama as karyawan_nama, k.jabatan
       FROM payroll p
       JOIN karyawan k ON k.id=p.karyawan_id
       WHERE p.tenant_id=? ORDER BY p.tahun DESC, p.bulan DESC`, [req.user.tenant_id]
    );
    const total_gaji = rows.reduce((s, r) => s + Number(r.total_gaji || 0), 0);
    const uniqPeriods = [...new Set(rows.map(r => r.periode))];
    res.json({ rows, stats: { total_karyawan: rows.length, total_gaji, periode_count: uniqPeriods.length } });
  });

  // 6. Laba/Rugi (Formal) - Keuangan/Admin
  router.get('/laporan/laba-rugi', roleFinance, async (req, res) => {
    const t = req.user.tenant_id;
    const { bulan, tahun } = req.query;
    const now = new Date();
    const filterBulan = bulan || String(now.getMonth() + 1).padStart(2, '0');
    const filterTahun = tahun || String(now.getFullYear());
    const periode = `${filterTahun}-${filterBulan}`;

    // Ambil semua transaksi
    const [allTrans] = await db.query(
      `SELECT k.id, k.tanggal, k.no_transaksi, k.tipe, k.kategori, k.akun, k.akun_id, k.deskripsi, k.jumlah, a.kelompok, a.kode as akun_kode, a.nama as akun_nama
       FROM kas_bank k
       LEFT JOIN akun a ON a.id = k.akun_id
       WHERE k.tenant_id=? AND DATE_FORMAT(k.tanggal,'%Y-%m')=?
       ORDER BY k.tanggal ASC`,
      [t, periode]
    );

    // Pendapatan (kas masuk) per kategori
    const pendapatanKat = {};
    let totalPendapatan = 0;
    for (const trx of allTrans.filter(k => k.tipe === 'masuk')) {
      const kat = trx.kategori || 'Penerimaan Dana';
      if (!pendapatanKat[kat]) pendapatanKat[kat] = 0;
      pendapatanKat[kat] += Number(trx.jumlah);
      totalPendapatan += Number(trx.jumlah);
    }

    // Biaya (kas keluar) per kategori
    const biayaKat = {};
    let totalBiaya = 0;
    for (const trx of allTrans.filter(k => k.tipe === 'keluar')) {
      const kat = trx.kategori || 'Lainnya';
      if (!biayaKat[kat]) biayaKat[kat] = 0;
      biayaKat[kat] += Number(trx.jumlah);
      totalBiaya += Number(trx.jumlah);
    }

    // Struktur data untuk frontend
    const pendapatanRows = Object.entries(pendapatanKat).map(([kategori, jumlah]) => ({
      kategori, jumlah, persen: totalPendapatan > 0 ? (jumlah / totalPendapatan * 100) : 0,
    })).sort((a, b) => b.jumlah - a.jumlah);

    const biayaRows = Object.entries(biayaKat).map(([kategori, jumlah]) => ({
      kategori, jumlah, persen: totalBiaya > 0 ? (jumlah / totalBiaya * 100) : 0,
    })).sort((a, b) => b.jumlah - a.jumlah);

    // Per-periode summary (untuk tabel multi-periode)
    const [kasMasuk] = await db.query(
      `SELECT DATE_FORMAT(tanggal,'%Y-%m') as periode, SUM(jumlah) as total
       FROM kas_bank WHERE tenant_id=? AND tipe='masuk' GROUP BY DATE_FORMAT(tanggal,'%Y-%m') ORDER BY periode DESC`,
      [t]
    );
    const [kasKeluar] = await db.query(
      `SELECT DATE_FORMAT(tanggal,'%Y-%m') as periode, SUM(jumlah) as total
       FROM kas_bank WHERE tenant_id=? AND tipe='keluar' GROUP BY DATE_FORMAT(tanggal,'%Y-%m') ORDER BY periode DESC`,
      [t]
    );
    const periodMap = {};
    for (const r of kasMasuk) periodMap[r.periode] = { periode: r.periode, pendapatan: Number(r.total), biaya: 0 };
    for (const r of kasKeluar) {
      if (!periodMap[r.periode]) periodMap[r.periode] = { periode: r.periode, pendapatan: 0, biaya: 0 };
      periodMap[r.periode].biaya += Number(r.total);
    }
    const rows = Object.values(periodMap).sort((a, b) => b.periode.localeCompare(a.periode));

    res.json({
      periode,
      pendapatan: { total: totalPendapatan, rincian: pendapatanRows },
      biaya: { total: totalBiaya, rincian: biayaRows },
      laba_rugi: totalPendapatan - totalBiaya,
      margin: totalPendapatan > 0 ? ((totalPendapatan - totalBiaya) / totalPendapatan * 100) : 0,
      rows,
      totalPendapatan,
      totalBiayaAll: totalBiaya,
      labaRugi: totalPendapatan - totalBiaya,
    });
  });

  // 7. HPP per Menu - Keuangan/Admin
  router.get('/laporan/hpp', roleFinance, async (req, res) => {
    const t = req.user.tenant_id;
    try {
      const [menuRows] = await db.query(`
        SELECT
          m.id AS menu_id,
          m.nama AS menu_nama,
          m.kategori_penerima,
          COUNT(mb.id) AS jumlah_bahan,
          COALESCE(SUM(
            CASE
              WHEN b.berat_per_satuan IS NOT NULL AND b.berat_per_satuan > 0
              THEN mb.jumlah * (b.harga_satuan / b.berat_per_satuan)
              ELSE mb.jumlah * b.harga_satuan
            END
          ), 0) AS total_hpp
        FROM menu m
        LEFT JOIN menu_bahan mb ON mb.menu_id = m.id
        LEFT JOIN bahan_baku b ON b.id = mb.bahan_baku_id
        WHERE m.tenant_id = ?
        GROUP BY m.id, m.nama, m.kategori_penerima
        ORDER BY total_hpp DESC
      `, [t]);

      const totalHppAll = menuRows.reduce((s, r) => s + Number(r.total_hpp), 0);
      const menuDenganBahan = menuRows.filter(r => Number(r.jumlah_bahan) > 0);
      const menuTanpaBahan = menuRows.filter(r => Number(r.jumlah_bahan) === 0);
      const rataHpp = menuDenganBahan.length > 0 ? totalHppAll / menuDenganBahan.length : 0;

      // Ambil detail bahan untuk setiap menu
      const menuIds = menuRows.map(r => r.menu_id);
      const detailBahan = {};

      if (menuIds.length > 0) {
        const placeholders = menuIds.map(() => '?').join(',');
        const [bahanDetails] = await db.query(`
          SELECT
            mb.menu_id,
            b.nama AS bahan_nama,
            mb.jumlah,
            b.satuan,
            b.harga_satuan,
            b.berat_per_satuan,
            COALESCE(
              CASE
                WHEN b.berat_per_satuan IS NOT NULL AND b.berat_per_satuan > 0
                THEN mb.jumlah * (COALESCE(b.harga_satuan,0) / b.berat_per_satuan)
                ELSE mb.jumlah * COALESCE(b.harga_satuan,0)
              END, 0
            ) AS subtotal
          FROM menu_bahan mb
          JOIN bahan_baku b ON b.id = mb.bahan_baku_id
          WHERE mb.menu_id IN (${placeholders})
          ORDER BY mb.menu_id, b.nama ASC
        `, menuIds);

        for (const b of bahanDetails) {
          if (!detailBahan[b.menu_id]) detailBahan[b.menu_id] = [];
          detailBahan[b.menu_id].push({
            bahan_nama: b.bahan_nama,
            jumlah: Number(b.jumlah),
            satuan: b.satuan || 'g',
            harga: Number(b.harga_satuan),
            subtotal: Number(b.subtotal),
          });
        }
      }

      const rows = menuRows.map(r => ({
        menu_id: r.menu_id,
        menu_nama: r.menu_nama,
        kategori_penerima: r.kategori_penerima || '-',
        jumlah_bahan: Number(r.jumlah_bahan),
        total_hpp: Number(r.total_hpp),
      }));

      res.json({
        rows,
        stats: {
          total_hpp_all: totalHppAll,
          rata_hpp: rataHpp,
          menu_tanpa_bahan: menuTanpaBahan.length,
          total_menu: menuRows.length,
        },
        detail_bahan: detailBahan,
      });
    } catch (err) {
      console.error('HPP error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 10. Buku Pembantu Operasional - Keuangan/Admin
  router.get('/laporan/bp-operasional', roleFinance, async (req, res) => {
    const t = req.user.tenant_id;
    const { bulan, tahun } = req.query;
    const now = new Date();
    const filterBulan = bulan || String(now.getMonth() + 1).padStart(2, '0');
    const filterTahun = tahun || String(now.getFullYear());
    const startDate = `${filterTahun}-${filterBulan}-01`;
    const [y, m] = [parseInt(filterTahun), parseInt(filterBulan)];
    const endDate = new Date(y, m, 1).toISOString().slice(0, 10);

    const [akunList] = await db.query(
      `SELECT id, kode, nama, bp, tipe, is_active FROM akun WHERE tenant_id=? AND bp='BP Operasional' AND is_active=1 ORDER BY kode`,
      [t]
    );

    const [[{ saldo_awal } = { saldo_awal: 0 }]] = await db.query(
      'SELECT COALESCE(saldo_awal,0) AS saldo_awal FROM tenants WHERE id=?', [t]
    );

    const [transaksi] = await db.query(
      `SELECT k.id, k.tanggal, k.no_transaksi, k.tipe, k.kategori, k.akun, k.akun_id, k.deskripsi, k.jumlah, a.kode as akun_kode, a.nama as akun_nama, a.bp as akun_bp
       FROM kas_bank k
       LEFT JOIN akun a ON a.id = k.akun_id
       WHERE k.tenant_id=?
         AND k.tanggal >= ? AND k.tanggal < ?
         AND (a.bp = 'BP Operasional' OR a.bp IS NULL)
       ORDER BY k.tanggal ASC, k.id ASC`,
      [t, startDate, endDate]
    );

    const perAkun = {};
    for (const trx of transaksi) {
      const key = trx.akun_id || 'tanpa-akun';
      if (!perAkun[key]) {
        perAkun[key] = {
          akun_id: trx.akun_id,
          akun_kode: trx.akun_kode || '-',
          akun_nama: trx.akun_nama || 'Tanpa Akun',
          transaksi: [],
          total_masuk: 0,
          total_keluar: 0,
        };
      }
      perAkun[key].transaksi.push({
        id: trx.id,
        tanggal: trx.tanggal,
        no_transaksi: trx.no_transaksi,
        tipe: trx.tipe,
        kategori: trx.kategori,
        deskripsi: trx.deskripsi,
        jumlah: Number(trx.jumlah),
      });
      if (trx.tipe === 'masuk') perAkun[key].total_masuk += Number(trx.jumlah);
      else perAkun[key].total_keluar += Number(trx.jumlah);
    }

    const akunIds = Object.keys(perAkun).filter(k => k !== 'tanpa-akun');
    if (akunIds.length) {
      const ph = akunIds.map(() => '?').join(',');
      const [saldoRows] = await db.query(
        `SELECT akun_id, COALESCE(SUM(CASE WHEN tipe='masuk' THEN jumlah ELSE -jumlah END), 0) as saldo_sebelum
         FROM kas_bank
         WHERE tenant_id=? AND akun_id IN (${ph}) AND tanggal < ?
         GROUP BY akun_id`,
        [t, ...akunIds, startDate]
      );
      const saldoMap = {};
      for (const r of saldoRows) saldoMap[r.akun_id] = Number(r.saldo_sebelum);
      for (const id of akunIds) {
        const s = saldoMap[id] || 0;
        perAkun[id].saldo_awal = s;
        perAkun[id].saldo_akhir = s + perAkun[id].total_masuk - perAkun[id].total_keluar;
      }
    }

    if (perAkun['tanpa-akun']) {
      const [[{ saldo_sebelum } = { saldo_sebelum: 0 }]] = await db.query(
        `SELECT COALESCE(SUM(CASE WHEN tipe='masuk' THEN jumlah ELSE -jumlah END), 0) as saldo_sebelum
         FROM kas_bank
         WHERE tenant_id=? AND akun_id IS NULL AND tanggal < ?`,
        [t, startDate]
      );
      perAkun['tanpa-akun'].saldo_awal = Number(saldo_sebelum);
      perAkun['tanpa-akun'].saldo_akhir = Number(saldo_sebelum) + perAkun['tanpa-akun'].total_masuk - perAkun['tanpa-akun'].total_keluar;
    }

    const akunData = Object.values(perAkun).sort((a, b) => a.akun_kode.localeCompare(b.akun_kode));
    const totalMasuk = akunData.reduce((s, a) => s + a.total_masuk, 0);
    const totalKeluar = akunData.reduce((s, a) => s + a.total_keluar, 0);

    res.json({
      periode: `${filterTahun}-${filterBulan}`,
      saldo_awal: Number(saldo_awal),
      total_masuk: totalMasuk,
      total_keluar: totalKeluar,
      akun_data: akunData,
      akun_list: akunList,
    });
  });

  // 11. Catatan Pengeluaran Bulanan - Keuangan/Admin
  router.get('/laporan/pengeluaran-bulanan', roleFinance, async (req, res) => {
    const t = req.user.tenant_id;
    const { bulan, tahun } = req.query;
    const now = new Date();
    const filterBulan = bulan || String(now.getMonth() + 1).padStart(2, '0');
    const filterTahun = tahun || String(now.getFullYear());
    const periode = `${filterTahun}-${filterBulan}`;

    const [[{ saldo_awal } = { saldo_awal: 0 }]] = await db.query(
      'SELECT COALESCE(saldo_awal, 0) AS saldo_awal FROM tenants WHERE id=?', [t]
    );

    const [[{ saldo_sebelum } = { saldo_sebelum: 0 }]] = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN tipe='masuk' THEN jumlah ELSE -jumlah END), 0) AS saldo_sebelum
       FROM kas_bank
       WHERE tenant_id=? AND tanggal < STR_TO_DATE(CONCAT(?, '-', ?, '-01'), '%Y-%m-%d')`,
      [t, filterTahun, filterBulan]
    );
    const sisa_dana_lalu = Number(saldo_awal) + Number(saldo_sebelum);

    const [[{ dana_diterima } = { dana_diterima: 0 }]] = await db.query(
      `SELECT COALESCE(SUM(jumlah), 0) AS dana_diterima
       FROM kas_bank
       WHERE tenant_id=? AND tipe='masuk' AND DATE_FORMAT(tanggal, '%Y-%m')=?`,
      [t, periode]
    );

    const [pengeluaran] = await db.query(
      `SELECT kategori, SUM(jumlah) AS total
       FROM kas_bank
       WHERE tenant_id=? AND tipe='keluar' AND DATE_FORMAT(tanggal, '%Y-%m')=?
       GROUP BY kategori`,
      [t, periode]
    );
    const byKat = {};
    for (const p of pengeluaran) byKat[p.kategori] = Number(p.total);

    const biaya_bahan_baku = byKat['Pembayaran Supplier'] || 0;
    const biaya_operasional = byKat['Biaya Operasional'] || 0;
    const biaya_insentif_fasilitas = byKat['Gaji'] || 0;
    const biaya_lainnya = byKat['Lainnya'] || 0;
    const total_pengeluaran = biaya_bahan_baku + biaya_operasional + biaya_insentif_fasilitas + biaya_lainnya;
    const dana_tersedia = sisa_dana_lalu + Number(dana_diterima);
    const sisa_dana_saat_ini = dana_tersedia - total_pengeluaran;

    const [transaksi] = await db.query(
      `SELECT k.id, k.tanggal, k.no_transaksi, k.tipe, k.kategori, k.akun, k.akun_id, k.deskripsi, k.jumlah, a.kode AS akun_kode, a.nama AS akun_nama
       FROM kas_bank k
       LEFT JOIN akun a ON a.id = k.akun_id
       WHERE k.tenant_id=? AND DATE_FORMAT(k.tanggal, '%Y-%m')=?
       ORDER BY k.tanggal ASC, k.id ASC`,
      [t, periode]
    );

    res.json({
      periode: `${filterTahun}-${filterBulan}`,
      saldo_awal: Number(saldo_awal),
      sisa_dana_lalu,
      dana_diterima: Number(dana_diterima),
      dana_tersedia,
      biaya_bahan_baku,
      biaya_operasional,
      biaya_insentif_fasilitas,
      biaya_lainnya,
      total_pengeluaran,
      sisa_dana_saat_ini,
      transaksi: transaksi.map(k => ({
        ...k,
        jumlah: Number(k.jumlah),
      })),
    });
  });

  // 12. Laporan Penggunaan Anggaran - Keuangan/Admin
  router.get('/laporan/penggunaan-anggaran', roleFinance, async (req, res) => {
    const t = req.user.tenant_id;
    const { bulan, tahun } = req.query;
    const now = new Date();
    const filterBulan = bulan || String(now.getMonth() + 1).padStart(2, '0');
    const filterTahun = tahun || String(now.getFullYear());
    const periode = `${filterTahun}-${filterBulan}`;

    const [[budgetRow]] = await db.query(
      `SELECT COALESCE(SUM(total_budget), 0) AS total_budget,
              COALESCE(SUM(biaya_operasional), 0) AS total_biaya_operasional
       FROM budget WHERE tenant_id=? AND periode=?`,
      [t, periode]
    );

    const dana_diajukan_total = Number(budgetRow.total_budget);
    const dana_diajukan_operasional = Number(budgetRow.total_biaya_operasional);
    const dana_diajukan_bahan = Math.max(0, dana_diajukan_total - dana_diajukan_operasional);
    const dana_diajukan_insentif = 0;

    const [pengeluaran] = await db.query(
      `SELECT kategori, SUM(jumlah) AS total
       FROM kas_bank
       WHERE tenant_id=? AND tipe='keluar' AND DATE_FORMAT(tanggal, '%Y-%m')=?
       GROUP BY kategori`,
      [t, periode]
    );
    const byKat = {};
    for (const p of pengeluaran) byKat[p.kategori] = Number(p.total);

    const dana_terpakai_bahan = byKat['Pembayaran Supplier'] || 0;
    const dana_terpakai_operasional = (byKat['Biaya Operasional'] || 0) + (byKat['Lainnya'] || 0);
    const dana_terpakai_insentif = byKat['Gaji'] || 0;
    const dana_terpakai_total = dana_terpakai_bahan + dana_terpakai_operasional + dana_terpakai_insentif;

    res.json({
      periode,
      bahan_baku: {
        diajukan: dana_diajukan_bahan,
        terpakai: dana_terpakai_bahan,
        sisa: dana_diajukan_bahan - dana_terpakai_bahan,
      },
      operasional: {
        diajukan: dana_diajukan_operasional,
        terpakai: dana_terpakai_operasional,
        sisa: dana_diajukan_operasional - dana_terpakai_operasional,
      },
      insentif: {
        diajukan: dana_diajukan_insentif,
        terpakai: dana_terpakai_insentif,
        sisa: dana_diajukan_insentif - dana_terpakai_insentif,
      },
      total: {
        diajukan: dana_diajukan_total,
        terpakai: dana_terpakai_total,
        sisa: dana_diajukan_total - dana_terpakai_total,
      },
    });
  });

  // 13. Buku Pembantu BP Kas - Keuangan/Admin
  router.get('/laporan/bp-kas', roleFinance, async (req, res) => {
    const t = req.user.tenant_id;
    const { bulan, tahun } = req.query;
    const now = new Date();
    const filterBulan = bulan || String(now.getMonth() + 1).padStart(2, '0');
    const filterTahun = tahun || String(now.getFullYear());

    const [akunList] = await db.query(
      `SELECT id, kode, nama, bp, tipe, is_active FROM akun WHERE tenant_id=? AND bp='BP Kas' AND is_active=1 ORDER BY kode`,
      [t]
    );

    const [transaksi] = await db.query(
      `SELECT k.id, k.tanggal, k.no_transaksi, k.tipe, k.kategori, k.akun, k.akun_id, k.deskripsi, k.jumlah, a.kode as akun_kode, a.nama as akun_nama, a.bp as akun_bp
       FROM kas_bank k
       LEFT JOIN akun a ON a.id = k.akun_id
       WHERE k.tenant_id=?
         AND DATE_FORMAT(k.tanggal, '%Y-%m') = CONCAT(?, '-', ?)
         AND a.bp = 'BP Kas'
       ORDER BY k.tanggal ASC, k.id ASC`,
      [t, filterTahun, filterBulan]
    );

    const perAkun = {};
    for (const trx of transaksi) {
      const key = trx.akun_id;
      if (!perAkun[key]) {
        perAkun[key] = {
          akun_id: trx.akun_id,
          akun_kode: trx.akun_kode || '-',
          akun_nama: trx.akun_nama || 'Tanpa Akun',
          transaksi: [],
          total_masuk: 0,
          total_keluar: 0,
        };
      }
      perAkun[key].transaksi.push({
        id: trx.id,
        tanggal: trx.tanggal,
        no_transaksi: trx.no_transaksi,
        tipe: trx.tipe,
        kategori: trx.kategori,
        deskripsi: trx.deskripsi,
        jumlah: Number(trx.jumlah),
      });
      if (trx.tipe === 'masuk') perAkun[key].total_masuk += Number(trx.jumlah);
      else perAkun[key].total_keluar += Number(trx.jumlah);
    }

    for (const key of Object.keys(perAkun)) {
      const akunId = perAkun[key].akun_id;
      const [[{ saldo_sebelum } = { saldo_sebelum: 0 }]] = await db.query(
        `SELECT COALESCE(SUM(CASE WHEN tipe='masuk' THEN jumlah ELSE -jumlah END), 0) as saldo_sebelum
         FROM kas_bank
         WHERE tenant_id=? AND akun_id=? AND tanggal < STR_TO_DATE(CONCAT(?, '-', ?, '-01'), '%Y-%m-%d')`,
        [t, akunId, filterTahun, filterBulan]
      );
      perAkun[key].saldo_awal = Number(saldo_sebelum);
      perAkun[key].saldo_akhir = Number(saldo_sebelum) + perAkun[key].total_masuk - perAkun[key].total_keluar;
    }

    const akunData = Object.values(perAkun).sort((a, b) => a.akun_kode.localeCompare(b.akun_kode));
    const totalSaldoAwal = akunData.reduce((s, a) => s + a.saldo_awal, 0);
    const totalMasuk = akunData.reduce((s, a) => s + a.total_masuk, 0);
    const totalKeluar = akunData.reduce((s, a) => s + a.total_keluar, 0);
    const totalSaldoAkhir = akunData.reduce((s, a) => s + a.saldo_akhir, 0);

    res.json({
      periode: `${filterTahun}-${filterBulan}`,
      total_saldo_awal: totalSaldoAwal,
      total_masuk: totalMasuk,
      total_keluar: totalKeluar,
      total_saldo_akhir: totalSaldoAkhir,
      akun_data: akunData,
      akun_list: akunList,
    });
  });

  // 14. Laporan Arus Kas (Cash Flow) - Keuangan/Admin
  router.get('/laporan/arus-kas', roleFinance, async (req, res) => {
    const t = req.user.tenant_id;
    const { bulan, tahun } = req.query;
    const now = new Date();
    const filterBulan = bulan || String(now.getMonth() + 1).padStart(2, '0');
    const filterTahun = tahun || String(now.getFullYear());
    const startDate = `${filterTahun}-${filterBulan}-01`;
    const [y, m] = [parseInt(filterTahun), parseInt(filterBulan)];
    const endDate = new Date(y, m, 1).toISOString().slice(0, 10);

    const [[{ saldo_awal_tenant } = { saldo_awal_tenant: 0 }]] = await db.query(
      'SELECT COALESCE(saldo_awal,0) AS saldo_awal_tenant FROM tenants WHERE id=?', [t]
    );
    const [[{ saldo_sebelum } = { saldo_sebelum: 0 }]] = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN tipe='masuk' THEN jumlah ELSE -jumlah END), 0) AS saldo_sebelum
       FROM kas_bank WHERE tenant_id=? AND tanggal < ?`,
      [t, startDate]
    );
    const saldoAwal = Number(saldo_awal_tenant) + Number(saldo_sebelum);

    const [transaksi] = await db.query(
      `SELECT k.id, k.tanggal, k.no_transaksi, k.tipe, k.kategori, k.akun, k.akun_id, k.deskripsi, k.jumlah, a.kelompok, a.kode as akun_kode, a.nama as akun_nama
       FROM kas_bank k
       LEFT JOIN akun a ON a.id = k.akun_id
       WHERE k.tenant_id=? AND k.tanggal >= ? AND k.tanggal < ?
       ORDER BY k.tanggal ASC, k.id ASC`,
      [t, startDate, endDate]
    );

    const masukKat = {};
    let totalMasuk = 0;
    for (const trx of transaksi.filter(k => k.tipe === 'masuk')) {
      const kat = trx.kategori || 'Penerimaan Dana';
      if (!masukKat[kat]) masukKat[kat] = { kategori: kat, jumlah: 0, transaksi: [] };
      masukKat[kat].jumlah += Number(trx.jumlah);
      masukKat[kat].transaksi.push({ id: trx.id, tanggal: trx.tanggal, deskripsi: trx.deskripsi, jumlah: Number(trx.jumlah) });
      totalMasuk += Number(trx.jumlah);
    }

    const keluarKat = {};
    let totalKeluar = 0;
    for (const trx of transaksi.filter(k => k.tipe === 'keluar')) {
      const kat = trx.kategori || 'Lainnya';
      if (!keluarKat[kat]) keluarKat[kat] = { kategori: kat, jumlah: 0, transaksi: [] };
      keluarKat[kat].jumlah += Number(trx.jumlah);
      keluarKat[kat].transaksi.push({ id: trx.id, tanggal: trx.tanggal, deskripsi: trx.deskripsi, jumlah: Number(trx.jumlah) });
      totalKeluar += Number(trx.jumlah);
    }

    const saldoAkhir = saldoAwal + totalMasuk - totalKeluar;

    res.json({
      periode: `${filterTahun}-${filterBulan}`,
      saldo_awal: saldoAwal,
      kas_masuk: {
        total: totalMasuk,
        rincian: Object.values(masukKat).sort((a, b) => b.jumlah - a.jumlah),
      },
      kas_keluar: {
        total: totalKeluar,
        rincian: Object.values(keluarKat).sort((a, b) => b.jumlah - a.jumlah),
      },
      selisih: totalMasuk - totalKeluar,
      saldo_akhir: saldoAkhir,
    });
  });
}

module.exports = { registerKeuanganRoutes };
