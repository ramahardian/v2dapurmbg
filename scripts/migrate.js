const db = require('../db');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

(async () => {
  try {
    // Connect tanpa database (untuk CREATE DATABASE)
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      multipleStatements: true,
    });
    const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
    await conn.query(sql);
    // Migrasi kolom penerima_manfaat jika masih pakai schema lama
    try {
      const [cols] = await conn.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'penerima_manfaat' AND COLUMN_NAME = 'paket_besar'");
      if (!cols.length) {
        const [oldCols] = await conn.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'penerima_manfaat' AND COLUMN_NAME = 'kategori'");
        if (oldCols.length) {
          await conn.query('ALTER TABLE penerima_manfaat ADD COLUMN paket_besar INT DEFAULT 0 AFTER kategori, ADD COLUMN paket_kecil INT DEFAULT 0 AFTER paket_besar');
          await conn.query("ALTER TABLE penerima_manfaat DROP COLUMN kategori");
          console.log('✓ Migrasi penerima_manfaat: kategori → paket_besar + paket_kecil');
        } else {
          await conn.query('ALTER TABLE penerima_manfaat ADD COLUMN paket_besar INT DEFAULT 0, ADD COLUMN paket_kecil INT DEFAULT 0');
          console.log('✓ Migrasi penerima_manfaat: tambah kolom paket_besar + paket_kecil');
        }
      }
    } catch (e) {
      console.log('  (skip migrasi kolom)', e.message);
    }
    console.log('✓ Schema berhasil dibuat');
    await conn.end();

    // Seed admin tenant + user
    const [tExist] = await db.query('SELECT id FROM tenants LIMIT 1');
    if (!tExist.length) {
      const [t] = await db.query('INSERT INTO tenants (nama, plan) VALUES (?, ?)',
        [process.env.ADMIN_TENANT_NAME || 'Dapur Pusat MBG', 'enterprise']);
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
      await db.query('INSERT INTO users (tenant_id, email, password_hash, nama, role) VALUES (?,?,?,?,?)',
        [t.insertId, (process.env.ADMIN_EMAIL || 'admin@mbg.id').toLowerCase(), hash, 'Administrator', 'admin']);
      console.log(`✓ Admin seeded: ${process.env.ADMIN_EMAIL} / ${process.env.ADMIN_PASSWORD}`);
    } else {
      console.log('✓ Tenant sudah ada, skip seed');
    }
    process.exit(0);
  } catch (e) {
    console.error('✗ Migrate gagal:', e.message);
    process.exit(1);
  }
})();
