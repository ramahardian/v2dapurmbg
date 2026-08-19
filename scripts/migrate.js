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

  // Tabel Template Menu Manual — menu manual (bahan grid) yang disimpan terpisah
  // dari siklus agar bisa dipakai ulang di siklus aktif maupun siklus mendatang.
  await q(`CREATE TABLE IF NOT EXISTS siklus_menu_template (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    nama VARCHAR(200) NOT NULL,
    jumlah_porsi INT DEFAULT 0,
    kalori DECIMAL(10,2) DEFAULT 0,
    protein DECIMAL(10,2) DEFAULT 0,
    karbohidrat DECIMAL(10,2) DEFAULT 0,
    lemak DECIMAL(10,2) DEFAULT 0,
    serat DECIMAL(10,2) DEFAULT 0,
    foto LONGTEXT DEFAULT NULL,
    resep_map TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    INDEX idx_template_tenant (tenant_id)
  ) ENGINE=InnoDB`);
  log('[OK] Tabel siklus_menu_template tersedia');

  await q(`CREATE TABLE IF NOT EXISTS siklus_menu_template_bahan (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_id INT NOT NULL,
    kategori_sp VARCHAR(50) NOT NULL,
    bahan_baku_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (template_id) REFERENCES siklus_menu_template(id) ON DELETE CASCADE,
    FOREIGN KEY (bahan_baku_id) REFERENCES bahan_baku(id),
    INDEX idx_template_bahan (template_id)
  ) ENGINE=InnoDB`);
  log('[OK] Tabel siklus_menu_template_bahan tersedia');

  // Tabel Snapshot PM Harian (jumlah porsi besar/kecil per tanggal per titik)
  await q(`CREATE TABLE IF NOT EXISTS pm_harian (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    tanggal DATE NOT NULL,
    penerima_manfaat_id INT NOT NULL,
    nama_titik VARCHAR(255) NOT NULL,
    kategori_penerima VARCHAR(255) DEFAULT NULL,
    paket_besar INT DEFAULT 0,
    paket_besar_utama INT DEFAULT 0,
    paket_kecil INT DEFAULT 0,
    sample INT DEFAULT 0,
    guru_tendik INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE KEY uk_pm_tanggal_titik (tenant_id, tanggal, penerima_manfaat_id),
    INDEX idx_tanggal (tenant_id, tanggal)
  ) ENGINE=InnoDB`);
  log('[OK] Tabel pm_harian tersedia');

  // Kolom Paket Besar (Utama), Sample & Guru/Tendik di pm_harian (snapshot PM harian)
  try {
    const [pmCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pm_harian' AND COLUMN_NAME IN ('paket_besar_utama','sample','guru_tendik')");
    const pmExisting = new Set(pmCols.map(c => c.COLUMN_NAME));
    const pmAdds = [];
    if (!pmExisting.has('paket_besar_utama')) pmAdds.push('ADD COLUMN paket_besar_utama INT DEFAULT 0 AFTER paket_besar');
    if (!pmExisting.has('sample')) pmAdds.push('ADD COLUMN sample INT DEFAULT 0 AFTER paket_kecil');
    if (!pmExisting.has('guru_tendik')) pmAdds.push('ADD COLUMN guru_tendik INT DEFAULT 0 AFTER sample');
    if (pmAdds.length) {
      await q('ALTER TABLE pm_harian ' + pmAdds.join(', '));
      log('✓ Migrasi pm_harian: tambah kolom paket_besar_utama, sample & guru_tendik');
    }
  } catch (e) { log('  (skip migrasi pm_harian baru): ' + e.message); }

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

  // Kolom Sample & Guru/Tendik di penerima_manfaat (jumlah sampel uji mutu & guru/tendik per kelompok)
  try {
    const [pmNewCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'penerima_manfaat' AND COLUMN_NAME IN ('sample','guru_tendik')");
    const pmExisting = new Set(pmNewCols.map(c => c.COLUMN_NAME));
    const pmAdds = [];
    if (!pmExisting.has('sample')) pmAdds.push('ADD COLUMN sample INT DEFAULT 0 AFTER paket_kecil');
    if (!pmExisting.has('guru_tendik')) pmAdds.push('ADD COLUMN guru_tendik INT DEFAULT 0 AFTER sample');
    if (pmAdds.length) {
      await q('ALTER TABLE penerima_manfaat ' + pmAdds.join(', '));
      log('✓ Migrasi penerima_manfaat: tambah kolom sample & guru_tendik');
    }
  } catch (e) { log('  (skip migrasi sample/guru_tendik): ' + e.message); }

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

  // Per-cabang: tabel jabatan — tambah tenant_id jika belum ada
  try {
    const [jbCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jabatan' AND COLUMN_NAME = 'tenant_id'");
    if (!jbCols.length) {
      await q("ALTER TABLE jabatan ADD COLUMN tenant_id INT NULL AFTER id, ADD INDEX idx_jabatan_tenant (tenant_id)");
      await q("UPDATE jabatan SET tenant_id=1 WHERE tenant_id IS NULL");
      log('✓ Migrasi jabatan: tambah kolom tenant_id');
    }
    // Perbaiki id jabatan agar AUTO_INCREMENT (dulu dibuat tanpa auto increment)
    const [jbAuto] = await q("SELECT EXTRA FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jabatan' AND COLUMN_NAME = 'id'");
    if (jbAuto.length && jbAuto[0].EXTRA !== 'auto_increment') {
      await q('ALTER TABLE jabatan MODIFY id INT NOT NULL AUTO_INCREMENT');
      log('✓ Migrasi jabatan: id → AUTO_INCREMENT');
    }
  } catch (e) { log('  (skip migrasi jabatan tenant): ' + e.message); }

  // Per-cabang: tabel standar_sp — tambah tenant_id + unique key per tenant
  try {
    const [ssCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'standar_sp' AND COLUMN_NAME = 'tenant_id'");
    if (!ssCols.length) {
      await q("ALTER TABLE standar_sp ADD COLUMN tenant_id INT NULL AFTER id, ADD INDEX idx_standar_sp_tenant (tenant_id)");
      await q("UPDATE standar_sp SET tenant_id=1 WHERE tenant_id IS NULL");
      // Ganti unique key lama (jenjang, kategori_sp) → (tenant_id, jenjang, kategori_sp)
      await q("ALTER TABLE standar_sp DROP INDEX uk_jenjang_kategori");
      await q("ALTER TABLE standar_sp ADD UNIQUE KEY uk_jenjang_kategori_tenant (tenant_id, jenjang, kategori_sp)");
      log('✓ Migrasi standar_sp: tambah kolom tenant_id');
    }
  } catch (e) { log('  (skip migrasi standar_sp tenant): ' + e.message); }

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

  // Users foto VARCHAR(255) → LONGTEXT (base64)
  try {
    const [ftCol] = await q("SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'foto' AND DATA_TYPE != 'longtext'");
    if (ftCol.length) {
      await q("ALTER TABLE users MODIFY foto LONGTEXT DEFAULT NULL");
      log('✓ Migrasi users: foto VARCHAR(255) → LONGTEXT untuk base64');
    }
  } catch (e) { log('  (skip migrasi foto longtext)'); }

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

  // Foto base64: menu & siklus_menu_item VARCHAR(255) → LONGTEXT
  for (const tbl of ['menu', 'siklus_menu_item']) {
    try {
      const [ftCol] = await q(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tbl}' AND COLUMN_NAME = 'foto' AND DATA_TYPE != 'longtext'`);
      if (ftCol.length) {
        await q(`ALTER TABLE ${tbl} MODIFY foto LONGTEXT DEFAULT NULL`);
        log(`✓ Migrasi ${tbl}: foto VARCHAR(255) → LONGTEXT untuk base64`);
      }
    } catch (e) { log(`  (skip migrasi foto longtext ${tbl})`); }
  }

  // id_koperasi
  try {
    const [ikCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bahan_baku' AND COLUMN_NAME = 'id_koperasi'");
    if (!ikCols.length) {
      await q("ALTER TABLE bahan_baku ADD COLUMN id_koperasi INT NULL AFTER id, ADD INDEX idx_id_koperasi (id_koperasi)");
      await q("UPDATE bahan_baku SET id_koperasi = CAST(REPLACE(kode, 'EXT-', '') AS UNSIGNED) WHERE kode LIKE 'EXT-%' AND id_koperasi IS NULL");
      log('✓ Migrasi bahan_baku: tambah kolom id_koperasi');
    }
  } catch (e) { log('  (skip migrasi id_koperasi)'); }

  // no_po_koperasi & no_invoice_koperasi di purchase_order
  try {
    const [npCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order' AND COLUMN_NAME = 'no_po_koperasi'");
    if (!npCols.length) {
      await q("ALTER TABLE purchase_order ADD COLUMN no_po_koperasi VARCHAR(100) NULL AFTER no_po, ADD COLUMN no_invoice_koperasi VARCHAR(100) NULL AFTER no_po_koperasi");
      log('✓ Migrasi purchase_order: tambah kolom no_po_koperasi + no_invoice_koperasi');
    }
  } catch (e) { log('  (skip migrasi no_po_koperasi)'); }

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
      tenant_id INT NULL,
      jenjang VARCHAR(50) NOT NULL,
      kategori_sp VARCHAR(50) NOT NULL,
      sp_value DECIMAL(5,2) NOT NULL,
      INDEX idx_standar_sp_tenant (tenant_id),
      UNIQUE KEY uk_jenjang_kategori_tenant (tenant_id, jenjang, kategori_sp)
    ) ENGINE=InnoDB`);
    const [[standarCnt]] = await q("SELECT COUNT(*) as c FROM standar_sp");
    if (standarCnt.c === 0) {
      await q(`INSERT IGNORE INTO standar_sp (tenant_id, jenjang, kategori_sp, sp_value) VALUES
      (1, 'Ibu Hamil', 'Karbohidrat', 2.5), (1, 'Ibu Hamil', 'Protein Hewani', 2), (1, 'Ibu Hamil', 'Protein Nabati', 1),
      (1, 'Ibu Hamil', 'Sayur', 1), (1, 'Ibu Hamil', 'Buah', 1), (1, 'Ibu Hamil', 'Susu', 1), (1, 'Ibu Hamil', 'Minyak', 1.5),
      (1, 'Ibu Menyusui', 'Karbohidrat', 2.5), (1, 'Ibu Menyusui', 'Protein Hewani', 2), (1, 'Ibu Menyusui', 'Protein Nabati', 1),
      (1, 'Ibu Menyusui', 'Sayur', 1), (1, 'Ibu Menyusui', 'Buah', 1), (1, 'Ibu Menyusui', 'Susu', 1), (1, 'Ibu Menyusui', 'Minyak', 1.5),
      (1, 'Balita', 'Karbohidrat', 0.8), (1, 'Balita', 'Protein Hewani', 1), (1, 'Balita', 'Protein Nabati', 0.25),
      (1, 'Balita', 'Sayur', 0.25), (1, 'Balita', 'Buah', 1), (1, 'Balita', 'Susu', 1), (1, 'Balita', 'Minyak', 1),
      (1, 'TK/PAUD', 'Karbohidrat', 0.8), (1, 'TK/PAUD', 'Protein Hewani', 1), (1, 'TK/PAUD', 'Protein Nabati', 0.25),
      (1, 'TK/PAUD', 'Sayur', 0.25), (1, 'TK/PAUD', 'Buah', 1), (1, 'TK/PAUD', 'Susu', 1), (1, 'TK/PAUD', 'Minyak', 1),
      (1, 'SD 1-3', 'Karbohidrat', 1), (1, 'SD 1-3', 'Protein Hewani', 1), (1, 'SD 1-3', 'Protein Nabati', 0.25),
      (1, 'SD 1-3', 'Sayur', 0.25), (1, 'SD 1-3', 'Buah', 1), (1, 'SD 1-3', 'Susu', 1), (1, 'SD 1-3', 'Minyak', 1),
      (1, 'SD 4-6', 'Karbohidrat', 1.75), (1, 'SD 4-6', 'Protein Hewani', 1.5), (1, 'SD 4-6', 'Protein Nabati', 0.5),
      (1, 'SD 4-6', 'Sayur', 0.5), (1, 'SD 4-6', 'Buah', 1), (1, 'SD 4-6', 'Susu', 1), (1, 'SD 4-6', 'Minyak', 1.5),
      (1, 'SMP', 'Karbohidrat', 2), (1, 'SMP', 'Protein Hewani', 1.5), (1, 'SMP', 'Protein Nabati', 1),
      (1, 'SMP', 'Sayur', 0.5), (1, 'SMP', 'Buah', 1), (1, 'SMP', 'Susu', 1), (1, 'SMP', 'Minyak', 1.5),
      (1, 'SMA', 'Karbohidrat', 2), (1, 'SMA', 'Protein Hewani', 2), (1, 'SMA', 'Protein Nabati', 1),
      (1, 'SMA', 'Sayur', 1), (1, 'SMA', 'Buah', 1), (1, 'SMA', 'Susu', 1), (1, 'SMA', 'Minyak', 1.5)`);
    }
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

  // Seed sp_referensi_bahan untuk tenant utama (id=1); cabang baru disalin dari sini saat signup
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

  // Seed default akun HANYA untuk tenant utama (id=1) — cabang baru mulai tanpa akun
  try {
    const [tenants] = await q('SELECT id FROM tenants');
    const [existingAkun] = await q('SELECT COUNT(*) as cnt FROM akun WHERE tenant_id=1');
    if (tenants.length && !existingAkun[0].cnt) {
      const seedAkun = [
        ['1000', 'Petty Cash/Cash in Hand', 'BP Kas', 'Manual'],
        ['1100', 'Kas di Bank', 'BP Kas', 'Manual'],
        ['1300', 'Persediaan Bahan Baku', 'BP Persediaan', 'Otomatis'],
        ['2000', 'Dana Bahan Baku', 'BP Jenis Dana', 'Manual'],
        ['2100', 'Dana Operasional', 'BP Jenis Dana', 'Manual'],
        ['3000', 'Hutang Usaha', 'BP Hutang', 'Otomatis'],
      ];
      for (const [kode, nama, bp, tipe] of seedAkun) {
        await q('INSERT IGNORE INTO akun (tenant_id, kode, nama, bp, tipe) VALUES (?,?,?,?,?)', [1, kode, nama, bp, tipe]);
      }
      log('✓ Seed akun: data default untuk tenant utama');
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

  // telepon di tenants (kop surat distribusi)
  try {
    const [tlpCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants' AND COLUMN_NAME = 'telepon'");
    if (!tlpCols.length) {
      await q("ALTER TABLE tenants ADD COLUMN telepon VARCHAR(30) DEFAULT NULL AFTER alamat");
      log('✓ Migrasi tenants: tambah kolom telepon');
    }
  } catch (e) { log('  (skip migrasi telepon tenants)'); }

  // Hapus kolom subdomain dari tenants (fitur subdomain dihapus dari sistem)
  try {
    const [sdCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants' AND COLUMN_NAME = 'subdomain'");
    if (sdCols.length) {
      await q("ALTER TABLE tenants DROP INDEX uk_subdomain, DROP COLUMN subdomain");
      log('✓ Migrasi tenants: kolom subdomain dihapus (fitur subdomain dinonaktifkan)');
    }
  } catch (e) { log('  (skip hapus subdomain): ' + e.message); }

  // koperasi_id_unit_dapur & koperasi_nama_dapur di tenants — identitas dapur di sistem koperasi
  // (dipakai default filter Riwayat Koperasi & kirim PO ke koperasi)
  try {
    const [kopCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants' AND COLUMN_NAME = 'koperasi_id_unit_dapur'");
    if (!kopCols.length) {
      await q("ALTER TABLE tenants ADD COLUMN koperasi_id_unit_dapur VARCHAR(20) DEFAULT NULL AFTER telepon, ADD COLUMN koperasi_nama_dapur VARCHAR(200) DEFAULT NULL AFTER koperasi_id_unit_dapur");
      log('✓ Migrasi tenants: tambah kolom koperasi_id_unit_dapur + koperasi_nama_dapur');
    }
  } catch (e) { log('  (skip migrasi koperasi dapur): ' + e.message); }

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

  // tanggal_selesai di siklus_menu — akhir rentang waktu siklus.
  // Dipakai untuk auto-arsip: siklus yang sudah lewat rentang waktu
  // otomatis berstatus Arsip dan disembunyikan dari pilihan /menu.
  try {
    const [tsCol] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'siklus_menu' AND COLUMN_NAME = 'tanggal_selesai'");
    if (!tsCol.length) {
      await q("ALTER TABLE siklus_menu ADD COLUMN tanggal_selesai DATE DEFAULT NULL AFTER tanggal_mulai");
      log('✓ Migrasi siklus_menu: tambah kolom tanggal_selesai');
    }
    // Backfill: tanggal_selesai = tanggal_mulai + total_hari - 1 untuk siklus lama
    const [upd] = await q(
      "UPDATE siklus_menu SET tanggal_selesai = DATE_ADD(tanggal_mulai, INTERVAL total_hari - 1 DAY) WHERE tanggal_selesai IS NULL AND tanggal_mulai IS NOT NULL AND total_hari > 0"
    );
    if (upd.affectedRows > 0) log(`✓ Migrasi siklus_menu: backfill tanggal_selesai ${upd.affectedRows} baris`);
  } catch (e) { log('  (skip migrasi tanggal_selesai): ' + e.message); }

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

  // Ubah foto_masuk & foto_keluar VARCHAR(255) → TEXT untuk base64
  try {
    const [fkCol] = await q("SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'absensi' AND COLUMN_NAME = 'foto_masuk' AND DATA_TYPE != 'text'");
    if (fkCol.length) {
      await q("ALTER TABLE absensi MODIFY foto_masuk TEXT DEFAULT NULL, MODIFY foto_keluar TEXT DEFAULT NULL");
      log('✓ Migrasi absensi: foto_masuk & foto_keluar VARCHAR → TEXT');
    }
  } catch (e) { log('  (skip migrasi foto text)'); }

  // distribusi penerima_manfaat_id
  try {
    const [pmCol] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'distribusi' AND COLUMN_NAME = 'penerima_manfaat_id'");
    if (!pmCol.length) {
      await q("ALTER TABLE distribusi ADD COLUMN penerima_manfaat_id INT NULL AFTER titik_distribusi, ADD FOREIGN KEY (penerima_manfaat_id) REFERENCES penerima_manfaat(id) ON DELETE SET NULL");
      log('✓ Migrasi distribusi: tambah kolom penerima_manfaat_id');
    }
  } catch (e) { log('  (skip migrasi distribusi)'); }

  // distribusi no_surat_jalan (auto-generated SJ/YYYY/MM/XXXX)
  try {
    const [nsjCol] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'distribusi' AND COLUMN_NAME = 'no_surat_jalan'");
    if (!nsjCol.length) {
      await q("ALTER TABLE distribusi ADD COLUMN no_surat_jalan VARCHAR(30) NULL AFTER tenant_id");
      log('✓ Migrasi distribusi: tambah kolom no_surat_jalan');
    }
  } catch (e) { log('  (skip migrasi no_surat_jalan distribusi)'); }

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
      [process.env.ADMIN_TENANT_NAME || 'Sppg Sukaluyu Tamansari', 'enterprise']);
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

  // jumlah_porsi di menu
  try {
    const [jpCol] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu' AND COLUMN_NAME = 'jumlah_porsi'");
    if (!jpCol.length) {
      await q("ALTER TABLE menu ADD COLUMN jumlah_porsi INT DEFAULT 0 AFTER serat");
      log('✓ Migrasi menu: tambah kolom jumlah_porsi');
    }
  } catch (e) { log('  (skip migrasi jumlah_porsi menu)'); }

  // Multi-jenjang di siklus_menu
  try {
    const [kpCol] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'siklus_menu' AND COLUMN_NAME = 'kategori_penerima' AND DATA_TYPE = 'text'");
    if (!kpCol.length) {
      await q("ALTER TABLE siklus_menu MODIFY COLUMN kategori_penerima TEXT");
      log('✓ Migrasi siklus_menu: kategori_penerima → TEXT (multi jenjang)');
    }
  } catch (e) { log('  (skip migrasi kategori_penerima TEXT): ' + e.message); }

  // Multi-jenjang di menu — kolom varchar(50) meluap saat kategori diambil dari
  // siklus multi-jenjang (mis. ["TK/PAUD","SD 1-3","SD 4-6","SMP","SMA","Posyandu"]
  // = 52 karakter) → simpan menu gagal dengan ER_DATA_TOO_LONG.
  try {
    const [menuKpCol] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu' AND COLUMN_NAME = 'kategori_penerima' AND DATA_TYPE = 'text'");
    if (!menuKpCol.length) {
      await q("ALTER TABLE menu MODIFY COLUMN kategori_penerima TEXT");
      log('✓ Migrasi menu: kategori_penerima → TEXT (multi jenjang)');
    }
  } catch (e) { log('  (skip migrasi kategori_penerima menu TEXT): ' + e.message); }

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

  // Budget: porsi_besar, porsi_kecil, harga_besar, harga_kecil
  // Cek per kolom (bukan hanya porsi_besar) agar migrasi parsial — mis. kolom
  // porsi_besar/porsi_kecil sudah ada tapi harga_besar/harga_kecil belum —
  // tetap terdeteksi dan kolom yang kurang langsung ditambahkan.
  try {
    const [budgetCols] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'budget' AND COLUMN_NAME IN ('porsi_besar','porsi_kecil','harga_besar','harga_kecil')");
    const existingCols = new Set(budgetCols.map(c => c.COLUMN_NAME));
    const budgetAdds = [];
    if (!existingCols.has('porsi_besar')) budgetAdds.push('ADD COLUMN porsi_besar INT DEFAULT 0 AFTER kategori_penerima');
    if (!existingCols.has('porsi_kecil')) budgetAdds.push('ADD COLUMN porsi_kecil INT DEFAULT 0 AFTER porsi_besar');
    if (!existingCols.has('harga_besar')) budgetAdds.push('ADD COLUMN harga_besar DECIMAL(15,2) DEFAULT 0 AFTER harga_per_porsi');
    if (!existingCols.has('harga_kecil')) budgetAdds.push('ADD COLUMN harga_kecil DECIMAL(15,2) DEFAULT 0 AFTER harga_besar');
    if (budgetAdds.length) {
      await q('ALTER TABLE budget ' + budgetAdds.join(', '));
      log('✓ Migrasi budget: tambah kolom ' + budgetAdds.map(a => a.replace('ADD COLUMN ', '').split(' ')[0]).join(', '));
    }
  } catch (e) { log('  (skip migrasi porsi_besar/harga_kecil budget): ' + e.message); }

  // Soft-delete untuk notifikasi (deleted_by_pengirim / deleted_by_penerima)
  try {
    const [dpCol] = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifikasi' AND COLUMN_NAME = 'deleted_by_pengirim'");
    if (!dpCol.length) {
      await q("ALTER TABLE notifikasi ADD COLUMN deleted_by_pengirim TINYINT(1) DEFAULT 0 AFTER is_read, ADD COLUMN deleted_by_penerima TINYINT(1) DEFAULT 0 AFTER deleted_by_pengirim, ADD INDEX idx_notif_pengirim (pengirim_id), ADD INDEX idx_notif_delete_sender (pengirim_id, deleted_by_pengirim), ADD INDEX idx_notif_delete_receiver (penerima_id, deleted_by_penerima)");
      log('✓ Migrasi notifikasi: tambah kolom deleted_by_pengirim & deleted_by_penerima');
    }
  } catch (e) { log('  (skip migrasi soft-delete notifikasi): ' + e.message); }

  // Event hapus foto absensi setiap hari Minggu 23:59
  try {
    await q(`SET GLOBAL event_scheduler = ON`);
    await q(`DROP EVENT IF EXISTS hapus_foto_absensi`);
    await q(`CREATE EVENT hapus_foto_absensi ON SCHEDULE EVERY 1 DAY STARTS (TIMESTAMP(CURRENT_DATE) + INTERVAL 23 HOUR + INTERVAL 59 MINUTE) DO IF DAYOFWEEK(CURRENT_DATE) = 1 THEN UPDATE absensi SET foto_masuk = NULL, foto_keluar = NULL WHERE foto_masuk IS NOT NULL OR foto_keluar IS NOT NULL; END IF`);
    log('✓ Event hapus_foto_absensi dibuat (setiap Minggu 23:59)');
  } catch (e) { log('  (skip event hapus foto): ' + e.message); }

  // Tabel user_activity_log — riwayat user online (login & heartbeat)
  try {
    await q(`CREATE TABLE IF NOT EXISTS user_activity_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      user_id INT NOT NULL,
      nama VARCHAR(200) DEFAULT NULL,
      role VARCHAR(50) DEFAULT NULL,
      event ENUM('login','heartbeat') NOT NULL DEFAULT 'heartbeat',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_activity_tenant_created (tenant_id, created_at),
      INDEX idx_activity_user (user_id, created_at)
    ) ENGINE=InnoDB`);
    log('✓ Migrasi user_activity_log: tabel dibuat');
  } catch (e) { log('  (skip user_activity_log): ' + e.message); }

  // Upgrade user_activity_log → riwayat PER KEJADIAN (log kronologis).
  // Sebelumnya desain 1 baris per user (merge) dengan unique key uk_activity_user;
  // sekarang setiap login/heartbeat dicatat sebagai baris BARU agar modal
  // "Riwayat User Online" menampilkan kronologi yang sebenarnya.
  // Data lama yang sudah ter-merge dibiarkan (tidak bisa direkonstruksi
  // per-kejadian); hitungan login lamanya tetap tersimpan di login_count.
  try {
    const [[col]] = await q(`SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_activity_log' AND COLUMN_NAME = 'login_count'`);
    if (!col.n) {
      await q(`ALTER TABLE user_activity_log ADD COLUMN login_count INT NOT NULL DEFAULT 0`);
      log('✓ user_activity_log: kolom login_count ditambahkan');
    }
    const [[uk]] = await q(`SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_activity_log' AND INDEX_NAME = 'uk_activity_user'`);
    if (uk.n) {
      await q(`ALTER TABLE user_activity_log DROP INDEX uk_activity_user`);
      log('✓ user_activity_log: unique key uk_activity_user dihapus (banyak baris per user diperbolehkan)');
    }
    log('✓ user_activity_log: mode riwayat per kejadian siap');
  } catch (e) { log('  (skip upgrade user_activity_log): ' + e.message); }

  // Tabel chat — pesan antar user online (room 'umum' bersama + privat 1-on-1 'uA:uB')
  try {
    await q(`CREATE TABLE IF NOT EXISTS chat_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      room VARCHAR(60) NOT NULL,
      sender_id INT NOT NULL,
      sender_nama VARCHAR(150) DEFAULT NULL,
      sender_role VARCHAR(50) DEFAULT NULL,
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_chat_room_id (tenant_id, room, id),
      INDEX idx_chat_sender (sender_id)
    ) ENGINE=InnoDB`);
    log('✓ Migrasi chat_messages: tabel dibuat');
  } catch (e) { log('  (skip chat_messages): ' + e.message); }

  // Tabel chat_reads — penanda pesan terakhir yang sudah dibaca tiap user per room
  try {
    await q(`CREATE TABLE IF NOT EXISTS chat_reads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      user_id INT NOT NULL,
      room VARCHAR(60) NOT NULL,
      last_read_id INT NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uk_chat_read (tenant_id, user_id, room),
      INDEX idx_chat_read_room (tenant_id, room)
    ) ENGINE=InnoDB`);
    log('✓ Migrasi chat_reads: tabel dibuat');
  } catch (e) { log('  (skip chat_reads): ' + e.message); }

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
