/**
 * ACTIONS — Purchase Order
 * POST /purchase_order/:id/terima — Terima Barang (update stok otomatis)
 * GET /laporan/biaya-produksi — Laporan Biaya Produksi per Siklus
 */
const db = require('../../db');

function registerActionRoutes(router) {
  // ===== LAPORAN BIAYA PRODUKSI PER SIKLUS =====
  router.get('/laporan/biaya-produksi', async (req, res) => {
    try {
      const t = req.user.tenant_id;

      const [siklusList] = await db.query(
        'SELECT id, nama, kategori_penerima, jumlah_porsi, total_hari FROM siklus_menu WHERE tenant_id=? AND status="Aktif" ORDER BY id',
        [t]
      );

      const result = [];
      let grandTotal = 0;
      let grandTotalPorsi = 0;

      for (const s of siklusList) {
        const [items] = await db.query(
          `SELECT si.*, m.nama as menu_nama_lengkap, m.gramasi_total
           FROM siklus_menu_item si
           LEFT JOIN menu m ON m.id = si.menu_id
           WHERE si.siklus_id=? AND si.menu_id IS NOT NULL
           ORDER BY si.hari_ke ASC`,
          [s.id]
        );

        if (!items.length) continue;

        let totalBiaya = 0;
        const menuIds = [...new Set(items.filter(it => it.menu_id).map(it => it.menu_id))];

        const menuBahanMap = {};
        if (menuIds.length) {
          const mph = menuIds.map(() => '?').join(',');
          const [bahanRows] = await db.query(
            `SELECT mb.menu_id, b.nama, b.satuan, b.harga_satuan, mb.jumlah
             FROM menu_bahan mb
             JOIN bahan_baku b ON b.id = mb.bahan_baku_id
             WHERE mb.menu_id IN (${mph})`,
            menuIds
          );
          for (const br of bahanRows) {
            if (!menuBahanMap[br.menu_id]) menuBahanMap[br.menu_id] = [];
            menuBahanMap[br.menu_id].push(br);
          }
        }

        const biayaPerHari = [];
        for (const it of items) {
          const porsi = Number(it.jumlah_porsi) || 0;
          if (!porsi || !it.menu_id) continue;
          const bahanList = menuBahanMap[it.menu_id] || [];
          let biayaHari = 0;
          for (const b of bahanList) {
            biayaHari += (Number(b.jumlah) || 0) * porsi * (Number(b.harga_satuan) || 0);
          }
          biayaPerHari.push({ hari_ke: it.hari_ke, hari_nama: it.hari_nama, menu_nama: it.menu_nama || it.menu_nama_lengkap || '', biaya: Math.round(biayaHari), porsi });
          totalBiaya += biayaHari;
        }

        const totalPorsi = items.reduce((s, it) => s + (Number(it.jumlah_porsi) || 0), 0);
        grandTotal += totalBiaya;
        grandTotalPorsi += totalPorsi;

        result.push({
          id: s.id,
          nama: s.nama,
          kategori_penerima: s.kategori_penerima,
          total_hari: s.total_hari || items.length,
          total_porsi: totalPorsi,
          total_biaya: Math.round(totalBiaya),
          rata_biaya_per_hari: items.length ? Math.round(totalBiaya / items.length) : 0,
          biaya_per_porsi: totalPorsi ? Math.round(totalBiaya / totalPorsi) : 0,
          rincian_hari: biayaPerHari,
        });
      }

      res.json({
        siklus: result,
        ringkasan: {
          total_siklus: result.length,
          grand_total_biaya: Math.round(grandTotal),
          grand_total_porsi: grandTotalPorsi,
          rata_biaya_per_siklus: result.length ? Math.round(grandTotal / result.length) : 0,
        }
      });
    } catch (err) {
      console.error('Laporan biaya produksi error:', err);
      res.status(500).json({ error: 'Gagal memuat laporan biaya produksi' });
    }
  });

  // ===== TERIMA BARANG (PO) =====
  router.post('/purchase_order/:id/terima', async (req, res) => {
    try {
      const id = req.params.id;
      const t = req.user.tenant_id;

      const [[po]] = await db.query('SELECT * FROM purchase_order WHERE id=? AND tenant_id=?', [id, t]);
      if (!po) return res.status(404).json({ error: 'PO tidak ditemukan' });
      if (po.status === 'Diterima') return res.status(400).json({ error: 'PO sudah diterima sebelumnya' });

      let items = [];
      try { items = JSON.parse(po.item); } catch { items = []; }
      if (!items.length) return res.status(400).json({ error: 'PO tidak memiliki item' });

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        const hasil = [];
        for (const item of items) {
          const namaBahan = item.nama || item.bahan_nama || '';
          const qty = Number(item.qty || item.qty_buffer || item.total_qty || 0);
          const satuan = item.satuan || 'kg';

          if (!namaBahan || qty <= 0) {
            hasil.push({ nama: namaBahan || '?', status: 'skip', alasan: 'qty 0' });
            continue;
          }

          let bahanBakuId = Number(item.bahan_baku_id) || 0;
          if (!bahanBakuId) {
            const [[bb]] = await conn.query('SELECT id FROM bahan_baku WHERE tenant_id=? AND nama=?', [t, namaBahan]);
            if (bb) bahanBakuId = bb.id;
          }

          if (!bahanBakuId) {
            hasil.push({ nama: namaBahan, status: 'skip', alasan: 'bahan tidak ditemukan di master' });
            continue;
          }

          let qtyGram = qty;
          if (['kg', 'kilogram'].includes(satuan.toLowerCase())) {
            qtyGram = qty * 1000;
          }

          await conn.query(
            'UPDATE bahan_baku SET stok_saat_ini = COALESCE(stok_saat_ini, 0) + ? WHERE id=? AND tenant_id=?',
            [qtyGram, bahanBakuId, t]
          );

          await conn.query(
            'INSERT INTO stok_masuk (tenant_id, tanggal, bahan_baku_id, jumlah, sumber, catatan) VALUES (?, CURDATE(), ?, ?, ?, ?)',
            [t, bahanBakuId, qtyGram, 'PO: ' + (po.no_po || ''), 'Penerimaan dari PO #' + id]
          );

          const harga = Number(item.harga || item.harga_satuan || 0);
          if (harga > 0) {
            await conn.query(
              'UPDATE bahan_baku SET harga_sebelumnya = harga_satuan, harga_satuan = ? WHERE id=? AND tenant_id=?',
              [harga, bahanBakuId, t]
            );
          }

          hasil.push({ nama: namaBahan, qty: qtyGram, satuan: 'g', status: 'ok' });
        }

        // Update status PO
        await conn.query('UPDATE purchase_order SET status=? WHERE id=? AND tenant_id=?', ['Diterima', id, t]);

        // Insert ke penerimaan_barang
        const noDokumen = 'PB-' + (po.no_po || id);
        await conn.query(
          'INSERT INTO penerimaan_barang (tenant_id, no_dokumen, tanggal_terima, supplier_id, supplier_nama, ref_po, item, total_nilai, status_qc, catatan) VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?)',
          [t, noDokumen, po.supplier_id || null, po.supplier_nama || '', po.no_po || '', po.item, po.total_nilai || 0, 'Lolos', 'Penerimaan otomatis dari PO']
        );

        await conn.commit();

        const sukses = hasil.filter(h => h.status === 'ok').length;
        const gagal = hasil.filter(h => h.status === 'skip').length;
        res.json({
          ok: true,
          message: `${sukses} bahan diterima, ${gagal} gagal`,
          detail: hasil,
          no_dokumen: noDokumen,
        });
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    } catch (e) {
      console.error('Terima PO error:', e);
      res.status(500).json({ error: 'Gagal menerima PO: ' + e.message });
    }
  });
}

module.exports = { registerActionRoutes };
