-- ============================================================
-- FIX: Semangka tampil 386 kg di /total-kebutuhan
-- ============================================================
-- Tujuan: user menghendaki kebutuhan belanja Semangka = 386 kg
-- (bukan 560 kg saat 90 g/anak ÷ BDD 46%).
--
-- Pilihan: BDD TETAP 46% (tetap menghitung susut kulit), jadi
-- porsi per anak disetel menjadi 62,1 g/anak:
--   62,1 g × 2859 porsi = 177.543,9 g (≈ 177,5 kg) BERAT BERSIH
--   ÷ 46% = 385.965 g ≈ 386 kg BERAT KOTOR (belanja)  ✓
--
-- Diterapkan di 2 tempat agar konsisten:
--   1) bahan_baku.berat_1_sp        = 62,1 g  (master bahan)
--   2) sp_referensi_bahan.berat_bersih = 62,1 g & berat_kotor = 135 g
--      (135 g = 62,1 ÷ 0,46 — referensi SP ikut disamakan)
--
-- Backup nilai lama di tabel backup_semangka_target386.
-- Catatan: bila seed ulang sp_referensi (scripts/seed_sp_referensi.js
-- atau seed_sp_referensi_bahan.sql), nilai Semangka kembali ke 90 g —
-- jalankan file ini lagi setelah seed.
-- ============================================================

-- 1) Diagnosa: nilai sebelum perbaikan
SELECT id, nama, berat_1_sp, persen_bdd
FROM bahan_baku
WHERE id = 78 AND tenant_id = 1;

SELECT tenant_id, nama, berat_bersih, bdd_persen, berat_kotor
FROM sp_referensi_bahan
WHERE tenant_id = 1 AND nama = 'Semangka';

-- 2) Backup nilai lama bahan_baku (baris Semangka tenant 1)
DROP TABLE IF EXISTS backup_semangka_target386;
CREATE TABLE backup_semangka_target386 AS
SELECT * FROM bahan_baku WHERE id = 78 AND tenant_id = 1;

-- 3) Terapkan porsi 62,1 g/anak (BDD tetap 46%)
UPDATE bahan_baku
SET berat_1_sp = 62.1
WHERE id = 78 AND tenant_id = 1;

-- 4) Sinkronkan referensi SP (bersih 62,1 g; kotor = 62,1 ÷ 0,46 = 135 g)
UPDATE sp_referensi_bahan
SET berat_bersih = 62.1, berat_kotor = 135.0
WHERE tenant_id = 1 AND nama = 'Semangka';

-- 5) Verifikasi: harus tampil 386 kg di Total Kebutuhan (2.859 porsi)
SELECT
  b.berat_1_sp AS gram_per_anak,
  ROUND(b.berat_1_sp * 2859 / 1000, 1) AS berat_bersih_kg,
  ROUND(b.berat_1_sp * 2859 / (b.persen_bdd / 100) / 1000, 1) AS berat_kotor_kg,
  CEIL(b.berat_1_sp * 2859 / (b.persen_bdd / 100) / 1000) AS qty_belanja_kg
FROM bahan_baku b
WHERE b.id = 78 AND b.tenant_id = 1;

-- Rollback (bila perlu):
--   UPDATE bahan_baku SET berat_1_sp = 90 WHERE id = 78 AND tenant_id = 1;
--   UPDATE sp_referensi_bahan SET berat_bersih = 90, berat_kotor = 195.65
--   WHERE tenant_id = 1 AND nama = 'Semangka';
