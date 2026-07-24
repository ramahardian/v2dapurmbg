// ===== Perencanaan Kebutuhan Bahan Pangan (per Menu) =====
var _pncData = null;
var _pncSelectedJenjang = 'SEMUA';
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
      html += '</div></div></div>';

      wrap.innerHTML = html;
      return;
    }

    if (!data || !data.length) {
      html += '<div class="text-center py-16 text-stone-400 bg-white border border-stone-200 rounded-lg"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg><div class="text-sm">Tidak ada data</div><div class="text-xs mt-1">Pastikan siklus sudah memiliki menu dengan bahan baku yang terisi.</div></div>';
      wrap.innerHTML = html;
      return;
    }

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

function renderPncJenjangSection(jd, idx) {
  var jIdx = _pncJenjangOrder.indexOf(jd.jenjang);
  if (jIdx < 0) jIdx = idx % _pncJenjangColors.length;
  var visible = _pncSelectedJenjang === 'SEMUA' || _pncSelectedJenjang === jd.jenjang;

  var html = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden mb-6" data-pnc-section="' + jd.jenjang.replace(/"/g, '&quot;') + '" style="' + (visible ? '' : 'display:none') + '">';

  // Jenjang header
  html += '<div class="px-5 py-4 border-b border-stone-200 flex items-center justify-between ' + _pncJenjangColors[jIdx % _pncJenjangColors.length] + '">';
  html += '<div><span class="font-bold text-base">' + jd.jenjang + '</span>';
  html += '<span class="ml-3 text-sm font-normal">Jumlah Siswa: <strong>' + fmtPncNum(jd.jumlah_siswa) + '</strong> orang</span></div>';
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
      html += renderPncMenuTable(day, jd.jumlah_siswa);
      html += '</div>';
    }
  }

  html += '</div>';
  return html;
}

function renderPncMenuTable(day, jumlahSiswa) {
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
    html += '<tr class="border-b border-stone-100 hover:bg-stone-50/50">';
    html += '<td class="px-2 py-1.5 text-sm font-medium">' + b.nama_display + '</td>';
    html += '<td class="px-2 py-1.5 text-sm text-right mono">' + fmtPncNum(b.berat_bersih) + '</td>';
    html += '<td class="px-2 py-1.5 text-sm text-right mono ' + (sumberBdd ? 'text-emerald-600 font-semibold' : '') + '">' + b.persen_bdd + '%</td>';
    html += '<td class="px-2 py-1.5 text-sm text-right mono">' + fmtPncNum(b.berat_kotor) + '</td>';
    html += '<td class="px-2 py-1.5 text-sm text-right mono">' + fmtPncNum(jumlahSiswa) + '</td>';
    html += '<td class="px-2 py-1.5 text-sm text-right mono font-bold text-sky-700">' + fmtPncNum(b.kebutuhan_kg) + '</td>';
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

function exportPncExcel(jenjang) {
  var exportData = collectPncExportData(jenjang || undefined);
  if (!exportData.length) { showAlert('Tidak ada data', 'error'); return; }

  var rows = [];
  var headerRow = ['Menu', 'Bahan Pangan', 'Berat Bersih (g)', 'Persen BDD', 'Berat Kotor (g)', 'Jumlah Siswa', 'Kebutuhan (kg)'];
  rows.push(headerRow);

  for (var j = 0; j < exportData.length; j++) {
    var jd = exportData[j];
    rows.push(['JENJANG: ' + jd.jenjang + ' (Siswa: ' + jd.jumlah_siswa + ')']);
    for (var s = 0; s < jd.siklus.length; s++) {
      var sk = jd.siklus[s];
      for (var h = 0; h < sk.hari.length; h++) {
        var day = sk.hari[h];
        var menuLabel = day.menu_label + ' — ' + day.hari_nama;
        if (!day.bahan || !day.bahan.length) {
          rows.push([menuLabel, '', '', '', '', '', '']);
        } else {
          rows.push([menuLabel, day.bahan[0].nama_display, fmtPncNum(day.bahan[0].berat_bersih), day.bahan[0].persen_bdd + '%', fmtPncNum(day.bahan[0].berat_kotor), fmtPncNum(jd.jumlah_siswa), fmtPncNum(day.bahan[0].kebutuhan_kg)]);
          for (var i = 1; i < day.bahan.length; i++) {
            var b = day.bahan[i];
            rows.push(['', b.nama_display, fmtPncNum(b.berat_bersih), b.persen_bdd + '%', fmtPncNum(b.berat_kotor), fmtPncNum(jd.jumlah_siswa), fmtPncNum(b.kebutuhan_kg)]);
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

  XLSX.utils.book_append_sheet(wb, ws, 'Perencanaan');
  XLSX.writeFile(wb, 'Perencanaan Kebutuhan Pangan.xlsx');
}

function exportPncPdf(jenjang) {
  var exportData = collectPncExportData(jenjang || undefined);
  if (!exportData.length) { showAlert('Tidak ada data', 'error'); return; }

  var tableHtml = '';
  for (var j = 0; j < exportData.length; j++) {
    var jd = exportData[j];
    tableHtml += '<tr><td colspan="6" style="font-weight:700;background:#e0f2fe;padding:8px 10px;font-size:11pt">' + jd.jenjang + ' — Jumlah Siswa: ' + jd.jumlah_siswa + '</td></tr>';
    for (var s = 0; s < jd.siklus.length; s++) {
      var sk = jd.siklus[s];
      for (var h = 0; h < sk.hari.length; h++) {
        var day = sk.hari[h];
        tableHtml += '<tr><td colspan="6" style="font-weight:600;background:#f0f0f0;padding:6px 10px">' + day.menu_label + ' — ' + day.hari_nama + ' (' + sk.siklus_nama + ')' + '</td></tr>';
        if (day.bahan && day.bahan.length) {
          for (var i = 0; i < day.bahan.length; i++) {
            var b = day.bahan[i];
            tableHtml += '<tr><td style="padding:4px 10px">' + b.nama_display + '</td><td style="padding:4px 10px;text-align:right">' + fmtPncNum(b.berat_bersih) + '</td><td style="padding:4px 10px;text-align:right">' + b.persen_bdd + '%</td><td style="padding:4px 10px;text-align:right">' + fmtPncNum(b.berat_kotor) + '</td><td style="padding:4px 10px;text-align:right">' + fmtPncNum(jd.jumlah_siswa) + '</td><td style="padding:4px 10px;text-align:right">' + fmtPncNum(b.kebutuhan_kg) + '</td></tr>';
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
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Perencanaan Kebutuhan Pangan</title>';
  html += '<style>body{font-family:sans-serif;padding:30px 40px}';
  html += 'h1{font-size:16pt;margin-bottom:4px}';
  html += 'table{width:100%;border-collapse:collapse;font-size:9pt}';
  html += 'td,th{border:1px solid #ccc}';
  html += '@media print{body{padding:30px 40px}}</style></head><body>';
  html += '<h1>PERENCANAAN KEBUTUHAN PANGAN</h1>';
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
