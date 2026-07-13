const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/payroll', requireRole('admin', 'keuangan'), async (req, res) => {
  const { karyawan_id, bulan, tahun, status } = req.query;
  let sql = `SELECT p.*, k.nama as nama_karyawan, j.name as jabatan, k.departemen FROM payroll p
    JOIN karyawan k ON k.id=p.karyawan_id
    LEFT JOIN jabatan j ON j.id=k.jabatan_id WHERE p.tenant_id=?`;
  const params = [req.user.tenant_id];
  if (karyawan_id) { sql += ` AND p.karyawan_id=?`; params.push(karyawan_id); }
  if (bulan) { sql += ` AND p.bulan=?`; params.push(bulan); }
  if (tahun) { sql += ` AND p.tahun=?`; params.push(tahun); }
  if (status) { sql += ` AND p.status=?`; params.push(status); }
  sql += ` ORDER BY p.tahun DESC, p.bulan DESC, k.nama ASC`;
  const [rows] = await db.query(sql, params);
  res.json(rows);
});

router.post('/payroll', requireRole('admin', 'keuangan'), async (req, res) => {
  const { karyawan_id, bulan, tahun, gaji_pokok, tunjangan, potongan, status } = req.body;
  if (!karyawan_id) return res.status(400).json({ error: 'Karyawan wajib dipilih' });
  if (!bulan || bulan < 1 || bulan > 12) return res.status(400).json({ error: 'Bulan tidak valid (1-12)' });
  if (!tahun || tahun < 2000) return res.status(400).json({ error: 'Tahun tidak valid' });
  const total_gaji = (Number(gaji_pokok) || 0) + (Number(tunjangan) || 0) - (Number(potongan) || 0);
  const [r] = await db.query(
    `INSERT INTO payroll (tenant_id, karyawan_id, bulan, tahun, gaji_pokok, tunjangan, potongan, total_gaji, status) VALUES (?,?,?,?,?,?,?,?,?)`,
    [req.user.tenant_id, karyawan_id, bulan, tahun, gaji_pokok || 0, tunjangan || 0, potongan || 0, total_gaji, status || 'Draft']
  );
  const [rows] = await db.query(`SELECT p.*, k.nama as nama_karyawan FROM payroll p JOIN karyawan k ON k.id=p.karyawan_id WHERE p.id=?`, [r.insertId]);
  res.json(rows[0]);
});

router.put('/payroll/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  const { gaji_pokok, tunjangan, potongan, total_gaji, status } = req.body;
  const sets = []; const vals = [];
  if (gaji_pokok !== undefined) { sets.push('gaji_pokok=?'); vals.push(gaji_pokok); }
  if (tunjangan !== undefined) { sets.push('tunjangan=?'); vals.push(tunjangan); }
  if (potongan !== undefined) { sets.push('potongan=?'); vals.push(potongan); }
  if (total_gaji !== undefined) { sets.push('total_gaji=?'); vals.push(total_gaji); }
  if (status !== undefined) { sets.push('status=?'); vals.push(status); }
  if (!vals.length) return res.status(400).json({ error: 'Tidak ada perubahan' });
  const finalTotal = total_gaji || ((Number(gaji_pokok)||0) + (Number(tunjangan)||0) - (Number(potongan)||0));
  if (!sets.includes('total_gaji=?')) { sets.push('total_gaji=?'); vals.push(finalTotal); }
  vals.push(req.params.id, req.user.tenant_id);
  await db.query(`UPDATE payroll SET ${sets.join(',')} WHERE id=? AND tenant_id=?`, vals);
  const [rows] = await db.query(`SELECT p.*, k.nama as nama_karyawan FROM payroll p JOIN karyawan k ON k.id=p.karyawan_id WHERE p.id=?`, [req.params.id]);

  // Auto-journal: Payroll Dibayar → kas_bank
  if (status === 'Dibayar' && rows.length) {
    const p = rows[0];
    const [existing] = await db.query(
      'SELECT id FROM kas_bank WHERE tenant_id=? AND no_transaksi=? AND tipe="keluar"',
      [req.user.tenant_id, `PAY/${p.id}`]
    );
    if (!existing.length) {
      const [[akun]] = await db.query('SELECT id FROM akun WHERE tenant_id=? AND kode=?', [req.user.tenant_id, '2100']);
      await db.query(
        `INSERT INTO kas_bank (tenant_id, tanggal, no_transaksi, tipe, kategori, akun, akun_id, deskripsi, jumlah)
         VALUES (?, CURDATE(), ?, 'keluar', 'Gaji', 'Dana Operasional', ?, ?, ?)`,
        [req.user.tenant_id, `PAY/${p.id}`,
         akun?.id || null,
         `Pembayaran Gaji - ${p.nama_karyawan} (${p.bulan}/${p.tahun})`, p.total_gaji]
      );
    }
  }

  res.json(rows[0]);
});

