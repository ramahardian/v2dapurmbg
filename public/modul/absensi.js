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
      const karyawanData = await api.get('/karyawan?status=Aktif');
      const list = Array.isArray(karyawanData) ? karyawanData : [];
      const opts = '<option value="">Semua Karyawan</option>' +
        list.map(k => `<option value="${k.id}">${k.nama} - ${k.jabatan_nama || '-'}</option>`).join('');
      const absFilter = document.getElementById('abs-filter-karyawan');
      if (absFilter) absFilter.innerHTML = opts;
      const absForm = document.getElementById('absensi-karyawan');
      if (absForm) absForm.innerHTML = '<option value="">— Pilih —</option>' +
        list.map(k => `<option value="${k.id}">${k.nama} - ${k.jabatan_nama || '-'}</option>`).join('');
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
  } catch (err) {
    console.error('Absensi error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat absensi: ${err.message}</div>`;
  }
}

// ===== Payroll =====
