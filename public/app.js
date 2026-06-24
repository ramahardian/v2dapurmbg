// MBG Kitchen — Frontend SPA (vanilla JS)
const fmtIDR = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const fmtNum = (n) => Number(n || 0).toLocaleString('id-ID');
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const api = {
  async get(path) {
    const r = await fetch('/api' + path, { credentials: 'include' });
    if (!r.ok) {
      let msg = r.status + ' ' + r.statusText;
      try { const e = await r.json(); msg = e.error || msg; } catch {}
      throw new Error(msg);
    }
    return r.json();
  },
  async post(path, body) {
    const r = await fetch('/api' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' });
    if (!r.ok) {
      let msg = r.status + ' ' + r.statusText;
      try { const e = await r.json(); msg = e.error || msg; } catch {}
      throw new Error(msg);
    }
    return r.json();
  },
  async put(path, body) {
    const r = await fetch('/api' + path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' });
    if (!r.ok) {
      let msg = r.status + ' ' + r.statusText;
      try { const e = await r.json(); msg = e.error || msg; } catch {}
      throw new Error(msg);
    }
    return r.json();
  },
  async del(path) {
    const r = await fetch('/api' + path, { method: 'DELETE', credentials: 'include' });
    if (!r.ok) {
      let msg = r.status + ' ' + r.statusText;
      try { const e = await r.json(); msg = e.error || msg; } catch {}
      throw new Error(msg);
    }
    return r;
  },
};

// Editor
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  const open = sb.classList.contains('translate-x-0');
  if (open) {
    sb.classList.remove('translate-x-0');
    sb.classList.add('-translate-x-full');
    ov.classList.add('hidden');
  } else {
    sb.classList.remove('-translate-x-full');
    sb.classList.add('translate-x-0');
    ov.classList.remove('hidden');
  }
}
function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  sb.classList.remove('translate-x-0');
  sb.classList.add('-translate-x-full');
  ov.classList.add('hidden');
}

