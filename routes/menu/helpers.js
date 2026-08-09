/**
 * HELPERS — Menu
 * Shared utility functions yang digunakan bersama antara POST dan PUT menu endpoints.
 */
const db = require('../../db');
const fs = require('fs');
const path = require('path');

/**
 * Simpan foto sebagai base64 ke disk
 */
function saveBase64Foto(base64Data) {
  if (!base64Data || !base64Data.startsWith('data:image')) return base64Data || null;
  const matches = base64Data.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
  if (!matches) return null;
  try {
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const filepath = path.join(__dirname, '..', '..', 'public', 'uploads', 'menu', filename);
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, buffer);
    return '/uploads/menu/' + filename;
  } catch { return null; }
}

/**
 * Load SP values + jumlah porsi untuk kategori_penerima tertentu
 */
async function loadSpData(tenantId, kategoriPenerima) {
  const spMap = {};
  let jumlahPorsi = 0;
  if (kategoriPenerima) {
    const [spRows] = await db.query(
      'SELECT kategori_sp, sp_value FROM standar_sp WHERE jenjang=?',
      [kategoriPenerima]
    );
    for (const r of spRows) spMap[r.kategori_sp] = Number(r.sp_value);
    const { totalPmForKategori } = require('../siklus/helpers');
    jumlahPorsi = await totalPmForKategori(tenantId, [kategoriPenerima]);
  }
  return { spMap, jumlahPorsi };
}

/**
 * Load sp_referensi_bahan sebagai lookup nutrition
 */
async function loadSpRefMap(tenantId) {
  const spRefMap = {};
  try {
    const [spRefRows] = await db.query(
      'SELECT nama, berat_bersih, energi, protein, lemak, karbohidrat, serat FROM sp_referensi_bahan WHERE tenant_id=?',
      [tenantId]
    );
    for (const r of spRefRows) {
      spRefMap[r.nama] = {
        berat_bersih: Number(r.berat_bersih) || 0,
        energi: Number(r.energi) || 0,
        protein: Number(r.protein) || 0,
        lemak: Number(r.lemak) || 0,
        karbohidrat: Number(r.karbohidrat) || 0,
        serat: Number(r.serat) || 0,
      };
    }
  } catch (e) { /* table optional */ }
  return spRefMap;
}

/**
 * Load bahan_baku name map
 */
async function loadBbNamaMap(tenantId) {
  const [bbRows] = await db.query('SELECT id, nama FROM bahan_baku WHERE tenant_id=?', [tenantId]);
  const bbNamaMap = {};
  for (const r of bbRows) bbNamaMap[r.id] = r.nama;
  return bbNamaMap;
}

/**
 * Batch-load bahan_baku untuk verifikasi nama pada smart lookup
 */
async function buildBbCheckMap(conn, bahan, tenantId) {
  const bbCheckMap = {};
  for (const b of bahan) {
    const idB = Number(b.bahan_baku_id) || 0;
    if (idB && b.nama) bbCheckMap[idB] = null;
  }
  const ids = Object.keys(bbCheckMap);
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const [bbRows] = await conn.query(
      `SELECT id, nama FROM bahan_baku WHERE id IN (${ph}) AND tenant_id=?`,
      [...ids, tenantId]
    );
    for (const r of bbRows) bbCheckMap[r.id] = r.nama;
  }
  return bbCheckMap;
}

/**
 * Proses satu item bahan: lookup/auto-create bahan_baku, hitung jumlah dari SP
 * Returns { idBahan, jumlah } or null if skip
 */
