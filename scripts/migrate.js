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
    // Migrasi kolom SP di bahan_baku
    try {
      const [spCols] = await conn.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bahan_baku' AND COLUMN_NAME = 'kategori_sp'");
      if (!spCols.length) {
        await conn.query("ALTER TABLE bahan_baku ADD COLUMN kategori_sp ENUM('Karbohidrat','Protein Hewani','Protein Nabati','Sayur','Buah','Susu','Minyak') NULL AFTER kategori, ADD COLUMN berat_1_sp DECIMAL(10,2) DEFAULT 0 AFTER kategori_sp, ADD COLUMN persen_bdd DECIMAL(5,1) DEFAULT 100 AFTER berat_1_sp");
        console.log('✓ Migrasi bahan_baku: tambah kolom SP (kategori_sp, berat_1_sp, persen_bdd)');
      }
    } catch (e) {
      console.log('  (skip migrasi SP bahan_baku)', e.message);
    }
    // Buat tabel standar_sp jika belum ada
    try {
      await conn.query(`CREATE TABLE IF NOT EXISTS standar_sp (
        id INT AUTO_INCREMENT PRIMARY KEY,
        jenjang VARCHAR(50) NOT NULL,
        kategori_sp VARCHAR(50) NOT NULL,
        sp_value DECIMAL(5,2) NOT NULL,
        UNIQUE KEY uk_jenjang_kategori (jenjang, kategori_sp)
      ) ENGINE=InnoDB`);
      // Seed data standar_sp
      await conn.query(`INSERT IGNORE INTO standar_sp (jenjang, kategori_sp, sp_value) VALUES
        ('Ibu Hamil', 'Karbohidrat', 2.5), ('Ibu Hamil', 'Protein Hewani', 2), ('Ibu Hamil', 'Protein Nabati', 1),
        ('Ibu Hamil', 'Sayur', 1), ('Ibu Hamil', 'Buah', 1), ('Ibu Hamil', 'Susu', 1), ('Ibu Hamil', 'Minyak', 1.5),
        ('Ibu Menyusui', 'Karbohidrat', 2.5), ('Ibu Menyusui', 'Protein Hewani', 2), ('Ibu Menyusui', 'Protein Nabati', 1),
        ('Ibu Menyusui', 'Sayur', 1), ('Ibu Menyusui', 'Buah', 1), ('Ibu Menyusui', 'Susu', 1), ('Ibu Menyusui', 'Minyak', 1.5),
        ('Balita', 'Karbohidrat', 0.8), ('Balita', 'Protein Hewani', 1), ('Balita', 'Protein Nabati', 0.25),
        ('Balita', 'Sayur', 0.25), ('Balita', 'Buah', 1), ('Balita', 'Susu', 1), ('Balita', 'Minyak', 1),
        ('TK/PAUD', 'Karbohidrat', 0.8), ('TK/PAUD', 'Protein Hewani', 1), ('TK/PAUD', 'Protein Nabati', 0.25),
        ('TK/PAUD', 'Sayur', 0.25), ('TK/PAUD', 'Buah', 1), ('TK/PAUD', 'Susu', 1), ('TK/PAUD', 'Minyak', 1),
        ('SD 1-3', 'Karbohidrat', 1), ('SD 1-3', 'Protein Hewani', 1), ('SD 1-3', 'Protein Nabati', 0.25),
        ('SD 1-3', 'Sayur', 0.25), ('SD 1-3', 'Buah', 1), ('SD 1-3', 'Susu', 1), ('SD 1-3', 'Minyak', 1),
        ('SD 4-6', 'Karbohidrat', 1.75), ('SD 4-6', 'Protein Hewani', 1.5), ('SD 4-6', 'Protein Nabati', 0.5),
        ('SD 4-6', 'Sayur', 0.5), ('SD 4-6', 'Buah', 1), ('SD 4-6', 'Susu', 1), ('SD 4-6', 'Minyak', 1.5),
        ('SMP', 'Karbohidrat', 2), ('SMP', 'Protein Hewani', 1.5), ('SMP', 'Protein Nabati', 1),
        ('SMP', 'Sayur', 0.5), ('SMP', 'Buah', 1), ('SMP', 'Susu', 1), ('SMP', 'Minyak', 1.5),
        ('SMA', 'Karbohidrat', 2), ('SMA', 'Protein Hewani', 2), ('SMA', 'Protein Nabati', 1),
        ('SMA', 'Sayur', 1), ('SMA', 'Buah', 1), ('SMA', 'Susu', 1), ('SMA', 'Minyak', 1.5)`);
      console.log('✓ Migrasi standar_sp: tabel dan seed data');
    } catch (e) {
      console.log('  (skip migrasi standar_sp)', e.message);
    }
    // Migrasi kolom gizi sp_referensi_bahan
    try {
      const [giziCols] = await conn.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sp_referensi_bahan' AND COLUMN_NAME = 'energi'");
      if (!giziCols.length) {
        await conn.query("ALTER TABLE sp_referensi_bahan ADD COLUMN energi DECIMAL(8,2) DEFAULT NULL AFTER berat_kotor, ADD COLUMN protein DECIMAL(8,2) DEFAULT NULL AFTER energi, ADD COLUMN lemak DECIMAL(8,2) DEFAULT NULL AFTER protein, ADD COLUMN karbohidrat DECIMAL(8,2) DEFAULT NULL AFTER lemak, ADD COLUMN serat DECIMAL(8,2) DEFAULT NULL AFTER karbohidrat");
        console.log('✓ Migrasi sp_referensi_bahan: tambah kolom gizi (energi, protein, lemak, karbohidrat, serat)');
      }
    } catch (e) {
      console.log('  (skip migrasi gizi sp_referensi_bahan)', e.message);
    }
    // Seed sp_referensi_bahan untuk tenant_id = 1 jika masih kosong
    try {
      const [[{cnt}]] = await conn.query("SELECT COUNT(*) as cnt FROM sp_referensi_bahan WHERE tenant_id=1");
      if (cnt === 0) {
        const seedSql = fs.readFileSync(path.join(__dirname, '..', 'seed_sp_referensi_bahan.sql'), 'utf8');
        const insertPart = seedSql.split('INSERT IGNORE')[1];
        if (insertPart) {
          await conn.query('INSERT IGNORE ' + insertPart);
          console.log('✓ Seed sp_referensi_bahan: data dimasukkan untuk tenant_id=1');
        }
      }
    } catch (e) {
      console.log('  (skip seed sp_referensi_bahan)', e.message);
    }
    // Copy seed sp_referensi_bahan ke tenant lain yang belum punya data
    try {
      const [missingTenants] = await conn.query(
        "SELECT t.id FROM tenants t LEFT JOIN sp_referensi_bahan s ON s.tenant_id = t.id WHERE s.id IS NULL"
      );
      if (missingTenants.length) {
        const [seedRows] = await conn.query("SELECT nama, kategori, berat_bersih, bdd_persen, berat_kotor FROM sp_referensi_bahan WHERE tenant_id=1");
        for (const t of missingTenants) {
          for (const row of seedRows) {
            await conn.query(
              "INSERT IGNORE INTO sp_referensi_bahan (tenant_id, nama, kategori, berat_bersih, bdd_persen, berat_kotor) VALUES (?,?,?,?,?,?)",
              [t.id, row.nama, row.kategori, row.berat_bersih, row.bdd_persen, row.berat_kotor]
            );
          }
          console.log(`  ✓ Seed sp_referensi_bahan untuk tenant id=${t.id}`);
        }
      }
    } catch (e) {
      console.log('  (skip copy seed sp_referensi_bahan ke tenant lain)', e.message);
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
