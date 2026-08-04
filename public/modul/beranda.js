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
    animateDashboardCounts(c);
    loadOnlineUsers();
    startOnlineUsersAutoRefresh();
  } catch (err) {
    console.error('Dashboard error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat dashboard: ${err.message}</div>`;
  }
}

/**
 * animateDashboardCounts - Animasi count-up untuk elemen dengan class .dash-count.
 * Mendukung format angka default dan format Rupiah (data-format="idr").
 */
function animateDashboardCounts(root) {
  const els = root.querySelectorAll('.dash-count');
  els.forEach(el => {
    const target = parseFloat(el.getAttribute('data-count')) || 0;
    const isIdr = el.getAttribute('data-format') === 'idr';
    const dur = 900;
    const start = performance.now();
    const fmt = (v) => {
      const n = Math.round(v);
      const s = n.toLocaleString('id-ID');
      return isIdr ? 'Rp ' + s : s;
    };
    el.textContent = fmt(0);
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
  * exportDashboardRabHarian - Export RAB Harian (XLSX) dari dashboard admin.
  * Mengunduh /api/laporan/rab-harian/export?tanggal=YYYY-MM-DD&tanggal_sampai=YYYY-MM-DD.
  */
function exportDashboardRabHarian() {
  const tgl = (document.getElementById('dash-rh-tanggal') || {}).value || '';
  const tglSampai = (document.getElementById('dash-rh-tanggal-sampai') || {}).value || '';
  if (!tgl) { showAlert('Pilih tanggal RAB Harian terlebih dahulu', 'warning'); return; }
  if (tglSampai && tglSampai < tgl) {
    showAlert('Tanggal akhir tidak boleh lebih awal dari tanggal mulai', 'warning');
    return;
  }

  // Check if there's data for the selected date(s)
  checkRabDataExists(tgl, tglSampai).then(hasData => {
    if (!hasData) {
      showAlert('Tidak ada data RAB untuk tanggal yang dipilih', 'warning');
      // Optional: Check accountant and nutritionist permissions
      if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'keuangan')) {
        checkProfessionalAccess().then(access => {
          if (!access.hasAnyData) {
            showProfessionalWarning(access);
          }
        });
      }
      return;
    }
    let url = '/api/laporan/rab-harian/export?tanggal=' + encodeURIComponent(tgl);
    if (tglSampai) url += '&tanggal_sampai=' + encodeURIComponent(tglSampai);
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showAlert('Export RAB Harian diproses, file akan terunduh', 'info');
  }).catch(err => {
    console.error('Error checking RAB data:', err);
    showAlert('Gagal memeriksa data RAB: ' + err.message, 'error');
  });
}

async function checkRabDataExists(startDate, endDate) {
  try {
    let url = '/api/laporan/rab-harian/check?tanggal=' + encodeURIComponent(startDate);
    if (endDate) url += '&tanggal_sampai=' + encodeURIComponent(endDate);
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return false;
    const data = await res.json();
    return data.hasData || false;
  } catch (err) {
    console.error('Error checking RAB data:', err);
    return false;
  }
}

async function checkProfessionalAccess() {
  try {
    // Check if accountant has data
    const accountantRes = await fetch('/api/laporan/rab-harian/check-akuntan', { credentials: 'include' });
    const accountantData = await accountantRes.json() || {};

    // Check if nutritionist has data
    const giziRes = await fetch('/api/laporan/rab-harian/check-ahli-gizi', { credentials: 'include' });
    const giziData = await giziRes.json() || {};

    return {
      hasAnyData: (accountantData.hasData || false) || (giziData.hasData || false),
      accountantData: accountantData,
      giziData: giziData
    };
  } catch (err) {
    console.error('Error checking professional access:', err);
    return { hasAnyData: false };
  }
}

function showProfessionalWarning(access) {
  let warningMsg = 'Tidak ada data RAB untuk tanggal yang dipilih';
  if (access.accountantData && access.accountantData.warning) {
    warningMsg += '\n';
    warningMsg += 'Perhatian Akuntan: ' + access.accountantData.warning;
  }
  if (access.giziData && access.giziData.warning) {
    warningMsg += '\n';
    warningMsg += 'Perhatian Ahli Gizi: ' + access.giziData.warning;
  }
  showAlert(warningMsg, 'warning');
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
    const statCards = [
      { label: 'Saldo Kas', value: fmtIDR(d.saldo_kas), gradient: 'from-emerald-50 to-emerald-100/60', border: 'border-emerald-200/60', icon: 'circle', iconColor: 'text-emerald-500', textColor: 'text-emerald-800', extra: '' },
      { label: 'Pendapatan Bulan Ini', value: fmtIDR(d.pendapatan_bulan_ini), gradient: 'from-blue-50 to-blue-100/60', border: 'border-blue-200/60', icon: 'arrow-up', iconColor: 'text-blue-500', textColor: 'text-blue-800', extra: `${growthBadge(d.pendapatan_growth)} <span class="text-[10px] text-stone-400">vs bulan lalu</span>` },
      { label: 'Biaya Bulan Ini', value: fmtIDR(d.biaya_bulan_ini), gradient: 'from-orange-50 to-orange-100/60', border: 'border-orange-200/60', icon: 'arrow-down', iconColor: 'text-orange-500', textColor: 'text-orange-800', extra: `${growthBadge(d.biaya_growth)} <span class="text-[10px] text-stone-400">vs bulan lalu</span>` },
      { label: `${labaLabel} Bulan Ini`, value: fmtIDR(Math.abs(d.laba_rugi)), gradient: d.laba_rugi >= 0 ? 'from-emerald-50 to-emerald-100/60' : 'from-red-50 to-red-100/60', border: d.laba_rugi >= 0 ? 'border-emerald-200/60' : 'border-red-200/60', icon: 'dollar', iconColor: labaClass, textColor: labaClass, extra: `<span class="text-[10px] text-stone-500">Margin: ${d.margin}%</span>` },
    ];
    let html = `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">`;
    statCards.forEach(c => {
      const iconSvg = {
        'circle': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
        'arrow-up': '<path d="M12 19V5m0 0l-7 7m7-7l7 7"/>',
        'arrow-down': '<path d="M12 5v14m0 0l7-7m-7 7l-7-7"/>',
        'dollar': '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
      }[c.icon];
      html += `
      <div class="bg-gradient-to-br ${c.gradient} rounded-2xl border ${c.border} p-4 sm:p-5 shadow-sm">
        <div class="flex items-center justify-between mb-2">
          <span class="text-[10px] font-semibold uppercase tracking-wider ${c.textColor}">${c.label}</span>
          <svg class="w-4 h-4 ${c.iconColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">${iconSvg}</svg>
        </div>
        <div class="mono text-xl sm:text-2xl font-bold ${c.textColor}">${c.value}</div>
        ${c.extra ? `<div class="mt-1">${c.extra}</div>` : ''}
      </div>`;
    });
    html += `</div>`;

    // Low stock alert
    if (d.stok_menipis > 0) {
      html += `
      <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-center gap-3 shadow-sm">
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
    <div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
      <div class="px-4 sm:px-5 py-3 sm:py-4 border-b border-stone-200 flex items-center justify-between">
        <h3 class="font-bold text-sm text-stone-800">Transaksi Terbaru</h3>
        <span class="text-[10px] font-medium text-stone-500">${d.bulan}/${d.tahun}</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-stone-100">
              <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Tanggal</th>
              <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Tipe</th>
              <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Kategori</th>
              <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Deskripsi</th>
              <th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Jumlah</th>
            </tr>
          </thead>
          <tbody>`;

    if (transaksi.length === 0) {
      html += '<tr><td colspan="5" class="text-center py-12 text-stone-400">Belum ada transaksi</td></tr>';
    } else {
      transaksi.forEach(t => {
        const isMasuk = t.tipe === 'masuk';
        const tipeClass = isMasuk ? 'text-emerald-600' : 'text-red-600';
        const badgeBg = isMasuk ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700';
        html += `
          <tr class="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
            <td class="px-4 py-3 mono text-[10px] text-stone-600">${fmtDate(t.tanggal)}</td>
            <td class="px-4 py-3">
              <span class="inline-block px-2.5 py-0.5 text-[10px] font-semibold rounded-lg ${badgeBg}">${t.tipe}</span>
            </td>
            <td class="px-4 py-3 text-xs text-stone-600">${t.kategori || '-'}</td>
            <td class="px-4 py-3 text-xs text-stone-600 max-w-[200px] truncate">${escHtml(t.deskripsi || '-')}</td>
            <td class="px-4 py-3 text-right mono text-xs font-semibold ${tipeClass}">${fmtIDR(t.jumlah)}</td>
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

let onlineUsersRefreshInterval = null;

async function loadOnlineUsers() {
  try {
    const r = await fetch('/api/dashboard/online-users', { credentials: 'include' });
    if (!r.ok) throw new Error('Failed to fetch');
    const data = await r.json();
    
    const countEl = document.getElementById('online-count');
    const listEl = document.getElementById('online-users-list');
    
    if (countEl) countEl.textContent = data.count + ' user';
    
    if (!data.users || data.users.length === 0) {
      if (listEl) listEl.innerHTML = '<div class="text-sm text-stone-400 text-center py-4">Tidak ada user online</div>';
      return;
    }
    
    if (listEl) {
      listEl.innerHTML = data.users.map(u => {
        const initials = u.nama?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) || '?';
        const mins = Math.floor(u.seconds_ago / 60);
        const secs = u.seconds_ago % 60;
        const timeAgo = mins > 0 ? `${mins}m ${secs}s lalu` : `${secs}s lalu`;
        const roleLabel = { admin: 'Admin', ahli_gizi: 'Ahli Gizi', gudang: 'Gudang', keuangan: 'Keuangan', produksi: 'Produksi' }[u.role] || u.role;
        
        return `
          <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-50 transition-colors">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style="background: linear-gradient(135deg, #10b981, #059669);">
              ${initials}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-stone-800 truncate">${u.nama}</span>
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Online"></span>
              </div>
              <div class="text-[10px] text-stone-400 flex items-center gap-2">
                <span class="px-1.5 py-0.5 rounded bg-stone-100 text-[9px] font-medium">${roleLabel}</span>
                <span>${timeAgo}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Failed to load online users:', err);
    const listEl = document.getElementById('online-users-list');
    if (listEl) listEl.innerHTML = '<div class="text-sm text-red-500 text-center py-4">Gagal memuat</div>';
  }
}

function startOnlineUsersAutoRefresh() {
  if (onlineUsersRefreshInterval) clearInterval(onlineUsersRefreshInterval);
  onlineUsersRefreshInterval = setInterval(loadOnlineUsers, 30000);
}

function stopOnlineUsersAutoRefresh() {
  if (onlineUsersRefreshInterval) {
    clearInterval(onlineUsersRefreshInterval);
    onlineUsersRefreshInterval = null;
  }
}

// Expose for manual refresh button
window.loadOnlineUsers = loadOnlineUsers;
window.stopOnlineUsersAutoRefresh = stopOnlineUsersAutoRefresh;
