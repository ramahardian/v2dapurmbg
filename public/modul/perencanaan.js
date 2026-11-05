// ===== Perencanaan Kebutuhan Bahan Pangan (per Menu) =====
var _pncData = null;
var _pncSelectedJenjang = 'SEMUA';
var _pncSelectedPorsi = 'TOTAL';
var _pncSiklusId = '';
var _pncSiklusList = []; // daftar SEMUA siklus aktif untuk dropdown (respons per-siklus hanya berisi 1 siklus)
var _pncAllJenjangData = null;


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
    c.innerHTML = '<div class="dash-panel bg-white border border-red-200 text-red-700 p-4 rounded-lg shadow-sm">Gagal memuat: ' + err.message + '</div>';
  }
}

function adjustExportVisibilityForEmptyData() {
  const globalExport = document.querySelector('button[onclick*="exportPncExcel()\"][title*="Export All Excel\"]');
  const planningTitle = document.querySelector('.bg-gradient-to-br div h2');
  const planningContent = document.getElementById('perencanaan-content');
  
  if (planningTitle && planningContent) {
    const titleText = planningTitle.textContent || '';
    const hasContent = planningContent.innerHTML.includes('data-sold');
    
    if (globalExport) {
      globalExport.style.display = hasContent ? '' : 'none';
    }
    
    const statusMessage = document.querySelector('.rounded-lg.border.border-amber-200.bg-amber-50');
    if (statusMessage && !hasContent) {
      statusMessage.style.display = '';
    } else if (statusMessage) {
      statusMessage.style.display = 'none';
    }
  }
}

