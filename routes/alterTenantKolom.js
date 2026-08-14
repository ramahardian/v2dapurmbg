const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
// PENTING: jangan pasang requireRole('admin') di router.use() tanpa path — itu
// akan memblokir SEMUA endpoint /api lain yang tidak tertangkap router sebelumnya.
// Batasi gerbang admin HANYA pada rute file ini.
router.use(requireAuth);

// Tabel yang WAJIB punya kolom tenant_id (multi-tenant), tapi bisa saja belum ada
// di DB lama / cabang yang belum dimigrasi. Yang dicantumkan di sini hanyalah
// tabel yang query-nya memfilter tenant_id LANGSUNG di WHERE — tabel anak seperti
// menu_bahan / siklus_menu_item di-scope lewat JOIN ke tabel induknya.
const TABEL = [
  {
    nama: 'standar_sp',
    backfill: true,
    // Standar SP juga punya unique key per tenant: ganti (jenjang,kategori_sp)
    // menjadi (tenant_id,jenjang,kategori_sp) agar data antar cabang tidak bentrok.
    gantiUnique: [{ dari: 'uk_jenjang_kategori', ke: 'uk_jenjang_kategori_tenant', kolom: 'tenant_id, jenjang, kategori_sp' }],
  },
  {
    nama: 'jabatan',
    backfill: true,
    gantiUnique: [],
  },
];

router.get('/alter-tenant-kolom', requireRole('admin'), async (req, res) => {
  const hasil = [];
  try {
    for (const t of TABEL) {
      const r = { tabel: t.nama, status: 'noop', detail: [] };
      const [cols] = await db.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [t.nama]
      );
      const punya = cols.some((c) => c.COLUMN_NAME === 'tenant_id');

      if (!punya) {
        await db.query(`ALTER TABLE ${t.nama} ADD COLUMN tenant_id INT NULL AFTER id, ADD INDEX idx_${t.nama}_tenant (tenant_id)`);
        r.detail.push('ADD COLUMN tenant_id INT NULL + index');
        if (t.backfill) {
          await db.query(`UPDATE ${t.nama} SET tenant_id=1 WHERE tenant_id IS NULL`);
          r.detail.push('backfill tenant_id=1');
        }
        r.status = 'created';
      } else {
        r.detail.push('kolom tenant_id sudah ada');
      }

      for (const uk of t.gantiUnique) {
        const [ukRows] = await db.query(
          `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
          [t.nama, uk.ke]
        );
        if (ukRows.length) {
          r.detail.push(`unique key ${uk.ke} sudah ada`);
          continue;
        }
        const [dariRows] = await db.query(
          `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
          [t.nama, uk.dari]
        );
        if (dariRows.length) {
          await db.query(`ALTER TABLE ${t.nama} DROP INDEX \`${uk.dari}\``);
          r.detail.push(`drop index ${uk.dari}`);
        }
        await db.query(`ALTER TABLE ${t.nama} ADD UNIQUE KEY \`${uk.ke}\` (${uk.kolom})`);
        r.detail.push(`add unique key ${uk.ke} (${uk.kolom})`);
        if (r.status === 'noop') r.status = 'updated';
      }

      hasil.push(r);
    }

    res.json({ ok: true, hasil });
  } catch (e) {
    res.status(500).json({ ok: false, status: 'error', message: 'Gagal: ' + e.message });
  }
});

module.exports = router;
