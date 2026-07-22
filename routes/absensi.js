/**
 * NAMA KODE / FILE: absensi.js (Route Management Absensi)
 * DESKRIPSI: Endpoint API untuk mengelola data absensi karyawan (CRUD)
 *            lengkap dengan autentikasi, pengecekan role, dan validasi hari libur.
 */

// Mengimpor framework Express untuk membuat router
const express = require('express');

// Mengimpor modul koneksi database
const db = require('../db');

// Mengimpor middleware autentikasi dan otorisasi role
const { requireAuth, requireRole } = require('../middleware/auth');

// Membuat instance Express Router
const router = express.Router();

// Menerapkan middleware autentikasi ke semua endpoint di router ini
router.use(requireAuth);

// Helper function: Memeriksa apakah tanggal tertentu terdaftar sebagai hari libur untuk tenant terkait
async function cekHariLibur(tenant_id, tanggal) {
  // Menjalankan query SQL untuk mencari data hari libur berdasarkan tenant_id dan tanggal
  const [rows] = await db.query(
    'SELECT id, nama FROM hari_libur WHERE tenant_id=? AND tanggal=?',
    [tenant_id, tanggal]
  );
  // Mengembalikan objek data libur jika ditemukan, atau null jika bukan hari libur
  return rows.length > 0 ? rows[0] : null;
}

