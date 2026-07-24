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
    const { jenjang_list, hari, pm_map, tanggal_mulai, tanggal_selesai, _validation } = res;

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
    html += '<button onclick="buatPrDariSiklus()" class="ml-auto h-10 px-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl text-sm font-medium transition-all shadow-md hover:shadow-lg flex items-center gap-2">';
    html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>\n    Buat Draft PR';
    html += '</button>';
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

    // ── Render per day ──
    for (var d = 0; d < hari.length; d++) {
      var day = hari[d];

      // Kumpulkan data per bahan — gabung PER JENJANG jadi total
      var dayBahan = [];
      if (!day.bahan || !day.bahan.length) continue;
      for (var i = 0; i < day.bahan.length; i++) {
        var b = day.bahan[i];
        if (!b.per_jenjang) continue;

        var totalKebutuhan = 0;
        var totalSiswa = 0;
        var beratBersih = null;
        var persenBdd = null;
        var beratKotor = null;
        var namaDisplay = b.nama_display || b.nama;

        // Sum across all jenjang
        for (var j = 0; j < jenjang_list.length; j++) {
          var jName = jenjang_list[j];
          var pj = b.per_jenjang[jName];
          if (pj && pj.kebutuhan_kg > 0) {
            totalKebutuhan += pj.kebutuhan_kg;
            totalSiswa += pj.jumlah_siswa || 0;
            // Ambil data dari jenjang pertama yang punya
            if (beratBersih === null) {
              beratBersih = pj.berat_bersih;
              persenBdd = pj.persen_bdd;
              beratKotor = pj.berat_kotor;
            }
          }
        }

        if (totalKebutuhan <= 0) continue;

        dayBahan.push({
          nama: b.nama,
          nama_display: namaDisplay,
          berat_bersih: beratBersih || 0,
          persen_bdd: persenBdd || 0,
          berat_kotor: beratKotor || 0,
          jumlah_siswa: totalSiswa,
          kebutuhan_kg: Math.round(totalKebutuhan * 100) / 100,
        });
      }

      if (!dayBahan.length) continue;

      // ── Card per day ──
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
        var isRef = b.persen_bdd !== 100;
        html += '<tr class="border-b border-stone-100 hover:bg-emerald-50/30 transition-colors">';
        html += '<td class="px-3 py-2 text-sm font-medium text-stone-800">' + b.nama_display + '</td>';
        html += '<td class="px-3 py-2 text-sm text-right mono">' + fmtTkNum(b.berat_bersih) + '</td>';
        html += '<td class="px-3 py-2 text-sm text-right mono ' + (isRef ? 'text-emerald-600 font-semibold' : '') + '">' + b.persen_bdd + '%</td>';
        html += '<td class="px-3 py-2 text-sm text-right mono">' + fmtTkNum(b.berat_kotor) + '</td>';
        html += '<td class="px-3 py-2 text-sm text-right mono text-stone-600">' + fmtTkNum(b.jumlah_siswa) + '</td>';
        html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-emerald-700">' + fmtTkNum(b.kebutuhan_kg) + '</td>';
        html += '</tr>';
      }

      // Total row
      var totalKg = dayBahan.reduce(function(s, b) { return s + b.kebutuhan_kg; }, 0);
      html += '<tr class="bg-stone-50 border-t-2 border-stone-200">';
      html += '<td class="px-3 py-2 text-sm font-semibold text-stone-700">Total Kebutuhan</td>';
      html += '<td colspan="4"></td>';
      html += '<td class="px-3 py-2 text-sm text-right mono font-bold text-emerald-700">' + fmtTkNum(totalKg) + '</td>';
      html += '</tr>';

      html += '</tbody></table></div></div>';
    }

    if (!html) {
      html += '<div class="text-center py-16 text-stone-400 bg-white border border-stone-200 rounded-lg"><div class="text-sm">Tidak ada data untuk ditampilkan</div></div>';
    }

    // ── Legenda ──
    html += '<div class="bg-white border border-stone-200 rounded-lg p-4 mt-4 text-xs text-stone-500">';
    html += '<div class="font-semibold text-stone-700 mb-2">Keterangan:</div>';
    html += '<ul class="space-y-1 list-disc list-inside">';
    html += '<li><strong>Berat Bersih</strong> = Jumlah bahan per porsi (gram) — dihitung dari SP × Berat 1 SP</li>';
    html += '<li><strong>BDD%</strong> = <em>Bahan Dapat Dimakan</em> — persentase bagian yang dapat dikonsumsi.</li>';
    html += '<li><strong>Berat Kotor</strong> = Berat Bersih ÷ (BDD ÷ 100)</li>';
    html += '<li><strong>Kebutuhan (kg)</strong> = Berat Kotor × Jumlah Siswa ÷ 1000</li>';
    html += '<li>Data ditampilkan sebagai <strong>total seluruh jenjang</strong> penerima manfaat.</li>';
    html += '</ul></div>';

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
