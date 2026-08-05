let _poEditing = null;
let _poItems = [];
let _bahanBakuList = [];
let _prList = [];
let _poList = [];

async function renderPembelian() {
  await renderPembelianPage('pr');
}

function switchPrPoTab(tab) {
  ['pr','po'].forEach(t => {
    const el = document.getElementById('tab-'+t);
    if (!el) return;
    if (t === tab) {
      el.className = 'px-4 py-2 rounded-lg text-sm font-medium transition-all bg-white text-blue-600 shadow-sm';
    } else {
      el.className = 'px-4 py-2 rounded-lg text-sm font-medium transition-all text-stone-600 hover:text-stone-800';
    }
  });
  refreshPoList();
  if (tab === 'pr') renderPrView();
  else renderPoView();
}

async function refreshPoList() {
  try {
    const data = await api.get('/purchase_order');
    const all = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
    _prList = all.filter(r => (r.no_po || '').startsWith('PR-'));
    _poList = all.filter(r => !(r.no_po || '').startsWith('PR-'));
  } catch (e) {
    // keep existing lists
  }
}

async function renderPembelianPage(tab) {
  const activeTab = tab || 'pr';
  const content = document.getElementById('content');
  content.innerHTML = `<div class="flex gap-1 bg-stone-100 rounded-xl p-1 w-fit mb-5">
      <button onclick="switchPrPoTab('pr')" id="tab-pr" class="px-4 py-2 rounded-lg text-sm font-medium transition-all${activeTab === 'pr' ? ' bg-white text-blue-600 shadow-sm' : ' text-stone-600 hover:text-stone-800'}">PR — Purchase Request</button>
      <button onclick="switchPrPoTab('po')" id="tab-po" class="px-4 py-2 rounded-lg text-sm font-medium transition-all${activeTab === 'po' ? ' bg-white text-blue-600 shadow-sm' : ' text-stone-600 hover:text-stone-800'}">PO — Purchase Order</button>
    </div>
    <div id="pr-po-content"></div>`;

  // Fetch all purchase_order records
  let allRows = [];
  try {
    const data = await api.get('/purchase_order');
    allRows = Array.isArray(data) ? data : (data.data || []);
  } catch (e) {
    allRows = [];
  }

  _prList = allRows.filter(r => (r.no_po || '').startsWith('PR-'));
  _poList = allRows.filter(r => !(r.no_po || '').startsWith('PR-'));

  if (tab === 'pr') {
    renderPrView();
  } else {
    renderPoView();
  }
}

// ==================== PR VIEW ====================

