# MBG Kitchen SaaS — Node.js Express + MySQL + Tailwind

Sistem **SaaS multi-tenant** untuk operasional dapur & akuntansi program **Makan Bergizi Gratis (MBG)** Indonesia.

> Setiap dapur (tenant) terdaftar sebagai unit terpisah dengan data terisolasi. Cocok untuk skala nasional dengan banyak dapur MBG.

---

## ✨ Fitur

### Operasional Dapur
- **Penerima Manfaat** — kelompok Ibu Hamil, Menyusui, Balita, PAUD, TK, SD, SMP
- **Menu & Gizi** — resep dengan komposisi bahan, gramasi & kandungan gizi (kalori, protein, karbo, lemak, serat)
- **Bahan Baku** — master dengan harga satuan, stok, & alert minimum
- **Gudang & Persediaan** — barang masuk/keluar dengan auto-update stok bahan baku
- **Produksi Dapur** — perencanaan & catatan produksi harian
- **Distribusi** — pengiriman ke titik penerima dengan tracking kurir

### Pembelian
- **Supplier** — master pemasok
- **PR/PO** — Purchase Request → Purchase Order → Invoice
- **Penerimaan Barang** — dengan QC

### Akuntansi & Keuangan
- **Budgeting** — anggaran per periode & kategori
- **Kas & Bank** — transaksi masuk/keluar, pembayaran supplier
- **HPP Calculator** — Bahan Baku + Tenaga Kerja + Overhead = Biaya per Porsi
- **Laporan** — Budget vs Realisasi, Persediaan, Distribusi, Keuangan + Export CSV

### SaaS & Lainnya
- **Multi-tenant** — sign up dapur baru, data terisolasi per tenant
- **JWT auth** dengan role (admin, ahli_gizi, gudang, keuangan, produksi)
- **Brute-force protection** (rate limit login)
- **AI Menu Suggestion** (opsional, butuh OPENAI_API_KEY)
- **UI Tailwind** server-rendered EJS + vanilla JS SPA
- **Bahasa Indonesia + IDR**

---

## 🚀 Setup

### Prasyarat
- Node.js >= 18
- MySQL >= 5.7 / MariaDB >= 10.3
- Yarn atau npm

### 1. Install Dependencies

```bash
cd mbg-nodejs
yarn install
# atau: npm install
```

### 2. Konfigurasi Environment

```bash
cp .env.example .env
nano .env
```

Isi minimal:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=mbg_kitchen
JWT_SECRET=ganti-dengan-random-string-64-karakter
ADMIN_EMAIL=admin@mbg.id
ADMIN_PASSWORD=admin123
ADMIN_TENANT_NAME=Dapur Pusat MBG
```

### 3. Buat Database & Migrate

Pastikan MySQL berjalan, lalu:

```bash
node scripts/migrate.js
```

Script ini akan:
- ✓ Membuat database `mbg_kitchen` (jika belum ada)
- ✓ Membuat semua tabel (tenants, users, penerima_manfaat, bahan_baku, menu, dst.)
- ✓ Seed tenant pertama + admin user

### 4. Jalankan Server

```bash
yarn start
# atau development mode dengan auto-reload:
yarn dev
```

Server berjalan di **http://localhost:3000**

### 5. Login

- URL: http://localhost:3000/login
- Email: `admin@mbg.id`
- Password: `admin123`

Untuk daftar **dapur baru (tenant baru)**: http://localhost:3000/signup

---

## 📁 Struktur Proyek

```
mbg-nodejs/
├── server.js              # Express app entry
├── db.js                  # MySQL connection pool
├── schema.sql             # MySQL schema lengkap
├── package.json
├── .env.example
├── middleware/
│   └── auth.js            # JWT auth + role guard
├── routes/
│   ├── auth.js            # /api/auth/* (signup, login, logout, me)
│   └── api.js             # /api/* (semua CRUD + dashboard + HPP + laporan)
├── views/
│   ├── login.ejs          # halaman login
│   ├── signup.ejs         # halaman daftar tenant
│   └── app.ejs            # shell SPA dashboard
├── public/
│   └── app.js             # frontend vanilla JS (semua modul)
└── scripts/
    └── migrate.js         # buat DB + seed admin
```

---

## 🔑 API Endpoints

### Auth
- `POST /api/auth/signup` — daftar tenant baru (sekaligus admin user)
- `POST /api/auth/login` — login (set cookie JWT)
- `POST /api/auth/logout` — logout
- `GET /api/auth/me` — info user + tenant aktif
- `POST /api/auth/users` — admin tambah user di tenant-nya

### CRUD (semua butuh auth, otomatis tenant-scoped)
- `GET/POST/PUT/DELETE /api/penerima_manfaat`
- `GET/POST/PUT/DELETE /api/bahan_baku`
- `GET/POST/PUT/DELETE /api/menu` (custom — termasuk relasi `menu_bahan`)
- `GET/POST/PUT/DELETE /api/supplier`
- `GET/POST/PUT/DELETE /api/purchase_order`
- `GET/POST/PUT/DELETE /api/penerimaan_barang`
- `GET/POST/PUT/DELETE /api/produksi`
- `GET/POST/PUT/DELETE /api/distribusi`
- `GET/POST/PUT/DELETE /api/budget`
- `GET/POST/PUT/DELETE /api/kas_bank`

### Stok (auto-update bahan_baku.stok_saat_ini)
- `GET/POST /api/stok_masuk`
- `GET/POST /api/stok_keluar`

### Custom
- `GET /api/dashboard/summary` — agregasi dashboard
- `POST /api/hpp/calculate` — hitung HPP per porsi
- `POST /api/ai/suggest-menu` — saran menu AI (butuh `OPENAI_API_KEY`)
- `GET /api/laporan/keuangan` — laporan kas & bank

---

## 🎨 Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Backend | Node.js + Express 4 |
| Database | MySQL (mysql2/promise dengan connection pool) |
| Auth | JWT (jsonwebtoken) + bcrypt + httpOnly cookies |
| Rate Limit | express-rate-limit |
| Frontend | EJS server-rendered + vanilla JS SPA |
| Styling | Tailwind CSS (CDN) |
| Fonts | Plus Jakarta Sans + IBM Plex Sans + JetBrains Mono |
| AI (opsional) | OpenAI gpt-4o-mini via REST |

---

## 🏗️ Multi-Tenant Architecture

Setiap dapur (tenant) terisolasi penuh:

1. **Tabel `tenants`** — master dapur dengan paket (free/pro/enterprise)
2. **Semua tabel data** punya `tenant_id` (FK ke `tenants.id`) dengan `ON DELETE CASCADE`
3. **Semua query** otomatis di-scope `WHERE tenant_id = req.user.tenant_id`
4. **JWT payload** berisi `tenant_id` — tidak bisa diubah oleh user
5. **Index** pada `tenant_id` di semua tabel untuk performa

---

## 💡 Tips Production

- Ganti `JWT_SECRET` dengan string random 64 karakter
- Set `NODE_ENV=production`
- Gunakan reverse proxy (nginx/Caddy) dengan HTTPS
- Set `secure: true` di cookie options (`routes/auth.js`) jika pakai HTTPS
- Backup MySQL secara berkala
- Untuk skala besar: gunakan Redis untuk rate limiting & session
- Monitoring: tambahkan Sentry atau PM2 + logger

---

## 📝 Lisensi

MIT — Bebas digunakan untuk program MBG di seluruh Indonesia 🇮🇩
# v2dapurmbg
