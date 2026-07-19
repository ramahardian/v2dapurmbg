// ===== Perencanaan Kebutuhan Bahan Pangan =====
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
    const { jenjang_list, hari, pm_map, tanggal_mulai } = res;

    let html = '';

    // Filter bar
    html += '<div class="bg-white border border-stone-200 rounded-lg p-4 mb-4 flex flex-wrap items-center gap-4">';
    html += '<label class="text-sm font-medium text-stone-700">Tanggal Mulai Siklus:</label>';
    html += '<input type="date" value="' + (tanggal_mulai || '') + '" onchange="loadPerencanaanData(this.value)" class="h-10 px-3 border border-stone-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400">';
    html += '<button onclick="buatPrDariSiklus()" class="ml-auto h-10 px-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl text-sm font-medium transition-all shadow-md hover:shadow-lg flex items-center gap-2">';
    html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
    Buat Draft PR';
    html += '</button>';
    html += '<div class="text-xs text-stone-400">' + (hari ? hari.length + ' hari' : '0 hari') + '</div>';
    html += '</div>';

    if (!hari || !hari.length) {
      html += '<div class="text-center py-16 text-stone-400 bg-white border border-stone-200 rounded-lg"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg><div class="text-sm">Tidak ada data</div><div class="text-xs mt-1">Pastikan ada Siklus aktif dan Penerima Manfaat sudah diisi.</div></div>';
      wrap.innerHTML = html;
      return;
    }

    // Per day
    for (var h = 0; h < hari.length; h++) {
      html += renderPerencanaanDay(hari[h], jenjang_list);
    }

    wrap.innerHTML = html;
  } catch (err) {
    wrap.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal: ' + err.message + '</div>';
  }
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
      var val = b.per_jenjang[jenjangList[j]];
      html += '<td class="px-3 py-2 text-sm text-right mono">' + (val != null ? fmtPncNum(val) : '—') + '</td>';
    }
    html += '<td class="px-3 py-2 text-sm text-right mono">' + fmtPncNum(day.total_porsi) + '</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-semibold">' + fmtPncNum(b.total_kebutuhan_kg) + '</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-semibold text-sky-700">' + fmtPncNum(b.kebutuhan_buffer_kg) + '</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold">' + b.rincian + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table></div></div>';
  return html;
}

function fmtPncNum(v) {
  if (v == null || isNaN(v)) return '0,00';
  return Number(v).toFixed(2).replace('.', ',');
}

function exportPncCsv() {
  showAlert('Export CSV: gunakan Print atau salin dari tabel', 'info');
}

// ===== Buat Draft Purchase Request dari Siklus =====
async function buatPrDariSiklus() {
  try {
    // Ambil daftar siklus
    const siklusList = await api.get('/siklus');
    const aktif = siklusList.filter(s => s.status === 'Aktif');
    
    if (!aktif.length) {
      showAlert('Tidak ada siklus dengan status Aktif. Aktifkan siklus terlebih dahulu.', 'warning');
      return;
    }

    // Tampilkan pilihan siklus via prompt sederhana
    let msg = 'Pilih siklus yang akan dibuat PR:\n\n';
    for (var i = 0; i < aktif.length; i++) {
      msg += (i+1) + '. ' + aktif[i].nama + ' (' + aktif[i].kategori_penerima + ' - ' + aktif[i].jumlah_porsi + ' porsi)\n';
    }
    msg += '\nMasukkan nomor siklus (pisahkan dengan koma, misal: 1,2,3):';
    
    const input = prompt(msg);
    if (!input) return;
    
    const selectedIndices = input.split(',').map(function(s) { return parseInt(s.trim()) - 1; }).filter(function(i) { return i >= 0 && i < aktif.length; });
    if (!selectedIndices.length) {
      showAlert('Pilihan tidak valid', 'error');
      return;
    }

    const selectedSiklus = selectedIndices.map(function(i) { return aktif[i]; });
    const siklusIds = selectedSiklus.map(function(s) { return s.id; });

    showAlert('Membuat Draft PR untuk ' + selectedSiklus.length + ' siklus...', 'info');
    
    const result = await api.post('/purchase_order/create-pr-from-siklus', {
      siklus_ids: siklusIds
    });

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
}

// Format number helper (gunakan yang sudah ada: fmtPncNum di file ini)
