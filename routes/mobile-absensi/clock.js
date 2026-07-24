/**
 * CLOCK — Mobile Absensi
 * POST /absensi/clock-in — Absen masuk (dengan verifikasi waktu & deteksi terlambat)
 * POST /absensi/clock-out — Absen pulang (dengan validasi shift & deadline)
 */
const db = require('../../db');
const { localDateStr, tenantWhere, parseTimeToMinutes, verifyClientTime, getEffectiveShift } = require('./helpers');

function registerClockRoutes(router) {
  // POST /absensi/clock-in
  router.post('/absensi/clock-in', async (req, res) => {
    try {
      const { client_time } = req.body;
      const timeCheck = verifyClientTime(client_time);
      if (!timeCheck.ok) return res.status(403).json({ error: timeCheck.pesan });

      const { keterangan } = req.body;
      const tenant_id = req.user.tenant_id;
      const karyawan_id = req.karyawan.id;
      const today = localDateStr(new Date());
      const nowTime = new Date().toTimeString().slice(0, 8);
      const tw = tenantWhere();

      // Cek apakah sudah absen hari ini
      const { sql: tSql, params: tParams } = tw(tenant_id);
      const [existing] = await db.query(
        `SELECT id, jam_masuk FROM absensi WHERE ${tSql} AND karyawan_id=? AND tanggal=?`,
        [...tParams, karyawan_id, today]
      );

      if (existing.length) {
        if (existing[0].jam_masuk) {
          return res.status(400).json({ error: 'Anda sudah melakukan clock-in hari ini', data: { id: existing[0].id, jam_masuk: existing[0].jam_masuk } });
        }
        await db.query(
          `UPDATE absensi SET jam_masuk=?, keterangan=? WHERE id=? AND ${tSql}`,
          [nowTime, keterangan || null, existing[0].id, ...tParams]
        );
        const [updated] = await db.query(`SELECT id, tanggal, status, jam_masuk, jam_keluar, keterangan FROM absensi WHERE id=?`, [existing[0].id]);
        return res.json({ ok: true, pesan: 'Clock-in berhasil', data: updated[0] });
      }

      // Cek apakah shift sudah lewat
      const nowTimeCheck = new Date();
      const todayCheck = localDateStr(nowTimeCheck);
      const dayOfWeekCheck = nowTimeCheck.getDay() + 1;
      const shiftCheck = await getEffectiveShift(req.karyawan, req.user.tenant_id, todayCheck, dayOfWeekCheck);
      let bolehMasuk = false;
      let terlambat = false;

      if (shiftCheck) {
        const hariKerjaCheck = (shiftCheck.hari_kerja || '1,2,3,4,5,6,7').split(',').map(Number);
        if (!hariKerjaCheck.includes(dayOfWeekCheck)) {
          return res.status(403).json({ error: 'Hari ini libur. Tidak perlu absen.', solusi: 'Nikmati hari libur Anda!' });
        }
        const sStart = parseTimeToMinutes(shiftCheck.jam_masuk);
        const sEnd = parseTimeToMinutes(shiftCheck.jam_keluar);
        const nowMinCheck = nowTimeCheck.getHours() * 60 + nowTimeCheck.getMinutes();
        const isCrossDay = sEnd <= sStart;
        const batasTelat = (sStart + 15 + 1440) % 1440;

        if (!isCrossDay) {
          if (nowMinCheck < sEnd) { bolehMasuk = true; if (nowMinCheck > batasTelat) terlambat = true; }
        } else {
          if (nowMinCheck >= sStart || nowMinCheck < sEnd) { bolehMasuk = true; if (nowMinCheck > batasTelat && nowMinCheck < sStart) terlambat = true; }
        }
        if (!bolehMasuk) {
          return res.status(403).json({ error: 'Waktu absen sudah lewat (shift sudah selesai). Anda akan dicatat sebagai BOLOS.' });
        }
      }

      const status = terlambat ? 'Terlambat' : 'Hadir';
      const [r] = await db.query(
        `INSERT INTO absensi (tenant_id, karyawan_id, tanggal, status, jam_masuk, keterangan) VALUES (?,?,?,?,?,?)`,
        [tenant_id, karyawan_id, today, status, nowTime, keterangan || null]
      );
      const [rows] = await db.query(`SELECT id, tanggal, status, jam_masuk, jam_keluar, keterangan FROM absensi WHERE id=?`, [r.insertId]);
      res.json({ ok: true, pesan: 'Clock-in berhasil', data: rows[0] });
    } catch (err) {
      console.error('Mobile clock-in error:', err);
      res.status(500).json({ error: 'Gagal clock-in: ' + err.message });
    }
  });

  // POST /absensi/clock-out
  router.post('/absensi/clock-out', async (req, res) => {
    try {
      const { client_time } = req.body;
      const timeCheck = verifyClientTime(client_time);
      if (!timeCheck.ok) return res.status(403).json({ error: timeCheck.pesan });

      const { keterangan } = req.body;
      const tenant_id = req.user.tenant_id;
      const karyawan_id = req.karyawan.id;
      const now = new Date();
      const today = localDateStr(now);
      const nowTime = now.toTimeString().slice(0, 8);
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const tw = tenantWhere();
      const { sql: tSql, params: tParams } = tw(tenant_id);

      const kemarin = new Date(now);
      kemarin.setDate(kemarin.getDate() - 1);
      const kemarinStr = localDateStr(kemarin);

      const [existing] = await db.query(
        `SELECT id, tanggal, jam_masuk, jam_keluar FROM absensi
         WHERE ${tSql} AND karyawan_id=? AND tanggal IN (?, ?) AND jam_masuk IS NOT NULL
         ORDER BY tanggal DESC LIMIT 1`,
        [...tParams, karyawan_id, kemarinStr, today]
      );

      if (!existing.length) return res.status(400).json({ error: 'Tidak ada sesi absen yang belum clock-out. Silakan clock-in terlebih dahulu.' });
      if (existing[0].jam_keluar) return res.status(400).json({ error: 'Anda sudah melakukan clock-out', data: { id: existing[0].id, jam_keluar: existing[0].jam_keluar } });

      const tanggalAbsen = existing[0].tanggal;
      const dayOfWeek = new Date(tanggalAbsen + 'T00:00:00').getDay() + 1;
      const shift = await getEffectiveShift(req.karyawan, req.user.tenant_id, tanggalAbsen, dayOfWeek);

      if (shift) {
        const hariKerja = (shift.hari_kerja || '1,2,3,4,5,6,7').split(',').map(Number);
        if (hariKerja.includes(dayOfWeek)) {
          const sStart = parseTimeToMinutes(shift.jam_masuk);
          const sEnd = parseTimeToMinutes(shift.jam_keluar);
          const isCrossDay = sEnd <= sStart;

          let bolehKeluar = false;
          if (!isCrossDay) { if (nowMinutes >= sEnd) bolehKeluar = true; }
          else { if (nowMinutes >= sStart || nowMinutes < sEnd) bolehKeluar = false; else bolehKeluar = true; }

          if (!bolehKeluar) {
            return res.status(403).json({ error: 'Anda belum bisa clock-out. Shift Anda selesai pukul ' + shift.jam_keluar.slice(0,5) + '.', solusi: 'Silakan clock-out setelah jam shift selesai.' });
          }

          let lewatDeadline = false;
          if (tanggalAbsen === today) {
            if (nowMinutes >= (sStart + 1440 - 30)) lewatDeadline = true;
          } else {
            if (nowMinutes >= (sStart - 30 + 1440) % 1440) lewatDeadline = true;
          }

          if (lewatDeadline) {
            return res.status(403).json({ error: 'Batas waktu clock-out sudah lewat (shift sudah berganti).', solusi: 'Hubungi admin untuk koreksi absensi.' });
          }

          const batasNormal = sEnd + 60;
          let butuhKoreksi = false;
          if (!isCrossDay) { if (tanggalAbsen < today || nowMinutes > batasNormal) butuhKoreksi = true; }
          else { if (nowMinutes > 720) butuhKoreksi = true; }

          const catatan = butuhKoreksi ? (keterangan ? keterangan + ' | Butuh Koreksi' : 'Butuh Koreksi') : (keterangan || null);

          await db.query(
            `UPDATE absensi SET jam_keluar=?, keterangan=?, status=? WHERE id=? AND ${tSql}`,
            [nowTime, catatan, butuhKoreksi ? 'Butuh Koreksi' : 'Hadir', existing[0].id, ...tParams]
          );
          const [updated] = await db.query(`SELECT id, tanggal, status, jam_masuk, jam_keluar, keterangan FROM absensi WHERE id=?`, [existing[0].id]);
          return res.json({ ok: true, pesan: butuhKoreksi ? 'Clock-out berhasil (Butuh Koreksi)' : 'Clock-out berhasil', butuh_koreksi: butuhKoreksi, data: updated[0] });
        }
      }

      // Fallback: tidak ada shift
      await db.query(`UPDATE absensi SET jam_keluar=?, keterangan=? WHERE id=? AND ${tSql}`, [nowTime, keterangan || null, existing[0].id, ...tParams]);
      const [updated] = await db.query(`SELECT id, tanggal, status, jam_masuk, jam_keluar, keterangan FROM absensi WHERE id=?`, [existing[0].id]);
      res.json({ ok: true, pesan: 'Clock-out berhasil', butuh_koreksi: false, data: updated[0] });
    } catch (err) {
      console.error('Mobile clock-out error:', err);
      res.status(500).json({ error: 'Gagal clock-out: ' + err.message });
    }
  });
}

module.exports = { registerClockRoutes };
