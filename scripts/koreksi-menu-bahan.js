/**
 * KOREKSI: menu_bahan.jumlah
 * ===========================
 * 
 * Masalah: formula di processBahanItem() sebelumnya menyimpan:
 *   jumlah = berat1Sp * spVal * jumlahPorsi
 * 
 * Seharusnya hanya:
 *   jumlah = berat1Sp * spVal  (gram per siswa)
 * 
 * Karena endpoint kebutuhan-per-menu nantinya mengalikan lagi dengan jmlPm:
 *   beratBersih = br.jumlah * jmlPm
 * 
 * Script ini memperbaiki data yang sudah terlanjur salah dengan cara:
 *   1. Ambil semua menu_bahan + menu.kategori_penerima
 *   2. Load jumlah penerima manfaat per kategori
 *   3. Bagi menu_bahan.jumlah dengan jumlahPorsi (jika > 0)
 *   4. Update nilai yang sudah diperbaiki
 *   5. Recalculate nutrisi menu
 *
 * Usage: node scripts/koreksi-menu-bahan.js
 */

const db = require('../db');
const { loadSpRefMap, calculateNutrition } = require('../routes/menu/helpers');
const { JENJANG_DB_MAP } = require('../routes/siklus/helpers');
require('dotenv').config();

/**
 * Cari total PM untuk suatu kategori dengan mapping DB
 * (menggunakan JENJANG_DB_MAP dari routes/siklus/helpers.js)
 */
function cariJumlahPorsi(kat, pmByKategori) {
  if (!kat) return 0;
  // Exact match first
  if (pmByKategori[kat]) return pmByKategori[kat];
  // Coba mapping display → db values (dari helpers.js)
  const dbVals = JENJANG_DB_MAP[kat];
  if (dbVals) {
    let total = 0;
    for (const dv of dbVals) {
      total += pmByKategori[dv] || 0;
    }
    return total;
  }
  return 0;
}

/**
 * Jalankan koreksi untuk semua tenant atau satu tenant tertentu
 * @param {number|null} tenantId - ID tenant (optional, null = semua tenant)
 * @returns {Promise<{total: number, corrected: number, tenants: number}>}
 */
async function runKoreksiMenuBahan(tenantId) {
  const logs = [];
  const log = (msg) => { console.log(msg); logs.push(msg); };

  log('=== KOREKSI DATA menu_bahan.jumlah ===');

  const whereClause = tenantId ? 'WHERE id=?' : '';
  const params = tenantId ? [tenantId] : [];
  const [tenants] = await db.query(`SELECT id, nama FROM tenants ${whereClause}`, params);
  log(`Ditemukan ${tenants.length} tenant`);

  let totalCorrected = 0;
  let totalRows = 0;

  for (const t of tenants) {
    log(`── Tenant: ${t.nama} (id=${t.id}) ──`);

    // Load jumlah penerima manfaat per kategori (raw dari DB)
    const [pmRows] = await db.query(
      `SELECT kategori_penerima, COALESCE(SUM(paket_besar + paket_kecil), 0) AS total
       FROM penerima_manfaat
       WHERE tenant_id=? AND kategori_penerima IS NOT NULL AND kategori_penerima != 'null'
       GROUP BY kategori_penerima`,
      [t.id]
    );
    const pmByKategori = {};
    for (const r of pmRows) {
      pmByKategori[r.kategori_penerima] = Number(r.total);
    }
    log(`  PM per kategori (DB): ${JSON.stringify(pmByKategori)}`);

    // Ambil semua menu + menu_bahan
    const [menuBahan] = await db.query(
      `SELECT mb.id AS mb_id, mb.menu_id, mb.jumlah, m.kategori_penerima, m.nama AS menu_nama
       FROM menu_bahan mb
       JOIN menu m ON m.id = mb.menu_id
       WHERE m.tenant_id=?`,
      [t.id]
    );

    log(`  Total menu_bahan: ${menuBahan.length} baris`);
    totalRows += menuBahan.length;

    let corrected = 0;
    let unchanged = 0;

    for (const mb of menuBahan) {
      const jumlahPorsi = cariJumlahPorsi(mb.kategori_penerima, pmByKategori);

      if (jumlahPorsi <= 0) {
        log(`  ⚠ "${mb.menu_nama}" (kat=${mb.kategori_penerima}): tidak ada PM, SKIP`);
        unchanged++;
        continue;
      }

      const jumlahLama = Number(mb.jumlah);
      const jumlahBaru = Math.round((jumlahLama / jumlahPorsi) * 100) / 100;

      if (Math.abs(jumlahLama - jumlahBaru) <= 0.01 || jumlahBaru <= 0) {
        unchanged++;
        continue;
      }

      await db.query('UPDATE menu_bahan SET jumlah=? WHERE id=?', [jumlahBaru, mb.mb_id]);
      log(`  ✓ "${mb.menu_nama}" (kat=${mb.kategori_penerima}, ${jumlahPorsi} PM): ${jumlahLama}g → ${jumlahBaru}g`);
      corrected++;
    }

    log(`  Hasil: ${corrected} diperbaiki, ${unchanged} tidak berubah`);
    totalCorrected += corrected;

    // Recalculate nutrisi
    const spRefMap = await loadSpRefMap(t.id);
    const [menuBahanJoin] = await db.query(
      `SELECT DISTINCT mb.menu_id, mb.jumlah, bb.nama, bb.kalori, bb.protein, bb.karbohidrat, bb.lemak, bb.serat
       FROM menu_bahan mb
       JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
       WHERE mb.menu_id IN (SELECT id FROM menu WHERE tenant_id=?)`,
      [t.id]
    );
    const bahanByMenu = {};
    for (const b of menuBahanJoin) {
      if (!bahanByMenu[b.menu_id]) bahanByMenu[b.menu_id] = [];
      bahanByMenu[b.menu_id].push(b);
    }

    const [menus] = await db.query('SELECT id FROM menu WHERE tenant_id=?', [t.id]);
    for (const menu of menus) {
      const bahan = bahanByMenu[menu.id] || [];
      const nut = calculateNutrition(bahan, spRefMap);
      await db.query(
        `UPDATE menu SET gramasi_total=?, kalori=?, protein=?, karbohidrat=?, lemak=?, serat=?
         WHERE id=? AND tenant_id=?`,
        [nut.gramasi, nut.kalori, nut.protein, nut.karbohidrat, nut.lemak, nut.serat, menu.id, t.id]
      );
    }
    log(`  ${menus.length} menu nutrisi diperbarui`);
  }

  log(`\n✓ Koreksi selesai! ${totalCorrected} dari ${totalRows} baris diperbaiki`);
  return { total: totalRows, corrected: totalCorrected, tenants: tenants.length, logs };
}

module.exports = { runKoreksiMenuBahan };

// CLI mode
if (require.main === module) {
  (async () => {
    try {
      await runKoreksiMenuBahan(null);
      process.exit(0);
    } catch (e) {
      console.error('✗ Gagal:', e.message);
      console.error(e.stack);
      process.exit(1);
    }
  })();
}
