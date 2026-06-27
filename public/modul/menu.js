// ===== Menu (custom with bahan) =====
let menuState = { page: 1, limit: 10, search: '', total: 0, totalPages: 1 };

async function renderMenu() {
  const c = document.getElementById('content');
  if (!c) return;
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const params = new URLSearchParams({ page: menuState.page, limit: menuState.limit, search: menuState.search });
    const r = await fetch('/api/menu?' + params, { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal memuat menu');
    }
    const data = await r.json();
    const pagination = data.pagination || { total: data.length || 0, totalPages: 1, page: menuState.page };
    menuState = { ...menuState, total: pagination.total, totalPages: pagination.totalPages, page: pagination.page };
    
    const bahan = await api.get('/bahan_baku');
    window._bahanBaku = bahan;
    
    c.innerHTML = renderMenuHtml(Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []));
    renderPagination();
    attachMenuHandlers();
  } catch (err) {
    console.error('Menu error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat menu: ${err.message}</div>`;
  }
}

const KATEGORI_COLORS = {
  'Ibu Hamil': { bg: '#be123c' },
  'Ibu Menyusui': { bg: '#6d28d9' },
  'Balita': { bg: '#0e7490' },
  'PAUD': { bg: '#047857' },
  'TK': { bg: '#b45309' },
  'SD': { bg: '#c2410c' },
  'SMP': { bg: '#1d4ed8' },
};

function kategoriBadge(kat) {
  const c = KATEGORI_COLORS[kat] || { bg: '#78716c' };
  return `<span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium text-white" style="background:${c.bg};">${kat}</span>`;
}

function renderMenuHtml(menus) {
  return `<div class="flex flex-wrap justify-between gap-2 mb-4">
    <button id="add-menu-btn" class="bg-[#1e40af] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-md text-sm font-medium">+ Tambah Menu</button>
    <div class="relative">
      <input type="text" id="search-menu-input" placeholder="Cari nama menu..." value="${menuState.search}"
        class="pl-10 pr-4 py-2 border border-stone-200 rounded-md text-sm w-48 focus:outline-none focus:border-[#1e40af]">
      <svg class="absolute left-3 top-2.5 w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
      </svg>
    </div>
  </div>
  <div class="bg-white border border-stone-200 rounded-lg overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="bg-stone-50">
          <tr>
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
              <td class="px-4 py-3 text-sm font-medium truncate max-w-[180px]" title="${m.nama}">${m.nama}</td>
              <td class="px-4 py-3 text-sm whitespace-nowrap">${m.kategori_penerima ? kategoriBadge(m.kategori_penerima) : '-'}</td>
              <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${m.gramasi_total}g</td>
              <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${m.kalori} kkal</td>
              <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${(m.bahan && m.bahan.length) || 0}</td>
              <td class="px-4 py-3 text-sm text-right whitespace-nowrap">
                <button data-menu-id="${m.id}" class="edit-btn text-stone-500 hover:text-stone-900 mr-2" title="Edit"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button data-menu-id="${m.id}" class="delete-btn text-red-600 hover:text-red-800" title="Hapus"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
              </td>
            </tr>`).join('') : '<tr><td colspan="6" class="text-center py-12 text-stone-400"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg><div>Belum ada menu</div></td></tr>'}
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
      <div><label class="text-sm">Nama Menu *</label><input id="m-nama" value="${m.nama}" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md" /></div>
      <div><label class="text-sm">Kategori Penerima</label>
        <select id="m-kategori" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md">
          <option value="">—</option>${['Ibu Hamil','Ibu Menyusui','Balita','PAUD','TK','SD','SMP'].map(o => `<option value="${o}" ${m.kategori_penerima === o ? 'selected':''}>${o}</option>`).join('')}
        </select></div>
    </div>
    <div class="mt-3"><label class="text-sm">Deskripsi</label><textarea id="m-deskripsi" rows="2" class="mt-1 w-full px-3 py-2 border border-stone-200 rounded-md">${m.deskripsi || ''}</textarea></div>
    <div class="grid grid-cols-5 gap-2 mt-3">
      ${[['gramasi_total','Gramasi'],['kalori','Kalori'],['protein','Protein'],['karbohidrat','Karbo'],['lemak','Lemak']].map(([k,l]) =>
        `<div><label class="text-xs">${l}</label><input id="m-${k}" type="number" value="${m[k] || 0}" class="mt-1 w-full h-9 px-2 border border-stone-200 rounded-md mono text-sm" /></div>`).join('')}
    </div>
    <div class="border-t border-stone-200 mt-4 pt-3">
      <div class="flex justify-between items-center mb-2">
        <div class="font-semibold text-sm">Bahan & Gramasi</div>
        <button type="button" onclick="addBahanRow()" class="text-xs border border-stone-300 px-3 py-1 rounded">+ Tambah Bahan</button>
      </div>
      <div id="bahan-list" class="space-y-2"></div>
    </div>`;
  window._menuBahan = (m.bahan || []).map(b => ({ bahan_baku_id: b.bahan_baku_id, jumlah: b.jumlah }));
  renderBahanList();
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
      bahan: window._menuBahan.filter(b => b.bahan_baku_id && b.jumlah),
    };
    if (editing) await api.put('/menu/' + editing.id, payload);
    else await api.post('/menu', payload);
    closeModal(); renderMenu();
  };
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}
function addBahanRow() { window._menuBahan.push({ bahan_baku_id: '', jumlah: 0, satuan: '' }); renderBahanList(); }
function removeBahanRow(i) { window._menuBahan.splice(i, 1); renderBahanList(); }
function updateBahan(i, k, v) {
  window._menuBahan[i][k] = k === 'jumlah' ? +v : v;
  if (k === 'bahan_baku_id') {
    const bb = (window._bahanBaku || []).find(b => b.id == v);
    window._menuBahan[i].satuan = bb ? bb.satuan : '';
    renderBahanList();
  }
}
function renderBahanList() {
  document.getElementById('bahan-list').innerHTML = window._menuBahan.map((b, i) => `
    <div class="grid grid-cols-12 gap-1.5 items-center">
      <select onchange="updateBahan(${i}, 'bahan_baku_id', this.value)" class="col-span-5 h-9 px-2 border border-stone-200 rounded-md text-sm">
        <option value="">— Pilih —</option>
        ${window._bahanBaku.map(bb => `<option value="${bb.id}" ${b.bahan_baku_id == bb.id ? 'selected' : ''}>${bb.nama}</option>`).join('')}
      </select>
      <input type="text" value="${b.satuan || ''}" readonly class="col-span-2 h-9 px-2 border border-stone-200 rounded-md text-sm bg-stone-50 text-stone-500" placeholder="unit" />
      <input type="number" value="${b.jumlah}" onchange="updateBahan(${i}, 'jumlah', this.value)" placeholder="Jumlah" class="col-span-4 h-9 px-2 border border-stone-200 rounded-md text-sm mono" />
      <button type="button" onclick="removeBahanRow(${i})" class="col-span-1 text-red-600 text-center py-2">×</button>
    </div>`).join('');
}
async function deleteMenu(id) { if (!await showConfirm('Hapus menu?')) return; await api.del('/menu/' + id); renderMenu(); }

function openAIDialog() {
  document.getElementById('modal-title').textContent = '✨ Saran Menu AI';
  document.getElementById('modal-body').innerHTML = `
    <div><label class="text-sm">Kategori Penerima</label>
      <select id="ai-kat" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md">
        ${['Ibu Hamil','Ibu Menyusui','Balita','PAUD','TK','SD','SMP'].map(o => `<option>${o}</option>`).join('')}
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

