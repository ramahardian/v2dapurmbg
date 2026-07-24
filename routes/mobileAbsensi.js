/**
 * Mobile Absensi — Thin Orchestrator
 *
 * File ini adalah thin orchestrator yang mengimpor seluruh modul
 * mobile-absensi dari direktori routes/mobile-absensi/, lalu
 * mendaftarkan seluruh rute ke dalam satu instance Express Router.
 *
 * Sub-modul:
 *   - helpers.js  : Shared utility functions (date, shift, karyawan lookup, time verification)
 *   - status.js   : GET /absensi/status — status absensi hari ini
 *   - clock.js    : POST /absensi/clock-in + POST /absensi/clock-out
 *   - queries.js  : GET riwayat, rekap, shift-saya, profile + POST ijin-cuti
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { ensureKaryawan } = require('./mobile-absensi/helpers');
const { registerStatusRoutes } = require('./mobile-absensi/status');
const { registerClockRoutes } = require('./mobile-absensi/clock');
const { registerQueryRoutes } = require('./mobile-absensi/queries');

const router = express.Router();

// Terapkan perlindungan endpoint ke semua rute di bawahnya
router.use(requireAuth);

// Middleware: pastikan user terhubung ke data karyawan
router.use(ensureKaryawan);

// Daftarkan seluruh rute mobile absensi
registerStatusRoutes(router);
registerClockRoutes(router);
registerQueryRoutes(router);

module.exports = router;
