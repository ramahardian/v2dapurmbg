// ===== Menu (custom with bahan) =====
let menuState = { page: 1, limit: 10, search: '', total: 0, totalPages: 1 };
let menuViewMode = 'list'; // 'list' | 'siklus'

async function renderMenu() {
  const c = document.getElementById('content');
  if (!c) return;
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    // Load bahan baku regardless of view mode
    const bahan = await api.get('/bahan_baku');
    window._bahanBaku = bahan;

    if (menuViewMode === 'siklus') {
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
      const filledDays = s.days.filter(d => d.menu_id).length;
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
              return `<div class="border border-stone-200 rounded-lg p-3 ${d.menu_id ? 'hover:border-[#1e40af]/30 hover:shadow-sm' : 'border-dashed bg-stone-50/50'} transition-all">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-[10px] font-semibold uppercase text-stone-400">Hari ${d.hari_ke}</span>
                  <span class="text-[10px] text-stone-400">${d.hari_nama}</span>
                </div>
                ${d.foto ? `<img src="${d.foto}" class="w-full h-20 object-cover rounded-lg mb-2 border border-stone-100" alt="${d.menu_nama}" />` : ''}
                ${d.menu_id ? `
                  <div class="font-medium text-sm text-stone-800 truncate" title="${d.menu_nama}">${d.menu_nama}</div>
                  <div class="flex items-center gap-2 mt-1.5 text-[10px] text-stone-500">
                    <span>${d.jumlah_porsi} porsi</span>
                    ${d.kalori ? `<span class="mono">${fmtNum(d.kalori)} kkal</span>` : ''}
                    ${d.gramasi_total ? `<span class="mono">${fmtNum(d.gramasi_total)}g</span>` : ''}
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
                      ${m.foto ? `<img src="${m.foto}" class="w-8 h-8 rounded object-cover border border-stone-200 shrink-0" />` : ''}
                      <span class="truncate max-w-[180px]" title="${m.nama}">${m.nama}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-sm whitespace-nowrap">${m.kategori_penerima ? kategoriBadge(m.kategori_penerima) : '-'}</td>
                  <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${m.gramasi_total}g</td>
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
  'Ibu Hamil': { bg: '#be123c' },
  'Ibu Menyusui': { bg: '#6d28d9' },
  'Balita': { bg: '#0e7490' },
  'TK/PAUD': { bg: '#047857' },
  'SD 1-3': { bg: '#c2410c' },
  'SD 4-6': { bg: '#d97706' },
  'SMP': { bg: '#1d4ed8' },
  'SMA': { bg: '#7c3aed' },
};

function kategoriBadge(kat) {
  const c = KATEGORI_COLORS[kat] || { bg: '#78716c' };
  return `<span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium text-white" style="background:${c.bg};">${kat}</span>`;
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
              <input type="checkbox" id="menu-select-all" onchange="toggleSelectAllMenu(this)" class="w-4 h-4 rounded border-stone-300 text-[#1e40af] focus:ring-[#1e40af]/30">
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
                <input type="checkbox" value="${m.id}" onchange="updateSelectedMenuCount()" class="menu-checkbox w-4 h-4 rounded border-stone-300 text-[#1e40af] focus:ring-[#1e40af]/30">
              </td>
              <td class="px-4 py-3 text-sm font-medium truncate max-w-[180px]" title="${m.nama}">
                <div class="flex items-center gap-2">
                  ${m.foto ? `<img src="${m.foto}" class="w-8 h-8 rounded object-cover border border-stone-200 shrink-0" />` : ''}
                  <span>${m.nama}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-sm whitespace-nowrap">${m.kategori_penerima ? kategoriBadge(m.kategori_penerima) : '-'}</td>
              <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${m.gramasi_total}g</td>
              <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${m.kalori} kkal</td>
              <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${(m.bahan && m.bahan.length) || 0}</td>
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
      fetch('/api/menu/' + menuId)
        .then(r => r.json())
        .then(menu => openMenuForm(menu));
    });
  });
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const menuId = this.getAttribute('data-menu-id');
      deleteMenu(menuId);
    });
  });
}

