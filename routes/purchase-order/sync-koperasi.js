/**
 * SYNC KOPERASI — Purchase Order
 *
 * Nomor PO / Invoice untuk pembelian dari koperasi TIDAK digenerate di sistem,
 * melainkan diambil dari sistem koperasi lalu disimpan di kolom:
 *   - no_po_koperasi       (kode pesanan dari koperasi)
 *   - no_invoice_koperasi  (nomor invoice dari koperasi)
 *
 * Endpoint:
 *   POST /purchase_order/:id/kode-koperasi
 *     Simpan nomor yang diberikan koperasi (dari response kirim PO / input manual)
 *   POST /purchase_order/sync-koperasi
 *     Tarik data pesanan/invoice dari API koperasi lalu update no_po_koperasi /
 *     no_invoice_koperasi pada PO lokal yang match (via no_po_koperasi).
 */
const db = require('../../db');

// ─── PLACEHOLDER — sesuaikan dengan URL API baru koperasi ───────────
// Format respons harus berupa array objek atau { status, data: [...] }.
// Field nomor yang dikenali otomatis (lihat KEYS_NO_PO / KEYS_NO_INVOICE).
const KOPERASI_API_URL = process.env.KOPERASI_API_URL || 'https://koperasi.mealify.id/api/pesanan_koperasi.php';

// Kunci kandidat untuk nomor PO koperasi (kode pesanan dari koperasi)
// Catatan: 'no_po' TIDAK dimasukkan di sini karena field no_po di respons
// koperasi adalah nomor PO dari dapur (bukan kode pesanan koperasi).
const KEYS_NO_PO = ['kode_pesanan', 'kode_pesanan_koperasi', 'no_po_koperasi', 'kode', 'nomor_pesanan'];
// Kunci kandidat untuk nomor invoice koperasi
const KEYS_NO_INVOICE = ['no_invoice', 'no_invoice_koperasi', 'nomor_invoice', 'invoice_no', 'invoice'];

function getStr(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim()) return String(obj[k]).trim();
  }
  return null;
}

// Normalisasi respons API menjadi array record (tahan berbagai bentuk respons)
function normalizeRecords(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.records)) return data.records;
  if (data && Array.isArray(data.result)) return data.result;
  return [];
}

