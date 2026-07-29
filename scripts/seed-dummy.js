const db = require('../db');
require('dotenv').config();

const HARI = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];

const TENANT_ID = 1;

const KATEGORI_PENERIMA_MAP = {
  'SD': ['SD', 'SDN', 'MIS', 'MI', 'MADRASAH IBTIDAIYAH'],
  'TK/PAUD': ['PAUD', 'TK', 'SPS', 'KOBER', 'KB'],
};

function detectKategori(nama) {
  const upper = nama.toUpperCase();
  for (const [kat, keywords] of Object.entries(KATEGORI_PENERIMA_MAP)) {
    for (const kw of keywords) {
      if (upper.includes(kw)) return kat;
    }
  }
  return null;
}

const BAHAN_BAKU = {
  BERAS: 9, AYAM: 4, TELUR: 87, TEMPE: 89, TAHU: 86,
  WORTEL: 98, BUNCIS: 12, BAYAM: 24, KOL: 50, BROKOLI: 10,
  PISANG: 63, APEL: 128, JERUK: 33, SEMANGKA: 78, MELON: 58,
  MINYAK: 59, GARAM: 27, GULA: 29, BAWANG_MERAH: 7, BAWANG_PUTIH: 8,
  KENTANG: 111, JAGUNG: 31, IKAN: 30, DORI: 105, SUSU_UHT: 83,
  KACANG_HIJAU: 36, KACANG_TANAH: 37, KECAP: 44, TOMAT: 96,
  DAUN_BAWANG: 20, SELEDRI: 24, KEMANGI: 22, KUNYIT: 51,
  LENGKUAS: 56, SALAM: 71, SEREH: 79, JAHE: 32,
  TIMUN: 95, PEPAYA: 61, PISANG_AMBON: 64,
};

