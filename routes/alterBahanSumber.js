const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/alter-bahan-sumber', async (req, res) => {
  try {
    const [cols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'bahan_baku'
         AND COLUMN_NAME = 'sumber'`
    );

    if (cols.length) {
      return res.json({
        ok: true,
        status: 'exists',
        message: 'Kolom sumber sudah ada di tabel bahan_baku. Tidak perlu diubah.'
      });
    }

    await db.query(
      `ALTER TABLE bahan_baku
       ADD COLUMN sumber VARCHAR(20) DEFAULT NULL
       COMMENT 'sumber permintaan: ahli_gizi' AFTER stok_minimum`
    );

    res.json({
      ok: true,
      status: 'created',
      message: 'Kolom sumber berhasil ditambahkan ke bahan_baku (VARCHAR(20), NULL, AFTER stok_minimum)'
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      status: 'error',
      message: 'Gagal: ' + e.message
    });
  }
});

module.exports = router;
