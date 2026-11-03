/**
 * Script untuk menampilkan data resep_map dari tabel siklus_menu_item
 * Jalankan: node scripts/cek-resep-map.js
 */
const db = require('../db');

(async () => {
  try {
    const [rows] = await db.query(`
      SELECT 
        si.id,
        si.siklus_id,
        sm.nama AS siklus_nama,
        si.hari_ke,
        si.hari_nama,
        si.menu_nama,
        si.resep_map
      FROM siklus_menu_item si
      JOIN siklus_menu sm ON sm.id = si.siklus_id
      WHERE si.resep_map IS NOT NULL AND si.resep_map != ''
      ORDER BY sm.id DESC, si.hari_ke ASC
    `);

    console.log('=== Data resep_map dari siklus_menu_item ===\n');

    if (!rows.length) {
      console.log('Tidak ada data resep_map yang terisi.');
      console.log('Cek juga apakah kolom resep_map berisi NULL atau string kosong:');

      const [allRows] = await db.query(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN resep_map IS NULL THEN 1 ELSE 0 END) AS null_count,
               SUM(CASE WHEN resep_map = '' OR resep_map = '{}' THEN 1 ELSE 0 END) AS empty_count,
               SUM(CASE WHEN resep_map IS NOT NULL AND resep_map != '' AND resep_map != '{}' THEN 1 ELSE 0 END) AS filled_count
        FROM siklus_menu_item
      `);
      console.log(`  Total item: ${allRows[0].total}`);
      console.log(`  NULL: ${allRows[0].null_count}`);
      console.log(`  Empty/'{}': ${allRows[0].empty_count}`);
      console.log(`  Terisi: ${allRows[0].filled_count}`);
    }

    for (const r of rows) {
      console.log('─'.repeat(60));
      console.log(`ID: ${r.id} | Siklus: ${r.siklus_nama} (${r.siklus_id})`);
      console.log(`Hari: H${r.hari_ke} (${r.hari_nama}) | Menu: ${r.menu_nama || '-'}`);
      console.log(`resep_map (TEXT): ${r.resep_map}`);
      
      try {
        const parsed = typeof r.resep_map === 'string' ? JSON.parse(r.resep_map) : r.resep_map;
        console.log('resep_map (PARSED):');
        console.log(JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.log(`⚠️  Gagal parse JSON: ${e.message}`);
      }
      console.log('');
    }

    // Juga cek item tanpa resep_map TAPI punya bahan di grid
    const [gridItems] = await db.query(`
      SELECT DISTINCT si.siklus_id, sm.nama AS siklus_nama, si.hari_ke, si.hari_nama, si.menu_nama
      FROM siklus_menu_item si
      JOIN siklus_menu sm ON sm.id = si.siklus_id
      WHERE EXISTS (
        SELECT 1 FROM siklus_menu_item_bahan sb 
        WHERE sb.siklus_id = si.siklus_id AND sb.hari_ke = si.hari_ke
      )
      AND (si.resep_map IS NULL OR si.resep_map = '' OR si.resep_map = '{}')
      ORDER BY sm.id DESC, si.hari_ke ASC
    `);

    if (gridItems.length) {
      console.log('\n=== Item dengan grid bahan TAPI tanpa resep_map ===\n');
      for (const r of gridItems) {
        console.log(`  • ${r.siklus_nama} | H${r.hari_ke} (${r.hari_nama}) | Menu: ${r.menu_nama || '-'}`);
      }
      console.log(`\nTotal: ${gridItems.length} item — item ini harusnya dapat grid-based resep dari fix terbaru`);
    }

    console.log('\n✓ Selesai');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
