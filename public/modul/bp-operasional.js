let bpState = { bulan: '', tahun: '', expandedAkun: null };

async function renderBpOperasional() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';

  try {
    const now = new Date();
    const bln = bpState.bulan || String(now.getMonth() + 1).padStart(2, '0');
    const thn = bpState.tahun || String(now.getFullYear());

    const r = await api.get(`/laporan/bp-operasional?bulan=${bln}&tahun=${thn}`);
    window._bpData = r;

    renderBpPage(r);
  } catch (err) {
    console.error('BP Operasional error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat data: ${err.message}</div>`;
  }
}

function renderBpPage(d) {
  const c = document.getElementById('content');
  const now = new Date();
  const bln = bpState.bulan || String(now.getMonth() + 1).padStart(2, '0');
  const thn = bpState.tahun || String(now.getFullYear());

  const months = [
    { v: '01', l: 'Januari' }, { v: '02', l: 'Februari' }, { v: '03', l: 'Maret' },
    { v: '04', l: 'April' }, { v: '05', l: 'Mei' }, { v: '06', l: 'Juni' },
    { v: '07', l: 'Juli' }, { v: '08', l: 'Agustus' }, { v: '09', l: 'September' },
    { v: '10', l: 'Oktober' }, { v: '11', l: 'November' }, { v: '12', l: 'Desember' },
  ];
  const currentYear = now.getFullYear();
  const years = [];
  for (let y = currentYear; y >= currentYear - 5; y--) years.push(y);

  const monthLabel = months.find(m => m.v === bln)?.l || bln;

  const totalMasuk = d.total_masuk || 0;
  const totalKeluar = d.total_keluar || 0;
  const saldoAkhir = d.saldo_awal + totalMasuk - totalKeluar;

  let html =
    '<div class="flex items-center gap-3 mb-4"><div class="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center shadow-sm"><svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="9" y1="12" x2="15" y2="12"/></svg></div><div><h2 class="text-sm font-bold text-stone-800">Buku Pembantu Operasional</h2><p class="text-xs text-stone-500">' + monthLabel + ' ' + thn + '</p></div></div>' +

    // Filter bar
    '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 mb-4">' +
    '<div class="flex flex-wrap items-center gap-3">' +
      '<div class="flex items-center gap-2">' +
        '<svg class="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>' +
        '<select id="bp-bulan" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
        months.map(m => '<option value="' + m.v + '" ' + (m.v === bln ? 'selected' : '') + '>' + m.l.substring(0,3) + '</option>').join('') +
        '</select>' +
        '<select id="bp-tahun" class="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
        years.map(y => '<option value="' + y + '" ' + (String(y) === thn ? 'selected' : '') + '>' + y + '</option>').join('') +
        '</select>' +
      '</div>' +
      '<button onclick="filterBpOperasional()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm flex items-center gap-1.5"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Tampilkan</button>' +
    '</div></div>' +

    // Stat cards
    '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">' +
    '<div class="bg-gradient-to-br from-stone-50 to-stone-100/60 rounded-2xl border border-stone-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-stone-600">Saldo Awal</span><svg class="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="text-lg font-bold text-stone-800">' + fmtIDR(d.saldo_awal) + '</div></div>' +
    '<div class="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Total Masuk</span><svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></div><div class="text-lg font-bold text-blue-800">' + fmtIDR(totalMasuk) + '</div></div>' +
    '<div class="bg-gradient-to-br from-orange-50 to-orange-100/60 rounded-2xl border border-orange-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-orange-700">Total Keluar</span><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/></svg></div><div class="text-lg font-bold text-orange-800">' + fmtIDR(totalKeluar) + '</div></div>' +
    '<div class="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 p-4 shadow-sm"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Saldo Akhir</span><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="text-lg font-bold text-emerald-800">' + fmtIDR(saldoAkhir) + '</div><div class="text-[10px] text-emerald-600/70">' + monthLabel + ' ' + thn + '</div></div>' +
    '</div>' +

    // Export button
    '<div class="flex justify-end mb-3">' +
    '<button onclick="exportBpOperasional()" class="border border-stone-300 text-stone-700 hover:bg-stone-50 px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors">' +
    '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
    'Export XLSX</button></div>' +

    // Tabel per akun
    '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden"><div class="overflow-x-auto">' +
    '<table class="w-full text-[11px]"><thead class="bg-stone-50">' +
    '<tr>' +
    '<th class="text-left px-3 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider whitespace-nowrap border-r border-stone-200">Kode</th>' +
    '<th class="text-left px-3 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider whitespace-nowrap border-r border-stone-200">Nama Akun</th>' +
    '<th class="text-right px-3 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider whitespace-nowrap border-r border-stone-200">Saldo Awal</th>' +
    '<th class="text-right px-3 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider whitespace-nowrap border-r border-stone-200">Debit (Masuk)</th>' +
    '<th class="text-right px-3 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider whitespace-nowrap border-r border-stone-200">Kredit (Keluar)</th>' +
    '<th class="text-right px-3 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider whitespace-nowrap">Saldo Akhir</th>' +
    '<th class="text-center px-3 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider whitespace-nowrap"></th>' +
    '</tr></thead><tbody>';

  const akunData = d.akun_data || [];

  if (!akunData.length) {
    html += '<tr><td colspan="7" class="text-center py-12 text-stone-400">' +
      '<svg class="w-12 h-12 mx-auto mb-2 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg>' +
      '<div class="text-sm">Belum ada transaksi operasional periode ini</div>' +
    '</td></tr>';
  }

  for (const akun of akunData) {
    const isExpanded = bpState.expandedAkun === akun.akun_id;
    const saldoAkunAkhir = akun.saldo_akhir;
    html += '<tr class="border-t border-stone-100 ' + (isExpanded ? 'bg-blue-50/50' : 'hover:bg-stone-50') + '">' +
      '<td class="px-3 py-2 font-mono text-xs border-r border-stone-100">' + akun.akun_kode + '</td>' +
      '<td class="px-3 py-2 font-medium text-xs border-r border-stone-100">' + akun.akun_nama + '</td>' +
      '<td class="px-3 py-2 text-right font-mono text-xs border-r border-stone-100">' + fmtIDR(akun.saldo_awal) + '</td>' +
      '<td class="px-3 py-2 text-right font-mono text-xs text-blue-600 border-r border-stone-100">' + fmtIDR(akun.total_masuk) + '</td>' +
      '<td class="px-3 py-2 text-right font-mono text-xs text-orange-600 border-r border-stone-100">' + fmtIDR(akun.total_keluar) + '</td>' +
      '<td class="px-3 py-2 text-right font-mono text-xs font-semibold ' + (saldoAkunAkhir >= 0 ? 'text-emerald-600' : 'text-red-600') + '">' + fmtIDR(saldoAkunAkhir) + '</td>' +
      '<td class="px-3 py-2 text-center">' +
        '<button onclick="toggleBpDetail(\'' + akun.akun_id + '\')" class="text-[10px] text-blue-600 hover:text-blue-800 font-medium underline">' +
          (isExpanded ? 'Sembunyikan' : 'Detail (' + akun.transaksi.length + ')') +
        '</button>' +
      '</td>' +
    '</tr>';

    if (isExpanded && akun.transaksi.length) {
      html += '<tr><td colspan="7" class="px-3 pb-3"><div class="bg-stone-50 rounded-xl p-3 ml-6 border border-stone-200">' +
        '<table class="w-full text-[10px]"><thead><tr class="text-stone-500 font-medium">' +
        '<th class="text-left px-2 py-1">Tanggal</th>' +
        '<th class="text-left px-2 py-1">No Transaksi</th>' +
        '<th class="text-left px-2 py-1">Kategori</th>' +
        '<th class="text-left px-2 py-1">Deskripsi</th>' +
        '<th class="text-right px-2 py-1">Jumlah</th>' +
        '</tr></thead><tbody>';
      for (const trx of akun.transaksi) {
        const isMasuk = trx.tipe === 'masuk';
        html += '<tr class="border-t border-stone-200">' +
          '<td class="px-2 py-1.5">' + fmtDate(trx.tanggal) + '</td>' +
          '<td class="px-2 py-1.5">' + (trx.no_transaksi || '-') + '</td>' +
          '<td class="px-2 py-1.5">' + (trx.kategori || '-') + '</td>' +
          '<td class="px-2 py-1.5">' + (trx.deskripsi || '-') + '</td>' +
          '<td class="px-2 py-1.5 text-right font-mono ' + (isMasuk ? 'text-blue-600' : 'text-orange-600') + '">' + (isMasuk ? '' : '-') + fmtIDR(trx.jumlah) + '</td>' +
        '</tr>';
      }
      html += '</tbody></table></div></td></tr>';
    }
  }

  // Total row
  if (akunData.length) {
    const totalSaldoAwal = akunData.reduce((s, a) => s + a.saldo_awal, 0);
    const totalSaldoAkhir = akunData.reduce((s, a) => s + a.saldo_akhir, 0);
    html += '</tbody><tfoot><tr class="bg-gradient-to-r from-stone-50 to-stone-100/80 font-semibold border-t-2 border-stone-200">' +
      '<td colspan="2" class="px-3 py-2.5 text-xs text-stone-600">TOTAL</td>' +
      '<td class="px-3 py-2.5 text-right font-mono text-xs text-stone-800">' + fmtIDR(totalSaldoAwal) + '</td>' +
      '<td class="px-3 py-2.5 text-right font-mono text-xs text-blue-700">' + fmtIDR(totalMasuk) + '</td>' +
      '<td class="px-3 py-2.5 text-right font-mono text-xs text-orange-700">' + fmtIDR(totalKeluar) + '</td>' +
      '<td class="px-3 py-2.5 text-right font-mono text-xs font-bold ' + (totalSaldoAkhir >= 0 ? 'text-emerald-700' : 'text-red-700') + '">' + fmtIDR(totalSaldoAkhir) + '</td>' +
      '<td></td>' +
    '</tr></tfoot>';
  }

  html += '</tbody></table></div></div>';

  // Daftar akun BP Operasional yang terdaftar
  if (d.akun_list && d.akun_list.length) {
    html += '<div class="mt-4 bg-white rounded-2xl border border-stone-200 shadow-sm p-4">' +
      '<div class="text-xs font-bold text-stone-600 uppercase tracking-wider mb-2">Akun BP Operasional (' + d.akun_list.length + ')</div>' +
      '<div class="flex flex-wrap gap-1.5">' +
        d.akun_list.map(a => '<span class="text-[10px] bg-stone-100 text-stone-700 px-2 py-1 rounded-md border border-stone-200">' + a.kode + ' — ' + a.nama + '</span>').join('') +
      '</div>' +
    '</div>';
  }

  c.innerHTML = html;
}

