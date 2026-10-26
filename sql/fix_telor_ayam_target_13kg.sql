-- ============================================================
-- FIX: Telor Ayam tampil 193 kg di /total-kebutuhan → 13 kg
-- ============================================================
-- Masalah:
--   Resep menu "Nasi Uduk (tanpa santan) + Rendang Telur ..."
--   (menu id 142) memakai Telor Ayam 60 g/porsi. Di /total-kebutuhan
--   tampil 192,74 kg (60 g × 2859 porsi ÷ BDD 89%). Hari 4
--   ("Nasi + Telor Mentai ...") TIDAK punya resep menu → memakai
--   fallback bahan_baku.berat_1_sp (60 g) → ikut 193 kg.
--
-- Pilihan yang diambil: target belanja /total-kebutuhan = 13 kg.
--   bersih/porsi = (target_kg × 1000 g × bdd%) ÷ jumlah_porsi
--   13.000 g × 0,89 = 11.570 g (bersih setara 13 kg kotor)
--   ÷ 2859 porsi = 4,0462 g/porsi (BERAT BERSIH)
--   dan 4,0462 g ÷ 89% = 4,5463 g kotor × 2859 ≈ 13 kg ✓
--   QTY belanja = ceil(12,998 − toleransi) = 13 kg
--   JUMLAH = 13 × Rp 27.000 = Rp 351.000 ✓ (sesuai baris user)
--
-- Diterapkan di 3 tempat agar konsisten (pola sama seperti
-- fix_semangka_target_386kg.sql & fix_ayam_potong_target_250.sql):
--   1) menu_bahan.jumlah          = 4,0462 g (resep menu — PRIORITAS
--      di /total-kebutuhan, lihat resolveGridBeratPerSiswa)
--   2) bahan_baku.berat_1_sp      = 4,0462 g (master bahan — dipakai
--      hari 4 yg tidak punya resep / bahan grid)
--   3) sp_referensi_bahan (1 SP)  = 4,0462 g bersih / 4,496 g kotor
--
-- Backup nilai lama di tabel backup_*. Bila jumlah_porsi server
-- produksi berbeda dgn 2859, nilai @bersih dihitung ulang otomatis
-- (tidak di-hardcode).
-- ============================================================

-- ── 0) BUKA HANYA SATU KALI DI SESSION YANG SAMA ─────────────
SET @target_kg = 13;
SET @bdd_persen = 89;

-- ── 1. DIAGNOSA (PERIKSA DULU) ────────────────────────────────
-- Resep menu yang memakai Telor Ayam (bahan id 87)
SELECT mb.menu_id, m.nama AS menu_nama, m.jumlah_porsi, mb.bahan_baku_id,
       b.nama AS bahan_nama, mb.jumlah, b.persen_bdd
FROM menu_bahan mb
JOIN menu m ON m.id = mb.menu_id
JOIN bahan_baku b ON b.id = mb.bahan_baku_id
WHERE mb.bahan_baku_id = 87;

-- Master bahan
SELECT id, nama, berat_1_sp, persen_bdd, buffer_persen
FROM bahan_baku WHERE id = 87 AND tenant_id = 1;

-- Referensi SP
SELECT tenant_id, nama, berat_bersih, bdd_persen, berat_kotor
FROM sp_referensi_bahan
WHERE tenant_id = 1 AND nama LIKE 'Telor Ayam%';

-- ── 2. BACKUP (WAJIB dijalankan dulu) ─────────────────────────
DROP TABLE IF EXISTS backup_telor_ayam_target13;
CREATE TABLE backup_telor_ayam_target13 AS
SELECT mb.*, m.tenant_id AS menu_tenant
FROM menu_bahan mb
JOIN menu m ON m.id = mb.menu_id
WHERE mb.bahan_baku_id = 87;

DROP TABLE IF EXISTS backup_bahan_baku_telor_13;
CREATE TABLE backup_bahan_baku_telor_13 AS
SELECT * FROM bahan_baku WHERE id = 87;

DROP TABLE IF EXISTS backup_sp_ref_telor_13;
CREATE TABLE backup_sp_ref_telor_13 AS
SELECT * FROM sp_referensi_bahan
WHERE tenant_id = 1 AND nama LIKE 'Telor Ayam%';

-- ── 3. PERBAIKAN ──────────────────────────────────────────────
-- Berat bersih per porsi agar total belanja pas @target_kg:
--   bersih/porsi = (target_kg × 1000 g × bdd%) ÷ jumlah_porsi menu 142
SET @porsi = (SELECT jumlah_porsi FROM menu WHERE id = 142 LIMIT 1);
SET @bersih = ROUND((@target_kg * 1000 * (@bdd_persen / 100)) / @porsi, 4);
SET @kotor  = ROUND(@bersih / (@bdd_persen / 100), 4);

-- 3a) Gram per porsi di resep menu (paling penting — diprioritaskan
--     /total-kebutuhan)
UPDATE menu_bahan
SET jumlah = @bersih
WHERE menu_id = 142 AND bahan_baku_id = 87;

-- 3b) Master bahan baku (berat 1 SP) — dipakai hari yg tidak punya
--     resep (grid Telor Ayam hari 4)
UPDATE bahan_baku
SET berat_1_sp = @bersih
WHERE id = 87 AND tenant_id = 1;

-- 3c) Referensi SP "Telor Ayam 1 SP" agar sinkron
--     Catatan: sp_referensi_bahan.bdd_persen tersimpan sebagai PECAHAN
--     (0.9 = 90%), bukan persen — jadi berat_kotor = bersih ÷ bdd_persen.
UPDATE sp_referensi_bahan
SET berat_bersih = @bersih, berat_kotor = @bersih / bdd_persen
WHERE tenant_id = 1 AND nama = 'Telor Ayam 1 SP';

-- ── 4. VERIFIKASI ─────────────────────────────────────────────
SELECT @porsi AS jumlah_porsi, @bersih AS berat_bersih_per_porsi,
       @kotor AS berat_kotor_per_porsi;

SELECT menu_id, bahan_baku_id, jumlah
FROM menu_bahan WHERE menu_id = 142 AND bahan_baku_id = 87;

SELECT id, nama, berat_1_sp, persen_bdd
FROM bahan_baku WHERE id = 87;

SELECT nama, berat_bersih, bdd_persen, berat_kotor
FROM sp_referensi_bahan
WHERE tenant_id = 1 AND nama LIKE 'Telor Ayam%';

-- Kebutuhan /total-kebutuhan harus ≈ 13 kg:
SELECT
  ROUND(@bersih * (SELECT jumlah_porsi FROM menu WHERE id = 142) /
        (89 / 100) / 1000, 2) AS perkiraan_kebutuhan_kg;

-- Rollback (bila perlu):
--   UPDATE menu_bahan SET jumlah = (SELECT jumlah FROM backup_telor_ayam_target13 WHERE menu_id=142 AND bahan_baku_id=87) WHERE menu_id=142 AND bahan_baku_id=87;
--   UPDATE bahan_baku SET berat_1_sp = (SELECT berat_1_sp FROM backup_bahan_baku_telor_13 WHERE id=87) WHERE id=87;
--   UPDATE sp_referensi_bahan sb JOIN backup_sp_ref_telor_13 bk ON bk.nama=sb.nama SET sb.berat_bersih=bk.berat_bersih, sb.berat_kotor=bk.berat_kotor WHERE sb.tenant_id=1;
