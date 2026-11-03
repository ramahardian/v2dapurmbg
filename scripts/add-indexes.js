/**
 * ADD DATABASE INDEXES
 * Script untuk menambah index yang kurang pada tabel-tabel yang sering di-JOIN
 * atau difilter. Setiap index dicek keberadaannya terlebih dahulu via SHOW INDEX
 * sebelum dibuat, sehingga aman dijalankan berulang kali.
 */
require('dotenv').config();

async function addIndexes() {
  const db = require('../db');
  const logs = [];
  const log = (msg) => { console.log(msg); logs.push(msg); };

  /**
   * Cek apakah index sudah ada di suatu tabel
   */
  async function indexExists(table, indexName) {
    const [rows] = await db.query("SHOW INDEX FROM ?? WHERE Key_name=?", [table, indexName]);
    return rows.length > 0;
  }

  /**
   * Buat index jika belum ada
   */
  async function createIndex(table, indexName, columns, options = {}) {
    if (await indexExists(table, indexName)) {
      log(`  ➡️ ${table}.${indexName} — sudah ada, skip`);
      return false;
    }
    const unique = options.unique ? 'UNIQUE ' : '';
    await db.query(`CREATE ${unique}INDEX \`${indexName}\` ON \`${table}\` (${columns})`);
    log(`  ✅ ${table}.${indexName} — ${columns}`);
    return true;
  }

  log('');
  log('🔧 === MENAMBAH INDEX DATABASE ===');
  log('');

  // ─── 1. KAS_BANK ──────────────────────────
  // JOIN dengan akun.id — sangat sering di laporan keuangan (laba-rugi, BP, arus kas)
  log('📊 Tabel: kas_bank');
  await createIndex('kas_bank', 'idx_kas_bank_akun_id', 'akun_id');
  // Composite untuk laporan BP Operasional & BP Kas (tenant_id, akun_id, tanggal)
  const hasKasTenantAkunTanggal = await indexExists('kas_bank', 'idx_kas_bank_tenant_akun_tanggal');
  if (!hasKasTenantAkunTanggal) {
    // Cek apakah sudah ada index composite untuk tenant_id + akun_id + tanggal
    const [existingKasIdx] = await db.query(
      "SHOW INDEX FROM kas_bank WHERE Column_name IN ('tenant_id','akun_id','tanggal') GROUP BY Key_name HAVING COUNT(*) >= 3"
    );
    if (existingKasIdx.length === 0) {
      await createIndex('kas_bank', 'idx_kas_bank_tenant_akun_tanggal', 'tenant_id, akun_id, tanggal');
    } else {
      log('  ➡️ kas_bank — sudah ada composite index untuk tenant_id + akun_id + tanggal, skip');
    }
  } else {
    log('  ➡️ kas_bank.idx_kas_bank_tenant_akun_tanggal — sudah ada, skip');
  }
  log('');

  // ─── 2. PURCHASE_ORDER ──────────────────
  // JOIN dengan supplier.id
  log('📊 Tabel: purchase_order');
  await createIndex('purchase_order', 'idx_po_supplier_id', 'supplier_id');
  // Filter by status (sering di laporan pembelian)
  await createIndex('purchase_order', 'idx_po_tenant_status', 'tenant_id, status');
  // Composite untuk laporan (tenant_id, tanggal, status)
  await createIndex('purchase_order', 'idx_po_tenant_tanggal_status', 'tenant_id, tanggal, status');
  log('');

  // ─── 3. PENERIMAAN_BARANG ────────────────
  // JOIN dengan supplier.id
  log('📊 Tabel: penerimaan_barang');
  await createIndex('penerimaan_barang', 'idx_pb_supplier_id', 'supplier_id');
  // Filter by status_qc
  await createIndex('penerimaan_barang', 'idx_pb_tenant_status_qc', 'tenant_id, status_qc');
  log('');

  // ─── 4. SIKLUS_MENU_ITEM ─────────────────
  // JOIN dengan menu.id di warehouse.js (kebutuhan-pangan)
  log('📊 Tabel: siklus_menu_item');
  await createIndex('siklus_menu_item', 'idx_smi_menu_id', 'menu_id');
  log('');

  // ─── 5. PRODUKSI ─────────────────────────
  // index (tenant_id, tanggal_produksi) — untuk query DATE_FORMAT di laporan RAB
  log('📊 Tabel: produksi');
  const hasProdTenantTanggal = await indexExists('produksi', 'idx_produksi_tenant_tanggal');
  if (!hasProdTenantTanggal) {
    // Cek apakah sudah ada composite yang mencakup tenant_id + tanggal_produksi
    const [existingIdx] = await db.query(
      "SHOW INDEX FROM produksi WHERE Column_name IN ('tenant_id','tanggal_produksi') GROUP BY Key_name HAVING COUNT(*) >= 2"
    );
    if (existingIdx.length === 0) {
      await createIndex('produksi', 'idx_produksi_tenant_tanggal', 'tenant_id, tanggal_produksi');
    } else {
      log('  ➡️ produksi — sudah ada composite index untuk tenant_id + tanggal_produksi, skip');
    }
  } else {
    log('  ➡️ produksi.idx_produksi_tenant_tanggal — sudah ada, skip');
  }
  log('');

  // ─── 6. PENERIMA_MANFAAT ────────────────
  // GROUP BY kategori_penerima di RAB queries
  log('📊 Tabel: penerima_manfaat');
  await createIndex('penerima_manfaat', 'idx_pm_tenant_kategori', 'tenant_id, kategori_penerima');
  log('');

  // ─── 7. BUDGET ───────────────────────────
  // Composite (tenant_id, periode) — untuk query umum
  log('📊 Tabel: budget');
  const hasBudgetTenantPeriode = await indexExists('budget', 'idx_budget_tenant_periode');
  // Cek apakah sudah ada index yang mencakup tenant_id + periode
  if (!hasBudgetTenantPeriode) {
    const [existingBudgetIdx] = await db.query(
      "SHOW INDEX FROM budget WHERE Column_name IN ('tenant_id','periode') GROUP BY Key_name HAVING COUNT(*) >= 2"
    );
    if (existingBudgetIdx.length === 0) {
      await createIndex('budget', 'idx_budget_tenant_periode', 'tenant_id, periode');
    } else {
      log('  ➡️ budget — sudah ada composite index untuk tenant_id + periode, skip');
    }
  } else {
    log('  ➡️ budget.idx_budget_tenant_periode — sudah ada, skip');
  }
  // Index untuk query referensi harga (tenant_id, periode, harga_per_porsi)
  await createIndex('budget', 'idx_budget_tenant_periode_harga', 'tenant_id, periode, harga_per_porsi');
  log('');

  // ─── 8. ABSENSI ──────────────────────────
  // Composite (tenant_id, karyawan_id, tanggal) — untuk query payroll mingguan
  log('📊 Tabel: absensi');
  const hasAbsensiTenantKaryawanTanggal = await indexExists('absensi', 'idx_absensi_tenant_karyawan_tanggal');
  if (!hasAbsensiTenantKaryawanTanggal) {
    const [existingAbsIdx] = await db.query(
      "SHOW INDEX FROM absensi WHERE Column_name IN ('tenant_id','karyawan_id','tanggal') GROUP BY Key_name HAVING COUNT(*) >= 3"
    );
    if (existingAbsIdx.length === 0) {
      await createIndex('absensi', 'idx_absensi_tenant_karyawan_tanggal', 'tenant_id, karyawan_id, tanggal');
    } else {
      log('  ➡️ absensi — sudah ada composite index untuk tenant_id + karyawan_id + tanggal, skip');
    }
  } else {
    log('  ➡️ absensi.idx_absensi_tenant_karyawan_tanggal — sudah ada, skip');
  }
  log('');

  // ─── 9. IJIN_CUTI ────────────────────────
  // Composite (tenant_id, status) — untuk query summary
  log('📊 Tabel: ijin_cuti');
  await createIndex('ijin_cuti', 'idx_ic_tenant_status', 'tenant_id, status');
  log('');

  // ─── 10. KARYAWAN ─────────────────────────
  // index untuk pencarian nama
  log('📊 Tabel: karyawan');
  await createIndex('karyawan', 'idx_karyawan_tenant_nama', 'tenant_id, nama');
  log('');

  // ─── 11. JADWAL_KARYAWAN ──────────────────
  // Composite (tenant_id, karyawan_id, tanggal_mulai) — untuk query jadwal per karyawan
  log('📊 Tabel: jadwal_karyawan');
  await createIndex('jadwal_karyawan', 'idx_jk_tenant_karyawan_tanggal', 'tenant_id, karyawan_id, tanggal_mulai');
  log('');

  log('✅ === SEMUA INDEX SELESAI DIPROSES ===');

  return logs;
}

if (require.main === module) {
  (async () => {
    try {
      await addIndexes();
      process.exit(0);
    } catch (e) {
      console.error('❌ Gagal:', e.message);
      process.exit(1);
    }
  })();
}

module.exports = { addIndexes };
