// ── CHAT ANTAR USER ──
// Tanpa WebSocket/SSE: polling daftar kontak 15 dtk, polling pesan 3 dtk saat obrolan terbuka.
// Room 'umum' = obrolan bersama satu tenant; room 'uA:uB' = privat 1-on-1.

let chatState = {
  activeRoom: null,
  activeName: '',
  activeUserId: null,
  activeOnline: null,
  lastMsgId: 0,
  umum: null,
  contacts: [],
  activeFoto: null,
  contactsTimer: null,
  msgTimer: null,
  convOpen: false,
};

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function chatAvatarHTML(foto, nama, sizeClass) {
  if (foto && typeof foto === 'string' && /^data:image\//.test(foto)) {
    return `<img src="${foto}" alt="" class="${sizeClass} rounded-full object-cover border shrink-0" style="border-color:var(--border)">`;
  }
  return `<div class="${sizeClass} rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style="background:linear-gradient(135deg,#10b981,#059669)">${getInitials(nama)}</div>`;
}

function chatRoleLabel(role) {
  return { admin: 'Admin', ahli_gizi: 'Ahli Gizi', gudang: 'Gudang', keuangan: 'Keuangan', produksi: 'Produksi' }[role] || role || '';
}

// Waktu & tanggal chat disajikan dalam WIB (UTC+7) yang dihitung MANUAL.
// Tidak bergantung pada opsi timeZone toLocaleTimeString/toLocaleDateString,
// agar konsisten walau perangkat/browser memakai zona waktu lain (mis. UTC).
const CHAT_WIB_OFFSET_MS = 7 * 3600 * 1000;
const CHAT_HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const CHAT_BULAN_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function chatParseDate(d) {
  if (d == null) return null;
  let x;
  if (d instanceof Date) {
    x = d;
  } else {
    const s = String(d).trim();
    if (s.includes('T') || s.includes('Z') || s.includes('+') || s.endsWith(')')) {
      x = new Date(s);
    } else {
      x = new Date(s + 'Z'); // string tanpa penanda zona dianggap UTC
    }
  }
  return isNaN(x.getTime()) ? null : x;
}

// Geser instan ke jam WIB (UTC+7) lalu baca via getUTC* — konsisten di semua zona perangkat.
function chatToWib(x) {
  return new Date(x.getTime() + CHAT_WIB_OFFSET_MS);
}

// Kunci tanggal (YYYY-MM-DD) dalam zona WIB.
function chatWibDate(x) {
  const wib = chatToWib(x);
  return wib.getUTCFullYear() + '-' + String(wib.getUTCMonth() + 1).padStart(2, '0') + '-' + String(wib.getUTCDate()).padStart(2, '0');
}

function chatTime(d) {
  const x = chatParseDate(d);
  if (!x) return '';
  const wib = chatToWib(x);
  return String(wib.getUTCHours()).padStart(2, '0') + '.' + String(wib.getUTCMinutes()).padStart(2, '0');
}

// Stempel waktu lengkap WIB untuk tooltip (mis. "Kamis, 6 Agu 2026 15.28").
function chatFullStamp(d) {
  const x = chatParseDate(d);
  if (!x) return '';
  const wib = chatToWib(x);
  return CHAT_HARI_ID[wib.getUTCDay()] + ', ' + wib.getUTCDate() + ' ' + CHAT_BULAN_ID[wib.getUTCMonth()] + ' ' + wib.getUTCFullYear() + ' ' + chatTime(d);
}

// Label waktu pintar: relatif untuk pesan baru, tanggal penuh untuk pesan lama.
// Semua dibandingkan/dihitung dalam WIB agar konsisten di semua zona perangkat.
function chatSmartTime(d) {
  const x = chatParseDate(d);
  if (!x) return '';
  const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const diff = Date.now() - x.getTime();
  if (diff < MIN) return 'Baru saja';
  if (diff < HOUR) return Math.floor(diff / MIN) + ' menit lalu';
  if (diff < DAY) return Math.floor(diff / HOUR) + ' jam lalu';
  const now = new Date();
  const key = chatWibDate(x);
  if (key === chatWibDate(new Date(now.getTime() - DAY))) return 'Kemarin';
  const wib = chatToWib(x);
  return CHAT_HARI_ID[wib.getUTCDay()] + ', ' + wib.getUTCDate() + ' ' + CHAT_BULAN_ID[wib.getUTCMonth()] + ' ' + wib.getUTCFullYear();
}

