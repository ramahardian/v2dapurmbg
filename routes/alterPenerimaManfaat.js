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
  ['paket_besar_utama', 'INT DEFAULT 0'],
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

// ─── IMPORT DATA MASTER PENERIMA MANFAAT VIA URL ──────────────
// 24 kelompok (id 87-110): data resmi terbaru, termasuk angka sample & guru_tendik.
// Dipakai endpoint GET /api/import-penerima-manfaat (upsert idempotent, admin only).
// Catatan: data ini memang menargetkan tenant_id=1 (sesuai data resmi) — endpoint
// hanya bisa dipicu admin, dan hanya menyentuh id 87-110 yang sudah ditentukan.
const DATA_PM = [
  [87, 'MI Misbahul Islam', 119, 123, 0, 0, null, null, 'SD 1-3', null, 'Bogor', null, null, null, '', null, '2026-07-25 06:50:40', 1],
  [88, 'KB Assalam', 6, 26, 2, 4, null, null, 'TK/PAUD', null, 'Bogor', null, null, null, '', null, '2026-07-25 06:51:18', 1],
  [89, "MI Mathla'ul Anwar", 86, 108, 0, 0, null, null, 'SD 1-3', null, 'Bogor', null, null, null, '', null, '2026-07-25 06:52:12', 1],
  [90, 'MI Tarbiyatul Athfal', 147, 132, 0, 0, null, null, 'SD 1-3', null, 'Bogor', null, null, null, '', null, '2026-07-25 06:53:09', 1],
  [91, 'MI Nurul Iman', 105, 75, 0, 0, null, null, 'SD 1-3', null, 'Bogor', null, null, null, '', null, '2026-07-25 06:53:52', 1],
  [92, 'KB PaudQu Annajah', 7, 49, 1, 6, null, null, 'TK/PAUD', null, 'Bogor', null, null, null, '', null, '2026-07-25 06:54:25', 1],
  [93, 'KB NurFajar', 6, 31, 1, 5, null, null, 'TK/PAUD', null, 'Bogor', null, null, null, '', null, '2026-07-25 06:54:58', 1],
  [94, 'KB Melati', 4, 15, 1, 3, null, null, 'TK/PAUD', null, 'Bogor', null, null, null, '', null, '2026-07-25 06:55:24', 1],
  [95, 'SPS Tunas Harapan', 10, 42, 1, 8, null, null, 'TK/PAUD', null, null, null, null, null, '', null, '2026-07-25 06:56:15', 1],
  [96, 'KB Al Hidayah', 15, 81, 3, 12, null, null, 'TK/PAUD', null, 'Bogor', null, null, null, '', null, '2026-07-25 06:56:58', 1],
  [97, 'PAUD Al Jauziyyah', 6, 42, 1, 5, null, null, 'TK/PAUD', null, 'Bogor', null, null, null, '', null, '2026-07-25 06:57:18', 1],
  [98, 'PAUD Al Arrahman', 3, 23, 1, 2, null, null, 'TK/PAUD', null, 'Bogor', null, null, null, '', null, '2026-07-25 06:57:56', 1],
  [99, 'PAUD Annisa', 4, 16, 1, 3, null, null, 'TK/PAUD', null, 'Bogor', null, null, null, '', null, '2026-07-25 06:58:25', 1],
  [100, 'Pondok Pesantren Darul Amaam', 55, 0, 0, 0, null, null, 'SMP', null, 'Bogor', null, null, null, '', null, '2026-07-25 06:58:59', 1],
  [101, 'SD Gadog 01', 402, 327, 0, 0, null, null, 'SD 1-3', null, 'Bogor', null, null, null, '', null, '2026-07-25 06:59:42', 1],
  [102, 'SD Sukaluyu 01', 126, 109, 0, 0, null, null, 'SD 1-3', null, 'Bogor', null, null, null, '', null, '2026-07-25 07:00:16', 1],
  [103, 'SPS Jasmine', 9, 46, 1, 8, null, null, 'TK/PAUD', null, 'Bogor', null, null, null, '', null, '2026-07-25 07:01:22', 1],
  [104, 'PAUD Al Fath', 7, 22, 1, 6, null, null, 'TK/PAUD', null, 'Bogor', null, null, null, '', null, '2026-07-25 07:01:44', 1],
  [105, 'KB Teratai', 8, 52, 0, 0, null, null, 'TK/PAUD', null, 'Bogor', null, null, null, '', null, '2026-07-25 07:02:09', 1],
  [106, 'MI Al-Hasanah', 3, 43, 0, 0, null, null, 'SD 1-3', null, 'Bogor', null, null, null, '', null, '2026-07-25 07:02:53', 1],
  [107, 'Posyandu Melati 1', 54, 70, 0, 0, null, null, 'Posyandu', null, 'Bogor', null, null, null, '', null, '2026-07-25 07:50:35', 1],
  [108, 'Posyandu Melati 2', 31, 32, 0, 0, null, null, 'Posyandu', null, 'Bogor', null, null, null, '', null, '2026-07-25 07:52:06', 1],
  [109, 'Posyandu Dahlia 1', 30, 59, 0, 0, null, null, 'Posyandu', null, 'Bogor', null, null, null, '', null, '2026-07-25 07:53:01', 1],
  [110, 'Posyandu Dahlia 2', 38, 48, 0, 0, null, null, 'Posyandu', null, 'Bogor', null, null, null, '', null, '2026-07-25 07:53:44', 1],
];
const FIELDS_PM = ['id','nama_kelompok','paket_besar','paket_kecil','sample','guru_tendik','lokasi','keterangan','kategori_penerima','provinsi','kota','kecamatan','nomor_telepon','nama_kontak','email','status_kepemilikan','created_at','tenant_id'];

