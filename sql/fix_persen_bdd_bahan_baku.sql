-- =============================================================
-- KOREKSI bahan_baku.persen_bdd yang TIDAK SINKRON dengan
-- sp_referensi_bahan (Referensi SP Bahan)
-- =============================================================
-- Masalah:
--   sp_referensi_bahan adalah sumber referensi BDD (acuan tombol
--   "Sync ke Bahan Baku") dan di-seed dari data ahli gizi. Beberapa
--   bahan di bahan_baku masih memakai persen_bdd default 100%
--   padahal referensinya lebih rendah, sehingga kebutuhan belanja
--   (berat kotor) di /total-kebutuhan terhitung lebih kecil dari
--   semestinya (kebutuhan belanja jadi kurang).
--
-- Temuan saat pengecekan (bahan_baku vs sp_referensi_bahan):
--   Buncis     : 100% → 90%
--   Labu Siam  : 100% → 83%
--   Wortel     : 100% → 80%
--   Semangka sudah sinkron (46% = 46%) — tidak ikut diubah.
--
-- Logika perbaikan SAMA dengan endpoint
--   POST /sp_referensi_bahan/sync-bahan-baku
--   (persen_bdd = ROUND(bdd_persen × 100)) agar konsisten.
--
-- CARA PAKAI (urutan penting):
--   1. Jalankan bagian BACKUP   → simpan baris yang akan diubah
--   2. Jalankan bagian DIAGNOSA → lihat baris yang akan diubah
--   3. Jalankan bagian PERBAIKAN → baru ubah data
--   4. Jalankan bagian VERIFIKASI → pastikan hasilnya
--
-- CATATAN: setelah perbaikan, kebutuhan di halaman Total Kebutuhan
-- / Perencanaan otomatis ikut terkoreksi (tanpa recalc nutrisi,
-- karena yang diubah hanya persen_bdd).
-- =============================================================

-- ── 1. BACKUP (WAJIB dijalankan dulu) ────────────────────────────
DROP TABLE IF EXISTS backup_bahan_baku_sebelum_koreksi_bdd;
CREATE TABLE backup_bahan_baku_sebelum_koreksi_bdd AS
SELECT b.*
FROM bahan_baku b
JOIN sp_referensi_bahan s ON s.nama = b.nama AND s.tenant_id = b.tenant_id
WHERE ABS(COALESCE(b.persen_bdd, 0) - ROUND(s.bdd_persen * 100)) > 0.5;

-- Cek jumlah baris backup (harus = jumlah baris yang akan diubah):
SELECT COUNT(*) AS baris_backup FROM backup_bahan_baku_sebelum_koreksi_bdd;

-- ── 2. DIAGNOSA: baris yang tidak sinkron ────────────────────────
SELECT b.id,
       b.tenant_id,
       b.nama              AS bahan_nama,
       b.persen_bdd        AS persen_bdd_sekarang,
       ROUND(s.bdd_persen * 100) AS persen_bdd_seharusnya,
       s.berat_bersih      AS berat_1_sp_referensi_g
FROM bahan_baku b
JOIN sp_referensi_bahan s ON s.nama = b.nama AND s.tenant_id = b.tenant_id
WHERE ABS(COALESCE(b.persen_bdd, 0) - ROUND(s.bdd_persen * 100)) > 0.5
ORDER BY b.nama;

-- ── 3. PERBAIKAN ─────────────────────────────────────────────────
UPDATE bahan_baku b
JOIN sp_referensi_bahan s ON s.nama = b.nama AND s.tenant_id = b.tenant_id
SET b.persen_bdd = ROUND(s.bdd_persen * 100)
WHERE ABS(COALESCE(b.persen_bdd, 0) - ROUND(s.bdd_persen * 100)) > 0.5;

-- ── 4. VERIFIKASI ────────────────────────────────────────────────
-- Seharusnya 0 baris tersisa:
SELECT COUNT(*) AS sisa_inkonsisten
FROM bahan_baku b
JOIN sp_referensi_bahan s ON s.nama = b.nama AND s.tenant_id = b.tenant_id
WHERE ABS(COALESCE(b.persen_bdd, 0) - ROUND(s.bdd_persen * 100)) > 0.5;

-- Tampilkan hasil akhir untuk bahan yang dikoreksi:
SELECT b.id, b.nama, b.persen_bdd
FROM bahan_baku b
JOIN backup_bahan_baku_sebelum_koreksi_bdd bk ON bk.id = b.id
ORDER BY b.nama;
