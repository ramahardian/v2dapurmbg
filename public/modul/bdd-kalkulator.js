// ===== BDD Kalkulator — Real-time BDD Calculator =====
// Modul ini menyediakan kalkulator interaktif untuk menghitung:
//   - Berat Kotor  = Berat Bersih / (BDD / 100)
//   - Berat Bersih = Berat Kotor * (BDD / 100)
//   - Kebutuhan Bahan (kg) = (Berat Kotor * Jumlah Siswa) / 1000
// Semua perhitungan berjalan real-time tanpa reload halaman.

/**
 * Memformat angka ke maksimal 2 desimal tanpa trailing zero yang tidak perlu
 * @param {number} nilai - Angka yang akan diformat
 * @returns {string} Angka yang diformat dengan maksimal 2 desimal
 */
function fmt2(nilai) {
  return Number(nilai || 0).toFixed(2);
}

/**
 * Menghitung berat kotor dari berat bersih dan persen BDD
 * Rumus: Berat Kotor = Berat Bersih / (BDD / 100)
 * @param {number} beratBersih - Berat bersih dalam gram
 * @param {number} bddPersen - Persen BDD (1-100)
 * @returns {number} Berat kotor dalam gram, presisi 2 desimal
 */
function hitungBeratKotor(beratBersih, bddPersen) {
  if (!beratBersih || beratBersih <= 0) return 0;
  if (!bddPersen || bddPersen <= 0) return beratBersih;
  var faktor = bddPersen / 100;
  return Math.round((beratBersih / faktor) * 100) / 100;
}

/**
 * Menghitung berat bersih dari berat kotor dan persen BDD
 * Rumus: Berat Bersih = Berat Kotor * (BDD / 100)
 * @param {number} beratKotor - Berat kotor dalam gram
 * @param {number} bddPersen - Persen BDD (1-100)
 * @returns {number} Berat bersih dalam gram, maksimal 2 desimal
 */
function hitungBeratBersih(beratKotor, bddPersen) {
  if (!beratKotor || beratKotor <= 0) return 0;
  if (!bddPersen || bddPersen <= 0) return 0;
  var faktor = bddPersen / 100;
  return parseFloat((beratKotor * faktor).toFixed(2));
}

/**
 * Menghitung kebutuhan bahan dalam kilogram
 * Rumus: Kebutuhan (kg) = (Berat Kotor * Jumlah Siswa) / 1000
 * @param {number} beratKotor - Berat kotor per porsi dalam gram
 * @param {number} jumlahSiswa - Jumlah siswa/penerima manfaat
 * @returns {number} Kebutuhan bahan dalam kg, maksimal 2 desimal
 */
function hitungKebutuhanBahan(beratKotor, jumlahSiswa) {
  if (!beratKotor || beratKotor <= 0) return 0;
  if (!jumlahSiswa || jumlahSiswa < 1) return 0;
  return parseFloat(((beratKotor * jumlahSiswa) / 1000).toFixed(2));
}

/**
 * Memvalidasi nilai BDD berada dalam rentang 1-100%
 * @param {number|string} nilai - Nilai BDD yang akan divalidasi
 * @returns {{valid: boolean, pesan: string}} Hasil validasi
 */
function validasiBdd(nilai) {
  var num = Number(nilai);
  if (isNaN(num) || num < 1) {
    return { valid: false, pesan: 'BDD minimal 1%' };
  }
  if (num > 100) {
    return { valid: false, pesan: 'BDD maksimal 100%' };
  }
  return { valid: true, pesan: '' };
}

/**
 * Memvalidasi nilai berat tidak boleh negatif
 * @param {number|string} nilai - Nilai berat yang akan divalidasi
 * @returns {{valid: boolean, pesan: string}} Hasil validasi
 */
function validasiBerat(nilai) {
  var num = Number(nilai);
  if (isNaN(num) || num < 0) {
    return { valid: false, pesan: 'Berat tidak boleh negatif' };
  }
  return { valid: true, pesan: '' };
}

