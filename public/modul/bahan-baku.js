// ===== Bahan Baku (custom with sync, search, pagination & nutrisi) =====
const BAHAN_BAKU_CRUD_BASE = {
  endpoint: '/bahan_baku',
  groups: [
    { key: 'info', label: 'Informasi Dasar', cols: 2 },
    { key: 'harga_stok', label: 'Harga & Stok', cols: 2 },
    { key: 'nutrisi', label: 'Informasi Nutrisi', cols: 2 },
  ],
  fields: [
    { k: 'kode', l: 'Kode SKU', group: 'info' },
    { k: 'nama', l: 'Nama Bahan', req: true, group: 'info' },
    { k: 'kategori', l: 'Kategori', type: 'select', opts: ['Karbohidrat','Protein Hewani','Protein Nabati','Sayur','Buah','Bumbu','Lainnya'], group: 'info' },
    { k: 'satuan', l: 'Satuan (kg/gr/liter)', req: true, group: 'info' },
    { k: 'harga_satuan', l: 'Harga Satuan (IDR)', type: 'number', fmt: 'idr', group: 'harga_stok' },
    { k: 'stok_saat_ini', l: 'Stok Saat Ini', type: 'number', fmt: 'num', group: 'harga_stok' },
    { k: 'stok_minimum', l: 'Stok Minimum', type: 'number', fmt: 'num', group: 'harga_stok' },
    { k: 'kalori', l: 'Kalori (kkal)', type: 'number', fmt: 'num', group: 'nutrisi' },
    { k: 'protein', l: 'Protein (g)', type: 'number', fmt: 'num', group: 'nutrisi' },
    { k: 'karbohidrat', l: 'Karbohidrat (g)', type: 'number', fmt: 'num', group: 'nutrisi' },
    { k: 'lemak', l: 'Lemak (g)', type: 'number', fmt: 'num', group: 'nutrisi' },
    { k: 'serat', l: 'Serat (g)', type: 'number', fmt: 'num', group: 'nutrisi' },
    { k: 'kategori_sp', l: 'Kategori SP', type: 'select', opts: ['','Karbohidrat','Protein Hewani','Protein Nabati','Sayur','Buah','Susu','Minyak'], group: 'info' },
    { k: 'berat_1_sp', l: 'Berat 1 SP (gram)', type: 'number', fmt: 'num', group: 'info' },
    { k: 'persen_bdd', l: 'BDD (%)', type: 'number', fmt: 'num', group: 'info' },
  ],
  cols: ['nama','kategori','kategori_sp','berat_1_sp','persen_bdd','satuan','harga_satuan','stok_saat_ini']
};

const NUTRISI_FIELDS = ['kalori','protein','karbohidrat','lemak','serat'];

function getBahanCrud() {
  if (currentUser?.role === 'ahli_gizi') {
    return {
      ...BAHAN_BAKU_CRUD_BASE,
      fields: BAHAN_BAKU_CRUD_BASE.fields.map(f => ({
        ...f,
        readOnly: !NUTRISI_FIELDS.includes(f.k),
      })),
      cols: BAHAN_BAKU_CRUD_BASE.cols,
    };
  }
  return BAHAN_BAKU_CRUD_BASE;
}

let bahanBakuState = { page: 1, limit: 10, search: '', total: 0, totalPages: 1 };
let bahanSyncInterval = null;
const BAHAN_SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 jam

