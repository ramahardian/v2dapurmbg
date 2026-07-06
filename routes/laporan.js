const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

/**
 * GET /laporan/keuangan
 * Ringkasan arus kas termasuk saldo awal & grouping per Buku Pembantu.
 */
router.get('/laporan/keuangan', async (req, res) => {
  const t = req.user.tenant_id;

  const [[{ masuk } = { masuk: 0 }]] = await db.query(
    'SELECT COALESCE(SUM(jumlah),0) AS masuk FROM kas_bank WHERE tenant_id=? AND tipe="masuk"', [t]
  );
  const [[{ keluar } = { keluar: 0 }]] = await db.query(
    'SELECT COALESCE(SUM(jumlah),0) AS keluar FROM kas_bank WHERE tenant_id=? AND tipe="keluar"', [t]
  );
  const [[{ saldo_awal } = { saldo_awal: 0 }]] = await db.query(
    'SELECT COALESCE(saldo_awal,0) AS saldo_awal FROM tenants WHERE id=?', [t]
  );
  const [rows] = await db.query(
    `SELECT k.*, a.kode as akun_kode, a.bp as akun_bp, a.nama as akun_nama
     FROM kas_bank k
     LEFT JOIN akun a ON a.id = k.akun_id
     WHERE k.tenant_id=? ORDER BY k.tanggal DESC`, [t]
  );

  // Group by BP
  const byBp = {};
  for (const r of rows) {
    const bp = r.akun_bp || 'Tanpa BP';
    if (!byBp[bp]) byBp[bp] = { bp, masuk: 0, keluar: 0, transaksi: 0 };
    if (r.tipe === 'masuk') byBp[bp].masuk += Number(r.jumlah);
    else byBp[bp].keluar += Number(r.jumlah);
    byBp[bp].transaksi++;
  }

  res.json({ 
    saldo_awal: Number(saldo_awal),
    total_kas_masuk: Number(masuk), 
    total_kas_keluar: Number(keluar), 
    saldo: Number(saldo_awal) + Number(masuk) - Number(keluar), 
    transaksi: rows,
    by_bp: Object.values(byBp)
  });
});

/**
 * GET /keuangan/saldo-awal
 * Ambil saldo awal buku tenant saat ini.
 */
router.get('/keuangan/saldo-awal', async (req, res) => {
  const [[row]] = await db.query('SELECT saldo_awal FROM tenants WHERE id=?', [req.user.tenant_id]);
  res.json({ saldo_awal: Number(row?.saldo_awal || 0) });
});

/**
 * PUT /keuangan/saldo-awal
 * Set/update saldo awal buku (hanya admin & keuangan).
 */
router.put('/keuangan/saldo-awal', requireRole('admin', 'keuangan'), async (req, res) => {
  const saldo_awal = parseFloat(req.body.saldo_awal);
  if (isNaN(saldo_awal)) return res.status(400).json({ error: 'Nilai saldo awal tidak valid' });
  await db.query('UPDATE tenants SET saldo_awal=? WHERE id=?', [saldo_awal, req.user.tenant_id]);
  res.json({ ok: true, saldo_awal });
});

module.exports = router;