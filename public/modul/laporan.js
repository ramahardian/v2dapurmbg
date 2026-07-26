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
    showLap(getLapTabsForRole()[0]);
  } catch (err) {
    console.error('Laporan error:', err);
    if (err.message.includes('Akses ditolak') || err.message.includes('Forbidden')) return showAccessDenied();
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat laporan: ${err.message}</div>`;
  }
}
const LAP_TABS = ['siklus', 'persediaan', 'produksi', 'distribusi', 'rab', 'rab-bulanan', 'pengeluaran-bulanan', 'penggunaan-anggaran', 'bp-kas', 'payroll', 'payroll-mingguan', 'pembelian', 'penerimaan', 'mutasi', 'laba-rugi', 'arus-kas', 'keuangan', 'hpp', 'rab-pembelian', 'jurnal-umum', 'buku-besar', 'neraca'];
const LAP_PAGE_SIZE = 10;
let lapState = { tab: 'siklus', page: 1 };

function getLapTabsForRole() {
  const role = currentUser?.role || '';
  if (role === 'keuangan') {
    return LAP_TABS.filter(t => t !== 'siklus');
  }
  return LAP_TABS;
}

async function showLap(tab) {
  const tabs = getLapTabsForRole();
  if (!tabs.includes(tab)) tab = tabs[0];
  lapState.tab = tab;
  lapState.page = 1;
const tabColors = {
    persediaan: { active: 'bg-white text-amber-600 shadow-sm', inactive: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
    distribusi: { active: 'bg-white text-violet-600 shadow-sm', inactive: 'bg-violet-100 text-violet-700 hover:bg-violet-200' },
    siklus: { active: 'bg-white text-rose-600 shadow-sm', inactive: 'bg-rose-100 text-rose-700 hover:bg-rose-200' },
    produksi: { active: 'bg-white text-lime-600 shadow-sm', inactive: 'bg-lime-100 text-lime-700 hover:bg-lime-200' },
    rab: { active: 'bg-white text-emerald-600 shadow-sm', inactive: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
    'rab-bulanan': { active: 'bg-white text-emerald-600 shadow-sm', inactive: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
    'pengeluaran-bulanan': { active: 'bg-white text-sky-600 shadow-sm', inactive: 'bg-sky-100 text-sky-700 hover:bg-sky-200' },
    'penggunaan-anggaran': { active: 'bg-white text-teal-600 shadow-sm', inactive: 'bg-teal-100 text-teal-700 hover:bg-teal-200' },
    'bp-kas': { active: 'bg-white text-indigo-600 shadow-sm', inactive: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' },
    payroll: { active: 'bg-white text-pink-600 shadow-sm', inactive: 'bg-pink-100 text-pink-700 hover:bg-pink-200' },
    'payroll-mingguan': { active: 'bg-white text-pink-600 shadow-sm', inactive: 'bg-pink-100 text-pink-700 hover:bg-pink-200' },
    'rab-pembelian': { active: 'bg-white text-emerald-600 shadow-sm', inactive: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
    'jurnal-umum': { active: 'bg-white text-cyan-600 shadow-sm', inactive: 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200' },
    'buku-besar': { active: 'bg-white text-blue-600 shadow-sm', inactive: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
    'neraca': { active: 'bg-white text-purple-600 shadow-sm', inactive: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
    'arus-kas': { active: 'bg-white text-emerald-600 shadow-sm', inactive: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
  };
  getLapTabsForRole().forEach(t => {
    const el = document.getElementById('lt-' + t);
    if (!el) return;
    const c = tabColors[t];
    const base = 'px-3 sm:px-5 py-2 sm:py-2.5 text-[11px] font-medium rounded-t-lg border border-b-0 border-stone-200 -mb-px';
    const extra = t === tab ? ' relative z-[2]' : '';
    el.className = base + ' ' + (t === tab ? c.active : c.inactive) + extra;
  });
  const wrap = document.getElementById('lap-content');
  if (!wrap) {
    console.error('lap-content element not found');
    return;
  }
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
      const filterPeriode = lapState.rab_periode || new Date().toISOString().slice(0, 7);
      const filterSiklusId = lapState.rab_siklus_id || '';

      const [siklusList, rabRes] = await Promise.all([
        api.get('/siklus').catch(() => []),
        api.get('/laporan/rab-sinkron?periode=' + filterPeriode + (filterSiklusId ? '&siklus_id=' + filterSiklusId : '')),
      ]);
      const r = rabRes;
      const rows = r.rows || [];
      const bd = r.budget || {};
      const siklusInfo = r.siklus || null;

      var periods = [];
      var nowDate = new Date();
      for (var y = nowDate.getFullYear() - 2; y <= nowDate.getFullYear(); y++) {
        for (var m = 1; m <= 12; m++) {
          var mm = String(m).padStart(2, '0');
          periods.push(y + '-' + mm);
        }
      }
      periods = periods.filter(function(p) { return p <= nowDate.toISOString().slice(0, 7); }).reverse();

      var fmtIdr = fmtIDR;
      var totalBudget = bd.total_budget || 0;
      var totalBiayaKas = bd.total_biaya_kas || 0;
      var totalSelisih = totalBudget - totalBiayaKas;
      var serapan = totalBudget > 0 ? (totalBiayaKas / totalBudget * 100) : 0;

      var siklusOpts = '<option value="">Semua Siklus</option>';
      var activeSiklus = (Array.isArray(siklusList) ? siklusList : []).filter(function(s) { return s.status === 'Aktif' || s.status === 'Draft'; });
      activeSiklus.forEach(function(s) {
        var sel = String(s.id) === String(filterSiklusId) ? 'selected' : '';
        siklusOpts += '<option value="' + s.id + '" ' + sel + '>' + escHtml(s.nama) + ' (' + (s.total_hari || '?') + ' hr)' + '</option>';
      });

      var hariLabel = siklusInfo ? 'hari siklus' : 'hari produksi';
      var rabFilterBar = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 mb-4">' +
        '<div class="flex flex-wrap items-center gap-x-4 gap-y-2">' +
          '<div class="flex items-center gap-2">' +
            '<svg class="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>' +
            '<select id="rab-filter-periode" onchange="gantiPeriodeRab()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
            periods.map(function(p) { return '<option value="' + p + '" ' + (filterPeriode===p?'selected':'') + '>' + p + '</option>'; }).join('') +
            '</select>' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            '<svg class="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>' +
            '<select id="rab-filter-siklus" onchange="gantiPeriodeRab()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
            siklusOpts +
            '</select>' +
          '</div>' +
          '<button onclick="hitungRealisasiRAB()" class="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-colors shadow-sm">' +
            '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>' +
            'Hitung Realisasi' +
          '</button>' +
          (siklusInfo ? '<span class="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' + escHtml(siklusInfo.nama) + ' — ' + siklusInfo.total_hari + ' hari</span>' : '') +
          '<span class="text-xs text-stone-400 ml-auto">' + (r.total_hari || 0) + ' ' + hariLabel + '</span>' +
        '</div></div>';

      // Stat Cards
      var statCards = '<div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">' +
        '<div class="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Anggaran</span><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg></div>' +
          '<div class="text-lg font-bold text-emerald-800">' + fmtIDR(r.grand_total) + '</div>' +
          '<div class="text-[10px] text-emerald-600/70">Total RAB sinkron</div>' +
        '</div>' +
        '<div class="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Budget</span><svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg></div>' +
          '<div class="text-lg font-bold text-blue-800">' + fmtIDR(totalBudget) + '</div>' +
          '<div class="text-[10px] text-blue-600/70">Dari tabel budget</div>' +
        '</div>' +
        '<div class="bg-gradient-to-br from-orange-50 to-orange-100/60 rounded-2xl border border-orange-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-orange-700">Realisasi</span><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>' +
          '<div class="text-lg font-bold text-orange-800">' + fmtIDR(totalBiayaKas) + '</div>' +
          '<div class="mt-1.5 w-full bg-orange-200/60 rounded-full h-1.5 overflow-hidden"><div class="bg-orange-500 h-1.5 rounded-full transition-all" style="width:' + Math.min(serapan, 100) + '%"></div></div>' +
          '<div class="text-[10px] text-orange-600/70 mt-0.5">' + serapan.toFixed(1) + '% terserap</div>' +
        '</div>' +
        '<div class="bg-gradient-to-br from-' + (totalSelisih >= 0 ? 'emerald' : 'red') + '-50 to-' + (totalSelisih >= 0 ? 'emerald' : 'red') + '-100/60 rounded-2xl border border-' + (totalSelisih >= 0 ? 'emerald' : 'red') + '-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-' + (totalSelisih >= 0 ? 'emerald' : 'red') + '-700">Selisih</span><svg class="w-4 h-4 text-' + (totalSelisih >= 0 ? 'emerald' : 'red') + '-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 17V9m0 0l-4 4m4-4l4 4"/></svg></div>' +
          '<div class="text-lg font-bold text-' + (totalSelisih >= 0 ? 'emerald' : 'red') + '-800">' + fmtIDR(Math.abs(totalSelisih)) + '</div>' +
          '<div class="text-[10px] text-' + (totalSelisih >= 0 ? 'emerald' : 'red') + '-600/70">' + (totalSelisih >= 0 ? 'Surplus' : 'Defisit') + '</div>' +
        '</div>' +
        '<div class="bg-gradient-to-br from-violet-50 to-violet-100/60 rounded-2xl border border-violet-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-violet-700">Rata/Hari</span><svg class="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/><path d="M3 9h18"/><path d="M9 21V9"/></svg></div>' +
          '<div class="text-lg font-bold text-violet-800">' + fmtIDR(r.total_hari ? Math.round(r.grand_total / r.total_hari) : 0) + '</div>' +
          '<div class="text-[10px] text-violet-600/70">Biaya per ' + hariLabel + '</div>' +
        '</div>' +
      '</div>';

      // Summary cards
      var summaryCards = '<div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">' +
        '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">' +
          '<div class="flex items-center gap-3 mb-3"><div class="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-sm"><svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></div><div><div class="text-xs font-semibold text-stone-700">Ringkasan Anggaran</div><div class="text-[10px] text-stone-400">' + filterPeriode + '</div></div></div>' +
          '<div class="space-y-2">' +
            '<div class="flex justify-between items-center"><span class="text-xs text-stone-500">RAB Sinkron</span><span class="text-xs font-bold text-stone-800">' + fmtIdr(r.grand_total) + '</span></div>' +
            '<div class="flex justify-between items-center"><span class="text-xs text-stone-500">Total Budget</span><span class="text-xs font-semibold text-blue-600">' + fmtIdr(totalBudget) + '</span></div>' +
            '<div class="flex justify-between items-center"><span class="text-xs text-stone-500">Realisasi Kas</span><span class="text-xs font-semibold text-red-500">' + fmtIdr(totalBiayaKas) + '</span></div>' +
            '<div class="border-t border-stone-100 pt-2 flex justify-between items-center"><span class="text-xs font-bold text-stone-700">Selisih</span><span class="text-xs font-bold ' + (totalSelisih >= 0 ? 'text-emerald-600' : 'text-red-600') + '">' + fmtIdr(Math.abs(totalSelisih)) + ' (' + (totalSelisih >= 0 ? 'surplus' : 'defisit') + ')' + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">' +
          '<div class="flex items-center gap-3 mb-3"><div class="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-sm"><svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div><div class="text-xs font-semibold text-stone-700">Detail Realisasi</div><div class="text-[10px] text-stone-400">' + (r.total_hari || 0) + ' hari</div></div></div>' +
          '<div class="space-y-2">' +
            '<div class="flex justify-between items-center"><span class="text-xs text-stone-500">Realisasi Budget Manual</span><span class="text-xs font-semibold text-stone-800">' + fmtIdr(bd.total_realisasi_manual || 0) + '</span></div>' +
            '<div class="flex justify-between items-center"><span class="text-xs text-stone-500">Pembayaran Supplier (Kas)</span><span class="text-xs font-semibold text-stone-800">' + fmtIdr(bd.total_realisasi_kas || 0) + '</span></div>' +
            '<div class="border-t border-stone-100 pt-2 flex justify-between items-center"><span class="text-xs font-bold text-stone-700">Total Biaya (Kas)</span><span class="text-xs font-bold text-red-500">' + fmtIdr(totalBiayaKas) + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">' +
          '<div class="flex items-center gap-3 mb-3"><div class="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-sm"><svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div><div><div class="text-xs font-semibold text-stone-700">Serapan Anggaran</div><div class="text-[10px] text-stone-400">Budget vs realisasi</div></div></div>' +
          '<div class="flex items-end justify-between mb-2"><span class="text-xs text-stone-500">Progress</span><span class="text-xs font-bold text-stone-700">' + serapan.toFixed(1) + '%</span></div>' +
          '<div class="w-full bg-stone-100 rounded-full h-2.5 overflow-hidden"><div class="h-2.5 rounded-full transition-all duration-500 ' + (serapan > 100 ? 'bg-red-500' : serapan > 80 ? 'bg-amber-500' : serapan > 0 ? 'bg-emerald-500' : 'bg-stone-200') + '" style="width:' + Math.min(serapan, 100) + '%"></div></div>' +
          '<div class="flex justify-between mt-1.5 text-[10px] text-stone-400"><span>Budget: ' + fmtIdr(totalBudget) + '</span><span>Realisasi: ' + fmtIdr(totalBiayaKas) + '</span></div>' +
        '</div>' +
      '</div>';

      // Table
      var tableContent = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">' +
        '<div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between"><h3 class="text-xs font-bold text-stone-700 uppercase tracking-wider">Rincian per Kategori</h3><span class="text-[10px] text-stone-400">' + rows.length + ' kategori</span></div>' +
        '<div class="overflow-x-auto"><table class="w-full text-xs">' +
        '<thead><tr class="bg-stone-50">' +
        '<th class="text-left px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Kategori</th>' +
        '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Harga/Porsi</th>' +
        '<th class="text-center px-1 py-3 text-[10px] font-bold text-stone-400" style="width:16px"></th>' +
        '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Penerima</th>' +
        '<th class="text-center px-1 py-3 text-[10px] font-bold text-stone-400" style="width:16px"></th>' +
        '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Hari</th>' +
        '<th class="text-center px-1 py-3 text-[10px] font-bold text-stone-400" style="width:16px"></th>' +
        '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Anggaran</th>' +
        '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Budget</th>' +
        '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Realisasi</th>' +
        '</tr></thead><tbody>';

      var catColors = ['#059669','#0891b2','#d97706','#7c3aed','#be185d','#0d9488','#dc2626','#2563eb','#ca8a04'];
      var catIdx = 0;
      rows.forEach(function(b) {
        var budgetVal = Number(b.budget || 0);
        var realisasiVal = Number(b.realisasi || 0);
        var selisihRow = budgetVal - realisasiVal;
        var isPosyandu = b.kategori && b.kategori.indexOf('Posyandu') === 0;
        var isSub = isPosyandu;
        var bgRow = isSub ? 'bg-amber-50/40' : '';
        var dotColor = catColors[catIdx % catColors.length];
        if (!isSub) catIdx++;
        tableContent += '<tr class="border-t border-stone-100 hover:bg-stone-50/80 transition-colors ' + bgRow + '">' +
          '<td class="px-4 py-3 font-medium text-xs"><span class="inline-block w-2 h-2 rounded-full mr-2" style="background:' + dotColor + '"></span>' + escHtml(b.kategori) + '</td>' +
          '<td class="px-4 py-3 text-right mono text-xs font-semibold text-stone-700">' + (b.harga_per_porsi > 0 ? fmtIdr(b.harga_per_porsi) : '<span class="text-stone-300">—</span>') + '</td>' +
          '<td class="px-1 py-3 text-center text-stone-300 text-[9px]">×</td>' +
          '<td class="px-4 py-3 text-right text-xs font-semibold text-stone-700">' + fmtNum(b.jumlah_penerima) + '</td>' +
          '<td class="px-1 py-3 text-center text-stone-300 text-[9px]">×</td>' +
          '<td class="px-4 py-3 text-right text-xs font-semibold text-stone-700">' + b.jumlah_hari + '</td>' +
          '<td class="px-1 py-3 text-center text-stone-300 text-[9px]">=</td>' +
          '<td class="px-4 py-3 text-right mono font-bold text-xs text-stone-800">' + fmtIdr(b.total) + '</td>' +
          '<td class="px-4 py-3 text-right mono text-xs"><span class="' + (budgetVal > 0 ? 'font-semibold text-stone-700' : 'text-stone-300') + '">' + fmtIdr(budgetVal) + '</span></td>' +
          '<td class="px-4 py-3 text-right mono text-xs"><span class="font-semibold ' + (realisasiVal > budgetVal ? 'text-red-500' : realisasiVal > 0 ? 'text-emerald-600' : 'text-stone-300') + '">' + fmtIdr(realisasiVal) + '</span></td></tr>';
      });

      catIdx = 0;
      tableContent += '<tr class="border-t-2 border-stone-300 bg-gradient-to-r from-stone-100 to-stone-50">' +
        '<td class="px-4 py-3.5 font-bold text-xs text-stone-800">Total ' + rows.length + ' kategori</td>' +
        '<td class="px-4 py-3.5"></td><td class="px-1 py-3.5"></td>' +
        '<td class="px-4 py-3.5 text-right font-bold text-xs text-stone-800">' + fmtNum(r.grand_penerima) + '</td>' +
        '<td class="px-1 py-3.5"></td>' +
        '<td class="px-4 py-3.5 text-right font-bold text-xs text-stone-800">' + (r.total_hari || 0) + '</td>' +
        '<td class="px-1 py-3.5"></td>' +
        '<td class="px-4 py-3.5 text-right mono font-bold text-xs text-blue-700">' + fmtIdr(r.grand_total) + '</td>' +
        '<td class="px-4 py-3.5 text-right mono font-bold text-xs text-stone-800">' + fmtIdr(totalBudget) + '</td>' +
        '<td class="px-4 py-3.5 text-right mono font-bold text-xs ' + (totalSelisih >= 0 ? 'text-emerald-600' : 'text-red-600') + '">' + fmtIdr(totalBiayaKas) + '</td></tr>';

      tableContent += '</tbody></table></div></div>';

      window._lapData = null;
      window._lapStatCards = rabFilterBar + statCards + summaryCards + tableContent;
    } else if (tab === 'rab-bulanan') {
      // Filter state
      var rbBulan = lapState.rb_bulan || '';
      var rbTahun = lapState.rb_tahun || '';
      var nowDate = new Date();

      // Build query params
      var params = new URLSearchParams();
      if (rbBulan) params.set('bulan', rbBulan);
      if (rbTahun) params.set('tahun', rbTahun);

      const r = await api.get('/laporan/rab-bulanan?' + params.toString());
      const rows = r.rows || [];
      const detailKat = r.detail_kategori || [];
      const prodInfo = r.produksi_info || null;

      // Filter bar
      var rbFilterBar = '<div class="mb-4 flex flex-wrap items-center gap-3">' +
        '<div class="flex items-center gap-2">' +
        '<label class="text-xs font-medium text-stone-500">Filter:</label>' +
        '<select id="rb-bulan" onchange="gantiPeriodeRabBulanan()" class="text-xs border border-stone-300 rounded px-2 py-1.5">' +
        '<option value="">Semua Bulan</option>' +
        [1,2,3,4,5,6,7,8,9,10,11,12].map(function(b) { return '<option value="' + b + '" ' + (parseInt(rbBulan)===b?'selected':'') + '>' + ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][b-1] + '</option>'; }).join('') +
        '</select>' +
        '<select id="rb-tahun" onchange="gantiPeriodeRabBulanan()" class="text-xs border border-stone-300 rounded px-2 py-1.5">' +
        '<option value="">Semua Tahun</option>' +
        [2024,2025,2026,2027,2028].map(function(t) { return '<option value="' + t + '" ' + (parseInt(rbTahun)===t?'selected':'') + '>' + t + '</option>'; }).join('') +
        '</select></div>' +
        (rbBulan && rbTahun ? '<button onclick="generateBudgetDariRAB()" class="bg-[#1e40af] hover:bg-[#1d4ed8] text-white px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1">' +
        '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>' +
        'Generate Budget</button>' : '') +
        '</div>';

      var fmtIdr = fmtIDR;

      // Jika filter spesifik, tampilkan detail per kategori
      var detailHtml = '';
      if (rbBulan && rbTahun && detailKat.length > 0) {
        var periodeLbl = rbTahun + '-' + String(rbBulan).padStart(2, '0');

        // Info produksi
        var prodHtml = '';
        if (prodInfo) {
          prodHtml = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">' +
            statCard('Hari Produksi', fmtNum(prodInfo.total_hari), 'hari', 'bg-lime-50') +
            statCard('Total Porsi', fmtNum(prodInfo.total_porsi_produksi), 'porsi', 'bg-blue-50') +
            statCard('Realisasi Kas', fmtIDR(prodInfo.realisasi_kas), 'total pengeluaran', 'bg-orange-50') +
            (prodInfo.realisasi_kas > 0 && detailKat.reduce(function(s, d) { return s + d.total_budget; }, 0) > 0
              ? statCard('Serapan', (prodInfo.realisasi_kas / detailKat.reduce(function(s, d) { return s + d.total_budget; }, 0) * 100).toFixed(1) + '%', 'dari budget', 'bg-violet-50')
              : statCard('Serapan', '0%', '', 'bg-stone-50')) +
          '</div>';
        }

        // Tabel detail per kategori
        var totalBudgetKat = 0, totalRealisasiKat = 0, totalBiayaOp = 0;
        var katRows = detailKat.map(function(d) {
          totalBudgetKat += d.total_budget;
          totalRealisasiKat += d.realisasi;
          totalBiayaOp += d.biaya_operasional;
          var selisih = d.total_budget - d.realisasi;
          var selClass = selisih >= 0 ? 'text-emerald-600' : 'text-red-600';
          var capaian = d.total_budget > 0 ? (d.realisasi / d.total_budget * 100).toFixed(1) + '%' : '-';
          return '<tr class="border-t border-stone-100 hover:bg-stone-50">' +
            '<td class="px-3 sm:px-4 py-2.5 font-medium text-xs">' + escHtml(d.kategori_penerima || 'Umum') + '</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right text-xs">' + fmtNum(d.jumlah_penerima) + '</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right mono text-xs">' + fmtIdr(d.harga_per_porsi) + '</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right mono text-xs">' + fmtIdr(d.biaya_operasional) + '</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right mono font-semibold text-xs">' + fmtIdr(d.total_budget) + '</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right mono text-xs ' + selClass + '">' + fmtIdr(d.realisasi) + '</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right mono text-xs ' + selClass + '">' + fmtIdr(Math.abs(selisih)) + '</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right text-xs font-medium ' + (parseFloat(capaian) >= 80 ? 'text-emerald-600' : parseFloat(capaian) >= 50 ? 'text-amber-600' : 'text-red-600') + '">' + capaian + '</td></tr>';
        }).join('');

        var totalSelisihKat = totalBudgetKat - totalRealisasiKat;
        var totalSelClass = totalSelisihKat >= 0 ? 'text-emerald-600' : 'text-red-600';
        var totalCapaian = totalBudgetKat > 0 ? (totalRealisasiKat / totalBudgetKat * 100).toFixed(1) + '%' : '-';

        var katTabel = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden mb-4">' +
          '<div class="px-4 py-2.5 font-bold text-sm border-b border-stone-200 bg-emerald-50 text-emerald-800 flex items-center justify-between">' +
          '<span>📋 Rincian Budget per Kategori — ' + periodeLbl + '</span>' +
          '<span class="text-xs font-normal text-stone-500">' + prodInfo?.total_hari + ' hari produksi</span></div>' +
          '<div class="overflow-x-auto"><table class="w-full text-xs sm:text-sm">' +
          '<thead class="bg-stone-50"><tr>' +
          '<th class="text-left px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Kategori</th>' +
          '<th class="text-right px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Penerima</th>' +
          '<th class="text-right px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Harga/Porsi</th>' +
          '<th class="text-right px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Biaya Op</th>' +
          '<th class="text-right px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Budget</th>' +
          '<th class="text-right px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Realisasi</th>' +
          '<th class="text-right px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Selisih</th>' +
          '<th class="text-right px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Capaian</th></tr></thead><tbody>' +
          katRows +
          '<tr class="border-t-2 border-stone-400 font-bold bg-stone-100">' +
          '<td class="px-3 sm:px-4 py-3 font-bold text-xs">TOTAL</td>' +
          '<td class="px-3 sm:px-4 py-3 text-right text-xs">' + fmtNum(detailKat.reduce(function(s, d) { return s + d.jumlah_penerima; }, 0)) + '</td>' +
          '<td class="px-3 sm:px-4 py-3 text-right text-xs"></td>' +
          '<td class="px-3 sm:px-4 py-3 text-right mono font-bold text-xs">' + fmtIdr(totalBiayaOp) + '</td>' +
          '<td class="px-3 sm:px-4 py-3 text-right mono font-bold text-xs">' + fmtIdr(totalBudgetKat) + '</td>' +
          '<td class="px-3 sm:px-4 py-3 text-right mono font-bold text-xs ' + totalSelClass + '">' + fmtIdr(totalRealisasiKat) + '</td>' +
          '<td class="px-3 sm:px-4 py-3 text-right mono font-bold text-xs ' + totalSelClass + '">' + fmtIdr(Math.abs(totalSelisihKat)) + '</td>' +
          '<td class="px-3 sm:px-4 py-3 text-right font-bold text-xs ' + (parseFloat(totalCapaian) >= 80 ? 'text-emerald-600' : parseFloat(totalCapaian) >= 50 ? 'text-amber-600' : 'text-red-600') + '">' + totalCapaian + '</td></tr>' +
          '</tbody></table></div></div>';

        // Realisasi per kategori dari kas_bank
        var realisasiPerKatHtml = '';
        if (prodInfo && prodInfo.realisasi_per_kategori && prodInfo.realisasi_per_kategori.length > 0) {
          var realKatRows = prodInfo.realisasi_per_kategori.map(function(rk) {
            var pct = totalBudgetKat > 0 ? (rk.total / totalBudgetKat * 100).toFixed(1) : 0;
            return '<tr class="border-t border-stone-100 hover:bg-stone-50"><td class="px-4 py-2.5 text-xs">' + escHtml(rk.kategori) + '</td><td class="px-4 py-2.5 text-right mono text-xs">' + fmtIdr(rk.total) + '</td><td class="px-4 py-2.5 text-right text-xs text-stone-500">' + pct + '%</td></tr>';
          }).join('');
          realisasiPerKatHtml = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden mb-4">' +
            '<div class="px-4 py-2.5 font-bold text-sm border-b border-stone-200 bg-orange-50 text-orange-800">💰 Realisasi Pengeluaran (Kas Bank)</div>' +
            '<div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-stone-50"><tr>' +
            '<th class="text-left px-4 py-2.5 text-[10px] font-semibold uppercase">Kategori</th>' +
            '<th class="text-right px-4 py-2.5 text-[10px] font-semibold uppercase">Jumlah</th>' +
            '<th class="text-right px-4 py-2.5 text-[10px] font-semibold uppercase">% Budget</th></tr></thead><tbody>' +
            realKatRows +
            '<tr class="border-t-2 border-stone-400 font-bold bg-orange-50"><td class="px-4 py-2.5 text-xs">Total</td><td class="px-4 py-2.5 text-right mono text-xs">' + fmtIdr(prodInfo.realisasi_kas) + '</td><td class="px-4 py-2.5 text-right text-xs">100%</td></tr>' +
            '</tbody></table></div></div>';
        }

        detailHtml = prodHtml + katTabel + realisasiPerKatHtml;
      }

      // Tabel multi-periode (ringkasan)
      window._lapData = { tab, rows,
        headers: ['Periode','Item','Penerima','Rata Harga','Biaya Op','Budget','Realisasi Budget','Realisasi Kas','Selisih Budget','Selisih Kas','Capaian Budget','Capaian Kas'],
        fields: ['periode','item_count','total_penerima','rata_harga_per_porsi','total_biaya_operasional','total_budget','total_realisasi_budget','total_realisasi_kas','selisih_budget','selisih_kas','capaian_budget','capaian_kas'],
        fmt: rows.map(function(b) {
          var selisih = b.total_budget - b.total_realisasi_budget;
          var capaian = b.total_budget > 0 ? (b.total_realisasi_budget / b.total_budget * 100).toFixed(1) + '%' : '-';
          return [b.periode, fmtNum(b.item_count), fmtNum(b.total_penerima), fmtIDR(b.rata_harga_per_porsi),
            fmtIDR(b.total_biaya_operasional), fmtIDR(b.total_budget), fmtIDR(b.total_realisasi_budget), fmtIDR(b.total_realisasi_kas),
            fmtIDR(b.selisih_budget), fmtIDR(b.selisih_kas), capaian, b.capaian_kas.toFixed(1)+'%'];
        })
      };
      window['_export_rab-bulanan'] = { data: rows, fields: ['periode','item_count','total_penerima','rata_harga_per_porsi','total_biaya_operasional','total_budget','total_realisasi_budget','total_realisasi_kas'] };

      const s = r.stats;
      const selisihTotalBudget = s.total_budget - s.total_realisasi_budget;
      const selisihTotalKas = s.total_budget - s.total_realisasi_kas;

      // Tabel multi-periode
      var multiPeriodeTabel = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden">' +
        '<div class="px-4 py-2.5 font-bold text-sm border-b border-stone-200 bg-emerald-50 text-emerald-800">📊 RAB Bulanan — Multi Periode</div>' +
        '<div class="overflow-x-auto"><table class="w-full text-[10px] sm:text-xs">' +
        '<thead class="bg-stone-50"><tr>' +
        '<th class="text-left px-2 sm:px-3 py-2 font-semibold uppercase tracking-wider" rowspan="2">Periode</th>' +
        '<th class="text-center px-1 py-1 font-semibold" colspan="2" style="border-bottom:1px solid #d6d3d1">Budget</th>' +
        '<th class="text-center px-1 py-1 font-semibold" colspan="2" style="border-bottom:1px solid #d6d3d1">Realisasi</th>' +
        '<th class="text-center px-1 py-1 font-semibold" colspan="2" style="border-bottom:1px solid #d6d3d1">Selisih</th>' +
        '<th class="text-center px-1 py-1 font-semibold" colspan="2" style="border-bottom:1px solid #d6d3d1">Capaian</th></tr><tr class="bg-stone-50">' +
        '<th class="text-right px-2 sm:px-3 py-1.5 text-[9px] font-semibold text-stone-500 uppercase">Budget</th>' +
        '<th class="text-right px-2 sm:px-3 py-1.5 text-[9px] font-semibold text-stone-500 uppercase">Biaya Op</th>' +
        '<th class="text-right px-2 sm:px-3 py-1.5 text-[9px] font-semibold text-stone-500 uppercase">Budget</th>' +
        '<th class="text-right px-2 sm:px-3 py-1.5 text-[9px] font-semibold text-stone-500 uppercase">Kas</th>' +
        '<th class="text-right px-2 sm:px-3 py-1.5 text-[9px] font-semibold text-stone-500 uppercase">Budget</th>' +
        '<th class="text-right px-2 sm:px-3 py-1.5 text-[9px] font-semibold text-stone-500 uppercase">Kas</th>' +
        '<th class="text-right px-2 sm:px-3 py-1.5 text-[9px] font-semibold text-stone-500 uppercase">Budget</th>' +
        '<th class="text-right px-2 sm:px-3 py-1.5 text-[9px] font-semibold text-stone-500 uppercase">Kas</th></tr></thead><tbody>' +
        rows.map(function(b) {
          var selB = b.total_budget - b.total_realisasi_budget;
          var selK = b.total_budget - b.total_realisasi_kas;
          var capB = b.total_budget > 0 ? (b.total_realisasi_budget / b.total_budget * 100).toFixed(1) + '%' : '-';
          var capK = b.total_budget > 0 ? b.capaian_kas.toFixed(1) + '%' : '-';
          var isSelected = rbBulan && rbTahun && b.periode === (rbTahun + '-' + String(rbBulan).padStart(2, '0'));
          return '<tr class="' + (isSelected ? 'bg-emerald-50 font-semibold' : 'border-t border-stone-100 hover:bg-stone-50') + '" onclick="filterRabBulanan(\'' + b.periode + '\')" style="cursor:pointer">' +
            '<td class="px-2 sm:px-3 py-2 text-xs font-medium">' + b.periode + '</td>' +
            '<td class="px-2 sm:px-3 py-2 text-right mono text-xs">' + fmtIdr(b.total_budget) + '</td>' +
            '<td class="px-2 sm:px-3 py-2 text-right mono text-xs text-stone-500">' + fmtIdr(b.total_biaya_operasional) + '</td>' +
            '<td class="px-2 sm:px-3 py-2 text-right mono text-xs">' + fmtIdr(b.total_realisasi_budget) + '</td>' +
            '<td class="px-2 sm:px-3 py-2 text-right mono text-xs">' + fmtIdr(b.total_realisasi_kas) + '</td>' +
            '<td class="px-2 sm:px-3 py-2 text-right mono text-xs ' + (selB >= 0 ? 'text-emerald-600' : 'text-red-600') + '">' + fmtIdr(selB) + '</td>' +
            '<td class="px-2 sm:px-3 py-2 text-right mono text-xs ' + (selK >= 0 ? 'text-emerald-600' : 'text-red-600') + '">' + fmtIdr(selK) + '</td>' +
            '<td class="px-2 sm:px-3 py-2 text-right text-xs ' + (parseFloat(capB) >= 80 ? 'text-emerald-600' : parseFloat(capB) >= 50 ? 'text-amber-600' : 'text-red-600') + '">' + capB + '</td>' +
            '<td class="px-2 sm:px-3 py-2 text-right text-xs text-stone-500">' + capK + '</td></tr>';
        }).join('') +
        '</tbody></table></div></div>';

      window._lapStatCards = rbFilterBar +
        '<div class="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 mb-4">' +
        statCard('Total Periode', fmtNum(s.total_periode), 'bulan', 'bg-emerald-50') +
        statCard('Total Budget', fmtIDR(s.total_budget), '', 'bg-blue-50') +
        statCard('Realisasi (Budget)', fmtIDR(s.total_realisasi_budget), s.total_periode > 0 ? (s.total_realisasi_budget/s.total_budget*100).toFixed(1)+'%' : '', 'bg-orange-50') +
        statCard('Realisasi (Kas)', fmtIDR(s.total_realisasi_kas), s.total_periode > 0 ? (s.total_realisasi_kas/s.total_budget*100).toFixed(1)+'%' : '', 'bg-amber-50') +
        statCard('Rata Capaian', s.rata_capaian_budget.toFixed(1)+'%', 'per periode', 'bg-violet-50') +
      '</div>' +
      detailHtml +
      multiPeriodeTabel;
    } else if (tab === 'siklus') {
      const filterSiklusId = lapState.siklus_id || '';
      const [siklusList, lapRes, menuHarianRes] = await Promise.all([
        api.get('/siklus'),
        api.get('/siklus/laporan' + (filterSiklusId ? '?siklus_id=' + filterSiklusId : '')),
        api.get('/siklus/laporan/menu-harian' + (filterSiklusId ? '?siklus_id=' + filterSiklusId : '')).catch(() => null),
      ]);
      const { ringkasan } = lapRes;
      window._lapData = null;

      const menuHarian = menuHarianRes || [];
      const kategori_order = ['Karbohidrat','Protein Hewani','Protein Nabati','Sayur','Buah','Susu','Minyak'];

      // Filter bar
      var filterBar = '<div class="mb-4 flex flex-wrap items-center gap-3">' +
        '<label class="text-xs font-medium text-stone-500">Siklus:</label>' +
        '<select onchange="gantiFilterSiklus()" id="siklus-lap-filter" class="text-xs border border-stone-300 rounded px-2 py-1.5">' +
        '<option value="">Semua Siklus</option>' +
        siklusList.map(function(s) { return '<option value="' + s.id + '" ' + (String(s.id) === filterSiklusId ? 'selected' : '') + '>' + escHtml(s.nama) + '</option>'; }).join('') +
        '</select></div>';

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

      window._lapStatCards = filterBar +
        '<div class="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 mb-4">' +
        statCard('Total Siklus', fmtNum(ringkasan.totalSiklus), 'siklus', 'bg-rose-50') +
        statCard('Total Hari', fmtNum(ringkasan.totalHari), 'hari siklus', 'bg-blue-50') +
        statCard('Hari Terisi', fmtNum(ringkasan.totalFilled), ringkasan.rataCoverage + '% coverage', 'bg-emerald-50') +
        statCard('Hari Kosong', fmtNum(ringkasan.totalKosong), 'belum terisi', 'bg-orange-50') +
        statCard('Menu Unik', fmtNum(ringkasan.totalMenuUnik), 'menu digunakan', 'bg-violet-50') +
        '</div>' +
        lap1Html +
        lap2Html;
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
    } else if (tab === 'payroll-mingguan') {
      const now = new Date();
      const autoMinggu = Math.ceil(now.getDate() / 7);
      const blnVal = lapState.pm_bulan || String(now.getMonth() + 1).padStart(2, '0');
      const thnVal = lapState.pm_tahun || String(now.getFullYear());
      const mggVal = lapState.pm_minggu || autoMinggu;

      // Filter bar
      var exportBtn = '<button onclick="exportPayrollMingguanLap()" class="border border-stone-300 text-stone-700 hover:bg-stone-50 px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5">' +
        '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
        'Export XLSX</button>';
      var pmFilterBar = '<div class="mb-4 flex flex-wrap items-center gap-3">' +
        '<div class="flex items-center gap-2">' +
        '<label class="text-xs font-medium text-stone-500">Bulan:</label>' +
        '<select id="pm-bulan" onchange="pmGanti()" class="text-xs border border-stone-300 rounded px-2 py-1.5">' +
        [1,2,3,4,5,6,7,8,9,10,11,12].map(function(b) { return '<option value="' + b + '" ' + (parseInt(blnVal)===b?'selected':'') + '>' + ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][b-1] + '</option>'; }).join('') +
        '</select>' +
        '<select id="pm-tahun" onchange="pmGanti()" class="text-xs border border-stone-300 rounded px-2 py-1.5">' +
        [2024,2025,2026,2027,2028].map(function(t) { return '<option value="' + t + '" ' + (parseInt(thnVal)===t?'selected':'') + '>' + t + '</option>'; }).join('') +
        '</select>' +
        '<select id="pm-minggu" onchange="pmGanti()" class="text-xs border border-stone-300 rounded px-2 py-1.5">' +
        [1,2,3,4,5].map(function(m) { return '<option value="' + m + '" ' + (parseInt(mggVal)===m?'selected':'') + '>Minggu ' + m + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="flex gap-1.5">' +
        '<span id="pm-export-btn">' + exportBtn + '</span>' +
        '<button onclick="bayarPayrollMingguanLap()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5">' +
        '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' +
        'Bayar & Jurnal</button>' +
        '</div></div>';

      try {
        const res = await api.get('/payroll/mingguan?bulan=' + blnVal + '&tahun=' + thnVal + '&minggu_ke=' + mggVal);

        if (!res || !res.karyawan || !res.karyawan.length) {
          window._lapStatCards = pmFilterBar + '<div class="text-center py-12 text-stone-400">Tidak ada data payroll minggu ini</div>';
          window._lapData = null;
          renderLapPage();
          return;
        }

        const { minggu, karyawan, totals } = res;
        const tglNama = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
        const fmtIdr = fmtIDR;

        // Info header
        var infoHtml = '<div class="mb-4">' +
          '<div class="flex items-center gap-2 text-sm font-medium text-stone-700">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ' + minggu.label + '</div>' +
          '<div class="text-xs text-stone-500 mt-1">' + totals.total_karyawan + ' karyawan · ' + totals.total_hadir + ' hadir · Total: ' + fmtIdr(totals.total_gaji) + '</div>' +
          '</div>';

        // Table header
        var tableHtml = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-[11px]"><thead class="bg-stone-50"><tr>' +
          '<th class="text-left px-3 py-2 font-semibold border-r border-stone-200 whitespace-nowrap">Nama</th>' +
          '<th class="text-left px-2 py-2 font-semibold border-r border-stone-200 whitespace-nowrap text-stone-500">Jabatan</th>';
        minggu.dates.forEach(function(tgl, i) {
          const d = new Date(tgl + 'T00:00:00');
          const hari = tglNama[d.getDay()];
          const tglNum = tgl.slice(8, 10);
          tableHtml += '<th class="text-center px-1 py-1 font-semibold border-l border-stone-200 min-w-[72px] ' + ([0,6].includes(d.getDay()) ? 'text-red-400' : '') + '">' + hari + '<br><span class="text-xs">' + tglNum + '</span></th>';
        });
        tableHtml += '<th class="text-center px-2 py-2 font-semibold border-l border-stone-200 whitespace-nowrap">Hadir</th>' +
          '<th class="text-right px-2 py-2 font-semibold whitespace-nowrap mono">Upah/Hari</th>' +
          '<th class="text-right px-2 py-2 font-semibold whitespace-nowrap mono">Total</th></tr></thead><tbody>';

        var totalHadir = 0, totalGaji = 0;

        karyawan.forEach(function(k) {
          totalHadir += k.total_hadir;
          totalGaji += k.total_gaji;

          tableHtml += '<tr class="border-t border-stone-100 hover:bg-stone-50">' +
            '<td class="px-3 py-2 font-medium whitespace-nowrap">' + k.nama + '</td>' +
            '<td class="px-2 py-2 text-xs text-stone-500 whitespace-nowrap border-r border-stone-200">' + k.jabatan + '</td>';

          k.harian.forEach(function(h, i) {
            const tgl = minggu.dates[i];
            const d = new Date(tgl + 'T00:00:00');
            const isWeekend = [0, 6].includes(d.getDay());
            if (!h) {
              tableHtml += '<td class="text-center px-1 py-2 text-xs border-l border-stone-100 ' + (isWeekend ? 'bg-stone-50' : '') + '"><span class="text-stone-300">—</span></td>';
            } else if (h.status === 'Hadir') {
              tableHtml += '<td class="text-center px-1 py-2 text-xs border-l border-stone-100 ' + (isWeekend ? 'bg-stone-50' : '') + '"><div class="text-emerald-600 font-medium">' + (h.masuk || '?') + '</div><div class="text-stone-400">' + (h.keluar || '?') + '</div></td>';
            } else {
              tableHtml += '<td class="text-center px-1 py-2 text-xs border-l border-stone-100 ' + (isWeekend ? 'bg-stone-50' : '') + '"><span class="text-' + (h.status==='Sakit'?'amber':h.status==='Izin'?'blue':h.status==='Cuti'?'violet':'red') + '-600">' + h.status + '</span></td>';
            }
          });

          tableHtml += '<td class="text-center px-2 py-2 text-sm font-bold border-l border-stone-200">' + k.total_hadir + 'x</td>' +
            '<td class="text-right px-2 py-2 text-xs mono">' + fmtIdr(k.upah_per_hari) + '</td>' +
            '<td class="text-right px-2 py-2 text-sm font-bold mono">' + fmtIdr(k.total_gaji) + '</td></tr>';
        });

        // Total row
        tableHtml += '</tbody><tfoot class="bg-stone-50 font-medium"><tr>' +
          '<td colspan="2" class="px-3 py-2 text-xs text-stone-500">TOTAL</td>';
        minggu.dates.forEach(function() { tableHtml += '<td class="text-center px-1 py-2 text-xs"></td>'; });
        tableHtml += '<td class="text-center px-2 py-2 text-xs font-bold border-l border-stone-200">' + totalHadir + '</td>' +
          '<td class="px-2 py-2 text-xs"></td>' +
          '<td class="text-right px-2 py-2 text-xs font-bold">' + fmtIdr(totalGaji) + '</td></tr></tfoot></table></div></div>';

        window._pmExportData = { minggu, karyawan };
        window._lapStatCards = pmFilterBar + infoHtml + tableHtml;
        window._lapData = null;
      } catch (e) {
        console.error('Payroll mingguan error:', e);
        window._lapStatCards = pmFilterBar + '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat: ' + escHtml(e.message) + '</div>';
        window._lapData = null;
      }
      renderLapPage();

    } else if (tab === 'laba-rugi') {
      const now = new Date();
      const blnVal = lapState.lr_bulan || String(now.getMonth() + 1).padStart(2, '0');
      const thnVal = lapState.lr_tahun || String(now.getFullYear());
      var lrFilterBar = '<div class="mb-4 flex flex-wrap items-center gap-3"><div class="flex items-center gap-2">' +
        '<label class="text-xs font-medium text-stone-500">Periode:</label>' +
        '<select id="lr-bulan" onchange="gantiPeriodeLR()" class="text-xs border border-stone-300 rounded px-2 py-1.5">' +
        [1,2,3,4,5,6,7,8,9,10,11,12].map(function(b) { return '<option value="' + b + '" ' + (parseInt(blnVal)===b?'selected':'') + '>' + ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][b-1] + '</option>'; }).join('') +
        '</select>' +
        '<select id="lr-tahun" onchange="gantiPeriodeLR()" class="text-xs border border-stone-300 rounded px-2 py-1.5">' +
        [2024,2025,2026,2027,2028].map(function(t) { return '<option value="' + t + '" ' + (parseInt(thnVal)===t?'selected':'') + '>' + t + '</option>'; }).join('') +
        '</select></div></div>';

      const r = await api.get('/laporan/laba-rugi?bulan=' + blnVal + '&tahun=' + thnVal);
      const rows = r.rows || [];
      const pend = r.pendapatan || {};
      const biaya = r.biaya || {};

      // Build rincian pendapatan
      var pendapatanHtml = (pend.rincian||[]).map(function(p) {
        return '<tr class="border-t border-stone-100"><td class="px-3 py-2 text-xs">' + escHtml(p.kategori) + '</td>' +
          '<td class="px-3 py-2 text-right mono text-xs">' + fmtIDR(p.jumlah) + '</td>' +
          '<td class="px-3 py-2 text-right text-[10px] text-stone-500">' + p.persen.toFixed(1) + '%</td></tr>';
      }).join('') || '<tr><td class="px-3 py-4 text-center text-stone-400 text-xs" colspan="3">Tidak ada pendapatan</td></tr>';

      var biayaHtml = (biaya.rincian||[]).map(function(b) {
        return '<tr class="border-t border-stone-100"><td class="px-3 py-2 text-xs">' + escHtml(b.kategori) + '</td>' +
          '<td class="px-3 py-2 text-right mono text-xs">' + fmtIDR(b.jumlah) + '</td>' +
          '<td class="px-3 py-2 text-right text-[10px] text-stone-500">' + b.persen.toFixed(1) + '%</td></tr>';
      }).join('') || '<tr><td class="px-3 py-4 text-center text-stone-400 text-xs" colspan="3">Tidak ada biaya</td></tr>';

      var laba = pend.total - biaya.total;
      var margin = pend.total > 0 ? (laba / pend.total * 100) : 0;

      // Summary & detail tables
      var lrContent = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">' +
        statCard('Pendapatan', fmtIDR(pend.total), pend.rincian?.length + ' kategori', 'bg-emerald-50') +
        statCard('Biaya', fmtIDR(biaya.total), biaya.rincian?.length + ' kategori', 'bg-orange-50') +
        statCard('Laba/' + (laba>=0?'Rugi':'Rugi'), `<span class="${laba>=0?'text-green-600':'text-red-600'}">${fmtIDR(Math.abs(laba))}</span>`, laba>=0?' surplus':' defisit', 'bg-blue-50') +
        statCard('Margin', margin.toFixed(1) + '%', 'dari pendapatan', margin>=0?'bg-emerald-50':'bg-red-50') +
      '</div>' +
      '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">' +
      // Pendapatan table
      '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden">' +
      '<div class="px-4 py-2.5 font-bold text-sm border-b border-stone-200 bg-emerald-50 text-emerald-800 flex items-center justify-between"><span>💳 PENDAPATAN</span><span class="text-xs font-normal">' + fmtIDR(pend.total) + '</span></div>' +
      '<table class="w-full text-xs"><thead><tr class="bg-stone-50"><th class="text-left px-3 py-2 text-[10px] font-semibold">Kategori</th><th class="text-right px-3 py-2 text-[10px] font-semibold">Jumlah</th><th class="text-right px-3 py-2 text-[10px] font-semibold">%</th></tr></thead><tbody>' +
      pendapatanHtml +
      '<tr class="border-t-2 border-stone-400 font-bold bg-emerald-50"><td class="px-3 py-2.5 text-xs">Total Pendapatan</td><td class="px-3 py-2.5 text-right mono text-xs">' + fmtIDR(pend.total) + '</td><td class="px-3 py-2.5 text-right text-xs">100%</td></tr>' +
      '</tbody></table></div>' +
      // Biaya table
      '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden">' +
      '<div class="px-4 py-2.5 font-bold text-sm border-b border-stone-200 bg-orange-50 text-orange-800 flex items-center justify-between"><span>📉 BIAYA</span><span class="text-xs font-normal">' + fmtIDR(biaya.total) + '</span></div>' +
      '<table class="w-full text-xs"><thead><tr class="bg-stone-50"><th class="text-left px-3 py-2 text-[10px] font-semibold">Kategori</th><th class="text-right px-3 py-2 text-[10px] font-semibold">Jumlah</th><th class="text-right px-3 py-2 text-[10px] font-semibold">%</th></tr></thead><tbody>' +
      biayaHtml +
      '<tr class="border-t-2 border-stone-400 font-bold bg-orange-50"><td class="px-3 py-2.5 text-xs">Total Biaya</td><td class="px-3 py-2.5 text-right mono text-xs">' + fmtIDR(biaya.total) + '</td><td class="px-3 py-2.5 text-right text-xs">100%</td></tr>' +
      '</tbody></table></div></div>' +
      // Summary bottom
      '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden">' +
      '<div class="p-4 flex items-center justify-between"><div><span class="text-sm font-bold">Laba ' + (laba>=0?'Bersih':'Rugi Bersih') + '</span><br><span class="text-xs text-stone-500">' + r.periode + '</span></div>' +
      '<div class="text-right"><div class="text-lg font-bold mono ' + (laba>=0?'text-green-600':'text-red-600') + '">' + (laba>=0?'':'−') + fmtIDR(Math.abs(laba)) + '</div>' +
      '<div class="text-xs text-stone-500">Margin: ' + margin.toFixed(1) + '%</div></div></div></div>'

      window._lapData = { tab, rows, headers: ['Periode','Pendapatan','Biaya','Laba/Rugi'], fields: ['periode','pendapatan','biaya'],
        fmt: rows.map(d => {
          const labaRow = d.pendapatan - d.biaya;
          return [d.periode, fmtIDR(d.pendapatan), fmtIDR(d.biaya), `<span class="${labaRow>=0?'text-green-600':'text-red-600'} font-medium mono">${fmtIDR(labaRow)}</span>`];
        }) };
      window['_export_laba-rugi'] = { data: rows, fields: ['periode','pendapatan','biaya'] };
      window._lapStatCards = lrFilterBar + lrContent;
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
        '<div class="max-w-100 mx-auto">' +
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
    } else if (tab === 'rab-pembelian') {
      const filterPeriode = lapState.rp_periode || new Date().toISOString().slice(0, 7);
      const r = await api.get('/laporan/rab-pembelian-suplier?periode=' + filterPeriode);

      // Generate periode list
      var periods = [];
      var nowDate = new Date();
      for (var y = nowDate.getFullYear() - 2; y <= nowDate.getFullYear(); y++) {
        for (var m = 1; m <= 12; m++) {
          var mm = String(m).padStart(2, '0');
          periods.push(y + '-' + mm);
        }
      }
      periods = periods.filter(function(p) { return p <= nowDate.toISOString().slice(0, 7); }).reverse();

      var fmtIdr = fmtIDR;
      var fmtNum2 = fmtNum;

      // Filter bar
      var filterBar = '<div class="mb-4 flex flex-wrap items-center gap-3">' +
        '<div class="flex items-center gap-2">' +
        '<label class="text-xs font-medium text-stone-500">Periode:</label>' +
        '<select id="rp-filter-periode" onchange="gantiPeriodeRabPembelian()" class="text-xs border border-stone-300 rounded px-2 py-1.5">' +
        periods.map(function(p) { return '<option value="' + p + '" ' + (filterPeriode===p?'selected':'') + '>' + p + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="flex gap-2">' +
        '<button onclick="showLap(\'rab-pembelian\')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-medium">Refresh</button>' +
        '</div></div>';

      var statCards = '<div class="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 mb-4">' +
        statCard('Total Budget', fmtIdr(r.total_budget), 'RAB periode ini', 'bg-emerald-50') +
        statCard('Total PO', fmtIdr(r.grand_total_po), r.suppliers ? r.suppliers.length + ' supplier' : '0 supplier', 'bg-blue-50') +
        statCard('Total Bayar', fmtIdr(r.total_bayar || 0), r.sisa_bayar ? 'Sisa: ' + fmtIdr(r.sisa_bayar) : '', r.total_bayar > 0 ? 'bg-teal-50' : 'bg-stone-50') +
        statCard('Serapan', r.serapan_persen.toFixed(1) + '%', 'dari total budget', 'bg-violet-50') +
        statCard('Selisih', fmtIdr(r.selisih), r.selisih >= 0 ? 'surplus' : 'defisit', r.selisih >= 0 ? 'bg-emerald-50' : 'bg-red-50') +
      '</div>';

      // Toggle supplier / koperasi view
      var viewMode = lapState.rp_view || 'supplier';
      var toggleBtn = '<div class="mb-3 flex gap-2">' +
        '<button onclick="lapState.rp_view=\'supplier\';showLap(\'rab-pembelian\')" class="px-3 py-1.5 text-[11px] font-medium rounded-lg ' + (viewMode==='supplier'?'bg-emerald-600 text-white':'bg-stone-100 text-stone-600 hover:bg-stone-200') + '">Supplier View</button>' +
        '<button onclick="lapState.rp_view=\'koperasi\';showLap(\'rab-pembelian\')" class="px-3 py-1.5 text-[11px] font-medium rounded-lg ' + (viewMode==='koperasi'?'bg-emerald-600 text-white':'bg-stone-100 text-stone-600 hover:bg-stone-200') + '">Koperasi View</button>' +
        '</div>';

      var tableContent = '';

      if (viewMode === 'supplier' && r.suppliers && r.suppliers.length) {
        tableContent = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden">' +
          '<div class="px-4 py-3 font-bold text-sm border-b border-stone-200 bg-stone-50 flex items-center justify-between">' +
          '<span>Pembelian per Supplier</span>' +
          '<span class="text-xs font-normal text-stone-500">' + r.suppliers.length + ' supplier</span></div>' +
        '<div class="overflow-x-auto"><table class="w-full text-xs sm:text-sm">' +
        '<thead class="bg-stone-50"><tr>' +
        '<th class="w-6 px-1 py-2.5"></th>' +
        '<th class="text-left px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Supplier</th>' +
        '<th class="text-center px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider">PO</th>' +
        '<th class="text-right px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Total Pembelian</th>' +
        '<th class="text-right px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Total Bayar</th>' +
        '<th class="text-right px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Sisa Tagihan</th>' +
        '<th class="text-right px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">% Budget</th>' +
        '<th class="text-center px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Status</th>' +
        '<th class="text-right px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">PO Terakhir</th>' +
        '</tr></thead><tbody>';

        r.suppliers.forEach(function(s, si) {
          var st = s.status;
          var statusBadges = '';
          if (st.draft > 0) statusBadges += '<span class="inline-block bg-stone-200 text-stone-600 text-[10px] px-1.5 py-0.5 rounded mr-0.5">Draft:' + st.draft + '</span>';
          if (st.disetujui > 0) statusBadges += '<span class="inline-block bg-blue-100 text-blue-600 text-[10px] px-1.5 py-0.5 rounded mr-0.5">Disetujui:' + st.disetujui + '</span>';
          if (st.dibayar > 0) statusBadges += '<span class="inline-block bg-emerald-100 text-emerald-600 text-[10px] px-1.5 py-0.5 rounded mr-0.5">Dibayar:' + st.dibayar + '</span>';
          if (st.dikirim > 0) statusBadges += '<span class="inline-block bg-amber-100 text-amber-600 text-[10px] px-1.5 py-0.5 rounded mr-0.5">Dikirim:' + st.dikirim + '</span>';
          if (st.diterima > 0) statusBadges += '<span class="inline-block bg-teal-100 text-teal-600 text-[10px] px-1.5 py-0.5 rounded mr-0.5">Diterima:' + st.diterima + '</span>';

          var hasItems = s.items && s.items.length;
          var detailId = 'rp-supplier-detail-' + si;

          tableContent += '<tr class="border-t border-stone-100 hover:bg-stone-50">' +
            '<td class="px-1 py-2.5 text-center cursor-pointer" onclick="toggleRpSupplier(' + si + ')">' +
            (hasItems ? '<span id="rp-supplier-arrow-' + si + '" class="text-stone-400 text-xs transition-transform inline-block">▶</span>' : '') +
            '</td>' +
            '<td class="px-3 sm:px-4 py-2.5 font-medium">' + escHtml(s.supplier_nama) + '</td>' +
            '<td class="px-2 py-2.5 text-center font-bold text-sm">' + s.total_po + '</td>' +
          '<td class="px-3 sm:px-4 py-2.5 text-right mono font-semibold">' + fmtIdr(s.total_nilai) + '</td>' +
          '<td class="px-3 sm:px-4 py-2.5 text-right mono text-xs text-emerald-600">' + fmtIdr(s.total_bayar) + '</td>' +
          '<td class="px-3 sm:px-4 py-2.5 text-right mono text-xs font-semibold ' + (s.sisa_tagihan > 0 ? 'text-red-600' : 'text-emerald-600') + '">' + fmtIdr(Math.abs(s.sisa_tagihan || 0)) + '</td>' +
          '<td class="px-3 sm:px-4 py-2.5 text-right">' +
            '<div class="flex items-center justify-end gap-1.5">' +
            '<span class="text-xs font-medium">' + s.porsi_budget.toFixed(1) + '%</span>' +
            '<div class="w-12 bg-stone-200 rounded-full h-1.5"><div class="bg-emerald-500 h-1.5 rounded-full" style="width:' + Math.min(s.porsi_budget, 100) + '%"></div></div>' +
            '</div></td>' +
            '<td class="px-2 py-2.5 text-center">' + (statusBadges || '<span class="text-stone-400 text-[10px]">—</span>') + '</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right text-[10px] text-stone-500">' + (s.last_po_tanggal ? fmtDate(s.last_po_tanggal) : '-') + '</td></tr>';

          // Detail row (hidden)
          if (hasItems) {
            tableContent += '<tr id="' + detailId + '" class="hidden">' +
              '<td colspan="9" class="px-4 py-3 bg-stone-50/70">' +
              '<table class="w-full text-[10px]">' +
              '<thead><tr class="text-stone-500 border-b border-stone-200">' +
              '<th class="px-2 py-1 text-left">No. PO</th>' +
              '<th class="px-2 py-1 text-left">Tanggal</th>' +
              '<th class="px-2 py-1 text-left">Bahan</th>' +
              '<th class="px-2 py-1 text-center">Jumlah</th>' +
              '<th class="px-2 py-1 text-right">Harga Satuan</th>' +
              '<th class="px-2 py-1 text-right">Subtotal</th>' +
              '</tr></thead><tbody>';
            s.items.forEach(function(it) {
              tableContent += '<tr class="border-b border-stone-100">' +
                '<td class="px-2 py-1">' + escHtml(it.no_po) + '</td>' +
                '<td class="px-2 py-1">' + fmtDate(it.po_tanggal) + '</td>' +
                '<td class="px-2 py-1">' + escHtml(it.nama_bahan) + '</td>' +
                '<td class="px-2 py-1 text-center">' + it.jumlah + ' ' + escHtml(it.satuan) + '</td>' +
                '<td class="px-2 py-1 text-right mono">' + fmtIdr(it.harga_satuan) + '</td>' +
                '<td class="px-2 py-1 text-right mono font-medium">' + fmtIdr(it.subtotal) + '</td></tr>';
            });
            tableContent += '</tbody></table></td></tr>';
          }
        });

        tableContent += '</tbody></table></div></div>';
      } else if (viewMode === 'koperasi') {
        if (r.koperasi && r.koperasi.length) {
          tableContent = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden">' +
            '<div class="px-4 py-3 font-bold text-sm border-b border-stone-200 bg-stone-50 flex items-center justify-between">' +
            '<span>Pembelian per Koperasi (dari item PO)</span>' +
            '<span class="text-xs font-normal text-stone-500">' + r.koperasi.length + ' koperasi</span></div>' +
            '<div class="overflow-x-auto"><table class="w-full text-xs sm:text-sm">' +
            '<thead class="bg-stone-50"><tr>' +
            '<th class="text-left px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">ID Koperasi</th>' +
            '<th class="text-left px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Nama Bahan</th>' +
            '<th class="text-right px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Total Nilai</th>' +
            '<th class="text-center px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider">PO</th>' +
            '<th class="text-center px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Supplier</th>' +
            '</tr></thead><tbody>';

          r.koperasi.forEach(function(k) {
            tableContent += '<tr class="border-t border-stone-100 hover:bg-stone-50">' +
              '<td class="px-3 sm:px-4 py-2.5 font-medium text-xs">Kop-' + k.id_koperasi + '</td>' +
              '<td class="px-3 sm:px-4 py-2.5">' + escHtml(k.nama_koperasi) + '</td>' +
              '<td class="px-3 sm:px-4 py-2.5 text-right mono font-semibold">' + fmtIdr(k.total_nilai) + '</td>' +
              '<td class="px-2 py-2.5 text-center">' + k.po_count + '</td>' +
              '<td class="px-2 py-2.5 text-center text-[10px] text-stone-500">' + k.supplier_count + '</td></tr>';
          });

          tableContent += '</tbody></table></div></div>';
        } else {
          tableContent = '<div class="text-center py-12 text-stone-400 bg-white border border-stone-200 rounded-lg">' +
            '<p class="text-sm font-medium">Belum ada data koperasi</p>' +
            '<p class="text-xs mt-1">Data koperasi akan muncul jika item PO memiliki id_koperasi di bahan baku</p></div>';
        }

        // No supplier data
        if (!r.suppliers || !r.suppliers.length) {
          tableContent = filterBar + '<div class="text-center py-12 text-stone-400">Tidak ada data pembelian untuk periode ini</div>';
        }
      } else {
        tableContent = '<div class="text-center py-12 text-stone-400 bg-white border border-stone-200 rounded-lg">' +
          '<p class="text-sm font-medium">Belum ada data pembelian</p></div>';
      }

      window._lapData = null;
      window._lapStatCards = filterBar + statCards + toggleBtn + tableContent;

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
    } else if (tab === 'hpp') {
      const r = await api.get('/laporan/hpp');
      const rows = r.rows || [];
      const stats = r.stats || {};
      const detailBahan = r.detail_bahan || {};

      window._lapData = { tab: 'hpp', rows,
        headers: ['Menu','Kategori','Jumlah Bahan','Total HPP'],
        fields: ['menu_nama','kategori_penerima','jumlah_bahan','total_hpp'],
        fmt: rows.map(m => [
          escHtml(m.menu_nama),
          m.kategori_penerima || '-',
          fmtNum(m.jumlah_bahan) + ' bahan',
          fmtIDR(m.total_hpp),
        ])
      };
      window['_export_hpp'] = { data: rows, fields: ['menu_nama','kategori_penerima','jumlah_bahan','total_hpp'] };

      // Build stat cards
      let statHtml = `<div class="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 mb-4">
        ${statCard('Total Menu', fmtNum(stats.total_menu || 0), '', 'bg-amber-50')}
        ${statCard('Total Bahan', fmtNum(stats.total_bahan || 0), 'semua menu', 'bg-blue-50')}
        ${statCard('Total HPP', fmtIDR(stats.total_hpp_all || 0), '', 'bg-emerald-50')}
        ${statCard('Rata-rata HPP', fmtIDR(stats.rata_hpp || 0), '/menu', 'bg-violet-50')}
        ${statCard('Menu Tanpa Bahan', fmtNum(stats.menu_tanpa_bahan || 0), 'belum diisi', stats.menu_tanpa_bahan > 0 ? 'bg-red-50' : 'bg-emerald-50')}
      </div>`;

      // Build table with expandable detail
      var hppTable = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-xs sm:text-sm">' +
        '<thead class="bg-stone-50"><tr>' +
        '<th class="text-left px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Menu</th>' +
        '<th class="text-left px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Kategori</th>' +
        '<th class="text-right px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Bahan</th>' +
        '<th class="text-right px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider">Total HPP</th>' +
        '</tr></thead><tbody>';

      rows.forEach(function(m) {
        var detailRow = '';
        var bahanList = detailBahan[m.menu_id] || [];
        if (bahanList.length) {
          var detailHtml = bahanList.map(function(b) {
            return '<tr class="bg-stone-50/50">' +
              '<td class="px-6 py-1.5 text-[11px] text-stone-500">↳ ' + escHtml(b.bahan_nama) + '</td>' +
              '<td class="px-2 py-1.5 text-[11px] text-stone-500"></td>' +
              '<td class="px-3 py-1.5 text-[11px] text-right text-stone-500">' + fmtNum(b.jumlah) + ' ' + (b.satuan||'') + '</td>' +
              '<td class="px-3 py-1.5 text-[11px] text-right text-stone-500 mono">@' + fmtIDR(b.harga_satuan) + '</td>' +
              '<td class="px-3 py-1.5 text-[11px] text-right text-stone-500 mono">' + fmtIDR(b.subtotal) + '</td>' +
              '</tr>';
          }).join('');
          detailRow = '<tr class="detail-hpp-' + m.menu_id + '" style="display:none">' +
            '<td colspan="5" class="p-0"><div class="overflow-hidden"><table class="w-full text-xs">' +
            '<thead><tr class="bg-stone-100"><th class="px-6 py-1.5 text-[10px] font-medium text-left">Bahan Baku</th><th class="px-2 py-1.5"></th><th class="px-3 py-1.5 text-[10px] font-medium text-right">Jumlah</th><th class="px-3 py-1.5 text-[10px] font-medium text-right">Harga</th><th class="px-3 py-1.5 text-[10px] font-medium text-right">Subtotal</th></tr></thead><tbody>' +
            detailHtml + '</tbody></table></div></td></tr>';
        }        hppTable += '<tr class="border-t border-stone-100 hover:bg-stone-50 cursor-pointer" onclick="toggleHppDetail(' + m.menu_id + ')">' +
          '<td class="px-3 sm:px-4 py-2.5 sm:py-3 font-medium">' +
          '<span class="inline-flex items-center gap-1.5">' +
          '<span id="arrow-hpp-' + m.menu_id + '" class="text-stone-400 transition-transform duration-150">▶</span> ' +
          escHtml(m.menu_nama) + '</span></td>' +
          '<td class="px-2 py-2.5 sm:py-3 text-xs text-stone-500">' + (m.kategori_penerima || '-') + '</td>' +
          '<td class="px-3 sm:px-4 py-2.5 sm:py-3 text-right">' + fmtNum(m.jumlah_bahan) + '</td>' +
          '<td class="px-3 sm:px-4 py-2.5 sm:py-3 text-right mono font-bold text-[#1e40af]">' + fmtIDR(m.total_hpp) + '</td>' +
          '</tr>' + detailRow;
      });

      hppTable += '</tbody></table></div></div>';

      window._lapStatCards = statHtml + hppTable;
    } else if (tab === 'arus-kas') {
      const now = new Date();
      const blnVal = lapState.ak_bulan || String(now.getMonth() + 1).padStart(2, '0');
      const thnVal = lapState.ak_tahun || String(now.getFullYear());
      var akFilterBar = '<div class="mb-4 flex flex-wrap items-center gap-3"><div class="flex items-center gap-2">' +
        '<label class="text-xs font-medium text-stone-500">Periode:</label>' +
        '<select id="ak-bulan" onchange="gantiPeriodeAK()" class="text-xs border border-stone-300 rounded px-2 py-1.5">' +
        [1,2,3,4,5,6,7,8,9,10,11,12].map(function(b) { return '<option value="' + b + '" ' + (parseInt(blnVal)===b?'selected':'') + '>' + ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][b-1] + '</option>'; }).join('') +
        '</select>' +
        '<select id="ak-tahun" onchange="gantiPeriodeAK()" class="text-xs border border-stone-300 rounded px-2 py-1.5">' +
        [2024,2025,2026,2027,2028].map(function(t) { return '<option value="' + t + '" ' + (parseInt(thnVal)===t?'selected':'') + '>' + t + '</option>'; }).join('') +
        '</select></div></div>';

      const r = await api.get('/laporan/arus-kas?bulan=' + blnVal + '&tahun=' + thnVal);
      const fmtIdr = fmtIDR;

      // Rincian Kas Masuk
      var masukHtml = (r.kas_masuk?.rincian||[]).map(function(k) {
        return '<tr class="border-t border-stone-100"><td class="px-3 py-2 text-xs">' + escHtml(k.kategori) + '</td>' +
          '<td class="px-3 py-2 text-right mono text-xs">' + fmtIdr(k.jumlah) + '</td></tr>';
      }).join('') || '<tr><td class="px-3 py-4 text-center text-stone-400 text-xs" colspan="2">Tidak ada transaksi</td></tr>';

      // Rincian Kas Keluar
      var keluarHtml = (r.kas_keluar?.rincian||[]).map(function(k) {
        return '<tr class="border-t border-stone-100"><td class="px-3 py-2 text-xs">' + escHtml(k.kategori) + '</td>' +
          '<td class="px-3 py-2 text-right mono text-xs">' + fmtIdr(k.jumlah) + '</td></tr>';
      }).join('') || '<tr><td class="px-3 py-4 text-center text-stone-400 text-xs" colspan="2">Tidak ada transaksi</td></tr>';

      var saldoAkhir = r.saldo_akhir || 0;
      var selisih = r.selisih || 0;

      var akContent = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">' +
        statCard('Saldo Awal', fmtIdr(r.saldo_awal), 'sebelum periode', 'bg-stone-50') +
        statCard('Kas Masuk', fmtIdr(r.kas_masuk?.total||0), r.kas_masuk?.rincian?.length + ' kategori', 'bg-emerald-50') +
        statCard('Kas Keluar', fmtIdr(r.kas_keluar?.total||0), r.kas_keluar?.rincian?.length + ' kategori', 'bg-orange-50') +
        statCard('Saldo Akhir', fmtIdr(saldoAkhir), selisih>=0?'surplus':'defisit', selisih>=0?'bg-emerald-50':'bg-red-50') +
      '</div>' +
      // Detail tables
      '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">' +
      // Masuk
      '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden">' +
      '<div class="px-4 py-2.5 font-bold text-sm border-b border-stone-200 bg-emerald-50 text-emerald-800 flex items-center justify-between"><span>💳 KAS MASUK</span><span class="text-xs font-normal">' + fmtIdr(r.kas_masuk?.total||0) + '</span></div>' +
      '<table class="w-full text-xs"><thead><tr class="bg-stone-50"><th class="text-left px-3 py-2 text-[10px] font-semibold">Kategori</th><th class="text-right px-3 py-2 text-[10px] font-semibold">Jumlah</th></tr></thead><tbody>' +
      masukHtml +
      '<tr class="border-t-2 border-stone-400 font-bold bg-emerald-50"><td class="px-3 py-2.5 text-xs">Total Masuk</td><td class="px-3 py-2.5 text-right mono text-xs">' + fmtIdr(r.kas_masuk?.total||0) + '</td></tr>' +
      '</tbody></table></div>' +
      // Keluar
      '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden">' +
      '<div class="px-4 py-2.5 font-bold text-sm border-b border-stone-200 bg-orange-50 text-orange-800 flex items-center justify-between"><span>📉 KAS KELUAR</span><span class="text-xs font-normal">' + fmtIdr(r.kas_keluar?.total||0) + '</span></div>' +
      '<table class="w-full text-xs"><thead><tr class="bg-stone-50"><th class="text-left px-3 py-2 text-[10px] font-semibold">Kategori</th><th class="text-right px-3 py-2 text-[10px] font-semibold">Jumlah</th></tr></thead><tbody>' +
      keluarHtml +
      '<tr class="border-t-2 border-stone-400 font-bold bg-orange-50"><td class="px-3 py-2.5 text-xs">Total Keluar</td><td class="px-3 py-2.5 text-right mono text-xs">' + fmtIdr(r.kas_keluar?.total||0) + '</td></tr>' +
      '</tbody></table></div></div>' +
      // Ringkasan bottom
      '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden">' +
      '<div class="p-4 flex items-center justify-between">' +
      '<div><span class="text-sm font-bold">💵 Ringkasan Arus Kas</span><br><span class="text-xs text-stone-500">' + r.periode + '</span></div>' +
      '<div class="text-right">' +
      '<div class="text-xs text-stone-500">Saldo Awal: ' + fmtIdr(r.saldo_awal) + '</div>' +
      '<div class="text-xs text-stone-500">(+) Masuk: ' + fmtIdr(r.kas_masuk?.total||0) + '</div>' +
      '<div class="text-xs text-stone-500">(−) Keluar: ' + fmtIdr(r.kas_keluar?.total||0) + '</div>' +
      '<div class="text-sm font-bold mono ' + (selisih>=0?'text-green-600':'text-red-600') + '">= Saldo Akhir: ' + fmtIdr(saldoAkhir) + '</div>' +
      '</div></div></div>';

      window._lapData = null;
      window._lapStatCards = akFilterBar + akContent;
    } else if (tab === 'keuangan') {
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
    } else if (tab === 'jurnal-umum') {
      const r = await api.get('/laporan/jurnal-umum');
      const jurnal = r.jurnal || [];
      window._lapData = { tab: 'jurnal-umum', rows: jurnal,
        headers: ['No Jurnal','Tanggal','Deskripsi','Total Debit','Total Kredit','Sumber'],
        fields: ['no_jurnal','tanggal','deskripsi','total_debit','total_kredit','sumber_transaksi'],
        fmt: jurnal.map(j => [
          j.no_jurnal, fmtDate(j.tanggal), j.deskripsi||'-', fmtIDR(j.total_debit), fmtIDR(j.total_kredit), j.sumber_transaksi||'-'
        ])
      };
      window['_export_jurnal-umum'] = { data: jurnal, fields: ['no_jurnal','tanggal','deskripsi','total_debit','total_kredit','sumber_transaksi'] };
      window._lapStatCards = `<div class="mb-4 flex flex-wrap items-center gap-3">
        <div class="text-xs text-stone-500">${r.total} jurnal · ${r.periode?.start} s/d ${r.periode?.end}</div>
        <div class="text-xs font-medium">Grand Total Debit: ${fmtIDR(r.grand_debit)}</div>
        <div class="text-xs font-medium">Grand Total Kredit: ${fmtIDR(r.grand_kredit)}</div>
      </div>`;

    } else if (tab === 'buku-besar') {
      // First fetch COA for akun selector
      const coa = await api.get('/akun/coa');
      const akunId = lapState.bb_akun_id || '';
      const params = akunId ? '?akun_id=' + akunId : '';
      const r = await api.get('/laporan/buku-besar' + params);
      const akunList = r.result || [];

      var akunOpts = '<option value="">— Semua Akun —</option>' +
        coa.map(function(a) { return '<option value="' + a.id + '" ' + (String(a.id) === String(akunId) ? 'selected' : '') + '>' + a.kode + ' - ' + a.nama + '</option>'; }).join('');

      var filterBar = '<div class="mb-4 flex flex-wrap items-center gap-3">' +
        '<label class="text-xs font-medium text-stone-500">Akun:</label>' +
        '<select onchange="lapState.bb_akun_id=this.value;showLap(\'buku-besar\')" class="text-xs border border-stone-300 rounded px-2 py-1.5 min-w-[200px]">' + akunOpts + '</select>' +
        '<span class="text-xs text-stone-400">' + r.periode?.start + ' s/d ' + r.periode?.end + '</span></div>';

      var tableContent = '';
      akunList.forEach(function(akun) {
        tableContent += '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden mb-4">' +
          '<div class="px-4 py-3 font-bold text-sm border-b border-stone-200 bg-stone-50 flex items-center justify-between">' +
          '<span>' + akun.akun_kode + ' - ' + akun.akun_nama + '</span>' +
          '<span class="text-xs font-normal text-stone-500">' + akun.kelompok + ' (' + akun.saldo_normal + ')</span></div>' +
          '<div class="px-4 py-2 bg-stone-50 border-b border-stone-200 text-xs text-stone-500 flex gap-4">' +
          '<span>Saldo Awal: <strong class="mono">' + fmtIDR(akun.saldo_awal) + '</strong></span>' +
          '<span>Debit: <strong class="mono">' + fmtIDR(akun.total_debit) + '</strong></span>' +
          '<span>Kredit: <strong class="mono">' + fmtIDR(akun.total_kredit) + '</strong></span>' +
          '<span>Saldo Akhir: <strong class="mono">' + fmtIDR(akun.saldo_akhir) + '</strong></span></div>';

        if (akun.mutasi && akun.mutasi.length) {
          tableContent += '<div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-stone-50"><tr>' +
            '<th class="text-left px-3 py-2 text-[10px] font-semibold uppercase">Tanggal</th>' +
            '<th class="text-left px-3 py-2 text-[10px] font-semibold uppercase">No Jurnal</th>' +
            '<th class="text-left px-3 py-2 text-[10px] font-semibold uppercase">Deskripsi</th>' +
            '<th class="text-right px-3 py-2 text-[10px] font-semibold uppercase">Debit</th>' +
            '<th class="text-right px-3 py-2 text-[10px] font-semibold uppercase">Kredit</th>' +
            '<th class="text-right px-3 py-2 text-[10px] font-semibold uppercase">Saldo</th>' +
            '</tr></thead><tbody>';
          akun.mutasi.forEach(function(m) {
            tableContent += '<tr class="border-t border-stone-100 hover:bg-stone-50">' +
              '<td class="px-3 py-2">' + fmtDate(m.tanggal) + '</td>' +
              '<td class="px-3 py-2 mono text-[10px]">' + m.no_jurnal + '</td>' +
              '<td class="px-3 py-2">' + (m.deskripsi||'-') + '</td>' +
              '<td class="px-3 py-2 text-right mono">' + (m.debit > 0 ? fmtIDR(m.debit) : '') + '</td>' +
              '<td class="px-3 py-2 text-right mono">' + (m.kredit > 0 ? fmtIDR(m.kredit) : '') + '</td>' +
              '<td class="px-3 py-2 text-right mono font-medium">' + fmtIDR(m.saldo) + '</td></tr>';
          });
          tableContent += '</tbody></table></div>';
        } else {
          tableContent += '<div class="p-4 text-center text-stone-400 text-xs">Tidak ada mutasi periode ini</div>';
        }
        tableContent += '</div>';
      });

      if (!akunList.length) {
        tableContent = '<div class="text-center py-12 text-stone-400">Tidak ada data buku besar</div>';
      }

      window._lapData = null;
      window._lapStatCards = filterBar + tableContent;

    } else if (tab === 'neraca') {
      const r = await api.get('/laporan/neraca');

      var fmtIdr3 = fmtIDR;
      var selisihClass = Math.abs(r.selisih) < 1 ? 'text-emerald-600' : 'text-red-600';

      window._lapStatCards = `<div class="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        ${statCard('Total Aktiva', fmtIdr3(r.aktiva.total), '', 'bg-blue-50')}
        ${statCard('Total Kewajiban', fmtIdr3(r.kewajiban.total), '', 'bg-orange-50')}
        ${statCard('Total Ekuitas', fmtIdr3(r.ekuitas.total), 'Laba berjalan: ' + fmtIdr3(r.ekuitas.laba_berjalan), 'bg-emerald-50')}
        ${statCard('Selisih', fmtIdr3(r.selisih), Math.abs(r.selisih) < 1 ? 'Balance ✓' : 'Tidak Balance!', selisihClass)}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div class="bg-white border border-stone-200 rounded-lg overflow-hidden">
          <div class="px-4 py-3 font-bold text-sm bg-blue-50 border-b border-stone-200">AKTIVA</div>
          <table class="w-full text-xs">
            <tbody>
              ${(r.aktiva.rincian||[]).map(function(a) {
                return '<tr class="border-t border-stone-100 hover:bg-stone-50"><td class="px-4 py-2">' + a.akun_kode + ' - ' + a.akun_nama + '</td><td class="px-4 py-2 text-right mono font-medium">' + fmtIdr3(a.saldo) + '</td></tr>';
              }).join('') || '<tr><td class="px-4 py-4 text-center text-stone-400">Tidak ada data</td></tr>'}
              <tr class="border-t-2 border-stone-400 bg-blue-50 font-bold"><td class="px-4 py-2">TOTAL AKTIVA</td><td class="px-4 py-2 text-right mono">' + fmtIdr3(r.aktiva.total) + '</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <div class="bg-white border border-stone-200 rounded-lg overflow-hidden mb-4">
            <div class="px-4 py-3 font-bold text-sm bg-orange-50 border-b border-stone-200">KEWAJIBAN</div>
            <table class="w-full text-xs">
              <tbody>
                ${(r.kewajiban.rincian||[]).map(function(a) {
                  return '<tr class="border-t border-stone-100 hover:bg-stone-50"><td class="px-4 py-2">' + a.akun_kode + ' - ' + a.akun_nama + '</td><td class="px-4 py-2 text-right mono font-medium">' + fmtIdr3(a.saldo) + '</td></tr>';
                }).join('') || '<tr><td class="px-4 py-4 text-center text-stone-400">Tidak ada data</td></tr>'}
                <tr class="border-t-2 border-stone-400 bg-orange-50 font-bold"><td class="px-4 py-2">TOTAL KEWAJIBAN</td><td class="px-4 py-2 text-right mono">' + fmtIdr3(r.kewajiban.total) + '</td></tr>
              </tbody>
            </table>
          </div>
          <div class="bg-white border border-stone-200 rounded-lg overflow-hidden">
            <div class="px-4 py-3 font-bold text-sm bg-emerald-50 border-b border-stone-200">EKUITAS</div>
            <table class="w-full text-xs">
              <tbody>
                ${(r.ekuitas.rincian||[]).map(function(a) {
                  return '<tr class="border-t border-stone-100 hover:bg-stone-50"><td class="px-4 py-2">' + a.akun_kode + ' - ' + a.akun_nama + '</td><td class="px-4 py-2 text-right mono font-medium">' + fmtIdr3(a.saldo) + '</td></tr>';
                }).join('') || ''}
                <tr class="border-t border-stone-100 bg-emerald-50"><td class="px-4 py-2">Laba Berjalan</td><td class="px-4 py-2 text-right mono font-medium">' + fmtIdr3(r.ekuitas.laba_berjalan) + '</td></tr>
                <tr class="border-t-2 border-stone-400 bg-emerald-50 font-bold"><td class="px-4 py-2">TOTAL EKUITAS</td><td class="px-4 py-2 text-right mono">' + fmtIdr3(r.ekuitas.total) + '</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="text-center text-xs text-stone-500">
        Neraca per ${r.tanggal} &nbsp;|&nbsp; Aktiva: ${fmtIdr3(r.aktiva.total)} = Kewajiban: ${fmtIdr3(r.kewajiban.total)} + Ekuitas: ${fmtIdr3(r.ekuitas.total)}
      </div>`;
      window._lapData = null;
    }
    renderLapPage();
  } catch (err) {
    console.error('showLap error:', err);
    if (wrap) {
      wrap.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat laporan: ${err.message}</div>`;
    }
  }
}

