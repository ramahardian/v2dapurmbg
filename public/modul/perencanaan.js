// ===== Perencanaan Kebutuhan Bahan Pangan =====
var _perencanaanData = null;
var _pncView = 'hari';

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

async function loadPerencanaanData(tanggalMulai) {
  const wrap = document.getElementById('perencanaan-content');
  if (!wrap) return;
  wrap.innerHTML = '<div class="flex items-center justify-center py-16"><svg class="animate-spin h-8 w-8 text-sky-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';

  try {
    const params = tanggalMulai ? '?tanggal_mulai=' + tanggalMulai : '';
    const res = await api.get('/siklus/laporan/perencanaan' + params);
    _perencanaanData = res;
    const { jenjang_list, hari, pm_map, tanggal_mulai } = res;

    let html = '';

    // Filter bar + view tabs
    html += '<div class="bg-white border border-stone-200 rounded-lg p-4 mb-4 flex flex-wrap items-center gap-4">';
    html += '<label class="text-sm font-medium text-stone-700">Tanggal Mulai Siklus:</label>';
    html += '<input type="date" value="' + (tanggal_mulai || '') + '" onchange="loadPerencanaanData(this.value)" class="h-10 px-3 border border-stone-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400">';

    // View tabs
    html += '<div class="flex rounded-lg border border-stone-200 overflow-hidden">';
    html += '<button onclick="switchPncView(\'hari\')" id="pnc-tab-hari" class="px-4 py-1.5 text-xs font-medium ' + (_pncView === 'hari' ? 'bg-sky-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-50') + '">Per Hari</button>';
    html += '<button onclick="switchPncView(\'rekap\')" id="pnc-tab-rekap" class="px-4 py-1.5 text-xs font-medium ' + (_pncView === 'rekap' ? 'bg-sky-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-50') + '">Rekap per Jenjang</button>';
    html += '</div>';


    html += '<button onclick="exportPncExcel()" class="px-2.5 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1 text-xs" title="Export Excel"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> XLSX</button>';
    html += '<button onclick="exportPncPdf()" class="px-2.5 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1 text-xs" title="Export PDF"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> PDF</button>';
    html += '<div class="text-xs text-stone-400">' + (hari ? hari.length + ' hari' : '0 hari') + '</div>';
    html += '</div>';

    if (!hari || !hari.length) {
      html += '<div class="text-center py-16 text-stone-400 bg-white border border-stone-200 rounded-lg"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg><div class="text-sm">Tidak ada data</div><div class="text-xs mt-1">Pastikan ada Siklus aktif dan Penerima Manfaat sudah diisi.</div></div>';
      wrap.innerHTML = html;
      return;
    }

    // Content
    html += '<div id="pnc-view-container">';
    html += buildPncCurrentView();
    html += '</div>';

    wrap.innerHTML = html;
  } catch (err) {
    wrap.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal: ' + err.message + '</div>';
  }
}

