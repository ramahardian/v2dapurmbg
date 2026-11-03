// ============================================================
// Groq Vision — Halaman ekstraksi teks/data dari gambar
// Modul ini mendaftarkan renderGroqVision() yang dipanggil oleh
// route SPA di inti.js (lihat MODULES di definisi.js).
// ============================================================

// Ekstraksi hanya satu mode: Menu & Bahan (pilihan lain dihapus dari UI).
const GV_MODE = 'menu';
const GV_PROMPT_PLACEHOLDER = 'Contoh: jumlah bahan dalam gram.';

let _gvState = { dataUrl: '', name: '', bytes: 0, status: null, last: null, busy: false, menus: [] };
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
  // Tombol hanya bergantung pada gambar & proses berjalan — tidak dikunci
  // oleh status konfigurasi API key.
  btn.disabled = _gvState.busy || !_gvState.dataUrl;
}

function gvSetLoading(on) {
  _gvState.busy = !!on;
  const label = document.getElementById('gv-run-label');
  const spinner = document.getElementById('gv-run-spinner');
  const btn = document.getElementById('gv-run');
  if (label) label.textContent = on ? 'Memproses gambar…' : 'Ekstrak';
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

    // Tolak gambar yang jelas tidak layak ekstrak (terlalu kecil / resolusi
    // tak terbaca) sebelum membuang kuota ekstraksi.
    if (prepared.width < 100 || prepared.height < 100) {
      showAlert('Gambar ditolak — resolusi terlalu kecil (' + prepared.width + '×' + prepared.height + ' px, minimal 100×100). Foto ulang dokumen menu/resep dengan lebih jelas.', 'warning');
      gvClearImage();
      return;
    }

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
  // Pemilih menu tujuan hanya untuk hasil JSON data menu
  document.getElementById('gv-target-row')?.classList.toggle('hidden', !isJson);
  gvUpdateTargetUi();
}

// ── Menu tujuan: daftar menu existing untuk pilihan "Simpan ke" ──────────
async function gvLoadMenuList() {
  try {
    const res = await api.get('/menu?limit=500');
    if (!document.getElementById('gv-target-menu')) return; // pengguna sudah pindah halaman
    _gvState.menus = (res && Array.isArray(res.data)) ? res.data : [];
  } catch {
    _gvState.menus = [];
  }
  gvRenderTargetOptions();
}

function gvRenderTargetOptions() {
  const sel = document.getElementById('gv-target-menu');
  if (!sel) return;
  const prev = sel.value;
  const menus = _gvState.menus || [];
  sel.innerHTML = '<option value="">Menu baru (dibuat dari hasil ekstrak)</option>' +
    menus.map((m) => '<option value="' + Number(m.id) + '">' + gvEsc(m.nama) + '</option>').join('');
  if (prev && menus.some((m) => String(m.id) === prev)) sel.value = prev;
  gvUpdateTargetUi();
}

// Tampilan tombol simpan mengikuti menu tujuan yang dipilih.
// Menu baru butuh nama dari hasil ekstrak; menu existing tidak (namanya dipakai).
function gvUpdateTargetUi() {
  const sel = document.getElementById('gv-target-menu');
  const btn = document.getElementById('gv-to-menu');
  if (!sel || !btn) return;
  const target = (_gvState.menus || []).find((m) => String(m.id) === sel.value);
  const d = _gvState.last && _gvState.last.data;
  const namaBaru = (d && typeof d === 'object') ? String(d.nama_menu || '').trim() : '';

  if (target) {
    const nm = String(target.nama || '');
    btn.textContent = '⬆ Gabung ke "' + (nm.length > 26 ? nm.slice(0, 25) + '…' : nm) + '"';
    btn.classList.remove('hidden');
  } else {
    btn.textContent = '⬆ Masukkan ke Data Menu';
    btn.classList.toggle('hidden', !namaBaru);
  }

  const note = document.getElementById('gv-target-note');
  if (note) {
    note.textContent = target
      ? ((target.bahan && target.bahan.length ? target.bahan.length + ' bahan existing · ' : '') + 'hasil ekstrak digabung, nama bahan sama ditimpa')
      : (namaBaru ? 'akan membuat menu baru' : '');
  }
}