function toggleBpDetail(akunId) {
  bpState.expandedAkun = bpState.expandedAkun === akunId ? null : akunId;
  renderBpPage(window._bpData);
}

function filterBpOperasional() {
  bpState.bulan = document.getElementById('bp-bulan').value;
  bpState.tahun = document.getElementById('bp-tahun').value;
  bpState.expandedAkun = null;
  renderBpOperasional();
}

function exportBpOperasional() {
  const d = window._bpData;
  if (!d || !d.akun_data || !d.akun_data.length) return showAlert('Tidak ada data', 'warning');

  const data = [];
  for (const akun of d.akun_data) {
    if (akun.transaksi.length) {
      for (const trx of akun.transaksi) {
        data.push({
          'Kode Akun': akun.akun_kode,
          'Nama Akun': akun.akun_nama,
          'Tanggal': trx.tanggal,
          'No Transaksi': trx.no_transaksi || '',
          'Tipe': trx.tipe === 'masuk' ? 'Masuk' : 'Keluar',
          'Kategori': trx.kategori || '',
          'Deskripsi': trx.deskripsi || '',
          'Jumlah': trx.jumlah,
        });
      }
    } else {
      data.push({
        'Kode Akun': akun.akun_kode,
        'Nama Akun': akun.akun_nama,
        'Tanggal': '',
        'No Transaksi': '',
        'Tipe': '',
        'Kategori': '',
        'Deskripsi': 'Tidak ada transaksi',
        'Jumlah': 0,
      });
    }
  }

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BP Operasional');
  XLSX.writeFile(wb, `bp-operasional-${d.periode}.xlsx`);
}
