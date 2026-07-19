// ===== Panduan Ahli Gizi =====
function renderPanduanAhliGizi() {
  const c = document.getElementById('content');

  // ===================== BAGIAN 1: ALUR AHLI GIZI =====================
  const stepsGizi = [
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>',
      title: '1. Referensi SP Bahan (Prioritas!)',
      desc: 'Data acuan utama untuk BDD dan berat per SP. <strong class="text-emerald-700">Nilai BDD dari sini diprioritaskan</strong> dibanding data Bahan Baku. Isi: nama bahan, kategori SP, berat bersih (g), BDD (%), berat kotor, dan kandungan gizi (energi, protein, lemak, karbohidrat, serat).',
      link: { label: 'Buka Referensi SP', action: 'renderSpReferensi' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x=\"2\" y=\"2\" width=\"20\" height=\"8\" rx=\"2\" ry=\"2\"/><rect x=\"2\" y=\"14\" width=\"20\" height=\"8\" rx=\"2\" ry=\"2\"/><circle cx=\"6\" cy=\"6\" r=\"2\"/><circle cx=\"6\" cy=\"18\" r=\"2\"/></svg>',
      title: '2. Standar SP',
      desc: 'Atur nilai Standar Penukar per jenjang per kategori SP. Jenjang: TK/PAUD, SD/MI (1-3), SD/MI (4-6), SMP/MTs SMA/SMK, Bumil/Busui, Balita. Default sudah sesuai pedoman gizi — sesuaikan jika diperlukan.',
      link: { label: 'Buka Standar SP', action: 'renderStandarSp' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox=\"0 0 24 24\"><path d=\"M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2\"/><path d=\"M7 2v20\"/><path d=\"M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7\"/></svg>',
      title: '3. Menu & Gizi',
      desc: 'Buat resep menu dengan memilih bahan baku. Gramasi per porsi terisi otomatis berdasarkan SP. Masukkan kandungan gizi (kalori, protein, lemak, karbohidrat, serat) untuk setiap menu. <strong class="text-amber-700">Ahli Gizi tidak perlu input harga</strong> — harga diatur oleh bagian Keuangan.',
      link: { label: 'Buka Menu', action: 'renderMenu' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox=\"0 0 24 24\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"/><line x1=\"16\" y1=\"2\" x2=\"16\" y2=\"6\"/><line x1=\"8\" y1=\"2\" x2=\"8\" y2=\"6\"/><line x1=\"3\" y1=\"10\" x2=\"21\" y2=\"10\"/></svg>',
      title: '4. Susun Siklus Menu',
      desc: 'Atur menu per hari dalam siklus. Pilih jenjang penerima, atur jumlah porsi, lengkapi hari 1-10. Setelah selesai ubah status menjadi <strong>Aktif</strong> agar masuk perhitungan kebutuhan dan laporan keuangan.',
      link: { label: 'Buka Siklus', action: 'renderSiklus' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox=\"0 0 24 24\"><path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"/><polyline points=\"14 2 14 8 20 8\"/><line x1=\"16\" y1=\"13\" x2=\"8\" y2=\"13\"/><line x1=\"16\" y1=\"17\" x2=\"8\" y2=\"17\"/></svg>',
      title: '5. Cek Perhitungan BDD',
      desc: 'Lihat rincian kebutuhan bahan per menu per jenjang. Menampilkan: Berat Bersih (g) × BDD(%) → Berat Kotor (g) × jumlah penerima ÷ 1000 = Kebutuhan (kg). BDD bersumber dari Referensi SP (prioritas) atau data Bahan Baku.',
      link: { label: 'Buka Perhitungan BDD', action: 'renderPerhitunganBdd' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox=\"0 0 24 24\"><path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"/><polyline points=\"14 2 14 8 20 8\"/><rect x=\"8\" y=\"13\" width=\"3\" height=\"4\"/><rect x=\"13\" y=\"11\" width=\"3\" height=\"6\"/></svg>',
      title: '6. Perencanaan Kebutuhan Pangan',
      desc: 'Rekap final kebutuhan bahan per hari lintas semua jenjang. Menampilkan: total porsi, kebutuhan per jenjang (kg), total kebutuhan, buffer 10%, dan rincian pembelian (kg/pcs). Hasil ini yang akan digunakan untuk Purchase Request.',
      link: { label: 'Buka Perencanaan', action: 'renderPerencanaan' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox=\"0 0 24 24\"><circle cx=\"9\" cy=\"21\" r=\"1\"/><circle cx=\"20\" cy=\"21\" r=\"1\"/><path d=\"M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6\"/></svg>',
      title: '7. Total Kebutuhan Pangan',
      desc: 'Ringkasan per hari yang lebih sederhana — menampilkan nama menu, bahan, jumlah pembelian (kg/pcs/btl). Dua hari ditampilkan berdampingan untuk memudahkan belanja.',
      link: { label: 'Buka Total Kebutuhan', action: 'renderTotalKebutuhan' }
    },
  ];

  // ===================== BAGIAN 2: INTEGRASI KEUANGAN =====================
  const stepsFinance = [
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
      title: '8. 🔄 Buat Draft Purchase Request',
      desc: '<strong class="text-blue-700">Fitur Baru!</strong> Hasil perencanaan kebutuhan dari siklus bisa langsung diubah menjadi Draft Purchase Request (PR). Cukup buka halaman <strong>Perencanaan</strong> atau <strong>Total Kebutuhan</strong>, <strong>klik tombol 🗃️ Buat Draft PR</strong> di filter bar (warna hijau), masukkan nomor siklus yang ingin dibuatkan PR (pisah koma), dan sistem otomatis generate PR dengan status <span class="px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800 font-bold">Draft</span>. PR siap ditinjau oleh bagian Keuangan di menu <strong>Pembelian → Purchase Order</strong>.',
      link: { label: 'Buka Perencanaan', action: 'renderPerencanaan' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox=\"0 0 24 24\"><path d=\"M12 1v22\"/><path d=\"M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6\"/></svg>',
      title: '9. 💰 Keuangan Atur Harga Bahan',
      desc: 'Bagian Keuangan mengisi <strong>harga_satuan</strong> di master Bahan Baku. Harga bisa di-input manual atau dari sinkronisasi API koperasi. <strong class="text-amber-700">Ahli Gizi tidak bisa mengubah harga</strong> — proteksi sudah aktif secara otomatis.',
      link: { label: 'Buka Bahan Baku', action: 'renderBahanBaku' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox=\"0 0 24 24\"><rect x=\"2\" y=\"3\" width=\"20\" height=\"14\" rx=\"2\" ry=\"2\"/><line x1=\"8\" y1=\"21\" x2=\"16\" y2=\"21\"/><line x1=\"12\" y1=\"17\" x2=\"12\" y2=\"21\"/></svg>',
      title: '10. 📋 Penerimaan Barang → Auto Stok Masuk',
      desc: 'Saat barang datang dan QC Lolos, buat <strong>Penerimaan Barang</strong> dengan status Lolos. Sistem otomatis: (a) menambah stok bahan baku, (b) mencatat stok masuk, <strong class="text-green-700">(c) membuat jurnal double-entry</strong> (Debit Persediaan / Kredit Hutang).',
      link: { label: 'Buka Pembelian', action: 'renderPembelian' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M16 13H8M16 17H8"/><path d="M10 9H8"/></svg>',
      title: '11. 📊 Laporan Biaya Produksi per Siklus',
      desc: '<strong class="text-blue-700">Fitur Baru!</strong> Bagian Keuangan bisa melihat estimasi biaya bahan baku per siklus: total biaya, rata-rata per hari, dan biaya per porsi. Data dihitung otomatis dari kebutuhan bahan × harga_satuan. Buka halaman <strong>Laporan</strong> dan pilih tab <strong>Biaya Produksi</strong> untuk melihat data.',
      link: { label: 'Buka Laporan', action: 'renderLaporan' }
    },
    {
      icon: '<svg class=\"w-8 h-8\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path d=\"M12 20V10\"/><path d=\"M18 20V4\"/><path d=\"M6 20v-4\"/></svg>',
      title: '12. 🏦 Laporan Keuangan Otomatis',
      desc: 'Semua transaksi pembelian bahan baku otomatis tercatat di: <strong>Jurnal Umum</strong> → <strong>Buku Besar</strong> → <strong>Neraca</strong> & <strong>Laba Rugi</strong>. Tidak perlu entry manual — alur dari Ahli Gizi → Pembelian → Stok → Jurnal berjalan otomatis.',
      link: { label: 'Buka Laporan', action: 'renderReportPage(\"laporan-keuangan\")' }
    },
  ];

  // ===================== BAGIAN 3: DIAGRAM ALUR =====================
  const diagramHtml = `
  <div class="bg-white border border-stone-200 rounded-xl p-6 mt-6">
    <h3 class="font-bold text-base mb-4 flex items-center gap-2">
      <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      Diagram Alur Lengkap
    </h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
      <!-- Kolom Ahli Gizi -->
      <div class="border border-emerald-200 rounded-xl overflow-hidden">
        <div class="bg-emerald-50 px-4 py-2.5 font-semibold text-emerald-800 border-b border-emerald-200 flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          🟢 AHLI GIZI
        </div>
        <div class="p-4 space-y-2">
          <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-emerald-500"></span> Referensi SP Bahan (gizi + BDD)</div>
          <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-emerald-500"></span> Standar SP (target porsi)</div>
          <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-emerald-500"></span> Menu Gizi (komposisi + nutrisi)</div>
          <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-emerald-500"></span> Siklus Menu 10 Hari</div>
          <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-emerald-500"></span> Perhitungan BDD + Kebutuhan (kg)</div>
          <div class="mt-2 pt-2 border-t border-emerald-100 text-emerald-600 text-xs">✅ Tidak perlu input harga</div>
        </div>
      </div>

      <!-- Kolom Keuangan -->
      <div class="border border-blue-200 rounded-xl overflow-hidden">
        <div class="bg-blue-50 px-4 py-2.5 font-semibold text-blue-800 border-b border-blue-200 flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 6v6l4 2\"/></svg>
          🔵 KEUANGAN
        </div>
        <div class="p-4 space-y-2">
          <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-blue-500"></span> Atur harga_satuan di Bahan Baku</div>
          <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-blue-500"></span> 🔄 Terima Draft PR dari Ahli Gizi</div>
          <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-blue-500"></span> Buat PO → Penerimaan Barang</div>
          <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-blue-500"></span> ✅ Auto-Stok Masuk + <strong class="text-green-700">Auto-Jurnal</strong></div>
          <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-blue-500"></span> 📊 Laporan Biaya Produksi per Siklus</div>
          <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-blue-500"></span> 🏦 Jurnal → Buku Besar → Neraca</div>
        </div>
      </div>
    </div>
  </div>`;

  // ===================== CONTOH PERHITUNGAN =====================
  const contohHtml = `
  <div id="contoh-sp" class="hidden mt-6 bg-white border border-stone-200 rounded-xl overflow-hidden">
    <div class="px-5 py-3 font-bold border-b border-stone-200 flex items-center justify-between">
      <span>Contoh Perhitungan — Siklus Aktif Lintas Jenjang</span>
      <button onclick="document.getElementById('contoh-sp').classList.add('hidden')" class="text-stone-400 hover:text-stone-600">&times;</button>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="bg-stone-50">
          <tr>
            <th class="text-left px-4 py-3 text-xs font-semibold uppercase">Bahan</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase">TK/PAUD</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase">SD (1-3)</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase">SD (4-6)</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase">SMP/SMA</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase">Bumil/Busui</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase">Balita</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase">Total (kg)</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase">+10%</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase">Rincian</th>
          </tr>
        </thead>
        <tbody>
          <tr class="border-t border-stone-100"><td class="px-4 py-3 text-sm font-medium">Beras</td><td class="px-4 py-3 text-sm text-right mono">24,50</td><td class="px-4 py-3 text-sm text-right mono">42,75</td><td class="px-4 py-3 text-sm text-right mono">59,78</td><td class="px-4 py-3 text-sm text-right mono">25,20</td><td class="px-4 py-3 text-sm text-right mono">18,13</td><td class="px-4 py-3 text-sm text-right mono">9,95</td><td class="px-4 py-3 text-sm text-right mono font-semibold">180,30</td><td class="px-4 py-3 text-sm text-right mono text-sky-700 font-semibold">198,33</td><td class="px-4 py-3 text-sm text-right mono font-bold">180 kg</td></tr>
          <tr class="border-t border-stone-100"><td class="px-4 py-3 text-sm font-medium">Ayam Potong</td><td class="px-4 py-3 text-sm text-right mono">39,20</td><td class="px-4 py-3 text-sm text-right mono">54,72</td><td class="px-4 py-3 text-sm text-right mono">95,64</td><td class="px-4 py-3 text-sm text-right mono">30,24</td><td class="px-4 py-3 text-sm text-right mono">23,20</td><td class="px-4 py-3 text-sm text-right mono">15,92</td><td class="px-4 py-3 text-sm text-right mono font-semibold">258,92</td><td class="px-4 py-3 text-sm text-right mono text-sky-700 font-semibold">284,81</td><td class="px-4 py-3 text-sm text-right mono font-bold">259 kg</td></tr>
          <tr class="border-t border-stone-100"><td class="px-4 py-3 text-sm font-medium">Tempe</td><td class="px-4 py-3 text-sm text-right mono">12,25</td><td class="px-4 py-3 text-sm text-right mono">17,10</td><td class="px-4 py-3 text-sm text-right mono">27,90</td><td class="px-4 py-3 text-sm text-right mono">12,60</td><td class="px-4 py-3 text-sm text-right mono">7,25</td><td class="px-4 py-3 text-sm text-right mono">4,98</td><td class="px-4 py-3 text-sm text-right mono font-semibold">82,07</td><td class="px-4 py-3 text-sm text-right mono text-sky-700 font-semibold">90,28</td><td class="px-4 py-3 text-sm text-right mono font-bold">85 kg</td></tr>
        </tbody>
      </table>
    </div>
    <div class="px-5 py-3 bg-stone-50 text-xs text-stone-500 border-t border-stone-200 space-y-1">
      <div><strong>Rumus:</strong></div>
      <div>Berat Bersih (g) = SP × Berat 1 SP &nbsp;|&nbsp; Berat Kotor (g) = round(Bersih ÷ (BDD/100))</div>
      <div>Kebutuhan (kg) = Berat Kotor × Jumlah Penerima ÷ 1000 &nbsp;|&nbsp; Buffer = total × 1,1 (10%)</div>
    </div>
  </div>`;

  // ===================== RENDER =====================
  c.innerHTML = `
    <!-- SECTION: AHLI GIZI -->
    <div class="mb-4 flex items-center gap-2">
      <span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">BAGIAN AHLI GIZI</span>
      <span class="text-xs text-stone-400">Langkah 1-7 — fokus pada data gizi, tanpa harga</span>
    </div>
    <div class="grid gap-3">
      ${stepsGizi.map(function(s) {
        return renderStepCard(s);
      }).join('')}
    </div>

    <!-- SECTION: INTEGRASI KEUANGAN -->
    <div class="mt-8 mb-4 flex items-center gap-2">
      <span class="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">INTEGRASI KEUANGAN</span>
      <span class="text-xs text-stone-400">Langkah 8-12 — otomatis, tidak perlu input manual</span>
    </div>
    <div class="grid gap-3">
      ${stepsFinance.map(function(s) {
        return renderStepCard(s);
      }).join('')}
    </div>

    <!-- DIAGRAM -->
    ${diagramHtml}

    <!-- CONTOH -->
    <div class="mt-6">
      <button onclick="showContohSp()" class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        Lihat Contoh Perhitungan
      </button>
    </div>
    ${contohHtml}

    <!-- FOOTER: RINGKASAN ROLE -->
    <div class="mt-8 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-5 text-sm">
      <div class="font-bold text-amber-800 mb-2">🎯 Ringkasan Pembagian Peran</div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="flex items-start gap-2">
          <span class="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700 shrink-0 mt-0.5">GIZI</span>
          <span class="text-stone-600"><strong>Ahli Gizi:</strong> input data gizi, BDD, menu, siklus, hitung kebutuhan (kg) — <strong class="text-amber-700">tanpa harga</strong></span>
        </div>
        <div class="flex items-start gap-2">
          <span class="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700 shrink-0 mt-0.5">DANA</span>
          <span class="text-stone-600"><strong>Keuangan:</strong> atur harga bahan, terima PR, buat PO, pantau biaya produksi, laporan keuangan</span>
        </div>
        <div class="flex items-start gap-2">
          <span class="px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-700 shrink-0 mt-0.5">STOK</span>
          <span class="text-stone-600"><strong>Gudang:</strong> terima barang, QC, stok masuk otomatis, stok keluar untuk produksi</span>
        </div>
        <div class="flex items-start gap-2">
          <span class="px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700 shrink-0 mt-0.5">💰</span>
          <span class="text-stone-600"><strong>Sistem:</strong> auto-jurnal double-entry, buku besar, neraca, laba rugi — semua <strong>otomatis</strong></span>
        </div>
      </div>
    </div>
  `;
}

function renderStepCard(s) {
  const linkHtml = s.link
    ? '<button onclick="' + s.link.action + '()" class="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' + s.link.label + '</button>'
    : '';
  return '<div class="bg-white border border-stone-200 rounded-xl p-5 hover:shadow-md transition-shadow">' +
    '<div class="flex-1 min-w-0">' +
      '<h3 class="font-bold text-sm mb-1">' + s.title + '</h3>' +
      '<p class="text-sm text-stone-500 leading-relaxed">' + s.desc + '</p>' +
      linkHtml +
    '</div>' +
  '</div>';
}

function showContohSp() {
  var el = document.getElementById('contoh-sp');
  if (el) el.classList.remove('hidden');
}
