const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('admin', 'gudang'));

for (const [endpoint, sign] of [['stok_masuk', 1], ['stok_keluar', -1]]) {
  router.get(`/${endpoint}`, async (req, res) => {
    const [rows] = await db.query(
      `SELECT s.*, bb.nama AS nama_bahan, bb.satuan FROM ${endpoint} s
       JOIN bahan_baku bb ON bb.id=s.bahan_baku_id WHERE s.tenant_id=? ORDER BY s.id DESC`, [req.user.tenant_id]);
    res.json(rows);
  });
  router.post(`/${endpoint}`, async (req, res) => {
    const { tanggal, bahan_baku_id, jumlah, sumber, tujuan, catatan } = req.body;
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `INSERT INTO ${endpoint} (tenant_id, tanggal, bahan_baku_id, jumlah, ${sign > 0 ? 'sumber' : 'tujuan'}, catatan) VALUES (?,?,?,?,?,?)`,
        [req.user.tenant_id, tanggal, bahan_baku_id, jumlah, sign > 0 ? sumber : tujuan, catatan || null]);
      await conn.query(
        `UPDATE bahan_baku SET stok_saat_ini = stok_saat_ini + ? WHERE id=? AND tenant_id=?`,
        [sign * Number(jumlah), bahan_baku_id, req.user.tenant_id]);
      await conn.commit();
      res.json({ ok: true });
    } catch (e) { await conn.rollback(); console.error(e); res.status(400).json({ error: 'Gagal' }); }
    finally { conn.release(); }
  });
}

module.exports = router;
