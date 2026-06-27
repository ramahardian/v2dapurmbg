const MODULES = {
  dashboard: { title: 'Dashboard', sub: 'Ringkasan operasional dapur', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>', render: renderDashboard },
  'penerima-manfaat': { title: 'Penerima Manfaat', sub: 'Master data kelompok penerima MBG', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    crud: { endpoint: '/penerima_manfaat', fields: [
      { k: 'nama_kelompok', l: 'Nama Kelompok', req: true },
      { k: 'paket_besar', l: 'Paket Besar', type: 'number', fmt: 'num' },
      { k: 'paket_kecil', l: 'Paket Kecil', type: 'number', fmt: 'num' },
      { k: 'lokasi', l: 'Lokasi' },
      { k: 'keterangan', l: 'Keterangan', type: 'textarea' },
    ], cols: ['nama_kelompok','paket_besar','paket_kecil','lokasi'] }
  },
  'bahan-baku': { title: 'Bahan Baku', sub: 'Master bahan baku, harga, & nutrisi', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>', render: renderBahanBaku },

  menu: { title: 'Menu & Gizi', sub: 'Resep MBG, gramasi & kandungan gizi', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>', render: renderMenu },
  gudang: { title: 'Gudang & Persediaan', sub: 'Stok, barang masuk, & barang keluar', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><path d="M12 6v12"/></svg>', render: renderGudang },
  produksi: { title: 'Produksi Dapur', sub: 'Catatan produksi harian', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    crud: { endpoint: '/produksi', fields: [
      { k: 'tanggal_produksi', l: 'Tanggal', type: 'date', req: true },
      { k: 'menu_nama', l: 'Nama Menu', type: 'select-api', source: '/menu?limit=500', valueField: 'nama', labelField: 'nama', req: true,
        fill: { kategori_penerima: 'kategori_penerima', menu_id: 'id' },
        fillApi: { url: '/penerima_manfaat/total', param: 'kategori_penerima', target: 'jumlah_porsi' } },
      { k: 'menu_id', l: '', type: 'hidden' },
      { k: 'kategori_penerima', l: 'Kategori Penerima' },
      { k: 'jumlah_porsi', l: 'Jumlah Porsi', type: 'number', fmt: 'num', req: true },
      { k: 'status', l: 'Status', type: 'select', opts: ['Direncanakan','Diproduksi','Packing','Selesai'] },
      { k: 'catatan', l: 'Catatan', type: 'textarea' },
    ], cols: ['tanggal_produksi','menu_nama','kategori_penerima','jumlah_porsi','status'] }
  },
  distribusi: { title: 'Distribusi', sub: 'Pengiriman porsi ke titik penerima', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    crud: { endpoint: '/distribusi', fields: [
      { k: 'tanggal_distribusi', l: 'Tanggal', type: 'date', req: true },
      { k: 'titik_distribusi', l: 'Titik Distribusi', req: true },
      { k: 'kategori_penerima', l: 'Kategori' },
      { k: 'jumlah_porsi', l: 'Jumlah Porsi', type: 'number', fmt: 'num' },
      { k: 'kurir', l: 'Kurir / Driver', type: 'select-api', source: '/karyawan?status=Aktif&jabatan=Driver', valueField: 'nama', labelField: 'nama' },
      { k: 'status', l: 'Status', type: 'select', opts: ['Dalam Perjalanan','Diterima','Gagal'] },
      { k: 'catatan', l: 'Catatan', type: 'textarea' },
    ], cols: ['tanggal_distribusi','titik_distribusi','kategori_penerima','jumlah_porsi','status'] }
  },
  supplier: { title: 'Supplier', sub: 'Daftar pemasok bahan baku', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/></svg>',
    crud: { endpoint: '/supplier', fields: [
      { k: 'nama', l: 'Nama Supplier', req: true },
      { k: 'kategori_supply', l: 'Kategori Supply' },
      { k: 'kontak_person', l: 'Kontak Person' },
      { k: 'telepon', l: 'Telepon' }, { k: 'email', l: 'Email' },
      { k: 'alamat', l: 'Alamat', type: 'textarea' }, { k: 'npwp', l: 'NPWP' },
    ], cols: ['nama','kategori_supply','kontak_person','telepon'] }
  },
  pembelian: { title: 'Pembelian — PR & PO', sub: 'Purchase Request → Purchase Order → Invoice', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>', render: renderPembelian },
  penerimaan: { title: 'Penerimaan Barang', sub: 'Barang masuk dari supplier', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
    crud: { endpoint: '/penerimaan_barang', fields: [
      { k: 'no_dokumen', l: 'No Dokumen', req: true }, { k: 'tanggal_terima', l: 'Tanggal Terima', type: 'date', req: true },
      { k: 'supplier_nama', l: 'Supplier' }, { k: 'ref_po', l: 'Ref PO' },
      { k: 'item', l: 'Detail Barang', type: 'textarea' },
      { k: 'total_nilai', l: 'Total Nilai (IDR)', type: 'number', fmt: 'idr' },
      { k: 'status_qc', l: 'Status QC', type: 'select', opts: ['Lolos','Retur Sebagian','Ditolak'] },
    ], cols: ['no_dokumen','tanggal_terima','supplier_nama','ref_po','total_nilai','status_qc'] }
  },
  budgeting: { title: 'Budgeting', sub: 'Anggaran per periode & kategori', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
    crud: { endpoint: '/budget', fields: [
      { k: 'periode', l: 'Periode', req: true }, { k: 'kategori_penerima', l: 'Kategori' },
      { k: 'jumlah_penerima', l: 'Jumlah Penerima', type: 'number', fmt: 'num' },
      { k: 'harga_per_porsi', l: 'Harga per Porsi (IDR)', type: 'number', fmt: 'idr' },
      { k: 'biaya_operasional', l: 'Biaya Operasional (IDR)', type: 'number', fmt: 'idr' },
      { k: 'total_budget', l: 'Total Budget (IDR)', type: 'number', fmt: 'idr', req: true },
      { k: 'realisasi', l: 'Realisasi (IDR)', type: 'number', fmt: 'idr' },
    ], cols: ['periode','kategori_penerima','jumlah_penerima','harga_per_porsi','total_budget','realisasi'] }
  },
  'kas-bank': { title: 'Kas & Bank', sub: 'Penerimaan dana, pembayaran supplier & biaya operasional', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    crud: { endpoint: '/kas_bank', fields: [
      { k: 'tanggal', l: 'Tanggal', type: 'date', req: true },
      { k: 'no_transaksi', l: 'No Transaksi' },
      { k: 'tipe', l: 'Tipe', type: 'select', opts: ['masuk','keluar'], req: true },
      { k: 'kategori', l: 'Kategori', type: 'select', opts: ['Penerimaan Dana','Pembayaran Supplier','Biaya Operasional','Gaji','Lainnya'] },
      { k: 'akun', l: 'Akun (Kas/Bank)' }, { k: 'deskripsi', l: 'Deskripsi', type: 'textarea' },
      { k: 'jumlah', l: 'Jumlah (IDR)', type: 'number', fmt: 'idr', req: true },
    ], cols: ['tanggal','no_transaksi','tipe','kategori','akun','jumlah'] }
  },
  hpp: { title: 'HPP per Porsi', sub: 'Bahan + Tenaga Kerja + Overhead = HPP', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="8" y1="18" x2="8" y2="18.01"/><line x1="12" y1="18" x2="12" y2="18.01"/><line x1="16" y1="18" x2="16" y2="18.01"/></svg>', render: renderHPP },
  laporan: { title: 'Laporan', sub: 'Budget, Persediaan, Distribusi & Keuangan + Export CSV', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>', render: renderLaporan },
  siklus: { title: 'Siklus Menu', sub: 'Rencana menu berulang — untuk ahli gizi', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', render: renderSiklus },
  'panduan-ahli-gizi': { title: 'Panduan Ahli Gizi', sub: 'Alur kerja dari SP hingga kebutuhan bahan', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', render: renderPanduanAhliGizi },
  akun: { title: 'Akun Saya', sub: 'Kelola profil & kata sandi', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>', render: renderAkun },
  'kelola-user': { title: 'Kelola User', sub: 'Atur akun pengguna', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', render: renderKelolaUser },
  karyawan: { title: 'Karyawan', sub: 'Data master karyawan', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', render: renderKaryawan },
  absensi: { title: 'Absensi', sub: 'Kehadiran karyawan harian', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', render: renderAbsensi },
  payroll: { title: 'Payroll', sub: 'Penggajian karyawan per periode', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>', render: renderPayroll },
  shift: { title: 'Jadwal Shift', sub: 'Atur shift & jadwal kerja per divisi', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="16" r="2"/><path d="M12 14v2l1 1"/></svg>', render: renderShift },
  divisi: { title: 'Divisi', sub: 'Master data divisi/departemen', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    crud: { endpoint: '/jabatan', fields: [
      { k: 'name', l: 'Nama Divisi', req: true },
      { k: 'description', l: 'Deskripsi', type: 'textarea' },
      { k: 'shift_id', l: 'Shift ID', type: 'number' },
    ], cols: ['name', 'description'] }
  },
  'standar-sp': { title: 'Standar SP', sub: 'Standar Satuan Penukar per jenjang', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/></svg>', render: renderStandarSp },
};

const NAV_GROUPS = [
  { items: ['dashboard'] },
  { label: 'Operasional', items: ['penerima-manfaat', 'bahan-baku', 'gudang', 'produksi', 'distribusi'] },
  { label: 'Pembelian', items: ['supplier', 'pembelian', 'penerimaan'] },
  { label: 'Akuntansi', items: ['budgeting', 'kas-bank', 'laporan'] },
  { label: 'SDM', items: ['karyawan', 'absensi', 'payroll', 'shift', 'divisi'] },
  { label: 'Ahli Gizi', items: ['menu', 'hpp', 'siklus', 'standar-sp', 'panduan-ahli-gizi'] },
  { label: 'Pengaturan', items: ['kelola-user'] },
];

