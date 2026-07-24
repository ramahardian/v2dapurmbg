/**
 * Generic Routes — Thin Orchestrator
 *
 * File ini adalah thin orchestrator yang mengimpor konfigurasi, helper,
 * auto-stok, auto-jurnal, dan dynamic route generator dari sub-modul
 * di direktori routes/generic/, lalu mendaftarkan seluruh rute ke
 * dalam satu instance Express Router.
 *
 * Sub-modul:
 *   - config.js       : Whitelist tabel, role, field wajib, unique, searchable
 *   - helpers.js      : buildInsert, buildUpdate
 *   - auto-stok.js    : autoStokMasukFromPenerimaan, autoStokKeluarFromProduksi
 *   - auto-jurnal.js  : autoPostPembelianToJurnal, recalculateRealisasi
 *   - dynamic-routes.js: Generator rute dinamis (GET/POST/PUT/DELETE) + extra endpoints
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { registerDynamicRoutes } = require('./generic/dynamic-routes');

const router = express.Router();

// Terapkan perlindungan endpoint ke semua rute di bawahnya
router.use(requireAuth);

// Daftarkan seluruh rute dinamis dan endpoint tambahan
registerDynamicRoutes(router);

module.exports = router;
