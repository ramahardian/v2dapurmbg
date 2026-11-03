/**
 * AUTO STOK
 * Module untuk otomatis membuat stok masuk/keluar dari transaksi terkait.
 */
const db = require('../../db');
const { autoPostPembelianToJurnal } = require('./auto-jurnal');

/**
 * Auto Stok Masuk: Penerimaan Barang (Lolos QC) → INSERT stok_masuk + UPDATE stok_saat_ini
 */
async function autoStokMasukFromPenerimaan(penerimaan, tenantId) {
  let items = [];
  try { items = JSON.parse(penerimaan.item || '[]'); } catch { return; }
  const valid = items.filter(i => i.bahan_baku_id && (Number(i.qty) > 0 || Number(i.jumlah) > 0));
  if (!valid.length) return;

  const sourcePrefix = `Penerimaan: ${penerimaan.no_dokumen}`;
  const [[{ cnt } = { cnt: 0 }]] = await db.query(
    'SELECT COUNT(*) AS cnt FROM stok_masuk WHERE tenant_id=? AND sumber LIKE ?',
    [tenantId, sourcePrefix + '%']
  );
  if (cnt > 0) return;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let totalNilai = 0;
    for (const item of valid) {
      const jumlah = Number(item.qty || item.jumlah || 0);
      if (jumlah <= 0) continue;
      await conn.query(
        `INSERT INTO stok_masuk (tenant_id, tanggal, bahan_baku_id, jumlah, sumber, catatan) VALUES (?,?,?,?,?,?)`,
        [tenantId, penerimaan.tanggal_terima, item.bahan_baku_id, jumlah, sourcePrefix,
         `Dari ${penerimaan.supplier_nama || 'Supplier'}${item.nama ? ' - ' + item.nama : ''}`]
      );
      await conn.query(
        `UPDATE bahan_baku SET stok_saat_ini = stok_saat_ini + ? WHERE id=? AND tenant_id=?`,
        [jumlah, item.bahan_baku_id, tenantId]
      );
      // Hitung total nilai untuk jurnal
      let harga = Number(item.harga_satuan || item.harga || 0);
      if (!harga) {
        const [[bb]] = await db.query('SELECT harga_satuan FROM bahan_baku WHERE id=?', [item.bahan_baku_id]);
        harga = Number(bb?.harga_satuan || 0);
      }
      totalNilai += jumlah * harga;
    }
    await conn.commit();

    // 🔁 AUTO JURNAL: Stok Masuk (Pembelian) → Jurnal Umum
    if (totalNilai > 0) {
      try {
        await autoPostPembelianToJurnal(penerimaan, tenantId, totalNilai, items);
      } catch (e) {
        console.error('Auto jurnal stok masuk gagal:', e.message);
      }
    }
  } catch (e) {
    await conn.rollback();
    console.error('Auto stok masuk rollback:', e);
  } finally {
    conn.release();
  }
}

/**
 * Auto Stok Keluar: Produksi (Diproduksi/Selesai) → INSERT stok_keluar + UPDATE stok_saat_ini
 */
async function autoStokKeluarFromProduksi(produksi, tenantId) {
  if (!produksi.menu_id || !produksi.jumlah_porsi) return;

  const tujuanPrefix = `Produksi: ${produksi.id}`;
  const [[{ cnt } = { cnt: 0 }]] = await db.query(
    'SELECT COUNT(*) AS cnt FROM stok_keluar WHERE tenant_id=? AND tujuan LIKE ?',
    [tenantId, tujuanPrefix + '%']
  );
  if (cnt > 0) return;

  const [bahanRows] = await db.query(
    `SELECT mb.bahan_baku_id, b.nama AS bahan_nama, mb.jumlah AS jumlah_per_porsi
     FROM menu_bahan mb JOIN bahan_baku b ON b.id = mb.bahan_baku_id
     WHERE mb.menu_id=?`,
    [produksi.menu_id]
  );
  if (!bahanRows.length) return;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const bahan of bahanRows) {
      const jumlah = Number(bahan.jumlah_per_porsi) * Number(produksi.jumlah_porsi);
      if (jumlah <= 0) continue;
      await conn.query(
        `INSERT INTO stok_keluar (tenant_id, tanggal, bahan_baku_id, jumlah, tujuan, catatan) VALUES (?,?,?,?,?,?)`,
        [tenantId, produksi.tanggal_produksi, bahan.bahan_baku_id, jumlah, tujuanPrefix,
         `Produksi ${produksi.menu_nama || ''} - ${produksi.jumlah_porsi} porsi`]
      );
      await conn.query(
        `UPDATE bahan_baku SET stok_saat_ini = stok_saat_ini - ? WHERE id=? AND tenant_id=?`,
        [jumlah, bahan.bahan_baku_id, tenantId]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error('Auto stok keluar rollback:', e);
  } finally {
    conn.release();
  }
}

module.exports = { autoStokMasukFromPenerimaan, autoStokKeluarFromProduksi };
