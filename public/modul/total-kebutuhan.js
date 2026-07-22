// ===== Total Kebutuhan Pangan =====
// Menampilkan perhitungan BDD & kebutuhan bahan per jenjang per hari
// Format tab per jenjang → tabel: Menu | Bahan | Berat Bersih (g) | BDD% | Berat Kotor (g) | Jumlah Siswa | Kebutuhan (kg)

let _tkData = null; // cache response

async function renderTotalKebutuhan() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/total-kebutuhan', { credentials: 'include' });
    if (!r.ok) throw new Error((await r.json()).error || 'Gagal memuat');
    c.innerHTML = await r.text();
    await loadTotalKebutuhan();
  } catch (err) {
    c.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat: ' + err.message + '</div>';
  }
}

async function loadTotalKebutuhan(tanggalMulai) {
  const wrap = document.getElementById('total-kebutuhan-content');
  if (!wrap) return;
  wrap.innerHTML = '<div class="flex items-center justify-center py-16"><svg class="animate-spin h-8 w-8 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';

  try {
    const params = tanggalMulai ? '?tanggal_mulai=' + tanggalMulai : '';
    const res = await api.get('/siklus/laporan/perencanaan' + params);
    _tkData = res;
    const { jenjang_list, hari, pm_map, tanggal_mulai: tglMulai } = res;

    let html = '';

    // ── Filter bar ──
    html += '<div class="bg-white border border-stone-200 rounded-xl p-4 mb-4 flex flex-wrap items-center gap-4 shadow-sm">';
    html += '<label class="text-sm font-medium text-stone-700">Tanggal Mulai:</label>';
    html += '<input type="date" value="' + (tglMulai || '') + '" onchange="loadTotalKebutuhan(this.value)" class="h-10 px-3 border border-stone-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">';
    html += '<button onclick="buatPrDariSiklus()" class="ml-auto h-10 px-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl text-sm font-medium transition-all shadow-md hover:shadow-lg flex items-center gap-2">';
    html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>\n    Buat Draft PR';
    html += '</button>';
    html += '<div class="text-xs text-stone-400">' + (hari ? hari.length + ' hari' : '0 hari') + '</div>';
    html += '</div>';

    if (!hari || !hari.length || !jenjang_list || !jenjang_list.length) {
      html += '<div class="text-center py-16 text-stone-400 bg-white border border-stone-200 rounded-lg"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg><div class="text-sm">Tidak ada data</div><div class="text-xs mt-1">Pastikan ada siklus Aktif dengan menu/grid bahan dan Penerima Manfaat sudah diisi.</div></div>';
      wrap.innerHTML = html;
      return;
    }

    // ── Jenjang Tab Bar ──
    html += '<div class="bg-white border border-stone-200 rounded-xl p-1.5 mb-4 flex flex-wrap gap-1" id="tk-jenjang-tabs">';
    for (var j = 0; j < jenjang_list.length; j++) {
      var jName = jenjang_list[j];
      var siswa = pm_map && pm_map[jName] ? pm_map[jName] : 0;
      var jColors = ['bg-blue-50 text-blue-700', 'bg-emerald-50 text-emerald-700', 'bg-amber-50 text-amber-700', 'bg-violet-50 text-violet-700', 'bg-cyan-50 text-cyan-700', 'bg-rose-50 text-rose-700'];
      var jBorderColors = ['border-blue-200', 'border-emerald-200', 'border-amber-200', 'border-violet-200', 'border-cyan-200', 'border-rose-200'];
      var jIdx = ['TK/PAUD','SD/MI (1-3)','SD/MI (4-6)','SMP/MTs, SMA/SMK','Bumil/Busui','Balita'].indexOf(jName);
      if (jIdx < 0) jIdx = 0;
      var active = j === 0;
      html += '<button onclick="switchTkJenjangTab(' + j + ')" class="tk-jenjang-btn px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ' 
        + (active ? 'bg-white shadow-md ring-1 ' + jBorderColors[jIdx % jBorderColors.length] + ' ' + jColors[jIdx % jColors.length] : jColors[jIdx % jColors.length] + ' hover:shadow-sm')
        + '" data-idx="' + j + '">'
        + jName + ' <span class="text-xs opacity-70">(' + siswa + ' siswa)</span></button>';
    }
    html += '</div>';

    // ── Content per jenjang ──
    for (var j = 0; j < jenjang_list.length; j++) {
      var display = (j === 0) ? '' : ' hidden';
      html += '<div class="tk-jenjang-content' + display + '" data-idx="' + j + '">';
      html += buildTkJenjangView(jenjang_list[j], hari, pm_map);
      html += '</div>';
    }

    // ── Legenda ──
    html += '<div class="bg-white border border-stone-200 rounded-lg p-4 mt-4 text-xs text-stone-500">';
    html += '<div class="font-semibold text-stone-700 mb-2">Keterangan:</div>';
    html += '<ul class="space-y-1 list-disc list-inside">';
    html += '<li><strong>Berat Bersih</strong> = Jumlah bahan per porsi (gram) — dihitung dari SP × Berat 1 SP</li>';
    html += '<li><strong>BDD%</strong> = <em>Bahan Dapat Dimakan</em> — persentase bagian yang dapat dikonsumsi</li>';
    html += '<li><strong>Berat Kotor</strong> = Berat Bersih ÷ (BDD ÷ 100)</li>';
    html += '<li><strong>Kebutuhan (kg)</strong> = Berat Kotor × Jumlah Siswa ÷ 1000</li>';
    html += '</ul></div>';

    wrap.innerHTML = html;
  } catch (err) {
    wrap.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal: ' + err.message + '</div>';
  }
}

