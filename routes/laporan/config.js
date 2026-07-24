const { requireRole } = require('../../middleware/auth');

const roleFinance = requireRole('admin', 'keuangan');
const roleOps = requireRole('admin', 'keuangan', 'produksi', 'gudang', 'pimpinan');
const roleWarehouse = requireRole('admin', 'gudang', 'produksi', 'keuangan');
const roleHR = requireRole('admin', 'keuangan', 'hrd', 'pimpinan');
const roleAll = requireRole('admin', 'keuangan', 'produksi', 'gudang', 'pimpinan', 'hrd');

module.exports = { roleFinance, roleOps, roleWarehouse, roleHR, roleAll };