async function gvRun() {
  if (_gvState.busy) return;
  if (!_gvState.dataUrl) return showAlert('Pilih gambar terlebih dahulu.', 'warning');

  const promptEl = document.getElementById('gv-prompt');
  const mode = GV_MODE;
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
    // Pesan penolakan dari server (bukan dokumen menu standar) tampil apa adanya
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
  document.getElementById('gv-to-menu')?.classList.add('hidden');
  document.getElementById('gv-target-row')?.classList.add('hidden');
}

// Ambil daftar bahan dari hasil ekstrak. Angka jatuh ke kolom jumlah
// (jumlah / jumlah_besar / jumlah_kecil) dan satuan ke kolom satuan bahan.
function gvBahanFromResult(d) {
  return (Array.isArray(d.bahan) ? d.bahan : [])
    .filter((b) => b && String(b.nama || '').trim())
    .map((b) => {
      const jumlah = Number(b.jumlah) || 0;
      const ada = (v) => v !== undefined && v !== null && v !== '';
      return {
        nama: String(b.nama).trim(),
        jumlah,
        jumlah_besar: ada(b.jumlah_besar) ? (Number(b.jumlah_besar) || 0) : jumlah,
        jumlah_kecil: ada(b.jumlah_kecil) ? (Number(b.jumlah_kecil) || 0) : jumlah,
        satuan: b.satuan ? String(b.satuan).trim() : undefined,
        keterangan: b.keterangan ? String(b.keterangan).trim() : undefined,
      };
    });
}

// Gabungkan hasil ekstrak ke menu tujuan yang sudah ada.
// Bahan bernama sama → nilai ekstrak menimpa baris lama; bahan lain tetap.
// Header (kategori_penerima, deskripsi, jumlah_porsi) diisi dari ekstrak
// hanya bila ekstrak punya nilai — kolom gizi/gramasi dikirim apa adanya
// agar tidak di-reset (backend menghitung ulang otomatis dari bahan).
async function gvMergeToMenu(d, bahanBaru) {
  const sel = document.getElementById('gv-target-menu');
  const targetId = sel ? Number(sel.value) || 0 : 0;
  const cur = await api.get('/menu/' + targetId);

  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const isi = (v) => v !== undefined && v !== null && String(v).trim() !== '';

  const merged = (Array.isArray(cur.bahan) ? cur.bahan : []).map((b) => ({ ...b }));
  for (const b of bahanBaru) {
    const i = merged.findIndex((x) => norm(x.nama) === norm(b.nama));
    if (i >= 0) {
      const old = merged[i];
      merged[i] = {
        ...old,
        nama: old.nama,
        jumlah: b.jumlah,
        jumlah_besar: b.jumlah_besar,
        jumlah_kecil: b.jumlah_kecil,
        satuan: b.satuan || old.satuan,
        keterangan: b.keterangan || old.keterangan || '',
      };
    } else {
      merged.push({
        nama: b.nama,
        jumlah: b.jumlah,
        jumlah_besar: b.jumlah_besar,
        jumlah_kecil: b.jumlah_kecil,
        satuan: b.satuan,
        keterangan: b.keterangan || '',
      });
    }
  }

  await api.put('/menu/' + cur.id, {
    nama: cur.nama,
    kategori_penerima: isi(d.kategori) ? String(d.kategori) : cur.kategori_penerima,
    deskripsi: isi(d.catatan) ? String(d.catatan) : cur.deskripsi,
    jumlah_porsi: Number(d.porsi) > 0 ? Number(d.porsi) : (Number(cur.jumlah_porsi) || 0),
    gramasi_total: cur.gramasi_total,
    gramasi_besar: cur.gramasi_besar,
    gramasi_kecil: cur.gramasi_kecil,
    kalori: cur.kalori,
    protein: cur.protein,
    karbohidrat: cur.karbohidrat,
    lemak: cur.lemak,
    serat: cur.serat,
    bahan: merged,
    sync_satuan: true,
  });

  showToast('Hasil ekstrak digabung ke menu "' + cur.nama + '" · ' + bahanBaru.length +
    ' bahan dari ekstrak · total ' + merged.length + ' bahan', 'success');
  gvLoadMenuList(); // jumlah bahan di pilihan tujuan ikut ter-update
}

