// ===== Menu (custom with bahan) =====
let menuState = { page: 1, limit: 10, search: '', total: 0, totalPages: 1 };
let menuViewMode = 'list'; // 'list' | 'siklus'

// Satuan tampilan/perhitungan di halaman /menu: bahan kategori Minyak selalu
// diperlakukan dalam gram (master bahan_baku tetap memakai satuan aslinya,
// mis. Karton — hanya perhitungan di /menu yang memakai gram).
function menuSatuanTampil(b) {
  if (b && String(b.kategori_sp || '').toLowerCase() === 'minyak') return 'g';
  return (b && b.satuan) || 'g';
}

// Resolusi satuan & faktor konversi untuk kalkulator. Master bahan_baku adalah
// sumber kebenaran (dicari by id, lalu by nama — case-insensitive + trim); nilai
// baris hanya fallback. Ini menutup kasus bahan diketik manual / data lama / baris
// dari DB yang berat_per_satuan-nya 0 — selama master punya satuan unit & berat
// per satuan, kalkulator tetap menampilkan satuan yang benar (Karton/Liter/Pcs/dll).
function bahanKalkulatorInfo(b) {
  var master = null;
  if (b && b.bahan_baku_id) {
    master = (window._bahanBaku || []).find(function(x) { return String(x.id) === String(b.bahan_baku_id); });
  }
  if (!master && b && b.nama) {
    var namaQ = String(b.nama).toLowerCase().trim();
    master = (window._bahanBaku || []).find(function(x) {
      return x.nama && String(x.nama).toLowerCase().trim() === namaQ;
    });
  }
  var satuan = (master && master.satuan) ? master.satuan : (b.satuan || 'g');
  // Faktor konversi: nilai baris yang di-set eksplisit (>0) menang — mis. user mengisi
  // faktor kustom di modal kalkulator; kalau baris 0/kosong, baru fallback ke master
  // (baris dari DB selalu berisi nilai master via JOIN, jadi tidak ada konflik).
  var perUnit = Number(b.berat_per_satuan) || Number(master && master.berat_per_satuan) || Number(b.berat_1_sp) || Number(master && master.berat_1_sp) || 0;
  // Kg/kilogram tanpa berat_per_satuan → asumsi standar 1000 g
  if (perUnit <= 0 && isKgSatuan(satuan)) perUnit = 1000;
  return { satuan: satuan, perUnit: perUnit };
}

// Satuan asli master bahan_baku (mis. Karton) untuk kalkulator. Item bersatuan unit
// (Karton/Pcs/Botol/Ikat/Liter/dll) SELALU tampil dalam mode unit ↔ Gram — bila
// berat_per_satuan belum ada, faktor konversi bisa diisi langsung di modal kalkulator.
function bahanKalkulatorSatuan(b) {
  var info = bahanKalkulatorInfo(b);
  var low = String(info.satuan).toLowerCase();
  if (low !== 'g' && low !== 'gram') return info.satuan;
  return 'g';
}

// Satuan "unit" (bukan berat murni g/gram) — dipakai kalkulator & kolom jumlah.
// Case-insensitive supaya 'karton'/'Karton'/'Liter'/'Dus' dst ikut terdeteksi.
function isSatuanUnit(s) {
  if (!s) return false;
  var low = String(s).toLowerCase();
  return low !== 'g' && low !== 'gram';
}
function isKgSatuan(s) {
  var low = String(s || '').toLowerCase();
  return low === 'kg' || low === 'kilogram';
}

async function ensureBahanBakuLoaded() {
  if (window._bahanBaku) return;
  const [bahan, spRef] = await Promise.all([
    api.get('/bahan_baku'),
    api.get('/sp_referensi_bahan').catch(() => []),
  ]);
  window._bahanBaku = bahan;
  window._spRefList = Array.isArray(spRef) ? spRef : [];
  window._spRefMap = {};
  (window._spRefList || []).forEach(function(r) {
    window._spRefMap[r.nama] = {
      berat_bersih: Number(r.berat_bersih),
      bdd_persen: Number(r.bdd_persen),
      energi: Number(r.energi) || 0,
      protein: Number(r.protein) || 0,
      lemak: Number(r.lemak) || 0,
      karbohidrat: Number(r.karbohidrat) || 0,
      serat: Number(r.serat) || 0,
    };
  });
}

async function renderMenu() {
  const c = document.getElementById('content');
  if (!c) return;
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    if (menuViewMode === 'siklus') {
      await ensureBahanBakuLoaded();
      await renderMenuBySiklus(c);
      return;
    }

    const params = new URLSearchParams({ page: menuState.page, limit: menuState.limit, search: menuState.search });
    const r = await fetch('/api/menu?' + params, { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal memuat menu');
    }
    const data = await r.json();
    const pagination = data.pagination || { total: data.length || 0, totalPages: 1, page: menuState.page };
    menuState = { ...menuState, total: pagination.total, totalPages: pagination.totalPages, page: pagination.page };
    
    c.innerHTML = renderMenuHtml(Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []));
    renderPagination();
    attachMenuHandlers();
  } catch (err) {
    console.error('Menu error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat menu: ${err.message}</div>`;
  }
}

async function renderMenuBySiklus(c) {
  try {
    const r = await fetch('/api/menu/by-siklus', { credentials: 'include' });
    if (!r.ok) throw new Error('Gagal memuat data');
    const data = await r.json();
    c.innerHTML = renderMenuBySiklusHtml(data);
    attachMenuBySiklusHandlers();
  } catch (err) {
    console.error('Menu by siklus error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat menu berdasarkan siklus: ${err.message}</div>`;
  }
}

function renderMenuBySiklusHtml(data) {
  const groups = data.siklus_groups || [];
  const standalone = data.standalone || [];
  const totalMenu = data.total_menu || 0;
  const usedInSiklus = data.used_in_siklus || 0;

  // Tab navigation
  const tabsHtml = `<div class="flex items-center gap-1 mb-5 bg-stone-100 rounded-xl p-1 w-fit border border-stone-200">
    <button onclick="switchMenuView('list')" class="px-4 py-2 text-sm font-medium rounded-lg transition-all ${menuViewMode === 'list' ? 'bg-white text-stone-900 shadow-sm border border-stone-200' : 'text-stone-500 hover:text-stone-700'}">
      <svg class="w-4 h-4 inline -mt-0.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/></svg>
      Semua Menu
    </button>
    <button onclick="switchMenuView('siklus')" class="px-4 py-2 text-sm font-medium rounded-lg transition-all ${menuViewMode === 'siklus' ? 'bg-white text-stone-900 shadow-sm border border-stone-200' : 'text-stone-500 hover:text-stone-700'}">
      <svg class="w-4 h-4 inline -mt-0.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      Berdasarkan Siklus
    </button>
  </div>`;

  // Stats cards
  const statsHtml = `<div class="flex flex-wrap gap-3 mb-6">
    <div class="flex-1 min-w-[140px] bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200/60 px-4 py-3 shadow-sm"><div class="text-[10px] font-semibold uppercase tracking-wider text-blue-700 mb-0.5">Total Menu</div><div class="text-xl font-bold text-blue-800">${totalMenu}</div></div>
    <div class="flex-1 min-w-[140px] bg-gradient-to-br from-sky-50 to-sky-100/60 rounded-2xl border border-sky-200/60 px-4 py-3 shadow-sm"><div class="text-[10px] font-semibold uppercase tracking-wider text-sky-700 mb-0.5">Digunakan di Siklus</div><div class="text-xl font-bold text-sky-800">${usedInSiklus}</div></div>
    <div class="flex-1 min-w-[140px] bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 px-4 py-3 shadow-sm"><div class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mb-0.5">Standalone</div><div class="text-xl font-bold text-emerald-800">${standalone.length}</div></div>
    <div class="flex-1 min-w-[140px] bg-gradient-to-br from-amber-50 to-amber-100/60 rounded-2xl border border-amber-200/60 px-4 py-3 shadow-sm"><div class="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-0.5">Siklus Aktif</div><div class="text-xl font-bold text-amber-800">${groups.filter(g => g.status === 'Aktif').length}</div></div>
  </div>`;

  // Siklus groups
  let siklusHtml = '';
  if (groups.length === 0) {
    siklusHtml = `<div class="col-span-full text-center py-12 text-stone-400">
      <svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      <div>Belum ada siklus menu</div>
      <div class="text-sm mt-1">Buat siklus terlebih dahulu untuk mengelompokkan menu</div>
      <a href="/siklus" onclick="return loadPage('siklus')" class="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>
        Buat Siklus Baru
      </a>
    </div>`;
  } else {
    siklusHtml = groups.map(s => {
      const statusColor = s.status === 'Aktif' ? 'bg-emerald-100 text-emerald-800' : s.status === 'Draft' ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600';
      const filledDays = s.days.filter(d => d.menu_id || d._has_content).length;
      const coverage = s.total_hari ? Math.round((filledDays / s.total_hari) * 100) : 0;

      return `<div class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
        <!-- Siklus Header -->
        <div class="px-5 py-4 border-b border-stone-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="font-bold text-stone-800">${s.nama}</h3>
              <span class="text-[10px] px-2.5 py-1 rounded-full font-medium ${statusColor} capitalize">${s.status}</span>
            </div>
            <div class="flex flex-wrap items-center gap-3 mt-1 text-xs text-stone-500">
              <span>${s.kategori_penerima ? kategoriBadge(s.kategori_penerima) : 'Semua'}</span>
              <span>${s.jumlah_porsi} porsi/hari</span>
              <span>${s.total_hari} hari</span>
              <span class="${coverage >= 100 ? 'text-emerald-600 font-semibold' : coverage > 0 ? 'text-amber-600' : 'text-stone-400'}">${coverage}% terisi</span>
              <span>${s.menu_count} menu unik</span>
            </div>
          </div>
          <a href="#" onclick="navigate('siklus');return false" class="text-xs text-[#1e40af] hover:text-[#1d4ed8] font-medium hover:underline whitespace-nowrap">
            Kelola Siklus →
          </a>
        </div>
        ${s.status === 'Draft' ? `
        <!-- Draft Info -->
        <div class="px-4 pb-4">
          <div class="bg-amber-50 border-2 border-amber-200/80 rounded-xl p-5 text-center shadow-sm">
            <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-100 flex items-center justify-center">
              <svg class="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
            </div>
            <h4 class="text-sm font-bold text-amber-800 mb-1.5">Siklus Masih Draft</h4>
            <p class="text-xs text-amber-700/80 max-w-sm mx-auto leading-relaxed">Siklus <strong>${s.nama}</strong> masih berstatus <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-200/60 text-amber-800 font-semibold text-[10px]">DRAFT</span>. Silakan aktifkan siklus terlebih dahulu untuk mengelola menu dan bahan baku.</p>
            <a href="#" onclick="navigate('siklus');return false" class="inline-flex items-center gap-1.5 mt-3 px-4 py-2 text-xs font-medium text-amber-700 bg-white border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors shadow-sm">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>
              Aktifkan Siklus
            </a>
          </div>
        </div>
        ` : `
        <!-- Days Grid -->
        <div class="p-4">
          <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));">
            ${s.days.map(d => {
              const isFilled = d.menu_id || d._has_content;
              return `<div class="border rounded-lg p-3 transition-all ${isFilled ? (d.menu_id ? 'border-stone-200 hover:border-[#1e40af]/30 hover:shadow-sm' : 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-300 hover:shadow-sm') : 'border-dashed bg-stone-50/50'} ">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-[10px] font-semibold uppercase text-stone-400">Hari ${d.hari_ke}</span>
                  <span class="text-[10px] text-stone-400">${d.hari_nama}</span>
                </div>
                ${isFilled ? `
                  <div class="font-medium text-sm text-stone-800 truncate" title="${d.menu_nama}">${d.menu_nama}</div>
                  <div class="flex items-center gap-2 mt-1.5 text-[10px] text-stone-500">
                    <span>${d.jumlah_porsi} porsi</span>
                    ${d.kalori ? `<span class="mono">${fmtNum(d.kalori)} kkal</span>` : ''}
                    ${d.gramasi_total ? `<span class="mono">${fmtNum(d.gramasi_total)}g</span>` : ''}
                    ${!d.menu_id && d._has_content ? '<span class="text-emerald-600 font-medium">Resep</span>' : ''}
                  </div>
                ` : `<div class="text-sm text-stone-400 italic">Belum diisi</div>`}
              </div>`;
            }).join('')}
          </div>
        </div>
        `}
      </div>`;
    }).join('<div class="h-3"></div>');
  }

  // Standalone menus section
  let standaloneHtml = '';
  if (standalone.length > 0) {
    standaloneHtml = `<div class="mt-6">
      <div class="flex items-center gap-2 mb-3">
        <h3 class="font-bold text-stone-700">Menu Tidak Terpakai</h3>
        <span class="bg-stone-100 text-stone-500 text-xs px-2.5 py-0.5 rounded-full font-medium">${standalone.length}</span>
      </div>
      <div class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-stone-100">
                <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Nama</th>
                <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Kategori</th>
                <th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Gramasi</th>
                <th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Kalori</th>
                <th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Protein</th>
                <th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Karbo</th>
                <th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${standalone.length > 0 ? standalone.map(m => `
                <tr class="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
                  <td class="px-4 py-3 text-xs font-medium text-stone-700">
                    <div class="flex items-center gap-2">
                      <span class="truncate max-w-[180px]" title="${m.nama}">${m.nama}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-xs whitespace-nowrap">${m.kategori_penerima ? kategoriBadge(m.kategori_penerima) : '-'}</td>
                  <td class="px-4 py-3 text-xs text-right mono whitespace-nowrap text-stone-600">${renderGramasiCell(m.gramasi_total, m.bahan)}</td>
                  <td class="px-4 py-3 text-xs text-right mono whitespace-nowrap text-stone-600">${m.kalori}</td>
                  <td class="px-4 py-3 text-xs text-right mono whitespace-nowrap text-stone-600">${m.protein}</td>
                  <td class="px-4 py-3 text-xs text-right mono whitespace-nowrap text-stone-600">${m.karbohidrat}</td>
                 <td class="px-4 py-3 text-xs text-right">
                    <button onclick="switchMenuView('list');editMenuById(${m.id})" class="w-7 h-7 inline-flex items-center justify-center rounded-lg text-stone-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                    <button onclick="switchMenuView('list');saveCurrentMenuForPO({id: ${m.id}, nama: '${m.nama}', kategori_penerima: '${m.kategori_penerima}', jumlah_porsi: ${m.jumlah_porsi || 0}, gramasi_total: ${m.gramasi_total}, kalori: ${m.kalori}, protein: ${m.protein}, karbohidrat: ${m.karbohidrat}, lemak: ${m.lemak}, serat: ${m.serat}, bahan: ${JSON.stringify(m.bahan || [])}, status: '${m.status}'}); openMenuPoModal();" class="w-7 h-7 inline-flex items-center justify-center rounded-lg text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all" title="Buat PO"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                 </td>
               </tr>
              `).join('') : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  return `<div>
    ${tabsHtml}
    ${statsHtml}
    ${siklusHtml}
    ${standaloneHtml}
  </div>`;
}

function attachMenuBySiklusHandlers() {
  const addBtn = document.getElementById('add-menu-btn');
  if (addBtn) addBtn.onclick = () => openMenuForm(null);
}

function switchMenuView(mode) {
  menuViewMode = mode;
  renderMenu();
}

async function editMenuById(id) {
  try {
    const menu = await api.get('/menu/' + id);
    openMenuForm(menu);
  } catch (e) {
    showAlert('Gagal memuat menu: ' + e.message, 'error');
  }
}

const KATEGORI_COLORS = {
  'TK/PAUD': { bg: '#0e7490' },
  'SD 1-3': { bg: '#0891b2' },
  'SD 4-6': { bg: '#d97706' },
  'SMP': { bg: '#1d4ed8' },
  'SMA': { bg: '#7c3aed' },
  'Ibu Hamil': { bg: '#be123c' },
  'Ibu Menyusui': { bg: '#6d28d9' },
  'Balita': { bg: '#0d9488' },
  'Posyandu': { bg: '#a21caf' },
  // backward compat
  'Paket Kecil': { bg: '#0e7490' },
};

function kategoriBadge(kat) {
  // Handle multi-kategori (JSON array string, e.g. '["TK/PAUD","SD","SMP"]')
  try { var p = JSON.parse(kat); if (Array.isArray(p)) {
    if (p.length === 1) return kategoriBadge(p[0]);
    var c0 = KATEGORI_COLORS[p[0]] || { bg: '#78716c' };
    return `<span class="inline-flex items-center gap-1"><span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium text-white" style="background:${c0.bg};">${p[0]}</span><span class="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white" style="background:#3b82f6;">+${p.length-1}</span></span>`;
  }} catch {}
  // Single kategori
  const c = KATEGORI_COLORS[kat] || { bg: '#78716c' };
  return `<span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium text-white" style="background:${c.bg};">${kat}</span>`;
}

