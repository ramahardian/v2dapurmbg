/**
 * KOREKSI: menu_bahan.jumlah yang TIDAK WAJAR (terlalu besar)
 * ===========================================================
 * Masalah: menu_bahan.jumlah adalah gram per porsi (gram/siswa),
 * tapi sebagian tersimpan sangat besar (mis. Beras 8.800 g/porsi,
 * seharusnya ~50 g/porsi) → kebutuhan di /total-kebutuhan berlipat.
 *
 * Nilai benar diambil dari:
 *   bahan_baku.berat_1_sp          (Berat 1 SP dalam gram) — prioritas
 *   sp_referensi_bahan.berat_bersih (fallback via subquery MAX)
 *
 * Kriteria "tidak wajar": jumlah > 1000 (g/porsi) ATAU jumlah > 10x berat_1_sp.
 *
 * Mode:
 *   (tanpa argumen)  → DRY-RUN: hanya preview apa yang akan diubah
 *   --apply          → perbaiki jumlah + backup + hitung ulang nutrisi
 *   --recalc         → HANYA hitung ulang nutrisi menu
 *   --tenant <id>    → batasi ke satu tenant (default: semua tenant)
 *
 * Usage:
 *   node scripts/koreksi-menu-bahan-jumlah.js                    # dry-run semua tenant
 *   node scripts/koreksi-menu-bahan-jumlah.js --tenant 1         # dry-run tenant 1
 *   node scripts/koreksi-menu-bahan-jumlah.js --apply            # perbaiki + recalc
 *   node scripts/koreksi-menu-bahan-jumlah.js --recalc           # recalc nutrisi saja
 */

const db = require('../db');
const { loadSpRefMap, calculateNutrition } = require('../routes/menu/helpers');
require('dotenv').config();

const APPLY = process.argv.includes('--apply');
const RECALC = process.argv.includes('--recalc');
let TENANT_ID = null;
{
  const idx = process.argv.indexOf('--tenant');
  if (idx !== -1 && process.argv[idx + 1]) {
    TENANT_ID = parseInt(process.argv[idx + 1], 10) || null;
  }
}

// Cache spRefMap per tenant agar tidak query berulang
const spRefCache = {};
async function getSpRefMap(tenantId) {
  if (!spRefCache[tenantId]) {
    spRefCache[tenantId] = await loadSpRefMap(tenantId);
  }
  return spRefCache[tenantId];
}

/** Hitung ulang nutrisi (gramasi/kalori/dll.) untuk menu yang diberikan. */
async function recalcNutrisi(menuIds, log) {
  if (!menuIds || !menuIds.length) return 0;
  const uniq = [...new Set(menuIds)];
  const ph = uniq.map(() => '?').join(',');
  const [bahanRows] = await db.query(
    `SELECT DISTINCT mb.menu_id, mb.jumlah, bb.nama, bb.kalori, bb.protein, bb.karbohidrat, bb.lemak, bb.serat
     FROM menu_bahan mb
     JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
     WHERE mb.menu_id IN (${ph})`,
    uniq
  );
  const bahanByMenu = {};
  for (const b of bahanRows) {
    if (!bahanByMenu[b.menu_id]) bahanByMenu[b.menu_id] = [];
    bahanByMenu[b.menu_id].push(b);
  }

  const [menus] = await db.query(`SELECT id, tenant_id FROM menu WHERE id IN (${ph})`, uniq);
  for (const menu of menus) {
    const spRefMap = await getSpRefMap(menu.tenant_id);
    const nut = calculateNutrition(bahanByMenu[menu.id] || [], spRefMap);
    await db.query(
      `UPDATE menu SET gramasi_total=?, kalori=?, protein=?, karbohidrat=?, lemak=?, serat=? WHERE id=?`,
      [nut.gramasi, nut.kalori, nut.protein, nut.karbohidrat, nut.lemak, nut.serat, menu.id]
    );
  }
  log(`✓ Nutrisi ${menus.length} menu dihitung ulang`);
  return menus.length;
}