/**
 * Memvalidasi jumlah siswa minimal 1
 * @param {number|string} nilai - Jumlah siswa yang akan divalidasi
 * @returns {{valid: boolean, pesan: string}} Hasil validasi
 */
function validasiSiswa(nilai) {
  var num = Number(nilai);
  if (isNaN(num) || num < 1) {
    return { valid: false, pesan: 'Jumlah siswa minimal 1' };
  }
  return { valid: true, pesan: '' };
}

/**
 * Memperbarui seluruh hasil perhitungan di UI secara real-time
 */
function perbaruiHasil() {
  // Ambil nilai input dari form
  var beratBersih = parseFloat(document.getElementById('bdd-berat-bersih').value) || 0;
  var bddPersen = parseFloat(document.getElementById('bdd-persen').value) || 0;
  var beratKotor = parseFloat(document.getElementById('bdd-berat-kotor').value) || 0;
  var jumlahSiswa = parseInt(document.getElementById('bdd-jumlah-siswa').value) || 0;
  var mode = document.getElementById('bdd-mode').value;

  // Validasi tiap input dan tampilkan error
  var vBdd = validasiBdd(bddPersen);
  var vBeratBersih = validasiBerat(beratBersih);
  var vBeratKotor = validasiBerat(beratKotor);
  var vSiswa = validasiSiswa(jumlahSiswa);

  document.getElementById('bdd-error-bdd').textContent = vBdd.valid ? '' : vBdd.pesan;
  document.getElementById('bdd-error-bersih').textContent = vBeratBersih.valid ? '' : vBeratBersih.pesan;
  document.getElementById('bdd-error-kotor').textContent = vBeratKotor.valid ? '' : vBeratKotor.pesan;
  document.getElementById('bdd-error-siswa').textContent = vSiswa.valid ? '' : vSiswa.pesan;

  // Hanya hitung jika BDD valid
  if (!vBdd.valid) {
    document.getElementById('bdd-hasil-kotor').textContent = '0';
    document.getElementById('bdd-hasil-bersih').textContent = '0';
    document.getElementById('bdd-hasil-kebutuhan').textContent = '0';
    return;
  }

  var hasilKotor = 0;
  var hasilBersih = 0;

  if (mode === 'ke-kotor') {
    // Mode: Berat Bersih & BDD -> Berat Kotor
    if (vBeratBersih.valid && beratBersih > 0) {
      hasilKotor = hitungBeratKotor(beratBersih, bddPersen);
      hasilBersih = beratBersih;
    }
  } else {
    // Mode: Berat Kotor & BDD -> Berat Bersih
    if (vBeratKotor.valid && beratKotor > 0) {
      hasilBersih = hitungBeratBersih(beratKotor, bddPersen);
      hasilKotor = beratKotor;
    }
  }

  // Tampilkan hasil berat kotor dan bersih
  document.getElementById('bdd-hasil-kotor').textContent = fmt2(hasilKotor);
  document.getElementById('bdd-hasil-bersih').textContent = fmt2(hasilBersih);

  // Hitung kebutuhan bahan dalam kg
  var kebutuhan = 0;
  if (vSiswa.valid && hasilKotor > 0) {
    kebutuhan = hitungKebutuhanBahan(hasilKotor, jumlahSiswa);
  }
  document.getElementById('bdd-hasil-kebutuhan').textContent = fmt2(kebutuhan);

  // Tampilkan breakdown rumus
  var faktorBdd = bddPersen / 100;
  if (mode === 'ke-kotor' && beratBersih > 0) {
    document.getElementById('bdd-rumus-kotor').textContent =
      beratBersih + ' / (' + bddPersen + ' / 100) = ' + beratBersih + ' / ' + fmt2(faktorBdd) + ' = ' + hasilKotor;
  } else if (beratKotor > 0) {
    document.getElementById('bdd-rumus-kotor').textContent =
      beratKotor + ' x (' + bddPersen + ' / 100) = ' + beratKotor + ' x ' + fmt2(faktorBdd) + ' = ' + fmt2(hasilBersih);
  } else {
    document.getElementById('bdd-rumus-kotor').textContent = '—';
  }

  if (vSiswa.valid && hasilKotor > 0) {
    document.getElementById('bdd-rumus-kebutuhan').textContent =
      hasilKotor + ' x ' + jumlahSiswa + ' / 1000 = ' + (hasilKotor * jumlahSiswa) + ' / 1000 = ' + fmt2(kebutuhan);
  } else {
    document.getElementById('bdd-rumus-kebutuhan').textContent = '—';
  }
}

