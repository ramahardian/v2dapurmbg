// ===== Total Kebutuhan Pangan =====
// Menampilkan kebutuhan bahan per hari dengan format BDD
// Satu tabel per hari — total semua jenjang digabung

function escHtmlTk(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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

async function loadTotalKebutuhan() {
  const wrap = document.getElementById('total-kebutuhan-content');
  if (!wrap) return;

  // Baca nilai input date SEBELUM loading spinner menghapus DOM
  const tglMulai = document.getElementById('tk-tanggal-mulai')?.value || '';
  const tglSelesai = document.getElementById('tk-tanggal-selesai')?.value || '';

  wrap.innerHTML = '<div class="flex items-center justify-center py-16"><svg class="animate-spin h-8 w-8 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';

  try {
    const params = new URLSearchParams();
    if (tglMulai) params.set('tanggal_mulai', tglMulai);
    if (tglSelesai) params.set('tanggal_selesai', tglSelesai);
    const qs = params.toString() ? '?' + params.toString() : '';
    const res = await api.get('/siklus/laporan/perencanaan' + qs);
    const { hari, pm_map, tanggal_mulai, tanggal_selesai, _validation } = res;

    // Hitung total jumlah_siswa semua jenjang
    var totalSiswaSemuaJenjang = 0;
    if (pm_map) {
      for (var key in pm_map) totalSiswaSemuaJenjang += Number(pm_map[key]) || 0;
    }

    let html = '';

    // ── Filter bar ──
    html += '<div class="bg-white border border-stone-200 rounded-xl p-4 mb-4 flex flex-wrap items-center gap-4 shadow-sm">';
    html += '<label class="text-sm font-medium text-stone-700">Dari:</label>';
    html += '<input type="date" id="tk-tanggal-mulai" value="' + (tanggal_mulai || '') + '" onchange="loadTotalKebutuhan()" class="h-10 px-3 border border-stone-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">';
    html += '<label class="text-sm font-medium text-stone-700">Sampai:</label>';
    html += '<input type="date" id="tk-tanggal-selesai" value="' + (tanggal_selesai || '') + '" onchange="loadTotalKebutuhan()" class="h-10 px-3 border border-stone-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">';
    html += '<button onclick="tkResetTanggal()" class="h-10 px-3 bg-white border border-stone-200 rounded-xl text-xs text-stone-500 hover:bg-stone-50 transition-colors" title="Reset filter">Reset</button>';
    var tkAdaData = !_validation && hari && hari.length;
    if (tkAdaData) {
      html += '<button onclick="buatPrDariSiklus()" class="ml-auto h-10 px-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl text-sm font-medium transition-all shadow-md hover:shadow-lg flex items-center gap-2">';
      html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> Buat Draft PR';
      html += '</button>';
    }
    html += '<div class="text-xs text-stone-400">' + (hari ? hari.length + ' hari' : '0 hari') + ' | Total ' + totalSiswaSemuaJenjang + ' siswa</div>';
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
      html += '<div class="font-semibold text-sm text-' + c + '-800">' + escHtmlTk(vl.message) + '</div>';
      html += '<div class="text-xs text-' + c + '-600 mt-1">' + escHtmlTk(vl.detail || '') + '</div>';
      // Link ke halaman siklus jika tidak ada siklus
      if (vl.level === 'no_siklus') {
        html += '<a href="/siklus" onclick="return loadPage(\'siklus\')" class="inline-flex items-center gap-1.5 mt-3 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm">';
        html += '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>';
        html += 'Buat Siklus Baru';
        html += '</a>';
      }
      html += '</div></div></div>';

      wrap.innerHTML = html;
      return;
    }

    if (!hari || !hari.length) {
      html += '<div class="text-center py-16 text-stone-400 bg-white border border-stone-200 rounded-lg"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg><div class="text-sm">Tidak ada data</div></div>';
      wrap.innerHTML = html;
      return;
    }

    // ── Render per day — daftar belanja (Bahan | Kg/pcs/btl | Ket | Kebutuhan) ──
    html += renderTkBelanjaPerHari(hari, totalSiswaSemuaJenjang);

    wrap.innerHTML = html;
  } catch (err) {
    wrap.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal: ' + err.message + '</div>';
  }
}

