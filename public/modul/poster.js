// ============================================================================
// TEMPLATE POSTER — Pengaturan foto share menu MBG harian (per tenant)
// ============================================================================

var _posterEd = {
  tpl: null,
  logoData: null,
  bgData: null,
  logoRemoved: false,
  bgRemoved: false,
  timer: null,
  previewUrl: null,
  seq: 0,
};

function posterEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function posterDefaultTemplate() {
  return _posterNormalizeTemplate(POSTER_TPL_DEFAULTS);
}

/** Ambil template tenant (di-cache di window._posterTemplate). */
async function posterEnsureTemplate(force) {
  if (!force && window._posterTemplate) return window._posterTemplate;
  try {
    window._posterTemplate = await api.get('/template-poster');
  } catch (e) {
    window._posterTemplate = posterDefaultTemplate();
  }
  return window._posterTemplate;
}

function posterSampleMenu() {
  const d = new Date();
  const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return {
    menu_nama: 'Nasi Putih, Ayam Bakar, Sayur Bening & Buah',
    tanggal: iso,
    kalori: 612,
    protein: 32,
    karbohidrat: 68,
    lemak: 18,
    serat: 6,
    foto: null,
    deskripsi: 'Karbohidrat, lauk, sayur & buah dalam satu porsi\nProtein hewani & nabati untuk tumbuh kembang\nSerat tinggi membantu kesehatan pencernaan\nDiolah higienis sesuai standar gizi MBG',
  };
}

async function renderTemplatePoster() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';

  try {
    const tpl = await posterEnsureTemplate(true);
    _posterEd = {
      tpl: tpl,
      logoData: null,
      bgData: null,
      logoRemoved: false,
      bgRemoved: false,
      timer: null,
      previewUrl: null,
      seq: 0,
    };
    c.innerHTML = posterPageHtml(tpl);
    posterUpdateImageUI();
    posterRefreshPreview();
  } catch (e) {
    c.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat template poster: ' + posterEsc(e.message) + '</div>';
  }
}

