async function renderKaryawan() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="animate-pulse space-y-3 p-4 sm:p-6"><div class="h-8 bg-stone-200 rounded w-1/3"></div><div class="h-4 bg-stone-100 rounded w-full"></div><div class="h-4 bg-stone-100 rounded w-5/6"></div><div class="h-4 bg-stone-100 rounded w-4/5"></div><div class="h-4 bg-stone-100 rounded w-3/4"></div><div class="h-4 bg-stone-100 rounded w-11/12"></div><div class="h-4 bg-stone-100 rounded w-2/3"></div></div>';
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
