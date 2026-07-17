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
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);


/* ──────────────────────────────────────────────
 * Helper: bangun klausa WHERE untuk tenant_id
 * Handle NULL dengan aman karena di MySQL NULL = NULL itu FALSE
 * ────────────────────────────────────────────── */
function tenantWhere(alias = '') {
  const prefix = alias ? `${alias}.` : '';
  return (tid) => {
    if (tid != null) {
      return { sql: `${prefix}tenant_id=?`, params: [tid] };
    }
    return { sql: `${prefix}tenant_id IS NULL`, params: [] };
  };
}

/* ──────────────────────────────────────────────
 * Helper: cari shift efektif untuk seorang karyawan pada tanggal tertentu
 * Prioritas:
 *   1) jadwal_karyawan (per individu)
 *   2) jabatan.shift_id
 *   3) shift_divisi via departemen
 * ────────────────────────────────────────────── */
async function getEffectiveShift(karyawan, tenantId, dateStr, dayOfWeek) {
  const tw = tenantWhere('jk');
  const { sql: tSql, params: tParams } = tw(tenantId);

  // Step 1: jadwal_karyawan
  const [rows] = await db.query(
    `SELECT s.id, s.nama, s.jam_masuk, s.jam_keluar, s.warna,
            jk.tanggal_mulai, jk.tanggal_selesai, jk.hari_kerja
     FROM jadwal_karyawan jk
     JOIN shift s ON s.id=jk.shift_id
     WHERE ${tSql} AND jk.karyawan_id=?
       AND jk.tanggal_mulai <= ?
       AND (jk.tanggal_selesai IS NULL OR jk.tanggal_selesai >= ?)
     ORDER BY jk.tanggal_mulai DESC
     LIMIT 1`,
    [...tParams, karyawan.id, dateStr, dateStr]
  );

  if (rows.length) {
    return {
      sumber: 'jadwal_karyawan',
      id: rows[0].id,
      nama: rows[0].nama,
      jam_masuk: rows[0].jam_masuk,
      jam_keluar: rows[0].jam_keluar,
      warna: rows[0].warna,
      hari_kerja: rows[0].hari_kerja || '1,2,3,4,5,6,7',
      tanggal_mulai: rows[0].tanggal_mulai,
      tanggal_selesai: rows[0].tanggal_selesai
    };
  }

  // Step 2: jabatan.shift_id
  if (karyawan.jabatan_id) {
    const [jabShift] = await db.query(
      `SELECT s.id, s.nama, s.jam_masuk, s.jam_keluar, s.warna
       FROM jabatan j
       JOIN shift s ON s.id=j.shift_id
       WHERE j.id=? AND s.tenant_id=?
       LIMIT 1`,
      [karyawan.jabatan_id, tenantId]
    );
    if (jabShift.length) {
      return {
        sumber: 'jabatan',
        id: jabShift[0].id,
        nama: jabShift[0].nama,
        jam_masuk: jabShift[0].jam_masuk,
        jam_keluar: jabShift[0].jam_keluar,
        warna: jabShift[0].warna,
        hari_kerja: '1,2,3,4,5,6', // Sen-Sab default
        tanggal_mulai: null,
        tanggal_selesai: null
      };
    }
  }

  // Step 3: shift_divisi via departemen
  if (karyawan.departemen) {
    const [deptShift] = await db.query(
      `SELECT s.id, s.nama, s.jam_masuk, s.jam_keluar, s.warna
       FROM shift s
       JOIN shift_divisi sd ON sd.shift_id=s.id
       JOIN divisi d ON d.id=sd.divisi_id
       WHERE d.nama=? AND s.tenant_id=?
       LIMIT 1`,
      [karyawan.departemen, tenantId]
    );
    if (deptShift.length) {
      return {
        sumber: 'divisi',
        id: deptShift[0].id,
        nama: deptShift[0].nama,
        jam_masuk: deptShift[0].jam_masuk,
        jam_keluar: deptShift[0].jam_keluar,
        warna: deptShift[0].warna,
        hari_kerja: '1,2,3,4,5,6', // Sen-Sab default
        tanggal_mulai: null,
        tanggal_selesai: null
      };
    }
  }

  return null;
}

/* ──────────────────────────────────────────────
 * Helper: hitung jumlah hari kerja dalam sebulan
 * ────────────────────────────────────────────── */
