let currentUser = null;
let currentTenant = null;

(function() {
  var s = document.createElement('style');
  s.textContent = '.cb-modern{appearance:none!important;-webkit-appearance:none!important;width:18px!important;height:18px!important;border:2px solid #d4d4d4!important;border-radius:5px!important;background:#fff!important;cursor:pointer!important;position:relative!important;transition:all .2s ease!important;flex-shrink:0!important}.cb-modern:hover{border-color:#a3a3a3!important;background:#fafafa!important}.cb-modern:checked{border-color:#059669!important;background:#059669!important}.cb-modern:checked::after{content:"";position:absolute;top:2px;left:5px;width:5px;height:9px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}.cb-modern:focus-visible{outline:2px solid #05966944;outline-offset:2px;border-color:#059669}';
  document.head.appendChild(s);
})();

async function init() {
  initDarkMode();
  try {
    const me = await api.get('/auth/me');
    currentUser = me.user; currentTenant = me.tenant;
    document.getElementById('user-name').textContent = currentUser.nama;
    document.getElementById('user-role').textContent = currentUser.role.replace('_', ' ');
    if (currentUser.foto) {
      document.getElementById('user-avatar').innerHTML = '<img src="' + currentUser.foto + '" class="w-full h-full object-cover" />';
    } else {
      document.getElementById('user-avatar').textContent = getInitials(currentUser.nama);
    }
    renderNav(); route();
    window.addEventListener('popstate', route);
    document.addEventListener('click', function(e) {
      const a = e.target.closest('a[data-key]');
      if (a) { e.preventDefault(); navigate(a.dataset.key); }
      // Close stock notification dropdown when clicking outside
      const wrapDesktop = document.getElementById('stock-notif-wrap');
      const wrapMobile = document.getElementById('stock-notif-wrap-mobile');
      const dd = document.getElementById('stock-notif-dropdown');
      if (dd && !dd.classList.contains('hidden')) {
        const inDesktop = wrapDesktop && wrapDesktop.contains(e.target);
        const inMobile = wrapMobile && wrapMobile.contains(e.target);
        if (!inDesktop && !inMobile && !dd.contains(e.target)) {
          dd.classList.add('hidden');
        }
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });
    document.getElementById('logout-btn').onclick = async () => { await api.post('/auth/logout', {}); location.href = '/login'; };
    document.getElementById('modal-close-btn').onclick = () => closeModal();
    document.getElementById('modal-cancel-btn').onclick = () => closeModal();
  } catch { location.href = '/login'; }
}

function renderNav() {
  const nav = document.getElementById('nav');
  const userRole = currentUser?.role || '';
  const isAdminOrKeuangan = userRole === 'admin' || userRole === 'keuangan';
  const isAdminOrGudang = userRole === 'admin' || userRole === 'gudang';
  const isAdminOrAhliGizi = userRole === 'admin' || userRole === 'ahli_gizi';
  const isAdminOrKeuanganOrGudang = userRole === 'admin' || userRole === 'keuangan' || userRole === 'gudang';
  const isAdminOrProduksi = userRole === 'admin' || userRole === 'produksi' || userRole === 'gudang' || userRole === 'keuangan';

  nav.innerHTML = NAV_GROUPS.map(g => {
    const visibleItems = g.items.filter(key => {
      if (typeof key === 'object' && key.children) {
        const childKeys = key.children;
        const visibleChildren = childKeys.filter(ck => {
          if (ck === 'laporan-siklus') return userRole === 'admin' || userRole === 'ahli_gizi';
          if (ck.startsWith('laporan-')) return isAdminOrKeuangan;
          return true;
        });
        return visibleChildren.length > 0;
      }
      if (key === 'menu' || key === 'hpp' || key === 'siklus' || key === 'perencanaan' || key === 'total-kebutuhan' || key === 'standar-sp' || key === 'sp-referensi' || key === 'perhitungan-bdd' || key === 'bdd-kalkulator' || key === 'panduan-ahli-gizi') return isAdminOrAhliGizi;
      if (key === 'gudang') return isAdminOrGudang;
      if (key === 'budgeting' || key === 'kas-bank' || key === 'bp-operasional' || key === 'daftar-akun') return isAdminOrKeuangan;
      if (key === 'penerima-manfaat') return isAdminOrKeuangan;
      if (key === 'karyawan' || key === 'absensi' || key === 'payroll' || key === 'shift' || key === 'divisi' || key === 'ijin-cuti' || key === 'hari-libur' || key === 'panduan-sdm') return isAdminOrKeuangan;
      if (key === 'supplier') return isAdminOrKeuanganOrGudang;
      if (key === 'pembelian') return isAdminOrKeuanganOrGudang;
      if (key === 'penerimaan') return isAdminOrKeuanganOrGudang;
      if (key === 'panduan-keuangan') return isAdminOrKeuangan;
      if (key === 'produksi' || key === 'distribusi') return isAdminOrProduksi;
      if (key === 'kelola-user') return userRole === 'admin';
      return true;
    });

    if (visibleItems.length === 0) return '';

    return (g.label ? `<div class="nav-group-label px-3 pt-4 pb-1.5 text-[10px] uppercase tracking-wider font-semibold" style="opacity:.4">${g.label}</div>` : '') +
    visibleItems.map(key => {
      if (typeof key === 'object' && key.children) {
        const visibleChildKeys = key.children.filter(ck => {
          if (ck === 'laporan-siklus') return userRole === 'admin' || userRole === 'ahli_gizi';
          if (ck.startsWith('laporan-')) return isAdminOrKeuangan;
          return true;
        });
        const childLinks = visibleChildKeys.filter(ck => MODULES[ck]).map(ck => {
          const m = MODULES[ck];
          return `<a href="/${ck}" data-key="${ck}" class="sidebar-link sidebar-sub-link" onclick="closeSidebar()" title="${m.title}"><span class="text-base w-5 text-center shrink-0">${m.icon}</span><span class="nav-label truncate">${m.title}</span></a>`;
        }).join('');
        if (!childLinks) return '';
        return `<div class="sidebar-dropdown" data-dropdown="${key.label}">
          <a href="#" class="sidebar-link sidebar-dropdown-parent" onclick="event.preventDefault();toggleDropdown('${key.label}')" title="${key.label}">
            <span class="dropdown-arrow text-base w-5 text-center shrink-0 opacity-45">›</span>
            <span class="nav-label truncate">${key.label}</span>
          </a>
          <div class="sidebar-sub">${childLinks}</div>
        </div>`;
      }
      const m = MODULES[key];
      return `<a href="/${key}" data-key="${key}" class="sidebar-link" onclick="closeSidebar()" title="${m.title}"><span class="text-base w-5 text-center shrink-0">${m.icon}</span><span class="nav-label truncate">${m.title}</span></a>`;
    }).join('');
  }).join('');
}

function navigate(key) {
  history.pushState(null, '', '/' + key);
  route();
}

function toggleDropdown(label) {
  const el = document.querySelector(`[data-dropdown="${label}"]`);
  if (el) el.classList.toggle('open');
}

function route() {
  const key = (location.pathname || '/dashboard').slice(1) || 'dashboard';
  if (bahanSyncInterval && key !== 'bahan-baku') { clearInterval(bahanSyncInterval); bahanSyncInterval = null; }
  const m = MODULES[key] || MODULES.dashboard;
  
  const userRole = currentUser?.role || '';
  const isAdminOrKeuangan = userRole === 'admin' || userRole === 'keuangan';
  const isAdminOrGudang = userRole === 'admin' || userRole === 'gudang';
  const isAdminOrAhliGizi = userRole === 'admin' || userRole === 'ahli_gizi';
  const isAdminOrKeuanganOrGudang = userRole === 'admin' || userRole === 'keuangan' || userRole === 'gudang';
  const isAdminOrProduksi = userRole === 'admin' || userRole === 'produksi' || userRole === 'gudang' || userRole === 'keuangan';
  
  if ((key === 'menu' || key === 'hpp' || key === 'siklus' || key === 'perencanaan' || key === 'total-kebutuhan' || key === 'standar-sp' || key === 'sp-referensi' || key === 'perhitungan-bdd' || key === 'bdd-kalkulator' || key === 'panduan-ahli-gizi') && !isAdminOrAhliGizi) {
    showAlert('Akses ditolak', 'error'); navigate('dashboard'); return;
  }
  if ((key === 'dashboard-keuangan' || key === 'budgeting' || key === 'kas-bank' || key === 'bp-operasional' || key === 'daftar-akun' || key === 'panduan-keuangan') && !isAdminOrKeuangan) {
    return showAccessDenied();
  }
  if (key.startsWith('laporan-') && key !== 'laporan-siklus' && !isAdminOrKeuangan) {
    return showAccessDenied();
  }
  if (key === 'laporan-siklus' && userRole !== 'admin' && userRole !== 'ahli_gizi') {
    return showAccessDenied();
  }
  if ((key === 'shift' || key === 'jadwal' || key === 'divisi') && !isAdminOrKeuangan) {
    return showAccessDenied();
  }
  if ((key === 'gudang' || key === 'penerima-manfaat') && !isAdminOrKeuangan && !isAdminOrGudang) {
    return showAccessDenied();
  }
  if ((key === 'karyawan' || key === 'absensi' || key === 'payroll' || key === 'ijin-cuti' || key === 'hari-libur' || key === 'shift' || key === 'divisi' || key === 'panduan-sdm') && !isAdminOrKeuangan) {
    return showAccessDenied();
  }
  if (key === 'supplier' && !isAdminOrKeuanganOrGudang) {
    return showAccessDenied();
  }
  if (key === 'pembelian' && !isAdminOrKeuanganOrGudang) {
    return showAccessDenied();
  }
  if (key === 'penerimaan' && !isAdminOrKeuanganOrGudang) {
    return showAccessDenied();
  }
  if ((key === 'produksi' || key === 'distribusi') && !isAdminOrProduksi) {
    return showAccessDenied();
  }
  if (key === 'kelola-user' && userRole !== 'admin') {
    return showAccessDenied();
  }
  
  document.querySelectorAll('.sidebar-link').forEach(a => a.classList.toggle('active', a.dataset.key === key));
  document.querySelectorAll('.sidebar-dropdown').forEach(dd => {
    const hasActive = dd.querySelector('.sidebar-link.active');
    const isParentMatch = dd.querySelector('.sidebar-dropdown-parent')?.dataset.key === key;
    dd.classList.toggle('open', !!hasActive);
    dd.querySelector('.sidebar-dropdown-parent')?.classList.toggle('active', !!isParentMatch);
  });
  document.title = m.title + ' — Dapur Sukaluyu';
  document.getElementById('page-title').textContent = m.title;
  document.getElementById('page-sub').textContent = m.sub;
  if (key === 'karyawan' && location.search) {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    if (id) return showKaryawanDetail(+id);
  }
  if (m.render) m.render();
  else if (m.crud) renderCrud(m.crud);
}

// ===== Notifications (Stock + Siklus) =====
let stockNotifTimer = null;

async function fetchNotif() {
  try {
    const [stock, siklus] = await Promise.all([
      fetch('/api/dashboard/low-stock', { credentials: 'include' }).then(r => r.ok ? r.json() : { count: 0, items: [] }),
      fetch('/api/dashboard/siklus-notif', { credentials: 'include' }).then(r => r.ok ? r.json() : { count: 0, items: [] }),
    ]);

    const totalNotif = (stock.count || 0) + (siklus.count || 0);

    // Update badge
    ['stock-notif-badge', 'stock-notif-badge-mobile'].forEach(id => {
      const b = document.getElementById(id);
      if (!b) return;
      if (totalNotif > 0) {
        b.textContent = totalNotif > 99 ? '99+' : totalNotif;
        b.classList.remove('hidden');
      } else {
        b.classList.add('hidden');
      }
    });

    // Update dropdown if visible
    const dd = document.getElementById('stock-notif-dropdown');
    if (dd && !dd.classList.contains('hidden')) {
      renderNotifList(stock, siklus);
    }
  } catch { /* silent */ }
}

function renderNotifList(stock, siklus) {
  const list = document.getElementById('stock-notif-list');
  if (!list) return;

  let html = '';

  // Siklus section
  if (siklus.count > 0) {
    html += `<div class="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider" style="opacity:0.5">Siklus Menu</div>`;
    html += siklus.items.slice(0, 5).map(it => {
      const pct = it.coverage;
      const barColor = pct < 50 ? 'bg-red-500' : pct < 80 ? 'bg-amber-500' : 'bg-blue-500';
      return `<div class="px-4 py-2.5 border-b cursor-pointer hover:opacity-80" style="border-color:var(--border)" onclick="navigateTo('siklus')">
        <div class="flex items-center justify-between">
          <div class="text-sm font-medium truncate flex-1">${escHtml(it.nama)}</div>
          <span class="text-xs font-bold ${pct < 50 ? 'text-red-600' : 'text-amber-600'} ml-2">${pct}%</span>
        </div>
        <div class="flex items-center gap-2 mt-1">
          <div class="flex-1 h-1.5 rounded-full" style="background:var(--border)">
            <div class="h-1.5 rounded-full ${barColor}" style="width:${pct}%"></div>
          </div>
          <span class="text-[10px]" style="opacity:0.5">${it.kosong}/${it.total_hari} kosong</span>
        </div>
      </div>`;
    }).join('');
  }

  // Stock section
  if (stock.count > 0) {
    if (html) html += `<div class="border-t" style="border-color:var(--border)"></div>`;
    html += `<div class="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider" style="opacity:0.5">Stok Menipis</div>`;
    html += stock.items.slice(0, 5).map(it => `
      <div class="px-4 py-2.5 flex items-center justify-between border-b cursor-pointer hover:opacity-80" style="border-color:var(--border)" onclick="navigateTo('gudang')">
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium truncate">${escHtml(it.nama)}</div>
          <div class="text-[10px]" style="opacity:0.5">Min: ${it.min} ${it.satuan}</div>
        </div>
        <div class="mono text-sm font-bold text-red-600 ml-3 whitespace-nowrap">${it.stok} ${it.satuan}</div>
      </div>
    `).join('');
  }

  if (!html) {
    html = '<div class="px-4 py-6 text-center text-sm text-emerald-600">✅ Semua aman</div>';
  }

  list.innerHTML = html;
}

function toggleStockNotif() {
  const dd = document.getElementById('stock-notif-dropdown');
  const list = document.getElementById('stock-notif-list');
  if (!dd) return;
  const isHidden = dd.classList.contains('hidden');
  dd.classList.toggle('hidden');
  if (isHidden && list) {
    list.innerHTML = '<div class="px-4 py-6 text-center text-sm" style="opacity:0.5">Memuat...</div>';
    fetchNotif();
  }
}

function closeStockNotif() {
  document.getElementById('stock-notif-dropdown')?.classList.add('hidden');
}

// ===== Notifikasi Pesan (Admin) =====
let pesanDropdownOpen = false;
let _pesanKaryawanData = [];

function togglePesanDropdown() {
  const dd = document.getElementById('pesan-dropdown');
  const list = document.getElementById('pesan-list');
  if (!dd) return;
  pesanDropdownOpen = !pesanDropdownOpen;
  dd.classList.toggle('hidden', !pesanDropdownOpen);
  if (pesanDropdownOpen) {
    list.innerHTML = '<div class="px-4 py-6 text-center text-sm" style="opacity:0.5">Memuat...</div>';
    loadPesanList();
  }
}

function closePesanDropdown() {
  pesanDropdownOpen = false;
  document.getElementById('pesan-dropdown')?.classList.add('hidden');
}

async function loadPesanUnread() {
  try {
    const r = await fetch('/api/notifikasi/unread-count?_='+Date.now());
    const d = await r.json();
    const badge = document.getElementById('pesan-notif-badge');
    if (!badge) return;
    if (d.count > 0) {
      badge.textContent = d.count > 99 ? '99+' : d.count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch {}
}

async function loadPesanList() {
  const list = document.getElementById('pesan-list');
  if (!list) return;
  try {
    const r = await fetch('/api/notifikasi/saya?limit=20&_='+Date.now());
    const d = await r.json();
    if (!d.data || !d.data.length) {
      list.innerHTML = '<div class="px-4 py-8 text-center text-sm" style="opacity:0.5"><svg class="w-8 h-8 mx-auto mb-2" style="opacity:0.3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>Tidak ada pesan</div>';
      return;
    }
    list.innerHTML = d.data.map(function(n) {
      return '<div class="px-4 py-3 border-b cursor-pointer transition hover:bg-black/5" style="border-color:var(--border)" onclick="bacaPesan('+n.id+')">'
        + '<div class="flex items-start gap-3">'
        + '<div class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold '+(n.is_read ? 'bg-stone-100 text-stone-500' : 'bg-blue-100 text-blue-700')+'">'
        + (n.pengirim_nama ? getInitials(n.pengirim_nama) : '?')
        + '</div>'
        + '<div class="flex-1 min-w-0">'
        + '<div class="flex items-start justify-between gap-2">'
        + '<div class="font-medium text-xs '+(n.is_read ? '' : 'text-blue-700')+'">'+escHtml(n.judul)+'</div>'
        + (!n.is_read ? '<span class="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1"></span>' : '')
        + '</div>'
        + (n.pesan ? '<div class="text-[11px] mt-0.5 line-clamp-2" style="opacity:0.6">'+escHtml(n.pesan)+'</div>' : '')
        + '<div class="text-[10px] mt-1" style="opacity:0.4">'+fmtWaktu(n.created_at)+'</div>'
        + '</div></div></div>';
    }).join('');
  } catch {
    list.innerHTML = '<div class="px-4 py-6 text-center text-sm text-red-500">Gagal memuat pesan</div>';
  }
}

async function bacaPesan(id) {
  try {
    await fetch('/api/notifikasi/'+id+'/baca', { method:'PUT' });
    loadPesanUnread();
    loadPesanList();
  } catch {}
}

async function bacaSemuaPesan() {
  try {
    await fetch('/api/notifikasi/baca-semua', { method:'PUT' });
    loadPesanUnread();
    loadPesanList();
  } catch {}
}

function openKirimPesanModal() {
  document.getElementById('kirim-pesan-modal').classList.remove('hidden');
  document.getElementById('kirim-pesan-modal').style.display = 'flex';
  document.getElementById('pesan-judul').value = '';
  document.getElementById('pesan-isi').value = '';
  document.getElementById('pesan-cari').value = '';
  document.getElementById('pilih-semua-karyawan').checked = false;
  loadKaryawanList();
}

function closeKirimPesanModal() {
  document.getElementById('kirim-pesan-modal').classList.add('hidden');
  document.getElementById('kirim-pesan-modal').style.display = '';
}

async function loadKaryawanList() {
  const container = document.getElementById('daftar-karyawan');
  if (!container) return;
  try {
    const r = await fetch('/api/notifikasi/karyawan-list?_='+Date.now());
    _pesanKaryawanData = await r.json();
    renderKaryawanList('');
  } catch {
    container.innerHTML = '<div class="px-3 py-3 text-center text-sm text-red-500">Gagal memuat karyawan</div>';
  }
}

function renderKaryawanList(filter) {
  const container = document.getElementById('daftar-karyawan');
  if (!container) return;
  const data = _pesanKaryawanData;
  const filtered = filter ? data.filter(function(k) {
    return (k.nama||'').toLowerCase().indexOf(filter.toLowerCase()) !== -1
      || (k.nik||'').indexOf(filter) !== -1
      || (k.departemen||'').toLowerCase().indexOf(filter.toLowerCase()) !== -1;
  }) : data;
  if (!filtered.length) {
    container.innerHTML = '<div class="px-3 py-3 text-center text-sm" style="opacity:0.5">Tidak ada karyawan</div>';
    return;
  }
  container.innerHTML = filtered.map(function(k) {
    return '<label class="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-black/5 transition">'
      + '<input type="checkbox" class="karyawan-checkbox" value="'+k.id+'" onchange="updatePilihSemuaCheckbox()">'
      + '<div class="flex-1 min-w-0">'
      + '<div class="text-xs font-medium">'+escHtml(k.nama)+'</div>'
      + '<div class="text-[10px]" style="opacity:0.5">'+escHtml(k.departemen||k.jabatan||'-')+'</div>'
      + '</div>'
      + '<div class="text-[10px]" style="opacity:0.4">'+escHtml(k.nik||'')+'</div>'
      + '</label>';
  }).join('');
}

function filterKaryawanList() {
  const filter = document.getElementById('pesan-cari').value;
  renderKaryawanList(filter);
}

function togglePilihSemua(checked) {
  document.querySelectorAll('.karyawan-checkbox').forEach(function(cb) {
    cb.checked = checked;
  });
}

function updatePilihSemuaCheckbox() {
  const all = document.querySelectorAll('.karyawan-checkbox');
  const checked = document.querySelectorAll('.karyawan-checkbox:checked');
  const pilihSemua = document.getElementById('pilih-semua-karyawan');
  if (pilihSemua) {
    pilihSemua.checked = all.length > 0 && all.length === checked.length;
  }
}

async function kirimPesan() {
  const judul = document.getElementById('pesan-judul').value.trim();
  const pesan = document.getElementById('pesan-isi').value.trim();
  const checked = document.querySelectorAll('.karyawan-checkbox:checked');
  if (!judul) { showToast('Judul pesan wajib diisi', 'error'); return; }
  if (!checked.length) { showToast('Pilih minimal 1 penerima', 'error'); return; }
  const penerima_ids = Array.from(checked).map(function(cb) { return parseInt(cb.value); });
  const btn = document.getElementById('btn-kirim-pesan');
  btn.disabled = true;
  btn.innerHTML = '<svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Mengirim...';
  try {
    const r = await fetch('/api/notifikasi/kirim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ penerima_ids, judul, pesan: pesan || null })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Gagal kirim');
    showToast('Pesan terkirim ke ' + d.jumlah + ' karyawan', 'success');
    closeKirimPesanModal();
    loadPesanUnread();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg> Kirim';
  }
}

function fmtWaktu(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return Math.floor(diff/60) + ' menit lalu';
  if (diff < 86400) return Math.floor(diff/3600) + ' jam lalu';
  if (diff < 172800) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short' });
}

// Click outside to close pesan dropdown
document.addEventListener('click', function(e) {
  if (!pesanDropdownOpen) return;
  const wrap = document.getElementById('pesan-notif-wrap');
  const dd = document.getElementById('pesan-dropdown');
  if (pesanDropdownOpen && wrap && !wrap.contains(e.target) && dd && !dd.contains(e.target)) {
    pesanDropdownOpen = false;
    dd.classList.add('hidden');
  }
});

// Poll for unread messages every 60 seconds
setInterval(loadPesanUnread, 60000);
setTimeout(loadPesanUnread, 3000);

function navigateTo(key) {
  closeStockNotif();
  const link = document.querySelector(`a[data-key="${key}"]`);
  if (link) { link.click(); }
  else { window.location.href = '/' + key; }
}

// ===== Bootstrap =====
initSidebar();
init();
preloadMenus();

// Start periodic notification check (every 60 seconds)
if (stockNotifTimer) clearInterval(stockNotifTimer);
stockNotifTimer = setInterval(fetchNotif, 60000);
setTimeout(fetchNotif, 3000); // first check after 3s

// ===== Dashboard =====
