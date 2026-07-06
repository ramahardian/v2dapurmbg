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

  let html = `
  <div class="mb-4 flex flex-wrap items-end gap-3">
    <div>
      <label class="block text-xs font-medium text-stone-500 mb-1">Bulan</label>
      <select id="bp-bulan" class="border border-stone-200 rounded-md px-3 py-2 text-sm">
        ${months.map(m => `<option value="${m.v}" ${m.v === bln ? 'selected' : ''}>${m.l}</option>`).join('')}
      </select>
    </div>
    <div>
      <label class="block text-xs font-medium text-stone-500 mb-1">Tahun</label>
      <select id="bp-tahun" class="border border-stone-200 rounded-md px-3 py-2 text-sm">
        ${years.map(y => `<option value="${y}" ${String(y) === thn ? 'selected' : ''}>${y}</option>`).join('')}
      </select>
    </div>
    <div>
      <button onclick="filterBpOperasional()" class="bg-[#1e40af] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-md text-sm font-medium">Tampilkan</button>
    </div>
  </div>`;

  // Stat cards
  const totalMasuk = d.total_masuk || 0;
  const totalKeluar = d.total_keluar || 0;
  const saldoAkhir = d.saldo_awal + totalMasuk - totalKeluar;

  html += `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
    <div class="bg-white border border-stone-200 rounded-lg p-4">
      <div class="text-xs uppercase tracking-wider text-stone-500 font-medium">Saldo Awal</div>
      <div class="mono text-lg font-semibold mt-1">${fmtIDR(d.saldo_awal)}</div>
    </div>
    <div class="bg-white border border-stone-200 rounded-lg p-4 bg-blue-50 border-0 rounded-xl">
      <div class="text-xs uppercase tracking-wider text-stone-500 font-medium">Total Masuk</div>
      <div class="mono text-lg font-semibold mt-1 text-blue-700">${fmtIDR(totalMasuk)}</div>
    </div>
    <div class="bg-white border border-stone-200 rounded-lg p-4 bg-orange-50 border-0 rounded-xl">
      <div class="text-xs uppercase tracking-wider text-stone-500 font-medium">Total Keluar</div>
      <div class="mono text-lg font-semibold mt-1 text-orange-700">${fmtIDR(totalKeluar)}</div>
    </div>
    <div class="bg-white border border-stone-200 rounded-lg p-4 bg-emerald-50 border-0 rounded-xl">
      <div class="text-xs uppercase tracking-wider text-stone-500 font-medium">Saldo Akhir</div>
      <div class="mono text-lg font-semibold mt-1 text-emerald-700">${fmtIDR(saldoAkhir)}</div>
    </div>
  </div>`;

  // Export button
  html += `<div class="flex justify-end mb-3">
    <button onclick="exportBpOperasional()" class="border border-stone-300 text-stone-700 hover:bg-stone-50 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      Export XLSX
    </button>
  </div>`;

  // Periode info
  const monthLabel = months.find(m => m.v === bln)?.l || bln;
  html += `<div class="text-sm text-stone-500 mb-3 font-medium">Periode: ${monthLabel} ${thn}</div>`;

  // Tabel per akun
  const akunData = d.akun_data || [];
  html += `<div class="bg-white border border-stone-200 rounded-lg overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-stone-50">
          <tr>
            <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Kode</th>
            <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Nama Akun</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Saldo Awal</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Debit (Masuk)</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Kredit (Keluar)</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Saldo Akhir</th>
            <th class="text-center px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap"></th>
          </tr>
        </thead>
        <tbody>`;

  if (!akunData.length) {
    html += `<tr><td colspan="7" class="text-center py-12 text-stone-400">
      <svg class="w-12 h-12 mx-auto mb-2 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg>
      <div class="text-sm">Belum ada transaksi operasional periode ini</div>
    </td></tr>`;
  }

  for (const akun of akunData) {
    const isExpanded = bpState.expandedAkun === akun.akun_id;
    const saldoAkunAkhir = akun.saldo_akhir;
    html += `<tr class="border-t border-stone-100 ${isExpanded ? 'bg-blue-50' : 'hover:bg-stone-50'}">
      <td class="px-4 py-3 font-mono text-xs">${akun.akun_kode}</td>
      <td class="px-4 py-3 font-medium">${akun.akun_nama}</td>
      <td class="px-4 py-3 text-right font-mono text-sm">${fmtIDR(akun.saldo_awal)}</td>
      <td class="px-4 py-3 text-right font-mono text-sm text-blue-600">${fmtIDR(akun.total_masuk)}</td>
      <td class="px-4 py-3 text-right font-mono text-sm text-orange-600">${fmtIDR(akun.total_keluar)}</td>
      <td class="px-4 py-3 text-right font-mono text-sm font-semibold ${saldoAkunAkhir >= 0 ? 'text-emerald-600' : 'text-red-600'}">${fmtIDR(saldoAkunAkhir)}</td>
      <td class="px-4 py-3 text-center">
        <button onclick="toggleBpDetail('${akun.akun_id}')" class="text-xs text-blue-600 hover:text-blue-800 underline">
          ${isExpanded ? 'Sembunyikan' : 'Detail (' + akun.transaksi.length + ')'}
        </button>
      </td>
    </tr>`;

    if (isExpanded && akun.transaksi.length) {
      html += `<tr><td colspan="7" class="px-4 pb-3">
        <div class="bg-stone-50 rounded-lg p-3 ml-8">
          <table class="w-full text-xs">
            <thead>
              <tr class="text-stone-500">
                <th class="text-left px-2 py-1 font-medium">Tanggal</th>
                <th class="text-left px-2 py-1 font-medium">No Transaksi</th>
                <th class="text-left px-2 py-1 font-medium">Kategori</th>
                <th class="text-left px-2 py-1 font-medium">Deskripsi</th>
                <th class="text-right px-2 py-1 font-medium">Jumlah</th>
              </tr>
            </thead>
            <tbody>`;
      for (const trx of akun.transaksi) {
        const isMasuk = trx.tipe === 'masuk';
        html += `<tr class="border-t border-stone-200">
          <td class="px-2 py-1.5">${fmtDate(trx.tanggal)}</td>
          <td class="px-2 py-1.5">${trx.no_transaksi || '-'}</td>
          <td class="px-2 py-1.5">${trx.kategori || '-'}</td>
          <td class="px-2 py-1.5">${trx.deskripsi || '-'}</td>
          <td class="px-2 py-1.5 text-right font-mono ${isMasuk ? 'text-blue-600' : 'text-orange-600'}">${isMasuk ? '' : '-'}${fmtIDR(trx.jumlah)}</td>
        </tr>`;
      }
      html += `</tbody></table></div></td></tr>`;
    }
  }

  // Total row
  if (akunData.length) {
    const totalSaldoAwal = akunData.reduce((s, a) => s + a.saldo_awal, 0);
    const totalSaldoAkhir = akunData.reduce((s, a) => s + a.saldo_akhir, 0);
    html += `<tr class="border-t-2 border-stone-300 bg-stone-50 font-semibold">
      <td colspan="2" class="px-4 py-3 text-sm">TOTAL</td>
      <td class="px-4 py-3 text-right font-mono text-sm">${fmtIDR(totalSaldoAwal)}</td>
      <td class="px-4 py-3 text-right font-mono text-sm text-blue-600">${fmtIDR(totalMasuk)}</td>
      <td class="px-4 py-3 text-right font-mono text-sm text-orange-600">${fmtIDR(totalKeluar)}</td>
      <td class="px-4 py-3 text-right font-mono text-sm font-bold ${totalSaldoAkhir >= 0 ? 'text-emerald-600' : 'text-red-600'}">${fmtIDR(totalSaldoAkhir)}</td>
      <td></td>
    </tr>`;
  }

  html += `</tbody></table></div></div>`;

  // Daftar akun BP Operasional yang terdaftar
  if (d.akun_list && d.akun_list.length) {
    html += `<div class="mt-6 bg-white border border-stone-200 rounded-lg p-4">
      <div class="text-sm font-semibold mb-2">Akun dengan BP Operasional (${d.akun_list.length})</div>
      <div class="flex flex-wrap gap-2">
        ${d.akun_list.map(a => `<span class="text-xs bg-stone-100 text-stone-700 px-2 py-1 rounded">${a.kode} - ${a.nama}</span>`).join('')}
      </div>
    </div>`;
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
