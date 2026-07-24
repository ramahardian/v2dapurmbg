/**
 * AUTO JURNAL & KEUANGAN
 * Module untuk auto-posting jurnal double-entry dan recalculate budget realisasi.
 */
const db = require('../../db');

/**
 * 🔁 AUTO JURNAL: Pembelian Bahan Baku → Jurnal Double Entry
 * Debit: Persediaan Bahan Baku (1300), Kredit: Hutang Usaha (3000)
 */
async function autoPostPembelianToJurnal(penerimaan, tenantId, totalNilai, items) {
  const [[akunPersediaan]] = await db.query(
    'SELECT id FROM akun WHERE tenant_id=? AND kode=?',
    [tenantId, '1300']
  );
  const [[akunHutang]] = await db.query(
    'SELECT id FROM akun WHERE tenant_id=? AND kode=?',
    [tenantId, '3000']
  );
  if (!akunPersediaan || !akunHutang) {
    console.warn('⚠️ Auto-jurnal pembelian skip (akun 1300/3000 belum ada):', penerimaan.id);
    return;
  }

  const noJurnal = `JRN-B/${penerimaan.id}/${Date.now().toString(36).toUpperCase()}`;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Cek duplikat dalam transaksi dgn FOR UPDATE (cegah race condition)
    const [[existing]] = await conn.query(
      'SELECT id FROM jurnal WHERE tenant_id=? AND sumber_transaksi=? AND sumber_id=? FOR UPDATE',
      [tenantId, 'penerimaan_barang', penerimaan.id]
    );
    if (existing) {
      await conn.commit();
      return;
    }

    const [jr] = await conn.query(
      `INSERT INTO jurnal (tenant_id, no_jurnal, tanggal, sumber_transaksi, sumber_id, deskripsi)
       VALUES (?, ?, ?, 'penerimaan_barang', ?, ?)`,
      [tenantId, noJurnal, penerimaan.tanggal_terima, penerimaan.id,
       `Pembelian Bahan: ${penerimaan.supplier_nama || 'Supplier'} (${penerimaan.no_dokumen})`]
    );
    const jurnalId = jr.insertId;

    // Debit: Persediaan Bahan Baku
    await conn.query(
      `INSERT INTO jurnal_detail (jurnal_id, akun_id, debit, kredit, deskripsi)
       VALUES (?, ?, ?, 0, ?)`,
      [jurnalId, akunPersediaan.id, totalNilai,
       `Pembelian ${items ? items.length + ' jenis' : ''} bahan - ${penerimaan.no_dokumen}`]
    );

    // Kredit: Hutang Usaha
    await conn.query(
      `INSERT INTO jurnal_detail (jurnal_id, akun_id, debit, kredit, deskripsi)
       VALUES (?, ?, 0, ?, ?)`,
      [jurnalId, akunHutang.id, totalNilai,
       `Hutang ke ${penerimaan.supplier_nama || 'Supplier'} - ${penerimaan.no_dokumen}`]
    );

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error('❌ Auto jurnal pembelian rollback:', e);
  } finally {
    conn.release();
  }
}

/**
 * 6. Reusable: Recalculate Budget Realisasi
 * Menghitung ulang realisasi budget berdasarkan transaksi kas keluar per periode.
 */
async function recalculateRealisasi(tenantId) {
  const t = tenantId;
  const [budgets] = await db.query('SELECT * FROM budget WHERE tenant_id=? ORDER BY periode', [t]);
  const [kasKeluar] = await db.query(
    `SELECT DATE_FORMAT(tanggal,'%Y-%m') as periode, SUM(jumlah) as total
     FROM kas_bank WHERE tenant_id=? AND tipe='keluar' GROUP BY periode`,
    [t]
  );
  const kasMap = {};
  for (const k of kasKeluar) kasMap[k.periode] = Number(k.total);

  const perPeriode = {};
  for (const b of budgets) {
    if (!perPeriode[b.periode]) perPeriode[b.periode] = [];
    perPeriode[b.periode].push(b);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let updated = 0;
    for (const [periode, entries] of Object.entries(perPeriode)) {
      const totalKas = kasMap[periode] || 0;
      if (totalKas <= 0) continue;
      const totalBudget = entries.reduce((s, e) => s + Number(e.total_budget), 0);
      if (totalBudget <= 0) {
        const share = totalKas / entries.length;
        for (const e of entries) {
          await conn.query('UPDATE budget SET realisasi=? WHERE id=? AND tenant_id=?', [share, e.id, t]);
          updated++;
        }
      } else {
        for (const e of entries) {
          const share = totalKas * (Number(e.total_budget) / totalBudget);
          await conn.query('UPDATE budget SET realisasi=? WHERE id=? AND tenant_id=?', [share, e.id, t]);
          updated++;
        }
      }
    }
    await conn.commit();
    return updated;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { autoPostPembelianToJurnal, recalculateRealisasi };