router.delete('/payroll/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  await db.query(`DELETE FROM payroll WHERE id=? AND tenant_id=?`, [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

/* ──────────────────────────────────────────────
 * GET /api/payroll/mingguan — Payroll mingguan (7 hari)
 * Query: bulan, tahun, minggu_ke (1-5)
 *
 * Menampilkan tabel semua karyawan dengan:
 *   - 7 kolom hari (check-in / check-out)
 *   - Total hadir minggu ini
 *   - Gaji per hari (gaji_pokok / 26)
 *   - Total gaji minggu ini
 * ────────────────────────────────────────────── */
router.get('/payroll/mingguan', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const now = new Date();
    const bulan = parseInt(req.query.bulan) || (now.getMonth() + 1);
    const tahun = parseInt(req.query.tahun) || now.getFullYear();
    const mingguKe = Math.min(5, Math.max(1, parseInt(req.query.minggu_ke) || 1));

    const daysInMonth = new Date(tahun, bulan, 0).getDate();
    const startDay = (mingguKe - 1) * 7 + 1;
    const endDay = Math.min(mingguKe * 7, daysInMonth);

    const pad = (n) => String(n).padStart(2, '0');
    const startDate = `${tahun}-${pad(bulan)}-${pad(startDay)}`;
    const endDate = `${tahun}-${pad(bulan)}-${pad(endDay)}`;

    // Semua tanggal dalam minggu ini
    const dates = [];
    for (let d = startDay; d <= endDay; d++) {
      dates.push(`${tahun}-${pad(bulan)}-${pad(d)}`);
    }

    // Semua karyawan aktif
    const [karyawan] = await db.query(
      `SELECT k.id, k.nama, k.nik, k.gaji_pokok, j.name as jabatan
       FROM karyawan k
       LEFT JOIN jabatan j ON j.id=k.jabatan_id
       WHERE k.status='Aktif' AND k.tenant_id=?
       ORDER BY k.nama`,
      [req.user.tenant_id]
    );

    if (!karyawan.length) {
      return res.json({ minggu: { label: `Minggu ${mingguKe} (${startDay}-${endDay})`, dates }, karyawan: [] });
    }

    // Absensi untuk semua karyawan dalam range tanggal
    const [absensiList] = await db.query(
      `SELECT karyawan_id, tanggal, jam_masuk, jam_keluar, status
       FROM absensi
       WHERE tenant_id=? AND karyawan_id IN (${karyawan.map(k => k.id).join(',')})
       AND tanggal BETWEEN ? AND ?
       ORDER BY karyawan_id, tanggal`,
      [req.user.tenant_id, startDate, endDate]
    );

    // Group absensi per karyawan — pakai format lokal, BUKAN toISOString()
    // (toISOString() pake UTC, bisa geser tanggal di zona waktu positif)
    const fmtDate = (d) => {
      if (!d) return '';
      // Sudah string dari MySQL? (DATE_FORMAT di query)
      if (typeof d === 'string') return d.slice(0, 10);
      // Date object — ambil lokal
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const absensiByKaryawan = {};
    for (const a of absensiList) {
      if (!absensiByKaryawan[a.karyawan_id]) absensiByKaryawan[a.karyawan_id] = {};
      absensiByKaryawan[a.karyawan_id][fmtDate(a.tanggal)] = {
        masuk: a.jam_masuk ? a.jam_masuk.slice(0, 5) : null,
        keluar: a.jam_keluar ? a.jam_keluar.slice(0, 5) : null,
        status: a.status
      };
    }

    const result = karyawan.map(k => {
      const absenKaryawan = absensiByKaryawan[k.id] || {};
      let totalHadir = 0;
      const harian = dates.map(tgl => {
        const rec = absenKaryawan[tgl];
        if (rec && rec.status === 'Hadir') totalHadir++;
        return rec ? { masuk: rec.masuk, keluar: rec.keluar, status: rec.status } : null;
      });

      const gajiPokok = Number(k.gaji_pokok) || 0; // gaji pokok = upah harian
      const totalGaji = totalHadir * gajiPokok;

      return {
        id: k.id,
        nama: k.nama,
        nik: k.nik,
        jabatan: k.jabatan || '-',
        gaji_pokok: gajiPokok,
        upah_per_hari: gajiPokok,
        harian,
        total_hadir: totalHadir,
        total_gaji: totalGaji
      };
    });

    // Total baris
    const totalHadir = result.reduce((sum, k) => sum + k.total_hadir, 0);
    const totalGaji = result.reduce((sum, k) => sum + k.total_gaji, 0);

    res.json({
      minggu: {
        label: `Minggu ${mingguKe} (${startDay}-${endDay} ${['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][bulan-1]} ${tahun})`,
        tanggal_mulai: startDate,
        tanggal_selesai: endDate,
        dates
      },
      karyawan: result,
      totals: {
        total_karyawan: karyawan.length,
        total_hadir: totalHadir,
        total_gaji: totalGaji
      }
    });
  } catch (err) {
    console.error('Payroll mingguan error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ──────────────────────────────────────────────
 * POST /api/payroll/mingguan/bayar — Bayar & auto-jurnal ke Kas Bank
 * Body: { bulan, tahun, minggu_ke }
 *
 * Menghitung total gaji mingguan, lalu membuat 1 entry kas_bank (tipe: keluar)
 * dengan kategori 'Gaji' dan akun 'Dana Operasional'.
 * ────────────────────────────────────────────── */
router.post('/payroll/mingguan/bayar', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const now = new Date();
    const bulan = parseInt(req.body.bulan) || (now.getMonth() + 1);
    const tahun = parseInt(req.body.tahun) || now.getFullYear();
    const mingguKe = Math.min(5, Math.max(1, parseInt(req.body.minggu_ke) || 1));

    const daysInMonth = new Date(tahun, bulan, 0).getDate();
    const startDay = (mingguKe - 1) * 7 + 1;
    const endDay = Math.min(mingguKe * 7, daysInMonth);
    const pad = (n) => String(n).padStart(2, '0');
    const label = `Minggu ${mingguKe} (${startDay}-${endDay} ${['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][bulan-1]} ${tahun})`;
    const noTransaksi = `PAY-MG/${tahun}/${pad(bulan)}/M${mingguKe}`;

    // Cek duplikat
    const [existing] = await db.query(
      'SELECT id FROM kas_bank WHERE tenant_id=? AND no_transaksi=? AND tipe="keluar"',
      [req.user.tenant_id, noTransaksi]
    );
    if (existing.length) {
      return res.status(409).json({
        error: 'Jurnal untuk periode ini sudah ada',
        no_transaksi: noTransaksi,
        kas_bank_id: existing[0].id
      });
    }

    // Hitung total gaji (sama seperti GET, tapi tanpa detail per karyawan)
    // Ambil shift untuk hitung hari kerja
    const startDate = `${tahun}-${pad(bulan)}-${pad(startDay)}`;
    const endDate = `${tahun}-${pad(bulan)}-${pad(endDay)}`;

    const [karyawan] = await db.query(
      `SELECT id, gaji_pokok FROM karyawan WHERE status='Aktif' AND tenant_id=?`,
      [req.user.tenant_id]
    );

    if (!karyawan.length) {
      return res.status(400).json({ error: 'Tidak ada karyawan aktif' });
    }

    const ids = karyawan.map(k => k.id);
    const [absensiList] = await db.query(
      `SELECT karyawan_id, status FROM absensi
       WHERE tenant_id=? AND karyawan_id IN (${ids.join(',')})
       AND tanggal BETWEEN ? AND ?
       ORDER BY karyawan_id, tanggal`,
      [req.user.tenant_id, startDate, endDate]
    );

    // Hitung total hadir + total gaji per karyawan
    const absensiByKaryawan = {};
    for (const a of absensiList) {
      if (!absensiByKaryawan[a.karyawan_id]) absensiByKaryawan[a.karyawan_id] = [];
      absensiByKaryawan[a.karyawan_id].push(a.status);
    }

    let totalHadir = 0;
    let totalGaji = 0;
    let rincian = [];

    for (const k of karyawan) {
      const absen = absensiByKaryawan[k.id] || [];
      const hadir = absen.filter(s => s === 'Hadir').length;
      const gajiPokok = Number(k.gaji_pokok) || 0;
      const gaji = hadir * gajiPokok;
      if (hadir > 0) {
        totalHadir += hadir;
        totalGaji += gaji;
        rincian.push({ id: k.id, hadir, gaji });
      }
    }

    if (totalHadir === 0) {
      return res.status(400).json({ error: 'Tidak ada data absensi untuk periode ini' });
    }

    // Cari akun Dana Operasional (kode 2100)
    const [[akun]] = await db.query(
      'SELECT id FROM akun WHERE tenant_id=? AND kode=?',
      [req.user.tenant_id, '2100']
    );

    const deskripsi = `Pembayaran Gaji ${label} — ${karyawan.length} karyawan, ${totalHadir} hadir`;

    // Buat entry kas_bank
    const [result] = await db.query(
      `INSERT INTO kas_bank (tenant_id, tanggal, no_transaksi, tipe, kategori, akun, akun_id, deskripsi, jumlah)
       VALUES (?, CURDATE(), ?, 'keluar', 'Gaji', 'Dana Operasional', ?, ?, ?)`,
      [req.user.tenant_id, noTransaksi, akun?.id || null, deskripsi, totalGaji]
    );

    res.json({
      ok: true,
      pesan: `Jurnal berhasil dibuat: ${deskripsi}`,
      no_transaksi: noTransaksi,
      kas_bank_id: result.insertId,
      rincian: {
        total_karyawan: karyawan.length,
        total_hadir: totalHadir,
        total_gaji: totalGaji
      }
    });
  } catch (err) {
    console.error('Payroll mingguan bayar error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