const MENU_TEMPLATES = [
  // ===== SD (10 menu variasi) =====
  {
    nama: 'Nasi Kebuli + Ayam Goreng Rempah + Tempe + Acar Kuning Timun Wortel + Pisang Ambon',
    kategori: 'SD',
    gramasi: 550, kalori: 625, protein: 28, karbohidrat: 72, lemak: 18, serat: 4,
    bahan: [
      { id: BAHAN_BAKU.BERAS, jumlah: 100 },
      { id: BAHAN_BAKU.AYAM, jumlah: 50 },
      { id: BAHAN_BAKU.TEMPE, jumlah: 30 },
      { id: BAHAN_BAKU.TIMUN, jumlah: 20 },
      { id: BAHAN_BAKU.WORTEL, jumlah: 15 },
      { id: BAHAN_BAKU.MINYAK, jumlah: 10 },
      { id: BAHAN_BAKU.PISANG, jumlah: 50 },
      { id: BAHAN_BAKU.BAWANG_MERAH, jumlah: 5 },
      { id: BAHAN_BAKU.BAWANG_PUTIH, jumlah: 3 },
      { id: BAHAN_BAKU.GARAM, jumlah: 2 },
    ],
  },
  {
    nama: 'Nasi + Telur Ceplok Asam Manis + Tahu Cabe Garam + Tumis Labu Siam Jagung + Semangka',
    kategori: 'SD',
    gramasi: 550, kalori: 580, protein: 30, karbohidrat: 65, lemak: 15, serat: 5,
    bahan: [
      { id: BAHAN_BAKU.BERAS, jumlah: 100 },
      { id: BAHAN_BAKU.TELUR, jumlah: 50 },
      { id: BAHAN_BAKU.TAHU, jumlah: 40 },
      { id: BAHAN_BAKU.JAGUNG, jumlah: 20 },
      { id: BAHAN_BAKU.TOMAT, jumlah: 15 },
      { id: BAHAN_BAKU.MINYAK, jumlah: 10 },
      { id: BAHAN_BAKU.SEMANGKA, jumlah: 80 },
      { id: BAHAN_BAKU.BAWANG_MERAH, jumlah: 5 },
      { id: BAHAN_BAKU.BAWANG_PUTIH, jumlah: 3 },
      { id: BAHAN_BAKU.GARAM, jumlah: 2 },
    ],
  },
  {
    nama: 'Nasi + Dori Fillet Crispy BBQ + Tempe + Tumis Buncis Wortel + Leci',
    kategori: 'SD',
    gramasi: 550, kalori: 610, protein: 32, karbohidrat: 68, lemak: 19, serat: 4,
    bahan: [
      { id: BAHAN_BAKU.BERAS, jumlah: 100 },
      { id: BAHAN_BAKU.DORI, jumlah: 60 },
      { id: BAHAN_BAKU.TEMPE, jumlah: 30 },
      { id: BAHAN_BAKU.BUNCIS, jumlah: 20 },
      { id: BAHAN_BAKU.WORTEL, jumlah: 15 },
      { id: BAHAN_BAKU.MINYAK, jumlah: 12 },
      { id: BAHAN_BAKU.KECAP, jumlah: 5 },
      { id: BAHAN_BAKU.BAWANG_MERAH, jumlah: 5 },
      { id: BAHAN_BAKU.BAWANG_PUTIH, jumlah: 3 },
      { id: BAHAN_BAKU.GARAM, jumlah: 2 },
    ],
  },
  {
    nama: 'Jasuke Jagung + Tamagoyaki + Keju + Coleslaw Kol Wortel + Apel',
    kategori: 'SD',
    gramasi: 500, kalori: 560, protein: 24, karbohidrat: 70, lemak: 17, serat: 5,
    bahan: [
      { id: BAHAN_BAKU.JAGUNG, jumlah: 120 },
      { id: BAHAN_BAKU.TELUR, jumlah: 40 },
      { id: BAHAN_BAKU.SUSU_UHT, jumlah: 30 },
      { id: BAHAN_BAKU.KOL, jumlah: 25 },
      { id: BAHAN_BAKU.WORTEL, jumlah: 20 },
      { id: BAHAN_BAKU.MINYAK, jumlah: 8 },
      { id: BAHAN_BAKU.APEL, jumlah: 60 },
      { id: BAHAN_BAKU.BAWANG_MERAH, jumlah: 3 },
      { id: BAHAN_BAKU.GARAM, jumlah: 2 },
    ],
  },
  {
    nama: 'Nasi + Ayam Bakar Kecap + Tempe Orek + Tumis Kangkung + Melon',
    kategori: 'SD',
    gramasi: 550, kalori: 600, protein: 27, karbohidrat: 69, lemak: 17, serat: 5,
    bahan: [
      { id: BAHAN_BAKU.BERAS, jumlah: 100 },
      { id: BAHAN_BAKU.AYAM, jumlah: 55 },
      { id: BAHAN_BAKU.TEMPE, jumlah: 30 },
      { id: BAHAN_BAKU.BAYAM, jumlah: 25 },
      { id: BAHAN_BAKU.MINYAK, jumlah: 10 },
      { id: BAHAN_BAKU.KECAP, jumlah: 5 },
      { id: BAHAN_BAKU.MELON, jumlah: 70 },
      { id: BAHAN_BAKU.BAWANG_MERAH, jumlah: 5 },
      { id: BAHAN_BAKU.BAWANG_PUTIH, jumlah: 3 },
      { id: BAHAN_BAKU.GARAM, jumlah: 2 },
    ],
  },
  {
    nama: 'Nasi + Ikan Kembung Balado + Tahu + Sup Krim Jagung + Pepaya',
    kategori: 'SD',
    gramasi: 550, kalori: 590, protein: 29, karbohidrat: 66, lemak: 16, serat: 4,
    bahan: [
      { id: BAHAN_BAKU.BERAS, jumlah: 100 },
      { id: BAHAN_BAKU.IKAN, jumlah: 50 },
      { id: BAHAN_BAKU.TAHU, jumlah: 40 },
      { id: BAHAN_BAKU.JAGUNG, jumlah: 30 },
      { id: BAHAN_BAKU.MINYAK, jumlah: 10 },
      { id: BAHAN_BAKU.PEPAYA, jumlah: 70 },
      { id: BAHAN_BAKU.BAWANG_MERAH, jumlah: 5 },
      { id: BAHAN_BAKU.BAWANG_PUTIH, jumlah: 3 },
      { id: BAHAN_BAKU.GARAM, jumlah: 2 },
    ],
  },
  {
    nama: 'Nasi + Telur Puyuh + Tempe + Sayur Sop Wortel Kol + Jeruk',
    kategori: 'SD',
    gramasi: 500, kalori: 550, protein: 25, karbohidrat: 68, lemak: 16, serat: 6,
    bahan: [
      { id: BAHAN_BAKU.BERAS, jumlah: 100 },
      { id: BAHAN_BAKU.TELUR, jumlah: 40 },
      { id: BAHAN_BAKU.TEMPE, jumlah: 30 },
      { id: BAHAN_BAKU.WORTEL, jumlah: 20 },
      { id: BAHAN_BAKU.KOL, jumlah: 15 },
      { id: BAHAN_BAKU.MINYAK, jumlah: 10 },
      { id: BAHAN_BAKU.JERUK, jumlah: 60 },
      { id: BAHAN_BAKU.BAWANG_MERAH, jumlah: 5 },
      { id: BAHAN_BAKU.BAWANG_PUTIH, jumlah: 3 },
      { id: BAHAN_BAKU.GARAM, jumlah: 2 },
    ],
  },
  {
    nama: 'Nasi Merah + Rendang Daging + Tahu + Sayur Asam + Pisang',
    kategori: 'SD',
    gramasi: 600, kalori: 680, protein: 32, karbohidrat: 70, lemak: 22, serat: 3,
    bahan: [
      { id: BAHAN_BAKU.BERAS, jumlah: 100 },
      { id: BAHAN_BAKU.KENTANG, jumlah: 30 },
      { id: BAHAN_BAKU.TAHU, jumlah: 40 },
      { id: BAHAN_BAKU.KOL, jumlah: 20 },
      { id: BAHAN_BAKU.TOMAT, jumlah: 10 },
      { id: BAHAN_BAKU.MINYAK, jumlah: 15 },
      { id: BAHAN_BAKU.PISANG, jumlah: 50 },
      { id: BAHAN_BAKU.BAWANG_MERAH, jumlah: 5 },
      { id: BAHAN_BAKU.BAWANG_PUTIH, jumlah: 3 },
      { id: BAHAN_BAKU.GARAM, jumlah: 2 },
    ],
  },
  // ===== TK/PAUD =====
  {
    nama: 'Bubur Ayam + Hati Ayam Cincang + Wortel + Susu',
    kategori: 'TK/PAUD',
    gramasi: 350, kalori: 400, protein: 18, karbohidrat: 48, lemak: 12, serat: 3,
    bahan: [
      { id: BAHAN_BAKU.BERAS, jumlah: 50 },
      { id: BAHAN_BAKU.AYAM, jumlah: 25 },
      { id: BAHAN_BAKU.WORTEL, jumlah: 15 },
      { id: BAHAN_BAKU.SUSU_UHT, jumlah: 100 },
      { id: BAHAN_BAKU.BAWANG_MERAH, jumlah: 3 },
      { id: BAHAN_BAKU.BAWANG_PUTIH, jumlah: 2 },
      { id: BAHAN_BAKU.GARAM, jumlah: 1 },
    ],
  },
  {
    nama: 'Nasi Tim + Ikan Kukus + Brokoli + Jeruk',
    kategori: 'TK/PAUD',
    gramasi: 350, kalori: 380, protein: 20, karbohidrat: 44, lemak: 10, serat: 4,
    bahan: [
      { id: BAHAN_BAKU.BERAS, jumlah: 50 },
      { id: BAHAN_BAKU.DORI, jumlah: 30 },
      { id: BAHAN_BAKU.BROKOLI, jumlah: 20 },
      { id: BAHAN_BAKU.JERUK, jumlah: 50 },
      { id: BAHAN_BAKU.BAWANG_PUTIH, jumlah: 2 },
      { id: BAHAN_BAKU.GARAM, jumlah: 1 },
    ],
  },
  {
    nama: 'Bihun Goreng + Telur Puyuh + Tahu + Timun + Pisang',
    kategori: 'TK/PAUD',
    gramasi: 350, kalori: 420, protein: 16, karbohidrat: 52, lemak: 13, serat: 3,
    bahan: [
      { id: BAHAN_BAKU.KENTANG, jumlah: 40 },
      { id: BAHAN_BAKU.TELUR, jumlah: 25 },
      { id: BAHAN_BAKU.TAHU, jumlah: 30 },
      { id: BAHAN_BAKU.TIMUN, jumlah: 15 },
      { id: BAHAN_BAKU.MINYAK, jumlah: 8 },
      { id: BAHAN_BAKU.PISANG, jumlah: 50 },
      { id: BAHAN_BAKU.BAWANG_MERAH, jumlah: 3 },
      { id: BAHAN_BAKU.GARAM, jumlah: 1 },
    ],
  },
  {
    nama: 'Nasi Tim + Ayam Cincang + Tumis Brokoli Wortel + Semangka',
    kategori: 'TK/PAUD',
    gramasi: 350, kalori: 390, protein: 19, karbohidrat: 46, lemak: 11, serat: 3,
    bahan: [
      { id: BAHAN_BAKU.BERAS, jumlah: 50 },
      { id: BAHAN_BAKU.AYAM, jumlah: 30 },
      { id: BAHAN_BAKU.BROKOLI, jumlah: 15 },
      { id: BAHAN_BAKU.WORTEL, jumlah: 10 },
      { id: BAHAN_BAKU.MINYAK, jumlah: 6 },
      { id: BAHAN_BAKU.SEMANGKA, jumlah: 60 },
      { id: BAHAN_BAKU.BAWANG_MERAH, jumlah: 3 },
      { id: BAHAN_BAKU.GARAM, jumlah: 1 },
    ],
  },
  // ===== Ibu Hamil =====
  {
    nama: 'Nasi Merah + Ikan Kembung + Tempe + Sayur Bening Bayam + Jeruk',
    kategori: 'Ibu Hamil',
    gramasi: 650, kalori: 750, protein: 35, karbohidrat: 80, lemak: 22, serat: 7,
    bahan: [
      { id: BAHAN_BAKU.BERAS, jumlah: 100 },
      { id: BAHAN_BAKU.IKAN, jumlah: 60 },
      { id: BAHAN_BAKU.TEMPE, jumlah: 40 },
      { id: BAHAN_BAKU.BAYAM, jumlah: 25 },
      { id: BAHAN_BAKU.MINYAK, jumlah: 12 },
      { id: BAHAN_BAKU.JERUK, jumlah: 60 },
      { id: BAHAN_BAKU.BAWANG_MERAH, jumlah: 5 },
      { id: BAHAN_BAKU.BAWANG_PUTIH, jumlah: 3 },
      { id: BAHAN_BAKU.GARAM, jumlah: 2 },
    ],
  },
  {
    nama: 'Nasi Merah + Ayam Bakar + Tahu + Sayur Sop Wortel Kol + Pisang',
    kategori: 'Ibu Hamil',
    gramasi: 650, kalori: 740, protein: 34, karbohidrat: 81, lemak: 21, serat: 5,
    bahan: [
      { id: BAHAN_BAKU.BERAS, jumlah: 100 },
      { id: BAHAN_BAKU.AYAM, jumlah: 60 },
      { id: BAHAN_BAKU.TAHU, jumlah: 40 },
      { id: BAHAN_BAKU.WORTEL, jumlah: 20 },
      { id: BAHAN_BAKU.KOL, jumlah: 15 },
      { id: BAHAN_BAKU.MINYAK, jumlah: 12 },
      { id: BAHAN_BAKU.PISANG, jumlah: 50 },
      { id: BAHAN_BAKU.BAWANG_MERAH, jumlah: 5 },
      { id: BAHAN_BAKU.BAWANG_PUTIH, jumlah: 3 },
      { id: BAHAN_BAKU.GARAM, jumlah: 2 },
    ],
  },
  {
    nama: 'Nasi Putih + Semur Telur + Tempe + Tumis Kangkung + Apel',
    kategori: 'Ibu Hamil',
    gramasi: 600, kalori: 700, protein: 33, karbohidrat: 75, lemak: 19, serat: 6,
    bahan: [
      { id: BAHAN_BAKU.BERAS, jumlah: 100 },
      { id: BAHAN_BAKU.TELUR, jumlah: 50 },
      { id: BAHAN_BAKU.TEMPE, jumlah: 40 },
      { id: BAHAN_BAKU.BAYAM, jumlah: 25 },
      { id: BAHAN_BAKU.MINYAK, jumlah: 10 },
      { id: BAHAN_BAKU.APEL, jumlah: 60 },
      { id: BAHAN_BAKU.BAWANG_MERAH, jumlah: 5 },
      { id: BAHAN_BAKU.BAWANG_PUTIH, jumlah: 3 },
      { id: BAHAN_BAKU.GARAM, jumlah: 2 },
    ],
  },
  // ===== Balita =====
  {
    nama: 'Bubur Ayam + Hati Cincang + Wortel + Susu',
    kategori: 'Balita',
    gramasi: 250, kalori: 320, protein: 15, karbohidrat: 38, lemak: 10, serat: 2,
    bahan: [
      { id: BAHAN_BAKU.BERAS, jumlah: 30 },
      { id: BAHAN_BAKU.AYAM, jumlah: 20 },
      { id: BAHAN_BAKU.WORTEL, jumlah: 15 },
      { id: BAHAN_BAKU.SUSU_UHT, jumlah: 80 },
      { id: BAHAN_BAKU.BAWANG_MERAH, jumlah: 2 },
      { id: BAHAN_BAKU.BAWANG_PUTIH, jumlah: 1 },
      { id: BAHAN_BAKU.GARAM, jumlah: 1 },
    ],
  },
  {
    nama: 'Nasi Tim + Ikan Kukus + Bayam + Pisang',
    kategori: 'Balita',
    gramasi: 250, kalori: 300, protein: 16, karbohidrat: 35, lemak: 8, serat: 3,
    bahan: [
      { id: BAHAN_BAKU.BERAS, jumlah: 30 },
      { id: BAHAN_BAKU.DORI, jumlah: 20 },
      { id: BAHAN_BAKU.BAYAM, jumlah: 15 },
      { id: BAHAN_BAKU.PISANG, jumlah: 40 },
      { id: BAHAN_BAKU.BAWANG_PUTIH, jumlah: 1 },
      { id: BAHAN_BAKU.GARAM, jumlah: 1 },
    ],
  },
  {
    nama: 'Pure Kentang + Daging Giling + Brokoli + Jeruk',
    kategori: 'Balita',
    gramasi: 250, kalori: 290, protein: 14, karbohidrat: 33, lemak: 8, serat: 3,
    bahan: [
      { id: BAHAN_BAKU.KENTANG, jumlah: 50 },
      { id: BAHAN_BAKU.AYAM, jumlah: 20 },
      { id: BAHAN_BAKU.BROKOLI, jumlah: 15 },
      { id: BAHAN_BAKU.JERUK, jumlah: 40 },
      { id: BAHAN_BAKU.BAWANG_PUTIH, jumlah: 1 },
      { id: BAHAN_BAKU.GARAM, jumlah: 1 },
    ],
  },
];

