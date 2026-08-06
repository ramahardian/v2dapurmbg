// Migrasi satu kali: koreksi chat_messages.created_at yang TERSIMPAN UTC
// (wall-clock UTC) menjadi WIB (+7 jam), karena sebelum fix session time_zone,
// MySQL server yang diset UTC menulis jam UTC.
//
// CARA PAKAI:
//   1) node scripts/migrasi-chat-waktu.js          → PREVIEW saja (tidak mengubah)
//   2) node scripts/migrasi-chat-waktu.js --yes    → terapkan pergeseran +7 jam
//
// PERHATIAN: Hanya jalankan jika pesan chat LAMA masih tampil 7 jam lebih
// lambat dari waktu sebenarnya (tersimpan UTC). Jika DB sudah menulis WIB
// sejak awal, JANGAN dijalankan (akan menggeser pesan terlalu jauh ke depan).
process.env.TZ = 'Asia/Jakarta';
const db = require('../db');

const p = n => String(n).padStart(2, '0');
const shiftHours = 7;

(async () => {
  try {
    const [all] = await db.query('SELECT id, CAST(created_at AS CHAR) AS raw FROM chat_messages ORDER BY id');
    if (!all.length) {
      console.log('Tidak ada pesan chat.');
      return;
    }
    const [[{ now }]] = await db.query('SELECT NOW() AS now');
    const nowWib = now instanceof Date ? new Date(now.getTime() + 7 * 3600 * 1000) : new Date(now);
    const nowStr = `${nowWib.getUTCFullYear()}-${p(nowWib.getUTCMonth()+1)}-${p(nowWib.getUTCDate())} ${p(nowWib.getUTCHours())}:${p(nowWib.getUTCMinutes())}`;

    console.log(`Waktu sekarang (WIB)  : ${nowStr}`);
    console.log(`Total pesan           : ${all.length}`);
    console.log('\n─ PREVIEW (10 pesan terakhir) ─');
    console.log('  id | tersimpan di DB');
    for (const r of all.slice(-10)) {
      console.log(`  ${String(r.id).padEnd(3)}| ${r.raw}`);
    }
    console.log('\nCATATAN: bandingkan dengan waktu di atas.');
    console.log('  • Jika pesan baru tampil ~7 jam lebih lambat dari jam sebenarnya → data tersimpan UTC → jalankan dengan --yes.');
    console.log('  • Jika tampilan sudah benar (DB menulis WIB) → JANGAN dijalankan.');

    const yes = process.argv.includes('--yes');
    if (!yes) {
      console.log('\nIni hanya PREVIEW. Jalankan dengan --yes untuk menggeser SEMUA pesan +7 jam.');
      return;
    }

    const [r] = await db.query('UPDATE chat_messages SET created_at = DATE_ADD(created_at, INTERVAL ? HOUR)', [shiftHours]);
    console.log(`\n✅ ${r.affectedRows} pesan digeser +${shiftHours} jam. Periksa kembali dengan: node scripts/diag-chat-waktu.js`);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