// Segarkan label waktu relatif pada pesan yang sudah dirender (dipanggil tiap polling).
function chatRefreshTimes() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  container.querySelectorAll('.chat-time[data-ts]').forEach(el => {
    const label = chatSmartTime(el.getAttribute('data-ts'));
    if (el.textContent !== label) el.textContent = label;
  });
}

function chatDayKey(d) {
  const x = chatParseDate(d);
  return x ? chatWibDate(x) : '';
}

function chatDayLabel(d) {
  const x = chatParseDate(d);
  if (!x) return '';
  const now = new Date();
  const todayWib = chatWibDate(now);
  const yesterdayWib = chatWibDate(new Date(now.getTime() - 86400000));
  const key = chatWibDate(x);
  if (key === todayWib) return 'Hari ini';
  if (key === yesterdayWib) return 'Kemarin';
  const wib = chatToWib(x);
  return CHAT_HARI_ID[wib.getUTCDay()] + ', ' + wib.getUTCDate() + ' ' + CHAT_BULAN_ID[wib.getUTCMonth()] + ' ' + wib.getUTCFullYear();
}

function chatTotalUnread() {
  let n = (chatState.umum && chatState.umum.unread) || 0;
  (chatState.contacts || []).forEach(c => { n += (c.unread || 0); });
  return n;
}

