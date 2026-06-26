const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('admin', 'gudang'));

for (const [endpoint, sign] of [['stok_masuk', 1], ['stok_keluar', -1]]) {
  router.get(`/${endpoint}`, async (req, res) => {
    const { search, page, limit } = req.query;
    let whereClause = 'WHERE s.tenant_id=?';
    const params = [req.user.tenant_id];

    if (search) {
      whereClause += ' AND (bb.nama LIKE ? OR s.catatan LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const [countResult] = await db.query(`SELECT COUNT(*) as count FROM ${endpoint} s JOIN bahan_baku bb ON bb.id=s.bahan_baku_id ${whereClause}`, params);
    const total = countResult[0].count;

    if (page && limit) {
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;
      const [rows] = await db.query(
        `SELECT s.*, bb.nama AS nama_bahan, bb.satuan FROM ${endpoint} s
         JOIN bahan_baku bb ON bb.id=s.bahan_baku_id ${whereClause} ORDER BY s.id DESC LIMIT ? OFFSET ?`,
        [...params, limitNum, offset]);
      return res.json({ data: rows, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } });
    }

    const [rows] = await db.query(
      `SELECT s.*, bb.nama AS nama_bahan, bb.satuan FROM ${endpoint} s
       JOIN bahan_baku bb ON bb.id=s.bahan_baku_id ${whereClause} ORDER BY s.id DESC`, params);
    res.json(rows);
  });
  router.post(`/${endpoint}`, async (req, res) => {
    const { tanggal, bahan_baku_id, jumlah, sumber, tujuan, catatan } = req.body;
    if (!tanggal) return res.status(400).json({ error: 'Tanggal wajib diisi' });
    if (!bahan_baku_id) return res.status(400).json({ error: 'Bahan baku wajib dipilih' });
    if (!jumlah || Number(jumlah) <= 0) return res.status(400).json({ error: 'Jumlah harus lebih dari 0' });
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
