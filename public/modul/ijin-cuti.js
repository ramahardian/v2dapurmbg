// ===== Ijin/Cuti Karyawan =====
let _cutiPage = 1;
let _cutiTotal = 0;
let _cutiTotalPages = 1;
let _cutiKaryawanList = [];

async function renderIjinCuti() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/ijin-cuti', { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal memuat ijin/cuti');
    }
    c.innerHTML = await r.text();

    // Load karyawan list
    try {
      const karyawanData = await api.get('/karyawan?status=Aktif');
      _cutiKaryawanList = Array.isArray(karyawanData) ? karyawanData : (karyawanData.data || []);
      const opts = '<option value="">Semua Karyawan</option>' +
        _cutiKaryawanList.map(k => `<option value="${k.id}">${k.nama}${k.nik ? ' — '+k.nik : ''}${k.jabatan_nama ? ' ('+k.jabatan_nama+')' : ''}</option>`).join('');
      const filterEl = document.getElementById('cuti-filter-karyawan');
      if (filterEl) filterEl.innerHTML = opts;
      const formEl = document.getElementById('cuti-karyawan');
      if (formEl) formEl.innerHTML = '<option value="">— Pilih Karyawan —</option>' +
        _cutiKaryawanList.map(k => `<option value="${k.id}">${k.nama} — ${k.jabatan_nama || '-'}</option>`).join('');
    } catch (e) {
      console.error('Gagal load karyawan:', e);
    }

    // Wire save button
    const saveBtn = document.getElementById('cuti-save');
    if (saveBtn) saveBtn.onclick = saveIjinCuti;

    // Load data
    _cutiPage = 1;
    await Promise.all([
      loadIjinCuti(),
      loadCutiSummary()
    ]);
  } catch (err) {
    console.error('Ijin/Cuti error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat ijin/cuti: ${err.message}</div>`;
  }
}

async function loadCutiSummary() {
  try {
    const res = await api.get('/ijin-cuti/summary');
    const s = res || {};
    const totalEl = document.getElementById('cuti-stat-total');
    const menungguEl = document.getElementById('cuti-stat-menunggu');
    const disetujuiEl = document.getElementById('cuti-stat-disetujui');
    const ditolakEl = document.getElementById('cuti-stat-ditolak');
    if (totalEl) totalEl.textContent = fmtNum(s.total || 0);
    if (menungguEl) menungguEl.textContent = fmtNum(s.menunggu || 0);
    if (disetujuiEl) disetujuiEl.textContent = fmtNum(s.disetujui || 0);
    if (ditolakEl) ditolakEl.textContent = fmtNum(s.ditolak || 0);
  } catch (e) {
    console.error('Gagal load summary:', e);
  }
}

async function loadIjinCuti() {
  const params = new URLSearchParams();
  const fk = document.getElementById('cuti-filter-karyawan');
  const fta = document.getElementById('cuti-filter-tanggal-awal');
  const ftb = document.getElementById('cuti-filter-tanggal-akhir');
  const fj = document.getElementById('cuti-filter-jenis');
  const fs = document.getElementById('cuti-filter-status');
  if (fk && fk.value) params.set('karyawan_id', fk.value);
  if (fta && fta.value) params.set('tanggal_awal', fta.value);
  if (ftb && ftb.value) params.set('tanggal_akhir', ftb.value);
  if (fj && fj.value) params.set('jenis', fj.value);
  if (fs && fs.value) params.set('status', fs.value);
  params.set('page', _cutiPage);
  params.set('limit', '20');

  try {
    const res = await api.get('/ijin-cuti?' + params);
    const list = res.data || [];
    _cutiTotal = res.total || 0;
    _cutiTotalPages = res.totalPages || 1;
    renderIjinCutiTable(list);
    renderCutiPagination();
  } catch (e) {
    showAlert('Gagal memuat data: ' + e.message, 'error');
  }
}

