// ===== Notifikasi — Email-like UI (Neat Edition) =====
// Views: inbox, sent, compose, detail

let notifCurrentView = 'inbox';
let notifSearchQuery = '';
let notifAllData = { inbox: [], sent: [] };
let notifKaryawanList = [];

// ── Helper: Consistent avatar color per name ──
const NOTIF_AVATAR_COLORS = [
  'bg-blue-500','bg-emerald-500','bg-violet-500','bg-rose-500',
  'bg-amber-500','bg-cyan-500','bg-pink-500','bg-teal-500',
  'bg-orange-500','bg-indigo-500'
];
function notifAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name||'').length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return NOTIF_AVATAR_COLORS[Math.abs(hash) % NOTIF_AVATAR_COLORS.length];
}

// ── Helper: Format date smartly ──
function notifFormatDate(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Baru saja';
  if (diffMins < 60) return diffMins + 'm';
  if (diffHours < 24 && d.getDate() === now.getDate()) return diffHours + 'j';
  if (diffDays === 1) return 'Kemarin';
  if (diffDays < 7) return diffDays + ' hari lalu';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

// ── Helper: Relative time (full format) ──
function notifFullDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ── Helper: Rich empty state icons ──
function notifEmptyIcon(type, isSearch) {
  if (isSearch) {
    return `<svg class="w-12 h-12 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M10 8v4m0 4h.01"/></svg>`;
  }
  if (type === 'inbox') {
    return `<svg class="w-12 h-12 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16-2l-3.586 3.586a1 1 0 01-.707.293H12.5m-3.793.293A1 1 0 018 16.293l-2.414-2.414A1 1 0 014.586 13H4"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M16 8h2m-4 4h2"/></svg>`;
  }
  return `<svg class="w-12 h-12 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M8 14h8"/></svg>`;
}

// ── View Transition ──
function notifFadeIn(el) {
  if (!el) return;
  el.style.opacity = '0';
  el.style.transform = 'translateY(4px)';
  requestAnimationFrame(() => {
    el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    setTimeout(() => { el.style.transition = ''; }, 250);
  });
}

// ═══════════════════════════════════════
// MAIN RENDER
// ═══════════════════════════════════════

async function renderNotifikasi() {
  const c = document.getElementById('content');
  const role = currentUser?.role || '';
  const isAdmin = role === 'admin' || role === 'keuangan';

  c.innerHTML = `
    <div class="flex flex-col h-full lg:h-[calc(100vh-7rem)] -mx-4 lg:-mx-8 -mb-4 lg:-mb-8">
      <div class="flex flex-col flex-1 overflow-hidden bg-white lg:rounded-2xl lg:border lg:border-stone-200 lg:shadow-sm lg:m-4 lg:mx-8">
        <!-- ═══  Top Bar: Tabs + Search + Actions  ═══ -->
        <div class="flex flex-col shrink-0 border-b border-stone-200 bg-stone-50/80">
          <!-- Tab row -->
          <div class="flex items-end gap-0 px-2 md:px-4 pt-0">
            <!-- Inbox tab -->
            <button onclick="notifSwitchView('inbox')" 
                    class="notif-tab relative flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm font-medium transition-all whitespace-nowrap"
                    data-view="inbox">
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
              <span>Kotak Masuk</span>
              <span id="notif-inbox-count" class="notif-count-badge hidden text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full ml-0.5"></span>
            </button>
            ${isAdmin ? `
            <button onclick="notifSwitchView('sent')" 
                    class="notif-tab relative flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm font-medium transition-all whitespace-nowrap"
                    data-view="sent">
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
              <span>Terkirim</span>
              <span id="notif-sent-count" class="notif-count-badge hidden text-[10px] font-bold bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded-full ml-0.5"></span>
            </button>
            ` : ''}
            ${isAdmin ? `
            <button onclick="notifSwitchView('compose')" 
                    class="notif-tab relative flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm font-medium transition-all whitespace-nowrap"
                    data-view="compose">
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              <span>Tulis Pesan</span>
            </button>
            ` : ''}
            <div class="flex-1"></div>
            <!-- Actions -->
            <div class="flex items-center gap-0.5 py-1.5 md:py-2">
              <button id="notif-mark-all-read" onclick="notifMarkAllRead()" 
                      class="hidden md:flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-stone-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Tandai sudah dibaca">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span class="hidden lg:inline">Tandai Dibaca</span>
              </button>
              <button onclick="notifRefresh()" 
                      class="p-1.5 md:p-2 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Segarkan">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              </button>
            </div>
          </div>
          <!-- Active tab indicator bar -->
          <div class="relative h-0.5 bg-stone-200 mx-2 md:mx-4">
            <div id="notif-tab-indicator" class="absolute bottom-0 left-0 h-0.5 bg-blue-600 rounded-full transition-all duration-200" style="width:0;left:0"></div>
          </div>

          <!-- Search bar -->
          <div class="flex items-center gap-2 px-3 md:px-4 py-2 bg-white">
            <div class="relative flex-1 max-w-sm">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input id="notif-search" oninput="notifSearch()" 
                     class="w-full pl-8 md:pl-9 pr-3 py-1.5 md:py-2 text-[13px] md:text-sm bg-stone-100 border border-stone-200 focus:border-blue-400 rounded-lg md:rounded-xl outline-none transition-all placeholder:text-stone-400 focus:shadow-sm" 
                     placeholder="Cari pesan..." />
              <button onclick="document.getElementById('notif-search').value='';notifSearch()" 
                      class="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 hidden" id="notif-search-clear">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
        </div>

        <!-- ═══  Content Area  ═══ -->
        <div id="notif-main-area" class="flex-1 overflow-y-auto" style="scroll-behavior:smooth">
          <div class="flex items-center justify-center py-24">
            <div class="flex flex-col items-center gap-3">
              <div class="relative">
                <svg class="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              </div>
              <span class="text-sm text-stone-400">Memuat pesan...</span>
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

// ═══════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════

async function notifLoadInbox() {
  try {
    const data = await api.get('/notifikasi?type=inbox');
    notifAllData.inbox = data || [];
    const count = data.filter(n => !n.is_read).length;
    const el = document.getElementById('notif-inbox-count');
    if (el) {
      if (count > 0) {
        el.textContent = count > 99 ? '99+' : count;
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
    // Show/hide "Tandai Semua Dibaca" button
    const markBtn = document.getElementById('notif-mark-all-read');
    if (markBtn) {
      markBtn.style.display = count > 0 ? '' : 'none';
    }
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

// ═══════════════════════════════════════
// VIEW SWITCHING
// ═══════════════════════════════════════

function notifSwitchView(view) {
  notifCurrentView = view;
  notifSearchQuery = '';
  const searchInput = document.getElementById('notif-search');
  if (searchInput) { searchInput.value = ''; searchInput.dispatchEvent(new Event('input')); }

  notifUpdateTabIndicator(view);

  // Show/hide "Tandai Semua Dibaca" button
  const markBtn = document.getElementById('notif-mark-all-read');
  if (markBtn) {
    if (view === 'inbox') {
      const count = (notifAllData.inbox || []).filter(n => !n.is_read).length;
      markBtn.style.display = count > 0 ? '' : 'none';
    } else {
      markBtn.style.display = 'none';
    }
  }

  // Render content
  if (view === 'compose') {
    notifRenderCompose();
  } else {
    notifRenderList(view);
  }
}

// ═══════════════════════════════════════
// RENDER EMAIL LIST
// ═══════════════════════════════════════

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
        <div class="w-16 h-16 rounded-2xl bg-stone-50 flex items-center justify-center mb-4">
          ${notifEmptyIcon(type, isSearch)}
        </div>
        <h3 class="text-base font-semibold text-stone-600 mb-1">
          ${isSearch ? 'Pesan tidak ditemukan' : (type === 'inbox' ? 'Kotak Masuk Kosong' : 'Belum Ada Pesan')}
        </h3>
        <p class="text-sm text-stone-400 text-center max-w-xs">
          ${isSearch ? 'Coba gunakan kata kunci lain untuk mencari' : (type === 'inbox' ? 'Notifikasi yang masuk akan muncul di sini' : 'Notifikasi yang Anda kirim akan muncul di sini')}
        </p>
      </div>
    `;
    return;
  }

  const isInbox = type === 'inbox';

  area.innerHTML = `
    <div class="divide-y divide-stone-100/80">
      ${filtered.map((n, idx) => {
        const date = n.created_at;
        const dateStr = notifFormatDate(date);
        const isUnread = isInbox && !n.is_read;
        const name = isInbox ? (n.nama_pengirim || 'Sistem') : (n.nama_penerima || '-');
        const preview = n.pesan ? (n.pesan.length > 120 ? n.pesan.slice(0, 120) + '...' : n.pesan) : '(tanpa pesan)';
        const avatarColor = notifAvatarColor(name);

        return `
          <div onclick="notifShowDetail('${type}', ${n.id})" 
               class="notif-email-row group flex items-start gap-3 px-3 md:px-5 py-3 md:py-3.5 cursor-pointer transition-all duration-150 hover:bg-blue-50/40 ${isUnread ? 'bg-white' : 'bg-white'} ${idx === 0 ? '' : ''}"
               style="${isUnread ? 'border-left: 3px solid #2563eb; padding-left: calc(0.75rem - 3px);' : ''}">
            <!-- Avatar -->
            <div class="w-9 h-9 md:w-10 md:h-10 rounded-full shrink-0 flex items-center justify-center text-xs md:text-sm font-bold text-white shadow-sm ${avatarColor} ${isUnread ? 'ring-2 ring-blue-200' : ''}">${getInitials(name)}</div>
            <!-- Content -->
            <div class="flex-1 min-w-0 pt-0.5">
              <div class="flex items-center justify-between gap-2 mb-0.5">
                <span class="text-sm md:text-sm font-semibold truncate ${isUnread ? 'text-stone-900' : 'text-stone-600'}">${escHtml(name)}</span>
                <span class="text-[11px] md:text-xs whitespace-nowrap shrink-0 ${isUnread ? 'text-blue-600 font-medium' : 'text-stone-400'}">${dateStr}</span>
              </div>
              <div class="flex items-center justify-between gap-2">
                <div class="flex-1 min-w-0">
                  <div class="text-sm md:text-sm mb-0.5 font-medium truncate ${isUnread ? 'text-stone-800' : 'text-stone-600'}">${escHtml(n.judul)}</div>
                  <div class="text-[13px] md:text-xs truncate text-stone-400 leading-relaxed">${escHtml(preview)}</div>
                </div>
                <!-- Delete button -->
                <button onclick="event.stopPropagation();notifHapus(${n.id},'${type}')" 
                        class="opacity-0 group-hover:opacity-100 shrink-0 p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" 
                        title="Hapus pesan">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </div>
            ${isUnread ? '<div class="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0"></div>' : ''}
          </div>
        `;
      }).join('')}
    </div>
    <!-- Footer -->
    <div class="sticky bottom-0 px-3 md:px-5 py-2.5 md:py-3 text-center text-xs text-stone-400 bg-white/80 backdrop-blur-sm border-t border-stone-100">
      ${filtered.length} ${type === 'inbox' ? 'pesan' : 'pesan terkirim'}
    </div>
  `;

  // Fade in
  notifFadeIn(area);
}

