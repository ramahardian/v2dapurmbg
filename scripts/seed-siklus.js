const db = require('../db');
require('dotenv').config();

const HARI = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];

const MENU_TEMPLATES = {
  SD: [
    { nama: 'Nasi Putih + Ayam Goreng + Sayur Bening + Pisang', kalori: 625, protein: 28, karbohidrat: 72, lemak: 18, serat: 4 },
    { nama: 'Nasi Putih + Ikan Bumbu Kuning + Capcay + Jeruk', kalori: 580, protein: 30, karbohidrat: 65, lemak: 15, serat: 5 },
    { nama: 'Nasi Putih + Telur Balado + Tahu + Tumis Kangkung', kalori: 550, protein: 25, karbohidrat: 68, lemak: 16, serat: 6 },
    { nama: 'Nasi Putih + Rendang Daging + Sayur Asam + Semangka', kalori: 680, protein: 32, karbohidrat: 70, lemak: 22, serat: 3 },
    { nama: 'Nasi Putih + Ayam Bakar + Sambal + Urap + Pepaya', kalori: 600, protein: 27, karbohidrat: 69, lemak: 17, serat: 5 },
    { nama: 'Nasi Putih + Ikan Goreng + Perkedel + Sup Krim + Apel', kalori: 590, protein: 29, karbohidrat: 66, lemak: 16, serat: 4 },
    { nama: 'Nasi Putih + Tempe Orek + Ayam Suwir + Gado-gado + Melon', kalori: 560, protein: 26, karbohidrat: 67, lemak: 15, serat: 6 },
    { nama: 'Nasi Putih + Semur Daging + Tahu Isi + Sayur Sop + Pisang', kalori: 640, protein: 31, karbohidrat: 71, lemak: 19, serat: 4 },
  ],
  PAUD: [
    { nama: 'Bubur Ayam + Telur Puyuh + Wortel + Susu', kalori: 400, protein: 18, karbohidrat: 48, lemak: 12, serat: 3 },
    { nama: 'Nasi Tim + Ikan Kukus + Brokoli + Jeruk', kalori: 380, protein: 20, karbohidrat: 44, lemak: 10, serat: 4 },
    { nama: 'Bihun Goreng + Bakso Ikan + Timun + Susu', kalori: 420, protein: 16, karbohidrat: 52, lemak: 13, serat: 3 },
    { nama: 'Nasi Tim + Ayam Cincang + Sup Jagung + Pepaya', kalori: 390, protein: 19, karbohidrat: 46, lemak: 11, serat: 3 },
    { nama: 'Macaroni Schotel + Sayuran + Susu + Pisang', kalori: 410, protein: 17, karbohidrat: 50, lemak: 12, serat: 3 },
  ],
  TK: [
    { nama: 'Nasi Tim + Telur Dadar + Sup Bayam + Jeruk', kalori: 450, protein: 20, karbohidrat: 54, lemak: 13, serat: 4 },
    { nama: 'Mie Ayam + Pangsit + Sayuran + Susu', kalori: 480, protein: 22, karbohidrat: 56, lemak: 14, serat: 3 },
    { nama: 'Bubur Kacang Hijau + Roti + Telur Rebus + Pisang', kalori: 440, protein: 18, karbohidrat: 55, lemak: 11, serat: 5 },
    { nama: 'Nasi Tim + Ikan Tuna + Capcay + Semangka', kalori: 460, protein: 24, karbohidrat: 50, lemak: 12, serat: 4 },
    { nama: 'Kentang Tumbuk + Daging Cincang + Wortel + Apel', kalori: 430, protein: 19, karbohidrat: 49, lemak: 13, serat: 4 },
  ],
  'Ibu Hamil': [
    { nama: 'Nasi Merah + Ikan Kembung + Sayur Bening + Tempe + Jeruk', kalori: 750, protein: 35, karbohidrat: 80, lemak: 22, serat: 7 },
    { nama: 'Nasi Putih + Ayam Goreng + Hati Sapi + Tahu + Sayur Asam', kalori: 780, protein: 38, karbohidrat: 78, lemak: 24, serat: 5 },
    { nama: 'Nasi Merah + Rendang Daging + Telur + Tumis Brokoli + Apel', kalori: 800, protein: 40, karbohidrat: 82, lemak: 25, serat: 6 },
    { nama: 'Nasi Putih + Ikan Gurame Bakar + Sambal + Urap + Pisang', kalori: 720, protein: 36, karbohidrat: 76, lemak: 20, serat: 6 },
    { nama: 'Nasi Merah + Sup Daging + Tahu Isi + Capcay + Melon', kalori: 760, protein: 37, karbohidrat: 79, lemak: 23, serat: 5 },
    { nama: 'Nasi Putih + Semur Telur + Tempe + Tumis Kangkung + Jeruk', kalori: 700, protein: 33, karbohidrat: 75, lemak: 19, serat: 6 },
    { nama: 'Nasi Merah + Ayam Bakar + Tahu + Sayur Sop + Pisang', kalori: 740, protein: 34, karbohidrat: 81, lemak: 21, serat: 5 },
    { nama: 'Bubur Ayam + Telur Rebus + Hati Ayam + Sayuran + Susu', kalori: 680, protein: 32, karbohidrat: 72, lemak: 18, serat: 4 },
  ],
  'Ibu Menyusui': [
    { nama: 'Nasi Merah + Ikan Asam Pedas + Tahu + Sayur Bening + Pepaya', kalori: 700, protein: 33, karbohidrat: 76, lemak: 20, serat: 6 },
    { nama: 'Nasi Putih + Ayam Opor + Telur + Tumis Brokoli + Pisang', kalori: 730, protein: 35, karbohidrat: 74, lemak: 22, serat: 5 },
    { nama: 'Nasi Merah + Sup Ikan + Tempe + Capcay + Jeruk', kalori: 680, protein: 34, karbohidrat: 72, lemak: 18, serat: 6 },
    { nama: 'Nasi Putih + Rendang Ati + Tahu + Sayur Asam + Melon', kalori: 750, protein: 36, karbohidrat: 78, lemak: 24, serat: 5 },
    { nama: 'Nasi Merah + Ayam Panggang + Telur + Tumis Kangkung + Apel', kalori: 710, protein: 33, karbohidrat: 75, lemak: 21, serat: 6 },
    { nama: 'Nasi Putih + Ikan Kembung + Tahu Isi + Sayur Sop + Pepaya', kalori: 690, protein: 32, karbohidrat: 73, lemak: 19, serat: 5 },
    { nama: 'Nasi Merah + Semur Daging + Telur + Urap + Jeruk', kalori: 740, protein: 37, karbohidrat: 77, lemak: 22, serat: 5 },
    { nama: 'Bubur Kacang Ijo + Roti + Telur Rebus + Sayuran + Susu', kalori: 650, protein: 30, karbohidrat: 71, lemak: 17, serat: 7 },
  ],
  Balita: [
    { nama: 'Bubur Ayam + Hati Cincang + Wortel', kalori: 320, protein: 15, karbohidrat: 38, lemak: 10, serat: 2 },
    { nama: 'Nasi Tim + Ikan Kukus + Bayam', kalori: 300, protein: 16, karbohidrat: 35, lemak: 8, serat: 3 },
    { nama: 'Bubur Kacang Hijau + Telur Puyuh', kalori: 340, protein: 14, karbohidrat: 42, lemak: 9, serat: 4 },
    { nama: 'Nasi Tim + Ayam Cincang + Brokoli', kalori: 310, protein: 17, karbohidrat: 34, lemak: 9, serat: 2 },
    { nama: 'Pure Kentang + Daging Giling + Wortel', kalori: 290, protein: 14, karbohidrat: 33, lemak: 8, serat: 3 },
  ],
};

