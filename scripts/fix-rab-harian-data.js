const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mbg_kitchen',
  });

  try {
    console.log('=== MEMPERBAIKI DATA RAB HARIAN ===\n');

    // 1. Cek siklus yang ada
    const [siklusList] = await conn.query(
      'SELECT id, nama, status, tanggal_mulai, total_hari, kategori_penerima, jumlah_porsi FROM siklus_menu ORDER BY id'
    );
    console.log('Siklus yang ada:');
    for (const s of siklusList) {
      console.log(`  id=${s.id} | ${s.nama} | status=${s.status} | tanggal_mulai=${s.tanggal_mulai} | hari=${s.total_hari} | porsi=${s.jumlah_porsi}`);
    }

    // 2. Cari siklus dengan status Draft yang punya tanggal_mulai
    const [draftSiklus] = await conn.query(
      "SELECT id, nama, tanggal_mulai, total_hari, kategori_penerima, jumlah_porsi FROM siklus_menu WHERE status='Draft' AND tanggal_mulai IS NOT NULL ORDER BY id LIMIT 1"
    );

    let targetId = null;

    if (draftSiklus.length > 0) {
      targetId = draftSiklus[0].id;
      console.log(`\nMenemukan siklus Draft: id=${targetId} "${draftSiklus[0].nama}"`);
      
      // Update status jadi Aktif
      await conn.query('UPDATE siklus_menu SET status=? WHERE id=?', ['Aktif', targetId]);
      console.log(`  ✅ Status diubah ke Aktif`);
    } else {
      // Cari siklus Aktif yang sudah ada
      const [aktifSiklus] = await conn.query(
        "SELECT id, nama, tanggal_mulai, total_hari, kategori_penerima, jumlah_porsi FROM siklus_menu WHERE status='Aktif' ORDER BY id LIMIT 1"
      );
      if (aktifSiklus.length > 0) {
        targetId = aktifSiklus[0].id;
        console.log(`\nSiklus Aktif ditemukan: id=${targetId} "${aktifSiklus[0].nama}"`);
      } else {
        console.log('\n❌ TIDAK ADA SIKLUS! Buat siklus baru...');
        // Buat siklus baru
        const [r] = await conn.query(
          "INSERT INTO siklus_menu (tenant_id, nama, kategori_penerima, jumlah_porsi, total_hari, status, tanggal_mulai) VALUES (1, 'Siklus Aktif', '[\"TK/PAUD\",\"Balita\"]', 180, 5, 'Aktif', '2026-07-26')"
        );
        targetId = r.insertId;
        console.log(`  ✅ Siklus baru id=${targetId} dibuat`);
      }
    }

    if (!targetId) {
      console.log('\n❌ Gagal menentukan target siklus');
      process.exit(1);
    }

    // 3. Cari menu yang punya menu_bahan
    const [menuWithBahan] = await conn.query(
      `SELECT m.id, m.nama, COUNT(mb.id) as bahan_count
       FROM menu m
       JOIN menu_bahan mb ON mb.menu_id = m.id
       GROUP BY m.id, m.nama
       ORDER BY bahan_count DESC
       LIMIT 5`
    );

    if (menuWithBahan.length === 0) {
      console.log('\n❌ TIDAK ADA MENU DENGAN BAHAN!');
      process.exit(1);
    }

    console.log(`\nMenu dengan bahan terbanyak:`);
    for (const m of menuWithBahan) {
      console.log(`  id=${m.id} | ${m.nama} | ${m.bahan_count} bahan`);
    }

    const bestMenu = menuWithBahan[0];

    // 4. Hapus siklus_menu_item lama
    await conn.query('DELETE FROM siklus_menu_item WHERE siklus_id=?', [targetId]);
    console.log(`\n✅ Hapus siklus_menu_item lama untuk siklus ${targetId}`);

    // 5. Dapatkan info siklus
    const [[siklusInfo]] = await conn.query(
      'SELECT id, total_hari, jumlah_porsi, kategori_penerima FROM siklus_menu WHERE id=?',
      [targetId]
    );
    const totalHari = siklusInfo.total_hari || 5;
    const totalPorsi = siklusInfo.jumlah_porsi || 180;
    const HARI_NAMES = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];

    // 6. Insert siklus_menu_item untuk setiap hari dengan menu_id yang valid
    for (let d = 0; d < totalHari; d++) {
      const menu = menuWithBahan[d % menuWithBahan.length];
      await conn.query(
        'INSERT INTO siklus_menu_item (siklus_id, hari_ke, hari_nama, menu_id, menu_nama, jumlah_porsi) VALUES (?,?,?,?,?,?)',
        [targetId, d + 1, HARI_NAMES[d % 7], menu.id, menu.nama, totalPorsi]
      );
    }
    console.log(`✅ Insert ${totalHari} hari siklus_menu_item dengan menu_id valid`);

    // 7. Verifikasi akhir
    console.log('\n=== VERIFIKASI ===');
    const [items] = await conn.query(
      `SELECT si.id, si.hari_ke, si.hari_nama, si.menu_id, si.menu_nama,
              (SELECT COUNT(*) FROM menu_bahan mb WHERE mb.menu_id = si.menu_id) as bahan_count
       FROM siklus_menu_item si
       WHERE si.siklus_id = ?
       ORDER BY si.hari_ke`,
      [targetId]
    );
    for (const item of items) {
      const status = item.bahan_count > 0 ? '✅' : '❌';
      console.log(`  Hari ${item.hari_ke} (${item.hari_nama}): menu_id=${item.menu_id} "${item.menu_nama}" — ${item.bahan_count} bahan ${status}`);
    }

    const allValid = items.every(i => i.bahan_count > 0);
    if (allValid) {
      console.log('\n🎉 SEMUA DATA SIAP! RAB Harian seharusnya bisa tampil sekarang.');
    } else {
      console.log('\n⚠️ Ada item tanpa bahan. Cek data menu_bahan.');
    }

    console.log('\nSelesai.');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
})();
