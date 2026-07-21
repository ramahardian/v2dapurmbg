# Panduan Ahli Gizi — Siklus Menu MBG

## 1. Alur Lengkap

```
Referensi SP Bahan → Standar SP → Menu & Gizi → Siklus Menu → Perhitungan BDD → Perencanaan Kebutuhan → Total Kebutuhan → Draft PR → Keuangan (Harga + PO) → Penerimaan Barang → Auto Jurnal → Laporan
```

---

## 2. Referensi SP Bahan

Halaman: **Referensi SP Bahan** (`/sp-referensi`)

Data acuan utama untuk **BDD (Bahan Dapat Dimakan)** dan berat per SP.

| Field | Deskripsi |
|-------|-----------|
| Nama Bahan | Nama bahan pangan |
| Kategori SP | Karbohidrat, Protein Hewani, Protein Nabati, Sayur, Buah, Susu, Minyak |
| Berat Bersih (g) | Berat bahan yang dapat dimakan per porsi |
| BDD (%) | Persentase bahan yang dapat dimakan |
| Berat Kotor (g) | Berat sebelum pengolahan (termasuk bagian yang dibuang) |
| Energi, Protein, Lemak, Karbohidrat, Serat | Kandungan gizi per 100g |

> **Penting:** Nilai BDD dari Referensi SP **diprioritaskan** dibanding data Bahan Baku. Sistem akan menggunakan BDD dari Referensi SP jika ada, baru fallback ke data Bahan Baku.

---

## 3. Standar SP

Halaman: **Standar SP** (`/standar-sp`)

Atur nilai **Standar Penukar** per jenjang per kategori SP.

| Jenjang | Kategori SP |
|---------|-------------|
| TK/PAUD | Karbohidrat, Protein Hewani, Protein Nabati, Sayur, Buah, Susu, Minyak |
| SD/MI (1-3) | ... |
| SD/MI (4-6) | ... |
| SMP/MTs | ... |
| SMA/SMK | ... |
| Bumil/Busui | ... |
| Balita | ... |

Default sudah sesuai pedoman gizi — sesuaikan jika diperlukan.

---

## 4. Menu & Gizi

Halaman: **Menu & Gizi** (`/menu`)

Buat resep menu dengan memilih bahan baku.

### Cara Membuat Menu
1. Klik **Tambah Baru**
2. Isi nama menu, pilih kategori penerima (jenjang)
3. Tambahkan bahan-bahan dari master Bahan Baku
4. Gramasi per porsi terisi otomatis berdasarkan SP
5. Kandungan gizi (kalori, protein, lemak, karbohidrat, serat) bisa diisi manual atau dihitung dari bahan

> **Catatan:** Ahli Gizi **tidak perlu input harga** — harga diatur oleh bagian Keuangan.

### Gramasi Besar/Kecil
- Gramasi **Besar** untuk kategori penerima yang dipilih
- Gramasi **Kecil** pakai standar Balita
- Berguna untuk menu yang dipakai silang jenjang

---

## 5. Susun Siklus Menu

Halaman: **Siklus Menu** (`/siklus`)

### Membuat Siklus Baru
1. Klik **Siklus Baru**
2. Isi:
   - **Nama Siklus** — misal "Siklus 1 SD"
   - **Jumlah Hari** — 1–14 hari
   - **Jenjang (Kategori)** — pilih jenjang penerima manfaat
   - **Porsi/Hari** — terisi otomatis dari data penerima manfaat; bisa diedit manual
   - **Status** — Draft / Aktif / Arsip
3. Klik **Simpan**

### Mengisi Menu Tiap Hari

Buka detail siklus (klik **Detail** di card). **Ada dua cara:**

#### Cara A: Pilih Menu dari Daftar Menu
1. Klik hari yang ingin diisi
2. Pilih menu dari dropdown daftar menu
3. Nutrisi otomatis terisi dari menu yang dipilih

#### Cara B: Isi Manual dengan Bahan Grid (Matriks)
1. Buka form siklus (klik **Edit** di card)
2. Di bagian **Bahan Grid**, klik sel pada hari + kategori yang diinginkan
3. Centang bahan-bahan yang dipakai
4. Bisa tambah bahan baru lewat tombol **+ Tambah Baru**
5. Isi **Identifikasi Resep** — nama resep untuk tiap hari
6. Klik **Simpan**

#### Perbedaan Kedua Cara

| Cara | Kelebihan | Kekurangan |
|------|-----------|------------|
| Pilih Menu | Cepat, nutrisi otomatis | Terbatas pada menu yang sudah ada |
| Bahan Grid | Fleksibel, bebas kombinasi | Harus isi manual tiap sel |

> **Status Siklus:** Setelah semua hari terisi, ubah status menjadi **Aktif** agar masuk perhitungan kebutuhan dan laporan keuangan.

---

## 6. Cek Perhitungan BDD

Halaman: **Perhitungan BDD** (`/perhitungan-bdd`)

Lihat rincian kebutuhan bahan per menu per jenjang. Filter berdasarkan siklus tertentu atau tampilkan semua siklus Aktif.

### Tampilan
- Per **jenjang** → per **siklus** → per **hari/menu**
- Setiap bahan menampilkan:

| Kolom | Keterangan |
|-------|------------|
| Berat Bersih (g) | Jumlah bahan per porsi = SP × Berat 1 SP |
| BDD (%) | Sumber: **Referensi SP** (prioritas, warna hijau) atau **Bahan Baku** |
| Berat Kotor (g) | Berat Bersih ÷ (BDD/100) |
| Jumlah Siswa | Total penerima manfaat untuk jenjang ini |
| Kebutuhan (kg) | Berat Kotor × Jumlah Siswa ÷ 1000 |

