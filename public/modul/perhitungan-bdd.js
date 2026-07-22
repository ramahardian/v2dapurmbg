// ===== Perhitungan BDD & Kebutuhan Bahan Pangan per Menu (Khusus Ahli Gizi) =====
async function renderPerhitunganBdd() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/perhitungan-bdd', { credentials: 'include' });
    if (!r.ok) throw new Error((await r.json()).error || 'Gagal memuat');
    c.innerHTML = await r.text();
    var pendingId = window._pbdPendingSiklusId;
    window._pbdPendingSiklusId = null;
    await loadPbdData(pendingId || undefined);
  } catch (err) {
    c.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat: ' + err.message + '</div>';
  }
}

async function loadPbdData(siklusId) {
  const wrap = document.getElementById('pbd-content');
  if (!wrap) return;
  wrap.innerHTML = '<div class="flex items-center justify-center py-16"><svg class="animate-spin h-8 w-8 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';

  try {
    const params = siklusId ? '?siklus_id=' + siklusId : '';
    const res = await api.get('/siklus/laporan/kebutuhan-per-menu' + params);
    const { siklus_list, selected_siklus_id, jenjang_list, data } = res;

    let html = '';

    // Filter Siklus
    html += renderPbdFilter(siklus_list, selected_siklus_id);

    if (!data || !data.length) {
      html += '<div class="text-center py-16 text-stone-400 bg-white border border-stone-200 rounded-lg"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg><div class="text-sm">Tidak ada data untuk ditampilkan</div><div class="text-xs mt-1">Pilih siklus dengan status Aktif atau pastikan Penerima Manfaat sudah diisi.</div></div>';
      wrap.innerHTML = html;
      return;
    }

    window._pbdData = data;

    // Render per jenjang
    for (var j = 0; j < data.length; j++) {
      html += renderPbdJenjangSection(data[j], j);
    }

    // Legenda
    html += '<div class="bg-white border border-stone-200 rounded-lg p-4 mt-4 text-xs text-stone-500">';
    html += '<div class="font-semibold text-stone-700 mb-2">Keterangan:</div>';
    html += '<ul class="space-y-1 list-disc list-inside">';
    html += '<li><strong>Berat Bersih</strong> = Jumlah bahan per porsi (gram) — dihitung dari SP × Berat 1 SP atau dari data Menu</li>';
    html += '<li><strong>BDD%</strong> = <em>Bahan Dapat Dimakan</em> — persentase bagian yang dapat dikonsumsi. Sumber: <span class="text-emerald-600 font-medium">SP Referensi</span> (prioritas) atau data <span class="text-stone-500">Bahan Baku</span></li>';
    html += '<li><strong>Berat Kotor</strong> = Berat Bersih ÷ (BDD ÷ 100)</li>';
    html += '<li><strong>Kebutuhan (kg)</strong> = Berat Kotor × Jumlah Siswa ÷ 1000</li>';
    html += '</ul></div>';

    wrap.innerHTML = html;
  } catch (err) {
    wrap.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal: ' + err.message + '</div>';
  }
}

function renderPbdFilter(siklusList, selectedId) {
  var html = '<div class="bg-white border border-stone-200 rounded-lg p-4 mb-4 flex flex-wrap items-center gap-4">';
  html += '<label class="text-sm font-medium text-stone-700">Filter Siklus:</label>';
  html += '<select onchange="loadPbdData(this.value)" class="h-10 px-3 border border-stone-200 rounded-xl text-sm bg-white min-w-[200px] focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">';
  html += '<option value="">— Semua Siklus Aktif —</option>';
  for (var i = 0; i < siklusList.length; i++) {
    var s = siklusList[i];
    html += '<option value="' + s.id + '" ' + (selectedId && Number(selectedId) === s.id ? 'selected' : '') + '>' + s.nama + ' (' + s.status + ')' + '</option>';
  }
  html += '</select>';
  html += '<div class="text-xs text-stone-400 ml-auto">' + siklusList.length + ' siklus tersedia</div>';
  html += '</div>';
  return html;
}

