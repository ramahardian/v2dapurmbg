/**
 * routes/siklus.js — Compatibility wrapper
 * 
 * File ini adalah wrapper kompatibilitas yang me-reexport router dari
 * direktori routes/siklus/ (modular).
 * 
 * Sebelum refactoring: ~3.365 baris dalam satu file
 * Setelah refactoring: dipisah menjadi 7 modul kecil di routes/siklus/
 * 
 * @see routes/siklus/index.js
 */

const siklusRouter = require('./siklus/index');

module.exports = siklusRouter;
