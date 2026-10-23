// ============================================================
// Groq Vision — Halaman ekstraksi teks/data dari gambar
// Modul ini mendaftarkan renderGroqVision() yang dipanggil oleh
// route SPA di inti.js (lihat MODULES di definisi.js).
// ============================================================

const GV_MODES = {
  teks: { label: 'Teks / OCR', json: false, placeholder: 'Contoh: hanya ambil bagian daftar hadir saja.' },
  tabel: { label: 'Tabel → JSON', json: true, placeholder: 'Contoh: kolom tanggal format DD/MM/YYYY, nominal tanpa Rp.' },
  nota: { label: 'Nota / Invoice', json: true, placeholder: 'Contoh: nama supplier ada di bagian atas kanan.' },
  menu: { label: 'Menu & Bahan', json: true, placeholder: 'Contoh: jumlah bahan dalam gram.' },
};

let _gvState = { dataUrl: '', name: '', bytes: 0, status: null, last: null, busy: false };
let _gvPasteBound = false;

function gvEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function gvBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
}

function gvFormattedChars(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

// Baca file gambar, perkecil bila perlu (maks sisi 2000px / ±4,5 MB data URL)
function gvPrepareImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const rawUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('Gambar tidak dapat dibuka. Pastikan file tidak rusak.'));
      img.onload = () => {
        const MAX_DIM = 2000;
        const MAX_DATA_URL = 4.5 * 1024 * 1024;
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));

        // Tidak perlu diubah: resolusi wajar & ukuran aman
        if (scale === 1 && rawUrl.length <= MAX_DATA_URL) {
          return resolve({ dataUrl: rawUrl, width: img.width, height: img.height });
        }

        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        // Latar putih agar PNG transparan tidak menjadi hitam saat dikonversi ke JPEG
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        let quality = 0.92;
        let out = canvas.toDataURL('image/jpeg', quality);
        while (out.length > MAX_DATA_URL && quality > 0.5) {
          quality -= 0.08;
          out = canvas.toDataURL('image/jpeg', quality);
        }
        resolve({ dataUrl: out, width: w, height: h });
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}

function gvUpdateRunState() {
  const btn = document.getElementById('gv-run');
  if (!btn) return;
  const configured = !_gvState.status || _gvState.status.configured !== false;
  btn.disabled = _gvState.busy || !_gvState.dataUrl || !configured;
}

function gvSetLoading(on) {
  _gvState.busy = !!on;
  const label = document.getElementById('gv-run-label');
  const spinner = document.getElementById('gv-run-spinner');
  const btn = document.getElementById('gv-run');
  if (label) label.textContent = on ? 'Memproses gambar…' : 'Ekstrak dengan Groq Vision';
  if (spinner) spinner.classList.toggle('hidden', !on);
  if (btn) btn.classList.toggle('opacity-70', !!on);
  gvUpdateRunState();
}

async function gvSelectFile(file) {
  if (!file) return;
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type || '')) {
    return showAlert('Format gambar harus PNG, JPG, atau WEBP.', 'warning');
  }
  if (file.size > 20 * 1024 * 1024) {
    return showAlert('File terlalu besar. Maksimal 20 MB sebelum dikompres.', 'warning');
  }

  const dz = document.getElementById('gv-dropzone');
  if (dz) dz.classList.add('opacity-60');
  try {
    const prepared = await gvPrepareImage(file);
    if (!document.getElementById('gv-dropzone')) return; // pengguna sudah pindah halaman

    _gvState.dataUrl = prepared.dataUrl;
    _gvState.name = file.name || 'tempel-gambar.png';
    _gvState.bytes = Math.round(prepared.dataUrl.length * 0.75);

    const img = document.getElementById('gv-preview');
    if (img) img.src = prepared.dataUrl;
    document.getElementById('gv-empty')?.classList.add('hidden');
    document.getElementById('gv-preview-wrap')?.classList.remove('hidden');
    const info = document.getElementById('gv-file-info');
    if (info) {
      info.textContent = _gvState.name + ' · ' + prepared.width + '×' + prepared.height + ' · ' + gvBytes(_gvState.bytes);
    }
    gvUpdateRunState();
  } catch (err) {
    showAlert(err.message || 'Gagal memuat gambar.', 'error');
  } finally {
    const el = document.getElementById('gv-dropzone');
    if (el) el.classList.remove('opacity-60');
  }
}

function gvClearImage() {
  _gvState.dataUrl = '';
  _gvState.name = '';
  _gvState.bytes = 0;
  const input = document.getElementById('gv-file');
  if (input) input.value = '';
  const img = document.getElementById('gv-preview');
  if (img) img.removeAttribute('src');
  document.getElementById('gv-preview-wrap')?.classList.add('hidden');
  document.getElementById('gv-empty')?.classList.remove('hidden');
  gvUpdateRunState();
}

