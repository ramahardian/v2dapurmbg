const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.post('/bahan-baku/sync', requireRole('admin', 'ahli_gizi'), async (req, res) => {
  try {
    const response = await fetch('https://koperasi.mealify.id/api/bahan_baku.php');
    const data = await response.json();

    if (data.status !== 'success' || !Array.isArray(data.data)) {
      return res.status(502).json({ error: 'Gagal mengambil data dari API eksternal' });
    }

    let imported = 0, updated = 0;

    for (const item of data.data) {
      const nama = item.nama_bahan?.trim();
      if (!nama) continue;

      const [existing] = await db.query(
        'SELECT id FROM bahan_baku WHERE nama = ? AND tenant_id = ?',
        [nama, req.user.tenant_id]
      );

      const kategori = item.kategori || null;
      const satuan = item.satuan || 'Kg';
      const harga = parseFloat(item.harga_estimasi) || 0;
      const stok = parseFloat(item.stok_sekarang) || 0;
      const kode = `EXT-${item.id}`;

      if (existing.length) {
        const [[cur]] = await db.query('SELECT harga_satuan FROM bahan_baku WHERE id=?', [existing[0].id]);
        const oldPrice = cur && Number(cur.harga_satuan) !== harga ? cur.harga_satuan : 0;
        await db.query(
          `UPDATE bahan_baku SET kode=?, kategori=?, satuan=?, harga_satuan=?, harga_sebelumnya=?, stok_saat_ini=? WHERE id=? AND tenant_id=?`,
          [kode, kategori, satuan, harga, oldPrice, stok, existing[0].id, req.user.tenant_id]
        );
        updated++;
      } else {
        await db.query(
          `INSERT INTO bahan_baku (tenant_id, kode, nama, kategori, satuan, harga_satuan, stok_saat_ini, stok_minimum) VALUES (?,?,?,?,?,?,?,0)`,
          [req.user.tenant_id, kode, nama, kategori, satuan, harga, stok]
        );
        imported++;
      }
    }

    res.json({ imported, updated, total: data.data.length, last_sync: data.last_sync });
  } catch (e) {
    console.error('Sync bahan baku error:', e);
    res.status(500).json({ error: 'Gagal sinkronisasi: ' + e.message });
  }
});

module.exports = router;
