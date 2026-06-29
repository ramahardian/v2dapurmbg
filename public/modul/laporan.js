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
const LAP_TABS = ['siklus', 'hpp', 'persediaan', 'produksi', 'distribusi', 'rab'];
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
    if (tab === 'budget') {
      const rows = await api.get('/budget');
      window._lapData = { tab, rows, headers: ['Periode','Kategori','Penerima','Budget','Realisasi','Selisih'], fields: ['periode','kategori_penerima','jumlah_penerima','total_budget','realisasi'],
        fmt: rows.map(b => [b.periode, b.kategori_penerima||'-', fmtNum(b.jumlah_penerima), fmtIDR(b.total_budget), fmtIDR(b.realisasi), fmtIDR(b.total_budget - b.realisasi)]) };
      window['_export_budget'] = { data: rows, fields: ['periode','kategori_penerima','jumlah_penerima','total_budget','realisasi'] };
      window._lapStatCards = '';
    } else if (tab === 'persediaan') {
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
    } else if (tab === 'siklus') {
      const [lapRes, bahanRes] = await Promise.all([
        api.get('/siklus/laporan'),
        api.get('/siklus/laporan/bahan'),
      ]);
      const { siklus, ringkasan } = lapRes;
      const { days, fixed_kategori } = bahanRes;
      const FKC = fixed_kategori || FIXED_KATEGORI_LAP;
      const headers = ['Nama Siklus','Kategori','Porsi/Hari','Hari','Terisi','Coverage','Rata Kalori','Rata Protein','Rata Karbo','Rata Lemak','Rata Serat'];
      const fields = ['nama','kategori_penerima','jumlah_porsi','stats.totalDays','stats.filledDays','stats.coverage','stats.avg.kalori','stats.avg.protein','stats.avg.karbohidrat','stats.avg.lemak','stats.avg.serat'];
      const fmt = siklus.map(s => [
        s.nama, s.kategori_penerima||'-', fmtNum(s.jumlah_porsi),
        s.stats.totalDays, s.stats.filledDays, s.stats.coverage + '%',
        fmtNum(s.stats.avg.kalori), fmtNum(s.stats.avg.protein), fmtNum(s.stats.avg.karbohidrat),
        fmtNum(s.stats.avg.lemak), fmtNum(s.stats.avg.serat)
      ]);
      window._lapData = { tab: 'siklus', rows: siklus, headers, fields, fmt };
      window['_export_siklus'] = { data: siklus.map(s => ({ ...s, ...s.stats.avg, totalHari: s.stats.totalDays, filledDays: s.stats.filledDays, coverage: s.stats.coverage })), fields: ['nama','kategori_penerima','jumlah_porsi','totalHari','filledDays','coverage','kalori','protein','karbohidrat','lemak','serat'] };
      window._lapBahanHtml = days.length ? renderSiklusBahanTable(days, fixed_kategori) : '<div class="text-center py-12 text-stone-400"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg><div class="text-sm">Belum ada data siklus dengan menu terisi</div></div>';
      window._lapStatCards = `<div class="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 mb-4">
        ${statCard('Total Siklus', fmtNum(ringkasan.totalSiklus), 'siklus', 'bg-rose-50')}
        ${statCard('Total Hari', fmtNum(ringkasan.totalHari), 'hari siklus', 'bg-blue-50')}
        ${statCard('Hari Terisi', fmtNum(ringkasan.totalFilled), ringkasan.rataCoverage + '% coverage', 'bg-emerald-50')}
        ${statCard('Hari Kosong', fmtNum(ringkasan.totalKosong), 'belum terisi', 'bg-orange-50')}
        ${statCard('Menu Unik', fmtNum(ringkasan.totalMenuUnik), 'menu digunakan', 'bg-violet-50')}
      </div>
      <div class="flex justify-end mb-2">
        <button onclick="exportSiklusBahan()" class="border border-rose-300 text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Export Rencana Bahan XLSX
        </button>
      </div>
      <div id="siklus-bahan-table"></div>`;
    } else if (tab === 'pembelian') {
      const r = await api.get('/laporan/pembelian');
      const rows = r.rows || [];
      window._lapData = { tab, rows, headers: ['No PO','Tanggal','Supplier','Total','Status'], fields: ['no_po','tanggal','supplier_nama','total_nilai','status'],
        fmt: rows.map(d => [d.no_po, fmtDate(d.tanggal), d.supplier_nama||'-', fmtIDR(d.total_nilai), d.status]) };
      window['_export_pembelian'] = { data: rows, fields: ['no_po','tanggal','supplier_nama','total_nilai','status'] };
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
      window['_export_laba_rugi'] = { data: rows, fields: ['periode','pendapatan','biaya'] };
      window._lapStatCards = `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
        ${statCard('Total Pendapatan', fmtIDR(r.totalPendapatan), '', 'bg-emerald-50')}
        ${statCard('Total Biaya', fmtIDR(r.totalBiayaAll), 'termasuk gaji & PO', 'bg-orange-50')}
        ${statCard('Biaya Gaji', fmtIDR(r.totalGaji), '', 'bg-pink-50')}
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
    } else {
      const d = await api.get('/laporan/keuangan');
      const rows = d.transaksi || [];
      window._lapData = { tab, rows, headers: ['Tanggal','Tipe','Kategori','Deskripsi','Jumlah'], fields: ['tanggal','tipe','kategori','deskripsi','jumlah'],
        fmt: rows.map(t => [fmtDate(t.tanggal), t.tipe, t.kategori||'-', t.deskripsi||'-', fmtIDR(t.jumlah)]) };
      window['_export_keuangan'] = { data: rows, fields: ['tanggal','tipe','kategori','deskripsi','jumlah'] };
      window._lapStatCards = `<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-4">
        ${statCard('Kas Masuk', fmtIDR(d.total_kas_masuk), '', 'bg-blue-50')}
        ${statCard('Kas Keluar', fmtIDR(d.total_kas_keluar), '', 'bg-orange-50')}
        ${statCard('Saldo', fmtIDR(d.saldo), '', 'bg-blue-50')}
      </div>`;
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
  if (!ld) return;
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

  // Append bahan table for siklus tab
  if (ld.tab === 'siklus' && window._lapBahanHtml) {
    const FKC = FIXED_KATEGORI_LAP;
    html += `<div class="mt-6 bg-white border border-stone-200 rounded-lg overflow-hidden">
      <div class="px-4 py-3 font-bold text-sm border-b border-stone-200">Rencana Kebutuhan Bahan Pangan</div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs print:text-[9px]">
          <thead class="bg-[#1e40af] text-white">
            <tr>
              <th class="px-3 py-2.5 text-center font-bold whitespace-nowrap">Bahan Pangan</th>
              ${FKC.map(k => `<th class="px-3 py-2.5 text-center font-bold whitespace-nowrap">${k}</th>`).join('')}
              <th class="px-3 py-2.5 text-center font-bold whitespace-nowrap">Total Porsi</th>
              <th class="px-3 py-2.5 text-center font-bold whitespace-nowrap">Kebutuhan Pangan (kg)</th>
              <th class="px-3 py-2.5 text-center font-bold whitespace-nowrap">Buffer 1–10%</th>
              <th class="px-3 py-2.5 text-center font-bold whitespace-nowrap">Rincian Pembelian</th>
            </tr>
          </thead>
          <tbody>${window._lapBahanHtml}</tbody>
        </table>
      </div>
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
    <thead class="bg-stone-50"><tr>${headers.map(h => `<th class="text-left px-2 sm:px-4 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold uppercase whitespace-nowrap">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map(r => `<tr class="border-t border-stone-100">${r.map(c => `<td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm whitespace-nowrap">${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="text-center py-8 sm:py-12 text-stone-400"><svg class="w-10 h-10 sm:w-14 sm:h-14 mx-auto mb-2 sm:mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg><div class="text-xs sm:text-sm">Belum ada data</div></td></tr>`}</tbody>
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
  const ws = XLSX.utils.json_to_sheet(data, { header: fields });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, name);
  XLSX.writeFile(wb, `laporan-${name}.xlsx`);
}
function lapExport() {
  const tab = lapState.tab;
  exportXlsxLaporan(tab);
}

const FIXED_KATEGORI_LAP = ['TK/PAUD', 'SD/MI (1-3)', 'SD/MI (4-6)', 'SMP/MTs, SMA/SMK', 'Bumil/Busui', 'Balita'];

function fmt2(v) {
  return Number(v || 0).toFixed(2);
}

function rincianPembelian(totalKg, satuan) {
  const s = (satuan || 'kg').toLowerCase();
  if (s === 'kg' || s === 'gram' || s === 'g') return fmt2(totalKg) + ' kg';
  if (s === 'pcs' || s === 'buah' || s === 'biji') return Math.ceil(totalKg) + ' pcs';
  if (s === 'ekor') return Math.ceil(totalKg) + ' ekor';
  if (s === 'ikat') return Math.ceil(totalKg) + ' ikat';
  if (s === 'tray') return Math.ceil(totalKg) + ' tray';
  if (s === 'dus' || s === 'karton') return Math.ceil(totalKg) + ' dus';
  if (s === 'liter' || s === 'lt') return fmt2(totalKg) + ' liter';
  if (s === 'ml') return fmt2(totalKg * 1000) + ' ml';
  return fmt2(totalKg) + ' ' + (satuan || 'kg');
}

async function exportSiklusBahan() {
  try {
    const { days, fixed_kategori } = await api.get('/siklus/laporan/bahan');
    const FKC = fixed_kategori || FIXED_KATEGORI_LAP;
    const hasBahan = days.some(d => d.bahan.length > 0);

    const colLabels = ['Bahan Pangan', ...FKC, 'Total Porsi', 'Kebutuhan Pangan (kg)', 'Buffer 1–10%', 'Rincian Pembelian'];
    const totalCols = colLabels.length;
    const colWidths = [28, ...FKC.map(() => 14), 12, 16, 14, 22];

    const wsData = [];
    let rowIdx = 0;

    // Row 0: Title
    wsData.push(['Laporan Rencana Kebutuhan Bahan Pangan']);
    rowIdx++;

    // Row 1: Headers
    wsData.push(colLabels);
    rowIdx++;

    for (const day of days) {
      // Day header row
      wsData.push([day.label]);
      rowIdx++;

      if (!hasBahan) {
        wsData.push(['(Belum ada data bahan — isi komposisi bahan di setiap menu terlebih dahulu)']);
        rowIdx++;
      } else {
        let subTotalGram = 0;
        let subTotalPorsi = 0;

        for (const b of day.bahan) {
          const row = [b.bahan_nama];
          let totalGram = 0;
          for (const kat of FKC) {
            const val = b.per_kategori[kat] || 0;
            row.push(val ? fmt2(val) : '0,00');
            totalGram += val;
          }
          const totalKg = totalGram / 1000;
          const buffer = totalKg * 1.1;
          const totalPorsi = day.porsi_per_kat
            ? Object.values(day.porsi_per_kat).reduce((s, v) => s + v, 0)
            : 0;
          row.push(totalPorsi);
          row.push(fmt2(totalKg));
          row.push(fmt2(buffer));
          row.push(rincianPembelian(totalKg, b.satuan));
          wsData.push(row);
          rowIdx++;
          subTotalGram += totalGram;
          subTotalPorsi = totalPorsi;
        }

        // Subtotal row
        const subRow = ['SUBTOTAL'];
        for (const kat of FKC) {
          const katTotal = day.bahan.reduce((s, b) => s + (b.per_kategori[kat] || 0), 0);
          subRow.push(fmt2(katTotal));
        }
        const subKg = subTotalGram / 1000;
        subRow.push(subTotalPorsi || '');
        subRow.push(fmt2(subKg));
        subRow.push(fmt2(subKg * 1.1));
        subRow.push('');
        wsData.push(subRow);
        rowIdx++;
      }

      // Empty spacer row
      wsData.push([]);
      rowIdx++;
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws['!cols'] = colWidths.map(w => ({ wch: w }));

    // Merge cells for title
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }];

    // Page setup for A4 Landscape
    ws['!pageSetup'] = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    ws['!printGrid'] = true;

    // Style Title row
    if (ws['A1']) {
      ws['A1'].s = { font: { bold: true, sz: 14, color: { rgb: '1e40af' } }, alignment: { horizontal: 'center', vertical: 'center' }, fill: { fgColor: { rgb: 'EFF6FF' } } };
    }

    // Style Header row
    for (let c = 0; c < totalCols; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: 1, c });
      if (ws[cellRef]) {
        ws[cellRef].s = {
          font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '1e40af' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } },
        };
      }
    }

    // Style day header rows (bold, light background)
    let r = 2;
    for (const day of days) {
      r++; // day header
      if (!hasBahan) { r++; continue; }
      const dayHeaderRef = XLSX.utils.encode_cell({ r, c: 0 });
      if (ws[dayHeaderRef]) {
        ws[dayHeaderRef].s = {
          font: { bold: true, sz: 11, color: { rgb: '1e40af' } },
          fill: { fgColor: { rgb: 'DBEAFE' } },
          alignment: { horizontal: 'left', vertical: 'center' },
        };
      }
      // Merge day header across all columns
      ws['!merges'].push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } });
      r++;
      // Data rows
      const dayBahanCount = day.bahan.length;
      for (let i = 0; i < dayBahanCount; i++) {
        const dataRowRef = XLSX.utils.encode_cell({ r, c: 0 });
        if (ws[dataRowRef]) {
          ws[dataRowRef].s = { alignment: { horizontal: 'left', vertical: 'center' } };
        }
        for (let c = 1; c < totalCols; c++) {
          const cref = XLSX.utils.encode_cell({ r, c });
          if (ws[cref]) {
            ws[cref].s = {
              alignment: { horizontal: c < totalCols - 1 ? 'right' : 'left', vertical: 'center' },
              border: { top: { style: 'thin', color: { rgb: 'E5E7EB' } }, bottom: { style: 'thin', color: { rgb: 'E5E7EB' } } },
            };
          }
        }
        r++;
      }
      // Subtotal row
      const subRef = XLSX.utils.encode_cell({ r, c: 0 });
      if (ws[subRef]) {
        ws[subRef].s = { font: { bold: true, sz: 10 }, fill: { fgColor: { rgb: 'FEF3C7' } }, alignment: { horizontal: 'left', vertical: 'center' } };
      }
      for (let c = 1; c < totalCols; c++) {
        const cref = XLSX.utils.encode_cell({ r, c });
        if (ws[cref]) {
          ws[cref].s = {
            font: { bold: true, sz: 10 },
            fill: { fgColor: { rgb: 'FEF3C7' } },
            alignment: { horizontal: c < totalCols - 1 ? 'right' : 'left', vertical: 'center' },
            border: { top: { style: 'medium', color: { rgb: 'D97706' } }, bottom: { style: 'medium', color: { rgb: 'D97706' } } },
          };
        }
      }
      r++;
      // Spacer
      r++;
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rencana Bahan');
    XLSX.writeFile(wb, 'rencana-kebutuhan-bahan.xlsx');
  } catch (e) {
    showAlert('Gagal export: ' + e.message, 'error');
  }
}