async function loadPerencanaanData(siklusId) {
  const wrap = document.getElementById('perencanaan-content');
  if (!wrap) return;
  wrap.innerHTML = '<div class="flex items-center justify-center py-16"><svg class="animate-spin h-8 w-8 text-sky-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';

  try {
    let res;
    if (siklusId) {
      // Ganti filter: muat data untuk siklus terpilih
      res = await api.get('/siklus/laporan/kebutuhan-per-menu?siklus_id=' + siklusId);
      _pncSiklusId = String(siklusId);
    } else {
      // Muat daftar SEMUA siklus aktif (untuk dropdown), lalu default ke siklus pertama
      res = await api.get('/siklus/laporan/kebutuhan-per-menu');
      _pncSiklusList = res.siklus_list || [];
      if (_pncSiklusList.length) _pncSiklusId = String(_pncSiklusList[0].id);
      if (!res._validation && _pncSiklusList.length) {
        res = await api.get('/siklus/laporan/kebutuhan-per-menu?siklus_id=' + _pncSiklusId);
      }
    }
    // Dropdown selalu memakai daftar SEMUA siklus aktif, bukan hanya siklus terpilih
    const siklus_list = _pncSiklusList.length ? _pncSiklusList : (res.siklus_list || []);
    const { selected_siklus_id, jenjang_list, data, _validation } = res;

    _pncAllJenjangData = data;
    _pncData = { jenjang_list, data };

    let html = '';

    // Filter bar
    html += '<div class="bg-white border border-slate-200 rounded-lg p-4 mb-4 flex flex-wrap items-center gap-4">';

    // Siklus filter
    html += '<label class="text-sm font-medium text-slate-700">Filter Siklus:</label>';
    html += '<select onchange="onSiklusFilterChange(this)" class="h-10 px-3 border border-slate-200 rounded-lg text-sm bg-white min-w-[200px] focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400">';
    for (var i = 0; i < siklus_list.length; i++) {
      var s = siklus_list[i];
      var sel = String(_pncSiklusId) === String(s.id);
      html += '<option value="' + s.id + '" ' + (sel ? 'selected' : '') + '>' + s.nama + ' (' + s.status + ')' + '</option>';
    }
    html += '</select>';

    // View indicator
    html += '<div class="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">Rekap Porsi</div>';

    html += '<button onclick="exportPncExcel()" class="px-2.5 py-1.5 rounded bg-slate-600 text-white hover:bg-slate-700 transition-colors flex items-center gap-1 text-xs" title="Export All Excel"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Export All XLSX</button>';
    html += '<div class="text-xs text-slate-400">' + data.length + ' jenjang</div>';
    html += '</div>';

    // ── Tampilkan validasi jika ada ──
    if (_validation) {
      var vl = _validation;
      var colors = { 'no_siklus': 'amber', 'no_target': 'orange', 'no_pm_match': 'amber' };
      var c = colors[vl.level] || 'stone';
      html += '<div class="rounded-lg border border-' + c + '-200 bg-' + c + '-50 p-5 mb-4">';
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
      html += '<div class="rounded-lg border border-amber-200 bg-amber-50 p-5 mb-4">';
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

    // Container untuk tabel Perencanaan Final (matriks) — diisi async
    html += '<div id="pnc-matriks-container"></div>';

    wrap.innerHTML = html;

    // Muat tabel matriks Perencanaan Final di bawah Rekap Porsi Besar & Kecil
    loadPncMatriksPerencanaan(_pncSiklusId);

    // Adjust export button visibility based on data availability
    setTimeout(adjustExportVisibilityForEmptyData, 100);
  } catch (err) {
    wrap.innerHTML = '<div class="dash-panel bg-white border border-red-200 text-red-700 p-4 rounded-lg shadow-sm">Gagal: ' + err.message + '</div>';
  }
}

// ── Tabel Perencanaan Final (format matriks, sama seperti halaman Total Kebutuhan) ──
var _pncMatriksReq = 0;
var _pncMatriksHari = [];   // data hari terakhir yang dirender (dipakai modal edit bahan)
var _pncBahanCache = null;  // cache daftar bahan baku untuk pilihan ganti bahan

function onSiklusFilterChange(selectEl) {
  const siklusId = selectEl.value || '';
  _pncSiklusId = siklusId;
  loadPerencanaanData(siklusId);
}

async function loadPncMatriksPerencanaan(siklusId) {
  const container = document.getElementById('pnc-matriks-container');
  if (!container) return;

  // Request token: abaikan respons lama jika user cepat berpindah filter
  const reqId = ++_pncMatriksReq;

  const params = new URLSearchParams();
  if (siklusId) params.set('siklus_id', siklusId);
  const qs = params.toString() ? '?' + params.toString() : '';

  container.innerHTML = '<div class="flex items-center justify-center py-10"><svg class="animate-spin h-6 w-6 text-sky-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';

  try {
    const res = await api.get('/siklus/laporan/perencanaan' + qs);
    if (reqId !== _pncMatriksReq) return; // respons basi, ada filter baru
    const { hari, pm_map, _validation, sync } = res;
    _pncMatriksHari = hari || [];

    if (_validation || !hari || !hari.length) {
      container.innerHTML = '';
      return;
    }

    // Hitung total siswa semua jenjang
    var totalSiswaSemuaJenjang = 0;
    if (pm_map) {
      for (var key in pm_map) totalSiswaSemuaJenjang += Number(pm_map[key]) || 0;
    }

    let html = '';

    // ── Peringatan jika jumlah_porsi siklus jauh lebih besar dari siswa aktual ──
    if (sync && sync.inflating) {
      var inflasiPct = Math.round((sync.factor - 1) * 100);
      html += '<div class="mt-6 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">';
      html += '<div class="flex items-start gap-3">';
      html += '<svg class="w-5 h-5 shrink-0 mt-0.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>';
      html += '<div>';
      html += '<div class="font-semibold text-sm text-amber-800">Angka kebutuhan berpotensi menggembung (' + inflasiPct + '% lebih tinggi)</div>';
      html += '<div class="text-xs text-amber-700 mt-1 leading-relaxed">Jumlah porsi siklus (<b>' + fmtPncNum(sync.stored_total) + '</b>) jauh lebih besar dari jumlah siswa aktual (<b>' + fmtPncNum(sync.pm_total) + '</b>). Semua angka kebutuhan otomatis dinaikkan sebanding jumlah porsi tersebut. Periksa kembali <b>Jumlah Porsi</b> di menu <a href="/siklus" onclick="return loadPage(\'siklus\')" class="font-semibold underline hover:no-underline">Siklus</a> agar sesuai dengan data Penerima Manfaat.</div>';
      html += '</div></div></div>';
    }

    html += '<div class="mt-6 mb-3 flex flex-wrap items-center gap-2 justify-between w-full">';
    html += '<div class="flex items-center gap-2 flex-1 min-w-0">';
    html += '<svg class="w-5 h-5 text-sky-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><rect x="8" y="13" width="3" height="4"/><rect x="13" y="11" width="3" height="6"/></svg>';
    html += '<div class="min-w-0">';
    html += '<span class="text-sm font-bold text-slate-700 truncate block">Perencanaan Final — Kebutuhan Bahan per Hari</span>';
    html += '<span class="text-xs text-slate-400 truncate block">(format matriks, sesuai contoh)</span>';
    html += '</div></div>';
    html += '<button onclick="exportPncFinalXlsx()" class="inline-flex items-center gap-1.5 text-[11px] font-medium text-white bg-[#14326b] hover:bg-[#0f2a5f] px-3 py-2 rounded-lg shadow-sm transition-colors shrink-0" title="Export Perencanaan Final ke Excel (template FINAL-PERENCANAAN.xlsx)">';
    html += '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> EXPORT FINAL XLSX';
    html += '</button>';
    html += '</div>';
    html += renderPncMatriksFinal(hari, totalSiswaSemuaJenjang);

    container.innerHTML = html;
  } catch (err) {
    if (reqId !== _pncMatriksReq) return;
    container.innerHTML = '';
  }
}

// ── Perencanaan Final Matriks (gabungan semua siklus, kartu full-width) ──
function renderPncMatriksFinal(hari, totalSiswaSemuaJenjang) {
  if (!hari || !hari.length) return '';
  
  var tkJenjangOrder = ['TK/PAUD', 'SD/MI (1-3)', 'SD/MI (4-6)', 'SMP/MTs, SMA/SMK', 'Bumil/Busui', 'Balita'];
  var tkBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function tkFmtTanggal(headerTanggal, hariNama) {
    var p = String(headerTanggal || '').split('-');
    var dd = parseInt(p[2], 10);
    var mm = parseInt(p[1], 10) - 1;
    if (p.length !== 3 || isNaN(dd) || isNaN(mm) || !tkBulan[mm]) return headerTanggal || (hariNama || '');
    return (hariNama || '') + ', ' + dd + ' ' + tkBulan[mm] + ' ' + p[0];
  }

  var totalPorsiDay = totalSiswaSemuaJenjang > 0 ? totalSiswaSemuaJenjang : (Number(hari[0] && hari[0].total_porsi) || 0);

  // Kartu per hari full-width (stacked), sehingga matriks memakai seluruh lebar konten
  var html = '<div class="space-y-4">';

  for (var d = 0; d < hari.length; d++) {
    var day = hari[d];
    if (!day.bahan || !day.bahan.length) continue;

    // Day card
    html += '<div class="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">';

    // Day header
    html += '<div class="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3 flex-wrap">';
    html += '<span class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 font-bold text-sm">M' + (d + 1) + '</span>';
    html += '<div class="min-w-0 flex-1">';
    html += '<div class="font-semibold text-sm text-emerald-800 truncate">' + tkFmtTanggal(day.header_tanggal, day.hari_nama) + '</div>';
    if (day.menu_names && day.menu_names.length) {
      html += '<div class="text-xs text-slate-500 mt-0.5 truncate">' + day.menu_names.join(' + ') + '</div>';
    }
    html += '</div>';
    html += '<div class="text-xs text-slate-500 shrink-0">Total Porsi: <strong class="text-emerald-700">' + fmtPncNum(totalPorsiDay) + '</strong></div>';
    html += '</div>';

    // ── Matriks: baris = bahan, kolom = jenjang ──
    html += '<div class="overflow-x-auto p-4"><table class="w-full text-xs border-collapse">';
    html += '<thead><tr class="border-b border-slate-200 bg-slate-50">';
    html += '<th class="px-3 py-2 text-left font-semibold text-slate-600 min-w-[140px]">Bahan Pangan</th>';
    for (var jc = 0; jc < tkJenjangOrder.length; jc++) {
      html += '<th class="px-3 py-2 text-right font-semibold text-slate-600 whitespace-nowrap">' + tkJenjangOrder[jc] + '</th>';
    }
    html += '<th class="px-3 py-2 text-right font-semibold text-slate-600 whitespace-nowrap">Total Porsi</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-slate-600 whitespace-nowrap">Kebutuhan Pangan (kg)</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-slate-600 whitespace-nowrap" title="Kebutuhan + buffer per bahan (1-10%)">1-10%</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-slate-600 whitespace-nowrap">Aksi</th>';
    html += '</tr></thead><tbody>';

    var colTotal = {};
    for (var jc2 = 0; jc2 < tkJenjangOrder.length; jc2++) colTotal[tkJenjangOrder[jc2]] = 0;
    var grandTotalKg = 0;
    var grandBufferKg = 0;

    for (var bi = 0; bi < day.bahan.length; bi++) {
      var b = day.bahan[bi];
      if (!b.per_jenjang) continue;
      var rowKg = 0;
      var bufferPersen = Number(b.buffer_persen) || 0;
      var cells = '';
      var ovCount = 0;
      for (var jc3 = 0; jc3 < tkJenjangOrder.length; jc3++) {
        var jn = tkJenjangOrder[jc3];
        var pj = b.per_jenjang[jn];
        var v = pj ? (Number(pj.kebutuhan_kg) || 0) : 0;
        if (pj && pj.override_id) ovCount++;
        rowKg += v;
        colTotal[jn] += v;
        // Data atribut dipakai tombol Edit untuk mengisi modal (jumlah per porsi, BDD, dsb).
        var cellAttr = '';
        if (pj && pj.siklus_id) {
          cellAttr = ' data-siklus="' + pj.siklus_id + '" data-hari="' + pj.hari_ke + '" data-jenjang="' + escHtml(jn) + '"' +
            ' data-jumlah="' + (Number(pj.berat_bersih) || 0) + '" data-bdd="' + (Number(pj.persen_bdd) || 100) + '"' +
            ' data-ov="' + (pj.override_id || '') + '"';
        }
        cells += '<td class="px-3 py-1.5 text-sm text-right mono' + (pj && pj.override_id ? ' bg-amber-50 text-amber-800 font-semibold' : '') + '"' + cellAttr + '>' + (v ? fmtPncPecahan(v) : '-') + '</td>';
      }
      var bufferKg = Math.round(rowKg * (1 + bufferPersen / 100) * 100) / 100;
      grandTotalKg += rowKg;
      grandBufferKg += bufferKg;

      html += '<tr class="border-b border-slate-100 hover:bg-emerald-50/30 transition-colors">';
      html += '<td class="px-3 py-1.5 text-sm font-medium text-slate-800">' + (b.nama_display || b.nama) +
        (ovCount ? ' <span class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700" title="Diubah manual untuk ' + ovCount + ' jenjang">diubah</span>' : '') +
        '</td>';
      html += cells;
      html += '<td class="px-3 py-1.5 text-sm text-right mono text-slate-600">' + fmtPncNum(totalPorsiDay) + '</td>';
      html += '<td class="px-3 py-1.5 text-sm text-right mono font-bold text-emerald-700">' + fmtPncPecahan(rowKg) + '</td>';
      html += '<td class="px-3 py-1.5 text-sm text-right mono font-bold ' + (bufferPersen > 0 ? 'text-sky-700' : 'text-slate-500') + '" title="Buffer ' + bufferPersen + '%">' + fmtPncPecahan(bufferKg) + '</td>';
      html += '<td class="px-3 py-1.5 text-right whitespace-nowrap">';
      html += '<button onclick="pncEditBahan(' + d + ',' + bi + ')" class="inline-flex items-center justify-center w-6 h-6 rounded-lg text-sky-600 hover:bg-sky-50 align-middle" title="Edit bahan/jumlah untuk hari ini">';
      html += '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
      html += '</button>';
      if (ovCount) {
        html += '<button onclick="pncDeleteBahan(' + d + ',' + bi + ')" class="ml-1 inline-flex items-center justify-center w-6 h-6 rounded-lg text-red-600 hover:bg-red-50 align-middle" title="Hapus perubahan, kembalikan ke resep asli">';
        html += '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';
        html += '</button>';
      }
      html += '</td>';
      html += '</tr>';
    }

    // Total row
    html += '<tr class="bg-slate-50 border-t-2 border-slate-200 font-bold">';
    html += '<td class="px-3 py-2 text-sm font-semibold text-slate-700">Total</td>';
    for (var jc4 = 0; jc4 < tkJenjangOrder.length; jc4++) {
      html += '<td class="px-3 py-2 text-sm text-right mono text-slate-700">' + fmtPncPecahan(colTotal[tkJenjangOrder[jc4]]) + '</td>';
    }
    html += '<td class="px-3 py-2 text-sm text-right mono text-slate-700">' + fmtPncNum(totalPorsiDay) + '</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-emerald-700">' + fmtPncPecahan(Math.round(grandTotalKg * 100) / 100) + '</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-sky-700">' + fmtPncPecahan(Math.round(grandBufferKg * 100) / 100) + '</td>';
    html += '<td class="px-3 py-2"></td>';
    html += '</tr>';

    html += '</tbody></table></div></div>';
  }

  html += '</div>';

  if (!html.trim() || html === '<div class="space-y-4"></div>') {
    return '<div class="text-xs text-slate-400 italic py-4 text-center">Tidak ada data bahan untuk ditampilkan</div>';
  }

  return html;
}

// ── Edit & hapus bahan di tabel Perencanaan Final (perencanaan_override) ──
var _pncJenjangOrder = ['TK/PAUD', 'SD/MI (1-3)', 'SD/MI (4-6)', 'SMP/MTs, SMA/SMK', 'Bumil/Busui', 'Balita'];

async function pncLoadBahanList() {
  if (_pncBahanCache) return _pncBahanCache;
  const res = await api.get('/bahan_baku?page=1&limit=9999');
  const rows = Array.isArray(res) ? res : (res.data || []);
  const map = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var key = String(r.nama || '').trim().toLowerCase();
    if (key) map[key] = { id: Number(r.id), nama: r.nama };
  }
  _pncBahanCache = { rows: rows, map: map };
  return _pncBahanCache;
}

