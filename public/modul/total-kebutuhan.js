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
    const siklusId = new URLSearchParams(location.search).get('siklus_id');
    if (siklusId) params.set('siklus_id', siklusId);
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
    html += '<div class="bg-white border border-stone-200 rounded-xl p-4 mb-4 shadow-sm">';
    html += '<div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">';
    html += '<div class="flex flex-wrap items-center gap-2">';
    html += '<label class="text-sm font-medium text-stone-700 whitespace-nowrap">Dari:</label>';
    html += '<input type="date" id="tk-tanggal-mulai" value="' + (tanggal_mulai || '') + '" onchange="loadTotalKebutuhan()" class="h-10 px-3 border border-stone-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">';
    html += '<label class="text-sm font-medium text-stone-700 whitespace-nowrap">Sampai:</label>';
    html += '<input type="date" id="tk-tanggal-selesai" value="' + (tanggal_selesai || '') + '" onchange="loadTotalKebutuhan()" class="h-10 px-3 border border-stone-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">';
    html += '<button onclick="tkResetTanggal()" class="h-10 px-3 bg-white border border-stone-200 rounded-xl text-xs text-stone-500 hover:bg-stone-50 transition-colors whitespace-nowrap" title="Reset filter">Reset</button>';
    html += '</div>';
    var tkAdaData = !_validation && hari && hari.length;
    if (tkAdaData) {
      html += '<div class="flex flex-wrap items-center gap-2">';
      html += '<button onclick="exportTotalKebutuhanXlsx()" class="h-10 px-4 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-medium transition-all shadow-md hover:shadow-lg flex items-center gap-2 whitespace-nowrap" title="Export Total Kebutuhan Pangan ke Excel (template total-kebutuhan.xlsx)">';
      html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Export XLSX';
      html += '</button>';
      html += '</div>';
    }
    html += '</div>';
    html += '<div class="text-xs text-stone-400 mt-3 pt-3 border-t border-stone-100">' + (hari ? hari.length + ' hari' : '0 hari') + ' | Total ' + totalSiswaSemuaJenjang + ' siswa</div>';
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

    // ── Render per day — RAB Kebutuhan Belanja (langsung terkonversi) ──
    html += await renderTkBelanjaPerHari(hari, totalSiswaSemuaJenjang);

    wrap.innerHTML = html;
  } catch (err) {
    wrap.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal: ' + err.message + '</div>';
  }
}

async function exportTotalKebutuhanXlsx() {
  const tglMulai = document.getElementById('tk-tanggal-mulai')?.value || '';
  const tglSelesai = document.getElementById('tk-tanggal-selesai')?.value || '';
  let url = '/api/siklus/laporan/total-kebutuhan/export';
  const params = new URLSearchParams();
  if (tglMulai) params.set('tanggal_mulai', tglMulai);
  if (tglSelesai) params.set('tanggal_selesai', tglSelesai);
  const siklusId = new URLSearchParams(location.search).get('siklus_id');
  if (siklusId) params.set('siklus_id', siklusId);
  const qs = params.toString();
  if (qs) url += '?' + qs;
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
    a.download = 'TOTAL-KEBUTUHAN.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    showAlert('Export Total Kebutuhan Pangan berhasil diunduh', 'success');
  } catch (err) {
    showAlert('Gagal export: ' + err.message, 'error');
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

function tkGcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { var t = b; b = a % b; a = t; }
  return a;
}