function registerSyncKoperasiRoutes(router) {
  // ===== SIMPAN NOMOR KOPERASI (hasil kirim PO / input manual) =====
  router.post('/purchase_order/:id/kode-koperasi', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const t = req.user.tenant_id;
      if (!id) return res.status(400).json({ error: 'ID PO tidak valid' });

      const [[po]] = await db.query('SELECT id, no_po FROM purchase_order WHERE id=? AND tenant_id=?', [id, t]);
      if (!po) return res.status(404).json({ error: 'PO tidak ditemukan' });

      const noPoKoperasi = (req.body && String(req.body.no_po_koperasi || '').trim()) || null;
      const noInvoiceKoperasi = (req.body && String(req.body.no_invoice_koperasi || '').trim()) || null;
      if (!noPoKoperasi && !noInvoiceKoperasi) {
        return res.status(400).json({ error: 'Isi minimal salah satu: no_po_koperasi atau no_invoice_koperasi' });
      }

      await db.query(
        'UPDATE purchase_order SET no_po_koperasi=COALESCE(?, no_po_koperasi), no_invoice_koperasi=COALESCE(?, no_invoice_koperasi) WHERE id=? AND tenant_id=?',
        [noPoKoperasi, noInvoiceKoperasi, id, t]
      );

      res.json({ ok: true, id, no_po: po.no_po, no_po_koperasi: noPoKoperasi, no_invoice_koperasi: noInvoiceKoperasi });
    } catch (e) {
      console.error('Simpan kode koperasi error:', e);
      res.status(500).json({ error: 'Gagal simpan nomor koperasi: ' + e.message });
    }
  });

  // ===== SYNC DARI API KOPERASI =====
  router.post('/purchase_order/sync-koperasi', async (req, res) => {
    try {
      const t = req.user.tenant_id;

      let data;
      try {
        const response = await fetch(KOPERASI_API_URL);
        if (!response.ok) {
          return res.status(502).json({ error: 'Gagal mengambil data dari API koperasi (HTTP ' + response.status + ')' });
        }
        data = await response.json();
      } catch (e) {
        return res.status(502).json({ error: 'Gagal terhubung ke API koperasi: ' + e.message });
      }

      const records = normalizeRecords(data);
      if (!records.length) {
        return res.json({ ok: true, updated: 0, total: 0, message: 'Tidak ada data dari API koperasi' });
      }

      const updated = [];
      for (const rec of records) {
        const noPoKoperasi = getStr(rec, KEYS_NO_PO);
        const noInvoiceKoperasi = getStr(rec, KEYS_NO_INVOICE);
        // Nomor PO lokal yang disimpan koperasi (field no_po dari POST pesanan_dapur)
        const noPoLokal = getStr(rec, ['no_po', 'no_po_dapur', 'kode_po_dapur']);
        if (!noPoKoperasi && !noInvoiceKoperasi && !noPoLokal) continue;

        // Match PO lokal via no_po_koperasi
        let [[po]] = await db.query(
          'SELECT id, no_po FROM purchase_order WHERE tenant_id=? AND no_po_koperasi=?',
          [t, noPoKoperasi]
        );

        // Fallback match via no_invoice_koperasi
        if (!po && noInvoiceKoperasi) {
          [[po]] = await db.query(
            'SELECT id, no_po FROM purchase_order WHERE tenant_id=? AND no_invoice_koperasi=?',
            [t, noInvoiceKoperasi]
          );
        }

        // Fallback match via no_po lokal (nomor PO dapur yang tersimpan di koperasi)
        if (!po && noPoLokal) {
          [[po]] = await db.query(
            'SELECT id, no_po FROM purchase_order WHERE tenant_id=? AND no_po=?',
            [t, noPoLokal]
          );
        }

        if (!po) continue;

        await db.query(
          'UPDATE purchase_order SET no_po_koperasi=COALESCE(?, no_po_koperasi), no_invoice_koperasi=COALESCE(?, no_invoice_koperasi) WHERE id=? AND tenant_id=?',
          [noPoKoperasi, noInvoiceKoperasi, po.id, t]
        );

        updated.push({ id: po.id, no_po: po.no_po, no_po_koperasi: noPoKoperasi, no_invoice_koperasi: noInvoiceKoperasi });
      }

      res.json({
        ok: true,
        total: records.length,
        updated: updated.length,
        detail: updated,
        message: updated.length + ' PO diupdate dari koperasi',
      });
    } catch (e) {
      console.error('Sync koperasi error:', e);
      res.status(500).json({ error: 'Gagal sinkronisasi koperasi: ' + e.message });
    }
  });
}

// ─── RIWAYAT DAPUR (invoice / pesanan koperasi) ─────────────────────
// Endpoint GET /purchase_order/riwayat-koperasi mengambil riwayat
// invoice/pesanan dari API koperasi (riwayat_dapur.php) yang mendukung
// filter: jenis, nama_dapur, tanggal_awal, tanggal_akhir, id_unit_dapur.
const KOPERASI_RIWAYAT_API_URL = process.env.KOPERASI_RIWAYAT_API_URL || 'https://koperasi.mealify.id/api/riwayat_dapur.php';

// Kunci kandidat nomor invoice pada respons riwayat dapur
const KEYS_NO_INVOICE_RIWAYAT = ['no_invoice', 'no_dokumen', 'no_invoice_koperasi', 'nomor_invoice'];

// Normalisasi respons riwayat_dapur.php menjadi array record seragam.
// Respons berbentuk:
//   { status, last_sync, dapur, filter, ringkasan,
//     data: { pesanan: [], invoice_manual: [] }, riwayat: [] }
function normalizeRiwayatRecords(data) {
  let raw = [];
  if (data && Array.isArray(data.riwayat)) {
    raw = data.riwayat;
  } else if (data && data.data) {
    const pesanan = Array.isArray(data.data.pesanan) ? data.data.pesanan : [];
    const invoice = Array.isArray(data.data.invoice_manual) ? data.data.invoice_manual : [];
    raw = pesanan.concat(invoice);
  }

  return raw.map(rec => ({
    jenis: rec.jenis || 'pesanan',
    id: rec.id,
    no_invoice: getStr(rec, KEYS_NO_INVOICE_RIWAYAT),
    no_dokumen: rec.no_dokumen || null,
    no_po: getStr(rec, ['no_po', 'no_po_dapur', 'kode_po_dapur']),
    kode_pesanan: getStr(rec, ['kode_pesanan', 'nomor_pesanan']),
    id_pesanan: rec.id_pesanan != null ? rec.id_pesanan : null,
    penerima: rec.penerima || rec.nama_dapur || null,
    alamat_penerima: rec.alamat_penerima || null,
    nama_perusahaan: rec.nama_perusahaan || null,
    nama_driver: rec.nama_driver || null,
    no_kendaraan: rec.no_kendaraan || null,
    tanggal: rec.tanggal || null,
    status: rec.status || null,
    total: Number(rec.total != null ? rec.total : (rec.total_nilai || 0)),
    keterangan: rec.keterangan || null,
    created_at: rec.created_at || null,
    jumlah_item: Number(rec.jumlah_item != null ? rec.jumlah_item : (Array.isArray(rec.detail) ? rec.detail.length : 0)),
    detail: Array.isArray(rec.detail) ? rec.detail.map(d => ({
      nama_barang: d.nama_barang || d.nama || '-',
      qty: d.kuantitas != null ? d.kuantitas : (d.qty || 0),
      satuan: d.satuan || '',
      harga_satuan: d.harga_satuan != null ? d.harga_satuan : (d.harga || 0),
      subtotal: d.subtotal || 0,
    })) : [],
  }));
}

