/**
 * HELPERS — Mobile Absensi
 * Shared utility functions yang digunakan di seluruh endpoint mobile absensi.
 */
const db = require('../../db');

/* ─── Tanggal ──────────────────────────────── */
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ─── Tenant WHERE builder ─────────────────── */
function tenantWhere(alias = '') {
  const prefix = alias ? `${alias}.` : '';
  return (tid) => {
    if (tid != null) {
      return { sql: `${prefix}tenant_id=?`, params: [tid] };
    }
    return { sql: `${prefix}tenant_id IS NULL`, params: [] };
  };
}

/* ─── Time parser ──────────────────────────── */
function parseTimeToMinutes(t) {
  if (!t) return 0;
  const p = t.split(':');
  return parseInt(p[0]) * 60 + parseInt(p[1]);
}

/* ─── Verifikasi waktu client ──────────────── */
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

/* ─── Cari shift efektif ───────────────────── */
async function getEffectiveShift(karyawan, tenantId, dateStr, dayOfWeek) {
  const tw = tenantWhere('jk');
  const { sql: tSql, params: tParams } = tw(tenantId);

  // Step 1: jadwal_karyawan (per individu)
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
      sumber: 'jadwal_karyawan', id: rows[0].id, nama: rows[0].nama,
      jam_masuk: rows[0].jam_masuk, jam_keluar: rows[0].jam_keluar, warna: rows[0].warna,
      hari_kerja: rows[0].hari_kerja || '1,2,3,4,5,6,7',
      tanggal_mulai: rows[0].tanggal_mulai, tanggal_selesai: rows[0].tanggal_selesai,
    };
  }

  // Step 2: jabatan.shift_id
  if (karyawan.jabatan_id) {
    const [jabShift] = await db.query(
      `SELECT s.id, s.nama, s.jam_masuk, s.jam_keluar, s.warna
       FROM jabatan j JOIN shift s ON s.id=j.shift_id
       WHERE j.id=? AND s.tenant_id=? LIMIT 1`,
      [karyawan.jabatan_id, tenantId]
    );
    if (jabShift.length) {
      return {
        sumber: 'jabatan', id: jabShift[0].id, nama: jabShift[0].nama,
        jam_masuk: jabShift[0].jam_masuk, jam_keluar: jabShift[0].jam_keluar, warna: jabShift[0].warna,
        hari_kerja: '1,2,3,4,5,6', tanggal_mulai: null, tanggal_selesai: null,
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
       WHERE d.nama=? AND s.tenant_id=? LIMIT 1`,
      [karyawan.departemen, tenantId]
    );
    if (deptShift.length) {
      return {
        sumber: 'divisi', id: deptShift[0].id, nama: deptShift[0].nama,
        jam_masuk: deptShift[0].jam_masuk, jam_keluar: deptShift[0].jam_keluar, warna: deptShift[0].warna,
        hari_kerja: '1,2,3,4,5,6', tanggal_mulai: null, tanggal_selesai: null,
      };
    }
  }

  return null;
}

/* ─── Hitung hari kerja ────────────────────── */
function countWorkDays(bulan, tahun, hariKerjaStr, tglMulai, tglSelesai) {
  const hariKerja = hariKerjaStr.split(',').map(Number);
  const daysInMonth = new Date(tahun, bulan, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(tahun, bulan - 1, d);
    const dayOfWeek = dateObj.getDay() + 1;
    if (!hariKerja.includes(dayOfWeek)) continue;
    const dateStr = `${tahun}-${String(bulan).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (tglMulai && dateStr < tglMulai) continue;
    if (tglSelesai && dateStr > tglSelesai) continue;
    count++;
  }
  return count;
}

/* ─── Cari karyawan_id dari user ───────────── */
async function getKaryawanId(user) {
  // 1) Jika user punya karyawan_id langsung
  if (user.karyawan_id) {
    const [direct] = await db.query(
      `SELECT id, tenant_id, nama, nik, departemen, jabatan_id, photo, phone FROM karyawan
       WHERE id=? AND status='Aktif' LIMIT 1`,
      [user.karyawan_id]
    );
    if (direct.length) return direct[0];
  }

  // 2) Exact match: email + tenant_id
  if (user.tenant_id) {
    const [rows] = await db.query(
      `SELECT id, tenant_id, nama, nik, departemen, jabatan_id, photo, phone FROM karyawan
       WHERE email=? AND status='Aktif' AND tenant_id=? LIMIT 1`,
      [user.email, user.tenant_id]
    );
    if (rows.length) return rows[0];
  }

  // 3) Fallback: email saja
  const [fallback] = await db.query(
    `SELECT id, tenant_id, nama, nik, departemen, jabatan_id, photo, phone FROM karyawan
     WHERE email=? AND status='Aktif' LIMIT 1`,
    [user.email]
  );
  return fallback.length ? fallback[0] : null;
}

/* ─── Middleware: ensure karyawan ───────────── */
async function ensureKaryawan(req, res, next) {
  const karyawan = await getKaryawanId(req.user);
  if (!karyawan) {
    return res.status(403).json({
      error: 'Akun ini tidak terhubung ke data karyawan',
      solusi: 'Hubungi admin untuk menghubungkan email ini ke data karyawan',
    });
  }
  // Pastikan tenant_id terisi
  if (karyawan.tenant_id) {
    req.user.tenant_id = karyawan.tenant_id;
  } else if (!req.user.tenant_id) {
    req.user.tenant_id = 1;
  }
  req.karyawan = karyawan;
  next();
}

module.exports = {
  localDateStr,
  tenantWhere,
  parseTimeToMinutes,
  verifyClientTime,
  getEffectiveShift,
  countWorkDays,
  getKaryawanId,
  ensureKaryawan,
};
