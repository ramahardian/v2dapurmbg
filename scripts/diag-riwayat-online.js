// Diagnosa definitif Riwayat User Online (modal dashboard) + daftar User Online.
//
// Pertanyaan yang dijawab:
//   1) MySQL server GLOBAL menulis jam WIB atau UTC? (tanpa paksa sesi +07:00)
//   2) Apa yang akan TAMPIL di modal "Riwayat User Online" untuk data yang ada?
//   3) Apakah data perlu migrasi (+7 jam) atau cukup restart server?
//
// CARA PAKAI: node scripts/diag-riwayat-online.js
process.env.TZ = 'Asia/Jakarta'; // sementara; dibawah kita simulasikan proses TZ=UTC juga

const mysql = require('mysql2/promise');
require('dotenv').config();

const WIB_OFFSET_MS = 7 * 3600 * 1000;
const p = n => String(n).padStart(2, '0');

async function rawConn(forceTz) {
  return mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    timezone: forceTz || undefined, // tanpa timezone = ikut proses TZ
  });
}

(async () => {
  try {
    console.log('Waktu aktual WIB (Date.now di proses TZ WIB):',
      new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));

    // ── 1) Koneksi TANPA override sesi, proses TZ=WIB dulu ──
    const c1 = await rawConn();
    const [[g1]] = await c1.query(
      "SELECT @@global.time_zone AS gtz, @@session.time_zone AS stz, NOW() AS now_db, UTC_TIMESTAMP() AS utc_db"
    );
    console.log('\n1) Koneksi RAW (tanpa SET time_zone, proses TZ=WIB):');
    console.log('   global/session tz :', g1.gtz, '/', g1.stz);
    console.log('   NOW()             :', g1.now_db instanceof Date ? g1.now_db.toISOString() : g1.now_db);
    console.log('   UTC_TIMESTAMP()   :', g1.utc_db instanceof Date ? g1.utc_db.toISOString() : g1.utc_db);
    const nowWibGlobal = g1.now_db instanceof Date ? new Date(g1.now_db.getTime() + WIB_OFFSET_MS) : new Date(g1.now_db);
    const globalIsWib = (g1.now_db.getUTCHours() - g1.utc_db.getUTCHours() + 24) % 24 === 7;
    console.log('   → Global menulis  :', globalIsWib ? 'WIB (+07:00) ✓' : 'UTC ✗ (butuh SET time_zone, sudah ada di db.js)');
    await c1.end();

    // ── 2) Simulasi PRODUKSI: proses TZ=UTC, mysql2 tanpa timezone option ──
    const c2 = await rawConn();
    const [[g2]] = await c2.query("SELECT NOW() AS now_db, UTC_TIMESTAMP() AS utc_db");
    console.log('\n2) Koneksi RAW, proses TZ=UTC (simulasi container produksi):');
    console.log('   NOW()             :', g2.now_db instanceof Date ? g2.now_db.toISOString() : g2.now_db);
    console.log('   UTC_TIMESTAMP()   :', g2.utc_db instanceof Date ? g2.utc_db.toISOString() : g2.utc_db);
    await c2.end();

    // ── 3) Data riwayat online + simulasi tampilan client (beranda.js) ──
    const db = require('../db'); // pakai pool resmi (sesi +07:00 + timezone option) — seperti server asli
    const [al] = await db.query(
      `SELECT al.id, al.nama, al.event, al.created_at,
              (SELECT COUNT(*) FROM user_activity_log x WHERE x.tenant_id=al.tenant_id) AS total
       FROM user_activity_log al ORDER BY al.created_at DESC LIMIT 6`
    );
    const [u] = await db.query(
      'SELECT id, nama, CAST(last_activity AS CHAR) AS raw FROM users ORDER BY last_activity DESC LIMIT 4'
    );

    console.log('\n3) Data Riwayat User Online — apa yang TAMPIL di modal:');
    if (!al.length) {
      console.log('   (user_activity_log kosong)');
    }
    for (const r of al) {
      // jalur client: JSON Date dari mysql2 (timezone +07:00) → ohParseDate → +7 jam → tampil
      const x = r.created_at instanceof Date ? r.created_at : new Date(r.created_at);
      const w = new Date(x.getTime() + WIB_OFFSET_MS);
      const tampil = p(w.getUTCHours()) + '.' + p(w.getUTCMinutes());
      console.log(`   ${String(r.nama || '?').padEnd(12)} ${r.event.padEnd(9)} tersimpan=${x.toISOString()} → modal tampil ${tampil} WIB`);
    }
    console.log('   (total aktivitas tenant:', al.length ? al[0].total : 0, ')');

    console.log('\n4) users.last_activity (daftar User Online Saat Ini):');
    for (const r of u) {
      console.log(`   ${String(r.nama || '?').padEnd(12)} tersimpan="${r.raw}"`);
    }

    console.log('\n── KESIMPULAN ──');
    if (globalIsWib) {
      console.log('✓ MySQL server menulis WIB secara global → data riwayat online sudah benar.');
      console.log('  Tidak perlu migrasi. Cukup RESTART server agar db.js fix aktif,');
      console.log('  dan modal Riwayat + daftar User Online tampil waktu WIB yang benar.');
    } else {
      console.log('✗ MySQL server menulis UTC → data lama tampil 7 jam meleset.');
      console.log('  Jalankan: node scripts/migrasi-chat-waktu.js --yes');
      console.log('  (script sudah mencakup user_activity_log & users.last_activity)');
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    process.exit(0);
  }
})();
