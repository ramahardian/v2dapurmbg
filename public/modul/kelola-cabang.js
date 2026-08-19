let cabangEditingId = null;

async function renderKelolaCabang() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/auth/branches', { credentials: 'include' });
    if (!r.ok) throw new Error((await r.json()).error || 'Gagal memuat');
    const rows = await r.json();
    c.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p class="text-sm text-stone-500">Halaman ini hanya untuk admin <b>Dapur 001 / Sppg Sukaluyu Tamansari</b> (tenant utama).</p>
            <p class="text-sm text-stone-500">Cabang baru dibuat dengan data <b>kosong</b> — tabel akuntansi &amp; gizi diisi oleh admin cabang masing-masing.</p>
          </div>
          <a href="/signup" class="inline-flex items-center gap-2 bg-[#1e40af] hover:bg-[#1d4ed8] text-white px-4 py-2.5 rounded-lg text-sm font-medium">+ Tambah Cabang</a>
        </div>
        <div class="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-stone-50 border-b border-stone-200 text-left">
                <th class="px-4 py-3 font-semibold text-stone-600">Nama Dapur</th>
                <th class="px-4 py-3 font-semibold text-stone-600">Alamat</th>
                <th class="px-4 py-3 font-semibold text-stone-600">Admin</th>
                <th class="px-4 py-3 font-semibold text-stone-600">Status</th>
                <th class="px-4 py-3 font-semibold text-stone-600 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody id="cabang-tbody">
              ${rows.map(r => `
                <tr class="border-t border-stone-100">
                  <td class="px-4 py-3 text-sm">${escHtml(r.nama)}${r.id === 1 ? ' <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Utama</span>' : ''}</td>
                  <td class="px-4 py-3 text-sm text-stone-500">${escHtml(r.alamat || '-')}</td>
                  <td class="px-4 py-3 text-sm text-stone-500">${escHtml(r.admin_email || '-')}</td>
                  <td class="px-4 py-3 text-sm"><span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${r.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}">${r.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td class="px-4 py-3 text-sm text-right whitespace-nowrap">
                    <button onclick="openEditCabang(${r.id}, this)" class="text-blue-600 hover:text-blue-800 text-xs font-medium mr-3">Edit</button>
                    <button onclick="toggleCabang(${r.id}, ${r.is_active ? 0 : 1}, this)" class="text-xs font-medium mr-3 ${r.is_active ? 'text-amber-600 hover:text-amber-800' : 'text-emerald-600 hover:text-emerald-800'}">${r.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    ${r.id !== 1 ? `<button onclick="hapusCabang(${r.id}, this)" class="text-red-600 hover:text-red-800 text-xs font-medium">Hapus</button>` : ''}
                  </td>
                </tr>`).join('') || '<tr><td colspan="5" class="text-center py-12 text-stone-400">Belum ada cabang</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div id="edit-cabang-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40" onclick="closeEditCabang()"></div>
        <div class="relative bg-white rounded-xl shadow-lg w-full max-w-md p-6">
          <h3 class="text-lg font-bold mb-4">Edit Cabang</h3>
          <div class="space-y-3">
            <div><label class="text-sm text-stone-700">Nama Dapur / Unit</label>
              <input id="cb-nama" required class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md" /></div>
            <div><label class="text-sm text-stone-700">Alamat</label>
              <input id="cb-alamat" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md" /></div>
            <div><label class="text-sm text-stone-700">Telepon</label>
              <input id="cb-telepon" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md" /></div>
          </div>
          <div class="mt-5 flex justify-end gap-2">
            <button onclick="closeEditCabang()" class="px-4 py-2 text-sm border border-stone-200 rounded-md hover:bg-stone-50">Batal</button>
            <button onclick="simpanCabang()" class="px-4 py-2 text-sm bg-[#1e40af] hover:bg-[#1d4ed8] text-white rounded-md">Simpan</button>
          </div>
        </div>
      </div>`;
  } catch (err) {
    c.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat: ' + err.message + '</div>';
  }
}

function openEditCabang(id, btn) {
  const row = btn.closest('tr');
  const cells = row.querySelectorAll('td');
  cabangEditingId = id;
  document.getElementById('cb-nama').value = cells[0].textContent.trim().replace(/Utama\s*$/, '').trim();
  document.getElementById('cb-alamat').value = cells[1].textContent.trim() === '-' ? '' : cells[1].textContent.trim();
  const modal = document.getElementById('edit-cabang-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeEditCabang() {
  const modal = document.getElementById('edit-cabang-modal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

async function simpanCabang() {
  const nama = document.getElementById('cb-nama').value.trim();
  if (!nama) return showAlert('Nama wajib diisi', 'warning');
  try {
    await api.put('/auth/branches/' + cabangEditingId, {
      nama,
      alamat: document.getElementById('cb-alamat').value.trim(),
      telepon: document.getElementById('cb-telepon').value.trim()
    });
    showToast('Cabang diperbarui', 'success');
    closeEditCabang();
    renderKelolaCabang();
  } catch (e) {
    showAlert(e.message || 'Gagal simpan cabang', 'error');
  }
}

async function toggleCabang(id, aktif, btn) {
  if (!await showConfirm(aktif ? 'Aktifkan cabang ini?' : 'Nonaktifkan cabang ini? Admin cabang tidak bisa login saat nonaktif.')) return;
  try {
    await api.put('/auth/branches/' + id, { is_active: aktif });
    showToast('Status cabang diperbarui', 'success');
    renderKelolaCabang();
  } catch (e) {
    showAlert(e.message || 'Gagal ubah status', 'error');
  }
}

async function hapusCabang(id, btn) {
  const nama = btn.closest('tr').querySelector('td').textContent.trim();
  if (!await showConfirm(`Hapus cabang "${nama}"? SEMUA data cabang (akuntansi, gizi, SDM, dll) akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`)) return;
  try {
    await api.del('/auth/branches/' + id);
    showToast('Cabang dihapus', 'success');
    renderKelolaCabang();
  } catch (e) {
    showAlert(e.message || 'Gagal hapus cabang', 'error');
  }
}
