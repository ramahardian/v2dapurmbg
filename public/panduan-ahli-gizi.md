# Panduan Ahli Gizi — Siklus Menu MBG

## 1. Alur Lengkap

```
Buat Siklus → Isi Menu Tiap Hari → Lihat Laporan → Hitung SP → Ekspor
```

---

## 2. Membuat Siklus Baru

1. Klik tombol **"Siklus Baru"** di halaman `/siklus`
2. Isi:
   - **Nama Siklus** — misal "Siklus 1 SD"
   - **Jumlah Hari** — 1–14 hari
   - **Jenjang (Kategori)** — pilih jenjang penerima manfaat
   - **Porsi/Hari** — terisi otomatis dari data penerima manfaat; bisa diedit manual
   - **Status** — Draft / Aktif / Arsip
3. Klik **Simpan**

Setelah simpan, siklus muncul sebagai card di halaman utama.

---

## 3. Mengisi Menu Tiap Hari

Buka detail siklus (klik **Detail** di card). Ada dua cara mengisi menu:

### Cara A: Memilih Menu dari Daftar Menu

> *Fitur ini muncul di halaman detail siklus — setiap hari bisa dipilih menu dari master menu.*

1. Klik hari yang ingin diisi
2. Pilih menu dari dropdown daftar menu
3. Nutrisi otomatis terisi dari menu yang dipilih

### Cara B: Isi Manual dengan Bahan Grid (Matriks)

> *Fitur ini ada di form siklus — matriks baris (kategori SP) × kolom (hari).*

1. Buka form siklus yang sudah ada (klik **Edit** di card)
2. Di bagian **Bahan Grid**, klik sel pada hari + kategori yang diinginkan
3. Centang bahan-bahan yang dipakai
4. Bisa tambah bahan baru lewat tombol **+ Tambah Baru**
5. Isi **Identifikasi Resep** — nama resep untuk tiap hari (misal "Nasi Goreng + Telur")
6. Klik **Simpan**

### Perbedaan Kedua Cara

| Cara | Kelebihan | Kekurangan |
|------|-----------|------------|
| Pilih Menu | Cepat, nutrisi otomatis | Terbatas pada menu yang sudah ada |
| Bahan Grid | Fleksibel, bisa kombinasi bahan apa saja | Harus isi manual tiap sel |

---

## 4. Melihat Laporan

Di card siklus, klik tombol **Laporan**. Tampilan:

### Statistik
- Total hari, hari terisi, hari kosong
- Menu unik yang digunakan
- Coverage (%) = hari terisi ÷ total hari

### Rata-rata Nutrisi per Hari
- Kalori, Protein, Karbohidrat, Lemak, Serat
- Hanya dari hari yang sudah terisi

### Tabel Per Hari
- Hari ke-, nama menu, porsi
- Kalori, Protein, Karbohidrat, Lemak, Serat

### Rincian Kategori per Hari
- Breakdown kategori SP (Karbohidrat, Protein Hewani, dll) untuk tiap hari

---

## 5. Hitung SP (Standar Porsi)

Di halaman laporan, klik tombol **Hitung SP** → sistem menghitung kebutuhan bahan baku berdasarkan standar porsi jenjang.

### Rumus Perhitungan

```
berat_bersih = SP_jenjang × berat_1_sp
berat_kotor = berat_bersih ÷ (%BDD / 100)
kebutuhan_kg = berat_kotor × jumlah_porsi ÷ 1000
```

### Output
- Nama bahan, kategori SP
- Nilai SP, berat 1 SP (gram), %BDD
- Berat bersih, berat kotor per porsi
- Total kebutuhan per bahan dalam kg

### Data yang Digunakan

| Tabel | Kegunaan |
|-------|----------|
| `standar_sp` | Nilai SP per jenjang per kategori |
| `bahan_baku` | `kategori_sp`, `berat_1_sp`, `persen_bdd` |
| `siklus_menu_item_bahan` | Bahan yang dipilih tiap hari di grid |

---

## 6. Ekspor Laporan

Di halaman laporan:
- **CSV** — download data ke file CSV
- **Print** — cetak laporan

---

## 7. Tips

- **Porsi/Hari otomatis** dari penerima manfaat — jika 0, berarti belum ada data penerima untuk jenjang tersebut. Isi manual saja.
- **Gramasi Besar/Kecil** di menu: gramasi besar untuk kategori yang dipilih, gramasi kecil pakai standar Balita. Berguna untuk menu yang dipakai silang jenjang.
- **Duplikasi data** — hindari entri ganda penerima manfaat karena akan menggandakan total porsi. Cek data secara berkala.