async function renderBahanBaku() {
  if (bahanSyncInterval) { clearInterval(bahanSyncInterval); bahanSyncInterval = null; }

  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/bahan-baku', { credentials: 'include' });
    c.innerHTML = await r.text();
  } catch (e) {
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat halaman: ${e.message}</div>`;
    return;
  }

  const isAhliGizi = currentUser?.role === 'ahli_gizi';

  document.getElementById('add-btn').style.display = isAhliGizi ? 'none' : '';
  document.getElementById('add-btn').onclick = () => openForm(getBahanCrud(), null);

  const searchInput = document.getElementById('bahan-search');
  let debounceTimer;
  searchInput.oninput = function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      bahanBakuState.search = this.value;
      bahanBakuState.page = 1;
      loadBahanBaku();
    }, 300);
  };

  await loadBahanBaku();

  showToast('Daftar bahan baku sedang diperbarui...', 'success');
  syncBahanBaku();
  bahanSyncInterval = setInterval(syncBahanBaku, BAHAN_SYNC_INTERVAL_MS);
}

async function loadBahanBaku() {
  const params = new URLSearchParams({ page: bahanBakuState.page, limit: bahanBakuState.limit, search: bahanBakuState.search });
  const res = await api.get('/bahan_baku?' + params);
  const data = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
  const pagination = res.pagination || { total: data.length, totalPages: 1, page: 1 };
  bahanBakuState = { ...bahanBakuState, total: pagination.total, totalPages: pagination.totalPages, page: pagination.page };

  renderBahanBakuTable(data);
  renderBahanPagination();
}

function renderBahanBakuTable(rows) {
  const w = document.getElementById('table-wrap');
  if (!rows.length) {
    w.innerHTML = '<div class="p-12 text-center text-stone-400"><svg class="w-16 h-16 mx-auto mb-4 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg><div>Belum ada data</div><div class="text-sm mt-1 text-stone-400">Klik "Tambah" untuk mulai.</div></div>';
    return;
  }
  const fields = getBahanCrud();
  const headers = fields.cols.map(k => `<th class="text-left px-4 py-3 text-xs font-semibold text-stone-600 uppercase">${fields.fields.find(f => f.k === k)?.l || k}</th>`).join('');
  const body = rows.map(r => `<tr class="border-t border-stone-100">
    ${fields.cols.map(k => {
      const f = fields.fields.find(x => x.k === k);
      const v = r[k];
      let cell = v == null || v === '' ? '-' : v;
      if (f?.fmt === 'idr') {
        cell = `<span class="mono">${fmtIDR(v)}</span>`;
        if (k === 'harga_satuan' && r.harga_sebelumnya > 0) {
          const prev = Number(r.harga_sebelumnya);
          const curr = Number(v);
          if (curr > prev) cell += ` <span class="text-green-600 text-xs">▲</span>`;
          else if (curr < prev) cell += ` <span class="text-red-600 text-xs">▼</span>`;
          else cell += ` <span class="text-stone-400 text-xs">—</span>`;
        }
      }
      else if (f?.fmt === 'num') cell = `<span class="mono">${fmtNum(v)}</span>`;
      else if (f?.type === 'date') cell = fmtDate(v);
      return `<td class="px-4 py-3 text-sm">${cell}</td>`;
    }).join('')}
    <td class="px-4 py-3 text-right">
      <button onclick='editBahanBaku(${JSON.stringify(r).replace(/'/g, "\\'")})' class="text-stone-500 hover:text-stone-900 mr-2" title="Edit"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      ${currentUser?.role !== 'ahli_gizi' ? `<button onclick='deleteBahanBaku(${r.id})' class="text-red-600 hover:text-red-800" title="Hapus"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : ''}
    </td></tr>`).join('');
  w.innerHTML = `<div class="overflow-x-auto"><table class="w-full"><thead class="bg-stone-50"><tr>${headers}<th class="px-4 py-3 text-right text-xs font-semibold text-stone-600 uppercase">Aksi</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function editBahanBaku(row) { openForm(getBahanCrud(), row); }
async function deleteBahanBaku(id) {
  const ok = await showConfirm('Hapus data ini?');
  if (!ok) return;
  await api.del('/bahan_baku/' + id);
  loadBahanBaku();
}

function renderBahanPagination() {
  const wrap = document.getElementById('bahan-pagination');
  if (!wrap) return;
  if (bahanBakuState.totalPages <= 1) { wrap.innerHTML = ''; return; }

  const prevBtn = bahanBakuState.page > 1 ? `<button onclick="bahanGoToPage(${bahanBakuState.page - 1})" class="px-2 py-1 text-sm rounded border border-stone-200 hover:bg-stone-50">Prev</button>` : '';
  const nextBtn = bahanBakuState.page < bahanBakuState.totalPages ? `<button onclick="bahanGoToPage(${bahanBakuState.page + 1})" class="px-2 py-1 text-sm rounded border border-stone-200 hover:bg-stone-50">Next</button>` : '';
  wrap.innerHTML = `<span class="text-sm text-stone-500">Hal ${bahanBakuState.page} dari ${bahanBakuState.totalPages}</span>
    <div class="flex gap-2">${prevBtn}${nextBtn}</div>`;
}

function bahanGoToPage(page) {
  bahanBakuState.page = page;
  loadBahanBaku();
}

async function syncBahanBaku() {
  try {
    const result = await api.post('/bahan-baku/sync', {});
    showToast(`Bahan baku diperbarui: ${result.imported} baru, ${result.updated} berubah dari ${result.total} data`, 'success');
    bahanBakuState.page = 1;
    await loadBahanBaku();
  } catch (e) {
    console.log('Auto-sync bahan baku:', e.message);
  }
}

