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
    // Migrasi kolom nutrisi bahan_baku
    try {
      const [nutCols] = await conn.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bahan_baku' AND COLUMN_NAME = 'kalori'");
      if (!nutCols.length) {
        await conn.query('ALTER TABLE bahan_baku ADD COLUMN kalori DECIMAL(10,2) DEFAULT 0 AFTER harga_satuan, ADD COLUMN protein DECIMAL(10,2) DEFAULT 0 AFTER kalori, ADD COLUMN karbohidrat DECIMAL(10,2) DEFAULT 0 AFTER protein, ADD COLUMN lemak DECIMAL(10,2) DEFAULT 0 AFTER karbohidrat, ADD COLUMN serat DECIMAL(10,2) DEFAULT 0 AFTER lemak');
        console.log('✓ Migrasi bahan_baku: tambah kolom nutrisi (kalori, protein, karbohidrat, lemak, serat)');
      }
    } catch (e) {
      console.log('  (skip migrasi nutrisi bahan_baku)', e.message);
    }
    // Migrasi kolom jabatan di tabel karyawan (jika menggunakan schema lama dengan jabatan_id)
    try {
      const [jabCols] = await conn.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'karyawan' AND COLUMN_NAME = 'jabatan'");
      if (!jabCols.length) {
        const [oldJabCol] = await conn.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'karyawan' AND COLUMN_NAME = 'jabatan_id'");
        if (oldJabCol.length) {
          await conn.query('ALTER TABLE karyawan ADD COLUMN jabatan VARCHAR(100) AFTER nik');
          await conn.query("UPDATE karyawan k JOIN jabatan j ON j.id=k.jabatan_id SET k.jabatan=j.nama WHERE k.jabatan_id IS NOT NULL");
          console.log('✓ Migrasi karyawan: jabatan_id → jabatan');
        } else {
          await conn.query('ALTER TABLE karyawan ADD COLUMN jabatan VARCHAR(100)');
          console.log('✓ Migrasi karyawan: tambah kolom jabatan');
        }
      }
    } catch (e) {
      console.log('  (skip migrasi kolom jabatan)', e.message);
    }
    // Migrasi kolom photo di tabel karyawan
    try {
      const [photoCols] = await conn.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'karyawan' AND COLUMN_NAME = 'photo'");
      if (!photoCols.length) {
        await conn.query("ALTER TABLE karyawan ADD COLUMN photo VARCHAR(255) AFTER phone");
        console.log('✓ Migrasi karyawan: tambah kolom photo');
      }
    } catch (e) {
      console.log('  (skip migrasi kolom photo)', e.message);
    }
    // Migrasi kolom foto di tabel users
    try {
      const [fotoCols] = await conn.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'foto'");
      if (!fotoCols.length) {
        await conn.query("ALTER TABLE users ADD COLUMN foto VARCHAR(255) AFTER role");
        console.log('✓ Migrasi users: tambah kolom foto');
      }
    } catch (e) {
      console.log('  (skip migrasi kolom foto)', e.message);
    }
    // Migrasi kolom harga_sebelumnya di bahan_baku
    try {
      const [hs] = await conn.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bahan_baku' AND COLUMN_NAME = 'harga_sebelumnya'");
      if (!hs.length) {
        await conn.query("ALTER TABLE bahan_baku ADD COLUMN harga_sebelumnya DECIMAL(15,2) DEFAULT 0 AFTER harga_satuan");
        console.log('✓ Migrasi bahan_baku: tambah kolom harga_sebelumnya');
      }
    } catch (e) {
      console.log('  (skip migrasi harga_sebelumnya)', e.message);
    }
    // Perbaiki kolom photo di tabel users jika ada dan NOT NULL (legacy)
    try {
      const [photoCol] = await conn.query("SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'photo' AND IS_NULLABLE = 'NO' AND COLUMN_DEFAULT IS NULL");
      if (photoCol.length) {
        await conn.query("ALTER TABLE users MODIFY COLUMN photo VARCHAR(100) DEFAULT NULL");
        console.log('✓ Migrasi users: perbaiki kolom photo → nullable');
      }
    } catch (e) {
      console.log('  (skip perbaikan kolom photo)', e.message);
    }
    console.log('✓ Schema berhasil dibuat');
    await conn.end();

    // Seed admin tenant + user
    const [tExist] = await db.query('SELECT id FROM tenants LIMIT 1');
    if (!tExist.length) {
      const [t] = await db.query('INSERT INTO tenants (nama, plan) VALUES (?, ?)',
        [process.env.ADMIN_TENANT_NAME || 'Dapur Sukaluyu', 'enterprise']);
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
      await db.query('INSERT INTO users (tenant_id, email, password_hash, nama, role) VALUES (?,?,?,?,?)',
        [t.insertId, (process.env.ADMIN_EMAIL || 'admin@sukaluyu.id').toLowerCase(), hash, 'Administrator', 'admin']);
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
