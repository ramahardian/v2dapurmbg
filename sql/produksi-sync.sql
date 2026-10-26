-- ============================================================
-- PRODUKSI-SYNC.sql
-- Sinkronisasi perbaikan data dari localhost → SERVER PRODUKSI
-- JANGAN gunakan untuk restore seluruh database (data produksi
-- berbeda dengan localhost!). Terapkan hanya perbaikan ini.
--
-- Cara pakai (di server, setelah backup):
--   mysql -u USER -p NAMA_DB < produksi-sync.sql
-- atau jalankan per blok di client SQL (phpMyAdmin, dll).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 0) WAJIB BACKUP DULU (di browser, login admin):
--    https://<domain>/api/system/backup  → unduh file .sql
-- ─────────────────────────────────────────────────────────────

-- 1) Periksa dulu bahan target — HARUS muncul & nama cocok.
--    Kalau id berbeda di produksi, sesuaikan id-nya.
SELECT id, nama, satuan, buffer_persen, berat_per_satuan, persen_bdd
FROM bahan_baku
WHERE id IN (59, 12, 98)
ORDER BY id;

-- ─────────────────────────────────────────────────────────────
-- 2) NOL-KAN BUFFER SEMUA BAHAN (keputusan: item = total kebutuhan)
--    Sebelum: 237+ bahan masih buffer 10% → angka total kebutuhan
--    membengkak +10% dibanding halaman item.
-- ─────────────────────────────────────────────────────────────
UPDATE bahan_baku SET buffer_persen = 0;

-- ─────────────────────────────────────────────────────────────
-- 3) MINYAK GORENG — 1 karton = 12 kg / 12 L (sebelumnya 1000 g = 1 kg)
--    Efek: kebutuhan 36 kg → 3 karton (bukan 36 karton).
--    Guard nama: hanya berubah kalau id 59 memang Minyak Goreng.
-- ─────────────────────────────────────────────────────────────
UPDATE bahan_baku SET berat_per_satuan = 12000
WHERE id = 59 AND nama LIKE '%Minyak%';

-- ─────────────────────────────────────────────────────────────
-- 4) BUNCIS — BDD 100 (0% susut)
--    Efek: kebutuhan bersih 79 kg → QTY 79 kg (bukan 88 kg).
-- ─────────────────────────────────────────────────────────────
UPDATE bahan_baku SET persen_bdd = 100
WHERE id = 12 AND nama = 'Buncis';

-- ─────────────────────────────────────────────────────────────
-- 5) WORTEL — BDD 100 (0% susut)
--    Efek: kebutuhan bersih 129 kg → QTY 129 kg (bukan 162 kg).
-- ─────────────────────────────────────────────────────────────
UPDATE bahan_baku SET persen_bdd = 100
WHERE id = 98 AND nama = 'Wortel';

-- ─────────────────────────────────────────────────────────────
-- 6) OPSIONAL — hanya jika produksi memakai MENU & RESEP yang
--    sama persis dengan localhost (menu id 136 = Nasi + Chicken
--    Roasted Wings + ...). Verifikasi dulu:
--
--    SELECT menu_id, bahan_baku_id, jumlah FROM menu_bahan
--    WHERE menu_id = 136 AND bahan_baku_id IN (12, 98);
--
--    Buncis: kembalikan ke 27,632 g/porsi (net 79 kg utk 2.859 porsi):
-- UPDATE menu_bahan SET jumlah = 27.632
--   WHERE menu_id = 136 AND bahan_baku_id = 12;
--
--    Wortel: gunakan nilai resep yang benar di produksi (jika beda,
--    jangan ditimpa dari localhost).
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- 7) VERIFIKASI AKHIR
-- ─────────────────────────────────────────────────────────────
-- Harus bernilai 0:
SELECT COUNT(*) AS sisa_bahan_buffer_aktif FROM bahan_baku WHERE buffer_persen > 0;

-- Harus: Minyak 12000 / Buncis 100 / Wortel 100, buffer semuanya 0:
SELECT id, nama, berat_per_satuan, persen_bdd, buffer_persen
FROM bahan_baku WHERE id IN (59, 12, 98) ORDER BY id;
