// ===== ✦ Notifikasi — Premium Messaging Center ✦ =====
// Views: inbox, sent, compose, detail

let notifCurrentView = 'inbox';
let notifSearchQuery = '';
let notifAllData = { inbox: [], sent: [] };
let notifKaryawanList = [];
let notifSelectedIds = new Set();
let notifSelectMode = false;

// ── Avatar gradient palette ──
const NOTIF_AVATAR_GRADIENTS = [
  'from-blue-500 to-blue-600','from-emerald-500 to-emerald-600','from-violet-500 to-violet-600',
  'from-rose-500 to-rose-600','from-amber-500 to-amber-600','from-cyan-500 to-cyan-600',
  'from-pink-500 to-pink-600','from-teal-500 to-teal-600','from-orange-500 to-orange-600',
  'from-indigo-500 to-indigo-600','from-fuchsia-500 to-fuchsia-600','from-lime-500 to-lime-600'
];
function notifAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name||'').length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return NOTIF_AVATAR_GRADIENTS[Math.abs(hash) % NOTIF_AVATAR_GRADIENTS.length];
}

// ── Format date (dayjs) ──
function notifFormatDate(dateStr) {
  const d = dayjs(dateStr);
  const now = dayjs();
  const diffMins = now.diff(d, 'minute');
  const diffHours = now.diff(d, 'hour');
  if (diffMins < 1) return 'Baru saja';
  if (diffMins < 60) return diffMins + 'm';
  if (d.isSame(now, 'day')) return diffHours + 'j';
  if (d.isSame(now.subtract(1, 'day'), 'day')) return 'Kemarin';
  const diffDays = now.diff(d, 'day');
  if (diffDays < 7) return diffDays + ' hari lalu';
  return d.locale('id').format('D MMM' + (d.year() !== now.year() ? ' YYYY' : ''));
}
function notifFullDate(dateStr) {
  return dayjs(dateStr).locale('id').format('dddd, D MMMM YYYY [pukul] HH.mm');
}

// ── Skeleton loader ──
function notifSkeleton() {
  const shimmer = `animate-pulse`;
  return `
    <div class="px-4 md:px-6 py-4 space-y-3">
      ${[1,2,3,4,5].map(() => `
        <div class="flex items-start gap-3 py-3">
          <div class="w-10 h-10 rounded-full bg-stone-200 ${shimmer} shrink-0"></div>
          <div class="flex-1 space-y-2.5 pt-1">
            <div class="flex items-center justify-between">
              <div class="h-3 bg-stone-200 ${shimmer} rounded w-32"></div>
              <div class="h-2.5 bg-stone-100 ${shimmer} rounded w-12"></div>
            </div>
            <div class="h-3 bg-stone-200 ${shimmer} rounded w-3/4"></div>
            <div class="h-2.5 bg-stone-100 ${shimmer} rounded w-1/2"></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Empty state illustrations (modern) ──
function notifEmptyIllus(type, isSearch) {
  if (isSearch) {
    return `<svg class="w-16 h-16 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" stroke-width="1.2"/><path stroke-linecap="round" stroke-width="1.2" d="M16.5 16.5L21 21"/><path stroke-linecap="round" stroke-width="1" d="M8 9h6m-6 3h4"/></svg>`;
  }
  if (type === 'inbox') {
    return `<svg class="w-16 h-16 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16-2l-3.586 3.586a1 1 0 01-.707.293H12.5m-1.793.293A1 1 0 018 16.293l-2.414-2.414A1 1 0 014.586 13M4 13H4m16-2l-3.586 3.586a1 1 0 01-.707.293H12.5"/><circle cx="18" cy="6" r="3" fill="#fca5a5" stroke="none"/></svg>`;
  }
  return `<svg class="w-16 h-16 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/><circle cx="17" cy="6" r="2" fill="#86efac" stroke="none"/></svg>`;
}

// ── Fade-in transition ──
function notifFadeIn(el) {
  if (!el) return;
  el.style.opacity = '0';
  el.style.transform = 'translateY(4px)';
  requestAnimationFrame(() => {
    el.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    setTimeout(() => { el.style.transition = ''; }, 300);
  });
}

// ── Staggered fade-in animation ──
function notifStaggerIn(container) {
  if (!container) return;
  const items = container.querySelectorAll('.notif-row-item');
  items.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
      setTimeout(() => { el.style.transition = ''; }, 350);
    }, i * 40);
  });
}

