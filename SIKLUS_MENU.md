# Siklus Menu — MBG NodeJS

## Ringkasan

Siklus Menu adalah jadwal menu harian untuk suatu periode (misal 30 hari) yang ditargetkan ke jenjang penerima manfaat tertentu. Dari siklus, sistem menghitung kebutuhan bahan (SP), menghasilkan produksi harian, menghitung budget, dan membuat Purchase Request (PR).

---

## 1. Relasi Data

```
siklus_menu (1) ─────── (N) siklus_menu_item ─────── (0..1) menu
     │                          │
     │                          │ (jika menu_id=null, bahan
     │                          │  diassign via grid system)
     │                          │
     │                          ▼
     │              siklus_menu_item_bahan
     │              (hari_ke, kategori_sp, bahan_baku_id)
     │                          │
     │                          ▼
     │                     bahan_baku (master)
     │                     (berat_1_sp, persen_bdd, kategori_sp,
     │                      harga_satuan, buffer_persen)
     │
     │                          ▲
     └────────────────── standar_sp (jenjang + kategori_sp → sp_value)
```

### Tabel Utama

| Tabel | Isi |
|---|---|
| `siklus_menu` | Header siklus: nama, jenjang, jumlah_porsi, total_hari, status |
| `siklus_menu_item` | Item per hari: menu yang dipilih, jumlah_porsi, nutrisi |
| `siklus_menu_item_bahan` | Grid bahan manual per hari + kategori SP |
| `menu` | Resep master |
| `menu_bahan` | Komposisi bahan per menu |
| `bahan_baku` | Master bahan: berat_1_sp, satuan, harga, BDD |
| `standar_sp` | Target Standar Porsi per jenjang per kategori |
| `sp_referensi_bahan` | Referensi BDD dan gizi per bahan |
| `produksi` | Catatan produksi harian (dari generate) |

---

## 2. Status Siklus

| Status | Arti |
|---|---|
| `Draft` | Masih diedit, belum dipakai |
| `Aktif` | Siklus berjalan, dipakai untuk hitung budget & PR |
| `Arsip` | Selesai, tidak dipakai lagi |

---

## 3. Alur Lengkap

### 3a. Buat Siklus

```
Menu: Ahli Gizi → Siklus → Tombol "Buat Siklus"
File: public/modul/siklus.js:872 → openSiklusForm()
```

**Input:**
- Nama siklus
- Tanggal mulai & selesai
- Jenjang penerima (checkbox: TK/PAUD, SD 1-3, dll)
- Status

Jumlah porsi otomatis dari data penerima manfaat.

**Tampilan form** (`openSiklusForm`):
- Tabel grid 6 kategori SP (Karbohidrat, Protein Hewani, Protein Nabati, Sayur, Buah, Susu) × N hari
- Tabel Identifikasi Resep (nama masakan per kategori per hari)
- `_siklusMeta` menyimpan metadata form di `window._siklusMeta`

### 3b. Atur Bahan per Hari (Grid System)

6 kategori SP (didefinisikan di `routes/siklus/helpers.js:16` dan `siklus.js:948`):

| Kategori | Label | Contoh |
|---|---|---|
| `Karbohidrat` | Makanan Pokok | Nasi, Kentang |
| `Protein Hewani` | Lauk Hewani | Ayam, Telur, Ikan |
| `Protein Nabati` | Lauk Nabati | Tahu, Tempe |
| `Sayur` | Sayur | Bayam, Wortel |
| `Buah` | Buah | Pisang, Jeruk |
| `Susu` | Susu | Susu UHT |

**Cara:**

Klik sel grid → `openGridPicker(hk, rk)` → centang bahan → **Simpan**.

Bahan tersimpan di memory (`window._gridData`). Data dikirim ke backend saat simpan siklus via `POST /siklus/:id/bahan-grid` (`routes/siklus/bahan-grid.js:49`).

Backend menyimpan ke `siklus_menu_item_bahan`, update `resep_map`, dan hitung estimasi gizi.

### 3c. Detail Siklus

```
Klik siklus → `loadSiklusDetail(id)` → menampilkan:
```

- Header: nama, jenjang, status, tanggal
- Tabel item per hari: menu, porsi, kalori, protein, karbohidrat, lemak, serat
- Badge kategori SP per hari
- Tombol aksi: Edit, Produksi Harian, Hitung SP, Hitung Budget, Buat PR

### 3d. Laporan Siklus