function switchPncView(view) {
  _pncView = view;
  var tH = document.getElementById('pnc-tab-hari');
  var tR = document.getElementById('pnc-tab-rekap');
  if (tH) tH.className = 'px-4 py-1.5 text-xs font-medium ' + (view === 'hari' ? 'bg-sky-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-50');
  if (tR) tR.className = 'px-4 py-1.5 text-xs font-medium ' + (view === 'rekap' ? 'bg-sky-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-50');
  var c = document.getElementById('pnc-view-container');
  if (c) { c.innerHTML = buildPncCurrentView(); c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

function buildPncCurrentView() {
  if (!_perencanaanData) return '';
  if (_pncView === 'rekap') return renderPerencanaanRekap(_perencanaanData);
  // Per Hari
  var html = '';
  var hari = _perencanaanData.hari || [];
  var jl = _perencanaanData.jenjang_list || [];
  for (var h = 0; h < hari.length; h++) html += renderPerencanaanDay(hari[h], jl);
  return html;
}

function renderPerencanaanDay(day, jenjangList) {
  var html = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden mb-6">';

  // Day header
  html += '<div class="px-5 py-3 bg-gradient-to-r from-sky-50 to-blue-50 border-b border-stone-200 flex items-center justify-between">';
  html += '<div><span class="font-bold text-base text-sky-800">' + day.header_tanggal + '</span>';
  html += '<span class="ml-3 text-sm text-stone-500">Total Porsi: <strong class="text-stone-700">' + fmtPncNum(day.total_porsi) + '</strong></span></div>';
  html += '</div>';

  if (!day.bahan || !day.bahan.length) {
    html += '<div class="text-sm text-stone-400 italic px-5 py-4">Tidak ada bahan untuk hari ini</div></div>';
    return html;
  }

  // Table
  html += '<div class="overflow-x-auto"><table class="w-full text-xs border-collapse">';
  html += '<thead><tr class="border-b border-stone-200 bg-stone-50">';
  html += '<th class="px-3 py-2 text-left font-semibold text-stone-600 min-w-[140px] whitespace-nowrap">Bahan Pangan</th>';
  for (var j = 0; j < jenjangList.length; j++) {
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">' + jenjangList[j] + '</th>';
  }
  html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Total Porsi</th>';
  html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Kebutuhan Pangan (kg)</th>';
  html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">1-10%</th>';
  html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Rincian</th>';
  html += '</tr></thead><tbody>';

  for (var i = 0; i < day.bahan.length; i++) {
    var b = day.bahan[i];
    html += '<tr class="border-b border-stone-100 hover:bg-stone-50/50">';
    html += '<td class="px-3 py-2 text-sm font-medium">' + (b.nama_display || b.nama) + '</td>';
    for (var j = 0; j < jenjangList.length; j++) {
      var pj = b.per_jenjang[jenjangList[j]];
      var val = pj != null ? (pj.kebutuhan_kg != null ? pj.kebutuhan_kg : pj) : null;
      html += '<td class="px-3 py-2 text-sm text-right mono">' + (val != null ? fmtPncNum(val) : '—') + '</td>';
    }
    html += '<td class="px-3 py-2 text-sm text-right mono">' + fmtPncNum(day.total_porsi) + '</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-semibold">' + fmtPncNum(b.total_kebutuhan_kg) + '</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-semibold text-sky-700">' + fmtPncNum(b.kebutuhan_buffer_kg) + '</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold">' + (b.keterangan ? b.keterangan + ' ' : '') + (b.rincian || '') + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table></div></div>';
  return html;
}

// ===== Rekap per Jenjang =====
function renderPerencanaanRekap(data) {
  var hari = data.hari || [];
  var jenjang_list = data.jenjang_list || [];
  var pm_map = data.pm_map || {};

  if (!hari.length) {
    return '<div class="text-center py-16 text-stone-400">Tidak ada data untuk direkap</div>';
  }

  var agg = {};

  for (var h = 0; h < hari.length; h++) {
    var day = hari[h];
    var bahan = day.bahan || [];
    for (var j = 0; j < jenjang_list.length; j++) {
      if (!agg[jenjang_list[j]]) agg[jenjang_list[j]] = {};
    }
    for (var i = 0; i < bahan.length; i++) {
      var b = bahan[i];
      var nama = b.nama || '';
      if (!nama) continue;
      for (var j = 0; j < jenjang_list.length; j++) {
        var jenjang = jenjang_list[j];
        var pj = b.per_jenjang && b.per_jenjang[jenjang];
        if (!pj) continue;
        var dayKg = Number(pj.kebutuhan_kg != null ? pj.kebutuhan_kg : pj) || 0;
        if (dayKg <= 0) continue;
        var bufPersen = b.buffer_persen != null ? b.buffer_persen : 10;
        if (!agg[jenjang][nama]) {
          agg[jenjang][nama] = {
            nama_display: b.nama_display || nama,
            kategori_sp: b.kategori_sp || '',
            ref_berat_bersih: pj.berat_bersih || 0,
            ref_persen_bdd: pj.persen_bdd || 0,
            ref_berat_kotor: pj.berat_kotor || 0,
            total_kebutuhan: 0,
            total_buffer: 0,
            buffer_persen: bufPersen,
          };
        }
        agg[jenjang][nama].total_kebutuhan += dayKg;
        agg[jenjang][nama].total_buffer += dayKg * (bufPersen / 100);
      }
    }
  }

  var KAT_ORDER = ['Karbohidrat', 'Protein Hewani', 'Protein Nabati', 'Sayur', 'Buah', 'Susu', 'Minyak'];
  var html = '';

  for (var j = 0; j < jenjang_list.length; j++) {
    var jenjang = jenjang_list[j];
    var bahanAgg = agg[jenjang];
    if (!bahanAgg) continue;
    var names = Object.keys(bahanAgg);
    if (!names.length) continue;

    names.sort(function(a, b) {
      var ka = KAT_ORDER.indexOf(bahanAgg[a].kategori_sp);
      var kb = KAT_ORDER.indexOf(bahanAgg[b].kategori_sp);
      if (ka === -1 && kb === -1) return a.localeCompare(b);
      if (ka === -1) return 1;
      if (kb === -1) return -1;
      return ka - kb;
    });

    var pmCount = Number(pm_map[jenjang]) || 0;
    var grandTtl = 0, grandBuf = 0;

    html += '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden mb-6">';
    html += '<div class="px-5 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-stone-200 flex items-center justify-between">';
    html += '<div><span class="font-bold text-base text-emerald-800">' + jenjang + '</span>';
    html += '<span class="ml-3 text-sm text-stone-500">' + hari.length + ' hari';
    if (pmCount > 0) html += ' &middot; ' + pmCount + ' penerima';
    html += '</span></div></div>';

    html += '<div class="overflow-x-auto"><table class="w-full text-xs border-collapse">';
    html += '<thead><tr class="border-b border-stone-200 bg-stone-50">';
    html += '<th class="px-3 py-2 text-left font-semibold text-stone-600 min-w-[140px] whitespace-nowrap">Bahan Pangan</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Berat Bersih (g)</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">%BDD</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Berat Kotor (g)</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Jml Siswa</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Kebutuhan (kg)</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">+' + (bahanAgg[names[0]] ? bahanAgg[names[0]].buffer_persen : 10) + '%</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Rincian</th>';
    html += '</tr></thead><tbody>';

    for (var i = 0; i < names.length; i++) {
      var b = bahanAgg[names[i]];
      var k = b.total_kebutuhan;
      var buf = b.total_buffer;
      var tot = k + buf;
      grandTtl += k; grandBuf += buf;
      var bufferPct = b.buffer_persen || 10;
      var bufAmt = k * (bufferPct / 100);
      var satuan = (b.kategori_sp === 'Buah' || b.kategori_sp === 'Susu') ? 'pcs' : 'kg';
      var rinci;
      if (b.kategori_sp === 'Minyak') {
        rinci = '';
      } else if (b.kategori_sp === 'Buah' || b.kategori_sp === 'Susu') {
        rinci = Math.ceil(pmCount * hari.length) + 'pcs';
      } else {
        rinci = Math.ceil(tot) + satuan;
      }

      html += '<tr class="border-b border-stone-100 hover:bg-stone-50/50">';
      html += '<td class="px-3 py-2 text-sm font-medium">' + b.nama_display + '</td>';
      html += '<td class="px-3 py-2 text-sm text-right mono">' + fmtPncNum(b.ref_berat_bersih) + '</td>';
      html += '<td class="px-3 py-2 text-sm text-right mono">' + (b.ref_persen_bdd ? b.ref_persen_bdd + '%' : '—') + '</td>';
      html += '<td class="px-3 py-2 text-sm text-right mono">' + fmtPncNum(b.ref_berat_kotor) + '</td>';
      html += '<td class="px-3 py-2 text-sm text-right mono font-semibold">' + pmCount + '</td>';
      html += '<td class="px-3 py-2 text-sm text-right mono font-semibold">' + fmtPncNum(k) + '</td>';
      html += '<td class="px-3 py-2 text-sm text-right mono font-semibold text-emerald-700">' + fmtPncNum(tot) + '</td>';
      html += '<td class="px-3 py-2 text-sm text-right mono font-bold">' + rinci + '</td>';
      html += '</tr>';
    }

    html += '<tr class="border-t-2 border-stone-300 bg-stone-50 font-semibold">';
    html += '<td class="px-3 py-2 text-sm font-bold text-stone-700">TOTAL</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-stone-700">—</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-stone-700">—</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-stone-700">—</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-stone-700">' + pmCount + '</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-stone-700">' + fmtPncNum(grandTtl) + '</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-stone-700">' + fmtPncNum(grandTtl + grandBuf) + '</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-stone-700">—</td>';
    html += '</tr></tbody></table></div></div>';
  }

  if (!html) html = '<div class="text-center py-16 text-stone-400 bg-white border border-stone-200 rounded-lg">Tidak ada data bahan untuk direkap per jenjang</div>';
  return html;
}

function fmtPncNum(v) {
  if (v == null || isNaN(v)) return '0,00';
  var n = Number(v);
  return n === Math.floor(n) ? String(n) : n.toFixed(2).replace('.', ',');
}

function exportPncExcel() {
  var data = _perencanaanData;
  if (!data || !data.hari || !data.hari.length) { showAlert('Tidak ada data', 'error'); return; }
  var hari = data.hari;
  var jl = data.jenjang_list || [];

  var rows = [];

  var headerRow = ['Bahan Pangan'].concat(jl).concat(['Total Porsi', 'Kebutuhan Pangan (kg)', '1-10%', 'Rincian']);
  rows.push(headerRow);

  for (var h = 0; h < hari.length; h++) {
    var day = hari[h];
    rows.push([day.header_tanggal, '', '', '', '', '', '', '', '', '']);
    if (day.bahan && day.bahan.length) {
      for (var i = 0; i < day.bahan.length; i++) {
        var b = day.bahan[i];
        var row = [b.nama_display || b.nama];
        for (var j = 0; j < jl.length; j++) {
          var pj = b.per_jenjang[jl[j]];
          var val = pj != null ? (pj.kebutuhan_kg != null ? pj.kebutuhan_kg : pj) : null;
          row.push(val != null ? Number(val) : '');
        }
        row.push(day.total_porsi);
        row.push(b.total_kebutuhan_kg != null ? Number(b.total_kebutuhan_kg) : '');
        row.push(b.kebutuhan_buffer_kg != null ? Number(b.kebutuhan_buffer_kg) : '');
        row.push(b.rincian || '');
        rows.push(row);
      }
    }
  }

  var wb = XLSX.utils.book_new();
  var ws = XLSX.utils.aoa_to_sheet(rows);

  var colW = [{ wch: 22 }];
  for (var j = 0; j < jl.length; j++) colW.push({ wch: 16 });
  colW.push({ wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 16 });
  ws['!cols'] = colW;

  XLSX.utils.book_append_sheet(wb, ws, 'Perencanaan');
  XLSX.writeFile(wb, 'Perencanaan Kebutuhan Pangan.xlsx');
}

function exportPncPdf() {
  var data = _perencanaanData;
  if (!data || !data.hari || !data.hari.length) { showAlert('Tidak ada data', 'error'); return; }
  var hari = data.hari;
  var jl = data.jenjang_list || [];

  var tableHtml = '';
  for (var h = 0; h < hari.length; h++) {
    var day = hari[h];
    tableHtml += '<tr><td colspan="' + (jl.length + 4) + '" style="font-weight:700;background:#e0f2fe;padding:8px 10px;font-size:11pt">' + day.header_tanggal + '</td></tr>';
    if (day.bahan && day.bahan.length) {
      for (var i = 0; i < day.bahan.length; i++) {
        var b = day.bahan[i];
        tableHtml += '<tr>';
        tableHtml += '<td style="padding:4px 10px;font-weight:500">' + (b.nama_display || b.nama) + '</td>';
        for (var j = 0; j < jl.length; j++) {
          var pj = b.per_jenjang[jl[j]];
          var val = pj != null ? (pj.kebutuhan_kg != null ? pj.kebutuhan_kg : pj) : null;
          tableHtml += '<td style="padding:4px 10px;text-align:right">' + (val != null ? Number(val).toFixed(2).replace('.', ',') : '—') + '</td>';
        }
        tableHtml += '<td style="padding:4px 10px;text-align:right">' + day.total_porsi + '</td>';
        tableHtml += '<td style="padding:4px 10px;text-align:right;font-weight:600">' + (b.total_kebutuhan_kg != null ? Number(b.total_kebutuhan_kg).toFixed(2).replace('.', ',') : '') + '</td>';
        tableHtml += '<td style="padding:4px 10px;text-align:right;font-weight:600">' + (b.kebutuhan_buffer_kg != null ? Number(b.kebutuhan_buffer_kg).toFixed(2).replace('.', ',') : '') + '</td>';
        tableHtml += '<td style="padding:4px 10px;text-align:right;font-weight:600">' + (b.rincian || '') + '</td>';
        tableHtml += '</tr>';
      }
    }
  }

  var thHtml = '<tr>';
  thHtml += '<th style="padding:8px 10px;text-align:left;background:#0369a1;color:#fff">Bahan Pangan</th>';
  for (var j = 0; j < jl.length; j++) {
    thHtml += '<th style="padding:8px 10px;text-align:right;background:#0369a1;color:#fff">' + jl[j] + '</th>';
  }
  thHtml += '<th style="padding:8px 10px;text-align:right;background:#0369a1;color:#fff">Total Porsi</th>';
  thHtml += '<th style="padding:8px 10px;text-align:right;background:#0369a1;color:#fff">Kebutuhan (kg)</th>';
  thHtml += '<th style="padding:8px 10px;text-align:right;background:#0369a1;color:#fff">1-10%</th>';
  thHtml += '<th style="padding:8px 10px;text-align:right;background:#0369a1;color:#fff">Rincian</th>';
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

// ===== Buat Draft Purchase Request dari Siklus =====
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
      bodyHtml += '<label class="flex items-center gap-3 p-3 rounded-xl border border-stone-200 hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer transition-all duration-150">';
      bodyHtml += '<input type="checkbox" value="' + i + '" class="siklus-pr-cb cb-modern">';
      bodyHtml += '<div class="flex-1 min-w-0">';
      bodyHtml += '<div class="font-medium text-sm text-stone-800">' + s.nama + '</div>';
      bodyHtml += '<div class="text-xs text-stone-500 mt-0.5">' + jenjang + ' · ' + fmtPncNum(porsi) + ' porsi · ' + s.total_hari + ' hari · Status: <span class="font-semibold text-emerald-600">' + s.status + '</span></div>';
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

// Format number helper (gunakan yang sudah ada: fmtPncNum di file ini)
