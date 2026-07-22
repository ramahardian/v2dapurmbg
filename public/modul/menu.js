// ===== Menu (custom with bahan) =====
let menuState = { page: 1, limit: 10, search: '', total: 0, totalPages: 1 };
let menuViewMode = 'list'; // 'list' | 'siklus'

async function ensureBahanBakuLoaded() {
  if (window._bahanBaku) return;
  const [bahan, spRef] = await Promise.all([
    api.get('/bahan_baku'),
    api.get('/sp_referensi_bahan').catch(() => []),
  ]);
  window._bahanBaku = bahan;
  window._spRefList = Array.isArray(spRef) ? spRef : [];
  window._spRefMap = {};
  (window._spRefList || []).forEach(function(r) {
    window._spRefMap[r.nama] = {
      berat_bersih: Number(r.berat_bersih),
      bdd_persen: Number(r.bdd_persen),
      energi: Number(r.energi) || 0,
      protein: Number(r.protein) || 0,
      lemak: Number(r.lemak) || 0,
      karbohidrat: Number(r.karbohidrat) || 0,
      serat: Number(r.serat) || 0,
    };
  });
}

async function renderMenu() {
  const c = document.getElementById('content');
  if (!c) return;
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    if (menuViewMode === 'siklus') {
      await ensureBahanBakuLoaded();
      await renderMenuBySiklus(c);
      return;
    }

    const params = new URLSearchParams({ page: menuState.page, limit: menuState.limit, search: menuState.search });
    const r = await fetch('/api/menu?' + params, { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal memuat menu');
    }
    const data = await r.json();
    const pagination = data.pagination || { total: data.length || 0, totalPages: 1, page: menuState.page };
    menuState = { ...menuState, total: pagination.total, totalPages: pagination.totalPages, page: pagination.page };
    
    c.innerHTML = renderMenuHtml(Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []));
    renderPagination();
    attachMenuHandlers();
  } catch (err) {
    console.error('Menu error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat menu: ${err.message}</div>`;
  }
}

