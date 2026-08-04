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
const LAP_TABS = ['siklus', 'persediaan', 'produksi', 'distribusi', 'rab', 'rab-harian', 'rab-bulanan', 'pengeluaran-bulanan', 'penggunaan-anggaran', 'bp-kas', 'payroll', 'payroll-mingguan', 'pembelian', 'penerimaan', 'mutasi', 'laba-rugi', 'arus-kas', 'keuangan', 'rab-pembelian', 'jurnal-umum', 'buku-besar', 'neraca'];
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
    'rab-harian': { active: 'bg-white text-cyan-600 shadow-sm', inactive: 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200' },
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
  const exportRabBtn = document.getElementById('export-rab-harian-btn');
  if (exportRabBtn) exportRabBtn.style.display = (tab === 'rab-harian') ? 'inline-flex' : 'none';
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
      const filterPeriode = lapState.rab_periode || '';
      const filterSiklusId = lapState.rab_siklus_id || '';

      const [siklusList, rabRes, rabTitikRes] = await Promise.all([
        api.get('/siklus').catch(() => []),
        api.get('/laporan/rab-sinkron?periode=' + filterPeriode + (filterSiklusId ? '&siklus_id=' + filterSiklusId : '')),
        api.get('/laporan/rab-per-titik?periode=' + filterPeriode + '&tanggal=' + (lapState.rab_pm_tanggal || '')).catch(() => null),
      ]);
      const r = rabRes;
      const effectivePeriode = r.periode || filterPeriode || new Date().toISOString().slice(0, 7);
      const rows = r.rows || [];
      const bd = r.budget || {};
      const siklusInfo = r.siklus || null;
      const isRABDraft = siklusInfo && siklusInfo.status === 'Draft';

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
      var biayaBahanBaku = bd.biaya_bahan_baku || 0;
      var biayaOperasional = bd.biaya_operasional || 0;
      var biayaGaji = bd.biaya_gaji || 0;
      var biayaLainnya = bd.biaya_lainnya || 0;
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
            periods.map(function(p) { return '<option value="' + p + '" ' + (effectivePeriode===p?'selected':'') + '>' + p + '</option>'; }).join('') +
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
      var summaryCards = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">' +
        '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">' +
          '<div class="flex items-center gap-2 mb-3"><div class="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-sm"><svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></div><div><div class="text-xs font-semibold text-stone-700">Ringkasan Anggaran</div></div></div>' +
          '<div class="space-y-1.5">' +
            '<div class="flex justify-between"><span class="text-xs text-stone-500">Budget</span><span class="text-xs font-semibold text-blue-600">' + fmtIdr(totalBudget) + '</span></div>' +
            '<div class="flex justify-between"><span class="text-xs text-stone-500">Realisasi</span><span class="text-xs font-semibold text-red-500">' + fmtIdr(totalBiayaKas) + '</span></div>' +
            '<div class="border-t border-stone-100 pt-1.5 flex justify-between"><span class="text-xs font-bold text-stone-700">Selisih</span><span class="text-xs font-bold ' + (totalSelisih >= 0 ? 'text-emerald-600' : 'text-red-600') + '">' + fmtIdr(Math.abs(totalSelisih)) + ' (' + (totalSelisih >= 0 ? 'surplus' : 'defisit') + ')' + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">' +
          '<div class="flex items-center gap-2 mb-3"><div class="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-sm"><svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div><div class="text-xs font-semibold text-stone-700">Detail Realisasi</div></div></div>' +
          '<div class="space-y-1.5">' +
            '<div class="flex justify-between"><span class="text-xs text-stone-500">Manual</span><span class="text-xs font-semibold text-stone-800">' + fmtIdr(bd.total_realisasi_manual || 0) + '</span></div>' +
            '<div class="flex justify-between"><span class="text-xs text-stone-500">Supplier</span><span class="text-xs font-semibold text-stone-800">' + fmtIdr(bd.total_realisasi_kas || 0) + '</span></div>' +
            '<div class="border-t border-stone-100 pt-1.5 flex justify-between"><span class="text-xs font-bold text-stone-700">Total</span><span class="text-xs font-bold text-red-500">' + fmtIdr(totalBiayaKas) + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">' +
          '<div class="flex items-center gap-2 mb-3"><div class="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-sm"><svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div><div><div class="text-xs font-semibold text-stone-700">Serapan</div></div></div>' +
          '<div class="flex items-end justify-between mb-1"><span class="text-xs text-stone-500">Progress</span><span class="text-xs font-bold text-stone-700">' + serapan.toFixed(1) + '%</span></div>' +
          '<div class="w-full bg-stone-100 rounded-full h-2 overflow-hidden"><div class="h-2 rounded-full transition-all duration-500 ' + (serapan > 100 ? 'bg-red-500' : serapan > 80 ? 'bg-amber-500' : serapan > 0 ? 'bg-emerald-500' : 'bg-stone-200') + '" style="width:' + Math.min(serapan, 100) + '%"></div></div>' +
          '<div class="flex justify-between mt-1 text-[10px] text-stone-400"><span>Budget: ' + fmtIdr(totalBudget) + '</span><span>Realisasi: ' + fmtIdr(totalBiayaKas) + '</span></div>' +
        '</div>' +
        '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">' +
          '<div class="flex items-center gap-2 mb-3"><div class="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shadow-sm"><svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div><div><div class="text-xs font-semibold text-stone-700">Rincian Biaya</div></div></div>' +
          '<div class="space-y-1">' +
            '<div class="flex justify-between"><span class="text-xs text-stone-500">Bahan Baku</span><span class="text-xs font-semibold text-teal-600">' + fmtIdr(biayaBahanBaku) + '</span></div>' +
            '<div class="flex justify-between"><span class="text-xs text-stone-500">Operasional</span><span class="text-xs font-semibold text-stone-700">' + fmtIdr(biayaOperasional) + '</span></div>' +
            '<div class="flex justify-between"><span class="text-xs text-stone-500">Gaji</span><span class="text-xs font-semibold text-amber-600">' + fmtIdr(biayaGaji) + '</span></div>' +
            (biayaLainnya > 0 ? '<div class="flex justify-between"><span class="text-xs text-stone-500">Lainnya</span><span class="text-xs font-semibold text-stone-500">' + fmtIdr(biayaLainnya) + '</span></div>' : '') +
            '<div class="border-t border-stone-100 pt-1 flex justify-between"><span class="text-xs font-bold text-stone-700">Total</span><span class="text-xs font-bold text-red-500">' + fmtIdr(totalBiayaKas) + '</span></div>' +
          '</div>' +
        '</div>' +
      '</div>';

      // Table
      var tableContent = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">' +
        '<div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between"><h3 class="text-xs font-bold text-stone-700 uppercase tracking-wider">Rincian per Kategori</h3><span class="text-[10px] text-stone-400">' + rows.length + ' kategori</span></div>' +
        '<div class="overflow-x-auto"><table class="w-full text-xs">' +
        '<thead><tr class="bg-stone-50">' +
        '<th class="text-left px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Kategori</th>' +
        '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Harga Besar</th>' +
        '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Harga Kecil</th>' +
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
          '<td class="px-4 py-3 text-right mono text-xs font-semibold text-amber-700">' + (b.harga_besar > 0 ? fmtIdr(b.harga_besar) : '<span class="text-stone-300">—</span>') + '</td>' +
          '<td class="px-4 py-3 text-right mono text-xs font-semibold text-rose-600">' + (b.harga_kecil > 0 ? fmtIdr(b.harga_kecil) : '<span class="text-stone-300">—</span>') + '</td>' +
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
        '<td class="px-4 py-3.5"></td><td class="px-4 py-3.5"></td><td class="px-1 py-3.5"></td>' +
        '<td class="px-4 py-3.5 text-right font-bold text-xs text-stone-800">' + fmtNum(r.grand_penerima) + '</td>' +
        '<td class="px-1 py-3.5"></td>' +
        '<td class="px-4 py-3.5 text-right font-bold text-xs text-stone-800">' + (r.total_hari || 0) + '</td>' +
        '<td class="px-1 py-3.5"></td>' +
        '<td class="px-4 py-3.5 text-right mono font-bold text-xs text-blue-700">' + fmtIdr(r.grand_total) + '</td>' +
        '<td class="px-4 py-3.5 text-right mono font-bold text-xs text-stone-800">' + fmtIdr(totalBudget) + '</td>' +
        '<td class="px-4 py-3.5 text-right mono font-bold text-xs ' + (totalSelisih >= 0 ? 'text-emerald-600' : 'text-red-600') + '">' + fmtIdr(totalBiayaKas) + '</td></tr>';

      tableContent += '</tbody></table></div></div>';

      // Tabel Rincian Biaya Pengeluaran
      var biayaContent = '<div class="mt-4 bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">' +
        '<div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between">' +
          '<h3 class="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-2"><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Biaya Bahan Baku & Pengeluaran</h3>' +
          '<span class="text-[10px] text-stone-400">' + effectivePeriode + '</span>' +
        '</div>' +
        '<div class="overflow-x-auto"><table class="w-full text-xs">' +
        '<thead><tr class="bg-stone-50">' +
        '<th class="text-left px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Jenis Biaya</th>' +
        '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Jumlah</th>' +
        '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">% Thd Total</th>' +
        '</tr></thead><tbody>' +
        '<tr class="border-t border-stone-100 hover:bg-stone-50/80 transition-colors">' +
          '<td class="px-4 py-3 font-medium text-xs"><span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-teal-500"></span>Biaya Bahan Baku</span></td>' +
          '<td class="px-4 py-3 text-right mono text-xs font-semibold text-teal-600">' + fmtIdr(biayaBahanBaku) + '</td>' +
          '<td class="px-4 py-3 text-right text-xs font-semibold text-stone-700">' + (totalBiayaKas > 0 ? (biayaBahanBaku / totalBiayaKas * 100).toFixed(1) + '%' : '—') + '</td>' +
        '</tr>' +
        '<tr class="border-t border-stone-100 bg-stone-50/40 hover:bg-stone-50/80 transition-colors">' +
          '<td class="px-4 py-3 font-medium text-xs"><span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-blue-500"></span>Biaya Operasional</span></td>' +
          '<td class="px-4 py-3 text-right mono text-xs font-semibold text-stone-700">' + fmtIdr(biayaOperasional) + '</td>' +
          '<td class="px-4 py-3 text-right text-xs font-semibold text-stone-700">' + (totalBiayaKas > 0 ? (biayaOperasional / totalBiayaKas * 100).toFixed(1) + '%' : '—') + '</td>' +
        '</tr>' +
        '<tr class="border-t border-stone-100 hover:bg-stone-50/80 transition-colors">' +
          '<td class="px-4 py-3 font-medium text-xs"><span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-amber-500"></span>Biaya Gaji</span></td>' +
          '<td class="px-4 py-3 text-right mono text-xs font-semibold text-amber-600">' + fmtIdr(biayaGaji) + '</td>' +
          '<td class="px-4 py-3 text-right text-xs font-semibold text-stone-700">' + (totalBiayaKas > 0 ? (biayaGaji / totalBiayaKas * 100).toFixed(1) + '%' : '—') + '</td>' +
        '</tr>' +
        (biayaLainnya > 0 ? '<tr class="border-t border-stone-100 bg-stone-50/40 hover:bg-stone-50/80 transition-colors">' +
          '<td class="px-4 py-3 font-medium text-xs"><span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-stone-400"></span>Biaya Lainnya</span></td>' +
          '<td class="px-4 py-3 text-right mono text-xs text-stone-500">' + fmtIdr(biayaLainnya) + '</td>' +
          '<td class="px-4 py-3 text-right text-xs font-semibold text-stone-700">' + (totalBiayaKas > 0 ? (biayaLainnya / totalBiayaKas * 100).toFixed(1) + '%' : '—') + '</td>' +
        '</tr>' : '') +
        '<tr class="border-t-2 border-stone-300 bg-gradient-to-r from-orange-50 to-amber-50">' +
          '<td class="px-4 py-3.5 font-bold text-xs text-stone-800">Total Pengeluaran</td>' +
          '<td class="px-4 py-3.5 text-right mono font-bold text-xs text-red-600">' + fmtIdr(totalBiayaKas) + '</td>' +
          '<td class="px-4 py-3.5 text-right text-xs font-bold text-stone-700">100%</td>' +
        '</tr>' +
        '</tbody></table></div></div>';



      // Tabel Daftar Pembelian per Pemasok
      var supplierPembelian = r.supplier_pembelian || [];
      var totalPembelianSupplier = r.total_pembelian_supplier || 0;
      var supplierContent = '';
      if (supplierPembelian.length > 0) {
        var grouped = {};
        supplierPembelian.forEach(function(sp) {
          var key = sp.supplier || 'Tanpa Supplier';
          if (!grouped[key]) grouped[key] = { supplier: key, total: 0, items: [] };
          grouped[key].items.push(sp);
          grouped[key].total += sp.jumlah;
        });
        var supplierRows = '';
        var supIdx = 0;
        var supColors = ['#0d9488','#7c3aed','#0891b2','#d97706','#be185d','#059669','#dc2626','#2563eb'];
        Object.keys(grouped).forEach(function(key) {
          var g = grouped[key];
          var color = supColors[supIdx % supColors.length];
          supIdx++;
          var detailRows = g.items.map(function(sp) {
            var itemsHtml = '';
            if (sp.items && sp.items.length > 0) {
              itemsHtml = '<tr class="bg-stone-50/30"><td colspan="5" class="px-4 py-1.5"><div class="pl-10 text-[10px] text-stone-400">Item pembelian:</div><div class="pl-10 space-y-0.5">' +
                sp.items.map(function(it) {
                  var itHarga = it.harga > 0 ? ' @ ' + fmtIdr(it.harga) + '/' + (it.satuan || '') : '';
                  var itTotal = it.harga > 0 && it.qty > 0 ? ' = ' + fmtIdr(it.harga * it.qty) : '';
                  return '<div class="text-xs text-stone-600 flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-stone-300"></span>' +
                    escHtml(it.nama) +
                    (it.qty > 0 ? ' <span class="text-stone-400">× ' + it.qty + '</span>' : '') +
                    (it.satuan ? ' <span class="text-stone-400">' + it.satuan + '</span>' : '') +
                    itHarga + itTotal +
                  '</div>';
                }).join('') +
              '</div></td></tr>';
            }
            return '<tr class="border-t border-stone-100 hover:bg-stone-50/80 transition-colors">' +
              '<td class="px-4 py-2.5 text-xs text-stone-500 pl-10">' + fmtDate(sp.tanggal) + '</td>' +
              '<td class="px-4 py-2.5 text-xs text-stone-600">' + escHtml(sp.no_transaksi || '-') + '</td>' +
              '<td class="px-4 py-2.5 text-xs text-stone-500">' + escHtml(sp.deskripsi || '-') + '</td>' +
              '<td class="px-4 py-2.5 text-right mono text-xs font-semibold text-stone-700">' + fmtIdr(sp.jumlah) + '</td>' +
              '<td></td>' +
            '</tr>' + itemsHtml;
          }).join('');
          var pct = totalPembelianSupplier > 0 ? (g.total / totalPembelianSupplier * 100).toFixed(1) : 0;
          supplierRows += '<tr class="border-t border-stone-100">' +
            '<td class="px-4 py-3 font-medium text-xs" colspan="3"><span class="inline-flex items-center gap-2"><span class="w-2 h-2 rounded-full" style="background:' + color + '"></span><strong>' + escHtml(g.supplier) + '</strong> <span class="text-stone-400 font-normal">(' + g.items.length + ' transaksi)</span></span></td>' +
            '<td class="px-4 py-3 text-right mono text-xs font-bold text-stone-800">' + fmtIdr(g.total) + '</td>' +
            '<td class="px-4 py-3 text-right text-xs text-stone-500">' + pct + '%</td>' +
          '</tr>' +
          detailRows;
        });
        supplierContent = '<div class="mt-4 bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">' +
          '<div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between">' +
            '<h3 class="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-2"><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>Daftar Pembelian per Pemasok</h3>' +
            '<span class="text-[10px] text-stone-400">' + supplierPembelian.length + ' transaksi — Total: ' + fmtIdr(totalPembelianSupplier) + '</span>' +
          '</div>' +
          '<div class="overflow-x-auto"><table class="w-full text-xs">' +
          '<thead><tr class="bg-stone-50">' +
          '<th class="text-left px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Pemasok / Tanggal</th>' +
          '<th class="text-left px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">No. Transaksi</th>' +
          '<th class="text-left px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Deskripsi</th>' +
          '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Nilai</th>' +
          '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">%</th>' +
          '</tr></thead><tbody>' +
          supplierRows +
          '<tr class="border-t-2 border-stone-300 bg-gradient-to-r from-orange-50 to-amber-50">' +
          '<td class="px-4 py-3.5 font-bold text-xs text-stone-800" colspan="4">Total Pembelian ' + Object.keys(grouped).length + ' Pemasok</td>' +
          '<td class="px-4 py-3.5 text-right mono font-bold text-xs text-red-600">' + fmtIdr(totalPembelianSupplier) + '</td>' +
          '<td class="px-4 py-3.5 text-right text-xs font-bold text-stone-700">100%</td>' +
          '</tr>' +
          '</tbody></table></div></div>';
      }

      window._lapData = null;
      if (isRABDraft) {
        var draftMsg = '<div class="bg-amber-50 border-2 border-amber-200/80 rounded-2xl p-6 sm:p-8 text-center shadow-sm">' +
          '<div class="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">' +
            '<svg class="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>' +
          '</div>' +
          '<h3 class="text-sm font-bold text-amber-800 mb-2">Siklus Masih Draft</h3>' +
          '<p class="text-xs text-amber-700/80 max-w-md mx-auto leading-relaxed">Siklus <strong>' + escHtml(siklusInfo.nama) + '</strong> masih berstatus <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-200/60 text-amber-800 font-semibold text-[10px]">DRAFT</span>. Silakan aktifkan siklus terlebih dahulu untuk melihat laporan RAB.</p>' +
        '</div>' +
        '<div class="mt-4 bg-white rounded-2xl border border-stone-200 shadow-sm p-5">' +
          '<div class="flex items-center gap-3 text-xs text-stone-500">' +
            '<svg class="w-5 h-5 text-stone-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' +
            '<span>Data laporan RAB baru tersedia setelah siklus diaktifkan dan memiliki data produksi.</span>' +
          '</div>' +
        '</div>';
        window._lapStatCards = rabFilterBar + draftMsg;
      } else {
        window._lapStatCards = rabFilterBar + statCards + summaryCards + tableContent + biayaContent + supplierContent;
      }

      // ── Editor PM (Jumlah PM per Hari) — ditampilkan DI ATAS blok RAB Harian ──
      var rabTitik = rabTitikRes;
      var pmEditor = '';
      if (rabTitik && Array.isArray(rabTitik.sekolah)) {
        var pmTanggal = lapState.rab_pm_tanggal || new Date().toISOString().slice(0, 10);
        var pmSumberTxt = rabTitik.sumber === 'snapshot'
          ? '<span class="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">DATA PM HARIAN (' + escHtml(pmTanggal) + ')</span>'
          : '<span class="text-[10px] font-semibold text-stone-500 bg-stone-100 border border-stone-200 px-2 py-1 rounded">DATA PM SAAT INI</span>';
        pmEditor =
          '<div class="mt-6 bg-white rounded-2xl border border-stone-200 shadow-sm p-4 mb-4">' +
            '<div class="flex flex-wrap items-center gap-3 mb-3">' +
              '<div class="flex items-center gap-2">' +
                '<span class="text-xs font-bold text-stone-700">Jumlah PM per Hari</span>' +
                '<input type="date" id="rab-pm-tanggal" value="' + pmTanggal + '" onchange="gantiTanggalPMMan()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">' +
              '</div>' +
              pmSumberTxt +
              '<div class="ml-auto flex items-center gap-2">' +
                '<input type="text" id="pm-search" placeholder="Cari titik..." oninput="filterPMMan()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white placeholder-stone-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">' +
                '<button onclick="simpanPMMan()" class="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-lg transition-colors shadow-sm">' +
                  '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>' +
                  'Simpan PM Harian' +
                '</button>' +
              '</div>' +
            '</div>' +
            '<div class="overflow-x-auto"><table class="w-full text-xs">' +
              '<thead><tr class="bg-stone-50">' +
                '<th class="text-left px-3 py-2.5 text-[10px] font-bold text-stone-500 uppercase tracking-wider">TITIK</th>' +
                '<th class="text-left px-3 py-2.5 text-[10px] font-bold text-stone-500 uppercase tracking-wider">KATEGORI</th>' +
                '<th class="text-right px-3 py-2.5 text-[10px] font-bold text-stone-500 uppercase tracking-wider">PAKET BESAR</th>' +
                '<th class="text-right px-3 py-2.5 text-[10px] font-bold text-stone-500 uppercase tracking-wider">PAKET KECIL</th>' +
              '</tr></thead><tbody id="pm-editor-tbody">' +
              '<tr><td class="px-3 py-6 text-center text-stone-400" colspan="4">Muat data editor...</td></tr>' +
            '</tbody></table></div>' +
            '<div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2">' +
              '<div id="pm-editor-status" class="text-[10px] text-stone-400"></div>' +
              '<div class="text-[10px] text-stone-500">Total terisi: <b id="pm-editor-count">0</b> titik</div>' +
            '</div>' +
          '</div>';
      }

      // ── Tambah RAB Harian (lengkap) di bawah ──
      try {
        // Use saved date from lapState, or fallback to siklus start date / today
        var rhTanggal = lapState.rab_rh_tanggal || ((siklusInfo && siklusInfo.tanggal_mulai) ? siklusInfo.tanggal_mulai : nowDate.toISOString().slice(0, 10));
        var rabHarianRes = await api.get('/laporan/rab-harian?tanggal=' + rhTanggal + (filterSiklusId ? '&siklus_id=' + filterSiklusId : ''));
        var d = rabHarianRes;
        var items = d.items || [];

        // ── Date picker filter bar ──
        var rhFilterBar = '<div class="' + (pmEditor ? 'mt-2' : 'mt-6') + ' mb-8 bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3">' +
          '<div class="flex flex-wrap items-center gap-x-4 gap-y-2">' +
            '<div class="flex items-center gap-2">' +
              '<svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>' +
              '<input type="date" id="rab-rh-tanggal" value="' + rhTanggal + '" onchange="gantiTanggalRhDiRab()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">' +
            '</div>' +
            '<span class="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>RAB Harian</span>' +
            (d.hari ? '<span class="text-xs text-stone-400 ml-auto">' + escHtml(d.hari) + ', ' + d.tanggal + '</span>' : '') +
          '</div></div>';

        if (items.length > 0) {
          // ── Report Header ──
          var hariArr = ['MINGGU','SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];
          var tgl = new Date(d.tanggal + 'T00:00:00');
          var hariNama = d.hari || hariArr[tgl.getDay()] || '';
          var tglFormatted = tgl.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
          var menuNama = d.menu_deskripsi || '';
          var menuChips = '';
          if (menuNama) {
            menuChips = menuNama.split(' + ').filter(Boolean).map(function(x) {
              return '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>' + escHtml(x) + '</span>';
            }).join('');
          }

          var reportHeader = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">' +
            '<div class="px-5 py-4 text-center border-b border-stone-100" style="background:linear-gradient(135deg,#0e7490,#0891b2)">' +
              '<h1 class="text-sm font-bold text-white uppercase tracking-wider">RENCANA ANGGARAN BELANJA (RAB) BAHAN BAKU HARIAN</h1>' +
              '<div class="text-[10px] text-cyan-100 mt-1">SPPG BOGOR TAMANSARI SUKALUYU</div>' +
              '<div class="text-[10px] text-cyan-100">YAYASAN SHAIMA ANAK SHOLEHA</div>' +
            '</div>' +
            '<div class="px-5 py-3 bg-white border-b border-stone-100">' +
              '<div class="flex flex-wrap items-center justify-center gap-2">' +
                (menuChips ? '<span class="inline-flex items-center gap-1 self-center"><span class="text-[10px] font-bold uppercase tracking-wider text-stone-400">MENU</span>' + menuChips + '</span>' : '') +
                '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-semibold"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>HARI: ' + escHtml(hariNama) + ' ' + tglFormatted + '</span>' +
              '</div>' +
            '</div>' +
          '</div>';

          var no = 0;
          var tabelHtml = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">' +
            '<div class="overflow-x-auto"><table class="w-full text-xs">' +
            '<thead><tr class="bg-stone-50">' +
            '<th class="text-center px-2 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider w-8">NO</th>' +
            '<th class="text-left px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">URAIAN</th>' +
            '<th class="text-right px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">QTY</th>' +
            '<th class="text-left px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">SATUAN</th>' +
            '<th class="text-right px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">HARGA</th>' +
            '<th class="text-right px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">JUMLAH</th>' +
            '<th class="text-left px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">KETERANGAN</th>' +
            '</tr></thead><tbody>';

          items.forEach(function(it) {
            no++;
            tabelHtml += '<tr class="border-t border-stone-100 hover:bg-cyan-50/40 transition-colors">' +
              '<td class="px-2 py-3 text-center text-xs text-stone-500">' + no + '</td>' +
              '<td class="px-3 py-3 text-xs font-medium text-stone-700">' + escHtml(it.nama) + '</td>' +
              '<td class="px-3 py-3 text-right mono text-xs font-semibold text-stone-700">' + fmtNum(it.qty) + '</td>' +
              '<td class="px-3 py-3 text-xs text-stone-500">' + escHtml(it.satuan) + '</td>' +
              '<td class="px-3 py-3 text-right mono text-xs text-stone-600">' + fmtIDR(it.harga) + '</td>' +
              '<td class="px-3 py-3 text-right mono text-xs font-bold text-stone-800">' + fmtIDR(it.jumlah) + '</td>' +
              '<td class="px-3 py-3 text-xs text-stone-400">' + (it.keterangan ? escHtml(it.keterangan) : '') + '</td>' +
            '</tr>';
          });

          tabelHtml += '<tr class="border-t-2 border-stone-300 bg-gradient-to-r from-cyan-50 to-blue-50 font-bold">' +
            '<td colspan="5" class="px-4 py-3.5 text-xs text-right text-stone-800 uppercase tracking-wider">TOTAL</td>' +
            '<td class="px-3 py-3.5 text-right mono text-xs font-bold text-blue-700">' + fmtIDR(d.total) + '</td>' +
            '<td></td>' +
          '</tr>' +
          '<tr class="border-t border-stone-200 bg-white">' +
            '<td colspan="5" class="px-4 py-3 text-xs text-right text-stone-600">ANGGARAN BELANJA HARIAN</td>' +
            '<td class="px-3 py-3 text-right mono text-xs font-bold text-stone-800">' + fmtIDR(d.anggaran_belanja_harian) + '</td>' +
            '<td></td>' +
          '</tr>' +
          '<tr class="border-t border-stone-200 ' + (d.sisa >= 0 ? 'bg-emerald-50/50' : 'bg-red-50/50') + '">' +
            '<td colspan="5" class="px-4 py-3 text-xs text-right font-bold text-' + (d.sisa >= 0 ? 'emerald' : 'red') + '-700">SISA</td>' +
            '<td class="px-3 py-3 text-right mono text-xs font-bold text-' + (d.sisa >= 0 ? 'emerald' : 'red') + '-600">' + fmtIDR(Math.abs(d.sisa)) + '</td>' +
            '<td class="px-3 py-3 text-xs text-' + (d.sisa >= 0 ? 'emerald' : 'red') + '-500">' + (d.sisa < 0 ? 'DEFISIT' : '') + '</td>' +
          '</tr>';

          tabelHtml += '</tbody></table></div></div>';

          window._lapStatCards += pmEditor + rhFilterBar + reportHeader + tabelHtml;
        } else {
          // ── Fallback: tampilkan Total Kebutuhan Harian (seperti halaman /total-kebutuhan) ──
          try {
            var tkRes = await api.get('/siklus/laporan/perencanaan?tanggal_mulai=' + rhTanggal + '&tanggal_selesai=' + rhTanggal + (filterSiklusId ? '&siklus_id=' + filterSiklusId : ''));
            var tkHari = (tkRes && Array.isArray(tkRes.hari)) ? tkRes.hari : [];
            var tkAda = tkHari.length && tkHari[0].bahan && tkHari[0].bahan.length;
            if (tkAda) {
              var tkSiswa = 0;
              if (tkRes.pm_map) { for (var tkK in tkRes.pm_map) tkSiswa += Number(tkRes.pm_map[tkK]) || 0; }
              var tkHtml = '<div class="mt-4">' +
                '<div class="flex items-center gap-2 mb-3">' +
                  '<span class="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>TOTAL KEBUTUHAN HARIAN</span>' +
                  '<span class="text-xs text-stone-400">' + rhTanggal + ' — data RAB harian belum tersedia, menampilkan kebutuhan pangan terencana</span>' +
                '</div>';
              var tkRabHtml = await renderTkBelanjaPerHari(tkHari, tkSiswa);
              window._lapStatCards += pmEditor + rhFilterBar + tkHtml + tkRabHtml + '</div>';
            } else {
              window._lapStatCards += pmEditor + rhFilterBar + '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 text-center"><p class="text-xs text-stone-400">Tidak ada data RAB harian untuk <strong>' + escHtml(rhTanggal) + '</strong>. Silakan pilih tanggal lain yang memiliki data produksi.</p></div>';
            }
          } catch(tkErr) {
            console.error('RAB Harian fallback error:', tkErr);
            window._lapStatCards += pmEditor + rhFilterBar + '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 text-center"><p class="text-xs text-stone-400">Tidak ada data RAB harian untuk <strong>' + escHtml(rhTanggal) + '</strong>. Silakan pilih tanggal lain yang memiliki data produksi.</p></div>';
          }
        }
      } catch(e) { console.error('RAB Harian error:', e); window._lapStatCards += pmEditor; }

      // ── RAB per Titik (Sekolah & Posyandu) ──
      var exportRows = [];
      if (rabTitik && Array.isArray(rabTitik.sekolah)) {
        var rabCards = '<div class="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">' +
          '<div class="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 p-4 shadow-sm">' +
            '<div class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mb-1">Total Sekolah</div>' +
            '<div class="text-lg font-bold text-emerald-800">' + fmtIDR(rabTitik.total_sekolah || 0) + '</div>' +
            '<div class="text-[10px] text-emerald-600/70">' + (rabTitik.sekolah || []).length + ' titik</div>' +
          '</div>' +
          '<div class="bg-gradient-to-br from-violet-50 to-violet-100/60 rounded-2xl border border-violet-200/60 p-4 shadow-sm">' +
            '<div class="text-[10px] font-semibold uppercase tracking-wider text-violet-700 mb-1">Total Posyandu</div>' +
            '<div class="text-lg font-bold text-violet-800">' + fmtIDR(rabTitik.total_posyandu || 0) + '</div>' +
            '<div class="text-[10px] text-violet-600/70">' + (rabTitik.posyandu || []).length + ' titik</div>' +
          '</div>' +
          '<div class="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200/60 p-4 shadow-sm">' +
            '<div class="text-[10px] font-semibold uppercase tracking-wider text-blue-700 mb-1">Grand Total</div>' +
            '<div class="text-lg font-bold text-blue-800">' + fmtIDR(rabTitik.grand_total || 0) + '</div>' +
            '<div class="text-[10px] text-blue-600/70">Periode ' + escHtml(rabTitik.periode || effectivePeriode) + '</div>' +
          '</div>' +
        '</div>';

        function buildTitikTable(list, label, numbered) {
          var head = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-4">' +
            '<div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between">' +
              '<h3 class="text-xs font-bold text-stone-700 uppercase tracking-wider">' + label + '</h3>' +
              '<span class="text-[10px] text-stone-400">' + list.length + ' titik</span>' +
            '</div>' +
            '<div class="overflow-x-auto"><table class="w-full text-xs">' +
            '<thead><tr class="bg-stone-50">' +
              '<th class="text-center px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider w-10">NO</th>' +
              '<th class="text-left px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">SEKOLAH / TITIK</th>' +
              '<th class="text-left px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">KLASIFIKASI</th>' +
              '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">JUMLAH SISWA &amp; GURU</th>' +
              '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">PAGU HARGA</th>' +
              '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">JUMLAH</th>' +
            '</tr></thead><tbody>';
          var body = '';
          list.forEach(function(it, idx) {
            var no = numbered ? (idx + 1) : '';
            var noTd = '<td class="px-3 py-3 text-center text-xs text-stone-500" rowspan="2">' + no + '</td>';
            var namaTd = '<td class="px-4 py-3 font-semibold text-xs text-stone-800" rowspan="2">' + escHtml(it.nama) + '</td>';
            it.rows.forEach(function(row, ri) {
              var missing = row.jumlah > 0 && row.total === 0;
              var rowCls = missing ? 'bg-red-50/70 border-l-2 border-l-red-500' : (ri === 1 ? '' : '');
              var jumlahCls = row.jumlah > 0 ? (missing ? 'text-red-600' : 'text-stone-700') : 'text-stone-300';
              var paguCls = row.pagu > 0 ? (missing ? 'text-red-500' : 'text-stone-600') : (row.jumlah > 0 ? 'text-red-400' : 'text-stone-300');
              var totalCls = row.total > 0 ? 'text-[#1e40af]' : (missing ? 'text-red-600 font-bold' : 'text-stone-300');
              var badge = missing ? '<span class="ml-1 inline-block align-middle text-[9px] font-bold text-white bg-red-500 rounded px-1 py-0.5">0</span>' : '';
              body += '<tr class="' + (ri === 1 ? 'border-t border-stone-100 ' : '') + rowCls + ' hover:bg-stone-50/70 transition-colors">' +
                (ri === 0 ? noTd + namaTd : '') +
                '<td class="px-4 py-3 text-xs text-stone-600">' + escHtml(row.klasifikasi) + '</td>' +
                '<td class="px-4 py-3 text-right mono text-xs font-semibold ' + jumlahCls + '">' + (row.jumlah > 0 ? fmtNum(row.jumlah) : '') + '</td>' +
                '<td class="px-4 py-3 text-right mono text-xs ' + paguCls + '">' + (row.pagu > 0 ? fmtIDR(row.pagu) : (row.jumlah > 0 ? 'Rp0' : '')) + '</td>' +
                '<td class="px-4 py-3 text-right mono text-xs ' + totalCls + '">' + (row.total > 0 ? fmtIDR(row.total) : (missing ? '0' : '')) + badge + '</td>' +
              '</tr>';
              exportRows.push({ no: no, nama: it.nama, klasifikasi: row.klasifikasi, jumlah: row.jumlah, pagu: row.pagu, total: row.total });
            });
            body += '<tr class="border-t border-stone-200 ' + (it.sub_total === 0 ? 'bg-red-50' : 'bg-gradient-to-r from-stone-50 to-stone-100') + '">' +
              '<td class="px-4 py-2.5 text-[10px] text-right text-stone-500 uppercase tracking-wider" colspan="5">Sub Total</td>' +
              '<td class="px-4 py-2.5 text-right mono text-xs font-bold ' + (it.sub_total === 0 ? 'text-red-600' : 'text-stone-800') + '">' + fmtIDR(it.sub_total) + '</td></tr>';
          });
          var total = list.reduce(function(s, x) { return s + (x.sub_total || 0); }, 0);
          body += '<tr class="border-t-2 border-stone-300 bg-gradient-to-r from-stone-100 to-stone-50">' +
            '<td class="px-4 py-3.5 font-bold text-xs text-stone-800" colspan="5">TOTAL ' + label.toUpperCase() + '</td>' +
            '<td class="px-4 py-3.5 text-right mono font-bold text-xs text-blue-700">' + fmtIDR(total) + '</td></tr>';
          return head + body + '</tbody></table></div></div>';
        }

        var sekolahHtml = buildTitikTable(rabTitik.sekolah || [], 'Sekolah', true);
        var posyanduHtml = buildTitikTable(rabTitik.posyandu || [], 'Posyandu', false);
        window._lapStatCards += '<div class="mt-8">' + rabCards + sekolahHtml + posyanduHtml + '</div>';
        window['_export_rab'] = { data: exportRows, fields: ['no', 'nama', 'klasifikasi', 'jumlah', 'pagu', 'total'] };
      } else {
        window['_export_rab'] = { data: [], fields: ['no', 'nama', 'klasifikasi', 'jumlah', 'pagu', 'total'] };
      }

    } else if (tab === 'rab-bulanan') {
      var rbBulan = lapState.rb_bulan || '';
      var rbTahun = lapState.rb_tahun || '';
      var nowDate = new Date();

      var params = new URLSearchParams();
      if (rbBulan) params.set('bulan', rbBulan);
      if (rbTahun) params.set('tahun', rbTahun);

      const r = await api.get('/laporan/rab-bulanan?' + params.toString());
      const rows = r.rows || [];
      const detailKat = r.detail_kategori || [];
      const prodInfo = r.produksi_info || null;

      var fmtIdr = fmtIDR;

      // Filter bar
      var rbFilterBar = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 mb-4">' +
        '<div class="flex flex-wrap items-center gap-x-4 gap-y-2">' +
          '<div class="flex items-center gap-2">' +
            '<svg class="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>' +
            '<select id="rb-bulan" onchange="gantiPeriodeRabBulanan()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
            '<option value="">Semua Bulan</option>' +
            [1,2,3,4,5,6,7,8,9,10,11,12].map(function(b) { return '<option value="' + b + '" ' + (parseInt(rbBulan)===b?'selected':'') + '>' + ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][b-1] + '</option>'; }).join('') +
            '</select>' +
            '<select id="rb-tahun" onchange="gantiPeriodeRabBulanan()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
            '<option value="">Semua Tahun</option>' +
            [2024,2025,2026,2027,2028].map(function(t) { return '<option value="' + t + '" ' + (parseInt(rbTahun)===t?'selected':'') + '>' + t + '</option>'; }).join('') +
            '</select>' +
          '</div>' +
          (rbBulan && rbTahun ? '<button onclick="generateBudgetDariRAB()" class="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-colors shadow-sm">' +
            '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>' +
            'Generate Budget' +
          '</button>' : '') +
        '</div></div>';

      const s = r.stats;
      const selisihTotalBudget = s.total_budget - s.total_realisasi_budget;
      const selisihTotalKas = s.total_budget - s.total_realisasi_kas;
      var serapanBudget = s.total_budget > 0 ? (s.total_realisasi_budget / s.total_budget * 100) : 0;
      var serapanKas = s.total_budget > 0 ? (s.total_realisasi_kas / s.total_budget * 100) : 0;

      // Stat cards
      var statCards = '<div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">' +
        '<div class="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Periode</span><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg></div>' +
          '<div class="text-lg font-bold text-emerald-800">' + fmtNum(s.total_periode) + '</div>' +
          '<div class="text-[10px] text-emerald-600/70">Total bulan</div>' +
        '</div>' +
        '<div class="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Budget</span><svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg></div>' +
          '<div class="text-lg font-bold text-blue-800">' + fmtIDR(s.total_budget) + '</div>' +
          '<div class="text-[10px] text-blue-600/70">Total anggaran</div>' +
        '</div>' +
        '<div class="bg-gradient-to-br from-orange-50 to-orange-100/60 rounded-2xl border border-orange-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-orange-700">Realisasi</span><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>' +
          '<div class="text-lg font-bold text-orange-800">' + fmtIDR(s.total_realisasi_budget) + '</div>' +
          '<div class="mt-1.5 w-full bg-orange-200/60 rounded-full h-1.5 overflow-hidden"><div class="bg-orange-500 h-1.5 rounded-full" style="width:' + Math.min(serapanBudget, 100) + '%"></div></div>' +
          '<div class="text-[10px] text-orange-600/70 mt-0.5">' + serapanBudget.toFixed(1) + '% terserap (budget)</div>' +
        '</div>' +
        '<div class="bg-gradient-to-br from-amber-50 to-amber-100/60 rounded-2xl border border-amber-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Kas</span><svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg></div>' +
          '<div class="text-lg font-bold text-amber-800">' + fmtIDR(s.total_realisasi_kas) + '</div>' +
          '<div class="mt-1.5 w-full bg-amber-200/60 rounded-full h-1.5 overflow-hidden"><div class="bg-amber-500 h-1.5 rounded-full" style="width:' + Math.min(serapanKas, 100) + '%"></div></div>' +
          '<div class="text-[10px] text-amber-600/70 mt-0.5">' + serapanKas.toFixed(1) + '% realisasi kas</div>' +
        '</div>' +
        '<div class="bg-gradient-to-br from-violet-50 to-violet-100/60 rounded-2xl border border-violet-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-violet-700">Capaian</span><svg class="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>' +
          '<div class="text-lg font-bold text-violet-800">' + s.rata_capaian_budget.toFixed(1) + '%</div>' +
          '<div class="text-[10px] text-violet-600/70">Rata-rata per periode</div>' +
        '</div>' +
      '</div>';

      // Detail per kategori (when filter is active)
      var detailHtml = '';
      if (rbBulan && rbTahun && detailKat.length > 0) {
        var periodeLbl = rbTahun + '-' + String(rbBulan).padStart(2, '0');

        // Production info cards
        var totalBudgetKatAll = detailKat.reduce(function(s, d) { return s + d.total_budget; }, 0);
        var prodHtml = '';
        if (prodInfo) {
          var serapanProd = totalBudgetKatAll > 0 ? (prodInfo.realisasi_kas / totalBudgetKatAll * 100) : 0;
          prodHtml = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">' +
            '<div class="bg-gradient-to-br from-lime-50 to-lime-100/60 rounded-2xl border border-lime-200/60 p-4 shadow-sm">' +
              '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-lime-700">Hari</span><svg class="w-4 h-4 text-lime-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg></div>' +
              '<div class="text-lg font-bold text-lime-800">' + fmtNum(prodInfo.total_hari) + '</div>' +
              '<div class="text-[10px] text-lime-600/70">Hari produksi</div>' +
            '</div>' +
            '<div class="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200/60 p-4 shadow-sm">' +
              '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Porsi</span><svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>' +
              '<div class="text-lg font-bold text-blue-800">' + fmtNum(prodInfo.total_porsi_produksi) + '</div>' +
              '<div class="text-[10px] text-blue-600/70">Total porsi</div>' +
            '</div>' +
            '<div class="bg-gradient-to-br from-orange-50 to-orange-100/60 rounded-2xl border border-orange-200/60 p-4 shadow-sm">' +
              '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-orange-700">Realisasi</span><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>' +
              '<div class="text-lg font-bold text-orange-800">' + fmtIDR(prodInfo.realisasi_kas) + '</div>' +
              '<div class="text-[10px] text-orange-600/70">Total pengeluaran</div>' +
            '</div>' +
            '<div class="bg-gradient-to-br from-violet-50 to-violet-100/60 rounded-2xl border border-violet-200/60 p-4 shadow-sm">' +
              '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-violet-700">Serapan</span><svg class="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>' +
              '<div class="text-lg font-bold text-violet-800">' + serapanProd.toFixed(1) + '%</div>' +
              '<div class="w-full bg-violet-200/60 rounded-full h-1.5 overflow-hidden"><div class="bg-violet-500 h-1.5 rounded-full" style="width:' + Math.min(serapanProd, 100) + '%"></div></div>' +
              '<div class="text-[10px] text-violet-600/70 mt-0.5">Dari budget</div>' +
            '</div>' +
          '</div>';
        }

        // Detail kategori table
        var totalBudgetKat = 0, totalRealisasiKat = 0, totalBiayaOp = 0;
        var katRows = detailKat.map(function(d) {
          totalBudgetKat += d.total_budget;
          totalRealisasiKat += d.realisasi;
          totalBiayaOp += d.biaya_operasional;
          var selisih = d.total_budget - d.realisasi;
          var capaian = d.total_budget > 0 ? (d.realisasi / d.total_budget * 100).toFixed(1) + '%' : '-';
          var capVal = parseFloat(capaian);
          var capColor = capVal >= 80 ? 'text-emerald-600' : capVal >= 50 ? 'text-amber-600' : 'text-red-600';
          return '<tr class="border-t border-stone-100 hover:bg-stone-50/80 transition-colors">' +
            '<td class="px-4 py-3 font-medium text-xs">' + escHtml(d.kategori_penerima || 'Umum') + '</td>' +
            '<td class="px-4 py-3 text-right text-xs font-semibold text-stone-700">' + fmtNum(d.jumlah_penerima) + '</td>' +
            '<td class="px-4 py-3 text-right mono text-xs font-semibold text-stone-700">' + fmtIdr(d.harga_per_porsi) + '</td>' +
            '<td class="px-4 py-3 text-right mono text-xs text-stone-500">' + fmtIdr(d.biaya_operasional) + '</td>' +
            '<td class="px-4 py-3 text-right mono font-semibold text-xs text-stone-800">' + fmtIdr(d.total_budget) + '</td>' +
            '<td class="px-4 py-3 text-right mono text-xs ' + (d.realisasi > d.total_budget ? 'text-red-500' : 'text-emerald-600') + '">' + fmtIdr(d.realisasi) + '</td>' +
            '<td class="px-4 py-3 text-right mono text-xs ' + (selisih >= 0 ? 'text-emerald-600' : 'text-red-500') + '">' + fmtIdr(Math.abs(selisih)) + '</td>' +
            '<td class="px-4 py-3 text-right text-xs font-semibold ' + capColor + '">' + capaian + '</td></tr>';
        }).join('');

        var totalSelisihKat = totalBudgetKat - totalRealisasiKat;
        var totalSelClass = totalSelisihKat >= 0 ? 'text-emerald-600' : 'text-red-500';
        var totalCapaian = totalBudgetKat > 0 ? (totalRealisasiKat / totalBudgetKat * 100).toFixed(1) + '%' : '-';
        var totalCapVal = parseFloat(totalCapaian);
        var totalCapColor = totalCapVal >= 80 ? 'text-emerald-600' : totalCapVal >= 50 ? 'text-amber-600' : 'text-red-600';

        var katTabel = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-4">' +
          '<div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between">' +
            '<h3 class="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-2"><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>Rincian Budget per Kategori</h3>' +
            '<span class="text-[10px] text-stone-400">' + periodeLbl + ' — ' + (prodInfo?.total_hari || '?') + ' hari</span>' +
          '</div>' +
          '<div class="overflow-x-auto"><table class="w-full text-xs">' +
          '<thead><tr class="bg-stone-50">' +
          '<th class="text-left px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Kategori</th>' +
          '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Penerima</th>' +
          '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Harga/Porsi</th>' +
          '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Biaya Op</th>' +
          '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Budget</th>' +
          '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Realisasi</th>' +
          '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Selisih</th>' +
          '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Capaian</th></tr></thead><tbody>' +
          katRows +
          '<tr class="border-t-2 border-stone-300 bg-gradient-to-r from-stone-100 to-stone-50">' +
          '<td class="px-4 py-3.5 font-bold text-xs text-stone-800">TOTAL</td>' +
          '<td class="px-4 py-3.5 text-right font-bold text-xs text-stone-800">' + fmtNum(detailKat.reduce(function(s, d) { return s + d.jumlah_penerima; }, 0)) + '</td>' +
          '<td class="px-4 py-3.5"></td>' +
          '<td class="px-4 py-3.5 text-right mono font-bold text-xs text-stone-800">' + fmtIdr(totalBiayaOp) + '</td>' +
          '<td class="px-4 py-3.5 text-right mono font-bold text-xs text-stone-800">' + fmtIdr(totalBudgetKat) + '</td>' +
          '<td class="px-4 py-3.5 text-right mono font-bold text-xs ' + totalSelClass + '">' + fmtIdr(totalRealisasiKat) + '</td>' +
          '<td class="px-4 py-3.5 text-right mono font-bold text-xs ' + totalSelClass + '">' + fmtIdr(Math.abs(totalSelisihKat)) + '</td>' +
          '<td class="px-4 py-3.5 text-right font-bold text-xs ' + totalCapColor + '">' + totalCapaian + '</td></tr>' +
          '</tbody></table></div></div>';

        // Realisasi per kategori (kas_bank)
        var realisasiPerKatHtml = '';
        if (prodInfo && prodInfo.realisasi_per_kategori && prodInfo.realisasi_per_kategori.length > 0) {
          var realKatRows = prodInfo.realisasi_per_kategori.map(function(rk) {
            var pct = totalBudgetKatAll > 0 ? (rk.total / totalBudgetKatAll * 100).toFixed(1) : 0;
            return '<tr class="border-t border-stone-100 hover:bg-stone-50/80 transition-colors"><td class="px-4 py-3 text-xs font-medium">' + escHtml(rk.kategori) + '</td><td class="px-4 py-3 text-right mono text-xs font-semibold text-stone-700">' + fmtIdr(rk.total) + '</td><td class="px-4 py-3 text-right text-xs text-stone-500">' + pct + '%</td></tr>';
          }).join('');
          realisasiPerKatHtml = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-4">' +
            '<div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between">' +
              '<h3 class="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-2"><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Realisasi Pengeluaran (Kas Bank)</h3>' +
              '<span class="text-[10px] text-stone-400">' + prodInfo.realisasi_per_kategori.length + ' kategori</span>' +
            '</div>' +
            '<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="bg-stone-50">' +
            '<th class="text-left px-4 py-3 text-[10px] font-bold text-stone-500 uppercase">Kategori</th>' +
            '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase">Jumlah</th>' +
            '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase">% Budget</th></tr></thead><tbody>' +
            realKatRows +
            '<tr class="border-t-2 border-stone-300 bg-gradient-to-r from-orange-50 to-amber-50 font-bold"><td class="px-4 py-3.5 text-xs text-stone-800">Total</td><td class="px-4 py-3.5 text-right mono text-xs text-stone-800">' + fmtIdr(prodInfo.realisasi_kas) + '</td><td class="px-4 py-3.5 text-right text-xs text-stone-600">100%</td></tr>' +
            '</tbody></table></div></div>';
        }

        detailHtml = prodHtml + katTabel + realisasiPerKatHtml;
      }

      // Multi-periode summary table
      var multiPeriodeTabel = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">' +
        '<div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between">' +
          '<h3 class="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-2"><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>RAB Bulanan — Multi Periode</h3>' +
          '<span class="text-[10px] text-stone-400">' + rows.length + ' periode</span>' +
        '</div>' +
        '<div class="overflow-x-auto"><table class="w-full text-[10px] sm:text-xs">' +
        '<thead><tr class="bg-stone-50">' +
        '<th class="text-left px-3 py-2.5 font-bold text-stone-500 uppercase tracking-wider text-[10px]" rowspan="2">Periode</th>' +
        '<th class="text-center px-2 py-1.5 font-bold text-stone-500 uppercase tracking-wider text-[9px]" colspan="2" style="border-bottom:1px solid #d6d3d1">Budget</th>' +
        '<th class="text-center px-2 py-1.5 font-bold text-stone-500 uppercase tracking-wider text-[9px]" colspan="2" style="border-bottom:1px solid #d6d3d1">Realisasi</th>' +
        '<th class="text-center px-2 py-1.5 font-bold text-stone-500 uppercase tracking-wider text-[9px]" colspan="2" style="border-bottom:1px solid #d6d3d1">Selisih</th>' +
        '<th class="text-center px-2 py-1.5 font-bold text-stone-500 uppercase tracking-wider text-[9px]" colspan="2" style="border-bottom:1px solid #d6d3d1">Capaian</th></tr><tr class="bg-stone-50">' +
        '<th class="text-right px-3 py-2 text-[9px] font-semibold text-stone-500 uppercase">Budget</th>' +
        '<th class="text-right px-3 py-2 text-[9px] font-semibold text-stone-500 uppercase">Biaya Op</th>' +
        '<th class="text-right px-3 py-2 text-[9px] font-semibold text-stone-500 uppercase">Budget</th>' +
        '<th class="text-right px-3 py-2 text-[9px] font-semibold text-stone-500 uppercase">Kas</th>' +
        '<th class="text-right px-3 py-2 text-[9px] font-semibold text-stone-500 uppercase">Budget</th>' +
        '<th class="text-right px-3 py-2 text-[9px] font-semibold text-stone-500 uppercase">Kas</th>' +
        '<th class="text-right px-3 py-2 text-[9px] font-semibold text-stone-500 uppercase">Budget</th>' +
        '<th class="text-right px-3 py-2 text-[9px] font-semibold text-stone-500 uppercase">Kas</th></tr></thead><tbody>' +
        rows.map(function(b) {
          var selB = b.total_budget - b.total_realisasi_budget;
          var selK = b.total_budget - b.total_realisasi_kas;
          var capB = b.total_budget > 0 ? (b.total_realisasi_budget / b.total_budget * 100).toFixed(1) + '%' : '-';
          var capK = b.total_budget > 0 ? b.capaian_kas.toFixed(1) + '%' : '-';
          var isSelected = rbBulan && rbTahun && b.periode === (rbTahun + '-' + String(rbBulan).padStart(2, '0'));
          var capBVal = parseFloat(capB);
          var capKVal = parseFloat(capK);
          var capBColor = capBVal >= 80 ? 'text-emerald-600' : capBVal >= 50 ? 'text-amber-600' : capBVal > 0 ? 'text-red-500' : 'text-stone-400';
          return '<tr class="' + (isSelected ? 'bg-emerald-50/80 font-semibold' : 'border-t border-stone-100 hover:bg-stone-50/80') + ' transition-colors" onclick="filterRabBulanan(\'' + b.periode + '\')" style="cursor:pointer">' +
            '<td class="px-3 py-2.5 text-xs font-medium text-stone-700">' + b.periode + '</td>' +
            '<td class="px-3 py-2.5 text-right mono text-xs font-semibold text-stone-700">' + fmtIdr(b.total_budget) + '</td>' +
            '<td class="px-3 py-2.5 text-right mono text-xs text-stone-500">' + fmtIdr(b.total_biaya_operasional) + '</td>' +
            '<td class="px-3 py-2.5 text-right mono text-xs font-semibold text-stone-700">' + fmtIdr(b.total_realisasi_budget) + '</td>' +
            '<td class="px-3 py-2.5 text-right mono text-xs text-stone-500">' + fmtIdr(b.total_realisasi_kas) + '</td>' +
            '<td class="px-3 py-2.5 text-right mono text-xs font-semibold ' + (selB >= 0 ? 'text-emerald-600' : 'text-red-500') + '">' + fmtIdr(selB) + '</td>' +
            '<td class="px-3 py-2.5 text-right mono text-xs text-stone-500">' + fmtIdr(selK) + '</td>' +
            '<td class="px-3 py-2.5 text-right text-xs font-semibold ' + capBColor + '">' + capB + '</td>' +
            '<td class="px-3 py-2.5 text-right text-xs text-stone-500">' + capK + '</td></tr>';
        }).join('') +
        '</tbody></table></div></div>';

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

      window._lapStatCards = rbFilterBar + statCards + detailHtml + multiPeriodeTabel;

    } else if (tab === 'rab-harian') {

      // ── RAB Harian: filter ──
      var nowDate = new Date();
      var rhTanggal = lapState.rh_tanggal || nowDate.toISOString().slice(0, 10);
      var rhSiklusId = lapState.rh_siklus_id || '';

      var [siklusList, rabHarianRes] = await Promise.all([
        api.get('/siklus').catch(function() { return []; }),
        api.get('/laporan/rab-harian?tanggal=' + rhTanggal + (rhSiklusId ? '&siklus_id=' + rhSiklusId : '')),
      ]);

      var d = rabHarianRes;
      var items = d.items || [];
      var siklusInfo = d.siklus || null;

      var siklusOpts = '<option value="">Semua Siklus</option>';
      (Array.isArray(siklusList) ? siklusList : []).filter(function(s) { return s.status === 'Aktif' || s.status === 'Draft'; }).forEach(function(s) {
        var sel = String(s.id) === String(rhSiklusId) ? 'selected' : '';
        siklusOpts += '<option value="' + s.id + '" ' + sel + '>' + escHtml(s.nama) + ' (' + (s.total_hari || '?') + ' hr)' + '</option>';
      });

      // ── Filter bar ──
      var filterBar = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 mb-8">' +
        '<div class="flex flex-wrap items-center gap-x-4 gap-y-2">' +
          '<div class="flex items-center gap-2">' +
            '<svg class="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>' +
            '<input type="date" id="rh-tanggal" value="' + rhTanggal + '" onchange="gantiTanggalRabHarian()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-400">' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            '<svg class="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>' +
            '<select id="rh-filter-siklus" onchange="gantiTanggalRabHarian()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-400">' + siklusOpts + '</select>' +
          '</div>' +
          (siklusInfo ? '<span class="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 px-3 py-2 rounded-lg"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' + escHtml(siklusInfo.nama) + '</span>' : '') +
          (d.hari ? '<span class="text-xs text-stone-400 ml-auto">' + escHtml(d.hari) + ', ' + d.tanggal + '</span>' : '') +
        '</div></div>';

      // ── Defisit flag ──
      var isDefisit = d.sisa < 0;

      // ── Report Header ──
      var hariArr = ['MINGGU','SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];
      var tgl = new Date(d.tanggal + 'T00:00:00');
      var hariNama = d.hari || hariArr[tgl.getDay()] || '';
      var tglFormatted = tgl.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      
      var menuNama = d.menu_deskripsi || '';
      var menuChips = '';
      if (menuNama) {
        menuChips = menuNama.split(' + ').filter(Boolean).map(function(x) {
          return '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>' + escHtml(x) + '</span>';
        }).join('');
      }
      var reportHeader = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-4">' +
        '<div class="px-5 py-4 text-center border-b border-stone-100" style="background:linear-gradient(135deg,#0e7490,#0891b2)">' +
          '<h1 class="text-sm font-bold text-white uppercase tracking-wider">RENCANA ANGGARAN BELANJA (RAB) BAHAN BAKU HARIAN</h1>' +
          '<div class="text-[10px] text-cyan-100 mt-1">SPPG BOGOR TAMANSARI SUKALUYU</div>' +
          '<div class="text-[10px] text-cyan-100">YAYASAN SHAIMA ANAK SHOLEHA</div>' +
        '</div>' +
        '<div class="px-5 py-3 bg-white border-b border-stone-100">' +
          '<div class="flex flex-wrap items-center justify-center gap-2">' +
            (menuChips ? '<span class="inline-flex items-center gap-1 self-center"><span class="text-[10px] font-bold uppercase tracking-wider text-stone-400">MENU</span>' + menuChips + '</span>' : '') +
            '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-semibold"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>HARI: ' + escHtml(hariNama) + ' ' + tglFormatted + '</span>' +
            (siklusInfo ? '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>SIKLUS: ' + escHtml(siklusInfo.nama) + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';

      // ── Tabel ──
      var no = 0;
      var tabelHtml = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">' +
        '<div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between bg-gradient-to-r from-cyan-50 to-blue-50">' +
          '<h3 class="text-xs font-bold text-stone-700 uppercase tracking-wider">RENCANA ANGGARAN BELANJA BAHAN BAKU HARIAN</h3>' +
          '<span class="text-[10px] text-stone-400">' + d.tanggal + '</span>' +
        '</div>' +
        '<div class="overflow-x-auto"><table class="w-full text-xs">' +
        '<thead><tr class="bg-stone-50">' +
        '<th class="text-center px-2 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider w-8">NO</th>' +
        '<th class="text-left px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">URAIAN</th>' +
        '<th class="text-right px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">QTY</th>' +
        '<th class="text-left px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">SATUAN</th>' +
        '<th class="text-right px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">HARGA</th>' +
        '<th class="text-right px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">JUMLAH</th>' +
        '<th class="text-left px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">KETERANGAN</th>' +
        '</tr></thead><tbody>';

      items.forEach(function(it) {
        no++;
        tabelHtml += '<tr class="border-t border-stone-100 hover:bg-cyan-50/40 transition-colors">' +
          '<td class="px-2 py-3 text-center text-xs text-stone-500">' + no + '</td>' +
          '<td class="px-3 py-3 text-xs font-medium text-stone-700">' + escHtml(it.nama) + '</td>' +
          '<td class="px-3 py-3 text-right mono text-xs font-semibold text-stone-700">' + fmtNum(it.qty) + '</td>' +
          '<td class="px-3 py-3 text-xs text-stone-500">' + escHtml(it.satuan) + '</td>' +
          '<td class="px-3 py-3 text-right mono text-xs text-stone-600">' + fmtIDR(it.harga) + '</td>' +
          '<td class="px-3 py-3 text-right mono text-xs font-bold text-stone-800">' + fmtIDR(it.jumlah) + '</td>' +
          '<td class="px-3 py-3 text-xs text-stone-400">' + (it.keterangan ? escHtml(it.keterangan) : '') + '</td>' +
        '</tr>';
      });

      tabelHtml += '<tr class="border-t-2 border-stone-300 bg-gradient-to-r from-cyan-50 to-blue-50 font-bold">' +
        '<td colspan="5" class="px-4 py-3.5 text-xs text-right text-stone-800 uppercase tracking-wider">TOTAL</td>' +
        '<td class="px-3 py-3.5 text-right mono text-xs font-bold text-blue-700">' + fmtIDR(d.total) + '</td>' +
        '<td></td>' +
      '</tr>' +
      '<tr class="border-t border-stone-200 bg-white">' +
        '<td colspan="5" class="px-4 py-3 text-xs text-right text-stone-600">ANGGARAN BELANJA HARIAN</td>' +
        '<td class="px-3 py-3 text-right mono text-xs font-bold text-stone-800">' + fmtIDR(d.anggaran_belanja_harian) + '</td>' +
        '<td></td>' +
      '</tr>' +
      '<tr class="border-t border-stone-200 ' + (d.sisa >= 0 ? 'bg-emerald-50/50' : 'bg-red-50/50') + '">' +
        '<td colspan="5" class="px-4 py-3 text-xs text-right font-bold text-' + (isDefisit ? 'red' : 'emerald') + '-700">SISA</td>' +
        '<td class="px-3 py-3 text-right mono text-xs font-bold text-' + (isDefisit ? 'red' : 'emerald') + '-600">' + fmtIDR(Math.abs(d.sisa)) + '</td>' +
        '<td class="px-3 py-3 text-xs text-' + (isDefisit ? 'red' : 'emerald') + '-500">' + (isDefisit ? 'DEFISIT' : '') + '</td>' +
      '</tr>';

      tabelHtml += '</tbody></table></div></div>';

      window._lapStatCards = filterBar + reportHeader + tabelHtml;
      window._lapData = null;

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

      var filterBar = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 mb-4">' +
        '<div class="flex flex-wrap items-center gap-3">' +
          '<svg class="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>' +
          '<select onchange="gantiFilterSiklus()" id="siklus-lap-filter" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
          '<option value="">Semua Siklus</option>' +
          siklusList.map(function(s) { return '<option value="' + s.id + '" ' + (String(s.id) === filterSiklusId ? 'selected' : '') + '>' + escHtml(s.nama) + '</option>'; }).join('') +
          '</select>' +
        '</div></div>';

      var statCards = '<div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">' +
        '<div class="bg-gradient-to-br from-rose-50 to-rose-100/60 rounded-2xl border border-rose-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-rose-700">Siklus</span><svg class="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></div>' +
          '<div class="text-lg font-bold text-rose-800">' + fmtNum(ringkasan.totalSiklus) + '</div>' +
          '<div class="text-[10px] text-rose-600/70">Total siklus</div>' +
        '</div>' +
        '<div class="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Hari</span><svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg></div>' +
          '<div class="text-lg font-bold text-blue-800">' + fmtNum(ringkasan.totalHari) + '</div>' +
          '<div class="text-[10px] text-blue-600/70">Hari siklus</div>' +
        '</div>' +
        '<div class="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Terisi</span><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>' +
          '<div class="text-lg font-bold text-emerald-800">' + fmtNum(ringkasan.totalFilled) + '</div>' +
          '<div class="text-[10px] text-emerald-600/70">' + ringkasan.rataCoverage + '% coverage</div>' +
        '</div>' +
        '<div class="bg-gradient-to-br from-orange-50 to-orange-100/60 rounded-2xl border border-orange-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-orange-700">Kosong</span><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>' +
          '<div class="text-lg font-bold text-orange-800">' + fmtNum(ringkasan.totalKosong) + '</div>' +
          '<div class="text-[10px] text-orange-600/70">Belum terisi</div>' +
        '</div>' +
        '<div class="bg-gradient-to-br from-violet-50 to-violet-100/60 rounded-2xl border border-violet-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-violet-700">Menu</span><svg class="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>' +
          '<div class="text-lg font-bold text-violet-800">' + fmtNum(ringkasan.totalMenuUnik) + '</div>' +
          '<div class="text-[10px] text-violet-600/70">Menu unik digunakan</div>' +
        '</div>' +
      '</div>';

      var lap1Html = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-6">' +
        '<div class="px-4 py-3 bg-gradient-to-r from-amber-400 to-amber-500 flex items-center justify-between">' +
          '<h3 class="text-xs font-bold text-white uppercase tracking-wider">Laporan 1 — Siklus Menu 10 Hari</h3>' +
          '<span class="text-[10px] text-amber-100">' + (ringkasan.totalHari || 0) + ' hari</span>' +
        '</div>' +
        renderDailyMenuTable(menuHarian, kategori_order) +
      '</div>';

      var lap2Html = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-4">' +
        '<div class="px-4 py-3 bg-gradient-to-r from-amber-400 to-amber-500 flex items-center justify-between">' +
          '<h3 class="text-xs font-bold text-white uppercase tracking-wider">Laporan 2 — Identifikasi Resep</h3>' +
          '<span class="text-[10px] text-amber-100">Menu per kategori</span>' +
        '</div>' +
        renderResepTable(menuHarian, kategori_order) +
      '</div>';

      window._lapStatCards = filterBar + statCards + lap1Html + lap2Html;
    } else if (tab === 'pembelian') {
      const r = await api.get('/laporan/pembelian');
      const rows = r.rows || [];
      const fmtItem = d => { try { return JSON.parse(d.item || '[]').map(i => i.nama).filter(Boolean).join(', '); } catch { return ''; } };
      window._lapData = { tab, rows, headers: ['No PO','Tanggal','Supplier','Item','Total','Status'], fields: ['no_po','tanggal','supplier_nama','item_nama','total_nilai','status'],
        fmt: rows.map(d => [d.no_po, fmtDate(d.tanggal), d.supplier_nama||'-', fmtItem(d), fmtIDR(d.total_nilai), d.status]) };
      window['_export_pembelian'] = { data: rows.map(d => ({ ...d, item_nama: fmtItem(d) })), fields: ['no_po','tanggal','supplier_nama','item_nama','total_nilai','status'] };
      window._lapStatCards = `<div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <div class="bg-gradient-to-br from-indigo-50 to-indigo-100/60 rounded-2xl border border-indigo-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-indigo-700">Total PO</span><svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div><div class="text-lg font-bold text-indigo-800">${fmtNum(r.stats.total_po)}</div><div class="text-[10px] text-indigo-600/70">Total purchase order</div></div>
        <div class="bg-gradient-to-br from-stone-50 to-stone-100/60 rounded-2xl border border-stone-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-stone-700">Draft</span><svg class="w-4 h-4 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="text-lg font-bold text-stone-800">${fmtNum(r.stats.draft)}</div><div class="text-[10px] text-stone-600/70">Menunggu approval</div></div>
        <div class="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Disetujui</span><svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="text-lg font-bold text-blue-800">${fmtNum(r.stats.disetujui)}</div><div class="text-[10px] text-blue-600/70">Telah disetujui</div></div>
        <div class="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Diterima</span><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="text-lg font-bold text-emerald-800">${fmtNum(r.stats.diterima)}</div><div class="text-[10px] text-emerald-600/70">Barang diterima</div></div>
        <div class="bg-gradient-to-br from-indigo-50 to-indigo-100/60 rounded-2xl border border-indigo-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-indigo-700">Nilai</span><svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><div class="text-lg font-bold text-indigo-800">${fmtIDR(r.stats.total_nilai)}</div><div class="text-[10px] text-indigo-600/70">Total nilai PO</div></div>
      </div>`;
    } else if (tab === 'penerimaan') {
      const r = await api.get('/laporan/penerimaan');
      const rows = r.rows || [];
      window._lapData = { tab, rows, headers: ['No Dokumen','Tanggal','Supplier','Ref PO','Nilai','QC'], fields: ['no_dokumen','tanggal_terima','supplier_nama','ref_po','total_nilai','status_qc'],
        fmt: rows.map(d => [d.no_dokumen, fmtDate(d.tanggal_terima), d.supplier_nama||'-', d.ref_po||'-', fmtIDR(d.total_nilai), d.status_qc]) };
      window['_export_penerimaan'] = { data: rows, fields: ['no_dokumen','tanggal_terima','supplier_nama','ref_po','total_nilai','status_qc'] };
      const totalR = r.stats.total || 0;
      const lolosR = r.stats.lolos || 0;
      const returR = r.stats.retur || 0;
      const returPct = totalR > 0 ? (returR / totalR * 100).toFixed(1) : 0;
      window._lapStatCards = `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div class="bg-gradient-to-br from-teal-50 to-teal-100/60 rounded-2xl border border-teal-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-teal-700">Total</span><svg class="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg></div><div class="text-lg font-bold text-teal-800">${fmtNum(totalR)}</div><div class="text-[10px] text-teal-600/70">Total penerimaan</div></div>
        <div class="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Lolos QC</span><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="text-lg font-bold text-emerald-800">${fmtNum(lolosR)}</div><div class="text-[10px] text-emerald-600/70">Kualitas baik</div></div>
        <div class="bg-gradient-to-br from-orange-50 to-orange-100/60 rounded-2xl border border-orange-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-orange-700">Retur</span><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div><div class="text-lg font-bold text-orange-800">${fmtNum(returR)}</div><div class="text-[10px] text-orange-600/70">${returPct}% dari total</div></div>
        <div class="bg-gradient-to-br from-teal-50 to-teal-100/60 rounded-2xl border border-teal-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-teal-700">Nilai</span><svg class="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><div class="text-lg font-bold text-teal-800">${fmtIDR(r.stats.total_nilai)}</div><div class="text-[10px] text-teal-600/70">Total nilai barang</div></div>
      </div>`;
    } else if (tab === 'mutasi') {
      const r = await api.get('/laporan/mutasi-stok');
      const rows = r.rows || [];
      window._lapData = { tab, rows, headers: ['Tanggal','Jenis','Bahan','Jumlah','Satuan','Keterangan'], fields: ['tanggal','jenis','bahan_nama','jumlah','satuan','keterangan'],
        fmt: rows.map(d => [fmtDate(d.tanggal), `<span class="${d.jenis==='Masuk'?'text-green-600':'text-red-600'} font-medium">${d.jenis}</span>`, d.bahan_nama, fmtNum(d.jumlah), d.satuan, d.keterangan||'-']) };
      window['_export_mutasi'] = { data: rows, fields: ['tanggal','jenis','bahan_nama','jumlah','satuan','keterangan'] };
      const totalMasuk = Number(r.stats.total_masuk).toFixed(2);
      const totalKeluar = Number(r.stats.total_keluar).toFixed(2);
      const selisihMutasi = (totalMasuk - totalKeluar).toFixed(2);
      window._lapStatCards = `<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div class="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Masuk</span><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/></svg></div><div class="text-lg font-bold text-emerald-800">${totalMasuk}</div><div class="text-[10px] text-emerald-600/70">${r.stats.count_masuk || 0} transaksi</div></div>
        <div class="bg-gradient-to-br from-orange-50 to-orange-100/60 rounded-2xl border border-orange-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-orange-700">Keluar</span><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="21 16 21 21 16 21"/><line x1="4" y1="4" x2="21" y2="21"/></svg></div><div class="text-lg font-bold text-orange-800">${totalKeluar}</div><div class="text-[10px] text-orange-600/70">${r.stats.count_keluar || 0} transaksi</div></div>
        <div class="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Selisih</span><svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div><div class="text-lg font-bold text-blue-800">${selisihMutasi}</div><div class="text-[10px] text-blue-600/70">Masuk - Keluar</div></div>
      </div>`;
    } else if (tab === 'produksi') {
      const r = await api.get('/laporan/produksi');
      const rows = r.rows || [];
      window._lapData = { tab, rows, headers: ['Tanggal','Menu','Kategori','Porsi','Status'], fields: ['tanggal_produksi','menu_nama','kategori_penerima','jumlah_porsi','status'],
        fmt: rows.map(d => [fmtDate(d.tanggal_produksi), d.menu_nama, d.kategori_penerima||'-', fmtNum(d.jumlah_porsi), d.status]) };
      window['_export_produksi'] = { data: rows, fields: ['tanggal_produksi','menu_nama','kategori_penerima','jumlah_porsi','status'] };
      window._lapStatCards = `<div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <div class="bg-gradient-to-br from-lime-50 to-lime-100/60 rounded-2xl border border-lime-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-lime-700">Produksi</span><svg class="w-4 h-4 text-lime-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg></div><div class="text-lg font-bold text-lime-800">${fmtNum(r.stats.total)}</div><div class="text-[10px] text-lime-600/70">Total produksi</div></div>
        <div class="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Porsi</span><svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><div class="text-lg font-bold text-blue-800">${fmtNum(r.stats.total_porsi)}</div><div class="text-[10px] text-blue-600/70">Total porsi diproduksi</div></div>
        <div class="bg-gradient-to-br from-sky-50 to-sky-100/60 rounded-2xl border border-sky-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-sky-700">Rata/Hari</span><svg class="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg></div><div class="text-lg font-bold text-sky-800">${r.stats.total > 0 ? fmtNum(Math.round(r.stats.total_porsi / r.stats.total)) : 0}</div><div class="text-[10px] text-sky-600/70">Porsi per produksi</div></div>
        <div class="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Diproduksi</span><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="text-lg font-bold text-emerald-800">${fmtNum(r.stats.diproduksi)}</div><div class="text-[10px] text-emerald-600/70">Sedang diproses</div></div>
        <div class="bg-gradient-to-br from-stone-50 to-stone-100/60 rounded-2xl border border-stone-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-stone-700">Selesai</span><svg class="w-4 h-4 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="text-lg font-bold text-stone-800">${fmtNum(r.stats.selesai)}</div><div class="text-[10px] text-stone-600/70">Telah selesai</div></div>
      </div>`;
    } else if (tab === 'payroll') {
      const r = await api.get('/laporan/payroll');
      const rows = r.rows || [];
      window._lapData = { tab, rows, headers: ['Periode','Karyawan','Jabatan','Gaji Pokok','Tunjangan','Potongan','Total Gaji','Status'], fields: ['periode','karyawan_nama','jabatan','gaji_pokok','tunjangan','potongan','total_gaji','status'],
        fmt: rows.map(d => [d.periode, d.karyawan_nama, d.jabatan||'-', fmtIDR(d.gaji_pokok), fmtIDR(d.tunjangan), fmtIDR(d.potongan), fmtIDR(d.total_gaji), d.status]) };
      window['_export_payroll'] = { data: rows, fields: ['periode','karyawan_nama','jabatan','gaji_pokok','tunjangan','potongan','total_gaji','status'] };
      window._lapStatCards = `<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div class="bg-gradient-to-br from-pink-50 to-pink-100/60 rounded-2xl border border-pink-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-pink-700">Karyawan</span><svg class="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><div class="text-lg font-bold text-pink-800">${fmtNum(r.stats.total_karyawan)}</div><div class="text-[10px] text-pink-600/70">Data gaji</div></div>
        <div class="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Total Gaji</span><svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><div class="text-lg font-bold text-blue-800">${fmtIDR(r.stats.total_gaji)}</div><div class="text-[10px] text-blue-600/70">${r.stats.periode_count} periode</div></div>
        <div class="bg-gradient-to-br from-violet-50 to-violet-100/60 rounded-2xl border border-violet-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-violet-700">Rata-rata</span><svg class="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><div class="text-lg font-bold text-violet-800">${fmtIDR(r.stats.total_karyawan ? Math.round(r.stats.total_gaji / r.stats.total_karyawan) : 0)}</div><div class="text-[10px] text-violet-600/70">Per karyawan</div></div>
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
      var pmFilterBar = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 mb-4">' +
        '<div class="flex flex-wrap items-center gap-x-4 gap-y-2">' +
          '<div class="flex items-center gap-2">' +
            '<svg class="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
            '<select id="pm-bulan" onchange="pmGanti()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
            [1,2,3,4,5,6,7,8,9,10,11,12].map(function(b) { return '<option value="' + b + '" ' + (parseInt(blnVal)===b?'selected':'') + '>' + ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][b-1] + '</option>'; }).join('') +
            '</select>' +
            '<select id="pm-tahun" onchange="pmGanti()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
            [2024,2025,2026,2027,2028].map(function(t) { return '<option value="' + t + '" ' + (parseInt(thnVal)===t?'selected':'') + '>' + t + '</option>'; }).join('') +
            '</select>' +
            '<select id="pm-minggu" onchange="pmGanti()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
            [1,2,3,4,5].map(function(m) { return '<option value="' + m + '" ' + (parseInt(mggVal)===m?'selected':'') + '>Minggu ' + m + '</option>'; }).join('') +
            '</select>' +
          '</div>' +
          '<div class="flex gap-1.5">' +
          '<span id="pm-export-btn">' + exportBtn + '</span>' +
          '<button onclick="bayarPayrollMingguanLap()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 shadow-sm">' +
          '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' +
          'Bayar & Jurnal</button>' +
          '</div>' +
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
        var infoHtml = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 mb-4">' +
          '<div class="flex items-center justify-between">' +
            '<div class="flex items-center gap-3"><div class="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-400 to-pink-600 flex items-center justify-center shadow-sm"><svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><div><div class="text-sm font-bold text-stone-800">' + minggu.label + '</div><div class="text-xs text-stone-500">' + totals.total_karyawan + ' karyawan · ' + totals.total_hadir + ' hadir</div></div></div>' +
            '<div class="text-right"><div class="text-lg font-bold text-stone-800">' + fmtIdr(totals.total_gaji) + '</div><div class="text-[10px] text-stone-500">Total gaji</div></div>' +
          '</div></div>';

        // Table header
        var tableHtml = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-[11px]"><thead class="bg-stone-50"><tr>' +
          '<th class="text-left px-3 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider border-r border-stone-200 whitespace-nowrap">Nama</th>' +
          '<th class="text-left px-2 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider border-r border-stone-200 whitespace-nowrap">Jabatan</th>';
        minggu.dates.forEach(function(tgl, i) {
          const d = new Date(tgl + 'T00:00:00');
          const hari = tglNama[d.getDay()];
          const tglNum = tgl.slice(8, 10);
          tableHtml += '<th class="text-center px-1 py-1.5 font-bold text-stone-500 text-[9px] uppercase tracking-wider border-l border-stone-200 min-w-[72px] ' + ([0,6].includes(d.getDay()) ? 'text-red-400' : '') + '">' + hari + '<br><span class="text-xs">' + tglNum + '</span></th>';
        });
        tableHtml += '<th class="text-center px-2 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider border-l border-stone-200 whitespace-nowrap">Hadir</th>' +
          '<th class="text-right px-2 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider whitespace-nowrap">Upah/Hari</th>' +
          '<th class="text-right px-2 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider whitespace-nowrap">Total</th></tr></thead><tbody>';

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
      var lrFilterBar = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 mb-4">' +
        '<div class="flex flex-wrap items-center gap-3">' +
          '<svg class="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>' +
          '<select id="lr-bulan" onchange="gantiPeriodeLR()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
          [1,2,3,4,5,6,7,8,9,10,11,12].map(function(b) { return '<option value="' + b + '" ' + (parseInt(blnVal)===b?'selected':'') + '>' + ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][b-1] + '</option>'; }).join('') +
          '</select>' +
          '<select id="lr-tahun" onchange="gantiPeriodeLR()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
          [2024,2025,2026,2027,2028].map(function(t) { return '<option value="' + t + '" ' + (parseInt(thnVal)===t?'selected':'') + '>' + t + '</option>'; }).join('') +
          '</select>' +
        '</div></div>';

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
      var lrContent = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">' +
        '<div class="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Pendapatan</span><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>' +
          '<div class="text-lg font-bold text-emerald-800">' + fmtIDR(pend.total) + '</div>' +
          '<div class="text-[10px] text-emerald-600/70">' + (pend.rincian?.length || 0) + ' kategori</div>' +
        '</div>' +
        '<div class="bg-gradient-to-br from-orange-50 to-orange-100/60 rounded-2xl border border-orange-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-orange-700">Biaya</span><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>' +
          '<div class="text-lg font-bold text-orange-800">' + fmtIDR(biaya.total) + '</div>' +
          '<div class="text-[10px] text-orange-600/70">' + (biaya.rincian?.length || 0) + ' kategori</div>' +
        '</div>' +
        '<div class="bg-gradient-to-br from-' + (laba>=0?'emerald':'red') + '-50 to-' + (laba>=0?'emerald':'red') + '-100/60 rounded-2xl border border-' + (laba>=0?'emerald':'red') + '-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-' + (laba>=0?'emerald':'red') + '-700">Laba/Rugi</span><svg class="w-4 h-4 text-' + (laba>=0?'emerald':'red') + '-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 17V9m0 0l-4 4m4-4l4 4"/></svg></div>' +
          '<div class="text-lg font-bold text-' + (laba>=0?'emerald':'red') + '-800">' + fmtIDR(Math.abs(laba)) + '</div>' +
          '<div class="text-[10px] text-' + (laba>=0?'emerald':'red') + '-600/70">' + (laba>=0?'Surplus':'Defisit') + '</div>' +
        '</div>' +
        '<div class="bg-gradient-to-br from-' + (margin>=0?'emerald':'red') + '-50 to-' + (margin>=0?'emerald':'red') + '-100/60 rounded-2xl border border-' + (margin>=0?'emerald':'red') + '-200/60 p-4 shadow-sm">' +
          '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-' + (margin>=0?'emerald':'red') + '-700">Margin</span><svg class="w-4 h-4 text-' + (margin>=0?'emerald':'red') + '-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>' +
          '<div class="text-lg font-bold text-' + (margin>=0?'emerald':'red') + '-800">' + margin.toFixed(1) + '%</div>' +
          '<div class="text-[10px] text-' + (margin>=0?'emerald':'red') + '-600/70">Dari pendapatan</div>' +
        '</div>' +
      '</div>' +
      '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">' +
      // Pendapatan table
      '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">' +
      '<div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between"><h3 class="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-2"><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>Pendapatan</h3><span class="text-xs font-bold text-emerald-700">' + fmtIDR(pend.total) + '</span></div>' +
      '<table class="w-full text-xs"><thead><tr class="bg-stone-50"><th class="text-left px-4 py-2.5 text-[10px] font-bold text-stone-500 uppercase">Kategori</th><th class="text-right px-4 py-2.5 text-[10px] font-bold text-stone-500 uppercase">Jumlah</th><th class="text-right px-4 py-2.5 text-[10px] font-bold text-stone-500 uppercase">%</th></tr></thead><tbody>' +
      pendapatanHtml +
      '<tr class="border-t-2 border-stone-300 bg-gradient-to-r from-emerald-50 to-emerald-100/60 font-bold"><td class="px-4 py-3 text-xs text-stone-800">Total Pendapatan</td><td class="px-4 py-3 text-right mono text-xs text-emerald-700">' + fmtIDR(pend.total) + '</td><td class="px-4 py-3 text-right text-xs text-emerald-700">100%</td></tr>' +
      '</tbody></table></div>' +
      // Biaya table
      '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">' +
      '<div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between"><h3 class="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-2"><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Biaya</h3><span class="text-xs font-bold text-orange-700">' + fmtIDR(biaya.total) + '</span></div>' +
      '<table class="w-full text-xs"><thead><tr class="bg-stone-50"><th class="text-left px-4 py-2.5 text-[10px] font-bold text-stone-500 uppercase">Kategori</th><th class="text-right px-4 py-2.5 text-[10px] font-bold text-stone-500 uppercase">Jumlah</th><th class="text-right px-4 py-2.5 text-[10px] font-bold text-stone-500 uppercase">%</th></tr></thead><tbody>' +
      biayaHtml +
      '<tr class="border-t-2 border-stone-300 bg-gradient-to-r from-orange-50 to-orange-100/60 font-bold"><td class="px-4 py-3 text-xs text-stone-800">Total Biaya</td><td class="px-4 py-3 text-right mono text-xs text-orange-700">' + fmtIDR(biaya.total) + '</td><td class="px-4 py-3 text-right text-xs text-orange-700">100%</td></tr>' +
      '</tbody></table></div></div>' +
      // Summary bottom
      '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">' +
      '<div class="p-4 sm:p-5 flex items-center justify-between"><div><span class="text-sm font-bold text-stone-800">Laba ' + (laba>=0?'Bersih':'Rugi Bersih') + '</span><br><span class="text-xs text-stone-500">' + r.periode + '</span></div>' +
      '<div class="text-right"><div class="text-xl font-bold mono ' + (laba>=0?'text-emerald-600':'text-red-600') + '">' + (laba>=0?'':'−') + fmtIDR(Math.abs(laba)) + '</div>' +
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
      var totalPengeluaran = r.total_pengeluaran || 0;
      var danaTersedia = r.dana_tersedia || 0;
      var serapanPeng = danaTersedia > 0 ? (totalPengeluaran / danaTersedia * 100) : 0;
      window._lapStatCards = `
<div class="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 mb-4">
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <div class="flex items-center gap-2">
      <svg class="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>
      <select id="filter-bulan" onchange="gantiPeriodePengeluaran()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
        ${[1,2,3,4,5,6,7,8,9,10,11,12].map(b => `<option value="${b}" ${(parseInt(bulan||new Date().getMonth()+1))===b?'selected':''}>${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][b-1]}</option>`).join('')}
      </select>
      <select id="filter-tahun" onchange="gantiPeriodePengeluaran()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
        ${[2024,2025,2026,2027,2028].map(t => `<option value="${t}" ${(parseInt(tahun||new Date().getFullYear()))===t?'selected':''}>${t}</option>`).join('')}
      </select>
    </div>
    <span class="text-xs text-stone-500 font-medium ml-auto">${bulanNama} ${tahun||new Date().getFullYear()}</span>
  </div>
</div>
<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
  <div class="bg-gradient-to-br from-stone-50 to-stone-100/60 rounded-2xl border border-stone-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-stone-700">Sisa Dana Lalu</span><svg class="w-4 h-4 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="text-lg font-bold text-stone-800">${fmtIDR(r.sisa_dana_lalu)}</div><div class="text-[10px] text-stone-600/70">Dari periode sebelumnya</div></div>
  <div class="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Dana Diterima</span><svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><div class="text-lg font-bold text-blue-800">${fmtIDR(r.dana_diterima)}</div><div class="text-[10px] text-blue-600/70">Pemasukan periode ini</div></div>
  <div class="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Dana Tersedia</span><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"/></svg></div><div class="text-lg font-bold text-emerald-800">${fmtIDR(danaTersedia)}</div><div class="flex items-center gap-1 mt-1"><div class="w-full bg-emerald-200/60 rounded-full h-1.5 overflow-hidden"><div class="bg-emerald-500 h-1.5 rounded-full" style="width:${Math.min(serapanPeng,100)}%"></div></div><span class="text-[10px] text-emerald-600/70 ml-1">${serapanPeng.toFixed(1)}%</span></div></div>
  <div class="bg-gradient-to-br from-${r.sisa_dana_saat_ini >= 0 ? 'emerald' : 'red'}-50 to-${r.sisa_dana_saat_ini >= 0 ? 'emerald' : 'red'}-100/60 rounded-2xl border border-${r.sisa_dana_saat_ini >= 0 ? 'emerald' : 'red'}-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-${r.sisa_dana_saat_ini >= 0 ? 'emerald' : 'red'}-700">Sisa Dana</span><svg class="w-4 h-4 text-${r.sisa_dana_saat_ini >= 0 ? 'emerald' : 'red'}-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div><div class="text-lg font-bold text-${r.sisa_dana_saat_ini >= 0 ? 'emerald' : 'red'}-800">${fmtIDR(r.sisa_dana_saat_ini)}</div><div class="text-[10px] text-${r.sisa_dana_saat_ini >= 0 ? 'emerald' : 'red'}-600/70">${r.sisa_dana_saat_ini >= 0 ? 'Sisa dana' : 'Defisit'}</div></div>
</div>
<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-4">
  <div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
    <h3 class="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-2"><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Rincian Pengeluaran Bulanan</h3>
    <span class="text-[10px] text-stone-400">${bulanNama} ${tahun}</span>
  </div>
  <table class="w-full text-xs">
    <tbody>
      <tr class="border-t border-stone-100">
        <td class="px-4 py-3 font-medium text-stone-700">Biaya Bahan Baku</td>
        <td class="px-4 py-3 text-right mono font-semibold text-stone-800">${fmtIDR(r.biaya_bahan_baku)}</td>
      </tr>
      <tr class="border-t border-stone-100 bg-stone-50/50">
        <td class="px-4 py-3 font-medium text-stone-700">Biaya Operasional</td>
        <td class="px-4 py-3 text-right mono font-semibold text-stone-800">${fmtIDR(r.biaya_operasional)}</td>
      </tr>
      <tr class="border-t border-stone-100">
        <td class="px-4 py-3 font-medium text-stone-700">Biaya Insentif Fasilitas</td>
        <td class="px-4 py-3 text-right mono font-semibold text-stone-800">${fmtIDR(r.biaya_insentif_fasilitas)}</td>
      </tr>
      ${r.biaya_lainnya > 0 ? `<tr class="border-t border-stone-100 bg-stone-50/50">
        <td class="px-4 py-3 font-medium text-stone-500">Biaya Lainnya</td>
        <td class="px-4 py-3 text-right mono text-stone-500">${fmtIDR(r.biaya_lainnya)}</td>
      </tr>` : ''}
      <tr class="border-t-2 border-stone-300 bg-gradient-to-r from-orange-50 to-orange-100/60">
        <td class="px-4 py-3.5 font-bold text-stone-800">Total Pengeluaran</td>
        <td class="px-4 py-3.5 text-right mono font-bold text-red-600">${fmtIDR(totalPengeluaran)}</td>
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
      var tglStr = baState.pa_tanggal || nowDate.toISOString().slice(0,10);      var tglPanjang = fmtDateIndonesia(tglStr);

      var fmtIdr = fmtIDR;
      var serapanBB = d.bahan_baku.diajukan > 0 ? (d.bahan_baku.terpakai / d.bahan_baku.diajukan * 100) : 0;
      var serapanOp = d.operasional.diajukan > 0 ? (d.operasional.terpakai / d.operasional.diajukan * 100) : 0;
      var serapanTotal = d.total.diajukan > 0 ? (d.total.terpakai / d.total.diajukan * 100) : 0;

      window._lapStatCards =
        '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5 mb-4">' +
        '<div class="flex items-center gap-3 mb-4"><div class="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shadow-sm"><svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg></div><div><h2 class="text-sm font-bold text-stone-800">Laporan Penggunaan Anggaran</h2><p class="text-xs text-stone-500">' + periodeLbl + '</p></div></div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">' +
        '<div><label class="block text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1.5">Periode</label>' +
        '<div class="flex gap-2"><select id="pa-bulan" onchange="paGantiPeriode()" class="flex-1 text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
        [1,2,3,4,5,6,7,8,9,10,11,12].map(function(b) { return '<option value="' + b + '" ' + (parseInt(bln)===b?'selected':'') + '>' + ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][b-1] + '</option>'; }).join('') +
        '</select>' +
        '<select id="pa-tahun" onchange="paGantiPeriode()" class="flex-1 text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
        [2024,2025,2026,2027,2028].map(function(t) { return '<option value="' + t + '" ' + (parseInt(thn)===t?'selected':'') + '>' + t + '</option>'; }).join('') +
        '</select></div></div>' +
        '<div><label class="block text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1.5">Tanggal Laporan</label><input id="pa-tanggal" type="date" class="w-full text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" value="' + (baState.pa_tanggal||nowDate.toISOString().slice(0,10)) + '"></div>' +
        '<div><label class="block text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1.5">No. Rekening / VA</label><input id="pa-rekening" type="text" class="w-full text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="—" value="' + escHtml(rekening) + '"></div>' +
        '</div>' +
        '<div class="flex gap-2">' +
        '<button onclick="paSimpan()" class="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-medium transition-colors shadow-sm"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Tampilkan Dokumen</button>' +
        '<button onclick="paCetak()" class="inline-flex items-center gap-1.5 border border-stone-300 text-stone-700 hover:bg-stone-50 px-4 py-2 rounded-lg text-xs font-medium transition-colors"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>Export PDF</button>' +
        '</div></div>' +
        // Stat cards
        '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">' +
        '<div class="bg-gradient-to-br from-teal-50 to-teal-100/60 rounded-2xl border border-teal-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-teal-700">Diajukan</span><svg class="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><div class="text-lg font-bold text-teal-800">' + fmtIdr(d.total.diajukan) + '</div><div class="text-[10px] text-teal-600/70">Total dana diajukan</div></div>' +
        '<div class="bg-gradient-to-br from-orange-50 to-orange-100/60 rounded-2xl border border-orange-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-orange-700">Terpakai</span><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="text-lg font-bold text-orange-800">' + fmtIdr(d.total.terpakai) + '</div><div class="flex items-center gap-1 mt-1"><div class="flex-1 bg-orange-200/60 rounded-full h-1.5 overflow-hidden"><div class="bg-orange-500 h-1.5 rounded-full" style="width:' + Math.min(serapanTotal,100) + '%"></div></div><span class="text-[10px] text-orange-600/70">' + serapanTotal.toFixed(1) + '%</span></div></div>' +
        '<div class="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Sisa</span><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div><div class="text-lg font-bold text-emerald-800">' + fmtIdr(d.total.sisa) + '</div><div class="text-[10px] text-emerald-600/70">Sisa dana periode ini</div></div>' +
        '<div class="bg-gradient-to-br from-violet-50 to-violet-100/60 rounded-2xl border border-violet-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-violet-700">Periode</span><svg class="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg></div><div class="text-lg font-bold text-violet-800">' + periodeLbl + '</div><div class="text-[10px] text-violet-600/70">Periode laporan</div></div>' +
        '</div>' +
        // Detail cards
        '<div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">' +
        '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-4"><div class="flex items-center gap-3 mb-3"><div class="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shadow-sm"><svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div><div><div class="text-xs font-semibold text-stone-700">Bahan Baku</div><div class="text-[10px] text-stone-400">Diajukan: ' + fmtIdr(d.bahan_baku.diajukan) + '</div></div></div><div class="space-y-1.5"><div class="flex justify-between text-xs"><span class="text-stone-500">Terpakai</span><span class="font-semibold text-stone-800">' + fmtIdr(d.bahan_baku.terpakai) + '</span></div><div class="flex justify-between text-xs"><span class="text-stone-500">Sisa</span><span class="font-semibold text-' + (d.bahan_baku.sisa >= 0 ? 'emerald' : 'red') + '-600">' + fmtIdr(d.bahan_baku.sisa) + '</span></div><div class="mt-2 w-full bg-stone-100 rounded-full h-1.5 overflow-hidden"><div class="bg-teal-500 h-1.5 rounded-full" style="width:' + Math.min(serapanBB,100) + '%"></div></div><div class="text-[10px] text-stone-400 text-right">' + serapanBB.toFixed(1) + '% terserap</div></div></div>' +
        '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-4"><div class="flex items-center gap-3 mb-3"><div class="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-sm"><svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"/></svg></div><div><div class="text-xs font-semibold text-stone-700">Operasional</div><div class="text-[10px] text-stone-400">Diajukan: ' + fmtIdr(d.operasional.diajukan) + '</div></div></div><div class="space-y-1.5"><div class="flex justify-between text-xs"><span class="text-stone-500">Terpakai</span><span class="font-semibold text-stone-800">' + fmtIdr(d.operasional.terpakai) + '</span></div><div class="flex justify-between text-xs"><span class="text-stone-500">Sisa</span><span class="font-semibold text-' + (d.operasional.sisa >= 0 ? 'emerald' : 'red') + '-600">' + fmtIdr(d.operasional.sisa) + '</span></div><div class="mt-2 w-full bg-stone-100 rounded-full h-1.5 overflow-hidden"><div class="bg-amber-500 h-1.5 rounded-full" style="width:' + Math.min(serapanOp,100) + '%"></div></div><div class="text-[10px] text-stone-400 text-right">' + serapanOp.toFixed(1) + '% terserap</div></div></div>' +
        '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-4"><div class="flex items-center gap-3 mb-3"><div class="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center shadow-sm"><svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><div><div class="text-xs font-semibold text-stone-700">Insentif Fasilitas</div><div class="text-[10px] text-stone-400">Diajukan: ' + fmtIdr(d.insentif.diajukan) + '</div></div></div><div class="space-y-1.5"><div class="flex justify-between text-xs"><span class="text-stone-500">Terpakai</span><span class="font-semibold text-stone-800">' + fmtIdr(d.insentif.terpakai) + '</span></div><div class="flex justify-between text-xs"><span class="text-stone-500">Sisa</span><span class="font-semibold text-stone-800">' + fmtIdr(d.insentif.sisa) + '</span></div></div></div>' +
        '</div>' +
        // Document (print area) - tetap dipertahankan untuk cetak
        '<div id="pa-dokumen" class="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 sm:p-8 print-area">' +

        '<h1 class="text-base font-bold text-center uppercase mb-4">Laporan Penggunaan Anggaran</h1>' +

        '<h2 class="text-sm font-bold mb-3">I. RINCIAN KEGIATAN</h2>' +
        '<div class="overflow-x-auto mb-4"><table class="w-full text-xs border-collapse">' +
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
        '</tbody></table></div>' +

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
            '<th class="px-2 py-1 text-left font-semibold text-stone-500 uppercase text-[9px]">Tanggal</th><th class="px-2 py-1 text-left font-semibold text-stone-500 uppercase text-[9px]">No Transaksi</th>' +
            '<th class="px-2 py-1 text-left font-semibold text-stone-500 uppercase text-[9px]">Tipe</th><th class="px-2 py-1 text-left font-semibold text-stone-500 uppercase text-[9px]">Kategori</th>' +
            '<th class="px-2 py-1 text-left font-semibold text-stone-500 uppercase text-[9px]">Deskripsi</th><th class="px-2 py-1 text-right font-semibold text-stone-500 uppercase text-[9px]">Jumlah</th></tr></thead><tbody>';
          a.transaksi.forEach(function(t) {
            detailHtml += '<tr class="border-b border-stone-100">' +
              '<td class="px-2 py-1 text-xs">' + fmtDate(t.tanggal) + '</td>' +
              '<td class="px-2 py-1 text-xs">' + escHtml(t.no_transaksi||'-') + '</td>' +
              '<td class="px-2 py-1 text-xs"><span class="' + (t.tipe==='masuk'?'text-green-600':'text-red-600') + ' font-medium">' + t.tipe + '</span></td>' +
              '<td class="px-2 py-1 text-xs">' + escHtml(t.kategori||'-') + '</td>' +
              '<td class="px-2 py-1 text-xs">' + escHtml(t.deskripsi||'-') + '</td>' +
              '<td class="px-2 py-1 text-right mono text-xs font-semibold">' + fmtIDR(t.jumlah) + '</td></tr>';
          });
          detailHtml += '</tbody></table></td></tr>';
        }
        var sisa = a.total_masuk - a.total_keluar;
        akunRows += '<tr class="border-t border-stone-100 hover:bg-stone-50/80 transition-colors cursor-pointer" onclick="bpkasToggle(' + a.akun_id + ')">' +
          '<td class="px-4 py-3 text-xs font-mono text-stone-500">' + escHtml(a.akun_kode) + '</td>' +
          '<td class="px-4 py-3 text-xs font-medium text-stone-700">' + escHtml(a.akun_nama) + '</td>' +
          '<td class="px-4 py-3 text-xs text-right mono font-semibold text-stone-700">' + fmtIDR(a.saldo_awal) + '</td>' +
          '<td class="px-4 py-3 text-xs text-right mono text-green-600 font-semibold">' + fmtIDR(a.total_masuk) + '</td>' +
          '<td class="px-4 py-3 text-xs text-right mono text-red-600 font-semibold">' + fmtIDR(a.total_keluar) + '</td>' +
          '<td class="px-4 py-3 text-xs text-right mono font-bold text-stone-800">' + fmtIDR(a.saldo_akhir) + '</td></tr>' +
          detailHtml;
      });

      var listBadge = '';
      if (akunList.length) {
        listBadge = akunList.map(function(a) { return '<span class="inline-block bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full">' + escHtml(a.kode) + ' - ' + escHtml(a.nama) + '</span>'; }).join(' ');
        listBadge = '<div class="mt-3 flex flex-wrap gap-1">' + listBadge + '</div>';
      }

      window['_export_bp-kas'] = { data: akunData, fields: ['akun_kode','akun_nama','saldo_awal','total_masuk','total_keluar','saldo_akhir'] };

      window._lapStatCards =
        '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 mb-4">' +
        '<div class="flex flex-wrap items-center gap-3">' +
          '<svg class="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>' +
          '<select id="bpkas-bulan" onchange="bpkasFilter()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
          [1,2,3,4,5,6,7,8,9,10,11,12].map(function(b) { return '<option value="' + b + '" ' + (parseInt(kasBulan)===b?'selected':'') + '>' + ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][b-1] + '</option>'; }).join('') +
          '</select>' +
          '<select id="bpkas-tahun" onchange="bpkasFilter()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
          [2024,2025,2026,2027,2028].map(function(t) { return '<option value="' + t + '" ' + (parseInt(kasTahun)===t?'selected':'') + '>' + t + '</option>'; }).join('') +
          '</select>' +
        '</div></div>' +
        '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">' +
        '<div class="bg-gradient-to-br from-stone-50 to-stone-100/60 rounded-2xl border border-stone-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-stone-700">Saldo Awal</span><svg class="w-4 h-4 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="text-lg font-bold text-stone-800">' + totalSa + '</div><div class="text-[10px] text-stone-600/70">Saldo awal periode</div></div>' +
        '<div class="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Debit</span><svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><div class="text-lg font-bold text-blue-800">' + totalMi + '</div><div class="text-[10px] text-blue-600/70">Total kas masuk</div></div>' +
        '<div class="bg-gradient-to-br from-orange-50 to-orange-100/60 rounded-2xl border border-orange-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-orange-700">Kredit</span><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="text-lg font-bold text-orange-800">' + totalKk + '</div><div class="text-[10px] text-orange-600/70">Total kas keluar</div></div>' +
        '<div class="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Saldo Akhir</span><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"/></svg></div><div class="text-lg font-bold text-emerald-800">' + totalSaAkhir + '</div><div class="text-[10px] text-emerald-600/70">Saldo akhir periode</div></div>' +
        '</div>' +
        '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">' +
        '<div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between"><h3 class="text-xs font-bold text-stone-700 uppercase tracking-wider">BP Kas per Akun</h3><span class="text-[10px] text-stone-400">' + akunData.length + ' akun</span></div>' +
        '<div class="overflow-x-auto"><table class="w-full text-xs">' +
        '<thead><tr class="bg-stone-50">' +
        '<th class="text-left px-4 py-3 text-[10px] font-bold text-stone-500 uppercase">Kode</th>' +
        '<th class="text-left px-4 py-3 text-[10px] font-bold text-stone-500 uppercase">Nama Akun</th>' +
        '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase">Saldo Awal</th>' +
        '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase">Debit</th>' +
        '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase">Kredit</th>' +
        '<th class="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase">Saldo Akhir</th></tr></thead><tbody>' +
        (akunRows || '<tr><td colspan="6" class="text-center py-8 text-stone-400">Belum ada transaksi BP Kas periode ini</td></tr>') +
        '<tr class="border-t-2 border-stone-300 bg-gradient-to-r from-stone-100 to-stone-50 font-bold">' +
        '<td colspan="2" class="px-4 py-3.5 text-xs text-stone-800">TOTAL</td>' +
        '<td class="px-4 py-3.5 text-right text-xs mono text-stone-800">' + totalSa + '</td>' +
        '<td class="px-4 py-3.5 text-right text-xs mono text-green-700">' + totalMi + '</td>' +
        '<td class="px-4 py-3.5 text-right text-xs mono text-red-700">' + totalKk + '</td>' +
        '<td class="px-4 py-3.5 text-right text-xs mono text-stone-800">' + totalSaAkhir + '</td></tr>' +
        '</tbody></table></div></div>' + listBadge;

      window._lapData = null;
    } else if (tab === 'arus-kas') {
      const now = new Date();
      const blnVal = lapState.ak_bulan || String(now.getMonth() + 1).padStart(2, '0');
      const thnVal = lapState.ak_tahun || String(now.getFullYear());
      var akFilterBar = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 mb-4">' +
        '<div class="flex flex-wrap items-center gap-3">' +
          '<svg class="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>' +
          '<select id="ak-bulan" onchange="gantiPeriodeAK()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
          [1,2,3,4,5,6,7,8,9,10,11,12].map(function(b) { return '<option value="' + b + '" ' + (parseInt(blnVal)===b?'selected':'') + '>' + ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][b-1] + '</option>'; }).join('') +
          '</select>' +
          '<select id="ak-tahun" onchange="gantiPeriodeAK()" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
          [2024,2025,2026,2027,2028].map(function(t) { return '<option value="' + t + '" ' + (parseInt(thnVal)===t?'selected':'') + '>' + t + '</option>'; }).join('') +
          '</select>' +
        '</div></div>';

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

      var akContent = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">' +
        '<div class="bg-gradient-to-br from-stone-50 to-stone-100/60 rounded-2xl border border-stone-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-stone-700">Saldo Awal</span><svg class="w-4 h-4 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="text-lg font-bold text-stone-800">' + fmtIdr(r.saldo_awal) + '</div><div class="text-[10px] text-stone-600/70">Sebelum periode</div></div>' +
        '<div class="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Kas Masuk</span><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><div class="text-lg font-bold text-emerald-800">' + fmtIdr(r.kas_masuk?.total||0) + '</div><div class="text-[10px] text-emerald-600/70">' + (r.kas_masuk?.rincian?.length||0) + ' kategori</div></div>' +
        '<div class="bg-gradient-to-br from-orange-50 to-orange-100/60 rounded-2xl border border-orange-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-orange-700">Kas Keluar</span><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="text-lg font-bold text-orange-800">' + fmtIdr(r.kas_keluar?.total||0) + '</div><div class="text-[10px] text-orange-600/70">' + (r.kas_keluar?.rincian?.length||0) + ' kategori</div></div>' +
        '<div class="bg-gradient-to-br from-' + (selisih>=0?'emerald':'red') + '-50 to-' + (selisih>=0?'emerald':'red') + '-100/60 rounded-2xl border border-' + (selisih>=0?'emerald':'red') + '-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-' + (selisih>=0?'emerald':'red') + '-700">Saldo Akhir</span><svg class="w-4 h-4 text-' + (selisih>=0?'emerald':'red') + '-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"/></svg></div><div class="text-lg font-bold text-' + (selisih>=0?'emerald':'red') + '-800">' + fmtIdr(saldoAkhir) + '</div><div class="text-[10px] text-' + (selisih>=0?'emerald':'red') + '-600/70">' + (selisih>=0?'Surplus':'Defisit') + '</div></div>' +
      '</div>' +
      // Detail tables
      '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">' +
      // Masuk
      '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">' +
      '<div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between"><h3 class="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-2"><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>Kas Masuk</h3><span class="text-xs font-bold text-emerald-700">' + fmtIdr(r.kas_masuk?.total||0) + '</span></div>' +
      '<table class="w-full text-xs"><thead><tr class="bg-stone-50"><th class="text-left px-4 py-2.5 text-[10px] font-bold text-stone-500 uppercase">Kategori</th><th class="text-right px-4 py-2.5 text-[10px] font-bold text-stone-500 uppercase">Jumlah</th></tr></thead><tbody>' +
      masukHtml +
      '<tr class="border-t-2 border-stone-400 font-bold bg-emerald-50"><td class="px-3 py-2.5 text-xs">Total Masuk</td><td class="px-3 py-2.5 text-right mono text-xs">' + fmtIdr(r.kas_masuk?.total||0) + '</td></tr>' +
      '</tbody></table></div>' +
      // Keluar
      '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">' +
      '<div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between"><h3 class="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-2"><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Kas Keluar</h3><span class="text-xs font-bold text-orange-700">' + fmtIdr(r.kas_keluar?.total||0) + '</span></div>' +
      '<table class="w-full text-xs"><thead><tr class="bg-stone-50"><th class="text-left px-4 py-2.5 text-[10px] font-bold text-stone-500 uppercase">Kategori</th><th class="text-right px-4 py-2.5 text-[10px] font-bold text-stone-500 uppercase">Jumlah</th></tr></thead><tbody>' +
      keluarHtml +
      '<tr class="border-t-2 border-stone-300 bg-gradient-to-r from-orange-50 to-orange-100/60 font-bold"><td class="px-4 py-3 text-xs text-stone-800">Total Kas Keluar</td><td class="px-4 py-3 text-right mono text-xs text-orange-700">' + fmtIdr(r.kas_keluar?.total||0) + '</td></tr>' +
      '</tbody></table></div></div>' +
      // Summary
      '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">' +
      '<div class="p-4 sm:p-5"><div class="flex items-center justify-between"><div><span class="text-xs font-bold text-stone-700 uppercase tracking-wider">Ringkasan Arus Kas</span><br><span class="text-xs text-stone-500">' + r.periode + '</span></div></div>' +
      '<div class="mt-3 space-y-2">' +
      '<div class="flex justify-between text-xs"><span class="text-stone-500">(+) Saldo Awal</span><span class="font-semibold text-stone-800">' + fmtIdr(r.saldo_awal) + '</span></div>' +
      '<div class="flex justify-between text-xs"><span class="text-emerald-600">(+) Kas Masuk</span><span class="font-semibold text-emerald-600">' + fmtIdr(r.kas_masuk?.total||0) + '</span></div>' +
      '<div class="flex justify-between text-xs"><span class="text-red-500">(−) Kas Keluar</span><span class="font-semibold text-red-500">' + fmtIdr(r.kas_keluar?.total||0) + '</span></div>' +
      '<div class="border-t border-stone-200 pt-2 flex justify-between text-sm"><span class="font-bold text-stone-700">= Saldo Akhir</span><span class="font-bold mono ' + (selisih>=0?'text-emerald-600':'text-red-600') + '">' + fmtIdr(saldoAkhir) + '</span></div>' +
      '</div></div></div></div>';

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
        bpCards = '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">' +
          d.by_bp.map(function(b) {
            var bpSelisih = b.masuk - b.keluar;
            return '<div class="bg-gradient-to-br from-stone-50 to-stone-100/60 rounded-2xl border border-stone-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-stone-700">' + escHtml(b.bp) + '</span></div><div class="text-lg font-bold text-' + (bpSelisih >= 0 ? 'emerald' : 'red') + '-800">' + fmtIDR(bpSelisih) + '</div><div class="text-[10px] text-stone-600/70">' + b.transaksi + ' transaksi</div></div>';
          }).join('') +
          '</div>';
      }
      window._lapStatCards = `<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div class="bg-gradient-to-br from-stone-50 to-stone-100/60 rounded-2xl border border-stone-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-stone-700">Saldo Awal</span><svg class="w-4 h-4 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="text-lg font-bold text-stone-800">${fmtIDR(d.saldo_awal)}</div><div class="text-[10px] text-stone-600/70"><button onclick="editSaldoAwal(${d.saldo_awal})" class="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-all"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Ubah</button></div></div>
        <div class="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Kas Masuk</span><svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><div class="text-lg font-bold text-blue-800">${fmtIDR(d.total_kas_masuk)}</div><div class="text-[10px] text-blue-600/70">Total pemasukan</div></div>
        <div class="bg-gradient-to-br from-orange-50 to-orange-100/60 rounded-2xl border border-orange-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-orange-700">Kas Keluar</span><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="text-lg font-bold text-orange-800">${fmtIDR(d.total_kas_keluar)}</div><div class="text-[10px] text-orange-600/70">Total pengeluaran</div></div>
        <div class="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Saldo Akhir</span><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"/></svg></div><div class="text-lg font-bold text-emerald-800">${fmtIDR(d.saldo)}</div><div class="text-[10px] text-emerald-600/70">Saldo_awal + masuk - keluar</div></div>
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
      window._lapStatCards = `<div class="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 mb-4">
        <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <span class="text-stone-500">${r.total} jurnal</span>
          <span class="text-stone-500">${r.periode?.start} s/d ${r.periode?.end}</span>
          <span class="font-semibold text-stone-700">Debit: ${fmtIDR(r.grand_debit)}</span>
          <span class="font-semibold text-stone-700">Kredit: ${fmtIDR(r.grand_kredit)}</span>
        </div>
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

      var filterBar = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 mb-4">' +
        '<div class="flex flex-wrap items-center gap-3">' +
          '<svg class="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>' +
          '<select onchange="lapState.bb_akun_id=this.value;showLap(\'buku-besar\')" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white min-w-[220px] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' + akunOpts + '</select>' +
          '<span class="text-xs text-stone-500">' + r.periode?.start + ' s/d ' + r.periode?.end + '</span>' +
        '</div></div>';

      var tableContent = '';
      akunList.forEach(function(akun) {
        tableContent += '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-4">' +
          '<div class="px-4 py-3 flex items-center justify-between border-b border-stone-100">' +
            '<h3 class="text-xs font-bold text-stone-700"><span class="text-stone-400 font-mono">' + akun.akun_kode + '</span> — ' + akun.akun_nama + '</h3>' +
            '<div class="flex gap-3 text-[10px] text-stone-500"><span>' + akun.kelompok + ' (' + akun.saldo_normal + ')</span></div>' +
          '</div>' +
          '<div class="px-4 py-2 bg-stone-50/70 border-b border-stone-100 text-xs flex flex-wrap gap-4 text-stone-600">' +
          '<span>Saldo Awal: <strong class="mono text-stone-800">' + fmtIDR(akun.saldo_awal) + '</strong></span>' +
          '<span>Debit: <strong class="mono text-stone-800">' + fmtIDR(akun.total_debit) + '</strong></span>' +
          '<span>Kredit: <strong class="mono text-stone-800">' + fmtIDR(akun.total_kredit) + '</strong></span>' +
          '<span>Saldo Akhir: <strong class="mono text-stone-800">' + fmtIDR(akun.saldo_akhir) + '</strong></span></div>';

        if (akun.mutasi && akun.mutasi.length) {
          tableContent += '<div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-stone-50"><tr>' +
            '<th class="text-left px-3 py-2.5 text-[10px] font-bold text-stone-500 uppercase">Tanggal</th>' +
            '<th class="text-left px-3 py-2.5 text-[10px] font-bold text-stone-500 uppercase">No Jurnal</th>' +
            '<th class="text-left px-3 py-2.5 text-[10px] font-bold text-stone-500 uppercase">Deskripsi</th>' +
            '<th class="text-right px-3 py-2.5 text-[10px] font-bold text-stone-500 uppercase">Debit</th>' +
            '<th class="text-right px-3 py-2.5 text-[10px] font-bold text-stone-500 uppercase">Kredit</th>' +
            '<th class="text-right px-3 py-2.5 text-[10px] font-bold text-stone-500 uppercase">Saldo</th>' +
            '</tr></thead><tbody>';
          akun.mutasi.forEach(function(m) {
            tableContent += '<tr class="border-t border-stone-100 hover:bg-stone-50/80 transition-colors">' +
              '<td class="px-3 py-2.5 text-xs">' + fmtDate(m.tanggal) + '</td>' +
              '<td class="px-3 py-2.5 text-xs font-mono text-stone-500">' + m.no_jurnal + '</td>' +
              '<td class="px-3 py-2.5 text-xs">' + (m.deskripsi||'-') + '</td>' +
              '<td class="px-3 py-2.5 text-right mono text-xs">' + (m.debit > 0 ? '<span class="font-semibold">' + fmtIDR(m.debit) + '</span>' : '') + '</td>' +
              '<td class="px-3 py-2.5 text-right mono text-xs">' + (m.kredit > 0 ? '<span class="font-semibold">' + fmtIDR(m.kredit) + '</span>' : '') + '</td>' +
              '<td class="px-3 py-2.5 text-right mono text-xs font-bold text-stone-700">' + fmtIDR(m.saldo) + '</td></tr>';
          });
          tableContent += '</tbody></table></div>';
        } else {
          tableContent += '<div class="p-4 text-center text-stone-400 text-xs">Tidak ada mutasi periode ini</div>';
        }
        tableContent += '</div>';
      });

      if (!akunList.length) {
        tableContent = '<div class="text-center py-12 text-stone-400 bg-white rounded-2xl border border-stone-200 shadow-sm">Tidak ada data buku besar</div>';
      }

      window._lapData = null;
      window._lapStatCards = filterBar + tableContent;

    } else if (tab === 'neraca') {
      const r = await api.get('/laporan/neraca');

      var fmtIdr3 = fmtIDR;
      var selisihClass = Math.abs(r.selisih) < 1 ? 'text-emerald-600' : 'text-red-600';
      var balanceText = Math.abs(r.selisih) < 1 ? 'Balance ✓' : 'Tidak Balance!';

      window._lapStatCards = `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div class="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Aktiva</span><svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"/></svg></div><div class="text-lg font-bold text-blue-800">${fmtIdr3(r.aktiva.total)}</div><div class="text-[10px] text-blue-600/70">Total aset</div></div>
        <div class="bg-gradient-to-br from-orange-50 to-orange-100/60 rounded-2xl border border-orange-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-orange-700">Kewajiban</span><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="text-lg font-bold text-orange-800">${fmtIdr3(r.kewajiban.total)}</div><div class="text-[10px] text-orange-600/70">Total liabilitas</div></div>
        <div class="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Ekuitas</span><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><div class="text-lg font-bold text-emerald-800">${fmtIdr3(r.ekuitas.total)}</div><div class="text-[10px] text-emerald-600/70">Laba berjalan: ${fmtIdr3(r.ekuitas.laba_berjalan)}</div></div>
        <div class="bg-gradient-to-br from-${Math.abs(r.selisih) < 1 ? 'emerald' : 'red'}-50 to-${Math.abs(r.selisih) < 1 ? 'emerald' : 'red'}-100/60 rounded-2xl border border-${Math.abs(r.selisih) < 1 ? 'emerald' : 'red'}-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-${Math.abs(r.selisih) < 1 ? 'emerald' : 'red'}-700">Selisih</span><svg class="w-4 h-4 text-${Math.abs(r.selisih) < 1 ? 'emerald' : 'red'}-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div><div class="text-lg font-bold text-${Math.abs(r.selisih) < 1 ? 'emerald' : 'red'}-800">${fmtIdr3(r.selisih)}</div><div class="text-[10px] text-${Math.abs(r.selisih) < 1 ? 'emerald' : 'red'}-600/70">${balanceText}</div></div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-stone-100 bg-gradient-to-r from-blue-50 to-blue-100/60"><h3 class="text-xs font-bold text-blue-700 uppercase tracking-wider">Aktiva</h3></div>
          <table class="w-full text-xs">
            <tbody>
              ${(r.aktiva.rincian||[]).map(function(a) {
                return '<tr class="border-t border-stone-100 hover:bg-stone-50/80 transition-colors"><td class="px-4 py-2.5 text-xs text-stone-700">' + a.akun_kode + ' — ' + a.akun_nama + '</td><td class="px-4 py-2.5 text-right mono font-semibold text-stone-800">' + fmtIdr3(a.saldo) + '</td></tr>';
              }).join('') || '<tr><td class="px-4 py-4 text-center text-stone-400">Tidak ada data</td></tr>'}
              <tr class="border-t-2 border-stone-300 bg-gradient-to-r from-blue-50 to-blue-100/60 font-bold"><td class="px-4 py-3 text-xs text-blue-800">TOTAL AKTIVA</td><td class="px-4 py-3 text-right mono text-blue-800">${fmtIdr3(r.aktiva.total)}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-4">
            <div class="px-4 py-3 border-b border-stone-100 bg-gradient-to-r from-orange-50 to-orange-100/60"><h3 class="text-xs font-bold text-orange-700 uppercase tracking-wider">Kewajiban</h3></div>
            <table class="w-full text-xs">
              <tbody>
                ${(r.kewajiban.rincian||[]).map(function(a) {
                  return '<tr class="border-t border-stone-100 hover:bg-stone-50/80 transition-colors"><td class="px-4 py-2.5 text-xs text-stone-700">' + a.akun_kode + ' — ' + a.akun_nama + '</td><td class="px-4 py-2.5 text-right mono font-semibold text-stone-800">' + fmtIdr3(a.saldo) + '</td></tr>';
                }).join('') || '<tr><td class="px-4 py-4 text-center text-stone-400">Tidak ada data</td></tr>'}
                <tr class="border-t-2 border-stone-300 bg-gradient-to-r from-orange-50 to-orange-100/60 font-bold"><td class="px-4 py-3 text-xs text-orange-800">TOTAL KEWAJIBAN</td><td class="px-4 py-3 text-right mono text-orange-800">${fmtIdr3(r.kewajiban.total)}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div class="px-4 py-3 border-b border-stone-100 bg-gradient-to-r from-emerald-50 to-emerald-100/60"><h3 class="text-xs font-bold text-emerald-700 uppercase tracking-wider">Ekuitas</h3></div>
            <table class="w-full text-xs">
              <tbody>
                ${(r.ekuitas.rincian||[]).map(function(a) {
                  return '<tr class="border-t border-stone-100 hover:bg-stone-50/80 transition-colors"><td class="px-4 py-2.5 text-xs text-stone-700">' + a.akun_kode + ' — ' + a.akun_nama + '</td><td class="px-4 py-2.5 text-right mono font-semibold text-stone-800">' + fmtIdr3(a.saldo) + '</td></tr>';
                }).join('') || ''}
                <tr class="border-t border-stone-100 bg-emerald-50/50"><td class="px-4 py-2.5 text-xs text-stone-700">Laba Berjalan</td><td class="px-4 py-2.5 text-right mono font-semibold text-stone-800">${fmtIdr3(r.ekuitas.laba_berjalan)}</td></tr>
                <tr class="border-t-2 border-stone-300 bg-gradient-to-r from-emerald-50 to-emerald-100/60 font-bold"><td class="px-4 py-3 text-xs text-emerald-800">TOTAL EKUITAS</td><td class="px-4 py-3 text-right mono text-emerald-800">${fmtIdr3(r.ekuitas.total)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="text-center text-xs text-stone-400 bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3">
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
    if (document.getElementById('rab-pm-tanggal')) loadPMEditor();
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
  if (document.getElementById('rab-pm-tanggal')) loadPMEditor();
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
  return `<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mt-3"><div class="overflow-x-auto"><table class="w-full">
    <thead class="bg-stone-50"><tr>${headers.map(h => `<th class="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-[10px] sm:text-xs font-bold text-stone-500 uppercase tracking-wider whitespace-nowrap">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map(r => `<tr class="border-t border-stone-100 transition-colors hover:bg-stone-50/80">${r.map(c => `<td class="px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm whitespace-nowrap leading-relaxed">${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="text-center py-8 sm:py-12 text-stone-400"><svg class="w-10 h-10 sm:w-14 sm:h-14 mx-auto mb-2 sm:mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg><div class="text-xs sm:text-sm">Belum ada data</div></td></tr>`}</tbody>
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

function exportRabHarianXlsx() {
  const tanggal = (document.getElementById('rh-tanggal') || {}).value;
  const siklusId = (document.getElementById('rh-filter-siklus') || {}).value || '';
  if (!tanggal) { showAlert('Pilih tanggal terlebih dahulu', 'warning'); return; }
  const url = '/api/laporan/rab-harian/export?tanggal=' + encodeURIComponent(tanggal) + (siklusId ? '&siklus_id=' + encodeURIComponent(siklusId) : '');
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showAlert('Export RAB Harian diproses, file akan terunduh', 'info');
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
  html += '@media print{body{padding:30px 40px}}';
  html += '@page{size:A4 portrait;margin:15mm 20mm}';
  html += '</style></head><body>';
  html += '<div style="text-align:center;margin-bottom:10px;font-size:9pt;color:#666">Dokumen ini diekspor dari sistem — ' + new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }) + '</div>';
  html += el.innerHTML;
  html += '<div style="text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #ccc;font-size:9pt;color:#666">';
  html += 'Dicetak melalui sistem manajemen dapur</div>';
  html += '</body></html>';
  win.document.write(html);
  win.document.close();
  setTimeout(function() {
    win.focus();
    win.print();
    win.close();
  }, 500);
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
function gantiTanggalRabHarian() {
  lapState.rh_tanggal = document.getElementById('rh-tanggal')?.value || '';
  lapState.rh_siklus_id = document.getElementById('rh-filter-siklus')?.value || '';
  showLap('rab-harian');
}

function gantiTanggalRhDiRab() {
  lapState.rab_rh_tanggal = document.getElementById('rab-rh-tanggal')?.value || '';
  showLap('rab');
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
  var confirmed = await showConfirm('Hitung ulang realisasi budget untuk periode <strong>' + periode + '</strong> dari data kas_bank?', 'Ya, Hitung', 'Batal', null, 'question');
  if (!confirmed) return;
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

// ── PM Harian editor (RAB per titik) ────────────────────────────────
async function loadPMEditor(tanggal) {
  var tbody = document.getElementById('pm-editor-tbody');
  var statusEl = document.getElementById('pm-editor-status');
  var t = tanggal || lapState.rab_pm_tanggal || new Date().toISOString().slice(0, 10);
  if (!tbody) return;
  tbody.innerHTML = '<tr><td class="px-3 py-6 text-center text-stone-400" colspan="4">Memuat...</td></tr>';
  var filterEl = document.getElementById('pm-search');
  if (filterEl) filterEl.value = '';
  try {
    var d = await api.get('/laporan/rab-pm-harian?tanggal=' + t);
    var rows = d.rows || [];
    var shown = rows.filter(function(r) {
      var q = (filterEl && filterEl.value || '').trim().toLowerCase();
      if (!q) return true;
      return (r.nama_titik || '').toLowerCase().indexOf(q) > -1 || (r.kategori_penerima || '').toLowerCase().indexOf(q) > -1;
    });
    window.__pm_rows = rows;
    tbody.innerHTML = renderPMRowsWithTotal(shown);
    pmAutoTotals();
    if (statusEl) statusEl.textContent = 'Snapshot utk ' + t;
    var countEl = document.getElementById('pm-editor-count');
    if (countEl) countEl.textContent = d.terisi + ' dari ' + d.total;
  } catch(e) {
    tbody.innerHTML = '<tr><td class="px-3 py-6 text-center text-red-500" colspan="4">Gagal memuat: ' + escHtml(e.message) + '</td></tr>';
  }
}

function pmRowsFiltered() {
  var rows = window.__pm_rows || [];
  var q = (document.getElementById('pm-search')?.value || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(function (r) {
    return (r.nama_titik || '').toLowerCase().indexOf(q) > -1 || (r.kategori_penerima || '').toLowerCase().indexOf(q) > -1;
  });
}

function filterPMMan() {
  var tbody = document.getElementById('pm-editor-tbody');
  if (!tbody) return;
  var shown = pmRowsFiltered();
  tbody.innerHTML = renderPMRowsWithTotal(shown);
  pmAutoTotals();
}

function renderPMRows(rows) {
  if (!rows.length) return '<tr><td class="px-3 py-6 text-center text-stone-400" colspan="4">Tidak ada titik yang cocok.</td></tr>';
  return rows.map(function(r) {
    return '<tr class="border-t border-stone-100">' +
      '<td class="px-3 py-2 font-semibold text-xs text-stone-800">' + escHtml(r.nama_titik) + (r.is_snapshot ? ' <span class="text-[9px] font-medium text-emerald-600 bg-emerald-50 rounded px-1 py-0.5">tersimpan</span>' : '') + '</td>' +
      '<td class="px-3 py-2 text-[11px] text-stone-500">' + escHtml(r.kategori_penerima || '-') + '</td>' +
      '<td class="px-2 py-1.5 text-right"><input type="number" min="0" step="1" data-k="' + r.penerima_manfaat_id + '" data-f="besar" value="' + r.paket_besar + '" oninput="pmAutoTotals()" class="inline-block w-20 text-right text-xs border border-stone-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"></td>' +
      '<td class="px-2 py-1.5 text-right"><input type="number" min="0" step="1" data-k="' + r.penerima_manfaat_id + '" data-f="kecil" value="' + r.paket_kecil + '" oninput="pmAutoTotals()" class="inline-block w-20 text-right text-xs border border-stone-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"></td>' +
    '</tr>';
  }).join('');
}

function renderPMRowsWithTotal(rows) {
  var besar = rows.reduce(function(s, r) { return s + (Number(r.paket_besar) || 0); }, 0);
  var kecil = rows.reduce(function(s, r) { return s + (Number(r.paket_kecil) || 0); }, 0);
  return renderPMRows(rows) +
    '<tr class="border-t-2 border-stone-300 bg-stone-50 font-bold text-stone-700">' +
      '<td class="px-3 py-2 text-xs" colspan="2">TOTAL (' + rows.length + ' titik)</td>' +
      '<td class="px-2 py-2 text-right text-xs" id="pm-total-besar">' + besar + '</td>' +
      '<td class="px-2 py-2 text-right text-xs" id="pm-total-kecil">' + kecil + '</td>' +
    '</tr>';
}

function pmAutoTotals() {
  var rows = window.__pm_rows || [];
  var besar = 0, kecil = 0;
  document.querySelectorAll('#pm-editor-tbody tr input[data-f]').forEach(function(inp) {
    if (inp.getAttribute('data-f') === 'besar') besar += parseInt(inp.value, 10) || 0;
    else kecil += parseInt(inp.value, 10) || 0;
  });
  var be = document.getElementById('pm-total-besar'); if (be) be.textContent = besar;
  var ke = document.getElementById('pm-total-kecil'); if (ke) ke.textContent = kecil;
}
function gantiTanggalPMMan() {
  var v = document.getElementById('rab-pm-tanggal')?.value || new Date().toISOString().slice(0, 10);
  lapState.rab_pm_tanggal = v;
  showLap('rab');
}
async function simpanPMMan() {
  var tanggal = document.getElementById('rab-pm-tanggal')?.value;
  if (!tanggal) { showAlert('Pilih tanggal terlebih dahulu', 'error'); return; }
  var rows = [];
  document.querySelectorAll('#pm-editor-tbody tr input[data-f]').forEach(function(inp) {
    var pid = parseInt(inp.getAttribute('data-k'), 10);
    var found = rows.find(function(x) { return x.penerima_manfaat_id === pid; });
    if (!found) { found = { penerima_manfaat_id: pid, paket_besar: 0, paket_kecil: 0 }; rows.push(found); }
    if (inp.getAttribute('data-f') === 'besar') found.paket_besar = parseInt(inp.value, 10) || 0;
    else found.paket_kecil = parseInt(inp.value, 10) || 0;
  });
  try {
    await api.post('/laporan/rab-pm-harian', { tanggal: tanggal, rows: rows });
    showAlert('✅ PM harian ' + tanggal + ' tersimpan (' + rows.length + ' titik)', 'success');
    showLap('rab');
  } catch(e) {
    showAlert('Gagal: ' + e.message, 'error');
  }
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
  // Hapus modal lama jika ada
  var old = document.getElementById('saldo-awal-modal');
  if (old) old.remove();

  var overlay = document.createElement('div');
  overlay.id = 'saldo-awal-modal';
  overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center';
  overlay.innerHTML =
    '<div class="absolute inset-0 bg-black/40 " onclick="tutupModalSaldoAwal()"></div>' +
    '<div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden transform transition-all duration-200 animate-in fade-in zoom-in-95">' +
      // Header
      '<div class="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">' +
            '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
          '</div>' +
          '<div>' +
            '<h3 class="text-sm font-bold text-white">Edit Saldo Awal</h3>' +
            '<p class="text-[11px] text-blue-100/80">Atur saldo awal buku kas</p>' +
          '</div>' +
        '</div>' +
        '<button onclick="tutupModalSaldoAwal()" class="absolute top-4 right-4 w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">' +
          '<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      // Body
      '<div class="px-6 py-5">' +
        '<label class="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">Saldo Awal (Rp)</label>' +
        '<div class="relative">' +
          '<div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">' +
            '<span class="text-stone-400 font-semibold text-sm">Rp</span>' +
          '</div>' +
          '<input id="saldo-awal-input" type="text" inputmode="numeric" class="w-full pl-10 pr-4 py-3 text-lg font-bold text-stone-800 bg-stone-50 border-2 border-stone-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none" value="' + fmtIDR(current).replace('Rp', '').trim() + '" onfocus="this.select()" oninput="formatSaldoAwalInput(this)">' +
        '</div>' +
        '<p class="text-[11px] text-stone-400 mt-2 flex items-center gap-1.5">' +
          '<svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' +
          'Masukkan jumlah saldo awal buku kas tanpa titik atau koma.' +
        '</p>' +
      '</div>' +
      // Footer
      '<div class="px-6 py-4 bg-stone-50/80 border-t border-stone-100 flex items-center justify-end gap-2.5">' +
        '<button onclick="tutupModalSaldoAwal()" class="px-4 py-2.5 text-xs font-medium text-stone-600 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors">Batal</button>' +
        '<button id="saldo-awal-simpan" onclick="simpanSaldoAwal()" class="px-5 py-2.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm flex items-center gap-1.5">' +
          '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' +
          'Simpan' +
        '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  // Focus input
  setTimeout(function() {
    var inp = document.getElementById('saldo-awal-input');
    if (inp) { inp.focus(); inp.select(); }
  }, 100);
}

function tutupModalSaldoAwal() {
  var el = document.getElementById('saldo-awal-modal');
  if (el) el.remove();
  document.body.style.overflow = '';
}

function formatSaldoAwalInput(inp) {
  var raw = inp.value.replace(/[^0-9]/g, '');
  inp.value = raw === '' ? '' : fmtIDR(parseInt(raw)).replace('Rp', '').trim();
}

function simpanSaldoAwal() {
  var inp = document.getElementById('saldo-awal-input');
  if (!inp) return;
  var raw = inp.value.replace(/[^0-9]/g, '');
  var val = parseFloat(raw);
  if (isNaN(val) || val < 0) {
    showAlert('Nilai tidak valid', 'error');
    return;
  }
  var btn = document.getElementById('saldo-awal-simpan');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg class="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg> Menyimpan...';
  }
  api.put('/keuangan/saldo-awal', { saldo_awal: val }).then(function(r) {
    if (r.ok) {
      showAlert('Saldo awal berhasil disimpan', 'success');
      tutupModalSaldoAwal();
      showLap('keuangan');
    }
  }).catch(function(e) {
    showAlert('Gagal: ' + e.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Simpan';
    }
  });
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
  const exportBtn = tab === 'rab' ? '' : `
    <div class="flex justify-end mb-3">
      <button onclick="exportXlsxLaporan('${tab}')" class="border border-stone-300 text-stone-700 hover:bg-stone-50 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-[11px] font-medium flex items-center gap-1.5">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Export XLSX
      </button>
    </div>`;
  c.innerHTML = exportBtn + '<div id="lap-content"></div>';
  showLap(tab);
}
function renderLapRab() { renderReportPage('rab'); }
function renderLapRabBulanan() { renderReportPage('rab-bulanan'); }
function renderLapPersediaan() { renderReportPage('persediaan'); }
function renderLapDistribusi() { renderReportPage('distribusi'); }
function renderLapKeuangan() { renderReportPage('keuangan'); }
function renderLapPengeluaranBulanan() { renderReportPage('pengeluaran-bulanan'); }
function renderLapPenggunaanAnggaran() {
  const c = document.getElementById('content');
  c.innerHTML = '<div id="lap-content"></div>';
  showLap('penggunaan-anggaran');
}
function renderLapBpKas() { renderReportPage('bp-kas'); }
function renderLapSiklus() { renderReportPage('siklus'); }
function renderLapPembelian() { renderReportPage('pembelian'); }
function renderLapPenerimaan() { renderReportPage('penerimaan'); }
function renderLapMutasi() { renderReportPage('mutasi'); }
function renderLapProduksi() { renderReportPage('produksi'); }
function renderLapPayroll() { renderReportPage('payroll'); }
function renderLapPayrollMingguan() { renderReportPage('payroll-mingguan'); }
function renderLapLabaRugi() { renderReportPage('laba-rugi'); }
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
