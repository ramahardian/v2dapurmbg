/**
 * services/seedBranch.js
 * Menyalin master data dari tenant utama (MAIN_TENANT_ID) ke cabang baru.
 * Data yang disalin: sp_referensi_bahan, standar_sp, jabatan, shift, divisi, shift_divisi.
 * Semua tabel lain untuk cabang baru dimulai kosong (data transaksi & akuntansi).
 */
const db = require('../db');

async function seedBranch(conn, newTenantId, mainTenantId) {
  const q = (sql, params) => conn.query(sql, params || []);
  const done = [];
  const skip = [];

  // 1. sp_referensi_bahan — master nutrisi per bahan
  try {
    const [rows] = await q('SELECT * FROM sp_referensi_bahan WHERE tenant_id=?', [mainTenantId]);
    for (const r of rows) {
      await q(
        `INSERT INTO sp_referensi_bahan (tenant_id, nama, kategori, berat_bersih, bdd_persen, berat_kotor, energi, protein, lemak, karbohidrat, serat)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [newTenantId, r.nama, r.kategori, r.berat_bersih, r.bdd_persen, r.berat_kotor, r.energi, r.protein, r.lemak, r.karbohidrat, r.serat]
      );
    }
    done.push('sp_referensi_bahan (' + rows.length + ')');
  } catch (e) { skip.push('sp_referensi_bahan: ' + e.message); }

  // 2. standar_sp — nilai SP per jenjang per kategori
  try {
    const [rows] = await q('SELECT jenjang, kategori_sp, sp_value FROM standar_sp WHERE tenant_id=?', [mainTenantId]);
    for (const r of rows) {
      await q(
        'INSERT IGNORE INTO standar_sp (tenant_id, jenjang, kategori_sp, sp_value) VALUES (?,?,?,?)',
        [newTenantId, r.jenjang, r.kategori_sp, r.sp_value]
      );
    }
    done.push('standar_sp (' + rows.length + ')');
  } catch (e) { skip.push('standar_sp: ' + e.message); }

  // 3. shift — master shift kerja (remap id agar jabatan/shift_divisi konsisten)
  const shiftIdMap = {};
  try {
    const [rows] = await q('SELECT * FROM shift WHERE tenant_id=?', [mainTenantId]);
    for (const r of rows) {
      const [ins] = await q(
        'INSERT INTO shift (tenant_id, nama, jam_masuk, jam_keluar, warna, is_active) VALUES (?,?,?,?,?,?)',
        [newTenantId, r.nama, r.jam_masuk, r.jam_keluar, r.warna, r.is_active]
      );
      shiftIdMap[r.id] = ins.insertId;
    }
    done.push('shift (' + rows.length + ')');
  } catch (e) { skip.push('shift: ' + e.message); }

  // 4. divisi — master divisi (remap id)
  const divisiIdMap = {};
  try {
    const [rows] = await q('SELECT * FROM divisi WHERE tenant_id=?', [mainTenantId]);
    for (const r of rows) {
      const [ins] = await q(
        'INSERT INTO divisi (tenant_id, nama) VALUES (?,?)',
        [newTenantId, r.nama]
      );
      divisiIdMap[r.id] = ins.insertId;
    }
    done.push('divisi (' + rows.length + ')');
  } catch (e) { skip.push('divisi: ' + e.message); }

  // 5. shift_divisi — relasi shift ↔ divisi (pakai id hasil remap)
  try {
    const [rows] = await q('SELECT * FROM shift_divisi WHERE tenant_id=?', [mainTenantId]);
    for (const r of rows) {
      const newShiftId = shiftIdMap[r.shift_id];
      const newDivisiId = divisiIdMap[r.divisi_id];
      if (!newShiftId || !newDivisiId) continue;
      await q(
        'INSERT IGNORE INTO shift_divisi (shift_id, divisi_id, tenant_id) VALUES (?,?,?)',
        [newShiftId, newDivisiId, newTenantId]
      );
    }
    done.push('shift_divisi (' + rows.length + ')');
  } catch (e) { skip.push('shift_divisi: ' + e.message); }

  // 6. jabatan — master jabatan (remap shift_id ke id shift cabang baru)
  try {
    const [rows] = await q('SELECT * FROM jabatan WHERE tenant_id=?', [mainTenantId]);
    for (const r of rows) {
      await q(
        'INSERT INTO jabatan (tenant_id, name, description, shift_id) VALUES (?,?,?,?)',
        [newTenantId, r.name, r.description, r.shift_id ? (shiftIdMap[r.shift_id] || null) : null]
      );
    }
    done.push('jabatan (' + rows.length + ')');
  } catch (e) { skip.push('jabatan: ' + e.message); }

  return { done, skip };
}

module.exports = { seedBranch };