function buildTkJenjangView(jenjang, hariList, pmMap) {
  var siswa = pmMap && pmMap[jenjang] ? pmMap[jenjang] : 0;
  var html = '';

  for (var d = 0; d < hariList.length; d++) {
    var day = hariList[d];
    var dayBahan = [];
    // Filter bahan that have data for this jenjang
    for (var i = 0; i < day.bahan.length; i++) {
      var b = day.bahan[i];
      if (b.per_jenjang && b.per_jenjang[jenjang] && b.per_jenjang[jenjang].kebutuhan_kg > 0) {
        dayBahan.push(b);
      }
    }
    if (!dayBahan.length) continue;

    var menuLabel = day.menu_names && day.menu_names.length ? day.menu_names.join(' + ') : 'Menu Hari ' + (d + 1);

    // Card per day
    html += '<div class="bg-white border border-stone-200 rounded-xl overflow-hidden mb-4 shadow-sm hover:shadow-md transition-shadow">';

    // Day header
    html += '<div class="px-5 py-3 bg-gradient-to-r from-emerald-50 to-green-50 border-b border-stone-200 flex items-center gap-3">';
    html += '<span class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 font-bold text-sm">M' + (d + 1) + '</span>';
    html += '<div>';
    html += '<div class="font-semibold text-sm text-emerald-800">' + day.header_tanggal + '</div>';
    if (day.menu_names && day.menu_names.length) {
      html += '<div class="text-xs text-stone-500 mt-0.5">' + day.menu_names.join(' + ') + '</div>';
    }
    html += '</div>';
    html += '<div class="ml-auto text-xs text-stone-400">' + dayBahan.length + ' bahan</div>';
    html += '</div>';

    // Table
    html += '<div class="overflow-x-auto"><table class="w-full text-xs border-collapse">';
    html += '<thead><tr class="border-b border-stone-200 bg-stone-50">';
    html += '<th class="px-3 py-2 text-left font-semibold text-stone-600 min-w-[150px]">Bahan Pangan</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Berat Bersih (g)</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">BDD (%)</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Berat Kotor (g)</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Jumlah Siswa</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Kebutuhan (kg)</th>';
    html += '</tr></thead><tbody>';

    for (var i = 0; i < dayBahan.length; i++) {
      var b = dayBahan[i];
      var pj = b.per_jenjang[jenjang];
      var isRef = pj.persen_bdd !== (b.persen_bdd || 100);
      var namaDisplay = b.nama_display || b.nama;
      html += '<tr class="border-b border-stone-100 hover:bg-emerald-50/30 transition-colors">';
      html += '<td class="px-3 py-2 text-sm font-medium text-stone-800">' + namaDisplay + '</td>';
      html += '<td class="px-3 py-2 text-sm text-right mono">' + fmtTkNum(pj.berat_bersih) + '</td>';
      html += '<td class="px-3 py-2 text-sm text-right mono ' + (isRef ? 'text-emerald-600 font-semibold' : '') + '">' + pj.persen_bdd + '%</td>';
      html += '<td class="px-3 py-2 text-sm text-right mono">' + fmtTkNum(pj.berat_kotor) + '</td>';
      html += '<td class="px-3 py-2 text-sm text-right mono text-stone-600">' + fmtTkNum(pj.jumlah_siswa) + '</td>';
      html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-emerald-700">' + fmtTkNum(pj.kebutuhan_kg) + '</td>';
      html += '</tr>';
    }

    // Total row
    var totalKg = dayBahan.reduce(function(s, b) { return s + (b.per_jenjang[jenjang] ? b.per_jenjang[jenjang].kebutuhan_kg : 0); }, 0);
    html += '<tr class="bg-stone-50 border-t-2 border-stone-200">';
    html += '<td class="px-3 py-2 text-sm font-semibold text-stone-700">Total Kebutuhan</td>';
    html += '<td colspan="4"></td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-emerald-700">' + fmtTkNum(totalKg) + '</td>';
    html += '</tr>';

    html += '</tbody></table></div></div>';
  }

  if (!html) {
    html = '<div class="text-center py-8 text-stone-400 bg-white border border-stone-200 rounded-xl"><div class="text-sm">Tidak ada data untuk jenjang ini</div></div>';
  }

  return html;
}

function switchTkJenjangTab(idx) {
  // Update button states
  var btns = document.querySelectorAll('.tk-jenjang-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].className = btns[i].className.replace(/bg-white shadow-md ring-1 \S+/, '');
    btns[i].className = btns[i].className + ' hover:shadow-sm';
  }
  var activeBtn = btns[idx];
  if (activeBtn) {
    var jColors = ['bg-blue-50 text-blue-700', 'bg-emerald-50 text-emerald-700', 'bg-amber-50 text-amber-700', 'bg-violet-50 text-violet-700', 'bg-cyan-50 text-cyan-700', 'bg-rose-50 text-rose-700'];
    var jBorderColors = ['border-blue-200', 'border-emerald-200', 'border-amber-200', 'border-violet-200', 'border-cyan-200', 'border-rose-200'];
    var jIdx = idx % 6;
    activeBtn.className = 'tk-jenjang-btn px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap bg-white shadow-md ring-1 ' + jBorderColors[jIdx] + ' ' + jColors[jIdx];
  }

  // Toggle content panels
  var panels = document.querySelectorAll('.tk-jenjang-content');
  for (var i = 0; i < panels.length; i++) {
    if (i === idx) {
      panels[i].classList.remove('hidden');
    } else {
      panels[i].classList.add('hidden');
    }
  }
}

function fmtTkNum(v) {
  if (v == null || isNaN(v)) return '0,00';
  var n = Number(v);
  return n === Math.floor(n) ? String(n) : n.toFixed(2).replace('.', ',');
}
