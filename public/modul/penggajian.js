async function renderPayroll() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/payroll', { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Gagal memuat payroll');
    }
    c.innerHTML = await r.text();
    await loadKaryawanOptions();
    document.getElementById('payroll-save') && (document.getElementById('payroll-save').onclick = savePayroll);
    loadPayroll();
  } catch (err) {
    console.error('Payroll error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat payroll: ${err.message}</div>`;
  }
}

// ===== Karyawan Helpers =====
let karyawanData = [];
let karyawanState = { page: 1, limit: 10, search: '', total: 0, totalPages: 1 };

async function loadKaryawan() {
  try {
    const params = new URLSearchParams({ page: karyawanState.page, limit: karyawanState.limit, search: karyawanState.search });
    const results = await Promise.allSettled([
      api.get('/karyawan?' + params),
      api.get('/departemen'),
      api.get('/jabatan')
    ]);
    const failed = results.find(r => r.status === 'rejected');
    if (failed) throw failed.reason;
    const res = results[0].value;
    const data = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
    const pagination = res.pagination || { total: data.length, totalPages: 1, page: 1 };
    karyawanState = { ...karyawanState, total: pagination.total, totalPages: pagination.totalPages, page: pagination.page };
    karyawanData = data;
    renderKaryawanTable(data);
    renderKaryawanPagination();
    const depts = results[1].value;
    const dd = document.getElementById('karyawan-departemen');
    if (dd) dd.innerHTML = '<option value="">— Pilih Departemen —</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');
    const jabatanList = results[2].value;
    const jl = document.getElementById('karyawan-jabatan');
    if (jl) jl.innerHTML = '<option value="">— Pilih Jabatan —</option>' + jabatanList.map(j => `<option value="${j.id}">${j.name}</option>`).join('');
  } catch (e) {
    console.error('loadKaryawan error:', e);
    const tb = document.querySelector('#karyawan-modal')?.parentElement?.querySelector('tbody');
    if (tb) tb.innerHTML = `<tr><td colspan="7" class="text-center py-12 text-red-600">Gagal memuat karyawan: ${e.message}</td></tr>`;
  }
}
function renderKaryawanTable(list) {
  const tb = document.querySelector('#karyawan-modal').parentElement.querySelector('tbody');
  if (!list.length) { tb.innerHTML = '<tr><td colspan="7" class="text-center py-12 text-stone-400"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg><div>Belum ada karyawan</div></td></tr>'; return; }
  tb.innerHTML = list.map(k => `
    <tr class="border-t border-stone-100">
      <td class="px-4 py-3 text-sm font-medium"><a href="/karyawan?id=${k.id}" onclick="event.preventDefault();navigate('karyawan?id=${k.id}')" class="text-[#1e40af] hover:underline">${k.nama}</a></td>
      <td class="px-4 py-3 text-sm">${k.nik || '-'}</td>
      <td class="px-4 py-3 text-sm">${k.jabatan_nama || '-'}</td>
      <td class="px-4 py-3 text-sm">${k.departemen || '-'}</td>
      <td class="px-4 py-3 text-sm text-right mono">${fmtIDR(k.gaji_pokok)}</td>
      <td class="px-4 py-3 text-sm">${k.status}</td>
      <td class="px-4 py-3 text-sm text-right whitespace-nowrap">
        <button onclick="openKaryawanForm(karyawanData.find(x => x.id == ${k.id}))" class="text-stone-500 hover:text-stone-900 mr-2" title="Edit"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button onclick="deleteKaryawan(${k.id})" class="text-red-600 hover:text-red-800" title="Hapus"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </td>
    </tr>`).join('');
}

async function deleteKaryawan(id) {
  if (!await showConfirm('Hapus karyawan?')) return;
  await api.del('/karyawan/' + id);
  loadKaryawan();
}

function lihatAbsensiKaryawan(id) {
  window._absenFilterKaryawanId = id;
  navigate('absensi');
}

async function showKaryawanDetail(id) {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch(`/api/template/karyawan/${id}`, { credentials: 'include' });
    if (!r.ok) throw new Error((await r.json()).error || 'Gagal memuat detail');
    c.innerHTML = await r.text();
    document.getElementById('karyawan-save') && (document.getElementById('karyawan-save').onclick = saveKaryawan);
  } catch (e) {
    c.innerHTML = `<div class="text-center py-24 text-stone-400"><svg class="w-20 h-20 mx-auto mb-4 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg><div class="text-lg font-medium">Karyawan tidak ditemukan</div><button onclick="navigate('karyawan')" class="mt-4 text-sm text-[#1e40af] hover:underline">&larr; Kembali ke daftar</button></div>`;
  }
}

