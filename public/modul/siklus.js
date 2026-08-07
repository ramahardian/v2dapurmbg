// ===== Siklus Menu =====
const HARI_OPTIONS = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];

// Format nilai tanggal (Date / ISO string / "YYYY-MM-DD") menjadi DD/MM/YYYY.
// Nilai dari mysql2 adalah DATE bertipe Date = tengah malam WIB yang disimpan
// sebagai UTC (T17:00:00.000Z); tambah 7 jam lalu baca komponen UTC agar hasilnya
// konsisten di semua zona waktu browser.
function fmtSiklusTanggal(v) {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    var p = v.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  var d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  var dd = new Date(d.getTime() + 7 * 3600 * 1000);
  return String(dd.getUTCDate()).padStart(2, '0') + '/' + String(dd.getUTCMonth() + 1).padStart(2, '0') + '/' + dd.getUTCFullYear();
}

// Rentang tanggal siklus: "01/08/2026 – 31/08/2026" (atau kosong jika belum ada)
function fmtSiklusRentang(s) {
  var a = fmtSiklusTanggal(s && s.tanggal_mulai);
  var b = fmtSiklusTanggal(s && s.tanggal_selesai);
  if (!a && !b) return '';
  if (a && b) return a + ' – ' + b;
  return a || b;
}

function formatPerPorsi(b) {
  if (b.sp_value == null || b.sp_value <= 0) return '—';
  var gram = Math.round(b.berat_1_sp * b.sp_value);
  var satuan = b.satuan || 'g';
  // Use berat_per_satuan if known, else assume 1 satuan unit = berat_1_sp grams
  var perUnit = b.berat_per_satuan > 0 ? b.berat_per_satuan : (b.berat_1_sp || 1);
  // Always show Kg items in grams (per-serving in kg is misleading)
  if (satuan === 'Kg') return gram + ' g';
  // For non-gram units, try to convert
  var inSatuan = gram / perUnit;
  var rounded = Math.round(inSatuan * 100) / 100;
  // Show in original unit if clean (integer ≥1 or common fraction)
  if (inSatuan >= 0.9 && Math.abs(inSatuan - Math.round(inSatuan)) < 0.01) {
    return Math.round(inSatuan) + ' ' + satuan;
  }
  if (inSatuan > 0 && inSatuan < 1 && (Math.abs(inSatuan - 0.5) < 0.01 || Math.abs(inSatuan - 0.25) < 0.01 || Math.abs(inSatuan - 0.75) < 0.01)) {
    return rounded + ' ' + satuan;
  }
  // Fallback to grams
  return gram + ' g';
}

function formatTotalUnit(b) {
  var totalGram = Number(b.total_berat_kotor) || 0;
  if (!totalGram) return '0';
  var satuan = b.satuan || 'g';
  var perUnit = Number(b.berat_per_satuan) || Number(b.berat_1_sp) || 1;
  if (satuan === 'Kg') return fmtNum(totalGram / 1000) + ' kg';
  if (satuan === 'g' || satuan === 'gram') return Math.round(totalGram) + ' g';
  if (perUnit > 0) {
    var inUnit = totalGram / perUnit;
    if (inUnit >= 10) return Math.round(inUnit) + ' ' + satuan;
    return fmtNum(inUnit) + ' ' + satuan;
  }
  return fmtNum(totalGram / 1000) + ' kg';
}

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
}  // Convert grid bahan data { Karbohidrat: [{id, nama}], ... } to format renderKategoriBreakdown expects
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

// ===== Preload bahan by SP for grid picker =====
var _bahanBySpCache = null;

async function preloadBahanBySp() {
  if (_bahanBySpCache) {
    window._bahanBySp = _bahanBySpCache.byKat || {};
    return _bahanBySpCache;
  }
  try {
    const res = await api.get('/bahan/by-sp');
    _bahanBySpCache = res;
    window._bahanBySp = (res && res.byKat) || {};
    return res;
  } catch (e) {
    console.error('Gagal preload bahan by SP:', e);
    window._bahanBySp = {};
    return { byKat: {}, kategori_order: KAT_SP_ORDER };
  }
}

function getCachedBahanBySp() {
  return _bahanBySpCache || { byKat: {}, kategori_order: KAT_SP_ORDER };
}

