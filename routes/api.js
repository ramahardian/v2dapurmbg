const express = require('express');

const router = express.Router();
const genericRoutes = require('./generic');
const menuRoutes = require('./menu');
const stockRoutes = require('./stock');
const dashboardRoutes = require('./dashboard');
const hppRoutes = require('./hpp');
const aiRoutes = require('./aiRoutes');
const laporanRoutes = require('./laporan');
const siklusRoutes = require('./siklus');
const karyawanRoutes = require('./karyawan');
const absensiRoutes = require('./absensi');
const payrollRoutes = require('./payroll');
const shiftRoutes = require('./shift');
const userRoutes = require('./users');
const templateRoutes = require('./template');
const bahanBakuRoutes = require('./bahanBaku');

router.use(genericRoutes);
router.use(bahanBakuRoutes);
router.use(shiftRoutes);
router.use(userRoutes);
router.use(menuRoutes);
router.use(stockRoutes);
router.use(dashboardRoutes);
router.use(hppRoutes);
router.use(aiRoutes);
router.use(laporanRoutes);
router.use(siklusRoutes);
router.use(karyawanRoutes);
router.use(absensiRoutes);
router.use(payrollRoutes);
router.use('/template', templateRoutes);

module.exports = router;
