// ===== Siklus Menu =====
const HARI_OPTIONS = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];

const KAT_SP_ORDER = ['Karbohidrat','Protein Hewani','Protein Nabati','Sayur','Buah','Susu','Minyak'];
const KAT_SP_LABELS = {
  'Karbohidrat': { label: 'Karbohidrat', color: 'text-amber-700 bg-amber-50' },
  'Protein Hewani': { label: 'Protein Hewani', color: 'text-red-700 bg-red-50' },
  'Protein Nabati': { label: 'Protein Nabati', color: 'text-emerald-700 bg-emerald-50' },
  'Sayur': { label: 'Sayur', color: 'text-green-700 bg-green-50' },
  'Buah': { label: 'Buah', color: 'text-orange-700 bg-orange-50' },
  'Susu': { label: 'Susu', color: 'text-blue-700 bg-blue-50' },
  'Minyak': { label: 'Minyak', color: 'text-yellow-700 bg-yellow-50' },
};

async function batchLoadMenuBreakdowns(menuIds) {
  if (!menuIds || !menuIds.length) return {};
  const unique = [...new Set(menuIds)];
  try {
    const data = await api.get('/menu/batch?ids=' + unique.join(','));
    const result = {};
    for (const menuId of unique) {
      const menu = data[menuId];
      if (!menu) continue;
      const groups = {};
      for (const b of (menu.bahan || [])) {
        const kat = b.kategori_sp || 'Lainnya';
        if (!groups[kat]) groups[kat] = [];
        groups[kat].push(b);
      }
      result[menuId] = groups;
    }
    return result;
  } catch { return {}; }
}

async function getMenuKategoriBreakdown(menuId) {
  if (!menuId) return null;
  const map = await batchLoadMenuBreakdowns([menuId]);
  return map[menuId] || null;
}

function renderKategoriBreakdown(groups) {
  if (!groups) return '';
  const total = Object.keys(groups).reduce((s, k) => s + groups[k].length, 0);
  if (!total) return '';
  let html = '<div class="mt-1.5 space-y-0.5 bg-stone-50 rounded-lg p-2 border border-stone-100">';
  for (const kat of KAT_SP_ORDER) {
    const items = groups[kat];
    if (!items || !items.length) continue;
    const lbl = KAT_SP_LABELS[kat] || { label: kat, color: 'text-stone-700 bg-stone-50' };
    const names = items.map(b => b.nama + (b.jumlah ? ' ' + b.jumlah + 'g' : '')).join(', ');
    html += '<div class="flex items-center gap-1.5 text-[11px] leading-tight"><span class="inline-block px-1.5 py-0.5 rounded font-medium whitespace-nowrap ' + lbl.color + '">' + lbl.label + '</span><span class="text-stone-500 truncate">' + names + '</span></div>';
  }
  html += '</div>';
  return html;
}

// Convert grid bahan data { Karbohidrat: [{id, nama}], ... } to format renderKategoriBreakdown expects
function gridBahanToGroups(gridBahan) {
  if (!gridBahan) return null;
  const groups = {};
  let total = 0;
  for (const kat of KAT_SP_ORDER) {
    const items = gridBahan[kat];
    if (!items || !items.length) continue;
    groups[kat] = items.map(b => ({ nama: b.nama, kategori_sp: kat }));
    total += items.length;
  }
  if (!total) return null;
  return groups;
}

async function renderSiklus() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    await preloadMenus();
    const r = await fetch('/api/template/siklus', { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Gagal memuat siklus');
    }
    c.innerHTML = await r.text();

    // Attach search & filter handlers
    const searchInput = document.getElementById('siklus-search');
    const filterSelect = document.getElementById('siklus-filter-status');
    const debounceTimer = { id: null };
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        clearTimeout(debounceTimer.id);
        debounceTimer.id = setTimeout(() => reloadSiklusList(), 300);
      });
    }
    if (filterSelect) {
      filterSelect.addEventListener('change', () => reloadSiklusList());
    }

    reloadSiklusList();
  } catch (err) {
    console.error('Siklus error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat siklus: ${err.message}</div>`;
  }
}

