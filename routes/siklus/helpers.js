const db = require('../../db');

// ── Query helpers ─────────────────────────────────────────────────

// Ambil standar SP. DB lama (belum dimigrasi multi-tenant) tidak punya kolom
// tenant_id — fallback ke query tanpa scope tenant agar halaman tidak error
// "Unknown column 'tenant_id'" (mis. di /total-kebutuhan).
async function loadStandarSp(tenantId, jenjang) {
  try {
    if (jenjang) {
      return await db.query('SELECT kategori_sp, sp_value FROM standar_sp WHERE tenant_id=? AND jenjang=?', [tenantId, jenjang]);
    }
    return await db.query('SELECT DISTINCT jenjang, kategori_sp, sp_value FROM standar_sp WHERE tenant_id=?', [tenantId]);
  } catch (e) {
    if (jenjang) {
      return await db.query('SELECT kategori_sp, sp_value FROM standar_sp WHERE jenjang=?', [jenjang]);
    }
    return await db.query('SELECT DISTINCT jenjang, kategori_sp, sp_value FROM standar_sp');
  }
}

// ── Constants ─────────────────────────────────────────────────────

const JENJANG_DISPLAY_ORDER = ['TK/PAUD', 'SD/MI (1-3)', 'SD/MI (4-6)', 'SMP/MTs, SMA/SMK', 'Bumil/Busui', 'Balita'];

const JENJANG_DB_MAP = {
  'TK/PAUD': ['TK/PAUD', 'TK', 'PAUD'],
  'SD/MI (1-3)': ['SD 1-3', 'SD/MI (1-3)', 'SD'],
  'SD/MI (4-6)': ['SD 4-6', 'SD/MI (4-6)'],
  'SMP/MTs, SMA/SMK': ['SMP', 'SMA', 'SMP/MTs, SMA/SMK'],
  'Bumil/Busui': ['Ibu Hamil', 'Ibu Menyusui', 'Bumil/Busui'],
  'Balita': ['Balita'],
};

const KAT_ORDER = ['Karbohidrat', 'Protein Hewani', 'Protein Nabati', 'Sayur', 'Buah', 'Susu', 'Minyak'];

function buildDbToDisplay() {
  const map = {};
  for (const [display, dbVals] of Object.entries(JENJANG_DB_MAP)) {
    for (const dv of dbVals) map[dv] = display;
  }
  return map;
}

// Hitung tanggal_selesai dari tanggal_mulai + total_hari (aman zona waktu WIB).
function computeTanggalSelesai(tanggalMulai, tanggalSelesai, totalHari) {
  if (tanggalSelesai) return String(tanggalSelesai).slice(0, 10);
  if (!tanggalMulai || !totalHari) return null;
  const [y, m, d] = String(tanggalMulai).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d + (Number(totalHari) - 1));
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

