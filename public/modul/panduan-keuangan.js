function renderPanduanKeuangan() {
  const c = document.getElementById('content');
  const steps = [
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
      title: '1. Purchase Order (PO)',
      desc: 'Buat PO di modul Pembelian. Supplier dipilih dari data master Supplier (dropdown). Masukkan item bahan baku, qty, dan harga — total otomatis terhitung. PO bisa dibuat manual atau dari Siklus Menu.',
      link: { label: 'Buka Pembelian', action: "navigate('pembelian')" }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><path d="M12 6v12"/></svg>',
      title: '2. Penerimaan Barang',
      desc: 'Saat barang tiba, buat Penerimaan Barang. Catat no dokumen supplier, tanggal terima, dan status QC (Lolos/Retur/Ditolak). Data ini menjadi bukti serah terima.',
      link: { label: 'Buka Penerimaan', action: "navigate('penerimaan')" }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
      title: '3. Pembayaran PO → Auto-Jurnal',
      desc: 'Ubah status PO menjadi "Dibayar". Sistem OTOMATIS membuat jurnal di Kas & Bank: tipe "keluar", kategori "Pembayaran Supplier", akun "Dana Bahan Baku" (kode 2000). Realisasi budget ikut ter-update otomatis.',
      link: { label: 'Buka Kas & Bank', action: "navigate('kas-bank')" }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
      title: '4. Budgeting & Realisasi',
      desc: 'Atur anggaran per periode di modul Budgeting. Saat PO dibayar, realisasi otomatis terhitung dari total kas keluar, dibagi proporsional ke setiap entry budget sesuai total_budget masing-masing.',
      link: { label: 'Buka Budgeting', action: "navigate('budgeting')" }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
      title: '5. Laporan Keuangan',
      desc: 'Semua transaksi otomatis masuk ke laporan: Laba/Rugi, Pengeluaran Bulanan, Penggunaan Anggaran, RAB Bulanan, Buku Pembantu, dan Laporan Keuangan. Cukup buka tab laporan — data selalu terbaru.',
      link: { label: 'Buka Laporan', action: 'renderLaporan' }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/></svg>',
      title: '6. HPP per Porsi',
      desc: 'Harga Pokok Produksi dihitung dari total biaya bahan + tenaga kerja + overhead dibagi jumlah porsi. Biaya bahan bersumber dari harga satuan bahan baku, bukan dari PO.',
      link: { label: 'Buka HPP', action: 'renderHPP' }
    },
  ];

  const alurHtml = `
  <div class="mt-8 bg-white border border-stone-200 rounded-xl overflow-hidden">
    <div class="px-5 py-4 font-bold border-b border-stone-200 text-sm">Alur Data Pembelian ke Laporan Keuangan</div>
    <div class="p-5">
      <div class="flex flex-col md:flex-row items-stretch gap-3 text-xs">
        <div class="flex-1 bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <div class="font-semibold text-blue-700 mb-1">PO Dibuat</div>
          <div class="text-blue-500">status: Draft / Disetujui</div>
        </div>
        <div class="flex items-center justify-center text-stone-400">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
        <div class="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
          <div class="font-semibold text-amber-700 mb-1">PO Dibayar</div>
          <div class="text-amber-500">status: Dibayar</div>
        </div>
        <div class="flex items-center justify-center text-stone-400">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
        <div class="flex-1 bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
          <div class="font-semibold text-emerald-700 mb-1">Kas & Bank</div>
          <div class="text-emerald-500">keluar — Pembayaran Supplier</div>
        </div>
        <div class="flex items-center justify-center text-stone-400">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
        <div class="flex-1 bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
          <div class="font-semibold text-purple-700 mb-1">Realisasi Budget</div>
          <div class="text-purple-500">update otomatis</div>
        </div>
        <div class="flex items-center justify-center text-stone-400">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
        <div class="flex-1 bg-rose-50 border border-rose-200 rounded-lg p-4 text-center">
          <div class="font-semibold text-rose-700 mb-1">Laporan</div>
          <div class="text-rose-500">Laba/Rugi, Pengeluaran, dll</div>
        </div>
      </div>
    </div>
  </div>`;

  const tabelLaporan = `
  <div class="mt-6 bg-white border border-stone-200 rounded-xl overflow-hidden">
    <div class="px-5 py-4 font-bold border-b border-stone-200 text-sm">Laporan Terkait Pembelian</div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-stone-50">
          <tr>
            <th class="text-left px-4 py-3 text-xs font-semibold uppercase">Laporan</th>
            <th class="text-left px-4 py-3 text-xs font-semibold uppercase">Sumber</th>
            <th class="text-left px-4 py-3 text-xs font-semibold uppercase">Keterangan</th>
          </tr>
        </thead>
        <tbody>
          <tr class="border-t border-stone-100"><td class="px-4 py-3 font-medium">Pembelian</td><td class="px-4 py-3">PO langsung</td><td class="px-4 py-3 text-stone-500">Data mentah PO + status</td></tr>
          <tr class="border-t border-stone-100"><td class="px-4 py-3 font-medium">Laba/Rugi</td><td class="px-4 py-3">Kas & Bank</td><td class="px-4 py-3 text-stone-500">PO dibayar = biaya</td></tr>
          <tr class="border-t border-stone-100"><td class="px-4 py-3 font-medium">Pengeluaran Bulanan</td><td class="px-4 py-3">Kat: Pembayaran Supplier</td><td class="px-4 py-3 text-stone-500">Biaya bahan baku</td></tr>
          <tr class="border-t border-stone-100"><td class="px-4 py-3 font-medium">Penggunaan Anggaran</td><td class="px-4 py-3">Kat: Pembayaran Supplier</td><td class="px-4 py-3 text-stone-500">Dana terpakai bahan</td></tr>
          <tr class="border-t border-stone-100"><td class="px-4 py-3 font-medium">RAB Bulanan</td><td class="px-4 py-3">Budget.realisasi</td><td class="px-4 py-3 text-stone-500">Anggaran vs realisasi</td></tr>
          <tr class="border-t border-stone-100"><td class="px-4 py-3 font-medium">BP Kas</td><td class="px-4 py-3">Kas & Bank</td><td class="px-4 py-3 text-stone-500">Transaksi per akun BP Kas</td></tr>
          <tr class="border-t border-stone-100"><td class="px-4 py-3 font-medium">Keuangan</td><td class="px-4 py-3">Kas & Bank</td><td class="px-4 py-3 text-stone-500">Ringkasan arus kas</td></tr>
        </tbody>
      </table>
    </div>
    <div class="px-5 py-3 bg-stone-50 text-xs text-stone-500 border-t border-stone-200">
      <strong>Catatan:</strong> Semua laporan di atas (kecuali "Pembelian") hanya menampilkan PO yang sudah berstatus <strong>Dibayar</strong>.
    </div>
  </div>`;

  c.innerHTML = `
    <div class="grid gap-4">
      ${steps.map(function(s) {
        return '<div class="bg-white border border-stone-200 rounded-xl p-5 hover:shadow-md transition-shadow flex items-start gap-4">' +
          '<div class="w-12 h-12 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">' + s.icon + '</div>' +
          '<div class="flex-1 min-w-0">' +
            '<h3 class="font-bold text-sm mb-1">' + s.title + '</h3>' +
            '<p class="text-sm text-stone-500 leading-relaxed">' + s.desc + '</p>' +
            (s.link ? '<button onclick="' + s.link.action + '()" class="mt-2 text-xs font-medium text-cyan-600 hover:text-cyan-800 inline-flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' + s.link.label + '</button>' : '') +
          '</div>' +
        '</div>';
      }).join('')}
    </div>
    ${alurHtml}
    ${tabelLaporan}
  `;
}
