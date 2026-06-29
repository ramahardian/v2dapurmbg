// ===== Gudang (with search & pagination) =====
window.addEventListener('unhandledrejection', e => {
  console.error('[UNHANDLED]', e.reason);
});

let gudangState = { tab: 'stok', page: 1, limit: 10, search: '', total: 0, totalPages: 1 };

async function renderGudang() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/gudang', { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Gagal memuat gudang');
    }
    c.innerHTML = await r.text();

    // Search
    const searchInput = document.getElementById('gudang-search');
    let debounceTimer;
    searchInput.oninput = function() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        gudangState.search = this.value;
        gudangState.page = 1;
        loadGudang();
      }, 300);
    };

    // Load initial
    gudangState.tab = 'stok';
    await loadGudang();
  } catch (err) {
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat gudang: ${err.message}</div>`;
  }
}

function showGudang(tab) {
  gudangState.tab = tab;
  gudangState.page = 1;
  gudangState.search = '';
  const searchInput = document.getElementById('gudang-search');
  if (searchInput) searchInput.value = '';
  const tabColors = {
    stok: { active: 'bg-white text-blue-600 shadow-sm', inactive: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
    masuk: { active: 'bg-white text-emerald-600 shadow-sm', inactive: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
    keluar: { active: 'bg-white text-orange-600 shadow-sm', inactive: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
  };
  ['stok','masuk','keluar'].forEach(t => {
    const el = document.getElementById('tab-'+t);
    const c = tabColors[t];
    const base = 'px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-medium rounded-t-lg border border-b-0 border-stone-200 -mb-px';
    const extra = t === tab ? ' relative z-[2]' : '';
    if (el) el.className = base + ' ' + (t === tab ? c.active : c.inactive) + extra;
  });
  loadGudang();
}

async function loadGudang() {
  const wrap = document.getElementById('gudang-content');
  const pagWrap = document.getElementById('gudang-pagination');
  if (!wrap) return;
  wrap.innerHTML = '<div class="flex items-center justify-center py-16"><svg class="animate-spin h-8 w-8 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';

  try {
    const params = new URLSearchParams({ page: gudangState.page, limit: gudangState.limit, search: gudangState.search });

    if (gudangState.tab === 'stok') {
      const res = await api.get('/bahan_baku?' + params);
      const data = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
      const pagination = res.pagination || { total: data.length, totalPages: 1, page: 1 };
      gudangState = { ...gudangState, total: pagination.total, totalPages: pagination.totalPages, page: pagination.page };

      wrap.innerHTML = `<div class="bg-white border border-stone-200 rounded-lg overflow-hidden"><div class="overflow-x-auto"><table class="w-full">
        <thead class="bg-stone-50"><tr>
          <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Nama</th>
          <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Kategori</th>
          <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Stok</th>
          <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Satuan</th>
          <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Min</th>
          <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Status</th>
        </tr></thead><tbody>
        ${data.map(b => {
          const low = Number(b.stok_saat_ini) < Number(b.stok_minimum);
          return `<tr class="border-t border-stone-100">
            <td class="px-4 py-3 text-sm font-medium whitespace-nowrap">${b.nama}</td>
            <td class="px-4 py-3 text-sm whitespace-nowrap">${b.kategori || '-'}</td>
            <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap ${low ? 'text-red-700' : ''}">${b.stok_saat_ini}</td>
            <td class="px-4 py-3 text-sm whitespace-nowrap">${b.satuan}</td>
            <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${b.stok_minimum}</td>
            <td class="px-4 py-3 text-sm whitespace-nowrap">${low ? '<span class="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">Menipis</span>' : '<span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">Aman</span>'}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="6" class="text-center py-12 text-stone-400"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg><div>Belum ada bahan</div></td></tr>'}
        </tbody></table></div></div>`;
    } else {
      const endpoint = gudangState.tab === 'masuk' ? 'stok_masuk' : 'stok_keluar';
      const res = await api.get('/' + endpoint + '?' + params);
      const data = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
      const pagination = res.pagination || { total: data.length, totalPages: 1, page: 1 };
      gudangState = { ...gudangState, total: pagination.total, totalPages: pagination.totalPages, page: pagination.page };

      const labelKey = gudangState.tab === 'masuk' ? 'sumber' : 'tujuan';
      wrap.innerHTML = `<div class="bg-white border border-stone-200 rounded-lg overflow-hidden"><div class="overflow-x-auto"><table class="w-full">
        <thead class="bg-stone-50"><tr>
          <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Tanggal</th>
          <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Bahan</th>
          <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Jumlah</th>
          <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">${gudangState.tab === 'masuk' ? 'Sumber' : 'Tujuan'}</th>
          <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Catatan</th>
        </tr></thead><tbody>${data.map(r => `<tr class="border-t border-stone-100">
          <td class="px-4 py-3 text-sm whitespace-nowrap">${fmtDate(r.tanggal)}</td>
          <td class="px-4 py-3 text-sm whitespace-nowrap">${r.nama_bahan}</td>
          <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${r.jumlah} ${r.satuan}</td>
          <td class="px-4 py-3 text-sm whitespace-nowrap">${r[labelKey] || '-'}</td>
          <td class="px-4 py-3 text-sm whitespace-nowrap">${r.catatan || '-'}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="text-center py-12 text-stone-400"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><div>Belum ada riwayat</div></td></tr>'}
        </tbody></table></div></div>`;
    }

    renderGudangPagination();
  } catch (e) {
    wrap.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal: ${e.message}</div>`;
  }
}

function renderGudangPagination() {
  const wrap = document.getElementById('gudang-pagination');
  if (!wrap) return;
  if (gudangState.totalPages <= 1) { wrap.innerHTML = ''; return; }
  const prevBtn = gudangState.page > 1 ? `<button onclick="gudangGoToPage(${gudangState.page - 1})" class="px-2 py-1 text-sm rounded border border-stone-200 hover:bg-stone-50">Prev</button>` : '';
  const nextBtn = gudangState.page < gudangState.totalPages ? `<button onclick="gudangGoToPage(${gudangState.page + 1})" class="px-2 py-1 text-sm rounded border border-stone-200 hover:bg-stone-50">Next</button>` : '';
  wrap.innerHTML = `<span class="text-sm text-stone-500">Hal ${gudangState.page} dari ${gudangState.totalPages}</span>
    <div class="flex gap-2">${prevBtn}${nextBtn}</div>`;
}

function gudangGoToPage(page) {
  gudangState.page = page;
  loadGudang();
}
let _bahanListCache = null;
function openStokForm(tipe) {
  document.getElementById('modal-title').textContent = tipe === 'masuk' ? 'Barang Masuk' : 'Barang Keluar (Produksi)';
  document.getElementById('modal-save').style.display = '';
  if (!_bahanListCache) {
    api.get('/bahan_baku').then(list => { _bahanListCache = Array.isArray(list) ? list : []; });
  }
  const bahanList = _bahanListCache || [];
  document.getElementById('modal-body').innerHTML = `
    <div class="mb-3"><label class="text-sm">Tanggal</label>
      <input id="s-tanggal" type="date" value="${new Date().toISOString().slice(0,10)}" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md" /></div>
    <div class="mb-3"><label class="text-sm">Bahan Baku</label>
      <select id="s-bahan" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md">
        <option value="">— Pilih —</option>
        ${bahanList.map(b => `<option value="${b.id}">${b.nama} (stok: ${b.stok_saat_ini} ${b.satuan})</option>`).join('')}
      </select></div>
    <div class="mb-3"><label class="text-sm">Jumlah</label>
      <input id="s-jumlah" type="number" step="0.001" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md mono" /></div>
    <div class="mb-3"><label class="text-sm">${tipe === 'masuk' ? 'Sumber / Supplier' : 'Tujuan (Produksi)'}</label>
      <input id="s-sumber" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md" /></div>
    <div class="mb-3"><label class="text-sm">Catatan</label>
      <input id="s-catatan" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md" /></div>`;
  document.getElementById('modal-save').onclick = async () => {
    try {
      if (!validateForm([
        { id: 's-tanggal', label: 'Tanggal' },
        { id: 's-bahan', label: 'Bahan Baku', type: 'select' },
        { id: 's-jumlah', label: 'Jumlah', type: 'number' }
      ])) return;
      const payload = {
        tanggal: document.getElementById('s-tanggal').value,
        bahan_baku_id: +document.getElementById('s-bahan').value,
        jumlah: +document.getElementById('s-jumlah').value,
        catatan: document.getElementById('s-catatan').value,
      };
      payload[tipe === 'masuk' ? 'sumber' : 'tujuan'] = document.getElementById('s-sumber').value;
      await api.post('/stok_' + tipe, payload);
      closeModal(); renderGudang();
    } catch (e) {
      console.error('Gudang submit error:', e);
      showAlert('Gagal: ' + (e.message || 'Unknown error'), 'error');
    }
  };
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}