function tkResetTanggal() {
  var elMulai = document.getElementById('tk-tanggal-mulai');
  var elSelesai = document.getElementById('tk-tanggal-selesai');
  if (elMulai) elMulai.value = '';
  if (elSelesai) elSelesai.value = '';
  loadTotalKebutuhan();
}

function fmtTkNum(v) {
  if (v == null || isNaN(v)) return '0,00';
  var n = Number(v);
  return n === Math.floor(n) ? String(n) : n.toFixed(2).replace('.', ',');
}

// ── Render matriks perencanaan per hari (dipakai bersama halaman Perencanaan) ──
// Baris = bahan pangan, kolom = jenjang + Total Porsi + Kebutuhan Pangan (kg) + 1-10% + Rincian
function renderTkMatriksPerHari(hari, totalSiswaSemuaJenjang) {
  var tkJenjangOrder = ['TK/PAUD', 'SD/MI (1-3)', 'SD/MI (4-6)', 'SMP/MTs, SMA/SMK', 'Bumil/Busui', 'Balita'];
  var tkBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function tkFmtTanggal(headerTanggal, hariNama) {
    var p = String(headerTanggal || '').split('-');
    var dd = parseInt(p[2], 10);
    var mm = parseInt(p[1], 10) - 1;
    if (p.length !== 3 || isNaN(dd) || isNaN(mm) || !tkBulan[mm]) return headerTanggal || (hariNama || '');
    return (hariNama || '') + ', ' + dd + ' ' + tkBulan[mm] + ' ' + p[0];
  }

  var html = '';
  var totalPorsiDay = totalSiswaSemuaJenjang > 0 ? totalSiswaSemuaJenjang : (Number(hari[0] && hari[0].total_porsi) || 0);

  for (var d = 0; d < hari.length; d++) {
    var day = hari[d];
    if (!day.bahan || !day.bahan.length) continue;

    // Day card
    html += '<div class="bg-white border border-stone-200 rounded-xl overflow-hidden mb-4 shadow-sm">';

    // Day header
    html += '<div class="px-5 py-3 bg-gradient-to-r from-emerald-50 to-green-50 border-b border-stone-200 flex items-center gap-3 flex-wrap">';
    html += '<span class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 font-bold text-sm">M' + (d + 1) + '</span>';
    html += '<div>';
    html += '<div class="font-semibold text-sm text-emerald-800">' + tkFmtTanggal(day.header_tanggal, day.hari_nama) + '</div>';
    if (day.menu_names && day.menu_names.length) {
      html += '<div class="text-xs text-stone-500 mt-0.5">' + day.menu_names.join(' + ') + '</div>';
    }
    html += '</div>';
    html += '<div class="ml-auto text-xs text-stone-500">Total Porsi: <strong class="text-emerald-700">' + fmtTkNum(totalPorsiDay) + '</strong></div>';
    html += '</div>';

    // ── Matriks: baris = bahan, kolom = jenjang ──
    html += '<div class="overflow-x-auto p-4"><table class="w-full text-xs border-collapse">';
    html += '<thead><tr class="border-b border-stone-200 bg-stone-50">';
    html += '<th class="px-3 py-2 text-left font-semibold text-stone-600 min-w-[140px]">Bahan Pangan</th>';
    for (var jc = 0; jc < tkJenjangOrder.length; jc++) {
      html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">' + tkJenjangOrder[jc] + '</th>';
    }
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Total Porsi</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Kebutuhan Pangan (kg)</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap" title="Kebutuhan + buffer per bahan (1-10%)">1-10%</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Rincian</th>';
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
      for (var jc3 = 0; jc3 < tkJenjangOrder.length; jc3++) {
        var jn = tkJenjangOrder[jc3];
        var pj = b.per_jenjang[jn];
        var v = pj ? (Number(pj.kebutuhan_kg) || 0) : 0;
        rowKg += v;
        colTotal[jn] += v;
        cells += '<td class="px-3 py-1.5 text-sm text-right mono">' + (v ? fmtTkNum(v) : '-') + '</td>';
      }
      var bufferKg = Math.round(rowKg * (1 + bufferPersen / 100) * 100) / 100;
      grandTotalKg += rowKg;
      grandBufferKg += bufferKg;

      html += '<tr class="border-b border-stone-100 hover:bg-emerald-50/30 transition-colors">';
      html += '<td class="px-3 py-1.5 text-sm font-medium text-stone-800">' + (b.nama_display || b.nama) + '</td>';
      html += cells;
      html += '<td class="px-3 py-1.5 text-sm text-right mono text-stone-600">' + fmtTkNum(totalPorsiDay) + '</td>';
      html += '<td class="px-3 py-1.5 text-sm text-right mono font-bold text-emerald-700">' + fmtTkNum(rowKg) + '</td>';
      html += '<td class="px-3 py-1.5 text-sm text-right mono font-bold ' + (bufferPersen > 0 ? 'text-sky-700' : 'text-stone-500') + '" title="Buffer ' + bufferPersen + '%">' + fmtTkNum(bufferKg) + '</td>';
      html += '<td class="px-3 py-1.5 text-sm text-right text-stone-400"></td>';
      html += '</tr>';
    }

    // Total row
    html += '<tr class="bg-stone-50 border-t-2 border-stone-200 font-bold">';
    html += '<td class="px-3 py-2 text-sm font-semibold text-stone-700">Total</td>';
    for (var jc4 = 0; jc4 < tkJenjangOrder.length; jc4++) {
      html += '<td class="px-3 py-2 text-sm text-right mono text-stone-700">' + fmtTkNum(colTotal[tkJenjangOrder[jc4]]) + '</td>';
    }
    html += '<td class="px-3 py-2 text-sm text-right mono text-stone-700">' + fmtTkNum(totalPorsiDay) + '</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-emerald-700">' + fmtTkNum(Math.round(grandTotalKg * 100) / 100) + '</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-sky-700">' + fmtTkNum(Math.round(grandBufferKg * 100) / 100) + '</td>';
    html += '<td class="px-3 py-2"></td>';
    html += '</tr>';

    html += '</tbody></table></div></div>';
  }

  if (!html) {
    html = '<div class="text-center py-16 text-stone-400 bg-white border border-stone-200 rounded-lg"><div class="text-sm">Tidak ada data untuk ditampilkan</div></div>';
  } else {
    // ── Legenda ──
    html += '<div class="bg-white border border-stone-200 rounded-lg p-4 mt-4 text-xs text-stone-500">';
    html += '<div class="font-semibold text-stone-700 mb-2">Keterangan:</div>';
    html += '<ul class="space-y-1 list-disc list-inside">';
    html += '<li><strong>Kolom jenjang</strong> = kebutuhan bahan (kg) per kategori penerima manfaat (TK/PAUD, SD, SMP/SMA, Bumil/Busui, Balita).</li>';
    html += '<li><strong>Total Porsi</strong> = total penerima manfaat (porsi) semua jenjang pada hari tersebut.</li>';
    html += '<li><strong>Kebutuhan Pangan (kg)</strong> = jumlah kebutuhan seluruh jenjang (Berat Kotor × Jumlah Penerima ÷ 1000).</li>';
    html += '<li><strong>1-10%</strong> = Kebutuhan Pangan + <em>buffer</em> per bahan — diambil dari <em>buffer_persen</em> master Bahan Baku (jika kosong = 0%).</li>';
    html += '<li><strong>Rincian</strong> = kolom untuk catatan/penjelasan tambahan.</li>';
    html += '</ul></div>';
  }

  return html;
}

