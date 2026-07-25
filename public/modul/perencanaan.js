// ===== Perencanaan Kebutuhan Bahan Pangan (per Menu) =====
var _pncData = null;
var _pncSelectedJenjang = 'SEMUA';
var _pncSelectedPorsi = 'TOTAL';
var _pncSiklusId = '';
var _pncAllJenjangData = null;

// Color sequence for jenjang headers
var _pncJenjangColors = ['bg-blue-50 text-blue-800', 'bg-emerald-50 text-emerald-800', 'bg-amber-50 text-amber-800', 'bg-violet-50 text-violet-800', 'bg-cyan-50 text-cyan-800', 'bg-rose-50 text-rose-800'];
var _pncJenjangOrder = ['TK/PAUD', 'SD/MI (1-3)', 'SD/MI (4-6)', 'SMP/MTs, SMA/SMK', 'Bumil/Busui', 'Balita'];

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function renderPerencanaan() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-sky-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/perencanaan', { credentials: 'include' });
    if (!r.ok) throw new Error((await r.json()).error || 'Gagal memuat');
    c.innerHTML = await r.text();
    // Preload bahan list untuk edit override
    await pncPreloadBahan();
    await loadPerencanaanData();
  } catch (err) {
    c.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat: ' + err.message + '</div>';
  }
}

