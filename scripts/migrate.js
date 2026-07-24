const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  // Gunakan pool yang sudah ada (dari db.js) — sudah terbukti berfungsi
  const db = require('../db');

  const logs = [];
  const log = (msg) => { console.log(msg); logs.push(msg); };
  const q = (sql, params) => db.query(sql, params || []);

  // Buat tabel yang mungkin belum ada (CREATE TABLE IF NOT EXISTS)
  // Tabel-tabel utama sudah dibuat oleh schema.sql, ini hanya untuk jaga-jaga

  // Tabel Hari Libur
  await q(`CREATE TABLE IF NOT EXISTS hari_libur (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    tanggal DATE NOT NULL,
    nama VARCHAR(200) NOT NULL,
    kategori ENUM('Nasional','Perusahaan','Mingguan') DEFAULT 'Perusahaan',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE KEY uk_tanggal_tenant (tanggal, tenant_id),
    INDEX idx_tenant (tenant_id),
    INDEX idx_tanggal (tenant_id, tanggal)
  ) ENGINE=InnoDB`);
  log('[OK] Tabel hari_libur tersedia');

  await q(`CREATE TABLE IF NOT EXISTS siklus_menu_item_bahan (
    id INT AUTO_INCREMENT PRIMARY KEY,
    siklus_id INT NOT NULL,
    hari_ke INT NOT NULL,
    kategori_sp VARCHAR(50) NOT NULL,
    bahan_baku_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (siklus_id) REFERENCES siklus_menu(id) ON DELETE CASCADE,
    FOREIGN KEY (bahan_baku_id) REFERENCES bahan_baku(id),
    INDEX idx_siklus_hari (siklus_id, hari_ke)
  ) ENGINE=InnoDB`);
  log('[OK] Tabel siklus_menu_item_bahan tersedia');

  // Migrasi kolom penerima_manfaat
  try {
    const [cols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'penerima_manfaat' AND COLUMN_NAME = 'paket_besar'");
    if (!cols.length) {
      const [oldCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'penerima_manfaat' AND COLUMN_NAME = 'kategori'");
      if (oldCols.length) {
        await q('ALTER TABLE penerima_manfaat ADD COLUMN paket_besar INT DEFAULT 0 AFTER kategori, ADD COLUMN paket_kecil INT DEFAULT 0 AFTER paket_besar');
        await q("ALTER TABLE penerima_manfaat DROP COLUMN kategori");
        log('✓ Migrasi penerima_manfaat: kategori → paket_besar + paket_kecil');
      } else {
        await q('ALTER TABLE penerima_manfaat ADD COLUMN paket_besar INT DEFAULT 0, ADD COLUMN paket_kecil INT DEFAULT 0');
        log('✓ Migrasi penerima_manfaat: tambah kolom paket_besar + paket_kecil');
      }
    }
  } catch (e) { log('  (skip migrasi kolom penerima_manfaat)'); }

  // Migrasi nutrisi bahan_baku
  try {
    const [nutCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bahan_baku' AND COLUMN_NAME = 'kalori'");
    if (!nutCols.length) {
      await q('ALTER TABLE bahan_baku ADD COLUMN kalori DECIMAL(10,2) DEFAULT 0 AFTER harga_satuan, ADD COLUMN protein DECIMAL(10,2) DEFAULT 0 AFTER kalori, ADD COLUMN karbohidrat DECIMAL(10,2) DEFAULT 0 AFTER protein, ADD COLUMN lemak DECIMAL(10,2) DEFAULT 0 AFTER karbohidrat, ADD COLUMN serat DECIMAL(10,2) DEFAULT 0 AFTER lemak');
      log('✓ Migrasi bahan_baku: tambah kolom nutrisi');
    }
    const [beratCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bahan_baku' AND COLUMN_NAME = 'berat_per_satuan'");
    if (!beratCols.length) {
      await q("ALTER TABLE bahan_baku ADD COLUMN berat_per_satuan DECIMAL(10,2) DEFAULT 0 COMMENT 'Berat 1 satuan dalam gram' AFTER persen_bdd");
      log('✓ Migrasi bahan_baku: tambah kolom berat_per_satuan');
    }
  } catch (e) { log('  (skip migrasi nutrisi bahan_baku)'); }

  // Karyawan jabatan
  try {
    const [jabCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'karyawan' AND COLUMN_NAME = 'jabatan'");
    if (!jabCols.length) {
      const [oldJabCol] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'karyawan' AND COLUMN_NAME = 'jabatan_id'");
      if (oldJabCol.length) {
        await q('ALTER TABLE karyawan ADD COLUMN jabatan VARCHAR(100) AFTER nik');
        await q("UPDATE karyawan k JOIN jabatan j ON j.id=k.jabatan_id SET k.jabatan=j.nama WHERE k.jabatan_id IS NOT NULL");
        log('✓ Migrasi karyawan: jabatan_id → jabatan');
      } else {
        await q('ALTER TABLE karyawan ADD COLUMN jabatan VARCHAR(100)');
        log('✓ Migrasi karyawan: tambah kolom jabatan');
      }
    }
  } catch (e) { log('  (skip migrasi jabatan)'); }

  // Karyawan photo
  try {
    const [photoCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'karyawan' AND COLUMN_NAME = 'photo'");
    if (!photoCols.length) {
      await q("ALTER TABLE karyawan ADD COLUMN photo VARCHAR(255) AFTER phone");
      log('✓ Migrasi karyawan: tambah kolom photo');
    }
  } catch (e) { log('  (skip migrasi photo)'); }

  // Users foto
  try {
    const [fotoCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'foto'");
    if (!fotoCols.length) {
      await q("ALTER TABLE users ADD COLUMN foto VARCHAR(255) AFTER role");
      log('✓ Migrasi users: tambah kolom foto');
    }
  } catch (e) { log('  (skip migrasi foto users)'); }

  // harga_sebelumnya
  try {
    const [hs] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bahan_baku' AND COLUMN_NAME = 'harga_sebelumnya'");
    if (!hs.length) {
      await q("ALTER TABLE bahan_baku ADD COLUMN harga_sebelumnya DECIMAL(15,2) DEFAULT 0 AFTER harga_satuan");
      log('✓ Migrasi bahan_baku: tambah kolom harga_sebelumnya');
    }
  } catch (e) { log('  (skip migrasi harga_sebelumnya)'); }

  // Users photo nullable fix
  try {
    const [photoCol] = await q("SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'photo' AND IS_NULLABLE = 'NO' AND COLUMN_DEFAULT IS NULL");
    if (photoCol.length) {
      await q("ALTER TABLE users MODIFY COLUMN photo VARCHAR(100) DEFAULT NULL");
      log('✓ Migrasi users: perbaiki kolom photo → nullable');
    }
  } catch (e) { log('  (skip perbaikan photo)'); }

  // Menu foto
  try {
    const [fotoMenu] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu' AND COLUMN_NAME = 'foto'");
    if (!fotoMenu.length) {
      await q("ALTER TABLE menu ADD COLUMN foto VARCHAR(255) DEFAULT NULL AFTER serat");
      log('✓ Migrasi menu: tambah kolom foto');
    }
  } catch (e) { log('  (skip migrasi foto menu)'); }

  // siklus_menu_item foto
  try {
    const [fotoSmi] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'siklus_menu_item' AND COLUMN_NAME = 'foto'");
    if (!fotoSmi.length) {
      await q("ALTER TABLE siklus_menu_item ADD COLUMN foto VARCHAR(255) DEFAULT NULL AFTER serat");
      log('✓ Migrasi siklus_menu_item: tambah kolom foto');
    }
  } catch (e) { log('  (skip migrasi foto siklus)'); }

  // id_koperasi
  try {
    const [ikCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bahan_baku' AND COLUMN_NAME = 'id_koperasi'");
    if (!ikCols.length) {
      await q("ALTER TABLE bahan_baku ADD COLUMN id_koperasi INT NULL AFTER id, ADD INDEX idx_id_koperasi (id_koperasi)");
      await q("UPDATE bahan_baku SET id_koperasi = CAST(REPLACE(kode, 'EXT-', '') AS UNSIGNED) WHERE kode LIKE 'EXT-%' AND id_koperasi IS NULL");
      log('✓ Migrasi bahan_baku: tambah kolom id_koperasi');
    }
  } catch (e) { log('  (skip migrasi id_koperasi)'); }

  // SP columns di bahan_baku
  try {
    const [spCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bahan_baku' AND COLUMN_NAME = 'kategori_sp'");
    if (!spCols.length) {
      await q("ALTER TABLE bahan_baku ADD COLUMN kategori_sp ENUM('Karbohidrat','Protein Hewani','Protein Nabati','Sayur','Buah','Susu','Minyak') NULL AFTER kategori, ADD COLUMN berat_1_sp DECIMAL(10,2) DEFAULT 0 AFTER kategori_sp, ADD COLUMN persen_bdd DECIMAL(5,1) DEFAULT 100 AFTER berat_1_sp");
      log('✓ Migrasi bahan_baku: tambah kolom SP');
    }
  } catch (e) { log('  (skip migrasi SP)'); }

  // standar_sp
  try {
    await q(`CREATE TABLE IF NOT EXISTS standar_sp (
      id INT AUTO_INCREMENT PRIMARY KEY,
      jenjang VARCHAR(50) NOT NULL,
      kategori_sp VARCHAR(50) NOT NULL,
      sp_value DECIMAL(5,2) NOT NULL,
      UNIQUE KEY uk_jenjang_kategori (jenjang, kategori_sp)
    ) ENGINE=InnoDB`);
    await q(`INSERT IGNORE INTO standar_sp (jenjang, kategori_sp, sp_value) VALUES
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
    log('✓ Migrasi standar_sp: tabel dan seed data');
  } catch (e) { log('  (skip migrasi standar_sp): ' + e.message); }

  // Gizi sp_referensi_bahan
  try {
    const [giziCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sp_referensi_bahan' AND COLUMN_NAME = 'energi'");
    if (!giziCols.length) {
      await q("ALTER TABLE sp_referensi_bahan ADD COLUMN energi DECIMAL(8,2) DEFAULT NULL AFTER berat_kotor, ADD COLUMN protein DECIMAL(8,2) DEFAULT NULL AFTER energi, ADD COLUMN lemak DECIMAL(8,2) DEFAULT NULL AFTER protein, ADD COLUMN karbohidrat DECIMAL(8,2) DEFAULT NULL AFTER lemak, ADD COLUMN serat DECIMAL(8,2) DEFAULT NULL AFTER karbohidrat");
      log('✓ Migrasi sp_referensi_bahan: tambah kolom gizi');
    }
  } catch (e) { log('  (skip migrasi gizi)'); }

  // Seed sp_referensi_bahan untuk tenant_id=1
  try {
    const [[{cnt}]] = await q("SELECT COUNT(*) as cnt FROM sp_referensi_bahan WHERE tenant_id=1");
    if (cnt === 0) {
      const seedSql = fs.readFileSync(path.join(__dirname, '..', 'seed_sp_referensi_bahan.sql'), 'utf8');
      const insertPart = seedSql.split('INSERT IGNORE')[1];
      if (insertPart) {
        await q('INSERT IGNORE ' + insertPart);
        log('✓ Seed sp_referensi_bahan: data untuk tenant_id=1');
      }
    }
  } catch (e) { log('  (skip seed sp_referensi_bahan)'); }

  // Copy seed ke tenant lain
  try {
    const [missingTenants] = await q("SELECT t.id FROM tenants t LEFT JOIN sp_referensi_bahan s ON s.tenant_id = t.id WHERE s.id IS NULL");
    if (missingTenants.length) {
      const [seedRows] = await q("SELECT nama, kategori, berat_bersih, bdd_persen, berat_kotor FROM sp_referensi_bahan WHERE tenant_id=1");
      for (const t of missingTenants) {
        for (const row of seedRows) {
          await q("INSERT IGNORE INTO sp_referensi_bahan (tenant_id, nama, kategori, berat_bersih, bdd_persen, berat_kotor) VALUES (?,?,?,?,?,?)", [t.id, row.nama, row.kategori, row.berat_bersih, row.bdd_persen, row.berat_kotor]);
        }
        log(`  ✓ Seed sp_referensi_bahan untuk tenant id=${t.id}`);
      }
    }
  } catch (e) { log('  (skip copy seed)'); }

  // Tabel akun
  try {
    await q(`CREATE TABLE IF NOT EXISTS akun (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      kode VARCHAR(10) NOT NULL,
      nama VARCHAR(200) NOT NULL,
      bp VARCHAR(50) NOT NULL,
      tipe ENUM('Manual','Otomatis') DEFAULT 'Manual',
      is_active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      INDEX idx_tenant (tenant_id),
      UNIQUE KEY uk_kode_tenant (kode, tenant_id)
    ) ENGINE=InnoDB`);
    log('✓ Migrasi akun: tabel dibuat');
  } catch (e) { log('  (skip tabel akun)'); }

  // akun_id di kas_bank
  try {
    const [aidCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kas_bank' AND COLUMN_NAME = 'akun_id'");
    if (!aidCols.length) {
      await q("ALTER TABLE kas_bank ADD COLUMN akun_id INT AFTER akun");
      log('✓ Migrasi kas_bank: tambah kolom akun_id');
    }
  } catch (e) { log('  (skip akun_id kas_bank)'); }

  // Seed default akun per tenant
  try {
    const [tenants] = await q('SELECT id FROM tenants');
    const [existingAkun] = await q('SELECT COUNT(*) as cnt FROM akun WHERE tenant_id=?', [tenants[0]?.id || 0]);
    if (tenants.length && !existingAkun[0].cnt) {
      const seedAkun = [
        ['1000', 'Petty Cash/Cash in Hand', 'BP Kas', 'Manual'],
        ['1100', 'Kas di Bank', 'BP Kas', 'Manual'],
        ['1300', 'Persediaan Bahan Baku', 'BP Persediaan', 'Otomatis'],
        ['2000', 'Dana Bahan Baku', 'BP Jenis Dana', 'Manual'],
        ['2100', 'Dana Operasional', 'BP Jenis Dana', 'Manual'],
        ['3000', 'Hutang Usaha', 'BP Hutang', 'Otomatis'],
      ];
      for (const t of tenants) {
        for (const [kode, nama, bp, tipe] of seedAkun) {
          await q('INSERT IGNORE INTO akun (tenant_id, kode, nama, bp, tipe) VALUES (?,?,?,?,?)', [t.id, kode, nama, bp, tipe]);
        }
      }
      log('✓ Seed akun: data default untuk semua tenant');
    }
  } catch (e) { log('  (skip seed akun)'); }

  // kolom kelompok & saldo_normal di akun
  try {
    const [kelCol] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'akun' AND COLUMN_NAME = 'kelompok'");
    if (!kelCol.length) {
      await q("ALTER TABLE akun ADD COLUMN kelompok VARCHAR(50) DEFAULT 'AKTIVA' AFTER kode, ADD COLUMN saldo_normal ENUM('Debit','Kredit') DEFAULT 'Debit' AFTER kelompok");
      log('✓ Migrasi akun: tambah kolom kelompok & saldo_normal');
      await q("UPDATE akun SET kelompok='AKTIVA', saldo_normal='Debit' WHERE kode LIKE '1%' AND (kelompok IS NULL OR kelompok='')");
      await q("UPDATE akun SET kelompok='KEWAJIBAN', saldo_normal='Kredit' WHERE kode LIKE '2%' AND (kelompok IS NULL OR kelompok='')");
      await q("UPDATE akun SET kelompok='EKUITAS', saldo_normal='Kredit' WHERE kode LIKE '3%' AND (kelompok IS NULL OR kelompok='')");
      await q("UPDATE akun SET kelompok='PENDAPATAN', saldo_normal='Kredit' WHERE kode LIKE '4%' AND (kelompok IS NULL OR kelompok='')");
      await q("UPDATE akun SET kelompok='BIAYA', saldo_normal='Debit' WHERE kode LIKE '5%' AND (kelompok IS NULL OR kelompok='')");
    }
  } catch (e) { log('  (skip migrasi kelompok akun)'); }

  // saldo_awal di tenants
  try {
    const [saCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants' AND COLUMN_NAME = 'saldo_awal'");
    if (!saCols.length) {
      await q("ALTER TABLE tenants ADD COLUMN saldo_awal DECIMAL(15,2) DEFAULT 0 AFTER is_active");
      log('✓ Migrasi tenants: tambah kolom saldo_awal');
    }
  } catch (e) { log('  (skip migrasi saldo_awal)'); }

  // shift_divisi
  try {
    await q(`CREATE TABLE IF NOT EXISTS shift_divisi (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shift_id INT NOT NULL,
      divisi_id INT NOT NULL,
      tenant_id INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shift_id) REFERENCES shift(id) ON DELETE CASCADE,
      FOREIGN KEY (divisi_id) REFERENCES divisi(id) ON DELETE CASCADE,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      UNIQUE KEY uk_shift_divisi (shift_id, divisi_id),
      INDEX idx_tenant (tenant_id)
    ) ENGINE=InnoDB`);
    log('✓ Migrasi shift_divisi: tabel dibuat');
  } catch (e) { log('  (skip shift_divisi)'); }

  // kas_bank index
  try {
    const [idxRows] = await q("SHOW INDEX FROM kas_bank WHERE Key_name='idx_kas_bank_tenant_tanggal'");
    if (!idxRows.length) {
      await q('CREATE INDEX idx_kas_bank_tenant_tanggal ON kas_bank (tenant_id, tanggal)');
      log('✓ Migrasi kas_bank: index');
    }
  } catch (e) { log('  (skip index kas_bank)'); }

  // resep_map
  try {
    const [rCol] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'siklus_menu_item' AND COLUMN_NAME = 'resep_map'");
    if (!rCol.length) {
      await q("ALTER TABLE siklus_menu_item ADD COLUMN resep_map TEXT AFTER menu_nama");
      log('✓ Migrasi siklus_menu_item: kolom resep_map');
    }
  } catch (e) { log('  (skip resep_map)'); }

  // ijin_cuti dokumen
  try {
    const [dokCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ijin_cuti' AND COLUMN_NAME = 'dokumen'");
    if (!dokCols.length) {
      await q("ALTER TABLE ijin_cuti ADD COLUMN dokumen LONGTEXT AFTER alasan");
      log('✓ Migrasi ijin_cuti: tambah kolom dokumen');
    }
  } catch (e) { log('  (skip dokumen ijin_cuti)'); }

  // Mobile absensi GPS
  try {
    const [latCol] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'absensi' AND COLUMN_NAME = 'latitude'");
    if (!latCol.length) {
      await q("ALTER TABLE absensi ADD COLUMN latitude DECIMAL(10,8) DEFAULT NULL AFTER keterangan, ADD COLUMN longitude DECIMAL(11,8) DEFAULT NULL AFTER latitude, ADD COLUMN clock_out_lat DECIMAL(10,8) DEFAULT NULL AFTER longitude, ADD COLUMN clock_out_lng DECIMAL(11,8) DEFAULT NULL AFTER clock_out_lat, ADD COLUMN foto_masuk VARCHAR(255) DEFAULT NULL AFTER clock_out_lng, ADD COLUMN foto_keluar VARCHAR(255) DEFAULT NULL AFTER foto_masuk");
      log('✓ Migrasi absensi: kolom GPS & foto untuk mobile');
    }
  } catch (e) { log('  (skip migrasi mobile absensi)'); }

  // distribusi penerima_manfaat_id
  try {
    const [pmCol] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'distribusi' AND COLUMN_NAME = 'penerima_manfaat_id'");
    if (!pmCol.length) {
      await q("ALTER TABLE distribusi ADD COLUMN penerima_manfaat_id INT NULL AFTER titik_distribusi, ADD FOREIGN KEY (penerima_manfaat_id) REFERENCES penerima_manfaat(id) ON DELETE SET NULL");
      log('✓ Migrasi distribusi: tambah kolom penerima_manfaat_id');
    }
  } catch (e) { log('  (skip migrasi distribusi)'); }

  // penerimaan_barang supplier_id
  try {
    const [supCol] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'penerimaan_barang' AND COLUMN_NAME = 'supplier_id'");
    if (!supCol.length) {
      await q("ALTER TABLE penerimaan_barang ADD COLUMN supplier_id INT NULL AFTER tanggal_terima, ADD FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE SET NULL");
      log('✓ Migrasi penerimaan_barang: tambah kolom supplier_id');
    }
  } catch (e) { log('  (skip migrasi supplier_id)'); }

  // users karyawan_id
  try {
    const [krCol] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'karyawan_id'");
    if (!krCol.length) {
      await q("ALTER TABLE users ADD COLUMN karyawan_id INT DEFAULT NULL AFTER role, ADD INDEX idx_users_karyawan (karyawan_id)");
      log('✓ Migrasi users: tambah kolom karyawan_id');
    }
    const [fkExists] = await q("SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'karyawan_id' AND REFERENCED_TABLE_NAME IS NOT NULL");
    if (!fkExists.length) {
      await q("ALTER TABLE users ADD FOREIGN KEY (karyawan_id) REFERENCES karyawan(id) ON DELETE SET NULL");
      log('✓ Migrasi users: FK karyawan_id');
    }
  } catch (e) { log('  (skip migrasi karyawan_id)'); }

  // Seed admin (hanya jika belum ada tenant)
  const [tExist] = await q('SELECT id FROM tenants LIMIT 1');
  if (!tExist.length) {
    const [t] = await q('INSERT INTO tenants (nama, plan) VALUES (?, ?)',
      [process.env.ADMIN_TENANT_NAME || 'Dapur Sukaluyu', 'enterprise']);
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
    await q('INSERT INTO users (tenant_id, email, password_hash, nama, role) VALUES (?,?,?,?,?)',
      [t.insertId, (process.env.ADMIN_EMAIL || 'admin@sukaluyu.id').toLowerCase(), hash, 'Administrator', 'admin']);
    log(`✓ Admin seeded: ${process.env.ADMIN_EMAIL}`);
  } else {
    log('✓ Tenant sudah ada, skip seed');
  }

  // sumber
  try {
    const [sCol] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bahan_baku' AND COLUMN_NAME = 'sumber'");
    if (!sCol.length) {
      await q("ALTER TABLE bahan_baku ADD COLUMN sumber VARCHAR(20) DEFAULT NULL COMMENT 'sumber permintaan: ahli_gizi' AFTER stok_minimum");
      log('✓ Migrasi bahan_baku: kolom sumber');
    }
  } catch (e) { log('  (skip sumber)'); }

  // FK siklus_menu_item menu_id
  try {
    const [fkExists] = await q("SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'siklus_menu_item' AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_smi_menu'");
    if (!fkExists.length) {
      await q('UPDATE siklus_menu_item SET menu_id=NULL WHERE menu_id IS NOT NULL AND menu_id NOT IN (SELECT id FROM menu)');
      await q('ALTER TABLE siklus_menu_item ADD CONSTRAINT fk_smi_menu FOREIGN KEY (menu_id) REFERENCES menu(id) ON DELETE SET NULL');
      log('✓ Migrasi siklus_menu_item: FK menu_id');
    }
  } catch (e) { log('  (skip FK menu_id)'); }

  // Missing indexes for performance
  try {
    const [idx1] = await q("SHOW INDEX FROM siklus_menu WHERE Key_name='idx_siklus_menu_tenant_status'");
    if (!idx1.length) {
      await q('CREATE INDEX idx_siklus_menu_tenant_status ON siklus_menu (tenant_id, status)');
      log('✓ Index: siklus_menu (tenant_id, status)');
    }
  } catch (e) { log('  (skip idx_siklus_menu_tenant_status)'); }

  try {
    const [idx2] = await q("SHOW INDEX FROM siklus_menu_item WHERE Key_name='idx_siklus_item_siklus_hari'");
    if (!idx2.length) {
      await q('CREATE INDEX idx_siklus_item_siklus_hari ON siklus_menu_item (siklus_id, hari_ke)');
      log('✓ Index: siklus_menu_item (siklus_id, hari_ke)');
    }
  } catch (e) { log('  (skip idx_siklus_item_siklus_hari)'); }

  try {
    const [idx3] = await q("SHOW INDEX FROM siklus_menu_item_bahan WHERE Key_name='idx_siklus_bahan_baku'");
    if (!idx3.length) {
      await q('CREATE INDEX idx_siklus_bahan_baku ON siklus_menu_item_bahan (bahan_baku_id)');
      log('✓ Index: siklus_menu_item_bahan (bahan_baku_id)');
    }
  } catch (e) { log('  (skip idx_siklus_bahan_baku)'); }

  try {
    const [idx4] = await q("SHOW INDEX FROM menu_bahan WHERE Key_name='idx_menu_bahan_menu'");
    if (!idx4.length) {
      await q('CREATE INDEX idx_menu_bahan_menu ON menu_bahan (menu_id, bahan_baku_id)');
      log('✓ Index: menu_bahan (menu_id, bahan_baku_id)');
    }
  } catch (e) { log('  (skip idx_menu_bahan_menu)'); }

  try {
    const [idx5] = await q("SHOW INDEX FROM produksi WHERE Key_name='idx_produksi_tenant_tanggal_menu'");
    if (!idx5.length) {
      await q('CREATE INDEX idx_produksi_tenant_tanggal_menu ON produksi (tenant_id, tanggal_produksi, menu_id)');
      log('✓ Index: produksi (tenant_id, tanggal_produksi, menu_id)');
    }
  } catch (e) { log('  (skip idx_produksi_tenant_tanggal_menu)'); }

  try {
    const [idx6] = await q("SHOW INDEX FROM budget WHERE Key_name='idx_budget_tenant_periode_kategori'");
    if (!idx6.length) {
      await q('CREATE INDEX idx_budget_tenant_periode_kategori ON budget (tenant_id, periode, kategori_penerima)');
      log('✓ Index: budget (tenant_id, periode, kategori_penerima)');
    }
  } catch (e) { log('  (skip idx_budget_tenant_periode_kategori)'); }

  try {
    const [idx7] = await q("SHOW INDEX FROM bahan_baku WHERE Key_name='idx_bahan_baku_tenant_nama'");
    if (!idx7.length) {
      await q('CREATE INDEX idx_bahan_baku_tenant_nama ON bahan_baku (tenant_id, nama)');
      log('✓ Index: bahan_baku (tenant_id, nama)');
    }
  } catch (e) { log('  (skip idx_bahan_baku_tenant_nama)'); }

  // buffer_persen di bahan_baku
  try {
    const [bpCol] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bahan_baku' AND COLUMN_NAME = 'buffer_persen'");
    if (!bpCol.length) {
      await q("ALTER TABLE bahan_baku ADD COLUMN buffer_persen DECIMAL(5,1) DEFAULT 10 COMMENT 'Buffer cadangan % (1-10), default 10' AFTER persen_bdd");
      log('✓ Migrasi bahan_baku: tambah kolom buffer_persen');
    }
  } catch (e) { log('  (skip migrasi buffer_persen)'); }

  // Multi-jenjang di siklus_menu
  try {
    const [kpCol] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'siklus_menu' AND COLUMN_NAME = 'kategori_penerima' AND DATA_TYPE = 'text'");
    if (!kpCol.length) {
      await q("ALTER TABLE siklus_menu MODIFY COLUMN kategori_penerima TEXT");
      log('✓ Migrasi siklus_menu: kategori_penerima → TEXT (multi jenjang)');
    }
  } catch (e) { log('  (skip migrasi kategori_penerima TEXT): ' + e.message); }

  // Tabel perencanaan_override — override bahan per jenjang
  try {
    await q(`CREATE TABLE IF NOT EXISTS perencanaan_override (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      siklus_id INT NOT NULL,
      hari_ke INT NOT NULL,
      jenjang VARCHAR(50) NOT NULL,
      original_bahan_baku_id INT DEFAULT NULL,
      original_nama VARCHAR(200) DEFAULT NULL,
      new_bahan_baku_id INT NOT NULL,
      jumlah DECIMAL(10,2) NOT NULL DEFAULT 0,
      persen_bdd DECIMAL(5,1) NOT NULL DEFAULT 100,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_override (tenant_id, siklus_id, hari_ke, jenjang, original_bahan_baku_id, original_nama),
      INDEX idx_override_lookup (tenant_id, siklus_id, hari_ke, jenjang),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (siklus_id) REFERENCES siklus_menu(id) ON DELETE CASCADE,
      FOREIGN KEY (new_bahan_baku_id) REFERENCES bahan_baku(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    log('✓ Migrasi perencanaan_override: tabel dibuat');
  } catch (e) { log('  (skip perencanaan_override): ' + e.message); }

  log('✓ Migrasi selesai!');
  return logs;
}

// Jika dijalankan langsung sebagai CLI
if (require.main === module) {
  (async () => {
    try {
      await runMigration();
      process.exit(0);
    } catch (e) {
      console.error('✗ Migrate gagal:', e.message);
      process.exit(1);
    }
  })();
}

module.exports = { runMigration };
