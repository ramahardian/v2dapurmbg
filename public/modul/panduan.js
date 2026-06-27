// ===== Panduan Ahli Gizi =====
function renderPanduanAhliGizi() {
  const c = document.getElementById('content');
  const steps = [
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg>',
      title: '1. Data Bahan Baku',
      desc: 'Isi Kategori SP, Berat 1 SP, dan BDD setiap bahan. Contoh: Beras (Karbohidrat, 50g, 100%), Ayam (Protein Hewani, 40g, 50%).',
      link: { label: 'Buka Bahan Baku', action: 'renderBahanBaku' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
      title: '2. Edit Standar SP',
      desc: 'Sesuaikan nilai SP per jenjang jika diperlukan. Standar default sudah sesuai pedoman gizi.',
      link: { label: 'Buka Standar SP', action: 'renderStandarSp' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>',
      title: '3. Buat Menu & Gizi',
      desc: 'Buat menu dengan memilih bahan. Gramasi terisi otomatis dari SP. Masukkan juga nilai gizi (kalori, protein, dll).',
      link: { label: 'Buka Menu', action: 'renderMenu' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      title: '4. Susun Siklus Menu',
      desc: 'Atur menu per hari dalam siklus (7-14 hari). Tentukan jumlah porsi sesuai penerima manfaat.',
      link: { label: 'Buka Siklus', action: 'renderSiklus' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
      title: '5. Hitung Kebutuhan SP',
      desc: 'Di laporan siklus, klik "Hitung SP". Lihat kebutuhan tiap bahan: berat bersih → berat kotor (koreksi BDD) → total kg.',
      link: { label: 'Contoh Hitungan', action: 'showContohSp' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
      title: '6. Generate PO',
      desc: 'Hasil hitungan SP dipakai untuk membuat Purchase Order. Metrik kebutuhan sudah dalam kg dengan buffer 10%.',
      link: { label: 'Buka Pembelian', action: 'renderPembelian' }
    },
  ];

  const contohHtml = `
  <div id="contoh-sp" class="hidden mt-6 bg-white border border-stone-200 rounded-xl overflow-hidden">
    <div class="px-5 py-3 font-bold border-b border-stone-200 flex items-center justify-between">
      <span>Contoh Perhitungan SP — SD 1-3 (490 penerima)</span>
      <button onclick="document.getElementById('contoh-sp').classList.add('hidden')" class="text-stone-400 hover:text-stone-600">&times;</button>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="bg-stone-50">
          <tr>
            <th class="text-left px-4 py-3 text-xs font-semibold uppercase">Bahan</th>
            <th class="text-center px-4 py-3 text-xs font-semibold uppercase">SP</th>
            <th class="text-center px-4 py-3 text-xs font-semibold uppercase">1 SP</th>
            <th class="text-center px-4 py-3 text-xs font-semibold uppercase">Bersih</th>
            <th class="text-center px-4 py-3 text-xs font-semibold uppercase">BDD</th>
            <th class="text-center px-4 py-3 text-xs font-semibold uppercase">Kotor</th>
            <th class="text-center px-4 py-3 text-xs font-semibold uppercase">Kebutuhan</th>
          </tr>
        </thead>
        <tbody>
          <tr class="border-t border-stone-100"><td class="px-4 py-3 text-sm font-medium">Beras</td><td class="px-4 py-3 text-sm text-center mono">1</td><td class="px-4 py-3 text-sm text-center mono">50g</td><td class="px-4 py-3 text-sm text-center mono">50g</td><td class="px-4 py-3 text-sm text-center mono">100%</td><td class="px-4 py-3 text-sm text-center mono">50g</td><td class="px-4 py-3 text-sm text-center mono font-bold">24.50 kg</td></tr>
          <tr class="border-t border-stone-100"><td class="px-4 py-3 text-sm font-medium">Ayam Potong</td><td class="px-4 py-3 text-sm text-center mono">1</td><td class="px-4 py-3 text-sm text-center mono">40g</td><td class="px-4 py-3 text-sm text-center mono">40g</td><td class="px-4 py-3 text-sm text-center mono">50%</td><td class="px-4 py-3 text-sm text-center mono">80g</td><td class="px-4 py-3 text-sm text-center mono font-bold">39.20 kg</td></tr>
          <tr class="border-t border-stone-100"><td class="px-4 py-3 text-sm font-medium">Tempe</td><td class="px-4 py-3 text-sm text-center mono">0.25</td><td class="px-4 py-3 text-sm text-center mono">100g</td><td class="px-4 py-3 text-sm text-center mono">25g</td><td class="px-4 py-3 text-sm text-center mono">100%</td><td class="px-4 py-3 text-sm text-center mono">25g</td><td class="px-4 py-3 text-sm text-center mono font-bold">12.25 kg</td></tr>
          <tr class="border-t border-stone-100"><td class="px-4 py-3 text-sm font-medium">Timun</td><td class="px-4 py-3 text-sm text-center mono">0.25</td><td class="px-4 py-3 text-sm text-center mono">32g</td><td class="px-4 py-3 text-sm text-center mono">8g</td><td class="px-4 py-3 text-sm text-center mono">55%</td><td class="px-4 py-3 text-sm text-center mono">15g</td><td class="px-4 py-3 text-sm text-center mono font-bold">7.35 kg</td></tr>
          <tr class="border-t border-stone-100"><td class="px-4 py-3 text-sm font-medium">Pisang</td><td class="px-4 py-3 text-sm text-center mono">1</td><td class="px-4 py-3 text-sm text-center mono">55g</td><td class="px-4 py-3 text-sm text-center mono">55g</td><td class="px-4 py-3 text-sm text-center mono">66%</td><td class="px-4 py-3 text-sm text-center mono">83g</td><td class="px-4 py-3 text-sm text-center mono font-bold">40.67 kg</td></tr>
          <tr class="border-t border-stone-100"><td class="px-4 py-3 text-sm font-medium">Minyak</td><td class="px-4 py-3 text-sm text-center mono">1</td><td class="px-4 py-3 text-sm text-center mono">5g</td><td class="px-4 py-3 text-sm text-center mono">5g</td><td class="px-4 py-3 text-sm text-center mono">100%</td><td class="px-4 py-3 text-sm text-center mono">5g</td><td class="px-4 py-3 text-sm text-center mono font-bold">2.45 kg</td></tr>
        </tbody>
      </table>
    </div>
    <div class="px-5 py-3 bg-stone-50 text-xs text-stone-500 border-t border-stone-200">
      Rumus: Berat Bersih = 1 SP × SP &nbsp;|&nbsp; Berat Kotor = round(Bersih ÷ (BDD/100)) &nbsp;|&nbsp; Kebutuhan (kg) = Kotor × Penerima ÷ 1000
    </div>
  </div>`;

  c.innerHTML = `
    <div class="mb-6">
      <h2 class="text-xl font-bold">Panduan Alur Kerja Ahli Gizi</h2>
      <p class="text-sm text-stone-500 mt-1">Urutan langkah dari input data hingga hasil perhitungan kebutuhan bahan</p>
    </div>
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
    ${contohHtml}
  `;
}

function showContohSp() {
  var el = document.getElementById('contoh-sp');
  if (el) el.classList.remove('hidden');
}
