/**
 * NAMA KODE / FILE: api.js (Central API Route Aggregator / Main Router)
 * DESKRIPSI: File penggabung (aggregator) seluruh modul rute/endpoint API.
 *            Berfungsi mendaftarkan seluruh sub-router dari berbagai fitur sistem
 *            ke dalam satu instance Express Router utama.
 */

// Mengimpor framework Express untuk membuat router
const express = require('express');

// Membuat instance Express Router utama
const router = express.Router();

// Mengimpor router generik/umum
const genericRoutes = require('./generic');

// Mengimpor router manajemen menu
const menuRoutes = require('./menu');

// Mengimpor router manajemen stok barang/bahan
const stockRoutes = require('./stock');

// Mengimpor router data dashboard & statistik
const dashboardRoutes = require('./dashboard');

// Mengimpor router fitur integrasi AI (saran menu, nutrisi, dll.)
// const aiRoutes = require('./aiRoutes'); // AI disabled temporarily

// Mengimpor router laporan operasional
const laporanRoutes = require('./laporan');

// Mengimpor router siklus menu/produksi
const siklusRoutes = require('./siklus');

// Mengimpor router manajemen data karyawan
const karyawanRoutes = require('./karyawan');

// Mengimpor router absensi karyawan
const absensiRoutes = require('./absensi');

// Mengimpor router penggajian / payroll karyawan
const payrollRoutes = require('./payroll');

// Mengimpor router manajemen shift kerja
const shiftRoutes = require('./shift');

// Mengimpor router manajemen pengguna / user accounts
const userRoutes = require('./users');

// Mengimpor router cetak/export template
const templateRoutes = require('./template');

// Mengimpor router manajemen bahan baku
const bahanBakuRoutes = require('./bahanBaku');

// Mengimpor router pengajuan ijin dan cuti
const ijinCutiRoutes = require('./ijinCuti');

// Mengimpor router jurnal keuangan (menggunakan destructuring karena diekspor sebagai objek)
const { router: jurnalRoutes } = require('./jurnal');

// Mendaftarkan router generik ke router utama (URL root /)
router.use(genericRoutes);

// Mendaftarkan router jurnal keuangan (URL root /)
router.use(jurnalRoutes);

// Mendaftarkan router bahan baku (URL root /)
router.use(bahanBakuRoutes);

// Mendaftarkan router shift kerja (URL root /)
router.use(shiftRoutes);

// Mendaftarkan router pengguna / user (URL root /)
router.use(userRoutes);

// Mendaftarkan router menu (URL root /)
router.use(menuRoutes);

// Mendaftarkan router stok (URL root /)
router.use(stockRoutes);

// Mendaftarkan router dashboard (URL root /)
router.use(dashboardRoutes);

// Mendaftarkan router fitur AI (URL root /)
// router.use(aiRoutes); // AI disabled temporarily

// Mendaftarkan router laporan (URL root /)
router.use(laporanRoutes);

// Mendaftarkan router siklus menu (URL root /)
router.use(siklusRoutes);

// Mendaftarkan router karyawan (URL root /)
router.use(karyawanRoutes);

// Mendaftarkan router absensi (URL root /)
router.use(absensiRoutes);

// Mendaftarkan router payroll (URL root /)
router.use(payrollRoutes);

// Mendaftarkan router template dengan prefix path '/template'
router.use('/template', templateRoutes);

// Mendaftarkan router ijin/cuti dengan prefix path '/ijin-cuti'
router.use('/ijin-cuti', ijinCutiRoutes);

// Mengimpor dan mendaftarkan router Purchase Order secara langsung (URL root /)
router.use(require('./purchase_order'));

// Mengimpor dan mendaftarkan router Surat Peringatan (SP) secara langsung (URL root /)
router.use(require('./sp'));

// Mengimpor dan mendaftarkan router Laporan/Reports terintegrasi secara langsung (URL root /)
router.use(require('./laporan_reports'));

// Mengimpor dan mendaftarkan router Absensi Mobile dengan prefix path '/mobile'
router.use('/mobile', require('./mobileAbsensi'));

// Mengimpor dan mendaftarkan router Alternatif Sumber Bahan secara langsung (URL root /)
router.use(require('./alterBahanSumber'));

// Mengimpor dan mendaftarkan router Konfigurasi Sistem secara langsung (URL root /)
router.use(require('./system'));

// Mengimpor dan mendaftarkan router Hari Libur dengan prefix path '/hari-libur'
router.use('/hari-libur', require('./hariLibur'));

// Mengimpor dan mendaftarkan router Notifikasi (URL root /)
router.use(require('./notifikasi'));

// Mengekspor router utama agar dapat digunakan oleh aplikasi Express utama (app.js / server.js)
module.exports = router;