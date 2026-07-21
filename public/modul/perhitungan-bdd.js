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

    // Render per jenjang
    for (var j = 0; j < data.length; j++) {
      var jd = data[j];
      html += renderPbdJenjangSection(jd);
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

function renderPbdJenjangSection(jd) {
  var html = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden mb-6">';

  // Jenjang header
  var jColors = ['bg-blue-50 text-blue-800', 'bg-emerald-50 text-emerald-800', 'bg-amber-50 text-amber-800', 'bg-violet-50 text-violet-800', 'bg-cyan-50 text-cyan-800', 'bg-rose-50 text-rose-800'];
  var jIdx = ['TK/PAUD','SD/MI (1-3)','SD/MI (4-6)','SMP/MTs, SMA/SMK','Bumil/Busui','Balita'].indexOf(jd.jenjang);
  if (jIdx < 0) jIdx = 0;
  html += '<div class="px-5 py-4 border-b border-stone-200 flex items-center justify-between ' + jColors[jIdx % jColors.length] + '">';
  html += '<div><span class="font-bold text-base">' + jd.jenjang + '</span>';
  html += '<span class="ml-3 text-sm font-normal">Jumlah Siswa: <strong>' + fmtPbdNum(jd.jumlah_siswa) + '</strong> orang</span></div>';
  html += '<div class="text-xs">' + jd.siklus.length + ' siklus</div>';
  html += '</div>';

  // Per siklus
  for (var s = 0; s < jd.siklus.length; s++) {
    var sk = jd.siklus[s];

    // Siklus sub-header
    html += '<div class="px-5 py-2 bg-stone-50 border-b border-stone-200 text-sm font-semibold text-stone-600 flex items-center gap-2">';
    html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    html += sk.siklus_nama;
    html += '</div>';

    // Per hari
    for (var h = 0; h < sk.hari.length; h++) {
      var day = sk.hari[h];
      html += renderPbdMenuTable(day, jd.jumlah_siswa);
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

function fmtPbdNum(v) {
  if (v == null || isNaN(v)) return '0,00';
  var n = Number(v);
  return n === Math.floor(n) ? String(n) : n.toFixed(2).replace('.', ',');
}

function exportPbdCsv() {
  showAlert('Export CSV: gunakan Print atau salin dari tabel', 'info');
}
