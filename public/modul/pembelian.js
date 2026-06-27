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
      const itemText = result.items.map(i =>
        `${i.bahan_nama}: kebutuhan ${i.total_qty} ${i.satuan} (buffer 10%: ${i.buffer_10} ${i.satuan}) @ ${fmtIDR(i.harga_satuan)} = ${fmtIDR(i.estimated_subtotal)}`
      ).join('\n');

      try {
        await api.post('/purchase_order', {
          no_po: nomor, tanggal: tgl, supplier_nama: supplier,
          item: itemText, total_nilai: result.total_estimated,
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