async function renderMenuBySiklus(c) {
  try {
    const r = await fetch('/api/menu/by-siklus', { credentials: 'include' });
    if (!r.ok) throw new Error('Gagal memuat data');
    const data = await r.json();
    c.innerHTML = renderMenuBySiklusHtml(data);
    attachMenuBySiklusHandlers();
  } catch (err) {
    console.error('Menu by siklus error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat menu berdasarkan siklus: ${err.message}</div>`;
  }
}

function renderMenuBySiklusHtml(data) {
  const groups = data.siklus_groups || [];
  const standalone = data.standalone || [];
  const totalMenu = data.total_menu || 0;
  const usedInSiklus = data.used_in_siklus || 0;

  // Tab navigation
  const tabsHtml = `<div class="flex items-center gap-1 mb-5 bg-stone-100 rounded-xl p-1 w-fit border border-stone-200">
    <button onclick="switchMenuView('list')" class="px-4 py-2 text-sm font-medium rounded-lg transition-all ${menuViewMode === 'list' ? 'bg-white text-stone-900 shadow-sm border border-stone-200' : 'text-stone-500 hover:text-stone-700'}">
      <svg class="w-4 h-4 inline -mt-0.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/></svg>
      Semua Menu
    </button>
    <button onclick="switchMenuView('siklus')" class="px-4 py-2 text-sm font-medium rounded-lg transition-all ${menuViewMode === 'siklus' ? 'bg-white text-stone-900 shadow-sm border border-stone-200' : 'text-stone-500 hover:text-stone-700'}">
      <svg class="w-4 h-4 inline -mt-0.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      Berdasarkan Siklus
    </button>
  </div>`;

  // Stats cards
  const statsHtml = `<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
    <div class="bg-white border border-stone-200 rounded-xl p-4">
      <div class="text-xs uppercase tracking-wider text-stone-500 font-medium">Total Menu</div>
      <div class="text-2xl font-bold text-stone-800 mt-1">${totalMenu}</div>
    </div>
    <div class="bg-blue-50 border border-blue-100 rounded-xl p-4">
      <div class="text-xs uppercase tracking-wider text-blue-700 font-medium">Digunakan di Siklus</div>
      <div class="text-2xl font-bold text-blue-800 mt-1">${usedInSiklus}</div>
    </div>
    <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
      <div class="text-xs uppercase tracking-wider text-emerald-700 font-medium">Standalone</div>
      <div class="text-2xl font-bold text-emerald-800 mt-1">${standalone.length}</div>
    </div>
    <div class="bg-amber-50 border border-amber-100 rounded-xl p-4">
      <div class="text-xs uppercase tracking-wider text-amber-700 font-medium">Siklus Aktif</div>
      <div class="text-2xl font-bold text-amber-800 mt-1">${groups.filter(g => g.status === 'Aktif').length}</div>
    </div>
  </div>`;

  // Siklus groups
  let siklusHtml = '';
  if (groups.length === 0) {
    siklusHtml = `<div class="col-span-full text-center py-12 text-stone-400">
      <svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      <div>Belum ada siklus menu</div>
      <div class="text-sm mt-1">Buat siklus terlebih dahulu di menu Siklus</div>
    </div>`;
  } else {
    siklusHtml = groups.map(s => {
      const statusColor = s.status === 'Aktif' ? 'bg-emerald-100 text-emerald-800' : s.status === 'Draft' ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600';
      const filledDays = s.days.filter(d => d.menu_id || d._has_content).length;
      const coverage = s.total_hari ? Math.round((filledDays / s.total_hari) * 100) : 0;

      return `<div class="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
        <!-- Siklus Header -->
        <div class="px-5 py-4 border-b border-stone-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="font-bold text-stone-800">${s.nama}</h3>
              <span class="text-[10px] px-2.5 py-1 rounded-full font-medium ${statusColor} capitalize">${s.status}</span>
            </div>
            <div class="flex flex-wrap items-center gap-3 mt-1 text-xs text-stone-500">
              <span>${s.kategori_penerima || 'Semua'}</span>
              <span>${s.jumlah_porsi} porsi/hari</span>
              <span>${s.total_hari} hari</span>
              <span class="${coverage >= 100 ? 'text-emerald-600 font-semibold' : coverage > 0 ? 'text-amber-600' : 'text-stone-400'}">${coverage}% terisi</span>
              <span>${s.menu_count} menu unik</span>
            </div>
          </div>
          <a href="#" onclick="navigate('siklus');return false" class="text-xs text-[#1e40af] hover:text-[#1d4ed8] font-medium hover:underline whitespace-nowrap">
            Kelola Siklus →
          </a>
        </div>
        <!-- Days Grid -->
        <div class="p-4">
          <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));">
            ${s.days.map(d => {
              const isFilled = d.menu_id || d._has_content;
              return `<div class="border rounded-lg p-3 transition-all ${isFilled ? (d.menu_id ? 'border-stone-200 hover:border-[#1e40af]/30 hover:shadow-sm' : 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-300 hover:shadow-sm') : 'border-dashed bg-stone-50/50'} ">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-[10px] font-semibold uppercase text-stone-400">Hari ${d.hari_ke}</span>
                  <span class="text-[10px] text-stone-400">${d.hari_nama}</span>
                </div>
                ${isFilled ? `
                  <div class="font-medium text-sm text-stone-800 truncate" title="${d.menu_nama}">${d.menu_nama}</div>
                  <div class="flex items-center gap-2 mt-1.5 text-[10px] text-stone-500">
                    <span>${d.jumlah_porsi} porsi</span>
                    ${d.kalori ? `<span class="mono">${fmtNum(d.kalori)} kkal</span>` : ''}
                    ${d.gramasi_total ? `<span class="mono">${fmtNum(d.gramasi_total)}g</span>` : ''}
                    ${!d.menu_id && d._has_content ? '<span class="text-emerald-600 font-medium">Resep</span>' : ''}
                  </div>
                ` : `<div class="text-sm text-stone-400 italic">Belum diisi</div>`}
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>`;
    }).join('<div class="h-3"></div>');
  }

  // Standalone menus section
  let standaloneHtml = '';
  if (standalone.length > 0) {
    standaloneHtml = `<div class="mt-6">
      <div class="flex items-center gap-2 mb-3">
        <h3 class="font-bold text-stone-700">Menu Tidak Terpakai</h3>
        <span class="bg-stone-100 text-stone-500 text-xs px-2.5 py-0.5 rounded-full font-medium">${standalone.length}</span>
      </div>
      <div class="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-stone-50">
              <tr>
                <th class="text-left px-4 py-3 text-xs font-semibold uppercase">Nama</th>
                <th class="text-left px-4 py-3 text-xs font-semibold uppercase">Kategori</th>
                <th class="text-right px-4 py-3 text-xs font-semibold uppercase">Gramasi</th>
                <th class="text-right px-4 py-3 text-xs font-semibold uppercase">Kalori</th>
                <th class="text-right px-4 py-3 text-xs font-semibold uppercase">Protein</th>
                <th class="text-right px-4 py-3 text-xs font-semibold uppercase">Karbo</th>
                <th class="text-right px-4 py-3 text-xs font-semibold uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${standalone.length > 0 ? standalone.map(m => `
                <tr class="border-t border-stone-100 hover:bg-stone-50/50 transition-colors">
                  <td class="px-4 py-3 text-sm font-medium">
                    <div class="flex items-center gap-2">
                      <span class="truncate max-w-[180px]" title="${m.nama}">${m.nama}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-sm whitespace-nowrap">${m.kategori_penerima ? kategoriBadge(m.kategori_penerima) : '-'}</td>
                  <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${renderGramasiCell(m.gramasi_total, m.bahan)}</td>
                  <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${m.kalori}</td>
                  <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${m.protein}</td>
                  <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${m.karbohidrat}</td>
                  <td class="px-4 py-3 text-sm text-right">
                    <button onclick="switchMenuView('list');editMenuById(${m.id})" class="text-xs text-blue-600 hover:text-blue-800 hover:underline">Edit</button>
                  </td>
                </tr>
              `).join('') : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  return `<div>
    ${tabsHtml}
    ${statsHtml}
    ${siklusHtml}
    ${standaloneHtml}
  </div>`;
}

function attachMenuBySiklusHandlers() {
  const addBtn = document.getElementById('add-menu-btn');
  if (addBtn) addBtn.onclick = () => openMenuForm(null);
}

function switchMenuView(mode) {
  menuViewMode = mode;
  renderMenu();
}

async function editMenuById(id) {
  try {
    const menu = await api.get('/menu/' + id);
    openMenuForm(menu);
  } catch (e) {
    showAlert('Gagal memuat menu: ' + e.message, 'error');
  }
}

const KATEGORI_COLORS = {
  'TK/PAUD': { bg: '#0e7490' },
  'SD 1-3': { bg: '#0891b2' },
  'SD 4-6': { bg: '#d97706' },
  'SMP': { bg: '#1d4ed8' },
  'SMA': { bg: '#7c3aed' },
  'Ibu Hamil': { bg: '#be123c' },
  'Ibu Menyusui': { bg: '#6d28d9' },
  'Balita': { bg: '#0d9488' },
  // backward compat
  'Paket Kecil': { bg: '#0e7490' },
};

function kategoriBadge(kat) {
  const c = KATEGORI_COLORS[kat] || { bg: '#78716c' };
  return `<span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium text-white" style="background:${c.bg};">${kat}</span>`;
}

function renderBahanCell(bahan) {
  if (!bahan || !bahan.length) {
    return '<span class="text-stone-300">-</span>';
  }
  const names = bahan.map(function(b) { return b.nama; }).filter(Boolean);
  if (!names.length) {
    return '<span class="text-stone-300">-</span>';
  }
  const count = names.length;
  var display = names.slice(0, 2).join(', ');
  if (count > 2) display += ', ...';
  return '<span class="inline-flex items-center gap-1.5" title="' + escHtml(names.join(', ')) + '">' +
    '<span class="truncate max-w-[140px] block text-stone-600">' + escHtml(display) + '</span>' +
    '<span class="shrink-0 bg-stone-100 text-stone-500 text-[10px] font-medium px-1.5 py-0.5 rounded-full">' + count + '</span>' +
  '</span>';
}

function sumBahanGramasi(bahan) {
  if (!bahan || !bahan.length) return 0;
  return bahan.reduce(function(sum, b) { return sum + (Number(b.jumlah) || 0); }, 0);
}

function renderGramasiCell(gramasiTotal, bahan) {
  var displayGramasi = Number(gramasiTotal) || 0;
  var calculated = sumBahanGramasi(bahan);
  if (displayGramasi === 0 && calculated > 0) {
    displayGramasi = calculated;
  }
  if (displayGramasi === 0) {
    return '<span class="text-stone-300">0g</span>';
  }
  var rounded = Math.round(displayGramasi * 10) / 10;
  var title = '';
  if (calculated > 0 && Math.abs(calculated - Number(gramasiTotal)) > 0.01) {
    title = ' title="Tersimpan: ' + Number(gramasiTotal) + 'g, Terhitung: ' + Math.round(calculated * 10) / 10 + 'g" class="cursor-help"';
  }
  return '<span' + title + '>' + rounded + 'g</span>';
}

function renderMenuHtml(menus) {
  return `<div class="flex flex-wrap justify-between gap-2 mb-4">
    <div class="flex flex-wrap items-center gap-2">
      <button id="add-menu-btn" class="bg-[#1e40af] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-md text-sm font-medium">+ Tambah Menu</button>
      <button id="menu-delete-selected" onclick="deleteSelectedMenu()" class="hidden px-3 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md items-center gap-1.5">
        Hapus Terpilih <span id="menu-selected-count" class="font-bold">0</span>
      </button>
    </div>
    <div class="flex gap-2">
      <button id="recalc-nutrisi-btn" onclick="recalcNutrisiMenu()" class="border border-emerald-400 text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-md text-sm font-medium">Hitung Ulang Nutrisi</button>
      <div class="relative">
        <input type="text" id="search-menu-input" placeholder="Cari nama menu..." value="${menuState.search}"
          class="pl-10 pr-4 py-2 border border-stone-200 rounded-md text-sm w-48 focus:outline-none focus:border-[#1e40af]">
        <svg class="absolute left-3 top-2.5 w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
      </div>
    </div>
  </div>
  <div class="bg-white border border-stone-200 rounded-lg overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="bg-stone-50">
          <tr>
            <th class="text-left px-4 py-3 text-xs font-semibold uppercase w-10">
              <input type="checkbox" id="menu-select-all" onchange="toggleSelectAllMenu(this)" class="cb-modern">
            </th>
            <th class="text-left px-4 py-3 text-xs font-semibold uppercase">Nama</th>
            <th class="text-left px-4 py-3 text-xs font-semibold uppercase">Kategori</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase">Gramasi</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase">Kalori</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase">Bahan</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase">Aksi</th>
          </tr>
        </thead>
        <tbody id="menu-table-body">
            ${menus.length > 0 ? menus.map(m => `
            <tr class="border-t border-stone-100">
              <td class="px-4 py-3 text-sm">
                <input type="checkbox" value="${m.id}" onchange="updateSelectedMenuCount()" class="menu-checkbox cb-modern">
              </td>
              <td class="px-4 py-3 text-sm font-medium truncate max-w-[180px]" title="${m.nama}">${m.nama}</td>
              <td class="px-4 py-3 text-sm whitespace-nowrap">${m.kategori_penerima ? kategoriBadge(m.kategori_penerima) : '-'}</td>
              <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${renderGramasiCell(m.gramasi_total, m.bahan)}</td>
              <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${m.kalori} kkal</td>
              <td class="px-4 py-3 text-sm text-left whitespace-nowrap">${renderBahanCell(m.bahan)}</td>
              <td class="px-4 py-3 text-sm text-right whitespace-nowrap">
                <button data-menu-id="${m.id}" class="edit-btn text-stone-500 hover:text-stone-900 mr-2" title="Edit"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button data-menu-id="${m.id}" class="delete-btn text-red-600 hover:text-red-800" title="Hapus"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
              </td>
            </tr>`).join('') : '<tr><td colspan="7" class="text-center py-12 text-stone-400"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg><div>Belum ada menu</div></td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
  <div id="pagination-controls"></div>`;
}

function renderPagination() {
  const wrap = document.getElementById('pagination-controls');
  if (!wrap) return;
  if (menuState.totalPages <= 1) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `<div class="flex items-center justify-start gap-2 mt-4">
    ${menuState.page > 1 ? '<button onclick="goToPage(' + (menuState.page - 1) + ')" class="px-4 py-1.5 text-sm rounded border border-stone-200 hover:bg-stone-50">Prev</button>' : ''}
    <span class="text-sm text-stone-500">Halaman ${menuState.page} dari ${menuState.totalPages}</span>
    ${menuState.page < menuState.totalPages ? '<button onclick="goToPage(' + (menuState.page + 1) + ')" class="px-4 py-1.5 text-sm rounded border border-stone-200 hover:bg-stone-50">Next</button>' : ''}
  </div>`;
}

function goToPage(page) {
  menuState.page = page;
  renderMenu();
}

function attachMenuHandlers() {
  const addBtn = document.getElementById('add-menu-btn');
  if (addBtn) addBtn.onclick = () => openMenuForm(null);
  const searchInput = document.getElementById('search-menu-input');
  if (searchInput) {
    let timer;
    searchInput.oninput = function() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        menuState.search = this.value;
        menuState.page = 1;
        renderMenu();
      }, 300);
    };
  }
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const menuId = this.getAttribute('data-menu-id');
      editMenuById(menuId);
    });
  });
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const menuId = this.getAttribute('data-menu-id');
      deleteMenu(menuId);
    });
  });
}