function renderPbdJenjangSection(jd, idx) {
  var html = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden mb-6">';

  // Jenjang header
  var jColors = ['bg-blue-50 text-blue-800', 'bg-emerald-50 text-emerald-800', 'bg-amber-50 text-amber-800', 'bg-violet-50 text-violet-800', 'bg-cyan-50 text-cyan-800', 'bg-rose-50 text-rose-800'];
  var jIdx = ['TK/PAUD','SD/MI (1-3)','SD/MI (4-6)','SMP/MTs, SMA/SMK','Bumil/Busui','Balita'].indexOf(jd.jenjang);
  if (jIdx < 0) jIdx = 0;
  html += '<div class="px-5 py-4 border-b border-stone-200 flex items-center justify-between ' + jColors[jIdx % jColors.length] + '">';
  html += '<div><span class="font-bold text-base">' + jd.jenjang + '</span>';
  html += '<span class="ml-3 text-sm font-normal">Jumlah Siswa: <strong>' + fmtPbdNum(jd.jumlah_siswa) + '</strong> orang</span></div>';
  html += '<div class="flex items-center gap-2 text-xs">';
  html += '<span>' + jd.siklus.length + ' siklus</span>';
  html += '<button onclick="exportPbdExcel(' + idx + ')" class="px-2.5 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1 text-xs" title="Export Excel"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> XLSX</button>';
  html += '<button onclick="exportPbdPdf(' + idx + ')" class="px-2.5 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1 text-xs" title="Export PDF"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> PDF</button>';
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
        html += '<button onclick="switchPbdTab(event, this)" class="px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-all ' + (isFirst ? 'bg-white shadow-sm font-bold text-emerald-700' : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200/50') + '" role="tab" aria-selected="' + (isFirst ? 'true' : 'false') + '">' + day.hari_nama + '</button>';
      }
      html += '</div></div>';
    }

    // Per hari — only active day visible
    for (var h = 0; h < sk.hari.length; h++) {
      var day = sk.hari[h];
      html += '<div class="pbd-day-content' + (h > 0 ? ' hidden' : '') + '" role="tabpanel">';
      html += renderPbdMenuTable(day, jd.jumlah_siswa);
      html += '</div>';
    }
  }

  html += '</div>';
  return html;
}

function renderPbdMenuTable(day, jumlahSiswa) {
  var html = '<div class="px-5 py-3 border-b border-stone-100 bg-stone-50/30">';

  // Menu header
  html += '<div class="flex items-center gap-3 mb-2">';
  html += '<span class="inline-block px-3 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-sm font-bold">' + day.menu_label + '</span>';
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
    html += '<td class="px-2 py-1.5 text-sm text-right mono">' + fmtPbdNum(b.berat_bersih) + '</td>';
    html += '<td class="px-2 py-1.5 text-sm text-right mono ' + (sumberBdd ? 'text-emerald-600 font-semibold' : '') + '">' + b.persen_bdd + '%</td>';
    html += '<td class="px-2 py-1.5 text-sm text-right mono">' + fmtPbdNum(b.berat_kotor) + '</td>';
    html += '<td class="px-2 py-1.5 text-sm text-right mono">' + fmtPbdNum(jumlahSiswa) + '</td>';
    html += '<td class="px-2 py-1.5 text-sm text-right mono font-bold text-emerald-700">' + fmtPbdNum(b.kebutuhan_kg) + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table></div></div>';
  return html;
}

function switchPbdTab(event, btn) {
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

  btn.className = 'px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-all bg-white shadow-sm font-bold text-emerald-700';
  btn.setAttribute('aria-selected', 'true');

  var section = tabBar.closest('.bg-white');
  var contents = section.querySelectorAll('.pbd-day-content');
  for (var i = 0; i < contents.length; i++) {
    contents[i].classList.add('hidden');
  }
  if (contents[idx]) contents[idx].classList.remove('hidden');
}

function fmtPbdNum(v) {
  if (v == null || isNaN(v)) return '0,00';
  var n = Number(v);
  return n === Math.floor(n) ? String(n) : n.toFixed(2).replace('.', ',');
}