```
`renderSiklusLaporan(id)` → GET /siklus/:id/laporan
```

- **Statistik**: rata-rata kalori/protein/karbo/lemak/serat per porsi
- **Perbandingan SP**: target vs realisasi per kategori (Terpenuhi/Kurang)
- **Rincian Harian**: menu + gramasi per hari

### 3e. Hitung SP (Standar Porsi)

```
`hitungSpSiklus(id)` → POST /sp/hitung-kebutuhan
```

Menghitung total kebutuhan bahan untuk semua hari di siklus:
- Ambil semua item + menu_bahan
- Kalikan `berat_per_porsi × jumlah_porsi × jumlah_hari`
- Tampilkan per bahan: total NET, BDD, buffer, total GROSS

### 3f. Produksi Harian

Generate catatan produksi dari siklus:

| Aksi | Endpoint | File |
|---|---|---|
| 1 hari | `POST /siklus/generate-produksi` | `routes/siklus/aksi.js:12` |
| Rentang tanggal | `POST /siklus/generate-produksi-batch` | `routes/siklus/aksi.js:59` |

Cara hitung `hari_ke`:
```
hariKe = (tanggal_produksi - tanggal_mulai_siklus) + 1
```

Produksi tersimpan di tabel `produksi` dengan status `Direncanakan`.

Laporan: `GET /siklus/:id/laporan/produksi-harian` — menampilkan kebutuhan bahan per hari (NET & GROSS setelah BDD).

### 3g. Hitung Budget

```
`hitungBudgetSiklus(id)` → POST /siklus/hitung-budget
`hitungBudgetSemuaSiklus()` → POST /siklus/hitung-budget-semua
```

Rumus:
```
budget = hari_kerja × jumlah_porsi × harga_per_porsi
```
- `hari_kerja` = Senin–Sabtu (Ahad libur) dalam bulan periode
- `jumlah_porsi` = dari siklus (total penerima)
- `harga_per_porsi` = dari budget periode sebelumnya (kategori sama)

Lihat `BUDGETING.md` untuk detail lebih lanjut.

### 3h. Buat Purchase Request (PR)

```
`buatPRSiklus()` → POST /siklus/buat-pr
```

Proses (`routes/siklus/aksi.js:214`):
1. Ambil semua siklus aktif
2. Hitung hari kerja dalam bulan
3. Agregasi kebutuhan bahan dari:
   - Menu-linked: `menu_bahan × porsi × hari`
   - Grid-based: `berat_1_sp × porsi × hari`
4. Terapkan BDD dan `buffer_persen`
5. Hitung subtotal: `(kebutuhan_kg / 1000) × harga_satuan`
6. Simpan sebagai PR di `purchase_order` (no_po: `PR/{periode}/{timestamp}`, status: `Draft`)

### 3i. Standar SP

```
`renderStandarSp()` → GET /sp/standar
```

Tabel 56 baris: 8 jenjang × 7 kategori SP. Bisa diedit langsung.

| Jenjang | Karbohidrat | Protein Hewani | Protein Nabati | Sayur | Buah | Susu | Minyak |
|---|---|---|---|---|---|---|---|
| Ibu Hamil | 2.5 | 2.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.5 |
| Balita | 0.8 | 1.0 | 0.25 | 0.25 | 1.0 | 1.0 | 1.0 |
| SD 1-3 | 1.0 | 1.0 | 0.25 | 0.25 | 1.0 | 1.0 | 1.0 |
| ... | | | | | | | |

### 3j. Ambil Resep dari Siklus Lain

```
`openSiklusRecipePicker()` → menampilkan modal daftar siklus + menu
`pilihResepDariSiklus(...)` → isi grid + resep_map dari siklus lain
`pilihSemuaResepDariSiklus(...)` → isi semua kategori untuk satu hari
```

Fungsi untuk meng-copy resep dari siklus yang sudah ada ke siklus yang sedang diedit.

---

## 4. Perhitungan SP & BDD

### Standar Porsi (SP)

```
berat_bersih = berat_1_sp × sp_value
```

- `berat_1_sp` = gram bahan untuk 1 SP (dari `bahan_baku`)
- `sp_value` = target porsi dari `standar_sp` berdasarkan `(jenjang, kategori_sp)`

### BDD (Berat Dapat Dimakan)

```
berat_kotor = berat_bersih / (persen_bdd / 100)
```

