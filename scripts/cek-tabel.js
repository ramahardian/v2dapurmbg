const db = require('../db');
const path = require('path');
const fs = require('fs');

(async () => {
  try {
    // 1. Ambil daftar tabel dari schema.sql
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    const schemaTables = [];
    const regex = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?`?(\w+)`?\s*\(/gi;
    let match;
    while ((match = regex.exec(schemaContent)) !== null) {
      schemaTables.push(match[1]);
    }

    // 2. Ambil daftar tabel dari database
    const [dbTables] = await db.query('SHOW TABLES');
    const dbTableNames = dbTables.map(r => Object.values(r)[0]);

    // 3. Bandingkan
    const ada = [];
    const tidakAda = [];
    for (const t of schemaTables) {
      if (dbTableNames.includes(t)) {
        ada.push(t);
      } else {
        tidakAda.push(t);
      }
    }

    // 4. Tabel tambahan di DB (tidak ada di schema)
    const tambahan = dbTableNames.filter(t => !schemaTables.includes(t));

    console.log('========================================');
    console.log('  CEK KESESUAIAN TABEL DATABASE');
    console.log('========================================\n');

    console.log(`Total tabel di schema.sql : ${schemaTables.length}`);
    console.log(`Total tabel di database   : ${dbTableNames.length}\n`);

    console.log('--- TABEL YANG ADA ---');
    ada.sort().forEach((t, i) => console.log(`  ${(i+1).toString().padStart(2,' ')}. ✅ ${t}`));

    console.log('\n--- ❌ TABEL YANG TIDAK ADA DI DATABASE ---');
    if (tidakAda.length === 0) {
      console.log('  (semua tabel sudah ada)');
    } else {
      tidakAda.sort().forEach((t, i) => console.log(`  ${(i+1).toString().padStart(2,' ')}. ❌ ${t}`));
    }

    if (tambahan.length > 0) {
      console.log('\n--- TABEL TAMBAHAN (ada di DB tapi tidak di schema.sql) ---');
      tambahan.sort().forEach((t, i) => console.log(`  ${(i+1).toString().padStart(2,' ')}. ⚠️ ${t}`));
    }

    console.log('\n========================================');
    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