function exportPbdPdf(idx) {
  var data = window._pbdData;
  if (!data || !data[idx]) { showAlert('Data tidak tersedia', 'error'); return; }
  var jd = data[idx];

  var rowsHtml = '';
  for (var s = 0; s < jd.siklus.length; s++) {
    var sk = jd.siklus[s];
    for (var h = 0; h < sk.hari.length; h++) {
      var day = sk.hari[h];
      rowsHtml += '<tr><td colspan="6" style="font-weight:700;background:#f0f0f0;padding:6px 10px">' + day.menu_label + ' — ' + day.hari_nama + '</td></tr>';
      if (day.bahan && day.bahan.length) {
        for (var i = 0; i < day.bahan.length; i++) {
          var b = day.bahan[i];
          rowsHtml += '<tr><td style="padding:4px 10px">' + b.nama_display + '</td><td style="padding:4px 10px;text-align:right">' + b.berat_bersih + '</td><td style="padding:4px 10px;text-align:right">' + b.persen_bdd + '%</td><td style="padding:4px 10px;text-align:right">' + b.berat_kotor + '</td><td style="padding:4px 10px;text-align:right">' + jd.jumlah_siswa + '</td><td style="padding:4px 10px;text-align:right">' + b.kebutuhan_kg + '</td></tr>';
        }
      }
    }
  }

  var win = window.open('', '_blank');
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>BDD - ' + jd.jenjang + '</title>';
  html += '<style>body{font-family:sans-serif;padding:30px 40px}';
  html += 'h1{font-size:16pt;margin-bottom:4px}h2{font-size:11pt;color:#555;font-weight:400;margin-top:0;margin-bottom:16px}';
  html += 'table{width:100%;border-collapse:collapse;font-size:10pt}';
  html += 'th{background:#166534;color:#fff;padding:8px 10px;text-align:right}';
  html += 'th:first-child{text-align:left}';
  html += 'td,th{border:1px solid #ccc}';
  html += '@media print{body{padding:30px 40px}}</style></head><body>';
  html += '<h1>Perhitungan BDD — ' + jd.jenjang + '</h1>';
  html += '<h2>Jumlah Siswa: ' + jd.jumlah_siswa + ' orang | ' + jd.siklus.length + ' siklus</h2>';
  html += '<table><thead><tr>';
  html += '<th style="text-align:left">Bahan Pangan</th>';
  html += '<th>Berat Bersih (g)</th>';
  html += '<th>BDD (%)</th>';
  html += '<th>Berat Kotor (g)</th>';
  html += '<th>Jumlah Siswa</th>';
  html += '<th>Kebutuhan (kg)</th>';
  html += '</tr></thead><tbody>';
  html += rowsHtml;
  html += '</tbody></table></body></html>';
  win.document.write(html);
  win.document.close();
  setTimeout(function() { win.print(); }, 500);
}

function exportPbdExcel(idx) {
  var data = window._pbdData;
  if (!data || !data[idx]) { showAlert('Data tidak tersedia', 'error'); return; }
  var jd = data[idx];

  var rows = [];

  var headerRow = ['Menu', 'Bahan Pangan', 'Berat Bersih (g)', 'Persen BDD', 'Berat Kotor (g)', 'Jumlah Siswa', 'Kebutuhan (kg)'];
  rows.push(headerRow);

  for (var s = 0; s < jd.siklus.length; s++) {
    var sk = jd.siklus[s];
    for (var h = 0; h < sk.hari.length; h++) {
      var day = sk.hari[h];
      var menuLabel = day.menu_label + ' — ' + day.hari_nama;
      if (!day.bahan || !day.bahan.length) {
        rows.push([menuLabel, '', '', '', '', '', '']);
      } else {
        rows.push([menuLabel, day.bahan[0].nama_display, day.bahan[0].berat_bersih, day.bahan[0].persen_bdd + '%', day.bahan[0].berat_kotor, jd.jumlah_siswa, day.bahan[0].kebutuhan_kg]);
        for (var i = 1; i < day.bahan.length; i++) {
          var b = day.bahan[i];
          rows.push(['', b.nama_display, b.berat_bersih, b.persen_bdd + '%', b.berat_kotor, jd.jumlah_siswa, b.kebutuhan_kg]);
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

  XLSX.utils.book_append_sheet(wb, ws, jd.jenjang);
  XLSX.writeFile(wb, 'BDD - ' + jd.jenjang + '.xlsx');
}
