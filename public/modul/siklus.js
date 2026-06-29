// ===== Siklus Menu =====
const HARI_OPTIONS = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];

async function renderSiklus() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="animate-pulse space-y-3 p-4 sm:p-6"><div class="h-8 bg-stone-200 rounded w-1/3"></div><div class="h-4 bg-stone-100 rounded w-full"></div><div class="h-4 bg-stone-100 rounded w-5/6"></div><div class="h-4 bg-stone-100 rounded w-4/5"></div><div class="h-4 bg-stone-100 rounded w-3/4"></div><div class="h-4 bg-stone-100 rounded w-11/12"></div><div class="h-4 bg-stone-100 rounded w-2/3"></div></div>';
  try {
    await preloadMenus();
    const r = await fetch('/api/template/siklus', { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Gagal memuat siklus');
    }
    c.innerHTML = await r.text();

    // Attach search & filter handlers
    const searchInput = document.getElementById('siklus-search');
    const filterSelect = document.getElementById('siklus-filter-status');
    const debounceTimer = { id: null };
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        clearTimeout(debounceTimer.id);
        debounceTimer.id = setTimeout(() => reloadSiklusList(), 300);
      });
    }
    if (filterSelect) {
      filterSelect.addEventListener('change', () => reloadSiklusList());
    }

    reloadSiklusList();
  } catch (err) {
    console.error('Siklus error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat siklus: ${err.message}</div>`;
  }
}

