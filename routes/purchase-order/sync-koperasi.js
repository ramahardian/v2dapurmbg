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

// Kunci kandidat untuk nomor PO koperasi
const KEYS_NO_PO = ['kode_pesanan', 'kode_pesanan_koperasi', 'no_po', 'no_po_koperasi', 'kode', 'nomor_pesanan'];
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
        if (!noPoKoperasi && !noInvoiceKoperasi) continue;

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

module.exports = { registerSyncKoperasiRoutes };