function renderKaryawanPagination() {
  const wrap = document.getElementById('karyawan-pagination');
  if (!wrap) return;
  if (karyawanState.totalPages <= 1) { wrap.innerHTML = ''; return; }
  const prevBtn = karyawanState.page > 1 ? `<button onclick="kryGoToPage(${karyawanState.page - 1})" class="px-2 py-1 text-sm rounded border border-stone-200 hover:bg-stone-50">Prev</button>` : '';
  const nextBtn = karyawanState.page < karyawanState.totalPages ? `<button onclick="kryGoToPage(${karyawanState.page + 1})" class="px-2 py-1 text-sm rounded border border-stone-200 hover:bg-stone-50">Next</button>` : '';
  wrap.innerHTML = `<span class="text-sm text-stone-500">Hal ${karyawanState.page} dari ${karyawanState.totalPages}</span>
    <div class="flex gap-2">${prevBtn}${nextBtn}</div>`;
}
function kryGoToPage(p) {
  karyawanState.page = p;
  loadKaryawan();
}
function openKaryawanForm(k) {
  document.getElementById('karyawan-id').value = k ? k.id : '';
  document.getElementById('karyawan-nama').value = k ? k.nama : '';
  document.getElementById('karyawan-nik').value = k ? k.nik || '' : '';
  document.getElementById('karyawan-jabatan').value = k ? k.jabatan_id || '' : '';
  document.getElementById('karyawan-departemen').value = k ? k.departemen || '' : '';
  document.getElementById('karyawan-gaji').value = k ? k.gaji_pokok : '';
  document.getElementById('karyawan-status').value = k ? k.status : 'Aktif';
  document.getElementById('karyawan-masuk').value = k ? k.tanggal_masuk || '' : '';
  document.getElementById('karyawan-email').value = k ? k.email || '' : '';
  document.getElementById('karyawan-telepon').value = k ? k.phone || '' : '';
  document.getElementById('karyawan-alamat').value = k ? k.address || '' : '';
  document.getElementById('karyawan-modal-title').textContent = k ? 'Edit Karyawan' : 'Tambah Karyawan';
  window._karyawanCurrentPhoto = k ? k.photo : null;
  const jl = document.getElementById('karyawan-jabatan');
  if (jl && !jl.options.length) {
    api.get('/jabatan').then(function(list) {
      jl.innerHTML = '<option value="">— Pilih Jabatan —</option>' + list.map(function(j) { return '<option value="' + j.id + '">' + j.name + '</option>'; }).join('');
      if (k && k.jabatan_id) jl.value = k.jabatan_id;
    });
  }
  const dd = document.getElementById('karyawan-departemen');
  if (dd && !dd.options.length) {
    api.get('/departemen').then(function(list) {
      dd.innerHTML = '<option value="">— Pilih Departemen —</option>' + list.map(function(d) { return '<option value="' + d + '">' + d + '</option>'; }).join('');
      if (k && k.departemen) dd.value = k.departemen;
    });
  }
  const preview = document.getElementById('karyawan-photo-preview');
  const photoInput = document.getElementById('karyawan-photo-input');
  const hapusBtn = document.getElementById('karyawan-photo-hapus');
  if (preview) {
    if (k && k.photo) {
      preview.innerHTML = '<img src="' + k.photo + '" class="w-full h-full object-cover" />';
      if (hapusBtn) hapusBtn.classList.remove('hidden');
    } else {
      preview.innerHTML = '<svg class="w-6 h-6 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>';
      if (hapusBtn) hapusBtn.classList.add('hidden');
    }
  }
  if (photoInput) {
    photoInput.onchange = function() {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        if (preview) preview.innerHTML = '<img src="' + e.target.result + '" class="w-full h-full object-cover" />';
        if (hapusBtn) hapusBtn.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    };
  }
  if (hapusBtn) {
    hapusBtn.onclick = function() {
      if (photoInput) photoInput.value = '';
      if (preview) preview.innerHTML = '<svg class="w-6 h-6 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>';
      hapusBtn.classList.add('hidden');
      window._karyawanCurrentPhoto = null;
    };
  }
  document.getElementById('karyawan-modal').classList.remove('hidden');
  document.getElementById('karyawan-modal').classList.add('flex');
}
async function saveKaryawan() {
  let karyawanId = document.getElementById('karyawan-id').value;
  const payload = {
    nama: document.getElementById('karyawan-nama').value,
    nik: document.getElementById('karyawan-nik').value,
    jabatan_id: document.getElementById('karyawan-jabatan').value || null,
    departemen: document.getElementById('karyawan-departemen').value,
    gaji_pokok: +(document.getElementById('karyawan-gaji').value || 0),
    status: document.getElementById('karyawan-status').value,
    tanggal_masuk: document.getElementById('karyawan-masuk').value,
    email: document.getElementById('karyawan-email').value,
    phone: document.getElementById('karyawan-telepon').value,
    address: document.getElementById('karyawan-alamat').value,
  };
  const fileInput = document.getElementById('karyawan-photo-input');
  if (fileInput && fileInput.files.length) {
    payload.photo = await new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.readAsDataURL(fileInput.files[0]);
    });
  } else if (window._karyawanCurrentPhoto === null) {
    payload.photo = null;
  }
  if (!validateForm([{ id: 'karyawan-nama', label: 'Nama Karyawan' }])) return;
  const isEdit = !!karyawanId;
  try {
    if (isEdit) await api.put('/karyawan/' + karyawanId, payload);
    else { const newRow = await api.post('/karyawan', payload); karyawanId = newRow.id; }
  } catch (e) { showAlert('Gagal: ' + (e.message || ''), 'error'); return; }
  document.getElementById('karyawan-modal').classList.add('hidden');
  document.getElementById('karyawan-modal').classList.remove('flex');
  showToast('Karyawan berhasil ' + (isEdit ? 'diperbarui' : 'disimpan'), 'success');
  if (new URLSearchParams(location.search).get('id')) {
    navigate('karyawan?id=' + karyawanId);
  } else {
    loadKaryawan();
  }
}