const SIKLUS_PLANS = [
  { nama: 'Siklus Menu SD — Pekan 1', kategori_penerima: 'SD', jumlah_porsi: 300, total_hari: 7, status: 'Aktif', catatan: 'Menu untuk siswa SD pekan pertama' },
  { nama: 'Siklus Menu SD — Pekan 2', kategori_penerima: 'SD', jumlah_porsi: 300, total_hari: 7, status: 'Aktif', catatan: 'Menu untuk siswa SD pekan kedua — variasi menu berbeda' },
  { nama: 'Siklus Menu PAUD — Pekan 1', kategori_penerima: 'PAUD', jumlah_porsi: 120, total_hari: 7, status: 'Aktif', catatan: 'Porsi kecil untuk anak PAUD' },
  { nama: 'Siklus Menu TK — Pekan 1', kategori_penerima: 'TK', jumlah_porsi: 80, total_hari: 7, status: 'Draft', catatan: 'Masih dalam perencanaan' },
  { nama: 'Siklus Ibu Hamil — Pekan 1', kategori_penerima: 'Ibu Hamil', jumlah_porsi: 50, total_hari: 7, status: 'Aktif', catatan: 'Menu bernutrisi tinggi untuk ibu hamil' },
  { nama: 'Siklus Ibu Menyusui — Pekan 1', kategori_penerima: 'Ibu Menyusui', jumlah_porsi: 40, total_hari: 7, status: 'Draft', catatan: 'Menunggu validasi dari ahli gizi' },
  { nama: 'Siklus Balita — Pekan 1', kategori_penerima: 'Balita', jumlah_porsi: 60, total_hari: 7, status: 'Aktif', catatan: 'Porsi kecil dengan tekstur lembut' },
  { nama: 'Siklus Menu SD — Pekan 3', kategori_penerima: 'SD', jumlah_porsi: 300, total_hari: 7, status: 'Draft', catatan: '' },
  { nama: 'Siklus Menu PAUD — Pekan 2', kategori_penerima: 'PAUD', jumlah_porsi: 120, total_hari: 7, status: 'Arsip', catatan: 'Siklus lama — diganti dengan versi baru' },
  { nama: 'Siklus Menu Campuran — Isoman', kategori_penerima: 'SD', jumlah_porsi: 200, total_hari: 5, status: 'Arsip', catatan: 'Siklus pendek 5 hari untuk masa isolasi' },
];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