function renderBahanCell(bahan) {
  if (!bahan || !bahan.length) {
    return '<span class="text-stone-300">-</span>';
  }
  const names = bahan.map(function(b) { return b.nama; }).filter(Boolean);
  if (!names.length) {
    return '<span class="text-stone-300">-</span>';
  }
  const count = names.length;
  var display = names.slice(0, 2).join(', ');
  if (count > 2) display += ', ...';
  return '<span class="inline-flex items-center gap-1.5" title="' + escHtml(names.join(', ')) + '">' +
    '<span class="truncate max-w-[140px] block text-stone-600">' + escHtml(display) + '</span>' +
    '<span class="shrink-0 bg-stone-100 text-stone-500 text-[10px] font-medium px-1.5 py-0.5 rounded-full">' + count + '</span>' +
  '</span>';
}

function sumBahanGramasi(bahan) {
  if (!bahan || !bahan.length) return 0;
  return bahan.reduce(function(sum, b) { return sum + (Number(b.jumlah) || 0); }, 0);
}

function renderGramasiCell(gramasiTotal, bahan) {
  var displayGramasi = Number(gramasiTotal) || 0;
  var calculated = sumBahanGramasi(bahan);
  if (displayGramasi === 0 && calculated > 0) {
    displayGramasi = calculated;
  }
  if (displayGramasi === 0) {
    return '<span class="text-stone-300 cursor-help" title="Gramasi 0 karena menu belum memiliki bahan atau jumlah bahan belum diisi. Tambah bahan & pilih dari SP Referensi untuk isi otomatis.">0g</span>';
  }
  var rounded = Math.round(displayGramasi * 10) / 10;
  var title = '';
  if (calculated > 0 && Math.abs(calculated - Number(gramasiTotal)) > 0.01) {
    title = ' title="Tersimpan: ' + Number(gramasiTotal) + 'g, Terhitung: ' + Math.round(calculated * 10) / 10 + 'g" class="cursor-help"';
  }
  return '<span' + title + '>' + rounded + 'g</span>';
}

function renderSiklusBadges(usage) {
  if (!usage || !usage.length) return '<span class="text-stone-300">—</span>';
  var groups = {};
  usage.forEach(function(u) {
    if (!groups[u.siklus]) groups[u.siklus] = [];
    groups[u.siklus].push(u.hari);
  });
  return Object.keys(groups).map(function(s) {
    var label = 'H' + groups[s].join(', H');
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-100 text-sky-700 border border-sky-200 mr-1 mb-0.5 whitespace-nowrap">' + escHtml(s) + ' ' + label + '</span>';
  }).join('');
}

function renderMenuHtml(menus) {
  return `<div class="flex flex-wrap justify-between gap-2 mb-4">
    <div class="flex flex-wrap items-center gap-2">
      <button id="add-menu-btn" class="h-11 px-5 bg-[#1e40af] hover:bg-[#1d4ed8] text-white rounded-xl text-sm font-semibold shadow-sm transition-all flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Tambah Menu
      </button>
      <button id="menu-delete-selected" onclick="deleteSelectedMenu()" class="hidden h-10 px-4 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl items-center gap-1.5 shadow-sm transition-all">
        Hapus Terpilih <span id="menu-selected-count" class="font-bold">0</span>
      </button>
    </div>
    <div class="flex gap-2">
      <div class="relative">
        <input type="text" id="search-menu-input" placeholder="Cari nama menu..." value="${menuState.search}"
          class="w-56 h-11 pl-10 pr-4 rounded-xl border border-stone-200 bg-white text-sm shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
        <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
      </div>
    </div>
  </div>
  <div class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-stone-100">
            <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500 w-10">
              <input type="checkbox" id="menu-select-all" onchange="toggleSelectAllMenu(this)" class="cb-modern">
            </th>
            <th class="text-left px-3 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Siklus</th>
            <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Nama</th>
            <th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Gramasi <span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-stone-200 text-stone-500 text-[9px] cursor-help font-bold" title="Gramasi total = jumlah seluruh bahan (g). 0 = belum ada bahan/ jumlah. Default terisi otomatis dari SP Referensi saat pilih bahan.">?</span></th>
            <th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Kalori</th>
            <th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Bahan</th>
            <th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Aksi</th>
          </tr>
        </thead>
        <tbody id="menu-table-body">
            ${menus.length > 0 ? menus.map((m) => `
            <tr class="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
              <td class="px-4 py-3 text-xs">
                <input type="checkbox" value="${m.id}" onchange="updateSelectedMenuCount()" class="menu-checkbox cb-modern">
              </td>
              <td class="px-3 py-3 text-xs">${renderSiklusBadges(m.siklus_usage)}</td>
              <td class="px-4 py-3 text-xs font-medium text-stone-700 truncate max-w-[180px]" title="${m.nama}">${m.nama}</td>
              <td class="px-4 py-3 text-xs text-right mono whitespace-nowrap text-stone-600">${renderGramasiCell(m.gramasi_total, m.bahan)}</td>
              <td class="px-4 py-3 text-xs text-right mono whitespace-nowrap text-stone-600">${m.kalori} kkal</td>
              <td class="px-4 py-3 text-xs text-left whitespace-nowrap">${renderBahanCell(m.bahan)}</td>
              <td class="px-4 py-3 text-xs text-right whitespace-nowrap">
                <button data-menu-id="${m.id}" class="edit-btn w-7 h-7 inline-flex items-center justify-center rounded-lg text-stone-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button data-menu-id="${m.id}" class="delete-btn w-7 h-7 inline-flex items-center justify-center rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-all" title="Hapus"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
              </td>
            </tr>`).join('') : '<tr><td colspan="7" class="text-center py-16 text-stone-400"><svg class="w-12 h-12 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg><div class="text-sm">Belum ada menu</div></td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
  <div id="pagination-controls"></div>`;
}

