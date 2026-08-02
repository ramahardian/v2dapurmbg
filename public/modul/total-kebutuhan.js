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

  // Satuan yang dihitung per satuan (pcs/btl/renceng/ctn/karton) vs per berat (kg/g)
  function isSatuanHitung(s) {
    var t = String(s || '').toLowerCase();
    return t === 'pcs' || t === 'btl' || t === 'renceng' || t === 'ctn' || t === 'karton' || t === 'kardus' || t === 'dus' || t === 'pack' || t === 'ikat' || t === 'ekor' || t === 'butir' || t === 'bungkus';
  }

  // Berat isi per satuan efektif — bila kosong, minyak dikarton diasumsikan 6x2L / 12x1L ≈ 12 L ≈ 11 kg
  function beratPerSatuanEfektif(satuan, kategoriSp, beratPerSatuan) {
    var b = Number(beratPerSatuan) || 0;
    if (String(kategoriSp || '').toLowerCase() === 'minyak') {
      var s = String(satuan || '').toLowerCase();
      if ((s === 'karton' || s === 'ctn' || s === 'kardus' || s === 'dus') && b > 0) return b;
      return 11000;
    }
    if (b > 0) return b;
    return 0;
  }

  function autoQty(satuan, totalKg, jumlahSiswa, kategoriSp, beratPerSatuan) {
    var s = String(satuan || 'kg').toLowerCase();
    // Minyak selalu dinyatakan per karton untuk kebutuhan PR/PO ke supplier
    if (String(kategoriSp || '').toLowerCase() === 'minyak') {
      if (!totalKg || totalKg <= 0) return '';
      var bps = beratPerSatuanEfektif(satuan, kategoriSp, beratPerSatuan);
      return Math.ceil((totalKg * 1000) / bps) + ' karton';
    }
    if (s === 'kg' || s === 'g' || s === 'gram' || s === 'gr') {
      // Bahan berat → dibulatkan ke atas agar aman untuk belanja
      if (s === 'kg') return Math.ceil(totalKg) + ' kg';
      return Math.ceil(totalKg * 1000) + ' g'; // satuan gram
    }
    if (isSatuanHitung(s)) {
      // Bahan kemasan besar (karton/kardus/dus/ctn) wajib punya berat_per_satuan — tanpa itu biarkan kosong agar diisi manual
      var bps = beratPerSatuanEfektif(satuan, kategoriSp, beratPerSatuan);
      if (bps > 0 && totalKg > 0) {
        return Math.ceil((totalKg * 1000) / bps) + ' ' + s;
      }
      if (s === 'karton' || s === 'kardus' || s === 'dus' || s === 'ctn') return '';
      // Bahan satuan lain → pakai jumlah siswa (porsi)
      return (Math.ceil(jumlahSiswa) || 0) + ' ' + s;
    }
    return '';
  }

  // Nilai Kebutuhan dalam satuan alami bahan (kg untuk bahan berat, pcs/btl untuk bahan satuan)
  // supaya konsisten dgn kolom Kg/pcs/btl. Kosong jika belum ada nilai.
  function kebutuhanSatuan(satuan, bufferKg, jumlahSiswa, kategoriSp, beratPerSatuan) {
    if (!bufferKg || bufferKg <= 0) return '';
    var s = String(satuan || 'kg').toLowerCase();
    // Minyak selalu dinyatakan per karton untuk kebutuhan PR/PO ke supplier
    if (String(kategoriSp || '').toLowerCase() === 'minyak') {
      var bpsM = beratPerSatuanEfektif(satuan, kategoriSp, beratPerSatuan);
      var nKarton = (bufferKg * 1000) / bpsM;
      return fmtTkNum(Math.round(nKarton * 100) / 100) + ' karton';
    }
    if (s === 'kg' || s === 'g' || s === 'gram' || s === 'gr') {
      if (s === 'kg') return fmtTkNum(Math.round(bufferKg * 100) / 100);
      return fmtTkNum(Math.round(bufferKg * 1000 * 100) / 100) + ' g';
    }
    if (isSatuanHitung(s)) {
      // Kemasan besar (ctn/karton/dus) diukur per berat → tampilkan kg (nilai pasti)
      if (s === 'karton' || s === 'kardus' || s === 'dus' || s === 'ctn') {
        return fmtTkNum(Math.round(bufferKg * 100) / 100);
      }
      // Bahan dengan berat per satuan → konversi ke jumlah satuan
      var bps = beratPerSatuanEfektif(satuan, kategoriSp, beratPerSatuan);
      if (bps > 0 && bufferKg > 0) {
        var n = (bufferKg * 1000) / bps;
        return fmtTkNum(Math.round(n * 100) / 100) + ' ' + s;
      }
      // Bahan satuan (pcs/btl/renceng/dll) → jumlah per porsi
      return (Math.ceil(jumlahSiswa) || 0) + ' ' + s;
    }
    return fmtTkNum(Math.round(bufferKg * 100) / 100);
  }

  var html = '';
  var totalPorsiDay = totalSiswaSemuaJenjang > 0 ? totalSiswaSemuaJenjang : (Number(hari[0] && hari[0].total_porsi) || 0);

  for (var d = 0; d < hari.length; d++) {
    var day = hari[d];
    if (!day.bahan || !day.bahan.length) continue;

    // Day card
    html += '<div class="bg-white border border-stone-200 rounded-xl overflow-hidden mb-4 shadow-sm tk-day-card" data-tanggal="' + (day.header_tanggal || '') + '" data-hari="' + (day.hari_nama || '') + '" data-menu="' + escHtmlTk((day.menu_names || []).join('+')) + '">';

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
      var kategoriSp = b.kategori_sp || '';
      var hargaSatuan = Number(b.harga_satuan) || 0;
      var qty = autoQty(satuan, bufferKg, rowSiswa, kategoriSp, Number(b.berat_per_satuan) || 0);
      var kebutuhan = kebutuhanSatuan(satuan, bufferKg, rowSiswa, kategoriSp, Number(b.berat_per_satuan) || 0);
      var ket = b.keterangan || '';

      html += '<tr class="border-b border-stone-100 hover:bg-emerald-50/30 transition-colors">';
      html += '<td class="px-3 py-1.5 text-sm font-medium text-stone-800">' + (b.nama_display || b.nama) + '</td>';
      // Input jumlah — otomatis terisi, bisa diedit manual
      html += '<td class="px-3 py-1.5"><input type="text" value="' + escHtmlTk(qty) + '" placeholder="isi jumlah" data-bahan="' + escHtmlTk(b.nama_display || b.nama) + '" data-harga="' + hargaSatuan + '" data-ket="' + escHtmlTk(ket) + '" class="tk-qty-input w-full min-w-[90px] px-2 py-1 text-sm rounded-lg border border-stone-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 bg-white" title="Jumlah belanja — otomatis terisi, bisa diedit"></td>';
      // Input keterangan — terisi dari resep menu, bisa diedit manual
      html += '<td class="px-3 py-1.5"><input type="text" value="' + escHtmlTk(ket) + '" placeholder="keterangan" data-bahan="' + escHtmlTk(b.nama_display || b.nama) + '" class="tk-ket-input w-full min-w-[110px] px-2 py-1 text-sm rounded-lg border border-stone-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 bg-white" title="Keterangan — terisi dari resep, bisa diedit"></td>';
      html += '<td class="px-3 py-1.5 text-sm text-right mono font-bold text-emerald-700 whitespace-nowrap">' + (kebutuhan ? escHtmlTk(kebutuhan) : '<span class="text-stone-300">—</span>') + '</td>';
      html += '</tr>';
    }

    // Total row
    html += '<tr class="bg-stone-50 border-t-2 border-stone-200 font-bold">';
    html += '<td class="px-3 py-2 text-sm font-semibold text-stone-700">Total</td>';
    html += '<td class="px-3 py-2"></td>';
    html += '<td class="px-3 py-2"></td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-emerald-700">' + fmtTkNum(Math.round(grandTotalKg * 100) / 100) + '</td>';
    html += '</tr>';

    html += '</tbody></table></div>';

    // ── Konversi ke Kebutuhan Belanja ──
    html += '<div class="px-4 pb-4 flex flex-wrap items-center gap-3">';
    html += '<button onclick="konversiKebutuhanKeBelanja(this)" class="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl text-xs font-semibold transition-all shadow-sm hover:shadow-md" title="Ubah daftar belanja ini menjadi format RAB (ada harga, qty, total)">';
    html += '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5c0 1.1-.9 2-2 2h-1"/></svg>';
    html += 'Konversi ke Kebutuhan Belanja';
    html += '</button>';
    html += '<span class="text-[10px] text-stone-400">Harga diambil dari master Bahan Baku. Ubah jumlah/ket lalu klik untuk meng-generate RAB belanja.</span>';
    html += '</div>';
    html += '<div class="tk-belanja-result px-4 pb-4 hidden"></div>';
    html += '</div>';
  }

  if (!html) {
    html = '<div class="text-center py-16 text-stone-400 bg-white border border-stone-200 rounded-lg"><div class="text-sm">Tidak ada data untuk ditampilkan</div></div>';
  } else {
    // ── Legenda ──
    html += '<div class="bg-white border border-stone-200 rounded-lg p-4 mt-4 text-xs text-stone-500">';
    html += '<div class="font-semibold text-stone-700 mb-2">Keterangan:</div>';
    html += '<ul class="space-y-1 list-disc list-inside">';
    html += '<li><strong>Kg/pcs/btl</strong> = jumlah belanja per bahan — terisi otomatis dari perhitungan (bahan berat → kg; bahan satuan → pcs/btl/dll.), bisa diedit langsung di kolom.</li>';
    html += '<li><strong>Ket</strong> = keterangan/instruksi bahan (mis. Potong 10, Fillet) — terisi dari resep menu, bisa diedit langsung di kolom.</li>';
    html += '<li><strong>Kebutuhan</strong> = total kebutuhan semua jenjang sesuai satuan bahan (kg untuk bahan berat; pcs/btl untuk bahan satuan), sudah termasuk <em>buffer</em> 1-10% (jika ada).</li>';
    html += '<li>Angka otomatis memakai pembulatan ke atas agar aman untuk pembelian.</li>';
    html += '</ul></div>';
  }

  return html;
}

