async function renderShift() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/shift', { credentials: 'include' });
    if (!r.ok) { const err = await r.json(); throw new Error(err.error || 'Gagal memuat shift'); }
    c.innerHTML = await r.text();
    attachShiftHandlers();
    reloadJadwal();
  } catch (err) {
    console.error('Shift error:', err);
    c.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat shift: ' + err.message + '</div>';
  }
}

function attachShiftHandlers() {
  document.getElementById('add-shift-btn').onclick = function() { openShiftForm(null); };
  document.getElementById('add-jadwal-btn').onclick = function() { openJadwalForm(null); };
  var filterDept = document.getElementById('shift-filter-departemen');
  if (filterDept) filterDept.onchange = function() { filterShiftTable(this.value); };
}

function filterShiftTable(dept) {
  document.querySelectorAll('#shift-table-body tr').forEach(function(tr) {
    var td = tr.querySelector('td:first-child span');
    if (!td) return;
    tr.style.display = (!dept || td.textContent.trim() === dept) ? '' : 'none';
  });
}

async function openShiftForm(editing) {
  var jabatanList = await api.get('/jabatan');
  var s = editing || { nama: '', departemen: '', jam_masuk: '08:00', jam_keluar: '16:00', warna: '#3B82F6' };
  document.getElementById('modal-title').textContent = editing ? 'Edit Shift' : 'Shift Baru';
  document.getElementById('modal-body').innerHTML =
    '<div class="space-y-4">' +
    '<div class="grid grid-cols-2 gap-3">' +
    '<div><label class="text-sm font-medium text-stone-700">Nama Shift *</label><input id="sf-nama" value="' + s.nama + '" placeholder="cth: Shift Pagi" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md" /></div>' +
    '<div><label class="text-sm font-medium text-stone-700">Departemen *</label><select id="sf-dept" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md"><option value="">— Pilih Departemen —</option>' +
    jabatanList.map(function(j) { return '<option value="' + j.name + '" ' + (s.departemen === j.name ? 'selected' : '') + '>' + j.name + '</option>'; }).join('') +
    '</select></div>' +
    '</div>' +
    '<div class="grid grid-cols-2 gap-3">' +
    '<div><label class="text-sm font-medium text-stone-700">Jam Masuk *</label><input id="sf-masuk" type="time" value="' + s.jam_masuk + '" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md" /></div>' +
    '<div><label class="text-sm font-medium text-stone-700">Jam Keluar *</label><input id="sf-keluar" type="time" value="' + s.jam_keluar + '" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md" /></div>' +
    '</div>' +
    '<div><label class="text-sm font-medium text-stone-700">Warna (opsional)</label><div class="flex items-center gap-2 mt-1"><input id="sf-warna" type="color" value="' + s.warna + '" class="h-10 w-14 rounded border border-stone-200 cursor-pointer" /><span class="text-xs text-stone-500">' + s.warna + '</span></div></div>' +
    '</div>';

  document.getElementById('modal-save').onclick = async function() {
    var nama = document.getElementById('sf-nama').value.trim();
    var dept = document.getElementById('sf-dept').value.trim();
    var masuk = document.getElementById('sf-masuk').value;
    var keluar = document.getElementById('sf-keluar').value;
    var warna = document.getElementById('sf-warna').value;
    if (!nama) { showAlert('Nama shift harus diisi', 'warning'); return; }
    if (!dept) { showAlert('Departemen harus diisi', 'warning'); return; }
    if (!masuk || !keluar) { showAlert('Jam masuk dan jam keluar harus diisi', 'warning'); return; }
    try {
      var payload = { nama: nama, departemen: dept, jam_masuk: masuk, jam_keluar: keluar, warna: warna };
      if (editing) await api.put('/shift/' + editing.id, payload);
      else await api.post('/shift', payload);
      closeModal(); renderShift();
    } catch (e) { showAlert('Gagal: ' + (e.message || 'Unknown error'), 'error'); }
  };
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}

window.editShift = async function(id) {
  var list = await api.get('/shift');
  var s = list.find(function(x) { return x.id == id; });
  if (s) openShiftForm(s);
};

window.deleteShift = async function(id) {
  if (!await showConfirm('Hapus shift ini?')) return;
  await api.del('/shift/' + id);
  renderShift();
};

// ===== Jadwal Karyawan =====
var jadwalData = [];

async function reloadJadwal() {
  try {
    jadwalData = await api.get('/jadwal');
    renderJadwalTable(jadwalData);
  } catch (e) {
    var wrap = document.getElementById('jadwal-content');
    if (wrap) wrap.innerHTML = '<div class="text-center py-12 text-red-600">Gagal memuat jadwal</div>';
  }
}

