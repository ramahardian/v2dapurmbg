/**
 * Mobile Attendance API — untuk aplikasi Android
 * 
 * Endpoint ini dirancang khusus untuk konsumsi aplikasi mobile Android.
 * Karyawan login via akun user (email+password), dan sistem mencocokkan
 * user dengan data karyawan melalui email.
 *
 * Basis path: /api/mobile/absensi/*
 * (semua endpoint require JWT auth)
 */

const express = require('express');
const db = require('../db');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);


/* ──────────────────────────────────────────────
 * Helper: cari karyawan_id dari user yang login
 * ────────────────────────────────────────────── */
async function getKaryawanId(user) {
  // Cocokkan user email dengan email di tabel karyawan
  // Handle jika tenant_id NULL (user belum punya tenant)
  const params = [user.email];
  let tenantFilter = '';
  if (user.tenant_id) {
    tenantFilter = 'AND tenant_id=?';
    params.push(user.tenant_id);
  }
  const [rows] = await db.query(
    `SELECT id, tenant_id, nama, nik, departemen, jabatan_id, photo, phone FROM karyawan 
     WHERE email=? AND status='Aktif' ${tenantFilter} LIMIT 1`,
    params
  );
  if (!rows.length) return null;
  return rows[0];
}

/* ──────────────────────────────────────────────
 * Helper: cek apakah user bisa akses fitur mobile
 * ────────────────────────────────────────────── */
async function ensureKaryawan(req, res, next) {
  const karyawan = await getKaryawanId(req.user);
  if (!karyawan) {
    return res.status(403).json({
      error: 'Akun ini tidak terhubung ke data karyawan',
      solusi: 'Hubungi admin untuk menghubungkan email ini ke data karyawan'
    });
  }
  // Pastikan tenant_id pak punya karyawan (user mungkin tenant_id-nya NULL)
  if (karyawan.tenant_id) req.user.tenant_id = karyawan.tenant_id;
  req.karyawan = karyawan;
  next();
}

/* ──────────────────────────────────────────────
 * GET /api/mobile/absensi/status — Status absensi hari ini
 * Digunakan saat app dibuka untuk cek apakah sudah absen
 * ────────────────────────────────────────────── */
router.get('/absensi/status', ensureKaryawan, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await db.query(
      `SELECT id, tanggal, status, jam_masuk, jam_keluar, 
              latitude, longitude, clock_out_lat, clock_out_lng,
              foto_masuk, foto_keluar, keterangan
       FROM absensi 
       WHERE tenant_id=? AND karyawan_id=? AND tanggal=?
       LIMIT 1`,
      [req.user.tenant_id, req.karyawan.id, today]
    );

    if (!rows.length) {
      return res.json({
        sudah_absensi: false,
        sudah_masuk: false,
        sudah_keluar: false,
        data: null,
        pesan: 'Belum absen hari ini'
      });
    }

    const a = rows[0];
    res.json({
      sudah_absensi: true,
      sudah_masuk: !!a.jam_masuk,
      sudah_keluar: !!a.jam_keluar,
      data: {
        id: a.id,
        tanggal: a.tanggal,
        status: a.status,
        jam_masuk: a.jam_masuk,
        jam_keluar: a.jam_keluar,
        latitude: a.latitude,
        longitude: a.longitude,
        clock_out_lat: a.clock_out_lat,
        clock_out_lng: a.clock_out_lng,
        foto_masuk: a.foto_masuk,
        foto_keluar: a.foto_keluar,
        keterangan: a.keterangan
      },
      pesan: a.jam_masuk && a.jam_keluar
        ? 'Absensi hari ini sudah lengkap'
        : a.jam_masuk
          ? 'Sudah clock-in, silakan clock-out'
          : 'Belum absen hari ini'
    });
  } catch (err) {
    console.error('Mobile absensi status error:', err);
    res.status(500).json({ error: 'Gagal memuat status absensi' });
  }
});

/* ──────────────────────────────────────────────
 * POST /api/mobile/absensi/clock-in — Absen masuk
 * Body:
 *   latitude? (number), longitude? (number)
 *   foto? (base64 string) — foto selfie waktu masuk
 *   keterangan? (string)
 * ────────────────────────────────────────────── */
