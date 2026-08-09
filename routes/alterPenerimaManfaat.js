const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
// PENTING: jangan pasang requireRole('admin') di router.use() tanpa path — itu
// akan memblokir SEMUA endpoint /api lain yang tidak tertangkap router sebelumnya.
// Batasi gerbang admin HANYA pada rute file ini.
router.use(requireAuth);

// Daftar jenjang lengkap halaman Penerima Manfaat (termasuk SAMPLE & GURU & TENDIK)
const JENJANG = ['TK/PAUD', 'SD 1-3', 'SD 4-6', 'SMP', 'SMA', 'Ibu Hamil', 'Ibu Menyusui', 'Balita', 'Posyandu', 'SAMPLE', 'GURU & TENDIK'];

// Kolom yang dipakai form CRUD /penerima-manfaat (mungkin belum ada di DB lama)
const KOLOM_WAJIB = [
  ['kategori_penerima', "VARCHAR(50) DEFAULT NULL"],
  ['status_kepemilikan', "ENUM('NEGERI','SWASTA') DEFAULT NULL"],
  ['provinsi', "VARCHAR(100) DEFAULT NULL"],
  ['kota', "VARCHAR(100) DEFAULT NULL"],
  ['kecamatan', "VARCHAR(100) DEFAULT NULL"],
  ['nomor_telepon', "VARCHAR(20) DEFAULT NULL"],
  ['nama_kontak', "VARCHAR(255) DEFAULT NULL"],
  ['email', "VARCHAR(100) DEFAULT NULL"],
  ['sample', 'INT DEFAULT 0'],
  ['guru_tendik', 'INT DEFAULT 0'],
];

router.get('/alter-penerima-manfaat', requireRole('admin'), async (req, res) => {
  try {
    const [cols] = await db.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'penerima_manfaat'`
    );
    const has = (name) => cols.some((c) => c.COLUMN_NAME === name);

    // 1) Tambahkan kolom yang belum ada
    const added = [];
    for (const [name, ddl] of KOLOM_WAJIB) {
      if (!has(name)) {
        await db.query(`ALTER TABLE penerima_manfaat ADD COLUMN ${name} ${ddl}`);
        added.push(name);
      }
    }

    // 2) Pastikan kategori_penerima (Jenjang) memuat SAMPLE & GURU & TENDIK
    const kat = cols.find((c) => c.COLUMN_NAME === 'kategori_penerima');
    const sudahEnum = kat && /^enum/i.test(kat.COLUMN_TYPE);

    // Gabungkan daftar jenjang + nilai lama yang sudah ada agar tidak ada data korup
    const [nilaiLama] = await db.query(
      `SELECT DISTINCT kategori_penerima FROM penerima_manfaat
       WHERE kategori_penerima IS NOT NULL AND kategori_penerima <> ''`
    );
    const daftar = [...new Set([...JENJANG, ...nilaiLama.map((r) => r.kategori_penerima)])];
    const enumSql = daftar.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(',');

    let kategoriStatus = 'noop';
    if (sudahEnum && kat.COLUMN_TYPE.includes('SAMPLE') && kat.COLUMN_TYPE.includes('GURU & TENDIK')) {
      kategoriStatus = 'exists';
    } else {
      await db.query(`ALTER TABLE penerima_manfaat MODIFY kategori_penerima ENUM(${enumSql}) DEFAULT NULL`);
      kategoriStatus = 'updated';
    }

    res.json({
      ok: true,
      added,
      kategori: kategoriStatus,
      jenjang: daftar,
      message: 'ALTER penerima_manfaat selesai (kolom baru: ' + (added.length ? added.join(', ') : 'tidak ada') + '; kategori_penerima: ' + kategoriStatus + ')'
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      status: 'error',
      message: 'Gagal: ' + e.message
    });
  }
});

module.exports = router;
