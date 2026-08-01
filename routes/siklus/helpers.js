const db = require('../../db');

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

// ── Helpers ───────────────────────────────────────────────────────

function parseKategoriPenerima(kp) {
  if (!kp) return [];
  try { const p = JSON.parse(kp); if (Array.isArray(p)) return p; } catch {}
  return [kp];
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
            b.satuan, b.buffer_persen, b.berat_per_satuan
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

module.exports = {
  JENJANG_DISPLAY_ORDER,
  JENJANG_DB_MAP,
  KAT_ORDER,
  buildDbToDisplay,
  parseKategoriPenerima,
  escHtml,
  expandJenjangToDbValues,
  batchLoadItems,
  batchLoadBahanCounts,
  batchLoadGridBahanBySiklus,
  batchLoadMenuBahan,
  autoHitungPorsi,
  hitungEstimasiGiziManual,
  buildGridNamaFromData,
  rebuildMenuNama,
};