> **BDD dari Referensi SP** ditampilkan dengan teks hijau tebal untuk membedakan dari data Bahan Baku (warna normal).

### Kalkulator BDD Mandiri

Halaman: **Kalkulator BDD** (`/bdd-kalkulator`)

Kalkulator real-time untuk menghitung berat kotor, bersih, dan kebutuhan bahan secara manual. Berguna untuk simulasi atau pengecekan cepat.

---

## 7. Perencanaan Kebutuhan Pangan

Halaman: **Perencanaan** (`/perencanaan`)

Rekap final kebutuhan bahan **per hari lintas semua jenjang**. Data ini yang akan digunakan untuk pembelian.

### Dua Tampilan

| Tampilan | Kegunaan |
|----------|----------|
| **Per Hari** | Tabel per hari dengan kolom per jenjang, total kg, buffer 10%, rincian (kg/pcs) |
| **Rekap per Jenjang** | Akumulasi kebutuhan per bahan per jenjang untuk seluruh hari |

### Kolom Tabel Per Hari
- **Bahan Pangan** — nama + nilai SP
- **Per Jenjang** — kebutuhan per jenjang (kg)
- **Total Porsi** — jumlah penerima
- **Kebutuhan Pangan (kg)** — total kebutuhan
- **+10% Buffer** — kebutuhan + cadangan 10%
- **Rincian** — pembulatan untuk pembelian (kg/pcs)

> **Buat Draft PR:** Klik tombol **Buat Draft PR** (warna hijau) untuk langsung membuat Purchase Request dari siklus aktif. Pilih siklus → sistem otomatis generate PR.

---

## 8. Total Kebutuhan Pangan

Halaman: **Total Kebutuhan** (`/total-kebutuhan`)

Ringkasan per hari yang lebih sederhana — menampilkan bahan dan jumlah pembelian (kg/pcs/btl). Dua hari ditampilkan **berdampingan** untuk memudahkan belanja.

Juga memiliki tombol **Buat Draft PR** yang sama seperti di Perencanaan.

---

## 9. Membuat Draft Purchase Request (PR)

Tersedia dari halaman **Perencanaan** atau **Total Kebutuhan**:

1. Klik tombol **Buat Draft PR** (warna hijau di filter bar)
2. Sistem menampilkan daftar siklus Aktif
3. Masukkan nomor siklus yang ingin dibuatkan PR (pisah koma)
4. Sistem otomatis:
   - Menghitung total kebutuhan bahan dari semua siklus terpilih
   - Menambahkan buffer 10%
   - Membuat entri **Purchase Order** dengan status **Draft** dan nomor PR
   - Menyimpan detail bahan, qty, dan estimasi subtotal
5. PR siap ditinjau oleh bagian Keuangan di menu **Pembelian → Purchase Order**

> **Catatan:** Ahli Gizi membuat PR berdasarkan kebutuhan bahan (tanpa harga). Harga akan diisi otomatis dari master Bahan Baku saat PR dibuat.

---

## 10. Alur Setelah PR (Bagian Keuangan)

Setelah PR dibuat, alur dilanjutkan oleh bagian Keuangan:

| Langkah | Dilakukan Oleh | Keterangan |
|---------|----------------|------------|
| Atur Harga Bahan | Keuangan | Input `harga_satuan` di master Bahan Baku (manual atau sync API koperasi) |
| Tinjau & Proses PR → PO | Keuangan | Ubah status Draft → Diteruskan → Dipesan |
| Penerimaan Barang + QC | Gudang | Barang datang, QC Lolos → auto stok masuk + auto jurnal |
| Pembayaran PO | Keuangan | Status Dibayar → auto jurnal (Debit Biaya, Kredit Kas) |
| Laporan Biaya Produksi | Keuangan | Lihat estimasi biaya per siklus di menu Laporan → Biaya Produksi |

---

## 11. Laporan Biaya Produksi per Siklus

Halaman: **RAB + Pembelian** (`/laporan-rab-pembelian`) → tab **Biaya Produksi**

Bagian Keuangan bisa melihat estimasi biaya bahan baku per siklus:
- Total biaya per siklus
- Rata-rata per hari
- Biaya per porsi
- Rincian per hari

Data dihitung otomatis dari kebutuhan bahan × `harga_satuan`.

---

## 12. Auto-Jurnal & Laporan Keuangan

Semua transaksi pembelian bahan baku otomatis tercatat:
1. **Jurnal Umum** — double-entry untuk setiap transaksi
2. **Buku Besar** — ledger per akun
3. **Neraca** — posisi keuangan
4. **Laba Rugi** — profit/loss

Tidak perlu entry manual — alur dari Ahli Gizi → Pembelian → Stok → Jurnal berjalan **otomatis**.

---

## 13. Tips & Catatan Penting

- **Porsi/Hari otomatis** dari penerima manfaat — jika 0, berarti belum ada data penerima untuk jenjang tersebut. Isi manual saja.
- **Duplikasi data penerima** — hindari entri ganda karena akan menggandakan total porsi. Cek data secara berkala.
- **Prioritas BDD** — sistem menggunakan BDD dari **Referensi SP Bahan** terlebih dahulu. Jika tidak ada, fallback ke data **Bahan Baku**.
- **Siklus harus Aktif** — hanya siklus dengan status **Aktif** yang masuk perhitungan Perencanaan dan pembuatan PR.
- **Jangan ubah harga** — Ahli Gizi hanya fokus pada data gizi dan kebutuhan bahan (kg). Harga adalah domain Keuangan.
