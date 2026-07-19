// ===== Total Kebutuhan Pangan =====
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
    const { hari, tanggal_mulai } = res;

    let html = '';

    // Filter
    html += '<div class="bg-white border border-stone-200 rounded-lg p-4 mb-4 flex flex-wrap items-center gap-4">';
    html += '<label class="text-sm font-medium text-stone-700">Tanggal Mulai:</label>';
    html += '<input type="date" value="' + (tanggal_mulai || '') + '" onchange="loadTotalKebutuhan(this.value)" class="h-10 px-3 border border-stone-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">';
    html += '<button onclick="buatPrDariSiklus()" class="ml-auto h-10 px-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl text-sm font-medium transition-all shadow-md hover:shadow-lg flex items-center gap-2">';
    html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>\n    Buat Draft PR';
    html += '</button>';
    html += '<div class="text-xs text-stone-400">' + (hari ? hari.length + ' hari' : '0 hari') + '</div>';
    html += '</div>';

    if (!hari || !hari.length) {
      html += '<div class="text-center py-16 text-stone-400 bg-white border border-stone-200 rounded-lg"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg><div class="text-sm">Tidak ada data</div></div>';
      wrap.innerHTML = html;
      return;
    }

    // Render per day side by side (2 columns)
    for (var h = 0; h < hari.length; h += 2) {
      html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">';
      html += renderDayCard(hari[h]);
      if (h + 1 < hari.length) {
        html += renderDayCard(hari[h + 1]);
      }
      html += '</div>';
    }

    wrap.innerHTML = html;
  } catch (err) {
    wrap.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal: ' + err.message + '</div>';
  }
}

function renderDayCard(day) {
  if (!day) return '';
  var html = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden">';

  // Day header
  html += '<div class="px-4 py-3 bg-gradient-to-r from-emerald-50 to-green-50 border-b border-stone-200">';
  html += '<div class="font-bold text-sm text-emerald-800">' + day.header_tanggal + '</div>';
  if (day.menu_names && day.menu_names.length) {
    html += '<div class="text-xs text-stone-500 mt-1 leading-relaxed">';
    html += day.menu_names.join(' + ');
    html += '</div>';
  }
  html += '</div>';

  if (!day.bahan || !day.bahan.length) {
    html += '<div class="text-sm text-stone-400 italic px-4 py-3">Tidak ada bahan</div></div>';
    return html;
  }

  // Table
  html += '<div class="overflow-x-auto"><table class="w-full text-xs border-collapse">';
  html += '<thead><tr class="border-b border-stone-200 bg-stone-50">';
  html += '<th class="px-3 py-2 text-left font-semibold text-stone-600 min-w-[120px]">Bahan</th>';
  html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Kg/pcs/btl</th>';
  html += '<th class="px-3 py-2 text-center font-semibold text-stone-600 whitespace-nowrap">Ket</th>';
  html += '</tr></thead><tbody>';

  for (var i = 0; i < day.bahan.length; i++) {
    var b = day.bahan[i];
    var isPcs = b.rincian && b.rincian.indexOf('pcs') > -1;
    var isBtl = b.rincian && b.rincian.indexOf('btl') > -1;
    html += '<tr class="border-b border-stone-100 hover:bg-stone-50/50">';
    html += '<td class="px-3 py-2 text-sm font-medium">' + b.nama + '</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-semibold">' + b.rincian + '</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono text-stone-500">' + fmtTkNum(b.total_kebutuhan_kg) + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table></div></div>';
  return html;
}

function fmtTkNum(v) {
  if (v == null || isNaN(v)) return '0,00';
  return Number(v).toFixed(2).replace('.', ',');
}
