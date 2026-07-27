/**
 * QUERIES — Mobile Absensi
 * GET endpoints: riwayat, rekap, shift-saya, profile
 * POST endpoint: ijin-cuti
 */
const db = require('../../db');
const { localDateStr, tenantWhere, getEffectiveShift, countWorkDays } = require('./helpers');

function registerQueryRoutes(router) {
  // GET /absensi/riwayat
  router.get('/absensi/riwayat', async (req, res) => {
    try {
      const { page = '1', limit = '20', bulan, tahun } = req.query;
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;
      const twA = tenantWhere('a');
      const twJk = tenantWhere('jk');
      const { sql: tSql, params: tParams } = twA(req.user.tenant_id);
      const { sql: jkSql, params: jkParams } = twJk(req.user.tenant_id);

      let where = `WHERE ${tSql} AND a.karyawan_id=?`;
      const params = [...tParams, req.karyawan.id];
      if (bulan && tahun) { where += ' AND MONTH(a.tanggal)=? AND YEAR(a.tanggal)=?'; params.push(parseInt(bulan), parseInt(tahun)); }
      else if (tahun) { where += ' AND YEAR(a.tanggal)=?'; params.push(parseInt(tahun)); }

      const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM absensi a ${where}`, params);

      const [rows] = await db.query(
        `SELECT a.id, a.tanggal, a.status, a.jam_masuk, a.jam_keluar, a.keterangan,
                s.nama as shift_nama, s.jam_masuk as shift_masuk, s.jam_keluar as shift_keluar
         FROM absensi a
         LEFT JOIN jadwal_karyawan jk ON jk.karyawan_id=a.karyawan_id
           AND ${jkSql} AND a.tanggal BETWEEN jk.tanggal_mulai AND COALESCE(jk.tanggal_selesai, a.tanggal)
         LEFT JOIN shift s ON s.id=jk.shift_id
         ${where} ORDER BY a.tanggal DESC, a.created_at DESC LIMIT ? OFFSET ?`,
        [...jkParams, ...params, limitNum, offset]
      );

      const [[stats]] = await db.query(
        `SELECT COUNT(*) AS total_hari,
                SUM(CASE WHEN a.status='Hadir' THEN 1 ELSE 0 END) AS hadir,
                SUM(CASE WHEN a.status='Sakit' THEN 1 ELSE 0 END) AS sakit,
                SUM(CASE WHEN a.status='Izin' THEN 1 ELSE 0 END) AS izin,
                SUM(CASE WHEN a.status IN ('Cuti','Alpha') THEN 1 ELSE 0 END) AS lainnya
         FROM absensi a ${where}`, params
      );

      res.json({
        data: rows,
        pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
        statistik: {
          total_hari: Number(stats?.total_hari || 0), hadir: Number(stats?.hadir || 0),
          sakit: Number(stats?.sakit || 0), izin: Number(stats?.izin || 0), lainnya: Number(stats?.lainnya || 0),
        },
      });
    } catch (err) {
      console.error('Mobile absensi riwayat error:', err);
      res.status(500).json({ error: 'Gagal memuat riwayat absensi' });
    }
  });

  // GET /absensi/rekap
  router.get('/absensi/rekap', async (req, res) => {
    try {
      const now = new Date();
      const bulan = parseInt(req.query.bulan) || (now.getMonth() + 1);
      const tahun = parseInt(req.query.tahun) || now.getFullYear();
      const tw = tenantWhere();
      const { sql: tSql, params: tParams } = tw(req.user.tenant_id);

      const [[stats]] = await db.query(
        `SELECT COUNT(*) AS total_hari,
                SUM(CASE WHEN status='Hadir' THEN 1 ELSE 0 END) AS hadir,
                SUM(CASE WHEN status='Terlambat' THEN 1 ELSE 0 END) AS terlambat,
                SUM(CASE WHEN status='Sakit' THEN 1 ELSE 0 END) AS sakit,
                SUM(CASE WHEN status='Izin' THEN 1 ELSE 0 END) AS izin,
                SUM(CASE WHEN status='Cuti' THEN 1 ELSE 0 END) AS cuti,
                SUM(CASE WHEN status='Alpha' THEN 1 ELSE 0 END) AS alpha,
                SUM(CASE WHEN jam_masuk IS NOT NULL THEN 1 ELSE 0 END) AS pernah_absen,
                SUM(CASE WHEN jam_masuk IS NOT NULL AND jam_keluar IS NULL THEN 1 ELSE 0 END) AS belum_clockout
         FROM absensi
         WHERE ${tSql} AND karyawan_id=? AND MONTH(tanggal)=? AND YEAR(tanggal)=?`,
        [...tParams, req.karyawan.id, bulan, tahun]
      );

      const [chartData] = await db.query(
        `SELECT tanggal,
                CASE WHEN jam_masuk IS NOT NULL THEN CONCAT('Masuk: ', TIME_FORMAT(jam_masuk, '%H:%i')) ELSE '-' END as jam_masuk_label,
                CASE WHEN jam_keluar IS NOT NULL THEN CONCAT('Pulang: ', TIME_FORMAT(jam_keluar, '%H:%i')) ELSE '-' END as jam_keluar_label,
                status
         FROM absensi
         WHERE ${tSql} AND karyawan_id=? AND MONTH(tanggal)=? AND YEAR(tanggal)=?
         ORDER BY tanggal ASC`,
        [...tParams, req.karyawan.id, bulan, tahun]
      );

      const [[avgJam]] = await db.query(
        `SELECT COALESCE(ROUND(AVG(TIMESTAMPDIFF(MINUTE, jam_masuk, jam_keluar) / 60), 1), 0) AS rata_rata_jam
         FROM absensi
         WHERE ${tSql} AND karyawan_id=? AND MONTH(tanggal)=? AND YEAR(tanggal)=?
           AND jam_masuk IS NOT NULL AND jam_keluar IS NOT NULL`,
        [...tParams, req.karyawan.id, bulan, tahun]
      );

      // Hitung expected hari & bolos
      let expected_hari = 0, bolos = 0;
      const [[karyawanRow]] = await db.query('SELECT tanggal_masuk FROM karyawan WHERE id=?', [req.karyawan.id]);
      const tglMasuk = karyawanRow?.tanggal_masuk || null;
      const daysInMonth = new Date(tahun, bulan, 0).getDate();
      const sampleDates = [1, 15, daysInMonth];
      let shift = null;
      for (const d of sampleDates) {
        const dateStr = `${tahun}-${String(bulan).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dow = new Date(tahun, bulan - 1, d).getDay() + 1;
        shift = await getEffectiveShift(req.karyawan, req.user.tenant_id, dateStr, dow);
        if (shift) break;
      }

      if (shift) {
        const awalBulan = `${tahun}-${String(bulan).padStart(2,'0')}-01`;
        const hariIni = localDateStr(now);
        let tglMulaiEfektif = null;

        if (tglMasuk) tglMulaiEfektif = tglMasuk > awalBulan ? tglMasuk : awalBulan;
        else {
          const [[{ pernahAbsen }]] = await db.query('SELECT COUNT(*) AS pernahAbsen FROM absensi WHERE karyawan_id=?', [req.karyawan.id]);
          if (pernahAbsen > 0) tglMulaiEfektif = awalBulan;
        }

        if (tglMulaiEfektif && Number(stats?.total_hari || 0) > 0) {
          const tglSelesai = shift.tanggal_selesai && shift.tanggal_selesai < hariIni ? shift.tanggal_selesai : hariIni;
          expected_hari = countWorkDays(bulan, tahun, shift.hari_kerja || '1,2,3,4,5,6', tglMulaiEfektif, tglSelesai);
          const realHadir = Number(stats?.hadir || 0) + Number(stats?.terlambat || 0)
            + Number(stats?.sakit || 0) + Number(stats?.izin || 0) + Number(stats?.cuti || 0);
          bolos = Math.max(0, expected_hari - realHadir);
        }
      }

      const alphaFinal = Math.max(Number(stats?.alpha || 0), bolos);

      res.json({
        periode: `${bulan}/${tahun}`, bulan, tahun,
        statistik: {
          total_hari: Number(stats?.total_hari || 0), expected_hari,
          hadir: Number(stats?.hadir || 0), terlambat: Number(stats?.terlambat || 0),
          sakit: Number(stats?.sakit || 0), izin: Number(stats?.izin || 0),
          cuti: Number(stats?.cuti || 0), alpha: alphaFinal, bolos,
          belum_clockout: Number(stats?.belum_clockout || 0), pakai_gps: 0,
        },
        rata_rata_jam_kerja: Number(avgJam?.rata_rata_jam || 0),
        chart: chartData.map(c => ({ tanggal: c.tanggal, jam_masuk: c.jam_masuk_label, jam_keluar: c.jam_keluar_label, status: c.status })),
      });
    } catch (err) {
      console.error('Mobile absensi rekap error:', err);
      res.status(500).json({ error: 'Gagal memuat rekap absensi' });
    }
  });

  // GET /absensi/shift-saya
  router.get('/absensi/shift-saya', async (req, res) => {
    try {
      const today = localDateStr(new Date());
      const dayOfWeek = new Date().getDay() + 1;
      const shift = await getEffectiveShift(req.karyawan, req.user.tenant_id, today, dayOfWeek);

      if (!shift) return res.json({ ada_shift: false, pesan: 'Tidak ada shift untuk hari ini', data: null });

      const hariKerja = (shift.hari_kerja || '1,2,3,4,5,6,7').split(',').map(Number);
      return res.json({
        ada_shift: true, hari_kerja_hari_ini: hariKerja.includes(dayOfWeek),
        data: { id: shift.id, nama: shift.nama, jam_masuk: shift.jam_masuk, jam_keluar: shift.jam_keluar, warna: shift.warna, tanggal_mulai: shift.tanggal_mulai, tanggal_selesai: shift.tanggal_selesai, sumber: shift.sumber },
      });
    } catch (err) {
      console.error('Mobile shift error:', err);
      res.status(500).json({ error: 'Gagal memuat shift' });
    }
  });

  // GET /profile
  router.get('/profile', async (req, res) => {
    try {
      const tw = tenantWhere('k');
      const { sql: tenantSql, params: tenantParams } = tw(req.user.tenant_id);

      const [[tenant]] = await db.query(`SELECT nama FROM tenants WHERE id=?`, [req.user.tenant_id]);

      const [rows] = await db.query(
        `SELECT k.id, k.nama, k.nik, k.departemen, k.email, k.phone, k.photo, k.status,
                k.tanggal_masuk, k.address, j.name as jabatan
         FROM karyawan k LEFT JOIN jabatan j ON j.id=k.jabatan_id
         WHERE k.id=? AND ${tenantSql}`,
        [req.karyawan.id, ...tenantParams]
      );

      if (!rows.length) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });

      res.json({ data: rows[0], tenant: tenant ? tenant.nama : '', user: { id: req.user.id, email: req.user.email, nama: req.user.nama, role: req.user.role } });
    } catch (err) {
      console.error('Mobile profile error:', err.message);
      res.status(500).json({ error: 'Gagal memuat profil' });
    }
  });

  // POST /ijin-cuti
  router.post('/ijin-cuti', async (req, res) => {
    try {
      const { jenis, tanggal_mulai, tanggal_selesai, alasan, dokumen } = req.body;
      if (!jenis) return res.status(400).json({ error: 'Jenis wajib dipilih' });
      if (!tanggal_mulai) return res.status(400).json({ error: 'Tanggal mulai wajib diisi' });

      const [r] = await db.query(
        `INSERT INTO ijin_cuti (tenant_id, karyawan_id, jenis, tanggal_mulai, tanggal_selesai, alasan, dokumen, status)
         VALUES (?,?,?,?,?,?,?,'Menunggu')`,
        [req.user.tenant_id, req.karyawan.id, jenis, tanggal_mulai, tanggal_selesai || null, alasan || null, dokumen || null]
      );
      res.json({ ok: true, pesan: 'Pengajuan ijin/cuti berhasil dikirim', id: r.insertId });
    } catch (err) {
      console.error('Mobile ijin-cuti error:', err);
      res.status(500).json({ error: 'Gagal mengajukan: ' + err.message });
    }
  });
}

module.exports = { registerQueryRoutes };
