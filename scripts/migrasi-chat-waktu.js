// Migrasi satu kali: koreksi timestamp yang TERSIMPAN UTC (wall-clock UTC)
// menjadi WIB (+7 jam), karena sebelum fix session time_zone di db.js,
// MySQL server yang diset UTC menulis jam UTC di kolom hasil NOW().
//
// Tabel yang dikoreksi (semua ditulis lewat NOW()/CURRENT_TIMESTAMP):
//   1) chat_messages.created_at      — jam pesan chat
//   2) user_activity_log.created_at  — Riwayat User Online (modal dashboard)
//   3) users.last_activity           — daftar "User Online Saat Ini" + status online chat
//
// CARA PAKAI:
//   1) node scripts/migrasi-chat-waktu.js          → PREVIEW saja (tidak mengubah)
//   2) node scripts/migrasi-chat-waktu.js --yes    → terapkan pergeseran +7 jam
//
// PERHATIAN: Hanya jalankan jika timestamp LAMA masih tampil 7 jam lebih
// lambat dari waktu sebenarnya (tersimpan UTC). Jika DB sudah menulis WIB
// sejak awal, JANGAN dijalankan (akan menggeser data terlalu jauh ke depan).
process.env.TZ = 'Asia/Jakarta';
const db = require('../db');

const p = n => String(n).padStart(2, '0');
const shiftHours = 7;

const TABLES = [
  { nama: 'chat_messages.created_at',     table: 'chat_messages',     col: 'created_at' },
  { nama: 'user_activity_log.created_at', table: 'user_activity_log', col: 'created_at' },
  { nama: 'users.last_activity',          table: 'users',             col: 'last_activity' },
];

(async () => {
  try {
    const [[{ now }]] = await db.query('SELECT NOW() AS now');
    const nowWib = now instanceof Date ? new Date(now.getTime() + 7 * 3600 * 1000) : new Date(now);
    const nowStr = `${nowWib.getUTCFullYear()}-${p(nowWib.getUTCMonth()+1)}-${p(nowWib.getUTCDate())} ${p(nowWib.getUTCHours())}:${p(nowWib.getUTCMinutes())}`;

    console.log(`Waktu sekarang (WIB)  : ${nowStr}`);
    console.log('\n─ PREVIEW (nilai tersimpan, 5 terbaru per tabel) ─');
    for (const t of TABLES) {
      const [rows] = await db.query(
        `SELECT CAST(${t.col} AS CHAR) AS raw FROM ${t.table}
         WHERE ${t.col} IS NOT NULL ORDER BY ${t.col} DESC LIMIT 5`
      );
      console.log(`  • ${t.nama} (${rows.length} contoh):`);
      if (!rows.length) {
        console.log('      (kosong)');
      } else {
        rows.forEach(r => console.log(`      ${r.raw}`));
      }
    }
    console.log('\nCATATAN: bandingkan nilai "5 terbaru" dengan waktu sekarang di atas.');
    console.log('  • Jika terbaru ~7 jam lebih lambat dari jam sebenarnya → data tersimpan UTC → jalankan dengan --yes.');
    console.log('  • Jika tampilan sudah benar (DB menulis WIB) → JANGAN dijalankan.');

    const yes = process.argv.includes('--yes');
    if (!yes) {
      console.log('\nIni hanya PREVIEW. Jalankan dengan --yes untuk menggeser +7 jam di ketiga tabel.');
      return;
    }

    for (const t of TABLES) {
      const [r] = await db.query(
        `UPDATE ${t.table} SET ${t.col} = DATE_ADD(${t.col}, INTERVAL ? HOUR) WHERE ${t.col} IS NOT NULL`,
        [shiftHours]
      );
      console.log(`✅ ${t.nama}: ${r.affectedRows} baris digeser +${shiftHours} jam.`);
    }
    console.log('\nSelesai. Periksa kembali chat & Riwayat User Online di dashboard.');
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