async function openMenuForm(editing) {
  await ensureBahanBakuLoaded();
  const m = editing || { nama: '', deskripsi: '', gramasi_total: 0, kalori: 0, protein: 0, karbohidrat: 0, lemak: 0, serat: 0, bahan: [] };
  document.getElementById('modal-title').innerHTML = (editing ? 'Edit Menu' : 'Menu Baru') + '<button onclick="event.stopPropagation();showMenuInfo()" class="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-stone-100 hover:bg-blue-100 hover:text-blue-700 text-stone-400 transition-colors" title="Info"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></button>';
  document.getElementById('modal-body').innerHTML = `
    <div>
      <label class="text-sm font-medium">Nama Menu *</label>
      <div class="flex gap-2 mt-1">
        <input id="m-nama" value="${m.nama}" class="flex-1 h-10 px-3 border border-stone-200 rounded-md" />
        <button type="button" onclick="openSiklusMenuPicker()" class="shrink-0 px-3 h-10 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 whitespace-nowrap transition-colors" title="Ambil nama & bahan dari siklus">📋 Siklus</button>
      </div>
    </div>
    <div class="mt-3"><label class="text-sm font-medium">Deskripsi</label><textarea id="m-deskripsi" rows="2" class="mt-1 w-full px-3 py-2 border border-stone-200 rounded-md">${m.deskripsi || ''}</textarea></div>
    
    <input id="m-kalori" type="hidden" value="${m.kalori || 0}" />
    <input id="m-protein" type="hidden" value="${m.protein || 0}" />
    <input id="m-karbohidrat" type="hidden" value="${m.karbohidrat || 0}" />
    <input id="m-lemak" type="hidden" value="${m.lemak || 0}" />
    <input id="m-serat" type="hidden" value="${m.serat || 0}" />

    <div class="border-t border-stone-200 mt-4 pt-3">
      <div class="flex justify-between items-center mb-2">
        <div class="font-semibold text-sm">Bahan</div>
        <button type="button" onclick="addBahanRow()" class="text-xs border border-stone-300 px-3 py-1 rounded hover:bg-stone-50">+ Tambah Bahan</button>
      </div>
      <div id="bahan-list" class="space-y-2"></div>
    </div>
    `;
  window._menuBahan = (m.bahan || []).map(b => ({ bahan_baku_id: b.bahan_baku_id, nama: b.nama || '', jumlah: b.jumlah, satuan: b.satuan || 'g', kategori_sp: b.kategori_sp || '', berat_1_sp: b.berat_1_sp || 0, persen_bdd: b.persen_bdd || 100, berat_per_satuan: b.berat_per_satuan || 0, keterangan: b.keterangan || '' }));
  renderBahanList();
  hitungNutrisi();
  
  // Cek duplikat nama — load menu names once
  var existingNames = null;
  api.get('/menu?limit=500').then(function(resp) {
    existingNames = (resp.data || resp || []).filter(function(x) { return editing ? x.id !== editing.id : true; }).map(function(x) { return x.nama ? x.nama.toLowerCase().trim() : ''; });
  }).catch(function() { existingNames = []; });
  
  function checkDuplicateName(val) {
    var el = document.getElementById('m-nama');
    var dupEl = document.getElementById('m-nama-dup');
    var nama = (val || el.value).trim();
    if (!nama || !existingNames) { if (dupEl) dupEl.classList.add('hidden'); el.classList.remove('border-red-400','bg-red-50'); return false; }
    var isDup = existingNames.indexOf(nama.toLowerCase()) > -1;
    if (isDup) {
      el.classList.add('border-red-400','bg-red-50');
      if (!dupEl) {
        var p = document.createElement('p');
        p.id = 'm-nama-dup';
        p.className = 'text-xs text-red-600 mt-1';
        p.textContent = '⚠ Nama menu "' + nama + '" sudah ada';
        el.parentNode.appendChild(p);
      } else { dupEl.classList.remove('hidden'); dupEl.textContent = '⚠ Nama menu "' + nama + '" sudah ada'; }
    } else {
      el.classList.remove('border-red-400','bg-red-50');
      if (dupEl) dupEl.classList.add('hidden');
    }
    return isDup;
  }
  
  document.getElementById('m-nama').addEventListener('input', function() { checkDuplicateName(this.value); });
  
  document.getElementById('modal-save').onclick = async function() {
    if (!validateForm([{ id: 'm-nama', label: 'Nama Menu' }])) return;
    if (checkDuplicateName()) return showAlert('Nama menu sudah ada. Ganti nama terlebih dahulu.', 'warning');
    const payload = {
      nama: document.getElementById('m-nama').value,
      deskripsi: document.getElementById('m-deskripsi').value,
      gramasi_total: Math.round((window._menuBahan || []).reduce(function(s,b){ return s + (Number(b.jumlah)||0); }, 0) * 100) / 100,
      kalori: +document.getElementById('m-kalori').value || 0,
      protein: +document.getElementById('m-protein').value || 0,
      karbohidrat: +document.getElementById('m-karbohidrat').value || 0,
      lemak: +document.getElementById('m-lemak').value || 0,
      serat: +document.getElementById('m-serat').value || 0,
      bahan: window._menuBahan.filter(function(b) { return b.bahan_baku_id || b.nama; }),
    };
    if (editing) await api.put('/menu/' + editing.id, payload);
    else await api.post('/menu', payload);
    closeModal(); renderMenu();
  };
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}
function addBahanRow() { window._menuBahan.push({ bahan_baku_id: '', jumlah: 0, satuan: '', nama: '', keterangan: '' }); renderBahanList(); }
function removeBahanRow(i) { window._menuBahan.splice(i, 1); renderBahanList(); hitungNutrisi(); }
function hitungNutrisi() {
  var totalKalori = 0, totalProtein = 0, totalKarbo = 0, totalLemak = 0, totalSerat = 0;
  (window._menuBahan || []).forEach(function(b) {
    var jml = +b.jumlah || 0;
    if (!jml) return;
    var ref = window._spRefMap && window._spRefMap[b.nama];
    if (ref) {
      totalKalori += jml / 100 * (ref.energi || 0);
      totalProtein += jml / 100 * (ref.protein || 0);
      totalKarbo += jml / 100 * (ref.karbohidrat || 0);
      totalLemak += jml / 100 * (ref.lemak || 0);
      totalSerat += jml / 100 * (ref.serat || 0);
    }
  });
  ['kalori','protein','karbohidrat','lemak','serat'].forEach(function(k) {
    var el = document.getElementById('m-' + k);
    if (el) el.value = Math.round(({kalori:totalKalori,protein:totalProtein,karbohidrat:totalKarbo,lemak:totalLemak,serat:totalSerat})[k] * 100) / 100;
  });
}

