async function renderNotifikasi() {
  const c = document.getElementById('content');
  const role = currentUser?.role || '';
  const isAdmin = role === 'admin' || role === 'keuangan';

  c.innerHTML = `
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-bold">Notifikasi & Pengumuman</h2>
        <div class="flex gap-2">
          <button class="tab-btn px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white" data-tab="inbox" onclick="switchNotifTab('inbox')">Kotak Masuk</button>
          ${isAdmin ? `<button class="tab-btn px-4 py-2 text-sm font-medium rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50" data-tab="kirim" onclick="switchNotifTab('kirim')">Kirim Pesan</button>` : ''}
        </div>
      </div>
      <div id="notif-content">
        <div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>
      </div>
    </div>
  `;
  switchNotifTab('inbox');
}

function switchNotifTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('bg-blue-600', 'text-white');
    b.classList.add('border', 'border-stone-300', 'text-stone-600', 'hover:bg-stone-50');
  });
  const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (btn) {
    btn.classList.add('bg-blue-600', 'text-white');
    btn.classList.remove('border', 'border-stone-300', 'text-stone-600', 'hover:bg-stone-50');
  }
  if (tab === 'inbox') renderNotifInbox();
  else renderNotifKirim();
}

async function renderNotifInbox() {
  const el = document.getElementById('notif-content');
  const role = currentUser?.role || '';
  const isAdmin = role === 'admin' || role === 'keuangan';
  try {
    const list = await api.get('/notifikasi');
    if (!list.length) {
      el.innerHTML = '<div class="text-center py-24 text-stone-400"><svg class="w-16 h-16 mx-auto mb-4 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg><div class="text-lg font-medium">Belum ada notifikasi</div></div>';
      return;
    }
    if (isAdmin) {
      el.innerHTML = `<div class="space-y-2">${list.map(n => {
        const date = new Date(n.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `<div class="bg-white rounded-xl border border-stone-200 p-4 transition-colors">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="font-semibold text-sm text-stone-800">${escHtml(n.judul)}</div>
              <div class="text-xs text-stone-500 mt-1">Kepada: <span class="font-medium">${escHtml(n.nama_penerima || '-')}</span></div>
              ${n.pesan ? `<div class="text-xs text-stone-600 mt-2 whitespace-pre-wrap">${escHtml(n.pesan)}</div>` : ''}
            </div>
            <div class="text-[10px] text-stone-400 whitespace-nowrap shrink-0">${date}</div>
          </div>
        </div>`;
      }).join('')}</div>`;
    } else {
      const unread = list.filter(n => !n.is_read);
      el.innerHTML = `
        ${unread.length ? `<div class="flex justify-end mb-3"><button onclick="bacaSemuaNotif()" class="text-xs text-blue-600 hover:text-blue-800 font-medium">Tandai semua sudah dibaca</button></div>` : ''}
        <div class="space-y-2">${list.map(n => {
          const date = new Date(n.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          return `<div class="rounded-xl border p-4 transition-colors ${n.is_read ? 'bg-white border-stone-200' : 'bg-blue-50 border-blue-200'}" data-id="${n.id}">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  ${!n.is_read ? '<span class="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>' : ''}
                  <div class="font-semibold text-sm ${n.is_read ? 'text-stone-800' : 'text-blue-900'}">${escHtml(n.judul)}</div>
                </div>
                ${n.nama_pengirim ? `<div class="text-xs text-stone-500 mt-1">Dari: <span class="font-medium">${escHtml(n.nama_pengirim)}</span></div>` : ''}
                ${n.pesan ? `<div class="text-xs text-stone-600 mt-2 whitespace-pre-wrap">${escHtml(n.pesan)}</div>` : ''}
              </div>
              <div class="flex flex-col items-end gap-1 shrink-0">
                <div class="text-[10px] text-stone-400 whitespace-nowrap">${date}</div>
                ${!n.is_read ? `<button onclick="bacaNotif(${n.id})" class="text-[10px] text-blue-600 hover:text-blue-800 font-medium">Tandai dibaca</button>` : ''}
              </div>
            </div>
          </div>`;
        }).join('')}</div>`;
    }
  } catch (err) {
    el.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat notifikasi: ${err.message}</div>`;
  }
}

async function renderNotifKirim() {
  const el = document.getElementById('notif-content');
  try {
    const karyawan = await api.get('/karyawan?status=Aktif');
    el.innerHTML = `
      <div class="bg-white rounded-xl border border-stone-200 p-6 max-w-2xl">
        <h3 class="font-bold text-base mb-4">Kirim Pengumuman ke Karyawan</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-stone-600 mb-1">Judul *</label>
            <input id="notif-judul" class="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="Judul pengumuman">
          </div>
          <div>
            <label class="block text-xs font-medium text-stone-600 mb-1">Pesan</label>
            <textarea id="notif-pesan" rows="4" class="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="Isi pesan..."></textarea>
          </div>
          <div>
            <label class="block text-xs font-medium text-stone-600 mb-1">Penerima</label>
            <select id="notif-penerima" class="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
              <option value="">— Pilih Karyawan —</option>
              ${karyawan.map(k => `<option value="${k.id}">${escHtml(k.nama)}${k.jabatan_nama ? ' — ' + escHtml(k.jabatan_nama) : ''}</option>`).join('')}
            </select>
          </div>
          <label class="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" id="notif-semua" class="cb-modern" onchange="toggleKirimSemua()">
            Kirim ke semua karyawan aktif
          </label>
          <div class="flex gap-2 pt-2">
            <button onclick="kirimNotifikasi(this)" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">Kirim</button>
            <button onclick="renderNotifInbox()" class="px-5 py-2 border border-stone-300 text-stone-600 text-sm font-medium rounded-lg hover:bg-stone-50 transition-colors">Batal</button>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat data: ${err.message}</div>`;
  }
}

function toggleKirimSemua() {
  const cb = document.getElementById('notif-semua');
  const sel = document.getElementById('notif-penerima');
  sel.disabled = cb.checked;
  if (cb.checked) sel.value = '';
}

async function kirimNotifikasi(btn) {
  const judul = document.getElementById('notif-judul').value.trim();
  const pesan = document.getElementById('notif-pesan').value.trim();
  const penerima_id = document.getElementById('notif-penerima').value;
  const kirim_ke_semua = document.getElementById('notif-semua').checked;

  if (!judul) return showAlert('Judul wajib diisi');
  if (!kirim_ke_semua && !penerima_id) return showAlert('Pilih penerima atau centang "Kirim ke semua"');

  try {
    btn.disabled = true;
    btn.textContent = 'Mengirim...';
    const res = await api.post('/notifikasi/kirim', { penerima_id: penerima_id || null, judul, pesan: pesan || null, kirim_ke_semua });
    btn.disabled = false;
    btn.textContent = 'Kirim';
    showToast(res.pesan, 'success');
    switchNotifTab('inbox');
  } catch (err) {
    showAlert('Gagal: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Kirim';
  }
}

async function bacaNotif(id) {
  try {
    await api.put('/notifikasi/' + id + '/baca');
    const card = document.querySelector(`[data-id="${id}"]`);
    if (card) {
      card.classList.remove('bg-blue-50', 'border-blue-200');
      card.classList.add('bg-white', 'border-stone-200');
      const dot = card.querySelector('.w-2.h-2');
      if (dot) dot.remove();
      const btn = card.querySelector('button');
      if (btn) btn.remove();
    }
  } catch (err) {
    console.error('bacaNotif error:', err);
  }
}

async function bacaSemuaNotif() {
  try {
    await api.put('/notifikasi/baca-semua');
    renderNotifInbox();
  } catch (err) {
    console.error('bacaSemuaNotif error:', err);
  }
}