// Format angka sebagai pecahan bila nilainya "rapi" — mis. 0,5 → 1/2, 0,2 → 1/5,
// 0,75 → 3/4, 1,5 → 1 1/2. Angka utuh tetap utuh; desimal lain tetap desimal.
// Dipakai di kolom Kebutuhan (kg) & QTY belanja agar sesuai kebiasaan pasar.
function fmtTkPecahan(v) {
  if (v == null || isNaN(v)) return '0,00';
  var n = Number(v);
  if (n === 0) return '0';
  var neg = n < 0;
  n = Math.abs(n);
  var whole = Math.floor(n);
  var frac = n - whole;
  if (frac < 0.005) return (neg ? '-' : '') + String(whole);
  // Cari pecahan sederhana (penyebut 2..6 — pecahan umum dapur: 1/2, 1/3, 1/4,
  // 1/5, 1/6, 2/3, 3/4, 2/5, 3/5, 4/5, 5/6) yang mendekati bagian pecahan.
  // Penyebut dibatasi 6 agar nilai tak-rapi (mis. 0,57 kg — hasil 0,5 ÷ porsi ×
  // siswa) TIDAK tampil sebagai pecahan menyesatkan seperti "4/7".
  var best = null;
  for (var d = 2; d <= 6; d++) {
    var num = Math.round(frac * d);
    if (num < 1 || num >= d) continue;
    var err = Math.abs(frac - num / d);
    if (err < 0.005 && (!best || err < best.err)) best = { num: num, den: d, err: err };
  }
  if (best) {
    var g = tkGcd(best.num, best.den);
    var num2 = best.num / g;
    var den2 = best.den / g;
    var s = neg ? '-' : '';
    if (whole > 0) s += whole + ' ';
    return s + num2 + '/' + den2;
  }
  // Bukan pecahan rapi → tetap desimal
  return (neg ? '-' : '') + n.toFixed(2).replace('.', ',');
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
        cells += '<td class="px-3 py-1.5 text-sm text-right mono">' + (v ? fmtTkPecahan(v) : '-') + '</td>';
      }
      var bufferKg = Math.round(rowKg * (1 + bufferPersen / 100) * 100) / 100;
      grandTotalKg += rowKg;
      grandBufferKg += bufferKg;

      html += '<tr class="border-b border-stone-100 hover:bg-emerald-50/30 transition-colors">';
      html += '<td class="px-3 py-1.5 text-sm font-medium text-stone-800">' + (b.nama_display || b.nama) + '</td>';
      html += cells;
      html += '<td class="px-3 py-1.5 text-sm text-right mono text-stone-600">' + fmtTkNum(totalPorsiDay) + '</td>';
      html += '<td class="px-3 py-1.5 text-sm text-right mono font-bold text-emerald-700">' + fmtTkPecahan(rowKg) + '</td>';
      html += '<td class="px-3 py-1.5 text-sm text-right mono font-bold ' + (bufferPersen > 0 ? 'text-sky-700' : 'text-stone-500') + '" title="Buffer ' + bufferPersen + '%">' + fmtTkPecahan(bufferKg) + '</td>';
      html += '<td class="px-3 py-1.5 text-sm text-right text-stone-400"></td>';
      html += '</tr>';
    }

    // Total row
    html += '<tr class="bg-stone-50 border-t-2 border-stone-200 font-bold">';
    html += '<td class="px-3 py-2 text-sm font-semibold text-stone-700">Total</td>';
    for (var jc4 = 0; jc4 < tkJenjangOrder.length; jc4++) {
      html += '<td class="px-3 py-2 text-sm text-right mono text-stone-700">' + fmtTkPecahan(colTotal[tkJenjangOrder[jc4]]) + '</td>';
    }
    html += '<td class="px-3 py-2 text-sm text-right mono text-stone-700">' + fmtTkNum(totalPorsiDay) + '</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-emerald-700">' + fmtTkPecahan(Math.round(grandTotalKg * 100) / 100) + '</td>';
    html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-sky-700">' + fmtTkPecahan(Math.round(grandBufferKg * 100) / 100) + '</td>';
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
    html += '<li><strong>Kebutuhan Pangan (kg)</strong> = jumlah kebutuhan seluruh jenjang (Berat Kotor × Jumlah Penerima ÷ 1000) — ditampilkan dalam pecahan bila rapi (mis. 0,5 kg → 1/2 kg, 0,2 kg → 1/5 kg).</li>';
    html += '<li><strong>1-10%</strong> = Kebutuhan Pangan + <em>buffer</em> per bahan — diambil dari <em>buffer_persen</em> master Bahan Baku (jika kosong = 0%).</li>';
    html += '<li><strong>Rincian</strong> = kolom untuk catatan/penjelasan tambahan.</li>';
    html += '</ul></div>';
  }

  return html;
}

