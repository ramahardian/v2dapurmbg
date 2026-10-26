-- ============================================================
-- FIX: Ayam Potong tampil 500 kg di /total-kebutuhan
-- ============================================================
-- Masalah:
--   Resep menu "Nasi + Fried Chicken..." (menu id 143) memakai
--   Ayam Potong sebesar 87,443 g/porsi (BERAT BERSIH). Di
--   /menu tampak 250 kg/hari (87,443 g × 2859 porsi), tapi di
--   /total-kebutuhan tampil 500 kg karena dihitung BERAT KOTOR
--   (belanja) = bersih ÷ BDD 50%:
--       87,443 g ÷ 50% = 174,886 g kotor × 2859 ≈ 500 kg
--
-- Pilihan yang diambil: target belanja /total-kebutuhan = 250 kg.
--   bersih/porsi = (250 kg × 50%) ÷ jumlah_porsi
--   250.000 g × 0,5 = 125.000 g (bersih setara 250 kg kotor)
--   ÷ 2859 porsi = 43,72 g/porsi (BERAT BERSIH)
--   dan 43,72 g ÷ 50% = 87,44 g kotor × 2859 ≈ 250 kg ✓
--
-- Diterapkan di 3 tempat agar konsisten (pola sama seperti
-- fix_semangka_target_386kg.sql):
--   1) menu_bahan.jumlah          = 43,72 g  (gram per porsi resep MENU)
--      PENTING: /total-kebutuhan memberi PRIORITAS pada menu_bahan.jumlah
--      (lihat resolveGridBeratPerSiswa di routes/siklus/helpers.js).
--   2) bahan_baku.berat_1_sp      = 43,72 g  (master bahan)
--   3) sp_referensi_bahan (1 SP)  = 43,72 g bersih / 87,44 g kotor
--
-- Backup nilai lama di tabel backup_*. Bila jumlah_porsi server
-- produksi berbeda dengan 2859, nilai @bersih dihitung ulang
-- otomatis (tidak di-hardcode).
-- ============================================================

-- ── 0) BUKA HANYA SATU KALI DI SESSION YANG SAMA ─────────────
-- Set variabel target (ubah 250 jadi angka yang diinginkan bila perlu)
SET @target_kg = 250;
SET @bdd_persen = 50;

-- ── 1. DIAGNOSA (PERIKSA DULU) ────────────────────────────────
-- Resep menu yang memakai Ayam Potong
SELECT mb.menu_id, m.nama AS menu_nama, m.jumlah_porsi, mb.bahan_baku_id,
       b.nama AS bahan_nama, mb.jumlah, b.persen_bdd
FROM menu_bahan mb
JOIN menu m ON m.id = mb.menu_id
JOIN bahan_baku b ON b.id = mb.bahan_baku_id
WHERE mb.bahan_baku_id = 4;

-- Master bahan
SELECT id, nama, berat_1_sp, persen_bdd, buffer_persen
FROM bahan_baku WHERE id = 4 AND tenant_id = 1;

-- Referensi SP
SELECT tenant_id, nama, berat_bersih, bdd_persen, berat_kotor
FROM sp_referensi_bahan
WHERE tenant_id = 1 AND nama LIKE 'Ayam Potong%';

-- ── 2. BACKUP (WAJIB dijalankan dulu) ─────────────────────────
DROP TABLE IF EXISTS backup_ayam_potong_target250;
CREATE TABLE backup_ayam_potong_target250 AS
SELECT mb.*, m.tenant_id AS menu_tenant
FROM menu_bahan mb
JOIN menu m ON m.id = mb.menu_id
WHERE mb.bahan_baku_id = 4;

DROP TABLE IF EXISTS backup_bahan_baku_ayam_250;
CREATE TABLE backup_bahan_baku_ayam_250 AS
SELECT * FROM bahan_baku WHERE id = 4;

DROP TABLE IF EXISTS backup_sp_ref_ayam_250;
CREATE TABLE backup_sp_ref_ayam_250 AS
SELECT * FROM sp_referensi_bahan
WHERE tenant_id = 1 AND nama LIKE 'Ayam Potong%';

-- ── 3. PERBAIKAN ──────────────────────────────────────────────
-- Berat bersih per porsi agar total belanja pas @target_kg:
--   bersih/porsi = (target_kg × 1000 g × bdd%) ÷ jumlah_porsi menu 143
SET @porsi = (SELECT jumlah_porsi FROM menu WHERE id = 143 LIMIT 1);
SET @bersih = ROUND((@target_kg * 1000 * (@bdd_persen / 100)) / @porsi, 4);
SET @kotor  = ROUND(@bersih / (@bdd_persen / 100), 4);

-- 3a) Gram per porsi di resep menu (paling penting — diprioritaskan
--     /total-kebutuhan)
UPDATE menu_bahan
SET jumlah = @bersih
WHERE menu_id = 143 AND bahan_baku_id = 4;

-- 3b) Master bahan baku (berat 1 SP)
UPDATE bahan_baku
SET berat_1_sp = @bersih
WHERE id = 4 AND tenant_id = 1;

-- 3c) Referensi SP "Ayam Potong 1 SP" agar sinkron
UPDATE sp_referensi_bahan
SET berat_bersih = @bersih, berat_kotor = @kotor
WHERE tenant_id = 1 AND nama = 'Ayam Potong 1 SP';

-- ── 4. VERIFIKASI ─────────────────────────────────────────────
-- Tampilkan nilai yang dipakai (harus: bersih ≈ @bersih)
SELECT @porsi AS jumlah_porsi, @bersih AS berat_bersih_per_porsi,
       @kotor AS berat_kotor_per_porsi;

SELECT menu_id, bahan_baku_id, jumlah
FROM menu_bahan WHERE menu_id = 143 AND bahan_baku_id = 4;

SELECT id, nama, berat_1_sp, persen_bdd
FROM bahan_baku WHERE id = 4;

SELECT nama, berat_bersih, bdd_persen, berat_kotor
FROM sp_referensi_bahan
WHERE tenant_id = 1 AND nama LIKE 'Ayam Potong%';