function chatUpdateBadge() {
  const n = chatTotalUnread();
  ['chat-badge', 'chat-badge-mobile'].forEach(id => {
    const badge = document.getElementById(id);
    if (!badge) return;
    if (n > 0) {
      badge.textContent = n > 99 ? '99+' : n;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  });
}

function chatSetSubtitle() {
  const el = document.getElementById('chat-panel-subtitle');
  if (!el) return;
  const on = (chatState.umum && chatState.umum.online_count) || 0;
  el.textContent = on > 0 ? `${on} user online` : 'Tidak ada user online';
}

function chatPanelOpen() {
  return document.getElementById('chat-panel').classList.contains('translate-x-0');
}

function openChatPanel() {
  const p = document.getElementById('chat-panel');
  p.classList.remove('translate-x-full');
  p.classList.add('translate-x-0');
  showChatContacts();
  chatRefreshContacts();
}

function closeChatPanel() {
  const p = document.getElementById('chat-panel');
  p.classList.add('translate-x-full');
  p.classList.remove('translate-x-0');
  stopChatMsgTimer();
  chatState.convOpen = false;
  chatUpdateBadge();
}

function toggleChatPanel() {
  if (chatPanelOpen()) closeChatPanel();
  else openChatPanel();
}

function startChatContactsTimer() {
  stopChatContactsTimer();
  chatState.contactsTimer = setInterval(() => {
    if (chatState.convOpen) return;
    chatRefreshContacts(true);
  }, 15000);
}
function stopChatContactsTimer() {
  if (chatState.contactsTimer) { clearInterval(chatState.contactsTimer); chatState.contactsTimer = null; }
}

async function chatRefreshContacts(silent) {
  try {
    const d = await api.get('/chat/contacts');
    chatState.umum = d.umum;
    chatState.contacts = d.contacts || [];
    chatUpdateBadge();
    chatSetSubtitle();
    const cv = document.getElementById('chat-contacts-view');
    if (cv && !cv.classList.contains('hidden')) renderChatContacts();
  } catch (err) {
    if (!silent) showToast('Gagal memuat kontak: ' + err.message, 'error');
  }
}

function renderChatContacts() {
  const cv = document.getElementById('chat-contacts-view');
  if (!cv) return;
  const um = chatState.umum;
  const contacts = chatState.contacts || [];

  const umumHtml = `
    <div class="p-2 mx-2 mt-2 rounded-xl cursor-pointer hover:bg-stone-50 flex items-center gap-3" style="border:1px solid var(--border);background:var(--bg-sidebar-hover)" onclick="openChatRoom('umum','Ngobrol Semua',null)">
      <div class="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0" style="background:linear-gradient(135deg,#059669,#10b981)">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-sm" style="color:var(--text-body)">Ngobrol Semua</div>
        <div class="text-[11px]" style="color:var(--text-body);opacity:.55">${um && um.online_count ? um.online_count + ' user online' : 'Room bersama'}</div>
      </div>
      ${um && um.unread ? `<span class="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1.5 shrink-0">${um.unread}</span>` : ''}
    </div>`;

  const sorted = [...contacts].sort((a, b) => (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0) || a.nama.localeCompare(b.nama));
  const contactHtml = sorted.map(c => `
    <div class="flex items-center gap-3 p-2 mx-2 rounded-lg cursor-pointer hover:bg-stone-50 transition-colors" onclick="openChatRoom('${esc(c.room)}','${esc(c.nama)}',${c.user_id})">
      <div class="relative shrink-0">
        ${chatAvatarHTML(c.foto, c.nama, 'w-9 h-9')}
        <span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 ${c.is_online ? 'bg-emerald-500' : 'bg-stone-300'}" style="border-color:var(--bg-card)" title="${c.is_online ? 'Online' : 'Offline'}"></span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="font-medium text-sm truncate" style="color:var(--text-body)">${esc(c.nama)}</span>
          ${c.is_online ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>' : ''}
        </div>
        <div class="text-[10px] truncate" style="color:var(--text-body);opacity:.55">${esc(chatRoleLabel(c.role)) || 'Anggota'}</div>
      </div>
      ${c.unread ? `<span class="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1.5 shrink-0">${c.unread}</span>` : ''}
    </div>`).join('');

  cv.innerHTML = `
    <div class="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider" style="color:var(--text-body);opacity:.45">Obrolan</div>
    ${umumHtml}
    <div class="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider" style="color:var(--text-body);opacity:.45">User Online (${contacts.length})</div>
    ${sorted.length ? contactHtml : '<div class="text-sm text-center py-6" style="color:var(--text-body);opacity:.4">Belum ada anggota lain</div>'}
  `;
}

function showChatContacts() {
  document.getElementById('chat-conversation-view').classList.add('hidden');
  document.getElementById('chat-contacts-view').classList.remove('hidden');
  chatState.convOpen = false;
  stopChatMsgTimer();
  chatUpdateBadge();
}

function chatBackToContacts() {
  showChatContacts();
  renderChatContacts();
  chatRefreshContacts(true);
}

function openChatRoom(room, name, userId) {
  document.getElementById('chat-contacts-view').classList.add('hidden');
  document.getElementById('chat-conversation-view').classList.remove('hidden');
  document.getElementById('chat-conversation-view').classList.add('flex');

  chatState.activeRoom = room;
  chatState.activeName = name;
  chatState.activeUserId = userId;
  chatState.lastMsgId = 0;
  const _c = (chatState.contacts || []).find(x => x.room === room);
  chatState.activeFoto = userId ? (_c && _c.foto) || null : null;

  document.getElementById('chat-conv-title').textContent = name;
  const dot = document.getElementById('chat-conv-dot');
  const subEl = document.getElementById('chat-conv-online');
  const isOnline = room === 'umum' ? true : !!(_c && _c.is_online);
  dot.className = 'w-1.5 h-1.5 rounded-full inline-block ' + (isOnline ? 'bg-emerald-500' : 'bg-stone-300');
  subEl.textContent = room === 'umum' ? 'Room bersama' : (isOnline ? 'Online' : 'Offline');

  // Clear unread untuk room ini
  if (room === 'umum' && chatState.umum) chatState.umum.unread = 0;
  const cc = (chatState.contacts || []).find(x => x.room === room);
  if (cc) cc.unread = 0;
  chatUpdateBadge();

  const msgs = document.getElementById('chat-messages');
  msgs.innerHTML = '<div class="text-center text-xs py-8" style="color:var(--text-body);opacity:.4">Memuat...</div>';
  chatState.convOpen = true;

  loadChatMessages(room, 0, true);
  startChatMsgTimer();
  setTimeout(() => { const inp = document.getElementById('chat-input'); if (inp) inp.focus(); }, 150);
}

function startChatMsgTimer() {
  stopChatMsgTimer();
  chatState.msgTimer = setInterval(() => {
    if (chatState.convOpen && chatState.activeRoom) {
      loadChatMessages(chatState.activeRoom, chatState.lastMsgId, false);
    }
  }, 3000);
}
function stopChatMsgTimer() {
  if (chatState.msgTimer) { clearInterval(chatState.msgTimer); chatState.msgTimer = null; }
}

function chatMarkRead(room) {
  if (!room) return;
  api.post('/chat/read', { room }).catch(() => {});
}

async function loadChatMessages(room, after, reset) {
  const container = document.getElementById('chat-messages');
  const ph = (msg) => `<div class="text-center text-xs py-8" style="color:var(--text-body);opacity:.4">${msg}</div>`;
  if (reset) {
    container.innerHTML = ph('Memuat...');
    chatState.lastMsgId = 0;
    chatState.msgsLoaded = false;
  }
  try {
    const d = await api.get('/chat/messages?room=' + encodeURIComponent(room) + '&after=' + (after || 0));
    // Segarkan label "x menit lalu" pada pesan lama tiap polling walau tak ada pesan baru.
    chatRefreshTimes();
    const msgs = d.messages || [];
    if (!msgs.length) {
      if (reset) {
        container.innerHTML = ph('Belum ada pesan. Mulai obrolan!');
        chatState.msgsLoaded = true;
        chatMarkRead(room);
      }
      return;
    }
    if (reset || !chatState.msgsLoaded) {
      container.innerHTML = '';
      chatState.msgsLoaded = true;
      chatState.lastMsgId = 0;
    }
    let lastRenderedDay = null;
    const first = container.querySelector('[data-day]');
    lastRenderedDay = first ? first.getAttribute('data-day') : null;
    let appendHtml = '';
    msgs.forEach(m => {
      if (m.id <= chatState.lastMsgId) return;
      chatState.lastMsgId = m.id;
      const day = chatDayKey(m.created_at);
      const showDay = day !== lastRenderedDay;
      lastRenderedDay = day;
      appendHtml += renderChatMsg(m, showDay);
    });
    if (appendHtml) {
      const wasNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
      container.insertAdjacentHTML('beforeend', appendHtml);
      if (reset || wasNearBottom) container.scrollTop = container.scrollHeight;
    }
    chatMarkRead(room);
  } catch (err) {
    if (reset) {
      container.innerHTML = ph('Gagal memuat pesan');
    }
  }
}

function renderChatMsg(m, showDay) {
  const mine = currentUser && m.sender_id === currentUser.id;
  const day = chatDayKey(m.created_at);
  const dayBlock = showDay
    ? `<div data-day="${day}" class="text-center text-[10px] font-medium my-2" style="color:var(--text-body);opacity:.4">${chatDayLabel(m.created_at)}</div>`
    : '';
  const time = chatSmartTime(m.created_at);
  const stamp = chatFullStamp(m.created_at);
  const body = m.body.replace(/\n/g, '<br>');

  if (mine) {
    return dayBlock + `
      <div class="chat-msg-anim flex justify-end">
        <div class="max-w-[78%] flex flex-col items-end">
          <div class="px-4 py-2 rounded-2xl rounded-br-sm chat-bubble-mine text-sm whitespace-pre-wrap break-words">
            ${body}
          </div>
          <div class="chat-time mine mt-1 pr-1" data-ts="${esc(m.created_at)}" title="${stamp}">${time}</div>
          <button class="chat-del-btn text-[10px] px-1.5 py-0.5 rounded text-red-500 hover:bg-red-50 transition mt-1" data-msg-id="${m.id}" title="Hapus">Hapus</button>
        </div>
      </div>`;
  }
  return dayBlock + `
    <div class="chat-msg-anim flex items-end gap-2">
      ${chatAvatarHTML(m.sender_id === chatState.activeUserId ? chatState.activeFoto : null, m.sender_nama, 'w-6 h-6')}
      <div class="max-w-[78%] flex flex-col">
        ${m.sender_id !== chatState.activeUserId ? `<div class="text-[10px] font-semibold mb-0.5 px-1" style="color:var(--text-body);opacity:.55">${esc(m.sender_nama || 'User')}</div>` : ''}
        <div class="px-4 py-2 rounded-2xl rounded-bl-sm chat-bubble-other text-sm whitespace-pre-wrap break-words">
          ${body}
        </div>
        <div class="chat-time other mt-1 pl-1" data-ts="${esc(m.created_at)}" title="${stamp}">${time}</div>
        <button class="chat-del-btn text-[10px] px-1.5 py-0.5 rounded text-red-500 hover:bg-red-50 transition mt-1 ml-1 self-start" data-msg-id="${m.id}" title="Hapus">Hapus</button>
      </div>
    </div>`;
}

async function chatSend() {
  const inp = document.getElementById('chat-input');
  const body = (inp.value || '').trim();
  if (!body) return;
  if (!chatState.activeRoom) { showToast('Pilih room dulu', 'error'); return; }
  try {
    const d = await api.post('/chat/messages', { room: chatState.activeRoom, body });
    inp.value = '';
    const container = document.getElementById('chat-messages');
    chatState.lastMsgId = d.message.id;
    chatState.msgsLoaded = true;
    container.insertAdjacentHTML('beforeend', renderChatMsg(d.message, true));
    container.scrollTop = container.scrollHeight;
    inp.focus();
  } catch (err) {
    showToast('Gagal mengirim: ' + err.message, 'error');
  }
}

// Buka chat 1-on-1 dengan user tertentu (dipanggil dari klik user online di dashboard).
async function openChatWithUser(userId) {
  try {
    if (currentUser && Number(userId) === currentUser.id) {
      showToast('Itu akun kamu sendiri', 'info');
      return;
    }
    const d = await api.get('/chat/contacts');
    chatState.umum = d.umum;
    chatState.contacts = d.contacts || [];
    const c = (d.contacts || []).find(x => x.user_id === Number(userId));
    if (!c) { showToast('User tidak ditemukan', 'error'); return; }
    openChatPanel();
    openChatRoom(c.room, c.nama, c.user_id);
  } catch (err) {
    showToast('Gagal membuka chat: ' + err.message, 'error');
  }
}

async function chatDelete(msgId) {
  if (!chatState.activeRoom) return;
  const ok = await showConfirm('Hapus pesan ini?', 'Hapus');
  if (!ok) return;
  try {
    await api.post('/chat/delete', { room: chatState.activeRoom, msg_id: msgId });
    const el = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (el) {
      const bubble = el.closest('.chat-msg-anim');
      if (bubble) bubble.remove();
    }
  } catch (err) {
    showToast('Gagal hapus: ' + err.message, 'error');
  }
}

// Event delegation untuk tombol hapus
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.chat-del-btn');
  if (btn) {
    const msgId = parseInt(btn.dataset.msgId, 10);
    if (msgId) chatDelete(msgId);
  }
});

function initChat() {
  const inp = document.getElementById('chat-input');
  if (inp) {
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); chatSend(); } });
  }
  // Polling kontak berjalan di latar agar badge chat baru selalu segar
  // meski panel tertutup (badge = total chat masuk yang belum dibaca).
  startChatContactsTimer();
  chatRefreshContacts(true);
}

window.toggleChatPanel = toggleChatPanel;
window.closeChatPanel = closeChatPanel;
window.chatSend = chatSend;
window.chatBackToContacts = chatBackToContacts;
window.openChatRoom = openChatRoom;
window.openChatWithUser = openChatWithUser;
window.initChat = initChat;