// GET /import-penerima-manfaat — terapkan data master PM ke DB via URL.
// 1) Tanpa ?confirm=1 → halaman konfirmasi. 2) Dengan ?confirm=1 → eksekusi upsert.
router.get('/import-penerima-manfaat', requireRole('admin'), async (req, res) => {
  try {
    const ids = DATA_PM.map((r) => r[0]);
    const [existing] = await db.query(
      `SELECT id FROM penerima_manfaat WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    const ada = new Set(existing.map((r) => r.id));
    const akanInsert = DATA_PM.filter((r) => !ada.has(r[0])).length;
    const akanUpdate = DATA_PM.length - akanInsert;

    // ── Halaman konfirmasi ──
    if (req.query.confirm !== '1') {
      const rowsHtml = DATA_PM.map((r) => `
        <tr style="border-bottom:1px solid #e7e5e4">
          <td style="padding:0.4rem 0.75rem;color:#6b7280">${r[0]}</td>
          <td style="padding:0.4rem 0.75rem;font-weight:500">${String(r[1]).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
          <td style="padding:0.4rem 0.75rem;text-align:center">${r[2]}</td>
          <td style="padding:0.4rem 0.75rem;text-align:center">${r[3]}</td>
          <td style="padding:0.4rem 0.75rem;text-align:center">${r[4]}</td>
          <td style="padding:0.4rem 0.75rem;text-align:center">${r[5]}</td>
          <td style="padding:0.4rem 0.75rem;text-align:center">${String(r[8]).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
        </tr>`).join('');
      return res.send(`
        <div style="font-family:sans-serif;padding:2rem;max-width:860px;margin:auto">
          <h2 style="color:#d97706;margin-bottom:0.5rem">⚠️ Import Data Penerima Manfaat (24 kelompok)</h2>
          <p style="color:#6b7280;margin-bottom:1.25rem">
            Data master id 87-110 dengan angka <b>Sample</b> & <b>Guru/Tendik</b>.
            Upsert idempotent — tidak menghapus data lain.
          </p>
          <p style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;padding:0.6rem 1rem;border-radius:0.5rem;font-size:0.85rem;margin-bottom:1.25rem">
            💡 Baru pertama deploy? Jalankan dulu <code>/api/alter-penerima-manfaat</code>
            agar kolom <b>sample</b> & <b>guru_tendik</b> tersedia di tabel.
          </p>
          <div style="display:flex;gap:0.75rem;margin-bottom:1.25rem;flex-wrap:wrap">
            <span style="background:#f0fdf4;color:#166534;padding:0.375rem 1rem;border-radius:999px;font-size:0.85rem">🟢 Akan di-update: ${akanUpdate}</span>
            <span style="background:#fffbeb;color:#92400e;padding:0.375rem 1rem;border-radius:999px;font-size:0.85rem">🟡 Akan di-insert: ${akanInsert}</span>
          </div>
          <div style="max-height:380px;overflow:auto;border:1px solid #e7e5e4;border-radius:0.75rem">
            <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
              <thead><tr style="background:#f5f5f4">
                <th style="padding:0.5rem 0.75rem;text-align:left">ID</th>
                <th style="padding:0.5rem 0.75rem;text-align:left">Kelompok</th>
                <th style="padding:0.5rem 0.75rem">Besar</th>
                <th style="padding:0.5rem 0.75rem">Kecil</th>
                <th style="padding:0.5rem 0.75rem">Sample</th>
                <th style="padding:0.5rem 0.75rem">Guru</th>
                <th style="padding:0.5rem 0.75rem">Jenjang</th>
              </tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
          <div style="margin-top:1.5rem;text-align:center">
            <a href="?confirm=1" style="display:inline-block;padding:0.75rem 2rem;background:#16a34a;color:white;text-decoration:none;border-radius:0.5rem;font-weight:600">🚀 Ya, Terapkan Data Ini</a>
            <br><br>
            <a href="/" style="color:#6b7280;font-size:0.875rem">Batal</a>
          </div>
        </div>`);
    }

    // ── Eksekusi upsert ──
    let updated = 0, inserted = 0;
    for (const rec of DATA_PM) {
      const o = {};
      FIELDS_PM.forEach((f, i) => { o[f] = rec[i]; });
      if (ada.has(o.id)) {
        await db.query(
          `UPDATE penerima_manfaat SET nama_kelompok=?, paket_besar=?, paket_kecil=?, sample=?, guru_tendik=?, lokasi=?, keterangan=?, kategori_penerima=?, provinsi=?, kota=?, kecamatan=?, nomor_telepon=?, nama_kontak=?, email=?, status_kepemilikan=?, created_at=?, tenant_id=? WHERE id=?`,
          [o.nama_kelompok, o.paket_besar, o.paket_kecil, o.sample, o.guru_tendik, o.lokasi, o.keterangan, o.kategori_penerima, o.provinsi, o.kota, o.kecamatan, o.nomor_telepon, o.nama_kontak, o.email, o.status_kepemilikan, o.created_at, o.tenant_id, o.id]
        );
        updated++;
      } else {
        await db.query(
          `INSERT INTO penerima_manfaat (id, nama_kelompok, paket_besar, paket_kecil, sample, guru_tendik, lokasi, keterangan, kategori_penerima, provinsi, kota, kecamatan, nomor_telepon, nama_kontak, email, status_kepemilikan, created_at, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [o.id, o.nama_kelompok, o.paket_besar, o.paket_kecil, o.sample, o.guru_tendik, o.lokasi, o.keterangan, o.kategori_penerima, o.provinsi, o.kota, o.kecamatan, o.nomor_telepon, o.nama_kontak, o.email, o.status_kepemilikan, o.created_at, o.tenant_id]
        );
        inserted++;
      }
    }

    res.send(`
      <div style="font-family:sans-serif;padding:2rem;text-align:center">
        <h2 style="color:#16a34a">✅ Data Penerima Manfaat Berhasil Diterapkan</h2>
        <p style="color:#6b7280;margin-top:0.75rem">
          <b>${updated}</b> baris di-update &nbsp;|&nbsp; <b>${inserted}</b> baris di-insert<br>
          Total: ${DATA_PM.length} kelompok (id 87-110) — sample & guru_tendik sudah sesuai data resmi.
        </p>
        <div style="margin-top:1.5rem;display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">
          <a href="/api/alter-penerima-manfaat" style="padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">🔧 Cek Kolom Tabel</a>
          <a href="/penerima-manfaat" style="padding:0.5rem 1.5rem;background:#6b7280;color:white;text-decoration:none;border-radius:0.5rem">📋 Buka Halaman Penerima Manfaat</a>
        </div>
      </div>`);
  } catch (e) {
    res.status(500).send(`
      <div style="font-family:sans-serif;padding:2rem;text-align:center">
        <h2 style="color:#dc2626">❌ Gagal</h2>
        <p style="color:#6b7280;margin-top:0.5rem">${String(e.message).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a>
      </div>`);
  }
});

module.exports = router;