// ── Render RAB Kebutuhan Belanja per hari (format: NO | URAIAN | QTY | SATUAN | HARGA | JUMLAH | KETERANGAN) ──
// Langsung dikonversi dari Total Kebutuhan — tidak perlu tombol/klik.
async function renderTkBelanjaPerHari(hari, totalSiswaSemuaJenjang) {
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
    return t === 'pcs' || t === 'btl' || t === 'botol' || t === 'renceng' || t === 'ctn' || t === 'karton' || t === 'kardus' || t === 'dus' || t === 'pack' || t === 'ikat' || t === 'ekor' || t === 'butir' || t === 'bungkus';
  }

  // Berat isi per satuan efektif — bila kosong, minyak dikarton diasumsikan 6x2L / 12x1L ≈ 12 L ≈ 11 kg
  function beratPerSatuanEfektif(satuan, kategoriSp, beratPerSatuan) {
    var b = Number(beratPerSatuan) || 0;
    if (b > 0) return b;
    if (String(kategoriSp || '').toLowerCase() === 'minyak') {
      var s = String(satuan || '').toLowerCase();
      // Minyak dalam karton/dus tanpa berat_per_satuan → asumsi 11 kg/karton
      if (s === 'karton' || s === 'ctn' || s === 'kardus' || s === 'dus') return 11000;
    }
    return 0;
  }

  // Toleransi sebelum pembulatan ke atas (dalam gram): menyerap noise penyimpanan
  // menu_bahan.jumlah decimal(15,3) × jumlah porsi (mis. 2839 porsi → error ≤ ~1,5 g),
  // agar kebutuhan asli yang nyaris bulat (mis. 4,00015 kg) TIDAK melompat ke satuan
  // berikutnya (4 → 5). Nilai yang benar-benar melebihi batas tetap dibulatkan ke atas.
  var TK_QTY_TOLERANSI_GRAM = 10;
  // Minimal 1 satuan beli bila ada kebutuhan nyata (mencegah toleransi mengubah 8 g → 0 kg
  // atau baris hilang dari RAB karena parsed.qty <= 0 di-skip).
  function ceilAman(v, totalKg) {
    var q = Math.ceil(v);
    if (q < 1 && totalKg > 0) q = 1;
    return q;
  }
  function autoQty(satuan, totalKg, jumlahSiswa, kategoriSp, beratPerSatuan) {
    var s = String(satuan || 'kg').toLowerCase();
    if (s === 'kg' || s === 'g' || s === 'gram' || s === 'gr') {
      // Bahan berat → dibulatkan ke atas agar aman untuk belanja
      if (s === 'kg') {
        // Kebutuhan kecil (< 1 kg) → tampilkan pecahan aslinya (mis. 0,2 kg → 1/5 kg)
        // agar kebutuhan kecil tidak dibulatkan ke 1 kg; kebutuhan ≥ 1 kg tetap
        // dibulatkan ke atas ke kg utuh (belanja aman).
        if (totalKg > 0 && totalKg < 1) {
          var qKecil = Math.round(totalKg * 100) / 100;
          // Jangan sampai jadi 0 kg: kebutuhan nyata sekecil apa pun tetap tampil
          // minimal 0,01 kg (mencegah baris hilang dari RAB karena parsed.qty <= 0).
          if (qKecil <= 0) qKecil = 0.01;
          return fmtTkPecahan(qKecil) + ' kg';
        }
        return ceilAman(totalKg - TK_QTY_TOLERANSI_GRAM / 1000, totalKg) + ' kg';
      }
      return ceilAman(totalKg * 1000 - TK_QTY_TOLERANSI_GRAM, totalKg) + ' g'; // satuan gram
    }
    if (isSatuanHitung(s)) {
      var bps = beratPerSatuanEfektif(satuan, kategoriSp, beratPerSatuan);
      // Ada berat per satuan & ada kebutuhan nyata → konversi ke satuan unit
      if (bps > 0 && totalKg > 0) {
        return ceilAman((totalKg * 1000 - TK_QTY_TOLERANSI_GRAM) / bps, totalKg) + ' ' + s;
      }
      // Kemasan besar tanpa berat_per_satuan → biarkan kosong agar diisi manual
      if (s === 'karton' || s === 'kardus' || s === 'dus' || s === 'ctn') return '';
      // Bahan satuan unit tanpa berat_per_satuan → tampilkan kebutuhan asli dalam gram (jangan pakai jumlah porsi),
      // agar tidak menghasilkan angka belanja keliru; baris tetap ditandai merah.
      if (totalKg > 0) return ceilAman(totalKg * 1000 - TK_QTY_TOLERANSI_GRAM, totalKg) + ' g';
      return (Math.ceil(jumlahSiswa) || 0) + ' ' + s;
    }
    return '';
  }

  var html = '';

  for (var d = 0; d < hari.length; d++) {
    var day = hari[d];
    if (!day.bahan || !day.bahan.length) continue;

    // ── Hitung baris RAB (NO | URAIAN | QTY | SATUAN | HARGA | JUMLAH | KETERANGAN) ──
    var rows = [];
    var grandTotal = 0;
    var no = 0;

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

      var satuan = b.satuan || 'kg';
      var kategoriSp = b.kategori_sp || '';
      var hargaSatuan = Number(b.harga_satuan) || 0;
      var beratPerSatuan = Number(b.berat_per_satuan) || 0;
      // Tanda merah: harga belum diisi, atau bahan bersatuan unit (pcs/btl/renceng)
      // yang tidak punya berat per satuan efektif (default minyak-karton 11000g tidak dihitung kurang)
      var bpsEfektif = beratPerSatuanEfektif(satuan, kategoriSp, beratPerSatuan);
      var butuhBeratSatuan = isSatuanHitung(String(satuan || '').toLowerCase()) && bpsEfektif <= 0;
      var kekuranganHargaBerat = !hargaSatuan || butuhBeratSatuan;
      var ketKurang = (!hargaSatuan && butuhBeratSatuan) ? 'Harga & Berat kosong' : (!hargaSatuan ? 'Harga kosong' : 'Berat per satuan kosong');
      var qty = autoQty(satuan, bufferKg, rowSiswa, kategoriSp, beratPerSatuan);
      var parsed = parseTkQtySatuan(qty);
      // Bahan TIDAK boleh hilang dari RAB: jika qty tidak bisa dihitung (data
      // belum lengkap: berat bahan / berat per satuan kosong), baris tetap tampil
      // dengan QTY '-' dan ditandai merah agar tidak "tidak masuk RAB".
      if (parsed.qty <= 0) {
        kekuranganHargaBerat = true;
        ketKurang = butuhBeratSatuan ? 'Berat per satuan kosong' : (!hargaSatuan ? 'Harga kosong' : 'Berat bahan kosong');
      }
      no++;
      var jumlah = Math.round(parsed.qty * hargaSatuan);
      grandTotal += jumlah;

      // Penjelasan asal QTY (tooltip): tampilkan kebutuhan asli vs hasil pembulatan,
      // agar angka seperti 285 kg (asli) → 286 kg (belanja) tidak terkesan salah.
      var qtyTooltip = '';
      {
        var asliKg = bufferKg;
        var satuanKecil = String(parsed.satuan || '').toLowerCase();
        if (satuanKecil === 'kg') {
          var bulatAsli = Math.round(asliKg * 100) / 100;
          qtyTooltip = bulatAsli === parsed.qty
            ? 'Kebutuhan asli: ' + fmtTkPecahan(asliKg) + ' kg = QTY belanja'
            : 'Kebutuhan asli: ' + fmtTkPecahan(asliKg) + ' kg → dibulatkan ke atas menjadi ' + fmtTkPecahan(parsed.qty) + ' kg (belanja aman)';
        } else if (satuanKecil === 'g') {
          var asliG = Math.round(asliKg * 1000);
          qtyTooltip = asliG === parsed.qty
            ? 'Kebutuhan asli: ' + fmtTkNum(asliG) + ' g = QTY belanja'
            : 'Kebutuhan asli: ' + fmtTkNum(asliG) + ' g → dibulatkan ke atas menjadi ' + fmtTkNum(parsed.qty) + ' g (belanja aman)';
        } else {
          // Satuan unit (pcs/btl/karton/renceng/dll): konversi kebutuhan kg → satuan unit
          var bpsUnit = beratPerSatuanEfektif(satuan, kategoriSp, beratPerSatuan);
          if (bpsUnit > 0) {
            var asliUnit = Math.round((asliKg * 1000 / bpsUnit) * 100) / 100;
            qtyTooltip = asliUnit === parsed.qty
              ? 'Kebutuhan asli: ' + fmtTkNum(asliUnit) + ' ' + satuanKecil + ' (' + fmtTkNum(asliKg) + ' kg) = QTY belanja'
              : 'Kebutuhan asli: ' + fmtTkNum(asliUnit) + ' ' + satuanKecil + ' (' + fmtTkNum(asliKg) + ' kg) → dibulatkan ke atas menjadi ' + fmtTkNum(parsed.qty) + ' ' + satuanKecil + ' (belanja aman)';
          } else {
            qtyTooltip = 'Kebutuhan asli: ' + fmtTkNum(asliKg) + ' kg → dibulatkan ke atas menjadi ' + fmtTkNum(parsed.qty) + ' ' + satuanKecil + ' (belanja aman)';
          }
        }
        if (bufferPersen > 0) qtyTooltip += ' • termasuk buffer ' + bufferPersen + '%';
      }

      rows.push({
        no: no,
        uraian: b.nama_display || b.nama,
        bahanBakuId: Number(b.bahan_baku_id) || 0,
        qty: parsed.qty > 0 ? fmtTkPecahan(parsed.qty) : '–',
        satuan: parsed.satuan,
        harga: hargaSatuan,
        jumlah: jumlah,
        ket: b.keterangan || '',
        kekurangan: kekuranganHargaBerat,
        ketKurang: ketKurang,
        qtyTooltip: qtyTooltip
      });
    }

    // Anggaran belanja harian dari budget (via endpoint rab-harian)
    var anggaran = 0;
    if (day.header_tanggal) {
      try {
        var rh = await api.get('/laporan/rab-harian?tanggal=' + day.header_tanggal);
        anggaran = Number(rh.anggaran_belanja_harian) || 0;
      } catch (e) { anggaran = 0; }
    }
    var sisa = anggaran - grandTotal;

    // ── Render dokumen RAB per hari ──
    html += renderTkRabDoc(day, rows, grandTotal, anggaran, sisa);
  }

  if (!html) {
    html = '<div class="text-center py-16 text-stone-400 bg-white border border-stone-200 rounded-lg"><div class="text-sm">Tidak ada data untuk ditampilkan</div></div>';
  } else {
    // ── Legenda ──
    html += '<div class="bg-white border border-stone-200 rounded-lg p-4 mt-4 text-xs text-stone-500">';
    html += '<div class="font-semibold text-stone-700 mb-2">Keterangan:</div>';
    html += '<ul class="space-y-1 list-disc list-inside">';
    html += '<li><strong>QTY</strong> = jumlah belanja per bahan — dihitung otomatis dari kebutuhan pangan (bahan berat → kg; bahan satuan → pcs/btl/dll.). Kebutuhan ≥ 1 kg dibulatkan <em>ke atas</em> ke satuan beli utuh agar aman untuk pembelian (mis. kebutuhan 285,4 kg → QTY 286 kg). Kebutuhan < 1 kg ditampilkan dalam pecahan (mis. 1/2 kg, 1/5 kg) agar tidak membesar menjadi 1 kg. Arahkan kursor ke tanda ⓘ pada QTY untuk melihat rincian asalnya.</li>';
    html += '<li><strong>HARGA</strong> = harga satuan dari master Bahan Baku (bahan_baku.harga_satuan).</li>';
    html += '<li><strong>JUMLAH</strong> = QTY × HARGA.</li>';
    html += '<li><strong>KETERANGAN</strong> = instruksi bahan (mis. Potong 10, Fillet) dari resep menu.</li>';
    html += '<li><strong>Baris merah</strong> = bahan baku sudah masuk total kebutuhan tapi <em>harga satuan</em> belum diisi, atau bahan bersatuan unit (pcs/btl/renceng) yang <em>berat per satuan</em>-nya masih kosong di master Bahan Baku — wajib dilengkapi agar QTY &amp; JUMLAH akurat.</li>';
    html += '<li>Kebutuhan sudah termasuk <em>buffer</em> 1-10% (jika ada). Angka memakai pembulatan ke atas agar aman.</li>';
    html += '</ul></div>';
  }

  return html;
}

