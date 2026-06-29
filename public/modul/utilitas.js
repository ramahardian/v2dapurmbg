// MBG Kitchen — Frontend SPA (vanilla JS)
const fmtIDR = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const fmtNum = (n) => Number(n || 0).toLocaleString('id-ID');
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const getInitials = (name) => (name || '').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

const api = {
  async get(path) {
    const r = await fetch('/api' + path, { credentials: 'include' });
    if (!r.ok) {
      let msg = r.status + ' ' + r.statusText;
      try { const e = await r.json(); msg = e.error || msg; } catch {}
      throw new Error(msg);
    }
    return r.json();
  },
  async post(path, body) {
    const r = await fetch('/api' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' });
    if (!r.ok) {
      let msg = r.status + ' ' + r.statusText;
      try { const e = await r.json(); msg = e.error || msg; } catch {}
      throw new Error(msg);
    }
    return r.json();
  },
  async put(path, body) {
    const r = await fetch('/api' + path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' });
    if (!r.ok) {
      let msg = r.status + ' ' + r.statusText;
      try { const e = await r.json(); msg = e.error || msg; } catch {}
      throw new Error(msg);
    }
    return r.json();
  },
  async del(path) {
    const r = await fetch('/api' + path, { method: 'DELETE', credentials: 'include' });
    if (!r.ok) {
      let msg = r.status + ' ' + r.statusText;
      try { const e = await r.json(); msg = e.error || msg; } catch {}
      throw new Error(msg);
    }
    return r;
  },
};

// Editor
function toggleSidebarCollapse() {
  const sb = document.getElementById('sidebar');
  const app = document.getElementById('app');
  const isCollapsed = sb.classList.toggle('collapsed');
  app.classList.toggle('sidebar-collapsed', isCollapsed);
  localStorage.setItem('sidebar_collapsed', isCollapsed ? '1' : '');
}
function expandSidebar() {
  const sb = document.getElementById('sidebar');
  const app = document.getElementById('app');
  sb.classList.remove('collapsed');
  app.classList.remove('sidebar-collapsed');
  localStorage.setItem('sidebar_collapsed', '');
}
function toggleDarkMode() {
  const html = document.documentElement;
  const isDark = html.classList.toggle('dark');
  localStorage.setItem('dark_mode', isDark ? '1' : '');
  document.querySelectorAll('#sun-icon,.sun-icon-mobile').forEach(e => e.classList.toggle('hidden', !isDark));
  document.querySelectorAll('#moon-icon,.moon-icon-mobile').forEach(e => e.classList.toggle('hidden', isDark));
}
function initDarkMode() {
  if (localStorage.getItem('dark_mode')) {
    document.documentElement.classList.add('dark');
    document.querySelectorAll('#sun-icon,.sun-icon-mobile').forEach(e => e.classList.remove('hidden'));
    document.querySelectorAll('#moon-icon,.moon-icon-mobile').forEach(e => e.classList.add('hidden'));
  }
}
function initSidebar() {
  const sb = document.getElementById('sidebar');
  const app = document.getElementById('app');
  if (localStorage.getItem('sidebar_collapsed')) {
    sb.classList.add('collapsed');
    app.classList.add('sidebar-collapsed');
  }
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  const open = sb.classList.contains('translate-x-0');
  if (open) {
    sb.classList.remove('translate-x-0');
    sb.classList.add('-translate-x-full');
    ov.classList.add('hidden');
  } else {
    sb.classList.remove('-translate-x-full');
    sb.classList.add('translate-x-0');
    ov.classList.remove('hidden');
  }
}
function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  sb.classList.remove('translate-x-0');
  sb.classList.add('-translate-x-full');
  ov.classList.add('hidden');
}

function showAccessDenied(msg) {
  const c = document.getElementById('content');
  c.innerHTML = `<div class="flex flex-col items-center justify-center py-24 text-stone-400">
    <svg class="w-20 h-20 mb-6 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
      <circle cx="12" cy="16" r="1.5"/>
      <line x1="12" y1="16" x2="12" y2="13"/>
    </svg>
    <div class="text-lg font-semibold text-stone-500 mb-1">Akses Ditolak</div>
    <p class="text-sm text-center max-w-xs">${msg || 'Anda tidak memiliki izin untuk mengakses halaman ini.'}</p>
  </div>`;
}
// ===== Modules definition =====
