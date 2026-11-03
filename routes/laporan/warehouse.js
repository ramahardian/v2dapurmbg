/**
 * LAPORAN GUDANG & OPERASIONAL
 * Module untuk endpoint laporan yang berkaitan dengan gudang dan operasional.
 */
const db = require('../../db');
const { mapJenjang, hitungSP, getSpMapByJenjang } = require('../../services/spBddCalculator');
const { roleWarehouse, roleOps } = require('./config');

function registerWarehouseRoutes(router) {
  // 1. Laporan Pembelian (PO) - Gudang/Admin
  router.get('/laporan/pembelian', roleWarehouse, async (req, res) => {
    const [rows] = await db.query(
      `SELECT id, no_po, tanggal, supplier_id, supplier_nama, item, total_nilai, status, unit_dapur, catatan, created_at FROM purchase_order WHERE tenant_id=? ORDER BY tanggal DESC`,
      [req.user.tenant_id]
    );
    const stats = {
      total_po: rows.length,
      draft: rows.filter(r => r.status === 'Draft').length,
      disetujui: rows.filter(r => r.status === 'Disetujui').length,
      diterima: rows.filter(r => r.status === 'Diterima').length,
      dibayar: rows.filter(r => r.status === 'Dibayar').length,
      total_nilai: rows.reduce((s, r) => s + Number(r.total_nilai || 0), 0),
    };
    res.json({ rows, stats });
  });

  // 2. Laporan Penerimaan Barang - Gudang/Admin
  router.get('/laporan/penerimaan', roleWarehouse, async (req, res) => {
    const [rows] = await db.query(
      `SELECT id, no_dokumen, tanggal_terima, supplier_id, supplier_nama, ref_po, item, total_nilai, status_qc, catatan, created_at FROM penerimaan_barang WHERE tenant_id=? ORDER BY tanggal_terima DESC`,
      [req.user.tenant_id]
    );
    const stats = {
      total: rows.length,
      lolos: rows.filter(r => r.status_qc === 'Lolos').length,
      retur: rows.filter(r => r.status_qc === 'Retur Sebagian').length,
      ditolak: rows.filter(r => r.status_qc === 'Ditolak').length,
      total_nilai: rows.reduce((s, r) => s + Number(r.total_nilai || 0), 0),
    };
    res.json({ rows, stats });
  });

  // 3. Mutasi Stok - Gudang/Admin
  router.get('/laporan/mutasi-stok', roleWarehouse, async (req, res) => {
    const [masuk] = await db.query(
      `SELECT sm.id, sm.tanggal, sm.bahan_baku_id, sm.jumlah, sm.sumber, sm.catatan, sm.created_at, bb.nama as bahan_nama, bb.satuan FROM stok_masuk sm
       JOIN bahan_baku bb ON bb.id=sm.bahan_baku_id
       WHERE sm.tenant_id=? ORDER BY sm.tanggal DESC`, [req.user.tenant_id]
    );
    const [keluar] = await db.query(
      `SELECT sk.id, sk.tanggal, sk.bahan_baku_id, sk.jumlah, sk.tujuan, sk.catatan, sk.created_at, bb.nama as bahan_nama, bb.satuan FROM stok_keluar sk
       JOIN bahan_baku bb ON bb.id=sk.bahan_baku_id
       WHERE sk.tenant_id=? ORDER BY sk.tanggal DESC`, [req.user.tenant_id]
    );
    const rows = [
      ...masuk.map(r => ({ ...r, jenis: 'Masuk', tanggal: r.tanggal })),
      ...keluar.map(r => ({ ...r, jenis: 'Keluar', tanggal: r.tanggal })),
    ].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
    const stats = {
      total_masuk: masuk.reduce((s, r) => s + Number(r.jumlah || 0), 0),
      total_keluar: keluar.reduce((s, r) => s + Number(r.jumlah || 0), 0),
      count_masuk: masuk.length,
      count_keluar: keluar.length,
    };
    res.json({ rows, stats });
  });

  // 4. Laporan Produksi - Operasional/Produksi/Admin
  router.get('/laporan/produksi', roleOps, async (req, res) => {
    const [rows] = await db.query(
      `SELECT id, tanggal_produksi, menu_id, menu_nama, kategori_penerima, jumlah_porsi, status, catatan, created_at FROM produksi WHERE tenant_id=? ORDER BY tanggal_produksi DESC`,
      [req.user.tenant_id]
    );
    const stats = {
      total: rows.length,
      total_porsi: rows.reduce((s, r) => s + Number(r.jumlah_porsi || 0), 0),
      direncanakan: rows.filter(r => r.status === 'Direncanakan').length,
      diproduksi: rows.filter(r => r.status === 'Diproduksi').length,
      selesai: rows.filter(r => r.status === 'Selesai').length,
    };
    res.json({ rows, stats });
  });

  // 9. Laporan Perhitungan Kebutuhan Pangan (per Siklus) - Gudang/Operasional/Admin
  router.get('/laporan/kebutuhan-pangan/:siklus_id', roleWarehouse, async (req, res) => {
    const { siklus_id } = req.params;
    const jumlahSiswa = parseInt(req.query.jumlah_siswa) || 0;

    const [[siklus]] = await db.query(
      'SELECT id, nama, kategori_penerima, jumlah_porsi, total_hari, status, catatan, tanggal_mulai FROM siklus_menu WHERE id=? AND tenant_id=?',
      [siklus_id, req.user.tenant_id]
    );
    if (!siklus) return res.status(404).json({ error: 'Siklus tidak ditemukan' });

    const [items] = await db.query(
      'SELECT id, siklus_id, hari_ke, hari_nama, menu_id, menu_nama, jumlah_porsi, gramasi_besar, gramasi_kecil, kalori, protein, karbohidrat, lemak, serat, foto FROM siklus_menu_item WHERE siklus_id=? ORDER BY hari_ke ASC',
      [siklus_id]
    );

    const targetJenjang = mapJenjang(siklus.kategori_penerima);
    const spMap = await getSpMapByJenjang(targetJenjang, req.user.tenant_id);

    const days = [];

    for (const item of items) {
      if (!item.menu_id) {
        days.push({ hari_ke: item.hari_ke, hari_nama: item.hari_nama, menu_nama: null, bahan: [], jumlah_porsi: item.jumlah_porsi || 0 });
        continue;
      }

      const [[menu]] = await db.query(
        'SELECT id, nama, kategori_penerima, gramasi_total, gramasi_besar, gramasi_kecil, kalori, protein, karbohidrat, lemak, serat FROM menu WHERE id=?', [item.menu_id]
      );
      if (!menu) continue;

      const [bahanRows] = await db.query(
        `SELECT mb.jumlah as jumlah_existing, b.id, b.nama, b.kategori_sp,
                b.berat_1_sp, b.persen_bdd, b.satuan
         FROM menu_bahan mb
         JOIN bahan_baku b ON b.id = mb.bahan_baku_id
         WHERE mb.menu_id=?`,
        [item.menu_id]
      );

      const bahan = bahanRows.map(b => {
        const h = hitungSP(b, spMap);
        const kebutuhanKg = jumlahSiswa > 0 ? Number((h.berat_kotor * jumlahSiswa / 1000).toFixed(2)) : 0;

        return {
          bahan_id: b.id,
          nama: b.nama,
          kategori_sp: b.kategori_sp,
          sp_value: h.sp_value,
          berat_1_sp: h.berat_1_sp,
          berat_bersih: h.berat_bersih,
          persen_bdd: h.persen_bdd,
          berat_kotor: h.berat_kotor,
          jumlah_siswa: jumlahSiswa,
          kebutuhan_kg: kebutuhanKg,
          satuan: b.satuan,
        };
      });

      const gramasiBersih = bahan.reduce((s, b) => s + b.berat_bersih, 0);
      const gramasiKotor = bahan.reduce((s, b) => s + b.berat_kotor, 0);

      days.push({
        hari_ke: item.hari_ke,
        hari_nama: item.hari_nama,
        menu_id: item.menu_id,
        menu_nama: menu.nama,
        jumlah_porsi: item.jumlah_porsi || 0,
        gramasi_bersih: gramasiBersih,
        gramasi_kotor: gramasiKotor,
        gramasi_total: Number(menu.gramasi_total || 0),
        bahan,
      });
    }

    const totalKebutuhanKg = days.reduce((s, d) =>
      s + (d.bahan || []).reduce((s2, b) => s2 + b.kebutuhan_kg, 0), 0
    );

    res.json({
      siklus: { id: siklus.id, nama: siklus.nama, kategori_penerima: siklus.kategori_penerima, jumlah_porsi: siklus.jumlah_porsi, total_hari: siklus.total_hari },
      jenjang: targetJenjang,
      jumlah_siswa: jumlahSiswa,
      days,
      total_kebutuhan_kg: Number(totalKebutuhanKg.toFixed(2)),
    });
  });
}

module.exports = { registerWarehouseRoutes };