function renderLapPage() {
  const wrap = document.getElementById('lap-content');
  if (!wrap) return;
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

  let tblHtml = tableHtml(ld.headers, pageData);
  if (ld.totalRow) {
    const colspan = ld.headers.length;
    var totalCells = ld.totalRow.map(function(v) {
      return '<td class="px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold whitespace-nowrap">' + (v || '') + '</td>';
    }).join('');
    tblHtml = tblHtml.replace('</tbody>', '<tr class="border-t-2 border-stone-400 font-bold bg-stone-100">' + totalCells + '</tr></tbody>');
  }
  let html = (window._lapStatCards || '') + tblHtml;

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
function gantiPeriodeRab() {
  lapState.rab_periode = document.getElementById('rab-filter-periode')?.value || '';
  lapState.rab_siklus_id = document.getElementById('rab-filter-siklus')?.value || '';
  lapState.page = 1;
  showLap('rab');
}
async function hitungRealisasiRAB() {
  var periode = document.getElementById('rab-filter-periode')?.value;
  if (!periode) { showAlert('Pilih periode terlebih dahulu', 'error'); return; }
  if (!confirm('Hitung ulang realisasi budget untuk periode ' + periode + ' dari data kas_bank?')) return;
  try {
    var r = await api.post('/laporan/rab-hitung-realisasi', { periode: periode });
    showAlert('✅ Realisasi ' + periode + ' berhasil dihitung: Rp' + Number(r.totalRealisasi).toLocaleString('id-ID'), 'success');
    showLap('rab');
  } catch(e) {
    showAlert('Gagal: ' + e.message, 'error');
  }
}
function gantiPeriodeRabPembelian() {
  lapState.rp_periode = document.getElementById('rp-filter-periode')?.value || '';
  lapState.page = 1;
  showLap('rab-pembelian');
}

function toggleRpSupplier(idx) {
  var row = document.getElementById('rp-supplier-detail-' + idx);
  var arrow = document.getElementById('rp-supplier-arrow-' + idx);
  if (!row) return;
  row.classList.toggle('hidden');
  if (arrow) arrow.style.transform = row.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(90deg)';
}
// ===== Payroll Mingguan Helpers =====
function pmGanti() {
  lapState.pm_bulan = document.getElementById('pm-bulan')?.value;
  lapState.pm_tahun = document.getElementById('pm-tahun')?.value;
  lapState.pm_minggu = parseInt(document.getElementById('pm-minggu')?.value || '1');
  showLap('payroll-mingguan');
}

async function exportPayrollMingguanLap() {
  var data = window._pmExportData;
  if (!data || !data.karyawan || !data.karyawan.length) return showAlert('Tidak ada data', 'warning');

  var { minggu, karyawan } = data;
  var tglNama = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];

  var headers = ['Nama Karyawan', 'Jabatan'];
  minggu.dates.forEach(function(tgl) {
    var d = new Date(tgl + 'T00:00:00');
    var label = tglNama[d.getDay()] + ' ' + tgl.slice(8,10) + '/' + tgl.slice(5,7);
    headers.push(label + ' Masuk', label + ' Keluar');
  });
  headers.push('Total Hadir', 'Upah/Hari', 'Total Gaji');

  var rows = karyawan.map(function(k) {
    var row = [k.nama, k.jabatan];
    k.harian.forEach(function(h) {
      if (h && h.status === 'Hadir') row.push(h.masuk || '-', h.keluar || '-');
      else if (h) row.push(h.status, '-');
      else row.push('-', '-');
    });
    row.push(k.total_hadir, k.upah_per_hari, k.total_gaji);
    return row;
  });

  var totalHadir = karyawan.reduce(function(s, k) { return s + k.total_hadir; }, 0);
  var totalGaji = karyawan.reduce(function(s, k) { return s + k.total_gaji; }, 0);
  var totalRow = ['TOTAL', ''];
  minggu.dates.forEach(function() { totalRow.push('', ''); });
  totalRow.push(totalHadir, '', totalGaji);
  rows.push(totalRow);

  var wsData = [headers].concat(rows);
  var ws = XLSX.utils.aoa_to_sheet(wsData);
  var colWidths = [{ wch: 28 }, { wch: 18 }];
  minggu.dates.forEach(function() { colWidths.push({ wch: 10 }, { wch: 10 }); });
  colWidths.push({ wch: 10 }, { wch: 12 }, { wch: 14 });
  ws['!cols'] = colWidths;

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Payroll Mingguan');
  var filename = 'payroll-mingguan-' + minggu.label.replace(/[\s,()]/g, '_') + '.xlsx';
  XLSX.writeFile(wb, filename);
}