function posterPageHtml(tpl) {
  const inputCls = 'mt-1 w-full h-10 px-3 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all';
  const labelCls = 'text-xs font-semibold text-stone-500 uppercase tracking-wide';
  const cardCls = 'bg-white rounded-xl border border-stone-200 p-5';
  const catatanText = (tpl.catatan || []).join('\n');

  return '' +
  '<div class="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">' +
    '<div class="xl:col-span-3 space-y-4">' +

      // Info
      '<div class="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-800">' +
        '<svg class="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>' +
        '<div>Template ini otomatis dipakai tombol <b>Bagikan menu</b> di Dashboard. Perubahan langsung berlaku untuk semua user di dapur ini setelah disimpan.</div>' +
      '</div>' +

      // Identitas
      '<div class="' + cardCls + '">' +
        '<div class="flex items-center gap-2 mb-4">' +
          '<span class="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg></span>' +
          '<h3 class="text-sm font-bold text-stone-800">Identitas &amp; Teks</h3>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
          '<div class="sm:col-span-2"><label class="' + labelCls + '">Judul Poster</label>' +
            '<input id="pt-judul" maxlength="120" value="' + posterEsc(tpl.judul) + '" oninput="posterSchedulePreview()" class="' + inputCls + '" /></div>' +
          '<div class="sm:col-span-2"><label class="' + labelCls + '">Tagline (kanan atas)</label>' +
            '<input id="pt-tagline" maxlength="180" value="' + posterEsc(tpl.tagline) + '" oninput="posterSchedulePreview()" class="' + inputCls + '" placeholder="Kosongkan bila tidak ingin tagline" /></div>' +
          '<div><label class="' + labelCls + '">Badge 1</label>' +
            '<input id="pt-badge1" maxlength="80" value="' + posterEsc(tpl.badge1) + '" oninput="posterSchedulePreview()" class="' + inputCls + '" /></div>' +
          '<div><label class="' + labelCls + '">Badge 2</label>' +
            '<input id="pt-badge2" maxlength="80" value="' + posterEsc(tpl.badge2) + '" oninput="posterSchedulePreview()" class="' + inputCls + '" /></div>' +
          '<div class="sm:col-span-2"><label class="' + labelCls + '">Teks Footer</label>' +
            '<input id="pt-footer" maxlength="200" value="' + posterEsc(tpl.footer_text) + '" oninput="posterSchedulePreview()" class="' + inputCls + '" placeholder="Kosongkan untuk memakai nama dapur" /></div>' +
        '</div>' +
      '</div>' +

      // Warna
      '<div class="' + cardCls + '">' +
        '<div class="flex items-center justify-between gap-3 mb-4 flex-wrap">' +
          '<div class="flex items-center gap-2">' +
            '<span class="w-7 h-7 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 2a7 7 0 0 0 0 14h2a3 3 0 0 1 0 6"/></svg></span>' +
            '<h3 class="text-sm font-bold text-stone-800">Warna Tema</h3>' +
          '</div>' +
          '<div class="flex items-center gap-1.5">' +
            '<button type="button" onclick="posterApplyPreset(\'#14532D\',\'#F97316\')" class="w-7 h-7 rounded-full border-2 border-white shadow ring-1 ring-stone-200" style="background:#14532D" title="Hijau & Oranye"></button>' +
            '<button type="button" onclick="posterApplyPreset(\'#1E3A8A\',\'#F59E0B\')" class="w-7 h-7 rounded-full border-2 border-white shadow ring-1 ring-stone-200" style="background:#1E3A8A" title="Biru & Kuning"></button>' +
            '<button type="button" onclick="posterApplyPreset(\'#7C2D12\',\'#D97706\')" class="w-7 h-7 rounded-full border-2 border-white shadow ring-1 ring-stone-200" style="background:#7C2D12" title="Maroon & Emas"></button>' +
            '<button type="button" onclick="posterApplyPreset(\'#4C1D95\',\'#EC4899\')" class="w-7 h-7 rounded-full border-2 border-white shadow ring-1 ring-stone-200" style="background:#4C1D95" title="Ungu & Pink"></button>' +
            '<button type="button" onclick="posterApplyPreset(\'#111827\',\'#22C55E\')" class="w-7 h-7 rounded-full border-2 border-white shadow ring-1 ring-stone-200" style="background:#111827" title="Hitam & Hijau"></button>' +
          '</div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
          '<div><label class="' + labelCls + '">Warna Utama</label>' +
            '<div class="mt-1 flex items-center gap-2">' +
              '<input id="pt-warna-utama" type="color" value="' + posterEsc(tpl.warna_utama) + '" oninput="posterSyncColor(\'utama\', this.value)" class="w-10 h-10 rounded-lg border border-stone-200 bg-white cursor-pointer shrink-0" />' +
              '<input id="pt-warna-utama-hex" maxlength="7" value="' + posterEsc(tpl.warna_utama) + '" oninput="posterColorText(\'utama\', this.value)" class="flex-1 min-w-0 h-10 px-3 border border-stone-200 rounded-lg text-sm mono uppercase" />' +
            '</div></div>' +
          '<div><label class="' + labelCls + '">Warna Aksen</label>' +
            '<div class="mt-1 flex items-center gap-2">' +
              '<input id="pt-warna-aksen" type="color" value="' + posterEsc(tpl.warna_aksen) + '" oninput="posterSyncColor(\'aksen\', this.value)" class="w-10 h-10 rounded-lg border border-stone-200 bg-white cursor-pointer shrink-0" />' +
              '<input id="pt-warna-aksen-hex" maxlength="7" value="' + posterEsc(tpl.warna_aksen) + '" oninput="posterColorText(\'aksen\', this.value)" class="flex-1 min-w-0 h-10 px-3 border border-stone-200 rounded-lg text-sm mono uppercase" />' +
            '</div></div>' +
        '</div>' +
      '</div>' +

      // Catatan
      '<div class="' + cardCls + '">' +
        '<div class="flex items-center gap-2 mb-4">' +
          '<span class="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg></span>' +
          '<h3 class="text-sm font-bold text-stone-800">Catatan Menu</h3>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
          '<div><label class="' + labelCls + '">Judul Kotak</label>' +
            '<input id="pt-catatan-judul" maxlength="80" value="' + posterEsc(tpl.catatan_judul) + '" oninput="posterSchedulePreview()" class="' + inputCls + '" /></div>' +
          '<div><label class="' + labelCls + '">Sumber Catatan</label>' +
            '<select id="pt-catatan-mode" onchange="posterSchedulePreview()" class="' + inputCls + '">' +
              '<option value="manual"' + (tpl.catatan_mode === 'manual' ? ' selected' : '') + '>Teks manual</option>' +
              '<option value="menu"' + (tpl.catatan_mode === 'menu' ? ' selected' : '') + '>Deskripsi menu (otomatis)</option>' +
            '</select></div>' +
          '<div class="sm:col-span-2"><label class="' + labelCls + '">Poin Catatan (satu baris = satu poin, maks 6)</label>' +
            '<textarea id="pt-catatan" rows="5" maxlength="960" oninput="posterSchedulePreview()" class="mt-1 w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all" placeholder="Tulis satu poin per baris...">' + posterEsc(catatanText) + '</textarea>' +
            '<div class="text-[11px] text-stone-400 mt-1">Jika memilih <b>Deskripsi menu</b>, poin otomatis diambil dari deskripsi menu yang dibagikan (fallback ke teks manual bila kosong).</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Gambar
      '<div class="' + cardCls + '">' +
        '<div class="flex items-center gap-2 mb-4">' +
          '<span class="w-7 h-7 rounded-lg bg-fuchsia-100 text-fuchsia-700 flex items-center justify-center"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></span>' +
          '<h3 class="text-sm font-bold text-stone-800">Logo &amp; Background</h3>' +
        '</div>' +

        '<div class="flex items-center gap-3">' +
          '<div class="w-16 h-16 rounded-lg border border-stone-200 bg-stone-50 overflow-hidden flex items-center justify-center shrink-0">' +
            '<img id="pt-logo-thumb" alt="Logo" class="w-full h-full object-contain" />' +
            '<span id="pt-logo-empty" class="text-[10px] text-stone-400 text-center px-1">Logo<br>default</span>' +
          '</div>' +
          '<div class="flex-1 min-w-0">' +
            '<div class="text-xs font-semibold text-stone-600 mb-1">Logo Poster</div>' +
            '<input type="file" accept="image/png,image/jpeg,image/webp" onchange="posterPickImage(\'logo\', this)" class="block w-full text-[11px] text-stone-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer" />' +
            '<div class="text-[10px] text-stone-400 mt-1">PNG/JPG/WEBP, maks 4 MB. Kosong = logo default aplikasi.</div>' +
          '</div>' +
          '<button type="button" id="pt-logo-remove" onclick="posterRemoveImage(\'logo\')" class="shrink-0 text-[11px] font-semibold text-red-600 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50">Hapus</button>' +
        '</div>' +

        '<div class="flex items-center gap-3 mt-4 pt-4 border-t border-stone-100">' +
          '<div class="w-16 h-16 rounded-lg border border-stone-200 bg-stone-50 overflow-hidden flex items-center justify-center shrink-0">' +
            '<img id="pt-bg-thumb" alt="Background" class="w-full h-full object-cover" />' +
            '<span id="pt-bg-empty" class="text-[10px] text-stone-400 text-center px-1">Tanpa<br>background</span>' +
          '</div>' +
          '<div class="flex-1 min-w-0">' +
            '<div class="text-xs font-semibold text-stone-600 mb-1">Foto Background (opsional)</div>' +
            '<input type="file" accept="image/png,image/jpeg,image/webp" onchange="posterPickImage(\'background\', this)" class="block w-full text-[11px] text-stone-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer" />' +
            '<div class="text-[10px] text-stone-400 mt-1">Dipakai sebagai latar dengan overlay putih agar teks tetap terbaca.</div>' +
          '</div>' +
          '<button type="button" id="pt-bg-remove" onclick="posterRemoveImage(\'background\')" class="shrink-0 text-[11px] font-semibold text-red-600 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50">Hapus</button>' +
        '</div>' +

        '<label class="flex items-center gap-2 mt-4 pt-4 border-t border-stone-100 cursor-pointer select-none">' +
          '<input id="pt-tampilkan-foto" type="checkbox" ' + (tpl.tampilkan_foto ? 'checked' : '') + ' onchange="posterSchedulePreview()" class="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500" />' +
          '<span class="text-xs text-stone-600">Tampilkan foto menu di poster bila menu punya foto (jika tidak ada, tetap pakai ilustrasi tray)</span>' +
        '</label>' +
      '</div>' +

      // Actions
      '<div class="flex flex-wrap items-center gap-2 pb-6">' +
        '<button type="button" id="pt-save" onclick="posterSave()" class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>' +
          'Simpan Template</button>' +
        '<button type="button" onclick="posterDownloadPreview()" class="inline-flex items-center gap-2 border border-stone-200 hover:bg-stone-50 text-stone-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
          'Unduh Preview</button>' +
        '<button type="button" onclick="posterReset()" class="inline-flex items-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">Reset Default</button>' +
      '</div>' +
    '</div>' +

    // Preview
    '<div class="xl:col-span-2">' +
      '<div class="xl:sticky xl:top-20 bg-white rounded-xl border border-stone-200 p-4">' +
        '<div class="flex items-center justify-between mb-3">' +
          '<div><div class="text-sm font-bold text-stone-800">Preview Poster</div>' +
          '<div class="text-[11px] text-stone-400">1080 × 1200 px</div></div>' +
          '<button type="button" onclick="posterRefreshPreview()" class="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-lg hover:bg-emerald-50">Muat ulang</button>' +
        '</div>' +
        '<div class="rounded-xl overflow-hidden border border-stone-200 bg-stone-100">' +
          '<img id="pt-preview" alt="Preview poster" class="w-full block" />' +
        '</div>' +
        '<p class="text-[11px] text-stone-400 mt-2 leading-relaxed">Preview memakai contoh menu. Saat tombol <b>Bagikan menu</b> dipakai, data menu asli (nama, tanggal, gizi, foto) otomatis masuk ke template ini.</p>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function posterFillForm(tpl) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  set('pt-judul', tpl.judul);
  set('pt-tagline', tpl.tagline);
  set('pt-badge1', tpl.badge1);
  set('pt-badge2', tpl.badge2);
  set('pt-footer', tpl.footer_text);
  set('pt-catatan-judul', tpl.catatan_judul);
  set('pt-catatan-mode', tpl.catatan_mode);
  set('pt-catatan', (tpl.catatan || []).join('\n'));
  set('pt-warna-utama', tpl.warna_utama);
  set('pt-warna-utama-hex', tpl.warna_utama);
  set('pt-warna-aksen', tpl.warna_aksen);
  set('pt-warna-aksen-hex', tpl.warna_aksen);
  const cb = document.getElementById('pt-tampilkan-foto');
  if (cb) cb.checked = !!tpl.tampilkan_foto;
}