function openMenuForm(editing) {
  const m = editing || { nama: '', kategori_penerima: '', deskripsi: '', gramasi_total: 0, kalori: 0, protein: 0, karbohidrat: 0, lemak: 0, serat: 0, bahan: [] };
  document.getElementById('modal-title').textContent = editing ? 'Edit Menu' : 'Tambah Menu';
  document.getElementById('modal-body').innerHTML = `
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="text-sm">Nama Menu *</label>
        <div class="flex gap-2">
          <input id="m-nama" value="${m.nama}" class="mt-1 flex-1 h-10 px-3 border border-stone-200 rounded-md" />
          <button type="button" onclick="openSiklusMenuPicker()" class="mt-1 shrink-0 px-3 h-10 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 whitespace-nowrap" title="Ambil nama dari siklus">Siklus</button>
        </div>
      </div>
      <div><label class="text-sm">Kategori Penerima</label>
        <select id="m-kategori" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md">
          <option value="">—</option>${['Ibu Hamil','Ibu Menyusui','Balita','TK/PAUD','SD 1-3','SD 4-6','SMP','SMA'].map(o => `<option value="${o}" ${m.kategori_penerima === o ? 'selected':''}>${o}</option>`).join('')}
        </select></div>
      <div><label class="text-sm">Jumlah Porsi <span id="m-porsi-label" class="text-stone-400 font-normal">(dari penerima manfaat)</span></label>
        <input id="m-jumlah-porsi" type="number" readonly value="0" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md bg-stone-50 text-sm font-semibold" />
      </div>
    </div>
    <div class="mt-3"><label class="text-sm">Deskripsi</label><textarea id="m-deskripsi" rows="2" class="mt-1 w-full px-3 py-2 border border-stone-200 rounded-md">${m.deskripsi || ''}</textarea></div>
    <div class="flex items-center justify-between mt-3">
      <div class="flex-1 grid grid-cols-5 gap-2">
        ${[['gramasi_total','Total Gramasi'],['kalori','Kalori'],['protein','Protein'],['karbohidrat','Karbo'],['lemak','Lemak']].map(([k,l]) =>
          `<div><label class="text-xs">${l}</label><input id="m-${k}" type="number" value="${m[k] || 0}" class="mt-1 w-full h-9 px-2 border border-stone-200 rounded-md mono text-sm" /></div>`).join('')}
      </div>
      <button type="button" onclick="hitungNutrisiAI()" class="ml-2 mt-5 shrink-0 px-3 h-9 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 whitespace-nowrap" title="Hitung nutrisi pakai AI">AI</button>
    </div>
    <div class="mt-3"><label class="text-sm">Foto Menu</label>
      <div class="flex items-center gap-3 mt-1">
        ${m.foto ? `<div class="relative group"><img src="${m.foto}" class="w-20 h-20 object-cover rounded-lg border border-stone-200" /><button type="button" onclick="document.getElementById('m-foto').value='';this.closest('.flex').querySelector('img').remove();document.getElementById('m-foto-preview').innerHTML=''" class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity">&times;</button></div>` : ''}
        <div id="m-foto-preview"></div>
        <button type="button" onclick="document.getElementById('m-foto-input').click()" class="px-3 py-1.5 text-xs border border-stone-300 rounded hover:bg-stone-50">Pilih Foto</button>
        <input type="hidden" id="m-foto" value="${m.foto || ''}" />
        <input type="file" id="m-foto-input" accept="image/*" class="hidden" onchange="previewMenuFoto(this)" />
      </div>
    </div>
    <div class="border-t border-stone-200 mt-4 pt-3">
      <div class="flex justify-between items-center mb-2">
        <div class="font-semibold text-sm">Bahan & Gramasi</div>
        <button type="button" onclick="addBahanRow()" class="text-xs border border-stone-300 px-3 py-1 rounded">+ Tambah Bahan</button>
      </div>
      <div id="bahan-list" class="space-y-2"></div>
    </div>
    `;
  window._menuBahan = (m.bahan || []).map(b => ({ bahan_baku_id: b.bahan_baku_id, jumlah: b.jumlah, berat_per_satuan: b.berat_per_satuan || 0 }));
  renderBahanList();
  loadSpMap(m.kategori_penerima);
  document.getElementById('m-kategori').onchange = function() { loadSpMap(this.value); };
  document.getElementById('modal-save').onclick = async () => {
    if (!validateForm([{ id: 'm-nama', label: 'Nama Menu' }])) return;
    const payload = {
      nama: document.getElementById('m-nama').value,
      kategori_penerima: document.getElementById('m-kategori').value,
      deskripsi: document.getElementById('m-deskripsi').value,
      gramasi_total: +document.getElementById('m-gramasi_total').value || 0,
      kalori: +document.getElementById('m-kalori').value || 0,
      protein: +document.getElementById('m-protein').value || 0,
      karbohidrat: +document.getElementById('m-karbohidrat').value || 0,
      lemak: +document.getElementById('m-lemak').value || 0,
      foto: document.getElementById('m-foto').value || undefined,
      bahan: window._menuBahan.filter(b => b.bahan_baku_id && (b.jumlah || b.kategori_sp)),
    };
    if (editing) await api.put('/menu/' + editing.id, payload);
    else await api.post('/menu', payload);
    closeModal(); renderMenu();
  };
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}
function addBahanRow() { window._menuBahan.push({ bahan_baku_id: '', jumlah: 0, satuan: '' }); renderBahanList(); hitungNutrisi(); }
function removeBahanRow(i) { window._menuBahan.splice(i, 1); renderBahanList(); hitungNutrisi(); }
function gramasiKeGram(jml, satuan, beratPerSatuan) {
  var s = (satuan || '').toLowerCase();
  if (s === 'kg' || s === 'kilogram') return jml * 1000;
  if (s === 'g' || s === 'gram' || s === 'gr') return jml;
  if (beratPerSatuan > 0) return jml * beratPerSatuan;
  return jml;
}

function hitungNutrisi() {
  var totalGramasi = 0, totalKalori = 0, totalProtein = 0, totalKarbo = 0, totalLemak = 0;
  (window._menuBahan || []).forEach(function(b) {
    if (!b.bahan_baku_id || !b.jumlah) return;
    var bb = (window._bahanBaku || []).find(function(x) { return x.id == b.bahan_baku_id; });
    if (!bb) return;
    var jml = +b.jumlah || 0;
    var gram = gramasiKeGram(jml, bb.satuan, +bb.berat_per_satuan || 0);
    totalGramasi += gram;
    totalKalori += gram / 100 * (+bb.kalori || 0);
    totalProtein += gram / 100 * (+bb.protein || 0);
    totalKarbo += gram / 100 * (+bb.karbohidrat || 0);
    totalLemak += gram / 100 * (+bb.lemak || 0);
  });
  ['gramasi_total','kalori','protein','karbohidrat','lemak'].forEach(function(k) {
    var el = document.getElementById('m-' + k);
    if (el) el.value = Math.round(({gramasi_total: totalGramasi, kalori: totalKalori, protein: totalProtein, karbohidrat: totalKarbo, lemak: totalLemak}[k]) * 100) / 100;
  });
}

async function hitungNutrisiAI() {
  var nama = document.getElementById('m-nama')?.value.trim();
  var bahan = (window._menuBahan || []).filter(function(b) { return b.bahan_baku_id; });
  if (!bahan.length) {
    showAlert('Tambahkan bahan terlebih dahulu', 'warning');
    return;
  }
  var bahanData = bahan.map(function(b) {
    var bb = (window._bahanBaku || []).find(function(x) { return x.id == b.bahan_baku_id; });
    return { nama: bb ? bb.nama : '?', jumlah: b.jumlah || 0, satuan: bb ? bb.satuan : '' };
  });
  try {
    var res = await api.post('/ai/hitung-nutrisi', { nama_menu: nama, bahan: bahanData });
    ['gramasi_total','kalori','protein','karbohidrat','lemak'].forEach(function(k) {
      var el = document.getElementById('m-' + k);
      if (el && res[k] != null) el.value = Math.round(res[k] * 100) / 100;
    });
    showToast('Nutrisi terisi dari AI', 'success');
  } catch (e) {
    showAlert('Gagal hitung AI: ' + e.message, 'error');
  }
}

async function loadSpMap(kategori) {
  if (!kategori) { window._spMap = {}; window._jumlahPorsi = 0; return; }
  try {
    const [rows, pm] = await Promise.all([
      api.get('/sp/standar/' + encodeURIComponent(kategori)),
      api.get('/penerima_manfaat/total?kategori_penerima=' + encodeURIComponent(kategori))
    ]);
    window._spMap = {};
    for (const r of rows) window._spMap[r.kategori_sp] = Number(r.sp_value);
    window._jumlahPorsi = Number(pm.total) || 0;
    const el = document.getElementById('m-jumlah-porsi');
    if (el) el.value = window._jumlahPorsi;
    // Recalculate existing bahan items with new SP data
    for (var i = 0; i < window._menuBahan.length; i++) {
      var b = window._menuBahan[i];
      if (b.bahan_baku_id && b.kategori_sp && b.berat_1_sp > 0 && window._spMap && window._spMap[b.kategori_sp]) {
        var perPorsi = window._spMap[b.kategori_sp] * (+b.berat_1_sp);
        b.jumlah = perPorsi * (window._jumlahPorsi || 1);
      }
    }
    renderBahanList();
    hitungNutrisi();
  } catch { window._spMap = {}; window._jumlahPorsi = 0; }
}

function updateBahan(i, k, v) {
  window._menuBahan[i][k] = k === 'jumlah' ? +v : v;
  if (k === 'bahan_baku_id') {
    const bb = (window._bahanBaku || []).find(b => b.id == v);
    window._menuBahan[i].satuan = bb ? bb.satuan : '';
    window._menuBahan[i].kategori_sp = bb ? bb.kategori_sp : '';
    window._menuBahan[i].berat_1_sp = bb ? (+bb.berat_1_sp || 0) : 0;
    window._menuBahan[i].persen_bdd = bb ? (+bb.persen_bdd || 100) : 100;
    window._menuBahan[i].berat_per_satuan = bb ? (+bb.berat_per_satuan || 0) : 0;
    // Auto-calculate jumlah from SP × jumlah porsi
    if (bb && bb.kategori_sp && bb.berat_1_sp > 0 && window._spMap && window._spMap[bb.kategori_sp]) {
      var perPorsi = window._spMap[bb.kategori_sp] * (+bb.berat_1_sp);
      window._menuBahan[i].jumlah = perPorsi * (window._jumlahPorsi || 1);
    }
    renderBahanList();
  }
  hitungNutrisi();
}
function renderBahanList() {
  var mKat = document.getElementById('m-kategori')?.value || '';
  var datalistId = 'dl-bahan-' + Date.now();
  document.getElementById('bahan-list').innerHTML = window._menuBahan.map((b, i) => {
    var bb = (window._bahanBaku || []).find(x => x.id == b.bahan_baku_id);
    var spInfo = '';
    if (bb && bb.kategori_sp && bb.berat_1_sp > 0) {
      var extras = [];
      extras.push('1SP=' + bb.berat_1_sp + 'g');
      if (+bb.berat_per_satuan > 0) extras.push('1' + bb.satuan + '=' + bb.berat_per_satuan + 'g');
      var perPorsi = window._spMap && window._spMap[bb.kategori_sp] ? window._spMap[bb.kategori_sp] * (+bb.berat_1_sp) : 0;
      var totalGram = b.jumlah || 0;
      spInfo = '<div class="col-span-2 text-[10px] text-stone-400 leading-tight">' + bb.kategori_sp + ' · ' + extras.join(' · ') + ' · BDD=' + bb.persen_bdd + '%' + (perPorsi ? ' · <span class="text-emerald-600 font-medium">' + perPorsi + 'g/porsi</span>' : '') + (totalGram ? ' · total <span class="text-emerald-700 font-medium">' + Math.round(totalGram) + 'g</span>' : '') + '</div>';
    } else if (bb && +bb.berat_per_satuan > 0) {
      spInfo = '<div class="col-span-2 text-[10px] text-stone-400 leading-tight">1 ' + bb.satuan + ' = ' + bb.berat_per_satuan + 'g</div>';
    }
    return '<div class="grid grid-cols-12 gap-1.5 items-center">' +
      '<div class="col-span-5 relative">' +
        '<input list="dl-' + i + '" value="' + (bb ? bb.nama : '') + '" placeholder="Cari bahan..." oninput="onBahanInput(' + i + ', this)" onfocus="this.select()" class="w-full h-9 px-2 border border-stone-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />' +
        '<datalist id="dl-' + i + '">' +
          window._bahanBaku.map(function(x) { return '<option value="' + x.nama + '" data-id="' + x.id + '"></option>'; }).join('') +
        '</datalist>' +
      '</div>' +
      '<input type="text" value="' + (b.satuan || '') + '" readonly class="col-span-1 h-9 px-2 border border-stone-200 rounded-md text-sm bg-stone-50 text-stone-500" placeholder="unit" />' +
      '<input type="number" value="' + (b.jumlah || '') + '" onchange="updateBahan(' + i + ', \'jumlah\', this.value)" placeholder="' + (bb ? bb.satuan : 'gram') + '" class="col-span-3 h-9 px-2 border border-stone-200 rounded-md text-sm mono" />' +
      (spInfo || '<div class="col-span-2"></div>') +
      '<button type="button" onclick="removeBahanRow(' + i + ')" class="col-span-1 text-red-600 text-center py-2">×</button>' +
    '</div>';
  }).join('');
}

function onBahanInput(i, el) {
  var val = el.value;
  var bahan = (window._bahanBaku || []).find(function(x) { return x.nama === val; });
  if (bahan) {
    updateBahan(i, 'bahan_baku_id', bahan.id);
  } else if (val === '') {
    updateBahan(i, 'bahan_baku_id', '');
  }
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

function previewMenuFoto(input) {
  var file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showAlert('Ukuran foto maksimal 5MB', 'warning'); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('m-foto').value = e.target.result;
    document.getElementById('m-foto-preview').innerHTML = '<img src="' + e.target.result + '" class="w-20 h-20 object-cover rounded-lg border border-stone-200" />';
  };
  reader.readAsDataURL(file);
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
        var badge = n.source === 'menu' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700';
        var badgeLabel = n.source === 'menu' ? 'Menu' : 'Resep';
        html += '<button type="button" onclick="selectSiklusMenuName(\'' + escHtml(n.nama) + '\',\'' + escHtml(s.kategori_penerima || '') + '\')" class="w-full text-left px-4 py-2.5 hover:bg-stone-50 transition-colors flex items-center gap-2">' +
          '<span class="text-xs text-stone-400 shrink-0 w-8">H' + n.hari_ke + '</span>' +
          '<span class="text-xs text-stone-500 shrink-0 w-14">' + n.hari_nama + '</span>' +
          '<span class="text-[10px] px-1.5 py-0.5 rounded font-medium ' + badge + ' shrink-0">' + badgeLabel + '</span>' +
          '<span class="text-sm font-medium text-stone-800 truncate">' + escHtml(n.nama) + '</span>' +
          (n.kategori_sp ? '<span class="text-[10px] text-stone-400 shrink-0 hidden sm:inline">' + escHtml(n.kategori_sp) + '</span>' : '') +
        '</button>';
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

function selectSiklusMenuName(nama, kategori) {
  document.getElementById('m-nama').value = nama;
  if (kategori) {
    var katSelect = document.getElementById('m-kategori');
    if (katSelect) { katSelect.value = kategori; loadSpMap(kategori); }
  }
  closeSiklusMenuPicker();
  showToast('Nama diambil dari siklus: ' + nama, 'success');
}

function openAIDialog() {
  document.getElementById('modal-title').textContent = '✨ Saran Menu AI';
  document.getElementById('modal-body').innerHTML = `
    <div><label class="text-sm">Kategori Penerima</label>
      <select id="ai-kat" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md">
        ${['Ibu Hamil','Ibu Menyusui','Balita','TK/PAUD','SD 1-3','SD 4-6','SMP','SMA'].map(o => `<option>${o}</option>`).join('')}
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