// Endpoint GET /absensi: Mengambil daftar absensi dengan filter dan paginasi (khusus role admin & keuangan)
router.get('/absensi', requireRole('admin', 'keuangan'), async (req, res) => {
  // Mengambil parameter query dari URL request dengan nilai default untuk page dan limit
  const { karyawan_id, tanggal_awal, tanggal_akhir, status, page = '1', limit = '50' } = req.query;

  // Memastikan nilai halaman minimal bernilai 1
  const pageNum = Math.max(1, parseInt(page));

  // Membatasi limit data antara 1 hingga 500
  const limitNum = Math.min(500, Math.max(1, parseInt(limit)));

  // Menghitung offset query database untuk sistem paginasi
  const offset = (pageNum - 1) * limitNum;

  // Inisialisasi klausa WHERE SQL secara dinamis berorientasi multitenancy
  let where = 'WHERE a.tenant_id=?';

  // Inisialisasi array parameter query SQL
  const params = [req.user.tenant_id];

  // Menambahkan filter karyawan_id jika dikirimkan oleh klien
  if (karyawan_id) { where += ` AND a.karyawan_id=?`; params.push(karyawan_id); }

  // Menambahkan filter rentang tanggal awal jika dikirimkan oleh klien
  if (tanggal_awal) { where += ` AND a.tanggal >= ?`; params.push(tanggal_awal); }

  // Menambahkan filter rentang tanggal akhir jika dikirimkan oleh klien
  if (tanggal_akhir) { where += ` AND a.tanggal <= ?`; params.push(tanggal_akhir); }

  // Menambahkan filter status absensi jika dikirimkan oleh klien
  if (status) { where += ` AND a.status=?`; params.push(status); }

  // Menjalankan query untuk menghitung total seluruh record data absensi sesuai filter
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM absensi a ${where}`, params);

  // Menjalankan query SQL utama untuk mengambil data absensi lengkap dengan data relasi karyawan & jabatan
  const [rows] = await db.query(
    `SELECT a.*, k.nama as nama_karyawan, j.name as jabatan, k.departemen FROM absensi a
     JOIN karyawan k ON k.id=a.karyawan_id
     LEFT JOIN jabatan j ON j.id=k.jabatan_id ${where}
     ORDER BY a.tanggal DESC, k.nama ASC LIMIT ? OFFSET ?`,
    [...params, limitNum, offset]
  );

  // Mengirimkan respons JSON yang berisi data absensi, total record, serta metadata paginasi
  res.json({ data: rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
});

// Endpoint POST /absensi: Menambahkan record absensi baru
router.post('/absensi', requireRole('admin', 'keuangan'), async (req, res) => {
  // Destrukturisasi data yang dikirimkan dari body request
  const { karyawan_id, tanggal, status, jam_masuk, jam_keluar, keterangan } = req.body;

  // Validasi: memastikan ID karyawan telah diisi
  if (!karyawan_id) return res.status(400).json({ error: 'Karyawan wajib dipilih' });

  // Validasi: memastikan tanggal absensi telah diisi
  if (!tanggal) return res.status(400).json({ error: 'Tanggal wajib diisi' });

  // Mengecek apakah tanggal yang akan diinput merupakan hari libur
  const libur = await cekHariLibur(req.user.tenant_id, tanggal);

  // Jika tanggal tersebut adalah hari libur, batalkan proses penambahan dan kirim respons error 403
  if (libur) {
    return res.status(403).json({
      error: `Tidak bisa input absensi: ${tanggal} adalah hari libur (${libur.nama})`,
      libur: true,
      nama_libur: libur.nama,
    });
  }

  // Menjalankan query SQL INSERT untuk menyimpan data absensi baru
  const [r] = await db.query(
    `INSERT INTO absensi (tenant_id, karyawan_id, tanggal, status, jam_masuk, jam_keluar, keterangan) VALUES (?,?,?,?,?,?,?)`,
    [req.user.tenant_id, karyawan_id, tanggal, status || 'Hadir', jam_masuk || null, jam_keluar || null, keterangan || null]
  );

  // Mengambil kembali data absensi yang baru saja dimasukkan beserta nama karyawannya
  const [rows] = await db.query(`SELECT a.*, k.nama as nama_karyawan FROM absensi a JOIN karyawan k ON k.id=a.karyawan_id WHERE a.id=?`, [r.insertId]);

  // Mengirimkan data absensi yang berhasil dibuat sebagai respons JSON
  res.json(rows[0]);
});

// Endpoint PUT /absensi/:id: Mengubah/memperbarui data absensi yang sudah ada
router.put('/absensi/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  // Destrukturisasi field yang boleh diperbarui dari body request
  const { status, jam_masuk, jam_keluar, keterangan } = req.body;

  // Mengambil data tanggal dari absensi yang sudah tersimpan untuk mengecek validitasnya
  const [[existing]] = await db.query('SELECT tanggal FROM absensi WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);

  // Jika data absensi ditemukan pada database
  if (existing) {
    // Memeriksa apakah tanggal pada record tersebut tergolong hari libur
    const libur = await cekHariLibur(req.user.tenant_id, existing.tanggal);

    // Jika hari tersebut adalah hari libur, cegah proses perubahan/edit data
    if (libur) {
      return res.status(403).json({
        error: `Tidak bisa edit absensi: ${existing.tanggal} adalah hari libur (${libur.nama})`,
        libur: true,
        nama_libur: libur.nama,
      });
    }
  }

  // Inisialisasi array untuk menyusun bagian SET pada klausa SQL UPDATE dan parameternya secara dinamis
  const sets = []; const vals = [];

  // Menambahkan kolom status ke daftar update jika dikirim di request
  if (status !== undefined) { sets.push('status=?'); vals.push(status); }

  // Menambahkan kolom jam_masuk ke daftar update jika dikirim di request
  if (jam_masuk !== undefined) { sets.push('jam_masuk=?'); vals.push(jam_masuk); }

  // Menambahkan kolom jam_keluar ke daftar update jika dikirim di request
  if (jam_keluar !== undefined) { sets.push('jam_keluar=?'); vals.push(jam_keluar); }

  // Menambahkan kolom keterangan ke daftar update jika dikirim di request
  if (keterangan !== undefined) { sets.push('keterangan=?'); vals.push(keterangan); }

  // Jika tidak ada data/field yang diubah, kembalikan respons error 400 Bad Request
  if (!vals.length) return res.status(400).json({ error: 'Tidak ada perubahan' });

  // Menambahkan parameter ID absensi dan tenant_id ke array klausa WHERE SQL
  vals.push(req.params.id, req.user.tenant_id);

  // Menjalankan query SQL UPDATE untuk memperbarui data di database
  await db.query(`UPDATE absensi SET ${sets.join(',')} WHERE id=? AND tenant_id=?`, vals);

  // Mengambil data absensi yang telah diperbarui beserta nama karyawannya
  const [rows] = await db.query(`SELECT a.*, k.nama as nama_karyawan FROM absensi a JOIN karyawan k ON k.id=a.karyawan_id WHERE a.id=?`, [req.params.id]);

  // Mengirimkan hasil data ter-update sebagai respons JSON
  res.json(rows[0]);
});

// Endpoint DELETE /absensi/:id: Menghapus data absensi
router.delete('/absensi/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  // Mengambil data tanggal dari absensi yang ingin dihapus
  const [[existing]] = await db.query('SELECT tanggal FROM absensi WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);

  // Jika data absensi ditemukan
  if (existing) {
    // Memeriksa apakah tanggal absensi tersebut merupakan hari libur
    const libur = await cekHariLibur(req.user.tenant_id, existing.tanggal);

    // Jika hari libur, cegah penghapusan data
    if (libur) {
      return res.status(403).json({
        error: `Tidak bisa hapus absensi: ${existing.tanggal} adalah hari libur (${libur.nama})`,
        libur: true,
        nama_libur: libur.nama,
      });
    }
  }

  // Menjalankan query SQL DELETE untuk menghapus record absensi terkait
  await db.query(`DELETE FROM absensi WHERE id=? AND tenant_id=?`, [req.params.id, req.user.tenant_id]);

  // Mengirimkan respons JSON berupa status sukses bahwa data telah terhapus
  res.json({ ok: true });
});

// Mengekspor objek router agar dapat digunakan di file utama Express (app.js / server.js)
module.exports = router;