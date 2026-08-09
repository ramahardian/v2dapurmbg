/**
 * Purchase Order — Thin Orchestrator
 *
 * File ini adalah thin orchestrator yang mengimpor seluruh modul
 * purchase-order dari direktori routes/purchase-order/, lalu
 * mendaftarkan seluruh rute ke dalam satu instance Express Router.
 *
 * Sub-modul:
 *   - helpers.js   : Shared constants & utility functions (JENJANG_DB_MAP, loaders, dll)
 *   - generate.js  : POST /purchase_order/generate-from-siklus
 *   - create-pr.js : POST /purchase_order/create-pr-from-siklus
 *   - actions.js   : POST /purchase_order/:id/terima + GET /laporan/biaya-produksi
 */

const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { registerGenerateRoutes } = require('./purchase-order/generate');
const { registerCreatePrRoutes } = require('./purchase-order/create-pr');
const { registerActionRoutes } = require('./purchase-order/actions');
const { registerSyncKoperasiRoutes, registerRiwayatKoperasiRoutes } = require('./purchase-order/sync-koperasi');

const router = express.Router();

// Terapkan perlindungan endpoint ke semua rute di bawahnya
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.path.startsWith('/purchase_order')) return requireRole('admin', 'keuangan', 'gudang')(req, res, next);
  next();
});

// Daftarkan seluruh rute purchase-order
registerGenerateRoutes(router);
registerCreatePrRoutes(router);
registerActionRoutes(router);
registerSyncKoperasiRoutes(router);
registerRiwayatKoperasiRoutes(router);

module.exports = router;
