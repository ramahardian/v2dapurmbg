// ===== Panduan Ahli Gizi (Updated) =====
function renderPanduanAhliGizi() {
  const c = document.getElementById('content');

  // ===================== STEP ICONS =====================
  var I = {
    ref: '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M4 19.5v-15A2.5 2.5 0 017.5 2H20v20H7.5A2.5 2.5 0 015 19.5z"/><polyline points="5 19.5 5 19.5 7.5 17 10 19.5"/></svg>',
    standar: '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    menu: '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
    siklus: '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>',
    bdd: '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    rencana: '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    total: '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>',
    pr: '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    harga: '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    terima: '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
    biaya: '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M16 13H8M16 17H8"/><path d="M10 9H8"/></svg>',
    keuangan: '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>',
    check: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    arrow: '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
  };

  // ===================== DATA LANGKAH =====================
  // Setiap langkah: { no, icon, title, desc, details (array ringkas), link, color, badge, time }
  var langkahGizi = [
    {
      no: 1,
      icon: I.ref,
      title: 'Referensi SP Bahan',
      badge: 'PRIORITAS',
      color: 'emerald',
      time: '~15 menit',
      desc: 'Data acuan utama untuk BDD dan berat per SP. <strong>Nilai BDD dari sini diprioritaskan</strong> dibanding data Bahan Baku.',
      details: [
        'Isi nama bahan baku dan pilih kategori SP',
        'Masukkan berat bersih (gram) dan % BDD',
        'Masukkan kandungan gizi: energi, protein, lemak, karbohidrat, serat',
        'Sistem otomatis hitung berat kotor dari BDD',
        '<strong class="text-amber-700">Tidak perlu input harga</strong> — itu tugas Keuangan'
      ],
      link: 'renderSpReferensi'
    },
    {
      no: 2,
      icon: I.standar,
      title: 'Standar SP',
      badge: 'ACUAN',
      color: 'teal',
      time: '~10 menit',
      desc: 'Atur Standar Penukar per jenjang per kategori SP. Default sudah sesuai pedoman gizi nasional.',
      details: [
        'Jenjang: TK/PAUD, SD(1-3), SD(4-6), SMP/MTs, SMA/SMK, Bumil/Busui, Balita',
        '7 kategori: Sumber Karbohidrat, Protein Hewani, Protein Nabati, Sayur, Buah, Susu, Minyak/Lemak',
        'Nilai dalam satuan SP (standar porsi)',
        'Sesuaikan jika ada kebutuhan khusus dari sekolah'
      ],
      link: 'renderStandarSp'
    },
    {
      no: 3,
      icon: I.menu,
      title: 'Menu & Gizi',
      badge: 'KOMPOSISI',
      color: 'amber',
      time: '~30 menit',
      desc: 'Buat resep menu dengan memilih bahan baku. Gramasi per porsi terisi otomatis berdasarkan SP.',
      details: [
        'Pilih bahan baku dari Referensi SP yang sudah diisi',
        'Gramasi terisi otomatis — cukup pilih jumlah SP',
        'Masukkan kandungan gizi per menu (kkal, protein, lemak, dll)',
        'Bisa upload gambar menu untuk dokumentasi',
        '<strong class="text-amber-700">Harga tidak perlu diisi</strong> — diatur Keuangan'
      ],
      link: 'renderMenu'
    },
    {
      no: 4,
      icon: I.siklus,
      title: 'Susun Siklus Menu',
      badge: '10 HARI',
      color: 'violet',
      time: '~20 menit',
      desc: 'Atur menu per hari dalam siklus 10 hari. Pilih jenjang, atur porsi, lengkapi hari 1-10.',
      details: [
        'Pilih jenjang penerima manfaat',
        'Atur jumlah porsi per hari per jenjang',
        'Assign menu (Sarapan, Snack, Makan Siang) untuk setiap hari',
        'Setelah lengkap, ubah status jadi <strong>Aktif</strong>',
        'Siklus Aktif otomatis masuk perhitungan kebutuhan & laporan'
      ],
      link: 'renderSiklus'
    },
    {
      no: 5,
      icon: I.bdd,
      title: 'Perhitungan BDD',
      badge: 'HITUNG',
      color: 'rose',
      time: '~5 menit',
      desc: 'Lihat rincian kebutuhan bahan per menu per jenjang. BDD dari Referensi SP (prioritas) atau Bahan Baku.',
      details: [
        'Menampilkan: Berat Bersih (g) × BDD(%) → Berat Kotor (g)',
        'Dikalikan jumlah penerima ÷ 1000 = Kebutuhan (kg)',
        'BDD bersumber dari Referensi SP (prioritas utama)',
        'Fallback ke data BDD dari Bahan Baku jika tidak ada di Referensi',
        'Fungsi: <code class="text-xs bg-stone-100 px-1 py-0.5 rounded">renderPerhitunganBdd()</code>'
      ],
      link: 'renderPerhitunganBdd'
    },
    {
      no: 6,
      icon: I.rencana,
      title: 'Perencanaan Kebutuhan Pangan',
      badge: 'REKAP',
      color: 'sky',
      time: '~5 menit',
      desc: 'Rekap final kebutuhan bahan per hari lintas semua jenjang. Siap untuk Purchase Request.',
      details: [
        'Total porsi & kebutuhan per jenjang (kg)',
        'Total kebutuhan semua bahan',
        'Buffer 10% untuk antisipasi',
        'Rincian pembelian: kg/pcs/btl',
        '<strong class="text-blue-700">Tombol 🗃️ Buat Draft PR</strong> tersedia di filter bar'
      ],
      link: 'renderPerencanaan'
    },
    {
      no: 7,
      icon: I.total,
      title: 'Total Kebutuhan Pangan',
      badge: 'RINGKAS',
      color: 'orange',
      time: '~3 menit',
      desc: 'Ringkasan per hari — nama menu, bahan, jumlah pembelian (kg/pcs/btl). Dua hari berdampingan.',
      details: [
        'Tampilan sederhana per hari',
        'Dua hari bersebelahan untuk mudahkan belanja',
        'Total per bahan per hari',
        '<strong class="text-blue-700">Tombol 🗃️ Buat Draft PR</strong> juga tersedia di sini'
      ],
      link: 'renderTotalKebutuhan'
    }
  ];

  var langkahFinance = [
    {
      no: 8,
      icon: I.pr,
      title: 'Buat Draft Purchase Request',
      badge: 'BARU!',
      color: 'blue',
      time: 'Otomatis',
      desc: 'Hasil perencanaan dari siklus bisa langsung diubah jadi Draft PR. Cukup klik tombol dan pilih siklus.',
      details: [
        'Klik tombol <strong>🗃️ Buat Draft PR</strong> di halaman Perencanaan atau Total Kebutuhan',
        'Masukkan nomor siklus (pisah koma: 1,2,3)',
        'Sistem otomatis generate PR dengan nomor dokumen PR/...',
        'Status: <span class="px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800 font-bold">Draft</span> — siap ditinjau Keuangan',
        'Cek hasil di menu <strong>Pembelian → Purchase Order</strong>'
      ],
      link: 'renderPerencanaan'
    },
    {
      no: 9,
      icon: I.harga,
      title: 'Keuangan Atur Harga',
      badge: 'KEUANGAN',
      color: 'indigo',
      time: 'Sewaktu',
      desc: 'Bagian Keuangan mengisi harga_satuan di Bahan Baku. <strong class="text-amber-700">Ahli Gizi tidak bisa ubah harga</strong> — proteksi otomatis.',
      details: [
        'Harga diisi manual atau dari sinkronisasi API koperasi',
        'Role <code class="text-xs bg-stone-100 px-1 py-0.5 rounded">ahli_gizi</code> otomatis diblokir edit harga',
        'Proteksi: <code class="text-xs bg-stone-100 px-1 py-0.5 rounded">delete req.body.harga_satuan</code> di backend',
        'Harga dipakai untuk: Auto-Jurnal, Biaya Produksi, Draft PR'
      ],
      link: 'renderBahanBaku'
    },
    {
      no: 10,
      icon: I.terima,
      title: 'Penerimaan Barang → Auto Jurnal',
      badge: 'OTOMATIS',
      color: 'green',
      time: 'Realtime',
      desc: 'Saat barang QC Lolos, sistem otomatis: stok masuk + jurnal double-entry. Tidak perlu entry manual!',
      details: [
        'Buat Penerimaan Barang dengan status <strong>Lolos</strong>',
        'Sistem otomatis: (a) tambah stok bahan baku',
        '(b) catat stok masuk di log',
        '<strong class="text-green-700">(c) Buat jurnal double-entry:</strong>',
        '<div class="ml-4 text-xs font-mono">Debit Persediaan (1300)  Rp XXX<br>Kredit Hutang Usaha (3000) Rp XXX</div>',
        'Jurnal otomatis masuk ke Jurnal Umum → Buku Besar'
      ],
      link: 'renderPembelian'
    },
    {
      no: 11,
      icon: I.biaya,
      title: 'Laporan Biaya Produksi',
      badge: 'BARU!',
      color: 'cyan',
      time: 'Otomatis',
      desc: 'Estimasi biaya bahan baku per siklus: total biaya, rata-rata per hari, biaya per porsi.',
      details: [
        'Data dihitung otomatis dari kebutuhan bahan × harga_satuan',
        'Per siklus: total biaya dan rincian per bahan',
        'Rata-rata biaya per hari operasional',
        'Biaya per porsi per jenjang',
        'Akses: <code class="text-xs bg-stone-100 px-1 py-0.5 rounded">GET /api/purchase_order/laporan/biaya-produksi</code>'
      ],
      link: null
    },
    {
      no: 12,
      icon: I.keuangan,
      title: 'Laporan Keuangan Otomatis',
      badge: 'FULL AUTO',
      color: 'purple',
      time: 'Realtime',
      desc: 'Semua transaksi pembelian otomatis tercatat: Jurnal Umum → Buku Besar → Neraca & Laba Rugi.',
      details: [
        '<strong>Jurnal Umum:</strong> setiap penerimaan barang buat jurnal otomatis',
        '<strong>Buku Besar:</strong> akun Persediaan & Hutang terupdate realtime',
        '<strong>Neraca:</strong> saldo akun mencerminkan stok & hutang terkini',
        '<strong>Laba Rugi:</strong> biaya bahan baku tercatat sebagai beban pokok',
        'Tidak perlu entry manual — alur Ahli Gizi → Pembelian → Stok → Jurnal otomatis'
      ],
      link: null
    }
  ];

  // Label map untuk tombol navigasi
  var labelMap = {
    renderSpReferensi: 'Buka SP Referensi',
    renderStandarSp: 'Buka Standar SP',
    renderMenu: 'Buka Menu Gizi',
    renderSiklus: 'Buka Siklus Menu',
    renderPerhitunganBdd: 'Buka Perhitungan BDD',
    renderPerencanaan: 'Buka Perencanaan',
    renderTotalKebutuhan: 'Buka Total Kebutuhan',
    renderBahanBaku: 'Buka Bahan Baku',
    renderPembelian: 'Buka Pembelian'
  };

  // ===================== FUNGSI RENDER CARD =====================
  function renderCard(s) {
    var no = s.no;
    var detailId = 'step-detail-' + no;
    var lbl = labelMap[s.link] || s.link.replace('render', 'Buka ').replace(/\(.*\)/, '');
    var linkBtn = s.link
      ? '<button onclick="' + s.link + '()" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 bg-' + s.color + '-50 text-' + s.color + '-700 hover:bg-' + s.color + '-100 hover:shadow-sm">' + I.arrow + lbl + '</button>'
      : '<span class="text-xs text-stone-400 italic">Akses via API / menu terkait</span>';

    // Gradient header colors
    var gradMap = {
      emerald: 'from-emerald-500 to-emerald-600',
      teal: 'from-teal-500 to-teal-600',
      amber: 'from-amber-500 to-amber-600',
      violet: 'from-violet-500 to-violet-600',
      rose: 'from-rose-500 to-rose-600',
      sky: 'from-sky-500 to-sky-600',
      orange: 'from-orange-500 to-orange-600',
      blue: 'from-blue-500 to-blue-600',
      indigo: 'from-indigo-500 to-indigo-600',
      green: 'from-green-500 to-green-600',
      cyan: 'from-cyan-500 to-cyan-600',
      purple: 'from-purple-500 to-purple-600'
    };

    var detailItems = s.details.map(function(d) {
      return '<li class="flex items-start gap-2 text-xs text-stone-600"><span class="w-1.5 h-1.5 rounded-full bg-' + s.color + '-400 shrink-0 mt-1.5"></span>' + d + '</li>';
    }).join('');

    return '<div class="group relative bg-white border border-stone-200 rounded-xl overflow-hidden hover:shadow-lg hover:border-' + s.color + '-200 transition-all duration-300">' +
      '<div class="flex">' +
        // Side accent strip
        '<div class="w-1 bg-gradient-to-b ' + (gradMap[s.color] || 'from-stone-400 to-stone-500') + ' shrink-0"></div>' +
        '<div class="flex-1 p-4 sm:p-5">' +
          '<div class="flex items-start gap-3 sm:gap-4">' +
            // Icon circle
            '<div class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 text-white bg-gradient-to-br ' + (gradMap[s.color] || 'from-stone-400 to-stone-500') + ' shadow-sm">' + s.icon + '</div>' +
            '<div class="flex-1 min-w-0">' +
              // Title row
              '<div class="flex flex-wrap items-center gap-2 mb-1">' +
                '<span class="w-6 h-6 rounded-full bg-' + s.color + '-100 text-' + s.color + '-700 text-[10px] font-bold flex items-center justify-center shrink-0">' + no + '</span>' +
                '<h3 class="font-bold text-sm sm:text-base text-stone-800">' + s.title + '</h3>' +
                '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-' + s.color + '-100 text-' + s.color + '-700 shrink-0">' + s.badge + '</span>' +
                '<span class="text-[10px] text-stone-400 shrink-0">' + s.time + '</span>' +
              '</div>' +
              // Description
              '<p class="text-xs sm:text-sm text-stone-500 leading-relaxed mb-2">' + s.desc + '</p>' +
              // Action buttons row
              '<div class="flex flex-wrap items-center gap-2">' + linkBtn +
                '<button onclick="toggleStepDetail(\'' + detailId + '\')" class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-stone-500 hover:text-stone-700 bg-stone-50 hover:bg-stone-100 rounded-lg transition-all duration-200">' +
                  '<svg class="w-3.5 h-3.5 detail-icon transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>' +
                  'Detail' +
                '</button>' +
              '</div>' +
              // Detail expandable
              '<div id="' + detailId + '" class="hidden mt-3 pt-3 border-t border-stone-100">' +
                '<ul class="space-y-1.5">' + detailItems + '</ul>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ===================== DIAGRAM ALUR =====================
  var diagramHtml =
  '<div class="bg-white border border-stone-200 rounded-xl overflow-hidden mt-6">' +
    '<div class="px-5 py-3 bg-gradient-to-r from-stone-50 to-stone-100 border-b border-stone-200 flex items-center gap-2">' +
      '<svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
      '<h3 class="font-bold text-sm text-stone-700">Diagram Alur Lengkap</h3>' +
    '</div>' +
    '<div class="p-5">' +
      // Flow step-by-step (horizontal on desktop)
      '<div class="hidden md:flex items-start justify-between gap-2 mb-6">' +
        // Ahli Gizi flow
        '<div class="flex-1">' +
          '<div class="text-center mb-2"><span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">AHLI GIZI</span></div>' +
          '<div class="space-y-1">' +
            '<div class="text-center"><span class="inline-block px-2 py-1 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">1. SP Referensi</span></div>' +
            '<div class="flex justify-center"><svg class="w-4 h-4 text-emerald-400 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>' +
            '<div class="text-center"><span class="inline-block px-2 py-1 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">2. Standar SP</span></div>' +
            '<div class="flex justify-center"><svg class="w-4 h-4 text-emerald-400 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>' +
            '<div class="text-center"><span class="inline-block px-2 py-1 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">3. Menu</span></div>' +
            '<div class="flex justify-center"><svg class="w-4 h-4 text-emerald-400 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>' +
            '<div class="text-center"><span class="inline-block px-2 py-1 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">4. Siklus</span></div>' +
            '<div class="flex justify-center"><svg class="w-4 h-4 text-emerald-400 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>' +
            '<div class="text-center"><span class="inline-block px-2 py-1 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">5-7. Hitung Kebutuhan</span></div>' +
          '</div>' +
        '</div>' +
        // Divider
        '<div class="flex items-center justify-center px-2">' +
          '<div class="w-px h-40 bg-stone-200 md:w-20 md:h-px"></div>' +
        '</div>' +
        // Keuangan flow
        '<div class="flex-1">' +
          '<div class="text-center mb-2"><span class="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">KEUANGAN</span></div>' +
          '<div class="space-y-1">' +
            '<div class="text-center"><span class="inline-block px-2 py-1 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">8. Draft PR</span></div>' +
            '<div class="flex justify-center"><svg class="w-4 h-4 text-blue-400 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>' +
            '<div class="text-center"><span class="inline-block px-2 py-1 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">9. Harga Bahan</span></div>' +
            '<div class="flex justify-center"><svg class="w-4 h-4 text-blue-400 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>' +
            '<div class="text-center"><span class="inline-block px-2 py-1 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">10. Terima + Jurnal</span></div>' +
            '<div class="flex justify-center"><svg class="w-4 h-4 text-blue-400 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>' +
            '<div class="text-center"><span class="inline-block px-2 py-1 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">11. Biaya Produksi</span></div>' +
            '<div class="flex justify-center"><svg class="w-4 h-4 text-blue-400 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>' +
            '<div class="text-center"><span class="inline-block px-2 py-1 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">12. Laporan Keu</span></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Mobile version (grid)
      '<div class="md:hidden grid grid-cols-2 gap-4 mb-6">' +
        '<div class="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4">' +
          '<div class="text-xs font-bold text-emerald-800 mb-2 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> AHLI GIZI</div>' +
          '<div class="space-y-1.5 text-[11px] text-stone-600">' +
            '<div class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>SP Referensi → Standar SP</div>' +
            '<div class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Menu Gizi → Siklus 10 Hari</div>' +
            '<div class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>BDD → Kebutuhan (kg)</div>' +
            '<div class="mt-1 pt-1.5 border-t border-emerald-200 text-emerald-700 font-medium text-[10px]">✅ Tanpa harga</div>' +
          '</div>' +
        '</div>' +
        '<div class="bg-blue-50/50 border border-blue-200 rounded-xl p-4">' +
          '<div class="text-xs font-bold text-blue-800 mb-2 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> KEUANGAN</div>' +
          '<div class="space-y-1.5 text-[11px] text-stone-600">' +
            '<div class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>Draft PR → Harga Bahan</div>' +
            '<div class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>PO → Terima → Auto Jurnal</div>' +
            '<div class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>Biaya Produksi → Laporan Keu</div>' +
            '<div class="mt-1 pt-1.5 border-t border-blue-200 text-blue-700 font-medium text-[10px]">🤖 Fully auto</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Arrow bridging gizi → finance
      '<div class="text-center mb-4">' +
        '<div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-100 via-white to-blue-100 border border-stone-200 text-xs font-medium text-stone-600">' +
          '<span class="text-emerald-700 font-bold">Data Gizi (kg)</span>' +
          '<svg class="w-5 h-5 text-stone-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' +
          '<span class="text-blue-700 font-bold">Data Keuangan (Rp)</span>' +
        '</div>' +
      '</div>' +

      // System flow boxes
      '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">' +
        '<div class="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-xl p-3 text-center">' +
          '<div class="font-bold text-emerald-800 mb-1">🟢 AHLI GIZI</div>' +
          '<div class="text-emerald-600">Input gizi + BDD + Menu + Siklus → Kebutuhan (kg)</div>' +
        '</div>' +
        '<div class="bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200 rounded-xl p-3 text-center">' +
          '<div class="font-bold text-amber-800 mb-1">🟡 BRIDGE</div>' +
          '<div class="text-amber-600">Draft PR + Harga Bahan = Biaya Produksi</div>' +
        '</div>' +
        '<div class="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl p-3 text-center">' +
          '<div class="font-bold text-blue-800 mb-1">🔵 KEUANGAN</div>' +
          '<div class="text-blue-600">Jurnal Otomatis → Buku Besar → Neraca</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  // ===================== CONTOH PERHITUNGAN =====================
  var contohHtml =
  '<div id="contoh-sp" class="hidden mt-6 bg-white border border-stone-200 rounded-xl overflow-hidden">' +
    '<div class="px-4 sm:px-5 py-3 bg-gradient-to-r from-amber-50 to-yellow-50 border-b border-stone-200 flex items-center justify-between">' +
      '<div class="flex items-center gap-2">' +
        '<svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
        '<span class="font-bold text-sm text-amber-800">Contoh Perhitungan — Siklus Aktif Lintas Jenjang</span>' +
      '</div>' +
      '<button onclick="document.getElementById(\'contoh-sp\').classList.add(\'hidden\')" class="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-400 hover:text-stone-600 transition-colors">&times;</button>' +
    '</div>' +
    '<div class="overflow-x-auto">' +
      '<table class="w-full text-xs">' +
        '<thead>' +
          '<tr class="bg-stone-50">' +
            '<th class="text-left px-3 sm:px-4 py-2.5 font-semibold uppercase tracking-wider text-stone-600">Bahan</th>' +
            '<th class="text-right px-3 sm:px-4 py-2.5 font-semibold uppercase tracking-wider text-stone-600">TK/PAUD</th>' +
            '<th class="text-right px-3 sm:px-4 py-2.5 font-semibold uppercase tracking-wider text-stone-600">SD (1-3)</th>' +
            '<th class="text-right px-3 sm:px-4 py-2.5 font-semibold uppercase tracking-wider text-stone-600">SD (4-6)</th>' +
            '<th class="text-right px-3 sm:px-4 py-2.5 font-semibold uppercase tracking-wider text-stone-600">SMP/SMA</th>' +
            '<th class="text-right px-3 sm:px-4 py-2.5 font-semibold uppercase tracking-wider text-stone-600">Total (kg)</th>' +
            '<th class="text-right px-3 sm:px-4 py-2.5 font-semibold uppercase tracking-wider text-stone-600">+10%</th>' +
            '<th class="text-right px-3 sm:px-4 py-2.5 font-semibold uppercase tracking-wider text-stone-600">Beli</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' +
          '<tr class="border-t border-stone-100 hover:bg-stone-50/50 transition-colors">' +
            '<td class="px-3 sm:px-4 py-2.5 font-medium text-stone-700">Beras</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums">24,50</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums">42,75</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums">59,78</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums">25,20</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-stone-800">180,30</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-amber-700">198,33</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums font-bold text-emerald-700">180 kg</td>' +
          '</tr>' +
          '<tr class="border-t border-stone-100 hover:bg-stone-50/50 transition-colors">' +
            '<td class="px-3 sm:px-4 py-2.5 font-medium text-stone-700">Ayam Potong</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums">39,20</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums">54,72</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums">95,64</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums">30,24</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-stone-800">258,92</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-amber-700">284,81</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums font-bold text-emerald-700">259 kg</td>' +
          '</tr>' +
          '<tr class="border-t border-stone-100 hover:bg-stone-50/50 transition-colors">' +
            '<td class="px-3 sm:px-4 py-2.5 font-medium text-stone-700">Tempe</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums">12,25</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums">17,10</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums">27,90</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums">12,60</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-stone-800">82,07</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-amber-700">90,28</td>' +
            '<td class="px-3 sm:px-4 py-2.5 text-right font-mono tabular-nums font-bold text-emerald-700">85 kg</td>' +
          '</tr>' +
        '</tbody>' +
      '</table>' +
    '</div>' +
    '<div class="px-4 sm:px-5 py-3 bg-stone-50 border-t border-stone-100">' +
      '<div class="text-[11px] text-stone-500 space-y-1">' +
        '<div class="font-semibold text-stone-700">📐 Rumus:</div>' +
        '<div class="font-mono text-stone-500">Berat Bersih (g) = SP × Berat 1 SP &nbsp;|&nbsp; Berat Kotor (g) = round(Bersih ÷ (BDD/100))</div>' +
        '<div class="font-mono text-stone-500">Kebutuhan (kg) = Berat Kotor × Jumlah Penerima ÷ 1000 &nbsp;|&nbsp; Buffer = total × 1,1 (10%)</div>' +
        '<div class="mt-1 text-amber-700"><strong>ℹ️ Tips:</strong> BDD bersumber dari Referensi SP (prioritas). Jika kosong, pakai BDD dari Bahan Baku.</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  // ===================== RENDER MAIN =====================
  var giziCards = [];
  for (var i = 0; i < langkahGizi.length; i++) {
    giziCards.push(renderCard(langkahGizi[i]));
  }

  var financeCards = [];
  for (var j = 0; j < langkahFinance.length; j++) {
    financeCards.push(renderCard(langkahFinance[j]));
  }

  c.innerHTML =
    '<div class="max-w-4xl mx-auto px-2 sm:px-0 py-4 sm:py-6">' +

      // Top intro bar
      '<div class="bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-700 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white mb-6 shadow-lg">' +
        '<div class="flex items-start gap-3 sm:gap-4">' +
          '<div class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">' +
            '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
          '</div>' +
          '<div class="flex-1">' +
            '<h1 class="text-lg sm:text-xl font-bold mb-1">Panduan Ahli Gizi</h1>' +
            '<p class="text-sm text-emerald-100 leading-relaxed">Alur lengkap dari input data gizi hingga laporan keuangan otomatis. Ikuti langkah 1-12 secara berurutan.</p>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Quick progress overview
      '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">' +
        '<div class="bg-white border border-stone-200 rounded-xl p-3 text-center hover:shadow-sm transition-shadow">' +
          '<div class="text-lg font-bold text-emerald-600">7</div>' +
          '<div class="text-[10px] sm:text-xs text-stone-500">Langkah Gizi</div>' +
        '</div>' +
        '<div class="bg-white border border-stone-200 rounded-xl p-3 text-center hover:shadow-sm transition-shadow">' +
          '<div class="text-lg font-bold text-blue-600">5</div>' +
          '<div class="text-[10px] sm:text-xs text-stone-500">Langkah Keuangan</div>' +
        '</div>' +
        '<div class="bg-white border border-stone-200 rounded-xl p-3 text-center hover:shadow-sm transition-shadow">' +
          '<div class="text-lg font-bold text-amber-600">12</div>' +
          '<div class="text-[10px] sm:text-xs text-stone-500">Total Langkah</div>' +
        '</div>' +
        '<div class="bg-white border border-stone-200 rounded-xl p-3 text-center hover:shadow-sm transition-shadow">' +
          '<div class="text-lg font-bold text-green-600">🤖</div>' +
          '<div class="text-[10px] sm:text-xs text-stone-500">Auto Jurnal</div>' +
        '</div>' +
      '</div>' +

      // SECTION: AHLI GIZI
      '<div class="mb-4 flex items-center gap-2">' +
        '<span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">🟢 BAGIAN AHLI GIZI</span>' +
        '<span class="text-[11px] text-stone-400">Langkah 1-7 — Fokus data gizi & kebutuhan (kg)</span>' +
      '</div>' +
      '<div class="grid gap-3">' + giziCards.join('') + '</div>' +

      // SECTION: INTEGRASI KEUANGAN
      '<div class="mt-8 mb-4 flex items-center gap-2">' +
        '<span class="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">🔵 INTEGRASI KEUANGAN</span>' +
        '<span class="text-[11px] text-stone-400">Langkah 8-12 — Otomatis, tanpa input manual</span>' +
      '</div>' +
      '<div class="grid gap-3">' + financeCards.join('') + '</div>' +

      // DIAGRAM
      diagramHtml +

      // CONTOH BUTTON + TABLE
      '<div class="mt-6 flex flex-wrap gap-3">' +
        '<button onclick="showContohSp()" class="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-sm font-medium rounded-xl transition-all shadow-md hover:shadow-lg inline-flex items-center gap-2">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
          'Lihat Contoh Perhitungan' +
        '</button>' +
        '<button onclick="renderPanduanAhliGizi()" class="px-4 py-2.5 bg-white border border-stone-200 hover:border-stone-300 text-stone-600 hover:text-stone-800 text-sm font-medium rounded-xl transition-all inline-flex items-center gap-2">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>' +
          'Reset Panduan' +
        '</button>' +
      '</div>' +
      contohHtml +

      // FOOTER: RINGKASAN ROLE
      '<div class="mt-8 bg-gradient-to-r from-stone-50 to-amber-50/50 border border-stone-200 rounded-xl overflow-hidden">' +
        '<div class="px-4 sm:px-5 py-3 bg-gradient-to-r from-stone-100 to-amber-100/50 border-b border-stone-200">' +
          '<div class="flex items-center gap-2">' +
            '<svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' +
            '<h3 class="font-bold text-sm text-stone-800">🎯 Ringkasan Pembagian Peran</h3>' +
          '</div>' +
        '</div>' +
        '<div class="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs sm:text-sm">' +
          '<div class="flex items-start gap-3 p-3 rounded-xl bg-emerald-50/70 border border-emerald-100">' +
            '<span class="px-2 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-white shrink-0 mt-0.5">GIZI</span>' +
            '<div class="text-stone-600"><strong class="text-emerald-800">Ahli Gizi:</strong> input data gizi, BDD, menu, siklus, hitung kebutuhan (kg) — <strong class="text-amber-700">tanpa harga</strong></div>' +
          '</div>' +
          '<div class="flex items-start gap-3 p-3 rounded-xl bg-blue-50/70 border border-blue-100">' +
            '<span class="px-2 py-1 rounded-lg text-xs font-bold bg-blue-500 text-white shrink-0 mt-0.5">DANA</span>' +
            '<div class="text-stone-600"><strong class="text-blue-800">Keuangan:</strong> atur harga bahan, terima PR, buat PO, pantau biaya produksi, laporan keuangan</div>' +
          '</div>' +
          '<div class="flex items-start gap-3 p-3 rounded-xl bg-purple-50/70 border border-purple-100">' +
            '<span class="px-2 py-1 rounded-lg text-xs font-bold bg-purple-500 text-white shrink-0 mt-0.5">STOK</span>' +
            '<div class="text-stone-600"><strong class="text-purple-800">Gudang:</strong> terima barang, QC, stok masuk otomatis, stok keluar untuk produksi harian</div>' +
          '</div>' +
          '<div class="flex items-start gap-3 p-3 rounded-xl bg-green-50/70 border border-green-100">' +
            '<span class="px-2 py-1 rounded-lg text-xs font-bold bg-green-500 text-white shrink-0 mt-0.5">💰</span>' +
            '<div class="text-stone-600"><strong class="text-green-800">Sistem:</strong> auto-jurnal double-entry, buku besar, neraca, laba rugi — semua <strong>otomatis</strong></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

    '</div>';
}

// ===================== HELPER: TOGGLE DETAIL =====================
function toggleStepDetail(id) {
  var el = document.getElementById(id);
  if (!el) return;
  var isHidden = el.classList.contains('hidden');
  el.classList.toggle('hidden');
  // Animate icon rotation
  var parent = el.parentElement;
  var icon = parent && parent.querySelector('.detail-icon');
  if (icon) {
    icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  }
}



// ===================== HELPER: SHOW CONTOH =====================
function showContohSp() {
  var el = document.getElementById('contoh-sp');
  if (el) el.classList.remove('hidden');
}
