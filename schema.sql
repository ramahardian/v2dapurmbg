-- ===========================================
-- MBG Kitchen SaaS — MySQL Schema
-- Multi-tenant: setiap data discope per tenant_id (dapur)
-- ===========================================

CREATE DATABASE IF NOT EXISTS mbg_kitchen CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mbg_kitchen;

-- Tenants (dapur / unit MBG)
CREATE TABLE IF NOT EXISTS tenants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(150) NOT NULL,
  alamat TEXT,
  plan ENUM('free','pro','enterprise') DEFAULT 'free',
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Users (per tenant)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nama VARCHAR(150) NOT NULL,
  role ENUM('admin','ahli_gizi','gudang','keuangan','produksi') DEFAULT 'produksi',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_email (email),
  INDEX idx_users_tenant (tenant_id)
) ENGINE=InnoDB;

-- Penerima Manfaat
CREATE TABLE IF NOT EXISTS penerima_manfaat (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  nama_kelompok VARCHAR(200) NOT NULL,
  paket_besar INT DEFAULT 0,
  paket_kecil INT DEFAULT 0,
  lokasi VARCHAR(255),
  keterangan TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB;

-- Bahan Baku (master)
CREATE TABLE IF NOT EXISTS bahan_baku (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  kode VARCHAR(50),
  nama VARCHAR(200) NOT NULL,
  kategori VARCHAR(100),
  satuan VARCHAR(20) NOT NULL,
  harga_satuan DECIMAL(15,2) DEFAULT 0,
  stok_saat_ini DECIMAL(15,3) DEFAULT 0,
  stok_minimum DECIMAL(15,3) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB;

-- Menu & Gizi
CREATE TABLE IF NOT EXISTS menu (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  nama VARCHAR(200) NOT NULL,
  kategori_penerima VARCHAR(50),
  deskripsi TEXT,
  gramasi_total DECIMAL(10,2) DEFAULT 0,
  kalori DECIMAL(10,2) DEFAULT 0,
  protein DECIMAL(10,2) DEFAULT 0,
  karbohidrat DECIMAL(10,2) DEFAULT 0,
  lemak DECIMAL(10,2) DEFAULT 0,
  serat DECIMAL(10,2) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB;

-- Komposisi bahan per menu
CREATE TABLE IF NOT EXISTS menu_bahan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  menu_id INT NOT NULL,
  bahan_baku_id INT NOT NULL,
  jumlah DECIMAL(15,3) NOT NULL,
  FOREIGN KEY (menu_id) REFERENCES menu(id) ON DELETE CASCADE,
  FOREIGN KEY (bahan_baku_id) REFERENCES bahan_baku(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Supplier
CREATE TABLE IF NOT EXISTS supplier (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  nama VARCHAR(200) NOT NULL,
  kategori_supply VARCHAR(100),
  kontak_person VARCHAR(100),
  telepon VARCHAR(50),
  email VARCHAR(150),
  alamat TEXT,
  npwp VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB;

-- Purchase Order (PR -> PO -> Invoice)
CREATE TABLE IF NOT EXISTS purchase_order (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  no_po VARCHAR(50) NOT NULL,
  tanggal DATE NOT NULL,
  supplier_id INT,
  supplier_nama VARCHAR(200),
  item TEXT,
  total_nilai DECIMAL(15,2) DEFAULT 0,
  status ENUM('Draft','Disetujui','Dikirim','Diterima','Dibayar') DEFAULT 'Draft',
  catatan TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB;

-- Penerimaan Barang
CREATE TABLE IF NOT EXISTS penerimaan_barang (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  no_dokumen VARCHAR(50) NOT NULL,
  tanggal_terima DATE NOT NULL,
  supplier_nama VARCHAR(200),
  ref_po VARCHAR(50),
  item TEXT,
  total_nilai DECIMAL(15,2) DEFAULT 0,
  status_qc ENUM('Lolos','Retur Sebagian','Ditolak') DEFAULT 'Lolos',
  catatan TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB;

-- Stok Masuk & Keluar
CREATE TABLE IF NOT EXISTS stok_masuk (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  tanggal DATE NOT NULL,
  bahan_baku_id INT NOT NULL,
  jumlah DECIMAL(15,3) NOT NULL,
  sumber VARCHAR(200),
  catatan TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (bahan_baku_id) REFERENCES bahan_baku(id),
  INDEX idx_stok_masuk_tanggal (tenant_id, tanggal),
  INDEX idx_stok_masuk_bahan (bahan_baku_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stok_keluar (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  tanggal DATE NOT NULL,
  bahan_baku_id INT NOT NULL,
  jumlah DECIMAL(15,3) NOT NULL,
  tujuan VARCHAR(200),
  catatan TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (bahan_baku_id) REFERENCES bahan_baku(id),
  INDEX idx_stok_keluar_tanggal (tenant_id, tanggal),
  INDEX idx_stok_keluar_bahan (bahan_baku_id)
) ENGINE=InnoDB;

-- Produksi & Distribusi
CREATE TABLE IF NOT EXISTS produksi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  tanggal_produksi DATE NOT NULL,
  menu_id INT,
  menu_nama VARCHAR(200),
  kategori_penerima VARCHAR(50),
  jumlah_porsi INT DEFAULT 0,
  status ENUM('Direncanakan','Diproduksi','Packing','Selesai') DEFAULT 'Direncanakan',
  catatan TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS distribusi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  tanggal_distribusi DATE NOT NULL,
  titik_distribusi VARCHAR(200),
  kategori_penerima VARCHAR(50),
  jumlah_porsi INT DEFAULT 0,
  kurir VARCHAR(100),
  status ENUM('Dalam Perjalanan','Diterima','Gagal') DEFAULT 'Dalam Perjalanan',
  catatan TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB;

-- Budgeting
CREATE TABLE IF NOT EXISTS budget (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  periode VARCHAR(50) NOT NULL,
  kategori_penerima VARCHAR(50),
  jumlah_penerima INT DEFAULT 0,
  harga_per_porsi DECIMAL(15,2) DEFAULT 0,
  biaya_operasional DECIMAL(15,2) DEFAULT 0,
  total_budget DECIMAL(15,2) DEFAULT 0,
  realisasi DECIMAL(15,2) DEFAULT 0,
  catatan TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB;

-- Kas & Bank
CREATE TABLE IF NOT EXISTS kas_bank (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  tanggal DATE NOT NULL,
  no_transaksi VARCHAR(50),
  tipe ENUM('masuk','keluar') NOT NULL,
  kategori VARCHAR(100),
  akun VARCHAR(100),
  deskripsi TEXT,
  jumlah DECIMAL(15,2) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id),
  INDEX idx_kas_tipe (tenant_id, tipe),
  INDEX idx_kas_tanggal (tenant_id, tanggal)
) ENGINE=InnoDB;

-- Siklus Menu (untuk ahli gizi)
CREATE TABLE IF NOT EXISTS siklus_menu (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  nama VARCHAR(200) NOT NULL,
  kategori_penerima VARCHAR(50),
  jumlah_porsi INT DEFAULT 0,
  total_hari INT DEFAULT 7,
  status ENUM('Draft','Aktif','Arsip') DEFAULT 'Draft',
  catatan TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS siklus_menu_item (
  id INT AUTO_INCREMENT PRIMARY KEY,
  siklus_id INT NOT NULL,
  hari_ke INT NOT NULL,
  hari_nama VARCHAR(20) NOT NULL,
  menu_id INT,
  menu_nama VARCHAR(200),
  jumlah_porsi INT DEFAULT 0,
  kalori DECIMAL(10,2) DEFAULT 0,
  protein DECIMAL(10,2) DEFAULT 0,
  karbohidrat DECIMAL(10,2) DEFAULT 0,
  lemak DECIMAL(10,2) DEFAULT 0,
  serat DECIMAL(10,2) DEFAULT 0,
  FOREIGN KEY (siklus_id) REFERENCES siklus_menu(id) ON DELETE CASCADE,
  INDEX idx_siklus (siklus_id)
) ENGINE=InnoDB;

-- Tambah kolom nutrisi ke bahan_baku (dijalankan oleh migrate.js dengan pengecekan)

-- Karyawan
CREATE TABLE IF NOT EXISTS karyawan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  nama VARCHAR(200) NOT NULL,
  nik VARCHAR(50),
  jabatan VARCHAR(100),
  departemen VARCHAR(100),
  gaji_pokok DECIMAL(15,2) DEFAULT 0,
  status ENUM('Aktif','Cuti','Resign') DEFAULT 'Aktif',
  tanggal_masuk DATE,
  email VARCHAR(150),
  phone VARCHAR(50),
  address TEXT,
  photo VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB;

-- Absensi
CREATE TABLE IF NOT EXISTS absensi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  karyawan_id INT NOT NULL,
  tanggal DATE NOT NULL,
  status ENUM('Hadir','Sakit','Izin','Cuti','Alpha') DEFAULT 'Hadir',
  jam_masuk TIME,
  jam_keluar TIME,
  keterangan TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (karyawan_id) REFERENCES karyawan(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id),
  INDEX idx_karyawan (karyawan_id),
  INDEX idx_absensi_tanggal (tenant_id, tanggal)
) ENGINE=InnoDB;

-- Shift (jadwal kerja per divisi)
CREATE TABLE IF NOT EXISTS shift (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  nama VARCHAR(100) NOT NULL,
  departemen VARCHAR(100) NOT NULL,
  jam_masuk TIME NOT NULL,
  jam_keluar TIME NOT NULL,
  warna VARCHAR(7) DEFAULT '#3B82F6',
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB;

-- Jadwal Karyawan (penugasan shift per periode)
CREATE TABLE IF NOT EXISTS jadwal_karyawan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  karyawan_id INT NOT NULL,
  shift_id INT NOT NULL,
  tanggal_mulai DATE NOT NULL,
  tanggal_selesai DATE,
  hari_kerja VARCHAR(50) DEFAULT '1,2,3,4,5,6,7',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (karyawan_id) REFERENCES karyawan(id) ON DELETE CASCADE,
  FOREIGN KEY (shift_id) REFERENCES shift(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id),
  INDEX idx_karyawan (karyawan_id),
  INDEX idx_jadwal_shift (shift_id),
  INDEX idx_jadwal_tanggal (tenant_id, tanggal_mulai)
) ENGINE=InnoDB;

-- Alter absensi: tambah kolom shift_id (jika belum ada)
-- Note: MySQL tidak mendukung IF NOT EXISTS untuk ADD COLUMN, gunakan query terpisah jika perlu

-- Payroll
CREATE TABLE IF NOT EXISTS payroll (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  karyawan_id INT NOT NULL,
  bulan INT NOT NULL,
  tahun INT NOT NULL,
  gaji_pokok DECIMAL(15,2) DEFAULT 0,
  tunjangan DECIMAL(15,2) DEFAULT 0,
  potongan DECIMAL(15,2) DEFAULT 0,
  total_gaji DECIMAL(15,2) DEFAULT 0,
  status ENUM('Draft','Disetujui','Dibayar') DEFAULT 'Draft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (karyawan_id) REFERENCES karyawan(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id),
  INDEX idx_karyawan (karyawan_id),
  INDEX idx_payroll_periode (tenant_id, tahun, bulan)
) ENGINE=InnoDB;

-- Divisi
CREATE TABLE IF NOT EXISTS divisi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  nama VARCHAR(100) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB;