// ===== Modules definition =====
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
  'bahan-baku': { title: 'Bahan Baku', sub: 'Master bahan baku & harga satuan', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><polyline points="11 12 8 17 3 17 3 14 6 9 10 9"/><path d="M15.27 14.55 21 19.8"/><path d="m21 19.8-5.73-3.25"/><path d="M3 17V9l6-3.5"/></svg>',
    crud: { endpoint: '/bahan_baku', fields: [
      { k: 'kode', l: 'Kode SKU' }, { k: 'nama', l: 'Nama Bahan', req: true },
      { k: 'kategori', l: 'Kategori', type: 'select', opts: ['Karbohidrat','Protein Hewani','Protein Nabati','Sayur','Buah','Bumbu','Lainnya'] },
      { k: 'satuan', l: 'Satuan (kg/gr/liter)', req: true },
      { k: 'harga_satuan', l: 'Harga Satuan (IDR)', type: 'number', fmt: 'idr' },
      { k: 'stok_saat_ini', l: 'Stok Saat Ini', type: 'number', fmt: 'num' },
      { k: 'stok_minimum', l: 'Stok Minimum', type: 'number', fmt: 'num' },
    ], cols: ['kode','nama','kategori','satuan','harga_satuan','stok_saat_ini','stok_minimum'] }
  },
  menu: { title: 'Menu & Gizi', sub: 'Resep MBG, gramasi & kandungan gizi', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>', render: renderMenu },
  gudang: { title: 'Gudang & Persediaan', sub: 'Stok, barang masuk, & barang keluar', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><path d="M12 6v12"/></svg>', render: renderGudang },
  produksi: { title: 'Produksi Dapur', sub: 'Catatan produksi harian', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    crud: { endpoint: '/produksi', fields: [
      { k: 'tanggal_produksi', l: 'Tanggal', type: 'date', req: true },
      { k: 'menu_nama', l: 'Nama Menu', req: true },
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
      { k: 'kurir', l: 'Kurir / Driver' },
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
  pembelian: { title: 'Pembelian — PR & PO', sub: 'Purchase Request → Purchase Order → Invoice', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
    crud: { endpoint: '/purchase_order', fields: [
      { k: 'no_po', l: 'Nomor PO', req: true }, { k: 'tanggal', l: 'Tanggal', type: 'date', req: true },
      { k: 'supplier_nama', l: 'Supplier' },
      { k: 'item', l: 'Daftar Item', type: 'textarea' },
      { k: 'total_nilai', l: 'Total Nilai (IDR)', type: 'number', fmt: 'idr' },
      { k: 'status', l: 'Status', type: 'select', opts: ['Draft','Disetujui','Dikirim','Diterima','Dibayar'] },
      { k: 'catatan', l: 'Catatan', type: 'textarea' },
    ], cols: ['no_po','tanggal','supplier_nama','total_nilai','status'] }
  },
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
  karyawan: { title: 'Karyawan', sub: 'Data master karyawan', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', render: renderKaryawan },
  absensi: { title: 'Absensi', sub: 'Kehadiran karyawan harian', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', render: renderAbsensi },
  payroll: { title: 'Payroll', sub: 'Penggajian karyawan per periode', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>', render: renderPayroll },
};

const NAV_GROUPS = [
  { items: ['dashboard'] },
  { label: 'Operasional', items: ['penerima-manfaat', 'menu', 'bahan-baku', 'gudang', 'produksi', 'distribusi'] },
  { label: 'Pembelian', items: ['supplier', 'pembelian', 'penerimaan'] },
  { label: 'Akuntansi', items: ['budgeting', 'kas-bank', 'laporan'] },
  { label: 'SDM', items: ['karyawan', 'absensi', 'payroll'] },
  { label: 'Ahli Gizi', items: ['hpp', 'siklus'] },
];

// ===== Init =====
let currentUser = null;
let currentTenant = null;

async function init() {
  try {
    const me = await api.get('/auth/me');
    currentUser = me.user; currentTenant = me.tenant;
    document.getElementById('user-name').textContent = currentUser.nama;
    document.getElementById('user-role').textContent = currentUser.role.replace('_', ' ');
    renderNav(); route();
    window.addEventListener('hashchange', route);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });
    document.getElementById('logout-btn').onclick = async () => { await api.post('/auth/logout', {}); location.href = '/login'; };
  } catch { location.href = '/login'; }
}

function renderNav() {
  const nav = document.getElementById('nav');
  const userRole = currentUser?.role || '';
  const isAdminOrKeuangan = userRole === 'admin' || userRole === 'keuangan';
  const isAdminOrGudang = userRole === 'admin' || userRole === 'gudang';
  const isAdminOrAhliGizi = userRole === 'admin' || userRole === 'ahli_gizi';

  nav.innerHTML = NAV_GROUPS.map(g => {
    const visibleItems = g.items.filter(key => {
      if (key === 'hpp' || key === 'siklus') return isAdminOrAhliGizi;
      if (key === 'gudang') return isAdminOrGudang;
      if (key === 'penerima-manfaat') return isAdminOrKeuangan;
      if (key === 'karyawan' || key === 'absensi' || key === 'payroll') return isAdminOrKeuangan;
      return true;
    });

    if (visibleItems.length === 0) return '';

    return (g.label ? `<div class="px-3 pt-4 pb-1.5 text-[10px] uppercase tracking-wider text-white/40 font-semibold">${g.label}</div>` : '') +
    visibleItems.map(key => {
      const m = MODULES[key];
      return `<a href="#${key}" data-key="${key}" class="sidebar-link" onclick="closeSidebar()"><span class="text-base w-5 text-center">${m.icon}</span><span>${m.title}</span></a>`;
    }).join('');
  }).join('');
}

function route() {
  const key = (location.hash || '#dashboard').slice(1);
  const m = MODULES[key] || MODULES.dashboard;
  
  const userRole = currentUser?.role || '';
  const isAdminOrKeuangan = userRole === 'admin' || userRole === 'keuangan';
  const isAdminOrGudang = userRole === 'admin' || userRole === 'gudang';
  const isAdminOrAhliGizi = userRole === 'admin' || userRole === 'ahli_gizi';
  
  if ((key === 'hpp' || key === 'siklus') && !isAdminOrAhliGizi) {
    alert('Akses ditolak'); location.hash = '#dashboard'; return;
  }
  if ((key === 'gudang' || key === 'penerima-manfaat') && !isAdminOrKeuangan && !isAdminOrGudang) {
    alert('Akses ditolak: Anda tidak memiliki izin.'); location.hash = '#dashboard'; return;
  }
  if ((key === 'karyawan' || key === 'absensi' || key === 'payroll') && !isAdminOrKeuangan) {
    alert('Akses ditolak: Anda tidak memiliki izin.'); location.hash = '#dashboard'; return;
  }
  
  document.querySelectorAll('.sidebar-link').forEach(a => a.classList.toggle('active', a.dataset.key === key));
  document.getElementById('page-title').textContent = m.title;
  document.getElementById('page-sub').textContent = m.sub;
  if (m.render) m.render();
  else if (m.crud) renderCrud(m.crud);
}

// ===== Dashboard =====
async function renderDashboard() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="text-stone-400">Memuat...</div>';
  try {
    const r = await fetch('/api/template/dashboard', { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Gagal memuat dashboard');
    }
    c.innerHTML = await r.text();
  } catch (err) {
    console.error('Dashboard error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat dashboard: ${err.message}</div>`;
  }
}

// ===== Generic CRUD =====
async function renderCrud(cfg) {
  const c = document.getElementById('content');
  c.innerHTML = `<div class="flex flex-wrap justify-end mb-4"><button id="add-btn" class="bg-[#1e40af] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-md text-sm font-medium">+ Tambah</button></div>
    <div id="table-wrap" class="bg-white border border-stone-200 rounded-lg overflow-hidden"></div>`;
  document.getElementById('add-btn').onclick = () => openForm(cfg, null);
  await reloadCrud(cfg);
}

async function reloadCrud(cfg) {
  const rows = await api.get(cfg.endpoint);
  const w = document.getElementById('table-wrap');
  if (!rows.length) { w.innerHTML = '<div class="p-12 text-center text-stone-400">Belum ada data. Klik "Tambah" untuk mulai.</div>'; return; }
  const headers = cfg.cols.map(k => `<th class="text-left px-4 py-3 text-xs font-semibold text-stone-600 uppercase">${cfg.fields.find(f => f.k === k)?.l || k}</th>`).join('');
  const body = rows.map(r => `<tr class="border-t border-stone-100">
    ${cfg.cols.map(k => {
      const f = cfg.fields.find(x => x.k === k);
      const v = r[k];
      let cell = v == null || v === '' ? '-' : v;
      if (f?.fmt === 'idr') cell = `<span class="mono">${fmtIDR(v)}</span>`;
      else if (f?.fmt === 'num') cell = `<span class="mono">${fmtNum(v)}</span>`;
      else if (f?.type === 'date') cell = fmtDate(v);
      return `<td class="px-4 py-3 text-sm">${cell}</td>`;
    }).join('')}
    <td class="px-4 py-3 text-right">
      <button onclick='editRow(${JSON.stringify(cfg).replace(/'/g, "\\'")}, ${JSON.stringify(r).replace(/'/g, "\\'")})' class="text-stone-500 hover:text-stone-900 text-sm mr-2">Edit</button>
      <button onclick='deleteRow("${cfg.endpoint}", ${r.id}, ${JSON.stringify(cfg).replace(/'/g, "\\'")})' class="text-red-600 hover:text-red-800 text-sm">Hapus</button>
    </td></tr>`).join('');
  w.innerHTML = `<div class="overflow-x-auto"><table class="w-full"><thead class="bg-stone-50"><tr>${headers}<th class="px-4 py-3 text-right text-xs font-semibold text-stone-600 uppercase">Aksi</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function editRow(cfg, row) { openForm(cfg, row); }
async function deleteRow(endpoint, id, cfg) {
  if (!confirm('Hapus data ini?')) return;
  await api.del(endpoint + '/' + id); reloadCrud(cfg);
}

function openForm(cfg, editing) {
  const title = (editing ? 'Edit ' : 'Tambah ') + MODULES[location.hash.slice(1)].title;
  document.getElementById('modal-title').textContent = title;
  const body = document.getElementById('modal-body');
  body.innerHTML = cfg.fields.map(f => `
    <div class="mb-3"><label class="text-sm text-stone-700">${f.l}${f.req ? ' *' : ''}</label>
    ${f.type === 'select' ? `<select id="f-${f.k}" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md">
      <option value="">— Pilih —</option>${f.opts.map(o => `<option value="${o}" ${editing?.[f.k] === o ? 'selected' : ''}>${o}</option>`).join('')}
    </select>`
    : f.type === 'textarea' ? `<textarea id="f-${f.k}" rows="2" class="mt-1 w-full px-3 py-2 border border-stone-200 rounded-md">${editing?.[f.k] || ''}</textarea>`
    : `<input id="f-${f.k}" type="${f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}" value="${editing?.[f.k] != null ? (f.type === 'date' ? String(editing[f.k]).slice(0,10) : editing[f.k]) : ''}" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md ${f.type === 'number' ? 'mono' : ''}" />`}
    </div>`).join('');
  document.getElementById('modal-save').onclick = async () => {
    const payload = {};
    cfg.fields.forEach(f => { const v = document.getElementById('f-' + f.k).value; payload[f.k] = f.type === 'number' ? Number(v) || 0 : v; });
    if (editing) await api.put(cfg.endpoint + '/' + editing.id, payload);
    else await api.post(cfg.endpoint, payload);
    closeModal(); reloadCrud(cfg);
  };
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}
function closeModal(id) {
  const m = document.getElementById(id || 'modal');
  if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
}

// ===== Menu (custom with bahan) =====
let menuState = { page: 1, limit: 10, search: '', total: 0, totalPages: 1 };

async function renderMenu() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="text-stone-400">Memuat...</div>';
  try {
    const params = new URLSearchParams({ page: menuState.page, limit: menuState.limit, search: menuState.search });
    const r = await fetch('/api/menu?' + params, { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal memuat menu');
    }
    const data = await r.json();
    const pagination = data.pagination || { total: data.length || 0, totalPages: 1 };
    menuState = { ...menuState, total: pagination.total, totalPages: pagination.totalPages, page: pagination.page || menuState.page };
    
    const bahan = await api.get('/bahan_baku');
    window._bahanBaku = bahan;
    
    c.innerHTML = renderMenuHtml(Array.isArray(data.data) ? data.data : data);
    renderPagination();
    attachMenuHandlers();
  } catch (err) {
    console.error('Menu error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat menu: ${err.message}</div>`;
  }
}

function renderMenuHtml(menus) {
  return `<div class="flex flex-wrap justify-between gap-2 mb-4">
    <button id="add-menu-btn" class="bg-[#1e40af] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-md text-sm font-medium">+ Tambah Menu</button>
    <div class="relative">
      <input type="text" id="search-menu-input" placeholder="Cari nama menu..." value="${menuState.search}"
        class="pl-10 pr-4 py-2 border border-stone-200 rounded-md text-sm w-48 focus:outline-none focus:border-[#1e40af]">
      <svg class="absolute left-3 top-2.5 w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
      </svg>
    </div>
  </div>
  <div id="pagination-controls" class="flex items-center gap-2 mt-4"></div>
  <div class="bg-white border border-stone-200 rounded-lg overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="bg-stone-50">
          <tr>
            <th class="text-left px-4 py-3 text-xs font-semibold uppercase">Nama</th>
            <th class="text-left px-4 py-3 text-xs font-semibold uppercase">Kategori</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase">Gramasi</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase">Kalori</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase">Bahan</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase">Aksi</th>
          </tr>
        </thead>
        <tbody id="menu-table-body">
          ${menus.length > 0 ? menus.map(m => `
            <tr class="border-t border-stone-100">
              <td class="px-4 py-3 text-sm font-medium whitespace-nowrap">${m.nama}</td>
              <td class="px-4 py-3 text-sm whitespace-nowrap">${m.kategori_penerima || '-'}</td>
              <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${m.gramasi_total}g</td>
              <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${m.kalori} kkal</td>
              <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${(m.bahan && m.bahan.length) || 0}</td>
              <td class="px-4 py-3 text-sm text-right whitespace-nowrap">
                <button data-menu-id="${m.id}" class="edit-btn text-stone-500 hover:text-stone-900 mr-2">Edit</button>
                <button data-menu-id="${m.id}" class="delete-btn text-red-600">Hapus</button>
              </td>
            </tr>`).join('') : '<tr><td colspan="6" class="text-center py-12 text-stone-400">Belum ada menu</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>`;
}

function renderPagination() {
  const wrap = document.getElementById('pagination-controls');
  if (menuState.totalPages <= 1) { wrap.innerHTML = ''; return; }
  
  const pages = [];
  const maxPages = 5;
  let start = Math.max(1, menuState.page - Math.floor(maxPages/2));
  let end = Math.min(menuState.totalPages, start + maxPages - 1);
  if (end - start + 1 < maxPages) start = Math.max(1, end - maxPages + 1);
  
  for (let i = start; i <= end; i++) {
    pages.push(`<button onclick="goToPage(${i})" class="px-3 py-1 text-sm rounded border ${i === menuState.page ? 'bg-[#1e40af] text-white' : 'border-stone-200 hover:bg-stone-50'}">${i}</button>`);
  }
  
  wrap.innerHTML = `<span class="text-sm text-stone-500">Hal ${menuState.page} dari ${menuState.totalPages}</span>
    ${menuState.page > 1 ? '<button onclick="goToPage(1)" class="px-2 py-1 text-sm rounded border border-stone-200">≠|</button>' : ''}
    ${menuState.page > 1 ? '<button onclick="goToPage(' + (menuState.page - 1) + ')" class="px-2 py-1 text-sm rounded border border-stone-200">&laquo;</button>' : ''}
    ${pages.join('')}
    ${menuState.page < menuState.totalPages ? '<button onclick="goToPage(' + (menuState.page + 1) + ')" class="px-2 py-1 text-sm rounded border border-stone-200">&raquo;</button>' : ''}
    ${menuState.page < menuState.totalPages ? '<button onclick="goToPage(' + menuState.totalPages + ')" class="px-2 py-1 text-sm rounded border border-stone-200">>|</button>' : ''}`;
}

function goToPage(page) {
  menuState.page = page;
  renderMenu();
}

function attachMenuHandlers() {
  const addBtn = document.getElementById('add-menu-btn');
  if (addBtn) addBtn.onclick = () => openMenuForm(null);
  const searchInput = document.getElementById('search-menu-input');
  if (searchInput) {
    searchInput.oninput = function() {
      menuState.search = this.value;
      menuState.page = 1;
      renderMenu();
    };
  }
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const menuId = this.getAttribute('data-menu-id');
      fetch('/api/menu/' + menuId)
        .then(r => r.json())
        .then(menu => openMenuForm(menu));
    });
  });
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const menuId = this.getAttribute('data-menu-id');
      deleteMenu(menuId);
    });
  });
}