Contoh: Ayam dengan `berat_1_sp=40g`, `persen_bdd=80%`:
```
berat_bersih = 40g × 1.0 SP = 40g
berat_kotor = 40 / 0.8 = 50g (dibeli 50g untuk dapat 40g bersih)
```

### Buffer

```
kebutuhan_dengan_buffer = kebutuhan_total × (1 + buffer_persen / 100)
```

Buffer sebagai toleransi lebih untuk mengantisipasi kekurangan.

---

## 5. Endpoint API

Semua endpoint di `routes/siklus/` dan `routes/sp.js` — require role `admin` atau `ahli_gizi`.

### CRUD Siklus (`routes/siklus/crud.js`)

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/siklus` | List semua siklus |
| `GET` | `/siklus/:id` | Detail siklus + item + grid |
| `POST` | `/siklus` | Buat siklus baru |
| `PUT` | `/siklus/:id` | Update siklus |
| `DELETE` | `/siklus/:id` | Hapus siklus |
| `POST` | `/siklus/bulk-delete` | Hapus banyak siklus |

### Grid Bahan (`routes/siklus/bahan-grid.js`)

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/siklus/:id/bahan-grid` | Ambil grid bahan per hari |
| `POST` | `/siklus/:id/bahan-grid` | Simpan grid bahan |
| `POST` | `/siklus/tambah-bahan` | Tambah bahan baru ke master |
| `GET` | `/bahan/by-sp` | Bahan per kategori SP |

### Aksi (`routes/siklus/aksi.js`)

| Method | Path | Fungsi |
|---|---|---|
| `POST` | `/siklus/generate-produksi` | Generate produksi 1 hari |
| `POST` | `/siklus/generate-produksi-batch` | Generate produksi rentang tanggal |
| `POST` | `/siklus/hitung-budget` | Hitung budget 1 siklus |
| `POST` | `/siklus/hitung-budget-semua` | Hitung budget semua siklus aktif |
| `POST` | `/siklus/buat-pr` | Buat Purchase Request |

### Laporan (`routes/siklus/laporan.js`)

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/siklus/laporan` | Laporan agregat semua siklus |
| `GET` | `/siklus/laporan/bahan` | Kebutuhan bahan per hari (menu-linked) |
| `GET` | `/siklus/laporan/bahan-per-jenjang` | Kebutuhan per jenjang |
| `GET` | `/siklus/:id/laporan` | Laporan detail 1 siklus |
| `GET` | `/siklus/laporan/menu-harian` | Rincian menu per hari |
| `GET` | `/siklus/:id/laporan/produksi-harian` | Produksi harian per bahan |

### Laporan Lanjutan (`routes/siklus/laporan-lanjutan.js`)

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/siklus/laporan/kebutuhan-per-menu` | Kebutuhan per menu per jenjang |
| `GET` | `/siklus/laporan/perencanaan` | Perencanaan harian |
| `POST` | `/siklus/laporan/override` | Tambah/update override bahan |
| `DELETE` | `/siklus/laporan/override/:id` | Hapus override |

### SP (`routes/sp.js`)

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/sp/standar` | Daftar standar SP |
| `PUT` | `/sp/standar/:id` | Update nilai SP |
| `POST` | `/sp/hitung` | Hitung SP untuk 1 menu |
| `POST` | `/sp/hitung-kebutuhan` | Hitung kebutuhan dari siklus |

### Debug (`routes/siklus/debug.js`)

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/siklus/recipe-names` | Nama menu per siklus (untuk picker) |
| `GET` | `/siklus/cek-resep-map` | Debug resep_map (HTML) |

---

## 6. File Penting

| File | Fungsi |
|---|---|
| `public/modul/siklus.js` | Frontend: render, form, grid picker, laporan, aksi |
| `routes/siklus/crud.js` | Backend CRUD siklus + item |
| `routes/siklus/bahan-grid.js` | Backend grid bahan |
| `routes/siklus/aksi.js` | Backend: produksi, budget, PR |
| `routes/siklus/laporan.js` | Backend laporan & produksi harian |
| `routes/siklus/laporan-lanjutan.js` | Backend perencanaan & override |
| `routes/siklus/helpers.js` | Helper: KAT_ORDER, hitung gizi, batch load |
| `routes/sp.js` | Backend SP calculation |
| `services/spBddCalculator.js` | Service: hitungSP, hitungBDD |
| `routes/generic/config.js` | Definisi field & akses tabel |