// ═══════════════════════════════════════════════
// MAIN RENDER
// ═══════════════════════════════════════════════

async function renderNotifikasi() {
  const c = document.getElementById('content');
  const role = currentUser?.role || '';
  const isAdmin = role === 'admin' || role === 'keuangan';

  notifSelectedIds = new Set();
  notifSelectMode = false;

  c.innerHTML = `
    <div class="flex flex-col h-full lg:h-[calc(100vh-7rem)] -mx-4 lg:-mx-8 -mb-4 lg:-mb-8">
      <div class="flex flex-col flex-1 overflow-hidden bg-white lg:rounded-2xl lg:border lg:border-stone-200 lg:shadow-sm lg:m-4 lg:mx-8">
        
        <!-- ═══ TOP BAR ═══ -->
        <div class="flex flex-col shrink-0 border-b border-stone-200 bg-gradient-to-r from-stone-50 to-white">
          
          <!-- Tab row -->
          <div class="flex items-center gap-0.5 px-3 md:px-5 pt-2.5 md:pt-3 overflow-x-auto">
            <button onclick="notifSwitchView('inbox')" 
                    class="notif-tab relative flex items-center gap-1.5 px-3 md:px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all duration-200 whitespace-nowrap"
                    data-view="inbox">
              <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
              <span>Kotak Masuk</span>
              <span id="notif-inbox-count" class="notif-count-badge hidden text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full"></span>
            </button>
            ${isAdmin ? `
            <button onclick="notifSwitchView('sent')" 
                    class="notif-tab relative flex items-center gap-1.5 px-3 md:px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all duration-200 whitespace-nowrap"
                    data-view="sent">
              <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/><path stroke-linecap="round" d="M8 14h8"/></svg>
              <span>Terkirim</span>
            </button>
            ` : ''}
            ${isAdmin ? `
            <button onclick="notifSwitchView('compose')" 
                    class="notif-tab relative flex items-center gap-1.5 px-3 md:px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all duration-200 whitespace-nowrap"
                    data-view="compose">
              <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
              <span>Tulis Pesan</span>
            </button>
            ` : ''}
            <div class="flex-1"></div>
            <!-- Right actions -->
            <div class="flex items-center gap-0.5">
              <button id="notif-mark-all-read" onclick="notifMarkAllRead()" 
                      class="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Tandai sudah dibaca">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span class="hidden lg:inline">Tandai Semua</span>
              </button>
              <button onclick="notifRefresh()" 
                      class="p-1.5 md:p-2 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Segarkan">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              </button>
            </div>
          </div>

          <!-- Search bar -->
          <div class="px-3 md:px-5 pb-2.5 md:pb-3 pt-1.5">
            <div class="relative max-w-sm">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/></svg>
              <input id="notif-search" oninput="notifSearchDebounce()" 
                     class="w-full pl-8 md:pl-9 pr-8 py-2 text-[13px] md:text-sm bg-stone-100 border border-stone-200 focus:border-blue-400 rounded-xl outline-none transition-all placeholder:text-stone-400 focus:bg-white focus:shadow-sm focus:ring-2 focus:ring-blue-500/10" 
                     placeholder="Cari pesan berdasarkan judul, pengirim, atau isi..." />
              <button onclick="notifClearSearch()" 
                      class="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 hidden" id="notif-search-clear">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
        </div>

        <!-- ═══ CONTENT AREA (skeleton initially) ═══ -->
        <div id="notif-main-area" class="flex-1 overflow-y-auto" style="scroll-behavior:smooth">
          ${notifSkeleton()}
        </div>

        <!-- ═══ BATCH ACTION BAR (hidden) ═══ -->
        <div id="notif-batch-bar" class="hidden items-center justify-between px-4 md:px-5 py-2.5 bg-blue-50 border-t border-blue-100 shrink-0">
          <div class="flex items-center gap-2">
            <span id="notif-batch-count" class="text-sm font-semibold text-blue-700">0 dipilih</span>
            <button onclick="notifClearSelection()" class="text-xs text-stone-500 hover:text-stone-700 underline">Batal</button>
          </div>
          <div class="flex items-center gap-1.5">
            <button onclick="notifBatchMarkRead()" class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-white hover:bg-blue-100 rounded-lg border border-blue-200 transition-all">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Tandai Dibaca
            </button>
            <button onclick="notifBatchDelete()" class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-white hover:bg-red-50 rounded-lg border border-red-200 transition-all">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              Hapus
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- Floating compose button (mobile) -->
    ${isAdmin ? `
    <button id="notif-fab-compose" onclick="notifSwitchView('compose')" 
            class="lg:hidden fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-30">
      <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 4v16m8-8H4"/></svg>
    </button>
    ` : ''}
  `;

  // Load data
  await Promise.all([notifLoadInbox(), notifLoadSent()]);
  if (isAdmin) await notifLoadKaryawan();
  notifSwitchView('inbox');
}