function renderPagination() {
  const wrap = document.getElementById('pagination-controls');
  if (!wrap) return;
  if (menuState.totalPages <= 1) { wrap.innerHTML = ''; return; }
  var total = menuState.total;
  wrap.innerHTML = `<div class="flex items-center justify-between mt-3">
    <span class="text-sm text-stone-500">${total} data</span>
    <div class="flex gap-2">
      ${menuState.page > 1 ? '<button onclick="goToPage(' + (menuState.page - 1) + ')" class="px-3 py-1.5 text-sm font-medium rounded-lg border border-stone-200 hover:bg-stone-50 hover:border-stone-300 transition-all">Prev</button>' : ''}
      <span class="text-sm text-stone-500">Hal ${menuState.page} dari ${menuState.totalPages}</span>
      ${menuState.page < menuState.totalPages ? '<button onclick="goToPage(' + (menuState.page + 1) + ')" class="px-3 py-1.5 text-sm font-medium rounded-lg border border-stone-200 hover:bg-stone-50 hover:border-stone-300 transition-all">Next</button>' : ''}
    </div>
  </div>`;
}

function goToPage(page) {
  menuState.page = page;
  renderMenu();
}

function attachMenuHandlers() {
  const addBtn = document.getElementById('add-menu-btn');
  if (addBtn) addBtn.onclick = () => openMenuForm(null);
  const searchInput = document.getElementById('search-menu-input');
  if (searchInput) {
    let timer;
    searchInput.oninput = function() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        menuState.search = this.value;
        menuState.page = 1;
        renderMenu();
      }, 300);
    };
  }
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const menuId = this.getAttribute('data-menu-id');
      editMenuById(menuId);
    });
  });
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const menuId = this.getAttribute('data-menu-id');
      deleteMenu(menuId);
    });
  });
}

async function openMenuForm(editing) {
  await ensureBahanBakuLoaded();
  const m = editing || { nama: '', deskripsi: '', gramasi_total: 0, kalori: 0, protein: 0, karbohidrat: 0, lemak: 0, serat: 0, bahan: [] };
  document.getElementById('modal-title').innerHTML = (editing ? 'Edit Menu' : 'Menu Baru') + '<button onclick="event.stopPropagation();showMenuInfo()" class="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-stone-100 hover:bg-blue-100 hover:text-blue-700 text-stone-400 transition-all" title="Info"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></button>';
  document.getElementById('modal-body').innerHTML = `
    <div>
      <label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Nama Menu *</label>
      <div class="flex gap-2 mt-1.5">
        <input id="m-nama" value="${m.nama}" class="flex-1 h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
        <button type="button" onclick="openSiklusMenuPicker()" class="shrink-0 px-4 h-11 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 whitespace-nowrap transition-all shadow-sm" title="Ambil nama & bahan dari siklus">📋 Siklus</button>
      </div>
    </div>
    <div class="mt-3"><label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Deskripsi</label><textarea id="m-deskripsi" rows="2" class="mt-1.5 w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">${m.deskripsi || ''}</textarea></div>
    
    <input id="m-kalori" type="hidden" value="${m.kalori || 0}" />
    <input id="m-protein" type="hidden" value="${m.protein || 0}" />
    <input id="m-karbohidrat" type="hidden" value="${m.karbohidrat || 0}" />
    <input id="m-lemak" type="hidden" value="${m.lemak || 0}" />
    <input id="m-serat" type="hidden" value="${m.serat || 0}" />

    <div class="border-t border-stone-200 mt-4 pt-3">
      <div class="flex items-center justify-between gap-3 mb-2">
        <div class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Bahan</div>
        <div class="flex items-center gap-2">
          <button type="button" onclick="addBahanRow()" class="text-xs font-medium border border-stone-200 px-3 py-1.5 rounded-lg hover:bg-stone-50 shadow-sm transition-all">+ Tambah Bahan</button>
          <button type="button" onclick="saveCurrentMenuFromForm(); openMenuPoModal()" class="text-xs font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-lg shadow-sm transition-all flex items-center gap-1.5" title="Buat PO dari Menu">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Buat PO
          </button>
        </div>
      </div>
      <div class="flex items-center gap-2 mb-2 text-xs text-stone-500">
        <span>Tampilkan total untuk</span>
        <input type="number" id="m-porsi" value="0" min="0" step="1" onchange="onPorsiChange()" placeholder="0" class="w-20 h-8 px-2 rounded-lg border border-stone-200 text-sm text-center mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
        <span>porsi</span>
        <span class="flex-1"></span>
        <button type="button" onclick="resetAllToSP()" class="text-xs font-medium border border-stone-200 px-2.5 py-1.5 rounded-lg hover:bg-stone-50 text-stone-500 shadow-sm transition-all">↺ Reset Semua ke SP</button>
      </div>
      <div id="bahan-list" class="space-y-2"></div>
    </div>
    `;
  window._editingMenuData = editing || null;
  window._menuKategoriPenerima = null; // reset kategori dari siklus
  var badgeEl = document.getElementById('m-kategori-badge');
  if (badgeEl) badgeEl.remove();
  window._menuBahan = (m.bahan || []).map(b => ({ bahan_baku_id: b.bahan_baku_id, nama: b.nama || '', jumlah: b.jumlah, satuan: menuSatuanTampil(b), kategori_sp: b.kategori_sp || '', berat_1_sp: b.berat_1_sp || 0, persen_bdd: b.persen_bdd || 100, berat_per_satuan: b.berat_per_satuan || 0, keterangan: b.keterangan || '' }));
  // Biarkan nilai tersimpan dari DB — user bisa klik "↺ Reset ke SP" jika ingin reset
  var savedPorsi = Number(m.jumlah_porsi) || 0;
  window._menuPorsi = savedPorsi;
  document.getElementById('m-porsi').value = savedPorsi;
  renderBahanList();
  hitungNutrisi();
  
  // Cek duplikat nama — load menu names once
  var existingNames = null;
  api.get('/menu?limit=500').then(function(resp) {
    existingNames = (resp.data || resp || []).filter(function(x) { return editing ? x.id !== editing.id : true; }).map(function(x) { return x.nama ? x.nama.toLowerCase().trim() : ''; });
  }).catch(function() { existingNames = []; });
  
  function checkDuplicateName(val) {
    var el = document.getElementById('m-nama');
    var dupEl = document.getElementById('m-nama-dup');
    var nama = (val || el.value).trim();
    if (!nama || !existingNames) { if (dupEl) dupEl.classList.add('hidden'); el.classList.remove('border-red-400','bg-red-50'); return false; }
    var isDup = existingNames.indexOf(nama.toLowerCase()) > -1;
    if (isDup) {
      el.classList.add('border-red-400','bg-red-50');
      if (!dupEl) {
        var p = document.createElement('p');
        p.id = 'm-nama-dup';
        p.className = 'text-xs text-red-600 mt-1';
        p.textContent = '⚠ Nama menu "' + nama + '" sudah ada';
        el.parentNode.appendChild(p);
      } else { dupEl.classList.remove('hidden'); dupEl.textContent = '⚠ Nama menu "' + nama + '" sudah ada'; }
    } else {
      el.classList.remove('border-red-400','bg-red-50');
      if (dupEl) dupEl.classList.add('hidden');
    }
    return isDup;
  }
  
  document.getElementById('m-nama').addEventListener('input', function() { checkDuplicateName(this.value); });
  
  document.getElementById('modal-save').onclick = async function() {
    try {
      if (!validateForm([{ id: 'm-nama', label: 'Nama Menu' }])) return;
      if (checkDuplicateName()) return showAlert('Nama menu sudah ada. Ganti nama terlebih dahulu.', 'warning');
      const payload = {
        nama: document.getElementById('m-nama').value,
        kategori_penerima: window._menuKategoriPenerima || (editing ? editing.kategori_penerima : null),
        deskripsi: document.getElementById('m-deskripsi').value,
        gramasi_total: Math.round((window._menuBahan || []).reduce(function(s,b){ return s + (Number(b.jumlah)||0); }, 0) * 100) / 100,
        kalori: +document.getElementById('m-kalori').value || 0,
        protein: +document.getElementById('m-protein').value || 0,
        karbohidrat: +document.getElementById('m-karbohidrat').value || 0,
        lemak: +document.getElementById('m-lemak').value || 0,
        serat: +document.getElementById('m-serat').value || 0,
        jumlah_porsi: Number(document.getElementById('m-porsi').value) || 0,
        bahan: window._menuBahan.filter(function(b) { return b.bahan_baku_id || b.nama; }),
      };
      if (editing) await api.put('/menu/' + editing.id, payload);
      else await api.post('/menu', payload);
      closeModal(); renderMenu();
    } catch (e) {
      showAlert('Gagal menyimpan: ' + (e.message || 'Unknown error'), 'error');
    }
  };
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}
function addBahanRow() { window._menuBahan.push({ bahan_baku_id: '', jumlah: 0, satuan: 'g', nama: '', kategori_sp: '', berat_1_sp: 0, persen_bdd: 100, berat_per_satuan: 0, keterangan: '' }); renderBahanList(); }
function removeBahanRow(i) { window._menuBahan.splice(i, 1); renderBahanList(); hitungNutrisi(); }
function hitungNutrisi() {
  var totalKalori = 0, totalProtein = 0, totalKarbo = 0, totalLemak = 0, totalSerat = 0;
  (window._menuBahan || []).forEach(function(b) {
    var jml = +b.jumlah || 0;
    if (!jml) return;
    var ref = window._spRefMap && window._spRefMap[b.nama];
    if (ref) {
      totalKalori += jml / 100 * (ref.energi || 0);
      totalProtein += jml / 100 * (ref.protein || 0);
      totalKarbo += jml / 100 * (ref.karbohidrat || 0);
      totalLemak += jml / 100 * (ref.lemak || 0);
      totalSerat += jml / 100 * (ref.serat || 0);
    } else {
      totalKalori += jml / 100 * (b.kalori || 0);
      totalProtein += jml / 100 * (b.protein || 0);
      totalKarbo += jml / 100 * (b.karbohidrat || 0);
      totalLemak += jml / 100 * (b.lemak || 0);
      totalSerat += jml / 100 * (b.serat || 0);
    }
  });
  ['kalori','protein','karbohidrat','lemak','serat'].forEach(function(k) {
    var el = document.getElementById('m-' + k);
    if (el) el.value = Math.round(({kalori:totalKalori,protein:totalProtein,karbohidrat:totalKarbo,lemak:totalLemak,serat:totalSerat})[k] * 100) / 100;
  });
}