function gvUpdateMeta() {
  const meta = document.getElementById('gv-result-meta');
  const ta = document.getElementById('gv-result');
  if (!meta || !ta) return;
  const last = _gvState.last;
  if (!last) { meta.textContent = 'Belum ada hasil.'; return; }
  const parts = [];
  if (last.model) parts.push(last.model);
  if (last.usage && last.usage.total_tokens) parts.push(gvFormattedChars(last.usage.total_tokens) + ' token');
  if (last.duration_ms) parts.push((last.duration_ms / 1000).toFixed(1).replace('.', ',') + ' dtk');
  parts.push(gvFormattedChars(ta.value.length) + ' karakter');
  meta.textContent = parts.join(' · ');
}

function gvShowResult(res) {
  if (!document.getElementById('gv-result')) return;
  _gvState.last = res;
  const ta = document.getElementById('gv-result');
  const isJson = !!(res.data && typeof res.data === 'object');
  const text = String(res.text || '');

  ta.value = text;
  ta.classList.remove('hidden');
  document.getElementById('gv-result-empty')?.classList.add('hidden');
  document.getElementById('gv-actions')?.classList.remove('hidden');
  document.getElementById('gv-json-badge')?.classList.toggle('hidden', !isJson);
  document.getElementById('gv-format')?.classList.toggle('hidden', !(isJson || /^\s*[{[]/.test(text)));
  gvUpdateMeta();
}

async function gvRun() {
  if (_gvState.busy) return;
  if (!_gvState.dataUrl) return showAlert('Pilih gambar terlebih dahulu.', 'warning');

  const modeEl = document.getElementById('gv-mode');
  const promptEl = document.getElementById('gv-prompt');
  const mode = (modeEl && modeEl.value) || 'teks';
  const prompt = (promptEl && promptEl.value.trim()) || '';

  gvSetLoading(true);
  try {
    const res = await api.post('/vision/extract', {
      image: _gvState.dataUrl,
      mode,
      prompt,
    });
    gvShowResult(res);
    showToast('Ekstraksi selesai', 'success');
  } catch (err) {
    showAlert(err.message || 'Gagal mengekstrak gambar.', 'error');
  } finally {
    gvSetLoading(false);
  }
}

async function gvCopyResult() {
  const ta = document.getElementById('gv-result');
  if (!ta || !ta.value.trim()) return showAlert('Belum ada teks untuk disalin.', 'warning');
  try {
    await navigator.clipboard.writeText(ta.value);
    showToast('Teks disalin ke clipboard', 'success');
  } catch {
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      showToast('Teks disalin ke clipboard', 'success');
    } catch {
      showAlert('Browser memblokir akses clipboard. Salin manual dengan Ctrl+C.', 'warning');
    }
  }
}

function gvDownloadResult() {
  const ta = document.getElementById('gv-result');
  if (!ta || !ta.value.trim()) return showAlert('Belum ada teks untuk diunduh.', 'warning');

  const text = ta.value;
  let isJson = false;
  try { JSON.parse(text); isJson = true; } catch { isJson = false; }

  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
  const blob = new Blob([text], { type: isJson ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'groq-vision-' + stamp + (isJson ? '.json' : '.txt');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function gvFormatJson() {
  const ta = document.getElementById('gv-result');
  if (!ta) return;
  try {
    const obj = JSON.parse(ta.value);
    ta.value = JSON.stringify(obj, null, 2);
    document.getElementById('gv-json-badge')?.classList.remove('hidden');
    gvUpdateMeta();
    showToast('JSON dirapikan', 'success');
  } catch {
    showAlert('Teks hasil bukan JSON valid, tidak bisa dirapikan.', 'warning');
  }
}

function gvClearResult() {
  const ta = document.getElementById('gv-result');
  if (ta) { ta.value = ''; ta.classList.add('hidden'); }
  _gvState.last = null;
  document.getElementById('gv-result-empty')?.classList.remove('hidden');
  document.getElementById('gv-actions')?.classList.add('hidden');
  document.getElementById('gv-json-badge')?.classList.add('hidden');
  document.getElementById('gv-format')?.classList.add('hidden');
  gvUpdateMeta();
}

async function gvLoadStatus() {
  try {
    const s = await api.get('/vision/status');
    if (!document.getElementById('gv-dropzone')) return; // sudah pindah halaman
    _gvState.status = s;

    const modelBadge = document.getElementById('gv-model-badge');
    if (modelBadge) modelBadge.textContent = 'Model: ' + s.model;

    const apiStatus = document.getElementById('gv-api-status');
    if (apiStatus) {
      apiStatus.innerHTML = s.configured
        ? '<span class="inline-block w-2 h-2 rounded-full bg-emerald-500"></span><span>Terkonfigurasi & siap dipakai</span>'
        : '<span class="inline-block w-2 h-2 rounded-full bg-red-500"></span><span>API key belum diset</span>';
    }
    document.getElementById('gv-key-warning')?.classList.toggle('hidden', !!s.configured);
    gvUpdateRunState();
  } catch (err) {
    const apiStatus = document.getElementById('gv-api-status');
    if (apiStatus) apiStatus.textContent = 'Status tidak diketahui';
  }
}

function renderGroqVision() {
  _gvState = { dataUrl: '', name: '', bytes: 0, status: null, last: null, busy: false };

  const c = document.getElementById('content');
  const modeOptions = Object.keys(GV_MODES)
    .map((k) => '<option value="' + k + '">' + gvEsc(GV_MODES[k].label) + '</option>')
    .join('');

  c.innerHTML = `
    <div class="mb-5 flex flex-wrap items-center gap-2">
      <span class="badge" style="background:#e0e7ff;color:#3730a3">Groq Vision</span>
      <span id="gv-model-badge" class="text-xs" style="opacity:.6">Model: memuat…</span>
      <span class="text-xs" style="opacity:.45">·</span>
      <span class="text-xs" style="opacity:.55">Ekstraksi teks & data dari foto/scan</span>
    </div>

    <div id="gv-key-warning" class="hidden mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <div class="font-semibold mb-0.5">GROQ_API_KEY belum diset</div>
      <div>Tambahkan <code class="mono text-[12px]">GROQ_API_KEY=...</code> di file <code class="mono text-[12px]">.env</code>, lalu restart server. Dapatkan API key gratis di
        <a href="https://console.groq.com/keys" target="_blank" rel="noopener" class="underline font-medium">console.groq.com/keys</a>.
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
      <!-- ═══ Panel Upload ═══ -->
      <section class="bg-white rounded-2xl border border-stone-200 p-5">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style="background:#dbeafe;color:#1e40af">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <div>
            <h2 class="font-bold text-base text-stone-800">Unggah Gambar</h2>
            <p class="text-[11px] text-stone-400">Foto dokumen, nota, tabel, atau menu</p>
          </div>
        </div>

        <div id="gv-dropzone" role="button" tabindex="0" aria-label="Pilih atau tarik gambar"
          class="relative rounded-xl border-2 border-dashed border-stone-300 px-5 py-9 text-center cursor-pointer transition-all hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          style="background:var(--bg-sidebar-hover)">
          <input id="gv-file" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" />

          <div id="gv-empty">
            <div class="mx-auto mb-3 w-14 h-14 rounded-2xl flex items-center justify-center" style="background:#dbeafe;color:#1e40af">
              <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            </div>
            <div class="font-semibold text-sm text-stone-700">Tarik & lepas gambar di sini</div>
            <p class="text-xs text-stone-500 mt-1">atau klik untuk pilih file · bisa juga tempel dengan Ctrl+V</p>
            <p class="text-[11px] text-stone-400 mt-2">PNG, JPG, WEBP · maks 6 MB · otomatis diperkecil bila perlu</p>
          </div>

          <div id="gv-preview-wrap" class="hidden">
            <img id="gv-preview" alt="Pratinjau gambar" class="mx-auto max-h-72 w-auto max-w-full rounded-lg border border-stone-200" />
            <div class="mt-3 flex items-center justify-center gap-2 text-xs text-stone-500">
              <span id="gv-file-info" class="truncate max-w-[78%]"></span>
              <button id="gv-remove" type="button" class="shrink-0 px-2.5 py-1 rounded-md border border-stone-300 hover:bg-stone-100 transition-colors">Hapus</button>
            </div>
          </div>
        </div>

        <div class="mt-4">
          <label for="gv-mode" class="block text-xs font-semibold mb-1.5 text-stone-600">Jenis ekstraksi</label>
          <select id="gv-mode" class="w-full h-10 px-3 rounded-lg border border-stone-300 text-sm">${modeOptions}</select>
        </div>

        <div class="mt-3">
          <label for="gv-prompt" class="block text-xs font-semibold mb-1.5 text-stone-600">
            Instruksi tambahan <span class="font-normal text-stone-400">(opsional)</span>
          </label>
          <textarea id="gv-prompt" rows="3" maxlength="2000"
            placeholder="Contoh: hanya ambil kolom nama dan jumlah."
            class="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm resize-y"></textarea>
        </div>

        <button id="gv-run" type="button" disabled
          class="mt-4 w-full h-11 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          style="background:#1e40af">
          <svg id="gv-run-spinner" class="hidden animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span id="gv-run-label">Ekstrak dengan Groq Vision</span>
        </button>

        <div class="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-stone-400">
          <span id="gv-api-status" class="flex items-center gap-1.5">Memeriksa status API…</span>
          <span>Maks 6 MB</span>
        </div>
        <p class="text-[11px] text-stone-400 mt-2">Gambar hanya dikirim ke Groq untuk sekali proses dan tidak disimpan di server.</p>
      </section>

      <!-- ═══ Panel Hasil ═══ -->
      <section class="bg-white rounded-2xl border border-stone-200 p-5 flex flex-col min-h-[460px]">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="min-w-0">
            <h2 class="font-bold text-base text-stone-800">Hasil Ekstraksi</h2>
            <p id="gv-result-meta" class="text-[11px] text-stone-400 mt-0.5">Belum ada hasil.</p>
          </div>
          <span id="gv-json-badge" class="hidden badge shrink-0" style="background:#dcfce7;color:#166534">JSON valid</span>
        </div>

        <div id="gv-result-empty" class="flex-1 flex flex-col items-center justify-center text-center py-16 text-stone-400">
          <svg class="w-14 h-14 mb-1" style="opacity:.35" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <p class="text-sm mt-3">Hasil teks akan muncul di sini</p>
          <p class="text-xs mt-1" style="opacity:.7">Bisa langsung diedit, disalin, atau diunduh.</p>
        </div>

        <textarea id="gv-result" spellcheck="false"
          class="hidden mono mt-1 w-full flex-1 min-h-[320px] p-3 rounded-xl border border-stone-200 text-[12.5px] leading-relaxed resize-y"
          placeholder="Hasil ekstraksi…"></textarea>

        <div id="gv-actions" class="hidden mt-3 flex flex-wrap items-center gap-2">
          <button id="gv-copy" type="button" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-stone-300 hover:bg-stone-100 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Salin
          </button>
          <button id="gv-download" type="button" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-stone-300 hover:bg-stone-100 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Unduh
          </button>
          <button id="gv-format" type="button" class="hidden px-3 py-1.5 rounded-lg text-xs font-medium border border-stone-300 hover:bg-stone-100 transition-colors">Rapikan JSON</button>
          <button id="gv-clear" type="button" class="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium text-stone-500 hover:bg-stone-100 transition-colors">Bersihkan</button>
        </div>
      </section>
    </div>
  `;

  const dropzone = document.getElementById('gv-dropzone');
  const fileInput = document.getElementById('gv-file');
  const modeEl = document.getElementById('gv-mode');
  const promptEl = document.getElementById('gv-prompt');

  if (fileInput) {
    // Cegah event click dari file input naik ke dropzone (menghindari dialog dobel)
    fileInput.addEventListener('click', (e) => e.stopPropagation());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (f) gvSelectFile(f);
    });
  }

  if (dropzone) {
    dropzone.addEventListener('click', (e) => {
      if (e.target === fileInput || e.target.closest('#gv-remove,input,button')) return;
      if (fileInput) fileInput.click();
    });
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (fileInput) fileInput.click();
      }
    });
    ['dragenter', 'dragover'].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('ring-2', 'ring-blue-400');
      });
    });
    ['dragleave', 'dragend'].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('ring-2', 'ring-blue-400');
      });
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('ring-2', 'ring-blue-400');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) gvSelectFile(f);
    });
  }

  document.getElementById('gv-remove')?.addEventListener('click', (e) => {
    e.stopPropagation();
    gvClearImage();
  });

  document.getElementById('gv-run')?.addEventListener('click', gvRun);
  document.getElementById('gv-copy')?.addEventListener('click', gvCopyResult);
  document.getElementById('gv-download')?.addEventListener('click', gvDownloadResult);
  document.getElementById('gv-format')?.addEventListener('click', gvFormatJson);
  document.getElementById('gv-clear')?.addEventListener('click', gvClearResult);

  if (modeEl) {
    const syncPlaceholder = () => {
      if (!promptEl) return;
      promptEl.placeholder = (GV_MODES[modeEl.value] || GV_MODES.teks).placeholder;
    };
    modeEl.addEventListener('change', syncPlaceholder);
    syncPlaceholder();
  }

  document.getElementById('gv-result')?.addEventListener('input', gvUpdateMeta);

  // Tempel gambar dari clipboard (Ctrl+V). Listener global cukup sekali;
  // handler otomatis berhenti bila halaman ini tidak sedang terbuka.
  if (!_gvPasteBound) {
    _gvPasteBound = true;
    document.addEventListener('paste', (e) => {
      if (!document.getElementById('gv-dropzone')) return;
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file' && /^image\//i.test(item.type || '')) {
          const f = item.getAsFile();
          if (f) {
            e.preventDefault();
            gvSelectFile(f);
            break;
          }
        }
      }
    });
  }

  gvLoadStatus();
}