// Susun query string filter (hanya field yang terisi)
function buildRiwayatQuery(q) {
  const params = new URLSearchParams();
  const KEYS = ['jenis', 'nama_dapur', 'tanggal_awal', 'tanggal_akhir', 'id_unit_dapur', 'limit'];
  for (const k of KEYS) {
    const v = q[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') params.set(k, String(v).trim());
  }
  const s = params.toString();
  return s ? '?' + s : '';
}

async function fetchRiwayatKoperasi(filters) {
  const url = KOPERASI_RIWAYAT_API_URL + buildRiwayatQuery(filters);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Gagal mengambil data dari API riwayat dapur (HTTP ' + response.status + ')');
  }
  return response.json();
}

function registerRiwayatKoperasiRoutes(router) {
  // ===== TAMPILKAN RIWAYAT INVOICE / PESANAN DARI KOPERASI =====
  // GET /purchase_order/riwayat-koperasi?jenis=invoice&nama_dapur=Dapur%20Pusat&tanggal_awal=2026-08-01&tanggal_akhir=2026-08-31&id_unit_dapur=1
  router.get('/purchase_order/riwayat-koperasi', async (req, res) => {
    try {
      const data = await fetchRiwayatKoperasi(req.query);
      const records = normalizeRiwayatRecords(data);
      res.json({
        ok: true,
        total: records.length,
        last_sync: data.last_sync || null,
        dapur: data.dapur || null,
        filter: data.filter || null,
        ringkasan: data.ringkasan || null,
        records,
      });
    } catch (e) {
      console.error('Ambil riwayat koperasi error:', e);
      res.status(502).json({ error: 'Gagal ambil riwayat koperasi: ' + e.message });
    }
  });

  // ===== SINKRON NOMOR INVOICE DARI RIWAYAT KE PO LOKAL =====
  // POST /purchase_order/riwayat-koperasi/sync  (body: filter sama seperti di atas)
  router.post('/purchase_order/riwayat-koperasi/sync', async (req, res) => {
    try {
      const t = req.user.tenant_id;
      const filters = Object.assign({}, req.body || {}, req.query);
      const data = await fetchRiwayatKoperasi(filters);
      const records = normalizeRiwayatRecords(data);

      const updated = [];
      for (const rec of records) {
        const noInvoice = rec.no_invoice;
        const noPo = rec.no_po;
        if (!noInvoice && !noPo) continue;

        // Match PO lokal via no_invoice_koperasi
        let [[po]] = await db.query(
          'SELECT id, no_po FROM purchase_order WHERE tenant_id=? AND no_invoice_koperasi=?',
          [t, noInvoice]
        );
        // Fallback match via no_po lokal (nomor PO dapur yang tersimpan di koperasi)
        if (!po && noPo) {
          [[po]] = await db.query(
            'SELECT id, no_po FROM purchase_order WHERE tenant_id=? AND no_po=?',
            [t, noPo]
          );
        }
        if (!po) continue;

        await db.query(
          'UPDATE purchase_order SET no_invoice_koperasi=COALESCE(?, no_invoice_koperasi), no_po_koperasi=COALESCE(?, no_po_koperasi) WHERE id=? AND tenant_id=?',
          [noInvoice, rec.kode_pesanan || null, po.id, t]
        );
        updated.push({ id: po.id, no_po: po.no_po, no_invoice_koperasi: noInvoice });
      }

      res.json({
        ok: true,
        total: records.length,
        updated: updated.length,
        detail: updated,
        message: updated.length + ' PO diupdate dari riwayat koperasi',
      });
    } catch (e) {
      console.error('Sinkron riwayat koperasi error:', e);
      res.status(502).json({ error: 'Gagal sinkron riwayat koperasi: ' + e.message });
    }
  });

  // ===== IMPOR DOKUMEN RIWAYAT KE LIST PEMBELIAN (purchase_order) =====
  // POST /purchase_order/riwayat-koperasi/import (body: filter sama seperti GET)
  // Membuat record purchase_order BARU untuk setiap invoice/pesanan riwayat yang
  // belum tersimpan, sehingga tampil di list /pembelian. Idempotent — dokumen
  // yang sudah ada (via no_invoice_koperasi / no_po_koperasi) dilewati.
  router.post('/purchase_order/riwayat-koperasi/import', async (req, res) => {
    try {
      const t = req.user.tenant_id;
      const filters = Object.assign({}, req.body || {}, req.query);
      const data = await fetchRiwayatKoperasi(filters);
      const records = normalizeRiwayatRecords(data);

      const imported = [];
      const skipped = [];

      for (const rec of records) {
        const noInvoice = rec.no_invoice;
        const kodePesanan = rec.kode_pesanan;

        // Identitas dokumen untuk dedup sekaligus no_po lokal
        const ident = noInvoice || kodePesanan;
        if (!ident) {
          skipped.push({ id: rec.id, alasan: 'tanpa nomor invoice / kode pesanan' });
          continue;
        }

        // Cek sudah tersimpan? (via no_invoice_koperasi, no_po_koperasi, atau no_po lokal)
        let ada = null;
        if (noInvoice) {
          [[ada]] = await db.query(
            'SELECT id, no_po FROM purchase_order WHERE tenant_id=? AND no_invoice_koperasi=? LIMIT 1',
            [t, noInvoice]
          );
        }
        if (!ada && kodePesanan) {
          [[ada]] = await db.query(
            'SELECT id, no_po FROM purchase_order WHERE tenant_id=? AND no_po_koperasi=? LIMIT 1',
            [t, kodePesanan]
          );
        }
        // Pesanan dari koperasi membawa nomor PO lokal — jangan duplikat PO yang sudah ada
        if (!ada && rec.no_po) {
          [[ada]] = await db.query(
            'SELECT id, no_po FROM purchase_order WHERE tenant_id=? AND no_po=? LIMIT 1',
            [t, rec.no_po]
          );
        }
        if (ada) {
          skipped.push({ id: rec.id, no_po: ada.no_po, alasan: 'sudah tersimpan di sistem' });
          continue;
        }

        // Susun item JSON (bentuk sama dengan item PO lain di sistem)
        const items = (rec.detail || []).map(d => ({
          nama: d.nama_barang || '-',
          qty: Number(d.qty) || 0,
          satuan: d.satuan || '',
          harga: Number(d.harga_satuan) || 0,
          subtotal: Number(d.subtotal) || 0,
        }));
        const totalNilai = Number(rec.total) || items.reduce((s, i) => s + i.subtotal, 0);
        const catatan = ((rec.keterangan ? rec.keterangan + '\n' : '') +
          '[Impor dari riwayat koperasi: ' + (noInvoice || kodePesanan) + ']').trim();
        const noPoLokal = String(ident).slice(0, 50);

        const [ins] = await db.query(
          `INSERT INTO purchase_order
             (tenant_id, no_po, no_po_koperasi, no_invoice_koperasi, tanggal,
              supplier_nama, item, total_nilai, status, unit_dapur, catatan)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?)`,
          [
            t,
            noPoLokal,
            kodePesanan || null,
            noInvoice || null,
            rec.tanggal || new Date().toISOString().slice(0, 10),
            rec.nama_perusahaan || 'KOPERASI',
            JSON.stringify(items),
            totalNilai,
            rec.penerima || null,
            catatan,
          ]
        );

        imported.push({ id: ins.insertId, no_po: noPoLokal, no_invoice: noInvoice, kode_pesanan: kodePesanan });
      }

      res.json({
        ok: true,
        total: records.length,
        imported: imported.length,
        skipped: skipped.length,
        detail: imported,
        skipped_detail: skipped,
        message: imported.length + ' dokumen disimpan ke list pembelian' + (skipped.length ? ', ' + skipped.length + ' dilewati (sudah ada / tanpa nomor)' : ''),
      });
    } catch (e) {
      console.error('Impor riwayat koperasi error:', e);
      res.status(502).json({ error: 'Gagal impor riwayat koperasi: ' + e.message });
    }
  });
}

module.exports = { registerSyncKoperasiRoutes, registerRiwayatKoperasiRoutes };