function countWorkDays(bulan, tahun, hariKerjaStr, tglMulai, tglSelesai) {
  const hariKerja = hariKerjaStr.split(',').map(Number);
  const daysInMonth = new Date(tahun, bulan, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(tahun, bulan - 1, d);
    const dayOfWeek = dateObj.getDay() + 1; // 1=Sun ... 7=Sat (MySQL style)
    if (!hariKerja.includes(dayOfWeek)) continue;
    const dateStr = `${tahun}-${String(bulan).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (tglMulai && dateStr < tglMulai) continue;
    if (tglSelesai && dateStr > tglSelesai) continue;
    count++;
  }
  return count;
}

/* ──────────────────────────────────────────────
 * Helper: cari karyawan_id dari user yang login
 * ────────────────────────────────────────────── */
async function getKaryawanId(user) {
  console.log('🔐 [getKaryawanId] 🔍 Mencari karyawan — user.email:', user.email, '| user.tenant_id:', user.tenant_id, '| user.id:', user.id, '| user.karyawan_id:', user.karyawan_id);

  // 1) Jika user punya karyawan_id langsung, gunakan itu
  if (user.karyawan_id) {
    console.log('🔐 [getKaryawanId] 🔎 Mencoba direct match — karyawan_id:', user.karyawan_id);
    const [direct] = await db.query(
      `SELECT id, tenant_id, nama, nik, departemen, jabatan_id, photo, phone FROM karyawan 
       WHERE id=? AND status='Aktif' LIMIT 1`,
      [user.karyawan_id]
    );
    console.log('🔐 [getKaryawanId] 📊 Direct match — ditemukan:', direct.length, 'data:', JSON.stringify(direct[0] || null));
    if (direct.length) {
      console.log('🔐 [getKaryawanId] ✅ Cocok via karyawan_id! Karyawan:', direct[0].nama, '| tenant_id:', direct[0].tenant_id);
      return direct[0];
    }
    console.log('🔐 [getKaryawanId] ⚠️ Direct match gagal (karyawan mungkin nonaktif), fallback ke email');
  }

  // 2) Coba exact match: email + tenant_id (jika user punya tenant_id)
  if (user.tenant_id) {
    console.log('🔐 [getKaryawanId] 🔎 Mencoba exact match — email:', user.email, '+ tenant_id:', user.tenant_id);
    const [rows] = await db.query(
      `SELECT id, tenant_id, nama, nik, departemen, jabatan_id, photo, phone FROM karyawan 
       WHERE email=? AND status='Aktif' AND tenant_id=? LIMIT 1`,
      [user.email, user.tenant_id]
    );
    console.log('🔐 [getKaryawanId] 📊 Exact match — ditemukan:', rows.length, 'data:', JSON.stringify(rows[0] || null));
    if (rows.length) {
      console.log('🔐 [getKaryawanId] ✅ Cocok dengan tenant_id! Karyawan:', rows[0].nama, '| tenant_id:', rows[0].tenant_id);
      return rows[0];
    }
    console.log('🔐 [getKaryawanId] ⚠️ Exact match gagal, fallback cari tanpa tenant_id');
  }

  // 3) Fallback: cari berdasarkan email saja (tanpa filter tenant_id)
  console.log('🔐 [getKaryawanId] 🔎 Fallback — cari karyawan dengan email:', user.email, '(tanpa filter tenant_id)');
  const [fallback] = await db.query(
    `SELECT id, tenant_id, nama, nik, departemen, jabatan_id, photo, phone FROM karyawan 
     WHERE email=? AND status='Aktif' LIMIT 1`,
    [user.email]
  );
  console.log('🔐 [getKaryawanId] 📊 Fallback — ditemukan:', fallback.length, 'data:', JSON.stringify(fallback[0] || null));
  if (fallback.length) {
    console.log('🔐 [getKaryawanId] ✅ Ditemukan via fallback! Karyawan:', fallback[0].nama, '| tenant_id:', fallback[0].tenant_id);
    return fallback[0];
  }

  console.log('🔐 [getKaryawanId] ❌ GAGAL — Karyawan dengan email', user.email, 'tidak ditemukan sama sekali!');
  return null;
}

/* ──────────────────────────────────────────────
 * Helper: cek apakah user bisa akses fitur mobile
 * ────────────────────────────────────────────── */
async function ensureKaryawan(req, res, next) {
  console.log('🔐 [ensureKaryawan] 🔍 Memeriksa akses karyawan — user id:', req.user.id, '| email:', req.user.email, '| tenant_id:', req.user.tenant_id, '| role:', req.user.role);
  const karyawan = await getKaryawanId(req.user);
  if (!karyawan) {
    console.log('🔐 [ensureKaryawan] ❌ AKSES DITOLAK — req.user:', JSON.stringify({ id: req.user.id, email: req.user.email, tenant_id: req.user.tenant_id, role: req.user.role }));
    return res.status(403).json({
      error: 'Akun ini tidak terhubung ke data karyawan',
      solusi: 'Hubungi admin untuk menghubungkan email ini ke data karyawan'
    });
  }
  // Pastikan tenant_id terisi — priority: karyawan → user → default 1 (Dapur Sukaluyu)
  if (karyawan.tenant_id) {
    console.log('🔐 [ensureKaryawan] 🔄 Sync tenant_id — user.tenant_id:', req.user.tenant_id, '→ karyawan.tenant_id:', karyawan.tenant_id);
    req.user.tenant_id = karyawan.tenant_id;
  } else if (!req.user.tenant_id) {
    console.log('🔐 [ensureKaryawan] 🏢 Default tenant_id ke 1 (Dapur Sukaluyu) — karena karyawan dan user sama-sama NULL');
    req.user.tenant_id = 1;
  }
  req.karyawan = karyawan;
  console.log('🔐 [ensureKaryawan] ✅ Akses diizinkan — karyawan:', karyawan.nama, '| nik:', karyawan.nik, '| dept:', karyawan.departemen, '| tenant_id:', req.user.tenant_id);
  next();
}

/* ──────────────────────────────────────────────
 * GET /api/mobile/absensi/status — Status absensi hari ini
 * Digunakan saat app dibuka untuk cek apakah sudah absen
 * ────────────────────────────────────────────── */
router.get('/absensi/status', ensureKaryawan, async (req, res) => {
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const dayOfWeek = now.getDay() + 1;

    const tw = tenantWhere();
    const { sql: tenantSql, params: tenantParams } = tw(req.user.tenant_id);

    const [rows] = await db.query(
      `SELECT id, tanggal, status, jam_masuk, jam_keluar, keterangan
       FROM absensi 
       WHERE ${tenantSql} AND karyawan_id=? AND tanggal=?
       LIMIT 1`,
      [...tenantParams, req.karyawan.id, today]
    );

    // Cek shift efektif hari ini untuk deteksi bolos & terkunci
    const shift = await getEffectiveShift(req.karyawan, req.user.tenant_id, today, dayOfWeek);
    let terkunci = false;
    let hariLibur = false;

    if (shift && !rows.length) {
      const hariKerja = (shift.hari_kerja || '1,2,3,4,5,6,7').split(',').map(Number);
      if (!hariKerja.includes(dayOfWeek)) {
        terkunci = true;
        hariLibur = true;
      } else {
        const shiftStart = parseTimeToMinutes(shift.jam_masuk);
        const shiftEnd = parseTimeToMinutes(shift.jam_keluar);
        const isCrossDay = shiftEnd <= shiftStart;
        const awalBolehMasuk = (shiftStart - 30 + 1440) % 1440;
        const batasTelat = (shiftStart + 15 + 1440) % 1440;
        const batasBolos = isCrossDay
          ? (shiftStart + 240) % 1440
          : Math.min(shiftEnd, shiftStart + 240);

        if (!isCrossDay) {
          if (currentMinutes >= batasBolos) {
            terkunci = true;
          }
        } else {
          if ((currentMinutes >= batasBolos || currentMinutes < shiftEnd) && currentMinutes < awalBolehMasuk) {
            terkunci = true;
          }
        }
      }
    } else if (!rows.length) {
      // Tidak ada shift — kunci clock-in
      terkunci = true;
    }

    if (!rows.length) {
      // Deteksi bolos: 4 jam setelah shift start (atau shift end, mana yg lebih dulu)
      let bolos = false;
      let peringatan_terlambat = false;
      if (shift) {
        const sStart = parseTimeToMinutes(shift.jam_masuk);
        const sEnd = parseTimeToMinutes(shift.jam_keluar);
        const isCross = sEnd <= sStart;
        const awalBolehMasuk = (sStart - 30 + 1440) % 1440;
        const batasTelat = (sStart + 15 + 1440) % 1440;
        const batasBolos = isCross
          ? (sStart + 240) % 1440
          : Math.min(sEnd, sStart + 240);
        if (!isCross) {
          if (currentMinutes >= batasBolos) {
            bolos = true;
          } else if (currentMinutes > batasTelat) {
            peringatan_terlambat = true;
          }
        } else {
          if ((currentMinutes >= batasBolos || currentMinutes < sEnd) && currentMinutes < awalBolehMasuk) {
            bolos = true;
          } else if (currentMinutes >= awalBolehMasuk && currentMinutes > batasTelat) {
            peringatan_terlambat = true;
          }
        }
      }

      let pesan = 'Belum absen hari ini';
      if (hariLibur) {
        pesan = 'Hari ini libur';
      } else if (bolos) {
        pesan = 'Anda bolos hari ini';
      } else if (terkunci && !bolos) {
        pesan = 'Tidak ada jadwal shift hari ini';
      } else if (peringatan_terlambat) {
        pesan = 'Anda terlambat! Silakan clock-in';
      }

      return res.json({
        sudah_absensi: false,
        sudah_masuk: false,
        sudah_keluar: false,
        data: null,
        bolos,
        peringatan_terlambat,
        pesan_bolos: bolos ? 'Anda tidak melakukan clock-in hari ini' : '',
        terkunci,
        shift_hari_ini: shift ? {
          nama: shift.nama,
          jam_masuk: shift.jam_masuk?.slice(0,5),
          jam_keluar: shift.jam_keluar?.slice(0,5)
        } : null,
        hari_libur: hariLibur,
        pesan
      });
    }

    const a = rows[0];
    const butuhKoreksi = a.status === 'Butuh Koreksi' || (a.keterangan && a.keterangan.includes('Butuh Koreksi'));

    // Cek apakah sudah boleh clock-out
    let terkunciKeluar = false;
    let pesanDeadline = '';
    let pesanEarly = '';
    if (shift && a.jam_masuk && !a.jam_keluar) {
      const hariKerja = (shift.hari_kerja || '1,2,3,4,5,6,7').split(',').map(Number);
      if (!hariKerja.includes(dayOfWeek)) {
        // Hari ini libur — tidak perlu clock-out
        terkunciKeluar = true;
        pesanDeadline = 'Hari ini libur, tidak perlu clock-out';
      } else {
        const sStart = parseTimeToMinutes(shift.jam_masuk);
        const sEnd = parseTimeToMinutes(shift.jam_keluar);
        const isCrossDay = sEnd <= sStart;

        if (!isCrossDay) {
          // Shift normal (misal 08:00-16:00)
          if (currentMinutes < sEnd) {
            // Belum waktunya clock-out — shift belum selesai
            terkunciKeluar = true;
            pesanEarly = 'Belum waktunya clock-out. Shift Anda selesai pukul ' + (shift.jam_keluar?.slice(0,5) || '--:--') + '.';
          } else if (currentMinutes >= (sStart + 1440 - 30)) {
            // Deadline: 30 menit SEBELUM shift berikutnya dimulai (shift berikut = sStart besok)
            // (sStart + 1440 - 30) selalu > 1440, jadi dalam hari yang sama tidak akan terpenuhi
            // Artinya: setelah shift selesai, clock-out selalu bisa dilakukan hari ini
            terkunciKeluar = true;
            pesanDeadline = 'Batas waktu clock-out sudah lewat (shift sudah berganti). Hubungi admin untuk koreksi.';
          }
        } else {
          // Shift lintas hari (misal 19:00-03:00)
          if (currentMinutes >= sStart || currentMinutes < sEnd) {
            // Masih dalam jam shift
            terkunciKeluar = true;
            const jamSelesai = shift.jam_keluar?.slice(0,5) || '--:--';
            if (currentMinutes >= sStart && currentMinutes < 1440) {
              pesanEarly = 'Belum waktunya clock-out. Shift Anda selesai pukul ' + jamSelesai + ' besok.';
            } else {
              pesanEarly = 'Belum waktunya clock-out. Shift Anda selesai pukul ' + jamSelesai + '.';
            }
          } else if (currentMinutes >= (sStart - 30 + 1440) % 1440) {
            // Deadline: 30 menit SEBELUM shift berikutnya dimulai
            terkunciKeluar = true;
            pesanDeadline = 'Batas waktu clock-out sudah lewat (shift sudah berganti). Hubungi admin untuk koreksi.';
          }
        }
      }
    }

    res.json({
      sudah_absensi: true,
      sudah_masuk: !!a.jam_masuk,
      sudah_keluar: !!a.jam_keluar,
      peringatan_bolos: false,
      terkunci: terkunciKeluar,
      butuh_koreksi: butuhKoreksi,
      deadline_lewat: !!pesanDeadline,
      pesan_deadline: pesanDeadline,
      pesan_early: pesanEarly,
      data: {
        id: a.id,
        tanggal: a.tanggal,
        status: a.status,
        jam_masuk: a.jam_masuk,
        jam_keluar: a.jam_keluar,
        keterangan: a.keterangan
      },
      shift_hari_ini: shift ? {
        nama: shift.nama,
        jam_masuk: shift.jam_masuk?.slice(0,5),
        jam_keluar: shift.jam_keluar?.slice(0,5)
      } : null,
      pesan: a.jam_masuk && a.jam_keluar
        ? (butuhKoreksi ? 'Clock-out selesai — perlu koreksi admin' : 'Absensi hari ini sudah lengkap')
        : a.jam_masuk
          ? (terkunciKeluar ? pesanDeadline : 'Sudah clock-in, silakan clock-out')
          : 'Belum absen hari ini'
    });
  } catch (err) {
    console.error('🔐 [Status] 💥 ERROR —', err.message);
    res.status(500).json({ error: 'Gagal memuat status absensi' });
  }
});

// Helper: parse jam ke menit (local, untuk dipakai di status)
function parseTimeToMinutes(t) {
  if (!t) return 0;
  const p = t.split(':');
  return parseInt(p[0]) * 60 + parseInt(p[1]);
}

// Helper: verifikasi selisih waktu client vs server (cegah spoofing jam HP)
function verifyClientTime(clientTimeStr, maxDiffMinutes = 5) {
  if (!clientTimeStr) return { ok: false, pesan: 'Waktu perangkat tidak dikirim' };
  const clientTime = new Date(clientTimeStr);
  if (isNaN(clientTime.getTime())) return { ok: false, pesan: 'Format waktu perangkat tidak valid' };
  const serverTime = new Date();
  const diffMs = Math.abs(serverTime.getTime() - clientTime.getTime());
  const diffMinutes = diffMs / 60000;
  if (diffMinutes > maxDiffMinutes) {
    return { ok: false, pesan: `Waktu perangkat Anda berbeda ${Math.round(diffMinutes)} menit dari server. Setel jam HP ke otomatis lalu coba lagi.` };
  }
  return { ok: true };
}

/* ──────────────────────────────────────────────
 * POST /api/mobile/absensi/clock-in — Absen masuk
 * Body:
 *   client_time (string ISO) — waktu dari perangkat
 *   latitude? (number), longitude? (number)
 *   foto? (base64 string) — foto selfie waktu masuk
 *   keterangan? (string)
 * ────────────────────────────────────────────── */
router.post('/absensi/clock-in', ensureKaryawan, async (req, res) => {
  try {
    // Verifikasi selisih waktu client vs server
    const { client_time } = req.body;
    const timeCheck = verifyClientTime(client_time);
    if (!timeCheck.ok) {
      return res.status(403).json({ error: timeCheck.pesan });
    }

    const { keterangan } = req.body;
    const tenant_id = req.user.tenant_id;
    const karyawan_id = req.karyawan.id;
    const today = new Date().toISOString().slice(0, 10);
    const nowTime = new Date().toTimeString().slice(0, 8); // HH:mm:ss
    const tw = tenantWhere();

    // Cek apakah sudah absen hari ini
    const { sql: tSql, params: tParams } = tw(tenant_id);
    const [existing] = await db.query(
      `SELECT id, jam_masuk FROM absensi WHERE ${tSql} AND karyawan_id=? AND tanggal=?`,
      [...tParams, karyawan_id, today]
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
        `UPDATE absensi SET jam_masuk=?, keterangan=?
         WHERE id=? AND ${tSql}`,
        [nowTime, keterangan || null, existing[0].id, ...tParams]
      );
      const [updated] = await db.query(
        `SELECT id, tanggal, status, jam_masuk, jam_keluar, keterangan
         FROM absensi WHERE id=?`,
        [existing[0].id]
      );
      return res.json({
        ok: true,
        pesan: 'Clock-in berhasil',
        data: updated[0]
      });
    }

    // Cek apakah shift sudah lewat (terkunci) atau hari libur
    const nowTimeCheck = new Date();
    const todayCheck = nowTimeCheck.toISOString().slice(0, 10);
    const dayOfWeekCheck = nowTimeCheck.getDay() + 1;
    const shiftCheck = await getEffectiveShift(req.karyawan, req.user.tenant_id, todayCheck, dayOfWeekCheck);
    let bolehMasuk = false;
    let terlambat = false;

    if (shiftCheck && !existing.length) {
      const hariKerjaCheck = (shiftCheck.hari_kerja || '1,2,3,4,5,6,7').split(',').map(Number);
      
      // Cek dulu apakah hari ini libur
      if (!hariKerjaCheck.includes(dayOfWeekCheck)) {
        return res.status(403).json({
          error: 'Hari ini libur. Tidak perlu absen.',
          solusi: 'Nikmati hari libur Anda!'
        });
      }
      
      // Baru cek timing clock-in
      const sStart = parseTimeToMinutes(shiftCheck.jam_masuk);
      const sEnd = parseTimeToMinutes(shiftCheck.jam_keluar);
      const nowMinCheck = nowTimeCheck.getHours() * 60 + nowTimeCheck.getMinutes();
      const isCrossDay = sEnd <= sStart;
      const batasTelat = (sStart + 15 + 1440) % 1440;       // 15 menit toleransi
      const batasBolos = isCrossDay
        ? (sStart + 240) % 1440
        : Math.min(sEnd, sStart + 240);
      
      if (!isCrossDay) {
        if (nowMinCheck < batasBolos) {
          bolehMasuk = true;
          if (nowMinCheck > batasTelat) {
            terlambat = true;
          }
        }
      } else {
        if (nowMinCheck >= sStart && nowMinCheck < batasBolos) {
          bolehMasuk = true;
          if (nowMinCheck > batasTelat) {
            terlambat = true;
          }
        }
      }
      
      if (!bolehMasuk) {
        return res.status(403).json({
          error: 'Waktu clock-in sudah lewat (sudah melebihi 4 jam dari jam shift).',
          solusi: 'Anda akan dicatat sebagai BOLOS. Hubungi admin jika ini adalah kesalahan.'
        });
      }
    }

    // Tentukan status: Terlambat jika clock-in setelah toleransi 15 menit
    const status = terlambat ? 'Terlambat' : 'Hadir';

    const [r] = await db.query(
      `INSERT INTO absensi (tenant_id, karyawan_id, tanggal, status, jam_masuk, keterangan)
       VALUES (?,?,?,?,?,?)`,
      [tenant_id, karyawan_id, today, status, nowTime, keterangan || null]
    );

    const [rows] = await db.query(
      `SELECT id, tanggal, status, jam_masuk, jam_keluar, keterangan
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
    // Verifikasi selisih waktu client vs server
    const { client_time } = req.body;
    const timeCheck = verifyClientTime(client_time);
    if (!timeCheck.ok) {
      return res.status(403).json({ error: timeCheck.pesan });
    }

    const { keterangan } = req.body;
    const tenant_id = req.user.tenant_id;
    const karyawan_id = req.karyawan.id;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const nowTime = now.toTimeString().slice(0, 8);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const tw = tenantWhere();

    // Cari record absensi PALING AKHIR yang belum clock-out
    // Cari dari kemarin dan hari ini (untuk mengakomodasi lintas hari)
    const { sql: tSql, params: tParams } = tw(tenant_id);
    const kemarin = new Date(now);
    kemarin.setDate(kemarin.getDate() - 1);
    const kemarinStr = kemarin.toISOString().slice(0, 10);

    const [existing] = await db.query(
      `SELECT id, tanggal, jam_masuk, jam_keluar FROM absensi 
       WHERE ${tSql} AND karyawan_id=? AND tanggal IN (?, ?) AND jam_masuk IS NOT NULL
       ORDER BY tanggal DESC
       LIMIT 1`,
      [...tParams, karyawan_id, kemarinStr, today]
    );

    if (!existing.length) {
      return res.status(400).json({
        error: 'Tidak ada sesi absen yang belum clock-out. Silakan clock-in terlebih dahulu.'
      });
    }

    if (existing[0].jam_keluar) {
      return res.status(400).json({
        error: 'Anda sudah melakukan clock-out',
        data: { id: existing[0].id, jam_keluar: existing[0].jam_keluar }
      });
    }

    const tanggalAbsen = existing[0].tanggal;
    const dayOfWeek = new Date(tanggalAbsen + 'T00:00:00').getDay() + 1;
    const shift = await getEffectiveShift(req.karyawan, req.user.tenant_id, tanggalAbsen, dayOfWeek);

    if (shift) {
      const hariKerja = (shift.hari_kerja || '1,2,3,4,5,6,7').split(',').map(Number);
      if (hariKerja.includes(dayOfWeek)) {
        const sStart = parseTimeToMinutes(shift.jam_masuk);
        const sEnd = parseTimeToMinutes(shift.jam_keluar);
        const isCrossDay = sEnd <= sStart;

        // Tentukan apakah sudah boleh clock-out (setelah shift end)
        let bolehKeluar = false;
        if (!isCrossDay) {
          if (nowMinutes >= sEnd) bolehKeluar = true;
        } else {
          if (nowMinutes >= sStart || nowMinutes < sEnd) {
            bolehKeluar = false; // masih dalam shift
          } else {
            bolehKeluar = true;
          }
        }

        if (!bolehKeluar) {
          const jamSelesai = shift.jam_keluar.slice(0,5);
          return res.status(403).json({
            error: 'Anda belum bisa clock-out. Shift Anda selesai pukul ' + jamSelesai + '.',
            solusi: 'Silakan clock-out setelah jam shift selesai.'
          });
        }

        // Cek deadline: clock-out bisa dilakukan sampai 30 menit SEBELUM shift berikutnya
        // Untuk shift normal: shift berikutnya = besok jam sStart
        // Untuk cross-day: shift berikutnya = hari ini jam sStart
        let lewatDeadline = false;

        if (tanggalAbsen === today) {
          // Hari yang sama: deadline = 30 menit SEBELUM shift berikutnya (besok jam sStart)
          // (sStart + 1440 - 30) selalu > 1440, tidak akan terpenuhi di hari yang sama
          // Artinya: setelah shift selesai, clock-out selalu bisa dilakukan hari ini
          if (nowMinutes >= (sStart + 1440 - 30)) {
            lewatDeadline = true;
          }
        } else {
          // Hari berikutnya: deadline = 30 menit sebelum shift berikutnya
          const deadlineNext = (sStart - 30 + 1440) % 1440;
          if (nowMinutes >= deadlineNext) {
            lewatDeadline = true;
          }
        }

        if (lewatDeadline) {
          return res.status(403).json({
            error: 'Batas waktu clock-out sudah lewat (shift sudah berganti).',
            solusi: 'Hubungi admin untuk koreksi absensi.'
          });
        }

        // Tandai "butuh koreksi" jika clock-out lebih dari 1 jam setelah shift selesai
        const batasNormal = sEnd + 60;
        let butuhKoreksi = false;
        if (!isCrossDay) {
          if (tanggalAbsen < today || nowMinutes > batasNormal) butuhKoreksi = true;
        } else {
          if (nowMinutes > 720) butuhKoreksi = true; // lewat jam 12:00 siang
        }

        const catatan = butuhKoreksi
          ? (keterangan ? keterangan + ' | Butuh Koreksi' : 'Butuh Koreksi')
          : (keterangan || null);

        await db.query(
          `UPDATE absensi SET jam_keluar=?, keterangan=?, status=?
           WHERE id=? AND ${tSql}`,
          [nowTime, catatan, butuhKoreksi ? 'Butuh Koreksi' : 'Hadir', existing[0].id, ...tParams]
        );

        const [updated] = await db.query(
          `SELECT id, tanggal, status, jam_masuk, jam_keluar, keterangan
           FROM absensi WHERE id=?`,
          [existing[0].id]
        );

        return res.json({
          ok: true,
          pesan: butuhKoreksi ? 'Clock-out berhasil (Butuh Koreksi)' : 'Clock-out berhasil',
          butuh_koreksi: butuhKoreksi,
          data: updated[0]
        });
      }
    }

    // Fallback: tidak ada shift — langsung clock-out tanpa validasi
    await db.query(
      `UPDATE absensi SET jam_keluar=?, keterangan=?
       WHERE id=? AND ${tSql}`,
      [nowTime, keterangan || null, existing[0].id, ...tParams]
    );

    const [updated] = await db.query(
      `SELECT id, tanggal, status, jam_masuk, jam_keluar, keterangan
       FROM absensi WHERE id=?`,
      [existing[0].id]
    );

    res.json({
      ok: true,
      pesan: 'Clock-out berhasil',
      butuh_koreksi: false,
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
    const twA = tenantWhere('a');
    const twJk = tenantWhere('jk');
    const { sql: tSql, params: tParams } = twA(req.user.tenant_id);
    const { sql: jkSql, params: jkParams } = twJk(req.user.tenant_id);

    let where = `WHERE ${tSql} AND a.karyawan_id=?`;
    const params = [...tParams, req.karyawan.id];

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
      `SELECT a.id, a.tanggal, a.status, a.jam_masuk, a.jam_keluar, a.keterangan,
              s.nama as shift_nama, s.jam_masuk as shift_masuk, s.jam_keluar as shift_keluar
       FROM absensi a
       LEFT JOIN jadwal_karyawan jk ON jk.karyawan_id=a.karyawan_id 
         AND ${jkSql}
         AND a.tanggal BETWEEN jk.tanggal_mulai AND COALESCE(jk.tanggal_selesai, a.tanggal)
       LEFT JOIN shift s ON s.id=jk.shift_id
       ${where}
       ORDER BY a.tanggal DESC, a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...jkParams, ...params, limitNum, offset]
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
    const tw = tenantWhere();
    const { sql: tSql, params: tParams } = tw(req.user.tenant_id);

    // Statistik dari absensi yang tercatat
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
         0 AS pakai_gps
       FROM absensi 
       WHERE ${tSql} AND karyawan_id=? AND MONTH(tanggal)=? AND YEAR(tanggal)=?`,
      [...tParams, req.karyawan.id, bulan, tahun]
    );

    // Data chart harian untuk seluruh bulan
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

    // Hitung jam kerja rata-rata
    const [[avgJam]] = await db.query(
      `SELECT COALESCE(
         ROUND(AVG(TIMESTAMPDIFF(MINUTE, jam_masuk, jam_keluar) / 60), 1), 0
       ) AS rata_rata_jam
       FROM absensi 
       WHERE ${tSql} AND karyawan_id=? AND MONTH(tanggal)=? AND YEAR(tanggal)=?
         AND jam_masuk IS NOT NULL AND jam_keluar IS NOT NULL`,
      [...tParams, req.karyawan.id, bulan, tahun]
    );

    // Hitung hari kerja seharusnya (expected) dan bolos
    let expected_hari = 0;
    let bolos = 0;

    // Ambil tanggal_masuk karyawan
    const [[karyawanRow]] = await db.query(
      'SELECT tanggal_masuk FROM karyawan WHERE id=?', [req.karyawan.id]
    );
    const tglMasuk = karyawanRow?.tanggal_masuk || null;

    // Cari shift efektif — coba beberapa sampel tanggal (1, 15, akhir bulan)
    // supaya tidak terlewat kalau jadwal mulai/selesai di luar tanggal 15
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
      const hariIni = now.toISOString().slice(0, 10);

      // Tentukan tanggal mulai efektif:
      // 1) Pakai tanggal_masuk jika ada
      // 2) Jika null, cek apakah pernah absen sebelumnya (berarti karyawan sudah aktif)
      // 3) Jika tidak pernah absen sama sekali → skip (mungkin baru)
      let tglMulaiEfektif = null;

      if (tglMasuk) {
        tglMulaiEfektif = tglMasuk > awalBulan ? tglMasuk : awalBulan;
      } else {
        const [[{ pernahAbsen }]] = await db.query(
          'SELECT COUNT(*) AS pernahAbsen FROM absensi WHERE karyawan_id=?',
          [req.karyawan.id]
        );
        if (pernahAbsen > 0) {
          // Karyawan sudah pernah absen — hitung dari awal bulan
          tglMulaiEfektif = awalBulan;
        }
        // else: tidak pernah absen, skip bolos
      }

      if (tglMulaiEfektif) {
        // Hanya hitung bolos jika ada data absensi di bulan ini
        // Jika total_hari = 0, skip kalkulasi bolos (karyawan mungkin baru)
        if (Number(stats?.total_hari || 0) > 0) {
          // Batasi akhir hitungan: min(shift.tanggal_selesai, hari ini)
          const tglSelesai = shift.tanggal_selesai && shift.tanggal_selesai < hariIni
            ? shift.tanggal_selesai : hariIni;

          expected_hari = countWorkDays(
            bulan, tahun,
            shift.hari_kerja || '1,2,3,4,5,6',
            tglMulaiEfektif,
            tglSelesai
          );
          const realHadir = Number(stats?.hadir || 0) + Number(stats?.sakit || 0)
            + Number(stats?.izin || 0) + Number(stats?.cuti || 0);
          bolos = Math.max(0, expected_hari - realHadir);
        }
        // Jika total_hari = 0, expected_hari & bolos tetap 0
        // sehingga statistik tidak menampilkan Alpha/bolos palsu
      }
    }

    // Gabungkan alpha dari DB dengan bolos kalkulasi
    const alphaDb = Number(stats?.alpha || 0);
    const alphaFinal = Math.max(alphaDb, bolos);

    res.json({
      periode: `${bulan}/${tahun}`,
      bulan,
      tahun,
      statistik: {
        total_hari: Number(stats?.total_hari || 0),
        expected_hari,
        hadir: Number(stats?.hadir || 0),
        sakit: Number(stats?.sakit || 0),
        izin: Number(stats?.izin || 0),
        cuti: Number(stats?.cuti || 0),
        alpha: alphaFinal,
        bolos,
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
    const dayOfWeek = new Date().getDay() + 1;

    const shift = await getEffectiveShift(req.karyawan, req.user.tenant_id, today, dayOfWeek);

    if (!shift) {
      return res.json({
        ada_shift: false,
        pesan: 'Tidak ada shift untuk hari ini',
        data: null
      });
    }

    const hariKerja = (shift.hari_kerja || '1,2,3,4,5,6,7').split(',').map(Number);
    const isTodayWorkDay = hariKerja.includes(dayOfWeek);

    return res.json({
      ada_shift: true,
      hari_kerja_hari_ini: isTodayWorkDay,
      data: {
        id: shift.id,
        nama: shift.nama,
        jam_masuk: shift.jam_masuk,
        jam_keluar: shift.jam_keluar,
        warna: shift.warna,
        tanggal_mulai: shift.tanggal_mulai,
        tanggal_selesai: shift.tanggal_selesai,
        sumber: shift.sumber
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
    const tw = tenantWhere('k');
    const { sql: tenantSql, params: tenantParams } = tw(req.user.tenant_id);
    console.log('🔐 [Profile] 📋 Mengambil profil karyawan — id:', req.karyawan.id, '| tenant_sql:', tenantSql, '| params:', tenantParams);

    const [rows] = await db.query(
      `SELECT k.id, k.nama, k.nik, k.departemen, k.email, k.phone, k.photo, k.status,
              k.tanggal_masuk, k.address, j.name as jabatan
       FROM karyawan k
       LEFT JOIN jabatan j ON j.id=k.jabatan_id
       WHERE k.id=? AND ${tenantSql}`,
      [req.karyawan.id, ...tenantParams]
    );

    console.log('🔐 [Profile] 📊 Hasil query profil — ditemukan:', rows.length, 'data:', JSON.stringify(rows[0] || null));

    if (!rows.length) {
      console.log('🔐 [Profile] ❌ GAGAL — Karyawan ID:', req.karyawan.id, 'tidak ditemukan');
      return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    }

    console.log('🔐 [Profile] ✅ Profil berhasil di-load —', rows[0].nama, '|', rows[0].jabatan, '|', rows[0].departemen);

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
    console.error('🔐 [Profile] 💥 ERROR —', err.message);
    res.status(500).json({ error: 'Gagal memuat profil' });
  }
});

/* ──────────────────────────────────────────────
 * POST /api/mobile/ijin-cuti — Self-service ijin/cuti
 * Karyawan mengajukan ijin/cuti untuk dirinya sendiri
 * Body: { jenis, tanggal_mulai, tanggal_selesai?, alasan?, dokumen? }
 * ────────────────────────────────────────────── */
router.post('/ijin-cuti', ensureKaryawan, async (req, res) => {
  try {
    const { jenis, tanggal_mulai, tanggal_selesai, alasan, dokumen } = req.body;
    if (!jenis) return res.status(400).json({ error: 'Jenis wajib dipilih' });
    if (!tanggal_mulai) return res.status(400).json({ error: 'Tanggal mulai wajib diisi' });

    const [r] = await db.query(
      `INSERT INTO ijin_cuti (tenant_id, karyawan_id, jenis, tanggal_mulai, tanggal_selesai, alasan, dokumen, status) 
       VALUES (?,?,?,?,?,?,?,'Menunggu')`,
      [req.user.tenant_id, req.karyawan.id, jenis, tanggal_mulai, tanggal_selesai || null, alasan || null, dokumen || null]
    );

    res.json({
      ok: true,
      pesan: 'Pengajuan ijin/cuti berhasil dikirim',
      id: r.insertId
    });
  } catch (err) {
    console.error('Mobile ijin-cuti error:', err);
    res.status(500).json({ error: 'Gagal mengajukan: ' + err.message });
  }
});

module.exports = router;