(async () => {
  try {
    const [existingMenu] = await db.query('SELECT id FROM menu LIMIT 1');
    if (existingMenu.length) {
      console.log('Menu already exists, skip seeding menus');
    } else {
      const [tenant] = await db.query('SELECT id FROM tenants LIMIT 1');
      const tenantId = tenant[0].id;

      const menuIds = {};
      for (const [kategori, menus] of Object.entries(MENU_TEMPLATES)) {
        menuIds[kategori] = [];
        for (const m of menus) {
          const [r] = await db.query(
            `INSERT INTO menu (tenant_id, nama, kategori_penerima, deskripsi, gramasi_total, kalori, protein, karbohidrat, lemak, serat)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [tenantId, m.nama, kategori, '', 0, m.kalori, m.protein, m.karbohidrat, m.lemak, m.serat]
          );
          menuIds[kategori].push(r.insertId);
        }
      }
      console.log('Seeded menus:', Object.fromEntries(
        Object.entries(menuIds).map(([k, v]) => [k, v.length])
      ));
    }

    const [existingSiklus] = await db.query('SELECT id FROM siklus_menu LIMIT 1');
    if (existingSiklus.length) {
      console.log('Siklus already exists, skip');
      process.exit(0);
    }

    const [tenant] = await db.query('SELECT id FROM tenants LIMIT 1');
    const tenantId = tenant[0].id;

    const [allMenus] = await db.query('SELECT id, nama, kategori_penerima, kalori, protein, karbohidrat, lemak, serat FROM menu');
    const menusByCat = {};
    for (const m of allMenus) {
      if (!menusByCat[m.kategori_penerima]) menusByCat[m.kategori_penerima] = [];
      menusByCat[m.kategori_penerima].push(m);
    }

    for (const plan of SIKLUS_PLANS) {
      const pool = menusByCat[plan.kategori_penerima] || allMenus;
      if (!pool.length) {
        console.log('  Skip siklus ' + plan.nama + ' (no menus for ' + plan.kategori_penerima + ')');
        continue;
      }

      const shuffled = shuffle([...pool]);
      const dayMenus = [];
      for (let d = 0; d < plan.total_hari; d++) {
        const m = shuffled[d % shuffled.length];
        dayMenus.push({
          hari_ke: d + 1,
          hari_nama: HARI[d % 7],
          menu_id: m.id,
          menu_nama: m.nama,
          jumlah_porsi: plan.jumlah_porsi,
          kalori: Number(m.kalori || 0),
          protein: Number(m.protein || 0),
          karbohidrat: Number(m.karbohidrat || 0),
          lemak: Number(m.lemak || 0),
          serat: Number(m.serat || 0),
        });
      }

      const [r] = await db.query(
        `INSERT INTO siklus_menu (tenant_id, nama, kategori_penerima, jumlah_porsi, total_hari, status, catatan)
         VALUES (?,?,?,?,?,?,?)`,
        [tenantId, plan.nama, plan.kategori_penerima, plan.jumlah_porsi, plan.total_hari, plan.status, plan.catatan]
      );

      for (const item of dayMenus) {
        await db.query(
          `INSERT INTO siklus_menu_item (siklus_id, hari_ke, hari_nama, menu_id, menu_nama, jumlah_porsi, kalori, protein, karbohidrat, lemak, serat)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [r.insertId, item.hari_ke, item.hari_nama, item.menu_id, item.menu_nama, item.jumlah_porsi,
           item.kalori, item.protein, item.karbohidrat, item.lemak, item.serat]
        );
      }
      console.log('  Created siklus: ' + plan.nama + ' (' + plan.total_hari + ' hari, ' + plan.status + ')');
    }

    console.log('Done seeding siklus menu!');
    process.exit(0);
  } catch (e) {
    console.error('Seed failed:', e.message);
    process.exit(1);
  }
})();

// Usage: node scripts/seed-siklus.js