function updateBahan(i, k, v) {
  if (k === 'jumlah') {
    var b = window._menuBahan[i];
    if (!b) return;
    var porsi = Number(window._menuPorsi) || 1;
    var satuan = menuSatuanTampil(b);
    var perUnit = bahanKalkulatorInfo(b).perUnit || 1;
    // Input shows total when porsi>0; convert back to grams per-porsi for storage
    var valPerPorsi = Number(v) / porsi;
    var newJumlah;
    if (perUnit > 0 && isSatuanUnit(satuan)) {
      newJumlah = valPerPorsi * perUnit;
    } else {
      newJumlah = valPerPorsi;
    }
    // Warning jika nilai terlalu jauh dari SP default (> 10x)
    var sp = window._spRefMap && window._spRefMap[b.nama];
    var defaultGram = (sp ? Number(sp.berat_bersih) : 0) || Number(b.berat_1_sp) || 0;
    if (defaultGram > 0 && newJumlah > defaultGram * 10) {
      var spDisplay = isSatuanUnit(satuan) ? (defaultGram / perUnit) : defaultGram;
      showConfirm('Nilai ' + v + ' ' + satuan + ' jauh dari standar SP (' + Math.round(spDisplay * 100) / 100 + ' ' + satuan + '). Lanjutkan?', 'Lanjutkan', 'Batalkan', '', 'question').then(function(ok) {
        if (ok) {
          b.jumlah = newJumlah;
          delete b._autoJumlah;
          hitungNutrisi();
          renderBahanList();
        } else {
          renderBahanList();
        }
      });
      return;
    }
    b.jumlah = newJumlah;
    delete b._autoJumlah;
  } else {
    window._menuBahan[i][k] = v;
  }
  hitungNutrisi();
  renderBahanList();
}
function openBahanKalkulator(i) {
  var b = window._menuBahan[i];
  if (!b) return;
  var existing = document.getElementById('bahan-kalkulator-modal');
  if (existing) existing.remove();
  var satuan = bahanKalkulatorSatuan(b);
  var porsi = Number(window._menuPorsi) || 0;
  var perUnit = bahanKalkulatorInfo(b).perUnit || 0;
  window._bkPerUnit = perUnit || 1;
  window._bkLastInput = ''; // reset pelacakan kolom terakhir diedit
  var isUnitSatuan = isSatuanUnit(satuan);
  // b.jumlah tersimpan dalam gram per porsi
  var baseGram = Number(b.jumlah) || 0;
  var unitVal = '', curGram;
  if (isUnitSatuan && perUnit > 0) {
    var unitPerPorsi = baseGram / perUnit;
    var totalUnit = porsi > 0 ? unitPerPorsi * porsi : unitPerPorsi;
    unitVal = Math.round(totalUnit * 10000) / 10000;
    curGram = totalUnit * perUnit;
  } else {
    curGram = baseGram * (porsi > 0 ? porsi : 1);
  }
  var factorVal = perUnit > 0 ? perUnit : '';
  window._bkSatuan = satuan;

  // Kolom jumlah unit + faktor konversi yang BISA DIEDIT (untuk item yang
  // berat_per_satuan-nya masih kosong, user tinggal isi faktor di modal).
  // Ada juga seksi "komposisi kemasan" (mis. 1 Karton = 12 × 1 L atau 6 × 2 L)
  // yang otomatis menghitung faktor gram dari jumlah isi × volume × berat jenis.
  var compUnitDefault = bkCompUnitDefault(satuan);
  var compField = isUnitSatuan ? (
    '<div class="pt-2.5 mt-2 border-t border-stone-100">' +
      '<div class="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1.5">Atau isi komposisi kemasan</div>' +
      '<div class="flex flex-wrap items-center gap-1.5">' +
        '<span class="text-xs text-stone-500">1 ' + escHtml(satuan) + ' =</span>' +
        '<input id="bk-comp-count" type="number" min="1" step="1" placeholder="12" oninput="bkSyncComp()" title="Jumlah isi per ' + escHtml(satuan) + '" class="w-14 h-8 px-2 border border-stone-200 rounded-lg text-sm mono text-right focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />' +
        '<span class="text-stone-400">×</span>' +
        '<input id="bk-comp-size" type="number" min="0" step="any" placeholder="1" oninput="bkSyncComp()" title="Isi per kemasan (volume L/ml atau berat g)" class="w-14 h-8 px-2 border border-stone-200 rounded-lg text-sm mono text-right focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />' +
        '<select id="bk-comp-unit" onchange="bkSyncComp()" title="Satuan isi: L/ml = volume, g = berat langsung" class="h-8 px-1.5 border border-stone-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">' +
          '<option value="L"' + (compUnitDefault === 'g' ? '' : ' selected') + '>L</option>' +
          '<option value="ml">ml</option>' +
          '<option value="g"' + (compUnitDefault === 'g' ? ' selected' : '') + '>g</option>' +
        '</select>' +
        '<span class="text-stone-300 mx-0.5">·</span>' +
        '<span id="bk-density-wrap"' + (compUnitDefault === 'g' ? ' class="hidden"' : '') + '><label class="text-xs text-stone-500 flex items-center gap-1">Berat jenis <input id="bk-density" type="number" min="0" step="any" value="1000" oninput="bkSyncComp()" title="Gram per liter (minyak goreng ± 917 g/L)" class="w-20 h-8 px-2 border border-stone-200 rounded-lg text-sm mono text-right focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /> g/L</label></span>' +
      '</div>' +
      '<div id="bk-comp-hint" class="text-xs text-stone-400 mt-1.5"></div>' +
    '</div>'
  ) : '';

  var unitField = isUnitSatuan ? (
    '<div class="space-y-2">' +
      '<div><label class="text-xs font-medium text-stone-600">' + escHtml(satuan) + '</label>' +
        '<input id="bk-unit" type="number" step="any" value="' + unitVal + '" oninput="bkSyncUnit()" placeholder="0" class="w-full h-10 px-3 border border-stone-200 rounded-lg text-sm mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>' +
      '<div><label class="text-xs font-medium text-stone-600">1 ' + escHtml(satuan) + ' = <input id="bk-factor" type="number" step="any" value="' + factorVal + '" oninput="bkSyncFactor()" placeholder="mis. 11000" class="w-24 h-8 px-2 ml-1 border border-stone-200 rounded-lg text-sm mono text-right focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /> g</label></div>' +
      compField +
    '</div>'
  ) : '';

  var m = document.createElement('div');
  m.id = 'bahan-kalkulator-modal';
  m.className = 'fixed inset-0 z-[80] flex items-center justify-center bg-black/40';
  m.innerHTML = '<div class="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-5" onclick="event.stopPropagation()">' +
    '<div class="flex items-center justify-between mb-4">' +
      '<h3 class="font-bold text-stone-700">Kalkulator ' + (isUnitSatuan ? escHtml(satuan) + ' ↔ Gram' : 'Gram ↔ Kg') + '</h3>' +
      '<button onclick="document.getElementById(\'bahan-kalkulator-modal\').remove()" class="text-stone-400 hover:text-stone-600"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
    '</div>' +
    '<div class="text-xs text-stone-500 mb-3">Bahan: <span class="font-semibold text-stone-700">' + escHtml(b.nama || '') + '</span> · Satuan: <span class="font-semibold text-stone-700">' + escHtml(satuan) + '</span>' + (porsi > 0 ? ' · Total ' + porsi + ' porsi' : '') + '</div>' +
    '<div class="space-y-3">' +
      unitField +
      '<div><label class="text-xs font-medium text-stone-600">Gram</label>' +
        '<input id="bk-gram" type="number" step="any" value="' + (Math.round(curGram * 100) / 100) + '" oninput="bkSyncGram()" class="w-full h-10 px-3 border border-stone-200 rounded-lg text-sm mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>' +
      '<div><label class="text-xs font-medium text-stone-600">Kilogram</label>' +
        '<input id="bk-kg" type="number" step="any" value="' + (Math.round((curGram / 1000) * 10000) / 10000) + '" oninput="bkSyncKg()" class="w-full h-10 px-3 border border-stone-200 rounded-lg text-sm mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>' +
    '</div>' +
    '<div class="mt-4 pt-3 border-t border-stone-100 flex justify-end gap-2">' +
      '<button onclick="document.getElementById(\'bahan-kalkulator-modal\').remove()" class="px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-lg">Tutup</button>' +
      '<button onclick="applyBahanKalkulator(' + i + ')" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">Terapkan</button>' +
    '</div>' +
  '</div>';
  m.onclick = function() { m.remove(); };
  document.body.appendChild(m);
  (document.getElementById('bk-unit') || document.getElementById('bk-gram')).focus();
}

function bkGetFactor() {
  var el = document.getElementById('bk-factor');
  return Number(el && el.value) || 0;
}
// Kolom terakhir yang diedit user di modal — sumber kebenaran saat faktor berubah.
function bkLastInput() { return window._bkLastInput || ''; }
function bkSyncUnit() {
  var g = document.getElementById('bk-gram');
  var k = document.getElementById('bk-kg');
  var u = document.getElementById('bk-unit');
  if (!g || !k) return;
  var f = bkGetFactor() || Number(window._bkPerUnit) || 1;
  var v = Number(u && u.value) || 0;
  var gram = v * f;
  g.value = gram ? Math.round(gram * 100) / 100 : '';
  k.value = gram ? Math.round((gram / 1000) * 10000) / 10000 : '';
  window._bkLastInput = 'unit';
}
function bkSyncFactor() {
  // Faktor konversi diubah → hitung ulang dari kolom yang TERAKHIR diedit user
  // (unit, atau gram/kg). Ini mencegah kesalahan saat user mengetik gram dulu
  // lalu mengisi faktor: gram tetap jadi acuan, bukan ikut dikalikan faktor.
  if (bkLastInput() === 'unit') bkSyncUnit();
  else bkSyncGram();
}
function bkSyncGram() {
  var g = document.getElementById('bk-gram');
  var k = document.getElementById('bk-kg');
  var u = document.getElementById('bk-unit');
  if (!g || !k) return;
  var v = Number(g.value) || 0;
  k.value = v ? Math.round((v / 1000) * 10000) / 10000 : '';
  if (u) {
    var f = bkGetFactor();
    if (f > 0) {
      // Faktor sudah ada → konversi gram ke unit
      u.value = v ? Math.round((v / f) * 10000) / 10000 : '';
    } else {
      // Faktor belum diisi → unit TIDAK bisa dihitung; biarkan kosong agar
      // user tidak salah mengira angka palsu (unit=gram) sebagai hasil benar.
      u.value = '';
    }
  }
  window._bkLastInput = 'gram';
}
function bkSyncKg() {
  var g = document.getElementById('bk-gram');
  var k = document.getElementById('bk-kg');
  var u = document.getElementById('bk-unit');
  if (!g || !k) return;
  var v = Number(k.value) || 0;
  var gram = v * 1000;
  g.value = gram ? Math.round(gram * 100) / 100 : '';
  if (u) {
    var f = bkGetFactor();
    if (f > 0) {
      u.value = gram ? Math.round((gram / f) * 10000) / 10000 : '';
    } else {
      u.value = '';
    }
  }
  window._bkLastInput = 'kg';
}

