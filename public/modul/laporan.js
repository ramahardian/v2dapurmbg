// ===== Laporan =====
async function renderLaporan() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/laporan', { credentials: 'include' });
    if (!r.ok) {
      let err;
      try { err = await r.json(); } catch { err = { error: r.status + ' ' + r.statusText }; }
      throw new Error(err.error || 'Gagal memuat laporan');
    }
    c.innerHTML = await r.text();
    showLap('siklus');
  } catch (err) {
    console.error('Laporan error:', err);
    if (err.message.includes('Akses ditolak') || err.message.includes('Forbidden')) return showAccessDenied();
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat laporan: ${err.message}</div>`;
  }
}
const LAP_TABS = ['siklus', 'hpp', 'persediaan', 'produksi', 'distribusi', 'rab', 'rab-bulanan', 'pengeluaran-bulanan', 'penggunaan-anggaran', 'bp-kas'];
const LAP_PAGE_SIZE = 10;
let lapState = { tab: 'siklus', page: 1 };

async function showLap(tab) {
  lapState.tab = tab;
  lapState.page = 1;
  const tabColors = {
    persediaan: { active: 'bg-white text-amber-600 shadow-sm', inactive: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
    distribusi: { active: 'bg-white text-violet-600 shadow-sm', inactive: 'bg-violet-100 text-violet-700 hover:bg-violet-200' },
    siklus: { active: 'bg-white text-rose-600 shadow-sm', inactive: 'bg-rose-100 text-rose-700 hover:bg-rose-200' },
    produksi: { active: 'bg-white text-lime-600 shadow-sm', inactive: 'bg-lime-100 text-lime-700 hover:bg-lime-200' },
    hpp: { active: 'bg-white text-gray-600 shadow-sm', inactive: 'bg-gray-100 text-gray-700 hover:bg-gray-200' },
    rab: { active: 'bg-white text-emerald-600 shadow-sm', inactive: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
    'rab-bulanan': { active: 'bg-white text-emerald-600 shadow-sm', inactive: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
    'pengeluaran-bulanan': { active: 'bg-white text-sky-600 shadow-sm', inactive: 'bg-sky-100 text-sky-700 hover:bg-sky-200' },
    'penggunaan-anggaran': { active: 'bg-white text-teal-600 shadow-sm', inactive: 'bg-teal-100 text-teal-700 hover:bg-teal-200' },
    'bp-kas': { active: 'bg-white text-indigo-600 shadow-sm', inactive: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' },
  };
  LAP_TABS.forEach(t => {
    const el = document.getElementById('lt-'+t);
    const c = tabColors[t];
    const base = 'px-3 sm:px-5 py-2 sm:py-2.5 text-[11px] font-medium rounded-t-lg border border-b-0 border-stone-200 -mb-px';
    const extra = t === tab ? ' relative z-[2]' : '';
    el.className = base + ' ' + (t === tab ? c.active : c.inactive) + extra;
  });
  const wrap = document.getElementById('lap-content');
  wrap.innerHTML = '<div class="flex items-center justify-center py-16"><svg class="animate-spin h-8 w-8 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    if (tab === 'persediaan') {
      const rows = await api.get('/bahan_baku');
      window._lapData = { tab, rows, headers: ['Nama','Kategori','Stok','Satuan','Harga','Nilai'], fields: ['nama','kategori','satuan','stok_saat_ini','stok_minimum','harga_satuan'],
        fmt: rows.map(b => [b.nama, b.kategori||'-', fmtNum(b.stok_saat_ini), b.satuan, fmtIDR(b.harga_satuan), fmtIDR(b.stok_saat_ini * b.harga_satuan)]) };
      window['_export_persediaan'] = { data: rows, fields: ['nama','kategori','satuan','stok_saat_ini','stok_minimum','harga_satuan'] };
      window._lapStatCards = '';
    } else if (tab === 'distribusi') {
      const rows = await api.get('/distribusi');
      window._lapData = { tab, rows, headers: ['Tanggal','Titik','Kategori','Porsi','Status'], fields: ['tanggal_distribusi','titik_distribusi','kategori_penerima','jumlah_porsi','status'],
        fmt: rows.map(d => [fmtDate(d.tanggal_distribusi), d.titik_distribusi, d.kategori_penerima||'-', fmtNum(d.jumlah_porsi), d.status]) };
      window['_export_distribusi'] = { data: rows, fields: ['tanggal_distribusi','titik_distribusi','kategori_penerima','jumlah_porsi','status'] };
      window._lapStatCards = '';
    } else if (tab === 'rab') {
      const rows = await api.get('/budget');
      const totalBudget = rows.reduce((s, b) => s + Number(b.total_budget), 0);
      const totalRealisasi = rows.reduce((s, b) => s + Number(b.realisasi), 0);
      const totalSelisih = totalBudget - totalRealisasi;
      const totalBiayaOp = rows.reduce((s, b) => s + Number(b.biaya_operasional), 0);
      const totalPenerima = rows.reduce((s, b) => s + Number(b.jumlah_penerima), 0);
      const totalHargaPerPorsi = rows.reduce((s, b) => s + Number(b.harga_per_porsi), 0);
      const biayaCount = rows.filter(b => Number(b.biaya_operasional) > 0).length;
      window._lapData = { tab, rows,
        headers: ['Periode','Kategori','Penerima','Harga/Porsi','Biaya Operasional','Total Budget','Realisasi','Selisih','Capaian'],
        fields: ['periode','kategori_penerima','jumlah_penerima','harga_per_porsi','biaya_operasional','total_budget','realisasi'],
        fmt: rows.map(b => {
          const budget = Number(b.total_budget);
          const realisasi = Number(b.realisasi);
          const selisih = budget - realisasi;
          const capaian = budget > 0 ? (realisasi / budget * 100).toFixed(1) + '%' : '-';
          return [b.periode, b.kategori_penerima||'-', fmtNum(b.jumlah_penerima), fmtIDR(b.harga_per_porsi),
            fmtIDR(b.biaya_operasional), fmtIDR(budget), fmtIDR(realisasi), fmtIDR(selisih), capaian];
        })
      };
      window['_export_rab'] = { data: rows, fields: ['periode','kategori_penerima','jumlah_penerima','harga_per_porsi','biaya_operasional','total_budget','realisasi'] };
      window._lapStatCards = `<div class="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 mb-4">
        ${statCard('Total Budget', fmtIDR(totalBudget), 'Anggaran', 'bg-emerald-50')}
        ${statCard('Total Realisasi', fmtIDR(totalRealisasi), 'Terpakai', 'bg-orange-50')}
        ${statCard('Sisa Anggaran', fmtIDR(totalSelisih), totalBudget > 0 ? (totalRealisasi/totalBudget*100).toFixed(1) + '% terserap' : '', 'bg-blue-50')}
        ${statCard('Biaya Operasional', fmtIDR(totalBiayaOp), biayaCount + ' item', 'bg-stone-50')}
        ${statCard('Total Penerima', fmtNum(totalPenerima), 'manfaat', 'bg-violet-50')}
      </div>`;
    } else if (tab === 'rab-bulanan') {
      const r = await api.get('/laporan/rab-bulanan');
      const rows = r.rows || [];
      window._lapData = { tab, rows,
        headers: ['Periode','Item','Penerima','Rata Harga/Porsi','Biaya Operasional','Total Budget','Realisasi','Selisih','Capaian'],
        fields: ['periode','item_count','total_penerima','rata_harga_per_porsi','total_biaya_operasional','total_budget','total_realisasi'],
        fmt: rows.map(b => {
          const budget = Number(b.total_budget);
          const realisasi = Number(b.total_realisasi);
          const selisih = budget - realisasi;
          const capaian = budget > 0 ? (realisasi / budget * 100).toFixed(1) + '%' : '-';
          return [b.periode, fmtNum(b.item_count), fmtNum(b.total_penerima), fmtIDR(b.rata_harga_per_porsi),
            fmtIDR(b.total_biaya_operasional), fmtIDR(budget), fmtIDR(realisasi), fmtIDR(selisih), capaian];
        })
      };
      window['_export_rab-bulanan'] = { data: rows, fields: ['periode','item_count','total_penerima','rata_harga_per_porsi','total_biaya_operasional','total_budget','total_realisasi'] };
      const s = r.stats;
      const selisihTotal = s.total_budget - s.total_realisasi;
      window._lapStatCards = `<div class="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 mb-4">
        ${statCard('Total Periode', fmtNum(s.total_periode), 'bulan anggaran', 'bg-emerald-50')}
        ${statCard('Total Budget', fmtIDR(s.total_budget), '', 'bg-blue-50')}
        ${statCard('Total Realisasi', fmtIDR(s.total_realisasi), s.total_periode > 0 ? (s.total_realisasi/s.total_budget*100).toFixed(1)+'% terserap' : '', 'bg-orange-50')}
        ${statCard('Selisih Total', fmtIDR(selisihTotal), selisihTotal >= 0 ? 'surplus' : 'defisit', selisihTotal >= 0 ? 'bg-emerald-50' : 'bg-red-50')}
        ${statCard('Rata-rata Capaian', s.rata_capaian.toFixed(1)+'%', 'per periode', 'bg-violet-50')}
      </div>`;
    } else if (tab === 'siklus') {
      const [siklusList, lapRes, menuHarianRes] = await Promise.all([
        api.get('/siklus'),
        api.get('/siklus/laporan'),
        api.get('/siklus/laporan/menu-harian').catch(() => null),
      ]);
      const { ringkasan } = lapRes;
      window._lapData = null;

      const menuHarian = menuHarianRes ? menuHarianRes.siklus : [];
      const kategori_order = menuHarianRes ? menuHarianRes.kategori_order : ['Karbohidrat','Protein Hewani','Protein Nabati','Sayur','Buah','Susu','Minyak'];

      // Build Laporan 1: Siklus Menu 10 Hari
      let lap1Html = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden mb-6">';
      lap1Html += '<div style="padding:8px 12px;font-weight:700;font-size:14px;background:#f59e0b;color:#fff;border-bottom:2px solid #000;">LAPORAN 1 — SIKLUS MENU 10 HARI</div>';
      lap1Html += renderDailyMenuTable(menuHarian, kategori_order);
      lap1Html += '</div>';

      // Build Laporan 2: Identifikasi Resep
      let lap2Html = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden mb-4">';
      lap2Html += '<div style="padding:8px 12px;font-weight:700;font-size:14px;background:#f59e0b;color:#fff;border-bottom:2px solid #000;">LAPORAN 2 — IDENTIFIKASI RESEP</div>';
      lap2Html += renderResepTable(menuHarian, kategori_order);
      lap2Html += '</div>';

      window._lapStatCards = `<div class="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 mb-4">
        ${statCard('Total Siklus', fmtNum(ringkasan.totalSiklus), 'siklus', 'bg-rose-50')}
        ${statCard('Total Hari', fmtNum(ringkasan.totalHari), 'hari siklus', 'bg-blue-50')}
        ${statCard('Hari Terisi', fmtNum(ringkasan.totalFilled), ringkasan.rataCoverage + '% coverage', 'bg-emerald-50')}
        ${statCard('Hari Kosong', fmtNum(ringkasan.totalKosong), 'belum terisi', 'bg-orange-50')}
        ${statCard('Menu Unik', fmtNum(ringkasan.totalMenuUnik), 'menu digunakan', 'bg-violet-50')}
      </div>
      ${lap1Html}
      ${lap2Html}`;
    } else if (tab === 'pembelian') {
      const r = await api.get('/laporan/pembelian');
      const rows = r.rows || [];
      const fmtItem = d => { try { return JSON.parse(d.item || '[]').map(i => i.nama).filter(Boolean).join(', '); } catch { return ''; } };
      window._lapData = { tab, rows, headers: ['No PO','Tanggal','Supplier','Item','Total','Status'], fields: ['no_po','tanggal','supplier_nama','item_nama','total_nilai','status'],
        fmt: rows.map(d => [d.no_po, fmtDate(d.tanggal), d.supplier_nama||'-', fmtItem(d), fmtIDR(d.total_nilai), d.status]) };
      window['_export_pembelian'] = { data: rows.map(d => ({ ...d, item_nama: fmtItem(d) })), fields: ['no_po','tanggal','supplier_nama','item_nama','total_nilai','status'] };
      window._lapStatCards = `<div class="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 mb-4">
        ${statCard('Total PO', fmtNum(r.stats.total_po), '', 'bg-indigo-50')}
        ${statCard('Draft', fmtNum(r.stats.draft), '', 'bg-stone-50')}
        ${statCard('Disetujui', fmtNum(r.stats.disetujui), '', 'bg-blue-50')}
        ${statCard('Diterima', fmtNum(r.stats.diterima), '', 'bg-emerald-50')}
        ${statCard('Total Nilai', fmtIDR(r.stats.total_nilai), '', 'bg-indigo-50')}
      </div>`;
    } else if (tab === 'penerimaan') {
      const r = await api.get('/laporan/penerimaan');
      const rows = r.rows || [];
      window._lapData = { tab, rows, headers: ['No Dokumen','Tanggal','Supplier','Ref PO','Nilai','QC'], fields: ['no_dokumen','tanggal_terima','supplier_nama','ref_po','total_nilai','status_qc'],
        fmt: rows.map(d => [d.no_dokumen, fmtDate(d.tanggal_terima), d.supplier_nama||'-', d.ref_po||'-', fmtIDR(d.total_nilai), d.status_qc]) };
      window['_export_penerimaan'] = { data: rows, fields: ['no_dokumen','tanggal_terima','supplier_nama','ref_po','total_nilai','status_qc'] };
      window._lapStatCards = `<div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">
        ${statCard('Total', fmtNum(r.stats.total), '', 'bg-teal-50')}
        ${statCard('Lolos QC', fmtNum(r.stats.lolos), '', 'bg-emerald-50')}
        ${statCard('Retur', fmtNum(r.stats.retur), '', 'bg-orange-50')}
        ${statCard('Total Nilai', fmtIDR(r.stats.total_nilai), '', 'bg-teal-50')}
      </div>`;
    } else if (tab === 'mutasi') {
      const r = await api.get('/laporan/mutasi-stok');
      const rows = r.rows || [];
      window._lapData = { tab, rows, headers: ['Tanggal','Jenis','Bahan','Jumlah','Satuan','Keterangan'], fields: ['tanggal','jenis','bahan_nama','jumlah','satuan','keterangan'],
        fmt: rows.map(d => [fmtDate(d.tanggal), `<span class="${d.jenis==='Masuk'?'text-green-600':'text-red-600'} font-medium">${d.jenis}</span>`, d.bahan_nama, fmtNum(d.jumlah), d.satuan, d.keterangan||'-']) };
      window['_export_mutasi'] = { data: rows, fields: ['tanggal','jenis','bahan_nama','jumlah','satuan','keterangan'] };
      const totalMasuk = Number(r.stats.total_masuk).toFixed(2);
      const totalKeluar = Number(r.stats.total_keluar).toFixed(2);
      window._lapStatCards = `<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-4">
        ${statCard('Total Masuk', totalMasuk, r.stats.count_masuk + ' transaksi', 'bg-emerald-50')}
        ${statCard('Total Keluar', totalKeluar, r.stats.count_keluar + ' transaksi', 'bg-orange-50')}
        ${statCard('Selisih', (totalMasuk - totalKeluar).toFixed(2), '', 'bg-blue-50')}
      </div>`;
    } else if (tab === 'produksi') {
      const r = await api.get('/laporan/produksi');
      const rows = r.rows || [];
      window._lapData = { tab, rows, headers: ['Tanggal','Menu','Kategori','Porsi','Status'], fields: ['tanggal_produksi','menu_nama','kategori_penerima','jumlah_porsi','status'],
        fmt: rows.map(d => [fmtDate(d.tanggal_produksi), d.menu_nama, d.kategori_penerima||'-', fmtNum(d.jumlah_porsi), d.status]) };
      window['_export_produksi'] = { data: rows, fields: ['tanggal_produksi','menu_nama','kategori_penerima','jumlah_porsi','status'] };
      window._lapStatCards = `<div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">
        ${statCard('Total Produksi', fmtNum(r.stats.total), 'kali', 'bg-lime-50')}
        ${statCard('Total Porsi', fmtNum(r.stats.total_porsi), 'porsi', 'bg-blue-50')}
        ${statCard('Diproduksi', fmtNum(r.stats.diproduksi), '', 'bg-emerald-50')}
        ${statCard('Selesai', fmtNum(r.stats.selesai), '', 'bg-stone-50')}
      </div>`;
    } else if (tab === 'payroll') {
      const r = await api.get('/laporan/payroll');
      const rows = r.rows || [];
      window._lapData = { tab, rows, headers: ['Periode','Karyawan','Jabatan','Gaji Pokok','Tunjangan','Potongan','Total Gaji','Status'], fields: ['periode','karyawan_nama','jabatan','gaji_pokok','tunjangan','potongan','total_gaji','status'],
        fmt: rows.map(d => [d.periode, d.karyawan_nama, d.jabatan||'-', fmtIDR(d.gaji_pokok), fmtIDR(d.tunjangan), fmtIDR(d.potongan), fmtIDR(d.total_gaji), d.status]) };
      window['_export_payroll'] = { data: rows, fields: ['periode','karyawan_nama','jabatan','gaji_pokok','tunjangan','potongan','total_gaji','status'] };
      window._lapStatCards = `<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-4">
        ${statCard('Total Karyawan', fmtNum(r.stats.total_karyawan), 'data gaji', 'bg-pink-50')}
        ${statCard('Total Gaji', fmtIDR(r.stats.total_gaji), r.stats.periode_count + ' periode', 'bg-blue-50')}
        ${statCard('Rata-rata', fmtIDR(r.stats.total_karyawan ? Math.round(r.stats.total_gaji / r.stats.total_karyawan) : 0), '/karyawan', 'bg-violet-50')}
      </div>`;
    } else if (tab === 'laba-rugi') {
      const r = await api.get('/laporan/laba-rugi');
      const rows = r.rows || [];
      window._lapData = { tab, rows, headers: ['Periode','Pendapatan','Biaya','Laba/Rugi'], fields: ['periode','pendapatan','biaya'],
        fmt: rows.map(d => {
          const laba = d.pendapatan - d.biaya;
          return [d.periode, fmtIDR(d.pendapatan), fmtIDR(d.biaya), `<span class="${laba>=0?'text-green-600':'text-red-600'} font-medium mono">${fmtIDR(laba)}</span>`];
        }) };
      window['_export_laba-rugi'] = { data: rows, fields: ['periode','pendapatan','biaya'] };
      window._lapStatCards = `<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-4">
        ${statCard('Total Pendapatan', fmtIDR(r.totalPendapatan), '', 'bg-emerald-50')}
        ${statCard('Total Biaya', fmtIDR(r.totalBiayaAll), 'dari kas bank', 'bg-orange-50')}
        ${statCard('Laba/Rugi', `<span class="${r.labaRugi>=0?'text-green-600':'text-red-600'}">${fmtIDR(r.labaRugi)}</span>`, '', 'bg-blue-50')}
      </div>`;
    } else if (tab === 'hpp') {
      const r = await api.get('/laporan/hpp');
      const rows = r.rows || [];
      window._lapData = { tab, rows, headers: ['Menu','Kategori','Gramasi','Biaya Bahan','HPP/Porsi'], fields: ['nama','kategori_penerima','gramasi_total','total_biaya_bahan','hpp_per_porsi'],
        fmt: rows.map(d => [d.nama, d.kategori_penerima||'-', d.gramasi_total + 'g', fmtIDR(d.total_biaya_bahan), fmtIDR(d.hpp_per_porsi)]) };
      window['_export_hpp'] = { data: rows, fields: ['nama','kategori_penerima','gramasi_total','total_biaya_bahan','hpp_per_porsi'] };
      window._lapStatCards = `<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-4">
        ${statCard('Total Menu', fmtNum(r.stats.total_menu), '', 'bg-gray-50')}
        ${statCard('Rata-rata HPP', fmtIDR(r.stats.rata_hpp), '/porsi', 'bg-blue-50')}
        ${statCard('Total Biaya Bahan', fmtIDR(r.stats.total_biaya), '', 'bg-amber-50')}
      </div>`;
    } else if (tab === 'pengeluaran-bulanan') {
      const { bulan, tahun } = lapState;
      const params = new URLSearchParams();
      if (bulan) params.set('bulan', bulan);
      if (tahun) params.set('tahun', tahun);
      const r = await api.get('/laporan/pengeluaran-bulanan?' + params.toString());
      const transaksi = r.transaksi || [];
      window._lapData = { tab: 'pengeluaran-bulanan', rows: transaksi,
        headers: ['Tanggal','Tipe','Kategori','Akun','Deskripsi','Jumlah'],
        fields: ['tanggal','tipe','kategori','akun_label','deskripsi','jumlah'],
        fmt: transaksi.map(t => [
          fmtDate(t.tanggal),
          `<span class="${t.tipe==='masuk'?'text-green-600':'text-red-600'} font-medium">${t.tipe}</span>`,
          t.kategori||'-',
          t.akun_kode ? t.akun_kode+' - '+t.akun_nama : '-',
          t.deskripsi||'-',
          fmtIDR(t.jumlah),
        ])
      };
      window['_export_pengeluaran-bulanan'] = { data: transaksi, fields: ['tanggal','tipe','kategori','akun','deskripsi','jumlah'] };
      const bulanNama = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][parseInt(bulan||new Date().getMonth()+1)-1];
      window._lapStatCards = `
<div class="mb-4 flex flex-wrap items-center gap-3">
  <div class="flex items-center gap-2">
    <label class="text-xs font-medium text-stone-500">Bulan:</label>
    <select id="filter-bulan" onchange="gantiPeriodePengeluaran()" class="text-xs border border-stone-300 rounded px-2 py-1.5">
      ${[1,2,3,4,5,6,7,8,9,10,11,12].map(b => `<option value="${b}" ${(parseInt(bulan||new Date().getMonth()+1))===b?'selected':''}>${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][b-1]}</option>`).join('')}
    </select>
    <select id="filter-tahun" onchange="gantiPeriodePengeluaran()" class="text-xs border border-stone-300 rounded px-2 py-1.5">
      ${[2024,2025,2026,2027,2028].map(t => `<option value="${t}" ${(parseInt(tahun||new Date().getFullYear()))===t?'selected':''}>${t}</option>`).join('')}
    </select>
  </div>
  <div class="text-xs text-stone-500 font-medium">Periode: ${bulanNama} ${tahun||new Date().getFullYear()}</div>
</div>
<div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">
  <div class="bg-white border border-stone-200 rounded-lg p-3 sm:p-4">
    <div class="text-[10px] sm:text-xs uppercase tracking-wider text-stone-500 font-medium">Sisa Dana Lalu</div>
    <div class="mono text-sm sm:text-xl mt-1 sm:mt-2 font-semibold">${fmtIDR(r.sisa_dana_lalu)}</div>
  </div>
  <div class="bg-white border border-stone-200 rounded-lg p-3 sm:p-4 bg-blue-50 border-0 rounded-xl">
    <div class="text-[10px] sm:text-xs uppercase tracking-wider text-stone-500 font-medium">Dana Diterima</div>
    <div class="mono text-sm sm:text-xl mt-1 sm:mt-2 font-semibold text-blue-700">${fmtIDR(r.dana_diterima)}</div>
  </div>
  <div class="bg-white border border-stone-200 rounded-lg p-3 sm:p-4 bg-emerald-50 border-0 rounded-xl">
    <div class="text-[10px] sm:text-xs uppercase tracking-wider text-stone-500 font-medium">Dana Tersedia</div>
    <div class="mono text-sm sm:text-xl mt-1 sm:mt-2 font-semibold text-emerald-700">${fmtIDR(r.dana_tersedia)}</div>
  </div>
  <div class="bg-white border border-stone-200 rounded-lg p-3 sm:p-4 ${r.sisa_dana_saat_ini >= 0 ? 'bg-emerald-50' : 'bg-red-50'} border-0 rounded-xl">
    <div class="text-[10px] sm:text-xs uppercase tracking-wider text-stone-500 font-medium">Sisa Dana Saat Ini</div>
    <div class="mono text-sm sm:text-xl mt-1 sm:mt-2 font-semibold ${r.sisa_dana_saat_ini >= 0 ? 'text-emerald-700' : 'text-red-700'}">${fmtIDR(r.sisa_dana_saat_ini)}</div>
  </div>
</div>
<div class="bg-white border border-stone-200 rounded-lg overflow-hidden mb-4">
  <div class="px-4 py-3 font-bold text-sm border-b border-stone-200 bg-stone-50">Rincian Pengeluaran Bulanan</div>
  <table class="w-full text-xs sm:text-sm">
    <tbody>
      <tr class="border-t border-stone-100">
        <td class="px-4 py-3 font-medium">Biaya Bahan Baku</td>
        <td class="px-4 py-3 text-right mono font-semibold">${fmtIDR(r.biaya_bahan_baku)}</td>
      </tr>
      <tr class="border-t border-stone-100 bg-stone-50">
        <td class="px-4 py-3 font-medium">Biaya Operasional</td>
        <td class="px-4 py-3 text-right mono font-semibold">${fmtIDR(r.biaya_operasional)}</td>
      </tr>
      <tr class="border-t border-stone-100">
        <td class="px-4 py-3 font-medium">Biaya Insentif Fasilitas</td>
        <td class="px-4 py-3 text-right mono font-semibold">${fmtIDR(r.biaya_insentif_fasilitas)}</td>
      </tr>
      ${r.biaya_lainnya > 0 ? `<tr class="border-t border-stone-100 bg-stone-50">
        <td class="px-4 py-3 font-medium text-stone-500">Biaya Lainnya</td>
        <td class="px-4 py-3 text-right mono text-stone-500">${fmtIDR(r.biaya_lainnya)}</td>
      </tr>` : ''}
      <tr class="border-t-2 border-stone-400 bg-orange-50">
        <td class="px-4 py-3 font-bold">Total Pengeluaran</td>
        <td class="px-4 py-3 text-right mono font-bold text-red-700">${fmtIDR(r.total_pengeluaran)}</td>
      </tr>
    </tbody>
  </table>
</div>`;
    } else if (tab === 'penggunaan-anggaran') {
      var baState = lapState;
      var nowDate = new Date();
      var bln = baState.pa_bulan || String(nowDate.getMonth() + 1).padStart(2, '0');
      var thn = baState.pa_tahun || String(nowDate.getFullYear());
      var blnNama = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][parseInt(bln)-1];
      var periodeLbl = blnNama + ' ' + thn;
      var apiData = null;
      try { apiData = await api.get('/laporan/penggunaan-anggaran?bulan=' + bln + '&tahun=' + thn); } catch(e) {}
      var d = apiData || { bahan_baku: { diajukan: 0, terpakai: 0, sisa: 0 }, operasional: { diajukan: 0, terpakai: 0, sisa: 0 }, insentif: { diajukan: 0, terpakai: 0, sisa: 0 }, total: { diajukan: 0, terpakai: 0, sisa: 0 } };

      var rekening = baState.pa_rekening || '';
      var lokasi = 'sukaluyu taman sari';
      var tglStr = baState.pa_tanggal || nowDate.toISOString().slice(0,10);
      var tglPanjang = fmtDateIndonesia(tglStr);

      window['_export_penggunaan-anggaran'] = { data: [
        { kegiatan: 'Bahan Baku', diajukan: d.bahan_baku.diajukan, terpakai: d.bahan_baku.terpakai, sisa: d.bahan_baku.sisa },
        { kegiatan: 'Operasional', diajukan: d.operasional.diajukan, terpakai: d.operasional.terpakai, sisa: d.operasional.sisa },
        { kegiatan: 'Insentif Fasilitas', diajukan: d.insentif.diajukan, terpakai: d.insentif.terpakai, sisa: d.insentif.sisa },
        { kegiatan: 'Total', diajukan: d.total.diajukan, terpakai: d.total.terpakai, sisa: d.total.sisa },
      ], fields: ['kegiatan','diajukan','terpakai','sisa'] };

      window._lapStatCards =
        '<div class="max-w-4xl mx-auto">' +
        '<div class="bg-white border border-stone-200 rounded-lg p-4 sm:p-6 mb-4">' +
        '<h2 class="text-base font-bold mb-4">Laporan Penggunaan Anggaran</h2>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">' +
        '<div><label class="block text-xs font-medium text-stone-500 mb-1">Periode</label>' +
        '<select id="pa-bulan" onchange="paGantiPeriode()" class="w-full text-xs border border-stone-300 rounded px-2 py-1.5">' +
        [1,2,3,4,5,6,7,8,9,10,11,12].map(function(b) { return '<option value="' + b + '" ' + (parseInt(bln)===b?'selected':'') + '>' + ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][b-1] + '</option>'; }).join('') +
        '</select>' +
        '<select id="pa-tahun" onchange="paGantiPeriode()" class="w-full text-xs border border-stone-300 rounded px-2 py-1.5 mt-1">' +
        [2024,2025,2026,2027,2028].map(function(t) { return '<option value="' + t + '" ' + (parseInt(thn)===t?'selected':'') + '>' + t + '</option>'; }).join('') +
        '</select></div>' +
        '<div><label class="block text-xs font-medium text-stone-500 mb-1">Tanggal Laporan</label><input id="pa-tanggal" type="date" class="w-full text-xs border border-stone-300 rounded px-2 py-1.5" value="' + (baState.pa_tanggal||nowDate.toISOString().slice(0,10)) + '"></div>' +
        '<div><label class="block text-xs font-medium text-stone-500 mb-1">No. Rekening / VA</label><input id="pa-rekening" type="text" class="w-full text-xs border border-stone-300 rounded px-2 py-1.5" placeholder="-" value="' + escHtml(rekening) + '"></div>' +
        '</div>' +
        '<div class="flex gap-2 mt-4">' +
        '<button onclick="paSimpan()" class="bg-[#1e40af] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-lg text-sm font-medium">Tampilkan Dokumen</button>' +
        '<button onclick="paCetak()" class="border border-stone-300 text-stone-700 hover:bg-stone-50 px-4 py-2 rounded-lg text-sm font-medium">Cetak / Print</button>' +
        '</div></div>';

      var fmtIdr = fmtIDR;
      var docContent =
        '<div id="pa-dokumen" class="bg-white border border-stone-200 rounded-lg p-6 sm:p-8 print-area">' +

        '<h1 class="text-base font-bold text-center uppercase mb-4">Laporan Penggunaan Anggaran</h1>' +

        '<h2 class="text-sm font-bold mb-3">I. RINCIAN KEGIATAN</h2>' +
        '<table class="w-full text-xs border-collapse mb-4">' +
        '<thead><tr class="bg-stone-100">' +
        '<th class="border border-stone-300 px-3 py-2 text-left font-semibold">Nama Kegiatan</th>' +
        '<th class="border border-stone-300 px-3 py-2 text-right font-semibold">Dana Diajukan (Rp)</th>' +
        '<th class="border border-stone-300 px-3 py-2 text-right font-semibold">Dana Terpakai (Rp)</th>' +
        '<th class="border border-stone-300 px-3 py-2 text-right font-semibold">Sisa Dana (Rp)</th>' +
        '</tr></thead><tbody>' +
        '<tr><td class="border border-stone-300 px-3 py-2">Bahan Baku</td>' +
        '<td class="border border-stone-300 px-3 py-2 text-right mono">' + fmtIdr(d.bahan_baku.diajukan) + '</td>' +
        '<td class="border border-stone-300 px-3 py-2 text-right mono">' + fmtIdr(d.bahan_baku.terpakai) + '</td>' +
        '<td class="border border-stone-300 px-3 py-2 text-right mono">' + fmtIdr(d.bahan_baku.sisa) + '</td></tr>' +
        '<tr><td class="border border-stone-300 px-3 py-2">Operasional</td>' +
        '<td class="border border-stone-300 px-3 py-2 text-right mono">' + fmtIdr(d.operasional.diajukan) + '</td>' +
        '<td class="border border-stone-300 px-3 py-2 text-right mono">' + fmtIdr(d.operasional.terpakai) + '</td>' +
        '<td class="border border-stone-300 px-3 py-2 text-right mono">' + fmtIdr(d.operasional.sisa) + '</td></tr>' +
        '<tr><td class="border border-stone-300 px-3 py-2">Insentif Fasilitas</td>' +
        '<td class="border border-stone-300 px-3 py-2 text-right mono">' + fmtIdr(d.insentif.diajukan) + '</td>' +
        '<td class="border border-stone-300 px-3 py-2 text-right mono">' + fmtIdr(d.insentif.terpakai) + '</td>' +
        '<td class="border border-stone-300 px-3 py-2 text-right mono">' + fmtIdr(d.insentif.sisa) + '</td></tr>' +
        '<tr class="font-bold bg-stone-50">' +
        '<td class="border border-stone-300 px-3 py-2.5">Total</td>' +
        '<td class="border border-stone-300 px-3 py-2.5 text-right mono">' + fmtIdr(d.total.diajukan) + '</td>' +
        '<td class="border border-stone-300 px-3 py-2.5 text-right mono">' + fmtIdr(d.total.terpakai) + '</td>' +
        '<td class="border border-stone-300 px-3 py-2.5 text-right mono">' + fmtIdr(d.total.sisa) + '</td></tr>' +
        '</tbody></table>' +

        '<h2 class="text-sm font-bold mb-3">II. KETERANGAN</h2>' +
        '<p class="text-xs mb-3 leading-relaxed">Dana yang telah digunakan ini adalah untuk kebutuhan kegiatan yang telah direncanakan, dengan rincian sebagai berikut:</p>' +
        '<ul class="text-xs mb-3 list-disc pl-5 leading-relaxed">' +
        '<li><strong>Bahan Baku:</strong> Pengadaan bahan baku untuk pelaksanaan kegiatan.</li>' +
        '<li><strong>Operasional:</strong> Biaya untuk transportasi, ATK, konsumsi, dan keperluan teknis lainnya.</li>' +
        '<li><strong>Insentif Fasilitas:</strong> Dukungan insentif fasilitas sesuai kebutuhan operasional.</li>' +
        '</ul>' +
        '<p class="text-xs mb-1">Nomor rekening/Virtual Account: ' + escHtml(rekening || '-') + '</p>' +
        '<p class="text-xs mb-3">Sisa dana sebesar <strong>' + fmtIdr(d.total.sisa) + '</strong> akan dialihkan ke periode berikutnya.</p>' +

        '<h2 class="text-sm font-bold mb-3">III. PENUTUP</h2>' +
        '<p class="text-xs mb-8 leading-relaxed">Dengan ini laporan penggunaan anggaran disampaikan untuk dipergunakan sebagaimana mestinya.</p>' +

        '<div class="grid grid-cols-2 gap-8 text-xs mt-10">' +
        '<div class="text-center">' +
        '<p class="mb-1">' + lokasi + ', ' + tglPanjang + '</p>' +
        '<p class="font-semibold mb-1">Pihak Pertama,</p>' +
        '<div class="mt-12">( &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; )</div>' +
        '</div>' +
        '<div class="text-center">' +
        '<p class="mb-1">' + lokasi + ', ' + tglPanjang + '</p>' +
        '<p class="font-semibold mb-1">Pihak Kedua,</p>' +
        '<div class="mt-12">( &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; )</div>' +
        '<p class="mt-2 font-semibold">SPPG SUKALUYU</p>' +
        '</div></div></div>';

      window._lapStatCards += docContent;
      window._lapData = null;
    } else if (tab === 'bp-kas') {
      var kasState = lapState;
      var kasNow = new Date();
      var kasBulan = kasState.bpkas_bulan || String(kasNow.getMonth() + 1).padStart(2, '0');
      var kasTahun = kasState.bpkas_tahun || String(kasNow.getFullYear());
      var kasData = null;
      try { kasData = await api.get('/laporan/bp-kas?bulan=' + kasBulan + '&tahun=' + kasTahun); } catch(e) {}
      var d = kasData || { periode: '', total_saldo_awal: 0, total_masuk: 0, total_keluar: 0, total_saldo_akhir: 0, akun_data: [], akun_list: [] };

      var totalSa = fmtIDR(d.total_saldo_awal);
      var totalMi = fmtIDR(d.total_masuk);
      var totalKk = fmtIDR(d.total_keluar);
      var totalSaAkhir = fmtIDR(d.total_saldo_akhir);
      var akunData = d.akun_data || [];
      var akunList = d.akun_list || [];

      var expandedKey = kasState.bpkas_expanded || null;

      var akunRows = '';
      akunData.forEach(function(a) {
        var isExpanded = (expandedKey === String(a.akun_id));
        var detailHtml = '';
        if (isExpanded && a.transaksi && a.transaksi.length) {
          detailHtml = '<tr id="bpkas-detail-' + a.akun_id + '" class="bg-stone-50"><td colspan="6" class="px-4 py-2">' +
            '<table class="w-full text-[10px]">' +
            '<thead><tr class="text-stone-500 border-b border-stone-200">' +
            '<th class="px-2 py-1 text-left">Tanggal</th><th class="px-2 py-1 text-left">No Transaksi</th>' +
            '<th class="px-2 py-1 text-left">Tipe</th><th class="px-2 py-1 text-left">Kategori</th>' +
            '<th class="px-2 py-1 text-left">Deskripsi</th><th class="px-2 py-1 text-right">Jumlah</th></tr></thead><tbody>';
          a.transaksi.forEach(function(t) {
            detailHtml += '<tr class="border-b border-stone-100">' +
              '<td class="px-2 py-1">' + fmtDate(t.tanggal) + '</td>' +
              '<td class="px-2 py-1">' + escHtml(t.no_transaksi||'-') + '</td>' +
              '<td class="px-2 py-1"><span class="' + (t.tipe==='masuk'?'text-green-600':'text-red-600') + ' font-medium">' + t.tipe + '</span></td>' +
              '<td class="px-2 py-1">' + escHtml(t.kategori||'-') + '</td>' +
              '<td class="px-2 py-1">' + escHtml(t.deskripsi||'-') + '</td>' +
              '<td class="px-2 py-1 text-right mono">' + fmtIDR(t.jumlah) + '</td></tr>';
          });
          detailHtml += '</tbody></table></td></tr>';
        }
        var sisa = a.total_masuk - a.total_keluar;
        akunRows += '<tr class="border-t border-stone-100 hover:bg-stone-50 cursor-pointer" onclick="bpkasToggle(' + a.akun_id + ')">' +
          '<td class="px-3 py-2 text-xs">' + escHtml(a.akun_kode) + '</td>' +
          '<td class="px-3 py-2 text-xs font-medium">' + escHtml(a.akun_nama) + '</td>' +
          '<td class="px-3 py-2 text-xs text-right mono">' + fmtIDR(a.saldo_awal) + '</td>' +
          '<td class="px-3 py-2 text-xs text-right mono text-green-600">' + fmtIDR(a.total_masuk) + '</td>' +
          '<td class="px-3 py-2 text-xs text-right mono text-red-600">' + fmtIDR(a.total_keluar) + '</td>' +
          '<td class="px-3 py-2 text-xs text-right mono font-semibold">' + fmtIDR(a.saldo_akhir) + '</td></tr>' +
          detailHtml;
      });

      var listBadge = '';
      if (akunList.length) {
        listBadge = akunList.map(function(a) { return '<span class="inline-block bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full">' + escHtml(a.kode) + ' - ' + escHtml(a.nama) + '</span>'; }).join(' ');
        listBadge = '<div class="mt-3 flex flex-wrap gap-1">' + listBadge + '</div>';
      }

      window['_export_bp-kas'] = { data: akunData, fields: ['akun_kode','akun_nama','saldo_awal','total_masuk','total_keluar','saldo_akhir'] };

      window._lapStatCards =
        '<div class="mb-4 flex flex-wrap items-center gap-3">' +
        '<div class="flex items-center gap-2">' +
        '<label class="text-xs font-medium text-stone-500">Bulan:</label>' +
        '<select id="bpkas-bulan" onchange="bpkasFilter()" class="text-xs border border-stone-300 rounded px-2 py-1.5">' +
        [1,2,3,4,5,6,7,8,9,10,11,12].map(function(b) { return '<option value="' + b + '" ' + (parseInt(kasBulan)===b?'selected':'') + '>' + ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][b-1] + '</option>'; }).join('') +
        '</select>' +
        '<select id="bpkas-tahun" onchange="bpkasFilter()" class="text-xs border border-stone-300 rounded px-2 py-1.5">' +
        [2024,2025,2026,2027,2028].map(function(t) { return '<option value="' + t + '" ' + (parseInt(kasTahun)===t?'selected':'') + '>' + t + '</option>'; }).join('') +
        '</select></div></div>' +
        '<div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">' +
        '<div class="bg-white border border-stone-200 rounded-lg p-3 sm:p-4 bg-stone-50 border-0 rounded-xl"><div class="text-[10px] sm:text-xs uppercase tracking-wider text-stone-500 font-medium">Saldo Awal</div><div class="mono text-sm sm:text-xl mt-1 sm:mt-2 font-semibold">' + totalSa + '</div></div>' +
        '<div class="bg-white border border-stone-200 rounded-lg p-3 sm:p-4 bg-blue-50 border-0 rounded-xl"><div class="text-[10px] sm:text-xs uppercase tracking-wider text-stone-500 font-medium">Debit (Masuk)</div><div class="mono text-sm sm:text-xl mt-1 sm:mt-2 font-semibold text-blue-700">' + totalMi + '</div></div>' +
        '<div class="bg-white border border-stone-200 rounded-lg p-3 sm:p-4 bg-orange-50 border-0 rounded-xl"><div class="text-[10px] sm:text-xs uppercase tracking-wider text-stone-500 font-medium">Kredit (Keluar)</div><div class="mono text-sm sm:text-xl mt-1 sm:mt-2 font-semibold text-orange-700">' + totalKk + '</div></div>' +
        '<div class="bg-white border border-stone-200 rounded-lg p-3 sm:p-4 bg-emerald-50 border-0 rounded-xl"><div class="text-[10px] sm:text-xs uppercase tracking-wider text-stone-500 font-medium">Saldo Akhir</div><div class="mono text-sm sm:text-xl mt-1 sm:mt-2 font-semibold text-emerald-700">' + totalSaAkhir + '</div></div>' +
        '</div>' +
        '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden">' +
        '<div class="overflow-x-auto"><table class="w-full text-xs">' +
        '<thead class="bg-stone-50"><tr>' +
        '<th class="text-left px-3 py-2.5 text-[10px] font-semibold uppercase">Kode</th>' +
        '<th class="text-left px-3 py-2.5 text-[10px] font-semibold uppercase">Nama Akun</th>' +
        '<th class="text-right px-3 py-2.5 text-[10px] font-semibold uppercase">Saldo Awal</th>' +
        '<th class="text-right px-3 py-2.5 text-[10px] font-semibold uppercase">Debit</th>' +
        '<th class="text-right px-3 py-2.5 text-[10px] font-semibold uppercase">Kredit</th>' +
        '<th class="text-right px-3 py-2.5 text-[10px] font-semibold uppercase">Saldo Akhir</th></tr></thead><tbody>' +
        (akunRows || '<tr><td colspan="6" class="text-center py-8 text-stone-400">Belum ada transaksi BP Kas periode ini</td></tr>') +
        '<tr class="border-t-2 border-stone-400 font-bold bg-stone-100">' +
        '<td colspan="2" class="px-3 py-2.5 text-xs">TOTAL</td>' +
        '<td class="px-3 py-2.5 text-right text-xs mono">' + totalSa + '</td>' +
        '<td class="px-3 py-2.5 text-right text-xs mono text-green-700">' + totalMi + '</td>' +
        '<td class="px-3 py-2.5 text-right text-xs mono text-red-700">' + totalKk + '</td>' +
        '<td class="px-3 py-2.5 text-right text-xs mono">' + totalSaAkhir + '</td></tr>' +
        '</tbody></table></div></div>' + listBadge;

      window._lapData = null;
    } else {
      const d = await api.get('/laporan/keuangan');
      const rows = d.transaksi || [];
      window._lapData = { tab, rows, headers: ['Tanggal','Tipe','Kategori','BP','Akun','Deskripsi','Jumlah'], fields: ['tanggal','tipe','kategori','akun_bp','akun_label','deskripsi','jumlah'],
        fmt: rows.map(t => [fmtDate(t.tanggal), t.tipe, t.kategori||'-', t.akun_bp||'-', t.akun_kode ? t.akun_kode+' - '+t.akun_nama : t.akun||'-', t.deskripsi||'-', fmtIDR(t.jumlah)]) };
      window['_export_keuangan'] = { data: rows, fields: ['tanggal','tipe','kategori','akun_bp','akun','deskripsi','jumlah'] };
      let bpCards = '';
      if (d.by_bp && d.by_bp.length) {
        bpCards = '<div class="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-4">' +
          d.by_bp.map(b => statCard(b.bp, fmtIDR(b.masuk - b.keluar), b.transaksi + ' transaksi', 'bg-stone-50')).join('') +
          '</div>';
      }
      window._lapStatCards = `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
        ${statCard('Saldo Awal Buku', fmtIDR(d.saldo_awal),
          `<button onclick="editSaldoAwal(${d.saldo_awal})" class="text-[10px] text-blue-600 hover:text-blue-800 underline">ubah</button>`, 'bg-stone-50')}
        ${statCard('Kas Masuk', fmtIDR(d.total_kas_masuk), '', 'bg-blue-50')}
        ${statCard('Kas Keluar', fmtIDR(d.total_kas_keluar), '', 'bg-orange-50')}
        ${statCard('Saldo Akhir', fmtIDR(d.saldo), 'saldo_awal + masuk - keluar', 'bg-emerald-50')}
      </div>` + bpCards;
    }
    renderLapPage();
  } catch (err) {
    console.error('showLap error:', err);
    wrap.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat laporan: ${err.message}</div>`;
  }
}