function renderIjinCutiTable(list) {
  const tb = document.getElementById('cuti-table-body');
  if (!tb) return;

  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="8" class="text-center py-12 text-stone-400">' +
      '<svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
      '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
      '<div>Belum ada data ijin/cuti</div></td></tr>';
    return;
  }

  tb.innerHTML = list.map(c => {
    const durasi = hitungDurasi(c.tanggal_mulai, c.tanggal_selesai);
    const statusBadge = c.status === 'Menunggu' 
      ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Menunggu</span>'
      : c.status === 'Disetujui'
      ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">Disetujui</span>'
      : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Ditolak</span>';

    const jenisBadge = c.jenis === 'Izin'
      ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Izin</span>'
      : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700">Cuti</span>';

    const dokumenLink = c.dokumen && c.jenis === 'Izin'
      ? `<a href="${c.dokumen}" target="_blank" class="text-xs text-blue-600 hover:underline" title="Lihat dokumen">📄</a>`
      : '';

    const alasanDisplay = dokumenLink
      ? `<span title="${c.alasan || ''}">${c.alasan || ''} ${dokumenLink}</span>`
      : `<span class="max-w-[140px] truncate" title="${c.alasan || ''}">${c.alasan || '-'}</span>`;

    const actions = c.status === 'Menunggu'
      ? `<button onclick="approveCuti(${c.id},'Disetujui')" class="text-emerald-600 hover:text-emerald-800 p-1.5 inline-flex items-center" title="Setujui"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></button>
        <button onclick="approveCuti(${c.id},'Ditolak')" class="text-red-600 hover:text-red-800 p-1.5 inline-flex items-center" title="Tolak"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></button>`
      : '';

    return `<tr class="border-t border-stone-100">
      <td class="px-4 py-3 text-sm font-medium">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-full bg-stone-200 flex items-center justify-center text-xs font-bold shrink-0">${getInitials(c.nama_karyawan)}</div>
          <div>
            <div class="font-medium">${c.nama_karyawan}</div>
            <div class="text-[11px] text-stone-400">${c.jabatan_nama || '-'}</div>
          </div>
        </div>
      </td>
      <td class="px-4 py-3 text-sm mono text-stone-500">${c.nik || '-'}</td>
      <td class="px-4 py-3 text-sm text-center">${jenisBadge}</td>
      <td class="px-4 py-3 text-sm whitespace-nowrap">
        <div>${fmtDate(c.tanggal_mulai)}</div>
        ${c.tanggal_selesai && c.tanggal_selesai !== c.tanggal_mulai ? `<div class="text-xs text-stone-400">s.d. ${fmtDate(c.tanggal_selesai)}</div>` : ''}
      </td>
      <td class="px-4 py-3 text-sm mono text-center">${durasi}</td>
      <td class="px-4 py-3 text-sm text-center">${statusBadge}</td>
      <td class="px-4 py-3 text-sm max-w-[180px]">${alasanDisplay}</td>
      <td class="px-4 py-3 text-sm text-right whitespace-nowrap">
        <div class="flex items-center justify-end gap-0.5">
          ${actions}
          <button onclick="editCuti(${c.id})" class="text-stone-500 hover:text-stone-900 p-1.5 inline-flex items-center" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button onclick="deleteCuti(${c.id})" class="text-red-600 hover:text-red-800 p-1.5 inline-flex items-center" title="Hapus"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function hitungDurasi(mulai, selesai) {
  if (!mulai) return '-';
  const t1 = new Date(mulai);
  const t2 = selesai ? new Date(selesai) : new Date(mulai);
  const diff = Math.max(0, Math.round((t2 - t1) / (1000 * 60 * 60 * 24))) + 1;
  return diff + ' hr';
}

function renderCutiPagination() {
  const wrap = document.getElementById('cuti-pagination');
  if (!wrap) return;
  if (_cutiTotalPages <= 1) {
    wrap.innerHTML = `<span class="text-sm text-stone-400">${_cutiTotal} data</span>`;
    return;
  }
  wrap.innerHTML = `
    <span class="text-sm text-stone-500">${_cutiTotal} data — Hal ${_cutiPage} dari ${_cutiTotalPages}</span>
    <div class="flex gap-2">
      ${_cutiPage > 1 ? `<button onclick="cutiGoToPage(${_cutiPage - 1})" class="px-3 py-1 text-sm rounded border border-stone-200 hover:bg-stone-50">Prev</button>` : ''}
      ${_cutiPage < _cutiTotalPages ? `<button onclick="cutiGoToPage(${_cutiPage + 1})" class="px-3 py-1 text-sm rounded border border-stone-200 hover:bg-stone-50">Next</button>` : ''}
    </div>`;
}

function cutiGoToPage(page) {
  _cutiPage = page;
  loadIjinCuti();
}

function toggleDokumenUpload() {
  const jenis = document.getElementById('cuti-jenis')?.value;
  const wrap = document.getElementById('cuti-dokumen-wrap');
  if (!wrap) return;
  if (jenis === 'Izin') {
    wrap.classList.remove('hidden');
  } else {
    wrap.classList.add('hidden');
    // Clear dokumen when switching to Cuti
    document.getElementById('cuti-dokumen').value = '';
    document.getElementById('cuti-dokumen-input').value = '';
    document.getElementById('cuti-dokumen-name').textContent = '';
    document.getElementById('cuti-dokumen-preview').innerHTML = '';
    document.getElementById('cuti-dokumen-hapus')?.classList.add('hidden');
  }
}

function previewDokumenName(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showAlert('Ukuran file maksimal 5MB', 'warning');
    input.value = '';
    return;
  }
  document.getElementById('cuti-dokumen-name').textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
  document.getElementById('cuti-dokumen-hapus')?.classList.remove('hidden');
  
  // Read as base64
  const reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('cuti-dokumen').value = e.target.result;
    // Show preview for images
    if (file.type.startsWith('image/')) {
      document.getElementById('cuti-dokumen-preview').innerHTML = 
        '<a href="' + e.target.result + '" target="_blank" class="text-xs text-blue-600 hover:underline">📄 Lihat preview</a>';
    } else {
      document.getElementById('cuti-dokumen-preview').innerHTML = 
        '<a href="' + e.target.result + '" target="_blank" class="text-xs text-blue-600 hover:underline">📄 Lihat dokumen</a>';
    }
  };
  reader.readAsDataURL(file);
}

function hapusDokumen() {
  document.getElementById('cuti-dokumen').value = '';
  document.getElementById('cuti-dokumen-input').value = '';
  document.getElementById('cuti-dokumen-name').textContent = '';
  document.getElementById('cuti-dokumen-preview').innerHTML = '';
  document.getElementById('cuti-dokumen-hapus')?.classList.add('hidden');
}

function openIjinCutiForm(c) {
  const modal = document.getElementById('cuti-modal');
  if (!modal) return;

  document.getElementById('cuti-id').value = c ? c.id : '';
  document.getElementById('cuti-karyawan').value = c ? c.karyawan_id : '';
  document.getElementById('cuti-tanggal-mulai').value = c ? c.tanggal_mulai.slice(0,10) : new Date().toISOString().slice(0,10);
  document.getElementById('cuti-tanggal-selesai').value = c ? (c.tanggal_selesai ? c.tanggal_selesai.slice(0,10) : '') : '';
  document.getElementById('cuti-jenis').value = c ? c.jenis : 'Izin';
  document.getElementById('cuti-alasan').value = c ? (c.alasan || '') : '';
  document.getElementById('cuti-modal-title').textContent = c ? 'Edit Ijin/Cuti' : 'Input Ijin/Cuti';

  // Dokumen
  if (c && c.dokumen) {
    document.getElementById('cuti-dokumen').value = c.dokumen;
    const isImg = c.dokumen.startsWith('data:image/');
    document.getElementById('cuti-dokumen-name').textContent = isImg ? '📷 Dokumen terupload' : '📄 Dokumen terupload';
    document.getElementById('cuti-dokumen-preview').innerHTML = 
      '<a href="' + c.dokumen + '" target="_blank" class="text-xs text-blue-600 hover:underline">🔍 Lihat dokumen</a>';
    document.getElementById('cuti-dokumen-hapus')?.classList.remove('hidden');
  } else {
    document.getElementById('cuti-dokumen').value = '';
    document.getElementById('cuti-dokumen-name').textContent = '';
    document.getElementById('cuti-dokumen-preview').innerHTML = '';
    document.getElementById('cuti-dokumen-hapus')?.classList.add('hidden');
  }

  // Toggle dokumen visibility based on jenis
  toggleDokumenUpload();

  // Ensure karyawan dropdown populated
  const sel = document.getElementById('cuti-karyawan');
  if (sel && sel.options.length <= 1 && _cutiKaryawanList.length) {
    sel.innerHTML = '<option value="">— Pilih Karyawan —</option>' +
      _cutiKaryawanList.map(k => `<option value="${k.id}">${k.nama} — ${k.jabatan_nama || '-'}</option>`).join('');
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeCutiModal() {
  const modal = document.getElementById('cuti-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function saveIjinCuti() {
  const id = document.getElementById('cuti-id').value;
  const payload = {
    karyawan_id: +(document.getElementById('cuti-karyawan').value || 0),
    tanggal_mulai: document.getElementById('cuti-tanggal-mulai').value,
    tanggal_selesai: document.getElementById('cuti-tanggal-selesai').value || null,
    jenis: document.getElementById('cuti-jenis').value,
    alasan: document.getElementById('cuti-alasan').value,
    dokumen: document.getElementById('cuti-dokumen').value || null,
  };

  if (!validateForm([
    { id: 'cuti-karyawan', label: 'Karyawan', type: 'select' },
    { id: 'cuti-tanggal-mulai', label: 'Tanggal Mulai' }
  ])) return;

  try {
    if (id) {
      await api.put('/ijin-cuti/' + id, payload);
      showToast('Ijin/cuti berhasil diupdate', 'success');
    } else {
      await api.post('/ijin-cuti', payload);
      showToast('Ijin/cuti berhasil ditambahkan', 'success');
    }
    closeCutiModal();
    _cutiPage = 1;
    await Promise.all([loadIjinCuti(), loadCutiSummary()]);
  } catch (e) {
    showAlert('Gagal menyimpan: ' + e.message, 'error');
  }
}

async function editCuti(id) {
  try {
    const item = await api.get('/ijin-cuti/' + id);
    openIjinCutiForm(item);
  } catch (e) {
    showAlert('Gagal mengambil data: ' + e.message, 'error');
  }
}

async function deleteCuti(id) {
  if (!await showConfirm('Hapus data ijin/cuti ini?')) return;
  try {
    await api.del('/ijin-cuti/' + id);
    showToast('Data berhasil dihapus', 'success');
    await Promise.all([loadIjinCuti(), loadCutiSummary()]);
  } catch (e) {
    showAlert('Gagal menghapus: ' + e.message, 'error');
  }
}

async function approveCuti(id, status) {
  const action = status === 'Disetujui' ? 'Setujui' : 'Tolak';
  if (!await showConfirm(`${action} pengajuan ijin/cuti ini?`)) return;
  try {
    await api.put('/ijin-cuti/' + id, { status });
    showToast(`Pengajuan berhasil ${status.toLowerCase()}`, 'success');
    await Promise.all([loadIjinCuti(), loadCutiSummary()]);
  } catch (e) {
    showAlert('Gagal: ' + e.message, 'error');
  }
}