// Baca komposisi kemasan dari modal: jumlah isi × volume per isi + berat jenis (g/L).
function bkCompData() {
  var c = document.getElementById('bk-comp-count');
  var s = document.getElementById('bk-comp-size');
  var u = document.getElementById('bk-comp-unit');
  var d = document.getElementById('bk-density');
  return {
    count: Number(c && c.value) || 0,
    size: Number(s && s.value) || 0,
    unit: (u && u.value) || 'L',
    density: Number(d && d.value) || 0
  };
}
// Volume total (liter) dari komposisi: jumlah × isi (ml → /1000).
function bkCompLiter(comp) {
  var sz = comp.size;
  if (comp.unit === 'ml') sz = sz / 1000;
  return comp.count * sz;
}
// Satuan isi default komposisi: item renceng/sachet (isi per kemasan berupa berat)
// langsung memakai gram — sesuai contoh Ladaku 1 renceng = 10 sachet × 8 g.
function bkCompUnitDefault(satuan) {
  // Hanya satuan isi-per-kemasan yang jelas berupa berat (renceng/sachet/bungkus)
  // yang default-nya gram; karton/dus/botol umumnya volume (L) — bisa diganti manual.
  return /renceng|sachet|bks|bungkus|paket|pack|packet/i.test(satuan || '') ? 'g' : 'L';
}
// Satuan isi berupa berat langsung (gram)? Mis. renceng Ladaku = 10 sachet × 8 g.
function bkCompIsGram(comp) {
  return String(comp.unit || '').toLowerCase() === 'g';
}
// Gram per satuan dari komposisi kemasan.
// - unit volume (L/ml): jumlah × isi × berat jenis (mis. 1 Karton = 12 × 1 L, BJ 917)
// - unit gram (g): jumlah × isi langsung — tanpa berat jenis (mis. 1 Renceng = 10 × 8 g = 80 g)
function bkCompGram(comp) {
  if (comp.count <= 0 || comp.size <= 0) return 0;
  if (bkCompIsGram(comp)) return Math.round(comp.count * comp.size * 100) / 100;
  if (comp.density <= 0) return 0;
  var liter = bkCompLiter(comp);
  return Math.round(liter * comp.density * 100) / 100;
}
// Komposisi kemasan diubah → hitung ulang faktor (g per satuan) dan sinkronkan
// kolom unit/gram/kg berdasar kolom yang terakhir diedit (sama seperti bkSyncFactor).
function bkSyncComp() {
  var f = document.getElementById('bk-factor');
  if (!f) return;
  var comp = bkCompData();
  var hint = document.getElementById('bk-comp-hint');
  var isGram = bkCompIsGram(comp);
  // Berat jenis hanya relevan untuk satuan volume (L/ml) — sembunyikan saat gram.
  var dw = document.getElementById('bk-density-wrap');
  if (dw) dw.classList.toggle('hidden', isGram);
  var gram = bkCompGram(comp);
  if (gram > 0) {
    f.value = gram;
    // Alur pre-filled: modal terbuka dengan kolom unit sudah terisi (mis. 5 Karton
    // dari baris) tapi user BELUM mengetik kolom mana pun → jadikan unit sebagai
    // acuan, sehingga jumlah karton tetap & gram menyesuaikan faktor baru (mis.
    // 1 Karton = 12 × 1 L → 5 karton = 60000 g). Bila user sudah mengedit gram/kg
    // terlebih dahulu, edit-nya tetap dihormati sebagai acuan.
    var u = document.getElementById('bk-unit');
    if (!bkLastInput() && u && Number(u.value) > 0) window._bkLastInput = 'unit';
    if (hint) {
      if (isGram) {
        // mis. 1 Renceng = 10 × 8 g → 80 g per Renceng
        hint.innerHTML = '≈ ' + comp.count + ' × ' + comp.size + ' g = <b>' + gram + ' g</b> per ' + escHtml(window._bkSatuan || 'satuan');
      } else {
        var liter = bkCompLiter(comp);
        hint.innerHTML = '≈ ' + comp.count + ' × ' + comp.size + ' ' + comp.unit + ' = <b>' + (Math.round(liter * 10000) / 10000) + ' L</b> → <b>' + gram + ' g</b> per ' + escHtml(window._bkSatuan || 'satuan');
      }
    }
    bkSyncFactor();
  } else if (hint) {
    hint.innerHTML = '';
  }
}

function applyBahanKalkulator(i) {
  var b = window._menuBahan[i];
  if (!b) return;
  var g = document.getElementById('bk-gram');
  var k = document.getElementById('bk-kg');
  var u = document.getElementById('bk-unit');
  var factor = bkGetFactor();
  var perUnit = factor || bahanKalkulatorInfo(b).perUnit || 1;
  var satuan = bahanKalkulatorSatuan(b);
  var isUnitSatuan = isSatuanUnit(satuan);
  var gram = 0;
  if (u && u.value && isUnitSatuan) {
    gram = (Number(u.value) || 0) * perUnit;
  } else if (g && g.value) {
    gram = Number(g.value) || 0;
  }
  if (gram <= 0 && k && k.value) gram = (Number(k.value) || 0) * 1000;
  if (gram <= 0) { showAlert('Isi nilai ' + (isUnitSatuan ? satuan : 'gram') + ' atau gram terlebih dahulu', 'warning'); return; }
  // Faktor kustom dari modal disimpan ke baris agar updateBahan/renderBahanList konsisten
  if (factor > 0) b.berat_per_satuan = factor;
  // Kembalikan ke satuan tampilan kolom jumlah (total untuk porsi), lalu serahkan ke updateBahan.
  // updateBahan memakai menuSatuanTampil (minyak = 'g'), jadi konversi ulang ke satuan itu.
  // Pakai faktor yang SAMA dengan arah maju (variabel perUnit) — jangan resolve ulang
  // via bahanKalkulatorInfo karena itu master-first dan akan mengabaikan override faktor
  // yang diketik user di modal (mis. master bps=12000, user ubah jadi 15000).
  var displaySatuan = menuSatuanTampil(b);
  var displayVal;
  if (isKgSatuan(displaySatuan)) displayVal = gram / perUnit;
  else if (isSatuanUnit(displaySatuan)) displayVal = gram / perUnit;
  else displayVal = gram;
  var m = document.getElementById('bahan-kalkulator-modal');
  if (m) m.remove();
  updateBahan(i, 'jumlah', Math.round(displayVal * 100) / 100);
}

function resetAllToSP() {
  (window._menuBahan || []).forEach(function(b, i) {
    resetBahanToSP(i);
  });
}
function resetBahanToSP(i) {
  var b = window._menuBahan[i];
  if (!b) return;
  var sp = window._spRefMap && window._spRefMap[b.nama];
  var defaultGram = (sp ? Number(sp.berat_bersih) : 0) || Number(b.berat_1_sp) || 0;
  if (!defaultGram) return;
  b.jumlah = defaultGram;
  delete b._autoJumlah;
  hitungNutrisi();
  renderBahanList();
}
function renderBahanList() {
  var porsi = Number(window._menuPorsi) || 0;
  document.getElementById('bahan-list').innerHTML = window._menuBahan.map((b, i) => {
    var displayNama = b.nama || '';
    var displaySatuan = menuSatuanTampil(b);
      var perUnit = bahanKalkulatorInfo(b).perUnit || 1;
      var displayJumlah = b.jumlah || 0;
      if (perUnit > 0 && isSatuanUnit(displaySatuan)) {
        displayJumlah = displayJumlah / perUnit;
      }
      var totalJumlah = porsi > 0 ? displayJumlah * porsi : 0;
      var inputStep = isKgSatuan(displaySatuan) ? '0.01' : (isSatuanUnit(displaySatuan) ? '1' : '0.01');
      var inputValue = porsi > 0 ? (totalJumlah ? Math.round(totalJumlah * 100) / 100 : '0') : (displayJumlah ? Math.round(displayJumlah * 100) / 100 : '0');
      var inputTitle = porsi > 0 ? 'Total untuk ' + porsi + ' porsi (' + displaySatuan + ')' : (displaySatuan === 'g' ? 'Gram per porsi' : 'Jumlah per porsi (' + displaySatuan + ')');
      var calcSatuan = bahanKalkulatorSatuan(b);
      var kalkTitle = isSatuanUnit(calcSatuan) ? 'Kalkulator ' + escHtml(calcSatuan) + ' ↔ Gram' : 'Kalkulator Gram ↔ Kg';
      return '<div class="mb-1.5">' +
        '<div class="grid grid-cols-12 gap-1.5 items-center">' +
          '<div class="col-span-4 relative">' +
            '<input id="b-input-' + i + '" autocomplete="off" value="' + displayNama + '" placeholder="Cari bahan..." oninput="onBahanSearch(' + i + ', this)" onfocus="onBahanSearch(' + i + ', this)" onblur="setTimeout(function(){closeBahanDropdown(' + i + ')},200)" class="w-full h-10 px-3 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />' +
            '<div id="b-drop-' + i + '" class="hidden absolute z-10 w-full mt-0.5 bg-white border border-stone-200 rounded-lg shadow-lg max-h-48 overflow-y-auto text-sm"></div>' +
          '</div>' +
          '<div class="col-span-3 flex">' +
            '<input type="number" step="' + inputStep + '" value="' + inputValue + '" onchange="updateBahan(' + i + ', \'jumlah\', this.value)" class="flex-1 min-w-0 h-10 px-3 border border-stone-200 rounded-l-lg text-sm mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" title="' + inputTitle + '" />' +
            '<span class="inline-flex items-center px-2.5 h-10 text-xs font-semibold bg-stone-100 text-stone-600 border border-l-0 border-stone-200 whitespace-nowrap">' + displaySatuan + '</span>' +
            '<button type="button" onclick="openBahanKalkulator(' + i + ')" class="shrink-0 inline-flex items-center justify-center w-8 h-10 text-blue-500 hover:bg-blue-50 border border-l-0 border-stone-200 rounded-r-lg transition-all" title="' + kalkTitle + '"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h.01M15 16h.01"/></svg></button>' +
          '</div>' +
          '<div class="col-span-4">' +
            '<input type="text" value="' + (b.keterangan || '') + '" onchange="updateBahan(' + i + ', \'keterangan\', this.value)" placeholder="catatan" class="w-full h-10 px-3 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />' +
          '</div>' +
          '<button type="button" onclick="removeBahanRow(' + i + ')" class="col-span-1 inline-flex items-center justify-center h-10 w-full text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Hapus bahan"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
        '</div>' +
      '</div>';
  }).join('');
}

