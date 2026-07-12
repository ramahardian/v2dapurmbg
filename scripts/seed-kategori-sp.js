const db = require('../db');
require('dotenv').config();

const TENANT_ID = 1;

const KATEGORI_MAP = {
  'Karbohidrat': ['Beras', 'Kentang', 'Jagung', 'Ubi', 'Roti', 'Tepung', 'Makaroni', 'Pasta', 'Mie', 'Bihun', 'Singkong', 'Puding'],
  'Protein Hewani': ['Ayam', 'Ikan', 'Telor', 'Telur', 'Dori', 'Fillet', 'Cangkalang', 'Kembung', 'Daging', 'Sapi', 'Abon', 'Hati', 'Kornet', 'Bakso', 'Sosis', 'Cumi', 'Udang', 'Tuna', 'Giling'],
  'Protein Nabati': ['Tahu', 'Tempe', 'Kacang', 'Edamame', 'Tempe'],
  'Sayur': ['Wortel', 'Buncis', 'Bayam', 'Kangkung', 'Kol', 'Brokoli', 'Sawi', 'Tomat', 'Timun', 'Labu', 'Pokcoy', 'Kembang Kol', 'Baby Corn', 'Jagung Semi', 'Daun Bawang', 'Daun Seledri', 'Daun Kemangi', 'Selada', 'Bawang Bombay'],
  'Buah': ['Jeruk', 'Pisang', 'Apel', 'Semangka', 'Melon', 'Pepaya', 'Pir', 'Salak', 'Leci', 'Buah Naga', 'Anggur', 'Mangga', 'Alpukat'],
  'Susu': ['Susu', 'SKM', 'Keju', 'Yoghurt', 'kental manis', 'Ultra', 'UHT'],
  'Minyak': ['Minyak Goreng', 'Minyak Wijen', 'Mentega', 'Butter', 'Margarin', 'Minyak'],
};

(async () => {
  try {
    console.log('=== SEED KATEGORI_SP ===\n');

    const [bahan] = await db.query('SELECT id, nama, kategori_sp FROM bahan_baku WHERE tenant_id=? ORDER BY id', [TENANT_ID]);
    console.log('Total bahan baku:', bahan.length);

    let updated = 0;
    let uncategorized = [];

    for (const b of bahan) {
      const nama = b.nama.toLowerCase();
      let matchedKat = null;

      for (const [kat, keywords] of Object.entries(KATEGORI_MAP)) {
        for (const kw of keywords) {
          if (nama.includes(kw.toLowerCase())) {
            matchedKat = kat;
            break;
          }
        }
        if (matchedKat) break;
      }

      if (matchedKat) {
        if (b.kategori_sp !== matchedKat) {
          await db.query('UPDATE bahan_baku SET kategori_sp=? WHERE id=?', [matchedKat, b.id]);
          console.log(`  ${b.nama} => ${matchedKat}`);
          updated++;
        }
      } else {
        uncategorized.push(b.nama);
      }
    }

    console.log(`\nUpdated ${updated} bahan with kategori_sp`);
    if (uncategorized.length) {
      console.log('Uncategorized:', uncategorized.join(', '));
    }
    console.log('\n=== SELESAI ===');
    process.exit(0);
  } catch (e) {
    console.error('Failed:', e.message);
    process.exit(1);
  }
})();