async function reloadSiklusList() {
  let list = await api.get('/siklus');
  const wrap = document.getElementById('siklus-list');
  if (!wrap) return;

  // Filter by search
  const searchVal = (document.getElementById('siklus-search')?.value || '').toLowerCase();
  const filterStatus = document.getElementById('siklus-filter-status')?.value || '';

  if (searchVal) {
    list = list.filter(s =>
      (s.nama || '').toLowerCase().includes(searchVal) ||
      (s.kategori_penerima || '').toLowerCase().includes(searchVal) ||
      (s.catatan || '').toLowerCase().includes(searchVal)
    );
  }
  if (filterStatus) {
    list = list.filter(s => s.status === filterStatus);
  }

  // Update stats
  const statsEl = document.getElementById('siklus-stats');
  if (statsEl) {
    const total = list.length;
    const aktif = list.filter(s => s.status === 'Aktif').length;
    const draft = list.filter(s => s.status === 'Draft').length;
    const menuSet = new Set();
    list.forEach(s => s.items && s.items.forEach(it => { if (it.menu_id) menuSet.add(it.menu_id); }));
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-aktif').textContent = aktif;
    document.getElementById('stat-draft').textContent = draft;
    document.getElementById('stat-menu').textContent = menuSet.size || 0;
    statsEl.classList.remove('hidden');
  }

  if (!list.length) {
    wrap.innerHTML = '<div class="col-span-full text-center py-16 text-stone-400"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg><div>Belum ada siklus menu</div></div>';
    return;
  }

  wrap.innerHTML = list.map(s => {
    const statusColor = s.status === 'Aktif' ? 'bg-emerald-100 text-emerald-800' : s.status === 'Draft' ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600';
    const menuCount = (s.items || []).filter(it => it.menu_id).length;
    return `<div class="bg-white border border-stone-200 rounded-xl p-5 hover:shadow-lg hover:border-stone-300 transition-all duration-200 cursor-pointer group" onclick="loadSiklusDetail(${s.id})">
      <div class="flex justify-between items-start mb-3">
        <div class="font-semibold text-sm text-stone-800 group-hover:text-[#1e40af] transition-colors">${s.nama}</div>
        <span class="text-[10px] px-2.5 py-1 rounded-full font-medium ${statusColor} capitalize">${s.status}</span>
      </div>
      <div class="flex items-center gap-4 text-xs text-stone-500 mb-3">
        <span class="flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>${s.kategori_penerima || 'Semua'}</span>
        <span class="flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>${s.jumlah_porsi} porsi/hari</span>
        <span class="flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${s.total_hari} hari</span>
      </div>
      ${s.catatan ? `<div class="text-xs text-stone-400 italic mb-3 line-clamp-1">${s.catatan}</div>` : ''}
      <div class="flex items-center justify-between pt-3 border-t border-stone-100">
        <div class="text-xs text-stone-400">${menuCount} menu terisi</div>
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onclick="event.stopPropagation();loadSiklusDetail(${s.id})" class="px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">Detail</button>
          <button onclick="event.stopPropagation();renderSiklusLaporan(${s.id})" class="px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">Laporan</button>
          <button onclick="event.stopPropagation();editSiklus(${s.id})" class="px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-lg transition-colors">Edit</button>
          <button onclick="event.stopPropagation();deleteSiklus(${s.id})" class="px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">Hapus</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function loadSiklusDetail(id) {
  const data = await api.get('/siklus/' + id);
  const wrap = document.getElementById('siklus-detail');
  wrap.innerHTML = `
    <div class="bg-white border border-stone-200 rounded-lg p-5">
      <div class="flex justify-between items-center mb-4">
        <div>
          <h3 class="font-bold text-lg">${data.nama}</h3>
          <div class="text-xs text-stone-500 mt-1">Kategori: <b>${data.kategori_penerima || '-'}</b> • Porsi/hari: <b>${fmtNum(data.jumlah_porsi)}</b> • Status: <b class="capitalize">${data.status}</b></div>
          ${data.catatan ? `<div class="text-xs text-stone-400 mt-1">${data.catatan}</div>` : ''}
        </div>
        <div class="flex flex-wrap gap-2">
          <button onclick="renderSiklusLaporan(${data.id})" class="px-3 py-1.5 text-sm border border-stone-300 rounded hover:bg-stone-50"><svg class="w-4 h-4 -mt-0.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> Laporan</button>
          <button onclick="editSiklus(${data.id})" class="px-3 py-1.5 text-sm border border-stone-300 rounded hover:bg-stone-50">Edit Siklus</button>
          <button onclick="document.getElementById('siklus-detail').innerHTML=''" class="px-3 py-1.5 text-sm text-stone-500 hover:text-stone-900">Tutup</button>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        ${data.items.map(it => {
          const totalK = Number(it.kalori || 0) + Number(it.protein || 0) + Number(it.karbohidrat || 0) + Number(it.lemak || 0) + Number(it.serat || 0);
          return `<div class="border border-stone-200 rounded-lg p-4">
            <div class="text-xs font-semibold uppercase text-stone-500 mb-2">Hari ${it.hari_ke} — ${it.hari_nama}</div>
            <div class="font-bold text-sm mb-1">${it.menu_nama || '<span class="text-stone-400">Belum diisi</span>'}</div>
            <div class="text-xs text-stone-500 mb-2">${fmtNum(it.jumlah_porsi)} porsi</div>
            ${it.menu_nama ? `<div class="grid grid-cols-3 gap-1 text-[10px]">
              <div class="bg-stone-50 rounded p-1 text-center"><div class="text-stone-400">Kal</div><div class=\"mono font-semibold\">${fmtNum(it.kalori)}</div></div>
              <div class="bg-stone-50 rounded p-1 text-center"><div class="text-stone-400">Prot</div><div class=\"mono font-semibold\">${fmtNum(it.protein)}</div></div>
              <div class="bg-stone-50 rounded p-1 text-center"><div class="text-stone-400">Karb</div><div class=\"mono font-semibold\">${fmtNum(it.karbohidrat)}</div></div>
              <div class="bg-stone-50 rounded p-1 text-center"><div class="text-stone-400">Lem</div><div class=\"mono font-semibold\">${fmtNum(it.lemak)}</div></div>
              <div class="bg-stone-50 rounded p-1 text-center"><div class="text-stone-400">Ser</div><div class=\"mono font-semibold\">${fmtNum(it.serat)}</div></div>
            </div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

async function renderSiklusLaporan(id) {
  const data = await api.get('/siklus/' + id + '/laporan');
  const { siklus, stats, items } = data;
  const wrap = document.getElementById('siklus-detail');
  wrap.scrollIntoView({ behavior: 'smooth' });
  wrap.innerHTML = `
    <div class="bg-white border border-stone-200 rounded-lg p-5">
      <div class="flex flex-wrap justify-between items-center mb-4 gap-2">
        <div>
          <h3 class="font-bold text-lg">Laporan: ${siklus.nama}</h3>
          <div class="text-xs text-stone-500 mt-1">Status: <b class="capitalize">${siklus.status}</b> • Kategori: <b>${siklus.kategori_penerima || 'Semua'}</b></div>
        </div>
        <div class="flex gap-2">
          <button onclick="hitungSpSiklus(${id})" class="px-3 py-1.5 text-sm border border-emerald-300 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100"><svg class="w-4 h-4 -mt-0.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Hitung SP</button>
          <button onclick="exportSiklusLaporan(${id})" class="px-3 py-1.5 text-sm border border-stone-300 rounded hover:bg-stone-50"><svg class="w-4 h-4 -mt-0.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> CSV</button>
          <button onclick="window.print()" class="px-3 py-1.5 text-sm border border-stone-300 rounded hover:bg-stone-50"><svg class="w-4 h-4 -mt-0.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print</button>
          <button onclick="loadSiklusDetail(${id})" class="px-3 py-1.5 text-sm text-stone-500 hover:text-stone-900">Kembali</button>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        <div class="bg-stone-50 rounded-lg p-4">
          <div class="text-xs text-stone-500 uppercase">Total Hari</div>
          <div class="text-2xl font-bold mt-1">${stats.totalDays}</div>
        </div>
        <div class="bg-blue-50 rounded-lg p-4">
          <div class="text-xs text-blue-700 uppercase">Terisi</div>
          <div class="text-2xl font-bold text-blue-800 mt-1">${stats.filledDays}</div>
          <div class="text-xs text-blue-600">${stats.coverage}% coverage</div>
        </div>
        <div class="bg-orange-50 rounded-lg p-4">
          <div class="text-xs text-orange-700 uppercase">Kosong</div>
          <div class="text-2xl font-bold text-orange-800 mt-1">${stats.emptyDays}</div>
        </div>
        <div class="bg-sky-50 rounded-lg p-4">
          <div class="text-xs text-sky-700 uppercase">Menu Unik</div>
          <div class="text-2xl font-bold text-sky-800 mt-1">${stats.uniqueMenus}</div>
        </div>
      </div>

      <div class="bg-white border border-stone-200 rounded-lg p-5 mb-4">
        <div class="font-bold mb-3">Rata-rata Gizi per Hari Terisi</div>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div class="text-center">
            <div class="text-xs text-stone-500">Kalori</div>
            <div class="mono text-lg font-bold">${fmtNum(stats.avg.kalori)} <span class="text-xs text-stone-400">kkal</span></div>
          </div>
          <div class="text-center">
            <div class="text-xs text-stone-500">Protein</div>
            <div class="mono text-lg font-bold">${fmtNum(stats.avg.protein)} <span class="text-xs text-stone-400">g</span></div>
          </div>
          <div class="text-center">
            <div class="text-xs text-stone-500">Karbohidrat</div>
            <div class="mono text-lg font-bold">${fmtNum(stats.avg.karbohidrat)} <span class="text-xs text-stone-400">g</span></div>
          </div>
          <div class="text-center">
            <div class="text-xs text-stone-500">Lemak</div>
            <div class="mono text-lg font-bold">${fmtNum(stats.avg.lemak)} <span class="text-xs text-stone-400">g</span></div>
          </div>
          <div class="text-center">
            <div class="text-xs text-stone-500">Serat</div>
            <div class="mono text-lg font-bold">${fmtNum(stats.avg.serat)} <span class="text-xs text-stone-400">g</span></div>
          </div>
        </div>
      </div>

      <div class="bg-white border border-stone-200 rounded-lg overflow-hidden">
        <div class="px-5 py-3 font-bold border-b border-stone-200">Rincian per Hari</div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-stone-50">
              <tr>
                <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Hari</th>
                <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Menu</th>
                <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Porsi</th>
                <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Kalori</th>
                <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Protein</th>
                <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Karbohidrat</th>
                <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Lemak</th>
                <th class="text-right px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Serat</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(it => `<tr class="border-t border-stone-100">
                <td class="px-4 py-3 text-sm whitespace-nowrap">Hari ${it.hari_ke} · ${it.hari_nama}</td>
                <td class="px-4 py-3 text-sm">${it.menu_nama || '<span class="text-stone-400">—</span>'}</td>
                <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${fmtNum(it.jumlah_porsi)}</td>
                <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${fmtNum(it.kalori)}</td>
                <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${fmtNum(it.protein)}</td>
                <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${fmtNum(it.karbohidrat)}</td>
                <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${fmtNum(it.lemak)}</td>
                <td class="px-4 py-3 text-sm text-right mono whitespace-nowrap">${fmtNum(it.serat)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  window['_laporanSiklus_'+id] = { items, siklus, stats };
}

async function hitungSpSiklus(id) {
  var wrap = document.getElementById('siklus-detail');
  try {
    var result = await api.post('/sp/hitung-kebutuhan', { siklus_ids: [id] });
    var items = result.items || [];
    if (!items.length) {
      showToast('Tidak ada bahan untuk dihitung', 'warning');
      return;
    }
    var totalKg = result.total_kebutuhan_kg || '0.00';
    var html = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden mt-4">' +
      '<div class="px-5 py-3 font-bold border-b border-stone-200 flex justify-between items-center">' +
        '<span>Perhitungan Kebutuhan Bahan (SP)</span>' +
        '<span class="text-sm font-normal text-stone-500">Total: <span class="mono font-bold text-emerald-700">' + totalKg + ' kg</span></span>' +
      '</div>' +
      '<div class="overflow-x-auto"><table class="w-full">' +
      '<thead class="bg-stone-50"><tr>' +
        '<th class="text-left px-4 py-3 text-xs font-semibold uppercase">Bahan</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">Kat. SP</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">SP</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">1 SP (g)</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">Berat Bersih (g)</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">BDD</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">Berat Kotor (g)</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">Total (g)</th>' +
        '<th class="text-right px-4 py-3 text-xs font-semibold uppercase">Kebutuhan (kg)</th>' +
      '</tr></thead><tbody>' +
      items.map(function(b) {
        return '<tr class="border-t border-stone-100">' +
          '<td class="px-4 py-3 text-sm font-medium">' + b.nama + '</td>' +
          '<td class="px-4 py-3 text-sm text-right">' + (b.kategori_sp || '-') + '</td>' +
          '<td class="px-4 py-3 text-sm text-right mono">' + (b.sp_value != null ? b.sp_value : '-') + '</td>' +
          '<td class="px-4 py-3 text-sm text-right mono">' + b.berat_1_sp + '</td>' +
          '<td class="px-4 py-3 text-sm text-right mono">' + b.berat_bersih + '</td>' +
          '<td class="px-4 py-3 text-sm text-right mono">' + b.persen_bdd + '%</td>' +
          '<td class="px-4 py-3 text-sm text-right mono">' + b.berat_kotor + '</td>' +
          '<td class="px-4 py-3 text-sm text-right mono">' + fmtNum(b.total_berat_kotor) + '</td>' +
          '<td class="px-4 py-3 text-sm text-right mono font-bold">' + b.kebutuhan_kg + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div></div>';
    // Append after existing content
    var existing = wrap.querySelector('.bg-white.border-stone-200.rounded-lg.p-5');
    if (existing) {
      existing.insertAdjacentHTML('afterend', html);
    } else {
      wrap.innerHTML += html;
    }
  } catch (e) {
    showToast('Gagal hitung SP: ' + e.message, 'error');
  }
}

function exportSiklusLaporan(id) {
  const { items, stats } = window['_laporanSiklus_'+id] || {};
  if (!items) return showAlert('Data laporan belum dimuat', 'warning');
  const rows = [
    ['Hari', 'Nama Hari', 'Menu', 'Porsi', 'Kalori', 'Protein', 'Karbohidrat', 'Lemak', 'Serat'],
    ...items.map(it => [it.hari_ke, it.hari_nama, it.menu_nama || '', it.jumlah_porsi, it.kalori, it.protein, it.karbohidrat, it.lemak, it.serat]),
    [],
    ['RINGKASAN'],
    ['Total Hari', stats.totalDays],
    ['Hari Terisi', stats.filledDays],
    ['Hari Kosong', stats.emptyDays],
    ['Cakupan', stats.coverage + '%'],
    ['Menu Unik', stats.uniqueMenus],
    [],
    ['RATA-RATA PER HARI TERISI'],
    ['Kalori', stats.avg.kalori],
    ['Protein', stats.avg.protein],
    ['Karbohidrat', stats.avg.karbohidrat],
    ['Lemak', stats.avg.lemak],
    ['Serat', stats.avg.serat],
  ];
  const csv = rows.map(r => r.map(c => `"${(c ?? '').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'laporan-siklus-' + (items[0]?.siklus_id || id) + '.csv'; a.click();
}

async function deleteSiklus(id) {
  if (!await showConfirm('Hapus siklus ini? Semua item di dalamnya akan terhapus.')) return;
  await api.del('/siklus/' + id);
  document.getElementById('siklus-detail').innerHTML = '';
  reloadSiklusList();
}

async function editSiklus(id) {
  const data = await api.get('/siklus/' + id);
  openSiklusForm(data);
}

async function openSiklusForm(editing) {
  const isEdit = !!editing;
  const s = editing || { nama: '', kategori_penerima: '', jumlah_porsi: 0, total_hari: 7, status: 'Draft', catatan: '', items: HARI_OPTIONS.slice(0,7).map((h,i) => ({ hari_ke: i+1, hari_nama: h, menu_id: '', menu_nama: '', jumlah_porsi: 0 })) };
  const formData = JSON.parse(JSON.stringify(s));

  const totalHari = s.total_hari || 7;
  if (!formData.items || !formData.items.length) {
    formData.items = HARI_OPTIONS.slice(0, Math.min(14, Math.max(1, totalHari))).map((h, i) => ({
      hari_ke: i + 1, hari_nama: h, menu_id: '', menu_nama: '', jumlah_porsi: formData.jumlah_porsi || 0
    }));
  }

  document.getElementById('modal-title').textContent = isEdit ? 'Edit Siklus Menu' : 'Siklus Menu Baru';

  // Hide default modal footer
  const saveBtn = document.getElementById('modal-save');
  if (saveBtn) saveBtn.style.display = 'none';
  const footer = document.querySelector('#modal > div > div.border-t.flex.justify-end:last-child');
  if (footer) footer.style.display = 'none';

  const body = document.getElementById('modal-body');
  const kats = ['', 'Ibu Hamil', 'Ibu Menyusui', 'Balita', 'PAUD', 'TK', 'SD', 'SMP'];
  const statuses = ['Draft', 'Aktif', 'Arsip'];

  body.innerHTML = `
    <div class="space-y-4 max-w-lg mx-auto">
      <div>
        <label class="text-sm font-medium text-stone-700">Nama Siklus *</label>
        <input id="sk-nama" value="${s.nama}" placeholder="cth: Siklus Menu SD Minggu 1" class="mt-1 w-full h-11 px-4 border border-stone-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all text-sm" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-sm font-medium text-stone-700">Kategori Penerima</label>
          <select id="sk-kat" class="mt-1 w-full h-11 px-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm">
            ${kats.map(o => `<option value="${o}" ${s.kategori_penerima === o ? 'selected' : ''}>${o || '— Semua —'}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-sm font-medium text-stone-700">Jumlah Porsi/Hari</label>
          <input id="sk-porsi" type="number" value="${s.jumlah_porsi}" min="0" class="mt-1 w-full h-11 px-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-sm font-medium text-stone-700">Total Hari Siklus</label>
          <input id="sk-hari" type="number" min="1" max="14" value="${s.total_hari || 7}" onchange="openSiklusFormHariChange(this)" class="mt-1 w-full h-11 px-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm" />
        </div>
        <div>
          <label class="text-sm font-medium text-stone-700">Status</label>
          <select id="sk-status" class="mt-1 w-full h-11 px-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm">
            ${statuses.map(st => `<option value="${st}" ${s.status === st ? 'selected' : ''}>${st}</option>`).join('')}
          </select>
        </div>
      </div>
      <div>
        <label class="text-sm font-medium text-stone-700">Catatan (opsional)</label>
        <textarea id="sk-cat" rows="2" placeholder="Catatan tambahan..." class="mt-1 w-full px-4 py-2.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm">${s.catatan || ''}</textarea>
      </div>

      <div class="border-t border-stone-200 pt-4">
        <div class="font-semibold text-sm mb-3">Penempatan Menu per Hari</div>
        <div id="siklus-item-list" class="space-y-2"></div>
      </div>

      <div class="flex justify-end gap-3 pt-4 border-t border-stone-100">
        <button id="sk-btn-batal" class="px-5 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-xl transition-colors">Batal</button>
        <button id="sk-btn-save" class="px-6 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-sm">${isEdit ? 'Update Siklus' : 'Simpan Siklus'}</button>
      </div>
    </div>`;

  window._siklusFormItems = formData.items;
  window._siklusFormPorsi = formData.jumlah_porsi;
  renderSiklusFormItems();

  // Batal
  document.getElementById('sk-btn-batal').onclick = function() {
    var m = document.getElementById('modal-save');
    if (m) m.style.display = '';
    var ft = document.querySelector('#modal > div > div.border-t.flex.justify-end:last-child');
    if (ft) ft.style.display = '';
    closeModal();
  };

  // Simpan
  document.getElementById('sk-btn-save').onclick = async function() {
    var nama = document.getElementById('sk-nama').value.trim();
    if (!nama) { showAlert('Nama siklus harus diisi', 'warning'); return; }
    var totalHari = +document.getElementById('sk-hari').value || 7;
    var porsi = +document.getElementById('sk-porsi').value || 0;
    var items = window._siklusFormItems;
    if (totalHari !== items.length) {
      items = HARI_OPTIONS.slice(0, Math.min(14, Math.max(1, totalHari))).map((h, i) => ({
        hari_ke: i + 1, hari_nama: h, menu_id: (items[i] && items[i].menu_id) || '', menu_nama: (items[i] && items[i].menu_nama) || '', jumlah_porsi: (items[i] && items[i].jumlah_porsi) || 0
      }));
    }
    var payload = {
      nama: nama,
      kategori_penerima: document.getElementById('sk-kat').value,
      jumlah_porsi: porsi,
      total_hari: totalHari,
      status: document.getElementById('sk-status').value,
      catatan: document.getElementById('sk-cat').value,
      items: items.map(function(it, i) {
        var select = document.getElementById('sk-menu-' + i);
        var porsiInput = document.getElementById('sk-porsi-' + i);
        return {
          hari_ke: it.hari_ke,
          hari_nama: it.hari_nama,
          menu_id: select ? select.value : '',
          menu_nama: select && select.selectedIndex > 0 ? select.options[select.selectedIndex].text : '',
          jumlah_porsi: porsiInput ? +porsiInput.value || 0 : porsi
        };
      })
    };
    try {
      if (isEdit) await api.put('/siklus/' + s.id, payload);
      else await api.post('/siklus', payload);
      showToast('Siklus menu berhasil ' + (isEdit ? 'diperbarui' : 'disimpan'), 'success');
      var m = document.getElementById('modal-save');
      if (m) m.style.display = '';
      var ft = document.querySelector('#modal > div > div.border-t.flex.justify-end:last-child');
      if (ft) ft.style.display = '';
      closeModal();
      renderSiklus();
    } catch (e) {
      showToast('Gagal menyimpan: ' + (e.message || 'Unknown error'), 'error');
    }
  };

  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}

function openSiklusFormHariChange(input) {
  var newTotal = Math.min(14, Math.max(1, +input.value || 1));
  var items = window._siklusFormItems;
  if (newTotal > items.length) {
    for (var i = items.length; i < newTotal; i++) {
      items.push({ hari_ke: i + 1, hari_nama: HARI_OPTIONS[i] || 'Hari-' + (i + 1), menu_id: '', menu_nama: '', jumlah_porsi: 0 });
    }
  } else if (newTotal < items.length) {
    items.length = newTotal;
  }
  window._siklusFormItems = items;
  renderSiklusFormItems();
}

function renderSiklusFormItems() {
  var list = document.getElementById('siklus-item-list');
  if (!list) return;
  var items = window._siklusFormItems || [];
  var defaultPorsi = window._siklusFormPorsi || 0;
  var menuOpts = (window._menuCache || []).map(function(m) { return '<option value="' + m.id + '">' + m.nama + '</option>'; }).join('');
  var h = '';
  items.forEach(function(it, i) {
    var hasMenu = !!it.menu_id;
    h += '<div class="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-stone-100 hover:border-stone-200 hover:shadow-sm transition-all">';
    h += '<div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0">H' + it.hari_ke + '</div>';
    h += '<div class="w-16 shrink-0 text-xs text-stone-400">' + it.hari_nama + '</div>';
    h += '<div class="flex-1 min-w-0"><select id="sk-menu-' + i + '" class="w-full h-10 px-3 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white">';
    h += '<option value="">— Pilih Menu —</option>' + menuOpts + '</select></div>';
    h += '<div class="w-20 shrink-0"><input id="sk-porsi-' + i + '" type="number" value="' + (it.jumlah_porsi || defaultPorsi || '') + '" min="0" placeholder="Porsi" class="w-full h-10 px-2 border border-stone-200 rounded-xl text-sm text-center focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>';
    h += '<button id="sk-clear-' + i + '" class="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-red-500 hover:bg-red-50 transition-all ' + (hasMenu ? '' : 'invisible') + '">×</button>';
    h += '</div>';
  });
  list.innerHTML = h;

  items.forEach(function(it, i) {
    var select = document.getElementById('sk-menu-' + i);
    if (select && it.menu_id) select.value = it.menu_id;

    var clearBtn = document.getElementById('sk-clear-' + i);
    if (clearBtn) {
      clearBtn.onclick = function() {
        items[i].menu_id = '';
        items[i].menu_nama = '';
        renderSiklusFormItems();
      };
    }
    if (select) {
      select.onchange = function() {
        items[i].menu_id = this.value;
        items[i].menu_nama = this.options[this.selectedIndex] ? this.options[this.selectedIndex].text : '';
        // Show clear button
        var clearBtn2 = document.getElementById('sk-clear-' + i);
        if (clearBtn2) {
          clearBtn2.className = 'w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-red-500 hover:bg-red-50 transition-all ' + (this.value ? '' : 'invisible');
        }
      };
    }
  });
}

// Preload menu list for siklus form
async function preloadMenus() {
  try {
    var result = await api.get('/menu');
    window._menuCache = Array.isArray(result) ? result : (result.data || []);
  } catch { window._menuCache = []; }
}

// ===== Standar SP =====
var SP_GROUPS = [
  { label: 'Balita & PAUD', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>', color: 'bg-cyan-50 border-cyan-200', jenjangs: ['Balita', 'TK/PAUD'] },
  { label: 'SD', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>', color: 'bg-blue-50 border-blue-200', jenjangs: ['SD 1-3', 'SD 4-6'] },
  { label: 'SMP & SMA', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 14l9-5-9-5-9 5 9 5z"/><path d="M12 14l6.16-3.42a6 6 0 01.84 3.42V16l-7 4-7-4v-2a6 6 0 01.84-3.42L12 14z"/></svg>', color: 'bg-violet-50 border-violet-200', jenjangs: ['SMP', 'SMA'] },
  { label: 'Ibu Hamil & Menyusui', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4a4 4 0 100 8 4 4 0 000-8z"/><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><path d="M18 9c0 3.314-2.686 6-6 6"/><path d="M22 12a8 8 0 01-8 8"/></svg>', color: 'bg-rose-50 border-rose-200', jenjangs: ['Ibu Hamil', 'Ibu Menyusui'] },
];

async function renderStandarSp() {
  var c = document.getElementById('content');
  c.innerHTML = '<div class="animate-pulse space-y-3 p-4 sm:p-6"><div class="h-8 bg-stone-200 rounded w-1/3"></div><div class="h-4 bg-stone-100 rounded w-full"></div><div class="h-4 bg-stone-100 rounded w-5/6"></div><div class="h-4 bg-stone-100 rounded w-4/5"></div><div class="h-4 bg-stone-100 rounded w-3/4"></div><div class="h-4 bg-stone-100 rounded w-11/12"></div><div class="h-4 bg-stone-100 rounded w-2/3"></div></div>';
  try {
    var data = await api.get('/sp/standar');
    var jenjangs = {};
    data.forEach(function(r) {
      if (!jenjangs[r.jenjang]) jenjangs[r.jenjang] = {};
      jenjangs[r.jenjang][r.kategori_sp] = r;
    });
    var kats = ['Karbohidrat','Protein Hewani','Protein Nabati','Sayur','Buah','Susu','Minyak'];
    var katLabels = {
      'Karbohidrat': { label: 'Karbohidrat', color: 'text-amber-700 bg-amber-50' },
      'Protein Hewani': { label: 'Protein Hewani', color: 'text-red-700 bg-red-50' },
      'Protein Nabati': { label: 'Protein Nabati', color: 'text-emerald-700 bg-emerald-50' },
      'Sayur': { label: 'Sayur', color: 'text-green-700 bg-green-50' },
      'Buah': { label: 'Buah', color: 'text-orange-700 bg-orange-50' },
      'Susu': { label: 'Susu', color: 'text-blue-700 bg-blue-50' },
      'Minyak': { label: 'Minyak', color: 'text-yellow-700 bg-yellow-50' },
    };

    var html = '<div class="space-y-6">';
    html += '<div class="flex flex-wrap items-center justify-between gap-2">';
    html += '<div><h2 class="text-xl font-bold">Standar Satuan Penukar (SP)</h2><p class="text-sm text-stone-500">Nilai SP berdasarkan jenjang penerima — edit langsung di tabel</p></div>';
    html += '<button onclick="saveStandarSp()" class="px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-colors"><svg class="w-4 h-4 -mt-0.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Simpan Perubahan</button>';
    html += '</div>';

    SP_GROUPS.forEach(function(group) {
      html += '<div class="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">';
      html += '<div class="' + group.color + ' px-5 py-3 border-b flex items-center gap-2">';
      html += '<span class="text-lg">' + group.icon + '</span>';
      html += '<span class="font-bold text-sm">' + group.label + '</span>';
      html += '</div>';
      html += '<div class="overflow-x-auto"><table class="w-full"><thead class="bg-stone-50"><tr>';
      html += '<th class="text-left px-4 py-3 text-xs font-semibold uppercase text-stone-600 w-28">Jenjang</th>';
      kats.forEach(function(k) {
        var kl = katLabels[k] || { label: k, color: '' };
        html += '<th class="text-center px-2 py-3 text-xs font-semibold uppercase"><span class="inline-block px-2 py-0.5 rounded ' + kl.color + '">' + kl.label + '</span></th>';
      });
      html += '</tr></thead><tbody>';

      group.jenjangs.forEach(function(j) {
        var row = jenjangs[j] || {};
        html += '<tr class="border-t border-stone-100 hover:bg-stone-50/50 transition-colors">';
        html += '<td class="px-4 py-3 text-sm font-medium text-stone-800">' + j + '</td>';
        kats.forEach(function(k) {
          var val = row[k];
          if (!val) {
            html += '<td class="px-2 py-3 text-sm text-center text-stone-300">—</td>';
          } else {
            html += '<td class="px-2 py-3 text-sm text-center"><input type="number" step="0.25" value="' + val.sp_value + '" data-id="' + val.id + '" class="sp-input w-20 h-10 px-2 border border-stone-200 rounded-lg text-sm mono text-center focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></td>';
          }
        });
        html += '</tr>';
      });

      html += '</tbody></table></div></div>';
    });

    html += '<div class="text-xs text-stone-400 text-center pb-4">Nilai SP adalah Standar Satuan Penukar — setiap bahan pangan memiliki berat 1 SP yang ditentukan di master Bahan Baku</div>';
    html += '</div>';
    c.innerHTML = html;
  } catch (e) {
    c.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat: ' + e.message + '</div>';
  }
}

async function saveStandarSp() {
  var inputs = document.querySelectorAll('.sp-input');
  var btn = document.querySelector('button[onclick*="saveStandarSp"]');
  if (btn) { btn.disabled = true; btn.innerHTML = 'Menyimpan...'; btn.classList.add('opacity-60'); }
  var updates = [];
  inputs.forEach(function(inp) {
    var id = inp.getAttribute('data-id');
    var val = parseFloat(inp.value);
    if (id && !isNaN(val)) updates.push(api.put('/sp/standar/' + id, { sp_value: val }));
  });
  if (!updates.length) {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Simpan Perubahan'; btn.classList.remove('opacity-60'); }
    return showToast('Tidak ada perubahan', 'warning');
  }
  try {
    await Promise.all(updates);
    showToast('Standar SP berhasil diperbarui', 'success');
    renderStandarSp();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Simpan Perubahan'; btn.classList.remove('opacity-60'); }
    showToast('Gagal menyimpan: ' + e.message, 'error');
  }
}

// ===== Karyawan =====