function updateBahan(i, k, v) {
  window._menuBahan[i][k] = k === 'jumlah' ? +v : v;
  if (k === 'jumlah') {
    delete window._menuBahan[i]._autoJumlah;
  }
  hitungNutrisi();
}
function renderBahanList() {
  document.getElementById('bahan-list').innerHTML = window._menuBahan.map((b, i) => {
    var displayNama = b.nama || '';
    var displaySatuan = b.satuan || 'g';
    return '<div class="grid grid-cols-12 gap-1.5 items-center">' +
      '<div class="col-span-4 relative">' +
        '<input id="b-input-' + i + '" autocomplete="off" value="' + displayNama + '" placeholder="Cari bahan..." oninput="onBahanSearch(' + i + ', this)" onfocus="onBahanSearch(' + i + ', this)" onblur="setTimeout(function(){closeBahanDropdown(' + i + ')},200)" class="w-full h-9 px-2 border border-stone-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />' +
        '<div id="b-drop-' + i + '" class="hidden absolute z-10 w-full mt-0.5 bg-white border border-stone-200 rounded-md shadow-lg max-h-48 overflow-y-auto text-sm"></div>' +
      '</div>' +
      '<input type="text" value="' + displaySatuan + '" readonly class="col-span-1 h-9 px-2 border border-stone-200 rounded-md text-sm bg-stone-50 text-stone-500" />' +
      '<input type="number" step="0.01" value="' + (b.jumlah || '0') + '" onchange="updateBahan(' + i + ', \'jumlah\', this.value)" class="col-span-2 h-9 px-2 border border-stone-200 rounded-md text-sm mono" title="Gram per porsi" />' +
      '<input type="text" value="' + (b.keterangan || '') + '" onchange="updateBahan(' + i + ', \'keterangan\', this.value)" placeholder="catatan" class="col-span-4 h-9 px-2 border border-stone-200 rounded-md text-sm" />' +
      '<button type="button" onclick="removeBahanRow(' + i + ')" class="col-span-1 text-red-600 text-center py-2 hover:bg-red-50 rounded-md transition-colors" title="Hapus bahan">×</button>' +
    '</div>';
  }).join('');
}

