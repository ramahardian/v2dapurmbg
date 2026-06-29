let _poEditing = null;
let _poItems = [];
let _bahanBakuList = [];

async function renderPembelian() {
  const cfg = {
    endpoint: '/purchase_order',
    fields: [
      { k: 'no_po', l: 'Nomor PO', req: true },
      { k: 'tanggal', l: 'Tanggal', type: 'date', req: true },
      { k: 'supplier_nama', l: 'Supplier' },
      { k: 'item', l: 'Daftar Item', type: 'textarea' },
      { k: 'total_nilai', l: 'Total Nilai (IDR)', type: 'number', fmt: 'idr' },
      { k: 'status', l: 'Status', type: 'select', opts: ['Draft','Disetujui','Dikirim','Diterima','Dibayar'] },
      { k: 'catatan', l: 'Catatan', type: 'textarea' },
    ],
    cols: ['no_po', 'tanggal', 'supplier_nama', 'total_nilai', 'status'],
  };

  await renderCrud(cfg);

  document.getElementById('add-btn').onclick = () => openPembelianForm(null);

  const toolbar = document.querySelector('#content > div:first-child');
  if (!toolbar) return;
  const group = document.createElement('div');
  group.className = 'flex gap-2';
  const btn = document.createElement('button');
  btn.id = 'po-from-siklus-btn';
  btn.className = 'bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md text-sm font-medium';
  btn.textContent = '+ Buat dari Siklus';
  btn.onclick = openSiklusPicker;
  const addBtn = document.getElementById('add-btn');
  toolbar.insertBefore(group, toolbar.firstChild);
  group.appendChild(btn);
  if (addBtn) group.appendChild(addBtn);

  const wrap = document.getElementById('table-wrap');
  if (wrap) {
    const obs = new MutationObserver(() => {
      wrap.querySelectorAll('[onclick*="editRow"]').forEach(el => {
        const m = el.getAttribute('onclick').match(/editRow\((.+?), (.+?)\)/);
        if (m) {
          el.removeAttribute('onclick');
          const row = JSON.parse(m[2]);
          el.addEventListener('click', () => openPembelianForm(row));
        }
      });
      wrap.querySelectorAll('[onclick*="deleteRow"]').forEach(el => {
        const m = el.getAttribute('onclick').match(/deleteRow\("(.+?)", (.+?),/);
        if (m) {
          const rowData = window._crudRows?.find(r => r.id === parseInt(m[2]));
          if (!rowData) return;
          const tr = el.closest('tr');
          if (!tr || tr.querySelector('[data-kirim-btn]')) return;
          const action = el.parentNode;
          const kirim = document.createElement('button');
          kirim.className = 'text-emerald-600 hover:text-emerald-800 p-1.5 inline-flex items-center';
          kirim.title = 'Kirim ke Koperasi';
          kirim.dataset.kirimBtn = '1';
          kirim.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4z"/></svg>';
          kirim.addEventListener('click', () => kirimKeKoperasi(rowData));
          action.insertBefore(kirim, el);
        }
      });
    });
    obs.observe(wrap, { childList: true, subtree: true });
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
    supplier_name: po.supplier_nama || '',
    purchase_date: po.tanggal,
    items: items.map(i => ({
      name: i.nama || '',
      qty: Number(i.qty) || 0,
      unit: i.satuan || '',
      price: Number(i.harga || i.subtotal || 0),
    })),
    notes: 'PO: ' + po.no_po + (po.catatan ? ' — ' + po.catatan : ''),
  };

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

async function openPembelianForm(editing) {
  _poEditing = editing;
  try {
    const data = await api.get('/bahan_baku');
    _bahanBakuList = Array.isArray(data) ? data : (data.data || []);
  } catch (e) {
    _bahanBakuList = [];
  }

  const now = new Date();
  const tgl = now.toISOString().slice(0, 10);
  const nomor = 'PO-' + tgl.replace(/-/g, '') + '-' + Date.now().toString().slice(-4);

  let items = [];
  if (editing && editing.item) {
    try { items = JSON.parse(editing.item); } catch { items = []; }
  }

  document.getElementById('modal-title').textContent = editing ? 'Edit Purchase Order' : 'Tambah Purchase Order';

  document.getElementById('modal-body').innerHTML = `
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-sm text-stone-700">Nomor PO <span class="text-red-500">*</span></label>
          <input id="po-no_po" value="${editing ? editing.no_po : nomor}" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md text-sm">
        </div>
        <div>
          <label class="text-sm text-stone-700">Tanggal <span class="text-red-500">*</span></label>
          <input id="po-tanggal" type="date" value="${editing ? editing.tanggal : tgl}" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md text-sm">
        </div>
      </div>
      <div>
        <label class="text-sm text-stone-700">Supplier</label>
        <input id="po-supplier_nama" value="${editing ? (editing.supplier_nama || '') : ''}" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md text-sm">
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
          return `<option value="${b.id}" ${sel}>${b.nama}${isNew ? ' 🆕' : ''}${b.harga_satuan ? ' @ ' + fmtIDR(b.harga_satuan) : ''}</option>`;
        }).join('')}
      </select>
      <input type="number" step="0.001" value="${item.qty || ''}" placeholder="Qty"
        onchange="updatePoItem(${i}, 'qty', this.value)"
        class="w-24 h-10 px-3 border border-stone-200 rounded-md text-sm mono">
      <span class="h-10 leading-10 text-sm text-stone-500 shrink-0">${item.satuan || ''}</span>
      <span class="h-10 leading-10 text-sm text-right mono w-28 shrink-0">${item.subtotal ? fmtIDR(item.subtotal) : ''}</span>
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
  const payload = {
    no_po,
    tanggal,
    supplier_nama: document.getElementById('po-supplier_nama').value.trim(),
    item: JSON.stringify(_poItems.map(i => ({
      bahan_baku_id: i.bahan_baku_id,
      nama: _bahanBakuList.find(b => Number(b.id) === Number(i.bahan_baku_id))?.nama || '',
      qty: Number(i.qty) || 0,
      satuan: i.satuan,
      harga: Number(_bahanBakuList.find(b => Number(b.id) === Number(i.bahan_baku_id))?.harga_satuan || 0),
      subtotal: Number(i.subtotal) || 0,
    }))),
    total_nilai: total,
    status: document.getElementById('po-status').value,
    catatan: document.getElementById('po-catatan').value.trim(),
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
            ${result.items.map(i => `
              <tr class="border-t border-stone-100">
                <td class="px-3 py-2">${i.bahan_nama}</td>
                <td class="px-3 py-2 text-right mono">${i.total_qty} ${i.satuan}</td>
                <td class="px-3 py-2 text-right mono">${i.buffer_10} ${i.satuan}</td>
                <td class="px-3 py-2 text-right mono">${fmtIDR(i.harga_satuan)}</td>
                <td class="px-3 py-2 text-right mono">${fmtIDR(i.estimated_subtotal)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot class="bg-stone-50 border-t border-stone-200">
            <tr><td colspan="4" class="px-3 py-2 text-right font-semibold">Total Estimasi</td>
              <td class="px-3 py-2 text-right font-semibold mono">${fmtIDR(result.total_estimated)}</td></tr>
          </tfoot>
        </table>
      </div>
      <div class="mt-3 flex gap-2">
        <input id="po-supplier" placeholder="Nama Supplier" class="flex-1 h-10 px-3 border border-stone-200 rounded-md text-sm">
      </div>
      <button id="confirm-create-po" class="mt-2 bg-[#1e40af] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-md text-sm font-medium">Konfirmasi & Buat PO</button>`;

    document.getElementById('modal-save').style.display = 'none';
    document.getElementById('confirm-create-po').onclick = async () => {
      const supplier = document.getElementById('po-supplier').value;
      const tgl = new Date().toISOString().slice(0, 10);
      const nomor = 'PO-' + tgl.replace(/-/g, '') + '-' + Date.now().toString().slice(-4);
      const items = result.items.map(i => ({
        nama: i.bahan_nama,
        qty: i.buffer_10,
        satuan: i.satuan,
        harga: i.harga_satuan,
        subtotal: i.estimated_subtotal,
      }));

      try {
        await api.post('/purchase_order', {
          no_po: nomor, tanggal: tgl, supplier_nama: supplier,
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
