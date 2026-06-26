// Navigation groups for sidebar
const NAV_GROUPS = [
  { items: ['dashboard'] },
  { label: 'Operasional', items: ['penerima-manfaat', 'bahan-baku', 'gudang', 'produksi', 'distribusi'] },
  { label: 'Pembelian', items: ['supplier', 'pembelian', 'penerimaan'] },
  { label: 'Akuntansi', items: ['budgeting', 'kas-bank', 'laporan'] },
  { label: 'SDM', items: ['karyawan', 'absensi', 'payroll'] },
  { label: 'Ahli Gizi', items: ['menu', 'hpp', 'siklus'] },
];

// Modules definition
const MODULES = {
  dashboard: { title: 'Dashboard', sub: 'Ringkasan operasional dapur', icon: '', render: renderDashboard },
  'penerima-manfaat': { title: 'Penerima Manfaat', sub: 'Master data kelompok penerima MBG', icon: '', crud: {} },
  'bahan-baku': { title: 'Bahan Baku', sub: 'Master bahan baku & harga satuan', icon: '', crud: {} },
  menu: { title: 'Menu & Gizi', sub: 'Resep MBG, gramasi & kandungan gizi', icon: '', render: renderMenu },
  gudang: { title: 'Gudang & Persediaan', sub: 'Stok, barang masuk, & barang keluar', icon: '', render: renderGudang },
  produksi: { title: 'Produksi Dapur', sub: 'Catatan produksi harian', icon: '', crud: {} },
  distribusi: { title: 'Distribusi', sub: 'Pengiriman porsi ke titik penerima', icon: '', crud: {} },
  supplier: { title: 'Supplier', sub: 'Daftar pemasok bahan baku', icon: '', crud: {} },
  pembelian: { title: 'Pembelian — PR & PO', sub: 'Purchase Request -> Purchase Order -> Invoice', icon: '', crud: {} },
  penerimaan: { title: 'Penerimaan Barang', sub: 'Barang masuk dari supplier', icon: '', crud: {} },
  budgeting: { title: 'Budgeting', sub: 'Anggaran per periode & kategori', icon: '', crud: {} },
  'kas-bank': { title: 'Kas & Bank', sub: 'Penerimaan dana, pembayaran supplier & biaya operasional', icon: '', crud: {} },
  hpp: { title: 'HPP per Porsi', sub: 'Bahan + Tenaga Kerja + Overhead = HPP', icon: '', render: renderHPP },
  laporan: { title: 'Laporan', sub: 'Budget, Persediaan, Distribusi & Keuangan + Export CSV', icon: '', render: renderLaporan },
  siklus: { title: 'Siklus Menu', sub: 'Rencana menu berulang', icon: '', render: renderSiklus },
  karyawan: { title: 'Karyawan', sub: 'Data master karyawan', icon: '', render: renderKaryawan },
  absensi: { title: 'Absensi', sub: 'Kehadiran karyawan harian', icon: '', render: renderAbsensi },
  payroll: { title: 'Payroll', sub: 'Penggajian karyawan per periode', icon: '', render: renderPayroll },
};