async function processBahanItem(b, conn, tenantId, spMap, jumlahPorsi, spRefMap, bbNamaMap) {
  let idBahan = Number(b.bahan_baku_id) || 0;

  // Smart lookup: jika ID berubah nama, cari ulang by nama
  if (idBahan && b.nama) {
    const bbCheckMap = await buildBbCheckMap(conn, [b], tenantId);
    if (bbCheckMap[idBahan] !== undefined && bbCheckMap[idBahan] !== b.nama) {
      const [newBb] = await conn.query(
        'SELECT id FROM bahan_baku WHERE tenant_id=? AND nama=?',
        [tenantId, b.nama]
      );
      idBahan = newBb.length ? newBb[0].id : 0;
    }
  }

  // Auto-create bahan_baku jika tidak ditemukan
  if (!idBahan && b.nama) {
    const [existingBb] = await conn.query(
      'SELECT id FROM bahan_baku WHERE tenant_id=? AND nama=?',
      [tenantId, b.nama]
    );
    if (existingBb.length) {
      idBahan = existingBb[0].id;
    } else {
      const [bbInsert] = await conn.query(
        `INSERT INTO bahan_baku (tenant_id, nama, satuan, kategori_sp, berat_1_sp, persen_bdd, berat_per_satuan, kalori, protein, karbohidrat, lemak, serat)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [tenantId, b.nama, b.satuan || 'g', b.kategori_sp || null,
         Number(b.berat_1_sp) || 0, Number(b.persen_bdd) || 100, Number(b.berat_per_satuan) || Number(b.berat_1_sp) || 0,
         Number(b.kalori) || 0, Number(b.protein) || 0, Number(b.karbohidrat) || 0, Number(b.lemak) || 0, Number(b.serat) || 0]
      );
      idBahan = bbInsert.insertId;
    }
  }

  if (!idBahan) return null;

  let jumlah = Number(b.jumlah) || 0;

  // Auto-calculate from SP
  if (jumlah === 0 && b.kategori_sp && spMap[b.kategori_sp]) {
    const spVal = spMap[b.kategori_sp];
    const namaBahan = b.nama || bbNamaMap[idBahan] || '';
    const refData = spRefMap[namaBahan] || {};
    const berat1Sp = refData.berat_bersih || Number(b.berat_1_sp) || 0;
    jumlah = berat1Sp * spVal;
  }

  return { idBahan, jumlah };
}

/**
 * Hitung nilai gizi dari bahan-bahan menu
 */
function calculateNutrition(menuBahanRows, spRefMap) {
  let gramasi = 0, kalori = 0, protein = 0, karbohidrat = 0, lemak = 0, serat = 0;
  for (const b of menuBahanRows) {
    const jml = Number(b.jumlah) || 0;
    const ref = spRefMap[b.nama] || {};
    gramasi += jml;
    kalori += jml / 100 * (Number(ref.energi || b.kalori) || 0);
    protein += jml / 100 * (Number(ref.protein || b.protein) || 0);
    karbohidrat += jml / 100 * (Number(ref.karbohidrat || b.karbohidrat) || 0);
    lemak += jml / 100 * (Number(ref.lemak || b.lemak) || 0);
    serat += jml / 100 * (Number(ref.serat || b.serat) || 0);
  }
  return {
    gramasi: Math.round(gramasi * 10) / 10,
    kalori: Math.round(kalori * 10) / 10,
    protein: Math.round(protein * 10) / 10,
    karbohidrat: Math.round(karbohidrat * 10) / 10,
    lemak: Math.round(lemak * 10) / 10,
    serat: Math.round(serat * 10) / 10,
  };
}

/**
 * Sync siklus_menu_item_bahan (ketika menu dibuat/diedit dari konteks siklus)
 */
async function syncSiklusBahan(conn, siklusSource, bahan, tenantId) {
  if (!siklusSource || !siklusSource.siklus_id || !Array.isArray(bahan)) return;
  try {
    await conn.query(
      'DELETE FROM siklus_menu_item_bahan WHERE siklus_id=? AND hari_ke=?',
      [siklusSource.siklus_id, siklusSource.hari_ke]
    );
    for (const b of bahan) {
      const idBahan = Number(b.bahan_baku_id) || 0;
      if (idBahan) {
        await conn.query(
          'INSERT INTO siklus_menu_item_bahan (siklus_id, hari_ke, kategori_sp, bahan_baku_id) VALUES (?,?,?,?)',
          [siklusSource.siklus_id, siklusSource.hari_ke, b.kategori_sp || null, idBahan]
        );
      }
    }
  } catch (e) {
    console.error('Gagal sync siklus:', e.message);
  }
}

module.exports = {
  saveBase64Foto,
  loadSpData,
  loadSpRefMap,
  loadBbNamaMap,
  processBahanItem,
  calculateNutrition,
  syncSiklusBahan,
};