// ===== Absensi Helpers =====
let karyawanOptions = [];
async function loadKaryawanOptions() {
  try {
    const rows = await api.get('/karyawan?status=Aktif');
    karyawanOptions = Array.isArray(rows) ? rows : [];
    const opts = '<option value="">Semua Karyawan</option>' +
      karyawanOptions.map(k => `<option value="${k.id}">${k.nama} - ${k.jabatan_nama || '-'}</option>`).join('');
    const paySel = document.getElementById('pay-filter-karyawan');
    if (paySel) paySel.innerHTML = opts;
    const absSel = document.getElementById('abs-filter-karyawan');
    if (absSel) absSel.innerHTML = opts;
    const absFormSel = document.getElementById('absensi-karyawan');
    if (absFormSel) absFormSel.innerHTML = '<option value="">— Pilih —</option>' +
      karyawanOptions.map(k => `<option value="${k.id}">${k.nama} - ${k.jabatan_nama || '-'}</option>`).join('');
  } catch (e) {
    console.error('loadKaryawanOptions error:', e);
    karyawanOptions = [];
  }
}
async function loadAbsensi(page = 1) {
  const params = new URLSearchParams();
  const fk = document.getElementById('abs-filter-karyawan').value;
  const fta = document.getElementById('abs-filter-tanggal-awal').value;
  const ftb = document.getElementById('abs-filter-tanggal-akhir').value;
  const fs = document.getElementById('abs-filter-status').value;
  if (fk) params.set('karyawan_id', fk);
  if (fta) params.set('tanggal_awal', fta);
  if (ftb) params.set('tanggal_akhir', ftb);
  if (fs) params.set('status', fs);
  params.set('page', page);
  const res = await api.get('/absensi?' + params);
  renderAbsensiTable(res.data, res);
}
function renderAbsensiTable(list, pagination) {
  const tb = document.querySelector('#absensi-modal').parentElement.querySelector('tbody');
  if (!list.length) { tb.innerHTML = '<tr><td colspan="8" class="text-center py-12 text-stone-400"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><div>Belum ada data absensi</div></td></tr>'; } else {
    tb.innerHTML = list.map(a => `
      <tr class="border-t border-stone-100">
        <td class="px-4 py-3 text-sm whitespace-nowrap">${fmtDate(a.tanggal)}</td>
        <td class="px-4 py-3 text-sm font-medium">${a.nama_karyawan}</td>
        <td class="px-4 py-3 text-sm">${a.jabatan || '-'}</td>
        <td class="px-4 py-3 text-sm text-center">${a.status}</td>
        <td class="px-4 py-3 text-sm text-center mono">${a.jam_masuk || '-'}</td>
        <td class="px-4 py-3 text-sm text-center mono">${a.jam_keluar || '-'}</td>
        <td class="px-4 py-3 text-sm">${a.keterangan || '-'}</td>
        <td class="px-4 py-3 text-sm text-right whitespace-nowrap">
          <button data-id="${a.id}" class="edit-absensi text-stone-500 hover:text-stone-900 mr-2" title="Edit"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button data-id="${a.id}" class="delete-absensi text-red-600 hover:text-red-800" title="Hapus"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </td>
      </tr>`).join('');
    tb.querySelectorAll('.edit-absensi').forEach(b => b.onclick = () => openAbsensiForm(list.find(x => x.id == b.dataset.id)));
    tb.querySelectorAll('.delete-absensi').forEach(b => b.onclick = async () => {
      if (!await showConfirm('Hapus data absensi?')) return;
      await api.del('/absensi/' + b.dataset.id);
      loadAbsensi(pagination?.page || 1);
    });
  }
  const pg = document.getElementById('absensi-pagination');
  if (pg && pagination) {
    pg.innerHTML = `<span>${pagination.total} data</span><div class="flex gap-1">${pagination.totalPages > 1 ? Array.from({ length: pagination.totalPages }, (_, i) => `<button onclick="loadAbsensi(${i + 1})" class="px-3 py-1 rounded ${i + 1 === pagination.page ? 'bg-[#1e40af] text-white' : 'bg-stone-100 hover:bg-stone-200'}">${i + 1}</button>`).join('') : ''}</div>`;
  }
}
function openAbsensiForm(a) {
  document.getElementById('absensi-id').value = a ? a.id : '';
  document.getElementById('absensi-karyawan').value = a ? a.karyawan_id : '';
  document.getElementById('absensi-tanggal').value = a ? a.tanggal : new Date().toISOString().slice(0,10);
  document.getElementById('absensi-status').value = a ? a.status : 'Hadir';
  document.getElementById('absensi-masuk').value = a ? a.jam_masuk || '' : '';
  document.getElementById('absensi-keluar').value = a ? a.jam_keluar || '' : '';
  document.getElementById('absensi-keterangan').value = a ? a.keterangan || '' : '';
  document.getElementById('absensi-modal-title').textContent = a ? 'Edit Absensi' : 'Input Absensi';
  const sel = document.getElementById('absensi-karyawan');
  sel.innerHTML = '<option value="">— Pilih —</option>' +
    (karyawanOptions || []).map(k => `<option value="${k.id}">${k.nama} - ${k.jabatan_nama || '-'}</option>`).join('');
  document.getElementById('absensi-modal').classList.remove('hidden');
  document.getElementById('absensi-modal').classList.add('flex');
}
function saveAbsensi() {
  const id = document.getElementById('absensi-id').value;
  const payload = {
    karyawan_id: +(document.getElementById('absensi-karyawan').value || 0),
    tanggal: document.getElementById('absensi-tanggal').value,
    status: document.getElementById('absensi-status').value,
    jam_masuk: document.getElementById('absensi-masuk').value,
    jam_keluar: document.getElementById('absensi-keluar').value,
    keterangan: document.getElementById('absensi-keterangan').value,
  };
  if (!validateForm([{ id: 'absensi-karyawan', label: 'Karyawan', type: 'select' }, { id: 'absensi-tanggal', label: 'Tanggal' }])) return;
  const isEdit = !!id;
  if (isEdit) {
    api.put('/absensi/' + id, payload).then(() => loadAbsensi());
  } else {
    api.post('/absensi', payload).then(() => loadAbsensi());
  }
  document.getElementById('absensi-modal').classList.add('hidden');
  document.getElementById('absensi-modal').classList.remove('flex');
}

