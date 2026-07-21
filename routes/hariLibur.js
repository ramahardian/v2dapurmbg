const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /cek?tanggal=YYYY-MM-DD — check if a date is a holiday
router.get('/cek', async (req, res) => {
  const { tanggal } = req.query;
  if (!tanggal) return res.status(400).json({ error: 'Parameter tanggal wajib diisi' });
  const [rows] = await db.query(
    'SELECT id, nama, kategori FROM hari_libur WHERE tenant_id=? AND tanggal=?',
    [req.user.tenant_id, tanggal]
  );
  res.json({ libur: rows.length > 0, data: rows[0] || null });
});

// POST /cek-batch — check multiple dates at once
router.post('/cek-batch', async (req, res) => {
  const { tanggal_list } = req.body;
  if (!tanggal_list || !Array.isArray(tanggal_list) || !tanggal_list.length) {
    return res.status(400).json({ error: 'tanggal_list wajib diisi' });
  }
  const ph = tanggal_list.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT tanggal FROM hari_libur WHERE tenant_id=? AND tanggal IN (${ph})`,
    [req.user.tenant_id, ...tanggal_list]
  );
  const liburSet = new Set(rows.map(r => r.tanggal));
  const result = {};
  for (const t of tanggal_list) result[t] = liburSet.has(t);
  res.json(result);
});

// DELETE by tanggal — remove a holiday by date
router.delete('/by-tanggal/:tanggal', async (req, res) => {
  await db.query('DELETE FROM hari_libur WHERE tenant_id=? AND tanggal=?', [req.user.tenant_id, req.params.tanggal]);
  res.json({ ok: true });
});

module.exports = router;
