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
const NUT_MAP = { kalori: 'energi', protein: 'protein', karbohidrat: 'karbohidrat', lemak: 'lemak', serat: 'serat' };

let spRefLookup = {};

async function loadSpRefMap() {
  try {
    const res = await api.get('/sp_referensi_bahan?limit=9999');
    const list = Array.isArray(res) ? res : (res.data || []);
    spRefLookup = {};
    list.forEach(i => { spRefLookup[i.nama.toLowerCase()] = i; });
  } catch (e) {
    spRefLookup = {};
  }
}

function fillSpRefToForm(row) {
  const ref = spRefLookup[(row.nama||'').toLowerCase()];
  if (!ref) return;
  const elKat = document.getElementById('f-kategori_sp');
  const elBerat = document.getElementById('f-berat_1_sp');
  const elBdd = document.getElementById('f-persen_bdd');
  if (elKat && ref.kategori && !row.kategori_sp) elKat.value = ref.kategori;
  if (elBerat && ref.berat_bersih && !row.berat_1_sp) elBerat.value = ref.berat_bersih;
  if (elBdd && ref.bdd_persen && !row.persen_bdd) elBdd.value = Math.round(ref.bdd_persen * 100);
  NUTRISI_FIELDS.forEach(bk => {
    const el = document.getElementById('f-' + bk);
    const sk = NUT_MAP[bk];
    if (el && ref[sk] && !row[bk]) el.value = ref[sk];
  });
}

function getBahanCrud() {
  if (currentUser?.role === 'ahli_gizi') {
    return {
      ...BAHAN_BAKU_CRUD_BASE,
      fields: BAHAN_BAKU_CRUD_BASE.fields.map(f => ({
        ...f,
        readOnly: f.k === 'harga_satuan',
      })),
      cols: BAHAN_BAKU_CRUD_BASE.cols.filter(k => k !== 'harga_satuan'),
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

  document.getElementById('add-btn').onclick = () => {
    openForm(getBahanCrud(), null);
    setTimeout(() => {
      const elNama = document.getElementById('f-nama');
      if (!elNama) return;
      elNama.oninput = function() {
        const ref = spRefLookup[(this.value||'').toLowerCase()];
        if (!ref) return;
        NUTRISI_FIELDS.forEach(bk => {
          const el = document.getElementById('f-' + bk);
          const sk = NUT_MAP[bk];
          if (el && ref[sk] && !el.value) el.value = ref[sk];
        });
      };
    }, 50);
  };

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

  await loadSpRefMap();
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
    <td class="px-4 py-3 text-right whitespace-nowrap">
      ${spRefLookup[(r.nama||'').toLowerCase()] ? `<button onclick='showSpRefNutrisi(${JSON.stringify(r.nama||'').replace(/'/g, "\\'")})' class="text-emerald-600 hover:text-emerald-800 p-1.5 inline-flex items-center" title="Nutrisi"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg></button>` : ''}
      <button onclick='editBahanBaku(${JSON.stringify(r).replace(/'/g, "\\'")})' class="text-stone-500 hover:text-stone-900 p-1.5 inline-flex items-center" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      ${currentUser?.role !== 'ahli_gizi' ? `<button onclick='deleteBahanBaku(${r.id})' class="text-red-600 hover:text-red-800 p-1.5 inline-flex items-center" title="Hapus"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : ''}
    </td></tr>`).join('');
  w.innerHTML = `<div class="overflow-x-auto"><table class="w-full"><thead class="bg-stone-50"><tr>${headers}<th class="px-4 py-3 text-right text-xs font-semibold text-stone-600 uppercase">Aksi</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function editBahanBaku(row) {
  openForm(getBahanCrud(), row);
  setTimeout(() => fillSpRefToForm(row), 50);
}
async function deleteBahanBaku(id) {
  const ok = await showConfirm('Hapus data ini?');
  if (!ok) return;
  await api.del('/bahan_baku/' + id);
  loadBahanBaku();
}

function showSpRefNutrisi(nama) {
  const ref = spRefLookup[nama.toLowerCase()];
  if (!ref) return;
  const bddPct = Math.round((ref.bdd_persen || 0) * 100);
  const o = document.createElement('div');
  o.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40';
  o.onclick = () => o.remove();
  o.innerHTML = '<div class="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6" onclick="event.stopPropagation()">'
    + '<div class="flex items-center justify-between mb-4">'
    + '<h3 class="text-base font-semibold text-stone-800">Referensi SP</h3>'
    + '<button onclick="this.closest(\'.fixed\').remove()" class="text-stone-400 hover:text-stone-600 p-1"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg></button>'
    + '</div>'
    + '<div class="space-y-2">'
    + '<div class="flex justify-between py-2 border-b border-stone-100"><span class="text-stone-500 text-sm">Nama Bahan</span><span class="text-sm font-medium" id="spref-nama"></span></div>'
    + '<div class="flex justify-between py-2 border-b border-stone-100"><span class="text-stone-500 text-sm">Kategori SP</span><span class="text-sm font-medium">' + (ref.kategori || '-') + '</span></div>'
    + '<div class="flex justify-between py-2 border-b border-stone-100"><span class="text-stone-500 text-sm">Berat Bersih</span><span class="text-sm font-medium mono">' + fmtNum(ref.berat_bersih) + ' g</span></div>'
    + '<div class="flex justify-between py-2 border-b border-stone-100"><span class="text-stone-500 text-sm">BDD</span><span class="text-sm font-medium">' + bddPct + '%</span></div>'
    + '<div class="flex justify-between py-2 border-b border-stone-100"><span class="text-stone-500 text-sm">Berat Kotor</span><span class="text-sm font-medium mono">' + fmtNum(ref.berat_kotor) + ' g</span></div>'
    + '<div class="border-t border-stone-200 my-1"></div>'
    + '<div class="flex justify-between py-2"><span class="text-stone-500 text-sm font-medium">Informasi Nutrisi</span><span></span></div>'
    + '<div class="flex justify-between py-2 border-b border-stone-100"><span class="text-stone-500 text-sm">Energi</span><span class="text-sm font-medium mono">' + (ref.energi ? fmtNum(ref.energi) + ' kkal' : '-') + '</span></div>'
    + '<div class="flex justify-between py-2 border-b border-stone-100"><span class="text-stone-500 text-sm">Protein</span><span class="text-sm font-medium mono">' + (ref.protein ? fmtNum(ref.protein) + ' g' : '-') + '</span></div>'
    + '<div class="flex justify-between py-2 border-b border-stone-100"><span class="text-stone-500 text-sm">Lemak</span><span class="text-sm font-medium mono">' + (ref.lemak ? fmtNum(ref.lemak) + ' g' : '-') + '</span></div>'
    + '<div class="flex justify-between py-2 border-b border-stone-100"><span class="text-stone-500 text-sm">Karbohidrat</span><span class="text-sm font-medium mono">' + (ref.karbohidrat ? fmtNum(ref.karbohidrat) + ' g' : '-') + '</span></div>'
    + '<div class="flex justify-between py-2"><span class="text-stone-500 text-sm">Serat</span><span class="text-sm font-medium mono">' + (ref.serat ? fmtNum(ref.serat) + ' g' : '-') + '</span></div>'
    + '</div>'
    + '<button onclick="this.closest(\'.fixed\').remove()" class="mt-5 w-full py-2.5 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-medium text-stone-700 transition-colors">Tutup</button>'
    + '</div>';
  document.body.appendChild(o);
  document.getElementById('spref-nama').textContent = ref.nama;
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