async function runKoreksiMenuBahanJumlah(apply, recalc, tenantId) {
  const logs = [];
  const log = (msg) => { console.log(msg); logs.push(msg); };

  // Backup table scoped per tenant agar rollback tenant lain tidak tertimpa
  const backupTable = 'backup_menu_bahan_sebelum_koreksi' + (tenantId ? '_' + tenantId : '');

  log('=== KOREKSI menu_bahan.jumlah (tidak wajar / terlalu besar) ===');
  if (tenantId) log(`Tenant: ${tenantId}`);
  if (recalc) {
    log('Mode: RECALC — hanya menghitung ulang nutrisi menu');
  } else if (apply) {
    log('Mode: APPLY — data AKAN diubah + nutrisi dihitung ulang');
  } else {
    log('Mode: DRY-RUN — tidak ada perubahan, hanya preview');
  }
  log('');

  // ── Mode RECALC: hanya hitung ulang nutrisi menu ──
  if (recalc) {
    const menuParams = tenantId ? [tenantId] : [];
    const menuWhere = tenantId ? ' WHERE tenant_id=?' : '';
    const [menus] = await db.query(`SELECT id FROM menu${menuWhere}`, menuParams);
    const n = await recalcNutrisi(menus.map(m => m.id), log);
    log('');
    log('✓ Recalc selesai.');
    return { total: menus.length, corrected: 0, skipped: 0, recalc: n, logs };
  }

  // ── Backup (saat apply) ──
  if (apply) {
    await db.query(`DROP TABLE IF EXISTS ${backupTable}`);
    const where = tenantId ? 'WHERE m.tenant_id=?' : '';
    const params = tenantId ? [tenantId] : [];
    await db.query(`CREATE TABLE ${backupTable} AS
      SELECT mb.*, m.nama AS menu_nama, b.nama AS bahan_nama, b.berat_1_sp
      FROM menu_bahan mb
      JOIN menu m       ON m.id = mb.menu_id
      JOIN bahan_baku b ON b.id = mb.bahan_baku_id
      ${where}`, params);
    log('✓ Backup dibuat: ' + backupTable);
  }

  // ── Ambil baris yang tidak wajar ──
  const where = tenantId ? 'AND m.tenant_id=?' : '';
  const params = tenantId ? [tenantId] : [];
  const [rows] = await db.query(`
    SELECT mb.id AS mb_id, mb.menu_id, mb.jumlah,
           m.nama AS menu_nama,
           b.nama AS bahan_nama, b.berat_1_sp,
           (SELECT MAX(s.berat_bersih) FROM sp_referensi_bahan s
            WHERE s.nama = b.nama AND s.tenant_id = b.tenant_id) AS sp_ref_g
    FROM menu_bahan mb
    JOIN menu m       ON m.id = mb.menu_id
    JOIN bahan_baku b ON b.id = mb.bahan_baku_id
    WHERE (mb.jumlah > 1000 OR (b.berat_1_sp > 0 AND mb.jumlah > b.berat_1_sp * 10))
      ${where}
    ORDER BY mb.jumlah DESC
  `, params);

  log(`Ditemukan ${rows.length} baris menu_bahan dengan jumlah tidak wajar`);
  if (!rows.length) {
    log('');
    log('✓ Tidak ada data yang perlu diperbaiki.');
    return { total: 0, corrected: 0, skipped: 0, logs };
  }

  // ── Tampilkan preview / perbaiki ──
  let corrected = 0;
  let skipped = 0;
  const affectedMenuIds = [];

  for (const r of rows) {
    const target = Number(r.berat_1_sp) > 0
      ? Number(r.berat_1_sp)
      : (Number(r.sp_ref_g) > 0 ? Number(r.sp_ref_g) : 0);

    if (target <= 0) {
      log(`  ⚠ SKIP (tidak ada referensi berat): "${r.menu_nama}" / ${r.bahan_nama} = ${r.jumlah}g`);
      skipped++;
      continue;
    }

    affectedMenuIds.push(r.menu_id);
    log(`  ${apply ? '✓' : '•'} "${r.menu_nama}" / ${r.bahan_nama}: ${r.jumlah}g → ${target}g`);

    if (apply) {
      await db.query('UPDATE menu_bahan SET jumlah=? WHERE id=?', [target, r.mb_id]);
      corrected++;
    }
  }

  // ── Recalculate nutrisi menu yang terpengaruh (saat apply) ──
  if (apply && affectedMenuIds.length) {
    log('');
    await recalcNutrisi(affectedMenuIds, log);
  }

  log('');
  if (apply) {
    log(`✓ Selesai: ${corrected} diperbaiki, ${skipped} di-skip (perlu cek manual)`);
    log(`  Backup tersimpan di tabel: ${backupTable}`);
  } else {
    log('Ini hanya preview — jalankan dengan --apply untuk memperbaiki data.');
    log(`(akan memperbaiki ${rows.length - skipped} baris, ${skipped} di-skip)`);
  }

  return { total: rows.length, corrected, skipped, logs };
}

module.exports = { runKoreksiMenuBahanJumlah };

// CLI mode
if (require.main === module) {
  (async () => {
    try {
      await runKoreksiMenuBahanJumlah(APPLY, RECALC, TENANT_ID);
      process.exit(0);
    } catch (e) {
      console.error('✗ Gagal:', e.message);
      console.error(e.stack);
      process.exit(1);
    }
  })();
}
