async function renderPanduanSDM() {
  const c = document.getElementById('content');
  const steps = [
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      title: '1. Karyawan',
      desc: 'Master data karyawan: nama, NIK, jabatan, departemen, gaji pokok, status, tanggal masuk. Jabatan dipilih dari master Divisi. Data ini dipakai untuk absensi, payroll, dan shift.',
      link: { label: 'Buka Karyawan', action: "navigate('karyawan')" }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      title: '2. Absensi Karyawan',
      desc: 'Input kehadiran harian per karyawan: status (Hadir/Sakit/Izin/Cuti/Alpa), jam masuk, jam keluar, keterangan. Bisa filter per karyawan, rentang tanggal, dan status. Data ini jadi dasar hitung payroll mingguan/bulanan.',
      link: { label: 'Buka Absensi', action: "navigate('absensi')" }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9 9 0 0 0-9 9z"/><path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9z"/><path d="M12 12h.01M9 12h.01M15 12h.01"/></svg>',
      title: '3. Izin & Cuti',
      desc: 'Karyawan mengajukan izin/cuti/sakit. Atasan approve/tolak. Data ini otomatis mempengaruhi status absensi dan perhitungan payroll (potongan cuti, insentif hadir penuh).',
      link: { label: 'Buka Izin/Cuti', action: "navigate('ijin-cuti')" }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="16" r="2"/><path d="M12 14v2l1 1"/></svg>',
      title: '4. Hari Libur',
      desc: 'Atur kalender hari libur nasional & perusahaan. Tanggal yang ditandai sebagai libur akan <strong>mengunci absensi</strong> — tidak bisa input/edit/hapus absensi pada tanggal tersebut. Kategori: Nasional, Perusahaan, atau Mingguan.',
      link: { label: 'Buka Hari Libur', action: "navigate('hari-libur')" }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
      title: '5. Payroll Bulanan',
      desc: 'Hitung gaji per periode (bulan/tahun): gaji pokok + tunjangan - potongan = total gaji. Status: Draft → Dibayar. Saat dibayar, otomatis buat jurnal di Kas & Bank (keluar, kategori Gaji, akun Dana Operasional).',
      link: { label: 'Buka Payroll', action: "navigate('payroll')" }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      title: '6. Payroll Mingguan',
      desc: 'Rekap kehadiran per minggu (7 hari). Tampil jam masuk/keluar per hari, total hadir, upah per hari (gaji_pokok/26), total gaji mingguan. Bisa "Bayar & Jurnal" → auto jurnal ke Kas Bank.',
      link: { label: 'Buka Payroll Mingguan', action: "navigate('payroll?tab=mingguan')" }
    },
    {
      icon: '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      title: '7. Shift & Jadwal',
      desc: 'Buat shift (nama, jam masuk/keluar, warna) lalu atur jadwal karyawan per divisi. Data ini membantu HR mengelola jam kerja dan absensi yang seharusnya.',
      link: { label: 'Buka Shift', action: "navigate('shift')" }
    },
  ];

  const alurHtml = `
  <div class="mt-8 bg-white border border-stone-200 rounded-xl overflow-hidden">
    <div class="px-5 py-4 font-bold border-b border-stone-200 text-sm">Alur SDM: Dari Karyawan ke Payroll</div>
    <div class="p-5">
      <div class="flex flex-col md:flex-row items-stretch gap-3 text-xs">
        <div class="flex-1 bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <div class="font-semibold text-blue-700 mb-1">Karyawan</div>
          <div class="text-blue-500">Master data</div>
        </div>
        <div class="flex items-center justify-center text-stone-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>
        <div class="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
          <div class="font-semibold text-amber-700 mb-1">Absensi</div>
          <div class="text-amber-500">Harian</div>
        </div>
        <div class="flex items-center justify-center text-stone-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>
        <div class="flex-1 bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
          <div class="font-semibold text-emerald-700 mb-1">Izin/Cuti</div>
          <div class="text-emerald-500">Approve → potong payroll</div>
        </div>
        <div class="flex items-center justify-center text-stone-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>
        <div class="flex-1 bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <div class="font-semibold text-red-700 mb-1">Hari Libur</div>
          <div class="text-red-500">Kunci absensi</div>
        </div>
        <div class="flex items-center justify-center text-stone-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>
        <div class="flex-1 bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
          <div class="font-semibold text-purple-700 mb-1">Payroll</div>
          <div class="text-purple-500">Bulanan/Mingguan</div>
        </div>
        <div class="flex items-center justify-center text-stone-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>
        <div class="flex-1 bg-rose-50 border border-rose-200 rounded-lg p-4 text-center">
          <div class="font-semibold text-rose-700 mb-1">Jurnal Kas</div>
          <div class="text-rose-500">Auto saat dibayar</div>
        </div>
      </div>
    </div>
  </div>`;

  const cards = steps.map(s => `
  <div class="bg-white border border-stone-200 rounded-xl p-5 hover:border-primary-300 transition-colors">
    <div class="flex items-start gap-4">
      <div class="flex-shrink-0 w-16 h-16 rounded-lg bg-stone-100 flex items-center justify-center text-stone-600">${s.icon}</div>
      <div class="flex-1 min-w-0">
        <h3 class="font-semibold text-lg text-stone-900">${s.title}</h3>
        <p class="text-stone-600 mt-1 text-sm leading-relaxed">${s.desc}</p>
        ${s.link ? `<button onclick="${s.link.action}" class="mt-3 text-sm text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1">
          ${s.link.label} <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>` : ''}
      </div>
    </div>
  </div>`).join('');

  c.innerHTML = `
  <div class="space-y-6">
    <div class="bg-gradient-to-r from-stone-800 to-stone-900 text-white rounded-2xl p-6 md:p-8">
      <h1 class="text-2xl md:text-3xl font-bold">Panduan SDM</h1>
      <p class="text-stone-300 mt-2">Alur lengkap manajemen SDM: Karyawan → Absensi → Izin/Cuti → Hari Libur → Payroll → Jurnal Otomatis</p>
    </div>

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      ${cards}
    </div>

    ${alurHtml}

    <div class="bg-white border border-stone-200 rounded-xl p-5">
      <h3 class="font-semibold text-stone-900 mb-3">Laporan SDM</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-stone-50">
            <tr>
              <th class="text-left px-4 py-3 text-xs font-semibold uppercase">Laporan</th>
              <th class="text-left px-4 py-3 text-xs font-semibold uppercase">Akses</th>
              <th class="text-left px-4 py-3 text-xs font-semibold uppercase">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-t border-stone-100"><td class="px-4 py-3 font-medium">Karyawan</td><td class="px-4 py-3">Modul Karyawan</td><td class="px-4 py-3 text-stone-500">Daftar lengkap + detail</td></tr>
            <tr class="border-t border-stone-100"><td class="px-4 py-3 font-medium">Absensi</td><td class="px-4 py-3">Modul Absensi</td><td class="px-4 py-3 text-stone-500">Filter karyawan/tanggal/status</td></tr>
            <tr class="border-t border-stone-100"><td class="px-4 py-3 font-medium">Izin/Cuti</td><td class="px-4 py-3">Modul Izin/Cuti</td><td class="px-4 py-3 text-stone-500">Status pending/approve/tolak</td></tr>
            <tr class="border-t border-stone-100"><td class="px-4 py-3 font-medium">Payroll Bulanan</td><td class="px-4 py-3">Modul Payroll → tab Bulanan</td><td class="px-4 py-3 text-stone-500">Gaji pokok + tunjangan - potongan</td></tr>
            <tr class="border-t border-stone-100"><td class="px-4 py-3 font-medium">Payroll Mingguan</td><td class="px-4 py-3">Modul Payroll → tab Mingguan</td><td class="px-4 py-3 text-stone-500">Hadir 7 hari × upah/hari</td></tr>
            <tr class="border-t border-stone-100"><td class="px-4 py-3 font-medium">Laporan Payroll</td><td class="px-4 py-3">Laporan → tab Payroll / Payroll Mingguan</td><td class="px-4 py-3 text-stone-500">Export XLSX tersedia</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="bg-amber-50 border border-amber-200 rounded-xl p-5">
      <h4 class="font-semibold text-amber-800 mb-2 flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/><path d="M12 15h.01"/></svg>
        Catatan Penting
      </h4>
      <ul class="text-amber-700 text-sm space-y-1">
        <li>• <strong>Gaji pokok = upah harian</strong>. Total gaji mingguan = hadir × gaji_pokok. Bulanan = Σ mingguan.</li>
        <li>• <strong>Absensi → Payroll otomatis</strong>. Saat buka Payroll Mingguan, sistem ambil data absensi 7 hari.</li>
        <li>• <strong>Izin/Cuti approve</strong> → status di absensi jadi "Izin"/"Cuti", ikut hitung potongan di payroll.</li>
        <li>• <strong>Hari Libur</strong> — tanggal yang ditandai libur di menu "Hari Libur" akan <strong>mengunci absensi</strong>. Tidak bisa input/edit/hapus absensi pada tanggal tersebut.</li>
        <li>• <strong>Bayar Payroll</strong> (bulanan/mingguan) → auto buat jurnal Kas & Bank keluar, kategori Gaji, akun Dana Operasional (kode 2100).</li>
        <li>• <strong>Shift</strong> dipakai untuk validasi jam masuk/keluar di absensi mobile (GPS + foto).</li>
      </ul>
    </div>
  </div>`;
}