function onPorsiChange() {
  window._menuPorsi = Number(document.getElementById('m-porsi').value) || 0;
  renderBahanList();
}
function onBahanSearch(i, el) {
  var val = el.value;
  var dropdown = document.getElementById('b-drop-' + i);
  if (!dropdown) return;
  // Cek exact match di sp_referensi_bahan (prioritas)
  if (window._spRefMap && window._spRefMap[val]) {
    selectBahan(i, val);
    dropdown.classList.add('hidden');
    return;
  }
  // Cek exact match di bahan_baku (fallback)
  var bbExact = (window._bahanBaku || []).find(function(b) { return b.nama && b.nama.toLowerCase() === val.toLowerCase().trim(); });
  if (bbExact) {
    selectBahan(i, val);
    dropdown.classList.add('hidden');
    return;
  }
  var q = val.toLowerCase().trim();
  if (!q) { dropdown.classList.add('hidden'); return; }
  // Gabungkan hasil dari sp_referensi_bahan dan bahan_baku
  var spMatches = (window._spRefList || []).filter(function(r) { return r.nama && r.nama.toLowerCase().includes(q); });
  var bbMatches = (window._bahanBaku || []).filter(function(b) { return b.nama && b.nama.toLowerCase().includes(q); });
  // Merge: prioritaskan sp_referensi, tambah bahan_baku yang belum tercakup
  var seen = new Set();
  var merged = [];
  for (var r of spMatches) {
    if (!seen.has(r.nama.toLowerCase())) {
      seen.add(r.nama.toLowerCase());
      var bbSat = (window._bahanBaku || []).find(function(bb) { return bb.nama && bb.nama.toLowerCase() === r.nama.toLowerCase(); });
      merged.push({ sumber: 'sp', nama: r.nama, kategori: r.kategori || '', berat: r.berat_bersih, satuan: menuSatuanTampil({ kategori_sp: (r.kategori || '').toLowerCase(), satuan: bbSat ? bbSat.satuan : 'g' }), berat_per_satuan: bbSat ? Number(bbSat.berat_per_satuan) : 0, nutrisi: (r.energi ? r.energi + ' kkal' : '') + (r.protein ? ' · P' + r.protein + 'g' : '') + (r.karbohidrat ? ' · KH' + r.karbohidrat + 'g' : '') });
    }
  }
  for (var b of bbMatches) {
    if (!seen.has(b.nama.toLowerCase())) {
      seen.add(b.nama.toLowerCase());
      merged.push({ sumber: 'bb', nama: b.nama, kategori: b.kategori_sp || '', berat: b.berat_1_sp, satuan: menuSatuanTampil(b), berat_per_satuan: Number(b.berat_per_satuan) || 0, nutrisi: (b.kalori ? b.kalori + ' kkal' : '') + (b.protein ? ' · P' + b.protein + 'g' : '') + (b.karbohidrat ? ' · KH' + b.karbohidrat + 'g' : '') });
    }
  }
  if (!merged.length) { dropdown.classList.add('hidden'); return; }
  dropdown.innerHTML = merged.map(function(item) {
    var badge = item.sumber === 'sp' ? '<span class="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded mr-1">SP</span>' : '<span class="text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded mr-1">Baku</span>';
    var satuanInfo = '';
    if (item.satuan && item.satuan.toLowerCase() !== 'g' && item.satuan.toLowerCase() !== 'gram') {
      satuanInfo = ' · Satuan: <span class="font-medium">' + item.satuan + '</span>';
    }
    return '<div onclick="selectBahan(' + i + ", '" + item.nama.replace(/'/g, "\\'") + "')\" class=\"px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-stone-100 last:border-0\">" +
      '<div class="font-medium text-stone-800">' + badge + ' ' + item.nama + '</div>' +
      '<div class="text-[10px] text-stone-400">' + (item.kategori || '') + (item.berat ? ' · 1SP=' + item.berat + 'g' : '') + satuanInfo + (item.nutrisi ? ' · ' + item.nutrisi : '') + '</div>' +
    '</div>';
  }).join('');
  dropdown.classList.remove('hidden');
}

function closeBahanDropdown(i) {
  var d = document.getElementById('b-drop-' + i);
  if (d) d.classList.add('hidden');
}

async function selectBahan(i, nama) {
  var ref = window._spRefMap && window._spRefMap[nama];
  var bb = (window._bahanBaku || []).find(function(b) { return b.nama.toLowerCase() === nama.toLowerCase(); });
  
  if (ref) {
    // DATA DARI SP REFERENSI
    var spItem = (window._spRefList || []).find(function(r) { return r.nama === nama; });
    var kat = spItem ? spItem.kategori : (bb ? bb.kategori_sp : '');
    var berat1Sp = ref.berat_bersih;
    var perPorsi = berat1Sp;
    
    if (!bb) {
      // Auto-create bahan_baku jika belum ada di master
      try {
        var created = await api.post('/bahan_baku', {
          nama: nama,
          satuan: 'g',
          kategori_sp: kat || '',
          berat_1_sp: berat1Sp,
          persen_bdd: Math.round(ref.bdd_persen * 100),
          berat_per_satuan: berat1Sp,
          kalori: ref.energi || 0,
          protein: ref.protein || 0,
          karbohidrat: ref.karbohidrat || 0,
          lemak: ref.lemak || 0,
          serat: ref.serat || 0,
        });
        window._bahanBaku.push(created);
        bb = created;
      } catch (e) {
        console.warn('Gagal auto-create bahan_baku:', e.message);
      }
    }
    
    window._menuBahan[i].bahan_baku_id = bb ? bb.id : '';
    window._menuBahan[i].nama = nama;
    window._menuBahan[i].berat_per_satuan = Number(bb ? bb.berat_per_satuan : 0) || berat1Sp;
    window._menuBahan[i].satuan = menuSatuanTampil({ kategori_sp: kat, satuan: bb ? (bb.satuan || 'g') : 'g' });
    window._menuBahan[i].kategori_sp = kat;
    window._menuBahan[i].berat_1_sp = berat1Sp;
    window._menuBahan[i].persen_bdd = Math.round(ref.bdd_persen * 100);
    window._menuBahan[i].kalori = ref.energi || 0;
    window._menuBahan[i].protein = ref.protein || 0;
    window._menuBahan[i].karbohidrat = ref.karbohidrat || 0;
    window._menuBahan[i].lemak = ref.lemak || 0;
    window._menuBahan[i].serat = ref.serat || 0;
    window._menuBahan[i].jumlah = perPorsi;
    window._menuBahan[i]._autoJumlah = perPorsi;
  } else if (bb) {
    // FALLBACK: DATA DARI BAHAN BAKU (tanpa SP reference)
    var kat = bb.kategori_sp || '';
    var berat1Sp = Number(bb.berat_1_sp || 0);
    var perPorsi = berat1Sp; // Default: 1 SP = berat_1_sp gram
    
    window._menuBahan[i].bahan_baku_id = bb.id || '';
    window._menuBahan[i].nama = nama;
    window._menuBahan[i].berat_per_satuan = Number(bb.berat_per_satuan) || 0;
    window._menuBahan[i].satuan = menuSatuanTampil({ kategori_sp: kat, satuan: bb.satuan || 'g' });
    window._menuBahan[i].kategori_sp = kat;
    window._menuBahan[i].berat_1_sp = berat1Sp;
    window._menuBahan[i].persen_bdd = Number(bb.persen_bdd || 100);
    window._menuBahan[i].kalori = Number(bb.kalori || 0);
    window._menuBahan[i].protein = Number(bb.protein || 0);
    window._menuBahan[i].karbohidrat = Number(bb.karbohidrat || 0);
    window._menuBahan[i].lemak = Number(bb.lemak || 0);
    window._menuBahan[i].serat = Number(bb.serat || 0);
    window._menuBahan[i].jumlah = perPorsi;
    window._menuBahan[i]._autoJumlah = perPorsi;
  } else {
    // Tidak ditemukan di sp_referensi maupun bahan_baku
    console.warn('Bahan tidak ditemukan:', nama);
    return;
  }
  
  var input = document.getElementById('b-input-' + i);
  if (input) input.value = nama;
  renderBahanList();
  hitungNutrisi();
}

async function deleteMenu(id) { if (!await showConfirm('Hapus menu?')) return; await api.del('/menu/' + id); renderMenu(); }

function toggleSelectAllMenu(master) {
  document.querySelectorAll('.menu-checkbox').forEach(cb => cb.checked = master.checked);
  updateSelectedMenuCount();
}
function updateSelectedMenuCount() {
  var checked = document.querySelectorAll('.menu-checkbox:checked').length;
  var btn = document.getElementById('menu-delete-selected');
  var countEl = document.getElementById('menu-selected-count');
  if (!btn || !countEl) return;
  if (checked > 0) {
    btn.classList.remove('hidden');
    btn.classList.add('inline-flex');
    countEl.textContent = checked;
  } else {
    btn.classList.add('hidden');
    btn.classList.remove('inline-flex');
  }
}
async function deleteSelectedMenu() {
  var checked = document.querySelectorAll('.menu-checkbox:checked');
  var ids = Array.from(checked).map(cb => parseInt(cb.value)).filter(id => !isNaN(id));
  if (!ids.length) return showAlert('Pilih menu yang akan dihapus', 'warning');
  if (!await showConfirm('Hapus ' + ids.length + ' menu terpilih?')) return;
  try {
    await api.post('/menu/bulk-delete', { ids });
    showToast(ids.length + ' menu berhasil dihapus', 'success');
    renderMenu();
  } catch (e) {
    showToast('Gagal menghapus: ' + (e.message || 'Unknown error'), 'error');
  }
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function closeSiklusMenuPicker() {
  var m = document.getElementById('siklus-menu-picker');
  if (m) m.remove();
}

async function openSiklusMenuPicker() {
  try {
    var data = await api.get('/siklus/recipe-names');
    var hasNames = data.some(function(s) { return s.names && s.names.length; });
    if (!data.length || !hasNames) {
      showAlert('Belum ada siklus dengan nama menu atau resep. Buat siklus terlebih dahulu.', 'warning');
      return;
    }

    var html = '<div class="p-4 space-y-3 max-h-[420px] overflow-y-auto">';
    for (var si = 0; si < data.length; si++) {
      var s = data[si];
      if (!s.names || !s.names.length) continue;
      var statusColor = s.status === 'Aktif' ? 'bg-emerald-100 text-emerald-800' : s.status === 'Draft' ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600';
      html += '<div class="border border-stone-200 rounded-xl overflow-hidden">' +
        '<div class="px-4 py-2.5 bg-stone-50 border-b border-stone-200 flex items-center justify-between">' +
        '<div class="font-semibold text-sm text-stone-700">' + escHtml(s.nama) + '</div>' +
            '<div class="flex items-center gap-2">' +
            (s.jumlah_porsi ? '<span class="text-[10px] text-stone-400">' + s.jumlah_porsi + ' porsi</span>' : '') +
            '<span class="text-[10px] px-2 py-0.5 rounded-full font-medium ' + statusColor + ' capitalize">' + s.status + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="divide-y divide-stone-100">';
      for (var ni = 0; ni < s.names.length; ni++) {
        var n = s.names[ni];
        if (n.source === 'menu') {
          // Menu items — clickable, untuk import bahan
          var bahanJson = escHtml(JSON.stringify(n.bahan || []));
          var katPenerima = escHtml(s.kategori_penerima || '');
    html += '<button type="button" onclick="selectSiklusMenuName(\'' + escHtml(n.nama) + "', '" + bahanJson + "', " + (Number(s.jumlah_porsi) || 0) + ", '" + katPenerima + "')\" class=\"w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors\">" +
            '<div class="flex items-center gap-2">' +
            '<span class="text-xs text-stone-400 shrink-0 w-8">H' + n.hari_ke + '</span>' +
            '<span class="text-xs text-stone-500 shrink-0 w-14">' + n.hari_nama + '</span>' +
            '<span class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700 shrink-0">Menu</span>' +
            '<span class="text-sm font-medium text-stone-800 truncate">' + escHtml(n.nama) + '</span>' +
            (n.bahan && n.bahan.length ? '<span class="text-[10px] text-stone-400 shrink-0">' + n.bahan.length + ' bahan</span>' : '') +
            '<svg class="w-4 h-4 text-stone-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>' +
            '</div>' +
          '</button>';
        } else {
          // Resep items — non-clickable, info saja
          html += '<div class="px-4 py-2">' +
            '<div class="flex items-center gap-2 text-stone-500">' +
            '<span class="text-xs shrink-0 w-8">H' + n.hari_ke + '</span>' +
            '<span class="text-xs shrink-0 w-14">' + n.hari_nama + '</span>' +
            '<span class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-stone-100 text-stone-500 shrink-0">Resep</span>' +
            '<span class="text-sm font-medium text-stone-500 truncate">' + escHtml(n.nama) + '</span>' +
            (n.kategori_sp ? '<span class="text-[10px] text-stone-400 shrink-0 hidden sm:inline">(' + escHtml(n.kategori_sp) + ')</span>' : '') +
            (n.bahan && n.bahan.length ? '<span class="text-[10px] text-stone-400 shrink-0">· ' + escHtml(n.bahan[0].nama) + '</span>' : '') +
            '</div>' +
          '</div>';
        }
      }
      html += '</div></div>';
    }
    html += '</div>';

    // Create floating modal on top of main modal
    var existing = document.getElementById('siklus-menu-picker');
    if (existing) existing.remove();
    var m = document.createElement('div');
    m.id = 'siklus-menu-picker';
    m.className = 'fixed inset-0 z-[60] flex items-center justify-center bg-black/40';
    m.innerHTML = '<div class="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-hidden">' +
      '<div class="flex items-center justify-between px-5 py-3 border-b border-stone-200">' +
        '<h3 class="font-bold text-stone-700 text-sm">Pilih Nama dari Siklus Menu</h3>' +
        '<button onclick="closeSiklusMenuPicker()" class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-stone-100 text-stone-400">&times;</button>' +
      '</div>' +
      '<div id="sk-picker-body">' + html + '</div>' +
    '</div>';
    document.body.appendChild(m);
    m.addEventListener('click', function(e) { if (e.target === m) closeSiklusMenuPicker(); });
  } catch (e) {
    showAlert('Gagal memuat data siklus: ' + e.message, 'error');
  }
}
async function selectSiklusMenuName(nama, bahanJson, siklusPorsi, kategoriPenerima) {
  document.getElementById('m-nama').value = nama;    // Auto-fill kategori_penerima dari siklus
    if (kategoriPenerima) {
      // Parse jika JSON array (siklus bisa multiple jenjang), simpan array lengkap
      // agar kategoriBadge() bisa menampilkan count seperti "TK/PAUD 3+"
      try { var parsed = JSON.parse(kategoriPenerima); if (Array.isArray(parsed)) kategoriPenerima = JSON.stringify(parsed); } catch(e) {}
      window._menuKategoriPenerima = kategoriPenerima;
      // Tampilkan indikator kategori yang terisi dari siklus
      var badgeContainer = document.getElementById('m-kategori-badge');
      if (!badgeContainer) {
        badgeContainer = document.createElement('div');
        badgeContainer.id = 'm-kategori-badge';
        badgeContainer.className = 'text-xs mt-1';
        // Tampilkan di bawah baris input (bukan di samping tombol Siklus)
        document.getElementById('m-nama').parentNode.insertAdjacentElement('afterend', badgeContainer);
      }
      badgeContainer.innerHTML = '<span class="inline-flex items-center gap-1 text-xs font-medium text-stone-600">' + kategoriBadge(kategoriPenerima) + '</span>';
    }
  
  // Auto-fill jumlah porsi jika > 0
  if (siklusPorsi > 0) {
    document.getElementById('m-porsi').value = siklusPorsi;
    window._menuPorsi = siklusPorsi;
  }
  
  // Load bahan dari siklus
  var bahan = [];
  try { bahan = JSON.parse(bahanJson || '[]'); } catch(e) { bahan = []; }
  
  // Konfirmasi jika sudah ada bahan di form
  if (bahan.length && window._menuBahan.some(function(b) { return b.nama; })) {
    if (!await showConfirm('Akan mengganti ' + window._menuBahan.filter(function(b){return b.nama;}).length + ' bahan yang sudah ada dengan ' + bahan.length + ' bahan dari siklus. Lanjutkan?', 'Lanjutkan')) {
      return;
    }
  }
  
  if (bahan.length) {
    window._menuBahan = [];
    for (var i = 0; i < bahan.length; i++) {
      if (!bahan[i].nama) continue;
      window._menuBahan.push({ bahan_baku_id: '', jumlah: 0, satuan: 'g', nama: '', keterangan: '' });
      await selectBahan(window._menuBahan.length - 1, bahan[i].nama);
    }
    showToast('Nama & ' + bahan.length + ' bahan diambil dari siklus', 'success');
  } else {
    showToast('Nama diambil dari siklus: ' + nama, 'success');
  }
  
  renderBahanList();
  closeSiklusMenuPicker();
}

function showMenuInfo() {
  var existing = document.getElementById('menu-info-popup');
  if (existing) { existing.remove(); return; }
  var div = document.createElement('div');
  div.id = 'menu-info-popup';
  div.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-black/30';
  div.innerHTML = '<div class="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6" onclick="event.stopPropagation()">' +
    '<div class="flex items-center justify-between mb-4">' +
      '<h3 class="font-bold text-stone-700">Form Menu</h3>' +
      '<button onclick="document.getElementById(\'menu-info-popup\').remove()" class="text-stone-400 hover:text-stone-600"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
    '</div>' +
    '<div class="space-y-4 text-sm text-stone-600">' +
      '<div class="flex gap-3 items-start">' +
        '<span class="shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>' +
        '<div><span class="font-semibold text-stone-700">Buat Resep</span><br>Tulis nama menu, deskripsi, dan tambahkan bahan-bahan. Jumlah gramasi per porsi auto terisi dari <strong>SP Referensi</strong> (berat_bersih).</div>' +
      '</div>' +
      '<div class="flex gap-3 items-start">' +
        '<span class="shrink-0 w-7 h-7 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></span>' +
        '<div><span class="font-semibold text-stone-700">Gramasi 0?</span><br>Kolom Gramasi menunjukkan 0 jika menu belum punya bahan atau jumlah bahan belum diisi. <strong>Cara set default:</strong> buka <strong>SP Referensi</strong> → isi Berat Bersih (gram) → saat tambah bahan di form menu, jumlah auto terisi dari nilai tersebut. Bisa juga klik <strong>↺ Reset Semua ke SP</strong> untuk mengembalikan ke default.</div>' +
      '</div>' +
      '<div class="flex gap-3 items-start">' +
        '<span class="shrink-0 w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>' +
        '<div><span class="font-semibold text-stone-700">Gunakan di Siklus</span><br>Menu yang sudah dibuat bisa dipilih di modul <strong>Siklus</strong> → pilih menu per hari.</div>' +
      '</div>' +
      '<div class="flex gap-3 items-start">' +
        '<span class="shrink-0 w-7 h-7 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>' +
        '<div><span class="font-semibold text-stone-700">Lihat Kebutuhan</span><br>Buka <strong>Perencanaan</strong> atau <strong>Total Kebutuhan</strong> untuk melihat total bahan yang harus dibeli.</div>' +
      '</div>' +
      '<div class="flex gap-3 items-start">' +
        '<span class="shrink-0 w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></span>' +
        '<div><span class="font-semibold text-stone-700">Buat Pesanan</span><br>Dari Total Kebutuhan, klik <strong>Buat Draft PR</strong> untuk membuat Purchase Request ke pemasok.</div>' +
      '</div>' +
    '</div>' +
    '<div class="mt-4 pt-3 border-t border-stone-100 text-xs text-stone-400 text-center">' +
      '<svg class="w-3.5 h-3.5 inline -mt-0.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg> Bisa juga ambil resep dari siklus yang sudah ada dengan tombol <strong>Siklus</strong>' +
    '</div>' +
  '</div>';
  div.onclick = function() { div.remove(); };
  document.body.appendChild(div);
}

// Save current menu for PO creation
function saveCurrentMenuForPO(data) {
  window._currentMenu = data;
}

// Save menu data from the form (editing/adding) to _currentMenu
function saveCurrentMenuFromForm() {
  var editingData = window._editingMenuData;
  if (!editingData || !editingData.id) {
    showAlert('Simpan menu terlebih dahulu sebelum membuat PO.', 'warning');
    return;
  }
  var nama = document.getElementById('m-nama').value || editingData.nama || '';
  var bahan = (window._menuBahan || []).filter(function(b) { return b.nama; }).map(function(b) {
    return {
      bahan_baku_id: b.bahan_baku_id,
      nama: b.nama,
      jumlah: b.jumlah,
      satuan: b.satuan || 'g',
      keterangan: b.keterangan || ''
    };
  });
  window._currentMenu = {
    id: editingData.id,
    nama: nama,
    kategori_penerima: editingData.kategori_penerima || null,
    gramasi_total: editingData.gramasi_total || 0,
    kalori: editingData.kalori || 0,
    protein: editingData.protein || 0,
    karbohidrat: editingData.karbohidrat || 0,
    lemak: editingData.lemak || 0,
    serat: editingData.serat || 0,
    jumlah_porsi: Number(document.getElementById('m-porsi').value) || 0,
    bahan: bahan,
    status: editingData.status || ''
  };
}

async function openMenuPoModal() {
  const currentMenu = window._currentMenu || {};
  if (!currentMenu.id) {
    showAlert('Tidak ada menu yang dipilih. Simpan menu terlebih dahulu.');
    return;
  }
  
  var shortName = currentMenu.nama && currentMenu.nama.length > 50 ? currentMenu.nama.slice(0, 47) + '...' : currentMenu.nama;
  document.getElementById('modal-title').innerHTML = 'Buat PO <span class="text-stone-400 font-normal">dari Menu</span>';
  document.getElementById('modal-save').style.display = 'block';
  document.getElementById('modal-save').textContent = 'Buat PO';
  document.getElementById('modal-save').onclick = function() { createPoFromMenu(currentMenu.id); };
  document.getElementById('modal-body').innerHTML = `
    <div class="flex items-start gap-2.5 p-3 mb-4 bg-stone-50 border border-stone-200 rounded-xl">
      <svg class="w-4 h-4 mt-0.5 shrink-0 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>
      <div class="text-xs text-stone-600 leading-relaxed">
        <span class="font-semibold text-stone-700 block truncate" title="${escHtml(currentMenu.nama || '')}">${escHtml(shortName || '')}</span>
        <span>Buat Purchase Order dari seluruh bahan menu ini.</span>
      </div>
    </div>
    <div><label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Supplier *</label>
      <select id="po-supplier" class="w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
        <option value="">Pilih Supplier...</option>
      </select></div>
    <div class="mt-3"><label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Catatan (opsional)</label>
      <textarea id="po-notes" rows="2" class="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" placeholder="Catatan untuk supplier..."></textarea></div>
    <div id="menu-po-preview" class="mt-4 text-xs text-stone-500"></div>
  `;
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
  
  // Load supplier list
  api.get('/supplier').then(function(res) {
    const select = document.getElementById('po-supplier');
    const suppliers = Array.isArray(res) ? res : (res.data || []);
    suppliers.forEach(function(s) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.nama;
      select.appendChild(opt);
    });
  }).catch(function() {
    document.getElementById('po-supplier').innerHTML = '<option value="">Gagal memuat supplier</option>';
  });
}

async function createPoFromMenu(menuId) {
  const supplierId = document.getElementById('po-supplier').value;
  const notes = document.getElementById('po-notes').value;
  
  if (!supplierId) {
    showAlert('Pilih supplier terlebih dahulu');
    return;
  }
  
  const currentMenu = window._currentMenu;
  if (!currentMenu) {
    showAlert('Tidak ada menu yang dipilih');
    return;
  }
  
  const poItems = [];
  let totalRp = 0;
  
  // Process the menu's bahan into PO items
  if (Array.isArray(currentMenu.bahan)) {
    for (const b of currentMenu.bahan) {
      if (!b.nama) continue;
      
      // Get stock data for unit price estimation
      try {
        let unitPrice = b.harga_beli || b.harga_satuan || 0;
        if (!unitPrice) {
          // Try to get from bahan_baku endpoint
          const bahanRes = await api.get('/bahan_baku');
          const bahanList = Array.isArray(bahanRes) ? bahanRes : (bahanRes.data || []);
          const bahanItem = bahanList.find(function(fb) { return fb.id === b.bahan_baku_id || fb.nama === b.nama; });
          if (bahanItem) {
            unitPrice = bahanItem.harga_satuan || 0;
          }
        }
        
        if (unitPrice > 0) {
          const subtotal = unitPrice * b.jumlah;
          totalRp += subtotal;
          
          poItems.push({
            bahan_baku_id: b.bahan_baku_id,
            nama: b.nama,
            qty: b.jumlah,
            satuan: b.satuan || 'g',
            harga_beli_unit: unitPrice,
            subtotal: subtotal
          });
        }
      } catch (e) {
        console.error('Error processing menu bahan:', e);
      }
    }
  }
  
  if (poItems.length === 0) {
    showAlert('Tidak ada bahan dengan harga dari menu ini');
    return;
  }
  
  try {
    showToast('Membuat PO dari menu...', 'info');
    
    const poRes = await api.post('/purchase_order', {
      no_po: 'PO-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Date.now().toString().slice(-4),
      tanggal: new Date().toISOString().slice(0, 10),
      supplier_id: supplierId,
      total_nilai: totalRp,
      status: 'Draft',
      item: JSON.stringify(poItems),
      catatan: notes || `PO otomatis dari menu: ${currentMenu.nama}`
    });
    
    showAlert('✅ PO berhasil dibuat: ' + poRes.no_po, 'success');
    closeModal();
    
    // Refresh purchase order list
    const pemBelianModule = MODULES['pembelian'];
    if (pemBelianModule && pemBelianModule.render) {
      pemBelianModule.render();
    }
    
  } catch (e) {
    console.error('Error creating PO from menu:', e);
    showAlert('❌ Gagal membuat PO: ' + (e.message || 'Unknown error'), 'error');
  }
}

function openAIDialog() {
  const currentMenu = window._currentMenu || {};
  if (!currentMenu.id) {
    showAlert('Tidak ada menu yang dipilih. Simpan menu terlebih dahulu.');
    return;
  }
  
  var shortName = currentMenu.nama && currentMenu.nama.length > 50 ? currentMenu.nama.slice(0, 47) + '...' : currentMenu.nama;
  document.getElementById('modal-title').innerHTML = 'Buat PO <span class="text-stone-400 font-normal">dari Menu</span>';
  document.getElementById('modal-save').style.display = 'block';
  document.getElementById('modal-save').textContent = 'Buat PO';
  document.getElementById('modal-save').onclick = function() { createPoFromMenu(currentMenu.id); };
  document.getElementById('modal-body').innerHTML = `
    <div class="flex items-start gap-2.5 p-3 mb-4 bg-stone-50 border border-stone-200 rounded-xl">
      <svg class="w-4 h-4 mt-0.5 shrink-0 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>
      <div class="text-xs text-stone-600 leading-relaxed">
        <span class="font-semibold text-stone-700 block truncate" title="${escHtml(currentMenu.nama || '')}">${escHtml(shortName || '')}</span>
        <span>Buat Purchase Order dari seluruh bahan menu ini.</span>
      </div>
    </div>
    <div><label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Supplier *</label>
      <select id="po-supplier" class="w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
        <option value="">Pilih Supplier...</option>
      </select></div>
    <div class="mt-3"><label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Catatan (opsional)</label>
      <textarea id="po-notes" rows="2" class="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" placeholder="Catatan untuk supplier..."></textarea></div>
    <div id="menu-po-preview" class="mt-4 text-xs text-stone-500"></div>
  `;
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
  
  // Load supplier list
  api.get('/supplier').then(function(res) {
    const select = document.getElementById('po-supplier');
    const suppliers = Array.isArray(res) ? res : (res.data || []);
    suppliers.forEach(function(s) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.nama;
      select.appendChild(opt);
    });
  }).catch(function() {
    document.getElementById('po-supplier').innerHTML = '<option value="">Gagal memuat supplier</option>';
  });
}

