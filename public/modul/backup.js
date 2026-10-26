// ===== Backup & Restore =====
// Halaman /backup (khusus admin):
//   1) Riwayat backup — daftar file .sql di folder /backups (unduh / hapus / buat baru)
//   2) Restore — upload file .sql lalu jalankan ke database.
// Backend: /api/system/backup/* (routes/system.js + services/dbBackup.js).

let backupRestoreFile = null;
let backupRestoreVerify = null; // { key: 'nama:ukuran', report } — hasil verifikasi terakhir
const RESTORE_MAX_BYTES = 64 * 1024 * 1024; // sama dengan limit express.text

function fmtBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}

function fmtDateTimeId(iso) {
  if (!iso) return '-';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function backupSpinner(size) {
  size = size || 'h-8 w-8';
  return '<div class="flex items-center justify-center py-16"><svg class="animate-spin ' + size + ' text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm0 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
}

async function renderBackup() {
  const c = document.getElementById('content');
  if (!c) return;
  backupRestoreFile = null;
  c.innerHTML = `
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">

  <!-- Tile aksi backup -->
  <div class="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200/60 p-5 shadow-sm flex flex-col">
    <div class="flex items-center gap-2 mb-2">
      <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
      <h2 class="font-bold text-sm text-emerald-900">Backup Database</h2>
    </div>
    <p class="text-xs text-emerald-800/70 leading-relaxed mb-4">Simpan seluruh database (struktur + data) sebagai file .sql di folder <code class="bg-emerald-100 px-1 rounded">backups/</code> pada server.</p>
    <button onclick="createBackupNow()" id="btn-backup-now" class="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all flex items-center justify-center gap-2">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
      Backup Sekarang
    </button>
    <p class="text-[10px] text-emerald-700/60 mt-3 text-center">Khusus role admin · file bisa diunduh kapan saja</p>
  </div>

  <!-- Riwayat backup -->
  <div class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden lg:col-span-2">
    <div class="px-5 py-4 border-b border-stone-100 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="font-bold text-sm text-stone-800">Riwayat Backup</h2>
        <p class="text-xs text-stone-500">File .sql tersimpan di folder <code class="bg-stone-100 px-1 rounded">backups/</code> pada server</p>
      </div>
      <div class="flex items-center gap-2">
        <span id="backup-total" class="text-xs text-stone-500"></span>
        <button onclick="loadBackupList()" class="h-8 px-3 bg-white border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5" title="Muat ulang daftar">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
          Muat Ulang
        </button>
      </div>
    </div>
    <div id="backup-list"></div>
  </div>

  <!-- Restore -->
  <div class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden lg:col-span-3">
    <div class="px-5 py-4 border-b border-stone-100">
      <h2 class="font-bold text-sm text-stone-800">Restore Database dari File .sql</h2>
      <p class="text-xs text-stone-500">Unggah file hasil backup (atau dump MySQL lain) untuk mengembalikan isi database. File diverifikasi dulu sebelum bisa direstore.</p>
    </div>
    <div class="p-5 space-y-4">
      <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 leading-relaxed">
        <strong>⚠️ Perhatian:</strong> restore akan <strong>menimpa seluruh isi database</strong> dengan isi file.
        Sebelum eksekusi, sistem selalu membuat <strong>backup keamanan otomatis</strong> (file <code class="bg-amber-100 px-1 rounded">pre-restore-*.sql</code>)
        sehingga kondisi saat ini masih bisa dikembalikan. Maksimal file 64 MB.
      </div>

      <div>
        <label class="block text-sm font-medium text-stone-700 mb-1">File .sql</label>
        <input type="file" id="restore-file" accept=".sql,text/plain"
               onchange="onRestoreFileSelected(this)"
               class="block w-full text-sm text-stone-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer">
      </div>

      <div id="restore-file-info" class="hidden items-center gap-2 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-600"></div>

      <div id="restore-verify" class="hidden rounded-xl border border-stone-200 bg-stone-50/60 p-4"></div>

      <button id="btn-restore" onclick="runRestore()" disabled
              class="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-semibold transition shadow-md">
        Restore Sekarang
      </button>

      <pre id="restore-log" class="hidden bg-stone-900 text-green-400 p-4 rounded-xl text-xs font-mono leading-relaxed overflow-auto max-h-80 whitespace-pre-wrap"></pre>
    </div>
  </div>
  </div>`;

  await loadBackupList();
}

async function loadBackupList() {
  const wrap = document.getElementById('backup-list');
  if (!wrap) return;
  wrap.innerHTML = backupSpinner();

  try {
    const r = await api.get('/system/backup/list');
    const files = Array.isArray(r.files) ? r.files : [];
    const totalBytes = files.reduce((s, f) => s + (Number(f.size) || 0), 0);
    const totalEl = document.getElementById('backup-total');
    if (totalEl) totalEl.textContent = files.length ? files.length + ' file · ' + fmtBytes(totalBytes) : 'Belum ada file';

    if (!files.length) {
      wrap.innerHTML = '<div class="py-14 text-center text-stone-400">' +
        '<svg class="w-12 h-12 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>' +
        '<div class="text-sm">Belum ada backup. Klik <b>Backup Sekarang</b> untuk membuat file pertama.</div></div>';
      return;
    }

    let html = '<div class="overflow-x-auto"><table class="w-full"><thead><tr class="border-b border-stone-100">';
    html += '<th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Nama File</th>';
    html += '<th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Ukuran</th>';
    html += '<th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Dibuat</th>';
    html += '<th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Aksi</th>';
    html += '</tr></thead><tbody>';

    for (const f of files) {
      const isPre = String(f.name).indexOf('pre-restore-') === 0;
      const badge = isPre
        ? '<span class="ml-2 inline-block px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-amber-100 text-amber-700 align-middle">pre-restore</span>'
        : '';
      const url = '/api/system/backup/file?name=' + encodeURIComponent(f.name);
      html += '<tr class="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">';
      html += '<td class="px-4 py-3 text-xs font-medium text-stone-700"><a href="' + url + '" class="hover:text-emerald-600 hover:underline break-all" title="Unduh">' + escHtml(f.name) + '</a>' + badge + '</td>';
      html += '<td class="px-4 py-3 text-xs text-stone-500 text-right whitespace-nowrap">' + fmtBytes(f.size) + '</td>';
      html += '<td class="px-4 py-3 text-xs text-stone-500 whitespace-nowrap">' + fmtDateTimeId(f.created_at) + '</td>';
      html += '<td class="px-4 py-3 text-right whitespace-nowrap">';
      html += '<a href="' + url + '" class="w-7 h-7 inline-flex items-center justify-center rounded-lg text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all" title="Unduh"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></a> ';
      html += '<button onclick="deleteBackup(\'' + String(f.name).replace(/'/g, '') + '\')" class="w-7 h-7 inline-flex items-center justify-center rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-all" title="Hapus"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>';
      html += '</td></tr>';
    }

    html += '</tbody></table></div>';
    wrap.innerHTML = html;
  } catch (err) {
    wrap.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 m-4 rounded-lg text-sm">Gagal memuat daftar backup: ' + escHtml(err.message) + '</div>';
  }
}

async function createBackupNow() {
  const btn = document.getElementById('btn-backup-now');
  if (btn) { btn.disabled = true; btn.textContent = 'Membuat backup...'; }
  try {
    const r = await api.post('/system/backup/create', {});
    showAlert('Backup berhasil dibuat: ' + r.file.name + ' (' + fmtBytes(r.file.size) + ')', 'success');
    await loadBackupList();
  } catch (err) {
    showAlert('Gagal membuat backup: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Backup Sekarang';
    }
  }
}

function deleteBackup(name) {
  if (!confirm('Hapus file backup "' + name + '"?\nFile yang dihapus tidak bisa dikembalikan.')) return;
  api.del('/system/backup/file?name=' + encodeURIComponent(name))
    .then(() => loadBackupList())
    .catch(err => showAlert('Gagal menghapus: ' + err.message, 'error'));
}

function onRestoreFileSelected(input) {
  const info = document.getElementById('restore-file-info');
  const btn = document.getElementById('btn-restore');
  const log = document.getElementById('restore-log');
  const vbox = document.getElementById('restore-verify');
  const f = input.files && input.files[0];
  backupRestoreFile = f || null;
  backupRestoreVerify = null;
  if (log) { log.classList.add('hidden'); log.textContent = ''; }
  if (vbox) { vbox.classList.add('hidden'); vbox.innerHTML = ''; }
  if (!f || !info || !btn) return;

  const isSql = /\.sql$/i.test(f.name);
  const isSmall = f.size <= RESTORE_MAX_BYTES;
  const valid = isSql && isSmall;

  let reason = '';
  if (!isSql) reason = ' — harus file .sql';
  else if (!isSmall) reason = ' — melebihi 64 MB';

  info.className = 'flex items-center gap-2 rounded-lg px-3 py-2 text-xs border ' +
    (valid ? 'bg-stone-50 border-stone-200 text-stone-600' : 'bg-red-50 border-red-200 text-red-700');
  info.innerHTML = valid
    ? '<svg class="w-4 h-4 shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
      '<span class="break-all"><b>' + escHtml(f.name) + '</b> (' + fmtBytes(f.size) + ')</span>'
    : '<span>✕ ' + escHtml(f.name) + ' (' + fmtBytes(f.size) + ')' + reason + '</span>';
  info.classList.remove('hidden');
  info.classList.add('flex');

  // File valid → jalankan verifikasi; tombol restore baru aktif setelah lolos.
  btn.disabled = true;
  if (valid) verifyRestoreFile();
}

// Verifikasi isi file .sql di server: tabel yang disentuh, apakah tabel sudah
// ada di database, jumlah statement, dan hasil validasi — sebelum restore.
async function verifyRestoreFile() {
  const f = backupRestoreFile;
  const box = document.getElementById('restore-verify');
  const btn = document.getElementById('btn-restore');
  if (!f || !box) return;

  box.classList.remove('hidden');
  box.innerHTML = '<div class="flex items-center gap-2 text-xs text-stone-500">' +
    '<svg class="animate-spin h-4 w-4 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm0 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>' +
    'Memverifikasi isi file...</div>';
  if (btn) btn.disabled = true;

  const key = f.name + ':' + f.size;
  try {
    const sql = await f.text();
    const r = await fetch('/api/system/backup/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: sql,
      credentials: 'include',
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + (await r.text()));
    const data = await r.json();
    const rep = data.report;
    if (!rep) throw new Error('Respons verifikasi tidak valid');
    backupRestoreVerify = { key, report: rep };
    box.innerHTML = restoreVerifyHtml(rep);
    if (btn) btn.disabled = !rep.ok;
  } catch (err) {
    backupRestoreVerify = null;
    box.innerHTML = '<div class="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">' +
      '<b>Verifikasi gagal — restore dinonaktifkan.</b><br>' + escHtml(err.message) + '</div>';
    if (btn) btn.disabled = true;
  }
}

function restoreChip(label, color) {
  const colors = {
    stone: 'bg-stone-100 text-stone-600',
    emerald: 'bg-emerald-100 text-emerald-700',
    sky: 'bg-sky-100 text-sky-700',
    violet: 'bg-violet-100 text-violet-700',
    amber: 'bg-amber-100 text-amber-700',
  };
  return '<span class="inline-block px-2 py-0.5 rounded-lg font-semibold ' + (colors[color] || colors.stone) + '">' + label + '</span>';
}

function restoreVerifyHtml(rep) {
  if (!rep.ok) {
    return '<div class="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">' +
      '<b>✕ File tidak lolos verifikasi — restore dinonaktifkan.</b><br>' + escHtml(rep.error || '') + '</div>';
  }

  const s = rep.summary || {};
  let h = '<div class="flex flex-wrap items-center justify-between gap-2 mb-3">';
  h += '<div class="text-xs font-semibold text-emerald-700">✓ File lolos verifikasi — siap direstore</div>';
  h += '<button type="button" onclick="verifyRestoreFile()" class="text-[11px] px-2.5 py-1 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 transition">Verifikasi ulang</button>';
  h += '</div>';

  h += '<div class="flex flex-wrap gap-1.5 mb-3 text-[11px]">';
  h += '<span class="inline-block px-2 py-0.5 rounded-lg font-semibold bg-stone-100 text-stone-600">' + fmtNum(s.total_tables || 0) + ' tabel di file</span>';
  h += '<span class="inline-block px-2 py-0.5 rounded-lg font-semibold bg-emerald-100 text-emerald-700">' + fmtNum(s.existing || 0) + ' sudah ada di DB</span>';
  h += '<span class="inline-block px-2 py-0.5 rounded-lg font-semibold bg-sky-100 text-sky-700">' + fmtNum(s.new_tables || 0) + ' tabel baru</span>';
  h += '<span class="inline-block px-2 py-0.5 rounded-lg font-semibold bg-violet-100 text-violet-700">' + fmtNum(s.insert_stmts || 0) + ' statement INSERT</span>';
  h += '</div>';

  const tables = Array.isArray(rep.tables) ? rep.tables : [];
  if (tables.length) {
    h += '<div class="overflow-auto max-h-60 border border-stone-200 rounded-lg bg-white">';
    h += '<table class="w-full"><thead><tr class="border-b border-stone-100">';
    h += '<th class="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">Tabel</th>';
    h += '<th class="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">Di Database</th>';
    h += '<th class="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">Isi File</th>';
    h += '</tr></thead><tbody>';
    for (const t of tables) {
      const dbCell = t.exists
        ? '<span class="inline-block px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-emerald-100 text-emerald-700">Ada' +
          (t.current_rows == null ? '' : ' ≈ ' + fmtNum(t.current_rows) + ' baris') + '</span>'
        : '<span class="inline-block px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-stone-100 text-stone-500">Belum ada</span>';
      const fileBits = [];
      if (t.has_drop) fileBits.push('DROP');
      if (t.has_create) fileBits.push('CREATE');
      if (t.insert_stmts) fileBits.push(fmtNum(t.insert_stmts) + '× INSERT');
      const fileCell = t.action.indexOf('BARU') === 0
        ? '<span class="inline-block px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-sky-100 text-sky-700">' + escHtml(t.action) + '</span>'
        : '<span class="inline-block px-2 py-0.5 rounded-lg text-[10px] font-semibold ' +
            (t.action.indexOf('GANTI') === 0 ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700') + '">' + escHtml(t.action) + '</span>';
      h += '<tr class="border-b border-stone-50">';
      h += '<td class="px-3 py-2 text-xs font-medium text-stone-700 break-all">' + escHtml(t.name) + '</td>';
      h += '<td class="px-3 py-2 whitespace-nowrap">' + dbCell + '</td>';
      h += '<td class="px-3 py-2">' + fileCell + ' <span class="text-[10px] text-stone-400">(' + fileBits.join(', ') + ')</span></td>';
      h += '</tr>';
    }
    h += '</tbody></table></div>';
  }

  if (rep.warnings && rep.warnings.length) {
    h += '<ul class="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">';
    for (const w of rep.warnings) h += '<li>⚠ ' + escHtml(w) + '</li>';
    h += '</ul>';
  }
  return h;
}

async function runRestore() {
  const f = backupRestoreFile;
  if (!f) return;
  const verified = backupRestoreVerify && backupRestoreVerify.key === (f.name + ':' + f.size)
    ? backupRestoreVerify.report : null;
  if (!verified || !verified.ok) {
    showAlert('File belum lolos verifikasi — jalankan verifikasi dulu.', 'warning');
    return;
  }
  const sum = verified.summary || {};
  const ok = confirm(
    'RESTORE DATABASE SEKARANG?\n\n' +
    'File   : ' + f.name + ' (' + fmtBytes(f.size) + ')\n' +
    'Isi    : ' + (sum.total_tables || 0) + ' tabel (' + (sum.existing || 0) + ' sudah ada di DB, ' + (sum.new_tables || 0) + ' baru), ' + (sum.insert_stmts || 0) + ' INSERT\n' +
    'Efek   : tabel yang ada akan DIGANTI / ditimpa sesuai isi file\n' +
    'Backup : backup keamanan dibuat otomatis sebelum restore\n\n' +
    'Lanjutkan?'
  );
  if (!ok) return;

  const btn = document.getElementById('btn-restore');
  const out = document.getElementById('restore-log');
  if (btn) { btn.disabled = true; btn.textContent = 'Merestore...'; }
  if (out) { out.classList.remove('hidden'); out.textContent = 'Membaca file...\n'; }

  try {
    const sql = await f.text();
    if (out) out.textContent = '';
    const r = await fetch('/api/system/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: sql,
      credentials: 'include',
    });
    if (!r.ok) {
      const txt = await r.text();
      if (out) out.textContent += 'HTTP ' + r.status + ': ' + txt;
      return;
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (out) {
        out.textContent += decoder.decode(value);
        out.scrollTop = out.scrollHeight;
      }
    }
  } catch (err) {
    if (out) out.textContent += '\nGagal: ' + err.message;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Restore Sekarang'; }
    // Muat ulang riwayat agar file pre-restore hasil backup keamanan tampil
    await loadBackupList();
  }
}