// Kirim hasil ekstraksi (mode menu) ke Data Menu via POST /menu
// (menu baru) atau PUT /menu/:id (gabung ke menu yang sudah dipilih).
// Backend mencocokkan bahan by nama & membuat bahan_baku baru bila belum ada,
// sync_satuan membuat satuan hasil ekstrak ikut masuk ke kolom
// bahan_baku.satuan, lalu gizi dihitung otomatis.
async function gvSaveToMenu() {
  const d = _gvState.last && _gvState.last.data;
  if (!d || typeof d !== 'object') return showAlert('Hasil ekstraksi bukan data menu JSON.', 'warning');

  const sel = document.getElementById('gv-target-menu');
  const punyaTarget = !!(sel && sel.value);
  const bahan = gvBahanFromResult(d);

  try {
    if (punyaTarget) return await gvMergeToMenu(d, bahan);

    const nama = String(d.nama_menu || '').trim();
    if (!nama) return showAlert('Nama menu kosong — ekstrak ulang dengan gambar menu yang lebih jelas, atau pilih menu tujuan.', 'warning');

    await api.post('/menu', {
      nama,
      kategori_penerima: d.kategori ? String(d.kategori) : null,
      deskripsi: d.catatan ? String(d.catatan) : null,
      jumlah_porsi: Number(d.porsi) || 0,
      bahan,
      sync_satuan: true,
    });
    showToast('Menu "' + nama + '" tersimpan ke Data Menu' + (bahan.length ? ' · ' + bahan.length + ' bahan' : ''), 'success');
    gvLoadMenuList(); // menu baru langsung tersedia di pilihan tujuan
  } catch (err) {
    showAlert(err.message || 'Gagal menyimpan menu.', 'error');
  }
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
        : '<span></span>';
    }
    // Panel pengaturan key (khusus admin): tunjukkan sumber key aktif
    const keySource = document.getElementById('gv-key-source');
    if (keySource) {
      keySource.textContent = s.source === 'db' ? '• sumber: database'
        : s.source === 'env' ? '• sumber: .env'
        : '• belum ada key tersimpan';
    }
    const keyClear = document.getElementById('gv-key-clear');
    if (keyClear) keyClear.classList.toggle('hidden', s.source !== 'db');
    gvUpdateRunState();
  } catch (err) {
    const apiStatus = document.getElementById('gv-api-status');
    if (apiStatus) apiStatus.textContent = 'Status tidak diketahui';
  }
}

// Simpan API key Groq ke database (admin) — langsung aktif tanpa restart.
async function gvSaveKey() {
  const input = document.getElementById('gv-key-input');
  const key = ((input && input.value) || '').trim();
  if (!key) return showAlert('Isi API key Groq dulu (diawali gsk_).', 'warning');
  try {
    await api.put('/vision/key', { api_key: key });
    if (input) input.value = '';
    showToast('API key tersimpan di database', 'success');
    gvLoadStatus();
  } catch (err) {
    showAlert(err.message || 'Gagal menyimpan API key.', 'error');
  }
}

// Hapus key dari database — kembali memakai GROQ_API_KEY dari .env (jika ada).
function gvClearKey() {
  if (!confirm('Hapus API key dari database? Aplikasi akan kembali memakai GROQ_API_KEY dari .env (jika ada).')) return;
  api.del('/vision/key').then(() => {
    showToast('Key dihapus dari database', 'success');
    gvLoadStatus();
  }).catch((err) => showAlert(err.message || 'Gagal menghapus API key.', 'error'));
}