async function createPoFromMenu(menuId) {
  const supplierId = document.getElementById('po-supplier').value;
  const notes = document.getElementById('po-notes').value;
  
  if (!supplierId) {
    showAlert('Pilih supplier terlebih dahulu');
    return;
  }
  
  const currentMenu = window._currentMenu;
  if (!currentMenu) {
    showAlert('Tidak ada menu yang dipilih');
    return;
  }
  
  const poItems = [];
  let totalRp = 0;
  
  // Process the menu's bahan into PO items
  if (Array.isArray(currentMenu.bahan)) {
    for (const b of currentMenu.bahan) {
      if (!b.nama) continue;
      
      // Get stock data for unit price estimation
      try {
        let unitPrice = b.harga_beli || b.harga_satuan || 0;
        if (!unitPrice) {
          // Try to get from bahan_baku endpoint
          const bahanRes = await api.get('/bahan_baku');
          const bahanList = Array.isArray(bahanRes) ? bahanRes : (bahanRes.data || []);
          const bahanItem = bahanList.find(function(fb) { return fb.id === b.bahan_baku_id || fb.nama === b.nama; });
          if (bahanItem) {
            unitPrice = bahanItem.harga_satuan || 0;
          }
        }
        
        if (unitPrice > 0) {
          const subtotal = unitPrice * b.jumlah;
          totalRp += subtotal;
          
          poItems.push({
            bahan_baku_id: b.bahan_baku_id,
            nama: b.nama,
            qty: b.jumlah,
            satuan: b.satuan || 'g',
            harga_beli_unit: unitPrice,
            subtotal: subtotal
          });
        }
      } catch (e) {
        console.error('Error processing menu bahan:', e);
      }
    }
  }
  
  if (poItems.length === 0) {
    showAlert('Tidak ada bahan dengan harga dari menu ini');
    return;
  }
  
  try {
    showToast('Membuat PO dari menu...', 'info');
    
    const poRes = await api.post('/purchase_order', {
      no_po: 'PO-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Date.now().toString().slice(-4),
      tanggal: new Date().toISOString().slice(0, 10),
      supplier_id: supplierId,
      total_nilai: totalRp,
      status: 'Draft',
      item: JSON.stringify(poItems),
      catatan: notes || `PO otomatis dari menu: ${currentMenu.nama}`
    });
    
    showAlert('✅ PO berhasil dibuat: ' + poRes.no_po, 'success');
    closeModal();
    
    // Refresh purchase order list
    const pemBelianModule = MODULES['pembelian'];
    if (pemBelianModule && pemBelianModule.render) {
      pemBelianModule.render();
    }
    
  } catch (e) {
    console.error('Error creating PO from menu:', e);
    showAlert('❌ Gagal membuat PO: ' + (e.message || 'Unknown error'), 'error');
  }
}