function renderPrView() {
  const wrap = document.getElementById('pr-po-content');
  wrap.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-base font-bold text-stone-800">Daftar Purchase Request</h2>
      <button onclick="openBuatPrForm()" class="h-10 px-5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Buat PR
      </button>
    </div>
    <div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden" id="pr-table-wrap">
      ${_prList.length === 0 ? '<div class="py-16 text-center text-stone-400"><svg class="w-12 h-12 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><div class="text-sm">Belum ada PR</div><div class="text-xs text-stone-400 mt-1">Klik "+ Buat PR" untuk membuat Purchase Request baru.</div></div>' : `
      <div class="overflow-x-auto"><table class="w-full">
        <thead><tr class="border-b border-stone-100">
          <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">No PR</th>
          <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Periode</th>
          <th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Item</th>
          <th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Total Estimasi</th>
          <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Status</th>
          <th class="text-center px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Aksi</th>
        </tr></thead>
        <tbody>
          ${_prList.map(pr => {
            let items = [];
            try { items = JSON.parse(pr.item); } catch {}
            const itemCount = items.length;
            const periode = (pr.tanggal || '').slice(0, 7);
            const statusText = (pr.catatan || '').includes('[DITOLAK]') ? 'Ditolak' : pr.status === 'Disetujui' ? 'Disetujui' : 'Menunggu';
            const statusColors = { 'Ditolak': 'bg-red-100 text-red-700', 'Disetujui': 'bg-emerald-100 text-emerald-700', 'Menunggu': 'bg-amber-100 text-amber-700' };
            return `<tr class="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
              <td class="px-4 py-3 text-xs font-semibold text-stone-700">${pr.no_po}</td>
              <td class="px-4 py-3 text-xs text-stone-600">${periode}</td>
              <td class="px-4 py-3 text-xs text-right text-stone-600">${itemCount} bahan</td>
              <td class="px-4 py-3 text-xs text-right mono font-medium text-stone-700">${fmtIDR(pr.total_nilai || 0)}</td>
              <td class="px-4 py-3 text-xs"><span class="inline-block px-2.5 py-0.5 text-[10px] font-semibold rounded-lg ${statusColors[statusText]}">${statusText}</span></td>
              <td class="px-4 py-3 text-center whitespace-nowrap text-xs">
                <button onclick="viewPrItems(${pr.id})" class="text-blue-600 hover:text-blue-800 font-medium mr-2">Detail</button>
                ${pr.status === 'Disetujui' ? `<button onclick="buatPoDariPr(${pr.id})" class="text-emerald-600 hover:text-emerald-800 font-medium">Buat PO</button>` : ''}
                ${(currentUser?.role === 'admin' || currentUser?.role === 'keuangan') && pr.status === 'Draft' ? `
                  <button onclick="approvePr(${pr.id})" class="text-green-600 hover:text-green-800 font-medium mr-1">Setujui</button>
                  <button onclick="rejectPr(${pr.id})" class="text-red-600 hover:text-red-800 font-medium">Tolak</button>
                ` : ''}
                ${pr.status !== 'Disetujui' ? `<button onclick="deletePr(${pr.id})" class="w-7 h-7 inline-flex items-center justify-center rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-all ml-1" title="Hapus">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>`}
    </div>`;
}

async function openBuatPrForm() {
  let siklusList;
  try {
    siklusList = await api.get('/siklus');
  } catch (e) {
    showAlert('Gagal memuat siklus');
    return;
  }
  const now = new Date();
  const defaultPeriode = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  var activeSiklus = (siklusList || []).filter(s => s.status === 'Aktif');
  var maxHari = Math.max(...activeSiklus.map(s => Number(s.total_hari) || 7), 7);

  document.getElementById('modal-title').textContent = 'Buat Purchase Request';
  document.getElementById('modal-body').innerHTML = `
    <div class="space-y-4">
      <div>
        <label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Periode <span class="text-red-500">*</span></label>
        <input id="pr-periode" type="month" value="${defaultPeriode}" class="mt-1.5 w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
      </div>
      <div>
        <label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Pilih Siklus</label>
        <div class="mt-1.5 max-h-48 overflow-y-auto rounded-xl border border-stone-200 p-2">
          ${activeSiklus.length ? '<div class="space-y-1">' + activeSiklus.map((s, i) => `
            <label class="flex items-center gap-2 cursor-pointer hover:bg-stone-50 p-2 rounded-lg">
              <input type="checkbox" class="pr-siklus-check cb-modern" value="${s.id}" data-hari="${Number(s.total_hari) || 7}" checked>
              <span class="text-sm text-stone-700">${s.nama} — ${s.kategori_penerima || '-'} (${s.jumlah_porsi || 0} porsi, ${Number(s.total_hari) || 7} hari)</span>
            </label>
          `).join('') + '</div>' : '<div class="flex items-center gap-2 p-4 text-amber-700 bg-amber-50 rounded-lg"><svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><div><div class="text-sm font-medium">Belum ada siklus Aktif</div><div class="text-[10px] mt-0.5">Buat siklus menu terlebih dahulu di menu Ahli Gizi &gt; Siklus Menu, lalu aktifkan.</div></div></div>'}
        </div>
        <p class="text-[10px] text-stone-400 mt-1">${activeSiklus.length ? 'Kosongkan pilihan untuk menggunakan semua siklus Aktif' : ''}</p>
      </div>
      <div class="flex gap-3">
        <div class="flex-1">
          <label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Hari Mulai</label>
          <input id="pr-hari-mulai" type="number" min="1" value="1" class="mt-1.5 w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
        </div>
        <div class="flex-1">
          <label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Hari Selesai</label>
          <input id="pr-hari-selesai" type="number" min="1" value="${maxHari}" class="mt-1.5 w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
        </div>
      </div>
      <p class="text-xs text-stone-400" id="pr-hari-info">Rentang hari 1 — ${maxHari}</p>
      <div id="pr-preview" class="text-sm text-stone-500">Klik "Generate PR" untuk menghitung kebutuhan bahan...</div>
    </div>`;

  // Update hari selesai saat checkbox siklus berubah
  document.querySelectorAll('.pr-siklus-check').forEach(function(cb) {
    cb.addEventListener('change', function() {
      var checked = document.querySelectorAll('.pr-siklus-check:checked');
      var maxHari = Math.max(1, ...Array.from(checked).map(function(c) { return Number(c.dataset.hari || 7); }));
      var selesaiEl = document.getElementById('pr-hari-selesai');
      if (selesaiEl) selesaiEl.max = maxHari;
      if (Number(selesaiEl.value) > maxHari) selesaiEl.value = maxHari;
      var infoEl = document.getElementById('pr-hari-info');
      if (infoEl) infoEl.textContent = 'Rentang hari 1 — ' + maxHari;
    });
  });

  function updateHariInfo() {
    var mulai = document.getElementById('pr-hari-mulai');
    var selesai = document.getElementById('pr-hari-selesai');
    var info = document.getElementById('pr-hari-info');
    if (info && mulai && selesai) {
      info.textContent = 'Range dipilih: hari ' + mulai.value + ' — ' + selesai.value;
    }
  }
  document.getElementById('pr-hari-mulai').addEventListener('input', function() {
    var selesai = document.getElementById('pr-hari-selesai');
    if (this.value && selesai.value && Number(this.value) > Number(selesai.value)) {
      selesai.value = this.value;
    }
    updateHariInfo();
  });
  document.getElementById('pr-hari-selesai').addEventListener('input', function() {
    var mulai = document.getElementById('pr-hari-mulai');
    if (this.value && mulai.value && Number(this.value) < Number(mulai.value)) {
      mulai.value = this.value;
    }
    updateHariInfo();
  });
  updateHariInfo();

  const saveBtn = document.getElementById('modal-save');
  saveBtn.textContent = 'Generate PR';
  saveBtn.style.display = 'inline-block';
  saveBtn.onclick = generatePr;
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}

async function generatePr() {
  const periode = document.getElementById('pr-periode').value;
  if (!periode) { showAlert('Pilih periode terlebih dahulu'); return; }

  const saveBtn = document.getElementById('modal-save');
  saveBtn.disabled = true;
  saveBtn.textContent = '⏳ Menghitung...';

  const preview = document.getElementById('pr-preview');
  preview.innerHTML = '<div class="text-center py-4 text-stone-500">⏳ Menghitung kebutuhan bahan dengan SP/BDD...</div>';

  try {
    const checked = document.querySelectorAll('.pr-siklus-check:checked');
    const ids = Array.from(checked).map(cb => parseInt(cb.value));
    const body = { periode };
    if (ids.length) body.siklus_ids = ids;
    body.hari_mulai = parseInt(document.getElementById('pr-hari-mulai').value) || 1;
    body.hari_selesai = parseInt(document.getElementById('pr-hari-selesai').value) || 999;

    const result = await api.post('/siklus/buat-pr', body);

    if (!result.items || !result.items.length) {
      preview.innerHTML = '<div class="text-amber-700 bg-amber-50 p-3 rounded text-sm">Tidak ada bahan. Siklus dipilih belum memiliki menu.</div>';
      saveBtn.disabled = false;
      saveBtn.textContent = 'Generate PR';
      return;
    }

    const budgetHtml = result.budget_warning ? `<div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-3">
      <div class="flex items-center gap-2 font-semibold mb-1"><svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>Peringatan Budget</div>
      <div>${result.budget_warning.message}</div>
      <div class="text-[10px] mt-1 text-amber-700">Total Budget: ${fmtIDR(result.budget_warning.total_budget)} | Realisasi: ${fmtIDR(result.budget_warning.total_realisasi)} | Sisa: ${fmtIDR(result.budget_warning.sisa_budget)} | Estimasi PR: ${fmtIDR(result.budget_warning.estimated_total)} | Defisit: ${fmtIDR(result.budget_warning.defisit)}</div>
    </div>` : '';

    preview.innerHTML = `
      <div class="rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <div class="bg-gradient-to-r from-emerald-50 to-emerald-100/60 px-4 py-3 text-sm font-semibold text-emerald-800">${result.message}</div>
        ${result.total_hari ? '<div class="px-4 py-2 text-[10px] text-stone-500 bg-stone-50 border-t border-stone-100">Hari produksi: ' + result.hari_mulai + ' — ' + result.hari_selesai + ' (total ' + result.total_hari + ' hari)</div>' : ''}
        ${budgetHtml}
        <div class="overflow-x-auto"><table class="w-full">
          <thead><tr class="border-b border-stone-100">
            <th class="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-stone-500">Bahan</th>
            <th class="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-stone-500">Kebutuhan</th>
            <th class="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-stone-500">+Buffer 10%</th>
            <th class="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-stone-500">Harga</th>
            <th class="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-stone-500">Subtotal</th>
          </tr></thead>
          <tbody>
            ${result.items.map(i => `<tr class="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
              <td class="px-4 py-3 text-xs text-stone-700">${i.nama}</td>
              <td class="px-4 py-3 text-xs text-right mono text-stone-700">${i.total_qty} ${i.satuan}</td>
              <td class="px-4 py-3 text-xs text-right mono text-stone-700">${i.buffer_10} ${i.satuan}</td>
              <td class="px-4 py-3 text-xs text-right mono text-stone-600">${fmtIDR(i.harga_satuan)}</td>
              <td class="px-4 py-3 text-xs text-right mono font-medium text-stone-700">${fmtIDR(i.subtotal)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr class="bg-gradient-to-r from-stone-50 to-stone-100/60 border-t border-stone-200">
            <td colspan="4" class="px-4 py-3 text-xs text-right font-bold text-stone-700">Total Estimasi</td>
            <td class="px-4 py-3 text-xs text-right font-bold mono text-stone-800">${fmtIDR(result.total_estimated)}</td></tr>
          </tfoot>
        </table></div>
      </div>
      <div class="mt-2 text-xs text-stone-500">PR <strong>${result.no_pr}</strong> telah tersimpan. Gunakan tombol "Buat PO" di daftar PR untuk membuat Purchase Order.</div>`;

    saveBtn.style.display = 'none';
    // Refresh PR list
    const data = await api.get('/purchase_order');
    const allRows = Array.isArray(data) ? data : (data.data || []);
    _prList = allRows.filter(r => (r.no_po || '').startsWith('PR-'));
    _poList = allRows.filter(r => !(r.no_po || '').startsWith('PR-'));
  } catch (e) {
    preview.innerHTML = `<div class="text-red-700 bg-red-50 p-3 rounded text-sm">Gagal: ${e.message || 'Terjadi kesalahan'}</div>`;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Generate PR';
  }
}

async function viewPrItems(prId) {
  const pr = _prList.find(r => r.id === prId);
  if (!pr) return;
  let items = [];
  try { items = JSON.parse(pr.item); } catch {}

  document.getElementById('modal-title').textContent = 'Detail PR: ' + pr.no_po;
  document.getElementById('modal-body').innerHTML = `
    <div class="space-y-3">
      <div class="flex items-center gap-3 text-xs text-stone-500 bg-stone-50 rounded-xl px-4 py-2.5">
        <span><span class="font-semibold text-stone-700">Periode:</span> ${(pr.tanggal || '').slice(0, 7)}</span>
        <span class="text-stone-200">|</span>
        <span><span class="font-semibold text-stone-700">Status:</span> ${pr.status}</span>
        <span class="text-stone-200">|</span>
        <span><span class="font-semibold text-stone-700">Total:</span> <span class="mono">${fmtIDR(pr.total_nilai || 0)}</span></span>
      </div>
      <div class="rounded-2xl border border-stone-200 overflow-hidden">
        <div class="overflow-x-auto"><table class="w-full">
          <thead><tr class="border-b border-stone-100">
            <th class="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-stone-500">Bahan</th>
            <th class="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-stone-500">Qty (dgn buffer)</th>
            <th class="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-stone-500">Satuan</th>
            <th class="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-stone-500">Harga</th>
            <th class="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-stone-500">Subtotal</th>
          </tr></thead>
          <tbody>
            ${items.map(i => `<tr class="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
              <td class="px-4 py-3 text-xs text-stone-700">${i.nama || '-'}</td>
              <td class="px-4 py-3 text-xs text-right mono text-stone-700">${Number(i.qty || 0).toFixed(2)}</td>
              <td class="px-4 py-3 text-xs text-right text-stone-500">${i.satuan || '-'}</td>
              <td class="px-4 py-3 text-xs text-right mono text-stone-600">${fmtIDR(Number(i.harga || 0))}</td>
              <td class="px-4 py-3 text-xs text-right mono font-medium text-stone-700">${fmtIDR(Number(i.subtotal || 0))}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>
      ${pr.catatan ? `<div class="text-[10px] text-stone-400 bg-stone-50 rounded-xl px-4 py-2">${pr.catatan}</div>` : ''}
    </div>`;

  document.getElementById('modal-save').textContent = 'Tutup';
  document.getElementById('modal-save').style.display = 'inline-block';
  document.getElementById('modal-save').onclick = closeModal;
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}

async function approvePr(prId) {
  if (!await showConfirm('Setujui PR ini?')) return;
  try {
    await api.put('/purchase_order/' + prId, { status: 'Disetujui' });
    showToast('PR disetujui');
    switchPrPoTab('pr');
  } catch (e) {
    showAlert('Gagal: ' + (e.message || 'Error'), 'error');
  }
}

async function rejectPr(prId) {
  const reason = prompt('Alasan penolakan:');
  if (!reason) return;
  const pr = _prList.find(r => r.id === prId);
  const currentCatatan = pr?.catatan || '';
  const newCatatan = (currentCatatan + '\n[DITOLAK: ' + reason + ']').trim();
  if (!await showConfirm('Tolak PR ini? Alasan: ' + reason)) return;
  try {
    await api.put('/purchase_order/' + prId, { catatan: newCatatan });
    showToast('PR ditolak');
    switchPrPoTab('pr');
  } catch (e) {
    showAlert('Gagal: ' + (e.message || 'Error'), 'error');
  }
}

async function buatPoDariPr(prId) {
  const pr = _prList.find(r => r.id === prId);
  if (!pr) return;
  let items = [];
  try { items = JSON.parse(pr.item); } catch {}

  if (!items.length) { showAlert('PR ini tidak memiliki item'); return; }

  // Pre-fill PO form with PR items
  await openPembelianForm(null, items, pr.no_po);
}

// ==================== PO VIEW ====================

async function renderPoView() {
  let allData = [];
  try {
    const res = await api.get('/purchase_order?tipe=po');
    allData = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
  } catch (e) {
    allData = [];
  }
  _poList = allData;

  const wrap = document.getElementById('pr-po-content');
  wrap.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div class="flex items-center gap-2">
        <button id="po-add-btn" class="h-11 px-5 bg-[#1e40af] hover:bg-[#1d4ed8] text-white rounded-xl text-sm font-semibold shadow-sm transition-all flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Tambah PO
        </button>
        <button id="po-from-siklus-btn" class="h-11 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all">+ Buat dari Siklus</button>
        <button id="po-sync-koperasi-btn" class="h-11 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all" title="Tarik nomor PO/Invoice dari koperasi">Sinkron dari Koperasi</button>
      </div>
      <div class="relative">
        <input id="po-search" placeholder="Cari PO..." class="w-56 h-11 pl-10 pr-4 rounded-xl border border-stone-200 bg-white text-sm shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
        <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
      </div>
    </div>
    <div id="po-table-wrap" class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
      ${_poList.length === 0 ? '<div class="py-16 text-center text-stone-400"><svg class="w-12 h-12 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><div class="text-sm">Belum ada PO</div><div class="text-xs text-stone-400 mt-1">Klik "Tambah PO" atau "Buat dari Siklus" untuk mulai.</div></div>' : renderPoTable(_poList)}
    </div>`;

  document.getElementById('po-add-btn').onclick = () => openPembelianForm(null);
  document.getElementById('po-from-siklus-btn').onclick = openSiklusPicker;
  document.getElementById('po-sync-koperasi-btn').onclick = syncDariKoperasi;

  document.getElementById('po-search').oninput = function() {
    const q = this.value.toLowerCase();
    const filtered = _poList.filter(r =>
      (r.no_po || '').toLowerCase().includes(q) ||
      (r.supplier_nama || '').toLowerCase().includes(q) ||
      (r.status || '').toLowerCase().includes(q)
    );
    document.getElementById('po-table-wrap').innerHTML = filtered.length === 0
      ? '<div class="p-12 text-center text-stone-400">Tidak ditemukan</div>'
      : renderPoTable(filtered);
  };
}

function renderPoTable(rows) {
  return `<div class="overflow-x-auto"><table class="w-full">
    <thead><tr class="border-b border-stone-100">
      <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">No PO</th>
      <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Tanggal</th>
      <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Supplier</th>
      <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Unit Dapur</th>
      <th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Total</th>
      <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Status</th>
      <th class="text-center px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Aksi</th>
    </tr></thead>
    <tbody>
      ${rows.map(r => {
        let items = [];
        try { items = JSON.parse(r.item); } catch {}
        const statusColors = { 'Draft': 'bg-stone-100 text-stone-700', 'Disetujui': 'bg-blue-100 text-blue-700', 'Dikirim': 'bg-amber-100 text-amber-700', 'Diterima': 'bg-emerald-100 text-emerald-700', 'Dibayar': 'bg-green-100 text-green-700' };
        return `<tr class="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
          <td class="px-4 py-3 text-xs font-semibold text-stone-700">${r.no_po || '-'}
            ${(r.no_po_koperasi || r.no_invoice_koperasi) ? `<div class="text-[10px] font-normal text-emerald-600 mt-0.5">Koperasi: ${r.no_po_koperasi || '-'}${r.no_invoice_koperasi ? ' / Inv: ' + r.no_invoice_koperasi : ''}</div>` : ''}
          </td>
          <td class="px-4 py-3 text-xs text-stone-600">${fmtDate(r.tanggal)}</td>
          <td class="px-4 py-3 text-xs text-stone-600">${r.supplier_nama || '-'}</td>
          <td class="px-4 py-3 text-xs text-stone-600">${r.unit_dapur || '-'}</td>
          <td class="px-4 py-3 text-xs text-right mono font-medium text-stone-700">${fmtIDR(r.total_nilai || 0)}</td>
          <td class="px-4 py-3 text-xs"><span class="inline-block px-2.5 py-0.5 text-[10px] font-semibold rounded-lg ${statusColors[r.status] || 'bg-stone-100 text-stone-700'}">${r.status || 'Draft'}</span></td>
          <td class="px-4 py-3 text-center whitespace-nowrap">
            <button onclick="openPembelianForm(JSON.parse(this.dataset.po))" data-po='${JSON.stringify(r).replace(/'/g, "&#39;")}' class="w-7 h-7 inline-flex items-center justify-center rounded-lg text-stone-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="Edit">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button onclick="deletePo(${r.id})" class="w-7 h-7 inline-flex items-center justify-center rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-all" title="Hapus">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
            ${r.status === 'Dikirim' ? `<button onclick="terimaPo(${r.id})" class="w-7 h-7 inline-flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 transition-all" title="Terima Barang">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </button>` : ''}
            <button onclick="kirimKeKoperasi(JSON.parse(this.dataset.po))" data-po='${JSON.stringify(r).replace(/'/g, "&#39;")}' class="w-7 h-7 inline-flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 transition-all" title="Kirim ke Koperasi">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4z"/></svg>
            </button>
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