function posterCollectForm() {
  const E = _posterEd;
  const val = (id) => {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  };
  const catatanRaw = val('pt-catatan');
  const catatan = catatanRaw
    ? catatanRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 6)
    : [];
  const cek = document.getElementById('pt-tampilkan-foto');

  const tpl = {
    judul: val('pt-judul'),
    tagline: val('pt-tagline'),
    badge1: val('pt-badge1'),
    badge2: val('pt-badge2'),
    catatan_judul: val('pt-catatan-judul'),
    catatan_mode: val('pt-catatan-mode') === 'menu' ? 'menu' : 'manual',
    catatan,
    footer_text: val('pt-footer'),
    warna_utama: val('pt-warna-utama-hex') || val('pt-warna-utama') || POSTER_TPL_DEFAULTS.warna_utama,
    warna_aksen: val('pt-warna-aksen-hex') || val('pt-warna-aksen') || POSTER_TPL_DEFAULTS.warna_aksen,
    tampilkan_foto: cek && cek.checked ? 1 : 0,
    logo_url: E.logoData || (E.logoRemoved ? '' : (E.tpl && E.tpl.logo_url) || ''),
    background_url: E.bgData || (E.bgRemoved ? '' : (E.tpl && E.tpl.background_url) || ''),
  };
  if (E.logoData) tpl.logo_base64 = E.logoData;
  if (E.bgData) tpl.background_base64 = E.bgData;
  return tpl;
}

