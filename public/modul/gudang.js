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
    // Pre-fetch untuk dropdown modal
    if (!_bahanListCache) {
      api.get('/bahan_baku').then(function(list) { _bahanListCache = Array.isArray(list) ? list : []; }).catch(function(){});
    }
    if (!_supplierListCache) {
      api.get('/supplier').then(function(list) { _supplierListCache = Array.isArray(list) ? list : (list.data || []); }).catch(function(){});
    }
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
  ['stok','masuk','keluar'].forEach(t => {
    const el = document.getElementById('tab-'+t);
    if (!el) return;
    if (t === tab) {
      el.className = 'px-4 py-2 rounded-lg text-sm font-medium transition-all bg-white text-blue-600 shadow-sm';
    } else {
      el.className = 'px-4 py-2 rounded-lg text-sm font-medium transition-all text-stone-600 hover:text-stone-800';
    }
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

      wrap.innerHTML = `<div class="overflow-x-auto"><table class="w-full">
        <thead><tr class="border-b border-stone-100">
          <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Nama</th>
          <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Kategori</th>
          <th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Stok</th>
          <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Satuan</th>
          <th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Min</th>
          <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Status</th>
        </tr></thead><tbody>
        ${data.map(b => {
          const low = Number(b.stok_saat_ini) < Number(b.stok_minimum);
          return `<tr class="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
            <td class="px-4 py-3 text-xs font-medium text-stone-700">${b.nama}</td>
            <td class="px-4 py-3 text-xs text-stone-600">${b.kategori || '-'}</td>
            <td class="px-4 py-3 text-xs text-right mono ${low ? 'text-red-700 font-semibold' : 'text-stone-700'}">${b.stok_saat_ini}</td>
            <td class="px-4 py-3 text-xs text-stone-600">${b.satuan}</td>
            <td class="px-4 py-3 text-xs text-right mono text-stone-600">${b.stok_minimum}</td>
            <td class="px-4 py-3 text-xs">${low ? '<span class="inline-block px-2.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-semibold rounded-lg">Menipis</span>' : '<span class="inline-block px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-semibold rounded-lg">Aman</span>'}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="6" class="text-center py-16 text-stone-400"><svg class="w-12 h-12 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg><div class="text-sm">Belum ada bahan</div></td></tr>'}
        </tbody></table></div>`;
    } else {
      const endpoint = gudangState.tab === 'masuk' ? 'stok_masuk' : 'stok_keluar';
      const res = await api.get('/' + endpoint + '?' + params);
      const data = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
      const pagination = res.pagination || { total: data.length, totalPages: 1, page: 1 };
      gudangState = { ...gudangState, total: pagination.total, totalPages: pagination.totalPages, page: pagination.page };

      const labelKey = gudangState.tab === 'masuk' ? 'sumber' : 'tujuan';
      wrap.innerHTML = `<div class="overflow-x-auto"><table class="w-full">
        <thead><tr class="border-b border-stone-100">
          <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Tanggal</th>
          <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Bahan</th>
          <th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Jumlah</th>
          <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">${gudangState.tab === 'masuk' ? 'Sumber' : 'Tujuan'}</th>
          <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Catatan</th>
        </tr></thead><tbody>${data.map(r => `<tr class="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
          <td class="px-4 py-3 text-xs mono text-stone-600">${fmtDate(r.tanggal)}</td>
          <td class="px-4 py-3 text-xs font-medium text-stone-700">${r.nama_bahan}</td>
          <td class="px-4 py-3 text-xs text-right mono text-stone-700">${r.jumlah} ${r.satuan}</td>
          <td class="px-4 py-3 text-xs text-stone-600">${r[labelKey] || '-'}</td>
          <td class="px-4 py-3 text-xs text-stone-500">${r.catatan || '-'}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="text-center py-16 text-stone-400"><svg class="w-12 h-12 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><div class="text-sm">Belum ada riwayat</div></td></tr>'}
        </tbody></table></div>`;
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
  const prevBtn = gudangState.page > 1 ? `<button onclick="gudangGoToPage(${gudangState.page - 1})" class="px-3 py-1.5 text-sm font-medium rounded-lg border border-stone-200 hover:bg-stone-50 hover:border-stone-300 transition-all">Prev</button>` : '';
  const nextBtn = gudangState.page < gudangState.totalPages ? `<button onclick="gudangGoToPage(${gudangState.page + 1})" class="px-3 py-1.5 text-sm font-medium rounded-lg border border-stone-200 hover:bg-stone-50 hover:border-stone-300 transition-all">Next</button>` : '';
  wrap.innerHTML = `<span class="text-sm text-stone-500">Hal ${gudangState.page} dari ${gudangState.totalPages}</span>
    <div class="flex gap-2">${prevBtn}${nextBtn}</div>`;
}

function gudangGoToPage(page) {
  gudangState.page = page;
  loadGudang();
}
let _bahanListCache = null;
let _supplierListCache = null;
async function openStokForm(tipe) {
  document.getElementById('modal-title').textContent = tipe === 'masuk' ? 'Barang Masuk' : 'Barang Keluar (Produksi)';
  document.getElementById('modal-save').style.display = '';
  if (!_bahanListCache) {
    try {
      var list = await api.get('/bahan_baku');
      _bahanListCache = Array.isArray(list) ? list : [];
    } catch { _bahanListCache = []; }
  }
  if (!_supplierListCache) {
    try {
      var list = await api.get('/supplier');
      _supplierListCache = Array.isArray(list) ? list : (list.data || []);
    } catch { _supplierListCache = []; }
  }
  const bahanList = _bahanListCache;
  const supplierList = _supplierListCache;
  const sumberHtml = tipe === 'masuk'
    ? `<input id="s-sumber" list="s-supplier-list" class="mt-1.5 w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" placeholder="Ketik atau pilih supplier" autocomplete="off" />
        <datalist id="s-supplier-list">
          ${supplierList.map(s => `<option value="${s.nama}">`).join('')}
        </datalist>`
    : `<input id="s-sumber" class="mt-1.5 w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" placeholder="cth: Produksi Menu A" />`;
  document.getElementById('modal-body').innerHTML = `
    <div class="mb-4"><label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Tanggal</label>
      <input id="s-tanggal" type="date" value="${new Date().toISOString().slice(0,10)}" class="mt-1.5 w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" /></div>
    <div class="mb-4"><label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Bahan Baku</label>
      <select id="s-bahan" class="mt-1.5 w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
        <option value="">— Pilih —</option>
        ${bahanList.map(b => `<option value="${b.id}">${b.nama} (stok: ${b.stok_saat_ini} ${b.satuan})</option>`).join('')}
      </select></div>
    <div class="mb-4"><label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Jumlah</label>
      <input id="s-jumlah" type="number" step="0.001" class="mt-1.5 w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all mono" /></div>
    <div class="mb-4"><label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">${tipe === 'masuk' ? 'Supplier' : 'Tujuan (Produksi)'}</label>
      ${sumberHtml}</div>
    <div class="mb-4"><label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Catatan</label>
      <input id="s-catatan" class="mt-1.5 w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" /></div>`;
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
      var sumberVal = document.getElementById('s-sumber').value.trim();
      payload[tipe === 'masuk' ? 'sumber' : 'tujuan'] = sumberVal;
      // Auto-create supplier jika nama baru (stok masuk)
      if (tipe === 'masuk' && sumberVal && !_supplierListCache.some(function(s) { return s.nama.toLowerCase() === sumberVal.toLowerCase(); })) {
        try {
          await api.post('/supplier', { nama: sumberVal });
          _supplierListCache = null; // refresh cache
        } catch {}
      }
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