// ── Render satu dokumen RAB Kebutuhan Belanja per hari ──
// Format: NO | URAIAN | QTY | SATUAN | HARGA | JUMLAH | KETERANGAN + TOTAL + ANGGARAN + SISA.
function renderTkRabDoc(day, rows, grandTotal, anggaran, sisa) {
  var tanggal = day.header_tanggal || '';
  var hariNama = day.hari_nama || '';
  var tglFormatted = fmtTkTanggalPanjang(tanggal, hariNama);
  var daftarMenu = day.menu_names || [];
  var daftarMenuId = day.menu_ids || [];

  // ── Header (hero: hari pelaksanaan + menu; judul instansi dihilangkan di total-kebutuhan) ──
  var html = '<div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-4">';
  html += '<div class="px-5 py-4 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 text-white">';
  html += '<div class="flex flex-wrap items-center gap-x-6 gap-y-3">';

  // Kiri: ikon kalender + tanggal besar
  if (tglFormatted) {
    html += '<div class="flex items-center gap-3 min-w-0">';
    html += '<div class="w-11 h-11 shrink-0 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shadow-sm">';
    html += '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    html += '</div>';
    html += '<div class="min-w-0">';
    html += '<div class="text-[10px] font-bold uppercase tracking-widest text-emerald-100/90">Hari Pelaksanaan</div>';
    html += '<div class="text-base sm:text-lg font-bold leading-tight truncate">' + escHtmlTk(tglFormatted) + '</div>';
    html += '</div>';
    html += '</div>';
  }

  // Kanan: menu hari ini — chip per menu, semua terlihat & membungkus (tanpa truncate/ticker)
  if (daftarMenu.length) {
    html += '<div class="lg:ml-auto min-w-0">';
    html += '<div class="text-[10px] font-bold uppercase tracking-widest text-emerald-100/90 mb-1.5">Menu Hari Ini</div>';
    html += '<div class="flex flex-wrap gap-1.5">';
    for (var mi = 0; mi < daftarMenu.length; mi++) {
      // Menu yang punya id (terhubung ke master menu) → bisa diklik ke halaman edit /menu
      var menuId = daftarMenuId[mi] || 0;
      if (menuId) {
        html += '<a href="/menu?edit=' + menuId + '" onclick="tkEditMenu(' + menuId + ');return false;" class="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/30 border border-white/25 text-white px-2.5 py-1 rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer max-w-full" title="Klik untuk mengedit menu">';
      } else {
        html += '<span class="inline-flex items-center gap-1.5 bg-white/15 border border-white/25 text-white px-2.5 py-1 rounded-lg text-xs font-semibold shadow-sm max-w-full">';
      }
      html += '<svg class="w-3 h-3 shrink-0 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>';
      html += '<span class="break-words min-w-0">' + escHtmlTk(daftarMenu[mi]) + '</span>';
      html += menuId ? '</a>' : '</span>';
    }
    html += '</div>';
    html += '</div>';
  }

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
      var rowCls = r.kekurangan
        ? 'border-t border-stone-100 bg-red-50/70'
        : 'border-t border-stone-100 hover:bg-cyan-50/40 transition-colors';
      html += '<tr class="' + rowCls + '">';
      html += '<td class="px-2 py-3 text-center text-xs text-stone-500">' + r.no + '</td>';
      html += '<td class="px-3 py-3 text-xs font-medium ' + (r.kekurangan ? 'text-red-700' : 'text-stone-700') + '">' + escHtmlTk(r.uraian);
      if (r.bahanBakuId) {
        html += ' <button type="button" onclick="tkSetTargetBelanja(this)" data-bahan-id="' + r.bahanBakuId + '" data-nama="' + escHtmlTk(r.uraian) + '" data-satuan="' + escHtmlTk(r.satuan || '') + '" title="Atur target belanja harian (' + (/butir/i.test(r.satuan || '') ? 'butir' : 'kg') + ') — gram/porsi di resep, master bahan &amp; referensi SP disesuaikan agar total belanja pas target" class="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap hover:bg-emerald-100 hover:border-emerald-300 transition-colors cursor-pointer">🎯 Target</button>';
      }
      if (r.kekurangan) {
        var editHref = r.bahanBakuId ? "onclick=\"tkEditBahanBaku(" + r.bahanBakuId + ")\"" : '';
        html += ' <span ' + editHref + ' class="inline-block ml-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap cursor-pointer" title="Klik untuk melengkapi di master Bahan Baku">' + escHtmlTk(r.ketKurang || 'Data belum lengkap') + '</span>';
      }
      html += '</td>';
      html += '<td class="px-3 py-3 text-right mono text-xs font-semibold text-stone-700"' + (r.qtyTooltip ? ' title="' + escHtmlTk(r.qtyTooltip) + '" style="cursor:help"' : '') + '>' + r.qty + (r.qtyTooltip ? ' <span class="text-[9px] text-stone-400 font-normal align-middle">ⓘ</span>' : '') + '</td>';
      html += '<td class="px-3 py-3 text-xs text-stone-500">' + escHtmlTk(r.satuan) + '</td>';
      html += '<td class="px-3 py-3 text-right mono text-xs ' + (r.kekurangan ? 'font-bold text-red-700' : 'text-stone-600') + '">' + fmtTkRp(r.harga) + '</td>';
      html += '<td class="px-3 py-3 text-right mono text-xs font-bold ' + (r.kekurangan ? 'text-red-700' : 'text-stone-800') + '">' + fmtTkRp(r.jumlah) + '</td>';
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
    html += '<div class="p-6 text-center text-xs text-stone-400">Tidak ada bahan dengan jumlah untuk ditampilkan.</div>';
  }

  html += '</div>';
  return html;
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
  // Pecahan campuran: "1 1/2" → 1.5
  var mMix = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mMix) {
    qty = parseFloat(mMix[1]) + parseFloat(mMix[2]) / parseFloat(mMix[3]);
  } else if (/^[0-9,.\s]+\/[0-9,.\s]+$/.test(s)) {
    // Pecahan 1/2
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

// Arahkan dari total-kebutuhan ke halaman edit master bahan baku yang harga/beratnya belum lengkap
function tkEditBahanBaku(id) {
  if (!id) return;
  navigate('bahan-baku?edit=' + id);
}

// Atur target belanja harian (kg) untuk sebuah bahan — memanggil endpoint generik
// /siklus/fix-target-belanja yang menyinkronkan resep menu, master bahan & referensi SP.
// Data dibaca dari atribut data-* tombol (bukan disisipkan ke string JS) agar
// nama bahan dengan karakter khusus (kutip, dll.) tidak membahayakan.
async function tkSetTargetBelanja(btn) {
  var bahanBakuId = btn && Number(btn.dataset && btn.dataset.bahanId);
  var nama = (btn && btn.dataset && btn.dataset.nama) || 'bahan';
  var satuan = (btn && btn.dataset && btn.dataset.satuan) || '';
  var isButir = /butir/i.test(satuan);
  var unit = isButir ? 'butir' : 'kg';
  if (!bahanBakuId) {
    showAlert('Bahan tidak memiliki ID — tidak bisa diatur targetnya', 'warning');
    return;
  }
  var inp = window.prompt('Set target belanja harian (' + unit + ') untuk "' + nama + '"', '');
  if (inp === null || String(inp).trim() === '') return;
  var val = parseFloat(String(inp).trim().replace(',', '.'));
  if (!val || isNaN(val) || val <= 0) {
    showAlert('Target harus angka > 0 (misalnya ' + (isButir ? '2859' : '13') + ')', 'warning');
    return;
  }
  try {
    var res = await api.get('/siklus/fix-target-belanja?bahan=' + bahanBakuId + (isButir ? '&target_butir=' : '&target_kg=') + val);
    var ket;
    if (isButir) {
      var bt = (res && res.perkiraan_butir != null) ? fmtTkNum(res.perkiraan_butir) : fmtTkNum(val);
      ket = '±' + bt + ' butir/hari';
    } else {
      var kg = (res && res.perkiraan_kebutuhan_kg != null) ? fmtTkPecahan(res.perkiraan_kebutuhan_kg) : fmtTkPecahan(val);
      ket = '±' + kg + ' kg/hari';
    }
    var pesan = (res && res.action === 'noop')
      ? 'Sudah sesuai target: ' + ket
      : 'Target belanja diatur: ' + ket + (res.menu_count ? ' (' + res.menu_count + ' resep disesuaikan)' : '');
    showAlert(pesan, 'success');
    if (document.getElementById('total-kebutuhan-content')) loadTotalKebutuhan();
    else if (typeof renderLaporan === 'function') renderLaporan();
  } catch (err) {
    showAlert('Gagal set target: ' + err.message, 'error');
  }
}

// Arahkan dari total-kebutuhan ke halaman edit menu (chip menu hari ini)
function tkEditMenu(id) {
  if (!id) return;
  navigate('menu?edit=' + id);
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
