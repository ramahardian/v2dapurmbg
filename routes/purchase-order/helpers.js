/**
 * HELPERS — Purchase Order
 * Shared constants, utility functions, and data loaders
 * yang digunakan bersama oleh generate dan create-pr endpoints.
 */
const db = require('../../db');

// ─── CONSTANTS ────────────────────────────────
const JENJANG_DB_MAP = {
  'TK/PAUD': ['TK/PAUD', 'TK', 'PAUD'],
  'SD/MI (1-3)': ['SD 1-3', 'SD/MI (1-3)', 'SD'],
  'SD/MI (4-6)': ['SD 4-6', 'SD/MI (4-6)'],
  'SMP/MTs, SMA/SMK': ['SMP', 'SMA', 'SMP/MTs, SMA/SMK'],
  'Bumil/Busui': ['Ibu Hamil', 'Ibu Menyusui', 'Bumil/Busui'],
  'Balita': ['Balita'],
};

/**
 * Helpers: utility functions
 */
function getJenjangList(kp) {
  if (!kp) return [];
  try { const p = JSON.parse(kp); if (Array.isArray(p)) return p; } catch {}
  return [kp];
}

function expandJenjang(jl) {
  const result = [];
  for (const j of jl) {
    const expanded = JENJANG_DB_MAP[j] || Object.entries(JENJANG_DB_MAP).find(([,v]) => v.includes(j))?.[1] || [j];
    result.push(...expanded);
  }
  return [...new Set(result)];
}

/**
 * Buat mapping dbToDisplay dari JENJANG_DB_MAP
 */
function createDbToDisplay() {
  const dbToDisplay = {};
  for (const [display, dbVals] of Object.entries(JENJANG_DB_MAP)) {
    for (const dv of dbVals) dbToDisplay[dv] = display;
  }
  return dbToDisplay;
}

/**
 * Load penerima manfaat per jenjang
 */
async function loadPmByJenjang(tenantId) {
  const [pmByJenjang] = await db.query(
    `SELECT COALESCE(kategori_penerima, 'Lainnya') AS jenjang,
            COALESCE(SUM(paket_besar + paket_besar_utama + paket_kecil + sample + guru_tendik), 0) AS total_penerima
     FROM penerima_manfaat WHERE tenant_id=?
     GROUP BY kategori_penerima`,
    [tenantId]
  );
  return pmByJenjang;
}

/**
 * Build pmMap (display → { total_penerima }) dari raw PM data
 */
function buildPmMap(pmByJenjang, dbToDisplay) {
  const pmMap = {};
  for (const p of pmByJenjang) {
    const display = dbToDisplay[p.jenjang] || p.jenjang;
    if (!pmMap[display]) pmMap[display] = { total_penerima: 0 };
    pmMap[display].total_penerima += Number(p.total_penerima);
  }
  return pmMap;
}

/**
 * Load SP values for a list of jenjang display labels
 */
async function loadSpMap(jenjangList) {
  const dbVariants = expandJenjang(jenjangList);
  const spMap = {};
  if (dbVariants.length) {
    const spSql = dbVariants.length === 1
      ? 'SELECT kategori_sp, sp_value FROM standar_sp WHERE jenjang=?'
      : `SELECT kategori_sp, MAX(sp_value) AS sp_value FROM standar_sp WHERE jenjang IN (${dbVariants.map(() => '?').join(',')}) GROUP BY kategori_sp`;
    const [spRows] = await db.query(spSql, dbVariants.length === 1 ? [dbVariants[0]] : dbVariants);
    for (const sr of spRows) spMap[sr.kategori_sp] = Number(sr.sp_value);
  }
  return spMap;
}

/**
 * Load siklus items with menu data
 */
async function loadSiklusItems(siklusId) {
  const [items] = await db.query(
    `SELECT si.*, m.gramasi_total FROM siklus_menu_item si
     LEFT JOIN menu m ON m.id = si.menu_id
     WHERE si.siklus_id=? AND si.menu_id IS NOT NULL`,
    [siklusId]
  );
  return items;
}

/**
 * Load menu_bahan per menu_id (batch)
 */
async function loadMenuBahan(menuIds) {
  if (!menuIds.length) return {};
  const mph = menuIds.map(() => '?').join(',');
  const [bahanRows] = await db.query(
    `SELECT mb.menu_id, mb.bahan_baku_id, mb.jumlah,
            b.nama, b.satuan, b.harga_satuan,
            b.persen_bdd, b.kode, b.kategori_sp, b.berat_per_satuan, b.berat_1_sp,
            COALESCE(b.buffer_persen, 10) AS buffer_persen
     FROM menu_bahan mb
     JOIN bahan_baku b ON b.id = mb.bahan_baku_id
     WHERE mb.menu_id IN (${mph})`,
    menuIds
  );
  const menuBahanById = {};
  for (const br of bahanRows) {
    if (!menuBahanById[br.menu_id]) menuBahanById[br.menu_id] = [];
    menuBahanById[br.menu_id].push(br);
  }
  return menuBahanById;
}

/**
 * Load grid bahan items for a siklus (when no menu assigned)
 */
async function loadGridBahan(siklusId) {
  const [gridBahanRaw] = await db.query(
    `SELECT smib.hari_ke, smib.kategori_sp, smib.bahan_baku_id,
            bb.nama, bb.satuan, bb.harga_satuan, bb.persen_bdd, bb.berat_1_sp, bb.berat_per_satuan,
            bb.kode, bb.kategori_sp AS bb_kategori_sp,
            COALESCE(bb.buffer_persen, 10) AS buffer_persen
     FROM siklus_menu_item_bahan smib
     JOIN bahan_baku bb ON bb.id=smib.bahan_baku_id
     WHERE smib.siklus_id=?`,
    [siklusId]
  );
  return gridBahanRaw;
}

/**
 * Buat gridCellCount dari gridBahanRaw
 */
function buildGridCellCount(gridBahanRaw) {
  const gridCellCount = {};
  for (const gb of gridBahanRaw) {
    const cellKey = gb.hari_ke + '-' + gb.kategori_sp;
    if (!gridCellCount[cellKey]) gridCellCount[cellKey] = 0;
    gridCellCount[cellKey]++;
  }
  return gridCellCount;
}

/**
 * Cek apakah satuan adalah gram-based
 */
function isGramSatuan(satuan) {
  return ['gram', 'g', 'gr', 'kg'].includes((satuan || '').toLowerCase());
}

module.exports = {
  JENJANG_DB_MAP,
  getJenjangList,
  expandJenjang,
  createDbToDisplay,
  loadPmByJenjang,
  buildPmMap,
  loadSpMap,
  loadSiklusItems,
  loadMenuBahan,
  loadGridBahan,
  buildGridCellCount,
  isGramSatuan,
};