// Auto-arsip: siklus non-Arsip yang sudah lewat tanggal_selesai otomatis
// berstatus Arsip. Idempotent — aman dipanggil berulang kali.
async function autoArchiveSiklus() {
  try {
    await db.query(
      `UPDATE siklus_menu SET status='Arsip'
       WHERE status != 'Arsip' AND tanggal_selesai IS NOT NULL AND tanggal_selesai < CURDATE()`
    );
  } catch (e) {
    console.warn('[autoArchiveSiklus] gagal:', e.message);
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function parseKategoriPenerima(kp) {
  if (!kp) return [];
  try { const p = JSON.parse(kp); if (Array.isArray(p)) return p; } catch {}
  return [kp];
}

// 'Posyandu' adalah pseudo-jenjang dari titik posyandu yang melayani dua
// kelompok sekaligus: Bumil/Busui (paket besar) + Balita (paket kecil).
// Dipecah ke dua kolom display agar kebutuhan per harinya terhitung.
function expandSiklusTargetJenjang(parsedList) {
  const out = new Set();
  for (const p of parsedList) {
    if (String(p).trim().toUpperCase() === 'POSYANDU') {
      out.add('Bumil/Busui');
      out.add('Balita');
    } else {
      out.add(p);
    }
  }
  return out;
}

// Apakah kategori penerima manfaat dari database merupakan kategori Posyandu
// (kategori tunggal yang menyimpan Bumil/Busui sebagai paket besar dan
// Balita sebagai paket kecil dalam satu baris). Exact match agar konsisten
// dengan expandSiklusTargetJenjang (juga exact 'POSYANDU').
function isPosyanduKat(kat) {
  return String(kat || '').trim().toUpperCase() === 'POSYANDU';
}

// Bangun peta penerima manfaat per jenjang display dari baris penerima_manfaat
// (sudah di-GROUP BY kategori dengan kolom paket_besar & paket_kecil).
// Kategori 'Posyandu' dipecah: paket besar → Bumil/Busui, paket kecil → Balita.
// Mengembalikan { pmByDisplay, pmByDisplayBesar, pmByDisplayKecil }.
function buildPmDisplayMaps(pmRows) {
  const dbToDisplay = buildDbToDisplay();
  const pmByDisplay = {};
  const pmByDisplayBesar = {};
  const pmByDisplayKecil = {};
  for (const p of pmRows || []) {
    const dbJenjang = String(p.jenjang || p.kategori_penerima || '').trim();
    const besar = Number(p.paket_besar) || 0;
    const kecil = Number(p.paket_kecil) || 0;
    if (isPosyanduKat(dbJenjang)) {
      pmByDisplay['Bumil/Busui'] = (pmByDisplay['Bumil/Busui'] || 0) + besar;
      pmByDisplayBesar['Bumil/Busui'] = (pmByDisplayBesar['Bumil/Busui'] || 0) + besar;
      pmByDisplay['Balita'] = (pmByDisplay['Balita'] || 0) + kecil;
      pmByDisplayKecil['Balita'] = (pmByDisplayKecil['Balita'] || 0) + kecil;
    } else {
      const display = dbToDisplay[dbJenjang] || dbJenjang;
      pmByDisplay[display] = (pmByDisplay[display] || 0) + besar + kecil;
      pmByDisplayBesar[display] = (pmByDisplayBesar[display] || 0) + besar;
      pmByDisplayKecil[display] = (pmByDisplayKecil[display] || 0) + kecil;
    }
  }
  return { pmByDisplay, pmByDisplayBesar, pmByDisplayKecil };
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function expandJenjangToDbValues(jenjangList) {
  const dbToDisplay = buildDbToDisplay();
  return [...new Set(jenjangList.flatMap(j =>
    JENJANG_DB_MAP[j] ||
    Object.entries(JENJANG_DB_MAP).find(([, v]) => v.includes(j))?.[1] ||
    [j]
  ))];
}

// ── Batch query helpers ──────────────────────────────────────────

async function batchLoadItems(siklusIds) {
  if (!siklusIds.length) return {};
  const ph = siklusIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT si.*, m.nama as menu_nama_lengkap
     FROM siklus_menu_item si
     LEFT JOIN menu m ON m.id = si.menu_id
     WHERE si.siklus_id IN (${ph})
     ORDER BY si.siklus_id, si.hari_ke ASC`,
    siklusIds
  );
  const map = {};
  for (const r of rows) {
    if (!map[r.siklus_id]) map[r.siklus_id] = [];
    map[r.siklus_id].push(r);
  }
  return map;
}

async function batchLoadBahanCounts(siklusIds) {
  if (!siklusIds.length) return {};
  const ph = siklusIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT siklus_id, hari_ke, COUNT(*) as bahan_count
     FROM siklus_menu_item_bahan
     WHERE siklus_id IN (${ph})
     GROUP BY siklus_id, hari_ke`,
    siklusIds
  );
  const map = {};
  for (const r of rows) {
    if (!map[r.siklus_id]) map[r.siklus_id] = {};
    map[r.siklus_id][r.hari_ke] = r.bahan_count;
  }
  return map;
}

async function batchLoadGridBahanBySiklus(siklusIds) {
  if (!siklusIds.length) return {};
  const ph = siklusIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT sb.siklus_id, sb.hari_ke, sb.kategori_sp, sb.bahan_baku_id,
            COALESCE(b.nama, '(bahan dihapus)') AS nama, b.kalori, b.protein,
            b.karbohidrat, b.lemak, b.serat, b.berat_1_sp, b.persen_bdd,
            b.satuan, b.buffer_persen, b.berat_per_satuan, b.harga_satuan
     FROM siklus_menu_item_bahan sb
     LEFT JOIN bahan_baku b ON b.id = sb.bahan_baku_id
     WHERE sb.siklus_id IN (${ph})`,
    siklusIds
  );
  const bySiklus = {};
  for (const r of rows) {
    if (!bySiklus[r.siklus_id]) bySiklus[r.siklus_id] = [];
    bySiklus[r.siklus_id].push(r);
  }
  return bySiklus;
}

async function batchLoadMenuIdByName(menuNames, tenantId) {
  if (!menuNames || !menuNames.length) return {};
  const uniq = [...new Set(menuNames.map(n => String(n || '').trim()).filter(Boolean))];
  if (!uniq.length) return {};
  const ph = uniq.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT id, nama FROM menu WHERE tenant_id=? AND nama IN (${ph})`,
    [tenantId, ...uniq]
  );
  const map = {};
  for (const r of rows) {
    const key = String(r.nama || '').trim().toLowerCase();
    if (key && !map[key]) map[key] = r.id; // first match wins
  }
  return map;
}

// Normalize lookup: menu_id dulu, lalu cocokkan menu_nama (case-insensitive, trim) ke map by-name
function lookupMenuIdByName(menuIdByName, it) {
  if (it.menu_id) return it.menu_id;
  const key = String(it.menu_nama || '').trim().toLowerCase();
  return key ? (menuIdByName[key] || null) : null;
}

async function batchLoadMenuBahan(menuIds) {
  if (!menuIds.length) return {};
  const ph = menuIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT mb.menu_id, mb.jumlah, mb.bahan_baku_id, mb.keterangan,
            b.nama, b.satuan, b.kategori_sp, b.persen_bdd, b.berat_1_sp,
            b.kalori, b.protein, b.karbohidrat, b.lemak, b.serat, b.berat_per_satuan, b.kode, b.harga_satuan,
            b.buffer_persen,
            m.kategori_penerima
     FROM menu_bahan mb
     JOIN bahan_baku b ON b.id = mb.bahan_baku_id
     JOIN menu m ON m.id = mb.menu_id
     WHERE mb.menu_id IN (${ph})`,
    menuIds
  );
  const map = {};
  for (const r of rows) {
    if (!map[r.menu_id]) map[r.menu_id] = [];
    map[r.menu_id].push(r);
  }
  return map;
}

// Load live recipe for siklus items that have menu_nama but no menu_id (match by name)
async function loadMenuBahanByName(itemsBySiklus, tenantId) {
  const unmatchedNames = [];
  for (const arr of Object.values(itemsBySiklus)) {
    for (const it of arr) {
      if (!it.menu_id && it.menu_nama) unmatchedNames.push(it.menu_nama);
    }
  }
  const menuIdByName = await batchLoadMenuIdByName(unmatchedNames, tenantId);
  const matchedMenuIds = [...new Set(Object.values(menuIdByName))];
  const menuBahanByNameMap = await batchLoadMenuBahan(matchedMenuIds);
  return { menuIdByName, menuBahanByNameMap };
}

async function autoHitungPorsi(tenantId, kategori_penerima, jumlah_porsi) {
  const jenjangList = parseKategoriPenerima(kategori_penerima);
  const allDbVals = expandJenjangToDbValues(jenjangList);
  const porsiFromPm = allDbVals.length ? await (async () => {
    const ph = allDbVals.map(() => '?').join(',');
    const [[{ total }]] = await db.query(
      `SELECT COALESCE(SUM(paket_besar + paket_kecil),0) AS total FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima IN (${ph})`,
      [tenantId, ...allDbVals]
    );
    return Number(total) || 0;
  })() : 0;
  return (jumlah_porsi || 0) || porsiFromPm;
}

async function hitungEstimasiGiziManual(items, gridBahan) {
  const gridByHari = {};
  for (const g of gridBahan) {
    if (!gridByHari[g.hari_ke]) gridByHari[g.hari_ke] = [];
    gridByHari[g.hari_ke].push(g);
  }
  for (const it of items) {
    if (it._has_bahan && !it.menu_id) {
      const dayBahan = gridByHari[it.hari_ke] || [];
      let estKalori = 0, estProtein = 0, estKarbohidrat = 0, estLemak = 0, estSerat = 0;
      for (const b of dayBahan) {
        const estWeight = Number(b.berat_1_sp || 0);
        estKalori  += (Number(b.kalori || 0) / 100) * estWeight;
        estProtein += (Number(b.protein || 0) / 100) * estWeight;
        estKarbohidrat += (Number(b.karbohidrat || 0) / 100) * estWeight;
        estLemak   += (Number(b.lemak || 0) / 100) * estWeight;
        estSerat   += (Number(b.serat || 0) / 100) * estWeight;
      }
      it.kalori = Math.round(estKalori * 100) / 100;
      it.protein = Math.round(estProtein * 100) / 100;
      it.karbohidrat = Math.round(estKarbohidrat * 100) / 100;
      it.lemak = Math.round(estLemak * 100) / 100;
      it.serat = Math.round(estSerat * 100) / 100;
    }
  }
}

// Resolusi berat & BDD per siswa utk item grid & resep menu.
// Sumber BDD: SP Referensi (dicocokkan by nama, prioritas) → bahan_baku.persen_bdd → 100.
// Sumber berat: 1) jumlah (resep)  2) berat_1_sp bahan_baku  3) sp_referensi.berat_bersih  4) 0.
// Mengembalikan { beratPerSiswa, persenBdd, sumberBdd } — sumberBdd menandai
// asal nilai BDD ('sp_referensi' / 'bahan_baku') utk sorotan di /perhitungan-bdd.
function resolveGridBeratPerSiswa(g, spRefMap) {
  const nama = String(g.nama || '').trim();
  const ref = (spRefMap && (spRefMap[nama + ' 1 SP'] || spRefMap[nama])) || {};
  const refBdd = ref.bdd_persen != null ? Number(ref.bdd_persen) : null;
  const persenBdd = refBdd != null ? refBdd : Number(g.persen_bdd || 100);
  const sumberBdd = refBdd != null ? 'sp_referensi' : 'bahan_baku';

  const jumlah = Number(g.jumlah || 0);
  if (jumlah > 0) {
    return { beratPerSiswa: jumlah, persenBdd, sumberBdd };
  }
  const beratLangsung = Number(g.berat_1_sp || 0);
  if (beratLangsung > 0) {
    return { beratPerSiswa: beratLangsung, persenBdd, sumberBdd };
  }
  const beratRef = Number(ref.berat_bersih || 0);
  if (beratRef > 0) {
    return { beratPerSiswa: beratRef, persenBdd, sumberBdd };
  }
  return { beratPerSiswa: 0, persenBdd, sumberBdd };
}

function buildGridNamaFromData(hariKe, gridNamaByHari) {
  const dayBahan = gridNamaByHari[hariKe] || [];
  if (!dayBahan.length) return null;
  const grouped = {};
  for (const b of dayBahan) {
    const kat = b.kategori_sp || 'Lainnya';
    if (!grouped[kat]) grouped[kat] = [];
    grouped[kat].push(b.nama);
  }
  const parts = [];
  for (const kat of KAT_ORDER) {
    if (grouped[kat] && grouped[kat].length) {
      parts.push(grouped[kat].join(', '));
    }
  }
  for (const [kat, names] of Object.entries(grouped)) {
    if (!KAT_ORDER.includes(kat)) {
      parts.push(names.join(', ') + ' (' + kat + ')');
    }
  }
  return parts.length ? parts.join(' + ') : null;
}

function rebuildMenuNama(it, gridNamaByHari) {
  if (!it._has_bahan || it.menu_id) return;
  it.menu_nama = null;
  // Priority 1: resep_map
  if (it.resep_map) {
    try {
      const map = typeof it.resep_map === 'string' ? JSON.parse(it.resep_map) : it.resep_map;
      const names = Object.values(map).filter(v => v && v.trim());
      if (names.length) it.menu_nama = names.join(' + ');
    } catch (e) { /* ignore */ }
  }
  // Priority 2: grid bahan names
  if (!it.menu_nama || !it.menu_nama.trim()) {
    const gridNama = buildGridNamaFromData(it.hari_ke, gridNamaByHari);
    if (gridNama) it.menu_nama = gridNama;
  }
  // Final fallback
  if (!it.menu_nama || !it.menu_nama.trim()) {
    it.menu_nama = 'Menu Hari ' + it.hari_ke;
  }
}

// ── Helper QTY belanja (port dari public/modul/total-kebutuhan.js) ──────
// Dipakai bersama oleh export Total Kebutuhan (laporan-lanjutan.js) dan
// RAB Harian (laporan/rab.js) agar angka QTY belanja konsisten: kebutuhan
// ≥ 1 kg dibulatkan ke atas, kebutuhan < 1 kg ditampilkan pecahan (1/2 kg),
// bahan satuan unit dikonversi via berat_per_satuan.

// Satuan yang dihitung per satuan (pcs/btl/renceng/ctn/karton) vs per berat (kg/g)
function tkIsSatuanHitung(s) {
  const t = String(s || '').toLowerCase();
  return ['pcs', 'btl', 'botol', 'renceng', 'ctn', 'karton', 'kardus', 'dus', 'pack', 'ikat', 'ekor', 'butir', 'bungkus'].includes(t);
}

// Berat isi per satuan efektif — bila kosong, minyak dikarton diasumsikan 6x2L / 12x1L ≈ 12 L ≈ 11 kg
function tkBeratPerSatuanEfektif(satuan, kategoriSp, beratPerSatuan) {
  const b = Number(beratPerSatuan) || 0;
  if (b > 0) return b;
  if (String(kategoriSp || '').toLowerCase() === 'minyak') {
    const s = String(satuan || '').toLowerCase();
    if (s === 'karton' || s === 'ctn' || s === 'kardus' || s === 'dus') return 11000;
  }
  return 0;
}

// Toleransi sebelum pembulatan ke atas (dalam gram): menyerap noise penyimpanan
// menu_bahan.jumlah decimal(15,3) × jumlah porsi (mis. 2839 porsi → error ≤ ~1,5 g),
// agar kebutuhan asli yang nyaris bulat (mis. 4,00015 kg) TIDAK melompat ke satuan
// berikutnya (4 → 5). Nilai yang benar-benar melebihi batas tetap dibulatkan ke atas.
const TK_QTY_TOLERANSI_GRAM = 10;
// Minimal 1 satuan beli bila ada kebutuhan nyata (mencegah toleransi mengubah 8 g → 0 kg
// atau baris hilang dari RAB karena qty <= 0 di-skip).
function tkCeilAman(v, totalKg) {
  const q = Math.ceil(v);
  if (q < 1 && totalKg > 0) return 1;
  return q;
}

function tkGcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = b; b = a % b; a = t; }
  return a;
}

// Format angka jadi pecahan bila rapi (1/2, 1/3, 1/4, 1/5, 2/3, 3/4 dst.) —
// penyebut dibatasi 2..6 (pecahan umum dapur) agar nilai tak-rapi (mis. 0,57 kg
// — hasil 0,5 ÷ porsi × siswa) TIDAK tampil sebagai pecahan menyesatkan "4/7".
function tkPecahan(v) {
  if (v == null || isNaN(v)) return '0,00';
  const n0 = Number(v);
  if (n0 === 0) return '0';
  const neg = n0 < 0;
  let n = Math.abs(n0);
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 0.005) return (neg ? '-' : '') + String(whole);
  let best = null;
  for (let d = 2; d <= 6; d++) {
    const num = Math.round(frac * d);
    if (num < 1 || num >= d) continue;
    const err = Math.abs(frac - num / d);
    if (err < 0.005 && (!best || err < best.err)) best = { num, den: d, err };
  }
  if (best) {
    const g = tkGcd(best.num, best.den);
    return (neg ? '-' : '') + (whole > 0 ? whole + ' ' : '') + (best.num / g) + '/' + (best.den / g);
  }
  return (neg ? '-' : '') + n.toFixed(2).replace('.', ',');
}

// QTY belanja sebagai teks, sama persis dgn tampilan Total Kebutuhan:
// "286 kg", "1/2 kg", "5 pcs", "500 g", dst. ('' bila tidak bisa dihitung).
function tkAutoQty(satuan, totalKg, jumlahSiswa, kategoriSp, beratPerSatuan) {
  const s = String(satuan || 'kg').toLowerCase();
  if (s === 'kg' || s === 'g' || s === 'gram' || s === 'gr') {
    if (s === 'kg') {
      // Kebutuhan kecil (< 1 kg) → pecahan aslinya (mis. 0,2 kg → 1/5 kg)
      // agar kebutuhan kecil tidak dibulatkan ke 1 kg; kebutuhan ≥ 1 kg tetap
      // dibulatkan ke atas ke kg utuh (belanja aman).
      if (totalKg > 0 && totalKg < 1) {
        let qKecil = Math.round(totalKg * 100) / 100;
        if (qKecil <= 0) qKecil = 0.01;
        return tkPecahan(qKecil) + ' kg';
      }
      return tkCeilAman(totalKg - TK_QTY_TOLERANSI_GRAM / 1000, totalKg) + ' kg';
    }
    return tkCeilAman(totalKg * 1000 - TK_QTY_TOLERANSI_GRAM, totalKg) + ' g';
  }
  if (tkIsSatuanHitung(s)) {
    const bps = tkBeratPerSatuanEfektif(satuan, kategoriSp, beratPerSatuan);
    if (bps > 0 && totalKg > 0) return tkCeilAman((totalKg * 1000 - TK_QTY_TOLERANSI_GRAM) / bps, totalKg) + ' ' + s;
    if (s === 'karton' || s === 'kardus' || s === 'dus' || s === 'ctn') return '';
    if (totalKg > 0) return tkCeilAman(totalKg * 1000 - TK_QTY_TOLERANSI_GRAM, totalKg) + ' g';
    return (Math.ceil(jumlahSiswa) || 0) + ' ' + s;
  }
  return '';
}

// Parse teks QTY → { qty:number, satuan:string }.
// Mendukung: "206", "206 kg", "2839 pcs", "1/2", "1,5 kg", "4 CARTON".
// (salinan parseTkQtySatuan dari public/modul/total-kebutuhan.js)
function tkParseQtySatuan(str) {
  let s = String(str || '').trim();
  if (!s) return { qty: 0, satuan: '' };
  let satuan = '';
  const mSat = s.match(/([a-zA-Z]+)\s*$/);
  if (mSat) {
    satuan = mSat[1].toUpperCase();
    s = s.slice(0, mSat.index).trim();
  }
  let qty = 0;
  const mMix = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mMix) {
    qty = parseFloat(mMix[1]) + parseFloat(mMix[2]) / parseFloat(mMix[3]);
  } else if (/^[0-9,.\s]+\/[0-9,.\s]+$/.test(s)) {
    const parts = s.split('/');
    const num = parseFloat(parts[0].replace(/\./g, '').replace(/,/g, '.'));
    const den = parseFloat(parts[1].replace(/\./g, '').replace(/,/g, '.'));
    if (den) qty = num / den;
  } else {
    const cleaned = s.replace(/\./g, '').replace(/,/g, '.');
    qty = parseFloat(cleaned);
    if (isNaN(qty)) qty = 0;
  }
  return { qty: Math.round(qty * 100) / 100, satuan: satuan };
}

// Gabungan: teks QTY + hasil parse + bagian angka saja (untuk kolom SATUAN terpisah).
function tkQtyBelanja(satuan, totalKg, jumlahSiswa, kategoriSp, beratPerSatuan) {
  const text = tkAutoQty(satuan, totalKg, jumlahSiswa, kategoriSp, beratPerSatuan);
  const parsed = tkParseQtySatuan(text);
  const qtyText = text.replace(/\s*[a-zA-Z]+\s*$/i, '').trim();
  return { text, qty: parsed.qty, satuan: parsed.satuan, qty_text: qtyText };
}

module.exports = {
  loadStandarSp,
  JENJANG_DISPLAY_ORDER,
  JENJANG_DB_MAP,
  KAT_ORDER,
  buildDbToDisplay,
  computeTanggalSelesai,
  autoArchiveSiklus,
  parseKategoriPenerima,
  escHtml,
  expandSiklusTargetJenjang,
  isPosyanduKat,
  buildPmDisplayMaps,
  expandJenjangToDbValues,
  batchLoadItems,
  batchLoadBahanCounts,
  batchLoadGridBahanBySiklus,
  batchLoadMenuIdByName,
  lookupMenuIdByName,
  batchLoadMenuBahan,
  loadMenuBahanByName,
  autoHitungPorsi,
  hitungEstimasiGiziManual,
  buildGridNamaFromData,
  rebuildMenuNama,
  resolveGridBeratPerSiswa,
  tkIsSatuanHitung,
  tkBeratPerSatuanEfektif,
  TK_QTY_TOLERANSI_GRAM,
  tkCeilAman,
  tkGcd,
  tkPecahan,
  tkAutoQty,
  tkParseQtySatuan,
  tkQtyBelanja,
};
