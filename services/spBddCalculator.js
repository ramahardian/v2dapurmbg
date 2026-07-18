const db = require('../db');

const JENJANG_ORDER = ['Balita', 'TK/PAUD', 'SD 1-3', 'SD 4-6', 'SMP', 'SMA', 'Ibu Hamil', 'Ibu Menyusui'];

const KATEGORI_SP = ['Karbohidrat', 'Protein Hewani', 'Protein Nabati', 'Sayur', 'Buah', 'Susu', 'Minyak'];

const JENJANG_MAP = {
  'TK/PAUD': 'TK/PAUD',
  'SD/MI (1-3)': 'SD 1-3',
  'SD/MI (4-6)': 'SD 4-6',
  'SMP/MTs, SMA/SMK': 'SMP',
  'SMP': 'SMP',
  'SMA': 'SMA',
  'Bumil/Busui': 'Ibu Hamil',
  'Ibu Hamil': 'Ibu Hamil',
  'Ibu Menyusui': 'Ibu Menyusui',
  'Balita': 'Balita',
  // kategori_penerima menu (grouping)
  'Paket Kecil': 'Balita',
  'Paket Besar': 'SD 4-6',
};

const KATEGORI_MAP_SHORT = {
  'TK': 'TK/PAUD',
  'PAUD': 'TK/PAUD',
  'SD': 'SD 1-3',
  'SMP': 'SMP/MTs, SMA/SMK',
  'Ibu Hamil': 'Ibu Hamil',
  'Ibu Menyusui': 'Ibu Menyusui',
  'Balita': 'Balita',
  'Paket Kecil': 'Balita',
  'Paket Besar': 'SD 4-6',
};

const KATEGORI_MAP_DISPLAY = {
  'TK': 'TK/PAUD',
  'PAUD': 'TK/PAUD',
  'SD': 'SD/MI (1-3)',
  'SMP': 'SMP/MTs, SMA/SMK',
  'Ibu Hamil': 'Bumil/Busui',
  'Ibu Menyusui': 'Bumil/Busui',
  'Balita': 'Balita',
};

const FIXED_KATEGORI = ['TK/PAUD', 'SD/MI (1-3)', 'SD/MI (4-6)', 'SMP/MTs, SMA/SMK', 'Bumil/Busui', 'Balita'];

function mapJenjang(kat) {
  return JENJANG_MAP[kat] || JENJANG_MAP[KATEGORI_MAP_SHORT[kat]] || kat;
}

function mapToDisplay(kat) {
  return KATEGORI_MAP_DISPLAY[kat] || kat;
}

function hitungSP(b, spMap) {
  const spVal = b.kategori_sp ? (spMap[b.kategori_sp] || null) : null;
  const berat1Sp = Number(b.berat_1_sp || 0);
  const persenBdd = Number(b.persen_bdd || 100);
  const beratBersih = spVal !== null ? berat1Sp * spVal : Number(b.jumlah_existing || 0);
  const beratKotor = persenBdd > 0 ? Math.round(beratBersih / (persenBdd / 100)) : beratBersih;
  return { sp_value: spVal, berat_1_sp: berat1Sp, persen_bdd: persenBdd, berat_bersih: beratBersih, berat_kotor: beratKotor };
}

function hitungBDD(beratBersih, persenBdd) {
  const bdd = Number(persenBdd || 100);
  return bdd > 0 ? Math.round(beratBersih / (bdd / 100)) : beratBersih;
}

async function getSpMapByJenjang(jenjang) {
  const [spRows] = await db.query(
    'SELECT kategori_sp, sp_value FROM standar_sp WHERE jenjang=?',
    [jenjang]
  );
  const spMap = {};
  for (const r of spRows) spMap[r.kategori_sp] = Number(r.sp_value);
  return spMap;
}

async function getSpMapByJenjangList(jenjangList) {
  const spMap = {};
  if (!jenjangList.length) return spMap;
  const jh = jenjangList.map(() => '?').join(',');
  const [spRows] = await db.query(
    `SELECT jenjang, kategori_sp, sp_value FROM standar_sp WHERE jenjang IN (${jh})`,
    jenjangList
  );
  for (const r of spRows) {
    if (!spMap[r.jenjang]) spMap[r.jenjang] = {};
    spMap[r.jenjang][r.kategori_sp] = Number(r.sp_value);
  }
  return spMap;
}

function fmtNum(v) {
  if (v == null || isNaN(v)) return '0.00';
  return Number(v).toFixed(2);
}

module.exports = {
  JENJANG_ORDER,
  KATEGORI_SP,
  JENJANG_MAP,
  KATEGORI_MAP_SHORT,
  KATEGORI_MAP_DISPLAY,
  FIXED_KATEGORI,
  mapJenjang,
  mapToDisplay,
  hitungSP,
  hitungBDD,
  getSpMapByJenjang,
  getSpMapByJenjangList,
  fmtNum,
};