async function loadPerencanaanData(siklusId) {
  const wrap = document.getElementById('perencanaan-content');
  if (!wrap) return;
  wrap.innerHTML = '<div class="flex items-center justify-center py-16"><svg class="animate-spin h-8 w-8 text-sky-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';

  try {
    const params = siklusId ? '?siklus_id=' + siklusId : '';
    const res = await api.get('/siklus/laporan/kebutuhan-per-menu' + params);
    const { siklus_list, selected_siklus_id, jenjang_list, data, _validation } = res;

    if (siklusId) _pncSiklusId = siklusId;
    _pncAllJenjangData = data;
    _pncData = { jenjang_list, data };

    var activeJl = jenjang_list || [];
    if (_pncSelectedJenjang !== 'SEMUA' && activeJl.indexOf(_pncSelectedJenjang) === -1) {
      _pncSelectedJenjang = 'SEMUA';
    }

    let html = '';

    // Filter bar
    html += '<div class="bg-white border border-stone-200 rounded-lg p-4 mb-4 flex flex-wrap items-center gap-4">';

    // Siklus filter
    html += '<label class="text-sm font-medium text-stone-700">Filter Siklus:</label>';
    html += '<select onchange="loadPerencanaanData(this.value)" class="h-10 px-3 border border-stone-200 rounded-xl text-sm bg-white min-w-[200px] focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400">';
    html += '<option value="">— Semua Siklus Aktif —</option>';
    for (var i = 0; i < siklus_list.length; i++) {
      var s = siklus_list[i];
      var sel = selected_siklus_id && Number(selected_siklus_id) === s.id;
      html += '<option value="' + s.id + '" ' + (sel ? 'selected' : '') + '>' + s.nama + ' (' + s.status + ')' + '</option>';
    }
    html += '</select>';

    // View indicator
    html += '<div class="text-xs font-medium text-stone-500 bg-stone-100 px-3 py-1.5 rounded-lg">Per Menu</div>';

    // Porsi filter toggle
    html += '<div class="flex items-center gap-1">';
    var porsiTabs = [
      { key: 'TOTAL', label: 'Semua Porsi', color: 'bg-sky-600 text-white' },
      { key: 'BESAR', label: 'Porsi Besar', color: 'bg-amber-600 text-white' },
      { key: 'KECIL', label: 'Porsi Kecil', color: 'bg-emerald-600 text-white' }
    ];
    for (var pi = 0; pi < porsiTabs.length; pi++) {
      var pt = porsiTabs[pi];
      var isActiveP = _pncSelectedPorsi === pt.key;
      html += '<button data-pnc-porsi="' + pt.key + '" onclick="pncFilterPorsi(\'' + pt.key + '\')" class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ' + (isActiveP ? pt.color + ' shadow-sm' : 'bg-stone-100 text-stone-600 hover:bg-stone-200') + '">' + pt.label + '</button>';
    }
    html += '</div>';

    // Jenjang tabs
    html += '<div class="flex items-center gap-1.5 flex-wrap">';
    html += '<button data-pnc-tab="SEMUA" onclick="pncFilterJenjang(\'SEMUA\')" class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ' + (_pncSelectedJenjang === 'SEMUA' ? 'bg-sky-600 text-white shadow-sm' : 'bg-stone-100 text-stone-600 hover:bg-stone-200') + '">Semua</button>';
    for (var ji = 0; ji < activeJl.length; ji++) {
      var jn = activeJl[ji];
      var pmVal = 0;
      for (var d = 0; d < data.length; d++) {
        if (data[d].jenjang === jn) { pmVal = data[d].jumlah_siswa; break; }
      }
      var isActive = _pncSelectedJenjang === jn;
      html += '<button data-pnc-tab="' + jn.replace(/"/g, '&quot;') + '" onclick="pncFilterJenjang(\'' + jn.replace(/'/g, "\\'") + '\')" class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ' + (isActive ? 'bg-sky-600 text-white shadow-sm' : 'bg-stone-100 text-stone-600 hover:bg-stone-200') + '">' + jn + ' <span class="' + (isActive ? 'text-sky-200' : 'text-stone-400') + '">(' + fmtPncNum(pmVal) + ')</span></button>';
    }
    html += '</div>';

    html += '<button onclick="exportPncExcel()" class="px-2.5 py-1.5 rounded bg-stone-600 text-white hover:bg-stone-700 transition-colors flex items-center gap-1 text-xs" title="Export All Excel"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Export All XLSX</button>';
    html += '<div class="text-xs text-stone-400">' + data.length + ' jenjang</div>';
    html += '</div>';

    // ── Tampilkan validasi jika ada ──
    if (_validation) {
      var vl = _validation;
      var colors = { 'no_siklus': 'amber', 'no_target': 'orange', 'no_pm_match': 'amber' };
      var c = colors[vl.level] || 'stone';
      html += '<div class="rounded-xl border border-' + c + '-200 bg-' + c + '-50 p-5 mb-4">';
      html += '<div class="flex items-start gap-3">';
      html += '<svg class="w-6 h-6 shrink-0 mt-0.5 text-' + c + '-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>';
      html += '<div>';
      html += '<div class="font-semibold text-sm text-' + c + '-800">' + escHtml(vl.message) + '</div>';
      html += '<div class="text-xs text-' + c + '-600 mt-1">' + escHtml(vl.detail || '') + '</div>';
      // Link ke halaman siklus jika tidak ada siklus
      if (vl.level === 'no_siklus') {
        html += '<a href="/siklus" onclick="return loadPage(\'siklus\')" class="inline-flex items-center gap-1.5 mt-3 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors shadow-sm">';
        html += '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>';
        html += 'Buat Siklus Baru';
        html += '</a>';
      }
      html += '</div></div></div>';

      wrap.innerHTML = html;
      return;
    }

    if (!data || !data.length) {
      html += '<div class="rounded-xl border border-amber-200 bg-amber-50 p-5 mb-4">';
      html += '<div class="flex items-start gap-3">';
      html += '<svg class="w-6 h-6 shrink-0 mt-0.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>';
      html += '<div>';
      html += '<div class="font-semibold text-sm text-amber-800">Data siklus belum lengkap</div>';
      html += '<div class="text-xs text-amber-600 mt-1">Siklus aktif sudah ada, namun menu dan bahan pangan belum diisi. Isi menu harian di halaman siklus terlebih dahulu.</div>';
      html += '<a href="/siklus" onclick="return loadPage(\'siklus\')" class="inline-flex items-center gap-1.5 mt-3 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors shadow-sm">';
      html += '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>';
      html += 'Isi Menu Siklus';
      html += '</a>';
      html += '</div></div></div>';
      wrap.innerHTML = html;
      return;
    }

    // ── Rekap Porsi Besar & Kecil (aggregate across all jenjang) ──
    html += renderPncRekapPorsi(data);

    // Content: per jenjang sections
    html += '<div id="pnc-view-container">';
    for (var j = 0; j < data.length; j++) {
      html += renderPncJenjangSection(data[j], j);
    }
    html += '</div>';

    wrap.innerHTML = html;

    // Apply initial filter
    if (_pncSelectedJenjang !== 'SEMUA') {
      applyPncSectionVisibility();
    }
  } catch (err) {
    wrap.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal: ' + err.message + '</div>';
  }
}

function pncFilterPorsi(porsi) {
  _pncSelectedPorsi = porsi;
  // Re-render sections with new porsi filter
  var wrap = document.getElementById('perencanaan-content');
  if (!wrap) return;

  // Update porsi tab styles
  var porsiBtns = wrap.parentElement.querySelectorAll('[data-pnc-porsi]');
  if (porsiBtns) {
    var porsiStyles = { 'TOTAL': 'bg-sky-600 text-white', 'BESAR': 'bg-amber-600 text-white', 'KECIL': 'bg-emerald-600 text-white' };
    for (var pi = 0; pi < porsiBtns.length; pi++) {
      var btn = porsiBtns[pi];
      var key = btn.getAttribute('data-pnc-porsi');
      var style = porsiStyles[key] || 'bg-sky-600 text-white';
      btn.className = 'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ' + (key === porsi ? style + ' shadow-sm' : 'bg-stone-100 text-stone-600 hover:bg-stone-200');
    }
  }

  // Re-render the content sections
  var container = document.getElementById('pnc-view-container');
  if (container && _pncAllJenjangData) {
    var newHtml = '';
    for (var j = 0; j < _pncAllJenjangData.length; j++) {
      newHtml += renderPncJenjangSection(_pncAllJenjangData[j], j);
    }
    container.innerHTML = newHtml;
    applyPncSectionVisibility();
  }
}

function pncFilterJenjang(jenjang) {
  _pncSelectedJenjang = jenjang;
  var wrap = document.getElementById('perencanaan-content');
  if (!wrap) return;

  // Update tab button styles
  var tabs = wrap.parentElement.querySelectorAll('[data-pnc-tab]');
  if (tabs) {
    for (var ti = 0; ti < tabs.length; ti++) {
      var tab = tabs[ti];
      var jVal = tab.getAttribute('data-pnc-tab');
      var isActive = (jVal === jenjang) || (jVal === 'SEMUA' && jenjang === 'SEMUA');
      tab.className = 'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ' + (isActive ? 'bg-sky-600 text-white shadow-sm' : 'bg-stone-100 text-stone-600 hover:bg-stone-200');
    }
  }

  applyPncSectionVisibility();
}

function applyPncSectionVisibility() {
  var sections = document.querySelectorAll('[data-pnc-section]');
  if (!sections) return;
  for (var si = 0; si < sections.length; si++) {
    var section = sections[si];
    var jn = section.getAttribute('data-pnc-section');
    var show = _pncSelectedJenjang === 'SEMUA' || jn === _pncSelectedJenjang;
    section.style.display = show ? '' : 'none';
  }
}

// ── Rekap Porsi Besar & Kecil (aggregate across all jenjang) ──
function renderPncRekapPorsi(allData) {
  if (!allData || !allData.length) return '';

  // 1. Hitung total besar & kecil dari semua jenjang
  var totalBesar = 0, totalKecil = 0;
  for (var di = 0; di < allData.length; di++) {
    totalBesar += allData[di].jumlah_besar || 0;
    totalKecil += allData[di].jumlah_kecil || 0;
  }
  if (totalBesar === 0 && totalKecil === 0) return '';

  // 2. Gunakan data jenjang pertama sebagai template siklus/hari/bahan
  //    (asumsi: semua jenjang pakai menu yang sama)
  var template = allData[0];
  var totalSiswa = template.jumlah_siswa;

  // 3. Helper: hitung per-siswa dari total jenjang
  function perSiswa(totalVal, jmlSiswa) {
    return jmlSiswa > 0 ? totalVal / jmlSiswa : 0;
  }

  // 4. Render satu tabel untuk satu porsi type
  function renderRekapTable(porsiKey, porsiLabel, porsiCount, colorClass, iconSvg) {
    if (porsiCount <= 0) return '';
    var html = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden mb-4">';
    html += '<div class="px-5 py-3 ' + colorClass + ' flex items-center gap-3">';
    if (iconSvg) html += iconSvg;
    html += '<span class="font-bold text-base">' + porsiLabel + '</span>';
    html += '<span class="text-sm font-normal">Jumlah Siswa: <strong>' + fmtPncNum(porsiCount) + '</strong> orang</span>';
    html += '<span class="text-xs opacity-60">(Rekap semua jenjang)</span>';
    html += '</div>';

    for (var skIdx = 0; skIdx < template.siklus.length; skIdx++) {
      var sk = template.siklus[skIdx];

      // Siklus header
      html += '<div class="px-5 py-2 bg-stone-50 border-b border-stone-200 text-sm font-semibold text-stone-600 flex items-center gap-2">';
      html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
      html += sk.siklus_nama;
      html += '</div>';

      // Day tabs
      if (sk.hari.length > 1) {
        html += '<div class="px-5 py-2 border-b border-stone-100">';
        html += '<div class="flex gap-1 bg-stone-100 rounded-lg p-0.5 overflow-x-auto siklus-tab-bar" role="tablist">';
        for (var h = 0; h < sk.hari.length; h++) {
          var day = sk.hari[h];
          var isFirst = h === 0;
          html += '<button onclick="pncSwitchDayTab(event, this)" class="px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-all ' + (isFirst ? 'bg-white shadow-sm font-bold text-sky-700' : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200/50') + '" role="tab" aria-selected="' + (isFirst ? 'true' : 'false') + '">' + day.hari_nama + '</button>';
        }
        html += '</div></div>';
      }

      // Per hari
      for (var h = 0; h < sk.hari.length; h++) {
        var day = sk.hari[h];
        var tabExtraClass = (sk.hari.length > 1 && h > 0) ? ' hidden' : '';
        html += '<div class="pnc-day-content' + tabExtraClass + '" role="tabpanel">';
        html += '<div class="px-5 py-3 border-b border-stone-100 bg-stone-50/30">';
        html += '<div class="flex items-center gap-3 mb-2">';
        html += '<span class="inline-block px-3 py-1 rounded-lg ' + (porsiKey === 'BESAR' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800') + ' text-sm font-bold">' + day.menu_label + '</span>';
        html += '<span class="text-sm font-semibold text-stone-700">' + day.hari_nama + '</span>';
        html += '<span class="text-xs text-stone-400">' + (day.menu_nama || '') + '</span>';
        html += '</div>';

        if (!day.bahan || !day.bahan.length) {
          html += '<div class="text-xs text-stone-400 italic px-2 pb-2">Tidak ada bahan</div></div></div>';
          continue;
        }

        // Table
        html += '<div class="overflow-x-auto pb-2"><table class="w-full text-xs border-collapse">';
        html += '<thead><tr class="border-b border-stone-200">';
        html += '<th class="px-2 py-1.5 text-left font-semibold text-stone-600 min-w-[140px]">Bahan Pangan</th>';
        html += '<th class="px-2 py-1.5 text-right font-semibold text-stone-600 whitespace-nowrap">Berat Bersih (g)</th>';
        html += '<th class="px-2 py-1.5 text-right font-semibold text-stone-600 whitespace-nowrap">BDD (%)</th>';
        html += '<th class="px-2 py-1.5 text-right font-semibold text-stone-600 whitespace-nowrap">Berat Kotor (g)</th>';
        html += '<th class="px-2 py-1.5 text-right font-semibold text-stone-600 whitespace-nowrap">Jumlah Siswa</th>';
        html += '<th class="px-2 py-1.5 text-right font-semibold text-stone-600 whitespace-nowrap">Kebutuhan (kg)</th>';
        html += '</tr></thead><tbody>';

        for (var bi = 0; bi < day.bahan.length; bi++) {
          var b = day.bahan[bi];
          // Hitung per-siswa values
          var bbPerSiswa = perSiswa(b.berat_bersih, totalSiswa);
          var bkPerSiswa = perSiswa(b.berat_kotor, totalSiswa);
          // Kebutuhan untuk porsi ini
          var kebutuhanPorsi = Math.round((bkPerSiswa * porsiCount / 1000) * 100) / 100;

          html += '<tr class="border-b border-stone-100 hover:bg-stone-50/50">';
          html += '<td class="px-2 py-1.5 text-sm font-medium">' + b.nama_display + '</td>';
          html += '<td class="px-2 py-1.5 text-sm text-right mono">' + fmtPncNum(bbPerSiswa) + '</td>';
          html += '<td class="px-2 py-1.5 text-sm text-right mono">' + b.persen_bdd + '%</td>';
          html += '<td class="px-2 py-1.5 text-sm text-right mono">' + fmtPncNum(bkPerSiswa) + '</td>';
          html += '<td class="px-2 py-1.5 text-sm text-right mono">' + fmtPncNum(porsiCount) + '</td>';
          html += '<td class="px-2 py-1.5 text-sm text-right mono font-bold ' + (porsiKey === 'BESAR' ? 'text-amber-700' : 'text-emerald-700') + '">' + fmtPncNum(kebutuhanPorsi) + '</td>';
          html += '</tr>';
        }

        html += '</tbody></table></div></div></div>';
      }
    }

    html += '</div>';
    return html;
  }

  var besarIcon = '<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 10l7-7 7 7"/><path d="M12 3v18"/></svg>';
  var kecilIcon = '<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 14l-7 7-7-7"/><path d="M12 21V3"/></svg>';

  var html = '<div class="mb-6">';
  html += '<div class="flex items-center gap-2 mb-3">';
  html += '<svg class="w-5 h-5 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>';
  html += '<span class="text-sm font-bold text-stone-700">Rekap Kebutuhan — Porsi Besar & Kecil</span>';
  html += '<span class="text-xs text-stone-400">(Semua jenjang digabung)</span>';
  html += '</div>';

  // Two tables side by side on desktop, stacked on mobile
  html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">';
  html += '<div>' + renderRekapTable('BESAR', 'Porsi Besar', totalBesar, 'bg-amber-50 text-amber-800 border-b-2 border-b-amber-400', besarIcon) + '</div>';
  html += '<div>' + renderRekapTable('KECIL', 'Porsi Kecil', totalKecil, 'bg-emerald-50 text-emerald-800 border-b-2 border-b-emerald-400', kecilIcon) + '</div>';
  html += '</div>';
  html += '</div>';

  return html;
}

function renderPncJenjangSection(jd, idx) {
  var jIdx = _pncJenjangOrder.indexOf(jd.jenjang);
  if (jIdx < 0) jIdx = idx % _pncJenjangColors.length;
  var visible = _pncSelectedJenjang === 'SEMUA' || _pncSelectedJenjang === jd.jenjang;

  // Determine active student count based on porsi filter
  var activeSiswa = _pncSelectedPorsi === 'BESAR' ? (jd.jumlah_besar || 0)
    : _pncSelectedPorsi === 'KECIL' ? (jd.jumlah_kecil || 0)
    : jd.jumlah_siswa;
  var scaleFactor = jd.jumlah_siswa > 0 ? activeSiswa / jd.jumlah_siswa : 0;

  var html = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden mb-6" data-pnc-section="' + jd.jenjang.replace(/"/g, '&quot;') + '" style="' + (visible ? '' : 'display:none') + '">';

  // Jenjang header with porsi breakdown
  var porsiBadge = '';
  if (_pncSelectedPorsi === 'BESAR') {
    porsiBadge = '<span class="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 10l7-7 7 7"/><path d="M12 3v18"/></svg> Porsi Besar</span>';
  } else if (_pncSelectedPorsi === 'KECIL') {
    porsiBadge = '<span class="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 14l-7 7-7-7"/><path d="M12 21V3"/></svg> Porsi Kecil</span>';
  }
  html += '<div class="px-5 py-4 border-b border-stone-200 flex items-center justify-between ' + _pncJenjangColors[jIdx % _pncJenjangColors.length] + '">';
  html += '<div><span class="font-bold text-base">' + jd.jenjang + '</span>' + porsiBadge;
  html += '<span class="ml-3 text-sm font-normal">Jumlah Siswa: <strong>' + fmtPncNum(activeSiswa) + '</strong> orang</span></div>';
  html += '<div class="flex items-center gap-2 text-xs">';
  html += '<span>' + jd.siklus.length + ' siklus</span>';
  html += '<button onclick="exportPncExcel(\'' + jd.jenjang.replace(/'/g, "\\'") + '\')" class="px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1 text-xs" title="Export Excel"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> XLSX</button>';
  html += '<button onclick="exportPncPdf(\'' + jd.jenjang.replace(/'/g, "\\'") + '\')" class="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1 text-xs" title="Export PDF"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> PDF</button>';
  html += '</div>';
  html += '</div>';

  // Per siklus
  for (var s = 0; s < jd.siklus.length; s++) {
    var sk = jd.siklus[s];

    // Siklus sub-header
    html += '<div class="px-5 py-2 bg-stone-50 border-b border-stone-200 text-sm font-semibold text-stone-600 flex items-center gap-2">';
    html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    html += sk.siklus_nama;
    html += '</div>';

    // Day tabs (only if more than 1 day)
    if (sk.hari.length > 1) {
      html += '<div class="px-5 py-2 border-b border-stone-100">';
      html += '<div class="flex gap-1 bg-stone-100 rounded-lg p-0.5 overflow-x-auto siklus-tab-bar" role="tablist">';
      for (var h = 0; h < sk.hari.length; h++) {
        var day = sk.hari[h];
        var isFirst = h === 0;
        html += '<button onclick="pncSwitchDayTab(event, this)" class="px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-all ' + (isFirst ? 'bg-white shadow-sm font-bold text-sky-700' : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200/50') + '" role="tab" aria-selected="' + (isFirst ? 'true' : 'false') + '">' + day.hari_nama + '</button>';
      }
      html += '</div></div>';
    }

    // Per hari — only active day visible
    for (var h = 0; h < sk.hari.length; h++) {
      var day = sk.hari[h];
      html += '<div class="pnc-day-content' + (h > 0 ? ' hidden' : '') + '" role="tabpanel">';
      html += renderPncMenuTable(day, activeSiswa, sk.siklus_id, jd.jenjang, scaleFactor);
      html += '</div>';
    }
  }

  html += '</div>';
  return html;
}

// ── Override: preload bahan baku ──
var _pncBahanList = [];

async function pncPreloadBahan() {
  try {
    const res = await api.get('/bahan/by-sp');
    var list = [];
    if (res && res.byKat) {
      for (var kat in res.byKat) {
        var items = res.byKat[kat];
        for (var i = 0; i < items.length; i++) {
          list.push({ id: items[i].id, nama: items[i].nama, kategori_sp: kat, satuan: items[i].satuan, berat_1_sp: items[i].berat_1_sp, persen_bdd: items[i].persen_bdd });
        }
      }
    }
    _pncBahanList = list.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  } catch (e) {
    console.error('Gagal preload bahan:', e);
    _pncBahanList = [];
  }
}

// ── Override: edit bahan ──
async function pncEditBahan(btn) {
  var siklusId = parseInt(btn.getAttribute('data-si')) || 0;
  var hariKe = parseInt(btn.getAttribute('data-hk')) || 0;
  var jenjang = btn.getAttribute('data-jn') || '';
  var origBahanId = parseInt(btn.getAttribute('data-bi')) || 0;
  var origNama = btn.getAttribute('data-bn') || '';
  var curJenjangSection = btn.closest('[data-pnc-section]');

  // Build dropdown options
  var optionsHtml = '<div class="mb-4">';
  optionsHtml += '<label class="block text-sm font-semibold text-stone-700 mb-2">Ganti <strong>' + escHtml(origNama) + '</strong> dengan:</label>';
  optionsHtml += '<input type="text" id="pnc-cari-bahan" placeholder="Cari bahan..." class="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm mb-2 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400" oninput="pncFilterBahanDropdown(this.value)">';
  optionsHtml += '<div id="pnc-bahan-dropdown" class="max-h-48 overflow-y-auto border border-stone-200 rounded-lg">';
  for (var i = 0; i < _pncBahanList.length; i++) {
    var b = _pncBahanList[i];
    optionsHtml += '<div class="pnc-bahan-item px-3 py-2 cursor-pointer hover:bg-sky-50 border-b border-stone-100 last:border-0 text-sm" data-id="' + b.id + '" data-berat="' + (b.berat_1_sp || 0) + '" data-bdd="' + (b.persen_bdd || 100) + '" onclick="pncPilihBahan(' + siklusId + ',' + hariKe + ',\'' + jenjang.replace(/'/g, "\\'") + '\',' + origBahanId + ',' + b.id + ')">' + escHtml(b.nama) + ' <span class="text-[10px] text-stone-400">(' + (b.kategori_sp || '-') + ', ' + (b.berat_1_sp || 0) + 'g, BDD ' + (b.persen_bdd || 100) + '%)</span></div>';
  }
  optionsHtml += '</div></div>';

  document.getElementById('modal-title').textContent = 'Override Bahan: ' + escHtml(origNama);
  document.getElementById('modal-body').innerHTML = optionsHtml;
  document.getElementById('modal-save').textContent = 'Batal';
  document.getElementById('modal-save').onclick = function() { closeModal(); };

  var modal = document.getElementById('modal');
  if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}

function pncFilterBahanDropdown(q) {
  var items = document.querySelectorAll('.pnc-bahan-item');
  q = (q || '').toLowerCase();
  for (var i = 0; i < items.length; i++) {
    var nama = (items[i].textContent || '').toLowerCase();
    items[i].style.display = nama.indexOf(q) > -1 ? '' : 'none';
  }
}

async function pncPilihBahan(siklusId, hariKe, jenjang, origBahanId, newBahanId) {
  closeModal();
  try {
    var res = await api.post('/siklus/laporan/override', {
      siklus_id: siklusId,
      hari_ke: hariKe,
      jenjang: jenjang,
      original_bahan_baku_id: origBahanId || null,
      new_bahan_baku_id: newBahanId
    });
    if (res.ok) {
      showAlert('✅ Berhasil mengganti bahan. Memuat ulang...', 'success');
      setTimeout(function() { window.location.reload(); }, 800);
    } else {
      showAlert('Gagal: ' + (res.error || 'Unknown'), 'error');
    }
  } catch (err) {
    showAlert('Gagal: ' + err.message, 'error');
  }
}

// ── Override: hapus override ──
async function pncHapusOverride(overrideId) {
  if (!confirm('Hapus override ini? Bahan akan kembali ke asal.')) return;
  try {
    await api.del('/siklus/laporan/override/' + overrideId);
    showAlert('✅ Override dihapus. Memuat ulang...', 'success');
    setTimeout(function() { window.location.reload(); }, 800);
  } catch (err) {
    showAlert('Gagal: ' + err.message, 'error');
  }
}

function renderPncMenuTable(day, jumlahSiswa, siklusId, jenjang, scaleFactor) {
  scaleFactor = scaleFactor || 1;
  var html = '<div class="px-5 py-3 border-b border-stone-100 bg-stone-50/30">';

  // Menu header
  html += '<div class="flex items-center gap-3 mb-2">';
  html += '<span class="inline-block px-3 py-1 rounded-lg bg-sky-100 text-sky-800 text-sm font-bold">' + day.menu_label + '</span>';
  html += '<span class="text-sm font-semibold text-stone-700">' + day.hari_nama + '</span>';
  html += '<span class="text-xs text-stone-400">' + (day.menu_nama || '') + '</span>';
  html += '</div>';

  if (!day.bahan || !day.bahan.length) {
    html += '<div class="text-xs text-stone-400 italic px-2 pb-2">Tidak ada bahan</div></div>';
    return html;
  }

  // Table
  html += '<div class="overflow-x-auto pb-2"><table class="w-full text-xs border-collapse">';
  html += '<thead><tr class="border-b border-stone-200">';
  html += '<th class="px-2 py-1.5 text-left font-semibold text-stone-600 min-w-[140px]">Bahan Pangan</th>';
  html += '<th class="px-2 py-1.5 text-right font-semibold text-stone-600 whitespace-nowrap">Berat Bersih (g)</th>';
  html += '<th class="px-2 py-1.5 text-right font-semibold text-stone-600 whitespace-nowrap">BDD (%)</th>';
  html += '<th class="px-2 py-1.5 text-right font-semibold text-stone-600 whitespace-nowrap">Berat Kotor (g)</th>';
  html += '<th class="px-2 py-1.5 text-right font-semibold text-stone-600 whitespace-nowrap">Jumlah Siswa</th>';
  html += '<th class="px-2 py-1.5 text-right font-semibold text-stone-600 whitespace-nowrap">Kebutuhan (kg)</th>';
  html += '</tr></thead><tbody>';

  for (var i = 0; i < day.bahan.length; i++) {
    var b = day.bahan[i];
    var sumberBdd = b.sumber_bdd === 'sp_referensi';
    var isOverridden = b.overridden === true;
    var overClass = isOverridden ? 'bg-amber-50/40' : '';
    html += '<tr class="border-b border-stone-100 hover:bg-stone-50/50 ' + overClass + '">';
    // Nama bahan + edit button
    html += '<td class="px-2 py-1.5 text-sm font-medium flex items-center gap-1.5">';
    if (isOverridden) {
      html += '<span class="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Override"></span>';
    }
    html += '<span class="' + (isOverridden ? 'text-amber-800' : '') + '">' + b.nama_display + '</span>';
    // Edit button
    html += '<button onclick="pncEditBahan(this)" data-si="' + siklusId + '" data-hk="' + (day.hari_ke || '') + '" data-jn="' + (jenjang || '').replace(/"/g, '&quot;') + '" data-bi="' + (b.bahan_baku_id || 0) + '" data-bn="' + escHtml(b.nama_display || b.nama) + '" class="ml-1 p-0.5 rounded text-stone-300 hover:text-sky-600 hover:bg-sky-50 transition-colors" title="Ganti bahan"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
    // Delete override button (only for overridden items)
    if (isOverridden && b.override_id) {
      html += '<button onclick="pncHapusOverride(' + b.override_id + ')" class="p-0.5 rounded text-stone-300 hover:text-red-600 hover:bg-red-50 transition-colors" title="Kembalikan ke asal"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
    }
    html += '</td>';
    html += '<td class="px-2 py-1.5 text-sm text-right mono">' + fmtPncNum(b.berat_bersih) + '</td>';
    html += '<td class="px-2 py-1.5 text-sm text-right mono ' + (sumberBdd ? 'text-emerald-600 font-semibold' : '') + '">' + b.persen_bdd + '%</td>';
    html += '<td class="px-2 py-1.5 text-sm text-right mono">' + fmtPncNum(b.berat_kotor) + '</td>';
    html += '<td class="px-2 py-1.5 text-sm text-right mono">' + fmtPncNum(jumlahSiswa) + '</td>';
    html += '<td class="px-2 py-1.5 text-sm text-right mono font-bold text-sky-700">' + fmtPncNum(b.kebutuhan_kg * scaleFactor) + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table></div></div>';
  return html;
}

function pncSwitchDayTab(event, btn) {
  var tabBar = btn.closest('.siklus-tab-bar');
  if (!tabBar) return;

  var tabs = tabBar.querySelectorAll('button');
  var idx = -1;
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].className = 'px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-all text-stone-500 hover:text-stone-700 hover:bg-stone-200/50';
    tabs[i].setAttribute('aria-selected', 'false');
    if (tabs[i] === btn) idx = i;
  }
  if (idx === -1) return;

  btn.className = 'px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-all bg-white shadow-sm font-bold text-sky-700';
  btn.setAttribute('aria-selected', 'true');

  var section = tabBar.closest('.bg-white');
  var contents = section.querySelectorAll('.pnc-day-content');
  for (var i = 0; i < contents.length; i++) {
    contents[i].classList.add('hidden');
  }
  if (contents[idx]) contents[idx].classList.remove('hidden');
}

function fmtPncNum(v) {
  if (v == null || isNaN(v)) return '0,00';
  var n = Number(v);
  return n === Math.floor(n) ? String(n) : n.toFixed(2).replace('.', ',');
}

// ===== Export Functions =====

function collectPncExportData(jenjangFilter) {
  if (!_pncAllJenjangData || !_pncAllJenjangData.length) return [];
  var result = [];
  for (var j = 0; j < _pncAllJenjangData.length; j++) {
    var jd = _pncAllJenjangData[j];
    if (jenjangFilter) {
      if (jd.jenjang === jenjangFilter) result.push(jd);
    } else {
      if (_pncSelectedJenjang !== 'SEMUA' && jd.jenjang !== _pncSelectedJenjang) continue;
      result.push(jd);
    }
  }
  return result;
}

function getPorsiScaleFactor(jd) {
  if (_pncSelectedPorsi === 'BESAR') {
    return jd.jumlah_siswa > 0 ? (jd.jumlah_besar || 0) / jd.jumlah_siswa : 0;
  } else if (_pncSelectedPorsi === 'KECIL') {
    return jd.jumlah_siswa > 0 ? (jd.jumlah_kecil || 0) / jd.jumlah_siswa : 0;
  }
  return 1;
}

function getPorsiSiswa(jd) {
  if (_pncSelectedPorsi === 'BESAR') return jd.jumlah_besar || 0;
  if (_pncSelectedPorsi === 'KECIL') return jd.jumlah_kecil || 0;
  return jd.jumlah_siswa;
}

function getPorsiLabel() {
  if (_pncSelectedPorsi === 'BESAR') return ' - Porsi Besar';
  if (_pncSelectedPorsi === 'KECIL') return ' - Porsi Kecil';
  return '';
}

function exportPncExcel(jenjang) {
  var exportData = collectPncExportData(jenjang || undefined);
  if (!exportData.length) { showAlert('Tidak ada data', 'error'); return; }

  var rows = [];
  var headerRow = ['Menu', 'Bahan Pangan', 'Berat Bersih (g)', 'Persen BDD', 'Berat Kotor (g)', 'Jumlah Siswa', 'Kebutuhan (kg)'];
  rows.push(headerRow);

  for (var j = 0; j < exportData.length; j++) {
    var jd = exportData[j];
    var sf = getPorsiScaleFactor(jd);
    var pSiswa = getPorsiSiswa(jd);
    var pLabel = getPorsiLabel();
    rows.push(['JENJANG: ' + jd.jenjang + pLabel + ' (Siswa: ' + fmtPncNum(pSiswa) + ')']);
    for (var s = 0; s < jd.siklus.length; s++) {
      var sk = jd.siklus[s];
      for (var h = 0; h < sk.hari.length; h++) {
        var day = sk.hari[h];
        var menuLabel = day.menu_label + ' — ' + day.hari_nama;
        if (!day.bahan || !day.bahan.length) {
          rows.push([menuLabel, '', '', '', '', '', '']);
        } else {
          rows.push([menuLabel, day.bahan[0].nama_display, fmtPncNum(day.bahan[0].berat_bersih), day.bahan[0].persen_bdd + '%', fmtPncNum(day.bahan[0].berat_kotor), fmtPncNum(pSiswa), fmtPncNum(day.bahan[0].kebutuhan_kg * sf)]);
          for (var i = 1; i < day.bahan.length; i++) {
            var b = day.bahan[i];
            rows.push(['', b.nama_display, fmtPncNum(b.berat_bersih), b.persen_bdd + '%', fmtPncNum(b.berat_kotor), fmtPncNum(pSiswa), fmtPncNum(b.kebutuhan_kg * sf)]);
          }
        }
      }
    }
  }

  var wb = XLSX.utils.book_new();
  var ws = XLSX.utils.aoa_to_sheet(rows);

  var colWidths = [
    { wch: 22 }, { wch: 24 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 }
  ];
  ws['!cols'] = colWidths;

  var fileName = 'Perencanaan Kebutuhan Pangan' + getPorsiLabel().replace(/ /g, '_') + '.xlsx';
  XLSX.utils.book_append_sheet(wb, ws, 'Perencanaan');
  XLSX.writeFile(wb, fileName);
}

function exportPncPdf(jenjang) {
  var exportData = collectPncExportData(jenjang || undefined);
  if (!exportData.length) { showAlert('Tidak ada data', 'error'); return; }

  var tableHtml = '';
  for (var j = 0; j < exportData.length; j++) {
    var jd = exportData[j];
    var sf = getPorsiScaleFactor(jd);
    var pSiswa = getPorsiSiswa(jd);
    var pLabel = getPorsiLabel();
    tableHtml += '<tr><td colspan="6" style="font-weight:700;background:#e0f2fe;padding:8px 10px;font-size:11pt">' + jd.jenjang + pLabel + ' — Jumlah Siswa: ' + fmtPncNum(pSiswa) + '</td></tr>';
    for (var s = 0; s < jd.siklus.length; s++) {
      var sk = jd.siklus[s];
      for (var h = 0; h < sk.hari.length; h++) {
        var day = sk.hari[h];
        tableHtml += '<tr><td colspan="6" style="font-weight:600;background:#f0f0f0;padding:6px 10px">' + day.menu_label + ' — ' + day.hari_nama + ' (' + sk.siklus_nama + ')' + '</td></tr>';
        if (day.bahan && day.bahan.length) {
          for (var i = 0; i < day.bahan.length; i++) {
            var b = day.bahan[i];
            tableHtml += '<tr><td style="padding:4px 10px">' + b.nama_display + '</td><td style="padding:4px 10px;text-align:right">' + fmtPncNum(b.berat_bersih) + '</td><td style="padding:4px 10px;text-align:right">' + b.persen_bdd + '%</td><td style="padding:4px 10px;text-align:right">' + fmtPncNum(b.berat_kotor) + '</td><td style="padding:4px 10px;text-align:right">' + fmtPncNum(pSiswa) + '</td><td style="padding:4px 10px;text-align:right">' + fmtPncNum(b.kebutuhan_kg * sf) + '</td></tr>';
          }
        }
      }
    }
  }

  var thHtml = '<tr>';
  thHtml += '<th style="padding:8px 10px;text-align:left;background:#0369a1;color:#fff">Bahan Pangan</th>';
  thHtml += '<th style="padding:8px 10px;text-align:right;background:#0369a1;color:#fff">Berat Bersih (g)</th>';
  thHtml += '<th style="padding:8px 10px;text-align:right;background:#0369a1;color:#fff">BDD (%)</th>';
  thHtml += '<th style="padding:8px 10px;text-align:right;background:#0369a1;color:#fff">Berat Kotor (g)</th>';
  thHtml += '<th style="padding:8px 10px;text-align:right;background:#0369a1;color:#fff">Jumlah Siswa</th>';
  thHtml += '<th style="padding:8px 10px;text-align:right;background:#0369a1;color:#fff">Kebutuhan (kg)</th>';
  thHtml += '</tr>';

  var win = window.open('', '_blank');
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Perencanaan Kebutuhan Pangan' + getPorsiLabel() + '</title>';
  html += '<style>body{font-family:sans-serif;padding:30px 40px}';
  html += 'h1{font-size:16pt;margin-bottom:4px}';
  html += 'table{width:100%;border-collapse:collapse;font-size:9pt}';
  html += 'td,th{border:1px solid #ccc}';
  html += '@media print{body{padding:30px 40px}}</style></head><body>';
  html += '<h1>PERENCANAAN KEBUTUHAN PANGAN' + getPorsiLabel() + '</h1>';
  html += '<table><thead>' + thHtml + '</thead><tbody>' + tableHtml + '</tbody></table></body></html>';
  win.document.write(html);
  win.document.close();
  setTimeout(function() { win.print(); }, 500);
}

// ===== Buat Draft Purchase Request dari Siklus ===== (unchanged)
async function buatPrDariSiklus() {
  try {
    const siklusList = await api.get('/siklus');
    const aktif = siklusList.filter(s => s.status === 'Aktif');
    
    if (!aktif.length) {
      showAlert('Tidak ada siklus dengan status Aktif. Aktifkan siklus terlebih dahulu.', 'warning');
      return;
    }

    // Build modal body with checkboxes
    let bodyHtml = '<div class="space-y-2">';
    bodyHtml += '<p class="text-sm text-stone-500 mb-3">Pilih siklus yang akan dibuat Purchase Request:</p>';
    
    for (var i = 0; i < aktif.length; i++) {
      var s = aktif[i];
      var porsi = Number(s.jumlah_porsi) || Number(s.pm_porsi) || 0;
      var jenjang = typeof fmtJenjang === 'function' ? fmtJenjang(s.kategori_penerima) : (s.kategori_penerima || 'Semua');
      var hasNoJenjang = !s.kategori_penerima || s.kategori_penerima === 'null' || s.kategori_penerima === '[]';
      bodyHtml += '<label class="flex items-center gap-3 p-3 rounded-xl border ' + (hasNoJenjang ? 'border-amber-200 bg-amber-50/30' : 'border-stone-200 hover:border-emerald-300 hover:bg-emerald-50/30') + ' cursor-pointer transition-all duration-150">';
      bodyHtml += '<input type="checkbox" value="' + i + '" class="siklus-pr-cb cb-modern">';
      bodyHtml += '<div class="flex-1 min-w-0">';
      bodyHtml += '<div class="font-medium text-sm text-stone-800">' + s.nama + '</div>';
      bodyHtml += '<div class="text-xs text-stone-500 mt-0.5">' + jenjang + ' · ' + fmtPncNum(porsi) + ' porsi · ' + s.total_hari + ' hari · Status: <span class="font-semibold ' + (s.status === 'Aktif' ? 'text-emerald-600' : 'text-amber-600') + '">' + s.status + '</span></div>';
      if (hasNoJenjang && porsi < 1) {
        bodyHtml += '<div class="text-[10px] text-amber-600 mt-1 flex items-center gap-1"><svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg> Jenjang belum diatur — edit siklus untuk menetapkan kategori penerima</div>';
      }
      bodyHtml += '</div>';
      bodyHtml += '</label>';
    }
    bodyHtml += '</div>';

    // Set modal
    document.getElementById('modal-title').textContent = 'Buat Draft PR';
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-save').textContent = 'Buat PR (' + aktif.length + ' siklus)';
    document.getElementById('modal-save').onclick = async function() {
      var checked = document.querySelectorAll('.siklus-pr-cb:checked');
      var indices = Array.from(checked).map(function(cb) { return parseInt(cb.value); }).filter(function(i) { return !isNaN(i) && i >= 0 && i < aktif.length; });
      
      if (!indices.length) {
        showAlert('Pilih minimal satu siklus', 'warning');
        return;
      }

      closeModal();
      document.getElementById('modal-save').textContent = 'Simpan';
      showAlert('Membuat Draft PR untuk ' + indices.length + ' siklus...', 'info');

      var selectedSiklus = indices.map(function(i) { return aktif[i]; });
      var siklusIds = selectedSiklus.map(function(s) { return s.id; });

      try {
        const result = await api.post('/purchase_order/create-pr-from-siklus', { siklus_ids: siklusIds });
        if (result.ok) {
          showAlert(
            '✅ Draft PR berhasil dibuat!\n\n' +
            'No. PR: ' + result.no_pr + '\n' +
            'Total item: ' + result.total_items + ' bahan\n' +
            'Total nilai: Rp ' + fmtPncNum(result.total_nilai) + '\n\n' +
            'Cek di menu Pembelian → Purchase Order untuk melanjutkan.',
            'success'
          );
        } else {
          showAlert('Gagal: ' + (result.error || 'Unknown error'), 'error');
        }
      } catch (err) {
        showAlert('Gagal: ' + err.message, 'error');
      }
    };

    // Also reset save button text when modal is closed via cancel/X
    function resetSaveText() {
      document.getElementById('modal-save').textContent = 'Simpan';
    }
    document.getElementById('modal-cancel-btn').addEventListener('click', resetSaveText, { once: true });
    document.getElementById('modal-close-btn').addEventListener('click', resetSaveText, { once: true });

    // Show modal
    var modal = document.getElementById('modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  } catch (err) {
    showAlert('Gagal: ' + err.message, 'error');
  }
}
