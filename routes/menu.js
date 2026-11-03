/**
 * Menu — Thin Orchestrator
 *
 * File ini adalah thin orchestrator yang mengimpor seluruh modul menu
 * dari direktori routes/menu/, lalu mendaftarkan seluruh rute ke
 * dalam satu instance Express Router.
 *
 * Sub-modul:
 *   - helpers.js  : Shared utility functions (SP loading, nutrition calc, bahan lookup, dll)
 *   - queries.js  : GET endpoints (list, detail, batch, by-siklus)
 *   - crud.js     : POST/PUT/DELETE + recalculate-nutrisi
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { registerQueryRoutes } = require('./menu/queries');
const { registerCrudRoutes } = require('./menu/crud');

const router = express.Router();

// Terapkan perlindungan endpoint ke semua rute di bawahnya
router.use(requireAuth);

// Daftarkan seluruh rute menu
registerQueryRoutes(router);
registerCrudRoutes(router);

module.exports = router;