// ── Konversi daftar belanja (Total Kebutuhan) → format RAB Kebutuhan Belanja ──
// Membaca nilai qty & keterangan yang saat ini ter-edit di input, lalu membuat
// tabel belanja ala RAB: NO | URAIAN | QTY | SATUAN | HARGA | JUMLAH | KETERANGAN.
async function konversiKebutuhanKeBelanja(btnEl) {
  var card = btnEl.closest('.tk-day-card');
  if (!card) return;
  var resultEl = card.querySelector('.tk-belanja-result');
  if (!resultEl) return;

  var tanggal = card.getAttribute('data-tanggal') || '';
  var hariNama = card.getAttribute('data-hari') || '';
  var menuNama = card.getAttribute('data-menu') || '';

  var qtyInputs = card.querySelectorAll('.tk-qty-input');
  var ketInputs = card.querySelectorAll('.tk-ket-input');
  var ketMap = {};
  ketInputs.forEach(function(k) { ketMap[k.getAttribute('data-bahan')] = k.value || ''; });

  var no = 0;
  var rows = [];
  var grandTotal = 0;

  qtyInputs.forEach(function(inp) {
    var nama = inp.getAttribute('data-bahan') || '';
    var harga = Number(inp.getAttribute('data-harga')) || 0;
    var qtyStr = String(inp.value || '').trim();
    var parsed = parseTkQtySatuan(qtyStr);

    if (parsed.qty <= 0) return;
    no++;
    var jumlah = Math.round(parsed.qty * harga);
    grandTotal += jumlah;

    rows.push({
      no: no,
      uraian: nama,
      qty: fmtTkNum(parsed.qty),
      satuan: parsed.satuan,
      harga: harga,
      jumlah: jumlah,
      ket: ketMap[nama] || '',
    });
  });

  // Anggaran belanja harian dari budget (via endpoint rab-harian)
  var anggaran = 0;
  if (tanggal) {
    try {
      var rh = await api.get('/laporan/rab-harian?tanggal=' + tanggal);
      anggaran = Number(rh.anggaran_belanja_harian) || 0;
    } catch (e) { anggaran = 0; }
  }
  var sisa = anggaran - grandTotal;

  // ── Header ──
  var tglFormatted = fmtTkTanggalPanjang(tanggal, hariNama);
  var html = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mt-4">';
  html += '<div class="px-5 py-4 text-center border-b border-stone-100" style="background:linear-gradient(135deg,#0e7490,#0891b2)">';
  html += '<h1 class="text-sm font-bold text-white uppercase tracking-wider">RENCANA ANGGARAN BELANJA (RAB) BAHAN BAKU HARIAN</h1>';
  html += '<div class="text-[10px] text-cyan-100 mt-1">SPPG BOGOR TAMANSARI SUKALUYU</div>';
  html += '<div class="text-[10px] text-cyan-100">YAYASAN SHAIMA ANAK SHOLEHA</div>';
  html += '</div>';
  html += '<div class="px-5 py-3 bg-stone-50/80 border-b border-stone-100">';
  html += '<div class="flex flex-wrap justify-center gap-x-8 gap-y-1 text-xs">';
  if (menuNama) html += '<div><span class="font-semibold text-stone-700">MENU:</span> <span class="text-stone-600">' + escHtmlTk(menuNama) + '</span></div>';
  if (tglFormatted) html += '<div><span class="font-semibold text-stone-700">Hari :</span> <span class="text-stone-600">' + escHtmlTk(tglFormatted) + '</span></div>';
  html += '</div></div>';

  // ── Tabel ──
  if (rows.length) {
    html += '<div class="overflow-x-auto"><table class="w-full text-xs">';
    html += '<thead><tr class="bg-stone-50">';
    html += '<th class="text-center px-2 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider w-8">NO</th>';
    html += '<th class="text-left px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">URAIAN</th>';
    html += '<th class="text-right px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">QTY</th>';
    html += '<th class="text-left px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">SATUAN</th>';
    html += '<th class="text-right px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">HARGA</th>';
    html += '<th class="text-right px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">JUMLAH</th>';
    html += '<th class="text-left px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">KETERANGAN</th>';
    html += '</tr></thead><tbody>';

    rows.forEach(function(r) {
      html += '<tr class="border-t border-stone-100 hover:bg-cyan-50/40 transition-colors">';
      html += '<td class="px-2 py-3 text-center text-xs text-stone-500">' + r.no + '</td>';
      html += '<td class="px-3 py-3 text-xs font-medium text-stone-700">' + escHtmlTk(r.uraian) + '</td>';
      html += '<td class="px-3 py-3 text-right mono text-xs font-semibold text-stone-700">' + r.qty + '</td>';
      html += '<td class="px-3 py-3 text-xs text-stone-500">' + escHtmlTk(r.satuan) + '</td>';
      html += '<td class="px-3 py-3 text-right mono text-xs text-stone-600">' + fmtTkRp(r.harga) + '</td>';
      html += '<td class="px-3 py-3 text-right mono text-xs font-bold text-stone-800">' + fmtTkRp(r.jumlah) + '</td>';
      html += '<td class="px-3 py-3 text-xs text-stone-400">' + (r.ket ? escHtmlTk(r.ket) : '') + '</td>';
      html += '</tr>';
    });

    html += '<tr class="border-t-2 border-stone-300 bg-gradient-to-r from-cyan-50 to-blue-50 font-bold">';
    html += '<td colspan="5" class="px-4 py-3.5 text-xs text-right text-stone-800 uppercase tracking-wider">TOTAL</td>';
    html += '<td class="px-3 py-3.5 text-right mono text-xs font-bold text-blue-700">' + fmtTkRp(grandTotal) + '</td>';
    html += '<td></td>';
    html += '</tr>';
    if (anggaran > 0) {
      html += '<tr class="border-t border-stone-200 bg-white">';
      html += '<td colspan="5" class="px-4 py-3 text-xs text-right text-stone-600">ANGGARAN BELANJA HARIAN</td>';
      html += '<td class="px-3 py-3 text-right mono text-xs font-bold text-stone-800">' + fmtTkRp(anggaran) + '</td>';
      html += '<td></td>';
      html += '</tr>';
      html += '<tr class="border-t border-stone-200 ' + (sisa >= 0 ? 'bg-emerald-50/50' : 'bg-red-50/50') + '">';
      html += '<td colspan="5" class="px-4 py-3 text-xs text-right font-bold text-' + (sisa >= 0 ? 'emerald' : 'red') + '-700">SISA</td>';
      html += '<td class="px-3 py-3 text-right mono text-xs font-bold text-' + (sisa >= 0 ? 'emerald' : 'red') + '-600">' + (sisa < 0 ? '-' : '') + fmtTkRp(Math.abs(sisa)) + '</td>';
      html += '<td class="px-3 py-3 text-xs text-' + (sisa >= 0 ? 'emerald' : 'red') + '-500">' + (sisa < 0 ? 'DEFISIT' : '') + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div>';
  } else {
    html += '<div class="p-6 text-center text-xs text-stone-400">Tidak ada bahan dengan jumlah untuk dikonversi. Isi kolom jumlah (Kg/pcs/btl) terlebih dahulu.</div>';
  }

  html += '</div>';

  resultEl.innerHTML = html;
  resultEl.classList.remove('hidden');
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Parse input qty → { qty:number, satuan:string }
// Mendukung format: "206", "206 kg", "2839 pcs", "1/2", "1,5 kg", "4 CARTON"
function parseTkQtySatuan(str) {
  var s = String(str || '').trim();
  if (!s) return { qty: 0, satuan: '' };

  var satuan = '';
  // Ambil satuan kata terakhir (huruf saja)
  var mSat = s.match(/([a-zA-Z]+)\s*$/);
  if (mSat) {
    satuan = mSat[1].toUpperCase();
    s = s.slice(0, mSat.index).trim();
  }

  var qty = 0;
  // Pecahan 1/2
  if (/^[0-9,.\s]+\/[0-9,.\s]+$/.test(s)) {
    var parts = s.split('/');
    var num = parseFloat(parts[0].replace(/\./g, '').replace(/,/g, '.'));
    var den = parseFloat(parts[1].replace(/\./g, '').replace(/,/g, '.'));
    if (den) qty = num / den;
  } else {
    var cleaned = s.replace(/\./g, '').replace(/,/g, '.');
    qty = parseFloat(cleaned);
    if (isNaN(qty)) qty = 0;
  }

  return { qty: Math.round(qty * 100) / 100, satuan: satuan };
}

function fmtTkRp(v) {
  return 'Rp ' + Number(v || 0).toLocaleString('id-ID');
}

function fmtTkTanggalPanjang(tanggal, hariNama) {
  if (!tanggal) return hariNama || '';
  var p = String(tanggal).split('-');
  var dd = parseInt(p[2], 10);
  var mm = parseInt(p[1], 10) - 1;
  var bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  if (p.length !== 3 || isNaN(dd) || isNaN(mm) || !bulan[mm]) return (hariNama || '') + ' ' + tanggal;
  return (hariNama || '').toUpperCase() + ' ' + dd + ' ' + bulan[mm] + ' ' + p[0];
}
