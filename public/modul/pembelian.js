let _poEditing = null;
let _poItems = [];
let _bahanBakuList = [];
let _prList = [];
let _poList = [];

async function renderPembelian() {
  await renderPembelianPage('pr');
}

function switchPrPoTab(tab) {
  document.getElementById('tab-pr').className = 'px-4 py-2 rounded-md text-sm font-medium' + (tab === 'pr' ? ' bg-white shadow' : '');
  document.getElementById('tab-po').className = 'px-4 py-2 rounded-md text-sm font-medium' + (tab === 'po' ? ' bg-white shadow' : '');
  // Refresh data for both tabs
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
  content.innerHTML = `<div class="space-y-4">
    <div class="flex gap-1 bg-stone-100 rounded-lg p-1 w-fit" id="pr-po-tabs">
      <button onclick="switchPrPoTab('pr')" id="tab-pr" class="px-4 py-2 rounded-md text-sm font-medium${activeTab === 'pr' ? ' bg-white shadow' : ''}">PR — Purchase Request</button>
      <button onclick="switchPrPoTab('po')" id="tab-po" class="px-4 py-2 rounded-md text-sm font-medium${activeTab === 'po' ? ' bg-white shadow' : ''}">PO — Purchase Order</button>
    </div>
    <div id="pr-po-content"></div>
  </div>`;

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
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-stone-800">Daftar Purchase Request</h2>
      <button onclick="openBuatPrForm()" class="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md text-sm font-medium">+ Buat PR</button>
    </div>
    <div class="mt-3 overflow-x-auto bg-white rounded-lg border border-stone-200" id="pr-table-wrap">
      ${_prList.length === 0 ? '<div class="p-6 text-center text-stone-400 text-sm">Belum ada PR. Klik "+ Buat PR" untuk membuat Purchase Request baru.</div>' : `
      <table class="w-full text-sm">
        <thead class="bg-stone-50">
          <tr>
            <th class="text-left px-4 py-3 font-semibold text-xs">No PR</th>
            <th class="text-left px-4 py-3 font-semibold text-xs">Periode</th>
            <th class="text-right px-4 py-3 font-semibold text-xs">Item</th>
            <th class="text-right px-4 py-3 font-semibold text-xs">Total Estimasi</th>
            <th class="text-left px-4 py-3 font-semibold text-xs">Status</th>
            <th class="text-center px-4 py-3 font-semibold text-xs">Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${_prList.map(pr => {
            let items = [];
            try { items = JSON.parse(pr.item); } catch {}
            const itemCount = items.length;
            const periode = (pr.tanggal || '').slice(0, 7);
            return `<tr class="border-t border-stone-100">
              <td class="px-4 py-3 font-medium">${pr.no_po}</td>
              <td class="px-4 py-3">${periode}</td>
              <td class="px-4 py-3 text-right">${itemCount} bahan</td>
              <td class="px-4 py-3 text-right mono">${fmtIDR(pr.total_nilai || 0)}</td>
              <td class="px-4 py-3">${(pr.catatan || '').includes('[DITOLAK]')
                ? '<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs">Ditolak</span>'
                : pr.status === 'Disetujui'
                  ? '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">Disetujui</span>'
                  : '<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs">Menunggu</span>'
              }</td>
              <td class="px-4 py-3 text-center whitespace-nowrap">
                <button onclick="viewPrItems(${pr.id})" class="text-blue-600 hover:text-blue-800 text-xs font-medium mr-2">Detail</button>
                ${pr.status === 'Disetujui' ? `<button onclick="buatPoDariPr(${pr.id})" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Buat PO</button>` : ''}
                ${(currentUser?.role === 'admin' || currentUser?.role === 'keuangan') && pr.status === 'Draft' ? `
                  <button onclick="approvePr(${pr.id})" class="text-green-600 hover:text-green-800 text-xs font-medium mr-1">Setujui</button>
                  <button onclick="rejectPr(${pr.id})" class="text-red-600 hover:text-red-800 text-xs font-medium">Tolak</button>
                ` : ''}
                ${(pr.catatan || '').includes('[DITOLAK]') ? '<span class="text-red-500 text-xs">Ditolak</span>' : ''}
                ${pr.status !== 'Disetujui' ? `<button onclick="deletePr(${pr.id})" class="text-red-600 hover:text-red-800 p-1.5 inline-flex items-center" title="Hapus">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`}
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
  if (!siklusList || !siklusList.length) {
    showAlert('Belum ada siklus menu. Buat siklus terlebih dahulu.');
    return;
  }

  const now = new Date();
  const defaultPeriode = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  // Hitung max total_hari dari semua siklus untuk default range
  var maxHari = Math.max(...siklusList.filter(s => s.status === 'Aktif').map(s => Number(s.total_hari) || 7), 7);

  document.getElementById('modal-title').textContent = 'Buat Purchase Request';
  document.getElementById('modal-body').innerHTML = `
    <div class="space-y-3">
      <div>
        <label class="text-sm font-medium">Periode <span class="text-red-500">*</span></label>
        <input id="pr-periode" type="month" value="${defaultPeriode}" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md text-sm">
      </div>
      <div>
        <label class="text-sm font-medium">Pilih Siklus</label>
        <div class="mt-1 space-y-1 max-h-48 overflow-y-auto border border-stone-200 rounded-lg p-2">
          ${siklusList.filter(s => s.status === 'Aktif').map((s, i) => `
            <label class="flex items-center gap-2 cursor-pointer hover:bg-stone-50 p-1.5 rounded">
              <input type="checkbox" class="pr-siklus-check" value="${s.id}" data-hari="${Number(s.total_hari) || 7}" checked>
              <span class="text-sm">${s.nama} — ${s.kategori_penerima || '-'} (${s.jumlah_porsi || 0} porsi, ${Number(s.total_hari) || 7} hari)</span>
            </label>
          `).join('')}
        </div>
        <p class="text-xs text-stone-400 mt-1">Kosongkan pilihan untuk menggunakan semua siklus Aktif</p>
      </div>
      <div class="flex gap-2">
        <div class="flex-1">
          <label class="text-sm font-medium">Hari Mulai</label>
          <input id="pr-hari-mulai" type="number" min="1" value="1" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md text-sm">
        </div>
        <div class="flex-1">
          <label class="text-sm font-medium">Hari Selesai</label>
          <input id="pr-hari-selesai" type="number" min="1" value="${maxHari}" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md text-sm">
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

  // Update info saat input range berubah
  document.getElementById('pr-hari-mulai').addEventListener('input', function() {
    var selesai = document.getElementById('pr-hari-selesai');
    if (this.value && selesai.value && Number(this.value) > Number(selesai.value)) {
      selesai.value = this.value;
    }
  });
  document.getElementById('pr-hari-selesai').addEventListener('input', function() {
    var mulai = document.getElementById('pr-hari-mulai');
    if (this.value && mulai.value && Number(this.value) < Number(mulai.value)) {
      mulai.value = this.value;
    }
  });

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

    const budgetHtml = result.budget_warning ? `<div class="bg-amber-50 border-l-4 border-amber-400 px-3 py-2 text-sm text-amber-800 mb-2">
      ⚠️ <strong>Peringatan Budget:</strong> ${result.budget_warning.message}<br>
      <span class="text-xs">Total Budget: ${fmtIDR(result.budget_warning.total_budget)} | Realisasi: ${fmtIDR(result.budget_warning.total_realisasi)} | Sisa: ${fmtIDR(result.budget_warning.sisa_budget)} | Estimasi PR: ${fmtIDR(result.budget_warning.estimated_total)} | Defisit: ${fmtIDR(result.budget_warning.defisit)}</span>
    </div>` : '';

    preview.innerHTML = `
      <div class="border border-stone-200 rounded-lg overflow-hidden">
        <div class="bg-emerald-50 px-3 py-2 text-sm text-emerald-800 font-medium">✅ ${result.message}</div>
        ${result.total_hari ? '<div class="px-3 py-1.5 text-xs text-stone-500 bg-stone-50 border-t border-stone-200">Hari produksi: ' + result.hari_mulai + ' — ' + result.hari_selesai + ' (total ' + result.total_hari + ' hari)</div>' : ''}
        ${budgetHtml}
        <table class="w-full text-sm">
          <thead class="bg-stone-50">
            <tr>
              <th class="text-left px-3 py-2 text-xs font-semibold">Bahan</th>
              <th class="text-right px-3 py-2 text-xs font-semibold">Kebutuhan</th>
              <th class="text-right px-3 py-2 text-xs font-semibold">+Buffer 10%</th>
              <th class="text-right px-3 py-2 text-xs font-semibold">Harga</th>
              <th class="text-right px-3 py-2 text-xs font-semibold">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${result.items.map(i => `<tr class="border-t border-stone-100">
              <td class="px-3 py-2">${i.nama}</td>
              <td class="px-3 py-2 text-right mono">${i.total_qty} ${i.satuan}</td>
              <td class="px-3 py-2 text-right mono">${i.buffer_10} ${i.satuan}</td>
              <td class="px-3 py-2 text-right mono">${fmtIDR(i.harga_satuan)}</td>
              <td class="px-3 py-2 text-right mono">${fmtIDR(i.subtotal)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot class="bg-stone-50 border-t border-stone-200">
            <tr><td colspan="4" class="px-3 py-2 text-right font-semibold">Total Estimasi</td>
              <td class="px-3 py-2 text-right font-semibold mono">${fmtIDR(result.total_estimated)}</td></tr>
          </tfoot>
        </table>
      </div>
      <div class="mt-2 text-sm text-stone-500">PR <strong>${result.no_pr}</strong> telah tersimpan. Gunakan tombol "Buat PO" di daftar PR untuk membuat Purchase Order.</div>`;

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
    <div class="space-y-2">
      <div class="text-sm text-stone-500">Periode: ${(pr.tanggal || '').slice(0, 7)} | Status: ${pr.status} | Total: ${fmtIDR(pr.total_nilai || 0)}</div>
      <div class="border border-stone-200 rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-stone-50">
            <tr>
              <th class="text-left px-3 py-2 text-xs font-semibold">Bahan</th>
              <th class="text-right px-3 py-2 text-xs font-semibold">Qty (dgn buffer)</th>
              <th class="text-right px-3 py-2 text-xs font-semibold">Satuan</th>
              <th class="text-right px-3 py-2 text-xs font-semibold">Harga</th>
              <th class="text-right px-3 py-2 text-xs font-semibold">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(i => `<tr class="border-t border-stone-100">
              <td class="px-3 py-2">${i.nama || '-'}</td>
              <td class="px-3 py-2 text-right mono">${Number(i.qty || 0).toFixed(2)}</td>
              <td class="px-3 py-2 text-right">${i.satuan || '-'}</td>
              <td class="px-3 py-2 text-right mono">${fmtIDR(Number(i.harga || 0))}</td>
              <td class="px-3 py-2 text-right mono">${fmtIDR(Number(i.subtotal || 0))}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="text-xs text-stone-400">${pr.catatan || ''}</div>
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
    <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
      <div class="flex items-center gap-2">
        <button id="po-add-btn" class="bg-[#1e40af] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-md text-sm font-medium">+ Tambah PO</button>
        <button id="po-from-siklus-btn" class="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md text-sm font-medium">+ Buat dari Siklus</button>
      </div>
      <div class="flex items-center gap-2">
        <input id="po-search" placeholder="Cari PO..." class="h-10 px-3 border border-stone-200 rounded-md text-sm w-48">
      </div>
    </div>
    <div id="po-table-wrap" class="bg-white border border-stone-200 rounded-lg overflow-hidden">
      ${_poList.length === 0 ? '<div class="p-12 text-center text-stone-400"><div>Belum ada PO</div><div class="text-sm mt-1">Klik "Tambah PO" atau "Buat dari Siklus" untuk mulai.</div></div>' : renderPoTable(_poList)}
    </div>`;

  document.getElementById('po-add-btn').onclick = () => openPembelianForm(null);
  document.getElementById('po-from-siklus-btn').onclick = openSiklusPicker;

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
  return `<div class="overflow-x-auto"><table class="w-full text-sm">
    <thead class="bg-stone-50">
      <tr>
        <th class="text-left px-4 py-3 font-semibold text-xs">No PO</th>
        <th class="text-left px-4 py-3 font-semibold text-xs">Tanggal</th>
        <th class="text-left px-4 py-3 font-semibold text-xs">Supplier</th>
        <th class="text-left px-4 py-3 font-semibold text-xs">Unit Dapur</th>
        <th class="text-right px-4 py-3 font-semibold text-xs">Total</th>
        <th class="text-left px-4 py-3 font-semibold text-xs">Status</th>
        <th class="text-center px-4 py-3 font-semibold text-xs">Aksi</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(r => {
        let items = [];
        try { items = JSON.parse(r.item); } catch {}
        const statusColors = { 'Draft': 'bg-stone-100 text-stone-700', 'Disetujui': 'bg-blue-100 text-blue-700', 'Dikirim': 'bg-amber-100 text-amber-700', 'Diterima': 'bg-emerald-100 text-emerald-700', 'Dibayar': 'bg-green-100 text-green-700' };
        return `<tr class="border-t border-stone-100">
          <td class="px-4 py-3 font-medium">${r.no_po || '-'}</td>
          <td class="px-4 py-3">${fmtDate(r.tanggal)}</td>
          <td class="px-4 py-3">${r.supplier_nama || '-'}</td>
          <td class="px-4 py-3">${r.unit_dapur || '-'}</td>
          <td class="px-4 py-3 text-right mono">${fmtIDR(r.total_nilai || 0)}</td>
          <td class="px-4 py-3"><span class="${statusColors[r.status] || 'bg-stone-100 text-stone-700'} px-2 py-0.5 rounded text-xs">${r.status || 'Draft'}</span></td>
          <td class="px-4 py-3 text-center whitespace-nowrap">
            <button onclick="openPembelianForm(JSON.parse(this.dataset.po))" data-po='${JSON.stringify(r).replace(/'/g, "&#39;")}' class="text-stone-500 hover:text-stone-900 p-1.5 inline-flex items-center" title="Edit">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button onclick="deletePo(${r.id})" class="text-red-600 hover:text-red-800 p-1.5 inline-flex items-center" title="Hapus">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
            <button onclick="kirimKeKoperasi(JSON.parse(this.dataset.po))" data-po='${JSON.stringify(r).replace(/'/g, "&#39;")}' class="text-emerald-600 hover:text-emerald-800 p-1.5 inline-flex items-center" title="Kirim ke Koperasi">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4z"/></svg>
            </button>
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
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
      showToast('PO berhasil dikirim ke koperasi. Kode: ' + (result.data?.kode_pesanan || '-'), 'success');

    } else {
      showAlert('Gagal: ' + (result.message || 'Respons tidak valid'), 'error');
    }
  } catch (e) {
    showAlert('Gagal terhubung ke koperasi: ' + e.message, 'error');
  }
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
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-sm text-stone-700">Nomor PO <span class="text-red-500">*</span></label>
          <input id="po-no_po" value="${editing ? editing.no_po : nomor}" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md text-sm">
        </div>
        <div>
          <label class="text-sm text-stone-700">Tanggal <span class="text-red-500">*</span></label>
          <input id="po-tanggal" type="date" value="${editing ? (editing.tanggal || '').slice(0, 10) : tgl}" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md text-sm">
        </div>
      </div>
      <div>
        <label class="text-sm text-stone-700">Supplier</label>
        <select id="po-supplier_nama" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md text-sm">
          <option value="">— Pilih Supplier —</option>
          ${supplierList.map(s => `<option value="${s.nama}" data-id="${s.id}" ${editing && editing.supplier_nama === s.nama ? 'selected' : ''}>${s.nama}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="text-sm text-stone-700">Unit Dapur</label>
        <input id="po-unit_dapur" value="${editing ? (editing.unit_dapur || '') : ''}" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md text-sm">
      </div>
      <div>
        <label class="text-sm text-stone-700 font-medium">Daftar Item</label>
        <div id="po-items-list" class="mt-1 space-y-1"></div>
        <button onclick="addPoItemRow()" class="mt-2 text-sm text-[#1e40af] hover:underline">+ Tambah Item</button>
      </div>
      <div class="flex items-center justify-between border-t border-stone-200 pt-3">
        <span class="text-sm font-semibold">Total: <span id="po-total-display" class="mono">Rp 0</span></span>
        <input type="hidden" id="po-item-json" value='${JSON.stringify(items)}'>
        <input type="hidden" id="po-total_nilai" value="0">
      </div>
      <div>
        <label class="text-sm text-stone-700">Status</label>
        <select id="po-status" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md text-sm">
          <option>Draft</option><option ${editing && editing.status === 'Disetujui' ? 'selected' : ''}>Disetujui</option>
          <option ${editing && editing.status === 'Dikirim' ? 'selected' : ''}>Dikirim</option>
          <option ${editing && editing.status === 'Diterima' ? 'selected' : ''}>Diterima</option>
          <option ${editing && editing.status === 'Dibayar' ? 'selected' : ''}>Dibayar</option>
        </select>
      </div>
      <div>
        <label class="text-sm text-stone-700">Catatan</label>
        <textarea id="po-catatan" class="mt-1 w-full px-3 py-2 border border-stone-200 rounded-md text-sm" rows="2">${editing ? (editing.catatan || '') : ''}</textarea>
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
    <div class="flex gap-2 items-start bg-stone-50 rounded-lg p-2">
      <select onchange="updatePoItem(${i}, 'bahan_baku_id', this.value)" class="flex-1 h-10 px-3 border border-stone-200 rounded-md text-sm">
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
        class="w-24 h-10 px-3 border border-stone-200 rounded-md text-sm mono">
      <span class="h-10 leading-10 text-sm text-stone-500 shrink-0">${item.satuan || ''}</span>
      <button onclick="removePoItem(${i})" class="h-10 px-2 text-red-600 hover:bg-red-50 rounded" title="Hapus">×</button>
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

  if (!siklusList || !siklusList.length) {
    showAlert('Belum ada siklus menu. Buat siklus terlebih dahulu di menu Ahli Gizi > Siklus Menu.');
    return;
  }

  document.getElementById('modal-title').textContent = 'Buat PO dari Siklus Menu';
  document.getElementById('modal-body').innerHTML = `
    <div class="mb-3">
      <label class="text-sm font-medium">Pilih Siklus</label>
      <div class="mt-1 space-y-1 max-h-48 overflow-y-auto border border-stone-200 rounded-lg p-2">
        ${siklusList.map(s => `
          <label class="flex items-center gap-2 cursor-pointer hover:bg-stone-50 p-1.5 rounded">
            <input type="checkbox" class="siklus-check" value="${s.id}">
            <span class="text-sm">${s.nama} — ${s.kategori_penerima || '-'} (${s.jumlah_porsi || 0} porsi)</span>
          </label>
        `).join('')}
      </div>
    </div>
    <div id="po-preview"></div>`;

  const saveBtn = document.getElementById('modal-save');
  saveBtn.textContent = 'Generate Draft';
  saveBtn.style.display = 'inline-block';
  saveBtn.onclick = generatePOFromSiklus;

  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}

async function generatePOFromSiklus() {
  const checked = document.querySelectorAll('.siklus-check:checked');
  const ids = Array.from(checked).map(cb => parseInt(cb.value));
  if (!ids.length) { showAlert('Pilih minimal satu siklus'); return; }

  const preview = document.getElementById('po-preview');
  preview.innerHTML = '<div class="text-center py-4 text-stone-500">⏳ Menghitung kebutuhan bahan...</div>';

  try {
    const result = await api.post('/purchase_order/generate-from-siklus', { siklus_ids: ids });

    if (!result.items || !result.items.length) {
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

    preview.innerHTML = `
      <div class="border border-stone-200 rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-stone-50">
            <tr>
              <th class="text-left px-3 py-2 text-xs font-semibold">Bahan</th>
              <th class="text-right px-3 py-2 text-xs font-semibold">Total</th>
              <th class="text-right px-3 py-2 text-xs font-semibold">+Buffer 10%</th>
              <th class="text-right px-3 py-2 text-xs font-semibold">Harga</th>
              <th class="text-right px-3 py-2 text-xs font-semibold">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${result.items.map(i => {
              const kodeNum = i.kode ? (i.kode.match(/EXT[-\s]?(\d+)/i)?.[1] || i.kode) : '';
              return `<tr class="border-t border-stone-100">
                <td class="px-3 py-2">${kodeNum ? '[' + kodeNum + '] ' : ''}${i.bahan_nama}</td>
                <td class="px-3 py-2 text-right mono">${i.total_qty} ${i.satuan}</td>
                <td class="px-3 py-2 text-right mono">${i.buffer_10} ${i.satuan}</td>
                <td class="px-3 py-2 text-right mono">${fmtIDR(i.harga_satuan)}</td>
                <td class="px-3 py-2 text-right mono">${fmtIDR(i.estimated_subtotal)}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot class="bg-stone-50 border-t border-stone-200">
            <tr><td colspan="4" class="px-3 py-2 text-right font-semibold">Total Estimasi</td>
              <td class="px-3 py-2 text-right font-semibold mono">${fmtIDR(result.total_estimated)}</td></tr>
          </tfoot>
        </table>
      </div>
      <div class="mt-3 flex gap-2">
        <select id="po-supplier" class="flex-1 h-10 px-3 border border-stone-200 rounded-md text-sm">
          <option value="">— Pilih Supplier —</option>
          ${siklusSupplierList.map(s => `<option value="${s.nama}" data-id="${s.id}">${s.nama}</option>`).join('')}
        </select>
        <input id="po-unit_dapur-siklus" placeholder="Unit Dapur" class="flex-1 h-10 px-3 border border-stone-200 rounded-md text-sm">
      </div>
      <button id="confirm-create-po" class="mt-2 bg-[#1e40af] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-md text-sm font-medium">Konfirmasi & Buat PO</button>`;

    document.getElementById('modal-save').style.display = 'none';
    document.getElementById('confirm-create-po').onclick = async () => {
      const supplierEl = document.getElementById('po-supplier');
      const supplierNama = supplierEl.value;
      const supplierId = supplierEl.selectedIndex > 0 ? (supplierEl.options[supplierEl.selectedIndex]?.dataset?.id || null) : null;
      const unitDapur = document.getElementById('po-unit_dapur-siklus')?.value?.trim() || '';
      const tgl = new Date().toISOString().slice(0, 10);
      const nomor = 'PO-' + tgl.replace(/-/g, '') + '-' + Date.now().toString().slice(-4);
      const items = result.items.map(i => ({
        bahan_baku_id: i.bahan_baku_id,
        id_koperasi: i.id_koperasi,
        kode: i.kode || '',
        nama: i.bahan_nama,
        qty: i.buffer_10,
        satuan: i.satuan,
        harga: i.harga_satuan,
        subtotal: i.estimated_subtotal,
      }));

      try {
        await api.post('/purchase_order', {
          no_po: nomor, tanggal: tgl,
          supplier_id: supplierId, supplier_nama: supplierNama,
          unit_dapur: unitDapur,
          item: JSON.stringify(items), total_nilai: result.total_estimated,
          status: 'Draft', catatan: 'Dibuat dari siklus: ' + result.siklus_refs.join(', '),
        });
        closeModal();
        renderPembelian();
        showToast('PO berhasil dibuat');
      } catch (e) {
        showAlert('Gagal membuat PO: ' + (e.message || 'Terjadi kesalahan'));
      }
    };
  } catch (e) {
    preview.innerHTML = `<div class="text-red-700 bg-red-50 p-3 rounded text-sm">Gagal: ${e.message || 'Terjadi kesalahan'}</div>`;
  }
}