async function pncEditBahan(dayIdx, rowIdx) {
  var day = (_pncMatriksHari || [])[dayIdx];
  var row = day && day.bahan && day.bahan[rowIdx];
  if (!row) return;

  var cells = row.per_jenjang || {};
  var jenjangList = _pncJenjangOrder.filter(function (j) { return cells[j]; });
  if (!jenjangList.length) return showAlert('Bahan ini tidak punya rincian jenjang untuk diedit.', 'warning');

  var cache = null;
  try { cache = await pncLoadBahanList(); } catch (e) { /* tanpa daftar bahan, tetap bisa ubah jumlah */ }

  var datalist = '';
  if (cache) {
    for (var bi2 = 0; bi2 < cache.rows.length; bi2++) {
      var nm = String(cache.rows[bi2].nama || '').trim();
      if (nm) datalist += '<option value="' + escHtml(nm) + '"></option>';
    }
  }

  var body = '<div class="space-y-4">';
  body += '<div class="rounded-lg border border-slate-200 bg-slate-50 p-3">';
  body += '<div class="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Bahan saat ini</div>';
  body += '<div class="text-sm font-semibold text-slate-800">' + escHtml(row.nama_display || row.nama) + '</div>';
  body += '<div class="text-xs text-slate-500 mt-1 leading-relaxed">Perubahan hanya berlaku untuk hari ini dan jenjang yang dicentang. Resep menu dan siklus tidak diubah.</div>';
  body += '</div>';

  body += '<div><label class="text-xs font-semibold text-slate-600 uppercase tracking-wider">Ganti bahan (opsional)</label>';
  body += '<input id="pnc-ov-bahan" list="pnc-ov-bahan-list" autocomplete="off" placeholder="Kosongkan bila hanya mengubah jumlah" class="mt-1 w-full h-10 px-3 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400">';
  body += '<datalist id="pnc-ov-bahan-list">' + datalist + '</datalist></div>';

  body += '<div class="border border-slate-200 rounded-lg overflow-hidden"><table class="w-full text-xs"><thead><tr class="bg-slate-50 border-b border-slate-200">';
  body += '<th class="px-3 py-2 text-left font-semibold text-slate-600">Jenjang</th>';
  body += '<th class="px-3 py-2 text-right font-semibold text-slate-600">Jumlah (g/porsi)</th>';
  body += '<th class="px-3 py-2 text-right font-semibold text-slate-600">BDD %</th>';
  body += '</tr></thead><tbody>';
  for (var ji = 0; ji < jenjangList.length; ji++) {
    var jn = jenjangList[ji];
    var pj = cells[jn];
    body += '<tr class="border-b border-slate-100">';
    body += '<td class="px-3 py-2"><label class="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" id="pnc-ov-on-' + ji + '" checked class="rounded border-slate-300"><span class="font-medium text-slate-700">' + escHtml(jn) + '</span></label>' +
      (pj.override_id ? '<span class="ml-1 text-[10px] font-semibold text-amber-700">diubah</span>' : '') + '</td>';
    body += '<td class="px-3 py-2 text-right"><input type="number" min="0" step="0.01" id="pnc-ov-jml-' + ji + '" value="' + (Number(pj.berat_bersih) || 0) + '" class="w-24 h-9 px-2 text-right border border-slate-200 rounded-lg mono"></td>';
    body += '<td class="px-3 py-2 text-right"><input type="number" min="1" max="100" step="0.1" id="pnc-ov-bdd-' + ji + '" value="' + (Number(pj.persen_bdd) || 100) + '" class="w-20 h-9 px-2 text-right border border-slate-200 rounded-lg mono"></td>';
    body += '</tr>';
  }
  body += '</tbody></table></div>';
  body += '<div class="text-[11px] text-slate-400 leading-relaxed">Jumlah = gram bahan per porsi untuk satu siswa. Kebutuhan kg dihitung ulang = jumlah × porsi ÷ BDD.</div>';
  body += '</div>';

  document.getElementById('modal-title').innerHTML = 'Edit Bahan <span class="text-slate-400 font-normal">· ' + escHtml(day.hari_nama || '') + ', ' + escHtml(day.tanggal || '') + '</span>';
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal-save').style.display = 'block';
  document.getElementById('modal-save').textContent = 'Simpan';
  document.getElementById('modal-save').onclick = async function () {
    var namaBaru = String((document.getElementById('pnc-ov-bahan') || {}).value || '').trim();
    // Bahan pengganti: dari input bila diisi, kalau kosong pakai bahan yang
    // sedang tampil di sel (agar edit jumlah tidak membatalkan ganti bahan lama).
    var gantiId = 0;
    if (namaBaru) {
      if (!cache) return showAlert('Daftar bahan belum termuat. Muat ulang halaman lalu coba lagi.', 'warning');
      var found = cache.map[namaBaru.toLowerCase()];
      if (!found) return showAlert('Bahan "' + namaBaru + '" tidak ditemukan di Master Bahan Baku.', 'warning');
      gantiId = found.id;
    }

    var target = [];
    for (var i = 0; i < jenjangList.length; i++) {
      var on = document.getElementById('pnc-ov-on-' + i);
      if (!on || !on.checked) continue;
      var jumlah = Number((document.getElementById('pnc-ov-jml-' + i) || {}).value);
      var bdd = Number((document.getElementById('pnc-ov-bdd-' + i) || {}).value);
      if (!(jumlah > 0)) return showAlert('Jumlah untuk ' + jenjangList[i] + ' harus lebih dari 0.', 'warning');
      if (!(bdd > 0 && bdd <= 100)) return showAlert('BDD untuk ' + jenjangList[i] + ' harus antara 1 dan 100.', 'warning');
      target.push({ jenjang: jenjangList[i], jumlah: jumlah, bdd: bdd });
    }
    if (!target.length) return showAlert('Centang minimal satu jenjang.', 'warning');

    var btn = document.getElementById('modal-save');
    btn.disabled = true;
    try {
      for (var t = 0; t < target.length; t++) {
        var cell = cells[target[t].jenjang];
        var newId = gantiId || Number(cell.bahan_baku_id) || Number(row.bahan_baku_id) || 0;
        if (!newId) throw new Error('Bahan untuk ' + target[t].jenjang + ' tidak valid');
        await api.post('/siklus/laporan/override', {
          siklus_id: cell.siklus_id,
          hari_ke: cell.hari_ke,
          jenjang: target[t].jenjang,
          original_bahan_baku_id: Number(row.bahan_baku_id) || null,
          new_bahan_baku_id: newId,
          jumlah: target[t].jumlah,
          persen_bdd: target[t].bdd,
        });
      }
      closeModal();
      showToast('Perubahan bahan tersimpan (' + target.length + ' jenjang)', 'success');
      loadPerencanaanData(_pncSiklusId);
    } catch (e) {
      showAlert('Gagal menyimpan: ' + (e.message || 'Unknown error'), 'error');
    } finally {
      btn.disabled = false;
    }
  };

  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}