function openMenuForm(editing) {
  const m = editing || { nama: '', kategori_penerima: '', deskripsi: '', gramasi_total: 0, kalori: 0, protein: 0, karbohidrat: 0, lemak: 0, serat: 0, bahan: [] };
  document.getElementById('modal-title').textContent = editing ? 'Edit Menu' : 'Tambah Menu';
  document.getElementById('modal-body').innerHTML = `
    <div class="grid grid-cols-2 gap-3">
      <div><label class="text-sm">Nama Menu *</label><input id="m-nama" value="${m.nama}" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md" /></div>
      <div><label class="text-sm">Kategori Penerima</label>
        <select id="m-kategori" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md">
          <option value="">—</option>${['Ibu Hamil','Ibu Menyusui','Balita','PAUD','TK','SD','SMP'].map(o => `<option value="${o}" ${m.kategori_penerima === o ? 'selected':''}>${o}</option>`).join('')}
        </select></div>
    </div>
    <div class="mt-3"><label class="text-sm">Deskripsi</label><textarea id="m-deskripsi" rows="2" class="mt-1 w-full px-3 py-2 border border-stone-200 rounded-md">${m.deskripsi || ''}</textarea></div>
    <div class="grid grid-cols-5 gap-2 mt-3">
      ${[['gramasi_total','Gramasi'],['kalori','Kalori'],['protein','Protein'],['karbohidrat','Karbo'],['lemak','Lemak']].map(([k,l]) =>
        `<div><label class="text-xs">${l}</label><input id="m-${k}" type="number" value="${m[k] || 0}" class="mt-1 w-full h-9 px-2 border border-stone-200 rounded-md mono text-sm" /></div>`).join('')}
    </div>
    <div class="border-t border-stone-200 mt-4 pt-3">
      <div class="flex justify-between items-center mb-2">
        <div class="font-semibold text-sm">Bahan & Gramasi</div>
        <button type="button" onclick="addBahanRow()" class="text-xs border border-stone-300 px-3 py-1 rounded">+ Tambah Bahan</button>
      </div>
      <div id="bahan-list" class="space-y-2"></div>
    </div>`;
  window._menuBahan = (m.bahan || []).map(b => ({ bahan_baku_id: b.bahan_baku_id, jumlah: b.jumlah }));
  renderBahanList();
  document.getElementById('modal-save').onclick = async () => {
    const payload = {
      nama: document.getElementById('m-nama').value,
      kategori_penerima: document.getElementById('m-kategori').value,
      deskripsi: document.getElementById('m-deskripsi').value,
      gramasi_total: +document.getElementById('m-gramasi_total').value || 0,
      kalori: +document.getElementById('m-kalori').value || 0,
      protein: +document.getElementById('m-protein').value || 0,
      karbohidrat: +document.getElementById('m-karbohidrat').value || 0,
      lemak: +document.getElementById('m-lemak').value || 0,
      bahan: window._menuBahan.filter(b => b.bahan_baku_id && b.jumlah),
    };
    if (editing) await api.put('/menu/' + editing.id, payload);
    else await api.post('/menu', payload);
    closeModal(); renderMenu();
  };
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}
function addBahanRow() { window._menuBahan.push({ bahan_baku_id: '', jumlah: 0 }); renderBahanList(); }
function removeBahanRow(i) { window._menuBahan.splice(i, 1); renderBahanList(); }
function updateBahan(i, k, v) { window._menuBahan[i][k] = k === 'jumlah' ? +v : v; }
function renderBahanList() {
  document.getElementById('bahan-list').innerHTML = window._menuBahan.map((b, i) => `
    <div class="grid grid-cols-12 gap-2 items-center">
      <select onchange="updateBahan(${i}, 'bahan_baku_id', this.value)" class="col-span-7 h-9 px-2 border border-stone-200 rounded-md text-sm">
        <option value="">— Pilih bahan —</option>
        ${window._bahanBaku.map(bb => `<option value="${bb.id}" ${b.bahan_baku_id == bb.id ? 'selected' : ''}>${bb.nama} (${bb.satuan})</option>`).join('')}
      </select>
      <input type="number" value="${b.jumlah}" onchange="updateBahan(${i}, 'jumlah', this.value)" placeholder="Jumlah" class="col-span-4 h-9 px-2 border border-stone-200 rounded-md text-sm mono" />
      <button type="button" onclick="removeBahanRow(${i})" class="col-span-1 text-red-600">×</button>
    </div>`).join('');
}
async function deleteMenu(id) { if (!confirm('Hapus menu?')) return; await api.del('/menu/' + id); renderMenu(); }

function openAIDialog() {
  document.getElementById('modal-title').textContent = '✨ Saran Menu AI';
  document.getElementById('modal-body').innerHTML = `
    <div><label class="text-sm">Kategori Penerima</label>
      <select id="ai-kat" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md">
        ${['Ibu Hamil','Ibu Menyusui','Balita','PAUD','TK','SD','SMP'].map(o => `<option>${o}</option>`).join('')}
      </select></div>
    <div class="mt-3"><label class="text-sm">Catatan (opsional)</label>
      <textarea id="ai-note" rows="2" class="mt-1 w-full px-3 py-2 border border-stone-200 rounded-md" placeholder="Mis. hindari kacang, bahan lokal Jawa Tengah"></textarea></div>
    <button onclick="runAI()" class="mt-3 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md text-sm font-medium">Buat Saran</button>
    <div id="ai-out" class="mt-4"></div>`;
  document.getElementById('modal-save').style.display = 'none';
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}
async function runAI() {
  document.getElementById('ai-out').innerHTML = '<div class="text-stone-500 text-sm">⏳ Membuat saran...</div>';
  const r = await fetch('/api/ai/suggest-menu', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ kategori: document.getElementById('ai-kat').value, catatan: document.getElementById('ai-note').value }) });
  const data = await r.json();
  if (!r.ok) { document.getElementById('ai-out').innerHTML = `<div class="text-red-700 text-sm">${data.error}</div>`; return; }
  const s = data.suggestion;
  document.getElementById('ai-out').innerHTML = `
    <div class="bg-orange-50 border border-orange-200 rounded p-3">
      <div class="font-bold">${s.nama_menu}</div>
      <div class="text-sm text-stone-700 mt-1">${s.deskripsi || ''}</div>
      ${s.kandungan_gizi ? `<div class="grid grid-cols-5 gap-2 my-2 text-xs">${Object.entries(s.kandungan_gizi).map(([k,v]) => `<div class="bg-white p-2 rounded"><div class="text-stone-500 uppercase">${k}</div><div class="mono">${v}</div></div>`).join('')}</div>` : ''}
      ${s.bahan ? `<div class="text-xs mt-2"><div class="font-semibold mb-1">Bahan:</div><ul class="space-y-0.5">${s.bahan.map(b => `<li>• ${b.nama} — <span class="mono">${b.jumlah} ${b.satuan}</span></li>`).join('')}</ul></div>` : ''}
    </div>`;
}

// ===== Gudang =====
window.addEventListener('unhandledrejection', e => {
  console.error('[UNHANDLED]', e.reason);
});