function renderLapPage() {
  const wrap = document.getElementById('lap-content');
  const ld = window._lapData;
  if (!ld) {
    if (window._lapStatCards) wrap.innerHTML = window._lapStatCards;
    return;
  }
  const totalPages = Math.ceil(ld.fmt.length / LAP_PAGE_SIZE) || 1;
  const page = Math.min(lapState.page, totalPages);
  const start = (page - 1) * LAP_PAGE_SIZE;
  const end = start + LAP_PAGE_SIZE;
  const pageData = ld.fmt.slice(start, end);

  let html = (window._lapStatCards || '') + tableHtml(ld.headers, pageData);

  if (totalPages > 1) {
    const prevBtn = page > 1 ? `<button onclick="lapGoToPage(${page - 1})" class="px-2 py-1 text-sm rounded border border-stone-200 hover:bg-stone-50">Prev</button>` : '';
    const nextBtn = page < totalPages ? `<button onclick="lapGoToPage(${page + 1})" class="px-2 py-1 text-sm rounded border border-stone-200 hover:bg-stone-50">Next</button>` : '';
    html += `<div class="flex items-center justify-between mt-3">
      <span class="text-sm text-stone-500">Hal ${page} dari ${totalPages}</span>
      <div class="flex gap-2">${prevBtn}${nextBtn}</div>
    </div>`;
  }

  wrap.innerHTML = html;
}

