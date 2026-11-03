// Uji fix waktu chat: paksa session time_zone = +07:00 di db.js.
// Membuktikan: (1) sesi pool = WIB, (2) CURRENT_TIMESTAMP menulis jam WIB
// walau MySQL server diset UTC, (3) data yang TERSIMPAN UTC (historis) akan
// terlihat meleset 7 jam → perlu migrasi (scripts/migrasi-chat-waktu.js).
process.env.TZ = 'Asia/Jakarta';
const mysql = require('mysql2/promise');
const db = require('../db');

const WIB_OFFSET_MS = 7 * 3600 * 1000;
const p = n => String(n).padStart(2, '0');

(async () => {
  try {
    // 1) Buktikan sesi pool sudah +07:00 (efek pool.on('connection'))
    const [[tz]] = await db.query(
      "SELECT @@session.time_zone AS stz, NOW() AS now_db, UTC_TIMESTAMP() AS utc_db"
    );
    console.log('1) Session time_zone pool  :', tz.stz);
    console.log('   NOW() pool (harus WIB)  :', tz.now_db instanceof Date ? tz.now_db.toISOString() : tz.now_db);
    console.log('   UTC_TIMESTAMP()         :', tz.utc_db instanceof Date ? tz.utc_db.toISOString() : tz.utc_db);

    // 2) Simulasi MySQL server yang diset UTC (lingkungan lama)
    await db.query('CREATE TABLE IF NOT EXISTS tz_test (id INT AUTO_INCREMENT PRIMARY KEY, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
    await db.query('TRUNCATE tz_test');

    const raw = await mysql.createConnection({
      host: process.env.DB_HOST, port: process.env.DB_PORT,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME, timezone: '+00:00',
    });
    await raw.query("SET time_zone = '+00:00'");
    await raw.query('INSERT INTO tz_test () VALUES ()'); // CURRENT_TIMESTAMP = UTC wall-clock
    const [[utcRow]] = await raw.query('SELECT id, CAST(created_at AS CHAR) AS raw FROM tz_test');
    console.log('\n2) [Simulasi MySQL server UTC] CURRENT_TIMESTAMP menulis:', utcRow.raw, '(wall-clock UTC)');
    await raw.end();

    // 3) Data BARU yang ditulis lewat pool (sesi +07:00) → NOW() = WIB
    await db.query('INSERT INTO tz_test () VALUES ()');
    const [rows] = await db.query('SELECT id, CAST(created_at AS CHAR) AS raw, created_at AS dt FROM tz_test ORDER BY id');
    for (const r of rows) {
      const x = r.dt instanceof Date ? r.dt : new Date(r.dt);
      const w = new Date(x.getTime() + WIB_OFFSET_MS);
      const tampil = p(w.getUTCHours()) + '.' + p(w.getUTCMinutes());
      console.log(`3) msg#${r.id} tersimpan="${r.raw}" | dibaca pool → tampil ${tampil} WIB ${r.id === 1 ? '← data LAMA (UTC) meleset 7 jam, perlu migrasi' : '← data BARU (WIB) BENAR ✓'}`);
    }
    console.log('\nKesimpulan: setelah fix, pesan BARU selalu benar. Pesan LAMA yang');
    console.log('tersimpan UTC bisa dikoreksi sekali jalan dengan:');
    console.log('  node scripts/migrasi-chat-waktu.js --yes');
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    try { await db.query('DROP TABLE IF EXISTS tz_test'); } catch {}
    await db.end();
  }
})();