function renderGroqVision() {
  _gvState = { dataUrl: '', name: '', bytes: 0, status: null, last: null, busy: false, menus: [] };

  const c = document.getElementById('content');

  c.innerHTML = `
    ${currentUser?.role === 'admin' ? `
    <div class="mb-5 bg-white rounded-2xl border border-stone-200 p-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-semibold text-stone-700">⚙️ API Key Groq</span>
        <span class="text-[11px]" style="opacity:.5">khusus admin</span>
        <span id="gv-key-source" class="text-[11px]" style="opacity:.5"></span>
        <button id="gv-key-clear" type="button"
          class="hidden ml-auto px-2.5 py-1 rounded-md border border-stone-300 text-[11px] text-stone-500 hover:bg-stone-100 transition-colors">Hapus key dari DB</button>
      </div>
      <div class="flex gap-2 mt-2.5">
        <input id="gv-key-input" type="password" autocomplete="off" spellcheck="false"
          placeholder="gsk_..."
          class="flex-1 h-9 px-3 rounded-lg border border-stone-300 text-sm mono" />
        <button id="gv-key-save" type="button"
          class="h-9 px-4 rounded-lg text-white text-xs font-semibold"
          style="background:#1e40af">Simpan</button>
      </div>
      <p class="text-[11px] mt-1.5" style="opacity:.5">Tersimpan di database dan langsung dipakai — tanpa edit .env, tanpa restart server.</p>
    </div>` : ''}

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
          <label for="gv-prompt" class="block text-xs font-semibold mb-1.5 text-stone-600">
            Instruksi tambahan <span class="font-normal text-stone-400">(opsional)</span>
          </label>
          <textarea id="gv-prompt" rows="3" maxlength="2000"
            placeholder="Contoh: jumlah bahan dalam gram."
            class="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm resize-y"></textarea>
        </div>

        <button id="gv-run" type="button" disabled
          class="mt-4 w-full h-11 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          style="background:#1e40af">
          <svg id="gv-run-spinner" class="hidden animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span id="gv-run-label">Ekstrak</span>
        </button>

        <div class="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-stone-400">
          <span id="gv-api-status" class="flex items-center gap-1.5">Memeriksa status API…</span>
          <span>Maks 6 MB</span>
        </div>
      </section>

      <!-- ═══ Panel Hasil ═══ -->
      <section class="bg-white rounded-2xl border border-stone-200 p-5 flex flex-col min-h-[460px]">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="min-w-0">
            <h2 class="font-bold text-base text-stone-800">Hasil Ekstraksi</h2>
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

        <div id="gv-target-row" class="hidden mt-3 flex flex-wrap items-center gap-2">
          <label for="gv-target-menu" class="text-xs font-semibold text-stone-600">Simpan ke menu</label>
          <select id="gv-target-menu"
            class="h-9 max-w-[240px] px-2.5 rounded-lg border border-stone-300 text-xs bg-white"></select>
          <span id="gv-target-note" class="text-[11px] text-stone-400"></span>
        </div>

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
          <button id="gv-to-menu" type="button"
            class="hidden px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
            style="background:#166534">⬆ Masukkan ke Data Menu</button>
          <button id="gv-clear" type="button" class="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium text-stone-500 hover:bg-stone-100 transition-colors">Bersihkan</button>
        </div>
      </section>
    </div>
  `;

  const dropzone = document.getElementById('gv-dropzone');
  const fileInput = document.getElementById('gv-file');

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
  document.getElementById('gv-to-menu')?.addEventListener('click', gvSaveToMenu);
  document.getElementById('gv-target-menu')?.addEventListener('change', gvUpdateTargetUi);

  // Panel API key (khusus admin)
  document.getElementById('gv-key-save')?.addEventListener('click', gvSaveKey);
  document.getElementById('gv-key-clear')?.addEventListener('click', gvClearKey);
  document.getElementById('gv-key-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); gvSaveKey(); }
  });

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

  gvRenderTargetOptions(); // opsi "Menu baru" dulu, daftar menu menyusul
  gvLoadStatus();
  gvLoadMenuList();
}
