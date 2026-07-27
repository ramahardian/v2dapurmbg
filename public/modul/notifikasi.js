// ===== Notifikasi — Email-like UI =====
// Views: inbox, sent, compose, detail

let notifCurrentView = 'inbox';
let notifSearchQuery = '';
let notifAllData = { inbox: [], sent: [] };
let notifKaryawanList = [];

async function renderNotifikasi() {
  const c = document.getElementById('content');
  const role = currentUser?.role || '';
  const isAdmin = role === 'admin' || role === 'keuangan';

  c.innerHTML = `
    <div class="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-7rem)] -m-4 lg:-m-8">
      <!-- Email UI Container -->
      <div class="flex flex-1 overflow-hidden bg-white rounded-none lg:rounded-2xl lg:border lg:border-stone-200 lg:shadow-sm lg:m-4 lg:mx-8">
        <!-- Left Sidebar -->
        <div class="hidden md:flex md:flex-col w-56 shrink-0 border-r border-stone-200 bg-stone-50">
          <div class="p-4">
            <button onclick="notifSwitchView('compose')" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold rounded-xl transition-all duration-150 shadow-sm hover:shadow-md">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              Tulis Pesan
            </button>
          </div>
          <nav class="flex-1 px-3 pb-3 space-y-0.5">
            <button onclick="notifSwitchView('inbox')" class="notif-sidebar-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150" data-view="inbox">
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
              <span class="flex-1 text-left">Kotak Masuk</span>
              <span id="notif-inbox-count" class="notif-count-badge hidden text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full"></span>
            </button>
            ${isAdmin ? `
            <button onclick="notifSwitchView('sent')" class="notif-sidebar-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150" data-view="sent">
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
              <span class="flex-1 text-left">Terkirim</span>
              <span id="notif-sent-count" class="notif-count-badge hidden text-[10px] font-bold bg-stone-200 text-stone-600 px-2 py-0.5 rounded-full"></span>
            </button>
            ` : ''}
          </nav>
          <div class="p-3 border-t border-stone-200">
            <button onclick="notifRefresh()" class="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-200 rounded-xl transition-all duration-150">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              Segarkan
            </button>
          </div>
        </div>

        <!-- Mobile Tabs -->
        <div class="md:hidden flex items-center gap-2 px-3 py-2 border-b border-stone-200 bg-stone-50">
          <button onclick="notifSwitchView('inbox')" class="notif-mobile-tab flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all" data-view="inbox">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
            Masuk
            <span id="notif-inbox-count-mobile" class="notif-count-badge hidden text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full"></span>
          </button>
          ${isAdmin ? `
          <button onclick="notifSwitchView('sent')" class="notif-mobile-tab flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all" data-view="sent">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
            Terkirim
          </button>
          ` : ''}
          ${isAdmin ? `
          <button onclick="notifSwitchView('compose')" class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium ml-auto transition-all hover:bg-blue-700">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Tulis
          </button>
          ` : ''}
          <button onclick="notifRefresh()" class="p-1.5 text-stone-500 hover:text-stone-700 rounded-lg transition-all">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          </button>
        </div>

        <!-- Right Content Area -->
        <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
          <!-- Search Bar -->
          <div class="hidden md:flex items-center gap-2 px-4 py-2.5 border-b border-stone-200 bg-white">
            <div class="relative flex-1 max-w-md">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input id="notif-search" oninput="notifSearch()" class="w-full pl-9 pr-3 py-2 text-sm bg-stone-100 border border-transparent focus:border-blue-400 rounded-xl outline-none transition-all duration-150 placeholder:text-stone-400" placeholder="Cari pesan..." />
            </div>
            <span id="notif-view-label" class="text-xs font-medium text-stone-400 ml-auto">Kotak Masuk</span>
          </div>

          <!-- Email List / Compose Area -->
          <div id="notif-main-area" class="flex-1 overflow-y-auto" style="scroll-behavior:smooth">
            <div class="flex items-center justify-center py-24">
              <svg class="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Load data
  await Promise.all([notifLoadInbox(), notifLoadSent()]);
  if (role === 'admin' || role === 'keuangan') {
    await notifLoadKaryawan();
  }
  notifSwitchView('inbox');
}

// ===== Data Loading =====

async function notifLoadInbox() {
  try {
    const data = await api.get('/notifikasi?type=inbox');
    notifAllData.inbox = data || [];
    const count = data.filter(n => !n.is_read).length;
    ['notif-inbox-count', 'notif-inbox-count-mobile'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (count > 0) {
          el.textContent = count > 99 ? '99+' : count;
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      }
    });
  } catch (err) {
    console.error('Load inbox error:', err);
    notifAllData.inbox = [];
  }
}

async function notifLoadSent() {
  try {
    const data = await api.get('/notifikasi?type=sent');
    notifAllData.sent = data || [];
    const el = document.getElementById('notif-sent-count');
    if (el && data.length > 0) {
      el.textContent = data.length;
      el.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Load sent error:', err);
    notifAllData.sent = [];
  }
}

async function notifLoadKaryawan() {
  try {
    const data = await api.get('/karyawan?status=Aktif');
    notifKaryawanList = data || [];
  } catch (err) {
    console.error('Load karyawan error:', err);
    notifKaryawanList = [];
  }
}

// ===== View Switching =====

function notifSwitchView(view) {
  notifCurrentView = view;
  notifSearchQuery = '';
  const searchInput = document.getElementById('notif-search');
  if (searchInput) searchInput.value = '';

  // Update sidebar active state
  document.querySelectorAll('.notif-sidebar-btn').forEach(b => {
    const isActive = b.dataset.view === view;
    b.classList.toggle('bg-blue-50', isActive);
    b.classList.toggle('text-blue-700', isActive);
    b.classList.toggle('text-stone-700', !isActive);
    b.classList.toggle('hover:bg-stone-200', !isActive);
  });

  // Update mobile tab active state
  document.querySelectorAll('.notif-mobile-tab').forEach(b => {
    const isActive = b.dataset.view === view;
    b.classList.toggle('bg-blue-600', isActive);
    b.classList.toggle('text-white', isActive);
    b.classList.toggle('text-stone-600', !isActive);
    b.classList.toggle('bg-stone-200', !isActive);
  });

  // Update view label
  const label = document.getElementById('notif-view-label');
  if (label) {
    const labels = { inbox: 'Kotak Masuk', sent: 'Terkirim', compose: 'Pesan Baru' };
    label.textContent = labels[view] || 'Pesan';
  }

  // Render content
  if (view === 'compose') {
    notifRenderCompose();
  } else {
    notifRenderList(view);
  }
}

// ===== Render Email List =====

function notifRenderList(type) {
  const area = document.getElementById('notif-main-area');
  if (!area) return;

  const data = notifAllData[type] || [];
  const search = (notifSearchQuery || '').toLowerCase();
  const filtered = search
    ? data.filter(n => (n.judul || '').toLowerCase().includes(search) || (n.pesan || '').toLowerCase().includes(search) || (n.nama_penerima || '').toLowerCase().includes(search) || (n.nama_pengirim || '').toLowerCase().includes(search))
    : data;

  if (!filtered.length) {
    const isSearch = !!search;
    area.innerHTML = `
      <div class="flex flex-col items-center justify-center py-24 px-4">
        <div class="w-20 h-20 rounded-full bg-stone-100 flex items-center justify-center mb-5">
          <svg class="w-10 h-10 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            ${type === 'inbox' 
              ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>'
              : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>'
            }
          </svg>
        </div>
        <h3 class="text-base font-semibold text-stone-600 mb-1">
          ${isSearch ? 'Pesan tidak ditemukan' : (type === 'inbox' ? 'Kotak Masuk Kosong' : 'Belum Ada Pesan Terkirim')}
        </h3>
        <p class="text-sm text-stone-400">
          ${isSearch ? 'Coba kata kunci lain' : (type === 'inbox' ? 'Belum ada notifikasi masuk' : 'Belum mengirim notifikasi apapun')}
        </p>
      </div>
    `;
    return;
  }

  const isInbox = type === 'inbox';
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'keuangan';

  area.innerHTML = `
    <div class="divide-y divide-stone-100">
      ${filtered.map((n, idx) => {
        const date = new Date(n.created_at);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const dateStr = isToday
          ? date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
        const isUnread = isInbox && !n.is_read;
        const name = isInbox ? (n.nama_pengirim || 'Sistem') : (n.nama_penerima || '-');
        const preview = n.pesan ? (n.pesan.length > 100 ? n.pesan.slice(0, 100) + '...' : n.pesan) : '(tanpa pesan)';

        return `
          <div onclick="notifShowDetail('${type}', ${n.id})" 
               class="notif-email-row group flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-all duration-150 hover:bg-stone-50 ${isUnread ? 'bg-blue-50/60' : 'bg-white'} ${idx === 0 ? 'rounded-t-lg' : ''}">
            <!-- Avatar / Initial -->
            <div class="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${isUnread ? 'bg-blue-500 text-white' : 'bg-stone-200 text-stone-500'}">${getInitials(name)}</div>
            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-semibold truncate ${isUnread ? 'text-stone-900' : 'text-stone-700'}">${escHtml(name)}</span>
                <span class="text-[11px] whitespace-nowrap shrink-0 ${isUnread ? 'text-blue-600 font-medium' : 'text-stone-400'}">${dateStr}</span>
              </div>
              <div class="text-sm mt-0.5 font-medium truncate ${isUnread ? 'text-stone-800' : 'text-stone-600'}">${escHtml(n.judul)}</div>
              <div class="text-xs mt-0.5 truncate text-stone-400">${escHtml(preview)}</div>
            </div>
            <!-- Unread dot -->
            ${isUnread ? '<div class="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0"></div>' : ''}
            <!-- Actions on hover -->
            <div class="hidden group-hover:flex items-center gap-1 shrink-0">
              ${isUnread ? `<button onclick="event.stopPropagation();notifMarkRead(${n.id})" class="p-1.5 rounded-lg text-stone-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="Tandai dibaca"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 19l5-5-5-5"/></svg></button>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <!-- Footer -->
    <div class="px-4 py-3 text-center text-xs text-stone-400 bg-white border-t border-stone-100">
      ${filtered.length} pesan
    </div>
  `;
}

// ===== Email Detail View =====

function notifShowDetail(type, id) {
  const data = notifAllData[type] || [];
  const n = data.find(item => item.id === id);
  if (!n) return;

  // Mark as read if inbox and unread
  if (type === 'inbox' && !n.is_read) {
    notifMarkRead(id);
    n.is_read = 1;
  }

  const area = document.getElementById('notif-main-area');
  const date = new Date(n.created_at).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  const isInbox = type === 'inbox';
  const name = isInbox ? (n.nama_pengirim || 'Sistem') : (n.nama_penerima || '-');
  const label = isInbox ? 'Dari' : 'Kepada';
  const role = currentUser?.role || '';

  area.innerHTML = `
    <div class="flex flex-col h-full">
      <!-- Back button -->
      <div class="px-4 py-2.5 border-b border-stone-100 bg-white sticky top-0 z-10">
        <button onclick="notifSwitchView('${type}')" class="flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-blue-600 transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 12H5m7 7l-7-7 7-7"/></svg>
          Kembali
        </button>
      </div>
      <!-- Email content -->
      <div class="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <h2 class="text-xl lg:text-2xl font-bold text-stone-800 mb-4">${escHtml(n.judul)}</h2>
        
        <div class="flex items-center gap-3 mb-6 p-3 bg-stone-50 rounded-xl">
          <div class="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold shrink-0">${getInitials(name)}</div>
          <div class="min-w-0">
            <div class="text-sm font-semibold text-stone-700">${escHtml(name)}</div>
            <div class="text-xs text-stone-400">${label} · ${date}</div>
          </div>
        </div>

        ${n.pesan ? `
        <div class="text-sm leading-relaxed text-stone-700 whitespace-pre-wrap bg-white p-4 rounded-xl border border-stone-100">
          ${escHtml(n.pesan)}
        </div>
        ` : '<div class="text-sm italic text-stone-400 px-2">(Tidak ada isi pesan)</div>'}

        <!-- Actions -->
        <div class="flex items-center gap-2 mt-8 pt-4 border-t border-stone-100">
          ${(role === 'admin' || role === 'keuangan') ? `
          <button onclick="notifSwitchView('compose')" class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            Balas
          </button>
          ` : ''}
          <button onclick="notifSwitchView('${type}')" class="px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-xl transition-all">
            Kembali
          </button>
        </div>
      </div>
    </div>
  `;
}

// ===== Compose View =====

function notifRenderCompose() {
  const area = document.getElementById('notif-main-area');
  if (!area) return;

  const karyawan = notifKaryawanList || [];

  area.innerHTML = `
    <div class="flex flex-col h-full">
      <!-- Compose header -->
      <div class="px-4 py-3 border-b border-stone-200 bg-white">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-bold text-stone-800 flex items-center gap-2">
            <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Pesan Baru
          </h3>
          <button onclick="notifSwitchView('inbox')" class="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-all">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      <!-- Compose form -->
      <div class="flex-1 overflow-y-auto px-4 py-4 lg:px-6 lg:py-6">
        <div class="max-w-2xl mx-auto space-y-4">
          <!-- Penerima -->
          <div class="compose-field">
            <label class="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Kepada</label>
            <div class="relative">
              <select id="notif-penerima" class="w-full pl-3 pr-10 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all appearance-none">
                <option value="">— Pilih penerima —</option>
                ${karyawan.map(k => `<option value="${k.id}">${escHtml(k.nama)}${k.jabatan_nama ? ' — ' + escHtml(k.jabatan_nama) : ''}</option>`).join('')}
              </select>
              <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            </div>
          </div>

          <!-- Kirim ke Semua toggle -->
          <label class="flex items-center gap-3 p-3 bg-stone-50 rounded-xl cursor-pointer group hover:bg-stone-100 transition-all">
            <input type="checkbox" id="notif-semua" onchange="notifToggleAll()" class="w-4 h-4 rounded border-stone-300 text-blue-600 focus:ring-blue-500 cursor-pointer">
            <div>
              <div class="text-sm font-medium text-stone-700 group-hover:text-blue-600 transition-colors">Kirim ke semua karyawan aktif</div>
              <div class="text-xs text-stone-400">Pesan akan dikirim ke ${karyawan.length} karyawan</div>
            </div>
          </label>

          <!-- Subject -->
          <div class="compose-field">
            <label class="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Subjek</label>
            <input id="notif-judul" class="w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all" placeholder="Subjek pesan..." />
          </div>

          <!-- Message -->
          <div class="compose-field">
            <label class="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Pesan</label>
            <textarea id="notif-pesan" rows="8" class="w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-y min-h-[120px]" placeholder="Tulis pesan Anda..."></textarea>
          </div>

          <!-- Attachment hint -->
          <div class="flex items-center gap-2 px-3 py-2 text-xs text-stone-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
            <span>Lampiran tidak tersedia</span>
          </div>
        </div>
      </div>

      <!-- Compose footer -->
      <div class="px-4 py-3 border-t border-stone-200 bg-white">
        <div class="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button onclick="notifKirim(this)" class="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold rounded-xl transition-all shadow-sm hover:shadow-md">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
              Kirim
            </button>
            <button onclick="notifSwitchView('inbox')" class="px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-xl transition-all">
              Batal
            </button>
          </div>
          <div class="text-xs text-stone-400">
            Notifikasi akan langsung dikirim
          </div>
        </div>
      </div>
    </div>
  `;
}

// ===== Compose Actions =====

function notifToggleAll() {
  const cb = document.getElementById('notif-semua');
  const sel = document.getElementById('notif-penerima');
  if (sel) {
    sel.disabled = cb.checked;
    if (cb.checked) sel.value = '';
  }
}

async function notifKirim(btn) {
  const judul = document.getElementById('notif-judul')?.value.trim();
  const pesan = document.getElementById('notif-pesan')?.value.trim();
  const penerima_id = document.getElementById('notif-penerima')?.value;
  const kirim_ke_semua = document.getElementById('notif-semua')?.checked;

  if (!judul) return showAlert('Subjek wajib diisi');
  if (!kirim_ke_semua && !penerima_id) return showAlert('Pilih penerima atau centang "Kirim ke semua"');

  try {
    btn.disabled = true;
    btn.innerHTML = '<svg class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg> Mengirim...';

    const res = await api.post('/notifikasi/kirim', {
      penerima_id: penerima_id || null,
      judul,
      pesan: pesan || null,
      kirim_ke_semua
    });

    showToast(res.pesan || 'Pesan terkirim!', 'success');

    // Refresh data
    await Promise.all([notifLoadInbox(), notifLoadSent()]);
    notifSwitchView('sent');
  } catch (err) {
    showAlert('Gagal: ' + err.message);
    btn.disabled = false;
    btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg> Kirim';
  }
}

// ===== Actions =====

async function notifMarkRead(id) {
  try {
    await api.put('/notifikasi/' + id + '/baca');
    // Update local data
    for (const type of ['inbox']) {
      const n = notifAllData[type]?.find(item => item.id === id);
      if (n) n.is_read = 1;
    }
    notifLoadInbox(); // refresh badge count
  } catch (err) {
    console.error('Mark read error:', err);
  }
}

function notifSearch() {
  const searchInput = document.getElementById('notif-search');
  if (!searchInput) return;
  notifSearchQuery = searchInput.value;
  if (notifCurrentView !== 'compose') {
    notifRenderList(notifCurrentView);
  }
}

async function notifRefresh() {
  if (notifCurrentView === 'compose') return;
  await Promise.all([notifLoadInbox(), notifLoadSent()]);
  if (notifCurrentView !== 'compose') {
    notifRenderList(notifCurrentView);
  }
  showToast('Pesan disegarkan', 'success');
}

// ===== Utility =====
// getInitials from utilitas.js
