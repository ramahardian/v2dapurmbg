# Alur Budgeting (Anggaran) — MBG NodeJS

## Ringkasan

Budgeting mencakup perencanaan anggaran biaya bahan pangan dan operasional dapur per periode (bulan). Ada 3 cara input: **manual**, **dari siklus**, dan **generate dari data aktual**. Realisasi terisi otomatis dari pembayaran PO.

---

## 1. Field Budget

Tabel `budget` — diakses dari menu **Akuntansi → Budgeting**.

| Field | Tipe | Contoh | Wajib |
|---|---|---|---|
| `periode` | `YYYY-MM` | `2026-08` | ✅ |
| `kategori_penerima` | string | `TK/PAUD`, `SD 1-3` | |
| `jumlah_penerima` | number | `295` | |
| `harga_per_porsi` | number (IDR) | `12000` | |
| `biaya_operasional` | number (IDR) | `5000000` | |
| `total_budget` | number (IDR) | `42500000` | ✅ |
| `realisasi` | number (IDR) | (otomatis) | |
| `catatan` | text | | |

---

## 2. Cara Input

### 2a. Manual — via Form Budgeting

```
Akuntansi → Budgeting → Tombol "Tambah"
```

Isi field satu per satu. `total_budget` dihitung manual:

```
total_budget = (jumlah_penerima × harga_per_porsi × hari_kerja) + biaya_operasional
```

Hari kerja = hari Senin–Sabtu (Ahad libur).

### 2b. Otomatis dari Siklus

```
Siklus → pilih siklus → tombol "Hitung Budget" → masukkan periode
```

Proses (`routes/siklus/aksi.js:110`):
1. Ambil `jumlah_porsi` dari siklus (total penerima)
2. Hitung `hari_kerja` dalam bulan periode
3. Cari `harga_per_porsi` dari budget periode sebelumnya (kategori sama)
4. Simpan ke tabel `budget`:

```
total_budget = hari_kerja × jumlah_porsi × harga_per_porsi
```

Tombol **"Hitung Budget Semua Siklus"** melakukan hal yang sama untuk semua siklus aktif sekaligus (`routes/siklus/aksi.js:163`).

### 2c. Generate dari Data Aktual

```
Akuntansi → Laporan → RAB → tombol "Generate Budget"
```

Sistem menghitung otomatis dari data produksi, penerima manfaat, dan harga referensi bahan.

---

## 3. Realisasi

Realisasi terisi dari transaksi **Kas Bank** (pembayaran PO).

### 3a. Alur Realisasi

1. PO dibuat dan barang diterima
2. PO dibayar (`status → "Dibayar"`) → jurnal otomatis: Kas Keluar
3. Klik **"Hitung Ulang Realisasi"** di halaman Budgeting

### 3b. Cara Hitung (`routes/generic/auto-jurnal.js:75`)

```
total_kas_keluar_per_period = SUM(kas_bank WHERE tipe='keluar' AND periode=target)

Untuk setiap budget entry di periode tersebut:
  realisasi = total_kas_keluar × (total_budget_entry / SUM(total_budget_semua_entry))
```

Realisasi dibagi **proporsional** berdasarkan bobot `total_budget` masing-masing kategori.

---

## 4. Laporan Terkait

| Laporan | Menu | Isi |
|---|---|---|
| RAB | Akuntansi → Laporan → RAB | Budget × realisasi per kategori |
| RAB Bulanan | Akuntansi → Laporan → RAB Bulanan | Agregasi budget per bulan |
| Penggunaan Anggaran | Akuntansi → Laporan → Penggunaan Anggaran | Budget vs realisasi vs kas |
| Biaya Produksi | (built-in) | Biaya per siklus dari menu_bahan × harga_satuan |

---

## 5. File Terkait

| File | Fungsi |
|---|---|
| `routes/generic/config.js:15` | Definisi field tabel budget |
| `routes/generic/dynamic-routes.js:283` | Endpoint hitung ulang realisasi |
| `routes/generic/auto-jurnal.js:75` | Logika proporsional realisasi |
| `routes/siklus/aksi.js:110` | Hitung budget dari siklus |
| `routes/siklus/aksi.js:163` | Hitung budget semua siklus aktif |
| `public/modul/definisi.js:68` | Konfigurasi CRUD frontend budget |
| `public/modul/crud.js:169` | Form generik CRUD (termasuk budget) |
| `public/modul/siklus.js:796` | Tombol hitung budget di frontend siklus |
| `public/modul/laporan.js` | Laporan RAB, RAB Bulanan, Penggunaan Anggaran |