router.post('/absensi/clock-in', ensureKaryawan, async (req, res) => {
  try {
    const { latitude, longitude, foto, keterangan } = req.body;
    const tenant_id = req.user.tenant_id;
    const karyawan_id = req.karyawan.id;
    const today = new Date().toISOString().slice(0, 10);
    const nowTime = new Date().toTimeString().slice(0, 8); // HH:mm:ss

    // Cek apakah sudah absen hari ini
    const [existing] = await db.query(
      `SELECT id, jam_masuk FROM absensi WHERE tenant_id=? AND karyawan_id=? AND tanggal=?`,
      [tenant_id, karyawan_id, today]
    );

    if (existing.length) {
      if (existing[0].jam_masuk) {
        return res.status(400).json({
          error: 'Anda sudah melakukan clock-in hari ini',
          data: { id: existing[0].id, jam_masuk: existing[0].jam_masuk }
        });
      }
      // Ada record tapi belum ada jam_masuk — update
      await db.query(
        `UPDATE absensi SET jam_masuk=?, latitude=?, longitude=?, keterangan=?
         WHERE id=? AND tenant_id=?`,
        [nowTime, latitude || null, longitude || null, keterangan || null, existing[0].id, tenant_id]
      );
      const [updated] = await db.query(
        `SELECT id, tanggal, status, jam_masuk, jam_keluar, latitude, longitude, keterangan
         FROM absensi WHERE id=?`,
        [existing[0].id]
      );
      return res.json({
        ok: true,
        pesan: 'Clock-in berhasil',
        data: updated[0]
      });
    }

    // Buat record baru
    // Tentukan status default: jika jam masuk > batas toleransi, jadi 'Terlambat'
    // Untuk sekarang default 'Hadir'
    const status = 'Hadir';

    // Simpan foto jika ada
    let fotoPath = null;
    if (foto) {
      fotoPath = saveMobilePhoto(foto, 'masuk');
    }

    const [r] = await db.query(
      `INSERT INTO absensi (tenant_id, karyawan_id, tanggal, status, jam_masuk, latitude, longitude, foto_masuk, keterangan)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [tenant_id, karyawan_id, today, status, nowTime, latitude || null, longitude || null, fotoPath, keterangan || null]
    );

    const [rows] = await db.query(
      `SELECT id, tanggal, status, jam_masuk, jam_keluar, latitude, longitude, foto_masuk, keterangan
       FROM absensi WHERE id=?`,
      [r.insertId]
    );

    res.json({
      ok: true,
      pesan: 'Clock-in berhasil',
      data: rows[0]
    });
  } catch (err) {
    console.error('Mobile clock-in error:', err);
    res.status(500).json({ error: 'Gagal clock-in: ' + err.message });
  }
});

/* ──────────────────────────────────────────────
 * POST /api/mobile/absensi/clock-out — Absen pulang
 * Body:
 *   latitude? (number), longitude? (number)
 *   foto? (base64 string) — foto selfie waktu pulang
 *   keterangan? (string)
 * ────────────────────────────────────────────── */
router.post('/absensi/clock-out', ensureKaryawan, async (req, res) => {
  try {
    const { latitude, longitude, foto, keterangan } = req.body;
    const tenant_id = req.user.tenant_id;
    const karyawan_id = req.karyawan.id;
    const today = new Date().toISOString().slice(0, 10);
    const nowTime = new Date().toTimeString().slice(0, 8);

    // Cari record absensi hari ini
    const [existing] = await db.query(
      `SELECT id, jam_masuk, jam_keluar FROM absensi 
       WHERE tenant_id=? AND karyawan_id=? AND tanggal=?`,
      [tenant_id, karyawan_id, today]
    );

    if (!existing.length) {
      return res.status(400).json({
        error: 'Anda belum melakukan clock-in hari ini. Silakan clock-in terlebih dahulu.'
      });
    }

    if (existing[0].jam_keluar) {
      return res.status(400).json({
        error: 'Anda sudah melakukan clock-out hari ini',
        data: { id: existing[0].id, jam_keluar: existing[0].jam_keluar }
      });
    }

    if (!existing[0].jam_masuk) {
      return res.status(400).json({
        error: 'Anda belum clock-in. Silakan clock-in terlebih dahulu.'
      });
    }

    // Simpan foto jika ada
    let fotoPath = null;
    if (foto) {
      fotoPath = saveMobilePhoto(foto, 'keluar');
    }

    await db.query(
      `UPDATE absensi SET jam_keluar=?, clock_out_lat=?, clock_out_lng=?, foto_keluar=?, keterangan=?
       WHERE id=? AND tenant_id=?`,
      [nowTime, latitude || null, longitude || null, fotoPath, keterangan || null, existing[0].id, tenant_id]
    );

    const [updated] = await db.query(
      `SELECT id, tanggal, status, jam_masuk, jam_keluar, latitude, longitude, 
              clock_out_lat, clock_out_lng, foto_masuk, foto_keluar, keterangan
       FROM absensi WHERE id=?`,
      [existing[0].id]
    );

    res.json({
      ok: true,
      pesan: 'Clock-out berhasil',
      data: updated[0]
    });
  } catch (err) {
    console.error('Mobile clock-out error:', err);
    res.status(500).json({ error: 'Gagal clock-out: ' + err.message });
  }
});

/* ──────────────────────────────────────────────
 * GET /api/mobile/absensi/riwayat — Riwayat absensi
 * Query params:
 *   page (default 1), limit (default 20)
 *   bulan (1-12), tahun (2024) — filter bulan/tahun
 * ────────────────────────────────────────────── */
router.get('/absensi/riwayat', ensureKaryawan, async (req, res) => {
  try {
    const { page = '1', limit = '20', bulan, tahun } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let where = 'WHERE a.tenant_id=? AND a.karyawan_id=?';
    const params = [req.user.tenant_id, req.karyawan.id];

    if (bulan && tahun) {
      where += ' AND MONTH(a.tanggal)=? AND YEAR(a.tanggal)=?';
      params.push(parseInt(bulan), parseInt(tahun));
    } else if (tahun) {
      where += ' AND YEAR(a.tanggal)=?';
      params.push(parseInt(tahun));
    }

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM absensi a ${where}`, params
    );

    const [rows] = await db.query(
      `SELECT a.id, a.tanggal, a.status, a.jam_masuk, a.jam_keluar,
              a.latitude, a.longitude, a.foto_masuk, a.foto_keluar, a.keterangan,
              s.nama as shift_nama, s.jam_masuk as shift_masuk, s.jam_keluar as shift_keluar
       FROM absensi a
       LEFT JOIN jadwal_karyawan jk ON jk.karyawan_id=a.karyawan_id 
         AND jk.tenant_id=a.tenant_id 
         AND a.tanggal BETWEEN jk.tanggal_mulai AND COALESCE(jk.tanggal_selesai, a.tanggal)
       LEFT JOIN shift s ON s.id=jk.shift_id
       ${where}
       ORDER BY a.tanggal DESC, a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    // Hitung statistik untuk range data yang ditampilkan
    const [[stats]] = await db.query(
      `SELECT 
         COUNT(*) AS total_hari,
         SUM(CASE WHEN a.status='Hadir' THEN 1 ELSE 0 END) AS hadir,
         SUM(CASE WHEN a.status='Sakit' THEN 1 ELSE 0 END) AS sakit,
         SUM(CASE WHEN a.status='Izin' THEN 1 ELSE 0 END) AS izin,
         SUM(CASE WHEN a.status IN ('Cuti','Alpha') THEN 1 ELSE 0 END) AS lainnya
       FROM absensi a ${where}`,
      params
    );

    res.json({
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      statistik: {
        total_hari: Number(stats?.total_hari || 0),
        hadir: Number(stats?.hadir || 0),
        sakit: Number(stats?.sakit || 0),
        izin: Number(stats?.izin || 0),
        lainnya: Number(stats?.lainnya || 0)
      }
    });
  } catch (err) {
    console.error('Mobile absensi riwayat error:', err);
    res.status(500).json({ error: 'Gagal memuat riwayat absensi' });
  }
});

/* ──────────────────────────────────────────────
 * GET /api/mobile/absensi/rekap — Rekap bulanan
 * Query: bulan (default bulan ini), tahun (default tahun ini)
 * ────────────────────────────────────────────── */
router.get('/absensi/rekap', ensureKaryawan, async (req, res) => {
  try {
    const now = new Date();
    const bulan = parseInt(req.query.bulan) || (now.getMonth() + 1);
    const tahun = parseInt(req.query.tahun) || now.getFullYear();

    // Statistik bulan ini
    const [[stats]] = await db.query(
      `SELECT 
         COUNT(*) AS total_hari,
         SUM(CASE WHEN status='Hadir' THEN 1 ELSE 0 END) AS hadir,
         SUM(CASE WHEN status='Sakit' THEN 1 ELSE 0 END) AS sakit,
         SUM(CASE WHEN status='Izin' THEN 1 ELSE 0 END) AS izin,
         SUM(CASE WHEN status='Cuti' THEN 1 ELSE 0 END) AS cuti,
         SUM(CASE WHEN status='Alpha' THEN 1 ELSE 0 END) AS alpha,
         SUM(CASE WHEN jam_masuk IS NOT NULL THEN 1 ELSE 0 END) AS pernah_absen,
         SUM(CASE WHEN jam_masuk IS NOT NULL AND jam_keluar IS NULL THEN 1 ELSE 0 END) AS belum_clockout,
         SUM(CASE WHEN latitude IS NOT NULL THEN 1 ELSE 0 END) AS pakai_gps
       FROM absensi 
       WHERE tenant_id=? AND karyawan_id=? AND MONTH(tanggal)=? AND YEAR(tanggal)=?`,
      [req.user.tenant_id, req.karyawan.id, bulan, tahun]
    );

    // Data chart harian untuk seluruh bulan
    const [chartData] = await db.query(
      `SELECT tanggal, 
              CASE WHEN jam_masuk IS NOT NULL THEN CONCAT('Masuk: ', TIME_FORMAT(jam_masuk, '%H:%i')) ELSE '-' END as jam_masuk_label,
              CASE WHEN jam_keluar IS NOT NULL THEN CONCAT('Pulang: ', TIME_FORMAT(jam_keluar, '%H:%i')) ELSE '-' END as jam_keluar_label,
              status
       FROM absensi 
       WHERE tenant_id=? AND karyawan_id=? AND MONTH(tanggal)=? AND YEAR(tanggal)=?
       ORDER BY tanggal ASC`,
      [req.user.tenant_id, req.karyawan.id, bulan, tahun]
    );

    // Hitung jam kerja rata-rata
    const [[avgJam]] = await db.query(
      `SELECT COALESCE(
         ROUND(AVG(TIMESTAMPDIFF(MINUTE, jam_masuk, jam_keluar) / 60), 1), 0
       ) AS rata_rata_jam
       FROM absensi 
       WHERE tenant_id=? AND karyawan_id=? AND MONTH(tanggal)=? AND YEAR(tanggal)=?
         AND jam_masuk IS NOT NULL AND jam_keluar IS NOT NULL`,
      [req.user.tenant_id, req.karyawan.id, bulan, tahun]
    );

    res.json({
      periode: `${bulan}/${tahun}`,
      bulan,
      tahun,
      statistik: {
        total_hari: Number(stats?.total_hari || 0),
        hadir: Number(stats?.hadir || 0),
        sakit: Number(stats?.sakit || 0),
        izin: Number(stats?.izin || 0),
        cuti: Number(stats?.cuti || 0),
        alpha: Number(stats?.alpha || 0),
        belum_clockout: Number(stats?.belum_clockout || 0),
        pakai_gps: Number(stats?.pakai_gps || 0)
      },
      rata_rata_jam_kerja: Number(avgJam?.rata_rata_jam || 0),
      chart: chartData.map(c => ({
        tanggal: c.tanggal,
        jam_masuk: c.jam_masuk_label,
        jam_keluar: c.jam_keluar_label,
        status: c.status
      }))
    });
  } catch (err) {
    console.error('Mobile absensi rekap error:', err);
    res.status(500).json({ error: 'Gagal memuat rekap absensi' });
  }
});

/* ──────────────────────────────────────────────
 * GET /api/mobile/absensi/shift-saya — Jadwal shift saya hari ini
 * ────────────────────────────────────────────── */
router.get('/absensi/shift-saya', ensureKaryawan, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const dayOfWeek = new Date().getDay() + 1; // MySQL DAYOFWEEK: 1=Sunday, 7=Saturday

    const [rows] = await db.query(
      `SELECT s.id, s.nama, s.jam_masuk, s.jam_keluar, s.warna,
              jk.tanggal_mulai, jk.tanggal_selesai, jk.hari_kerja
       FROM jadwal_karyawan jk
       JOIN shift s ON s.id=jk.shift_id
       WHERE jk.tenant_id=? AND jk.karyawan_id=?
         AND jk.tanggal_mulai <= ?
         AND (jk.tanggal_selesai IS NULL OR jk.tanggal_selesai >= ?)
       ORDER BY jk.tanggal_mulai DESC
       LIMIT 1`,
      [req.user.tenant_id, req.karyawan.id, today, today]
    );

    if (!rows.length) {
      return res.json({
        ada_shift: false,
        pesan: 'Tidak ada shift untuk hari ini',
        data: null
      });
    }

    const shift = rows[0];
    // Cek apakah hari ini termasuk hari kerja
    const hariKerja = (shift.hari_kerja || '1,2,3,4,5,6,7').split(',').map(Number);
    const isTodayWorkDay = hariKerja.includes(dayOfWeek);

    res.json({
      ada_shift: true,
      hari_kerja_hari_ini: isTodayWorkDay,
      data: {
        id: shift.id,
        nama: shift.nama,
        jam_masuk: shift.jam_masuk,
        jam_keluar: shift.jam_keluar,
        warna: shift.warna,
        tanggal_mulai: shift.tanggal_mulai,
        tanggal_selesai: shift.tanggal_selesai
      }
    });
  } catch (err) {
    console.error('Mobile shift error:', err);
    res.status(500).json({ error: 'Gagal memuat shift' });
  }
});

/* ──────────────────────────────────────────────
 * GET /api/mobile/profile — Profil karyawan yang login
 * ────────────────────────────────────────────── */
router.get('/profile', ensureKaryawan, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT k.id, k.nama, k.nik, k.departemen, k.email, k.phone, k.photo, k.status,
              k.tanggal_masuk, k.address, j.name as jabatan,
              (SELECT COUNT(*) FROM absensi a WHERE a.karyawan_id=k.id AND a.tanggal >= DATE_SUB(NOW(), INTERVAL 30 DAY)) as absensi_30hari
       FROM karyawan k
       LEFT JOIN jabatan j ON j.id=k.jabatan_id
       WHERE k.id=? AND k.tenant_id=?`,
      [req.karyawan.id, req.user.tenant_id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    }

    res.json({
      data: rows[0],
      user: {
        id: req.user.id,
        email: req.user.email,
        nama: req.user.nama,
        role: req.user.role
      }
    });
  } catch (err) {
    console.error('Mobile profile error:', err);
    res.status(500).json({ error: 'Gagal memuat profil' });
  }
});

/* ──────────────────────────────────────────────
 * Helper: simpan foto dari base64
 * ────────────────────────────────────────────── */
function saveMobilePhoto(base64Data, prefix = 'masuk') {
  if (!base64Data || !base64Data.startsWith('data:image')) return null;
  try {
    const matches = base64Data.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
    if (!matches) return null;
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = `mobile_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const dir = path.join(__dirname, '..', 'public', 'uploads', 'absensi');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buffer);
    return '/uploads/absensi/' + filename;
  } catch (err) {
    console.error('Gagal simpan foto absensi:', err.message);
    return null;
  }
}

module.exports = router;
