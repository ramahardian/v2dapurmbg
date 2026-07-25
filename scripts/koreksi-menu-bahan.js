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
require('dotenv').config();

(async () => {
  try {
    console.log('=== KOREKSI DATA menu_bahan.jumlah ===\n');
    
    // 1. Load semua tenant
    const [tenants] = await db.query('SELECT id, nama FROM tenants');
    console.log(`Ditemukan ${tenants.length} tenant\n`);

    for (const t of tenants) {
      console.log(`── Tenant: ${t.nama} (id=${t.id}) ──`);

      // 2. Load jumlah penerima manfaat per kategori
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
      console.log(`  Jumlah PM per kategori:`, pmByKategori);

      // 3. Ambil semua menu + menu_bahan
      const [menuBahan] = await db.query(
        `SELECT mb.id AS mb_id, mb.menu_id, mb.jumlah, m.kategori_penerima, m.nama AS menu_nama
         FROM menu_bahan mb
         JOIN menu m ON m.id = mb.menu_id
         WHERE m.tenant_id=?`,
        [t.id]
      );

      console.log(`  Total menu_bahan: ${menuBahan.length} baris`);

      let corrected = 0;
      let unchanged = 0;

      for (const mb of menuBahan) {
        const kat = mb.kategori_penerima;
        const jumlahPorsi = kat ? (pmByKategori[kat] || 0) : 0;

        // Jika tidak ada jumlahPorsi, tidak bisa koreksi otomatis
        if (jumlahPorsi <= 0) {
          unchanged++;
          continue;
        }

        const jumlahLama = Number(mb.jumlah);
        const jumlahBaru = Math.round((jumlahLama / jumlahPorsi) * 100) / 100;

        // Hanya update jika ada perubahan signifikan
        if (Math.abs(jumlahLama - jumlahBaru) > 0.01 && jumlahBaru > 0) {
          await db.query('UPDATE menu_bahan SET jumlah=? WHERE id=?', [jumlahBaru, mb.mb_id]);
          console.log(`  ✓ Menu "${mb.menu_nama}" (id=${mb.menu_id}): ${jumlahLama}g → ${jumlahBaru}g (/${jumlahPorsi} siswa)`);
          corrected++;
        } else {
          unchanged++;
        }
      }

      console.log(`  Hasil: ${corrected} diperbaiki, ${unchanged} tidak berubah\n`);
    }

    // 4. Recalculate nutrisi semua menu
    console.log('\n=== Recalculate Nutrisi Menu ===\n');
    const { loadSpRefMap, calculateNutrition } = require('../routes/menu/helpers');

    for (const t of tenants) {
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

      const [menus] = await db.query('SELECT id, nama FROM menu WHERE tenant_id=?', [t.id]);
      let recalculated = 0;

      for (const menu of menus) {
        const bahan = bahanByMenu[menu.id] || [];
        const nut = calculateNutrition(bahan, spRefMap);
        await db.query(
          `UPDATE menu SET gramasi_total=?, kalori=?, protein=?, karbohidrat=?, lemak=?, serat=?
           WHERE id=? AND tenant_id=?`,
          [nut.gramasi, nut.kalori, nut.protein, nut.karbohidrat, nut.lemak, nut.serat, menu.id, t.id]
        );
        recalculated++;
      }

      console.log(`  Tenant id=${t.id}: ${recalculated} menu diperbarui nutrisinya`);
    }

    console.log('\n✓ Koreksi selesai!');
    process.exit(0);
  } catch (e) {
    console.error('✗ Gagal:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
