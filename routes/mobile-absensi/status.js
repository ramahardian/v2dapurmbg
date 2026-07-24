/**
 * STATUS — Mobile Absensi
 * GET /absensi/status
 * Endpoint paling kompleks: mengecek status absensi hari ini,
 * mendeteksi bolos, shift, deadline clock-out, dan hari libur.
 */
const db = require('../../db');
const { localDateStr, tenantWhere, parseTimeToMinutes, getEffectiveShift } = require('./helpers');

function registerStatusRoutes(router) {
  router.get('/absensi/status', async (req, res) => {
    try {
      const now = new Date();
      const today = localDateStr(now);
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

      // Cek shift efektif
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

          if (!isCrossDay) {
            if (currentMinutes >= shiftEnd) terkunci = true;
          } else {
            if (currentMinutes < awalBolehMasuk && currentMinutes >= shiftEnd) terkunci = true;
          }
        }
      } else if (!rows.length) {
        terkunci = true;
      }

      if (!rows.length) {
        let bolos = false;
        let peringatan_terlambat = false;
        if (shift) {
          const sStart = parseTimeToMinutes(shift.jam_masuk);
          const sEnd = parseTimeToMinutes(shift.jam_keluar);
          const isCross = sEnd <= sStart;
          const awalBolehMasuk = (sStart - 30 + 1440) % 1440;
          const batasTelat = (sStart + 15 + 1440) % 1440;
          if (!isCross) {
            if (currentMinutes >= sEnd) bolos = true;
            else if (currentMinutes > batasTelat) peringatan_terlambat = true;
          } else {
            if (currentMinutes < awalBolehMasuk && currentMinutes >= sEnd) bolos = true;
            else if (currentMinutes >= awalBolehMasuk && currentMinutes > batasTelat) peringatan_terlambat = true;
          }
        }

        let pesan = 'Belum absen hari ini';
        if (hariLibur) pesan = 'Hari ini libur';
        else if (bolos) pesan = 'Anda bolos hari ini';
        else if (terkunci && !bolos) pesan = 'Tidak ada jadwal shift hari ini';
        else if (peringatan_terlambat) pesan = 'Anda terlambat! Silakan clock-in';

        return res.json({
          sudah_absensi: false, sudah_masuk: false, sudah_keluar: false, data: null,
          bolos, peringatan_terlambat,
          pesan_bolos: bolos ? 'Anda tidak melakukan clock-in hari ini' : '',
          terkunci,
          shift_hari_ini: shift ? { nama: shift.nama, jam_masuk: shift.jam_masuk?.slice(0,5), jam_keluar: shift.jam_keluar?.slice(0,5) } : null,
          hari_libur: hariLibur, pesan,
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
          terkunciKeluar = true;
          pesanDeadline = 'Hari ini libur, tidak perlu clock-out';
        } else {
          const sStart = parseTimeToMinutes(shift.jam_masuk);
          const sEnd = parseTimeToMinutes(shift.jam_keluar);
          const isCrossDay = sEnd <= sStart;

          if (!isCrossDay) {
            if (currentMinutes < sEnd) {
              terkunciKeluar = true;
              pesanEarly = 'Belum waktunya clock-out. Shift Anda selesai pukul ' + (shift.jam_keluar?.slice(0,5) || '--:--') + '.';
            } else if (currentMinutes >= (sStart + 1440 - 30)) {
              terkunciKeluar = true;
              pesanDeadline = 'Batas waktu clock-out sudah lewat (shift sudah berganti). Hubungi admin untuk koreksi.';
            }
          } else {
            if (currentMinutes >= sStart || currentMinutes < sEnd) {
              terkunciKeluar = true;
              const jamSelesai = shift.jam_keluar?.slice(0,5) || '--:--';
              pesanEarly = currentMinutes >= sStart
                ? 'Belum waktunya clock-out. Shift Anda selesai pukul ' + jamSelesai + ' besok.'
                : 'Belum waktunya clock-out. Shift Anda selesai pukul ' + jamSelesai + '.';
            } else if (currentMinutes >= (sStart - 30 + 1440) % 1440) {
              terkunciKeluar = true;
              pesanDeadline = 'Batas waktu clock-out sudah lewat (shift sudah berganti). Hubungi admin untuk koreksi.';
            }
          }
        }
      }

      res.json({
        sudah_absensi: true, sudah_masuk: !!a.jam_masuk, sudah_keluar: !!a.jam_keluar,
        peringatan_bolos: false, terkunci: terkunciKeluar, butuh_koreksi: butuhKoreksi,
        deadline_lewat: !!pesanDeadline, pesan_deadline: pesanDeadline, pesan_early: pesanEarly,
        data: { id: a.id, tanggal: a.tanggal, status: a.status, jam_masuk: a.jam_masuk, jam_keluar: a.jam_keluar, keterangan: a.keterangan },
        shift_hari_ini: shift ? { nama: shift.nama, jam_masuk: shift.jam_masuk?.slice(0,5), jam_keluar: shift.jam_keluar?.slice(0,5) } : null,
        pesan: a.jam_masuk && a.jam_keluar
          ? (butuhKoreksi ? 'Clock-out selesai — perlu koreksi admin' : 'Absensi hari ini sudah lengkap')
          : a.jam_masuk
            ? (terkunciKeluar ? pesanDeadline : 'Sudah clock-in, silakan clock-out')
            : 'Belum absen hari ini',
      });
    } catch (err) {
      console.error('Mobile status error:', err.message);
      res.status(500).json({ error: 'Gagal memuat status absensi' });
    }
  });
}

module.exports = { registerStatusRoutes };