// ── Render daftar belanja per hari (format: Bahan | Kg/pcs/btl | Ket | Kebutuhan) ──
// Kolom jumlah (Kg/pcs/btl) terisi otomatis dari perhitungan dan bisa diedit manual.
function renderTkBelanjaPerHari(hari, totalSiswaSemuaJenjang) {
  var tkBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function tkFmtTanggal(headerTanggal, hariNama) {
    var p = String(headerTanggal || '').split('-');
    var dd = parseInt(p[2], 10);
    var mm = parseInt(p[1], 10) - 1;
    if (p.length !== 3 || isNaN(dd) || isNaN(mm) || !tkBulan[mm]) return headerTanggal || (hariNama || '');
    return (hariNama || '') + ', ' + dd + ' ' + tkBulan[mm] + ' ' + p[0];
  }

  // Satuan yang dihitung per satuan (pcs/btl/renceng/ctn) vs per berat (kg/g)
  function isSatuanHitung(s) {
    var t = String(s || '').toLowerCase();
    return t === 'pcs' || t === 'btl' || t === 'renceng' || t === 'ctn' || t === 'pack' || t === 'ikat' || t === 'ekor' || t === 'butir' || t === 'bungkus';
  }

  function autoQty(satuan, totalKg, jumlahSiswa, beratPerSatuan) {
    var s = String(satuan || 'kg').toLowerCase();
    if (s === 'kg' || s === 'g' || s === 'gram' || s === 'gr') {
      // Bahan berat → dibulatkan ke atas agar aman untuk belanja
      if (s === 'kg') return Math.ceil(totalKg) + ' kg';
      return Math.ceil(totalKg * 1000) + ' g'; // satuan gram
    }
    if (isSatuanHitung(s)) {
      // Bahan satuan → pakai jumlah siswa (porsi) atau konversi dari berat_per_satuan
      if (beratPerSatuan > 0 && totalKg > 0) {
        var n = Math.ceil((totalKg * 1000) / beratPerSatuan);
        return n + ' ' + s;
      }
      return (Math.ceil(jumlahSiswa) || 0) + ' ' + s;
    }
    return '';
  }

  var html = '';
  var totalPorsiDay = totalSiswaSemuaJenjang > 0 ? totalSiswaSemuaJenjang : (Number(hari[0] && hari[0].total_porsi) || 0);

  for (var d = 0; d < hari.length; d++) {
    var day = hari[d];
    if (!day.bahan || !day.bahan.length) continue;

    // Day card
    html += '<div class="bg-white border border-stone-200 rounded-xl overflow-hidden mb-4 shadow-sm">';

    // Day header: tanggal + menu
    html += '<div class="px-5 py-3 bg-gradient-to-r from-emerald-50 to-green-50 border-b border-stone-200 flex items-center gap-3 flex-wrap">';
    html += '<span class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 font-bold text-sm">M' + (d + 1) + '</span>';
    html += '<div>';
    html += '<div class="font-semibold text-sm text-emerald-800">' + tkFmtTanggal(day.header_tanggal, day.hari_nama) + '</div>';
    if (day.menu_names && day.menu_names.length) {
      html += '<div class="text-xs text-stone-500 mt-0.5">' + day.menu_names.join(' + ') + '</div>';
    }
    html += '</div>';
    html += '<div class="ml-auto text-xs text-stone-500">Total Porsi: <strong class="text-emerald-700">' + fmtTkNum(totalPorsiDay) + '</strong></div>';
    html += '</div>';

    // ── Daftar belanja: Bahan | Kg/pcs/btl | Ket | Kebutuhan ──
    html += '<div class="overflow-x-auto p-4"><table class="w-full text-xs border-collapse">';
    html += '<thead><tr class="border-b border-stone-200 bg-stone-50">';
    html += '<th class="px-3 py-2 text-left font-semibold text-stone-600 min-w-[140px]">Bahan Pangan</th>';
    html += '<th class="px-3 py-2 text-left font-semibold text-stone-600 whitespace-nowrap min-w-[110px]">Kg/pcs/btl</th>';
    html += '<th class="px-3 py-2 text-left font-semibold text-stone-600 whitespace-nowrap">Ket</th>';
    html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Kebutuhan</th>';
    html += '</tr></thead><tbody>';

    var grandTotalKg = 0;

    for (var bi = 0; bi < day.bahan.length; bi++) {
      var b = day.bahan[bi];
      if (!b.per_jenjang) continue;

      // Total kg + jumlah siswa semua jenjang
      var rowKg = 0;
      var rowSiswa = 0;
      for (var jn in b.per_jenjang) {
        var pj = b.per_jenjang[jn];
        rowKg += Number(pj.kebutuhan_kg) || 0;
        rowSiswa += Number(pj.jumlah_siswa) || 0;
      }
      var bufferPersen = Number(b.buffer_persen) || 0;
      var bufferKg = Math.round(rowKg * (1 + bufferPersen / 100) * 100) / 100;
      grandTotalKg += bufferKg;

      var satuan = b.satuan || 'kg';
      var qty = autoQty(satuan, bufferKg, rowSiswa, Number(b.berat_per_satuan) || 0);
      var ket = b.keterangan || '';

      html += '<tr class="border-b border-stone-100 hover:bg-emerald-50/30 transition-colors">';
      html += '<td class="px-3 py-1.5 text-sm font-medium text-stone-800">' + (b.nama_display || b.nama) + '</td>';
      // Input jumlah — otomatis terisi, bisa diedit manual
      html += '<td class="px-3 py-1.5"><input type="text" value="' + escHtmlTk(qty) + '" placeholder="isi jumlah" data-bahan="' + escHtmlTk(b.nama_display || b.nama) + '" class="tk-qty-input w-full min-w-[90px] px-2 py-1 text-sm rounded-lg border border-stone-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 bg-white" title="Jumlah belanja — otomatis terisi, bisa diedit"></td>';
      html += '<td class="px-3 py-1.5 text-sm text-stone-500">' + (ket ? escHtmlTk(ket) : '') + '</td>';
      html += '<td class="px-3 py-1.5 text-sm text-right mono font-bold text-emerald-700">' + fmtTkNum(bufferKg) + '</td>';
      html += '</tr>';
    }

    // Total row
    html += '<tr class="bg-stone-50 border-t-2 border-stone-200 font-bold">';
    html += '<td class="px-3 py-2 text-sm font-semibold text-stone-700">Total</td>';
    html += '<td class="px-3 py-2"></td>';
    html += '<td class="px-3 py-2"></td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-emerald-700">' + fmtTkNum(Math.round(grandTotalKg * 100) / 100) + '</td>';
    html += '</tr>';

    html += '</tbody></table></div></div>';
  }

  if (!html) {
    html = '<div class="text-center py-16 text-stone-400 bg-white border border-stone-200 rounded-lg"><div class="text-sm">Tidak ada data untuk ditampilkan</div></div>';
  } else {
    // ── Legenda ──
    html += '<div class="bg-white border border-stone-200 rounded-lg p-4 mt-4 text-xs text-stone-500">';
    html += '<div class="font-semibold text-stone-700 mb-2">Keterangan:</div>';
    html += '<ul class="space-y-1 list-disc list-inside">';
    html += '<li><strong>Kg/pcs/btl</strong> = jumlah belanja per bahan — terisi otomatis dari perhitungan (bahan berat → kg; bahan satuan → pcs/btl/dll.), bisa diedit langsung di kolom.</li>';
    html += '<li><strong>Ket</strong> = keterangan/instruksi bahan (mis. Potong 10, Fillet) dari resep menu.</li>';
    html += '<li><strong>Kebutuhan</strong> = total kebutuhan (kg) semua jenjang, sudah termasuk <em>buffer</em> 1-10% (jika ada).</li>';
    html += '<li>Angka otomatis memakai pembulatan ke atas agar aman untuk pembelian.</li>';
    html += '</ul></div>';
  }

  return html;
}