/**
 * Mengganti mode kalkulator (ke berat kotor atau ke berat bersih)
 */
function gantiModeBdd() {
  var mode = document.getElementById('bdd-mode').value;
  var grupBersih = document.getElementById('bdd-grup-bersih');
  var grupKotor = document.getElementById('bdd-grup-kotor');

  if (mode === 'ke-kotor') {
    grupBersih.classList.remove('opacity-50', 'pointer-events-none');
    grupKotor.classList.add('opacity-50', 'pointer-events-none');
    document.getElementById('bdd-mode-label').textContent =
      'Menghitung Berat Kotor dari Berat Bersih dan BDD';
  } else {
    grupKotor.classList.remove('opacity-50', 'pointer-events-none');
    grupBersih.classList.add('opacity-50', 'pointer-events-none');
    document.getElementById('bdd-mode-label').textContent =
      'Menghitung Berat Bersih dari Berat Kotor dan BDD';
  }
  perbaruiHasil();
}

/**
 * Memuat daftar bahan dari database sp_referensi_bahan
 * dan mengisi nilai BDD + berat bersih saat dipilih
 */
async function muatDaftarBahan() {
  var select = document.getElementById('bdd-pilih-bahan');
  if (!select) return;
  select.innerHTML = '<option value="">— Muat data... —</option>';
  try {
    var res = await api.get('/sp_referensi_bahan?limit=9999');
    var list = Array.isArray(res) ? res : (res.data || []);
    select.innerHTML = '<option value="">— Pilih Bahan (isi otomatis) —</option>' +
      list.map(function(b) {
        return '<option value="' + b.id + '" ' +
          'data-bdd="' + (Math.round((b.bdd_persen || 0) * 100)) + '" ' +
          'data-bersih="' + (b.berat_bersih || 0) + '" ' +
          'data-kotor="' + (b.berat_kotor || 0) + '" ' +
          'data-nama="' + (b.nama || '') + '">' +
          (b.nama || '') + ' — BDD ' + Math.round((b.bdd_persen || 0) * 100) +
          '% — Bersih ' + (b.berat_bersih || 0) + 'g' +
          '</option>';
      }).join('');
  } catch (e) {
    select.innerHTML = '<option value="">Gagal memuat data</option>';
    showToast('Gagal memuat bahan: ' + e.message, 'error');
  }
}

/**
 * Mengisi form dari bahan yang dipilih di dropdown
 */
function isiDariBahan() {
  var select = document.getElementById('bdd-pilih-bahan');
  var opt = select.options[select.selectedIndex];
  if (!opt || !opt.value) return;

  var bdd = parseInt(opt.dataset.bdd) || 0;
  var bersih = parseFloat(opt.dataset.bersih) || 0;
  var kotor = parseFloat(opt.dataset.kotor) || 0;

  document.getElementById('bdd-persen').value = bdd;
  document.getElementById('bdd-berat-bersih').value = bersih;

  var mode = document.getElementById('bdd-mode').value;
  if (mode === 'ke-kotor') {
    document.getElementById('bdd-berat-bersih').value = bersih;
  } else {
    document.getElementById('bdd-berat-kotor').value = kotor;
  }

  document.getElementById('bdd-nama-terpilih').textContent = opt.dataset.nama || '';
  perbaruiHasil();
}

/**
 * Render halaman kalkulator BDD ke dalam #content
 */
