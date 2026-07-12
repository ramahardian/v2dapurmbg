// ===== Panduan Ahli Gizi =====
function renderPanduanAhliGizi() {
  const c = document.getElementById('content');
  const steps = [
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>',
      title: '1. Data Bahan Baku',
      desc: 'Input master bahan baku: nama, kategori SP (Karbohidrat, Protein Hewani, Protein Nabati, Sayur, Buah, Susu, Minyak), berat 1 SP (gram), dan persen BDD. Contoh: Beras (Karbohidrat, 50g, 100%), Ayam (Protein Hewani, 40g, 50%).',
      link: { label: 'Buka Bahan Baku', action: 'renderBahanBaku' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 2v4h4"/><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="12" y1="9" x2="12" y2="15"/></svg>',
      title: '2. Referensi SP Bahan',
      desc: 'Data acuan untuk koreksi BDD dan berat per SP. Sistem memprioritaskan nilai BDD dari Referensi SP Bahan dibanding data Bahan Baku. Pastikan data referensi terisi untuk akurasi perhitungan.',
      link: { label: 'Buka Referensi SP', action: 'renderSpReferensi' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/></svg>',
      title: '3. Standar SP',
      desc: 'Atur nilai Standar Penukar per jenjang per kategori SP. Jenjang: TK/PAUD, SD/MI (1-3), SD/MI (4-6), SMP/MTs SMA/SMK, Bumil/Busui, Balita. Default sudah sesuai pedoman gizi — sesuaikan jika diperlukan.',
      link: { label: 'Buka Standar SP', action: 'renderStandarSp' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>',
      title: '4. Menu & Gizi',
      desc: 'Buat resep menu dengan memilih bahan baku. Gramasi per porsi terisi otomatis berdasarkan SP. Masukkan kandungan gizi (kalori, protein, lemak, karbohidrat, serat) untuk setiap menu.',
      link: { label: 'Buka Menu', action: 'renderMenu' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      title: '5. Susun Siklus Menu',
      desc: 'Atur menu per hari dalam siklus (7-10 hari) per jenjang. Lengkapi dengan jumlah porsi sesuai data Penerima Manfaat. Set status siklus menjadi Aktif agar masuk perhitungan.',
      link: { label: 'Buka Siklus', action: 'renderSiklus' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
      title: '6. Perhitungan BDD',
      desc: 'Hitung kebutuhan bahan per menu per jenjang. Menampilkan: Berat Bersih (g) × BDD(%) → Berat Kotor (g) × jumlah penerima ÷ 1000 = Kebutuhan (kg). BDD bersumber dari Referensi SP (prioritas) atau data Bahan Baku.',
      link: { label: 'Buka Perhitungan BDD', action: 'renderPerhitunganBdd' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><rect x="8" y="13" width="3" height="4"/><rect x="13" y="11" width="3" height="6"/></svg>',
      title: '7. Perencanaan Kebutuhan',
      desc: 'Rekap final kebutuhan bahan per hari lintas semua jenjang. Menampilkan: total porsi, kebutuhan per jenjang (kg), total kebutuhan, buffer 10%, dan rincian pembelian (kg/pcs). Hasil ini siap digunakan untuk Purchase Request.',
      link: { label: 'Buka Perencanaan', action: 'renderPerencanaan' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
      title: '8. Total Kebutuhan Pangan',
      desc: 'Ringkasan per hari yang lebih sederhana — menampilkan nama menu, bahan, jumlah pembelian (kg/pcs/btl), dan nilai kebutuhan. Dua hari ditampilkan berdampingan untuk memudahkan belanja.',
      link: { label: 'Buka Total Kebutuhan', action: 'renderTotalKebutuhan' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
      title: '9. Buat Purchase Order',
      desc: 'Gunakan hasil Perencanaan atau Total Kebutuhan sebagai acuan Purchase Request / Purchase Order. Kebutuhan sudah dalam satuan kg dengan buffer 10% untuk antisipasi kekurangan.',
      link: { label: 'Buka Pembelian', action: 'renderPembelian' }
    },
  ];

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
          <tr class="border-t border-stone-100"><td class="px-4 py-3 text-sm font-medium">Pisang</td><td class="px-4 py-3 text-sm text-right mono">40,83</td><td class="px-4 py-3 text-sm text-right mono">57,00</td><td class="px-4 py-3 text-sm text-right mono">66,42</td><td class="px-4 py-3 text-sm text-right mono">21,00</td><td class="px-4 py-3 text-sm text-right mono">12,08</td><td class="px-4 py-3 text-sm text-right mono">16,58</td><td class="px-4 py-3 text-sm text-right mono font-semibold">213,92</td><td class="px-4 py-3 text-sm text-right mono text-sky-700 font-semibold">235,31</td><td class="px-4 py-3 text-sm text-right mono font-bold">2.567 pcs</td></tr>
          <tr class="border-t border-stone-100"><td class="px-4 py-3 text-sm font-medium">Minyak</td><td class="px-4 py-3 text-sm text-right mono">2,45</td><td class="px-4 py-3 text-sm text-right mono">3,42</td><td class="px-4 py-3 text-sm text-right mono">3,99</td><td class="px-4 py-3 text-sm text-right mono">1,26</td><td class="px-4 py-3 text-sm text-right mono">1,09</td><td class="px-4 py-3 text-sm text-right mono">1,00</td><td class="px-4 py-3 text-sm text-right mono font-semibold">13,20</td><td class="px-4 py-3 text-sm text-right mono text-sky-700 font-semibold">14,52</td><td class="px-4 py-3 text-sm text-right mono font-bold">13 kg</td></tr>
        </tbody>
      </table>
    </div>
    <div class="px-5 py-3 bg-stone-50 text-xs text-stone-500 border-t border-stone-200 space-y-1">
      <div><strong>Rumus:</strong></div>
      <div>Berat Bersih (g) = SP × Berat 1 SP &nbsp;|&nbsp; Berat Kotor (g) = round(Bersih ÷ (BDD/100))</div>
      <div>Kebutuhan (kg) = Berat Kotor × Jumlah Penerima ÷ 1000 &nbsp;|&nbsp; Buffer = total × 1,1 (10%)</div>
      <div>Pisang & Susu dihitung per pcs (buah) bukan kg.</div>
    </div>
  </div>`;

  c.innerHTML = `
    <div class="grid gap-4">
      ${steps.map(function(s, i) {
        return '<div class="bg-white border border-stone-200 rounded-xl p-5 hover:shadow-md transition-shadow flex items-start gap-4">' +
          '<div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">' + s.icon + '</div>' +
          '<div class="flex-1 min-w-0">' +
            '<h3 class="font-bold text-sm mb-1">' + s.title + '</h3>' +
            '<p class="text-sm text-stone-500 leading-relaxed">' + s.desc + '</p>' +
            (s.link ? '<button onclick="' + s.link.action + '()" class="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' + s.link.label + '</button>' : '') +
          '</div>' +
        '</div>';
      }).join('')}
    </div>
    <div class="mt-6">
      <button onclick="showContohSp()" class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        Lihat Contoh Perhitungan
      </button>
    </div>
    ${contohHtml}
  `;
}

function showContohSp() {
  var el = document.getElementById('contoh-sp');
  if (el) el.classList.remove('hidden');
}
