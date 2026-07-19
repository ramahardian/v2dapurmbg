async function renderDashboard() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
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

/**
 * renderDashboardKeuangan - Dashboard Keuangan
 * Menampilkan ringkasan keuangan: saldo kas, pendapatan/biaya bulan ini, transaksi terbaru
 */
async function renderDashboardKeuangan() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-8 w-8 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';

  try {
    const d = await api.get('/dashboard/finance');

    const fmtIDR = (v) => 'Rp' + Number(v || 0).toLocaleString('id-ID');
    const fmtNum = (v) => Number(v || 0).toLocaleString('id-ID');
    const fmtDate = (s) => {
      if (!s) return '-';
      const d = new Date(s);
      return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    // Helper untuk badge growth
    const growthBadge = (pct) => {
      if (pct === null) return '<span class="text-[10px] text-stone-400">—</span>';
      const isPos = pct >= 0;
      return `<span class="text-[10px] font-medium ${isPos ? 'text-emerald-600' : 'text-red-600'}">${isPos ? '↑' : '↓'} ${Math.abs(pct)}%</span>`;
    };

    const labaClass = d.laba_rugi >= 0 ? 'text-emerald-600' : 'text-red-600';
    const labaLabel = d.laba_rugi >= 0 ? 'Laba' : 'Rugi';

    // Stat cards
    let html = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <div class="bg-white border border-stone-200 rounded-xl p-4 sm:p-5">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div class="text-[11px] uppercase tracking-wider font-medium text-stone-500">Saldo Kas</div>
        </div>
        <div class="mono text-xl sm:text-2xl font-bold">${fmtIDR(d.saldo_kas)}</div>
      </div>
      <div class="bg-white border border-stone-200 rounded-xl p-4 sm:p-5">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 19V5m0 0l-7 7m7-7l7 7"/></svg>
          </div>
          <div class="text-[11px] uppercase tracking-wider font-medium text-stone-500">Pendapatan Bulan Ini</div>
        </div>
        <div class="mono text-xl sm:text-2xl font-bold">${fmtIDR(d.pendapatan_bulan_ini)}</div>
        <div class="mt-1">${growthBadge(d.pendapatan_growth)} <span class="text-[10px] text-stone-400">vs bulan lalu</span></div>
      </div>
      <div class="bg-white border border-stone-200 rounded-xl p-4 sm:p-5">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 5v14m0 0l7-7m-7 7l-7-7"/></svg>
          </div>
          <div class="text-[11px] uppercase tracking-wider font-medium text-stone-500">Biaya Bulan Ini</div>
        </div>
        <div class="mono text-xl sm:text-2xl font-bold">${fmtIDR(d.biaya_bulan_ini)}</div>
        <div class="mt-1">${growthBadge(d.biaya_growth)} <span class="text-[10px] text-stone-400">vs bulan lalu</span></div>
      </div>
      <div class="bg-white border border-stone-200 rounded-xl p-4 sm:p-5">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-8 h-8 rounded-lg ${labaClass.replace('text-', 'bg-').replace('600', '100')} flex items-center justify-center shrink-0">
            <svg class="w-4 h-4 ${labaClass}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div class="text-[11px] uppercase tracking-wider font-medium text-stone-500">${labaLabel} Bulan Ini</div>
        </div>
        <div class="mono text-xl sm:text-2xl font-bold ${labaClass}">${fmtIDR(Math.abs(d.laba_rugi))}</div>
        <div class="mt-1"><span class="text-[10px] text-stone-500">Margin: ${d.margin}%</span></div>
      </div>
    </div>`;

    // Low stock alert
    if (d.stok_menipis > 0) {
      html += `
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center gap-3">
        <div class="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
          <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
        </div>
        <div class="text-sm">
          <span class="font-semibold text-amber-800">${d.stok_menipis} bahan baku</span>
          <span class="text-amber-700">dengan stok menipis. </span>
          <a href="/gudang" data-key="gudang" class="font-medium text-amber-800 underline hover:no-underline">Cek Gudang →</a>
        </div>
      </div>`;
    }

    // Recent transactions table
    const transaksi = d.transaksi_terbaru || [];
    html += `
    <div class="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <div class="px-4 sm:px-5 py-3 sm:py-4 border-b border-stone-200 flex items-center justify-between">
        <h3 class="font-bold text-sm">Transaksi Terbaru</h3>
        <span class="text-[10px] text-stone-500">${d.bulan}/${d.tahun}</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="bg-stone-50">
              <th class="text-left px-3 sm:px-4 py-2.5 text-[10px] font-semibold text-stone-500">Tanggal</th>
              <th class="text-left px-3 sm:px-4 py-2.5 text-[10px] font-semibold text-stone-500">Tipe</th>
              <th class="text-left px-3 sm:px-4 py-2.5 text-[10px] font-semibold text-stone-500">Kategori</th>
              <th class="text-left px-3 sm:px-4 py-2.5 text-[10px] font-semibold text-stone-500">Deskripsi</th>
              <th class="text-right px-3 sm:px-4 py-2.5 text-[10px] font-semibold text-stone-500">Jumlah</th>
            </tr>
          </thead>
          <tbody>`;

    if (transaksi.length === 0) {
      html += '<tr><td colspan="5" class="text-center py-8 text-stone-400">Belum ada transaksi</td></tr>';
    } else {
      transaksi.forEach(t => {
        const tipeClass = t.tipe === 'masuk' ? 'text-emerald-600' : 'text-red-600';
        html += `
          <tr class="border-t border-stone-100 hover:bg-stone-50 transition-colors">
            <td class="px-3 sm:px-4 py-2.5 mono text-[10px]">${fmtDate(t.tanggal)}</td>
            <td class="px-3 sm:px-4 py-2.5">
              <span class="badge ${tipeClass === 'text-emerald-600' ? 'badge-hadir' : 'badge-alpha'}">${t.tipe}</span>
            </td>
            <td class="px-3 sm:px-4 py-2.5">${t.kategori || '-'}</td>
            <td class="px-3 sm:px-4 py-2.5 max-w-[200px] truncate">${escHtml(t.deskripsi || '-')}</td>
            <td class="px-3 sm:px-4 py-2.5 text-right mono font-medium ${tipeClass}">${fmtIDR(t.jumlah)}</td>
          </tr>`;
      });
    }

    html += `
          </tbody>
        </table>
      </div>
    </div>`;

    c.innerHTML = html;
  } catch (err) {
    console.error('Dashboard Keuangan error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat dashboard keuangan: ${err.message}</div>`;
  }
}