// ═══════════════════════════════════════
// DETAIL VIEW
// ═══════════════════════════════════════

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
  const date = notifFullDate(n.created_at);
  const isInbox = type === 'inbox';
  const name = isInbox ? (n.nama_pengirim || 'Sistem') : (n.nama_penerima || '-');
  const label = isInbox ? 'Dari' : 'Kepada';
  const role = currentUser?.role || '';
  const avatarColor = notifAvatarColor(name);
  const initials = getInitials(name);

  // Re-sort: move unread to top, so marking as read updates UI
  if (type === 'inbox') {
    notifLoadInbox();
  }

  area.innerHTML = `
    <div class="flex flex-col h-full">
      <!-- Back bar -->
      <div class="flex items-center justify-between px-3 md:px-5 py-2.5 border-b border-stone-100 bg-white sticky top-0 z-10">
        <button onclick="notifSwitchView('${type}')" class="flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-blue-600 transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 12H5m7 7l-7-7 7-7"/></svg>
          Kembali
        </button>
        <span class="text-xs text-stone-400">${type === 'inbox' ? 'Kotak Masuk' : 'Terkirim'}</span>
      </div>

      <!-- Email content -->
      <div class="flex-1 overflow-y-auto px-3 md:px-5 py-4 md:py-6 lg:px-8">
        <!-- Subject -->
        <h2 class="text-lg md:text-xl lg:text-2xl font-bold text-stone-800 mb-4 md:mb-5 leading-snug">${escHtml(n.judul)}</h2>
        
        <!-- Sender card -->
        <div class="flex items-center gap-3.5 mb-5 md:mb-6 p-3.5 md:p-4 bg-stone-50 rounded-xl border border-stone-100">
          <div class="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-sm md:text-base font-bold text-white shadow-sm shrink-0 ${avatarColor}">${initials}</div>
          <div class="min-w-0 flex-1">
            <div class="text-sm md:text-base font-semibold text-stone-800">${escHtml(name)}</div>
            <div class="text-xs md:text-sm text-stone-400 mt-0.5">
              <span class="text-stone-500 font-medium">${label}</span> · ${date}
            </div>
          </div>
          <div class="shrink-0">
            <div class="w-8 h-8 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-400" title="Waktu dikirim">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
          </div>
        </div>

        <!-- Message body -->
        ${n.pesan ? `
        <div class="text-sm md:text-base leading-7 md:leading-7 text-stone-700 whitespace-pre-wrap bg-white p-4 md:p-5 rounded-xl border border-stone-100 shadow-sm">
          ${escHtml(n.pesan)}
        </div>
        ` : '<div class="text-sm italic text-stone-400 px-2 py-4">(Tidak ada isi pesan)</div>'}

        <!-- Actions -->
        <div class="flex items-center gap-2 mt-6 md:mt-8 pt-4 border-t border-stone-100">
          ${(role === 'admin' || role === 'keuangan') ? `
          <button onclick="notifReply('${type}', '${escHtml(n.judul).replace(/'/g, "\\'")}', '${escHtml(name).replace(/'/g, "\\'")}')" 
                  class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl transition-all shadow-sm hover:shadow-md">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
            Balas
          </button>
          ` : ''}
          <button onclick="notifHapus(${n.id},'${type}')" 
                  class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-100 rounded-xl transition-all"
                  title="Hapus pesan">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            Hapus
          </button>
          <button onclick="notifSwitchView('${type}')" 
                  class="px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-xl transition-all">
            Kembali
          </button>
        </div>
      </div>
    </div>
  `;

  notifFadeIn(area);
}

