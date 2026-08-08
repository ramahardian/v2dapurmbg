/**
 * routes/siklus/index.js
 * 
 * Main entry point for siklus-related routes.
 * Menggabungkan semua sub-router dari direktori routes/siklus/.
 * 
 * Sebelum refactoring: routes/siklus.js (3.365 baris)
 * Setelah refactoring: dipisah menjadi modul-modul kecil:
 *   - helpers.js   → shared constants & batch query functions
 *   - crud.js      → CRUD endpoints (list, detail, create, update, delete)
 *   - laporan.js   → report endpoints (laporan agregat, bahan, produksi)
 *   - bahan-grid.js → bahan grid picker endpoints
 *   - laporan-lanjutan.js → advanced reports (perencanaan, kebutuhan)
 *   - aksi.js      → action endpoints (generate produksi, budget, PR)
 *   - debug.js     → debug/utility endpoints (recipe-names, cek-resep-map)
 */

const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth');

const router = express.Router();

// Global middleware: require auth for all siklus routes
router.use(requireAuth);

// Role-based access: admin & ahli_gizi for siklus & bahan endpoints
router.use((req, res, next) => {
  if (req.path.startsWith('/siklus') || req.path.startsWith('/bahan')) {
    return requireRole('admin', 'ahli_gizi')(req, res, next);
  }
  next();
});

// Mount sub-routers
// IMPORTANT: Spesifik routes (laporan, debug) harus BEFORE parameterized routes (:id)
// agar Express mencocokkan route yang lebih spesifik terlebih dahulu
router.use(require('./laporan'));        // GET /siklus/laporan* (specific routes BEFORE :id)
router.use(require('./laporan-lanjutan')); // GET /siklus/laporan/kebutuhan-per-menu, /perencanaan
router.use(require('./debug'));          // GET /siklus/recipe-names, /siklus/cek-resep-map
router.use(require('./templates'));      // POST/GET/DELETE /siklus/templates* + /siklus/:id/terapkan-template (SEBELUM crud agar /siklus/templates tidak tertangkap /siklus/:id)
router.use(require('./bahan-grid'));     // GET/POST /siklus/:id/bahan-grid, /bahan/by-sp
router.use(require('./crud'));           // GET/POST/PUT/DELETE /siklus, /siklus/:id (parameterized AFTER specific)
router.use(require('./aksi'));           // POST /siklus/generate-produksi, /hitung-budget, /buat-pr

module.exports = router;
