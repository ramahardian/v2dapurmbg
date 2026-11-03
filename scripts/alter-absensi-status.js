/**
 * Script: alter-absensi-status.js
 * ─────────────────────────────────────────
 * Menambahkan 'Terlambat' ke ENUM status tabel absensi.
 *
 * Cara jalankan:
 *   node scripts/alter-absensi-status.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    console.log('🔌 Terhubung ke database:', process.env.DB_NAME);

    // Cek apakah 'Terlambat' sudah ada di ENUM
    const [cols] = await conn.query(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'absensi'
         AND COLUMN_NAME = 'status'`
    );

    const currentType = cols[0]?.COLUMN_TYPE || '';
    if (currentType.includes("'Terlambat'")) {
      console.log('✓ Status ENUM sudah mengandung Terlambat, tidak perlu diubah.');
      await conn.end();
      process.exit(0);
    }

    // Jalankan ALTER TABLE
    await conn.query(
      `ALTER TABLE absensi MODIFY COLUMN status
       ENUM('Hadir','Sakit','Izin','Cuti','Alpha','Terlambat') DEFAULT 'Hadir'`
    );

    console.log('✅ Status ENUM berhasil ditambahkan: Terlambat');
    console.log('   ENUM sekarang: Hadir, Sakit, Izin, Cuti, Alpha, Terlambat');

    await conn.end();
    process.exit(0);
  } catch (e) {
    console.error('❌ Gagal:', e.message);
    process.exit(1);
  }
})();
