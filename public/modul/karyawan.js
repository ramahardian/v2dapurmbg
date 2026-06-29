async function renderKaryawan() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/karyawan', { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Gagal memuat karyawan');
    }
    c.innerHTML = await r.text();
    document.getElementById('add-karyawan-btn').onclick = () => openKaryawanForm(null);
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
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat karyawan: ${err.message}</div>`;
  }
}

// ===== Absensi =====