async function renderBddKalkulator() {
  var c = document.getElementById('content');
  c.innerHTML = [
    '<div class="max-w-100 mx-auto">',

    // Hero
    '<div class="bg-gradient-to-br from-emerald-700 to-emerald-500 rounded-2xl p-6 lg:p-8 mb-6 text-white shadow-lg">',
      '<div class="flex items-center gap-3 mb-2">',
        '<div class="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">',
          '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>',
        '</div>',
        '<h2 class="text-xl lg:text-2xl font-bold tracking-tight">Kalkulator BDD</h2>',
      '</div>',
      '<p class="text-white/80 text-sm max-w-xl">Hitung berat kotor, berat bersih, dan kebutuhan bahan pangan berdasarkan BDD (Bahan Dapat Dimakan) secara real-time.</p>',
    '</div>',

    // Panel Utama
    '<div class="bg-white border border-stone-200 rounded-xl p-5 mb-4">',

      // Pilih bahan
      '<div class="mb-5">',
        '<label class="text-sm font-medium text-stone-700 block mb-1.5">Pilih Bahan (isi otomatis dari database)</label>',
        '<select id="bdd-pilih-bahan" onchange="isiDariBahan()" class="w-full h-11 px-3 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">',
          '<option value="">— Memuat data... —</option>',
        '</select>',
        '<div id="bdd-nama-terpilih" class="text-xs text-emerald-600 mt-1 font-medium"></div>',
      '</div>',

      // Mode
      '<div class="mb-5">',
        '<label class="text-sm font-medium text-stone-700 block mb-1.5">Mode Perhitungan</label>',
        '<select id="bdd-mode" onchange="gantiModeBdd()" class="w-full h-11 px-3 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">',
          '<option value="ke-kotor">Berat Bersih & BDD → Berat Kotor</option>',
          '<option value="ke-bersih">Berat Kotor & BDD → Berat Bersih</option>',
        '</select>',
        '<div id="bdd-mode-label" class="text-xs text-stone-500 mt-1">Menghitung Berat Kotor dari Berat Bersih dan BDD</div>',
      '</div>',

      // Input: BDD
      '<div class="mb-5">',
        '<label class="text-sm font-medium text-stone-700 block mb-1.5">BDD (%) <span class="text-red-500">*</span></label>',
        '<div class="relative">',
          '<input id="bdd-persen" type="number" min="1" max="100" step="1" value="100" oninput="perbaruiHasil()" class="w-full h-11 px-3 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 mono" placeholder="1–100" />',
          '<span class="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">%</span>',
        '</div>',
        '<div id="bdd-error-bdd" class="text-xs text-red-500 mt-1"></div>',
      '</div>',

      // Input: Berat Bersih
      '<div id="bdd-grup-bersih" class="mb-5">',
        '<label class="text-sm font-medium text-stone-700 block mb-1.5">Berat Bersih (gram)</label>',
        '<div class="relative">',
          '<input id="bdd-berat-bersih" type="number" min="0" step="0.1" value="" oninput="perbaruiHasil()" class="w-full h-11 px-3 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 mono" placeholder="0" />',
          '<span class="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">g</span>',
        '</div>',
        '<div id="bdd-error-bersih" class="text-xs text-red-500 mt-1"></div>',
      '</div>',

      // Input: Berat Kotor
      '<div id="bdd-grup-kotor" class="mb-5 opacity-50 pointer-events-none">',
        '<label class="text-sm font-medium text-stone-700 block mb-1.5">Berat Kotor (gram)</label>',
        '<div class="relative">',
          '<input id="bdd-berat-kotor" type="number" min="0" step="0.1" value="" oninput="perbaruiHasil()" class="w-full h-11 px-3 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 mono" placeholder="0" />',
          '<span class="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">g</span>',
        '</div>',
        '<div id="bdd-error-kotor" class="text-xs text-red-500 mt-1"></div>',
      '</div>',

      // Input: Jumlah Siswa
      '<div class="mb-5">',
        '<label class="text-sm font-medium text-stone-700 block mb-1.5">Jumlah Siswa / Penerima Manfaat <span class="text-red-500">*</span></label>',
        '<input id="bdd-jumlah-siswa" type="number" min="1" step="1" value="490" oninput="perbaruiHasil()" class="w-full h-11 px-3 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 mono" />',
        '<div id="bdd-error-siswa" class="text-xs text-red-500 mt-1"></div>',
      '</div>',

    '</div>',

    // Hasil Perhitungan
    '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">',

      // Hasil Berat Bersih
      '<div class="bg-white border border-stone-200 rounded-xl p-5">',
        '<div class="text-xs uppercase tracking-wider text-stone-500 font-medium mb-1">Berat Bersih</div>',
        '<div class="text-2xl font-bold text-emerald-700"><span id="bdd-hasil-bersih" class="mono">0</span> <span class="text-sm font-normal text-stone-400">g</span></div>',
        '<div class="text-xs text-stone-400 mt-1">Bagian yang dapat dimakan</div>',
      '</div>',

      // Hasil Berat Kotor
      '<div class="bg-white border border-stone-200 rounded-xl p-5">',
        '<div class="text-xs uppercase tracking-wider text-stone-500 font-medium mb-1">Berat Kotor</div>',
        '<div class="text-2xl font-bold text-amber-700"><span id="bdd-hasil-kotor" class="mono">0</span> <span class="text-sm font-normal text-stone-400">g</span></div>',
        '<div class="text-xs text-stone-400 mt-1">Berat sebelum dibersihkan</div>',
      '</div>',

      // Hasil Kebutuhan
      '<div class="bg-white border border-stone-200 rounded-xl p-5 bg-emerald-50 border-emerald-200">',
        '<div class="text-xs uppercase tracking-wider text-emerald-600 font-medium mb-1">Total Kebutuhan</div>',
        '<div class="text-2xl font-bold text-emerald-800"><span id="bdd-hasil-kebutuhan" class="mono">0</span> <span class="text-sm font-normal text-emerald-500">kg</span></div>',
        '<div class="text-xs text-emerald-500 mt-1">Untuk <span id="bdd-label-siswa">0</span> siswa</div>',
      '</div>',

    '</div>',

    // Breakdown Rumus
    '<div class="bg-white border border-stone-200 rounded-xl p-5 mb-4">',
      '<div class="text-sm font-bold text-stone-700 mb-3">📐 Detail Perhitungan</div>',
      '<div class="space-y-2 text-sm">',
        '<div class="flex items-start gap-3">',
          '<span class="text-stone-400 font-medium shrink-0 w-28">Rumus:</span>',
          '<div class="text-stone-600 font-mono text-xs leading-relaxed">',
            '<div>Berat Kotor = Berat Bersih / (BDD / 100)</div>',
            '<div class="mt-1">atau</div>',
            '<div class="mt-1">Berat Bersih = Berat Kotor x (BDD / 100)</div>',
            '<div class="mt-1">Kebutuhan (kg) = (Berat Kotor x Jumlah Siswa) / 1000</div>',
          '</div>',
        '</div>',
        '<hr class="border-stone-100" />',
        '<div class="flex items-start gap-3">',
          '<span class="text-stone-400 font-medium shrink-0 w-28">Perhitungan:</span>',
          '<div class="text-stone-600 font-mono text-xs">',
            '<div>Berat Kotor: <span id="bdd-rumus-kotor" class="text-emerald-700">—</span></div>',
            '<div class="mt-1">Kebutuhan: <span id="bdd-rumus-kebutuhan" class="text-emerald-700">—</span></div>',
          '</div>',
        '</div>',
      '</div>',
    '</div>',

    '</div>',
  ].join('\n');

  // Muat daftar bahan dari database
  await muatDaftarBahan();

  // Set default nilai contoh
  document.getElementById('bdd-berat-bersih').value = 50;
  document.getElementById('bdd-persen').value = 100;
  perbaruiHasil();

}