function lapGoToPage(p) {
  lapState.page = p;
  renderLapPage();
}
function statCard(title, value, sub, bgClass) {
  return `<div class="bg-white border border-stone-200 rounded-lg p-3 sm:p-4 ${bgClass ? 'rounded-xl border-0' : ''}">
    <div class="text-[10px] sm:text-xs uppercase tracking-wider text-stone-500 font-medium">${title}</div>
    <div class="mono text-sm sm:text-xl mt-1 sm:mt-2 font-semibold break-all">${value}</div>
    ${sub ? `<div class="text-[10px] sm:text-xs text-stone-500 mt-0.5 sm:mt-1">${sub}</div>` : ''}
  </div>`;
}
function tableHtml(headers, rows) {
  return `<div class="bg-white border border-stone-200 rounded-lg overflow-hidden mt-3"><div class="overflow-x-auto"><table class="w-full">
    <thead class="bg-stone-50"><tr>${headers.map(h => `<th class="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-[10px] sm:text-xs font-semibold uppercase tracking-wider whitespace-nowrap">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map(r => `<tr class="border-t border-stone-100 transition-colors">${r.map(c => `<td class="px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm whitespace-nowrap leading-relaxed">${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="text-center py-8 sm:py-12 text-stone-400"><svg class="w-10 h-10 sm:w-14 sm:h-14 mx-auto mb-2 sm:mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg><div class="text-xs sm:text-sm">Belum ada data</div></td></tr>`}</tbody>
  </table></div></div>`;
}
function exportBar(name, data, fields) {
  window['_export_'+name] = { data, fields };
  return `<div class="flex flex-wrap gap-2 mb-2 mt-3">
    <button onclick="exportXlsxLaporan('${name}')" class="border border-stone-300 px-3 py-1.5 rounded text-sm"><svg class="w-4 h-4 -mt-0.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> XLSX</button>
  </div>`;
}
function exportCSV(name) {
  const { data, fields } = window['_export_'+name];
  if (!data.length) return showAlert('Tidak ada data', 'warning');
  const csv = [fields.join(','), ...data.map(r => fields.map(f => `"${(r[f] ?? '').toString().replace(/"/g,'""')}"`).join(','))].join('\n');
  const blob = new Blob(['\ufeff'+csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `laporan-${name}.csv`; a.click();
}
function exportXlsxLaporan(name) {
  const { data, fields } = window['_export_'+name];
  if (!data.length) return showAlert('Tidak ada data', 'warning');
  const clean = data.map(r => Object.fromEntries(fields.map(f => [f, r[f] ?? ''])));
  const ws = XLSX.utils.json_to_sheet(clean);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, name);
  XLSX.writeFile(wb, `laporan-${name}.xlsx`);
}
function lapExport() {
  const tab = lapState.tab;
  exportXlsxLaporan(tab);
}

function fmt2(v) {
  return Number(v || 0).toFixed(2);
}

function gantiPeriodePengeluaran() {
  const bulan = document.getElementById('filter-bulan').value;
  const tahun = document.getElementById('filter-tahun').value;
  lapState.bulan = bulan;
  lapState.tahun = tahun;
  showLap('pengeluaran-bulanan');
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function bpkasToggle(akunId) {
  var key = String(akunId);
  if (lapState.bpkas_expanded === key) lapState.bpkas_expanded = null;
  else lapState.bpkas_expanded = key;
  showLap('bp-kas');
}

function bpkasFilter() {
  lapState.bpkas_bulan = document.getElementById('bpkas-bulan').value;
  lapState.bpkas_tahun = document.getElementById('bpkas-tahun').value;
  showLap('bp-kas');
}

function paSimpan() {
  lapState.pa_bulan = document.getElementById('pa-bulan').value;
  lapState.pa_tahun = document.getElementById('pa-tahun').value;
  lapState.pa_tanggal = document.getElementById('pa-tanggal').value;
  lapState.pa_rekening = document.getElementById('pa-rekening').value;
  showLap('penggunaan-anggaran');
}

function paCetak() {
  var el = document.getElementById('pa-dokumen');
  if (!el) return showAlert('Tampilkan dokumen terlebih dahulu', 'warning');
  var win = window.open('', '_blank');
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Laporan Penggunaan Anggaran</title>';
  html += '<style>body{font-family:"Times New Roman",serif;padding:40px 60px;font-size:12pt;line-height:1.5;color:#000}';
  html += 'table{width:100%;border-collapse:collapse}td,th{border:1px solid #000;padding:6px 10px;font-size:11pt}';
  html += 'h1{font-size:16pt;text-align:center;text-transform:uppercase;letter-spacing:1px;margin-bottom:20px}';
  html += 'h2{font-size:13pt;margin-top:16px;margin-bottom:8px}';
  html += '.grid{display:flex;justify-content:space-between;margin-top:60px}';
  html += '.grid>div{text-align:center;width:45%}';
  html += 'ul{padding-left:20px}';
  html += '.mt-12{margin-top:80px}';
  html += '@media print{body{padding:30px 40px}}</style></head><body>';
  html += el.innerHTML;
  html += '</body></html>';
  win.document.write(html);
  win.document.close();
  setTimeout(function() { win.print(); }, 500);
}

function paGantiPeriode() {
  lapState.pa_bulan = document.getElementById('pa-bulan').value;
  lapState.pa_tahun = document.getElementById('pa-tahun').value;
  showLap('penggunaan-anggaran');
}

function fmtDateIndonesia(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  const hari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return hari[d.getDay()] + ', ' + d.getDate() + ' ' + bulan[d.getMonth()] + ' ' + d.getFullYear();
}
function editSaldoAwal(current) {
  const amount = prompt('Masukkan Saldo Awal Buku (Rp):', fmtIDR(current).replace(/[^0-9]/g,''));
  if (amount === null) return;
  const val = parseFloat(amount.replace(/[^0-9.]/g,''));
  if (isNaN(val) || val < 0) return showAlert('Nilai tidak valid', 'error');
  api.put('/keuangan/saldo-awal', { saldo_awal: val }).then(r => {
    if (r.ok) { showAlert('Saldo awal berhasil disimpan', 'success'); showLap('keuangan'); }
  }).catch(e => showAlert('Gagal: ' + e.message, 'error'));
}

function renderDailyMenuTable(menuHarian, kategori_order) {
  const siklus = menuHarian || [];
  if (!siklus.length) return '<div class="p-8 text-center text-stone-400">Belum ada data siklus</div>';

  const KAT_MAP = { Karbohidrat: 'Makanan Pokok', 'Protein Hewani': 'Lauk Hewani', 'Protein Nabati': 'Lauk Nabati', Sayur: 'Sayur', Buah: 'Buah', Susu: 'Susu', Minyak: 'Minyak' };
  const ROW_KEYS = ['Karbohidrat', 'Protein Hewani', 'Protein Nabati', 'Sayur', 'Buah', 'Susu'];
  const ROW_LABELS = ROW_KEYS.map(k => KAT_MAP[k] || k);

  let maxHari = 0;
  for (const s of siklus) {
    for (const d of s.days) {
      if (d.hari_ke > maxHari) maxHari = d.hari_ke;
    }
  }
  if (!maxHari) return '<div class="p-8 text-center text-stone-400">Belum ada hari terisi</div>';

  const dayKeys = Array.from({ length: maxHari }, (_, i) => i + 1);

  let html = '<div class="overflow-x-auto text-xs leading-relaxed">';
  html += '<table class="w-full border-collapse border border-stone-300">';

  html += '<thead>';
  html += '<tr class="bg-amber-400 text-center font-bold">';
  html += '<th class="border border-stone-300 px-3 py-2 text-[11px]" style="color:#000">Kelompok Bahan Makanan</th>';
  for (const k of dayKeys) {
    const dayNama = kategori_order && siklus.length && siklus[0].days[k-1] ? siklus[0].days[k-1].hari_nama : '';
    html += `<th class="border border-stone-300 px-3 py-2 text-center text-[11px]" style="color:#000">Menu ${k}<br><span class="text-[10px] font-normal">${dayNama}</span></th>`;
  }
  html += '</tr>';
  html += '</thead>';

  html += '<tbody>';

  for (let ri = 0; ri < ROW_KEYS.length; ri++) {
    const rowLabel = ROW_LABELS[ri];
    const isFirst = ri === 0;

    html += `<tr class="border border-stone-300 ${isFirst ? 'bg-sky-50' : ''}">`;
    html += `<td class="border border-stone-300 px-3 py-2 font-bold ${isFirst ? 'bg-sky-50' : ''}">${rowLabel}</td>`;

    for (const k of dayKeys) {
      const names = [];
      for (const s of siklus) {
        for (const d of s.days) {
          if (d.hari_ke === k) {
            const katItems = d.kategori && d.kategori[ROW_KEYS[ri]];
            if (katItems && katItems.length) {
              for (const n of katItems) {
                if (!names.includes(n)) names.push(n);
              }
            }
          }
        }
      }
      let cell = '<span class="text-stone-300">-</span>';
      if (names.length) {
        cell = names.map(n => `<div class="text-[10px] py-0.5">${n}</div>`).join('');
      }
      html += `<td class="border border-stone-300 px-3 py-2 align-top">${cell}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  return html;
}

function renderResepTable(siklus, kategori_order) {
  if (!siklus.length) return '<div class="p-8 text-center text-stone-400">Tidak ada siklus aktif</div>';

  const KAT_MAP = { Karbohidrat: 'Makanan Pokok', 'Protein Hewani': 'Lauk Hewani', 'Protein Nabati': 'Lauk Nabati', Sayur: 'Sayur', Buah: 'Buah', Susu: 'Susu', Minyak: 'Minyak' };
  const ROW_KEYS = ['Karbohidrat', 'Protein Hewani', 'Protein Nabati', 'Sayur', 'Buah', 'Susu'];

  // Flatten all days from all siklus, group by hari_ke
  const byDay = {};
  for (const s of siklus) {
    for (const d of s.days) {
      if (!d.menu_id) continue;
      const key = d.hari_ke;
      if (!byDay[key]) {
        byDay[key] = { hari_ke: d.hari_ke, hari_nama: d.hari_nama, catNames: {} };
        for (const rk of ROW_KEYS) byDay[key].catNames[rk] = [];
      }
      const parts = (d.menu_nama || '').split(/[+,]/).map(s => s.trim()).filter(Boolean);
      const catWithItems = ROW_KEYS.filter(k2 => d.kategori && d.kategori[k2] && d.kategori[k2].length > 0);
      let pi = 0;
      for (const ck of catWithItems) {
        const name = pi < parts.length ? parts[pi] : (d.menu_nama || '');
        if (!byDay[key].catNames[ck].includes(name)) byDay[key].catNames[ck].push(name);
        pi++;
      }
    }
  }

  const dayKeys = Object.keys(byDay).sort((a, b) => Number(a) - Number(b));
  if (!dayKeys.length) return '<div class="p-8 text-center text-stone-400">Belum ada data menu terisi</div>';

  let html = '<div class="overflow-x-auto">';
  html += '<table class="w-full border-collapse border border-stone-300 text-xs">';
  html += '<thead>';
  html += '<tr class="bg-amber-400 text-center font-bold">';
  html += '<th class="border border-stone-300 px-3 py-2 text-[11px]" style="color:#000">Kelompok Bahan Makanan</th>';
  for (const k of dayKeys) {
    const d = byDay[k];
    html += `<th class="border border-stone-300 px-3 py-2 text-center text-[11px]" style="color:#000">Menu ${k}<br><span class="text-[10px] font-normal">${d.hari_nama}</span></th>`;
  }
  html += '</tr>';
  html += '</thead>';
  html += '<tbody>';

  for (let ri = 0; ri < ROW_KEYS.length; ri++) {
    const rk = ROW_KEYS[ri];
    const label = KAT_MAP[rk] || rk;
    const isFirst = ri === 0;
    html += `<tr class="border border-stone-300 ${isFirst ? 'bg-emerald-50' : ''}">`;
    html += `<td class="border border-stone-300 px-3 py-2 font-bold ${isFirst ? 'bg-emerald-50' : ''}">${label}</td>`;

    for (const k of dayKeys) {
      const d = byDay[k];
      const names = d.catNames[rk];
      const cell = names.length
        ? names.map(n => `<div class="py-0.5 font-medium text-teal-700">${n}</div>`).join('')
        : '<span class="text-stone-300">—</span>';
      html += `<td class="border border-stone-300 px-3 py-2 align-top">${cell}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  return html;
}