// ═══════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════

async function notifLoadInbox() {
  try {
    const data = await api.get('/notifikasi?type=inbox');
    notifAllData.inbox = data || [];
    const count = notifAllData.inbox.filter(n => !n.is_read).length;
    const el = document.getElementById('notif-inbox-count');
    if (el) {
      if (count > 0) {
        el.textContent = count > 99 ? '99+' : count;
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
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

// ═══════════════════════════════════════════════
// VIEW SWITCHING
// ═══════════════════════════════════════════════

function notifSwitchView(view) {
  notifCurrentView = view;
  notifSearchQuery = '';
  notifSelectedIds = new Set();
  notifSelectMode = false;
  const searchInput = document.getElementById('notif-search');
  if (searchInput) { searchInput.value = ''; }
  notifUpdateClearBtn();
  notifUpdateBatchBar(false);

  notifUpdateTabIndicator(view);

  const markBtn = document.getElementById('notif-mark-all-read');
  if (markBtn) {
    if (view === 'inbox') {
      const count = (notifAllData.inbox || []).filter(n => !n.is_read).length;
      markBtn.style.display = count > 0 ? '' : 'none';
    } else {
      markBtn.style.display = 'none';
    }
  }

  if (view === 'compose') {
    notifRenderCompose();
  } else {
    notifRenderList(view);
  }
}

// ═══════════════════════════════════════════════
// TAB INDICATOR
// ═══════════════════════════════════════════════

function notifUpdateTabIndicator(view) {
  const tabs = document.querySelectorAll('.notif-tab');
  tabs.forEach(b => {
    const isActive = b.dataset.view === view;
    b.classList.toggle('text-blue-700', isActive);
    b.classList.toggle('bg-blue-50', isActive);
    b.classList.toggle('shadow-sm', isActive);
    b.classList.toggle('text-stone-500', !isActive);
    b.classList.toggle('hover:bg-stone-100', !isActive);
    b.classList.toggle('hover:text-stone-700', !isActive);
  });
}

// ═══════════════════════════════════════════════
// SELECTION & BATCH
// ═══════════════════════════════════════════════

function notifToggleSelect(id) {
  if (notifSelectedIds.has(id)) {
    notifSelectedIds.delete(id);
  } else {
    notifSelectedIds.add(id);
  }
  const cb = document.querySelector(`.notif-cb-${id}`);
  if (cb) cb.checked = notifSelectedIds.has(id);
  notifSelectMode = notifSelectedIds.size > 0;
  document.querySelectorAll('.notif-row-item').forEach(el => {
    el.classList.toggle('notif-row-selected', notifSelectedIds.has(parseInt(el.dataset.nid)));
  });
  notifUpdateBatchBar(notifSelectMode);
}

function notifSelectAll(type) {
  const data = notifAllData[type] || [];
  if (notifSelectedIds.size === data.length) {
    // Deselect all
    notifSelectedIds.clear();
  } else {
    notifSelectedIds = new Set(data.map(n => n.id));
  }
  document.querySelectorAll('.notif-cb-main').forEach(cb => { cb.checked = notifSelectedIds.size === data.length && data.length > 0; });
  document.querySelectorAll('.notif-row-item').forEach(el => {
    const id = parseInt(el.dataset.nid);
    const cb = el.querySelector('.notif-row-cb');
    if (cb) cb.checked = notifSelectedIds.has(id);
    el.classList.toggle('notif-row-selected', notifSelectedIds.has(id));
  });
  notifSelectMode = notifSelectedIds.size > 0;
  notifUpdateBatchBar(notifSelectMode);
}

function notifClearSelection() {
  notifSelectedIds.clear();
  notifSelectMode = false;
  document.querySelectorAll('.notif-row-item').forEach(el => {
    el.classList.remove('notif-row-selected');
    const cb = el.querySelector('.notif-row-cb');
    if (cb) cb.checked = false;
  });
  document.querySelectorAll('.notif-cb-main').forEach(cb => cb.checked = false);
  notifUpdateBatchBar(false);
}

function notifUpdateBatchBar(show) {
  const bar = document.getElementById('notif-batch-bar');
  if (!bar) return;
  if (show && notifSelectedIds.size > 0) {
    bar.classList.remove('hidden');
    bar.classList.add('flex');
    document.getElementById('notif-batch-count').textContent = notifSelectedIds.size + ' dipilih';
  } else {
    bar.classList.add('hidden');
    bar.classList.remove('flex');
  }
}

async function notifBatchMarkRead() {
  if (notifSelectedIds.size === 0) return;
  try {
    const ids = Array.from(notifSelectedIds);
    for (const id of ids) {
      await api.put('/notifikasi/' + id + '/baca');
    }
    notifAllData.inbox.forEach(n => {
      if (notifSelectedIds.has(n.id)) n.is_read = 1;
    });
    showToast(ids.length + ' pesan ditandai sudah dibaca', 'success');
    notifClearSelection();
    notifLoadInbox();
    if (notifCurrentView === 'inbox') notifRenderList('inbox');
    if (typeof updateNotifSidebarBadge === 'function') updateNotifSidebarBadge();
  } catch (err) {
    showAlert('Gagal: ' + err.message);
  }
}

async function notifBatchDelete() {
  if (notifSelectedIds.size === 0) return;
  const ok = await showConfirm(
    'Hapus ' + notifSelectedIds.size + ' pesan terpilih?',
    'Ya, hapus semua',
    'Batal',
    'bg-red-600 hover:bg-red-700',
    'danger'
  );
  if (!ok) return;
  try {
    const ids = Array.from(notifSelectedIds);
    for (const id of ids) {
      await api.del('/notifikasi/' + id);
    }
    const type = notifCurrentView;
    if (notifAllData[type]) {
      notifAllData[type] = notifAllData[type].filter(n => !notifSelectedIds.has(n.id));
    }
    showToast(ids.length + ' pesan dihapus', 'success');
    notifClearSelection();
    if (notifCurrentView === type) notifRenderList(type);
    if (typeof updateNotifSidebarBadge === 'function') updateNotifSidebarBadge();
  } catch (err) {
    showAlert('Gagal: ' + err.message);
  }
}

// ═══════════════════════════════════════════════
// RENDER EMAIL LIST  (Redesigned)
// ═══════════════════════════════════════════════

function notifRenderList(type) {
  const area = document.getElementById('notif-main-area');
  if (!area) return;

  const data = notifAllData[type] || [];
  const search = (notifSearchQuery || '').toLowerCase();
  const filtered = search
    ? data.filter(n =>
        (n.judul || '').toLowerCase().includes(search) ||
        (n.pesan || '').toLowerCase().includes(search) ||
        (n.nama_penerima || '').toLowerCase().includes(search) ||
        (n.nama_pengirim || '').toLowerCase().includes(search)
      )
    : data;

  // ── Empty state ──
  if (!filtered.length) {
    const isSearch = !!search;
    area.innerHTML = `
      <div class="flex flex-col items-center justify-center py-24 px-4 animate-alert-in">
        <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-stone-50 to-stone-100 flex items-center justify-center mb-5 shadow-inner">
          ${notifEmptyIllus(type, isSearch)}
        </div>
        <h3 class="text-lg font-bold text-stone-700 mb-1.5">
          ${isSearch ? 'Pesan Tidak Ditemukan' : (type === 'inbox' ? 'Kotak Masuk Kosong' : 'Belum Ada Pesan Terkirim')}
        </h3>
        <p class="text-sm text-stone-400 text-center max-w-xs leading-relaxed">
          ${isSearch
            ? 'Coba gunakan kata kunci lain. Kami tidak menemukan pesan yang cocok dengan pencarian Anda.'
            : (type === 'inbox'
                ? 'Notifikasi dan pesan dari admin atau sistem akan muncul di sini. Jika ada pesan baru, Anda akan mendapat pemberitahuan.'
                : 'Pesan yang Anda kirim ke karyawan akan muncul di sini. Buat pesan baru dengan tombol di atas.')}
        </p>
        ${isSearch ? `
        <button onclick="notifClearSearch()" class="mt-6 px-5 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all">
          Hapus Pencarian
        </button>
        ` : (type === 'sent' ? `
        <button onclick="notifSwitchView('compose')" class="mt-6 px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-sm">
          <svg class="w-4 h-4 inline -mt-0.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 4v16m8-8H4"/></svg>
          Kirim Pesan Pertama
        </button>
        ` : '')}
      </div>
    `;
    return;
  }

  const isInbox = type === 'inbox';

  area.innerHTML = `
    <div class="flex flex-col h-full">
      <!-- Select-all bar (compact, shown on hover) -->
      <div class="hidden md:flex items-center gap-1.5 px-4 md:px-5 py-1.5 border-b border-stone-100 bg-stone-50/60 ${filtered.length > 0 ? '' : 'hidden'}">
        <label class="flex items-center gap-2 cursor-pointer select-none notif-cb-main-wrap" onclick="event.stopPropagation()">
          <input type="checkbox" onchange="notifSelectAll('${type}')" class="notif-cb-main sr-only peer" ${notifSelectedIds.size === filtered.length && filtered.length > 0 ? 'checked' : ''}>
          <span class="check-modern w-[18px] h-[18px] rounded-[5px] border-2 border-stone-300 peer-checked:border-blue-600 peer-checked:bg-blue-600 flex items-center justify-center transition-all duration-150 shadow-sm peer-checked:shadow-md hover:border-stone-400">
            <svg class="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-150" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
          </span>
          <span class="text-xs text-stone-500 hover:text-stone-700">Pilih semua</span>
        </label>
        <span class="text-stone-300 mx-1">|</span>
        <span class="text-xs text-stone-400">${filtered.length} ${type === 'inbox' ? 'pesan' : 'terkirim'}${search ? ' (hasil pencarian)' : ''}</span>
      </div>

      <!-- Email rows -->
      <div class="flex-1 overflow-y-auto">
        <div class="divide-y divide-stone-100">
          ${filtered.map((n, idx) => {
            const dateStr = notifFormatDate(n.created_at);
            const isUnread = isInbox && !n.is_read;
            const name = isInbox ? (n.nama_pengirim || 'Sistem') : (n.nama_penerima || '-');
            const preview = n.pesan ? (n.pesan.length > 140 ? n.pesan.slice(0, 140) + '…' : n.pesan) : '(tanpa pesan)';
            const avatarGrad = notifAvatarColor(name);
            const isSelected = notifSelectedIds.has(n.id);

            return `
              <div onclick="notifShowDetail('${type}', ${n.id})" 
                   data-nid="${n.id}"
                   class="notif-row-item group relative flex items-start gap-2.5 md:gap-3 px-3 md:px-5 py-3 md:py-3.5 cursor-pointer transition-all duration-150 hover:bg-blue-50/50 ${isUnread ? 'bg-white' : 'bg-white'} ${isSelected ? 'notif-row-selected bg-blue-50/70' : ''}">
                
                <!-- Left accent bar (unread) -->
                ${isUnread ? '<div class="absolute left-0 top-3 bottom-3 w-0.5 bg-blue-500 rounded-full"></div>' : ''}

                <!-- Checkbox (show on hover, always if in select mode) -->
                <div class="shrink-0 flex items-start pt-1 md:pt-1.5 ${notifSelectMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-150" onclick="event.stopPropagation()">
                  <label class="block cursor-pointer">
                    <input type="checkbox" 
                           onchange="notifToggleSelect(${n.id})" 
                           class="notif-row-cb notif-cb-${n.id} sr-only peer" 
                           ${isSelected ? 'checked' : ''}>
                    <span class="check-modern block w-[18px] h-[18px] rounded-[5px] border-2 border-stone-300 peer-checked:border-blue-600 peer-checked:bg-blue-600 flex items-center justify-center transition-all duration-150 shadow-sm peer-checked:shadow-md hover:border-stone-400">
                      <svg class="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                    </span>
                  </label>
                </div>

                <!-- Avatar -->
                <div class="w-9 h-9 md:w-10 md:h-10 rounded-full shrink-0 flex items-center justify-center text-xs md:text-sm font-bold text-white bg-gradient-to-br ${avatarGrad} shadow-sm ${isUnread ? 'ring-2 ring-blue-200 ring-offset-1 ring-offset-white' : ''}">
                  ${getInitials(name)}
                </div>

                <!-- Content -->
                <div class="flex-1 min-w-0 pt-0.5">
                  <div class="flex items-center justify-between gap-2 mb-0.5">
                    <span class="text-sm md:text-sm font-semibold truncate ${isUnread ? 'text-stone-900' : 'text-stone-600'}">${escHtml(name)}</span>
                    <span class="text-[11px] md:text-xs whitespace-nowrap shrink-0 ml-1 ${isUnread ? 'text-blue-600 font-semibold' : 'text-stone-400'}">${dateStr}</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <div class="flex-1 min-w-0">
                      <div class="text-sm md:text-sm leading-snug mb-0.5 font-medium truncate ${isUnread ? 'text-stone-800' : 'text-stone-600'}">${escHtml(n.judul)}</div>
                      <div class="text-[13px] md:text-xs leading-relaxed truncate text-stone-400">${escHtml(preview)}</div>
                    </div>
                    <!-- Action buttons (hover only) -->
                    <div class="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150" onclick="event.stopPropagation()">
                      <button onclick="notifHapus(${n.id},'${type}')" 
                              class="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" 
                              title="Hapus">
                        <svg class="w-3.5 h-3.5 md:w-4 md:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Unread dot -->
                ${isUnread ? '<div class="w-2 h-2 rounded-full bg-blue-500 mt-2.5 shrink-0"></div>' : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Footer count -->
      <div class="shrink-0 px-4 md:px-5 py-2.5 md:py-3 text-center text-xs text-stone-400 bg-white/80 backdrop-blur-sm border-t border-stone-100">
        ${filtered.length} ${type === 'inbox' ? 'pesan' : 'pesan terkirim'}
        ${search ? '<span class="text-stone-300 mx-1.5">·</span> hasil pencarian' : ''}
      </div>
    </div>
  `;

  // Staggered animation
  notifStaggerIn(area);
}

// ═══════════════════════════════════════════════
// DETAIL VIEW  (Redesigned)
// ═══════════════════════════════════════════════

function notifShowDetail(type, id) {
  const data = notifAllData[type] || [];
  const n = data.find(item => item.id === id);
  if (!n) return;

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
  const avatarGrad = notifAvatarColor(name);
  const initials = getInitials(name);

  if (type === 'inbox') notifLoadInbox();

  area.innerHTML = `
    <div class="flex flex-col h-full">
      <!-- Back bar (glass) -->
      <div class="flex items-center justify-between px-3 md:px-5 py-2.5 md:py-3 border-b border-stone-100 bg-white/90 backdrop-blur-sm sticky top-0 z-10">
        <button onclick="notifSwitchView('${type}')" class="flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-blue-600 transition-all group">
          <svg class="w-4 h-4 transition-transform group-hover:-translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M19 12H5m7 7l-7-7 7-7"/></svg>
          Kembali
        </button>
        <div class="flex items-center gap-2">
          ${(role === 'admin' || role === 'keuangan') ? `
          <button onclick="notifReply('${type}', '${escHtml(n.judul).replace(/'/g, "\\'")}', '${escHtml(name).replace(/'/g, "\\'")}')" 
                  class="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
            <span class="hidden md:inline">Balas</span>
          </button>
          ` : ''}
          <button onclick="notifHapus(${n.id},'${type}')" 
                  class="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Hapus">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto px-3 md:px-6 py-4 md:py-8 lg:px-10">
        <div class="max-w-100 mx-auto">
          <!-- Subject -->
          <h2 class="text-xl md:text-2xl lg:text-3xl font-bold text-stone-800 mb-5 md:mb-6 leading-snug">${escHtml(n.judul)}</h2>
          
          <!-- Sender card (elevated) -->
          <div class="flex items-center gap-3.5 mb-6 md:mb-8 p-4 md:p-5 bg-gradient-to-br from-stone-50 to-white rounded-2xl border border-stone-200/80 shadow-sm">
            <div class="w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-base md:text-lg font-bold text-white bg-gradient-to-br ${avatarGrad} shadow-md shrink-0">${initials}</div>
            <div class="min-w-0 flex-1">
              <div class="text-base md:text-lg font-bold text-stone-800">${escHtml(name)}</div>
              <div class="text-xs md:text-sm text-stone-400 mt-1 flex flex-wrap items-center gap-x-1.5">
                <span class="font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">${label}</span>
                <span>·</span>
                <span>${date}</span>
              </div>
            </div>
            <div class="shrink-0 hidden md:block">
              <div class="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-400 shadow-sm">
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
            </div>
          </div>

          <!-- Message body -->
          ${n.pesan ? `
          <div class="relative">
            <!-- Quote decoration -->
            <div class="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 to-blue-600 rounded-full"></div>
            <div class="text-sm md:text-base leading-7 md:leading-7 text-stone-700 whitespace-pre-wrap bg-white p-4 md:p-6 pl-5 md:pl-7 rounded-2xl border border-stone-100 shadow-sm">
              ${escHtml(n.pesan)}
            </div>
          </div>
          ` : `
          <div class="flex items-center justify-center py-12 text-sm italic text-stone-400 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
            <svg class="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/></svg>
            (Tidak ada isi pesan)
          </div>
          `}

          <!-- Actions bottom -->
          <div class="flex items-center gap-2 mt-8 pt-5 border-t border-stone-100">
            ${(role === 'admin' || role === 'keuangan') ? `
            <button onclick="notifReply('${type}', '${escHtml(n.judul).replace(/'/g, "\\'")}', '${escHtml(name).replace(/'/g, "\\'")}')" 
                    class="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 active:scale-[0.97] rounded-xl transition-all shadow-sm hover:shadow-md">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
              Balas
            </button>
            ` : ''}
            <button onclick="notifHapus(${n.id},'${type}')" 
                    class="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-100 rounded-xl transition-all">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              Hapus
            </button>
            <button onclick="notifSwitchView('${type}')" 
                    class="px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-xl transition-all">
              Kembali ke daftar
            </button>
          </div>
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
  notifUpdateTabIndicator('compose');
}

// ═══════════════════════════════════════════════
// COMPOSE VIEW (Redesigned)
// ═══════════════════════════════════════════════

function notifRenderCompose(replyJudul, replyNama) {
  const area = document.getElementById('notif-main-area');
  if (!area) return;

  const karyawan = notifKaryawanList || [];

  area.innerHTML = `
    <div class="flex flex-col h-full">
      <!-- Header -->
      <div class="flex items-center justify-between px-3 md:px-6 py-3 md:py-4 border-b border-stone-200 bg-white sticky top-0 z-10">
        <div class="flex items-center gap-2.5">
          <button onclick="notifSwitchView('inbox')" class="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-all md:hidden">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M19 12H5m7 7l-7-7 7-7"/></svg>
          </button>
          <h3 class="text-base md:text-lg font-bold text-stone-800 flex items-center gap-2">
            <svg class="w-4 h-4 md:w-5 md:h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 4v16m8-8H4"/></svg>
            Pesan Baru
          </h3>
        </div>
        <button onclick="notifSwitchView('inbox')" class="hidden md:block p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-all">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- Form -->
      <div class="flex-1 overflow-y-auto px-3 md:px-6 py-5 md:py-8">
        <div class="max-w-2xl mx-auto space-y-5 md:space-y-6">
          
          <!-- Penerima -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-stone-500 uppercase tracking-wider">Kepada</label>
            <div class="relative">
              <select id="notif-penerima" class="w-full pl-3 pr-10 py-3 text-sm bg-white border-2 border-stone-200 rounded-xl focus:border-blue-400 focus:ring-0 outline-none transition-all appearance-none hover:border-stone-300">
                <option value="">— Pilih penerima —</option>
                ${karyawan.map(k => `<option value="${k.id}">${escHtml(k.nama)}${k.jabatan_nama ? ' — ' + escHtml(k.jabatan_nama) : ''}</option>`).join('')}
              </select>
              <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M19 9l-7 7-7-7"/></svg>
            </div>
          </div>

          <!-- Kirim ke Semua toggle -->
          <label class="flex items-center gap-3.5 p-3.5 bg-gradient-to-r from-blue-50 to-blue-50/30 rounded-2xl cursor-pointer group hover:from-blue-100 hover:to-blue-50 transition-all border-2 border-blue-100 hover:border-blue-200 select-none">
            <div class="relative w-[44px] h-[24px] shrink-0">
              <input type="checkbox" id="notif-semua" onchange="notifToggleAll()" class="sr-only peer">
              <div class="block w-[44px] h-[24px] rounded-full bg-stone-300 peer-checked:bg-blue-600 transition-colors duration-200"></div>
              <div class="absolute left-0.5 top-0.5 w-[20px] h-[20px] rounded-full bg-white shadow transition-transform duration-200 peer-checked:translate-x-[22px] peer-checked:shadow-md"></div>
            </div>
            <div class="min-w-0">
              <div class="text-sm font-semibold text-stone-700 group-hover:text-blue-700 transition-colors">Kirim ke semua karyawan aktif</div>
              <div class="text-xs mt-0.5 ${karyawan.length > 0 ? 'text-blue-500 font-medium' : 'text-stone-400'}">${karyawan.length} karyawan akan menerima notifikasi ini</div>
            </div>
            <svg class="w-5 h-5 ml-auto text-blue-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" d="M12 8v8m-4-4h8"/></svg>
          </label>

          <!-- Subjek -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-stone-500 uppercase tracking-wider">Subjek</label>
            <div class="relative">
              <input id="notif-judul" value="${replyJudul ? 'Re: ' + escHtml(replyJudul) : ''}"
                     class="w-full px-3.5 py-3 text-sm bg-white border-2 border-stone-200 rounded-xl focus:border-blue-400 focus:ring-0 outline-none transition-all hover:border-stone-300 placeholder:text-stone-400" 
                     placeholder="Subjek pesan..." />
            </div>
          </div>

          <!-- Pesan -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-stone-500 uppercase tracking-wider">Pesan</label>
            <div class="relative">
              <textarea id="notif-pesan" rows="8" oninput="notifAutoResize(this)"
                        class="w-full px-3.5 py-3 text-sm bg-white border-2 border-stone-200 rounded-xl focus:border-blue-400 focus:ring-0 outline-none transition-all resize-none min-h-[160px] hover:border-stone-300 placeholder:text-stone-400" 
                        placeholder="Tulis pesan Anda di sini...">${replyNama ? '\n\n— — —\nBalas ke: ' + escHtml(replyNama) + '' : ''}</textarea>
            </div>
            <div class="flex items-center justify-between text-xs text-stone-400">
              <div class="flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span>Tekan Enter untuk baris baru</span>
              </div>
              <span id="notif-charcount" class="text-stone-400 font-mono"></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer actions -->
      <div class="px-3 md:px-6 py-3.5 md:py-4 border-t border-stone-200 bg-white/90 backdrop-blur-sm">
        <div class="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button id="notif-kirim-btn" onclick="notifKirim(this)" 
                    class="flex items-center gap-1.5 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 active:scale-[0.97] text-white text-sm font-bold rounded-xl transition-all shadow-sm hover:shadow-md">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
              <span>Kirim Pesan</span>
            </button>
            <button onclick="notifSwitchView('inbox')" 
                    class="px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-xl transition-all">
              Batal
            </button>
          </div>
          <div class="text-xs text-stone-400 flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span>Akan langsung terkirim</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Auto-resize initial
  const ta = document.getElementById('notif-pesan');
  if (ta) notifAutoResize(ta);
}

function notifAutoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.max(el.scrollHeight, 160) + 'px';
  const cc = document.getElementById('notif-charcount');
  if (cc) cc.textContent = el.value.length ? el.value.length + ' karakter' : '';
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
    if (typeof updateNotifSidebarBadge === 'function') updateNotifSidebarBadge();
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
    if (typeof updateNotifSidebarBadge === 'function') updateNotifSidebarBadge();
  } catch (err) {
    console.error('Mark all read error:', err);
  }
}

// ── Search debounce ──
let notifSearchTimer = null;
function notifSearchDebounce() {
  clearTimeout(notifSearchTimer);
  notifSearchTimer = setTimeout(() => {
    const searchInput = document.getElementById('notif-search');
    const val = searchInput?.value || '';
    notifSearchQuery = val;
    notifUpdateClearBtn();
    if (notifCurrentView !== 'compose') {
      notifRenderList(notifCurrentView);
    }
  }, 200);
}

function notifClearSearch() {
  const searchInput = document.getElementById('notif-search');
  if (searchInput) searchInput.value = '';
  notifSearchQuery = '';
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
    if (typeof updateNotifSidebarBadge === 'function') updateNotifSidebarBadge();
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