const SIKLUS_PLANS = [
  { nama: 'Siklus SD — Siklus 1 (10 Hari)', kategori: 'SD', porsi: 250, hari: 10, status: 'Aktif' },
  { nama: 'Siklus PAUD/TK — Siklus 1 (10 Hari)', kategori: 'TK/PAUD', porsi: 80, hari: 10, status: 'Aktif' },
  { nama: 'Siklus Ibu Hamil — Siklus 1 (10 Hari)', kategori: 'Ibu Hamil', porsi: 40, hari: 10, status: 'Aktif' },
  { nama: 'Siklus Balita — Siklus 1 (10 Hari)', kategori: 'Balita', porsi: 30, hari: 10, status: 'Aktif' },
];

async function runSeed(tenantId = 1) {
  const logs = [];
  const log = (msg) => { console.log(msg); logs.push(msg); };

  log('=== SEED DUMMY DATA ===\n');

  // 1. Update kategori_penerima pada existing penerima_manfaat
  log('1. Update kategori_penerima penerima manfaat...');
  const [pmList] = await db.query('SELECT id, nama_kelompok, kategori_penerima FROM penerima_manfaat WHERE tenant_id=?', [tenantId]);
  let updated = 0;
  for (const pm of pmList) {
    if (!pm.kategori_penerima) {
      const detected = detectKategori(pm.nama_kelompok);
      if (detected) {
        await db.query('UPDATE penerima_manfaat SET kategori_penerima=? WHERE id=?', [detected, pm.id]);
        log(`  -> ${pm.nama_kelompok} => ${detected}`);
        updated++;
      }
    }
  }
  log(`  Updated ${updated} records\n`);

  // 2. Tambah penerima manfaat baru untuk kategori yang belum ada
  log('2. Menambah penerima manfaat baru...');
  const NEW_PM = [
    { nama: 'SDN NEGLASARI', paket_besar: 200, paket_kecil: 120, kategori: 'SD' },
    { nama: 'SDN CIKARET', paket_besar: 180, paket_kecil: 95, kategori: 'SD' },
    { nama: 'SDN BABAKAN', paket_besar: 150, paket_kecil: 80, kategori: 'SD' },
    { nama: 'PAUD MELATI INDAH', paket_besar: 15, paket_kecil: 40, kategori: 'TK/PAUD' },
    { nama: 'TK PERTIWI', paket_besar: 12, paket_kecil: 35, kategori: 'TK/PAUD' },
    { nama: 'TK PEMBINA', paket_besar: 10, paket_kecil: 30, kategori: 'TK/PAUD' },
    { nama: 'POSYANDU DAHLIA', paket_besar: 25, paket_kecil: 20, kategori: 'Ibu Hamil' },
    { nama: 'POSYANDU ANGGREK', paket_besar: 20, paket_kecil: 15, kategori: 'Ibu Hamil' },
    { nama: 'POSYANDU IBU HAMIL', paket_besar: 30, paket_kecil: 0, kategori: 'Ibu Hamil' },
    { nama: 'POSYANDU BALITA SEHAT', paket_besar: 0, paket_kecil: 45, kategori: 'Balita' },
    { nama: 'PAUD BALITA CERIA', paket_besar: 0, paket_kecil: 30, kategori: 'Balita' },
  ];
  for (const p of NEW_PM) {
    await db.query(
      'INSERT INTO penerima_manfaat (tenant_id, nama_kelompok, paket_besar, paket_kecil, lokasi, kategori_penerima) VALUES (?,?,?,?,?,?)',
      [tenantId, p.nama, p.paket_besar, p.paket_kecil, 'BOGOR', p.kategori]
    );
  }
  log(`  Added ${NEW_PM.length} new records\n`);

  // 3. Hapus menu existing (agar bersih) lalu buat menu baru
  log('3. Membuat menu dan komposisi bahan...');
  await db.query('DELETE FROM menu_bahan WHERE menu_id IN (SELECT id FROM menu WHERE tenant_id=?)', [tenantId]);
  await db.query('DELETE FROM menu WHERE tenant_id=?', [tenantId]);

  const createdMenuIds = {};
  for (const tmpl of MENU_TEMPLATES) {
    const [r] = await db.query(
      `INSERT INTO menu (tenant_id, nama, kategori_penerima, deskripsi, gramasi_total, kalori, protein, karbohidrat, lemak, serat)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [tenantId, tmpl.nama, tmpl.kategori, '', tmpl.gramasi, tmpl.kalori, tmpl.protein, tmpl.karbohidrat, tmpl.lemak, tmpl.serat]
    );
    const menuId = r.insertId;

    for (const b of tmpl.bahan) {
      await db.query(
        'INSERT INTO menu_bahan (menu_id, bahan_baku_id, jumlah) VALUES (?,?,?)',
        [menuId, b.id, b.jumlah]
      );
    }

    if (!createdMenuIds[tmpl.kategori]) createdMenuIds[tmpl.kategori] = [];
    createdMenuIds[tmpl.kategori].push({ id: menuId, nama: tmpl.nama, kalori: tmpl.kalori, protein: tmpl.protein, karbohidrat: tmpl.karbohidrat, lemak: tmpl.lemak, serat: tmpl.serat });
    log(`  -> Menu: ${tmpl.nama} (${tmpl.kategori})`);
  }
  log(`  Created ${MENU_TEMPLATES.length} menus\n`);

  // 4. Buat siklus menu
  log('4. Membuat siklus menu...');
  await db.query('DELETE FROM siklus_menu_item WHERE siklus_id IN (SELECT id FROM siklus_menu WHERE tenant_id=?)', [tenantId]);
  await db.query('DELETE FROM siklus_menu WHERE tenant_id=?', [tenantId]);

  const getMenusForKategori = (kat) => {
    const exact = createdMenuIds[kat] || [];
    if (exact.length > 0) return exact;

    if (kat === 'SD') return createdMenuIds['SD'] || [];
    if (kat === 'TK/PAUD') return createdMenuIds['TK/PAUD'] || [];
    if (kat === 'Ibu Hamil') return createdMenuIds['Ibu Hamil'] || [];
    if (kat === 'Balita') return createdMenuIds['Balita'] || [];
    return [];
  };

  for (const plan of SIKLUS_PLANS) {
    const pool = getMenusForKategori(plan.kategori);
    if (!pool.length) {
      log(`  Skip ${plan.nama} (no menus for ${plan.kategori})`);
      continue;
    }      // Set tanggal_mulai = now - (total_hari - 1) so that today falls within the siklus
      var tglMulai = new Date();
      tglMulai.setDate(tglMulai.getDate() - (plan.hari - 1));
      var tanggalMulaiStr = tglMulai.toISOString().slice(0, 10);

      const [r] = await db.query(
        `INSERT INTO siklus_menu (tenant_id, nama, kategori_penerima, jumlah_porsi, total_hari, status, catatan, tanggal_mulai)
         VALUES (?,?,?,?,?,?,?,?)`,
        [tenantId, plan.nama, plan.kategori, plan.porsi, plan.hari, plan.status, '', tanggalMulaiStr]
      );
    const siklusId = r.insertId;

    for (let d = 0; d < plan.hari; d++) {
      const m = pool[d % pool.length];
      await db.query(
        `INSERT INTO siklus_menu_item (siklus_id, hari_ke, hari_nama, menu_id, menu_nama, jumlah_porsi, kalori, protein, karbohidrat, lemak, serat)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [siklusId, d + 1, HARI[d % 7], m.id, m.nama, plan.porsi,
         m.kalori, m.protein, m.karbohidrat, m.lemak, m.serat]
      );
    }
    log(`  -> ${plan.nama}: ${plan.hari} hari, ${plan.porsi} porsi, status=${plan.status}`);
  }
  log(`  Created ${SIKLUS_PLANS.length} siklus\n`);

  log('=== SELESAI! Data siap digunakan ===');
  return logs;
}

module.exports = { runSeed };

// Jalankan langsung jika dipanggil dari CLI
if (require.main === module) {
  (async () => {
    try {
      await runSeed(TENANT_ID);
      process.exit(0);
    } catch (e) {
      console.error('Seed failed:', e.message);
      console.error(e);
      process.exit(1);
    }
  })();
}