function renderSiklusBahanTable(days, fixed_kategori) {
  const FKC = fixed_kategori || FIXED_KATEGORI_LAP;
  const TOTAL_COLS = FKC.length + 5;
  const hasBahan = days.some(d => d.bahan.length > 0);
  let html = '';

  for (const day of days) {
    html += `<tr class="bg-blue-50"><td colspan="${TOTAL_COLS}" class="px-3 py-2.5 text-sm font-bold text-blue-800">${day.label}</td></tr>`;

    if (!hasBahan) {
      html += `<tr><td colspan="${TOTAL_COLS}" class="px-3 py-4 text-center text-stone-400 text-sm">Belum ada data bahan</td></tr>`;
    } else {
      for (const b of day.bahan) {
        html += '<tr class="border-t border-stone-100">';
        html += `<td class="px-3 py-2 text-sm whitespace-nowrap">${b.bahan_nama}</td>`;
        let totalGram = 0;
        for (const kat of FKC) {
          const val = b.per_kategori[kat] || 0;
          html += `<td class="px-3 py-2 text-sm text-right mono whitespace-nowrap">${val ? fmt2(val) : '0,00'}</td>`;
          totalGram += val;
        }
        const totalKg = totalGram / 1000;
        const buffer = totalKg * 1.1;
        const totalPorsi = day.porsi_per_kat
          ? Object.values(day.porsi_per_kat).reduce((s, v) => s + v, 0)
          : 0;
        html += `<td class="px-3 py-2 text-sm text-right mono font-semibold">${totalPorsi}</td>`;
        html += `<td class="px-3 py-2 text-sm text-right mono">${fmt2(totalKg)}</td>`;
        html += `<td class="px-3 py-2 text-sm text-right mono">${fmt2(buffer)}</td>`;
        html += `<td class="px-3 py-2 text-sm whitespace-nowrap">${rincianPembelian(totalKg, b.satuan)}</td>`;
        html += '</tr>';
      }

      // Subtotal
      html += '<tr class="bg-amber-50 border-t-2 border-amber-400">';
      html += '<td class="px-3 py-2 text-sm font-bold">SUBTOTAL</td>';
      for (const kat of FKC) {
        const katTotal = day.bahan.reduce((s, b2) => s + (b2.per_kategori[kat] || 0), 0);
        html += `<td class="px-3 py-2 text-sm text-right mono font-bold">${fmt2(katTotal)}</td>`;
      }
      const subGram = day.bahan.reduce((s, b2) => s + b2.total, 0);
      const subPorsi = day.porsi_per_kat ? Object.values(day.porsi_per_kat).reduce((s, v) => s + v, 0) : 0;
      html += `<td class="px-3 py-2 text-sm text-right mono font-bold">${subPorsi || ''}</td>`;
      html += `<td class="px-3 py-2 text-sm text-right mono font-bold">${fmt2(subGram / 1000)}</td>`;
      html += `<td class="px-3 py-2 text-sm text-right mono font-bold">${fmt2(subGram / 1000 * 1.1)}</td>`;
      html += '<td class="px-3 py-2"></td>';
      html += '</tr>';
    }

    // Spacer row
    html += '<tr><td colspan="' + TOTAL_COLS + '" class="p-1"></td></tr>';
  }

  return html;
}