function posterUpdateImageUI() {
  const E = _posterEd;
  const logo = E.logoData || (E.logoRemoved ? '' : (E.tpl && E.tpl.logo_url) || '');
  const bg = E.bgData || (E.bgRemoved ? '' : (E.tpl && E.tpl.background_url) || '');

  const lt = document.getElementById('pt-logo-thumb');
  const le = document.getElementById('pt-logo-empty');
  if (lt) {
    if (logo) {
      lt.src = logo;
      lt.style.display = 'block';
      if (le) le.style.display = 'none';
    } else {
      lt.removeAttribute('src');
      lt.style.display = 'none';
      if (le) le.style.display = 'block';
    }
  }
  const lr = document.getElementById('pt-logo-remove');
  if (lr) lr.classList.toggle('hidden', !logo);

  const bt = document.getElementById('pt-bg-thumb');
  const be = document.getElementById('pt-bg-empty');
  if (bt) {
    if (bg) {
      bt.src = bg;
      bt.style.display = 'block';
      if (be) be.style.display = 'none';
    } else {
      bt.removeAttribute('src');
      bt.style.display = 'none';
      if (be) be.style.display = 'block';
    }
  }
  const br = document.getElementById('pt-bg-remove');
  if (br) br.classList.toggle('hidden', !bg);
}

