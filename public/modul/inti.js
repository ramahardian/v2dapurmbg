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
  } catch { location.href = '/login'; }
}

function renderNav() {
  const nav = document.getElementById('nav');
  const userRole = currentUser?.role || '';
  const isAdminOrKeuangan = userRole === 'admin' || userRole === 'keuangan';
  const isAdminOrGudang = userRole === 'admin' || userRole === 'gudang';
  const isAdminOrAhliGizi = userRole === 'admin' || userRole === 'ahli_gizi';

  nav.innerHTML = NAV_GROUPS.map(g => {
    const visibleItems = g.items.filter(key => {
      if (key === 'menu' || key === 'hpp' || key === 'siklus') return isAdminOrAhliGizi;
      if (key === 'gudang') return isAdminOrGudang;
      if (key === 'penerima-manfaat') return isAdminOrKeuangan;
      if (key === 'karyawan' || key === 'absensi' || key === 'payroll') return isAdminOrKeuangan;
      if (key === 'kelola-user') return userRole === 'admin';
      return true;
    });

    if (visibleItems.length === 0) return '';

    return (g.label ? `<div class="nav-group-label px-3 pt-4 pb-1.5 text-[10px] uppercase tracking-wider font-semibold" style="opacity:.4">${g.label}</div>` : '') +
    visibleItems.map(key => {
      const m = MODULES[key];
      return `<a href="/${key}" data-key="${key}" class="sidebar-link" onclick="closeSidebar()" title="${m.title}"><span class="text-base w-5 text-center shrink-0">${m.icon}</span><span class="nav-label truncate">${m.title}</span></a>`;
    }).join('');
  }).join('');
}

function navigate(key) {
  history.pushState(null, '', '/' + key);
  route();
}

function route() {
  const key = (location.pathname || '/dashboard').slice(1) || 'dashboard';
  if (bahanSyncInterval && key !== 'bahan-baku') { clearInterval(bahanSyncInterval); bahanSyncInterval = null; }
  const m = MODULES[key] || MODULES.dashboard;
  
  const userRole = currentUser?.role || '';
  const isAdminOrKeuangan = userRole === 'admin' || userRole === 'keuangan';
  const isAdminOrGudang = userRole === 'admin' || userRole === 'gudang';
  const isAdminOrAhliGizi = userRole === 'admin' || userRole === 'ahli_gizi';
  
  if ((key === 'menu' || key === 'hpp' || key === 'siklus') && !isAdminOrAhliGizi) {
    showAlert('Akses ditolak', 'error'); navigate('dashboard'); return;
  }
  if ((key === 'gudang' || key === 'penerima-manfaat') && !isAdminOrKeuangan && !isAdminOrGudang) {
    showAlert('Akses ditolak: Anda tidak memiliki izin.', 'error'); navigate('dashboard'); return;

  }
  if ((key === 'karyawan' || key === 'absensi' || key === 'payroll') && !isAdminOrKeuangan) {
    showAlert('Akses ditolak: Anda tidak memiliki izin.', 'error'); navigate('dashboard'); return;
  }
  if (key === 'kelola-user' && userRole !== 'admin') {
    showAlert('Akses ditolak: Hanya admin.', 'error'); navigate('dashboard'); return;
  }
  
  document.querySelectorAll('.sidebar-link').forEach(a => a.classList.toggle('active', a.dataset.key === key));
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
