async function renderKaryawan() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="dash-card-item flex items-center justify-center py-12"><svg class="animate-spin h-9 w-9 text-[#14326b]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/karyawan', { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Gagal memuat karyawan');
    }
    c.innerHTML = await r.text();
    document.getElementById('add-karyawan-btn') && (document.getElementById('add-karyawan-btn').onclick = () => openKaryawanForm(null));
    document.getElementById('karyawan-save') && (document.getElementById('karyawan-save').onclick = saveKaryawan);
    const searchInput = document.getElementById('karyawan-search-input');
    if (searchInput) {
      let debounceTimer;
      searchInput.oninput = function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          karyawanState.search = this.value;
          karyawanState.page = 1;
          loadKaryawan();
        }, 300);
      };
    }
    try { await loadKaryawan(); } catch (e) { console.error('Karyawan data error:', e); }
  } catch (err) {
    console.error('Karyawan error:', err);
    c.innerHTML = '<div class="dash-card-item"><div class="dash-panel bg-white border border-red-200 text-red-700 p-4 rounded-lg shadow-sm">Gagal memuat karyawan: ' + err.message + '</div></div>';
  }
}

// Export seluruh data karyawan (mengikuti kata kunci pencarian) ke file XLSX.
async function exportKaryawanXlsx() {
  try {
    const search = (typeof karyawanState !== 'undefined' && karyawanState.search) || '';
    const res = await api.get('/karyawan' + (search ? '?search=' + encodeURIComponent(search) : ''));
    const rows = Array.isArray(res) ? res : (res.data || []);
    if (!rows.length) {
      showAlert('Tidak ada data karyawan untuk diexport', 'warning');
      return;
    }

    const headers = ['Nama', 'NIK', 'Jabatan', 'Departemen', 'Gaji Pokok', 'Status', 'Tanggal Masuk', 'Email', 'Telepon', 'Alamat'];
    const data = rows.map(k => [
      k.nama || '',
      k.nik || '',
      k.jabatan_nama || k.jabatan || '',
      k.departemen || '',
      Number(k.gaji_pokok || 0),
      k.status || '',
      k.tanggal_masuk ? String(k.tanggal_masuk).slice(0, 10) : '',
      k.email || '',
      k.phone || '',
      k.address || ''
    ]);
    data.unshift(headers);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 28 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 14 },
      { wch: 10 }, { wch: 14 }, { wch: 26 }, { wch: 16 }, { wch: 36 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Karyawan');

    const now = new Date();
    const stamp = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
    XLSX.writeFile(wb, 'data-karyawan-' + stamp + '.xlsx');
    showToast(rows.length + ' data karyawan berhasil diexport', 'success');
  } catch (e) {
    console.error('exportKaryawanXlsx error:', e);
    showAlert('Gagal export karyawan: ' + (e.message || 'Unknown error'), 'error');
  }
}

// ===== Absensi =====