function openAIDialog() {
  document.getElementById('modal-title').textContent = '✨ Saran Menu AI';
  document.getElementById('modal-body').innerHTML = `
    <div><label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Kategori Penerima</label>
      <select id="ai-kat" class="w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
        ${['TK/PAUD','SD 1-3','SD 4-6','SMP','SMA','Ibu Hamil','Ibu Menyusui','Balita','Posyandu'].map(o => `<option>${o}</option>`).join('')}
      </select></div>
    <div class="mt-3"><label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">Catatan (opsional)</label>
      <textarea id="ai-note" rows="2" class="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" placeholder="Mis. hindari kacang, bahan lokal Jawa Tengah"></textarea></div>
    <div id="ai-out" class="mt-4"></div>`;
  document.getElementById('modal-save').style.display = 'none';
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}
async function runAI() {
  document.getElementById('ai-out').innerHTML = '<div class="text-stone-500 text-sm">⏳ Membuat saran...</div>';
  const r = await fetch('/api/ai/suggest-menu', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ kategori: document.getElementById('ai-kat').value, catatan: document.getElementById('ai-note').value }) });
  const data = await r.json();
  if (!r.ok) { document.getElementById('ai-out').innerHTML = `<div class="text-red-700 text-sm">${data.error}</div>`; return; }
  const s = data.suggestion;
  document.getElementById('ai-out').innerHTML = `
    <div class="bg-orange-50 border border-orange-200 rounded p-3">
      <div class="font-bold">${s.nama_menu}</div>
      <div class="text-sm text-stone-700 mt-1">${s.deskripsi || ''}</div>
      ${s.kandungan_gizi ? `<div class="grid grid-cols-5 gap-2 my-2 text-xs">${Object.entries(s.kandungan_gizi).map(([k,v]) => `<div class="bg-white p-2 rounded"><div class="text-stone-500 uppercase">${k}</div><div class="mono">${v}</div></div>`).join('')}</div>` : ''}
      ${s.bahan ? `<div class="text-xs mt-2"><div class="font-semibold mb-1">Bahan:</div><ul class="space-y-0.5">${s.bahan.map(b => `<li>• ${b.nama} — <span class="mono">${b.jumlah} ${b.satuan}</span></li>`).join('')}</ul></div>` : ''}
    </div>`;
}