// ===== Reply helper =====
function notifReply(type, judul, nama) {
  notifCurrentView = 'compose';
  notifRenderCompose(judul, nama);
  // Switch tab underline
  notifUpdateTabIndicator('compose');
}

function notifUpdateTabIndicator(view) {
  const tabs = document.querySelectorAll('.notif-tab');
  const indicator = document.getElementById('notif-tab-indicator');
  tabs.forEach(b => {
    const isActive = b.dataset.view === view;
    b.classList.toggle('text-blue-600', isActive);
    b.classList.toggle('font-semibold', isActive);
    b.classList.toggle('text-stone-500', !isActive);
    b.classList.toggle('hover:text-stone-700', !isActive);

    if (isActive && indicator) {
      const parent = indicator.parentElement;
      const tabRect = b.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      indicator.style.width = (tabRect.width - 8) + 'px';
      indicator.style.left = (tabRect.left - parentRect.left + 4) + 'px';
    }
  });
}

// ═══════════════════════════════════════
// COMPOSE VIEW
// ═══════════════════════════════════════

function notifRenderCompose(replyJudul, replyNama) {
  const area = document.getElementById('notif-main-area');
  if (!area) return;

  const karyawan = notifKaryawanList || [];

  area.innerHTML = `
    <div class="flex flex-col h-full">
      <!-- Header -->
      <div class="flex items-center justify-between px-3 md:px-5 py-2.5 md:py-3 border-b border-stone-200 bg-white sticky top-0 z-10">
        <h3 class="text-sm md:text-base font-bold text-stone-800 flex items-center gap-2">
          <svg class="w-4 h-4 md:w-5 md:h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          Pesan Baru
        </h3>
        <button onclick="notifSwitchView('inbox')" class="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-all">
          <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- Form -->
      <div class="flex-1 overflow-y-auto px-3 md:px-5 py-4 md:py-6 lg:px-8">
        <div class="max-w-100 mx-auto space-y-4 md:space-y-5">
          <!-- Penerima -->
          <div>
            <label class="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Kepada</label>
            <div class="relative">
              <select id="notif-penerima" class="w-full pl-3 pr-10 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all appearance-none">
                <option value="">— Pilih penerima —</option>
                ${karyawan.map(k => `<option value="${k.id}">${escHtml(k.nama)}${k.jabatan_nama ? ' — ' + escHtml(k.jabatan_nama) : ''}</option>`).join('')}
              </select>
              <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            </div>
          </div>

          <!-- Kirim ke Semua - Modern Toggle Switch -->
          <label class="flex items-center gap-3 p-3 bg-blue-50/50 rounded-xl cursor-pointer group hover:bg-blue-50 transition-all border border-blue-100 select-none">
            <div class="relative w-10 h-6 shrink-0">
              <input type="checkbox" id="notif-semua" onchange="notifToggleAll()" class="sr-only peer">
              <div class="block w-10 h-6 rounded-full bg-stone-300 peer-checked:bg-blue-600 transition-colors duration-200"></div>
              <div class="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-4"></div>
            </div>
            <div class="min-w-0">
              <div class="text-sm font-medium text-stone-700 group-hover:text-blue-600 transition-colors">Kirim ke semua karyawan aktif</div>
              <div class="text-xs text-stone-400 mt-0.5">${karyawan.length} karyawan akan menerima notifikasi ini</div>
            </div>
          </label>

          <!-- Subject -->
          <div>
            <label class="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Subjek</label>
            <input id="notif-judul" value="${replyJudul ? 'Re: ' + escHtml(replyJudul) : ''}"
                   class="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all" 
                   placeholder="Subjek pesan..." />
          </div>

          <!-- Message -->
          <div>
            <label class="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Pesan</label>
            <textarea id="notif-pesan" rows="8" 
                      class="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-y min-h-[140px]" 
                      placeholder="Tulis pesan Anda...">${replyNama ? '\n\n— — —\nBalas ke: ' + escHtml(replyNama) + '' : ''}</textarea>
            <div class="flex items-center gap-1.5 mt-1.5 text-xs text-stone-400">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span>Tekan Enter untuk baris baru</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer actions -->
      <div class="px-3 md:px-5 py-3 border-t border-stone-200 bg-white/80 backdrop-blur-sm">
        <div class="max-w-100 mx-auto flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button onclick="notifKirim(this)" 
                    class="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold rounded-xl transition-all shadow-sm hover:shadow-md">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
              <span>Kirim</span>
            </button>
            <button onclick="notifSwitchView('inbox')" 
                    class="px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-xl transition-all">
              Batal
            </button>
          </div>
          <div class="text-xs text-stone-400 flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span>Akan langsung terkirim</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════
// COMPOSE ACTIONS
// ═══════════════════════════════════════

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
    await Promise.all([notifLoadInbox(), notifLoadSent()]);
    notifSwitchView('sent');
  } catch (err) {
    showAlert('Gagal: ' + err.message);
    btn.disabled = false;
    btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg> Kirim';
  }
}

// ═══════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════

async function notifMarkRead(id) {
  try {
    await api.put('/notifikasi/' + id + '/baca');
    for (const type of ['inbox']) {
      const n = notifAllData[type]?.find(item => item.id === id);
      if (n) n.is_read = 1;
    }
    notifLoadInbox();
  } catch (err) {
    console.error('Mark read error:', err);
  }
}

async function notifMarkAllRead() {
  try {
    await api.put('/notifikasi/baca-semua');
    if (notifAllData.inbox) {
      notifAllData.inbox.forEach(n => { n.is_read = 1; });
    }
    notifLoadInbox();
    if (notifCurrentView === 'inbox') {
      notifRenderList('inbox');
    }
    showToast('Semua pesan ditandai sudah dibaca', 'success');
  } catch (err) {
    console.error('Mark all read error:', err);
  }
}

function notifSearch() {
  const searchInput = document.getElementById('notif-search');
  const val = searchInput?.value || '';
  notifSearchQuery = val;
  notifUpdateClearBtn();
  if (notifCurrentView !== 'compose') {
    notifRenderList(notifCurrentView);
  }
}

function notifUpdateClearBtn() {
  const val = document.getElementById('notif-search')?.value || '';
  const clearBtn = document.getElementById('notif-search-clear');
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !val);
  }
}

async function notifHapus(id, type) {
  const items = notifAllData[type] || [];
  const item = items.find(function(n) { return n.id === id; });
  const judul = item ? (item.judul || '(tanpa judul)') : '';
  const ok = await showConfirm(
    'Hapus pesan: "' + judul + '"?',
    'Ya, hapus',
    'Batal',
    'bg-red-600 hover:bg-red-700',
    'danger'
  );
  if (!ok) return;
  await executenotifHapus(id, type);
}

async function executenotifHapus(id, type) {
  try {
    await api.del('/notifikasi/' + id);
    // Remove from local data
    if (notifAllData[type]) {
      notifAllData[type] = notifAllData[type].filter(n => n.id !== id);
    }
    // Re-render current view
    if (notifCurrentView === type) {
      notifRenderList(type);
    }
    showToast('Pesan berhasil dihapus', 'success');
  } catch (err) {
    showAlert('Gagal menghapus: ' + err.message);
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


