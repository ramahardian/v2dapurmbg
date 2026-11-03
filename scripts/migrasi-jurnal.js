/**
 * Migrasi Jurnal Umum & Double Entry Accounting
 * ==============================================
 * 1. Tambah kolom kelompok (AKTIVA/KEWAJIBAN/EKUITAS/PENDAPATAN/BIAYA) di akun
 * 2. Buat tabel jurnal & jurnal_detail
 * 3. Seed default COA untuk semua tenant yang belum punya
 */

async function runMigrasiJurnal(conn, tenant_id = null) {
  const logs = [];

  // ── 1. Tabel Jurnal (header) ──
  const [jurnalExists] = await conn.query("SHOW TABLES LIKE 'jurnal'");
  if (!jurnalExists.length) {
    await conn.query(`
      CREATE TABLE jurnal (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        no_jurnal VARCHAR(50) NOT NULL,
        tanggal DATE NOT NULL,
        sumber_transaksi VARCHAR(50) DEFAULT NULL COMMENT 'kas_bank/purchase_order/payroll/manual',
        sumber_id INT DEFAULT NULL,
        deskripsi TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_sumber (sumber_transaksi, sumber_id),
        INDEX idx_tanggal (tenant_id, tanggal)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logs.push('✓ Tabel jurnal dibuat');
  } else {
    logs.push('✓ Tabel jurnal sudah ada');
  }

  // ── 2. Tabel Jurnal Detail ──
  const [jdExists] = await conn.query("SHOW TABLES LIKE 'jurnal_detail'");
  if (!jdExists.length) {
    await conn.query(`
      CREATE TABLE jurnal_detail (
        id INT AUTO_INCREMENT PRIMARY KEY,
        jurnal_id INT NOT NULL,
        akun_id INT NOT NULL,
        debit DECIMAL(15,2) DEFAULT 0,
        kredit DECIMAL(15,2) DEFAULT 0,
        deskripsi TEXT,
        FOREIGN KEY (jurnal_id) REFERENCES jurnal(id) ON DELETE CASCADE,
        FOREIGN KEY (akun_id) REFERENCES akun(id),
        INDEX idx_jurnal (jurnal_id),
        INDEX idx_akun (akun_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logs.push('✓ Tabel jurnal_detail dibuat');
  } else {
    logs.push('✓ Tabel jurnal_detail sudah ada');
  }

  // ── 3. Tambah kolom kelompok di akun ──
  const [kelCol] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'akun' AND COLUMN_NAME = 'kelompok'`
  );
  if (!kelCol.length) {
    await conn.query(`
      ALTER TABLE akun
      ADD COLUMN kelompok ENUM('AKTIVA','KEWAJIBAN','EKUITAS','PENDAPATAN','BIAYA') NULL AFTER tipe,
      ADD COLUMN saldo_normal ENUM('Debit','Kredit') DEFAULT 'Debit' AFTER kelompok
    `);
    logs.push('✓ Kolom kelompok & saldo_normal ditambahkan ke akun');

    // Update existing accounts with proper kelompok
    await conn.query(`UPDATE akun SET kelompok='AKTIVA', saldo_normal='Debit' WHERE kode LIKE '1%' AND kelompok IS NULL`);
    await conn.query(`UPDATE akun SET kelompok='KEWAJIBAN', saldo_normal='Kredit' WHERE kode LIKE '2%' AND kelompok IS NULL`);
    await conn.query(`UPDATE akun SET kelompok='EKUITAS', saldo_normal='Kredit' WHERE kode LIKE '3%' AND kelompok IS NULL`);
    await conn.query(`UPDATE akun SET kelompok='PENDAPATAN', saldo_normal='Kredit' WHERE kode LIKE '4%' AND kelompok IS NULL`);
    await conn.query(`UPDATE akun SET kelompok='BIAYA', saldo_normal='Debit' WHERE kode LIKE '5%' AND kelompok IS NULL`);
    logs.push('✓ Kelompok akun diupdate dari kode');
  } else {
    logs.push('✓ Kolom kelompok sudah ada');
  }

  // ── 4. Seed Default COA untuk tenant tertentu atau semua ──
  const targetTenants = tenant_id ? [tenant_id] : [];
  if (!targetTenants.length) {
    const [tenants] = await conn.query('SELECT id FROM tenants WHERE is_active=1');
    for (const t of tenants) targetTenants.push(t.id);
  }

  const DEFAULT_COA = [
    // AKTIVA (1xxx)
    { kode: '1100', nama: 'Kas', bp: 'BP Kas', kelompok: 'AKTIVA', saldo_normal: 'Debit' },
    { kode: '1101', nama: 'Bank BNI', bp: 'BP Kas', kelompok: 'AKTIVA', saldo_normal: 'Debit' },
    { kode: '1102', nama: 'Bank Mandiri', bp: 'BP Kas', kelompok: 'AKTIVA', saldo_normal: 'Debit' },
    { kode: '1200', nama: 'Piutang Usaha', bp: 'BP Kas', kelompok: 'AKTIVA', saldo_normal: 'Debit' },
    { kode: '1300', nama: 'Persediaan Bahan Baku', bp: 'BP Kas', kelompok: 'AKTIVA', saldo_normal: 'Debit' },
    { kode: '1400', nama: 'Peralatan Dapur', bp: 'BP Operasional', kelompok: 'AKTIVA', saldo_normal: 'Debit' },
    // KEWAJIBAN (2xxx)
    { kode: '2100', nama: 'Hutang Usaha / Supplier', bp: 'BP Operasional', kelompok: 'KEWAJIBAN', saldo_normal: 'Kredit' },
    { kode: '2200', nama: 'Hutang Gaji', bp: 'BP Operasional', kelompok: 'KEWAJIBAN', saldo_normal: 'Kredit' },
    // EKUITAS (3xxx)
    { kode: '3100', nama: 'Modal', bp: 'BP Kas', kelompok: 'EKUITAS', saldo_normal: 'Kredit' },
    { kode: '3200', nama: 'Saldo Laba Ditahan', bp: 'BP Kas', kelompok: 'EKUITAS', saldo_normal: 'Kredit' },
    // PENDAPATAN (4xxx)
    { kode: '4100', nama: 'Pendapatan Dana BOS', bp: 'BP Jenis Dana', kelompok: 'PENDAPATAN', saldo_normal: 'Kredit' },
    { kode: '4101', nama: 'Pendapatan Dana APBD', bp: 'BP Jenis Dana', kelompok: 'PENDAPATAN', saldo_normal: 'Kredit' },
    { kode: '4102', nama: 'Pendapatan Lain-lain', bp: 'BP Jenis Dana', kelompok: 'PENDAPATAN', saldo_normal: 'Kredit' },
    // BIAYA (5xxx)
    { kode: '5100', nama: 'Biaya Bahan Baku', bp: 'BP Operasional', kelompok: 'BIAYA', saldo_normal: 'Debit' },
    { kode: '5101', nama: 'Biaya Bahan Baku - Karbohidrat', bp: 'BP Operasional', kelompok: 'BIAYA', saldo_normal: 'Debit' },
    { kode: '5102', nama: 'Biaya Bahan Baku - Protein', bp: 'BP Operasional', kelompok: 'BIAYA', saldo_normal: 'Debit' },
    { kode: '5103', nama: 'Biaya Bahan Baku - Sayur', bp: 'BP Operasional', kelompok: 'BIAYA', saldo_normal: 'Debit' },
    { kode: '5104', nama: 'Biaya Bahan Baku - Buah & Susu', bp: 'BP Operasional', kelompok: 'BIAYA', saldo_normal: 'Debit' },
    { kode: '5200', nama: 'Biaya Gaji & Tunjangan', bp: 'BP Operasional', kelompok: 'BIAYA', saldo_normal: 'Debit' },
    { kode: '5300', nama: 'Biaya Operasional Dapur', bp: 'BP Operasional', kelompok: 'BIAYA', saldo_normal: 'Debit' },
    { kode: '5301', nama: 'Biaya Transportasi', bp: 'BP Operasional', kelompok: 'BIAYA', saldo_normal: 'Debit' },
    { kode: '5302', nama: 'Biaya ATK & Perlengkapan', bp: 'BP Operasional', kelompok: 'BIAYA', saldo_normal: 'Debit' },
    { kode: '5400', nama: 'Biaya Lainnya', bp: 'BP Operasional', kelompok: 'BIAYA', saldo_normal: 'Debit' },
  ];

  let seededCount = 0;
  for (const tid of targetTenants) {
    for (const coa of DEFAULT_COA) {
      const [existing] = await conn.query(
        'SELECT id FROM akun WHERE tenant_id=? AND kode=?',
        [tid, coa.kode]
      );
      if (!existing.length) {
        await conn.query(
          `INSERT INTO akun (tenant_id, kode, nama, bp, tipe, kelompok, saldo_normal, is_active)
           VALUES (?, ?, ?, ?, 'Otomatis', ?, ?, 1)`,
          [tid, coa.kode, coa.nama, coa.bp, coa.kelompok, coa.saldo_normal]
        );
        seededCount++;
      }
    }
  }
  logs.push(`✓ ${seededCount} akun default ditambahkan`);

  return logs;
}

module.exports = { runMigrasiJurnal };
