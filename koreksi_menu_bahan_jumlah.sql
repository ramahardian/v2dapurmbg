-- =============================================================
-- KOREKSI menu_bahan.jumlah yang TIDAK WAJAR (terlalu besar)
-- =============================================================
-- Masalah:
--   menu_bahan.jumlah adalah gram per porsi (gram/siswa).
--   Sebagian data tersimpan sangat besar (mis. Beras 8.800 g/porsi,
--   seharusnya ~50 g/porsi), akibatnya kebutuhan di /total-kebutuhan
--   jadi berlipat (mis. 21.798 kg untuk 2.477 porsi).
--
-- Nilai benar diambil dari:
--   bahan_baku.berat_1_sp          (Berat 1 SP dalam gram) — prioritas
--   sp_referensi_bahan.berat_bersih (fallback via subquery MAX)
--
-- Kriteria "tidak wajar":
--   jumlah > 1000 (gram/porsi), ATAU
--   jumlah > 10x berat_1_sp (jika berat_1_sp terisi)
--
-- PRA-SYARAT: tabel sp_referensi_bahan harus ada (dipakai sebagai fallback nilai
-- berat per porsi). Jika belum ada, buat dulu via: node scripts/seed_sp_referensi.js
-- atau jalankan seed_sp_referensi_bahan.sql
--
-- CARA PAKAI (urutan penting):
--   1. Jalankan bagian BACKUP   → simpan data lama
--   2. Jalankan bagian DIAGNOSA → lihat baris yang akan diubah
--   3. Jalankan bagian PERBAIKAN → baru ubah data
--   4. Jalankan bagian VERIFIKASI → pastikan hasilnya
--   5. Hitung ulang nutrisi menu (WAJIB setelah perbaikan):
--      node scripts/koreksi-menu-bahan-jumlah.js --recalc
--      (script lain: --apply untuk perbaikan + recalc sekaligus)
--
-- CATATAN NAMA TABEL BACKUP:
--   • Via SQL file ini → backup_menu_bahan_sebelum_koreksi (global)
--   • Via URL / script dgn --tenant <id> → backup_menu_bahan_sebelum_koreksi_<tenant_id>
--   • Via script TANPA --tenant → backup_menu_bahan_sebelum_koreksi (global)
--   Rollback: sesuaikan nama tabel dengan jalur yang dipakai.
-- =============================================================

-- ── 1. BACKUP (WAJIB dijalankan dulu) ────────────────────────────
DROP TABLE IF EXISTS backup_menu_bahan_sebelum_koreksi;
CREATE TABLE backup_menu_bahan_sebelum_koreksi AS
SELECT mb.*, m.nama AS menu_nama, b.nama AS bahan_nama, b.berat_1_sp
FROM menu_bahan mb
JOIN menu m       ON m.id = mb.menu_id
JOIN bahan_baku b ON b.id = mb.bahan_baku_id;

-- Cek jumlah baris backup (harus = jumlah baris menu_bahan):
SELECT COUNT(*) AS baris_backup FROM backup_menu_bahan_sebelum_koreksi;
SELECT COUNT(*) AS baris_menu_bahan FROM menu_bahan;

-- ── 2. DIAGNOSA: baris yang tidak wajar ──────────────────────────
SELECT mb.id,
       m.nama            AS menu_nama,
       b.nama            AS bahan_nama,
       mb.jumlah         AS jumlah_salah_g,
       b.berat_1_sp      AS berat_1_sp_g,
       (SELECT MAX(s.berat_bersih) FROM sp_referensi_bahan s
        WHERE s.nama = b.nama AND s.tenant_id = b.tenant_id) AS sp_ref_g,
       ROUND(mb.jumlah / NULLIF(b.berat_1_sp, 0), 1) AS kelipatan
FROM menu_bahan mb
JOIN menu m       ON m.id = mb.menu_id
JOIN bahan_baku b ON b.id = mb.bahan_baku_id
WHERE (mb.jumlah > 1000 OR (b.berat_1_sp > 0 AND mb.jumlah > b.berat_1_sp * 10))
ORDER BY mb.jumlah DESC;

-- ── 3. PERBAIKAN (set ke berat_1_sp / SP ref via subquery) ───────
UPDATE menu_bahan mb
JOIN bahan_baku b ON b.id = mb.bahan_baku_id
SET mb.jumlah = COALESCE(
      NULLIF(b.berat_1_sp, 0),
      (SELECT MAX(s.berat_bersih) FROM sp_referensi_bahan s
       WHERE s.nama = b.nama AND s.tenant_id = b.tenant_id)
    )
WHERE (mb.jumlah > 1000 OR (b.berat_1_sp > 0 AND mb.jumlah > b.berat_1_sp * 10))
  AND COALESCE(
        NULLIF(b.berat_1_sp, 0),
        (SELECT MAX(s.berat_bersih) FROM sp_referensi_bahan s
         WHERE s.nama = b.nama AND s.tenant_id = b.tenant_id)
      ) > 0;

-- ── 4. VERIFIKASI ────────────────────────────────────────────────
-- Seharusnya tidak ada lagi baris > 1000 g yang bisa diperbaiki:
SELECT COUNT(*) AS sisa_tidak_wajar
FROM menu_bahan mb
JOIN bahan_baku b ON b.id = mb.bahan_baku_id
WHERE mb.jumlah > 1000;

-- Baris yang MASIH tidak wajar tapi TIDAK bisa diperbaiki otomatis
-- (berat_1_sp & SP ref kosong) → perlu dicek manual:
SELECT mb.id, m.nama AS menu_nama, b.nama AS bahan_nama, mb.jumlah AS jumlah_salah_g
FROM menu_bahan mb
JOIN menu m       ON m.id = mb.menu_id
JOIN bahan_baku b ON b.id = mb.bahan_baku_id
WHERE mb.jumlah > 1000
  AND (b.berat_1_sp IS NULL OR b.berat_1_sp <= 0);

-- ── 5. PENTING ───────────────────────────────────────────────────
-- Setelah jumlah diperbaiki, NUTRISI menu (gramasi/kalori/protein/dll.)
-- harus dihitung ulang. Jalankan script berikut di folder proyek:
--   node scripts/koreksi-menu-bahan-jumlah.js --recalc
--
-- JANGAN jalankan endpoint /system/koreksi-menu-bahan yang lama:
-- script itu MEMBAGI jumlah dengan jumlah penerima manfaat (untuk bug
-- double-counting lain) — akan merusak data yang baru saja diperbaiki.