// ===== Payroll Helpers =====
let payrollListGlobal = [];
async function loadPayroll() {
  const params = new URLSearchParams();
  const fk = document.getElementById('pay-filter-karyawan').value;
  const fp = document.getElementById('pay-filter-periode').value;
  const fs = document.getElementById('pay-filter-status').value;
  if (fk) params.set('karyawan_id', fk);
  if (fp) { const [tahun, bulan] = fp.split('-'); params.set('tahun', tahun); params.set('bulan', String(parseInt(bulan))); }
  if (fs) params.set('status', fs);
  payrollListGlobal = await api.get('/payroll?' + params);
  renderPayrollTable(payrollListGlobal);
}
function renderPayrollTable(list) {
  const tb = document.querySelector('#payroll-modal').parentElement.querySelector('tbody');
  if (!list.length) { tb.innerHTML = '<tr><td colspan="9" class="text-center py-12 text-stone-400"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg><div>Belum ada data payroll</div></td></tr>'; return; }
  const BLN = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  tb.innerHTML = list.map(p => `
    <tr class="border-t border-stone-100">
      <td class="px-4 py-3 text-sm whitespace-nowrap">${BLN[p.bulan]} ${p.tahun}</td>
      <td class="px-4 py-3 text-sm font-medium">${p.nama_karyawan}</td>
      <td class="px-4 py-3 text-sm">${p.jabatan || '-'}</td>
      <td class="px-4 py-3 text-sm text-right mono">${fmtIDR(p.gaji_pokok)}</td>
      <td class="px-4 py-3 text-sm text-right mono">${fmtIDR(p.tunjangan)}</td>
      <td class="px-4 py-3 text-sm text-right mono">${fmtIDR(p.potongan)}</td>
      <td class="px-4 py-3 text-sm text-right mono font-medium">${fmtIDR(p.total_gaji)}</td>
      <td class="px-4 py-3 text-sm text-center">${p.status}</td>
      <td class="px-4 py-3 text-sm text-right whitespace-nowrap">
        <button data-id="${p.id}" class="edit-payroll text-stone-500 hover:text-stone-900 mr-2">Edit</button>
        <button data-id="${p.id}" class="text-red-600">Hapus</button>
      </td>
    </tr>`).join('');
  tb.querySelectorAll('.edit-payroll').forEach(b => b.onclick = () => openPayrollForm(payrollListGlobal.find(x => x.id == b.dataset.id)));
  tb.querySelectorAll('.text-red-600').forEach(b => b.onclick = async () => {
    if (!await showConfirm('Hapus data payroll?')) return;
    await api.del('/payroll/' + b.dataset.id);
    loadPayroll();
  });
}
function openPayrollForm(p) {
  document.getElementById('payroll-id').value = p ? p.id : '';
  document.getElementById('payroll-karyawan').value = p ? p.karyawan_id : '';
  const now = new Date();
  const tahun = p ? p.tahun : now.getFullYear();
  const bulan = p ? String(p.bulan).padStart(2, '0') : String(now.getMonth() + 1).padStart(2, '0');
  document.getElementById('payroll-periode').value = tahun + '-' + bulan + '-01';
  document.getElementById('payroll-gaji').value = p ? p.gaji_pokok : '';
  document.getElementById('payroll-tunjangan').value = p ? p.tunjangan : '';
  document.getElementById('payroll-potongan').value = p ? p.potongan : '';
  document.getElementById('payroll-status').value = p ? p.status : 'Draft';
  document.getElementById('payroll-modal-title').textContent = p ? 'Edit Payroll' : 'Tambah Payroll';
  const sel = document.getElementById('payroll-karyawan');
  sel.innerHTML = (karyawanOptions || []).map(k => `<option value="${k.id}">${k.nama} - ${k.jabatan_nama || '-'}</option>`).join('');
  document.getElementById('payroll-modal').classList.remove('hidden');
  document.getElementById('payroll-modal').classList.add('flex');
}
function savePayroll() {
  const id = document.getElementById('payroll-id').value;
  const periode = document.getElementById('payroll-periode').value;
  const [thn, bln] = periode ? periode.split('-') : [];
  const payload = {
    karyawan_id: +(document.getElementById('payroll-karyawan').value || 0),
    bulan: +(bln || 0),
    tahun: +(thn || 0),
    gaji_pokok: +(document.getElementById('payroll-gaji').value || 0),
    tunjangan: +(document.getElementById('payroll-tunjangan').value || 0),
    potongan: +(document.getElementById('payroll-potongan').value || 0),
    status: document.getElementById('payroll-status').value,
  };
  if (!validateForm([{ id: 'payroll-karyawan', label: 'Karyawan', type: 'select' }])) return;
  const isEdit = !!id;
  if (isEdit) {
    api.put('/payroll/' + id, payload).then(() => loadPayroll());
  } else {
    api.post('/payroll', payload).then(() => loadPayroll());
  }
  document.getElementById('payroll-modal').classList.add('hidden');
  document.getElementById('payroll-modal').classList.remove('flex');
}

// ===== Shift — Jadwal Kerja per Divisi =====
