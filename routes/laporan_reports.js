/**
 * Laporan Reports — Thin Orchestrator
 *
 * File ini adalah thin orchestrator yang mengimpor seluruh modul laporan
 * dari direktori routes/laporan/, lalu mendaftarkan seluruh rute ke
 * dalam satu instance Express Router.
 *
 * Sub-modul:
 *   - config.js      : Role middleware definitions (roleFinance, roleOps, roleWarehouse, dll)
 *   - warehouse.js   : Laporan gudang/operasional (pembelian, penerimaan, mutasi stok, produksi, kebutuhan pangan)
 *   - keuangan.js    : Laporan keuangan (payroll, laba-rugi, HPP, BP operasional, arus kas, dll)
 *   - rab.js         : Laporan RAB (rab-bulanan, rab-detail, rab-generate-budget, rab-sinkron, dll)
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { registerWarehouseRoutes } = require('./laporan/warehouse');
const { registerKeuanganRoutes } = require('./laporan/keuangan');
const { registerRabRoutes } = require('./laporan/rab');

const router = express.Router();

// Terapkan perlindungan endpoint ke semua rute di bawahnya
router.use(requireAuth);

// Daftarkan seluruh rute laporan
registerWarehouseRoutes(router);
registerKeuanganRoutes(router);
registerRabRoutes(router);

module.exports = router;
