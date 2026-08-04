let currentUser = null;
let currentTenant = null;

(function() {
  var s = document.createElement('style');
  s.textContent = '.cb-modern{appearance:none!important;-webkit-appearance:none!important;width:18px!important;height:18px!important;border:2px solid #d4d4d4!important;border-radius:5px!important;background:#fff!important;cursor:pointer!important;position:relative!important;transition:all .2s ease!important;flex-shrink:0!important}.cb-modern:hover{border-color:#a3a3a3!important;background:#fafafa!important}.cb-modern:checked{border-color:#059669!important;background:#059669!important}.cb-modern:checked::after{content:"";position:absolute;top:2px;left:5px;width:5px;height:9px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}.cb-modern:focus-visible{outline:2px solid #05966944;outline-offset:2px;border-color:#059669}';
  document.head.appendChild(s);
})();

// ── Splash screen helpers ──
function splashStep(text) {
  const el = document.getElementById('splash-step');
  if (el) el.textContent = text;
}

function hideSplash() {
  const el = document.getElementById('splash-screen');
  if (el) {
    el.classList.add('splash-hidden');
    setTimeout(() => { el.style.display = 'none'; }, 450);
  }
}

async function init() {
  initDarkMode();
  try {
    splashStep('Memverifikasi sesi...');
    const me = await api.get('/auth/me');
    currentUser = me.user; currentTenant = me.tenant;
    document.getElementById('user-name').textContent = currentUser.nama;
    document.getElementById('user-role').textContent = currentUser.role.replace('_', ' ');
    if (currentUser.foto) {
      document.getElementById('user-avatar').innerHTML = '<img src="' + currentUser.foto + '" class="w-full h-full object-cover" />';
    } else {
      document.getElementById('user-avatar').textContent = getInitials(currentUser.nama);
    }

    splashStep('Memuat navigasi...');
    renderNav();

    splashStep('Memuat halaman...');
    route();
    
    window.addEventListener('popstate', route);
    document.addEventListener('click', function(e) {
      const a = e.target.closest('a[data-key]');
      if (a) { e.preventDefault(); navigate(a.dataset.key); }
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
    
    // Selesai! Sembunyikan splash dengan fade-out
    splashStep('Siap!');
    setTimeout(hideSplash, 300);
  } catch { location.href = '/login'; }
}

// Hak akses item navigasi — satu sumber kebenaran, dipakai renderNav() & pencarian sidebar.
function navItemVisible(key, userRole) {
  const isAdminOrKeuangan = userRole === 'admin' || userRole === 'keuangan';
  const isAdminOrGudang = userRole === 'admin' || userRole === 'gudang';
  const isAdminOrAhliGizi = userRole === 'admin' || userRole === 'ahli_gizi';
  const isAdminOrKeuanganOrGudang = userRole === 'admin' || userRole === 'keuangan' || userRole === 'gudang';
  const isAdminOrProduksi = userRole === 'admin' || userRole === 'produksi' || userRole === 'gudang' || userRole === 'keuangan';
  if (key === 'laporan-siklus') return userRole === 'admin' || userRole === 'ahli_gizi';
  if (key.startsWith('laporan-')) return isAdminOrKeuangan;
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
}

function renderNav() {
  const nav = document.getElementById('nav');
  const userRole = currentUser?.role || '';

  nav.innerHTML = NAV_GROUPS.map(g => {
    const visibleItems = g.items.filter(key =>
      (typeof key === 'object' && key.children)
        ? key.children.some(ck => navItemVisible(ck, userRole))
        : navItemVisible(key, userRole)
    );

    if (visibleItems.length === 0) return '';

    return (g.label ? `<div class="nav-group-label px-3 pt-4 pb-1.5 text-[10px] uppercase tracking-wider font-semibold" style="opacity:.4">${g.label}</div>` : '') +
    visibleItems.map(key => {
      if (typeof key === 'object' && key.children) {
        const visibleChildKeys = key.children.filter(ck => navItemVisible(ck, userRole));
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
      const badge = key === 'notifikasi' ? `<span id="notif-sidebar-badge" class="sidebar-badge hidden ml-auto text-[9px] font-bold bg-red-500 text-white px-1.5 py-[1px] rounded-full min-w-[18px] text-center leading-tight shrink-0">0</span>` : '';
      return `<a href="/${key}" data-key="${key}" class="sidebar-link" onclick="closeSidebar()" title="${m.title}"><span class="text-base w-5 text-center shrink-0">${m.icon}</span><span class="nav-label truncate">${m.title}</span>${badge}</a>`;
    }).join('');
  }).join('');
}

// ===== Sidebar Search =====
// Kumpulkan SEMUA item navigasi yang boleh diakses user (termasuk sub-item dropdown),
// lengkap dengan konteks (grup / induk dropdown) untuk ditampilkan di hasil pencarian.
function getSidebarNavEntries() {
  const userRole = currentUser?.role || '';
  const entries = [];
  NAV_GROUPS.forEach(g => {
    g.items.forEach(key => {
      if (typeof key === 'object' && key.children) {
        key.children.forEach(ck => {
          if (!navItemVisible(ck, userRole)) return;
          const m = MODULES[ck];
          if (!m) return;
          entries.push({ key: ck, title: m.title, icon: m.icon, ctx: key.label, group: g.label || '' });
        });
      } else {
        if (!navItemVisible(key, userRole)) return;
        const m = MODULES[key];
        if (!m) return;
        entries.push({ key, title: m.title, icon: m.icon, ctx: '', group: g.label || '' });
      }
    });
  });
  // Link akun di footer sidebar
  const akun = MODULES['akun'];
  if (akun) entries.push({ key: 'akun', title: akun.title, icon: akun.icon, ctx: '', group: '' });
  return entries;
}

function onSidebarSearch(q) {
  const wrap = document.getElementById('sidebar-search-results');
  const clearBtn = document.getElementById('sidebar-search-clear');
  const val = String(q || '').trim().toLowerCase();
  if (clearBtn) clearBtn.classList.toggle('hidden', !val);
  if (!wrap) return;
  if (!val) { wrap.classList.add('hidden'); wrap.innerHTML = ''; return; }

  const matches = getSidebarNavEntries().filter(e =>
    e.title.toLowerCase().includes(val) ||
    e.key.toLowerCase().includes(val) ||
    e.ctx.toLowerCase().includes(val)
  );

  let html;
  if (!matches.length) {
    html = '<div class="px-4 py-6 text-center text-sm" style="opacity:.5">Tidak ada menu yang cocok</div>';
  } else {
    const shown = matches.slice(0, 12);
    html = shown.map((e, idx) => `
      <a href="/${e.key}" data-search-idx="${idx}" onclick="event.preventDefault();pickSidebarSearch('${e.key}')" class="flex items-center gap-2.5 px-3.5 py-2.5 transition-colors cursor-pointer" style="border-bottom:1px solid var(--border)" title="${e.title}">
        <span class="text-base w-5 text-center shrink-0">${e.icon}</span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium truncate">${e.title}</span>
          ${(e.ctx || e.group) ? `<span class="block text-[10px] truncate" style="opacity:.5">${escHtml([e.ctx, e.group].filter(Boolean).join(' · '))}</span>` : ''}
        </span>
      </a>`).join('');
    if (matches.length > 12) html += `<div class="px-3.5 py-2 text-[10px] text-center" style="opacity:.4">+${matches.length - 12} menu lainnya…</div>`;
  }
  wrap.innerHTML = html;
  wrap.classList.remove('hidden');
}

function pickSidebarSearch(key) {
  navigate(key);
  closeSidebar();
  clearSidebarSearch();
}

function clearSidebarSearch() {
  const input = document.getElementById('sidebar-search');
  if (input) input.value = '';
  const wrap = document.getElementById('sidebar-search-results');
  if (wrap) { wrap.classList.add('hidden'); wrap.innerHTML = ''; }
  const clearBtn = document.getElementById('sidebar-search-clear');
  if (clearBtn) clearBtn.classList.add('hidden');
}

function onSidebarSearchKey(e) {
  if (e.key === 'Escape') { clearSidebarSearch(); return; }
  const links = Array.from(document.querySelectorAll('#sidebar-search-results a[data-search-idx]'));
  if (e.key === 'Enter') {
    if (!links.length) return;
    const cur = links.findIndex(l => l.classList.contains('active-search'));
    (cur >= 0 ? links[cur] : links[0]).click();
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!links.length) return;
    e.preventDefault();
    const cur = links.findIndex(l => l.classList.contains('active-search'));
    const next = cur < 0 ? 0 : (e.key === 'ArrowDown' ? Math.min(cur + 1, links.length - 1) : Math.max(cur - 1, 0));
    links.forEach(l => l.classList.remove('active-search'));
    links[next].classList.add('active-search');
    links[next].scrollIntoView({ block: 'nearest' });
  }
}

function navigate(key) {
  history.pushState(null, '', '/' + key);
  route();
}

// ===== Mobile Breadcrumb =====
// Susun jejak navigasi dari NAV_GROUPS + MODULES, mis. "Ahli Gizi / Siklus Menu"
// atau "Akuntansi / Laporan / RAB". Crumb induk yang berupa modul bisa diklik.
function getBreadcrumbTrail(key) {
  const trail = [];
  const title = (MODULES[key] && MODULES[key].title) || key;
  for (const g of NAV_GROUPS) {
    for (const item of g.items) {
      if (typeof item === 'string') {
        if (item === key) {
          if (g.label) trail.push({ label: g.label });
          trail.push({ label: title, key });
          return trail;
        }
      } else if (item.children && item.children.includes(key)) {
        if (g.label) trail.push({ label: g.label });
        trail.push({ label: item.label });
        trail.push({ label: title, key });
        return trail;
      }
    }
  }
  // Fallback: modul di luar NAV_GROUPS (mis. akun)
  trail.push({ label: title, key });
  return trail;
}

function renderMobileBreadcrumb(key) {
  const el = document.getElementById('mobile-breadcrumb');
  if (!el) return;
  const trail = getBreadcrumbTrail(key);
  el.innerHTML = trail.map((c, i) => {
    const last = i === trail.length - 1;
    const sep = i > 0 ? '<span class="opacity-40 px-0.5 shrink-0">/</span>' : '';
    if (last) {
      return sep + '<span class="font-bold">' + escHtml(c.label) + '</span>';
    }
    if (c.key) {
      return sep + '<a href="/' + c.key + '" data-key="' + c.key + '" class="opacity-60 hover:opacity-100 transition-opacity shrink-0">' + escHtml(c.label) + '</a>';
    }
    return sep + '<span class="opacity-60 shrink-0">' + escHtml(c.label) + '</span>';
  }).join('');
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
  renderMobileBreadcrumb(MODULES[key] ? key : 'dashboard');
  if (key === 'karyawan' && location.search) {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    if (id) return showKaryawanDetail(+id);
  }
  if (m.render) m.render();
  else if (m.crud) renderCrud(m.crud);
}

// ===== Notifications (Stock + Siklus + Pesan) =====
let stockNotifTimer = null;

async function updateNotifSidebarBadge() {
  try {
    const r = await fetch('/api/notifikasi/belum-dibaca', { credentials: 'include' });
    if (r.ok) {
      const d = await r.json();
      const count = (d && d.count) || 0;
      const badge = document.getElementById('notif-sidebar-badge');
      if (badge) {
        if (count > 0) {
          badge.textContent = count > 99 ? '99+' : count;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
    }
  } catch { /* silent */ }
}

async function fetchNotif() {
  try {
    const [stock, siklus, pesan] = await Promise.all([
      fetch('/api/dashboard/low-stock', { credentials: 'include' }).then(r => r.ok ? r.json() : { count: 0, items: [] }),
      fetch('/api/dashboard/siklus-notif', { credentials: 'include' }).then(r => r.ok ? r.json() : { count: 0, items: [] }),
      fetch('/api/notifikasi/belum-dibaca', { credentials: 'include' }).then(r => r.ok ? r.json() : { count: 0 }),
    ]);

    const totalNotif = (stock.count || 0) + (siklus.count || 0) + (pesan.count || 0);

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

// Start periodic notification checks
if (stockNotifTimer) clearInterval(stockNotifTimer);
stockNotifTimer = setInterval(fetchNotif, 120000);
setTimeout(fetchNotif, 3000); // first check after 3s

// Sidebar unread badge: update every 30s, first check immediately
setTimeout(updateNotifSidebarBadge, 1000);
setInterval(updateNotifSidebarBadge, 60000);

// ===== Dashboard =====