async function bayarPayrollMingguanLap() {
  var bln = document.getElementById('pm-bulan')?.value || '';
  var thn = document.getElementById('pm-tahun')?.value || '';
  var mgg = document.getElementById('pm-minggu')?.value || '1';
  if (!bln || !thn) return showAlert('Pilih bulan & tahun', 'warning');

  if (!await showConfirm('Bayar payroll mingguan ini? Jurnal otomatis akan dibuat di Kas Bank.', 'Ya, Bayar')) return;

  try {
    var res = await api.post('/payroll/mingguan/bayar', { bulan: parseInt(bln), tahun: parseInt(thn), minggu_ke: parseInt(mgg) });
    if (res.ok) {
      showToast('✅ ' + res.pesan, 'success');
      showLap('payroll-mingguan'); // refresh
    }
  } catch (e) {
    if (e.status === 409) {
      showAlert('Jurnal sudah ada (No. ' + (e.data?.no_transaksi || '') + ')', 'warning');
    } else {
      showAlert('Gagal: ' + (e.message || ''), 'error');
    }
  }
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

  const SHORT_TO_LONG = { Karbo: 'Karbohidrat', ProHe: 'Protein Hewani', ProNa: 'Protein Nabati', Sayur: 'Sayur', Buah: 'Buah', Susu: 'Susu', Minyak: 'Minyak' };
  const KAT_MAP = { Karbohidrat: 'Makanan Pokok', 'Protein Hewani': 'Lauk Hewani', 'Protein Nabati': 'Lauk Nabati', Sayur: 'Sayur', Buah: 'Buah', Susu: 'Susu', Minyak: 'Minyak' };
  const ROW_KEYS = ['Karbohidrat', 'Protein Hewani', 'Protein Nabati', 'Sayur', 'Buah', 'Susu'];
  const ROW_LABELS = ROW_KEYS.map(k => KAT_MAP[k] || k);

  let allHtml = '';
  for (let si = 0; si < siklus.length; si++) {
    const s = siklus[si];
    const days = s.days || [];
    if (!days.length) continue;

    let maxHari = 0;
    for (const d of days) {
      if (d.hari_ke > maxHari) maxHari = d.hari_ke;
    }
    if (!maxHari) continue;

    const dayKeys = Array.from({ length: maxHari }, (_, i) => i + 1);

    allHtml += `<div class="mb-2 mt-${si > 0 ? 6 : 0} px-3 py-2 bg-amber-100 border border-amber-300 rounded-t-lg flex items-center justify-between">`;
    allHtml += `<span class="font-bold text-sm text-amber-900">📋 ${escHtml(s.nama || 'Siklus ' + (si+1))}</span>`;
    allHtml += `<span class="text-xs text-amber-700">${escHtml(s.kategori_penerima || '-')} · ${maxHari} hari</span>`;
    allHtml += '</div>';

    let html = '<div class="overflow-x-auto text-xs leading-relaxed border border-amber-300 rounded-b-lg">';
    html += '<table class="w-full border-collapse border border-stone-300">';
    html += '<thead>';
    html += '<tr class="bg-amber-400 text-center font-bold">';
    html += '<th class="border border-stone-300 px-3 py-2 text-[11px]" style="color:#000">Kelompok Bahan Makanan</th>';
    for (const k of dayKeys) {
      const dayNama = days.find(d => d.hari_ke === k);
      html += `<th class="border border-stone-300 px-3 py-2 text-center text-[11px]" style="color:#000">Menu ${k}<br><span class="text-[10px] font-normal">${dayNama ? dayNama.hari_nama : ''}</span></th>`;
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
        for (const d of days) {
          if (d.hari_ke === k && d.bahan_by_kat) {
            for (const g of d.bahan_by_kat) {
              const longCat = SHORT_TO_LONG[g.kategori] || g.kategori;
              if (longCat === ROW_KEYS[ri] && g.items) {
                for (const n of g.items) {
                  if (n.nama && !names.includes(n.nama)) names.push(n.nama);
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
    allHtml += html;
  }

  if (!allHtml) return '<div class="p-8 text-center text-stone-400">Belum ada hari terisi</div>';
  return allHtml;
}

function renderReportPage(tab) {
  const c = document.getElementById('content');
  c.innerHTML = `
    <div class="flex justify-end mb-3">
      <button onclick="exportXlsxLaporan('${tab}')" class="border border-stone-300 text-stone-700 hover:bg-stone-50 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-[11px] font-medium flex items-center gap-1.5">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Export XLSX
      </button>
    </div>
    <div id="lap-content"></div>
  `;
  showLap(tab);
}
function renderLapRab() { renderReportPage('rab'); }
function renderLapRabBulanan() { renderReportPage('rab-bulanan'); }
function renderLapPersediaan() { renderReportPage('persediaan'); }
function renderLapDistribusi() { renderReportPage('distribusi'); }
function renderLapKeuangan() { renderReportPage('keuangan'); }
function renderLapPengeluaranBulanan() { renderReportPage('pengeluaran-bulanan'); }
function renderLapPenggunaanAnggaran() { renderReportPage('penggunaan-anggaran'); }
function renderLapBpKas() { renderReportPage('bp-kas'); }
function renderLapSiklus() { renderReportPage('siklus'); }
function renderLapPembelian() { renderReportPage('pembelian'); }
function renderLapPenerimaan() { renderReportPage('penerimaan'); }
function renderLapMutasi() { renderReportPage('mutasi'); }
function renderLapProduksi() { renderReportPage('produksi'); }
function renderLapPayroll() { renderReportPage('payroll'); }
function renderLapPayrollMingguan() { renderReportPage('payroll-mingguan'); }
function renderLapLabaRugi() { renderReportPage('laba-rugi'); }
function renderLapHpp() { renderReportPage('hpp'); }
function renderLapJurnalUmum() { renderReportPage('jurnal-umum'); }
function renderLapBukuBesar() { renderReportPage('buku-besar'); }
function renderLapNeraca() { renderReportPage('neraca'); }
function renderLapArusKas() { renderReportPage('arus-kas'); }

function renderResepTable(siklusList, kategori_order) {
  if (!siklusList || !siklusList.length) return '<div class="p-8 text-center text-stone-400">Tidak ada siklus aktif</div>';

  const SHORT_TO_LONG = { Karbo: 'Karbohidrat', ProHe: 'Protein Hewani', ProNa: 'Protein Nabati', Sayur: 'Sayur', Buah: 'Buah', Susu: 'Susu', Minyak: 'Minyak' };
  const ROW_KEYS = ['Karbohidrat', 'Protein Hewani', 'Protein Nabati', 'Sayur', 'Buah', 'Susu'];

  let allHtml = '';
  for (let si = 0; si < siklusList.length; si++) {
    const s = siklusList[si];
    const days = s.days || [];
    if (!days.length) continue;

    let maxHari = 0;
    for (const d of days) {
      if (d.hari_ke > maxHari) maxHari = d.hari_ke;
    }
    if (!maxHari) continue;

    const dayKeys = Array.from({ length: maxHari }, (_, i) => i + 1);

    // Group days by hari_ke and collect menu names per category
    const menuByDay = {};
    for (const k of dayKeys) menuByDay[k] = {};

    for (const d of days) {
      const hk = d.hari_ke;
      if (!d.menu_nama) continue;
      const parts = d.menu_nama.split(/[+,]/).map(s => s.trim()).filter(Boolean);
      const catWithItems = [];
      if (d.bahan_by_kat) {
        for (const g of d.bahan_by_kat) {
          const longCat = SHORT_TO_LONG[g.kategori] || g.kategori;
          if (ROW_KEYS.includes(longCat) && !catWithItems.includes(longCat)) catWithItems.push(longCat);
        }
      }
      let pi = 0;
      for (const ck of catWithItems) {
        const name = pi < parts.length ? parts[pi] : d.menu_nama;
        if (!menuByDay[hk][ck]) menuByDay[hk][ck] = [];
        if (!menuByDay[hk][ck].includes(name)) menuByDay[hk][ck].push(name);
        pi++;
      }
    }

    allHtml += `<div class="mb-2 mt-${si > 0 ? 4 : 0} px-3 py-2 bg-amber-100 border border-amber-300 rounded-t-lg flex items-center justify-between">`;
    allHtml += `<span class="font-bold text-sm text-amber-900">🍽️ ${escHtml(s.nama || 'Siklus ' + (si+1))}</span>`;
    allHtml += `<span class="text-xs text-amber-700">${escHtml(s.kategori_penerima || '-')} · ${maxHari} hari</span>`;
    allHtml += '</div>';

    let html = '<div class="overflow-x-auto border border-amber-300 rounded-b-lg">';
    html += '<table class="w-full border-collapse border border-stone-300 text-xs">';
    html += '<thead>';
    html += '<tr class="bg-amber-400 text-center font-bold">';
    html += '<th class="border border-stone-300 px-3 py-2 text-[11px]" style="color:#000">Nama Resep / Menu</th>';
    for (const k of dayKeys) {
      const dayNama = days.find(d => d.hari_ke === k);
      html += `<th class="border border-stone-300 px-3 py-2 text-center text-[11px]" style="color:#000">Menu ${k}<br><span class="text-[10px] font-normal">${dayNama ? dayNama.hari_nama : ''}</span></th>`;
    }
    html += '</tr>';
    html += '</thead>';
    html += '<tbody>';

    for (const kat of ROW_KEYS) {
      html += '<tr class="border border-stone-300">';
      html += `<td class="border border-stone-300 px-3 py-2 font-bold">${kat}</td>`;
      for (const k of dayKeys) {
        const names = menuByDay[k] && menuByDay[k][kat];
        const cell = names && names.length
          ? names.map(n => `<div class="py-0.5 font-medium text-teal-700">${n}</div>`).join('')
          : '<span class="text-stone-300">—</span>';
        html += `<td class="border border-stone-300 px-3 py-2 align-top">${cell}</td>`;
      }
      html += '</tr>';
    }

    html += '</tbody></table></div>';
    allHtml += html;
  }

  if (!allHtml) return '<div class="p-8 text-center text-stone-400">Belum ada data menu terisi</div>';
  return allHtml;
}

function gantiFilterSiklus() {
  lapState.siklus_id = document.getElementById('siklus-lap-filter')?.value || '';
  lapState.page = 1;
  showLap('siklus');
}
function gantiPeriodeLR() {
  lapState.lr_bulan = document.getElementById('lr-bulan')?.value;
  lapState.lr_tahun = document.getElementById('lr-tahun')?.value;
  showLap('laba-rugi');
}
function gantiPeriodeAK() {
  lapState.ak_bulan = document.getElementById('ak-bulan')?.value;
  lapState.ak_tahun = document.getElementById('ak-tahun')?.value;
  showLap('arus-kas');
}
function toggleHppDetail(menuId) {
  const row = document.querySelector('.detail-hpp-' + menuId);
  const arrow = document.getElementById('arrow-hpp-' + menuId);
  if (!row || !arrow) return;
  const isHidden = row.style.display === 'none' || !row.style.display;
  row.style.display = isHidden ? 'table-row' : 'none';
  arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
}

// ===== RAB Bulanan Helper Functions =====
function gantiPeriodeRabBulanan() {
  lapState.rb_bulan = document.getElementById('rb-bulan')?.value || '';
  lapState.rb_tahun = document.getElementById('rb-tahun')?.value || '';
  showLap('rab-bulanan');
}

function filterRabBulanan(periode) {
  if (!periode) return;
  const parts = periode.split('-');
  lapState.rb_tahun = parts[0];
  lapState.rb_bulan = parts[1];
  showLap('rab-bulanan');
}

async function generateBudgetDariRAB() {
  const bln = lapState.rb_bulan;
  const thn = lapState.rb_tahun;
  if (!bln || !thn) {
    showAlert('Pilih bulan dan tahun terlebih dahulu', 'warning');
    return;
  }
  const periode = thn + '-' + String(bln).padStart(2, '0');
  if (!await showConfirm('Generate entri budget untuk periode ' + periode + ' dari data aktual (produksi, penerima, harga referensi)?', 'Ya, Generate')) return;
  try {
    const res = await api.post('/laporan/rab-generate-budget', { periode: periode });
    if (res.can_overwrite) {
      if (!await showConfirm('Budget sudah ada untuk ' + periode + '. Timpa dengan data baru?', 'Ya, Timpa')) return;
      const res2 = await api.post('/laporan/rab-generate-budget?overwrite=true', { periode: periode });
      showAlert('Berhasil: ' + res2.kategori_count + ' entri budget dibuat', 'success');
    } else {
      showAlert('Berhasil: ' + res.kategori_count + ' entri budget dibuat untuk ' + periode, 'success');
    }
    showLap('rab-bulanan');
  } catch (e) {
    showAlert('Gagal: ' + (e.message || 'Unknown error'), 'error');
  }
}
