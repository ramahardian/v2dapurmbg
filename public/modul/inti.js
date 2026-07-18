let currentUser = null;
let currentTenant = null;

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
      if (key === 'karyawan' || key === 'absensi' || key === 'payroll' || key === 'shift' || key === 'divisi' || key === 'ijin-cuti' || key === 'panduan-sdm') return isAdminOrKeuangan;
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
  if ((key === 'budgeting' || key === 'kas-bank' || key === 'bp-operasional' || key === 'daftar-akun' || key === 'panduan-keuangan') && !isAdminOrKeuangan) {
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
  if ((key === 'karyawan' || key === 'absensi' || key === 'payroll' || key === 'ijin-cuti' || key === 'shift' || key === 'divisi' || key === 'panduan-sdm') && !isAdminOrKeuangan) {
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
    dd.classList.toggle('open', !!hasActive);
    dd.querySelector('.sidebar-dropdown-parent')?.classList.toggle('active', !!hasActive);
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

// Bootstrap — diinisialisasi setelah semua modul terdefinisi
initSidebar();
init();
preloadMenus();

// ===== Dashboard =====