async function renderSiklus() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    await preloadMenus();
    await preloadBahanBySp();
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

    // Dari notifikasi: buka edit siklus yang diminta setelah halaman dirender.
    if (window._siklusPendingDetailId) {
      const pid = window._siklusPendingDetailId;
      window._siklusPendingDetailId = null;
      editSiklus(pid);
    }
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
      fmtJenjang(s.kategori_penerima).toLowerCase().includes(searchVal) ||
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
      '<input type="checkbox" id="siklus-select-all" onchange="toggleSelectAll(this)" class="cb-modern">' +
      'Pilih Semua' +
    '</label>' +
  '</div>';

  wrap.innerHTML = selectAllHtml + list.map(s => {
    const statusColor = s.status === 'Aktif' ? 'bg-emerald-100 text-emerald-800' : s.status === 'Draft' ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600';
    const filledCount = s.filled_count || 0;
    return `<div class="bg-white border border-stone-200 rounded-xl p-5 hover:shadow-lg hover:border-stone-300 transition-all duration-200 group">
      <div class="flex items-center justify-between mb-2">
        <input type="checkbox" value="${s.id}" onchange="updateSelectedCount()" onclick="event.stopPropagation()" class="siklus-checkbox cb-modern">
        <span class="text-[10px] px-2.5 py-1 rounded-full font-medium ${statusColor} capitalize">${s.status}</span>
      </div>
      <div class="font-semibold text-sm text-stone-800 group-hover:text-[#1e40af] transition-colors cursor-pointer mb-3" onclick="loadSiklusDetail(${s.id})">${s.nama}</div>
      <div class="flex items-center gap-4 text-xs text-stone-500 mb-3 min-w-0">
        <span class="flex items-center gap-1 overflow-hidden min-w-0"><svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><span class="truncate block">${fmtJenjangBadge(s.kategori_penerima)}</span></span>
        <span class="flex items-center gap-1 shrink-0"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${s.total_hari} hari</span>
        ${fmtSiklusRentang(s) ? `<span class="flex items-center gap-1 shrink-0"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${fmtSiklusRentang(s)}</span>` : ''}
      </div>
      ${s.catatan ? `<div class="text-xs text-stone-400 italic mb-3 line-clamp-1">${s.catatan}</div>` : ''}
      <div class="flex items-center justify-between pt-3 border-t border-stone-100">
        <div class="text-xs text-stone-400">${filledCount} hari terisi</div>
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onclick="event.stopPropagation();loadSiklusDetail(${s.id})" class="w-7 h-7 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Detail"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
          <button onclick="event.stopPropagation();bukaKebutuhanPangan(${s.id})" class="w-7 h-7 flex items-center justify-center text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Kebutuhan"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg></button>
          <button onclick="event.stopPropagation();editSiklus(${s.id})" class="w-7 h-7 flex items-center justify-center text-stone-600 hover:bg-stone-100 rounded-lg transition-colors" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button onclick="event.stopPropagation();duplikasiSiklus(${s.id}, ${s.total_hari})" class="w-7 h-7 flex items-center justify-center text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Duplikat"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
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
    <div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
      <div class="flex items-center gap-3 mb-4"><div class="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-sm"><svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><div><h2 class="text-sm font-bold text-stone-800">${data.nama}</h2><div class="text-xs text-stone-500">Status: <b class="capitalize">${data.status}</b></div></div></div>
      ${data.catatan ? `<div class="text-xs text-stone-400 mb-3">${data.catatan}</div>` : ''}
      <div class="flex flex-wrap gap-1.5 mb-4">
        <button onclick="generateProduksi(${data.id})" class="inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-emerald-200 transition-colors"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Buat Produksi</button>
        <button onclick="hitungBudgetSiklus(${data.id})" class="inline-flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-blue-200 transition-colors"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Buat Budget</button>
        <button onclick="renderProduksiHarian(${data.id})" class="inline-flex items-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-700 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-amber-200 transition-colors"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Produksi Harian</button>
        <button onclick="renderSiklusLaporan(${data.id})" class="inline-flex items-center gap-1 bg-violet-50 hover:bg-violet-100 text-violet-700 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-violet-200 transition-colors"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Laporan + SP</button>
        <button onclick="editSiklus(${data.id})" class="inline-flex items-center gap-1 bg-white hover:bg-stone-50 text-stone-600 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-stone-200 transition-colors"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit</button>
        <button onclick="document.getElementById('siklus-detail').innerHTML=''" class="inline-flex items-center gap-1 text-stone-400 hover:text-stone-600 px-3 py-1.5 rounded-lg text-xs transition-colors">Tutup</button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        ${data.items.map(it => {
          const totalK = Number(it.kalori || 0) + Number(it.protein || 0) + Number(it.karbohidrat || 0) + Number(it.lemak || 0) + Number(it.serat || 0);
          return `<div class="bg-white border border-stone-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
            <div class="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-2">Hari ${it.hari_ke} — ${it.hari_nama}</div>
            <div class="font-bold text-sm mb-1">${it.menu_nama || (it._has_bahan ? '<span class="text-emerald-600">Manual (grid)</span>' : '<span class="text-stone-400">Belum diisi</span>')}</div>
            <div class="text-xs text-stone-500 mb-2">${fmtNum(it.jumlah_porsi)} porsi</div>
            ${(it.menu_nama || it._has_bahan) ? `<div class="grid grid-cols-3 gap-1 text-[10px] mb-2">
              <div class="bg-stone-50 rounded-lg p-1 text-center"><div class="text-stone-400">Kal</div><div class="mono font-semibold">${fmtNum(it.kalori)}</div></div>
              <div class="bg-stone-50 rounded-lg p-1 text-center"><div class="text-stone-400">Prot</div><div class="mono font-semibold">${fmtNum(it.protein)}</div></div>
              <div class="bg-stone-50 rounded-lg p-1 text-center"><div class="text-stone-400">Karb</div><div class="mono font-semibold">${fmtNum(it.karbohidrat)}</div></div>
              <div class="bg-stone-50 rounded-lg p-1 text-center"><div class="text-stone-400">Lem</div><div class="mono font-semibold">${fmtNum(it.lemak)}</div></div>
              <div class="bg-stone-50 rounded-lg p-1 text-center"><div class="text-stone-400">Ser</div><div class="mono font-semibold">${fmtNum(it.serat)}</div></div>
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
      const byDay = gridRes && gridRes.byDay;
      if (byDay) {
        bahanGrid = {};
        for (const [hariKe, categories] of Object.entries(byDay)) {
          bahanGrid[Number(hariKe)] = categories;
        }
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
    <div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
      <div class="flex flex-wrap justify-between items-center mb-4 gap-2">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center shadow-sm"><svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
          <div>
            <h2 class="text-sm font-bold text-stone-800">Laporan: ${siklus.nama}</h2>
            <div class="text-xs text-stone-500">Status: <b class="capitalize">${siklus.status}</b></div>
          </div>
        </div>
        <div class="flex gap-1.5">
          <button onclick="hitungSpSiklus(${id})" class="inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-emerald-200 transition-colors"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Hitung SP</button>
          <button onclick="exportSiklusLaporan(${id})" class="inline-flex items-center gap-1 bg-white hover:bg-stone-50 text-stone-600 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-stone-200 transition-colors"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> CSV</button>
          <button onclick="window.print()" class="inline-flex items-center gap-1 bg-white hover:bg-stone-50 text-stone-600 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-stone-200 transition-colors"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print</button>
          <button onclick="loadSiklusDetail(${id})" class="text-stone-400 hover:text-stone-600 px-3 py-1.5 rounded-lg text-xs transition-colors">Kembali</button>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        <div class="bg-gradient-to-br from-stone-50 to-stone-100/60 rounded-2xl border border-stone-200/60 p-4 shadow-sm">
          <div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-stone-600">Total Hari</span><svg class="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg></div>
          <div class="text-2xl font-bold text-stone-800">${stats.totalDays}</div>
        </div>
        <div class="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200/60 p-4 shadow-sm">
          <div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Terisi</span><svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
          <div class="text-2xl font-bold text-blue-800">${stats.filledDays}</div>
          <div class="text-[10px] text-blue-600/70">${stats.coverage}% coverage</div>
        </div>
        <div class="bg-gradient-to-br from-orange-50 to-orange-100/60 rounded-2xl border border-orange-200/60 p-4 shadow-sm">
          <div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-orange-700">Kosong</span><svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg></div>
          <div class="text-2xl font-bold text-orange-800">${stats.emptyDays}</div>
        </div>
        <div class="bg-gradient-to-br from-sky-50 to-sky-100/60 rounded-2xl border border-sky-200/60 p-4 shadow-sm">
          <div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold uppercase tracking-wider text-sky-700">Menu Unik</span><svg class="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
          <div class="text-2xl font-bold text-sky-800">${stats.uniqueMenus}</div>
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 mb-4">
        <div class="font-bold text-sm text-stone-800 mb-3">Rata-rata Gizi per Orang per Hari</div>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div class="text-center bg-stone-50 rounded-xl p-3">
            <div class="text-[10px] text-stone-500">Kalori</div>
            <div class="mono text-lg font-bold text-stone-800">${fmtNum(Math.round(stats.avg.kalori / (siklus.jumlah_porsi || 1)))} <span class="text-xs text-stone-400">kkal</span></div>
          </div>
          <div class="text-center bg-stone-50 rounded-xl p-3">
            <div class="text-[10px] text-stone-500">Protein</div>
            <div class="mono text-lg font-bold text-stone-800">${fmtNum(Math.round(stats.avg.protein / (siklus.jumlah_porsi || 1)))} <span class="text-xs text-stone-400">g</span></div>
          </div>
          <div class="text-center bg-stone-50 rounded-xl p-3">
            <div class="text-[10px] text-stone-500">Karbohidrat</div>
            <div class="mono text-lg font-bold text-stone-800">${fmtNum(Math.round(stats.avg.karbohidrat / (siklus.jumlah_porsi || 1)))} <span class="text-xs text-stone-400">g</span></div>
          </div>
          <div class="text-center bg-stone-50 rounded-xl p-3">
            <div class="text-[10px] text-stone-500">Lemak</div>
            <div class="mono text-lg font-bold text-stone-800">${fmtNum(Math.round(stats.avg.lemak / (siklus.jumlah_porsi || 1)))} <span class="text-xs text-stone-400">g</span></div>
          </div>
          <div class="text-center bg-stone-50 rounded-xl p-3">
            <div class="text-[10px] text-stone-500">Serat</div>
            <div class="mono text-lg font-bold text-stone-800">${fmtNum(Math.round(stats.avg.serat / (siklus.jumlah_porsi || 1)))} <span class="text-xs text-stone-400">g</span></div>
          </div>
        </div>
      </div>

      ${data.spComparison && data.spComparison.length ? `
      <div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-4">
        <div class="px-5 py-3 font-semibold text-sm text-stone-800 border-b border-stone-200 flex items-center justify-between">
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
                const realVal = Number(sp.realized) || 0;
                const targetVal = Number(sp.target) || 0;
                const selisih = Math.round((realVal - targetVal) * 100) / 100;
                const persen = targetVal > 0 ? Math.round((realVal / targetVal) * 100) : (realVal > 0 ? 999 : 0);
                const selisihClass = selisih >= 0 ? 'text-emerald-600' : 'text-red-600';
                const statusClass = persen >= 100 ? 'bg-emerald-100 text-emerald-700' : targetVal === 0 && realVal === 0 ? 'bg-stone-100 text-stone-500' : 'bg-red-100 text-red-700';
                const statusLabel = persen >= 100 ? '✓ Terpenuhi' : targetVal === 0 && realVal === 0 ? '—' : '✗ Kurang';
                const barWidth = Math.min(100, persen);
                const barColor = persen >= 100 ? 'bg-emerald-500' : persen >= 75 ? 'bg-amber-500' : 'bg-red-500';
                return `<tr class="border-t border-stone-100 hover:bg-stone-50/50">
                  <td class="px-4 py-2.5 font-medium whitespace-nowrap">${sp.kategori}</td>
                  <td class="px-3 py-2.5 text-center mono font-semibold">${targetVal}</td>
                  <td class="px-3 py-2.5 text-center mono font-semibold">${realVal}</td>
                  <td class="px-3 py-2.5 text-center mono font-semibold ${selisihClass}">${selisih > 0 ? '+' : ''}${selisih}</td>
                  <td class="px-3 py-2.5">
                    <div class="w-full bg-stone-200 rounded-full h-2.5">
                      <div class="${barColor} h-2.5 rounded-full transition-all duration-500" style="width:${barWidth}%"></div>
                    </div>
                    <div class="text-[10px] text-stone-400 text-center mt-0.5">${persen}%</div>
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

      <div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <div class="px-5 py-3 font-semibold text-sm text-stone-800 border-b border-stone-200">Rincian per Hari</div>
        <div class="overflow-x-auto">
          <table class="w-full text-[11px]">
            <thead class="bg-stone-50">
              <tr>
                <th class="text-left px-3 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider whitespace-nowrap border-r border-stone-200">Hari</th>
                <th class="text-left px-3 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider whitespace-nowrap border-r border-stone-200">Menu</th>
                <th class="text-right px-3 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider whitespace-nowrap border-r border-stone-200">Porsi</th>
                <th class="text-right px-3 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider whitespace-nowrap border-r border-stone-200">Kalori <span class="text-stone-400 font-normal">/org</span></th>
                <th class="text-right px-3 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider whitespace-nowrap border-r border-stone-200">Protein <span class="text-stone-400 font-normal">/org</span></th>
                <th class="text-right px-3 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider whitespace-nowrap border-r border-stone-200">Karbohidrat <span class="text-stone-400 font-normal">/org</span></th>
                <th class="text-right px-3 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider whitespace-nowrap border-r border-stone-200">Lemak <span class="text-stone-400 font-normal">/org</span></th>
                <th class="text-right px-3 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wider whitespace-nowrap">Serat <span class="text-stone-400 font-normal">/org</span></th>
              </tr>
            </thead>
            <tbody>
              ${items.map(it => `<tr class="border-t border-stone-100 hover:bg-stone-50/50">
                <td class="px-3 py-2.5 text-xs whitespace-nowrap border-r border-stone-100">Hari ${it.hari_ke} · ${it.hari_nama}</td>
                <td class="px-3 py-2.5 text-xs border-r border-stone-100">${it.menu_nama || '<span class="text-stone-400">—</span>'}</td>
                <td class="px-3 py-2.5 text-xs text-right mono border-r border-stone-100 whitespace-nowrap">${fmtNum(it.jumlah_porsi)}</td>
                <td class="px-3 py-2.5 text-xs text-right mono border-r border-stone-100 whitespace-nowrap">${fmtNum(Math.round(it.kalori / (it.jumlah_porsi || 1)))}</td>
                <td class="px-3 py-2.5 text-xs text-right mono border-r border-stone-100 whitespace-nowrap">${fmtNum(Math.round(it.protein / (it.jumlah_porsi || 1)))}</td>
                <td class="px-3 py-2.5 text-xs text-right mono border-r border-stone-100 whitespace-nowrap">${fmtNum(Math.round(it.karbohidrat / (it.jumlah_porsi || 1)))}</td>
                <td class="px-3 py-2.5 text-xs text-right mono border-r border-stone-100 whitespace-nowrap">${fmtNum(Math.round(it.lemak / (it.jumlah_porsi || 1)))}</td>
                <td class="px-3 py-2.5 text-xs text-right mono whitespace-nowrap">${fmtNum(Math.round(it.serat / (it.jumlah_porsi || 1)))}</td>
              </tr>
              ${it.menu_id ? `<tr class="bg-stone-50/50">
                <td colspan="8" class="px-3 py-2">
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
      const byDay = gridRes && gridRes.byDay;
      if (byDay) {
        bahanGrid = {};
        for (const [hariKe, categories] of Object.entries(byDay)) {
          bahanGrid[Number(hariKe)] = categories;
        }
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

// ===== Laporan Produksi Harian per Siklus =====
async function renderProduksiHarian(id) {
  var wrap = document.getElementById('siklus-detail');
  if (!wrap) return;
  wrap.scrollIntoView({ behavior: 'smooth' });
  
  wrap.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  
  try {
    var data = await api.get('/siklus/' + id + '/laporan/produksi-harian');
    var { siklus, ringkasan, days } = data;
    
    var html = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">';
    
    // Header
    html += '<div class="flex flex-wrap justify-between items-center mb-4 gap-2">' +
      '<div>' +
        '<h3 class="font-bold text-lg">📋 Laporan Produksi Harian</h3>' +
        '<div class="text-sm font-medium text-stone-700 mt-1">' + siklus.nama + '</div>' +
        '<div class="text-xs text-stone-500">Status: <b class="capitalize">' + siklus.status + '</b></div>' +
      '</div>' +
      '<div class="flex gap-2">' +
        '<button onclick="loadSiklusDetail(' + id + ')" class="px-3 py-1.5 text-sm border border-stone-300 rounded hover:bg-stone-50">← Kembali ke Siklus</button>' +
        '<button onclick="exportProduksiHarian(' + id + ')" class="inline-flex items-center gap-1.5 text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-lg shadow-sm transition-colors" title="Export Laporan Produksi Harian ke Excel"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Export XLSX</button>' +
      '</div>' +
    '</div>';
    
    // Ringkasan cards
    html += '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">' +
      '<div class="bg-amber-50 rounded-lg p-4">' +
        '<div class="text-xs text-amber-700 uppercase font-medium">Total Hari</div>' +
        '<div class="text-2xl font-bold text-amber-800 mt-1">' + ringkasan.total_hari + '</div>' +
      '</div>' +
      '<div class="bg-emerald-50 rounded-lg p-4">' +
        '<div class="text-xs text-emerald-700 uppercase font-medium">Hari Terisi</div>' +
        '<div class="text-2xl font-bold text-emerald-800 mt-1">' + ringkasan.hari_terisi + '</div>' +
        '<div class="text-xs text-emerald-600 mt-1">' + (ringkasan.total_hari ? Math.round(ringkasan.hari_terisi / ringkasan.total_hari * 100) : 0) + '% coverage</div>' +
      '</div>' +
      '<div class="bg-blue-50 rounded-lg p-4">' +
        '<div class="text-xs text-blue-700 uppercase font-medium">Total Penerima</div>' +
        '<div class="text-2xl font-bold text-blue-800 mt-1">' + fmtNum(ringkasan.total_penerima) + '</div>' +
        '<div class="text-xs text-blue-600">porsi/hari</div>' +
      '</div>' +
      '<div class="bg-orange-50 rounded-lg p-4">' +
        '<div class="text-xs text-orange-700 uppercase font-medium">Total Kebutuhan</div>' +
        '<div class="text-2xl font-bold text-orange-800 mt-1">' + fmtNum(ringkasan.total_kebutuhan_kg) + '</div>' +
        '<div class="text-xs text-orange-600">kg (semua hari)</div>' +
      '</div>' +
    '</div>';
    
    if (!days || !days.length) {
      html += '<div class="text-center py-16 text-stone-400">Tidak ada data</div>';
    } else {
      // Per-day tables
      for (var d of days) {
        // Flatten bahan_by_kat into bahan array
        d.bahan = [];
        if (d.bahan_by_kat) {
          for (var katGroup of d.bahan_by_kat) {
            for (var item of katGroup.items) {
              d.bahan.push(item);
            }
          }
        }
        
        if (!d.bahan || !d.bahan.length) {
          html += '<div class="bg-stone-50 border border-dashed border-stone-300 rounded-lg p-5 mb-4 text-center text-sm text-stone-400">' +
            '<div class="font-semibold text-stone-600 mb-1">Hari ' + d.hari_ke + ' — ' + d.hari_nama + '</div>' +
            '<div class="italic">' + (d.menu_nama || 'Belum diisi') + '</div>' +
            '<div class="text-xs mt-2">Tidak ada bahan</div>' +
          '</div>';
          continue;
        }
        
        html += '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-4">';
        
        // Day header
        html += '<div class="px-5 py-3 bg-stone-50 border-b border-stone-200">' +
          '<div class="flex items-center justify-between">' +
            '<div>' +
              '<div class="font-bold text-stone-700">Hari ' + d.hari_ke + ' — ' + d.hari_nama + '</div>' +
              '<div class="text-sm text-emerald-700 font-medium mt-0.5">' + d.menu_nama + '</div>' +
            '</div>' +
            '<div class="text-right text-xs text-stone-500">' +
              '<div>Porsi: <b>' + fmtNum(d.jumlah_porsi) + '</b></div>' +
              '<div>Total: <b class="text-amber-700">' + fmtNum(d.total_kebutuhan_kg) + ' kg</b></div>' +
            '</div>' +
          '</div>' +
        '</div>';
        
        // Table — format: Bahan | Kg/pcs/btl (net) | Ket (catatan + gross)
        html += '<div class="overflow-x-auto"><table class="w-full text-xs">' +
          '<thead class="bg-stone-50/50"><tr>' +
            '<th class="text-left px-4 py-2.5 font-semibold uppercase text-[10px] text-stone-500">Bahan</th>' +
            '<th class="text-right px-3 py-2.5 font-semibold uppercase text-[10px] text-stone-500">Kg/pcs/btl</th>' +
            '<th class="text-left px-3 py-2.5 font-semibold uppercase text-[10px] text-stone-500">Ket</th>' +
          '</tr></thead><tbody>';
        
        for (var b of d.bahan) {
          var satuan = b.satuan || 'g';
          var perUnit = Number(b.berat_per_satuan) || Number(b.berat_1_sp) || 1;
          // NET total (after BDD) — what's actually served
          var netGram = b.berat_bersih || 0;
          var displayNet = satuan === 'Kg' ? fmtNum(netGram / 1000) + ' kg' :
            (satuan === 'g' || satuan === 'gram') ? Math.round(netGram) + ' g' :
            perUnit > 0 ? (function(){ var v = netGram / perUnit; return (v >= 10 ? Math.round(v) : fmtNum(v)) + ' ' + satuan; })() :
            fmtNum(netGram / 1000) + ' kg';
          // GROSS total (before BDD) — what to purchase
          var grossGram = b.berat_kotor || 0;
          var displayGross = satuan === 'Kg' ? fmtNum(grossGram / 1000) + ' kg' :
            (satuan === 'g' || satuan === 'gram') ? Math.round(grossGram) + ' g' :
            perUnit > 0 ? (function(){ var v = grossGram / perUnit; return (v >= 10 ? Math.round(v) : fmtNum(v)) + ' ' + satuan; })() :
            fmtNum(grossGram / 1000) + ' kg';
          // Ket column: processing notes + gross total
          var ketParts = [];
          if (b.keterangan) ketParts.push(b.keterangan);
          if (b.persen_bdd < 100) {
            var grossLabel = satuan === 'Kg' ? '' : 'Gross ';
            ketParts.push(grossLabel + displayGross);
          }
          if (b.buffer_persen > 0) ketParts.push('Buffer ' + b.buffer_persen + '%');
          var ketStr = ketParts.join(' • ');
          
          html += '<tr class="border-t border-stone-100 hover:bg-stone-50/50 transition-colors">' +
            '<td class="px-4 py-2.5 font-medium text-stone-700">' + b.nama + '</td>' +
            '<td class="px-3 py-2.5 text-right mono font-bold text-stone-800">' + displayNet + '</td>' +
            '<td class="px-3 py-2.5 text-xs text-stone-400">' + ketStr + '</td>' +
          '</tr>';
        }
        
        html += '</tbody></table></div></div>';
      }
    }
    
    // Grand total footer
    html += '<div class="bg-gradient-to-r from-amber-50 to-amber-100/60 border border-amber-200 rounded-2xl p-4 flex items-center justify-between mt-2 shadow-sm">' +
      '<div class="text-sm text-amber-800">' +
        '<span class="font-semibold">Grand Total Kebutuhan:</span> ' + fmtNum(ringkasan.total_kebutuhan_kg) + ' kg untuk ' + ringkasan.total_hari + ' hari' +
        ' (' + ringkasan.hari_terisi + ' hari terisi)' +
      '</div>' +
      '<div class="text-amber-600 text-xs">' + siklus.nama + '</div>' +
    '</div>';
    
    html += '</div>'; // close wrapper
    
    wrap.innerHTML = html;
    window['_produksiHarian_' + id] = { siklus, ringkasan, days };
    
  } catch (e) {
    console.error('Produksi harian render error:', e);
    wrap.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat laporan produksi harian: ' + e.message + '</div>';
  }
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
    var html = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mt-4">' +
      '<div class="px-5 py-3 font-semibold text-sm text-stone-800 border-b border-stone-200 flex justify-between items-center">' +
        '<span>Perhitungan Kebutuhan Bahan (SP)</span>' +
        '<span class="text-sm font-normal text-stone-500">Total: <span class="mono font-bold text-emerald-700">' + totalKg + ' kg</span></span>' +
      '</div>' +
      '<div class="overflow-x-auto"><table class="w-full">' +
      '<thead class="bg-stone-50"><tr>' +
        '<th class="text-left px-4 py-3 text-xs font-semibold uppercase">Bahan</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">Kat. SP</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">Per Porsi</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">Total</th>' +
        '<th class="text-left px-4 py-3 text-xs font-semibold uppercase">Ket</th>' +
      '</tr></thead><tbody>' +
      items.map(function(b) {
        var ketParts = [];
        if (b.persen_bdd < 100) ketParts.push('BDD ' + b.persen_bdd + '%');
        if (b.buffer_persen > 0) ketParts.push('Buffer ' + b.buffer_persen + '%');
        var ketStr = ketParts.length ? ketParts.join(' • ') : '';
        return '<tr class="border-t border-stone-100">' +
          '<td class="px-4 py-3 text-sm font-medium">' + b.nama + '</td>' +
          '<td class="px-4 py-3 text-sm text-right">' + (b.kategori_sp || '-') + '</td>' +
          '<td class="px-4 py-3 text-sm text-right mono">' + formatPerPorsi(b) + '</td>' +
          '<td class="px-4 py-3 text-sm text-right mono font-bold">' + formatTotalUnit(b) + '</td>' +
          '<td class="px-4 py-3 text-sm text-stone-400">' + ketStr + '</td>' +
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

function exportProduksiHarian(id) {
  const { siklus, ringkasan, days } = window['_produksiHarian_' + id] || {};
  if (!siklus) return showAlert('Data laporan produksi belum dimuat', 'warning');

  function displayNet(b) {
    const satuan = b.satuan || 'g';
    const perUnit = Number(b.berat_per_satuan) || Number(b.berat_1_sp) || 1;
    const netGram = Number(b.berat_bersih) || 0;
    if (satuan === 'Kg') return (netGram / 1000);
    if (satuan === 'g' || satuan === 'gram') return Math.round(netGram);
    if (perUnit > 0) { const v = netGram / perUnit; return v >= 10 ? Math.round(v) : v; }
    return netGram / 1000;
  }
  function displayGross(b) {
    const satuan = b.satuan || 'g';
    const perUnit = Number(b.berat_per_satuan) || Number(b.berat_1_sp) || 1;
    const grossGram = Number(b.berat_kotor) || 0;
    if (satuan === 'Kg') return (grossGram / 1000);
    if (satuan === 'g' || satuan === 'gram') return Math.round(grossGram);
    if (perUnit > 0) { const v = grossGram / perUnit; return v >= 10 ? Math.round(v) : v; }
    return grossGram / 1000;
  }

  const rows = [
    ['LAPORAN PRODUKSI HARIAN', siklus.nama],
    ['Status', siklus.status],
    ['Jumlah Porsi', siklus.jumlah_porsi],
    ['Total Hari', ringkasan.total_hari],
    ['Hari Terisi', ringkasan.hari_terisi],
    ['Total Penerima', ringkasan.total_penerima],
    ['Total Kebutuhan (kg)', ringkasan.total_kebutuhan_kg],
    [],
  ];
  for (const d of (days || [])) {
    const bahan = [];
    if (d.bahan_by_kat) for (const katGroup of d.bahan_by_kat) for (const item of katGroup.items) bahan.push(item);
    if (!bahan.length) continue;
    rows.push(['HARI ' + d.hari_ke + ' — ' + d.hari_nama, d.menu_nama, 'Porsi: ' + d.jumlah_porsi, 'Total: ' + d.total_kebutuhan_kg + ' kg']);
    rows.push(['Bahan', 'Kg/pcs/btl (net)', 'Gross', 'Keterangan']);
    for (const b of bahan) {
      const ketParts = [];
      if (b.keterangan) ketParts.push(b.keterangan);
      if (Number(b.persen_bdd) < 100) ketParts.push((b.satuan === 'Kg' ? '' : 'Gross ') + displayGross(b) + (b.satuan === 'Kg' ? ' kg' : ' ' + b.satuan));
      if (Number(b.buffer_persen) > 0) ketParts.push('Buffer ' + b.buffer_persen + '%');
      rows.push([b.nama, displayNet(b), displayGross(b), ketParts.join(' • ')]);
    }
    rows.push([]);
  }
  rows.push(['GRAND TOTAL', '', '', '', '', '', ringkasan.total_kebutuhan_kg + ' kg untuk ' + ringkasan.total_hari + ' hari (' + ringkasan.hari_terisi + ' hari terisi)']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Produksi Harian');
  XLSX.writeFile(wb, 'laporan-produksi-harian-' + siklus.id + '.xlsx');
}

async function deleteSiklus(id) {
  if (!await showConfirm('Hapus siklus ini? Semua item di dalamnya akan terhapus.')) return;
  await api.del('/siklus/' + id);
  document.getElementById('siklus-detail').innerHTML = '';
  reloadSiklusList();
}

async function duplikasiSiklus(id, totalHari) {
  // Tampilkan modal rentang hari
  const modalId = 'siklus-duplikasi-modal';
  
  // Hapus modal lama jika ada
  const existing = document.getElementById(modalId);
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.id = modalId;
  modal.className = 'fixed inset-0 z-[80] flex items-center justify-center bg-black/40';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-6" onclick="event.stopPropagation()">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-sm">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </div>
        <div>
          <h3 class="font-bold text-sm text-stone-800">Duplikasi Siklus</h3>
          <p class="text-xs text-stone-500">Pilih rentang hari yang akan di-duplikasi</p>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3 mb-5">
        <div>
          <label class="text-xs font-semibold text-stone-600 uppercase tracking-wider mb-1.5 block">Dari Hari ke</label>
          <input id="dpl-dari" type="number" min="1" max="${totalHari}" value="1"
            class="w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all mono">
        </div>
        <div>
          <label class="text-xs font-semibold text-stone-600 uppercase tracking-wider mb-1.5 block">Sampai Hari ke</label>
          <input id="dpl-sampai" type="number" min="1" max="${totalHari}" value="${totalHari}"
            class="w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all mono">
        </div>
      </div>
      <div class="text-xs text-stone-400 mb-4 bg-stone-50 rounded-lg px-3 py-2">
        Total hari: <span id="dpl-total-hari" class="font-semibold text-stone-700">${totalHari}</span>
      </div>
      <div class="flex justify-end gap-2">
        <button id="dpl-batal" class="px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-lg transition-colors">Batal</button>
        <button id="dpl-ok" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">Duplikat</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Animasi masuk
  const content = modal.querySelector('div');
  content.classList.add('opacity-0', 'scale-95', 'transition-all', 'duration-200');
  requestAnimationFrame(() => {
    content.classList.remove('opacity-0', 'scale-95');
    content.classList.add('opacity-100', 'scale-100');
  });
  
  // Update total hari live
  const dariInput = document.getElementById('dpl-dari');
  const sampaiInput = document.getElementById('dpl-sampai');
  const totalSpan = document.getElementById('dpl-total-hari');
  function updateTotal() {
    const d = parseInt(dariInput.value) || 1;
    const s = parseInt(sampaiInput.value) || totalHari;
    const t = Math.max(0, s - d + 1);
    totalSpan.textContent = t > 0 ? t : 0;
  }
  dariInput.addEventListener('input', updateTotal);
  sampaiInput.addEventListener('input', updateTotal);
  
  // Close function
  function closeModal() {
    content.classList.add('opacity-0', 'scale-95');
    content.classList.remove('opacity-100', 'scale-100');
    setTimeout(() => modal.remove(), 200);
  }
  
  // Handler OK
  document.getElementById('dpl-ok').onclick = async () => {
    const d = parseInt(dariInput.value) || 1;
    const s = parseInt(sampaiInput.value) || totalHari;
    
    if (d < 1 || s > totalHari || d > s) {
      showAlert('Rentang hari tidak valid (1-' + totalHari + ')', 'warning');
      return;
    }
    
    closeModal();
    
    try {
      const result = await api.post('/siklus/' + id + '/duplicate', { hari_mulai: d, hari_akhir: s });
      showToast('Siklus "' + result.nama + '" berhasil diduplikasi', 'success');
      document.getElementById('siklus-detail').innerHTML = '';
      reloadSiklusList();
    } catch (e) {
      showToast('Gagal menduplikasi siklus: ' + (e.message || 'Unknown error'), 'error');
    }
  };
  
  // Handler Batal & klik luar
  document.getElementById('dpl-batal').onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
  
  // Focus input pertama
  dariInput.focus();
}

function toggleSelectAll(master) {
  document.querySelectorAll('.siklus-checkbox').forEach(cb => cb.checked = master.checked);
  updateSelectedCount();
}

function updateSelectedCount() {
  var checked = document.querySelectorAll('.siklus-checkbox:checked').length;
  var btn = document.getElementById('siklus-delete-selected');
  var div = document.getElementById('siklus-divider-selected');
  var countEl = document.getElementById('siklus-selected-count');
  if (!btn || !countEl) return;
  if (checked > 0) {
    btn.classList.remove('hidden');
    btn.classList.add('inline-flex');
    if (div) div.classList.remove('hidden');
    countEl.textContent = checked;
  } else {
    btn.classList.add('hidden');
    btn.classList.remove('inline-flex');
    if (div) div.classList.add('hidden');
  }
}

// ===== Siklus → Produksi (modal modern) =====

// Konversi nilai tanggal (Date / ISO / "YYYY-MM-DD") menjadi "YYYY-MM-DD" lokal WIB.
function _pmYmdFromValue(v) {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  var d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  var wib = new Date(d.getTime() + 7 * 3600 * 1000);
  return wib.getUTCFullYear() + '-' + String(wib.getUTCMonth() + 1).padStart(2, '0') + '-' + String(wib.getUTCDate()).padStart(2, '0');
}
function _pmYmd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _pmParse(s) {
  var p = String(s).split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}
function _pmAddDays(ymd, days) {
  var d = _pmParse(ymd);
  d.setDate(d.getDate() + days);
  return _pmYmd(d);
}
function _pmDayDiff(a, b) { // b - a in days
  return Math.round((_pmParse(b) - _pmParse(a)) / 86400000);
}
function _pmClamp(ymd, min, max) {
  if (min && ymd < min) return min;
  if (max && ymd > max) return max;
  return ymd;
}

// Dialog "Buat Produksi" modern — mode 1 hari atau rentang tanggal.
function openProduksiModal(siklusId, mode) {
  var existing = document.getElementById('produksi-modal');
  if (existing) existing.remove();

  api.get('/siklus/' + siklusId).then(function(siklus) {
    var mulai = _pmYmdFromValue(siklus.tanggal_mulai);
    var selesai = _pmYmdFromValue(siklus.tanggal_selesai);
    var totalHari = Math.max(1, Number(siklus.total_hari) || 7);
    var today = _pmYmd(new Date());

    var defSingle = today;
    if (mulai && selesai) defSingle = _pmClamp(today, mulai, selesai);
    else if (mulai) defSingle = today >= mulai ? today : mulai;
    var defStart = defSingle;
    var defEnd = selesai && selesai >= today ? (selesai < _pmAddDays(today, 6) ? selesai : _pmAddDays(today, 6)) : (selesai || _pmAddDays(today, 6));
    if (defEnd < defStart) defEnd = defStart;

    var m = document.createElement('div');
    m.id = 'produksi-modal';
    m.className = 'fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4';
    m.innerHTML =
      '<div class="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-hidden transform transition-all duration-200 scale-95 opacity-0">' +
        '<div class="flex items-center gap-3 px-5 py-4 border-b border-stone-100 dark:border-stone-800 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white">' +
          '<div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>' +
          '<div class="flex-1 min-w-0"><h3 class="font-bold text-sm leading-tight">Buat Produksi</h3>' +
            '<p class="text-emerald-100 text-xs truncate mt-0.5">' + escHtml(siklus.nama || '') + '</p></div>' +
          '<button onclick="closeProduksiModal()" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors" title="Tutup"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
        '</div>' +
        '<div class="p-5 space-y-4 overflow-y-auto" style="max-height:calc(92vh - 132px)">' +
          '<div class="flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/70 dark:border-stone-700/60 text-xs text-stone-600 dark:text-stone-300">' +
            '<span class="inline-flex items-center gap-1"><svg class="w-3.5 h-3.5 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>' + (mulai && selesai ? fmtSiklusRentang(siklus) : (mulai || selesai || 'Tanpa rentang')) + '</span></span>' +
            '<span class="text-stone-300 dark:text-stone-600">•</span>' +
            '<span>' + totalHari + ' hari siklus</span>' +
            '<span class="text-stone-300 dark:text-stone-600">•</span>' +
            '<span>' + (Number(siklus.jumlah_porsi) || 0) + ' porsi/hari</span>' +
          '</div>' +

          '<div>' +
            '<div class="flex items-center gap-1 p-1 rounded-xl bg-stone-100 dark:bg-stone-800 w-fit border border-stone-200 dark:border-stone-700">' +
              '<button id="pm-tab-single" onclick="pmSwitchMode(\'single\')" class="px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all">1 Hari</button>' +
              '<button id="pm-tab-range" onclick="pmSwitchMode(\'range\')" class="px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all">Rentang Tanggal</button>' +
            '</div>' +
            '<div id="pm-mode-single" class="mt-3">' +
              '<label class="block text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">Tanggal Produksi</label>' +
              '<div class="flex items-center gap-2 mt-1.5">' +
                '<input type="date" id="pm-tgl-single" value="' + defSingle + '" oninput="pmUpdateSummary()" min="' + (mulai || '') + '" max="' + (selesai || '') + '" class="flex-1 h-11 px-3 rounded-xl border border-stone-200 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 text-sm bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all">' +
                '<button onclick="pmSetSingleToday()" class="shrink-0 h-11 px-3 rounded-xl text-xs font-medium border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-colors">Hari Ini</button>' +
              '</div>' +
              '<div id="pm-single-info" class="mt-2"></div>' +
            '</div>' +
            '<div id="pm-mode-range" class="mt-3 hidden">' +
              '<div class="grid grid-cols-2 gap-3">' +
                '<div><label class="block text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">Tanggal Mulai</label>' +
                  '<input type="date" id="pm-tgl-mulai" value="' + defStart + '" oninput="pmSyncRange()" min="' + (mulai || '') + '" max="' + (selesai || '') + '" class="mt-1.5 w-full h-11 px-3 rounded-xl border border-stone-200 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 text-sm bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"></div>' +
                '<div><label class="block text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">Tanggal Selesai</label>' +
                  '<input type="date" id="pm-tgl-selesai" value="' + defEnd + '" oninput="pmSyncRange()" min="' + (mulai || '') + '" max="' + (selesai || '') + '" class="mt-1.5 w-full h-11 px-3 rounded-xl border border-stone-200 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 text-sm bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"></div>' +
              '</div>' +
              '<div class="flex flex-wrap items-center gap-1.5 mt-3">' +
                '<span class="text-[11px] text-stone-400 mr-1">Cepat:</span>' +
                '<button onclick="pmQuick(\'1\')" class="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors">Hari Ini</button>' +
                '<button onclick="pmQuick(\'3\')" class="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors">3 Hari</button>' +
                '<button onclick="pmQuick(\'7\')" class="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors">7 Hari</button>' +
                '<button onclick="pmQuick(\'siklus\')" class="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors">Siklus Penuh</button>' +
              '</div>' +
              '<div id="pm-range-info" class="mt-2"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="px-5 py-4 border-t border-stone-100 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/60 flex items-center justify-between gap-3">' +
          '<div class="text-xs text-stone-500 dark:text-stone-400"><span id="pm-summary" class="font-semibold text-stone-700 dark:text-stone-200"></span></div>' +
          '<div class="flex items-center gap-2">' +
            '<button onclick="closeProduksiModal()" class="h-11 px-4 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">Batal</button>' +
            '<button id="pm-submit" onclick="pmSubmit(' + siklusId + ')" class="h-11 px-5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-colors inline-flex items-center gap-2">' +
              '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Buat Produksi' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    m.onclick = function(e) { if (e.target === m) closeProduksiModal(); };
    document.addEventListener('keydown', _pmKeyHandler);

    window._pmSiklus = { siklusId: siklusId, mulai: mulai, selesai: selesai, totalHari: totalHari, today: today };
    pmSwitchMode(mode || 'single');

    requestAnimationFrame(function() {
      var content = m.querySelector('.transform');
      content.classList.remove('opacity-0', 'scale-95');
      content.classList.add('opacity-100', 'scale-100');
    });
    document.body.style.overflow = 'hidden';
  }).catch(function(e) {
    showAlert('Gagal memuat siklus: ' + (e.message || 'Unknown error'), 'error');
  });
}

function _pmKeyHandler(e) {
  if (e.key === 'Escape') closeProduksiModal();
}

function closeProduksiModal() {
  var m = document.getElementById('produksi-modal');
  if (!m) return;
  document.removeEventListener('keydown', _pmKeyHandler);
  var content = m.querySelector('.transform');
  if (content) {
    content.classList.add('opacity-0', 'scale-95');
    content.classList.remove('opacity-100', 'scale-100');
  }
  setTimeout(function() {
    m.remove();
    document.body.style.overflow = '';
  }, 180);
}

function pmSwitchMode(mode) {
  var single = document.getElementById('pm-mode-single');
  var range = document.getElementById('pm-mode-range');
  var t1 = document.getElementById('pm-tab-single');
  var t2 = document.getElementById('pm-tab-range');
  if (!single || !range) return;
  var on = 'bg-white dark:bg-stone-900 text-emerald-700 dark:text-emerald-300 shadow-sm border border-stone-200 dark:border-stone-600';
  var off = 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200';
  t1.className = 'px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ' + (mode === 'single' ? on : off);
  t2.className = 'px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ' + (mode === 'range' ? on : off);
  single.classList.toggle('hidden', mode !== 'single');
  range.classList.toggle('hidden', mode !== 'range');
  pmUpdateSummary();
}

function pmSetSingleToday() {
  var el = document.getElementById('pm-tgl-single');
  if (!el) return;
  var meta = window._pmSiklus || {};
  el.value = _pmClamp(meta.today || _pmYmd(new Date()), meta.mulai, meta.selesai);
  pmUpdateSummary();
}

function pmSyncRange() {
  var s = document.getElementById('pm-tgl-mulai');
  var e = document.getElementById('pm-tgl-selesai');
  if (!s || !e) return;
  if (e.value && e.value < s.value) e.value = s.value;
  pmUpdateSummary();
}

function pmQuick(kind) {
  var meta = window._pmSiklus || {};
  var s = document.getElementById('pm-tgl-mulai');
  var e = document.getElementById('pm-tgl-selesai');
  if (!s || !e) return;
  var today = meta.today || _pmYmd(new Date());
  var start, end;
  if (kind === 'siklus') {
    start = meta.mulai || today;
    end = meta.selesai || start;
  } else {
    var n = parseInt(kind, 10) || 1;
    start = _pmClamp(today, meta.mulai, meta.selesai);
    end = _pmAddDays(start, n - 1);
    if (meta.selesai && end > meta.selesai) end = meta.selesai;
  }
  s.value = start;
  e.value = end;
  pmSyncRange();
}

// Tampilkan info "hari ke-N" (mode 1 hari) atau jumlah hari (mode rentang).
function pmUpdateSummary() {
  var meta = window._pmSiklus || {};
  var singleInfo = document.getElementById('pm-single-info');
  var rangeInfo = document.getElementById('pm-range-info');
  var summary = document.getElementById('pm-summary');
  var modeRange = document.getElementById('pm-mode-range') && !document.getElementById('pm-mode-range').classList.contains('hidden');

  if (!modeRange && singleInfo) {
    var v = document.getElementById('pm-tgl-single') ? document.getElementById('pm-tgl-single').value : '';
    if (!v) {
      singleInfo.innerHTML = '<div class="text-xs text-amber-600">Pilih tanggal produksi terlebih dahulu.</div>';
    } else if (meta.mulai) {
      var hk = _pmDayDiff(meta.mulai, v) + 1;
      if (hk >= 1 && hk <= meta.totalHari) {
        singleInfo.innerHTML = '<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium border border-emerald-200/70 dark:border-emerald-800">Hari ke-' + hk + ' dari ' + meta.totalHari + ' hari</div>';
      } else {
        singleInfo.innerHTML = '<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-300 text-xs font-medium border border-red-200/70 dark:border-red-800">Tanggal di luar rentang siklus (hari ke-' + hk + ')</div>';
      }
    }
    if (summary) summary.textContent = v ? '1 hari produksi' : '';
    return;
  }

  if (modeRange && rangeInfo) {
    var s = document.getElementById('pm-tgl-mulai') ? document.getElementById('pm-tgl-mulai').value : '';
    var e = document.getElementById('pm-tgl-selesai') ? document.getElementById('pm-tgl-selesai').value : '';
    if (s && e) {
      var n = _pmDayDiff(s, e) + 1;
      var label = n + ' hari produksi';
      if (meta.mulai && meta.selesai) {
        var daysInRange = 0;
        var totalDays = _pmDayDiff(meta.mulai, meta.selesai) + 1;
        for (var i = 0; i < totalDays; i++) {
          var d = _pmAddDays(meta.mulai, i);
          if (d >= s && d <= e) daysInRange++;
        }
        label = n + ' hari dipilih • ' + daysInRange + ' hari valid dalam siklus';
      }
      rangeInfo.innerHTML = '<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium border border-emerald-200/70 dark:border-emerald-800">' + label + '</div>';
      if (summary) summary.textContent = n + ' hari';
      return;
    }
  }

  if (summary) summary.textContent = '';
}

async function pmSubmit(siklusId) {
  var modeRange = !document.getElementById('pm-mode-range').classList.contains('hidden');
  var btn = document.getElementById('pm-submit');
  var payload;
  if (modeRange) {
    var mulai = document.getElementById('pm-tgl-mulai').value;
    var selesai = document.getElementById('pm-tgl-selesai').value;
    if (!mulai || !selesai) { showAlert('Tanggal mulai & selesai wajib diisi', 'warning'); return; }
    if (selesai < mulai) { showAlert('Tanggal selesai tidak boleh sebelum tanggal mulai', 'warning'); return; }
    payload = { siklus_id: siklusId, tanggal_mulai: mulai, tanggal_selesai: selesai };
  } else {
    var tanggal = document.getElementById('pm-tgl-single').value;
    if (!tanggal) { showAlert('Tanggal produksi wajib diisi', 'warning'); return; }
    payload = { siklus_id: siklusId, tanggal_produksi: tanggal };
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>Memproses...';
    btn.className = btn.className.replace('bg-emerald-600', 'bg-emerald-500');
  }

  try {
    var r;
    if (modeRange) {
      r = await api.post('/siklus/generate-produksi-batch', payload);
      var msg = r.created_count + ' produksi berhasil dibuat';
      if (r.skipped_count > 0) msg += ', ' + r.skipped_count + ' sudah ada & dilewati';
      showToast(msg, r.created_count > 0 ? 'success' : 'warning');
    } else {
      r = await api.post('/siklus/generate-produksi', payload);
      showToast(r.message || 'Produksi berhasil dibuat', 'success');
    }
    closeProduksiModal();
  } catch (e) {
    showAlert('❌ ' + (e.message || 'Gagal membuat produksi'), 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Buat Produksi';
      btn.className = btn.className.replace('bg-emerald-500', 'bg-emerald-600');
    }
  }
}

// Wrapper — tetap dipakai tombol "Buat Produksi" di detail siklus.
function generateProduksi(siklusId) {
  openProduksiModal(siklusId, 'single');
}

function generateProduksiBatch(siklusId) {
  openProduksiModal(siklusId, 'range');
}

// Dialog "Hitung Budget / Buat PR" modern — input periode YYYY-MM (gantikan prompt()).
function openBudgetModal(siklusId, mode) {
  var existing = document.getElementById('budget-modal');
  if (existing) existing.remove();

  var defPeriode = new Date().toISOString().slice(0, 7);
  var isSemua = mode === 'semua';
  var isPR = mode === 'pr';

  var header = isPR
    ? { title: 'Buat Purchase Request', sub: siklusId ? 'PR dari semua siklus Aktif' : 'PR dari semua siklus Aktif', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><polyline points="9 14 11 16 15 12"/></svg>', grad: 'from-violet-600 to-violet-500', label: 'Buat PR' }
    : isSemua
      ? { title: 'Hitung Budget Semua Siklus', sub: 'Hitung kebutuhan bahan semua siklus Aktif', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><polyline points="14 7 21 7 21 14"/></svg>', grad: 'from-blue-600 to-blue-500', label: 'Hitung Budget' }
      : { title: 'Hitung Budget Siklus', sub: 'Rincian kebutuhan bahan untuk siklus ini', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>', grad: 'from-blue-600 to-blue-500', label: 'Hitung Budget' };

  var m = document.createElement('div');
  m.id = 'budget-modal';
  m.className = 'fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4';
  m.innerHTML =
    '<div class="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-hidden transform transition-all duration-200 scale-95 opacity-0">' +
      '<div class="flex items-center gap-3 px-5 py-4 border-b border-stone-100 dark:border-stone-800 bg-gradient-to-r ' + header.grad + ' text-white">' +
        '<div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">' + header.icon + '</div>' +
        '<div class="flex-1 min-w-0"><h3 class="font-bold text-sm leading-tight">' + header.title + '</h3>' +
          '<p class="text-white/80 text-xs truncate mt-0.5">' + header.sub + '</p></div>' +
        '<button onclick="closeBudgetModal()" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors" title="Tutup"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
      '</div>' +
      '<div class="p-5 space-y-4">' +
        '<div>' +
          '<label class="block text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">Periode Budget</label>' +
          '<input type="month" id="bd-periode" value="' + defPeriode + '" class="mt-1.5 w-full h-11 px-3 rounded-xl border border-stone-200 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">' +
          '<div id="bd-hint" class="mt-2"></div>' +
        '</div>' +
      '</div>' +
      '<div class="px-5 py-4 border-t border-stone-100 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/60 flex items-center justify-end gap-2">' +
        '<button onclick="closeBudgetModal()" class="h-11 px-4 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">Batal</button>' +
        '<button id="bd-submit" onclick="bdSubmit(' + (siklusId || 'null') + ', \'' + mode + '\')" class="h-11 px-5 rounded-xl text-sm font-semibold text-white shadow-sm transition-colors inline-flex items-center gap-2 ' + (isPR ? 'bg-violet-600 hover:bg-violet-700' : 'bg-blue-600 hover:bg-blue-700') + '">' +
          header.icon + header.label +
        '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(m);
  m.onclick = function(e) { if (e.target === m) closeBudgetModal(); };
  document.addEventListener('keydown', _bdKeyHandler);

  var bd = document.getElementById('bd-periode');
  if (bd) {
    bd.addEventListener('input', bdUpdateHint);
    bd.addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('bd-submit').click(); });
    setTimeout(function() { bd.focus(); }, 100);
  }
  bdUpdateHint();

  requestAnimationFrame(function() {
    var content = m.querySelector('.transform');
    if (content) {
      content.classList.remove('opacity-0', 'scale-95');
      content.classList.add('opacity-100', 'scale-100');
    }
  });
  document.body.style.overflow = 'hidden';
}

function _bdKeyHandler(e) {
  if (e.key === 'Escape') closeBudgetModal();
}

function closeBudgetModal() {
  var m = document.getElementById('budget-modal');
  if (!m) return;
  document.removeEventListener('keydown', _bdKeyHandler);
  var content = m.querySelector('.transform');
  if (content) {
    content.classList.add('opacity-0', 'scale-95');
    content.classList.remove('opacity-100', 'scale-100');
  }
  setTimeout(function() {
    m.remove();
    document.body.style.overflow = '';
  }, 180);
}

function bdUpdateHint() {
  var el = document.getElementById('bd-periode');
  var hint = document.getElementById('bd-hint');
  if (!el || !hint) return;
  var v = el.value;
  if (!v) {
    hint.innerHTML = '<div class="text-xs text-amber-600">Pilih periode terlebih dahulu.</div>';
    return;
  }
  if (!/^\d{4}-\d{2}$/.test(v)) {
    hint.innerHTML = '<div class="text-xs text-red-600">Format periode salah. Gunakan YYYY-MM.</div>';
    return;
  }
  var nama = { '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April', '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus', '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember' };
  hint.innerHTML = '<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-200/70 dark:border-blue-800">' + (nama[v.slice(5)] || v.slice(5)) + ' ' + v.slice(0, 4) + '</div>';
}

async function bdSubmit(siklusId, mode) {
  var el = document.getElementById('bd-periode');
  var btn = document.getElementById('bd-submit');
  var periode = el ? el.value : '';
  if (!periode) { showAlert('Periode wajib diisi', 'warning'); return; }
  if (!/^\d{4}-\d{2}$/.test(periode)) { showAlert('Format periode salah. Gunakan YYYY-MM', 'error'); return; }
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>Memproses...';
  }
  try {
    var r;
    if (mode === 'pr') {
      r = await api.post('/siklus/buat-pr', { periode: periode });
    } else if (mode === 'semua') {
      r = await api.post('/siklus/hitung-budget-semua', { periode: periode });
    } else {
      r = await api.post('/siklus/hitung-budget', { siklus_id: siklusId, periode: periode });
    }
    closeBudgetModal();
    showAlert('✅ ' + r.message, 'success');
  } catch (e) {
    showAlert('❌ ' + (e.message || 'Gagal'), 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><polyline points="14 7 21 7 21 14"/></svg>' + (mode === 'pr' ? 'Buat PR' : 'Hitung Budget');
    }
  }
}

async function hitungBudgetSiklus(siklusId) {
  openBudgetModal(siklusId, 'siklus');
}

async function hitungBudgetSemuaSiklus() {
  openBudgetModal(null, 'semua');
}

async function buatPRSiklus() {
  openBudgetModal(null, 'pr');
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
  try {
    const data = await api.get('/siklus/' + id);
    openSiklusForm(data);
  } catch (e) {
    showToast('Gagal memuat siklus: ' + (e.message || 'Unknown error'), 'error');
  }
}
function bukaKebutuhanPangan(id) {
  window._pbdPendingSiklusId = id;
  navigate('perhitungan-bdd');
}

// Dari notifikasi (dropdown bel): navigasi ke halaman siklus lalu langsung buka halaman edit siklus tsb.
function bukaSiklusDariNotif(id) {
  window._siklusPendingDetailId = id;
  navigate('siklus');
}

function fmtJenjang(kp) {
  if (!kp) return 'Semua';
  try { var p = JSON.parse(kp); if (Array.isArray(p)) return p.join(' + '); } catch {}
  return kp;
}
function fmtJenjangBadge(kp) {
  if (!kp) return 'Semua';
  try { var p = JSON.parse(kp); if (Array.isArray(p)) {
    if (p.length === 1) return p[0];
    if (p.length === 2) return p.join(' & ');
    return '<span class="inline-flex items-center gap-0.5"><span class="truncate max-w-[80px]">' + p[0] + '</span><span class="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0">+' + (p.length - 1) + '</span></span>';
  }} catch {}
  return kp;
}
function getJenjangChecked(kategoriPenerima, val) {
  if (!kategoriPenerima) return false;
  try { var p = JSON.parse(kategoriPenerima); if (Array.isArray(p)) return p.indexOf(val) !== -1; } catch {}
  return kategoriPenerima === val;
}
function toggleJenjangCb(el) {
  var p = el.closest('label');
  if (el.checked) { p.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-all border-emerald-400 bg-emerald-50 text-emerald-700'; }
  else { p.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-all border-stone-200 hover:border-stone-300 text-stone-500'; }
}

async function openSiklusForm(editing) {
  const isEdit = !!(editing && editing.id);
  const s = editing ? { 
    id: editing.id,
    nama: editing.nama || '',
    kategori_penerima: editing.kategori_penerima || '',
    jumlah_porsi: Number(editing.jumlah_porsi) || 0,
    total_hari: Number(editing.total_hari) || 0,
    status: editing.status || 'Draft',
    catatan: editing.catatan || '',
    tanggal_mulai: editing.tanggal_mulai || '',
    tanggal_selesai: editing.tanggal_selesai || '',
    items: Array.isArray(editing.items) ? editing.items : []
  } : { nama: '', kategori_penerima: '', jumlah_porsi: 0, total_hari: 0, status: 'Draft', catatan: '', tanggal_mulai: '', tanggal_selesai: '', items: [] };
  // Preserve existing metadata when re-rendering (e.g. from saveGridPicker / hariChange)
  const prevMeta = window._siklusMeta;
  if (prevMeta) {
    if (!s.kategori_penerima && prevMeta.kategori_penerima) s.kategori_penerima = prevMeta.kategori_penerima;
    if ((!s.jumlah_porsi || s.jumlah_porsi === 0) && prevMeta.jumlah_porsi) s.jumlah_porsi = prevMeta.jumlah_porsi;
    if (!s.catatan && prevMeta.catatan) s.catatan = prevMeta.catatan;
    if (!s.tanggal_mulai && prevMeta.tanggal_mulai) s.tanggal_mulai = prevMeta.tanggal_mulai;
    if (!s.tanggal_selesai && prevMeta.tanggal_selesai) s.tanggal_selesai = prevMeta.tanggal_selesai;
  }
  const formData = JSON.parse(JSON.stringify(s));

  // Compute date range (handle Date object or ISO string from API)
  var _rawTglMulai = s.tanggal_mulai || '';
  if (_rawTglMulai) {
    if (typeof _rawTglMulai === 'object' && _rawTglMulai instanceof Date) {
      _rawTglMulai = _rawTglMulai.getFullYear() + '-' + String(_rawTglMulai.getMonth()+1).padStart(2,'0') + '-' + String(_rawTglMulai.getDate()).padStart(2,'0');
    } else {
      var _tStr = String(_rawTglMulai);
      // ISO string from JSON serialization (e.g. "2026-07-26T17:00:00.000Z") — parse as UTC moment, convert to local date
      var _d = new Date(_tStr);
      if (!isNaN(_d.getTime()) && (_tStr.includes('T') || _tStr.includes('Z'))) {
        _rawTglMulai = _d.getFullYear() + '-' + String(_d.getMonth()+1).padStart(2,'0') + '-' + String(_d.getDate()).padStart(2,'0');
      } else {
        _rawTglMulai = _tStr.replace(/T.*$/g, '');
      }
    }
    if (_rawTglMulai.length === 7) _rawTglMulai += '-01';
  }
  var _totalHariFromData = Math.max(1, s.total_hari || 7);
  function fmtDateInput(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  // Normalisasi tanggal_selesai tersimpan (Date / ISO / "YYYY-MM-DD") → "YYYY-MM-DD".
  // Nilai Date/ISO dari mysql2 = tengah malam WIB disimpan UTC; tambah 7 jam lalu
  // baca komponen UTC agar tidak bergantung zona waktu browser.
  var _rawTglSelesai = s.tanggal_selesai || '';
  if (_rawTglSelesai) {
    var _dS = _rawTglSelesai instanceof Date ? _rawTglSelesai : new Date(_rawTglSelesai);
    if (!isNaN(_dS.getTime())) {
      var _wibS = new Date(_dS.getTime() + 7 * 3600 * 1000);
      _rawTglSelesai = _wibS.getUTCFullYear() + '-' + String(_wibS.getUTCMonth()+1).padStart(2,'0') + '-' + String(_wibS.getUTCDate()).padStart(2,'0');
    } else {
      _rawTglSelesai = String(_rawTglSelesai).replace(/T.*$/g, '');
    }
  }
  var _tglMulai = _rawTglMulai ? new Date(_rawTglMulai + 'T00:00:00') : null;
  if (_tglMulai) _tglMulai.setHours(0,0,0,0);
  var _tglMulaiStr = _tglMulai ? fmtDateInput(_tglMulai) : '';
  var _tglSelesaiStr = _rawTglSelesai || (_tglMulai ? (function() { var d = new Date(_tglMulai); d.setDate(d.getDate() + _totalHariFromData - 1); return fmtDateInput(d); })() : '');
  function getDate(hk) { return _tglMulai ? new Date(_tglMulai.getTime() + (hk - 1) * 86400000) : null; }

  var hariCount = _tglMulai ? Math.floor((new Date(_tglSelesaiStr) - _tglMulai) / 86400000) + 1 : _totalHariFromData;
  const totalHari = Math.max(1, hariCount);
  var existingItemsByHk = {};
  if (formData.items) {
    for (var _ei = 0; _ei < formData.items.length; _ei++) {
      var _eit = formData.items[_ei];
      if (_eit && _eit.hari_ke) existingItemsByHk[Number(_eit.hari_ke)] = _eit;
    }
  }
  formData.items = [];
  for (let _i = 1; _i <= totalHari; _i++) {
    var _dn = _tglMulai ? (function() { var _dt = new Date(_tglMulai.getTime() + (_i - 1) * 86400000); return HARI_OPTIONS[_dt.getDay() === 0 ? 6 : _dt.getDay() - 1]; })() : (['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'][(_i - 1) % 7]);
    var _existing = existingItemsByHk[_i];
    formData.items.push(_existing || { hari_ke: _i, hari_nama: _dn, menu_nama: '', jumlah_porsi: formData.jumlah_porsi || 0 });
    if (_existing && !_existing.hari_nama) formData.items[formData.items.length - 1].hari_nama = _dn;
  }

  const c = document.getElementById('content');
  const statuses = ['Draft', 'Aktif', 'Arsip'];

  let bahanBySp = {};
  try { bahanBySp = await api.get('/bahan/by-sp'); } catch { bahanBySp = {}; }
  window._bahanBySp = (bahanBySp && bahanBySp.byKat) || {};

  let existingGrid = {};
  if (isEdit && s.id) {
    try {
      const gridRes = await api.get('/siklus/' + s.id + '/bahan-grid');
      const byDay = gridRes && gridRes.byDay;
      if (byDay) {
        for (const [hariKe, categories] of Object.entries(byDay)) {
          existingGrid[Number(hariKe)] = { hari_ke: Number(hariKe), bahan: categories };
        }
      }
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
      const resepMapFromItem = existingItem && existingItem.resep_map ? (typeof existingItem.resep_map === 'string' ? JSON.parse(existingItem.resep_map) : existingItem.resep_map) : {};
      gridData[hk] = { hari_ke: hk, hari_nama: it.hari_nama, menu_id: it.menu_id || '', menu_nama: it.menu_nama || '', foto: it.foto || '', bahan: {}, resep_map: resepMapFromItem };
      for (const rk of ROW_KEYS) {
        const existing = existingGrid[hk] && existingGrid[hk].bahan && existingGrid[hk].bahan[rk];
        gridData[hk].bahan[rk] = (existing || []).map(b => ({ ...b }));
      }
    }
  }
  window._gridData = gridData;
  window._rowKeys = ROW_KEYS;

  function fmtDate(d) { return d ? d.getDate().toString().padStart(2,'0') + '/' + (d.getMonth()+1).toString().padStart(2,'0') : ''; }

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
          <div class="min-w-[250px] flex-1"><label class="block text-xs font-semibold text-stone-400 uppercase tracking-wider">Nama Siklus</label><input id="sk-nama" value="${s.nama}" placeholder="cth: Siklus Menu SD" class="mt-1.5 w-full h-11 px-4 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 text-sm font-medium transition-all" /></div>          <div><label class="block text-xs font-semibold text-stone-400 uppercase tracking-wider">Tanggal Mulai</label><input type="date" id="sk-tgl-mulai" value="${_tglMulaiStr}" onchange="siklusTanggalChange()" class="mt-1.5 h-11 px-3 border border-stone-200 rounded-xl text-sm bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-300" /></div>          <div><label class="block text-xs font-semibold text-stone-400 uppercase tracking-wider">Tanggal Selesai</label><input type="date" id="sk-tgl-selesai" value="${_tglSelesaiStr}" onchange="siklusTanggalChange()" class="mt-1.5 h-11 px-3 border border-stone-200 rounded-xl text-sm bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-300" /></div>

          <div><label class="block text-xs font-semibold text-stone-400 uppercase tracking-wider">Jenjang</label><div id="sk-jenjang-list" class="mt-1.5 flex flex-wrap gap-2">${['TK/PAUD','SD 1-3','SD 4-6','SMP','SMA','Posyandu'].map(k => { var checked = getJenjangChecked(s.kategori_penerima, k); return '<label class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-all ' + (checked ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-stone-200 hover:border-stone-300 text-stone-500') + '"><input type="checkbox" value="' + k + '" ' + (checked ? 'checked' : '') + ' class="jenjang-cb sr-only" onchange="toggleJenjangCb(this)">' + k + '</label>'; }).join('')}</div></div>

          <div><label class="block text-xs font-semibold text-stone-400 uppercase tracking-wider">Status</label><select id="sk-status" class="mt-1.5 h-11 px-3 border border-stone-200 rounded-xl text-sm bg-white min-w-[120px]">${statuses.map(st => '<option value="'+st+'"'+(s.status===st?' selected':'')+'>'+st+'</option>').join('')}</select></div>
        </div>
      </div>

      <!-- Calendar Weeks -->
      <div class="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm mb-5">
        <div class="overflow-x-auto"><table class="w-full" style="min-width:${Math.max(600, formData.items.length * 130 + 100)}px"><thead><tr>
          <th class="w-[100px] min-w-[100px] px-3 py-3 text-left text-xs font-semibold text-stone-400 bg-stone-50 border-b border-r border-stone-200">Kelompok</th>${formData.items.map(it => {
            const dt = getDate(it.hari_ke);
            var _mn = it.menu_nama || (gridData[it.hari_ke] && gridData[it.hari_ke].menu_nama) || '';
            var _ft = (gridData[it.hari_ke] && gridData[it.hari_ke].foto) || '';
            return '<th class="px-2 py-2.5 text-center bg-stone-50 border-b border-r border-stone-200 align-top"><div class="text-xs font-bold text-stone-700">' + it.hari_nama + '</div><div class="inline-block my-1 px-2 py-0.5 rounded-full bg-amber-100 text-[10px] font-semibold text-amber-700">Menu ' + it.hari_ke + '</div>' + (dt ? '<div class="text-[10px] text-stone-400">' + fmtDate(dt) + '</div>' : '') + (_mn ? '<div class="text-[9px] text-stone-500 mt-0.5 truncate max-w-[120px] mx-auto" title="' + escHtml(_mn) + '">' + escHtml(_mn) + '</div>' : '') + '<div id="sk-foto-' + it.hari_ke + '" class="mt-1.5">' + renderSiklusFoto(it.hari_ke, _ft) + '</div></th>';
          }).join('')}
        </tr></thead><tbody>
          ${ROW_KEYS.map(rk => {
            const clr = {Karbohidrat:'amber','Protein Hewani':'rose','Protein Nabati':'emerald',Sayur:'green',Buah:'orange',Susu:'blue'}[rk];
            const bgClr = {Karbohidrat:'amber-50','Protein Hewani':'rose-50','Protein Nabati':'emerald-50',Sayur:'green-50',Buah:'orange-50',Susu:'blue-50'}[rk];
            let r = '<tr class="hover:bg-stone-50/50 transition-colors"><td class="px-3 py-2.5 text-xs font-bold text-' + clr + '-700 bg-' + bgClr + ' border-b border-r border-stone-200">' + ROW_LABELS[rk] + '</td>';
            for (const it of formData.items) {
              const g = gridData[it.hari_ke];
              const s = g ? g.bahan[rk] || [] : [];
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
  window._siklusMeta = { kategori_penerima: s.kategori_penerima || '', jumlah_porsi: Number(s.jumlah_porsi) || 0, catatan: s.catatan || '', tanggal_mulai: _tglMulaiStr, tanggal_selesai: _tglSelesaiStr };
  document.getElementById('sk-btn-save').onclick = async function() {
    var nama = document.getElementById('sk-nama').value.trim();
    if (!nama) { showAlert('Nama siklus harus diisi', 'warning'); return; }
    var _tglMulaiSave = document.getElementById('sk-tgl-mulai').value;
    var _tglSelesaiSave = document.getElementById('sk-tgl-selesai').value;
    var totalHari;
    if (_tglMulaiSave && _tglSelesaiSave) {
      var _d1 = new Date(String(_tglSelesaiSave).replace(/T.*$/g, '') + 'T00:00:00');
      var _d2 = new Date(String(_tglMulaiSave).replace(/T.*$/g, '') + 'T00:00:00');
      totalHari = Math.floor((_d1 - _d2) / 86400000) + 1;
      if (totalHari < 1) totalHari = 1;
    } else {
      totalHari = Object.keys(window._gridData || {}).length;
      if (totalHari < 1) totalHari = 7;
    }
    var meta = window._siklusMeta || {};
    var gd = window._gridData || {};
    var rowKeys = window._rowKeys || [];
    var items = [], gridPayload = [];
    var hkKeys = Object.keys(gd).sort((a,b) => Number(a)-Number(b));
    for (var i = 0; i < hkKeys.length; i++) {
      var hk = Number(hkKeys[i]), day = gd[hk];
      if (!day) continue;
      var hasAnyBahan = rowKeys.some(function(rk) { return (day.bahan[rk] || []).length > 0; });
      var hasMenu = !!day.menu_id;
      // Simpan hari yang punya foto walau belum ada menu/bahan — supaya foto tidak hilang setelah disimpan
      if (!hasAnyBahan && !hasMenu && !day.foto) continue;
      items.push({ hari_ke: hk, hari_nama: day.hari_nama, menu_id: day.menu_id || '', menu_nama: day.menu_nama || '', jumlah_porsi: meta.jumlah_porsi || 0, foto: day.foto || '' });
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
    for (var ii = 0; ii < items.length; ii++) {
      items[ii].jumlah_porsi = meta.jumlah_porsi || 0;
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
    var tanggalMulai = document.getElementById('sk-tgl-mulai').value || null;
    var tanggalSelesai = document.getElementById('sk-tgl-selesai').value || null;
    var jenjangCbs = document.querySelectorAll('.jenjang-cb:checked');
    var jenjangVal = [];
    for (var jci = 0; jci < jenjangCbs.length; jci++) jenjangVal.push(jenjangCbs[jci].value);
    var kategori_penerima = jenjangVal.length === 0 ? '' : (jenjangVal.length === 1 ? jenjangVal[0] : JSON.stringify(jenjangVal));
    var payload = { nama, kategori_penerima, total_hari: totalHari, status: document.getElementById('sk-status').value, catatan: meta.catatan || '', tanggal_mulai: tanggalMulai, tanggal_selesai: tanggalSelesai, items };
    try {
      var savedId = window._siklusFormId;
      if (isEdit) await api.put('/siklus/' + savedId, payload);
      else { var res = await api.post('/siklus', payload); savedId = res.id; }
      if (savedId) await api.post('/siklus/' + savedId + '/bahan-grid', { grid: gridPayload, resepMap });
      if (!isEdit && savedId) {
        showPanduanAhliGizi(savedId);
      } else {
        showToast('Siklus menu berhasil ' + (isEdit ? 'diperbarui' : 'disimpan'), 'success');
      }
      renderSiklus();
    } catch (e) { showToast('Gagal: ' + (e.message || 'Unknown error'), 'error'); }
  };
}

/**
 * Menampilkan dialog panduan langkah selanjutnya untuk Ahli Gizi
 * setelah berhasil membuat siklus baru.
 */
function showPanduanAhliGizi(siklusId) {
  var existing = document.getElementById('siklus-panduan-modal');
  if (existing) existing.remove();

  var m = document.createElement('div');
  m.id = 'siklus-panduan-modal';
  m.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm';

  m.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden transform transition-all duration-300 scale-100">' +
    '<div class="bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-5 text-white">' +
      '<div class="flex items-center gap-3">' +
        '<div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">' +
          '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' +
        '</div>' +
        '<div>' +
          '<h3 class="font-bold text-lg">✅ Siklus Menu Berhasil Dibuat!</h3>' +
          '<p class="text-emerald-100 text-sm mt-0.5">Berikut langkah-langkah selanjutnya untuk Ahli Gizi:</p>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="px-6 py-5 space-y-4">' +
      '<div class="flex items-start gap-3">' +
        '<div class="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 text-sm font-bold">1</div>' +
        '<div>' +
          '<div class="font-semibold text-stone-800 text-sm">Isi Menu Setiap Hari</div>' +
          '<div class="text-xs text-stone-500 mt-0.5">Klik pada siklus untuk mengisi menu masing-masing hari — pilih dari menu yang sudah tersedia atau buat bahan secara manual melalui grid picker.</div>' +
        '</div>' +
      '</div>' +
      '<div class="flex items-start gap-3">' +
        '<div class="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 text-sm font-bold">2</div>' +
        '<div>' +
          '<div class="font-semibold text-stone-800 text-sm">Periksa Kandungan Gizi</div>' +
          '<div class="text-xs text-stone-500 mt-0.5">Gunakan fitur <b>Laporan + Banding SP</b> untuk memastikan setiap hari memenuhi target gizi (kalori, protein, karbohidrat, lemak, serat).</div>' +
        '</div>' +
      '</div>' +
      '<div class="flex items-start gap-3">' +
        '<div class="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 text-sm font-bold">3</div>' +
        '<div>' +
          '<div class="font-semibold text-stone-800 text-sm">Hitung Kebutuhan Bahan (SP)</div>' +
          '<div class="text-xs text-stone-500 mt-0.5">Gunakan tombol <b>Hitung SP</b> untuk menghitung total kebutuhan bahan baku berdasarkan standar porsi (SP) dan BDD.</div>' +
        '</div>' +
      '</div>' +
      '<div class="flex items-start gap-3">' +
        '<div class="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 text-sm font-bold">4</div>' +
        '<div>' +
          '<div class="font-semibold text-stone-800 text-sm">Buat Produksi &amp; Budget</div>' +
          '<div class="text-xs text-stone-500 mt-0.5">Setelah menu dan bahan terisi, buat produksi harian dan hitung budget untuk periode tertentu.</div>' +
        '</div>' +
      '</div>' +
      '<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-2">' +
        '<div class="flex items-start gap-2 text-xs text-amber-800">' +
          '<svg class="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' +
          '<span>Semua fitur ini bisa diakses dari tombol aksi pada detail siklus. Klik siklus untuk memulai!</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="px-6 py-4 bg-stone-50 border-t border-stone-100 flex justify-end gap-2">' +
      '<button onclick="document.getElementById(\'siklus-panduan-modal\').remove()" class="px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-sm">' +
        'Mengerti, Lanjutkan' +
      '</button>' +
    '</div>' +
  '</div>';

  document.body.appendChild(m);
  m.addEventListener('click', function(e) { if (e.target === m) m.remove(); });
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

// Foto menu per hari (base64)
function renderSiklusFoto(hk, foto) {
  var img = foto ? '<img src="' + foto + '" class="w-14 h-14 object-cover rounded-lg border border-stone-200 shadow-sm mx-auto mb-1">' : '';
  var btns = '<div class="flex items-center justify-center gap-1">'
    + '<label class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-stone-200 cursor-pointer hover:border-emerald-400 text-[10px] font-medium text-stone-500 transition-colors">'
    + '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>'
    + (foto ? 'Ganti' : 'Foto')
    + '<input type="file" accept="image/*" class="hidden" onchange="siklusFotoChange(this,' + hk + ')"></label>';
  if (foto) btns += '<button type="button" onclick="siklusFotoRemove(' + hk + ')" class="inline-flex items-center px-2 py-1 rounded-md bg-red-50 border border-red-200 text-red-500 text-[10px] font-medium hover:bg-red-100 transition-colors">Hapus</button>';
  btns += '</div>';
  return '<div class="flex flex-col items-center">' + img + btns + '</div>';
}

function siklusFotoChange(input, hk) {
  var file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showAlert('Ukuran foto maksimal 5MB', 'warning'); input.value = ''; return; }
  // Tampilkan spinner selama file dibaca & dikompresi
  var wrap = document.getElementById('sk-foto-' + hk);
  if (wrap) wrap.innerHTML = '<div class="flex flex-col items-center py-1">'
    + '<svg class="animate-spin h-5 w-5 text-emerald-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>'
    + '<div class="text-[9px] text-stone-400 mt-0.5">Memproses foto...</div>'
    + '</div>';
  var reader = new FileReader();
  reader.onload = function(ev) {
    compressSiklusFoto(ev.target.result, function(resized) {
      var prevFoto = (window._gridData && window._gridData[hk] && window._gridData[hk].foto) || '';
      if (!resized) {
        // Gagal diproses — kembalikan tampilan sebelumnya
        var w2 = document.getElementById('sk-foto-' + hk);
        if (w2) w2.innerHTML = renderSiklusFoto(hk, prevFoto);
        return;
      }
      if (window._gridData && window._gridData[hk]) window._gridData[hk].foto = resized;
      var w2 = document.getElementById('sk-foto-' + hk);
      if (w2) w2.innerHTML = renderSiklusFoto(hk, resized);
    });
  };
  reader.readAsDataURL(file);
}

function compressSiklusFoto(dataUrl, cb) {
  var img = new Image();
  img.onload = function() {
    var MAX = 800;
    var w = img.width, h = img.height;
    var scale = Math.min(1, MAX / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
    var out = canvas.toDataURL('image/jpeg', 0.7);
    if (out.length > 250000) out = canvas.toDataURL('image/jpeg', 0.5);
    if (out.length > 250000) out = canvas.toDataURL('image/jpeg', 0.35);
    cb(out);
  };
  img.onerror = function() { cb(dataUrl); };
  img.src = dataUrl;
}

function siklusFotoRemove(hk) {
  if (window._gridData && window._gridData[hk]) window._gridData[hk].foto = '';
  var wrap = document.getElementById('sk-foto-' + hk);
  if (wrap) wrap.innerHTML = renderSiklusFoto(hk, '');
}

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
    html += '<label class="gp-item flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-stone-50 cursor-pointer text-sm"><input type="checkbox" value="' + b.id + '" ' + (selIds.indexOf(b.id) !== -1 ? 'checked' : '') + ' class="cb-modern"> ' + b.nama + '</label>';
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
    window._bahanBySp = (bahanBySp && bahanBySp.byKat) || {};
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
  var curStatus = (document.getElementById('sk-status')?.value) || 'Draft';
  var curTglMulai = document.getElementById('sk-tgl-mulai')?.value || '';
  var meta = window._siklusMeta || {};
  var curKat = meta.kategori_penerima || '';
  var hkKeys = Object.keys(window._gridData).sort(function(a,b) { return Number(a)-Number(b); });
  var items = hkKeys.map(function(hk) {
    var d = window._gridData[Number(hk)];
    return { hari_ke: d.hari_ke, hari_nama: d.hari_nama, menu_id: d.menu_id || '', menu_nama: d.menu_nama || '', jumlah_porsi: meta.jumlah_porsi || 0, foto: d.foto || '' };
  });
  openSiklusForm(window._siklusFormId ? { id: window._siklusFormId, nama: curNama, kategori_penerima: curKat, total_hari: items.length, status: curStatus, tanggal_mulai: curTglMulai, items: items } : { nama: curNama, kategori_penerima: curKat, total_hari: items.length, status: curStatus, tanggal_mulai: curTglMulai, items: items });
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
function getDaysInMonth(dateStr) {
  if (!dateStr) return 30;
  var d = new Date(dateStr + 'T00:00:00');
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function siklusTanggalChange() {
  if (!window._gridData) return;
  var tglMulai = document.getElementById('sk-tgl-mulai').value;
  var tglSelesai = document.getElementById('sk-tgl-selesai').value;
  if (!tglMulai || !tglSelesai) return;
  var d1 = new Date(tglMulai + 'T00:00:00');
  var d2 = new Date(tglSelesai + 'T00:00:00');
  if (d2 < d1) return;
  var totalHari = Math.floor((d2 - d1) / 86400000) + 1;
  // Simpan data resep dari DOM ke _gridData sebelum re-render
  var gd = window._gridData;
  var rowKeys = window._rowKeys || [];
  // Reset resep_map untuk semua hari
  Object.keys(gd).forEach(function(hk) {
    if (gd[hk]) gd[hk].resep_map = {};
  });
  // Baca nilai dari DOM
  document.querySelectorAll('input[data-field="resep"]').forEach(function(inp) {
    var hk = Number(inp.getAttribute('data-hk'));
    var kat = inp.getAttribute('data-kat');
    var val = inp.value.trim();
    if (hk && kat && gd[hk]) {
      gd[hk].resep_map[kat] = val;
    }
  });
  // Bangun menu_nama dari resep_map (sama seperti save handler)
  Object.keys(gd).forEach(function(hk) {
    var d = gd[hk];
    if (!d) return;
    var rmap = d.resep_map || {};
    var parts = [];
    for (var ri = 0; ri < rowKeys.length; ri++) {
      var v = rmap[rowKeys[ri]];
      if (v) parts.push(v);
    }
    if (parts.length) d.menu_nama = parts.join(' + ');
  });
  window._gridData = gd;
  openSiklusFormHariChange({ value: totalHari, tglMulai: tglMulai });
}

async function openSiklusFormHariChange(input) {
  var newTotal = Math.min(31, Math.max(1, +input.value || 1));
  var _tglMulaiStr = input.tglMulai || document.getElementById('sk-tgl-mulai').value || '';
  _tglMulaiStr = String(_tglMulaiStr).replace(/T.*$/g, '');
  var _tglMulaiDt = _tglMulaiStr ? new Date(_tglMulaiStr + 'T00:00:00') : new Date();
  _tglMulaiDt.setHours(0,0,0,0);

  if (window._gridData) {
    var gridData = window._gridData;
    var rowKeys = window._rowKeys || [];
    var hkKeys = Object.keys(gridData).sort(function(a,b) { return Number(a)-Number(b); });
    var existingLen = hkKeys.length;

    // Update nama hari untuk semua hari yang ada berdasarkan tanggal sebenarnya
    hkKeys.forEach(function(hk) {
      var hkNum = Number(hk);
      if (!gridData[hkNum]) return;
      var _dt = new Date(_tglMulaiDt.getTime() + (hkNum - 1) * 86400000);
      gridData[hkNum].hari_nama = HARI_OPTIONS[_dt.getDay() === 0 ? 6 : _dt.getDay() - 1];
    });

    if (newTotal > existingLen) {
      for (var i = existingLen + 1; i <= newTotal; i++) {
        var _dt = new Date(_tglMulaiDt.getTime() + (i - 1) * 86400000);
        var nama = HARI_OPTIONS[_dt.getDay() === 0 ? 6 : _dt.getDay() - 1];
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
  var curTglMulai = _tglMulaiStr;
  var curId = window._siklusFormId;
  var meta = window._siklusMeta || {};
  var items = Object.keys(window._gridData || {}).sort(function(a,b) { return Number(a)-Number(b); }).map(function(hk) {
    var d = window._gridData[hk];
    return { hari_ke: d.hari_ke, hari_nama: d.hari_nama, menu_id: d.menu_id || '', menu_nama: d.menu_nama || '', jumlah_porsi: meta.jumlah_porsi || 0, foto: d.foto || '' };
  });
  openSiklusForm(curId ? { id: curId, nama: curNama, kategori_penerima: curKat, total_hari: newTotal, status: curStatus, tanggal_mulai: curTglMulai, items: items } : { nama: curNama, kategori_penerima: curKat, total_hari: newTotal, status: curStatus, tanggal_mulai: curTglMulai, items: items });
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
    html += '';
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
  // Clear menu_nama agar digenerate ulang dari resep saat disimpan
  if (gd && gd[hariKe]) gd[hariKe].menu_nama = '';
  closeSiklusRecipePicker();
  for (var ri = 0; ri < resepList.length; ri++) {
    refreshGridSection(hariKe, resepList[ri].kategori_sp);
  }
  showToast('Menu Hari ' + hariKe + ' diisi dari siklus', 'success');
}