function renderJadwalTable(list) {
  var wrap = document.getElementById('jadwal-content');
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML = '<div class="text-center py-12 text-stone-400"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><div>Belum ada jadwal shift.</div></div>';
    return;
  }
  var HARI = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  var rowsHtml = list.map(function(j) {
    var hariArr = (j.hari_kerja || '1,2,3,4,5,6,7').split(',').map(function(h) { return HARI[parseInt(h)] || ''; }).filter(Boolean);
    var hariLabel = hariArr.length >= 7 ? 'Setiap hari' : (hariArr.length === 5 && hariArr[0] === 'Senin' && hariArr[4] === 'Jumat' ? 'Sen-Jum' : hariArr.slice(0,3).join(',') + (hariArr.length > 3 ? '...' : ''));
    return '<tr class="border-t border-stone-100">' +
      '<td class="px-4 py-3 text-sm font-medium">' + (j.nama_karyawan || '—') + '</td>' +
      '<td class="px-4 py-3 text-sm"><span class="px-2 py-0.5 rounded text-xs font-medium" style="background:' + (j.warna || '#3B82F6') + '20;color:' + (j.warna || '#3B82F6') + '">' + (j.shift_nama || '—') + '</span></td>' +
      '<td class="px-4 py-3 text-sm">' + (j.shift_departemen || '—') + '</td>' +
      '<td class="px-4 py-3 text-sm text-center mono">' + (j.jam_masuk ? j.jam_masuk.slice(0,5) : '—') + ' - ' + (j.jam_keluar ? j.jam_keluar.slice(0,5) : '—') + '</td>' +
      '<td class="px-4 py-3 text-sm text-center">' + (j.tanggal_mulai || '—') + '</td>' +
      '<td class="px-4 py-3 text-sm text-center">' + (j.tanggal_selesai || '—') + '</td>' +
      '<td class="px-4 py-3 text-sm text-center">' + hariLabel + '</td>' +
      '<td class="px-4 py-3 text-sm text-right whitespace-nowrap"><button onclick="editJadwal(' + j.id + ')" class="text-stone-500 hover:text-stone-900 mr-2">Edit</button><button onclick="deleteJadwal(' + j.id + ')" class="text-red-600">Hapus</button></td></tr>';
  }).join('');
  wrap.innerHTML = '<div class="overflow-x-auto"><table class="w-full"><thead class="bg-stone-50"><tr>' +
    '<th class="text-left px-4 py-3 text-xs font-semibold uppercase">Karyawan</th>' +
    '<th class="text-left px-4 py-3 text-xs font-semibold uppercase">Shift</th>' +
    '<th class="text-left px-4 py-3 text-xs font-semibold uppercase">Departemen</th>' +
    '<th class="text-center px-4 py-3 text-xs font-semibold uppercase">Jam</th>' +
    '<th class="text-center px-4 py-3 text-xs font-semibold uppercase">Mulai</th>' +
    '<th class="text-center px-4 py-3 text-xs font-semibold uppercase">Selesai</th>' +
    '<th class="text-center px-4 py-3 text-xs font-semibold uppercase">Hari</th>' +
    '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">Aksi</th></tr></thead><tbody>' +
    rowsHtml + '</tbody></table></div>';
}

async function openJadwalForm(editing) {
  var shiftList = await api.get('/shift');
  var karyawanList = await api.get('/karyawan?status=Aktif');
  var j = editing || { karyawan_id: '', shift_id: '', tanggal_mulai: new Date().toISOString().slice(0,10), tanggal_selesai: '', hari_kerja: '1,2,3,4,5,6,7' };
  document.getElementById('modal-title').textContent = editing ? 'Edit Jadwal Shift' : 'Atur Jadwal Shift';
  document.getElementById('modal-body').innerHTML =
    '<div class="space-y-4">' +
    '<div><label class="text-sm font-medium text-stone-700">Karyawan *</label><select id="jd-karyawan" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md"><option value="">— Pilih Karyawan —</option>' +
    karyawanList.map(function(k) { return '<option value="' + k.id + '" ' + (j.karyawan_id == k.id ? 'selected' : '') + '>' + k.nama + ' — ' + (k.jabatan_nama || '-') + '</option>'; }).join('') +
    '</select></div>' +
    '<div><label class="text-sm font-medium text-stone-700">Shift *</label><select id="jd-shift" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md"><option value="">— Pilih Shift —</option>' +
    shiftList.map(function(s) { return '<option value="' + s.id + '" ' + (j.shift_id == s.id ? 'selected' : '') + '>' + s.departemen + ' — ' + s.nama + ' (' + s.jam_masuk.slice(0,5) + '-' + s.jam_keluar.slice(0,5) + ')</option>'; }).join('') +
    '</select></div>' +
    '<div class="grid grid-cols-2 gap-3">' +
    '<div><label class="text-sm font-medium text-stone-700">Tanggal Mulai *</label><input id="jd-mulai" type="date" value="' + j.tanggal_mulai + '" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md" /></div>' +
    '<div><label class="text-sm font-medium text-stone-700">Tanggal Selesai</label><input id="jd-selesai" type="date" value="' + (j.tanggal_selesai || '') + '" class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md" /><div class="text-xs text-stone-400 mt-1">Kosongkan jika tidak ada batas</div></div>' +
    '</div></div>';

  document.getElementById('modal-save').onclick = async function() {
    var karyawan_id = document.getElementById('jd-karyawan').value;
    var shift_id = document.getElementById('jd-shift').value;
    var mulai = document.getElementById('jd-mulai').value;
    var selesai = document.getElementById('jd-selesai').value;
    if (!karyawan_id) { showAlert('Pilih karyawan', 'warning'); return; }
    if (!shift_id) { showAlert('Pilih shift', 'warning'); return; }
    if (!mulai) { showAlert('Tanggal mulai harus diisi', 'warning'); return; }
    try {
      var payload = { karyawan_id: +karyawan_id, shift_id: +shift_id, tanggal_mulai: mulai, tanggal_selesai: selesai || null, hari_kerja: '1,2,3,4,5,6,7' };
      if (editing) await api.put('/jadwal/' + editing.id, payload);
      else await api.post('/jadwal', payload);
      closeModal(); renderShift();
    } catch (e) { showAlert('Gagal: ' + (e.message || 'Unknown error'), 'error'); }
  };
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}

window.editJadwal = async function(id) {
  try {
    var j = await api.get('/jadwal/' + id);
    if (j) openJadwalForm(j);
  } catch(e) { showAlert('Gagal memuat jadwal', 'error'); }
};

window.deleteJadwal = async function(id) {
  if (!await showConfirm('Hapus jadwal ini?')) return;
  await api.del('/jadwal/' + id);
  reloadJadwal();
};

// init() dan preloadMenus() dipindah ke inti.js