async function pncDeleteBahan(dayIdx, rowIdx) {
  var day = (_pncMatriksHari || [])[dayIdx];
  var row = day && day.bahan && day.bahan[rowIdx];
  if (!row) return;

  var cells = row.per_jenjang || {};
  var ids = [];
  for (var j in cells) {
    if (cells[j] && cells[j].override_id) ids.push(cells[j].override_id);
  }
  if (!ids.length) return showAlert('Tidak ada perubahan manual pada bahan ini.', 'warning');

  if (!await showConfirm('Hapus perubahan manual bahan "' + (row.nama_display || row.nama) + '" untuk ' + ids.length + ' jenjang? Nilainya akan kembali ke resep asli.', 'Ya, Hapus')) return;

  try {
    for (var i = 0; i < ids.length; i++) await api.del('/siklus/laporan/override/' + ids[i]);
    showToast('Perubahan bahan dihapus', 'success');
    loadPerencanaanData(_pncSiklusId);
  } catch (e) {
    showAlert('Gagal menghapus: ' + (e.message || 'Unknown error'), 'error');
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

  // 2. Gunakan data jenjang pertama sebagai template siklus/hari/bahan
  //    (asumsi: semua jenjang pakai menu yang sama)
  var template = allData[0];
  var totalSiswa = template.jumlah_siswa;

  // 3. Helper: hitung per-siswa dari total jenjang
  function perSiswa(totalVal, jmlSiswa) {
    return jmlSiswa > 0 ? totalVal / jmlSiswa : 0;
  }

  // 4. Render satu tabel untuk satu porsi type.
  //    Card SELALU dirender agar layout "Porsi Besar & Porsi Kecil" tidak menghilang,
  //    walau salah satu porsi belum punya penerima manfaat (count = 0).
  function renderRekapTable(porsiKey, porsiLabel, porsiCount, colorClass, iconSvg) {
    var html = '<div class="bg-white border border-slate-200 rounded-lg overflow-hidden h-full">';
    html += '<div class="px-5 py-3 ' + colorClass + ' flex items-center gap-3">';
    if (iconSvg) html += iconSvg;
    html += '<span class="font-bold text-base">' + porsiLabel + '</span>';
    html += '<span class="text-sm font-normal">Jumlah Siswa: <strong>' + fmtPncNum(porsiCount) + '</strong> orang</span>';
    html += '<span class="text-xs opacity-60">(Rekap semua jenjang)</span>';
    html += '</div>';

    // Empty state: card tetap tampil, konten diganti pesan informatif
    if (porsiCount <= 0) {
      html += '<div class="px-5 py-8 text-center">';
      html += '<svg class="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>';
      html += '<div class="text-sm font-medium text-slate-500">Belum ada penerima untuk ' + porsiLabel.toLowerCase() + '</div>';
      html += '<div class="text-xs text-slate-400 mt-1">Isi paket besar/kecil di Master Data → Penerima Manfaat agar kebutuhan porsi ini muncul.</div>';
      html += '</div>';
      html += '</div>';
      return html;
    }

    for (var skIdx = 0; skIdx < template.siklus.length; skIdx++) {
      var sk = template.siklus[skIdx];

      // Siklus header
      html += '<div data-siklus-idx="' + skIdx + '">';
      html += '<div class="px-5 py-2 bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-600 flex items-center gap-2">';
      html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
      html += sk.siklus_nama;
      html += '</div>';

      // Day tabs
      if (sk.hari.length > 1) {
        html += '<div class="px-5 py-2 border-b border-slate-100">';
        html += '<div class="flex gap-1 bg-slate-100 rounded-lg p-0.5 overflow-x-auto siklus-tab-bar" role="tablist" data-siklus-idx="' + skIdx + '">';
        for (var h = 0; h < sk.hari.length; h++) {
          var day = sk.hari[h];
          var isFirst = h === 0;
          html += '<button onclick="pncSwitchDayTab(event, this)" class="px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-all ' + (isFirst ? 'bg-white shadow-sm font-bold text-sky-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50') + '" role="tab" aria-selected="' + (isFirst ? 'true' : 'false') + '">' + day.hari_nama + '</button>';
        }
        html += '</div></div>';
      }

      // Per hari
      for (var h = 0; h < sk.hari.length; h++) {
        var day = sk.hari[h];
        var tabExtraClass = (sk.hari.length > 1 && h > 0) ? ' hidden' : '';
        html += '<div class="pnc-day-content' + tabExtraClass + '" role="tabpanel">';
        html += '<div class="px-5 py-3 border-b border-slate-100 bg-slate-50/30">';
        html += '<div class="flex items-center gap-3 mb-2">';
        html += '<span class="inline-block px-3 py-1 rounded-lg ' + (porsiKey === 'BESAR' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800') + ' text-sm font-bold">' + day.menu_label + '</span>';
        html += '<span class="text-sm font-semibold text-slate-700">' + day.hari_nama + '</span>';
        html += '<span class="text-xs text-slate-400">' + (day.menu_nama || '') + '</span>';
        html += '</div>';

        if (!day.bahan || !day.bahan.length) {
          html += '<div class="text-xs text-slate-400 italic px-2 pb-2">Tidak ada bahan</div>';
        } else {
          // Table
          html += '<div class="overflow-x-auto pb-2"><table class="w-full text-xs border-collapse">';
          html += '<thead><tr class="border-b border-slate-200">';
          html += '<th class="px-2 py-1.5 text-left font-semibold text-slate-600 min-w-[140px]">Bahan Pangan</th>';
          html += '<th class="px-2 py-1.5 text-right font-semibold text-slate-600 whitespace-nowrap">Berat Bersih (g)</th>';
          html += '<th class="px-2 py-1.5 text-right font-semibold text-slate-600 whitespace-nowrap">BDD (%)</th>';
          html += '<th class="px-2 py-1.5 text-right font-semibold text-slate-600 whitespace-nowrap">Berat Kotor (g)</th>';
          html += '<th class="px-2 py-1.5 text-right font-semibold text-slate-600 whitespace-nowrap">Jumlah Siswa</th>';
          html += '<th class="px-2 py-1.5 text-right font-semibold text-slate-600 whitespace-nowrap">Kebutuhan (kg)</th>';
          html += '</tr></thead><tbody>';

          for (var bi = 0; bi < day.bahan.length; bi++) {
            var b = day.bahan[bi];
            // Hitung per-siswa values
            var bbPerSiswa = perSiswa(b.berat_bersih, totalSiswa);
            var bkPerSiswa = perSiswa(b.berat_kotor, totalSiswa);
            // Kebutuhan untuk porsi ini
            var kebutuhanPorsi = Math.round((bkPerSiswa * porsiCount / 1000) * 100) / 100;

            html += '<tr class="border-b border-slate-100 hover:bg-slate-50/50">';
            html += '<td class="px-2 py-1.5 text-sm font-medium">' + b.nama_display + '</td>';
            html += '<td class="px-2 py-1.5 text-sm text-right mono">' + fmtPncNum(bbPerSiswa) + '</td>';
            html += '<td class="px-2 py-1.5 text-sm text-right mono">' + b.persen_bdd + '%</td>';
            html += '<td class="px-2 py-1.5 text-sm text-right mono">' + fmtPncNum(bkPerSiswa) + '</td>';
            html += '<td class="px-2 py-1.5 text-sm text-right mono">' + fmtPncNum(porsiCount) + '</td>';
            html += '<td class="px-2 py-1.5 text-sm text-right mono font-bold ' + (porsiKey === 'BESAR' ? 'text-amber-700' : 'text-emerald-700') + '">' + fmtPncPecahan(kebutuhanPorsi) + '</td>';
            html += '</tr>';
          }

          html += '</tbody></table></div>';
        }
        html += '</div>'; // close body hari
        html += '</div>'; // close konten hari (pnc-day-content)
      }
      html += '</div>'; // close data-siklus-idx
    }
    html += '</div>'; // close card
    return html;
  }

  var besarIcon = '<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 10l7-7 7 7"/><path d="M12 3v18"/></svg>';
  var kecilIcon = '<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 14l-7 7-7-7"/><path d="M12 21V3"/></svg>';

  var html = '<div class="mb-6">';
  html += '<div class="flex items-center gap-2 mb-3 flex-wrap">';
  html += '<svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>';
  html += '<span class="text-sm font-bold text-slate-700">Rekap Kebutuhan — Porsi Besar & Kecil</span>';
  html += '<span class="text-xs text-slate-400">(Semua jenjang digabung)</span>';
  html += '<span class="flex-1"></span>';
  html += '<button onclick="exportPncKebutuhanPangan()" class="inline-flex items-center gap-1.5 text-[11px] font-medium text-white bg-[#14326b] hover:bg-[#0f2a5f] px-3 py-2 rounded-lg shadow-sm transition-colors shrink-0" title="Export Kebutuhan Pangan per hari (4 sheet: Bumil Busui, Balita, Porsi Besar, Porsi Kecil)">';
  html += '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Export Kebutuhan Pangan XLSX';
  html += '</button>';
  html += '</div>';

  // Section 1 — Porsi Besar & Kecil: 2 kolom sejajar (masing-masing 50%) di desktop,
  // otomatis 1 kolom di tablet/mobile. Tinggi card sama (stretch) dengan gap 24px antar card.
  html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">';
  html += '<div class="h-full min-w-0">' + renderRekapTable('BESAR', 'Porsi Besar', totalBesar, 'bg-amber-50 text-amber-800 border-b-2 border-b-amber-400', besarIcon) + '</div>';
  html += '<div class="h-full min-w-0">' + renderRekapTable('KECIL', 'Porsi Kecil', totalKecil, 'bg-emerald-50 text-emerald-800 border-b-2 border-b-emerald-400', kecilIcon) + '</div>';
  html += '</div>';
  html += '</div>';

  return html;
}

function pncSwitchDayTab(event, btn) {
  var tabBar = btn.closest('.siklus-tab-bar');
  if (!tabBar) return;

  var tabs = tabBar.querySelectorAll('button');
  var idx = -1;
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].className = 'px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-all text-slate-500 hover:text-slate-700 hover:bg-slate-200/50';
    tabs[i].setAttribute('aria-selected', 'false');
    if (tabs[i] === btn) idx = i;
  }
  if (idx === -1) return;

  btn.className = 'px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-all bg-white shadow-sm font-bold text-sky-700';
  btn.setAttribute('aria-selected', 'true');

  // Bagian siklus yang memuat tab ini: tab bar & konten hari ada dalam <div data-siklus-idx> yang sama.
  // PENTING: closest() menyertakan elemen itu sendiri — div tab-bar juga punya atribut data-siklus-idx,
  // jadi jangan closest langsung dari tabBar (akan mengembalikan tab-bar itu sendiri).
  // Naik satu tingkat dulu ke pembungkusnya (px-5 py-2) baru closest ke section siklus.
  var siklusSection = tabBar.parentElement ? tabBar.parentElement.closest('div[data-siklus-idx]') : null;
  var siklusContents = siklusSection ? siklusSection.querySelectorAll('.pnc-day-content') : [];

  for (var i = 0; i < siklusContents.length; i++) {
    siklusContents[i].classList.add('hidden');
  }
  if (siklusContents[idx]) siklusContents[idx].classList.remove('hidden');
}

