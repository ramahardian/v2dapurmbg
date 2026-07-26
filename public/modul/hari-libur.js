// ===== Hari Libur =====
async function renderHariLibur() {
  const c = document.getElementById('content');
  c.innerHTML = `
  <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
    <div></div>
    <div class="flex gap-2">
      <button onclick="openHariLiburForm()" class="h-11 px-5 bg-[#1e40af] hover:bg-[#1d4ed8] text-white rounded-xl text-sm font-semibold shadow-sm transition-all flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Tambah Libur
      </button>
    </div>
  </div>
  <div id="hl-content" class="space-y-3"></div>
  <div id="hl-pagination" class="flex items-center justify-between mt-4"></div>`;
  await loadHariLibur();
}

async function loadHariLibur(page) {
  if (!page) page = 1;
  const wrap = document.getElementById('hl-content');
  if (!wrap) return;
  wrap.innerHTML = '<div class="flex items-center justify-center py-16"><svg class="animate-spin h-8 w-8 text-sky-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';

  try {
    const res = await api.get('/hari_libur?page=' + page + '&limit=50');
    const list = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
    const total = res.pagination?.total || list.length;
    const totalPages = res.pagination?.totalPages || 1;

    if (!list.length) {
      wrap.innerHTML = '<div class="py-16 text-center text-stone-400 bg-white rounded-2xl border border-stone-200 shadow-sm"><svg class="w-12 h-12 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="16" r="2"/><path d="M12 14v2l1 1"/></svg><div class="text-sm">Belum ada hari libur</div></div>';
      document.getElementById('hl-pagination').innerHTML = '';
      return;
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    let html = '<div class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden"><div class="overflow-x-auto"><table class="w-full"><thead><tr class="border-b border-stone-100">';
    html += '<th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Tanggal</th>';
    html += '<th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Nama</th>';
    html += '<th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Kategori</th>';
    html += '<th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Hari</th>';
    html += '<th class="text-center px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Status</th>';
    html += '<th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Aksi</th>';
    html += '</tr></thead><tbody>';

    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var tgl = new Date(r.tanggal + 'T00:00:00');
      var hariNama = tgl.toLocaleDateString('id-ID', { weekday: 'long' });
      var tglStr = tgl.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      var isPast = r.tanggal < todayStr;
      var isToday = r.tanggal === todayStr;

      var badgeKategori = '';
      if (r.kategori === 'Nasional') badgeKategori = '<span class="inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-semibold bg-red-100 text-red-700">Nasional</span>';
      else if (r.kategori === 'Mingguan') badgeKategori = '<span class="inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-semibold bg-blue-100 text-blue-700">Mingguan</span>';
      else badgeKategori = '<span class="inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-semibold bg-stone-100 text-stone-600">Perusahaan</span>';

      var statusBadge = isToday
        ? '<span class="inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-semibold bg-emerald-100 text-emerald-700">Hari Ini</span>'
        : isPast
          ? '<span class="inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-semibold bg-stone-100 text-stone-500">Terlewat</span>'
          : '<span class="inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-semibold bg-blue-100 text-blue-700">Akan Datang</span>';

      html += '<tr class="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">';
      html += '<td class="px-4 py-3 text-xs font-medium text-stone-700 whitespace-nowrap">' + tglStr + '</td>';
      html += '<td class="px-4 py-3 text-xs text-stone-700">' + escHtml(r.nama) + '</td>';
      html += '<td class="px-4 py-3 text-xs">' + badgeKategori + '</td>';
      html += '<td class="px-4 py-3 text-xs text-stone-500">' + hariNama + '</td>';
      html += '<td class="px-4 py-3 text-xs text-center">' + statusBadge + '</td>';
      html += '<td class="px-4 py-3 text-xs text-right">';
      html += '<button onclick="hapusHariLibur(' + r.id + ')" class="w-7 h-7 inline-flex items-center justify-center rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-all" title="Hapus"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
      html += '</td></tr>';
    }

    html += '</tbody></table></div></div>';
    wrap.innerHTML = html;

    var pgHtml = '<span class="text-sm text-stone-500">' + total + ' data</span>';
    if (totalPages > 1) {
      pgHtml += '<div class="flex gap-2">';
      if (page > 1) pgHtml += '<button onclick="loadHariLibur(' + (page - 1) + ')" class="px-3 py-1.5 text-sm font-medium rounded-lg border border-stone-200 hover:bg-stone-50 hover:border-stone-300 transition-all">Prev</button>';
      if (page < totalPages) pgHtml += '<button onclick="loadHariLibur(' + (page + 1) + ')" class="px-3 py-1.5 text-sm font-medium rounded-lg border border-stone-200 hover:bg-stone-50 hover:border-stone-300 transition-all">Next</button>';
      pgHtml += '</div>';
    }
    document.getElementById('hl-pagination').innerHTML = pgHtml;
  } catch (err) {
    wrap.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat: ' + err.message + '</div>';
  }
}