async function syncDariKoperasi() {
  if (!await showConfirm('Tarik nomor PO/Invoice terbaru dari sistem koperasi?')) return;
  try {
    const result = await api.post('/purchase_order/sync-koperasi', {});
    const msg = result.message || (result.updated + ' PO diupdate');
    showToast('✅ ' + msg, result.updated > 0 ? 'success' : 'info');
    renderPembelianPage('po');
  } catch (e) {
    showAlert('Gagal sinkronisasi: ' + (e.message || 'Error'), 'error');
  }
}

async function deletePo(id) {
  if (!await showConfirm('Hapus PO ini?')) return;
  try {
    await api.del('/purchase_order/' + id);
    showToast('PO berhasil dihapus');
    renderPembelianPage('po');
  } catch (e) {
    showAlert('Gagal: ' + (e.message || 'Error'), 'error');
  }
}

async function deletePr(id) {
  if (!await showConfirm('Hapus PR ini?')) return;
  try {
    await api.del('/purchase_order/' + id);
    showToast('PR berhasil dihapus');
    switchPrPoTab('pr');
  } catch (e) {
    showAlert('Gagal: ' + (e.message || 'Error'), 'error');
  }
}

async function terimaPo(poId) {
  if (!await showConfirm('Tandai PO sebagai Diterima dan update stok bahan baku?')) return;
  try {
    const result = await api.post('/purchase_order/' + poId + '/terima', {});
    const msg = result.message || 'Stok berhasil diupdate';
    const detail = result.detail || [];
    const sukses = detail.filter(d => d.status === 'ok').length;
    const gagal = detail.filter(d => d.status === 'skip').length;
    
    var info = '';
    if (gagal > 0) {
      info = detail.filter(d => d.status === 'skip').map(function(d) { return '• ' + d.nama + ': ' + d.alasan; }).join('<br>');
    }
    
    showToast('✅ ' + sukses + ' bahan diterima' + (gagal ? ', ' + gagal + ' gagal' : ''), sukses > gagal ? 'success' : 'warning');
    if (info) showAlert('Bahan yang gagal:<br>' + info, 'warning');
    renderPembelianPage('po');
  } catch (e) {
    showAlert('Gagal: ' + (e.message || 'Error'), 'error');
  }
}