async function reloadSiklusList() {
  let list = await api.get('/siklus');
  const wrap = document.getElementById('siklus-list');
  if (!wrap) return;

  // Filter by search
  const searchVal = (document.getElementById('siklus-search')?.value || '').toLowerCase();
  const filterStatus = document.getElementById('siklus-filter-status')?.value || '';

  if (searchVal) {
    list = list.filter(s =>
      (s.nama || '').toLowerCase().includes(searchVal) ||
      (s.kategori_penerima || '').toLowerCase().includes(searchVal) ||
      (s.catatan || '').toLowerCase().includes(searchVal)
    );
  }
  if (filterStatus) {
    list = list.filter(s => s.status === filterStatus);
  }

  // Update stats
  const statsEl = document.getElementById('siklus-stats');
  if (statsEl) {
    const total = list.length;
    const aktif = list.filter(s => s.status === 'Aktif').length;
    const draft = list.filter(s => s.status === 'Draft').length;
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-aktif').textContent = aktif;
    document.getElementById('stat-draft').textContent = draft;

    statsEl.classList.remove('hidden');
  }

  if (!list.length) {
    wrap.innerHTML = '<div class="col-span-full text-center py-16 text-stone-400"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg><div>Belum ada siklus menu</div></div>';
    return;
  }

  var selectAllHtml = '<div class="col-span-full flex items-center gap-3 py-1">' +
    '<label class="flex items-center gap-2 text-sm text-stone-500 cursor-pointer">' +
      '<input type="checkbox" id="siklus-select-all" onchange="toggleSelectAll(this)" class="w-4 h-4 rounded border-stone-300 text-[#1e40af] focus:ring-[#1e40af]/30">' +
      'Pilih Semua' +
    '</label>' +
  '</div>';

  wrap.innerHTML = selectAllHtml + list.map(s => {
    const statusColor = s.status === 'Aktif' ? 'bg-emerald-100 text-emerald-800' : s.status === 'Draft' ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600';
    const filledCount = s.filled_count || 0;
    return `<div class="bg-white border border-stone-200 rounded-xl p-5 hover:shadow-lg hover:border-stone-300 transition-all duration-200 group">
      <div class="flex justify-between items-start mb-3">
        <div class="flex items-center gap-3 min-w-0">
          <input type="checkbox" value="${s.id}" onchange="updateSelectedCount()" onclick="event.stopPropagation()" class="siklus-checkbox w-4 h-4 rounded border-stone-300 text-[#1e40af] focus:ring-[#1e40af]/30 shrink-0">
          <div class="font-semibold text-sm text-stone-800 group-hover:text-[#1e40af] transition-colors cursor-pointer" onclick="loadSiklusDetail(${s.id})">${s.nama}</div>
        </div>
        <span class="text-[10px] px-2.5 py-1 rounded-full font-medium ${statusColor} capitalize">${s.status}</span>
      </div>
      <div class="flex items-center gap-4 text-xs text-stone-500 mb-3">
        <span class="flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>${s.kategori_penerima || 'Semua'}</span>
        <span class="flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>${s.jumlah_porsi} porsi/hari</span>
        <span class="flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${s.total_hari} hari</span>
      </div>
      ${s.catatan ? `<div class="text-xs text-stone-400 italic mb-3 line-clamp-1">${s.catatan}</div>` : ''}
      <div class="flex items-center justify-between pt-3 border-t border-stone-100">
        <div class="text-xs text-stone-400">${filledCount} hari terisi</div>
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onclick="event.stopPropagation();loadSiklusDetail(${s.id})" class="w-7 h-7 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Detail"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
          <button onclick="event.stopPropagation();bukaKebutuhanPangan(${s.id})" class="w-7 h-7 flex items-center justify-center text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Kebutuhan"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg></button>
          <button onclick="event.stopPropagation();editSiklus(${s.id})" class="w-7 h-7 flex items-center justify-center text-stone-600 hover:bg-stone-100 rounded-lg transition-colors" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button onclick="event.stopPropagation();deleteSiklus(${s.id})" class="w-7 h-7 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Hapus"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
        </div>
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
          <button onclick="generateProduksi(${data.id})" class="px-3 py-1.5 text-sm border border-emerald-300 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100"><svg class="w-4 h-4 -mt-0.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Buat Produksi</button>
          <button onclick="hitungBudgetSiklus(${data.id})" class="px-3 py-1.5 text-sm border border-blue-300 bg-blue-50 text-blue-700 rounded hover:bg-blue-100"><svg class="w-4 h-4 -mt-0.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Buat Budget</button>
          <button onclick="renderSiklusLaporan(${data.id})" class="px-3 py-1.5 text-sm border border-purple-300 bg-purple-50 text-purple-700 rounded hover:bg-purple-100"><svg class="w-4 h-4 -mt-0.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Laporan + Banding SP</button>
          <button onclick="editSiklus(${data.id})" class="px-3 py-1.5 text-sm border border-stone-300 rounded hover:bg-stone-50">Edit Siklus</button>
          <button onclick="document.getElementById('siklus-detail').innerHTML=''" class="px-3 py-1.5 text-sm text-stone-500 hover:text-stone-900">Tutup</button>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        ${data.items.map(it => {
          const totalK = Number(it.kalori || 0) + Number(it.protein || 0) + Number(it.karbohidrat || 0) + Number(it.lemak || 0) + Number(it.serat || 0);
          return `<div class="border border-stone-200 rounded-lg p-4">
            <div class="text-xs font-semibold uppercase text-stone-500 mb-2">Hari ${it.hari_ke} — ${it.hari_nama}</div>
            <div class="font-bold text-sm mb-1">${it.menu_nama || (it._has_bahan ? '<span class="text-emerald-600">Manual (grid)</span>' : '<span class="text-stone-400">Belum diisi</span>')}</div>
            <div class="text-xs text-stone-500 mb-2">${fmtNum(it.jumlah_porsi)} porsi</div>
            ${(it.menu_nama || it._has_bahan) ? `<div class="grid grid-cols-3 gap-1 text-[10px] mb-2">
              <div class="bg-stone-50 rounded p-1 text-center"><div class="text-stone-400">Kal</div><div class=\"mono font-semibold\">${fmtNum(it.kalori)}</div></div>
              <div class="bg-stone-50 rounded p-1 text-center"><div class="text-stone-400">Prot</div><div class=\"mono font-semibold\">${fmtNum(it.protein)}</div></div>
              <div class="bg-stone-50 rounded p-1 text-center"><div class="text-stone-400">Karb</div><div class=\"mono font-semibold\">${fmtNum(it.karbohidrat)}</div></div>
              <div class="bg-stone-50 rounded p-1 text-center"><div class="text-stone-400">Lem</div><div class=\"mono font-semibold\">${fmtNum(it.lemak)}</div></div>
              <div class="bg-stone-50 rounded p-1 text-center"><div class="text-stone-400">Ser</div><div class=\"mono font-semibold\">${fmtNum(it.serat)}</div></div>
            </div>` : ''}
            <div id="sk-dtl-bd-${it.hari_ke}" class="text-[10px] text-stone-400 animate-pulse">Memuat kategori...</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  // Load category breakdown for each day
  // Fetch bahan-grid data to support manually-assigned ingredients (items without menu_id)
  let bahanGrid = null;
  const needsGrid = data.items.some(it => !it.menu_id && it._has_bahan);
  if (needsGrid) {
    try {
      const gridRes = await api.get('/siklus/' + id + '/bahan-grid');
      const gridDays = gridRes && gridRes.days;
      if (gridDays) {
        bahanGrid = {};
        for (const d of gridDays) bahanGrid[d.hari_ke] = d.bahan;
      }
    } catch (e) { /* ignore */ }
  }
  const menuIds = [...new Set(data.items.filter(it => it.menu_id).map(it => it.menu_id))];
  const breakdownMap = await batchLoadMenuBreakdowns(menuIds);
  for (const it of data.items) {
    if (it.menu_id) {
      const groups = breakdownMap[it.menu_id];
      const el = document.getElementById('sk-dtl-bd-' + it.hari_ke);
      if (el) el.innerHTML = renderKategoriBreakdown(groups) || '<div class="text-stone-400 text-[10px]">Tidak ada data bahan</div>';
    } else if (it._has_bahan && bahanGrid && bahanGrid[it.hari_ke]) {
      // Item with manually-assigned ingredients via grid picker — use bahan-grid data
      const el = document.getElementById('sk-dtl-bd-' + it.hari_ke);
      if (el) {
        const groups = gridBahanToGroups(bahanGrid[it.hari_ke]);
        el.innerHTML = renderKategoriBreakdown(groups) || '<div class="text-stone-400 text-[10px]">Tidak ada data bahan</div>';
        el.classList.remove('animate-pulse');
      }
    } else {
      const el = document.getElementById('sk-dtl-bd-' + it.hari_ke);
      if (el) el.innerHTML = '';
    }
  }
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
          <button onclick="hitungSpSiklus(${id})" class="px-3 py-1.5 text-sm border border-emerald-300 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100"><svg class="w-4 h-4 -mt-0.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Hitung SP</button>
          <button onclick="exportSiklusLaporan(${id})" class="px-3 py-1.5 text-sm border border-stone-300 rounded hover:bg-stone-50"><svg class="w-4 h-4 -mt-0.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> CSV</button>
          <button onclick="window.print()" class="px-3 py-1.5 text-sm border border-stone-300 rounded hover:bg-stone-50"><svg class="w-4 h-4 -mt-0.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print</button>
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

      ${data.spComparison && data.spComparison.length ? `
      <div class="bg-white border border-stone-200 rounded-lg overflow-hidden mb-4">
        <div class="px-5 py-3 font-bold border-b border-stone-200 flex items-center justify-between">
          <span>SP Target vs Realisasi</span>
          <span class="text-xs font-normal text-stone-400">Rata-rata per hari terisi</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-stone-50">
              <tr>
                <th class="text-left px-4 py-2.5 font-semibold uppercase text-[10px]">Kategori SP</th>
                <th class="text-center px-3 py-2.5 font-semibold uppercase text-[10px]">Target</th>
                <th class="text-center px-3 py-2.5 font-semibold uppercase text-[10px]">Realisasi</th>
                <th class="text-center px-3 py-2.5 font-semibold uppercase text-[10px]">Selisih</th>
                <th class="text-center px-3 py-2.5 font-semibold uppercase text-[10px]">Capaian</th>
                <th class="text-center px-3 py-2.5 font-semibold uppercase text-[10px]">Status</th>
              </tr>
            </thead>
            <tbody>
              ${data.spComparison.map(sp => {
                const selisihClass = sp.selisih >= 0 ? 'text-emerald-600' : 'text-red-600';
                const statusClass = sp.status === 'terpenuhi' ? 'bg-emerald-100 text-emerald-700' : sp.status === 'no_target' ? 'bg-stone-100 text-stone-500' : 'bg-red-100 text-red-700';
                const statusLabel = sp.status === 'terpenuhi' ? '✓ Terpenuhi' : sp.status === 'no_target' ? '—' : '✗ Kurang';
                const barWidth = Math.min(100, sp.persen);
                const barColor = sp.persen >= 100 ? 'bg-emerald-500' : sp.persen >= 75 ? 'bg-amber-500' : 'bg-red-500';
                return `<tr class="border-t border-stone-100 hover:bg-stone-50/50">
                  <td class="px-4 py-2.5 font-medium whitespace-nowrap">${sp.kategori}</td>
                  <td class="px-3 py-2.5 text-center mono font-semibold">${sp.target}</td>
                  <td class="px-3 py-2.5 text-center mono font-semibold">${sp.realisasi}</td>
                  <td class="px-3 py-2.5 text-center mono font-semibold ${selisihClass}">${sp.selisih > 0 ? '+' : ''}${sp.selisih}</td>
                  <td class="px-3 py-2.5">
                    <div class="w-full bg-stone-200 rounded-full h-2.5">
                      <div class="${barColor} h-2.5 rounded-full transition-all duration-500" style="width:${barWidth}%"></div>
                    </div>
                    <div class="text-[10px] text-stone-400 text-center mt-0.5">${sp.persen}%</div>
                  </td>
                  <td class="px-3 py-2.5 text-center">
                    <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${statusClass}">${statusLabel}</span>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

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
              </tr>
              ${it.menu_id ? `<tr class="bg-stone-50/50">
                <td colspan="8" class="px-4 py-2">
                  <div id="sk-lap-bd-${id}-${it.hari_ke}" class="text-[10px] text-stone-400 animate-pulse">Memuat kategori...</div>
                </td>
              </tr>` : ''}`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  // Load category breakdown for each day in laporan
  // Fetch bahan-grid data to support manually-assigned ingredients (items without menu_id)
  let bahanGrid = null;
  const needsGrid = items.some(it => !it.menu_id);
  if (needsGrid) {
    try {
      const gridRes = await api.get('/siklus/' + id + '/bahan-grid');
      const gridDays = gridRes && gridRes.days;
      if (gridDays) {
        bahanGrid = {};
        for (const d of gridDays) bahanGrid[d.hari_ke] = d.bahan;
      }
    } catch (e) { /* ignore */ }
  }
  const menuIds = [...new Set(items.filter(it => it.menu_id).map(it => it.menu_id))];
  const breakdownMap = await batchLoadMenuBreakdowns(menuIds);
  for (const it of items) {
    if (it.menu_id) {
      const groups = breakdownMap[it.menu_id];
      const el = document.getElementById('sk-lap-bd-' + id + '-' + it.hari_ke);
      if (el) el.innerHTML = renderKategoriBreakdown(groups) || '<div class="text-stone-400 text-[10px]">Tidak ada data bahan</div>';
    } else if (bahanGrid && bahanGrid[it.hari_ke]) {
      // Item with manually-assigned ingredients via grid picker
      const el = document.getElementById('sk-lap-bd-' + id + '-' + it.hari_ke);
      if (el) {
        const groups = gridBahanToGroups(bahanGrid[it.hari_ke]);
        el.innerHTML = renderKategoriBreakdown(groups) || '<div class="text-stone-400 text-[10px]">Tidak ada data bahan</div>';
      }
    } else {
      const el = document.getElementById('sk-lap-bd-' + id + '-' + it.hari_ke);
      if (el) el.innerHTML = '';
    }
  }
  window['_laporanSiklus_'+id] = { items, siklus, stats };
}

async function hitungSpSiklus(id) {
  var wrap = document.getElementById('siklus-detail');
  try {
    var result = await api.post('/sp/hitung-kebutuhan', { siklus_ids: [id] });
    var items = result.items || [];
    if (!items.length) {
      showToast('Tidak ada bahan untuk dihitung', 'warning');
      return;
    }
    var totalKg = result.total_kebutuhan_kg || '0.00';
    var html = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden mt-4">' +
      '<div class="px-5 py-3 font-bold border-b border-stone-200 flex justify-between items-center">' +
        '<span>Perhitungan Kebutuhan Bahan (SP)</span>' +
        '<span class="text-sm font-normal text-stone-500">Total: <span class="mono font-bold text-emerald-700">' + totalKg + ' kg</span></span>' +
      '</div>' +
      '<div class="overflow-x-auto"><table class="w-full">' +
      '<thead class="bg-stone-50"><tr>' +
        '<th class="text-left px-4 py-3 text-xs font-semibold uppercase">Bahan</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">Kat. SP</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">SP</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">1 SP (g)</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">Berat Bersih (g)</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">BDD</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">Berat Kotor (g)</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">Total (g)</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">Kebutuhan (kg)</th>' +
      '</tr></thead><tbody>' +
      items.map(function(b) {
        return '<tr class="border-t border-stone-100">' +
          '<td class="px-4 py-3 text-sm font-medium">' + b.nama + '</td>' +
          '<td class="px-4 py-3 text-sm text-right">' + (b.kategori_sp || '-') + '</td>' +
          '<td class="px-4 py-3 text-sm text-right mono">' + (b.sp_value != null ? b.sp_value : '-') + '</td>' +
          '<td class="px-4 py-3 text-sm text-right mono">' + b.berat_1_sp + '</td>' +
          '<td class="px-4 py-3 text-sm text-right mono">' + b.berat_bersih + '</td>' +
          '<td class="px-4 py-3 text-sm text-right mono">' + b.persen_bdd + '%</td>' +
          '<td class="px-4 py-3 text-sm text-right mono">' + b.berat_kotor + '</td>' +
          '<td class="px-4 py-3 text-sm text-right mono">' + fmtNum(b.total_berat_kotor) + '</td>' +
          '<td class="px-4 py-3 text-sm text-right mono font-bold">' + b.kebutuhan_kg + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div></div>';
    // Append after existing content
    var existing = wrap.querySelector('.bg-white.border-stone-200.rounded-lg.p-5');
    if (existing) {
      existing.insertAdjacentHTML('afterend', html);
    } else {
      wrap.innerHTML += html;
    }
  } catch (e) {
    showToast('Gagal hitung SP: ' + e.message, 'error');
  }
}

function exportSiklusLaporan(id) {
  const { items, stats } = window['_laporanSiklus_'+id] || {};
  if (!items) return showAlert('Data laporan belum dimuat', 'warning');
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
  if (!await showConfirm('Hapus siklus ini? Semua item di dalamnya akan terhapus.')) return;
  await api.del('/siklus/' + id);
  document.getElementById('siklus-detail').innerHTML = '';
  reloadSiklusList();
}

function toggleSelectAll(master) {
  document.querySelectorAll('.siklus-checkbox').forEach(cb => cb.checked = master.checked);
  updateSelectedCount();
}

function updateSelectedCount() {
  var checked = document.querySelectorAll('.siklus-checkbox:checked').length;
  var btn = document.getElementById('siklus-delete-selected');
  var countEl = document.getElementById('siklus-selected-count');
  if (!btn || !countEl) return;
  if (checked > 0) {
    btn.classList.remove('hidden');
    btn.classList.add('inline-flex');
    countEl.textContent = checked;
  } else {
    btn.classList.add('hidden');
    btn.classList.remove('inline-flex');
  }
}

// ===== Siklus → Keuangan Integration =====
async function generateProduksi(siklusId) {
  var tanggal = prompt('Tanggal produksi (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
  if (!tanggal) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) { showAlert('Format tanggal salah. Gunakan YYYY-MM-DD', 'error'); return; }
  try {
    var r = await api.post('/siklus/generate-produksi', { siklus_id: siklusId, tanggal_produksi: tanggal });
    showAlert('✅ ' + r.message, 'success');
  } catch (e) {
    showAlert('❌ ' + (e.message || 'Gagal'), 'error');
  }
}

async function generateProduksiBatch(siklusId) {
  var mulai = prompt('Tanggal mulai (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
  if (!mulai) return;
  var selesai = prompt('Tanggal selesai (YYYY-MM-DD):', new Date(new Date().getTime() + 7*86400000).toISOString().slice(0, 10));
  if (!selesai) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mulai) || !/^\d{4}-\d{2}-\d{2}$/.test(selesai)) {
    showAlert('Format tanggal salah. Gunakan YYYY-MM-DD', 'error'); return;
  }
  if (!confirm('Buat produksi dari ' + mulai + ' sampai ' + selesai + '?')) return;
  try {
    var r = await api.post('/siklus/generate-produksi-batch', { siklus_id: siklusId, tanggal_mulai: mulai, tanggal_selesai: selesai });
    var msg = '✅ ' + r.created_count + ' produksi berhasil dibuat';
    if (r.skipped_count > 0) msg += ', ' + r.skipped_count + ' dilewati';
    showAlert(msg, r.created_count > 0 ? 'success' : 'warning');
  } catch (e) {
    showAlert('❌ ' + (e.message || 'Gagal'), 'error');
  }
}

async function hitungBudgetSiklus(siklusId) {
  var periode = prompt('Periode budget (YYYY-MM):', new Date().toISOString().slice(0, 7));
  if (!periode) return;
  if (!/^\d{4}-\d{2}$/.test(periode)) { showAlert('Format periode salah. Gunakan YYYY-MM', 'error'); return; }
  try {
    var r = await api.post('/siklus/hitung-budget', { siklus_id: siklusId, periode: periode });
    showAlert('✅ ' + r.message, 'success');
  } catch (e) {
    showAlert('❌ ' + (e.message || 'Gagal'), 'error');
  }
}

async function hitungBudgetSemuaSiklus() {
  var periode = prompt('Periode budget (YYYY-MM):', new Date().toISOString().slice(0, 7));
  if (!periode) return;
  if (!/^\d{4}-\d{2}$/.test(periode)) { showAlert('Format periode salah. Gunakan YYYY-MM', 'error'); return; }
  try {
    var r = await api.post('/siklus/hitung-budget-semua', { periode: periode });
    showAlert('✅ ' + r.message, 'success');
  } catch (e) {
    showAlert('❌ ' + (e.message || 'Gagal'), 'error');
  }
}

async function buatPRSiklus() {
  var periode = prompt('Periode PR (YYYY-MM):', new Date().toISOString().slice(0, 7));
  if (!periode) return;
  if (!confirm('Buat Purchase Request untuk periode ' + periode + ' dari semua siklus Aktif?')) return;
  try {
    var r = await api.post('/siklus/buat-pr', { periode: periode });
    showAlert('✅ ' + r.message, 'success');
  } catch (e) {
    showAlert('❌ ' + (e.message || 'Gagal'), 'error');
  }
}

async function deleteSelectedSiklus() {
  var checked = document.querySelectorAll('.siklus-checkbox:checked');
  var ids = Array.from(checked).map(cb => parseInt(cb.value)).filter(id => !isNaN(id));
  if (!ids.length) return showAlert('Pilih siklus yang akan dihapus', 'warning');
  if (!await showConfirm('Hapus ' + ids.length + ' siklus terpilih? Semua item di dalamnya akan terhapus.')) return;
  try {
    await api.post('/siklus/bulk-delete', { ids });
    document.getElementById('siklus-detail').innerHTML = '';
    showToast(ids.length + ' siklus berhasil dihapus', 'success');
    reloadSiklusList();
  } catch (e) {
    showToast('Gagal menghapus: ' + (e.message || 'Unknown error'), 'error');
  }
}

async function editSiklus(id) {
  const data = await api.get('/siklus/' + id);
  openSiklusForm(data);
}
function bukaKebutuhanPangan(id) {
  window._pbdPendingSiklusId = id;
  navigate('perhitungan-bdd');
}

async function openSiklusForm(editing) {
  const isEdit = !!(editing && editing.id);
  const s = editing || { nama: '', kategori_penerima: '', jumlah_porsi: 0, total_hari: 7, status: 'Draft', catatan: '', items: HARI_OPTIONS.slice(0,7).map((h,i) => ({ hari_ke: i+1, hari_nama: h, menu_nama: '', jumlah_porsi: 0 })) };
  // Preserve existing metadata when re-rendering (e.g. from saveGridPicker / hariChange)
  const prevMeta = window._siklusMeta;
  if (prevMeta) {
    if (!s.kategori_penerima && prevMeta.kategori_penerima) s.kategori_penerima = prevMeta.kategori_penerima;
    if ((!s.jumlah_porsi || s.jumlah_porsi === 0) && prevMeta.jumlah_porsi) s.jumlah_porsi = prevMeta.jumlah_porsi;
    if (!s.catatan && prevMeta.catatan) s.catatan = prevMeta.catatan;
  }
  const formData = JSON.parse(JSON.stringify(s));

  const totalHari = s.total_hari || 7;
  if (!formData.items || !formData.items.length) {
    formData.items = HARI_OPTIONS.slice(0, Math.min(14, Math.max(1, totalHari))).map((h, i) => ({
      hari_ke: i + 1, hari_nama: h, menu_nama: '', jumlah_porsi: formData.jumlah_porsi || 0
    }));
  }

  const c = document.getElementById('content');
  const statuses = ['Draft', 'Aktif', 'Arsip'];

  let bahanBySp = {};
  try { bahanBySp = await api.get('/bahan/by-sp'); } catch { bahanBySp = {}; }
  window._bahanBySp = bahanBySp;

  let existingGrid = {};
  if (isEdit && s.id) {
    try {
      const gridRes = await api.get('/siklus/' + s.id + '/bahan-grid');
      for (const d of (gridRes.days || [])) existingGrid[d.hari_ke] = d;
    } catch {}
  }

  const ROW_KEYS = ['Karbohidrat', 'Protein Hewani', 'Protein Nabati', 'Sayur', 'Buah', 'Susu'];
  const ROW_LABELS = { Karbohidrat: 'Makanan Pokok', 'Protein Hewani': 'Lauk Hewani', 'Protein Nabati': 'Lauk Nabati', Sayur: 'Sayur', Buah: 'Buah', Susu: 'Susu' };
  const ROW_ICONS = { Karbohidrat: '🌾', 'Protein Hewani': '🥩', 'Protein Nabati': '🫘', Sayur: '🥬', Buah: '🍎', Susu: '🥛' };

  const gridData = {};
  if (window._gridDirty && window._gridData) {
    // Use in-memory grid data (re-render from picker save)
    for (const hk of Object.keys(window._gridData)) {
      gridData[hk] = JSON.parse(JSON.stringify(window._gridData[hk]));
    }
    window._gridDirty = false;
  } else {
    for (const it of formData.items) {
      const hk = it.hari_ke;
      const existingItem = isEdit && s.items ? s.items.find(i => i.hari_ke === hk) : null;
      gridData[hk] = { hari_ke: hk, hari_nama: it.hari_nama, menu_id: it.menu_id || '', menu_nama: it.menu_nama || '', bahan: {}, resep_map: (existingGrid[hk] && existingGrid[hk].resep_map) || {} };
      for (const rk of ROW_KEYS) {
        const existing = existingGrid[hk] && existingGrid[hk].bahan && existingGrid[hk].bahan[rk];
        gridData[hk].bahan[rk] = (existing || []).map(b => ({ ...b }));
      }
    }
  }
  window._gridData = gridData;
  window._rowKeys = ROW_KEYS;

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - startDate.getDay() + 1);
  function fmtDate(d) { return d.getDate().toString().padStart(2,'0') + '/' + (d.getMonth()+1).toString().padStart(2,'0'); }
  function getDate(hk) { const d = new Date(startDate); d.setDate(d.getDate() + hk - 1); return d; }

  c.innerHTML = `
    <div class="max-w-7xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <button onclick="renderSiklus()" class="w-10 h-10 rounded-xl flex items-center justify-center text-stone-500 hover:bg-stone-100 border border-stone-200 transition-all"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg></button>
          <h1 class="text-2xl font-bold text-stone-800">${isEdit ? 'Edit' : 'Buat'} Siklus Menu</h1>
        </div>
        <div class="flex gap-3">
          <button onclick="renderSiklus()" class="px-5 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-xl border border-stone-200 transition-all">Kembali</button>
          <button id="sk-btn-save" class="px-6 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 rounded-xl shadow-sm transition-all">${isEdit ? 'Update' : 'Simpan'}</button>
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-stone-200 px-6 py-5 mb-5 shadow-sm">
        <div class="flex flex-wrap gap-x-6 gap-y-4 items-end">
          <div class="min-w-[250px] flex-1"><label class="block text-xs font-semibold text-stone-400 uppercase tracking-wider">Nama Siklus</label><input id="sk-nama" value="${s.nama}" placeholder="cth: Siklus Menu SD" class="mt-1.5 w-full h-11 px-4 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 text-sm font-medium transition-all" /></div>
          <div><label class="block text-xs font-semibold text-stone-400 uppercase tracking-wider">Jenjang</label><select id="sk-kategori" class="mt-1.5 h-11 px-3 border border-stone-200 rounded-xl text-sm bg-white min-w-[140px]"><option value="">— Semua —</option>${['TK/PAUD','SD 1-3','SD 4-6','SMP','SMA','Ibu Hamil','Ibu Menyusui','Balita'].map(k => '<option value="'+k+'"'+(s.kategori_penerima===k?' selected':'')+'>'+k+'</option>').join('')}</select></div>
          <div><label class="block text-xs font-semibold text-stone-400 uppercase tracking-wider">Hari</label><input id="sk-hari" type="number" min="1" max="14" value="${s.total_hari||7}" onchange="openSiklusFormHariChange(this)" class="mt-1.5 w-20 h-11 px-3 border border-stone-200 rounded-xl text-sm text-center" /></div>

          <div><label class="block text-xs font-semibold text-stone-400 uppercase tracking-wider">Status</label><select id="sk-status" class="mt-1.5 h-11 px-3 border border-stone-200 rounded-xl text-sm bg-white min-w-[120px]">${statuses.map(st => '<option value="'+st+'"'+(s.status===st?' selected':'')+'>'+st+'</option>').join('')}</select></div>
        </div>
      </div>

      <!-- Calendar Weeks -->
      <div class="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm mb-5">
        <div class="overflow-x-auto"><table class="w-full" style="min-width:${Math.max(600, formData.items.length * 130 + 100)}px"><thead><tr>
          <th class="w-[100px] min-w-[100px] px-3 py-3 text-left text-xs font-semibold text-stone-400 bg-stone-50 border-b border-r border-stone-200">Kelompok</th>${formData.items.map(it => {
            const dt = getDate(it.hari_ke);
            return '<th class="px-2 py-2.5 text-center bg-stone-50 border-b border-r border-stone-200 align-top"><div class="text-xs font-bold text-stone-700">' + it.hari_nama + '</div><div class="inline-block my-1 px-2 py-0.5 rounded-full bg-amber-100 text-[10px] font-semibold text-amber-700">Menu ' + it.hari_ke + '</div><div class="text-[10px] text-stone-400">' + fmtDate(dt) + '</div></th>';
          }).join('')}
        </tr></thead><tbody>
          ${ROW_KEYS.map(rk => {
            const clr = {Karbohidrat:'amber','Protein Hewani':'rose','Protein Nabati':'emerald',Sayur:'green',Buah:'orange',Susu:'blue'}[rk];
            const bgClr = {Karbohidrat:'amber-50','Protein Hewani':'rose-50','Protein Nabati':'emerald-50',Sayur:'green-50',Buah:'orange-50',Susu:'blue-50'}[rk];
            let r = '<tr class="hover:bg-stone-50/50 transition-colors"><td class="px-3 py-2.5 text-xs font-bold text-' + clr + '-700 bg-' + bgClr + ' border-b border-r border-stone-200">' + ROW_LABELS[rk] + '</td>';
            for (const it of formData.items) {
              const s = gridData[it.hari_ke].bahan[rk] || [];
              r += '<td class="px-2 py-2 border-b border-r border-stone-200 cursor-pointer hover:bg-' + clr + '-50/40 transition-colors" onclick="openGridPicker(' + it.hari_ke + ',\'' + rk + '\')"><div class="flex flex-wrap gap-1">';
              if (s.length) {
                for (const b of s) {
                  r += '<span class="inline-flex items-center gap-1 bg-' + clr + '-100 text-' + clr + '-700 px-2 py-0.5 rounded-md text-xs font-medium">' + b.nama + '</span>';
                }
              } else {
                r += '<span class="text-xs text-stone-300 italic">+ tambah</span>';
              }
              r += '</div></td>';
            }
            r += '</tr>';
            return r;
          }).join('')}
        </tbody></table></div>
      </div>

      <!-- Identifikasi Resep -->
      <div class="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
        <div class="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
          <h3 class="font-bold text-stone-700">Identifikasi Resep</h3>
          <button onclick="openSiklusRecipePicker()" class="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100">📋 Ambil dari Siklus</button>
        </div>
        <div class="overflow-x-auto"><table class="w-full" style="min-width:${Math.max(600, formData.items.length * 130 + 100)}px"><thead><tr>
          <th class="w-[100px] min-w-[100px] px-3 py-3 text-left text-xs font-semibold text-stone-400 bg-stone-50 border-b border-r border-stone-200">Kelompok</th>${formData.items.map(it => {
            return '<th class="px-2 py-2.5 text-center bg-stone-50 border-b border-r border-stone-200"><span class="text-xs font-semibold text-stone-700">Menu ' + it.hari_ke + '</span></th>';
          }).join('')}
        </tr></thead><tbody>
          ${ROW_KEYS.map(rk => {
            const clr = {Karbohidrat:'amber','Protein Hewani':'rose','Protein Nabati':'emerald',Sayur:'green',Buah:'orange',Susu:'blue'}[rk];
            const bgClr = {Karbohidrat:'amber-50','Protein Hewani':'rose-50','Protein Nabati':'emerald-50',Sayur:'green-50',Buah:'orange-50',Susu:'blue-50'}[rk];
            let r = '<tr class="hover:bg-stone-50/50 transition-colors"><td class="px-3 py-2.5 text-xs font-bold text-' + clr + '-700 bg-' + bgClr + ' border-b border-r border-stone-200">' + ROW_LABELS[rk] + '</td>';
            for (const it of formData.items) {
              const val = (gridData[it.hari_ke].resep_map && gridData[it.hari_ke].resep_map[rk]) || '';
              r += '<td class="px-2 py-2 border-b border-r border-stone-200"><input type="text" value="' + val + '" class="w-full text-xs px-2.5 py-1.5 border border-dashed border-stone-300 rounded-lg bg-white/80 focus:outline-none focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-300/30 transition-all" data-hk="' + it.hari_ke + '" data-kat="' + rk + '" data-field="resep" placeholder="cth: Nasi Putih" /></td>';
            }
            r += '</tr>';
            return r;
          }).join('')}
        </tbody></table></div>
      </div>
    </div>`;

  window._siklusFormId = s.id || null;
  window._siklusMeta = { kategori_penerima: s.kategori_penerima || '', jumlah_porsi: Number(s.jumlah_porsi) || 0, catatan: s.catatan || '' };
  document.getElementById('sk-btn-save').onclick = async function() {
    var nama = document.getElementById('sk-nama').value.trim();
    if (!nama) { showAlert('Nama siklus harus diisi', 'warning'); return; }
    var totalHari = +document.getElementById('sk-hari').value || 7;
    var gd = window._gridData || {};
    var rowKeys = window._rowKeys || [];
    var items = [], gridPayload = [];
    var hkKeys = Object.keys(gd).sort((a,b) => Number(a)-Number(b));
    for (var i = 0; i < hkKeys.length; i++) {
      var hk = Number(hkKeys[i]), day = gd[hk];
      if (!day) continue;
      var hasAnyBahan = rowKeys.some(function(rk) { return (day.bahan[rk] || []).length > 0; });
      var hasMenu = !!day.menu_id;
      if (!hasAnyBahan && !hasMenu) continue;
      items.push({ hari_ke: hk, hari_nama: day.hari_nama, menu_id: day.menu_id || '', menu_nama: day.menu_nama || '', jumlah_porsi: 0 });
      for (var ri = 0; ri < rowKeys.length; ri++) {
        var rk = rowKeys[ri], ids = (day.bahan[rk] || []).map(function(b) { return b.id; });
        gridPayload.push({ hari_ke: hk, kategori_sp: rk, bahan_baku_ids: ids });
      }
    }
    // Collect resep_map from Identifikasi Resep inputs
    // Hanya simpan kategori yang benar-benar diisi (tidak kosong)
    var resepMap = {};
    var resepInputs = document.querySelectorAll('input[data-field="resep"]');
    for (var ri = 0; ri < resepInputs.length; ri++) {
      var inp = resepInputs[ri];
      var val = inp.value.trim();
      if (!val) continue; // Skip input kosong — tidak perlu disimpan
      var hk = inp.getAttribute('data-hk');
      if (!resepMap[hk]) resepMap[hk] = {};
      resepMap[hk][inp.getAttribute('data-kat')] = val;
    }
    var meta = window._siklusMeta || {};
    for (var ii = 0; ii < items.length; ii++) {
      items[ii].jumlah_porsi = 0;
      if (!items[ii].menu_nama) {
        var hkKey = String(items[ii].hari_ke);
        var rmap = resepMap[hkKey];
        if (rmap) {
          var parts = [];
          for (var rki = 0; rki < rowKeys.length; rki++) {
            var v = rmap[rowKeys[rki]];
            if (v) parts.push(v);
          }
          if (parts.length) items[ii].menu_nama = parts.join(' + ');
        }
      }

    }
    var payload = { nama, kategori_penerima: document.getElementById('sk-kategori')?.value || '', total_hari: totalHari, status: document.getElementById('sk-status').value, catatan: meta.catatan || '', items };
    try {
      var savedId = window._siklusFormId;
      if (isEdit) await api.put('/siklus/' + savedId, payload);
      else { var res = await api.post('/siklus', payload); savedId = res.id; }
      if (savedId) await api.post('/siklus/' + savedId + '/bahan-grid', { grid: gridPayload, resepMap });
      showToast('Siklus menu berhasil ' + (isEdit ? 'diperbarui' : 'disimpan'), 'success');
      renderSiklus();
    } catch (e) { showToast('Gagal: ' + (e.message || 'Unknown error'), 'error'); }
  };
}

// Modal helper for grid picker
function showModal(title, bodyHtml, sizeClass) {
  var existing = document.getElementById('siklus-modal');
  if (existing) existing.remove();
  var m = document.createElement('div');
  m.id = 'siklus-modal';
  m.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40';
  m.innerHTML = '<div class="bg-white rounded-2xl shadow-xl ' + (sizeClass || 'max-w-lg') + ' w-full mx-4 max-h-[90vh] overflow-hidden"><div class="flex items-center justify-between px-5 py-3 border-b border-stone-200"><h3 class="font-bold text-stone-700 text-sm">' + title + '</h3><button onclick="closeGridPicker()" class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-stone-100 text-stone-400">&times;</button></div><div id="modal-body">' + bodyHtml + '</div></div>';
  document.body.appendChild(m);
  m.addEventListener('click', function(e) { if (e.target === m) { closeGridPicker(); } });
}

// Popup picker
var _gridPickerOpen = false;
function openGridPicker(hk, rk) {
  if (_gridPickerOpen) return;
  _gridPickerOpen = true;
  var list = (window._bahanBySp || {})[rk] || [];
  var gd = window._gridData;
  if (!gd[hk]) return;
  var sel = gd[hk].bahan[rk] || [];
  var selIds = sel.map(function(b) { return b.id; });
  var html = '<div class="p-4"><div class="font-bold text-sm mb-3 text-stone-700">Pilih Bahan — ' + rk + ' (Menu ' + hk + ')</div>' +
    '<div class="mb-3"><input id="gp-search" placeholder="Cari bahan..." oninput="filterGridPicker()" class="w-full h-10 px-3 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400" /></div>' +
    '<div id="gp-list" class="max-h-[250px] overflow-y-auto space-y-0.5">';
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    html += '<label class="gp-item flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-stone-50 cursor-pointer text-sm"><input type="checkbox" value="' + b.id + '" ' + (selIds.indexOf(b.id) !== -1 ? 'checked' : '') + ' class="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"> ' + b.nama + '</label>';
  }
  html += '</div>' +
    '<div class="mt-4 pt-3 border-t border-dashed border-stone-200">' +
      '<div class="text-xs font-semibold text-stone-500 mb-1.5">Tambah Bahan Baru</div>' +
      '<div class="flex gap-2">' +
        '<input id="gp-new-nama" placeholder="Nama bahan..." class="flex-1 h-9 px-3 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400" />' +
        '<button onclick="tambahBahanGrid(\'' + rk + '\',' + hk + ')" class="shrink-0 px-3 h-9 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">Tambah</button>' +
      '</div>' +
    '</div>' +
    '<div class="flex justify-end gap-2 mt-4 pt-3 border-t border-stone-100"><button onclick="closeGridPicker()" class="px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-lg">Batal</button><button onclick="saveGridPicker(' + hk + ',\'' + rk + '\')" class="px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">Simpan</button></div>' +
  '</div>';
  showModal('Pilih Bahan', html, 'max-w-sm');
}

async function tambahBahanGrid(rk, hk) {
  var namaEl = document.getElementById('gp-new-nama');
  var nama = namaEl ? namaEl.value.trim() : '';
  if (!nama) { showAlert('Masukkan nama bahan', 'warning'); return; }

  var satuan = 'g';
  var katLabel = { Karbohidrat: 'Karbohidrat', 'Protein Hewani': 'Protein Hewani', 'Protein Nabati': 'Protein Nabati', Sayur: 'Sayur', Buah: 'Buah', Susu: 'Susu' }[rk] || rk;

  try {
    var res = await api.post('/siklus/tambah-bahan', { nama, kategori_sp: katLabel, satuan });
    if (res.exists) {
      showToast('Bahan "' + nama + '" sudah ada', 'warning');
    } else {
      showToast('Bahan "' + nama + '" ditambahkan', 'success');
    }
    // Refresh bahanBySp and re-open picker
    var bahanBySp = await api.get('/bahan/by-sp');
    window._bahanBySp = bahanBySp;
    closeGridPicker();
    openGridPicker(hk, rk);
  } catch (e) {
    showAlert('Gagal: ' + e.message, 'error');
  }
}
function saveGridPicker(hk, rk) {
  var m = document.getElementById('siklus-modal');
  var checks = m ? m.querySelectorAll('input[type=checkbox]:checked') : [];
  var ids = [], gd = window._gridData, list = (window._bahanBySp || {})[rk] || [];
  for (var i = 0; i < checks.length; i++) ids.push(Number(checks[i].value));
  if (!gd[hk]) { if (m) m.remove(); _gridPickerOpen = false; return; }
  gd[hk].bahan[rk] = ids.map(function(id) { var f = list.find(function(b) { return b.id === id; }); return f ? { id: f.id, nama: f.nama } : null; }).filter(Boolean);
  // Auto-fill Identifikasi Resep from selected bahan names if still empty
  if (!gd[hk].resep_map) gd[hk].resep_map = {};
  if (!gd[hk].resep_map[rk]) {
    var bahanNames = gd[hk].bahan[rk].map(function(b) { return b.nama; });
    gd[hk].resep_map[rk] = bahanNames.length ? bahanNames.join(', ') : '';
  }
  if (m) m.remove(); _gridPickerOpen = false;
  window._gridDirty = true;
  var curNama = (document.getElementById('sk-nama')?.value) || '';
  var curKat = (document.getElementById('sk-kategori')?.value) || '';
  var curStatus = (document.getElementById('sk-status')?.value) || 'Draft';
  var hkKeys = Object.keys(window._gridData).sort(function(a,b) { return Number(a)-Number(b); });
  var items = hkKeys.map(function(hk) {
    var d = window._gridData[Number(hk)];
    return { hari_ke: d.hari_ke, hari_nama: d.hari_nama, menu_id: d.menu_id || '', menu_nama: d.menu_nama || '', jumlah_porsi: 0 };
  });
  openSiklusForm(window._siklusFormId ? { id: window._siklusFormId, nama: curNama, kategori_penerima: curKat, total_hari: items.length, status: curStatus, items: items } : { nama: curNama, kategori_penerima: curKat, total_hari: items.length, status: curStatus, items: items });
}
function closeGridPicker() { var m = document.getElementById('siklus-modal'); if (m) m.remove(); _gridPickerOpen = false; }
function filterGridPicker() {
  var q = (document.getElementById('gp-search')?.value || '').toLowerCase();
  var items = document.querySelectorAll('#siklus-modal .gp-item');
  for (var i = 0; i < items.length; i++) {
    items[i].style.display = items[i].textContent.toLowerCase().includes(q) ? '' : 'none';
  }
}

// Photo upload for siklus menu items
async function openSiklusFormHariChange(input) {
  var newTotal = Math.min(14, Math.max(1, +input.value || 1));

  if (window._gridData) {
    var gridData = window._gridData;
    var rowKeys = window._rowKeys || [];
    var hkKeys = Object.keys(gridData).sort(function(a,b) { return Number(a)-Number(b); });
    var existingLen = hkKeys.length;

    if (newTotal > existingLen) {
      for (var i = existingLen + 1; i <= newTotal; i++) {
        var nama = HARI_OPTIONS[i - 1] || 'Hari-' + i;
        gridData[i] = { hari_ke: i, hari_nama: nama, menu_nama: '', bahan: {}, resep_map: {} };
        for (var ri = 0; ri < rowKeys.length; ri++) {
          gridData[i].bahan[rowKeys[ri]] = [];
        }
      }
    } else if (newTotal < existingLen) {
      for (var k in gridData) {
        if (Number(k) > newTotal) delete gridData[k];
      }
    }
    window._gridData = gridData;
  }

  // Collect current form values and re-render
  window._gridDirty = true;
  var curNama = document.getElementById('sk-nama').value;
  var curKat = (document.getElementById('sk-kategori')?.value) || '';
  var curStatus = document.getElementById('sk-status').value;
  var curId = window._siklusFormId;
  var items = Object.keys(window._gridData || {}).sort(function(a,b) { return Number(a)-Number(b); }).map(function(hk) {
    var d = window._gridData[hk];
    return { hari_ke: d.hari_ke, hari_nama: d.hari_nama, menu_id: d.menu_id || '', menu_nama: d.menu_nama || '', jumlah_porsi: 0 };
  });
  openSiklusForm(curId ? { id: curId, nama: curNama, kategori_penerima: curKat, total_hari: newTotal, status: curStatus, items: items } : { nama: curNama, kategori_penerima: curKat, total_hari: newTotal, status: curStatus, items: items });
}

// Preload menu list for siklus form
async function preloadMenus() {
  try {
    var result = await api.get('/menu');
    window._menuCache = Array.isArray(result) ? result : (result.data || []);
  } catch { window._menuCache = []; }
}

// ===== Standar SP =====
var SP_GROUPS = [
  { label: 'Balita & PAUD', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>', color: 'bg-cyan-50 border-cyan-200', jenjangs: ['Balita', 'TK/PAUD'] },
  { label: 'SD', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>', color: 'bg-blue-50 border-blue-200', jenjangs: ['SD 1-3', 'SD 4-6'] },
  { label: 'SMP & SMA', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 14l9-5-9-5-9 5 9 5z"/><path d="M12 14l6.16-3.42a6 6 0 01.84 3.42V16l-7 4-7-4v-2a6 6 0 01.84-3.42L12 14z"/></svg>', color: 'bg-violet-50 border-violet-200', jenjangs: ['SMP', 'SMA'] },
  { label: 'Ibu Hamil & Menyusui', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4a4 4 0 100 8 4 4 0 000-8z"/><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><path d="M18 9c0 3.314-2.686 6-6 6"/><path d="M22 12a8 8 0 01-8 8"/></svg>', color: 'bg-rose-50 border-rose-200', jenjangs: ['Ibu Hamil', 'Ibu Menyusui'] },
];

async function renderStandarSp() {
  var c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    var data = await api.get('/sp/standar');
    var jenjangs = {};
    data.forEach(function(r) {
      if (!jenjangs[r.jenjang]) jenjangs[r.jenjang] = {};
      jenjangs[r.jenjang][r.kategori_sp] = r;
    });
    var kats = ['Karbohidrat','Protein Hewani','Protein Nabati','Sayur','Buah','Susu','Minyak'];
    var katLabels = {
      'Karbohidrat': { label: 'Karbohidrat', color: 'text-amber-700 bg-amber-50' },
      'Protein Hewani': { label: 'Protein Hewani', color: 'text-red-700 bg-red-50' },
      'Protein Nabati': { label: 'Protein Nabati', color: 'text-emerald-700 bg-emerald-50' },
      'Sayur': { label: 'Sayur', color: 'text-green-700 bg-green-50' },
      'Buah': { label: 'Buah', color: 'text-orange-700 bg-orange-50' },
      'Susu': { label: 'Susu', color: 'text-blue-700 bg-blue-50' },
      'Minyak': { label: 'Minyak', color: 'text-yellow-700 bg-yellow-50' },
    };

    var html = '<div class="space-y-6">';
    html += '<div class="flex flex-wrap items-center justify-between gap-2">';
    html += '<div><h2 class="text-xl font-bold">Standar Satuan Penukar (SP)</h2><p class="text-sm text-stone-500">Nilai SP berdasarkan jenjang penerima — edit langsung di tabel</p></div>';
    html += '<button onclick="saveStandarSp()" class="px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-colors"><svg class="w-4 h-4 -mt-0.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Simpan Perubahan</button>';
    html += '</div>';

    SP_GROUPS.forEach(function(group) {
      html += '<div class="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">';
      html += '<div class="' + group.color + ' px-5 py-3 border-b flex items-center gap-2">';
      html += '<span class="text-lg">' + group.icon + '</span>';
      html += '<span class="font-bold text-sm">' + group.label + '</span>';
      html += '</div>';
      html += '<div class="overflow-x-auto"><table class="w-full"><thead class="bg-stone-50"><tr>';
      html += '<th class="text-left px-4 py-3 text-xs font-semibold uppercase text-stone-600 w-28">Jenjang</th>';
      kats.forEach(function(k) {
        var kl = katLabels[k] || { label: k, color: '' };
        html += '<th class="text-center px-2 py-3 text-xs font-semibold uppercase"><span class="inline-block px-2 py-0.5 rounded ' + kl.color + '">' + kl.label + '</span></th>';
      });
      html += '</tr></thead><tbody>';

      group.jenjangs.forEach(function(j) {
        var row = jenjangs[j] || {};
        html += '<tr class="border-t border-stone-100 hover:bg-stone-50/50 transition-colors">';
        html += '<td class="px-4 py-3 text-sm font-medium text-stone-800">' + j + '</td>';
        kats.forEach(function(k) {
          var val = row[k];
          if (!val) {
            html += '<td class="px-2 py-3 text-sm text-center text-stone-300">—</td>';
          } else {
            html += '<td class="px-2 py-3 text-sm text-center"><input type="number" step="0.25" value="' + val.sp_value + '" data-id="' + val.id + '" class="sp-input w-20 h-10 px-2 border border-stone-200 rounded-lg text-sm mono text-center focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></td>';
          }
        });
        html += '</tr>';
      });

      html += '</tbody></table></div></div>';
    });

    html += '<div class="text-xs text-stone-400 text-center pb-4">Nilai SP adalah Standar Satuan Penukar — setiap bahan pangan memiliki berat 1 SP yang ditentukan di master Bahan Baku</div>';
    html += '</div>';
    c.innerHTML = html;
  } catch (e) {
    c.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat: ' + e.message + '</div>';
  }
}

async function saveStandarSp() {
  var inputs = document.querySelectorAll('.sp-input');
  var btn = document.querySelector('button[onclick*="saveStandarSp"]');
  if (btn) { btn.disabled = true; btn.innerHTML = 'Menyimpan...'; btn.classList.add('opacity-60'); }
  var updates = [];
  inputs.forEach(function(inp) {
    var id = inp.getAttribute('data-id');
    var val = parseFloat(inp.value);
    if (id && !isNaN(val)) updates.push(api.put('/sp/standar/' + id, { sp_value: val }));
  });
  if (!updates.length) {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Simpan Perubahan'; btn.classList.remove('opacity-60'); }
    return showToast('Tidak ada perubahan', 'warning');
  }
  try {
    await Promise.all(updates);
    showToast('Standar SP berhasil diperbarui', 'success');
    renderStandarSp();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Simpan Perubahan'; btn.classList.remove('opacity-60'); }
    showToast('Gagal menyimpan: ' + e.message, 'error');
  }
}

// ===== Pilih Menu untuk Siklus =====
function escHtml(s) {
  var d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

async function openSiklusRecipePicker() {
  try {
    var data = await api.get('/siklus/recipe-names');
    var hasNames = data.some(function(s) { return s.names && s.names.length; });
    if (!data.length || !hasNames) {
      showAlert('Belum ada siklus dengan nama menu atau resep. Buat siklus terlebih dahulu.', 'warning');
      return;
    }

    var html = '<div class="p-4 space-y-3 max-h-[420px] overflow-y-auto">';
    for (var si = 0; si < data.length; si++) {
      var s = data[si];
      if (!s.names || !s.names.length) continue;
      var statusColor = s.status === 'Aktif' ? 'bg-emerald-100 text-emerald-800' : s.status === 'Draft' ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600';
      html += '<div class="border border-stone-200 rounded-xl overflow-hidden">' +
        '<div class="px-4 py-2.5 bg-stone-50 border-b border-stone-100 flex items-center justify-between">' +
          '<div class="font-semibold text-sm text-stone-700">' + escHtml(s.nama) + '</div>' +
          '<span class="text-[10px] px-2 py-0.5 rounded-full font-medium ' + statusColor + ' capitalize">' + s.status + '</span>' +
        '</div>' +
        '<div class="divide-y divide-stone-100">';
      for (var ni = 0; ni < s.names.length; ni++) {
        var n = s.names[ni];
        if (n.source === 'menu') {
          var resepForDay = s.names.filter(function(x) { return x.source === 'resep' && x.hari_ke === n.hari_ke; });
          var resepData = resepForDay.map(function(x) { return { kategori_sp: x.kategori_sp, nama: x.nama, bahan: x.bahan || [] }; });
          var resepJson = JSON.stringify(resepData);
          html += '<button type="button" onclick="pilihSemuaResepDariSiklus(' + n.hari_ke + ',\'' + resepJson.replace(/'/g, "\\'") + '\')" class="w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors">' +
            '<div class="flex items-center gap-2">' +
            '<span class="text-xs text-stone-400 shrink-0 w-8">H' + n.hari_ke + '</span>' +
            '<span class="text-xs text-stone-500 shrink-0 w-14">' + escHtml(n.hari_nama || '') + '</span>' +
            '<span class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700 shrink-0">Menu</span>' +
            '<span class="text-sm font-medium text-stone-800 truncate">' + escHtml(n.nama) + '</span>' +
            (n.bahan && n.bahan.length ? '<span class="text-[10px] text-stone-400 shrink-0">' + n.bahan.length + ' bahan</span>' : '') +
            '<svg class="w-4 h-4 text-stone-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>' +
            '</div>' +
          '</button>';
        } else {
          var bahanJson = JSON.stringify(n.bahan || []);
          html += '<button type="button" onclick="pilihResepDariSiklus(' + n.hari_ke + ',\'' + escHtml(n.kategori_sp || '') + '\',\'' + escHtml(n.nama) + '\',\'' + bahanJson.replace(/'/g, "\\'") + '\')" class="w-full text-left px-4 py-2 hover:bg-stone-50 transition-colors">' +
            '<div class="flex items-center gap-2 pl-4">' +
            '<span class="text-xs text-stone-400 shrink-0 w-8">H' + n.hari_ke + '</span>' +
            '<span class="text-xs text-stone-500 shrink-0 w-14">' + escHtml(n.hari_nama || '') + '</span>' +
            '<span class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700 shrink-0">Resep</span>' +
            '<span class="text-sm font-medium text-stone-800 truncate">' + escHtml(n.nama) + '</span>' +
            (n.kategori_sp ? '<span class="text-[10px] text-stone-400 shrink-0 hidden sm:inline">(' + escHtml(n.kategori_sp) + ')</span>' : '') +
            '</div>' +
            (n.bahan && n.bahan.length ? '<div class="pl-16 mt-0.5 space-y-0.5">' + n.bahan.map(function(b) { return '<div class="flex items-center gap-1.5 text-[11px] text-stone-400"><span class="w-1 h-1 rounded-full bg-stone-300 shrink-0"></span>' + escHtml(b.nama) + '</div>'; }).join('') + '</div>' : '') +
          '</button>';
        }
      }
      html += '</div></div>';
    }
    html += '</div>';

    var existing = document.getElementById('siklus-recipe-picker');
    if (existing) existing.remove();
    var m = document.createElement('div');
    m.id = 'siklus-recipe-picker';
    m.className = 'fixed inset-0 z-[60] flex items-center justify-center bg-black/40';
    m.innerHTML = '<div class="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-hidden">' +
      '<div class="flex items-center justify-between px-5 py-3 border-b border-stone-200">' +
        '<h3 class="font-bold text-stone-700 text-sm">Ambil Nama Resep dari Siklus</h3>' +
        '<button onclick="closeSiklusRecipePicker()" class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-stone-100 text-stone-400">&times;</button>' +
      '</div>' +
      '<div id="sk-rec-body">' + html + '</div>' +
    '</div>';
    document.body.appendChild(m);
    m.addEventListener('click', function(e) { if (e.target === m) closeSiklusRecipePicker(); });
  } catch (e) {
    showAlert('Gagal memuat data siklus: ' + e.message, 'error');
  }
}

function closeSiklusRecipePicker() {
  var m = document.getElementById('siklus-recipe-picker');
  if (m) m.remove();
}

function refreshGridSection(hariKe, kategoriSp) {
  var gd = window._gridData;
  if (!gd || !gd[hariKe]) return;
  var bahan = gd[hariKe].bahan[kategoriSp] || [];
  var rowIdx = ROW_KEYS.indexOf(kategoriSp);
  if (rowIdx < 0) return;
  var table = document.querySelector('#content table');
  if (!table) return;
  var rows = table.querySelectorAll('tbody tr');
  var cell = rows[rowIdx] && rows[rowIdx].cells[hariKe];
  if (!cell) return;
  var clrMap = {Karbohidrat:'amber','Protein Hewani':'rose','Protein Nabati':'emerald',Sayur:'green',Buah:'orange',Susu:'blue'};
  var clr = clrMap[kategoriSp] || 'stone';
  var html = '<div class="flex flex-wrap gap-1">';
  if (bahan.length) {
    for (var bi = 0; bi < bahan.length; bi++) {
      html += '<span class="inline-flex items-center gap-1 bg-' + clr + '-100 text-' + clr + '-700 px-2 py-0.5 rounded-md text-xs font-medium">' + escHtml(bahan[bi].nama) + '</span>';
    }
  } else {
    html += '<span class="text-xs text-stone-300 italic">+ tambah</span>';
  }
  html += '</div>';
  cell.innerHTML = html;
}

function pilihResepDariSiklus(hariKe, kategoriSp, namaResep, bahanStr) {
  // Fill identifikasi resep input
  var inputs = document.querySelectorAll('input[data-field="resep"]');
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i];
    if (Number(inp.getAttribute('data-hk')) === hariKe && inp.getAttribute('data-kat') === kategoriSp) {
      inp.value = namaResep;
      break;
    }
  }
  // Fill grid bahan for this day & category — hanya jika ada bahan yang valid
  if (bahanStr) {
    try {
      var bahan = JSON.parse(bahanStr);
      if (Array.isArray(bahan) && bahan.length > 0) {
        var gd = window._gridData;
        if (gd && gd[hariKe] && gd[hariKe].bahan) {
          gd[hariKe].bahan[kategoriSp] = bahan;
          window._gridDirty = true;
        }
      }
    } catch (e) {}
  }
  closeSiklusRecipePicker();
  refreshGridSection(hariKe, kategoriSp);
  showToast('Nama resep diambil: ' + namaResep, 'success');
}

function pilihSemuaResepDariSiklus(hariKe, resepJson) {
  var resepList = JSON.parse(resepJson);
  if (!resepList.length) return;
  var gd = window._gridData;
  for (var i = 0; i < resepList.length; i++) {
    var r = resepList[i];
    var inputs = document.querySelectorAll('input[data-field="resep"]');
    for (var j = 0; j < inputs.length; j++) {
      var inp = inputs[j];
      if (Number(inp.getAttribute('data-hk')) === hariKe && inp.getAttribute('data-kat') === r.kategori_sp) {
        inp.value = r.nama;
        break;
      }
    }
    if (r.bahan && r.bahan.length && gd && gd[hariKe] && gd[hariKe].bahan) {
      gd[hariKe].bahan[r.kategori_sp] = r.bahan;
      window._gridDirty = true;
    }
  }
  closeSiklusRecipePicker();
  for (var ri = 0; ri < resepList.length; ri++) {
    refreshGridSection(hariKe, resepList[ri].kategori_sp);
  }
  showToast('Menu Hari ' + hariKe + ' diisi dari siklus', 'success');
}