function fmtPncNum(v) {
  if (v == null || isNaN(v)) return '0,00';
  var n = Number(v);
  return n === Math.floor(n) ? String(n) : n.toFixed(2).replace('.', ',');
}

// Format pecahan yang sama dengan halaman Total Kebutuhan (mis. 0,5 → 1/2, 0,2 → 1/5)
function fmtPncPecahan(v) {
  if (typeof fmtTkPecahan === 'function') return fmtTkPecahan(v);
  return fmtPncNum(v);
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

/**
 * exportPncKebutuhanPangan - Export Perhitungan Kebutuhan Pangan per hari
 * (format contoh) dalam satu workbook 4 sheet: Bumil Busui, Balita,
 * Porsi Besar, Porsi Kecil. Memakai siklus terpilih (filter).
 */
async function exportPncKebutuhanPangan() {
  let url = '/api/siklus/laporan/kebutuhan-pangan/export';
  if (_pncSiklusId) url += '?siklus_id=' + encodeURIComponent(_pncSiklusId);
  try {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) {
      let msg = 'Gagal export';
      try { const j = await r.json(); msg = j.error || msg; } catch (e) { /* non-JSON */ }
      showAlert(msg, 'warning');
      return;
    }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Kebutuhan-Pangan.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    showAlert('Export Kebutuhan Pangan (4 sheet) berhasil diunduh', 'success');
  } catch (err) {
    showAlert('Gagal export: ' + err.message, 'error');
  }
}

/**
 * exportPncFinalXlsx - Export Perencanaan Final (kebutuhan bahan per hari)
 * memakai template FINAL-PERENCANAAN.xlsx. Semua hari ditulis berurutan dalam
 * satu sheet sesuai pilihan layout user.
 */
async function exportPncFinalXlsx() {
  let url = '/api/siklus/laporan/perencanaan/export';
  if (_pncSiklusId) url += '?siklus_id=' + encodeURIComponent(_pncSiklusId);
  try {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) {
      let msg = 'Gagal export';
      try { const j = await r.json(); msg = j.error || msg; } catch (e) { /* non-JSON */ }
      showAlert(msg, 'warning');
      return;
    }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'FINAL-PERENCANAAN.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    showAlert('Export Perencanaan Final berhasil diunduh', 'success');
  } catch (err) {
    showAlert('Gagal export: ' + err.message, 'error');
  }
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