async function kirimKeKoperasi(po) {
  let id_unit_dapur = localStorage.getItem('koperasi_id_unit_dapur');
  if (!id_unit_dapur) {
    id_unit_dapur = prompt('Masukkan ID Unit Dapur di sistem Koperasi:');
    if (!id_unit_dapur) return;
    localStorage.setItem('koperasi_id_unit_dapur', id_unit_dapur);
  }

  let items = [];
  try { items = JSON.parse(po.item); } catch { items = []; }
  if (!items.length) { showAlert('PO tidak memiliki item', 'warning'); return; }

  const payload = {
    id_unit_dapur: Number(id_unit_dapur),
    nama_dapur: po.unit_dapur || '',
    supplier_name: po.supplier_nama || '',
    tanggal_pesanan: po.tanggal,
    items: items.map(i => {
      const m = (i.kode || '').match(/EXT[-\s]?(\d+)/i);
      const ingredient_id = m ? parseInt(m[1]) : (Number(i.id_koperasi) || 0);
      return {
        ingredient_id,
        name: i.nama || '',
        qty: Number(i.qty) || 0,
        unit: i.satuan || '',
        price: Number(i.harga || i.subtotal || 0),
      };
    }),
    notes: 'PO: ' + po.no_po + (po.catatan ? ' — ' + po.catatan : ''),
  };

  console.log('JSON dikirim ke koperasi:', JSON.stringify(payload, null, 2));

  try {
    const r = await fetch('https://koperasi.mealify.id/api/pesanan_dapur.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await r.json();
    if (result.success) {
      const kodePesanan = result.data?.kode_pesanan || '';
      showToast('PO berhasil dikirim ke koperasi. Kode: ' + (kodePesanan || '-'), 'success');
      if (kodePesanan && po.id) {
        try {
          await api.post('/purchase_order/' + po.id + '/kode-koperasi', { no_po_koperasi: kodePesanan });
          renderPembelianPage('po');
        } catch (e) {
          console.warn('Gagal simpan kode pesanan koperasi:', e);
        }
      }
      bukaWaNotifikasiKoperasi(po, items, kodePesanan);

    } else {
      showAlert('Gagal: ' + (result.message || 'Respons tidak valid'), 'error');
    }
  } catch (e) {
    showAlert('Gagal terhubung ke koperasi: ' + e.message, 'error');
  }
}

async function bukaWaNotifikasiKoperasi(po, items, kodePesanan) {
  const telepon = await cariTeleponSupplier(po);
  if (!telepon) {
    showToast('Kiriman sukses, tapi nomor WA petugas koperasi tidak ditemukan di data supplier', 'warning');
    return;
  }

  const namaDapur = (typeof currentTenant !== 'undefined' && currentTenant && currentTenant.nama)
    || (await cariNamaDapur())
    || po.unit_dapur
    || '-';
  const daftar = items.map((i, idx) => (idx + 1) + '. ' + (i.nama || '-') + ' — ' + Number(i.qty || 0) + ' ' + (i.satuan || '')).join('\n');
  const msg = 'Halo Petugas Koperasi,\n\n' +
    'Ada PO bahan baku baru dari ' + namaDapur + ':\n\n' +
    'No PO: ' + (po.no_po || '-') + '\n' +
    'Tanggal: ' + (po.tanggal || '-') + '\n' +
    'Kode Pesanan: ' + kodePesanan + '\n\n' +
    'Item:\n' + daftar + '\n\n' +
    'Total Nilai: ' + fmtIDR(po.total_nilai || 0) + '\n\n' +
    'Mohon segera diproses. Terima kasih.';

  const waLink = 'https://wa.me/' + normalizeWaNumber(telepon) + '?text=' + encodeURIComponent(msg);
  window.open(waLink, '_blank');
  showToast('WhatsApp dibuka — tekan kirim untuk notifikasi ke petugas koperasi', 'success');
}

async function cariNamaDapur() {
  try {
    const r = await fetch('/api/system/kop-surat', { credentials: 'include' });
    if (!r.ok) return '';
    const d = await r.json();
    return d.kop_nama || '';
  } catch (e) {
    return '';
  }
}

async function cariTeleponSupplier(po) {
  try {
    const supData = await api.get('/supplier');
    const list = Array.isArray(supData) ? supData : (Array.isArray(supData.data) ? supData.data : []);
    let sup = null;
    if (po.supplier_id) sup = list.find(s => Number(s.id) === Number(po.supplier_id));
    if (!sup && po.supplier_nama) sup = list.find(s => String(s.nama || '').toLowerCase() === String(po.supplier_nama).toLowerCase());
    if (!sup && po.supplier_nama) sup = list.find(s => String(s.nama || '').toLowerCase().includes(String(po.supplier_nama).toLowerCase()));
    return sup && sup.telepon ? sup.telepon : '';
  } catch (e) {
    return '';
  }
}

function normalizeWaNumber(num) {
  let n = String(num || '').replace(/[^0-9]/g, '');
  if (!n) return '';
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (!n.startsWith('62')) n = '62' + n;
  return n;
}

async function openPembelianForm(editing, prItems, prRef) {
  _poEditing = editing;
  try {
    const data = await api.get('/bahan_baku');
    _bahanBakuList = Array.isArray(data) ? data : (data.data || []);
  } catch (e) {
    _bahanBakuList = [];
  }

  let supplierList = [];
  try {
    const supData = await api.get('/supplier');
    supplierList = Array.isArray(supData) ? supData : (supData.data || []);
  } catch (e) {
    supplierList = [];
  }

  const now = new Date();
  const tgl = now.toISOString().slice(0, 10);
  const nomor = 'PO-' + tgl.replace(/-/g, '') + '-' + Date.now().toString().slice(-4);

  let items = [];
  if (editing && editing.item) {
    try { items = JSON.parse(editing.item); } catch { items = []; }
  } else if (prItems && prItems.length) {
    // Pre-fill from PR items
    items = prItems.map(i => ({
      bahan_baku_id: i.bahan_baku_id,
      qty: i.qty || i.buffer_10 || 0,
      satuan: i.satuan,
      subtotal: i.subtotal || i.estimated_subtotal || 0,
    }));
  }

  const _prRefGlobal = prRef;
  window._prRef = prRef || null;

  document.getElementById('modal-title').textContent = editing ? 'Edit Purchase Order' : prItems ? 'Buat PO dari PR (' + (prRef || '') + ')' : 'Tambah Purchase Order';

  document.getElementById('modal-body').innerHTML = `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Nomor PO <span class="text-red-500">*</span></label>
          <input id="po-no_po" value="${editing ? editing.no_po : nomor}" class="mt-1.5 w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
        </div>
        <div>
          <label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Tanggal <span class="text-red-500">*</span></label>
          <input id="po-tanggal" type="date" value="${editing ? (editing.tanggal || '').slice(0, 10) : tgl}" class="mt-1.5 w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
        </div>
      </div>
      <div>
        <label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Supplier</label>
        <select id="po-supplier_nama" class="mt-1.5 w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
          <option value="">— Pilih Supplier —</option>
          ${supplierList.map(s => `<option value="${s.nama}" data-id="${s.id}" ${editing && editing.supplier_nama === s.nama ? 'selected' : ''}>${s.nama}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Unit Dapur</label>
        <input id="po-unit_dapur" value="${editing ? (editing.unit_dapur || '') : ''}" class="mt-1.5 w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
      </div>
      <div>
        <label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Daftar Item</label>
        <div id="po-items-list" class="mt-1.5 space-y-2"></div>
        <button onclick="addPoItemRow()" class="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1">+ Tambah Item</button>
      </div>
      <div class="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3">
        <span class="text-sm font-bold text-stone-700">Total: <span id="po-total-display" class="mono">Rp 0</span></span>
        <input type="hidden" id="po-item-json" value='${JSON.stringify(items)}'>
        <input type="hidden" id="po-total_nilai" value="0">
      </div>
      <div>
        <label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Status</label>
        <select id="po-status" class="mt-1.5 w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
          <option>Draft</option><option ${editing && editing.status === 'Disetujui' ? 'selected' : ''}>Disetujui</option>
          <option ${editing && editing.status === 'Dikirim' ? 'selected' : ''}>Dikirim</option>
          <option ${editing && editing.status === 'Diterima' ? 'selected' : ''}>Diterima</option>
          <option ${editing && editing.status === 'Dibayar' ? 'selected' : ''}>Dibayar</option>
        </select>
      </div>
      <div>
        <label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Catatan</label>
        <textarea id="po-catatan" class="mt-1.5 w-full px-3 py-2.5 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" rows="2">${editing ? (editing.catatan || '') : ''}</textarea>
      </div>
    </div>`;

  renderPoItems(items);

  document.getElementById('modal-save').style.display = '';
  document.getElementById('modal-save').onclick = savePembelian;
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}

function renderPoItems(items) {
  _poItems = items;
  const wrap = document.getElementById('po-items-list');
  if (!items.length) {
    wrap.innerHTML = '<div class="text-sm text-stone-400 py-2">Belum ada item. Klik "+ Tambah Item" untuk mulai.</div>';
    updatePoTotal();
    return;
  }
  wrap.innerHTML = items.map((item, i) => `
    <div class="flex gap-2 items-center bg-stone-50 rounded-xl p-2.5">
      <select onchange="updatePoItem(${i}, 'bahan_baku_id', this.value)" class="flex-1 h-10 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
        <option value="">— Pilih Bahan —</option>
        ${_bahanBakuList.map(b => {
          const isNew = b.created_at && (Date.now() - new Date(b.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000;
          const sel = Number(b.id) === Number(item.bahan_baku_id) ? 'selected' : '';
          const kodeNum = b.kode ? (b.kode.match(/EXT[-\s]?(\d+)/i)?.[1] || b.kode) : '';
          const agLabel = b.sumber === 'ahli_gizi' ? ' [Permintaan Ahli Gizi]' : '';
          return `<option value="${b.id}" ${sel}>${kodeNum ? '[' + kodeNum + '] ' : ''}${b.nama}${isNew ? ' 🆕' : ''}${agLabel}${b.harga_satuan ? ' @ ' + fmtIDR(b.harga_satuan) : ''}</option>`;
        }).join('')}
      </select>
      <input type="number" step="0.001" value="${item.qty || ''}" placeholder="Qty"
        onchange="updatePoItem(${i}, 'qty', this.value)"
        class="w-24 h-10 px-3 rounded-lg border border-stone-200 text-sm mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
      <span class="h-10 leading-10 text-xs text-stone-500 shrink-0 font-medium">${item.satuan || ''}</span>
      <button onclick="removePoItem(${i})" class="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 transition-all" title="Hapus">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join('');
  updatePoTotal();
}

function addPoItemRow() {
  _poItems.push({ bahan_baku_id: '', qty: '', subtotal: 0, satuan: '' });
  renderPoItems(_poItems);
}

function removePoItem(idx) {
  _poItems.splice(idx, 1);
  renderPoItems(_poItems);
}

function updatePoItem(idx, field, value) {
  _poItems[idx][field] = value;
  const b = _bahanBakuList.find(x => Number(x.id) === Number(_poItems[idx].bahan_baku_id));
  if (b) {
    _poItems[idx].satuan = b.satuan || '';
    _poItems[idx].subtotal = (Number(_poItems[idx].qty) || 0) * (Number(b.harga_satuan) || 0);
  }
  renderPoItems(_poItems);
}

function updatePoTotal() {
  const total = _poItems.reduce((s, i) => s + (Number(i.subtotal) || 0), 0);
  document.getElementById('po-total-display').textContent = fmtIDR(total);
  document.getElementById('po-total_nilai').value = total;
}

function savePembelian() {
  const no_po = document.getElementById('po-no_po').value.trim();
  const tanggal = document.getElementById('po-tanggal').value;
  if (!no_po || !tanggal) { showAlert('Nomor PO dan Tanggal wajib diisi', 'warning'); return; }
  if (!_poItems.length) { showAlert('Minimal satu item harus ditambahkan', 'warning'); return; }

  const total = _poItems.reduce((s, i) => s + (Number(i.subtotal) || 0), 0);
  const supplierEl = document.getElementById('po-supplier_nama');
  const supplierNama = supplierEl.value.trim();
  const supplierId = supplierEl.selectedIndex > 0 ? (supplierEl.options[supplierEl.selectedIndex]?.dataset?.id || null) : null;
  const payload = {
    no_po,
    tanggal,
    supplier_id: supplierId,
    supplier_nama: supplierNama,
    unit_dapur: document.getElementById('po-unit_dapur').value.trim(),
    item: JSON.stringify(_poItems.map(i => {
      const b = _bahanBakuList.find(x => Number(x.id) === Number(i.bahan_baku_id));
      return {
        bahan_baku_id: i.bahan_baku_id,
        id_koperasi: b?.id_koperasi || null,
        kode: b?.kode || '',
        nama: b?.nama || '',
        qty: Number(i.qty) || 0,
        satuan: i.satuan,
        harga: Number(b?.harga_satuan || 0),
        subtotal: Number(i.subtotal) || 0,
      };
    })),
    total_nilai: total,
    status: document.getElementById('po-status').value,
    catatan: (document.getElementById('po-catatan').value.trim() + (window._prRef ? '\n[Dibuat dari: ' + window._prRef + ']' : '')).trim(),
  };

  const isEdit = !!_poEditing;
  const req = isEdit ? api.put('/purchase_order/' + _poEditing.id, payload) : api.post('/purchase_order', payload);
  req.then(() => {
    closeModal();
    renderPembelian();
    showToast('PO berhasil ' + (isEdit ? 'diupdate' : 'dibuat'));
  }).catch(e => {
    showAlert('Gagal: ' + (e.message || 'Terjadi kesalahan'), 'error');
  });
}

async function openSiklusPicker() {
  let siklusList;
  try {
    siklusList = await api.get('/siklus');
  } catch (e) {
    showAlert('Gagal memuat data siklus');
    return;
  }

  document.getElementById('modal-title').innerHTML = 'Buat PO <span class="text-stone-400 font-normal">dari Siklus Menu</span>';
  document.getElementById('modal-body').innerHTML = `
    <div class="mb-4">
      <label class="flex items-center gap-1.5 text-xs font-semibold text-stone-600 uppercase tracking-wider mb-2">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        Pilih Siklus Menu
      </label>
      <div class="max-h-48 overflow-y-auto rounded-xl border border-stone-200">
        ${siklusList && siklusList.length ? '<div class="divide-y divide-stone-100">' + siklusList.map(s => {
          var statusBadge = s.status === 'Aktif' ? '<span class="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700">Aktif</span>' : '<span class="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700">Draft</span>';
          return '<label class="flex items-center gap-3 cursor-pointer hover:bg-blue-50/50 transition-colors px-3 py-2.5">' +
            '<input type="checkbox" class="siklus-check cb-modern" value="' + s.id + '" data-status="' + (s.status || 'Draft') + '">' +
            '<div class="flex-1 min-w-0">' +
              '<div class="text-sm font-medium text-stone-700 truncate">' + escHtml(s.nama) + '</div>' +
              '<div class="text-[11px] text-stone-400 mt-0.5">' + (s.kategori_penerima || '-') + ' &middot; ' + (s.jumlah_porsi || 0) + ' porsi</div>' +
            '</div>' +
            statusBadge +
          '</label>';
        }).join('') + '</div>' : '<div class="flex items-center gap-3 p-4 text-amber-700 bg-amber-50 rounded-xl m-2"><svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><div><div class="text-sm font-medium">Belum ada siklus menu</div><div class="text-[10px] mt-0.5">Buat siklus terlebih dahulu di menu Ahli Gizi &gt; Siklus Menu.</div></div></div>'}
      </div>
    </div>
    <div id="po-preview"></div>`;

  const saveBtn = document.getElementById('modal-save');
  saveBtn.textContent = 'Generate Draft';
  saveBtn.style.display = siklusList && siklusList.length ? 'inline-block' : 'none';
  saveBtn.onclick = generatePOFromSiklus;

  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}

async function generatePOFromSiklus() {
  const checked = document.querySelectorAll('.siklus-check:checked');
  const ids = Array.from(checked).map(cb => parseInt(cb.value));
  if (!ids.length) { showAlert('Pilih minimal satu siklus'); return; }

  // Cek apakah ada siklus yang masih Draft
  var draftSiklus = Array.from(checked).filter(function(cb) { return cb.getAttribute('data-status') === 'Draft'; });
  if (draftSiklus.length) {
    var draftNames = draftSiklus.map(function(cb) { return cb.closest('label')?.querySelector('.font-medium')?.textContent?.trim() || '#' + cb.value; }).join(', ');
    document.getElementById('po-preview').innerHTML = '<div class="flex items-start gap-3 p-4 text-amber-700 bg-amber-50 rounded-xl border border-amber-200"><svg class="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><div><div class="text-sm font-semibold">Siklus masih Draft</div><div class="text-xs mt-0.5 text-amber-600">Siklus berikut belum Aktif dan tidak bisa di-generate: <strong>' + draftNames + '</strong>. Aktifkan siklus terlebih dahulu di menu Ahli Gizi &gt; Siklus Menu.</div></div></div>';
    return;
  }

  const preview = document.getElementById('po-preview');
  preview.innerHTML = '<div class="text-center py-4 text-stone-500">⏳ Menghitung kebutuhan bahan...</div>';

  try {
    const result = await api.post('/purchase_order/generate-from-siklus', { siklus_ids: ids });

    let menus = result.menus || [];
    // Fallback backend lama: tanpa breakdown per menu, tampilkan sebagai satu grup "Gabungan"
    if (!menus.length && result.items && result.items.length) {
      menus = [{ hari_ke: 0, menu_nama: 'Gabungan Semua Menu', jumlah_porsi: 0, items: result.items, subtotal: result.total_estimated || 0 }];
    }
    if (!menus.length) {
      preview.innerHTML = '<div class="text-amber-700 bg-amber-50 p-3 rounded text-sm">Tidak ada bahan. Siklus dipilih belum memiliki menu.</div>';
      return;
    }

    let siklusSupplierList = [];
    try {
      const supData = await api.get('/supplier');
      siklusSupplierList = Array.isArray(supData) ? supData : (supData.data || []);
    } catch (e) {
      siklusSupplierList = [];
    }

    const siklusNama = (result.siklus_refs || []).join(', ') || 'Siklus';

    preview.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <div class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Pilih Menu — Buat PO per Menu</div>
        <label class="flex items-center gap-1.5 text-xs text-stone-500 cursor-pointer hover:text-stone-700">
          <input type="checkbox" id="menu-po-select-all" checked class="cb-modern" onchange="toggleAllMenuPo(this)">
          Semua
        </label>
      </div>
      <div class="space-y-2 max-h-80 overflow-y-auto pr-1 mb-3">
        ${menus.map((m, idx) => {
          const itemsHtml = m.items.map(i => {
            const kodeNum = i.kode ? (i.kode.match(/EXT[-\s]?(\d+)/i)?.[1] || i.kode) : '';
            return `<tr class="border-b border-stone-50">
              <td class="px-3 py-2 text-xs text-stone-700">${kodeNum ? '[' + kodeNum + '] ' : ''}${i.bahan_nama}</td>
              <td class="px-3 py-2 text-xs text-right mono text-stone-700">${i.buffer_10} ${i.satuan}</td>
              <td class="px-3 py-2 text-xs text-right mono text-stone-600">${fmtIDR(i.harga_satuan)}</td>
              <td class="px-3 py-2 text-xs text-right mono font-medium text-stone-700">${fmtIDR(i.estimated_subtotal)}</td>
            </tr>`;
          }).join('');
          return `<div class="border border-stone-200 rounded-xl overflow-hidden bg-white">
            <label class="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-stone-50/70 transition-colors">
              <input type="checkbox" class="menu-po-cb cb-modern" value="${idx}" checked data-subtotal="${m.subtotal}" onchange="updateMenuPoSelection()">
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold text-stone-800 truncate">Hari ${m.hari_ke} — ${m.menu_nama}</div>
                <div class="text-[10px] text-stone-400 mt-0.5">${m.items.length} bahan · ${fmtIDR(m.subtotal)}${m.jumlah_porsi ? ' · ' + fmtNum(m.jumlah_porsi) + ' porsi' : ''}</div>
              </div>
              <button type="button" onclick="event.preventDefault();event.stopPropagation();toggleMenuPoItems(${idx})" class="shrink-0 text-[10px] font-medium text-blue-600 hover:text-blue-800 border border-stone-200 rounded-lg px-2 py-1">Item</button>
            </label>
            <div id="menu-po-items-${idx}" class="hidden border-t border-stone-100 bg-stone-50/50">
              <div class="overflow-x-auto"><table class="w-full">
                <thead><tr class="border-b border-stone-100">
                  <th class="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">Bahan</th>
                  <th class="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">Qty</th>
                  <th class="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">Harga</th>
                  <th class="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">Subtotal</th>
                </tr></thead>
                <tbody>${itemsHtml}</tbody>
              </table></div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div id="menu-po-summary" class="flex items-center justify-between text-xs text-stone-500 bg-stone-50 rounded-xl px-3 py-2 mb-3"></div>
      <div class="flex gap-2 mb-3">
        <select id="po-supplier" class="flex-1 h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
          <option value="">— Pilih Supplier —</option>
          ${siklusSupplierList.map(s => `<option value="${s.nama}" data-id="${s.id}">${s.nama}</option>`).join('')}
        </select>
        <input id="po-unit_dapur-siklus" placeholder="Unit Dapur" class="flex-1 h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
      </div>
      <button id="confirm-create-po" class="w-full h-11 bg-[#1e40af] hover:bg-[#1d4ed8] text-white rounded-xl text-sm font-semibold shadow-sm transition-all">Buat PO Terpilih</button>`;

    document.getElementById('modal-save').style.display = 'none';
    window._menuPoData = menus;
    window._menuPoSiklus = siklusNama;
    updateMenuPoSelection();

    document.getElementById('confirm-create-po').onclick = async () => {
      const supplierEl = document.getElementById('po-supplier');
      const supplierNama = supplierEl.value;
      const supplierId = supplierEl.selectedIndex > 0 ? (supplierEl.options[supplierEl.selectedIndex]?.dataset?.id || null) : null;
      const unitDapur = document.getElementById('po-unit_dapur-siklus')?.value?.trim() || '';
      const selected = Array.from(document.querySelectorAll('.menu-po-cb:checked')).map(cb => window._menuPoData[parseInt(cb.value)]);
      if (!selected.length) { showAlert('Pilih minimal satu menu', 'warning'); return; }

      const tgl = new Date().toISOString().slice(0, 10);
      const baseNomor = 'PO-' + tgl.replace(/-/g, '') + '-' + Date.now().toString().slice(-4);
      const multi = selected.length > 1;
      const btn = document.getElementById('confirm-create-po');
      btn.disabled = true;
      btn.textContent = '⏳ Membuat ' + selected.length + ' PO...';

      let ok = 0;
      const failed = [];
      try {
        for (let i = 0; i < selected.length; i++) {
          const m = selected[i];
          const nomor = multi ? baseNomor + '-' + (i + 1) : baseNomor;
          const items = m.items.map(it => ({
            bahan_baku_id: it.bahan_baku_id,
            id_koperasi: it.id_koperasi,
            kode: it.kode || '',
            nama: it.bahan_nama,
            qty: it.buffer_10,
            satuan: it.satuan,
            harga: it.harga_satuan,
            subtotal: it.estimated_subtotal,
          }));
          try {
            await api.post('/purchase_order', {
              no_po: nomor, tanggal: tgl,
              supplier_id: supplierId, supplier_nama: supplierNama,
              unit_dapur: unitDapur,
              item: JSON.stringify(items), total_nilai: m.subtotal,
              status: 'Draft',
              catatan: 'Dibuat dari siklus: ' + siklusNama + ' — Menu Hari ' + m.hari_ke + ': ' + m.menu_nama,
            });
            ok++;
          } catch (err) {
            failed.push('Hari ' + m.hari_ke);
            console.warn('Gagal membuat PO menu hari ' + m.hari_ke + ':', err);
          }
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Buat PO Terpilih';
      }
      closeModal();
      renderPembelian();
      if (ok === selected.length) {
        showToast('✅ ' + ok + ' PO berhasil dibuat');
      } else if (ok > 0) {
        showToast('⚠️ ' + ok + ' PO berhasil, ' + failed.length + ' gagal (' + failed.join(', ') + ')', 'warning');
      } else {
        showAlert('Gagal membuat PO: ' + (failed.join(', ') || 'terjadi kesalahan'), 'error');
      }
    };
  } catch (e) {
    preview.innerHTML = `<div class="text-red-700 bg-red-50 p-3 rounded text-sm">Gagal: ${e.message || 'Terjadi kesalahan'}</div>`;
  }
}

function toggleAllMenuPo(master) {
  document.querySelectorAll('.menu-po-cb').forEach(cb => cb.checked = master.checked);
  updateMenuPoSelection();
}
function toggleMenuPoItems(idx) {
  const el = document.getElementById('menu-po-items-' + idx);
  if (el) el.classList.toggle('hidden');
}
function updateMenuPoSelection() {
  const cbs = Array.from(document.querySelectorAll('.menu-po-cb'));
  const checked = cbs.filter(cb => cb.checked);
  const total = checked.reduce((s, cb) => s + (Number(cb.dataset.subtotal) || 0), 0);
  const sumEl = document.getElementById('menu-po-summary');
  if (sumEl) {
    sumEl.innerHTML = '<span>' + checked.length + ' dari ' + cbs.length + ' menu terpilih</span><span class="font-semibold text-stone-700 mono">Total: ' + fmtIDR(total) + '</span>';
  }
  const allEl = document.getElementById('menu-po-select-all');
  if (allEl) allEl.checked = cbs.length > 0 && checked.length === cbs.length;
  const btn = document.getElementById('confirm-create-po');
  if (btn) btn.textContent = 'Buat PO Terpilih (' + checked.length + ')';
}