async function renderGudang() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="text-stone-400">Memuat...</div>';
  try {
    const r = await fetch('/api/template/gudang', { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json();
      console.error('Gudang template fetch error:', r.status, err);
      throw new Error(err.error || 'Gagal memuat gudang');
    }
    c.innerHTML = await r.text();
    
    // Re-attach event handlers and load data
    console.log('Loading gudang data...');
    try {
      const bahan = await api.get('/bahan_baku');
      console.log('Bahan loaded:', bahan.length);
      const masuk = await api.get('/stok_masuk');
      console.log('Masuk loaded:', masuk.length);
      const keluar = await api.get('/stok_keluar');
      console.log('Keluar loaded:', keluar.length);
      window._gudang = { bahan, masuk, keluar };
      showGudang('stok');
    } catch (dataErr) {
      console.error('Gudang data fetch error:', dataErr);
      throw dataErr;
    }
  } catch (err) {
    console.error('Gudang error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat gudang: ${err.message}</div>`;
  }
}
function showGudang(tab) {
  ['stok','masuk','keluar'].forEach(t => {
    const el = document.getElementById('tab-'+t);
    el.className = 'px-4 py-2 text-sm font-medium border-b-2 ' + (t === tab ? 'border-[#1e40af]' : 'border-transparent text-stone-500');
  });
  const d = window._gudang;
  const wrap = document.getElementById('gudang-content');
  if (tab === 'stok') {
    wrap.innerHTML = `<div class="bg-white border border-stone-200 rounded-lg overflow-hidden"><div class="overflow-x-auto"><table class="w-full">
      <thead class="bg-stone-50"><tr>
        <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Nama</th>
        <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Kategori</th>
        <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Stok</th>
        <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Satuan</th>
        <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Min</th>
        <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Status</th>
      </tr></thead><tbody>
      ${d.bahan.map(b => {
        const low = Number(b.stok_saat_ini) < Number(b.stok_minimum);
        return `<tr class="border-t border-stone-100">
          <td class="px-4 py-3 text-sm font-medium whitespace-nowrap">${b.nama}</td>
          <td class="px-4 py-3 text-sm whitespace-nowrap">${b.kategori || '-'}</td>
          <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap ${low ? 'text-red-700' : ''}">${b.stok_saat_ini}</td>
          <td class="px-4 py-3 text-sm whitespace-nowrap">${b.satuan}</td>
          <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${b.stok_minimum}</td>
          <td class="px-4 py-3 text-sm whitespace-nowrap">${low ? '<span class="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">Menipis</span>' : '<span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">Aman</span>'}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6" class="text-center py-12 text-stone-400">Belum ada bahan</td></tr>'}
      </tbody></table></div></div>`;
  } else {
    const rows = d[tab];
    const labelKey = tab === 'masuk' ? 'sumber' : 'tujuan';
    wrap.innerHTML = `<div class="bg-white border border-stone-200 rounded-lg overflow-hidden"><div class="overflow-x-auto"><table class="w-full">
      <thead class="bg-stone-50"><tr>
        <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Tanggal</th>
        <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Bahan</th>
        <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Jumlah</th>
        <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">${tab === 'masuk' ? 'Sumber' : 'Tujuan'}</th>
        <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Catatan</th>
      </tr></thead><tbody>${rows.map(r => `<tr class="border-t border-stone-100">
        <td class="px-4 py-3 text-sm whitespace-nowrap">${fmtDate(r.tanggal)}</td>
        <td class="px-4 py-3 text-sm whitespace-nowrap">${r.nama_bahan}</td>
        <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${r.jumlah} ${r.satuan}</td>
        <td class="px-4 py-3 text-sm whitespace-nowrap">${r[labelKey] || '-'}</td>
        <td class="px-4 py-3 text-sm whitespace-nowrap">${r.catatan || '-'}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="text-center py-12 text-stone-400">Belum ada riwayat</td></tr>'}
      </tbody></table></div></div>`;
  }
}
function openStokForm(tipe) {
  document.getElementById('modal-title').textContent = tipe === 'masuk' ? 'Barang Masuk' : 'Barang Keluar (Produksi)';
  document.getElementById('modal-save').style.display = '';
  const bahanList = window._gudang?.bahan || [];
  document.getElementById('modal-body').innerHTML = `
    <div class="mb-3"><label class="text-sm">Tanggal</label>
      <input id="s-tanggal" type="date" value="${new Date().toISOString().slice(0,10)}" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md" /></div>
    <div class="mb-3"><label class="text-sm">Bahan Baku</label>
      <select id="s-bahan" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md">
        <option value="">— Pilih —</option>
        ${bahanList.map(b => `<option value="${b.id}">${b.nama} (stok: ${b.stok_saat_ini} ${b.satuan})</option>`).join('')}
      </select></div>
    <div class="mb-3"><label class="text-sm">Jumlah</label>
      <input id="s-jumlah" type="number" step="0.001" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md mono" /></div>
    <div class="mb-3"><label class="text-sm">${tipe === 'masuk' ? 'Sumber / Supplier' : 'Tujuan (Produksi)'}</label>
      <input id="s-sumber" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md" /></div>
    <div class="mb-3"><label class="text-sm">Catatan</label>
      <input id="s-catatan" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md" /></div>`;
  document.getElementById('modal-save').onclick = async () => {
    try {
      const payload = {
        tanggal: document.getElementById('s-tanggal').value,
        bahan_baku_id: +document.getElementById('s-bahan').value,
        jumlah: +document.getElementById('s-jumlah').value,
        catatan: document.getElementById('s-catatan').value,
      };
      payload[tipe === 'masuk' ? 'sumber' : 'tujuan'] = document.getElementById('s-sumber').value;
      await api.post('/stok_' + tipe, payload);
      closeModal(); renderGudang();
    } catch (e) {
      console.error('Gudang submit error:', e);
      alert('Gagal: ' + (e.message || 'Unknown error'));
    }
  };
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}

// ===== HPP =====
async function renderHPP() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="text-stone-400">Memuat...</div>';
  try {
    const r = await fetch('/api/template/hpp', { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Gagal memuat HPP');
    }
    c.innerHTML = await r.text();
  } catch (err) {
    console.error('HPP error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat HPP: ${err.message}</div>`;
  }
}
async function calcHPP() {
  const menu_id = +document.getElementById('hpp-menu').value;
  if (!menu_id) return alert('Pilih menu dulu');
  const data = await api.post('/hpp/calculate', {
    menu_id, jumlah_porsi: +document.getElementById('hpp-porsi').value,
    biaya_tenaga_kerja: +document.getElementById('hpp-tk').value, biaya_overhead: +document.getElementById('hpp-oh').value,
  });
  document.getElementById('hpp-result').innerHTML = `
    <div class="bg-white border border-stone-200 rounded-lg p-6 mb-4">
      <div class="flex justify-between items-baseline mb-4">
        <div><div class="text-xs uppercase text-stone-500">HPP per Porsi</div>
          <div class="mono text-3xl font-bold text-[#1e40af] mt-1">${fmtIDR(data.hpp_per_porsi)}</div></div>
        <div class="text-right"><div class="text-xs text-stone-500">${data.menu_nama}</div><div class="text-sm">${data.jumlah_porsi} porsi</div></div>
      </div>
      <div class="grid grid-cols-3 gap-3 border-t border-stone-200 pt-3">
        <div><div class="text-xs text-stone-500">Bahan Baku</div><div class="mono font-semibold">${fmtIDR(data.total_biaya_bahan)}</div></div>
        <div><div class="text-xs text-stone-500">Tenaga Kerja</div><div class="mono font-semibold">${fmtIDR(data.biaya_tenaga_kerja)}</div></div>
        <div><div class="text-xs text-stone-500">Overhead</div><div class="mono font-semibold">${fmtIDR(data.biaya_overhead)}</div></div>
      </div>
      <div class="border-t border-stone-200 pt-3 mt-3 flex justify-between">
        <div class="text-sm text-stone-600">Total HPP</div><div class="mono font-bold">${fmtIDR(data.total_hpp)}</div>
      </div>
    </div>
    <div class="bg-white border border-stone-200 rounded-lg overflow-hidden">
      <div class="px-4 py-3 font-bold border-b border-stone-200">Rincian Bahan</div>
      <div class="overflow-x-auto"><table class="w-full"><thead class="bg-stone-50"><tr>
        <th class="text-left px-4 py-2 text-xs uppercase whitespace-nowrap">Bahan</th>
        <th class="text-right px-4 py-2 text-xs uppercase whitespace-nowrap">Jumlah</th>
        <th class="text-right px-4 py-2 text-xs uppercase whitespace-nowrap">Harga</th>
        <th class="text-right px-4 py-2 text-xs uppercase whitespace-nowrap">Subtotal</th>
      </tr></thead><tbody>${data.detail_bahan.map(d => `<tr class="border-t border-stone-100">
        <td class="px-4 py-2 text-sm whitespace-nowrap">${d.nama}</td>
        <td class="px-4 py-2 text-sm text-right mono whitespace-nowrap">${d.jumlah} ${d.satuan}</td>
        <td class="px-4 py-2 text-sm text-right mono whitespace-nowrap">${fmtIDR(d.harga_satuan)}</td>
        <td class="px-4 py-2 text-sm text-right mono whitespace-nowrap">${fmtIDR(d.subtotal)}</td>
      </tr>`).join('') || '<tr><td colspan="4" class="text-center py-6 text-stone-400">Menu belum punya bahan</td></tr>'}
      </tbody></table></div>
    </div>`;
}

// ===== Laporan =====
async function renderLaporan() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="text-stone-400">Memuat...</div>';
  try {
    const r = await fetch('/api/template/laporan', { credentials: 'include' });
    if (!r.ok) {
      let err;
      try { err = await r.json(); } catch { err = { error: r.status + ' ' + r.statusText }; }
      throw new Error(err.error || 'Gagal memuat laporan');
    }
    c.innerHTML = await r.text();
    showLap('budget');
  } catch (err) {
    console.error('Laporan error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat laporan: ${err.message}</div>`;
  }
}
async function showLap(tab) {
  ['budget','persediaan','distribusi','keuangan'].forEach(t => {
    document.getElementById('lt-'+t).className = 'px-4 py-2 text-sm font-medium border-b-2 ' + (t===tab?'border-[#1e40af]':'border-transparent text-stone-500');
  });
  const wrap = document.getElementById('lap-content');
  wrap.innerHTML = '<div class="text-stone-400">Memuat...</div>';
  try {
    if (tab === 'budget') {
      const rows = await api.get('/budget');
      wrap.innerHTML = exportBar('budget', rows, ['periode','kategori_penerima','jumlah_penerima','total_budget','realisasi']) + tableHtml(
        ['Periode','Kategori','Penerima','Budget','Realisasi','Selisih'],
        rows.map(b => [b.periode, b.kategori_penerima||'-', fmtNum(b.jumlah_penerima), fmtIDR(b.total_budget), fmtIDR(b.realisasi), fmtIDR(b.total_budget - b.realisasi)]));
    } else if (tab === 'persediaan') {
      const rows = await api.get('/bahan_baku');
      wrap.innerHTML = exportBar('persediaan', rows, ['nama','kategori','satuan','stok_saat_ini','stok_minimum','harga_satuan']) + tableHtml(
        ['Nama','Kategori','Stok','Satuan','Harga','Nilai'],
        rows.map(b => [b.nama, b.kategori||'-', fmtNum(b.stok_saat_ini), b.satuan, fmtIDR(b.harga_satuan), fmtIDR(b.stok_saat_ini * b.harga_satuan)]));
    } else if (tab === 'distribusi') {
      const rows = await api.get('/distribusi');
      wrap.innerHTML = exportBar('distribusi', rows, ['tanggal_distribusi','titik_distribusi','kategori_penerima','jumlah_porsi','status']) + tableHtml(
        ['Tanggal','Titik','Kategori','Porsi','Status'],
        rows.map(d => [fmtDate(d.tanggal_distribusi), d.titik_distribusi, d.kategori_penerima||'-', fmtNum(d.jumlah_porsi), d.status]));
    } else {
      const d = await api.get('/laporan/keuangan');
      wrap.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        ${statCard('Kas Masuk', fmtIDR(d.total_kas_masuk), '', 'bg-blue-50')}
        ${statCard('Kas Keluar', fmtIDR(d.total_kas_keluar), '', 'bg-orange-50')}
        ${statCard('Saldo', fmtIDR(d.saldo), '', 'bg-blue-50')}
      </div>` + exportBar('keuangan', d.transaksi || [], ['tanggal','tipe','kategori','deskripsi','jumlah']) + tableHtml(
        ['Tanggal','Tipe','Kategori','Deskripsi','Jumlah'],
        (d.transaksi || []).map(t => [fmtDate(t.tanggal), t.tipe, t.kategori||'-', t.deskripsi||'-', fmtIDR(t.jumlah)]));
    }
  } catch (err) {
    console.error('showLap error:', err);
    wrap.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat laporan: ${err.message}</div>`;
  }
}
function statCard(title, value, sub, bgClass) {
  return `<div class="bg-white border border-stone-200 rounded-lg p-5 ${bgClass ? 'rounded-xl border-0' : ''}">
    <div class="text-xs uppercase tracking-wider text-stone-500 font-medium">${title}</div>
    <div class="mono text-2xl mt-2 font-semibold">${value}</div>
    ${sub ? `<div class="text-xs text-stone-500 mt-1">${sub}</div>` : ''}
  </div>`;
}
function tableHtml(headers, rows) {
  return `<div class="bg-white border border-stone-200 rounded-lg overflow-hidden mt-3"><div class="overflow-x-auto"><table class="w-full">
    <thead class="bg-stone-50"><tr>${headers.map(h => `<th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map(r => `<tr class="border-t border-stone-100">${r.map(c => `<td class="px-4 py-3 text-sm whitespace-nowrap">${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="text-center py-12 text-stone-400">Belum ada data</td></tr>`}</tbody>
  </table></div></div>`;
}
function exportBar(name, data, fields) {
  window['_export_'+name] = { data, fields };
  return `<div class="flex flex-wrap gap-2 mb-2 mt-3">
    <button onclick="exportCSV('${name}')" class="border border-stone-300 px-3 py-1.5 rounded text-sm">⬇ CSV</button>
    <button onclick="window.print()" class="border border-stone-300 px-3 py-1.5 rounded text-sm">🖨️ Print/PDF</button>
  </div>`;
}
function exportCSV(name) {
  const { data, fields } = window['_export_'+name];
  if (!data.length) return alert('Tidak ada data');
  const csv = [fields.join(','), ...data.map(r => fields.map(f => `"${(r[f] ?? '').toString().replace(/"/g,'""')}"`).join(','))].join('\n');
  const blob = new Blob(['\ufeff'+csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `laporan-${name}.csv`; a.click();
}

// ===== Siklus Menu =====
const HARI_OPTIONS = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];

async function renderSiklus() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="text-stone-400">Memuat...</div>';
  try {
    const r = await fetch('/api/template/siklus', { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Gagal memuat siklus');
    }
    c.innerHTML = await r.text();
    reloadSiklusList();
  } catch (err) {
    console.error('Siklus error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat siklus: ${err.message}</div>`;
  }
}

async function reloadSiklusList() {
  const list = await api.get('/siklus');
  const wrap = document.getElementById('siklus-list');
  if (!list.length) { wrap.innerHTML = '<div class="col-span-full text-center py-12 text-stone-400">Belum ada siklus menu</div>'; return; }
  wrap.innerHTML = list.map(s => {
    const statusColor = s.status === 'Aktif' ? 'bg-blue-100 text-blue-800' : s.status === 'Draft' ? 'bg-stone-100 text-stone-700' : 'bg-orange-100 text-orange-800';
    return `<div class="bg-white border border-stone-200 rounded-lg p-5 cursor-pointer hover:shadow-md transition" onclick="loadSiklusDetail(${s.id})">
      <div class="flex justify-between items-start mb-2">
        <div class="font-bold text-sm">${s.nama}</div>
        <span class="text-[10px] px-2 py-1 rounded ${statusColor} capitalize">${s.status}</span>
      </div>
      <div class="text-xs text-stone-500 space-y-1">
        <div>Kategori: <b>${s.kategori_penerima || '-'}</b></div>
        <div>Porsi: <b>${fmtNum(s.jumlah_porsi)}</b> • Hari: <b>${s.total_hari}</b></div>
        ${s.catatan ? `<div class="text-stone-400 italic">${s.catatan}</div>` : ''}
      </div>
      <div class="flex gap-2 mt-3 pt-3 border-t border-stone-100">
        <button onclick="event.stopPropagation();editSiklus(${s.id})" class="text-xs text-stone-600 hover:text-stone-900">Edit</button>
        <button onclick="event.stopPropagation();deleteSiklus(${s.id})" class="text-xs text-red-600 hover:text-red-800">Hapus</button>
      </div>
    </div>`;
  }).join('');
}

async function loadSiklusDetail(id) {
  const data = await api.get('/siklus/' + id);
  const wrap = document.getElementById('siklus-detail');
  wrap.innerHTML = `
    <div class="bg-white border border-stone-200 rounded-lg p-5">
      <div class="flex justify-between items-center mb-4">
        <div>
          <h3 class="font-bold text-lg">${data.nama}</h3>
          <div class="text-xs text-stone-500 mt-1">Kategori: <b>${data.kategori_penerima || '-'}</b> • Porsi/hari: <b>${fmtNum(data.jumlah_porsi)}</b> • Status: <b class="capitalize">${data.status}</b></div>
          ${data.catatan ? `<div class="text-xs text-stone-400 mt-1">${data.catatan}</div>` : ''}
        </div>
        <div class="flex flex-wrap gap-2">
          <button onclick="renderSiklusLaporan(${data.id})" class="px-3 py-1.5 text-sm border border-stone-300 rounded hover:bg-stone-50">📊 Laporan</button>
          <button onclick="openSiklusForm(${data.id})" class="px-3 py-1.5 text-sm border border-stone-300 rounded hover:bg-stone-50">Edit Siklus</button>
          <button onclick="document.getElementById('siklus-detail').innerHTML=''" class="px-3 py-1.5 text-sm text-stone-500 hover:text-stone-900">Tutup</button>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        ${data.items.map(it => {
          const totalK = Number(it.kalori || 0) + Number(it.protein || 0) + Number(it.karbohidrat || 0) + Number(it.lemak || 0) + Number(it.serat || 0);
          return `<div class="border border-stone-200 rounded-lg p-4">
            <div class="text-xs font-semibold uppercase text-stone-500 mb-2">Hari ${it.hari_ke} — ${it.hari_nama}</div>
            <div class="font-bold text-sm mb-1">${it.menu_nama || '<span class="text-stone-400">Belum diisi</span>'}</div>
            <div class="text-xs text-stone-500 mb-2">${fmtNum(it.jumlah_porsi)} porsi</div>
            ${it.menu_nama ? `<div class="grid grid-cols-3 gap-1 text-[10px]">
              <div class="bg-stone-50 rounded p-1 text-center"><div class="text-stone-400">Kal</div><div class=\"mono font-semibold\">${fmtNum(it.kalori)}</div></div>
              <div class="bg-stone-50 rounded p-1 text-center"><div class="text-stone-400">Prot</div><div class=\"mono font-semibold\">${fmtNum(it.protein)}</div></div>
              <div class="bg-stone-50 rounded p-1 text-center"><div class="text-stone-400">Karb</div><div class=\"mono font-semibold\">${fmtNum(it.karbohidrat)}</div></div>
              <div class="bg-stone-50 rounded p-1 text-center"><div class="text-stone-400">Lem</div><div class=\"mono font-semibold\">${fmtNum(it.lemak)}</div></div>
              <div class="bg-stone-50 rounded p-1 text-center"><div class="text-stone-400">Ser</div><div class=\"mono font-semibold\">${fmtNum(it.serat)}</div></div>
            </div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

async function renderSiklusLaporan(id) {
  const data = await api.get('/siklus/' + id + '/laporan');
  const { siklus, stats, items } = data;
  const wrap = document.getElementById('siklus-detail');
  wrap.scrollIntoView({ behavior: 'smooth' });
  wrap.innerHTML = `
    <div class="bg-white border border-stone-200 rounded-lg p-5">
      <div class="flex flex-wrap justify-between items-center mb-4 gap-2">
        <div>
          <h3 class="font-bold text-lg">Laporan: ${siklus.nama}</h3>
          <div class="text-xs text-stone-500 mt-1">Status: <b class="capitalize">${siklus.status}</b> • Kategori: <b>${siklus.kategori_penerima || 'Semua'}</b></div>
        </div>
        <div class="flex gap-2">
          <button onclick="exportSiklusLaporan(${id})" class="px-3 py-1.5 text-sm border border-stone-300 rounded hover:bg-stone-50">⬇ CSV</button>
          <button onclick="window.print()" class="px-3 py-1.5 text-sm border border-stone-300 rounded hover:bg-stone-50">🖨️ Print</button>
          <button onclick="loadSiklusDetail(${id})" class="px-3 py-1.5 text-sm text-stone-500 hover:text-stone-900">Kembali</button>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        <div class="bg-stone-50 rounded-lg p-4">
          <div class="text-xs text-stone-500 uppercase">Total Hari</div>
          <div class="text-2xl font-bold mt-1">${stats.totalDays}</div>
        </div>
        <div class="bg-blue-50 rounded-lg p-4">
          <div class="text-xs text-blue-700 uppercase">Terisi</div>
          <div class="text-2xl font-bold text-blue-800 mt-1">${stats.filledDays}</div>
          <div class="text-xs text-blue-600">${stats.coverage}% coverage</div>
        </div>
        <div class="bg-orange-50 rounded-lg p-4">
          <div class="text-xs text-orange-700 uppercase">Kosong</div>
          <div class="text-2xl font-bold text-orange-800 mt-1">${stats.emptyDays}</div>
        </div>
        <div class="bg-sky-50 rounded-lg p-4">
          <div class="text-xs text-sky-700 uppercase">Menu Unik</div>
          <div class="text-2xl font-bold text-sky-800 mt-1">${stats.uniqueMenus}</div>
        </div>
      </div>

      <div class="bg-white border border-stone-200 rounded-lg p-5 mb-4">
        <div class="font-bold mb-3">Rata-rata Gizi per Hari Terisi</div>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div class="text-center">
            <div class="text-xs text-stone-500">Kalori</div>
            <div class="mono text-lg font-bold">${fmtNum(stats.avg.kalori)} <span class="text-xs text-stone-400">kkal</span></div>
          </div>
          <div class="text-center">
            <div class="text-xs text-stone-500">Protein</div>
            <div class="mono text-lg font-bold">${fmtNum(stats.avg.protein)} <span class="text-xs text-stone-400">g</span></div>
          </div>
          <div class="text-center">
            <div class="text-xs text-stone-500">Karbohidrat</div>
            <div class="mono text-lg font-bold">${fmtNum(stats.avg.karbohidrat)} <span class="text-xs text-stone-400">g</span></div>
          </div>
          <div class="text-center">
            <div class="text-xs text-stone-500">Lemak</div>
            <div class="mono text-lg font-bold">${fmtNum(stats.avg.lemak)} <span class="text-xs text-stone-400">g</span></div>
          </div>
          <div class="text-center">
            <div class="text-xs text-stone-500">Serat</div>
            <div class="mono text-lg font-bold">${fmtNum(stats.avg.serat)} <span class="text-xs text-stone-400">g</span></div>
          </div>
        </div>
      </div>

      <div class="bg-white border border-stone-200 rounded-lg overflow-hidden">
        <div class="px-5 py-3 font-bold border-b border-stone-200">Rincian per Hari</div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-stone-50">
              <tr>
                <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Hari</th>
                <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Menu</th>
                <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Porsi</th>
                <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Kalori</th>
                <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Protein</th>
                <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Karbohidrat</th>
                <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Lemak</th>
                <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Serat</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(it => `<tr class="border-t border-stone-100">
                <td class="px-4 py-3 text-sm whitespace-nowrap">Hari ${it.hari_ke} · ${it.hari_nama}</td>
                <td class="px-4 py-3 text-sm">${it.menu_nama || '<span class="text-stone-400">—</span>'}</td>
                <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${fmtNum(it.jumlah_porsi)}</td>
                <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${fmtNum(it.kalori)}</td>
                <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${fmtNum(it.protein)}</td>
                <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${fmtNum(it.karbohidrat)}</td>
                <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${fmtNum(it.lemak)}</td>
                <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${fmtNum(it.serat)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  window['_laporanSiklus_'+id] = { items, siklus, stats };
}

function exportSiklusLaporan(id) {
  const { items, stats } = window['_laporanSiklus_'+id] || {};
  if (!items) return alert('Data laporan belum dimuat');
  const rows = [
    ['Hari', 'Nama Hari', 'Menu', 'Porsi', 'Kalori', 'Protein', 'Karbohidrat', 'Lemak', 'Serat'],
    ...items.map(it => [it.hari_ke, it.hari_nama, it.menu_nama || '', it.jumlah_porsi, it.kalori, it.protein, it.karbohidrat, it.lemak, it.serat]),
    [],
    ['RINGKASAN'],
    ['Total Hari', stats.totalDays],
    ['Hari Terisi', stats.filledDays],
    ['Hari Kosong', stats.emptyDays],
    ['Cakupan', stats.coverage + '%'],
    ['Menu Unik', stats.uniqueMenus],
    [],
    ['RATA-RATA PER HARI TERISI'],
    ['Kalori', stats.avg.kalori],
    ['Protein', stats.avg.protein],
    ['Karbohidrat', stats.avg.karbohidrat],
    ['Lemak', stats.avg.lemak],
    ['Serat', stats.avg.serat],
  ];
  const csv = rows.map(r => r.map(c => `"${(c ?? '').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'laporan-siklus-' + (items[0]?.siklus_id || id) + '.csv'; a.click();
}

async function deleteSiklus(id) {
  if (!confirm('Hapus siklus ini? Semua item di dalamnya akan terhapus.')) return;
  await api.del('/siklus/' + id);
  document.getElementById('siklus-detail').innerHTML = '';
  reloadSiklusList();
}

async function editSiklus(id) {
  const data = await api.get('/siklus/' + id);
  openSiklusForm(data);
}

async function openSiklusForm(editing) {
  const isEdit = !!editing;
  const s = editing || { nama: '', kategori_penerima: '', jumlah_porsi: 0, total_hari: 7, status: 'Draft', catatan: '', items: HARI_OPTIONS.slice(0,7).map((h,i) => ({ hari_ke: i+1, hari_nama: h, menu_id: '', menu_nama: '', jumlah_porsi: 0 })) };
  document.getElementById('modal-title').textContent = isEdit ? 'Edit Siklus Menu' : 'Siklus Menu Baru';
  const body = document.getElementById('modal-body');
  body.innerHTML = `
    <div class="grid grid-cols-2 gap-3 mb-4">
      <div class="col-span-2"><label class="text-sm">Nama Siklus *</label><input id="sk-nama" value="${s.nama}" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md" /></div>
      <div><label class="text-sm">Kategori Penerima</label>
        <select id="sk-kat" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md">
          <option value="">— Semua —</option>${['Ibu Hamil','Ibu Menyusui','Balita','PAUD','TK','SD','SMP'].map(o => `<option value="${o}" ${s.kategori_penerima===o?'selected':''}>${o}</option>`).join('')}
        </select></div>
      <div><label class="text-sm">Jumlah Porsi/Hari</label><input id="sk-porsi" type="number" value="${s.jumlah_porsi}" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md mono" /></div>
      <div><label class="text-sm">Total Hari Siklus</label><input id="sk-hari" type="number" min="1" max="14" value="${s.total_hari || 7}" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md mono" /></div>
      <div><label class="text-sm">Status</label>
        <select id="sk-status" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md">
          ${['Draft','Aktif','Arsip'].map(o => `<option value="${o}" ${s.status===o?'selected':''}>${o}</option>`).join('')}
        </select></div>
      <div class="col-span-2"><label class="text-sm">Catatan</label><textarea id="sk-cat" rows="2" class="mt-1 w-full px-3 py-2 border border-stone-200 rounded-md">${s.catatan || ''}</textarea></div>
    </div>
    <div class="border-t border-stone-200 pt-3">
      <div class="font-semibold text-sm mb-2">Penempatan Menu per Hari</div>
      <div id="siklus-item-list" class="space-y-2"></div>
    </div>`;

  const defaultItems = HARI_OPTIONS.slice(0, Math.min(7, s.total_hari || 7)).map((h, i) => ({
    hari_ke: i + 1, hari_nama: h, menu_id: '', menu_nama: '', jumlah_porsi: s.jumlah_porsi || 0
  }));
  window._siklusForm = isEdit && Array.isArray(s.items) && s.items.length 
    ? s.items.map(it => ({ ...it })) 
    : defaultItems;
  renderSiklusFormItems(window._siklusForm);

  document.getElementById('modal-save').onclick = async () => {
    const payload = {
      nama: document.getElementById('sk-nama').value,
      kategori_penerima: document.getElementById('sk-kat').value,
      jumlah_porsi: +document.getElementById('sk-porsi').value || 0,
      total_hari: +document.getElementById('sk-hari').value || 7,
      status: document.getElementById('sk-status').value,
      catatan: document.getElementById('sk-cat').value,
      items: window._siklusForm,
    };
    if (!payload.nama) return alert('Nama siklus harus diisi');
    if (isEdit) await api.put('/siklus/' + editing.id, payload);
    else await api.post('/siklus', payload);
    closeModal();
    renderSiklus();
  };
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}

function renderSiklusFormItems(existingItems) {
  const list = document.getElementById('siklus-item-list');
  const totalHari = +(document.getElementById('sk-hari')?.value) || 7;
  const hariList = HARI_OPTIONS.slice(0, Math.min(7, Math.max(1, totalHari)));
  const menuOpts = (window._menuCache || []).map(m => `<option value="${m.id}">${m.nama}</option>`).join('');

  list.innerHTML = hariList.map((h, i) => {
    const existing = Array.isArray(existingItems) ? existingItems.find(x => x && x.hari_ke === (i+1)) : null;
    const mporsi = existing?.jumlah_porsi || 0;
    return `<div class="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center bg-stone-50 p-2 rounded">
      <div class="sm:col-span-2 text-xs font-semibold text-stone-600">Hari ${i+1} · ${h}</div>
      <div class="sm:col-span-6">
        <select onchange="updateSiklusItem(${i}, 'menu_id', this.value)" class="w-full h-9 px-2 border border-stone-200 rounded-md text-sm">
          <option value="">— Pilih menu —</option>${menuOpts}</select>
      </div>
      <div class="sm:col-span-3">
        <input type="number" value="${mporsi}" onchange="updateSiklusItem(${i}, 'jumlah_porsi', this.value)" class="w-full h-9 px-2 border border-stone-200 rounded-md text-sm mono" placeholder="porsi" />
      </div>
      <div class="sm:col-span-1 text-right">
        <button onclick="clearSiklusItem(${i})" class="text-red-600 text-sm">×</button>
      </div>
    </div>`;
  }).join('');

  if (Array.isArray(existingItems) && existingItems.length) {
    const selects = list.querySelectorAll('select');
    existingItems.forEach((it, idx) => {
      if (it && idx < totalHari && selects[idx] && it.menu_id) {
        selects[idx].value = it.menu_id;
      }
    });
  }
}

function updateSiklusItem(idx, key, val) {
  if (!window._siklusForm[idx]) window._siklusForm[idx] = { hari_ke: idx+1, hari_nama: HARI_OPTIONS[idx] || 'Hari-'+(idx+1), jumlah_porsi: 0 };
  window._siklusForm[idx][key] = key === 'jumlah_porsi' ? Number(val) || 0 : val;
  if (key === 'menu_id' && val) {
    const m = window._menuCache.find(x => x.id == val);
    if (m) window._siklusForm[idx].menu_nama = m.nama;
  }
}

function clearSiklusItem(idx) {
  window._siklusForm[idx] = { hari_ke: idx+1, hari_nama: HARI_OPTIONS[idx] || 'Hari-'+(idx+1), jumlah_porsi: 0, menu_id: '', menu_nama: '' };
  const selects = document.querySelectorAll('#siklus-item-list select');
  if (selects[idx]) selects[idx].value = '';
}

// Preload menu list for siklus form
async function preloadMenus() {
  try { window._menuCache = await api.get('/menu'); } catch { window._menuCache = []; }
}

// ===== Karyawan =====
async function renderKaryawan() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="text-stone-400">Memuat...</div>';
  try {
    const r = await fetch('/api/template/karyawan', { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Gagal memuat karyawan');
    }
    c.innerHTML = await r.text();
    document.getElementById('add-karyawan-btn').onclick = () => openKaryawanForm(null);
    document.getElementById('karyawan-save') && (document.getElementById('karyawan-save').onclick = saveKaryawan);
    try { await loadKaryawan(); } catch (e) { console.error('Karyawan data error:', e); }
  } catch (err) {
    console.error('Karyawan error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat karyawan: ${err.message}</div>`;
  }
}

// ===== Absensi =====
async function renderAbsensi() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="text-stone-400">Memuat...</div>';
  try {
    const r = await fetch('/api/template/absensi', { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Gagal memuat absensi');
    }
    c.innerHTML = await r.text();
    await loadKaryawanOptions();
    const now = new Date();
    const tahunOpts = Array.from({length: 5}, (_, i) => now.getFullYear() - i).map(y => `<option value="${y}">${y}</option>`).join('');
    document.getElementById('abs-filter-tahun').innerHTML = '<option value="">Semua Tahun</option>' + tahunOpts;
    document.getElementById('abs-filter-tahun').value = now.getFullYear();
    document.getElementById('absensi-save') && (document.getElementById('absensi-save').onclick = saveAbsensi);
    loadAbsensi();
  } catch (err) {
    console.error('Absensi error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat absensi: ${err.message}</div>`;
  }
}

// ===== Payroll =====
async function renderPayroll() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="text-stone-400">Memuat...</div>';
  try {
    const r = await fetch('/api/template/payroll', { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Gagal memuat payroll');
    }
    c.innerHTML = await r.text();
    await loadKaryawanOptions();
    const now = new Date();
    const tahunOpts = Array.from({length: 5}, (_, i) => now.getFullYear() - i).map(y => `<option value="${y}">${y}</option>`).join('');
    document.getElementById('pay-filter-tahun').innerHTML = '<option value="">Semua Tahun</option>' + tahunOpts;
    document.getElementById('payroll-save') && (document.getElementById('payroll-save').onclick = savePayroll);
    loadPayroll();
  } catch (err) {
    console.error('Payroll error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat payroll: ${err.message}</div>`;
  }
}

// ===== Karyawan Helpers =====
let karyawanData = [];
async function loadKaryawan() {
  try {
    const results = await Promise.allSettled([
      api.get('/karyawan'),
      api.get('/departemen')
    ]);
    const failed = results.find(r => r.status === 'rejected');
    if (failed) throw failed.reason;
    karyawanData = results[0].value;
    renderKaryawanTable(karyawanData);
    const depts = results[1].value;
    const dl = document.getElementById('departemen-list');
    if (dl) dl.innerHTML = depts.map(d => `<option value="${d}"></option>`).join('');
  } catch (e) {
    console.error('loadKaryawan error:', e);
    const tb = document.querySelector('#karyawan-modal')?.parentElement?.querySelector('tbody');
    if (tb) tb.innerHTML = `<tr><td colspan="7" class="text-center py-12 text-red-600">Gagal memuat karyawan: ${e.message}</td></tr>`;
  }
}
function renderKaryawanTable(list) {
  const tb = document.querySelector('#karyawan-modal').parentElement.querySelector('tbody');
  if (!list.length) { tb.innerHTML = '<tr><td colspan="7" class="text-center py-12 text-stone-400">Belum ada karyawan</td></tr>'; return; }
  tb.innerHTML = list.map(k => `
    <tr class="border-t border-stone-100">
      <td class="px-4 py-3 text-sm font-medium">${k.nama}</td>
      <td class="px-4 py-3 text-sm">${k.nik || '-'}</td>
      <td class="px-4 py-3 text-sm">${k.jabatan || '-'}</td>
      <td class="px-4 py-3 text-sm">${k.departemen || '-'}</td>
      <td class="px-4 py-3 text-sm text-right mono">${fmtIDR(k.gaji_pokok)}</td>
      <td class="px-4 py-3 text-sm">${k.status}</td>
      <td class="px-4 py-3 text-sm text-right whitespace-nowrap">
        <button data-id="${k.id}" class="edit-karyawan text-stone-500 hover:text-stone-900 mr-2">Edit</button>
        <button data-id="${k.id}" class="text-red-600">Hapus</button>
      </td>
    </tr>`).join('');
  tb.querySelectorAll('.edit-karyawan').forEach(b => b.onclick = () => openKaryawanForm(karyawanData.find(x => x.id == b.dataset.id)));
  tb.querySelectorAll('.text-red-600').forEach(b => b.onclick = async () => {
    if (!confirm('Hapus karyawan?')) return;
    await api.del('/karyawan/' + b.dataset.id);
    loadKaryawan();
  });
}
function openKaryawanForm(k) {
  document.getElementById('karyawan-id').value = k ? k.id : '';
  document.getElementById('karyawan-nama').value = k ? k.nama : '';
  document.getElementById('karyawan-nik').value = k ? k.nik || '' : '';
  document.getElementById('karyawan-jabatan').value = k ? k.jabatan || '' : '';
  document.getElementById('karyawan-departemen').value = k ? k.departemen || '' : '';
  document.getElementById('karyawan-gaji').value = k ? k.gaji_pokok : '';
  document.getElementById('karyawan-status').value = k ? k.status : 'Aktif';
  document.getElementById('karyawan-masuk').value = k ? k.tanggal_masuk || '' : '';
  document.getElementById('karyawan-modal-title').textContent = k ? 'Edit Karyawan' : 'Tambah Karyawan';
  document.getElementById('karyawan-modal').classList.remove('hidden');
  document.getElementById('karyawan-modal').classList.add('flex');
}
function saveKaryawan() {
  const id = document.getElementById('karyawan-id').value;
  const payload = {
    nama: document.getElementById('karyawan-nama').value,
    nik: document.getElementById('karyawan-nik').value,
    jabatan: document.getElementById('karyawan-jabatan').value,
    departemen: document.getElementById('karyawan-departemen').value,
    gaji_pokok: +(document.getElementById('karyawan-gaji').value || 0),
    status: document.getElementById('karyawan-status').value,
    tanggal_masuk: document.getElementById('karyawan-masuk').value,
  };
  if (!payload.nama) return alert('Nama harus diisi');
  const isEdit = !!id;
  if (isEdit) {
    api.put('/karyawan/' + id, payload).then(() => loadKaryawan());
  } else {
    api.post('/karyawan', payload).then(() => loadKaryawan());
  }
  document.getElementById('karyawan-modal').classList.add('hidden');
  document.getElementById('karyawan-modal').classList.remove('flex');
}

// ===== Absensi Helpers =====
let karyawanOptions = [];
async function loadKaryawanOptions() {
  try {
    const rows = await api.get('/karyawan?status=Aktif');
    karyawanOptions = Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.error('loadKaryawanOptions error:', e);
    karyawanOptions = [];
  }
}
async function loadAbsensi() {
  const params = new URLSearchParams();
  const fk = document.getElementById('abs-filter-karyawan').value;
  const fb = document.getElementById('abs-filter-bulan').value;
  const ft = document.getElementById('abs-filter-tahun').value;
  const fs = document.getElementById('abs-filter-status').value;
  if (fk) params.set('karyawan_id', fk);
  if (fb) params.set('bulan', fb);
  if (ft) params.set('tahun', ft);
  if (fs) params.set('status', fs);
  const list = await api.get('/absensi?' + params);
  renderAbsensiTable(list);
}
function renderAbsensiTable(list) {
  const tb = document.querySelector('#absensi-modal').parentElement.querySelector('tbody');
  if (!list.length) { tb.innerHTML = '<tr><td colspan="8" class="text-center py-12 text-stone-400">Belum ada data absensi</td></tr>'; return; }
  tb.innerHTML = list.map(a => `
    <tr class="border-t border-stone-100">
      <td class="px-4 py-3 text-sm whitespace-nowrap">${fmtDate(a.tanggal)}</td>
      <td class="px-4 py-3 text-sm font-medium">${a.nama_karyawan}</td>
      <td class="px-4 py-3 text-sm">${a.jabatan || '-'}</td>
      <td class="px-4 py-3 text-sm text-center">${a.status}</td>
      <td class="px-4 py-3 text-sm text-center mono">${a.jam_masuk || '-'}</td>
      <td class="px-4 py-3 text-sm text-center mono">${a.jam_keluar || '-'}</td>
      <td class="px-4 py-3 text-sm">${a.keterangan || '-'}</td>
      <td class="px-4 py-3 text-sm text-right whitespace-nowrap">
        <button data-id="${a.id}" class="edit-absensi text-stone-500 hover:text-stone-900 mr-2">Edit</button>
        <button data-id="${a.id}" class="text-red-600">Hapus</button>
      </td>
    </tr>`).join('');
  tb.querySelectorAll('.edit-absensi').forEach(b => b.onclick = () => openAbsensiForm(list.find(x => x.id == b.dataset.id)));
  tb.querySelectorAll('.text-red-600').forEach(b => b.onclick = async () => {
    if (!confirm('Hapus data absensi?')) return;
    await api.del('/absensi/' + b.dataset.id);
    loadAbsensi();
  });
}
function openAbsensiForm(a) {
  document.getElementById('absensi-id').value = a ? a.id : '';
  document.getElementById('absensi-karyawan').value = a ? a.karyawan_id : '';
  document.getElementById('absensi-tanggal').value = a ? a.tanggal : new Date().toISOString().slice(0,10);
  document.getElementById('absensi-status').value = a ? a.status : 'Hadir';
  document.getElementById('absensi-masuk').value = a ? a.jam_masuk || '' : '';
  document.getElementById('absensi-keluar').value = a ? a.jam_keluar || '' : '';
  document.getElementById('absensi-keterangan').value = a ? a.keterangan || '' : '';
  document.getElementById('absensi-modal-title').textContent = a ? 'Edit Absensi' : 'Input Absensi';
  const sel = document.getElementById('absensi-karyawan');
  sel.innerHTML = (karyawanOptions || []).map(k => `<option value="${k.id}">${k.nama} - ${k.jabatan || '-'}</option>`).join('');
  document.getElementById('absensi-modal').classList.remove('hidden');
  document.getElementById('absensi-modal').classList.add('flex');
}
function saveAbsensi() {
  const id = document.getElementById('absensi-id').value;
  const payload = {
    karyawan_id: +(document.getElementById('absensi-karyawan').value || 0),
    tanggal: document.getElementById('absensi-tanggal').value,
    status: document.getElementById('absensi-status').value,
    jam_masuk: document.getElementById('absensi-masuk').value,
    jam_keluar: document.getElementById('absensi-keluar').value,
    keterangan: document.getElementById('absensi-keterangan').value,
  };
  if (!payload.karyawan_id || !payload.tanggal) return alert('Karyawan dan tanggal wajib diisi');
  const isEdit = !!id;
  if (isEdit) {
    api.put('/absensi/' + id, payload).then(() => loadAbsensi());
  } else {
    api.post('/absensi', payload).then(() => loadAbsensi());
  }
  document.getElementById('absensi-modal').classList.add('hidden');
  document.getElementById('absensi-modal').classList.remove('flex');
}

// ===== Payroll Helpers =====
let payrollListGlobal = [];
async function loadPayroll() {
  const params = new URLSearchParams();
  const fk = document.getElementById('pay-filter-karyawan').value;
  const fb = document.getElementById('pay-filter-bulan').value;
  const ft = document.getElementById('pay-filter-tahun').value;
  const fs = document.getElementById('pay-filter-status').value;
  if (fk) params.set('karyawan_id', fk);
  if (fb) params.set('bulan', fb);
  if (ft) params.set('tahun', ft);
  if (fs) params.set('status', fs);
  payrollListGlobal = await api.get('/payroll?' + params);
  renderPayrollTable(payrollListGlobal);
}
function renderPayrollTable(list) {
  const tb = document.querySelector('#payroll-modal').parentElement.querySelector('tbody');
  if (!list.length) { tb.innerHTML = '<tr><td colspan="9" class="text-center py-12 text-stone-400">Belum ada data payroll</td></tr>'; return; }
  const BLN = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  tb.innerHTML = list.map(p => `
    <tr class="border-t border-stone-100">
      <td class="px-4 py-3 text-sm whitespace-nowrap">${BLN[p.bulan]} ${p.tahun}</td>
      <td class="px-4 py-3 text-sm font-medium">${p.nama_karyawan}</td>
      <td class="px-4 py-3 text-sm">${p.jabatan || '-'}</td>
      <td class="px-4 py-3 text-sm text-right mono">${fmtIDR(p.gaji_pokok)}</td>
      <td class="px-4 py-3 text-sm text-right mono">${fmtIDR(p.tunjangan)}</td>
      <td class="px-4 py-3 text-sm text-right mono">${fmtIDR(p.potongan)}</td>
      <td class="px-4 py-3 text-sm text-right mono font-medium">${fmtIDR(p.total_gaji)}</td>
      <td class="px-4 py-3 text-sm text-center">${p.status}</td>
      <td class="px-4 py-3 text-sm text-right whitespace-nowrap">
        <button data-id="${p.id}" class="edit-payroll text-stone-500 hover:text-stone-900 mr-2">Edit</button>
        <button data-id="${p.id}" class="text-red-600">Hapus</button>
      </td>
    </tr>`).join('');
  tb.querySelectorAll('.edit-payroll').forEach(b => b.onclick = () => openPayrollForm(payrollListGlobal.find(x => x.id == b.dataset.id)));
  tb.querySelectorAll('.text-red-600').forEach(b => b.onclick = async () => {
    if (!confirm('Hapus data payroll?')) return;
    await api.del('/payroll/' + b.dataset.id);
    loadPayroll();
  });
}
function openPayrollForm(p) {
  document.getElementById('payroll-id').value = p ? p.id : '';
  document.getElementById('payroll-karyawan').value = p ? p.karyawan_id : '';
  document.getElementById('payroll-bulan').value = p ? p.bulan : new Date().getMonth()+1;
  document.getElementById('payroll-tahun').value = p ? p.tahun : new Date().getFullYear();
  document.getElementById('payroll-gaji').value = p ? p.gaji_pokok : '';
  document.getElementById('payroll-tunjangan').value = p ? p.tunjangan : '';
  document.getElementById('payroll-potongan').value = p ? p.potongan : '';
  document.getElementById('payroll-status').value = p ? p.status : 'Draft';
  document.getElementById('payroll-modal-title').textContent = p ? 'Edit Payroll' : 'Tambah Payroll';
  const sel = document.getElementById('payroll-karyawan');
  sel.innerHTML = (karyawanOptions || []).map(k => `<option value="${k.id}">${k.nama} - ${k.jabatan || '-'}</option>`).join('');
  document.getElementById('payroll-modal').classList.remove('hidden');
  document.getElementById('payroll-modal').classList.add('flex');
}
function savePayroll() {
  const id = document.getElementById('payroll-id').value;
  const payload = {
    karyawan_id: +(document.getElementById('payroll-karyawan').value || 0),
    bulan: +(document.getElementById('payroll-bulan').value || 0),
    tahun: +(document.getElementById('payroll-tahun').value || 0),
    gaji_pokok: +(document.getElementById('payroll-gaji').value || 0),
    tunjangan: +(document.getElementById('payroll-tunjangan').value || 0),
    potongan: +(document.getElementById('payroll-potongan').value || 0),
    status: document.getElementById('payroll-status').value,
  };
  if (!payload.karyawan_id) return alert('Pilih karyawan');
  const isEdit = !!id;
  if (isEdit) {
    api.put('/payroll/' + id, payload).then(() => loadPayroll());
  } else {
    api.post('/payroll', payload).then(() => loadPayroll());
  }
  document.getElementById('payroll-modal').classList.add('hidden');
  document.getElementById('payroll-modal').classList.remove('flex');
}

init();
preloadMenus();