function onBahanSearch(i, el) {
  var val = el.value;
  var dropdown = document.getElementById('b-drop-' + i);
  if (!dropdown) return;
  // Cek exact match di sp_referensi_bahan (prioritas)
  if (window._spRefMap && window._spRefMap[val]) {
    selectBahan(i, val);
    dropdown.classList.add('hidden');
    return;
  }
  // Cek exact match di bahan_baku (fallback)
  var bbExact = (window._bahanBaku || []).find(function(b) { return b.nama && b.nama.toLowerCase() === val.toLowerCase().trim(); });
  if (bbExact) {
    selectBahan(i, val);
    dropdown.classList.add('hidden');
    return;
  }
  var q = val.toLowerCase().trim();
  if (!q) { dropdown.classList.add('hidden'); return; }
  // Gabungkan hasil dari sp_referensi_bahan dan bahan_baku
  var spMatches = (window._spRefList || []).filter(function(r) { return r.nama && r.nama.toLowerCase().includes(q); });
  var bbMatches = (window._bahanBaku || []).filter(function(b) { return b.nama && b.nama.toLowerCase().includes(q); });
  // Merge: prioritaskan sp_referensi, tambah bahan_baku yang belum tercakup
  var seen = new Set();
  var merged = [];
  for (var r of spMatches) {
    if (!seen.has(r.nama.toLowerCase())) { seen.add(r.nama.toLowerCase()); merged.push({ sumber: 'sp', nama: r.nama, kategori: r.kategori || '', berat: r.berat_bersih, nutrisi: (r.energi ? r.energi + ' kkal' : '') + (r.protein ? ' · P' + r.protein + 'g' : '') + (r.karbohidrat ? ' · KH' + r.karbohidrat + 'g' : '') }); }
  }
  for (var b of bbMatches) {
    if (!seen.has(b.nama.toLowerCase())) { seen.add(b.nama.toLowerCase()); merged.push({ sumber: 'bb', nama: b.nama, kategori: b.kategori_sp || '', berat: b.berat_1_sp, nutrisi: (b.kalori ? b.kalori + ' kkal' : '') + (b.protein ? ' · P' + b.protein + 'g' : '') + (b.karbohidrat ? ' · KH' + b.karbohidrat + 'g' : '') }); }
  }
  if (!merged.length) { dropdown.classList.add('hidden'); return; }
  dropdown.innerHTML = merged.map(function(item) {
    var badge = item.sumber === 'sp' ? '<span class="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded mr-1">SP</span>' : '<span class="text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded mr-1">Baku</span>';
    return '<div onclick="selectBahan(' + i + ", '" + item.nama.replace(/'/g, "\\'") + "')\" class=\"px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-stone-100 last:border-0\">" +
      '<div class="font-medium text-stone-800">' + badge + ' ' + item.nama + '</div>' +
      '<div class="text-[10px] text-stone-400">' + (item.kategori || '') + (item.berat ? ' · 1SP=' + item.berat + 'g' : '') + (item.nutrisi ? ' · ' + item.nutrisi : '') + '</div>' +
    '</div>';
  }).join('');
  dropdown.classList.remove('hidden');
}

function closeBahanDropdown(i) {
  var d = document.getElementById('b-drop-' + i);
  if (d) d.classList.add('hidden');
}

async function selectBahan(i, nama) {
  var ref = window._spRefMap && window._spRefMap[nama];
  var bb = (window._bahanBaku || []).find(function(b) { return b.nama.toLowerCase() === nama.toLowerCase(); });
  
  if (ref) {
    // DATA DARI SP REFERENSI
    var spItem = (window._spRefList || []).find(function(r) { return r.nama === nama; });
    var kat = spItem ? spItem.kategori : (bb ? bb.kategori_sp : '');
    var berat1Sp = ref.berat_bersih;
    var perPorsi = berat1Sp;
    
    if (!bb) {
      // Auto-create bahan_baku jika belum ada di master
      try {
        var created = await api.post('/bahan_baku', {
          nama: nama,
          satuan: 'g',
          kategori_sp: kat || '',
          berat_1_sp: berat1Sp,
          persen_bdd: Math.round(ref.bdd_persen * 100),
          berat_per_satuan: berat1Sp,
          kalori: ref.energi || 0,
          protein: ref.protein || 0,
          karbohidrat: ref.karbohidrat || 0,
          lemak: ref.lemak || 0,
          serat: ref.serat || 0,
        });
        window._bahanBaku.push(created);
        bb = created;
      } catch (e) {
        console.warn('Gagal auto-create bahan_baku:', e.message);
      }
    }
    
    window._menuBahan[i].bahan_baku_id = bb ? bb.id : '';
    window._menuBahan[i].nama = nama;
    window._menuBahan[i].satuan = bb ? bb.satuan : 'g';
    window._menuBahan[i].kategori_sp = kat;
    window._menuBahan[i].berat_1_sp = berat1Sp;
    window._menuBahan[i].persen_bdd = Math.round(ref.bdd_persen * 100);
    window._menuBahan[i].kalori = ref.energi || 0;
    window._menuBahan[i].protein = ref.protein || 0;
    window._menuBahan[i].karbohidrat = ref.karbohidrat || 0;
    window._menuBahan[i].lemak = ref.lemak || 0;
    window._menuBahan[i].serat = ref.serat || 0;
    window._menuBahan[i].jumlah = perPorsi;
    window._menuBahan[i]._autoJumlah = perPorsi;
  } else if (bb) {
    // FALLBACK: DATA DARI BAHAN BAKU (tanpa SP reference)
    var kat = bb.kategori_sp || '';
    var berat1Sp = Number(bb.berat_1_sp || 0);
    var perPorsi = berat1Sp; // Default: 1 SP = berat_1_sp gram
    
    window._menuBahan[i].bahan_baku_id = bb.id || '';
    window._menuBahan[i].nama = nama;
    window._menuBahan[i].satuan = bb.satuan || 'g';
    window._menuBahan[i].kategori_sp = kat;
    window._menuBahan[i].berat_1_sp = berat1Sp;
    window._menuBahan[i].persen_bdd = Number(bb.persen_bdd || 100);
    window._menuBahan[i].kalori = Number(bb.kalori || 0);
    window._menuBahan[i].protein = Number(bb.protein || 0);
    window._menuBahan[i].karbohidrat = Number(bb.karbohidrat || 0);
    window._menuBahan[i].lemak = Number(bb.lemak || 0);
    window._menuBahan[i].serat = Number(bb.serat || 0);
    window._menuBahan[i].jumlah = perPorsi;
    window._menuBahan[i]._autoJumlah = perPorsi;
  } else {
    // Tidak ditemukan di sp_referensi maupun bahan_baku
    console.warn('Bahan tidak ditemukan:', nama);
    return;
  }
  
  var input = document.getElementById('b-input-' + i);
  if (input) input.value = nama;
  renderBahanList();
  hitungNutrisi();
}

async function deleteMenu(id) { if (!await showConfirm('Hapus menu?')) return; await api.del('/menu/' + id); renderMenu(); }

function toggleSelectAllMenu(master) {
  document.querySelectorAll('.menu-checkbox').forEach(cb => cb.checked = master.checked);
  updateSelectedMenuCount();
}
function updateSelectedMenuCount() {
  var checked = document.querySelectorAll('.menu-checkbox:checked').length;
  var btn = document.getElementById('menu-delete-selected');
  var countEl = document.getElementById('menu-selected-count');
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
async function deleteSelectedMenu() {
  var checked = document.querySelectorAll('.menu-checkbox:checked');
  var ids = Array.from(checked).map(cb => parseInt(cb.value)).filter(id => !isNaN(id));
  if (!ids.length) return showAlert('Pilih menu yang akan dihapus', 'warning');
  if (!await showConfirm('Hapus ' + ids.length + ' menu terpilih?')) return;
  try {
    await api.post('/menu/bulk-delete', { ids });
    showToast(ids.length + ' menu berhasil dihapus', 'success');
    renderMenu();
  } catch (e) {
    showToast('Gagal menghapus: ' + (e.message || 'Unknown error'), 'error');
  }
}

async function recalcNutrisiMenu() {
  if (!await showConfirm('Hitung ulang nutrisi semua menu berdasarkan bahan baku terkini?', 'Ya, Hitung')) return;
  try {
    var res = await api.post('/menu/recalculate-nutrisi', {});
    showToast(res.recalculated + ' menu diperbarui dari ' + res.total, 'success');
    renderMenu();
  } catch (e) {
    showAlert(e.message || 'Gagal', 'error');
  }
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function closeSiklusMenuPicker() {
  var m = document.getElementById('siklus-menu-picker');
  if (m) m.remove();
}

async function openSiklusMenuPicker() {
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
        '<div class="px-4 py-2.5 bg-stone-50 border-b border-stone-200 flex items-center justify-between">' +
          '<div class="font-semibold text-sm text-stone-700">' + escHtml(s.nama) + '</div>' +
          '<div class="flex items-center gap-2">' +
            (s.kategori_penerima ? '<span class="text-[10px] text-stone-400">' + escHtml(s.kategori_penerima) + '</span>' : '') +
            '<span class="text-[10px] px-2 py-0.5 rounded-full font-medium ' + statusColor + ' capitalize">' + s.status + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="divide-y divide-stone-100">';
      for (var ni = 0; ni < s.names.length; ni++) {
        var n = s.names[ni];
        if (n.source === 'menu') {
          // Menu items — clickable, untuk import bahan
          var bahanJson = escHtml(JSON.stringify(n.bahan || []));
    html += '<button type="button" onclick="selectSiklusMenuName(\'' + escHtml(n.nama) + "', '" + bahanJson + "')\" class=\"w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors\">" +
            '<div class="flex items-center gap-2">' +
            '<span class="text-xs text-stone-400 shrink-0 w-8">H' + n.hari_ke + '</span>' +
            '<span class="text-xs text-stone-500 shrink-0 w-14">' + n.hari_nama + '</span>' +
            '<span class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700 shrink-0">Menu</span>' +
            '<span class="text-sm font-medium text-stone-800 truncate">' + escHtml(n.nama) + '</span>' +
            (n.bahan && n.bahan.length ? '<span class="text-[10px] text-stone-400 shrink-0">' + n.bahan.length + ' bahan</span>' : '') +
            '<svg class="w-4 h-4 text-stone-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>' +
            '</div>' +
          '</button>';
        } else {
          // Resep items — non-clickable, info saja
          html += '<div class="px-4 py-2">' +
            '<div class="flex items-center gap-2 text-stone-500">' +
            '<span class="text-xs shrink-0 w-8">H' + n.hari_ke + '</span>' +
            '<span class="text-xs shrink-0 w-14">' + n.hari_nama + '</span>' +
            '<span class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-stone-100 text-stone-500 shrink-0">Resep</span>' +
            '<span class="text-sm font-medium text-stone-500 truncate">' + escHtml(n.nama) + '</span>' +
            (n.kategori_sp ? '<span class="text-[10px] text-stone-400 shrink-0 hidden sm:inline">(' + escHtml(n.kategori_sp) + ')</span>' : '') +
            (n.bahan && n.bahan.length ? '<span class="text-[10px] text-stone-400 shrink-0">· ' + escHtml(n.bahan[0].nama) + '</span>' : '') +
            '</div>' +
          '</div>';
        }
      }
      html += '</div></div>';
    }
    html += '</div>';

    // Create floating modal on top of main modal
    var existing = document.getElementById('siklus-menu-picker');
    if (existing) existing.remove();
    var m = document.createElement('div');
    m.id = 'siklus-menu-picker';
    m.className = 'fixed inset-0 z-[60] flex items-center justify-center bg-black/40';
    m.innerHTML = '<div class="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-hidden">' +
      '<div class="flex items-center justify-between px-5 py-3 border-b border-stone-200">' +
        '<h3 class="font-bold text-stone-700 text-sm">Pilih Nama dari Siklus Menu</h3>' +
        '<button onclick="closeSiklusMenuPicker()" class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-stone-100 text-stone-400">&times;</button>' +
      '</div>' +
      '<div id="sk-picker-body">' + html + '</div>' +
    '</div>';
    document.body.appendChild(m);
    m.addEventListener('click', function(e) { if (e.target === m) closeSiklusMenuPicker(); });
  } catch (e) {
    showAlert('Gagal memuat data siklus: ' + e.message, 'error');
  }
}

async function selectSiklusMenuName(nama, bahanJson) {
  document.getElementById('m-nama').value = nama;
  
  // Load bahan dari siklus
  var bahan = [];
  try { bahan = JSON.parse(bahanJson || '[]'); } catch(e) { bahan = []; }
  
  // Konfirmasi jika sudah ada bahan di form
  if (bahan.length && window._menuBahan.some(function(b) { return b.nama; })) {
    if (!await showConfirm('Akan mengganti ' + window._menuBahan.filter(function(b){return b.nama;}).length + ' bahan yang sudah ada dengan ' + bahan.length + ' bahan dari siklus. Lanjutkan?')) {
      return;
    }
  }
  
  if (bahan.length) {
    window._menuBahan = [];
    for (var i = 0; i < bahan.length; i++) {
      if (!bahan[i].nama) continue;
      window._menuBahan.push({ bahan_baku_id: '', jumlah: 0, satuan: 'g', nama: '', keterangan: '' });
      await selectBahan(window._menuBahan.length - 1, bahan[i].nama);
    }
    showToast('Nama & ' + bahan.length + ' bahan diambil dari siklus', 'success');
  } else {
    showToast('Nama diambil dari siklus: ' + nama, 'success');
  }
  closeSiklusMenuPicker();
}

function showMenuInfo() {
  var existing = document.getElementById('menu-info-popup');
  if (existing) { existing.remove(); return; }
  var div = document.createElement('div');
  div.id = 'menu-info-popup';
  div.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-black/30';
  div.innerHTML = '<div class="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6" onclick="event.stopPropagation()">' +
    '<div class="flex items-center justify-between mb-4">' +
      '<h3 class="font-bold text-stone-700">Form Menu</h3>' +
      '<button onclick="document.getElementById(\'menu-info-popup\').remove()" class="text-stone-400 hover:text-stone-600"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
    '</div>' +
    '<div class="space-y-4 text-sm text-stone-600">' +
      '<div class="flex gap-3 items-start">' +
        '<span class="shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>' +
        '<div><span class="font-semibold text-stone-700">Buat Resep</span><br>Tulis nama menu, deskripsi, dan tambahkan bahan-bahan. Jumlah gramasi per porsi auto terisi dari SP referensi.</div>' +
      '</div>' +
      '<div class="flex gap-3 items-start">' +
        '<span class="shrink-0 w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>' +
        '<div><span class="font-semibold text-stone-700">Gunakan di Siklus</span><br>Menu yang sudah dibuat bisa dipilih di modul <strong>Siklus</strong> → pilih menu per hari.</div>' +
      '</div>' +
      '<div class="flex gap-3 items-start">' +
        '<span class="shrink-0 w-7 h-7 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>' +
        '<div><span class="font-semibold text-stone-700">Lihat Kebutuhan</span><br>Buka <strong>Perencanaan</strong> atau <strong>Total Kebutuhan</strong> untuk melihat total bahan yang harus dibeli.</div>' +
      '</div>' +
      '<div class="flex gap-3 items-start">' +
        '<span class="shrink-0 w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></span>' +
        '<div><span class="font-semibold text-stone-700">Buat Pesanan</span><br>Dari Total Kebutuhan, klik <strong>Buat Draft PR</strong> untuk membuat Purchase Request ke pemasok.</div>' +
      '</div>' +
    '</div>' +
    '<div class="mt-4 pt-3 border-t border-stone-100 text-xs text-stone-400 text-center">' +
      '<svg class="w-3.5 h-3.5 inline -mt-0.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg> Bisa juga ambil resep dari siklus yang sudah ada dengan tombol <strong>Siklus</strong>' +
    '</div>' +
  '</div>';
  div.onclick = function() { div.remove(); };
  document.body.appendChild(div);
}

function openAIDialog() {
  document.getElementById('modal-title').textContent = '✨ Saran Menu AI';
  document.getElementById('modal-body').innerHTML = `
    <div><label class="text-sm">Kategori Penerima</label>
      <select id="ai-kat" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md">
        ${['TK/PAUD','SD 1-3','SD 4-6','SMP','SMA','Ibu Hamil','Ibu Menyusui','Balita'].map(o => `<option>${o}</option>`).join('')}
      </select></div>
    <div class="mt-3"><label class="text-sm">Catatan (opsional)</label>
      <textarea id="ai-note" rows="2" class="mt-1 w-full px-3 py-2 border border-stone-200 rounded-md" placeholder="Mis. hindari kacang, bahan lokal Jawa Tengah"></textarea></div>
    <button onclick="runAI()" class="mt-3 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md text-sm font-medium">Buat Saran</button>
    <div id="ai-out" class="mt-4"></div>`;
  document.getElementById('modal-save').style.display = 'none';
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}
async function runAI() {
  document.getElementById('ai-out').innerHTML = '<div class="text-stone-500 text-sm">⏳ Membuat saran...</div>';
  const r = await fetch('/api/ai/suggest-menu', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ kategori: document.getElementById('ai-kat').value, catatan: document.getElementById('ai-note').value }) });
  const data = await r.json();
  if (!r.ok) { document.getElementById('ai-out').innerHTML = `<div class="text-red-700 text-sm">${data.error}</div>`; return; }
  const s = data.suggestion;
  document.getElementById('ai-out').innerHTML = `
    <div class="bg-orange-50 border border-orange-200 rounded p-3">
      <div class="font-bold">${s.nama_menu}</div>
      <div class="text-sm text-stone-700 mt-1">${s.deskripsi || ''}</div>
      ${s.kandungan_gizi ? `<div class="grid grid-cols-5 gap-2 my-2 text-xs">${Object.entries(s.kandungan_gizi).map(([k,v]) => `<div class="bg-white p-2 rounded"><div class="text-stone-500 uppercase">${k}</div><div class="mono">${v}</div></div>`).join('')}</div>` : ''}
      ${s.bahan ? `<div class="text-xs mt-2"><div class="font-semibold mb-1">Bahan:</div><ul class="space-y-0.5">${s.bahan.map(b => `<li>• ${b.nama} — <span class="mono">${b.jumlah} ${b.satuan}</span></li>`).join('')}</ul></div>` : ''}
    </div>`;
}