function openHariLiburForm(data) {
  var isEdit = data && data.id;
  var modalHtml = `
  <div id="hl-modal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onclick="if(event.target===this)closeHariLiburForm()">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onclick="event.stopPropagation()">
      <div class="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
        <h3 class="font-bold text-base">` + (isEdit ? 'Edit Hari Libur' : 'Tambah Hari Libur') + `</h3>
        <button onclick="closeHariLiburForm()" class="text-stone-400 hover:text-stone-600">&times;</button>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-stone-700 mb-1">Nama Libur <span class="text-red-500">*</span></label>
          <input id="hl-nama" value="` + (isEdit ? escHtml(data.nama) : '') + `" class="w-full h-10 px-3 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400" placeholder="Cth: Hari Raya Idul Fitri">
        </div>
        <div>
          <label class="block text-sm font-medium text-stone-700 mb-1">Tanggal <span class="text-red-500">*</span></label>
          <input id="hl-tanggal" type="date" value="` + (isEdit ? data.tanggal : new Date().toISOString().slice(0, 10)) + `" class="w-full h-10 px-3 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400">
        </div>
        <div>
          <label class="block text-sm font-medium text-stone-700 mb-1">Kategori</label>
          <select id="hl-kategori" class="w-full h-10 px-3 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400">
            <option value="Perusahaan" ` + (isEdit && data.kategori === 'Perusahaan' ? 'selected' : '') + `>Perusahaan</option>
            <option value="Nasional" ` + (isEdit && data.kategori === 'Nasional' ? 'selected' : '') + `>Nasional</option>
            <option value="Mingguan" ` + (isEdit && data.kategori === 'Mingguan' ? 'selected' : '') + `>Mingguan</option>
          </select>
        </div>
        <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01"/><circle cx="12" cy="12" r="10"/></svg>
          Pada tanggal libur, absensi karyawan akan <strong>terkunci</strong> (tidak bisa diisi).
        </div>
      </div>
      <div class="px-6 py-4 border-t border-stone-200 flex justify-end gap-2">
        <button onclick="closeHariLiburForm()" class="px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-lg">Batal</button>
        <button onclick="simpanHariLibur(` + (isEdit ? data.id : 'null') + `)" class="px-4 py-2 text-sm font-medium bg-[#1e40af] hover:bg-[#1d4ed8] text-white rounded-lg">Simpan</button>
      </div>
    </div>
  </div>`;

  var existing = document.getElementById('hl-modal');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeHariLiburForm() {
  var el = document.getElementById('hl-modal');
  if (el) el.remove();
}

async function simpanHariLibur(id) {
  var nama = document.getElementById('hl-nama').value.trim();
  var tanggal = document.getElementById('hl-tanggal').value;
  var kategori = document.getElementById('hl-kategori').value;

  if (!nama) { showAlert('Nama libur wajib diisi', 'error'); return; }
  if (!tanggal) { showAlert('Tanggal wajib diisi', 'error'); return; }

  try {
    if (id) {
      await api.put('/hari_libur/' + id, { nama, tanggal, kategori });
      showToast('Hari libur diperbarui', 'success');
    } else {
      await api.post('/hari_libur', { nama, tanggal, kategori });
      showToast('Hari libur ditambahkan', 'success');
    }
    closeHariLiburForm();
    loadHariLibur();
  } catch (err) {
    showAlert('Gagal: ' + (err.message || err.error || 'Unknown'), 'error');
  }
}

async function hapusHariLibur(id) {
  if (!await showConfirm('Hapus hari libur ini?')) return;
  try {
    await api.del('/hari_libur/' + id);
    showToast('Hari libur dihapus', 'success');
    loadHariLibur();
  } catch (err) {
    showAlert('Gagal: ' + err.message, 'error');
  }
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
