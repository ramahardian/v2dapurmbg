const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function getHariKerja(karyawanId, tenantId) {
  // Priority 1: jadwal_karyawan
  const [jk] = await db.query(
    `SELECT hari_kerja FROM jadwal_karyawan
     WHERE karyawan_id=? AND tenant_id=?
       AND (tanggal_selesai IS NULL OR tanggal_selesai >= CURDATE())
     ORDER BY tanggal_mulai DESC LIMIT 1`,
    [karyawanId, tenantId]
  );
  if (jk.length) return jk[0].hari_kerja;

  // Priority 2: jabatan.shift_id
  const [j] = await db.query(
    `SELECT 1 FROM jabatan j JOIN shift s ON s.id=j.shift_id
     WHERE j.id=(SELECT jabatan_id FROM karyawan WHERE id=?) AND s.tenant_id=?`,
    [karyawanId, tenantId]
  );
  if (j.length) return '1,2,3,4,5,6';

  // Priority 3: shift_divisi via departemen
  const [d] = await db.query(
    `SELECT 1 FROM shift_divisi sd
     JOIN divisi d ON d.id=sd.divisi_id
     JOIN karyawan k ON k.departemen=d.nama
     WHERE k.id=? AND sd.tenant_id=?`,
    [karyawanId, tenantId]
  );
  if (d.length) return '1,2,3,4,5,6';

  return null;
}

async function generateAlpha(tenantId, tanggalAwal, tanggalAkhir) {
  const start = tanggalAwal || new Date().toISOString().slice(0, 10);
  const end = tanggalAkhir || start;

  const [karyawan] = await db.query(
    `SELECT id FROM karyawan WHERE tenant_id=? AND status='Aktif'`,
    [tenantId]
  );

  const tglList = [];
  let d = new Date(start);
  const endDate = new Date(end);
  while (d <= endDate) {
    tglList.push({ date: d.toISOString().slice(0, 10), day: d.getDay() + 1 });
    d.setDate(d.getDate() + 1);
  }

  let created = 0;
  for (const k of karyawan) {
    const hariKerjaStr = await getHariKerja(k.id, tenantId);
    if (!hariKerjaStr) continue;
    const hariKerja = hariKerjaStr.split(',').map(Number);

    const [exist] = await db.query(
      `SELECT tanggal FROM absensi WHERE tenant_id=? AND karyawan_id=? AND tanggal>=? AND tanggal<=?`,
      [tenantId, k.id, start, end]
    );
    const existSet = new Set(exist.map(r => {
      const t = r.tanggal;
      return typeof t === 'string' ? t.slice(0, 10) : new Date(t).toISOString().slice(0, 10);
    }));
    for (const { date: tgl, day } of tglList) {
      if (hariKerja.includes(day) && !existSet.has(tgl)) {
        await db.query(
          `INSERT INTO absensi (tenant_id, karyawan_id, tanggal, status) VALUES (?,?,?,'Alpha')`,
          [tenantId, k.id, tgl]
        );
        created++;
      }
    }
  }
  return created;
}

router.get('/absensi', requireRole('admin', 'keuangan'), async (req, res) => {
  const { karyawan_id, tanggal_awal, tanggal_akhir, status, page = '1', limit = '50' } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(500, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  // Auto-generate Alpha records
  if (!karyawan_id) {
    await generateAlpha(req.user.tenant_id, tanggal_awal, tanggal_akhir).catch(() => {});
  }

  let where = 'WHERE a.tenant_id=?';
  const params = [req.user.tenant_id];
  if (karyawan_id) { where += ` AND a.karyawan_id=?`; params.push(karyawan_id); }
  if (tanggal_awal) { where += ` AND a.tanggal >= ?`; params.push(tanggal_awal); }
  if (tanggal_akhir) { where += ` AND a.tanggal <= ?`; params.push(tanggal_akhir); }
  if (status) { where += ` AND a.status=?`; params.push(status); }
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM absensi a ${where}`, params);
  const [rows] = await db.query(
    `SELECT a.*, k.nama as nama_karyawan, j.name as jabatan, k.departemen FROM absensi a
     JOIN karyawan k ON k.id=a.karyawan_id
     LEFT JOIN jabatan j ON j.id=k.jabatan_id ${where}
     ORDER BY a.tanggal DESC, k.nama ASC LIMIT ? OFFSET ?`,
    [...params, limitNum, offset]
  );
  res.json({ data: rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
});

router.post('/absensi', requireRole('admin', 'keuangan'), async (req, res) => {
  const { karyawan_id, tanggal, status, jam_masuk, jam_keluar, keterangan } = req.body;
  if (!karyawan_id) return res.status(400).json({ error: 'Karyawan wajib dipilih' });
  if (!tanggal) return res.status(400).json({ error: 'Tanggal wajib diisi' });
  const [r] = await db.query(
    `INSERT INTO absensi (tenant_id, karyawan_id, tanggal, status, jam_masuk, jam_keluar, keterangan) VALUES (?,?,?,?,?,?,?)`,
    [req.user.tenant_id, karyawan_id, tanggal, status || 'Hadir', jam_masuk || null, jam_keluar || null, keterangan || null]
  );
  const [rows] = await db.query(`SELECT a.*, k.nama as nama_karyawan FROM absensi a JOIN karyawan k ON k.id=a.karyawan_id WHERE a.id=?`, [r.insertId]);
  res.json(rows[0]);
});

router.put('/absensi/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  const { status, jam_masuk, jam_keluar, keterangan } = req.body;
  const sets = []; const vals = [];
  if (status !== undefined) { sets.push('status=?'); vals.push(status); }
  if (jam_masuk !== undefined) { sets.push('jam_masuk=?'); vals.push(jam_masuk); }
  if (jam_keluar !== undefined) { sets.push('jam_keluar=?'); vals.push(jam_keluar); }
  if (keterangan !== undefined) { sets.push('keterangan=?'); vals.push(keterangan); }
  if (!vals.length) return res.status(400).json({ error: 'Tidak ada perubahan' });
  vals.push(req.params.id, req.user.tenant_id);
  await db.query(`UPDATE absensi SET ${sets.join(',')} WHERE id=? AND tenant_id=?`, vals);
  const [rows] = await db.query(`SELECT a.*, k.nama as nama_karyawan FROM absensi a JOIN karyawan k ON k.id=a.karyawan_id WHERE a.id=?`, [req.params.id]);
  res.json(rows[0]);
});

router.delete('/absensi/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  await db.query(`DELETE FROM absensi WHERE id=? AND tenant_id=?`, [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

module.exports = router;
