require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
   host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
  });
  try {
    const [cols] = await conn.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bahan_baku' AND COLUMN_NAME = 'sumber'"
    );

    if (!cols.length) {
      await conn.query(
        "ALTER TABLE bahan_baku ADD COLUMN sumber VARCHAR(20) DEFAULT NULL COMMENT 'sumber permintaan: ahli_gizi' AFTER stok_minimum"
      );
      console.log('✓ Kolom sumber berhasil ditambahkan ke bahan_baku');
    } else {
      console.log('✓ Kolom sumber sudah ada, skip');
    }
  } catch (e) {
    console.error('✗ Gagal:', e.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
