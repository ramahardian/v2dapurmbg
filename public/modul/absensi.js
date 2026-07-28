async function renderAbsensi() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/absensi', { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Gagal memuat absensi');
    }
    c.innerHTML = await r.text();
    try {
      // Filter dropdown: hanya karyawan yang punya data absensi
      const filterData = await api.get('/karyawan?status=Aktif&has_absensi=1');
      const filterList = Array.isArray(filterData) ? filterData : [];
      const filterOpts = '<option value="">Semua Karyawan</option>' +
        filterList.map(k => `<option value="${k.id}">${k.nama} - ${k.jabatan_nama || '-'}</option>`).join('');
      const absFilter = document.getElementById('abs-filter-karyawan');
      if (absFilter) absFilter.innerHTML = filterOpts;

      // Form input: semua karyawan aktif (agar bisa input absensi untuk siapa saja)
      const allData = await api.get('/karyawan?status=Aktif');
      const allList = Array.isArray(allData) ? allData : [];
      const absForm = document.getElementById('absensi-karyawan');
      if (absForm) absForm.innerHTML = '<option value="">— Pilih —</option>' +
        allList.map(k => `<option value="${k.id}">${k.nama} - ${k.jabatan_nama || '-'}</option>`).join('');
      // Set global karyawanOptions agar form edit absensi juga bisa akses
      window.karyawanOptions = allList;
    } catch (e) {
      console.error('Gagal load karyawan:', e);
    }
    const now = new Date();
    const ta = document.getElementById('abs-filter-tanggal-awal');
    const tb = document.getElementById('abs-filter-tanggal-akhir');
    if (ta && tb) {
      if (!ta.value) ta.value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      if (!tb.value) tb.value = now.toISOString().slice(0, 10);
    }
    document.getElementById('absensi-save') && (document.getElementById('absensi-save').onclick = saveAbsensi);
    if (window._absenFilterKaryawanId) {
      const sel = document.getElementById('abs-filter-karyawan');
      if (sel) {
        const check = setInterval(() => {
          if (sel.options.length > 1) {
            sel.value = window._absenFilterKaryawanId;
            clearInterval(check);
            loadAbsensi();
          }
        }, 50);
        setTimeout(() => clearInterval(check), 3000);
      }
      delete window._absenFilterKaryawanId;
    } else {
      loadAbsensi();
    }
    // Add notification bell with badge
    var filterBar = document.querySelector('#content > div:first-child > div');
    if (filterBar && !document.getElementById('abs-notif-badge')) {
      var a = document.createElement('a');
      a.id = 'abs-notif-badge';
      a.href = '/notifikasi';
      a.className = 'relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors';
      a.onclick = function(e) { e.preventDefault(); navigate('notifikasi'); };
      a.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span>Notifikasi</span><span id="abs-notif-count" class="hidden text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">0</span>';
      filterBar.appendChild(a);
    }
    api.get('/notifikasi/belum-dibaca').then(function(res) {
      var count = res && res.count;
      var badge = document.getElementById('abs-notif-count');
      if (badge && count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
      }
    }).catch(function() {});
  } catch (err) {
    console.error('Absensi error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat absensi: ${err.message}</div>`;
  }
}

// ===== Payroll =====