function posterPickImage(kind, input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  if (!/^image\//.test(file.type)) {
    showAlert('File harus berupa gambar (PNG/JPG/WEBP).', 'warning');
    input.value = '';
    return;
  }
  if (file.size > 4 * 1024 * 1024) {
    showAlert('Ukuran gambar maksimal 4 MB.', 'warning');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function() {
    if (kind === 'logo') {
      _posterEd.logoData = reader.result;
      _posterEd.logoRemoved = false;
    } else {
      _posterEd.bgData = reader.result;
      _posterEd.bgRemoved = false;
    }
    posterUpdateImageUI();
    posterSchedulePreview(0);
  };
  reader.onerror = function() { showAlert('Gagal membaca file gambar.', 'error'); };
  reader.readAsDataURL(file);
}

function posterRemoveImage(kind) {
  if (kind === 'logo') {
    _posterEd.logoData = null;
    _posterEd.logoRemoved = true;
  } else {
    _posterEd.bgData = null;
    _posterEd.bgRemoved = true;
  }
  posterUpdateImageUI();
  posterSchedulePreview(0);
}

function posterApplyPreset(utama, aksen) {
  const u = document.getElementById('pt-warna-utama');
  const ux = document.getElementById('pt-warna-utama-hex');
  const a = document.getElementById('pt-warna-aksen');
  const ax = document.getElementById('pt-warna-aksen-hex');
  if (u) u.value = utama;
  if (ux) ux.value = utama;
  if (a) a.value = aksen;
  if (ax) ax.value = aksen;
  posterSchedulePreview();
}

function posterSyncColor(kind, value) {
  const hex = document.getElementById('pt-warna-' + kind + '-hex');
  if (hex) hex.value = String(value || '').toUpperCase();
  posterSchedulePreview();
}

function posterColorText(kind, value) {
  const v = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    const el = document.getElementById('pt-warna-' + kind);
    if (el) el.value = v.toUpperCase();
    posterSchedulePreview();
  }
}

function posterSchedulePreview(delay) {
  clearTimeout(_posterEd.timer);
  _posterEd.timer = setTimeout(posterRefreshPreview, delay == null ? 500 : delay);
}

async function posterRefreshPreview() {
  const img = document.getElementById('pt-preview');
  if (!img || !_posterEd.tpl) return;
  const seq = ++_posterEd.seq;
  try {
    const blob = await dashMenuGenImageBlob(posterSampleMenu(), posterCollectForm());
    if (!blob || seq !== _posterEd.seq) return;
    if (_posterEd.previewUrl) URL.revokeObjectURL(_posterEd.previewUrl);
    _posterEd.previewUrl = URL.createObjectURL(blob);
    img.src = _posterEd.previewUrl;
  } catch (e) {
    console.warn('Preview poster gagal:', e);
  }
}

function posterDownloadPreview() {
  if (!_posterEd.previewUrl) {
    showAlert('Preview belum siap. Tunggu sebentar lalu coba lagi.', 'warning');
    return;
  }
  const a = document.createElement('a');
  a.href = _posterEd.previewUrl;
  a.download = 'preview-template-poster.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function posterSave() {
  const btn = document.getElementById('pt-save');
  const payload = posterCollectForm();
  if (!payload.judul) return showAlert('Judul poster wajib diisi.', 'warning');
  if (!/^#[0-9a-fA-F]{6}$/.test(payload.warna_utama) || !/^#[0-9a-fA-F]{6}$/.test(payload.warna_aksen)) {
    return showAlert('Kode warna harus format hex, contoh #14532D.', 'warning');
  }

  if (btn) { btn.disabled = true; btn.classList.add('opacity-60'); }
  try {
    payload.remove_logo = _posterEd.logoRemoved ? 1 : 0;
    payload.remove_background = _posterEd.bgRemoved ? 1 : 0;

    const res = await api.put('/template-poster', payload);
    _posterEd.tpl = res;
    _posterEd.logoData = null;
    _posterEd.bgData = null;
    _posterEd.logoRemoved = false;
    _posterEd.bgRemoved = false;
    window._posterTemplate = res;
    posterUpdateImageUI();
    showToast('Template poster berhasil disimpan.', 'success');
    posterRefreshPreview();
  } catch (e) {
    showAlert(e.message || 'Gagal menyimpan template poster.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('opacity-60'); }
  }
}

async function posterReset() {
  const ok = await showConfirm(
    'Kembalikan template poster ke tampilan awal? Semua teks, warna, logo, dan background akan dihapus.',
    'Reset', 'Batal', 'danger', 'question'
  );
  if (!ok) return;
  try {
    const res = await api.post('/template-poster/reset', {});
    _posterEd.tpl = res;
    _posterEd.logoData = null;
    _posterEd.bgData = null;
    _posterEd.logoRemoved = false;
    _posterEd.bgRemoved = false;
    window._posterTemplate = res;
    posterFillForm(res);
    posterUpdateImageUI();
    posterRefreshPreview();
    showToast('Template poster dikembalikan ke default.', 'success');
  } catch (e) {
    showAlert(e.message || 'Gagal reset template poster.', 'error');
  }
}
