// ============================================================================
// EDITOR POSTINGAN MEDIA SOSIAL
// Kanvas 1080×1080 / 1080×1350 / 1080×1920, teks bisa digeser, background &
// foto bisa diunggah. Gambar final dikompres JPEG sebelum disimpan/diunduh.
// ============================================================================

var _socialEd = null;
var _socialImgCache = {};
var SOCIAL_JPEG_QUALITY = 0.82;

var SOCIAL_FORMATS = {
  square: { w: 1080, h: 1080, label: 'Feed 1:1 — 1080 × 1080' },
  portrait: { w: 1080, h: 1350, label: 'Feed 4:5 — 1080 × 1350' },
  story: { w: 1080, h: 1920, label: 'Story 9:16 — 1080 × 1920' },
};

function socialEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function socialClamp(n, min, max) {
  n = Number(n);
  if (!Number.isFinite(n)) n = min;
  return Math.max(min, Math.min(max, n));
}

function socialToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function socialIsoDate(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const m = String(v == null ? '' : v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function socialFmtTanggal(v) {
  const iso = socialIsoDate(v);
  if (!iso) return '';
  if (typeof _dashFmtTanggal === 'function') return _dashFmtTanggal(iso);
  return iso;
}

function socialSampleMenu() {
  return {
    menu_id: null,
    menu_nama: 'Contoh Menu Bergizi',
    tanggal: socialToday(),
    kategori: '[]',
    kalori: 612,
    protein: 32,
    karbohidrat: 68,
    lemak: 18,
    serat: 6,
    foto: '',
  };
}

function socialNutritionText(m) {
  m = m || {};
  return 'Energi ' + Number(m.kalori || 0).toLocaleString('id-ID') + ' kkal' +
    '  ·  Protein ' + Number(m.protein || 0).toLocaleString('id-ID') + ' g' +
    '\nKarbo ' + Number(m.karbohidrat || 0).toLocaleString('id-ID') + ' g' +
    '  ·  Lemak ' + Number(m.lemak || 0).toLocaleString('id-ID') + ' g' +
    '  ·  Serat ' + Number(m.serat || 0).toLocaleString('id-ID') + ' g';
}

function socialDefaultCaption(m) {
  m = m || {};
  const title = m.menu_nama || 'Menu bergizi hari ini';
  const tgl = m.tanggal ? socialFmtTanggal(m.tanggal) : '';
  return (title + (tgl ? '\n' + tgl : '') +
    '\n\nMenu bergizi seimbang untuk mendukung tumbuh kembang dan aktivitas belajar.' +
    '\n\n' + socialNutritionText(m));
}

function socialDefaultLayers(m) {
  m = m || {};
  const tgl = m.tanggal ? socialFmtTanggal(m.tanggal) : '';
  return [
    {
      id: 'title', text: m.menu_nama || 'Menu Hari Ini',
      xPct: 0.07, yPct: 0.055, size: 58, color: '#FFFFFF', weight: 800,
      align: 'left', maxWidthPct: 0.86,
    },
    {
      id: 'date', text: tgl,
      xPct: 0.07, yPct: 0.19, size: 28, color: '#FDE68A', weight: 600,
      align: 'left', maxWidthPct: 0.86,
    },
    {
      id: 'nutrition', text: socialNutritionText(m),
      xPct: 0.07, yPct: 0.70, size: 27, color: '#FFFFFF', weight: 600,
      align: 'left', maxWidthPct: 0.86,
    },
    {
      id: 'footer', text: ((typeof currentTenant !== 'undefined' && currentTenant && currentTenant.nama) || 'SPPG') + ' · Menu Bergizi',
      xPct: 0.07, yPct: 0.925, size: 23, color: '#FFFFFF', weight: 600,
      align: 'left', maxWidthPct: 0.86,
    },
  ];
}

function socialNewState(menu) {
  menu = menu || socialSampleMenu();
  return {
    menu: menu,
    postId: null,
    imageUrl: '',
    format: 'portrait',
    bgColor: '#14532D',
    bgOverlay: 38,
    bgImage: null,
    photo: null,
    layers: socialDefaultLayers(menu),
    selected: 0,
    caption: socialDefaultCaption(menu),
    hashtags: '#MBG #MenuSehat #MakananBergizi',
    saving: false,
    notice: '',
  };
}

function socialSelectedLayer() {
  if (!_socialEd || !_socialEd.layers || !_socialEd.layers.length) return null;
  return _socialEd.layers[Math.max(0, Math.min(_socialEd.layers.length - 1, _socialEd.selected))] || null;
}

function socialImageSrc(img) {
  if (!img) return '';
  return img.dataUrl || img.url || '';
}

// ── Render halaman ─────────────────────────────────────────────────────────

async function renderEditorPostingan() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';

  let menu = null;
  let notice = '';
  try {
    const raw = sessionStorage.getItem('social_editor_menu');
    if (raw) menu = JSON.parse(raw);
  } catch (e) { menu = null; }
  if (!menu || !menu.menu_nama) {
    menu = socialSampleMenu();
    notice = 'Mode contoh. Buka halaman ini dari Dashboard → Menu Aktif Hari Ini agar data menu asli otomatis terisi.';
  }

  _socialEd = socialNewState(menu);
  _socialEd.notice = notice;
  if (menu.foto) _socialEd.photo = { url: menu.foto, dataUrl: null, img: null };

  socialRenderEditor();
  await socialPreloadImages();
}

function socialRenderEditor() {
  const c = document.getElementById('content');
  if (!c || !_socialEd) return;
  c.innerHTML = socialEditorHtml(_socialEd);
  socialBindCanvas();
  socialRenderLayerList();
  socialSyncLayerControls();
  socialUpdateImageUI();
  socialDrawPreview();
  socialLoadHistory();
}

function socialEditorHtml(st) {
  const m = st.menu || {};
  const sel = socialSelectedLayer();
  const inputCls = 'mt-1 w-full h-10 px-3 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all';
  const textareaCls = 'mt-1 w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all';
  const labelCls = 'text-xs font-semibold text-stone-500 uppercase tracking-wide';
  const cardCls = 'bg-white rounded-xl border border-stone-200 p-5';
  const jn = (function() {
    try { const p = JSON.parse(m.kategori || '[]'); return Array.isArray(p) ? p.join(' + ') : ''; } catch (e) { return ''; }
  })();

  return `
  <div class="space-y-4">
    ${st.notice ? `<div class="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800"><span class="text-base leading-none">⚠️</span><div>${socialEsc(st.notice)}</div></div>` : ''}
    <div class="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-800">
      <svg class="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
      <div>Buat gambar postingan menu untuk Instagram/media sosial. Geser teks langsung di preview, unggah background/foto, lalu <b>Simpan ke Riwayat</b> atau <b>Unduh JPEG</b>.</div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
      <div class="xl:col-span-3 space-y-4">
        <div class="${cardCls}">
          <div class="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 class="text-sm font-bold text-stone-800">Menu &amp; Format</h3>
              <div class="text-[11px] text-stone-400">Data menu aktif yang akan ditampilkan.</div>
            </div>
            <a href="/dashboard" data-key="dashboard" class="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800">Ganti menu →</a>
          </div>
          <div class="rounded-xl bg-stone-50 border border-stone-200 px-3 py-2.5">
            <div class="text-sm font-bold text-stone-800">${socialEsc(m.menu_nama || 'Tanpa menu')}</div>
            <div class="text-[11px] text-stone-500 mt-0.5">${socialEsc(socialFmtTanggal(m.tanggal))}${jn ? ' · ' + socialEsc(jn) : ''}</div>
          </div>
          <label class="block mt-3 ${labelCls}">Format</label>
          <select id="social-format" onchange="socialSetFormat(this.value)" class="${inputCls}">
            ${socialFormatOption('portrait', st.format, SOCIAL_FORMATS.portrait.label)}
            ${socialFormatOption('square', st.format, SOCIAL_FORMATS.square.label)}
            ${socialFormatOption('story', st.format, SOCIAL_FORMATS.story.label)}
          </select>
        </div>

        <div class="${cardCls}">
          <h3 class="text-sm font-bold text-stone-800 mb-1">Latar &amp; Foto</h3>
          <div class="text-[11px] text-stone-400 mb-3">Gambar akan dikompres otomatis sebelum disimpan.</div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="${labelCls}">Warna Latar</label>
              <div class="flex items-center gap-2 mt-1">
                <input id="social-bg-color" type="color" value="${socialEsc(st.bgColor)}" oninput="socialSetBgColor(this.value)" class="w-11 h-10 rounded-lg border border-stone-200 bg-white cursor-pointer shrink-0" />
                <input id="social-bg-color-hex" maxlength="7" value="${socialEsc(st.bgColor)}" oninput="socialSetBgColor(this.value)" class="flex-1 min-w-0 h-10 px-3 border border-stone-200 rounded-lg text-sm mono uppercase" />
              </div>
            </div>
            <div>
              <label class="${labelCls}">Overlay Gambar <span id="social-bg-overlay-val" class="text-stone-400 normal-case">${st.bgOverlay}%</span></label>
              <input id="social-bg-overlay" type="range" min="0" max="80" step="1" value="${st.bgOverlay}" oninput="socialSetBgOverlay(this.value)" class="mt-3 w-full accent-emerald-600" />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <div class="rounded-xl border border-stone-200 p-3">
              <div class="flex items-center justify-between mb-2">
                <div class="text-xs font-semibold text-stone-700">Gambar Latar</div>
                <button type="button" id="social-bg-remove" onclick="socialRemoveImage('background')" class="text-[10px] font-semibold text-red-600 hover:text-red-700 hidden">Hapus</button>
              </div>
              <img id="social-bg-thumb" alt="Background" class="w-full h-20 object-cover rounded-lg border border-stone-200 hidden" />
              <div id="social-bg-empty" class="w-full h-20 rounded-lg border border-dashed border-stone-200 bg-stone-50 flex items-center justify-center text-[11px] text-stone-400">Belum ada gambar latar</div>
              <input type="file" accept="image/png,image/jpeg,image/webp" onchange="socialPickImage('background', this)" class="mt-2 block w-full text-[11px] text-stone-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer" />
            </div>
            <div class="rounded-xl border border-stone-200 p-3">
              <div class="flex items-center justify-between mb-2">
                <div class="text-xs font-semibold text-stone-700">Foto Menu</div>
                <button type="button" id="social-photo-remove" onclick="socialRemoveImage('photo')" class="text-[10px] font-semibold text-red-600 hover:text-red-700 hidden">Hapus</button>
              </div>
              <img id="social-photo-thumb" alt="Foto menu" class="w-full h-20 object-cover rounded-lg border border-stone-200 hidden" />
              <div id="social-photo-empty" class="w-full h-20 rounded-lg border border-dashed border-stone-200 bg-stone-50 flex items-center justify-center text-[11px] text-stone-400">Belum ada foto menu</div>
              <input type="file" accept="image/png,image/jpeg,image/webp" onchange="socialPickImage('photo', this)" class="mt-2 block w-full text-[11px] text-stone-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer" />
            </div>
          </div>
        </div>

        <div class="${cardCls}">
          <div class="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 class="text-sm font-bold text-stone-800">Teks &amp; Posisi</h3>
              <div class="text-[11px] text-stone-400">Pilih layer, edit teks, lalu geser di preview.</div>
            </div>
            <button type="button" onclick="socialAddLayer()" class="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50">
              <span class="text-base leading-none">+</span> Teks Baru
            </button>
          </div>
          <div id="social-layer-list" class="flex flex-wrap gap-1.5 mb-3"></div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="sm:col-span-2">
              <label class="${labelCls}">Isi Teks</label>
              <textarea id="social-layer-text" rows="3" oninput="socialUpdateLayer('text', this.value)" class="${textareaCls}"></textarea>
            </div>
            <div>
              <label class="${labelCls}">Ukuran (px)</label>
              <input id="social-layer-size" type="number" min="10" max="200" step="1" oninput="socialUpdateLayer('size', this.value)" class="${inputCls}" />
            </div>
            <div>
              <label class="${labelCls}">Warna</label>
              <input id="social-layer-color" type="color" oninput="socialUpdateLayer('color', this.value)" class="mt-1 w-full h-10 rounded-lg border border-stone-200 bg-white cursor-pointer" />
            </div>
            <div>
              <label class="${labelCls}">Ketebalan</label>
              <select id="social-layer-weight" onchange="socialUpdateLayer('weight', this.value)" class="${inputCls}">
                ${socialWeightOption(400, sel && sel.weight, 'Normal')}
                ${socialWeightOption(600, sel && sel.weight, 'Semibold')}
                ${socialWeightOption(800, sel && sel.weight, 'Bold')}
              </select>
            </div>
            <div>
              <label class="${labelCls}">Perataan</label>
              <select id="social-layer-align" onchange="socialUpdateLayer('align', this.value)" class="${inputCls}">
                ${socialAlignOption('left', sel && sel.align, 'Kiri')}
                ${socialAlignOption('center', sel && sel.align, 'Tengah')}
                ${socialAlignOption('right', sel && sel.align, 'Kanan')}
              </select>
            </div>
            <div class="sm:col-span-2">
              <label class="${labelCls}">Lebar Teks <span id="social-layer-width-val" class="text-stone-400 normal-case">${sel ? Math.round((sel.maxWidthPct || 0.86) * 100) : 86}%</span></label>
              <input id="social-layer-width" type="range" min="20" max="100" step="1" value="${sel ? Math.round((sel.maxWidthPct || 0.86) * 100) : 86}" oninput="socialUpdateLayer('width', this.value)" class="mt-3 w-full accent-emerald-600" />
            </div>
          </div>
          <button type="button" onclick="socialDeleteLayer()" class="mt-3 text-[11px] font-semibold text-red-600 hover:text-red-700 px-2.5 py-1.5 rounded-lg hover:bg-red-50">Hapus layer teks ini</button>
        </div>

        <div class="${cardCls}">
          <div class="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 class="text-sm font-bold text-stone-800">Caption &amp; Hashtag</h3>
              <div class="text-[11px] text-stone-400">Disimpan bersama postingan, tidak dicetak ke gambar.</div>
            </div>
            <button type="button" onclick="socialCopyCaption()" class="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50">Salin</button>
          </div>
          <label class="${labelCls}">Caption</label>
          <textarea id="social-caption" rows="5" maxlength="2200" oninput="socialSetCaption(this.value)" class="${textareaCls}">${socialEsc(st.caption)}</textarea>
          <label class="block mt-3 ${labelCls}">Hashtag</label>
          <textarea id="social-hashtags" rows="2" maxlength="1000" oninput="socialSetHashtags(this.value)" class="${textareaCls}">${socialEsc(st.hashtags)}</textarea>
        </div>

        <div class="flex flex-wrap items-center gap-2 pb-6">
          <button type="button" id="social-save" onclick="socialSave()" class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Simpan ke Riwayat
          </button>
          <button type="button" onclick="socialDownload()" class="inline-flex items-center gap-2 border border-stone-200 hover:bg-stone-50 text-stone-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Unduh JPEG
          </button>
          <button type="button" onclick="socialShare()" class="inline-flex items-center gap-2 border border-stone-200 hover:bg-stone-50 text-stone-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Bagikan
          </button>
          <button type="button" onclick="socialNewPost()" class="inline-flex items-center gap-2 border border-stone-200 hover:bg-stone-50 text-stone-600 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">Postingan Baru</button>
          ${st.postId ? `<button type="button" onclick="socialDeletePost(${Number(st.postId)})" class="inline-flex items-center gap-2 border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">Hapus Postingan</button>` : ''}
          <span id="social-save-status" class="text-[11px] text-stone-400"></span>
        </div>
      </div>

      <div class="xl:col-span-2">
        <div class="xl:sticky xl:top-20 bg-white rounded-xl border border-stone-200 p-4">
          <div class="flex items-center justify-between mb-3">
            <div>
              <div class="text-sm font-bold text-stone-800">Preview</div>
              <div id="social-preview-meta" class="text-[11px] text-stone-400"></div>
            </div>
            <button type="button" onclick="socialDrawPreview()" class="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-lg hover:bg-emerald-50">Muat ulang</button>
          </div>
          <div class="rounded-xl overflow-hidden border border-stone-200 bg-stone-100">
            <canvas id="social-preview" class="w-full block" style="touch-action:none"></canvas>
          </div>
          <p class="text-[11px] text-stone-400 mt-2 leading-relaxed">Geser teks langsung di preview. Gambar final disimpan sebagai JPEG terkompresi.</p>
        </div>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-stone-200 p-5">
      <div class="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 class="text-sm font-bold text-stone-800">Riwayat Postingan</h3>
          <div class="text-[11px] text-stone-400">Hapus di sini akan menghapus baris database dan file gambar asli.</div>
        </div>
        <button type="button" onclick="socialLoadHistory()" class="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-lg hover:bg-emerald-50">Muat ulang</button>
      </div>
      <div id="social-history" class="text-sm text-stone-400">Memuat riwayat...</div>
    </div>
  </div>`;
}

function socialFormatOption(value, current, label) {
  return '<option value="' + value + '"' + (value === current ? ' selected' : '') + '>' + socialEsc(label) + '</option>';
}

function socialWeightOption(value, current, label) {
  return '<option value="' + value + '"' + (Number(current) === value ? ' selected' : '') + '>' + socialEsc(label) + '</option>';
}

function socialAlignOption(value, current, label) {
  return '<option value="' + value + '"' + (value === current ? ' selected' : '') + '>' + socialEsc(label) + '</option>';
}

// ── Layer teks ─────────────────────────────────────────────────────────────

function socialRenderLayerList() {
  const el = document.getElementById('social-layer-list');
  if (!el || !_socialEd) return;
  el.innerHTML = _socialEd.layers.map(function(l, i) {
    const active = i === _socialEd.selected;
    const raw = String(l.text || 'Teks').split('\n')[0] || 'Teks';
    return '<button type="button" onclick="socialSelectLayer(' + i + ')" class="inline-flex items-center gap-1.5 max-w-[210px] px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ' +
      (active ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50') + '">' +
      '<span class="truncate">' + socialEsc(raw) + '</span>' +
      '<span class="text-[9px] opacity-60 shrink-0">' + Math.round(Number(l.size) || 0) + 'px</span>' +
      '</button>';
  }).join('');
}

function socialSyncLayerControls() {
  const l = socialSelectedLayer();
  const ids = ['social-layer-text', 'social-layer-size', 'social-layer-color', 'social-layer-weight', 'social-layer-align', 'social-layer-width'];
  ids.forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.disabled = !l;
  });
  if (!l) return;
  const text = document.getElementById('social-layer-text');
  if (text) text.value = l.text || '';
  const size = document.getElementById('social-layer-size');
  if (size) size.value = Math.round(Number(l.size) || 40);
  const color = document.getElementById('social-layer-color');
  if (color) color.value = l.color || '#FFFFFF';
  const weight = document.getElementById('social-layer-weight');
  if (weight) weight.value = String(Number(l.weight) || 600);
  const align = document.getElementById('social-layer-align');
  if (align) align.value = l.align || 'left';
  const width = document.getElementById('social-layer-width');
  if (width) width.value = Math.round((Number(l.maxWidthPct) || 0.86) * 100);
  const widthVal = document.getElementById('social-layer-width-val');
  if (widthVal) widthVal.textContent = Math.round((Number(l.maxWidthPct) || 0.86) * 100) + '%';
}

function socialSelectLayer(i) {
  if (!_socialEd || !_socialEd.layers[i]) return;
  _socialEd.selected = i;
  socialRenderLayerList();
  socialSyncLayerControls();
  socialDrawPreview();
}

function socialAddLayer() {
  if (!_socialEd) return;
  const n = _socialEd.layers.length + 1;
  _socialEd.layers.push({
    id: 'custom-' + Date.now(),
    text: 'Teks baru ' + n,
    xPct: 0.1,
    yPct: Math.min(0.82, 0.42 + (n % 4) * 0.06),
    size: 40,
    color: '#FFFFFF',
    weight: 600,
    align: 'left',
    maxWidthPct: 0.8,
  });
  _socialEd.selected = _socialEd.layers.length - 1;
  socialRenderLayerList();
  socialSyncLayerControls();
  socialDrawPreview();
}

function socialDeleteLayer() {
  if (!_socialEd || !socialSelectedLayer()) return;
  if (_socialEd.layers.length <= 1) {
    showAlert('Minimal harus ada satu layer teks.', 'warning');
    return;
  }
  _socialEd.layers.splice(_socialEd.selected, 1);
  _socialEd.selected = Math.max(0, Math.min(_socialEd.layers.length - 1, _socialEd.selected - 1));
  socialRenderLayerList();
  socialSyncLayerControls();
  socialDrawPreview();
}

function socialUpdateLayer(key, value) {
  const l = socialSelectedLayer();
  if (!l) return;
  if (key === 'text') l.text = String(value == null ? '' : value);
  else if (key === 'size') l.size = socialClamp(value, 10, 200);
  else if (key === 'color') l.color = value || '#FFFFFF';
  else if (key === 'weight') l.weight = parseInt(value, 10) || 600;
  else if (key === 'align') l.align = (value === 'center' || value === 'right') ? value : 'left';
  else if (key === 'width') {
    l.maxWidthPct = socialClamp(parseInt(value, 10) / 100, 0.2, 1);
    const wv = document.getElementById('social-layer-width-val');
    if (wv) wv.textContent = Math.round(l.maxWidthPct * 100) + '%';
  }
  socialRenderLayerList();
  socialDrawPreview();
}

// ── Warna, format, gambar ──────────────────────────────────────────────────

function socialSetFormat(v) {
  if (!_socialEd) return;
  _socialEd.format = SOCIAL_FORMATS[v] ? v : 'portrait';
  socialDrawPreview();
}

function socialSetBgColor(v) {
  if (!_socialEd) return;
  const s = String(v || '').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return;
  _socialEd.bgColor = s.toUpperCase();
  const hex = document.getElementById('social-bg-color-hex');
  if (hex) hex.value = _socialEd.bgColor;
  const color = document.getElementById('social-bg-color');
  if (color) color.value = _socialEd.bgColor;
  socialDrawPreview();
}

function socialSetBgOverlay(v) {
  if (!_socialEd) return;
  _socialEd.bgOverlay = socialClamp(v, 0, 80);
  const el = document.getElementById('social-bg-overlay-val');
  if (el) el.textContent = Math.round(_socialEd.bgOverlay) + '%';
  socialDrawPreview();
}

function socialSetCaption(v) {
  if (_socialEd) _socialEd.caption = String(v || '');
}

function socialSetHashtags(v) {
  if (_socialEd) _socialEd.hashtags = String(v || '');
}

function socialUpdateImageUI() {
  if (!_socialEd) return;
  function apply(img, thumbId, emptyId, removeId) {
    const thumb = document.getElementById(thumbId);
    const empty = document.getElementById(emptyId);
    const remove = document.getElementById(removeId);
    const src = socialImageSrc(img);
    if (thumb) {
      if (src) {
        thumb.src = src;
        thumb.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');
      } else {
        thumb.removeAttribute('src');
        thumb.classList.add('hidden');
        if (empty) empty.classList.remove('hidden');
      }
    }
    if (remove) remove.classList.toggle('hidden', !src);
  }
  apply(_socialEd.bgImage, 'social-bg-thumb', 'social-bg-empty', 'social-bg-remove');
  apply(_socialEd.photo, 'social-photo-thumb', 'social-photo-empty', 'social-photo-remove');
}

async function socialPickImage(kind, input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  try {
    showToast('Mengompres gambar...', 'info');
    const dataUrl = await socialCompressFile(file, kind === 'background' ? 1920 : 1600);
    const img = await socialLoadImage(dataUrl);
    if (!_socialEd) return;
    if (kind === 'background') _socialEd.bgImage = { url: '', dataUrl: dataUrl, img: img };
    else _socialEd.photo = { url: '', dataUrl: dataUrl, img: img };
    socialUpdateImageUI();
    socialDrawPreview();
    showToast('Gambar siap dipakai', 'success');
  } catch (e) {
    showAlert(e.message || 'Gagal memproses gambar', 'error');
  } finally {
    if (input) input.value = '';
  }
}

function socialRemoveImage(kind) {
  if (!_socialEd) return;
  if (kind === 'background') _socialEd.bgImage = null;
  else _socialEd.photo = null;
  socialUpdateImageUI();
  socialDrawPreview();
}

function socialLoadImage(src) {
  if (!src) return Promise.resolve(null);
  if (_socialImgCache[src]) return _socialImgCache[src];
  _socialImgCache[src] = new Promise(function(resolve) {
    const img = new Image();
    img.onload = function() { resolve(img); };
    img.onerror = function() { resolve(null); };
    img.src = src;
  });
  return _socialImgCache[src];
}

async function socialPreloadImages() {
  if (!_socialEd) return;
  const jobs = [];
  if (_socialEd.bgImage && socialImageSrc(_socialEd.bgImage)) {
    const obj = _socialEd.bgImage;
    jobs.push(socialLoadImage(socialImageSrc(obj)).then(function(img) {
      if (img && _socialEd && _socialEd.bgImage === obj) { obj.img = img; socialDrawPreview(); }
    }));
  }
  if (_socialEd.photo && socialImageSrc(_socialEd.photo)) {
    const obj = _socialEd.photo;
    jobs.push(socialLoadImage(socialImageSrc(obj)).then(function(img) {
      if (img && _socialEd && _socialEd.photo === obj) { obj.img = img; socialDrawPreview(); }
    }));
  }
  await Promise.all(jobs);
}

function socialCompressFile(file, maxDim) {
  return new Promise(function(resolve, reject) {
    const isImage = file && (/^image\/(png|jpe?g|webp)$/.test(file.type || '') || /\.(png|jpe?g|webp)$/i.test(file.name || ''));
    if (!isImage) {
      reject(new Error('File harus berupa gambar PNG, JPG, atau WEBP.'));
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      reject(new Error('Ukuran file maksimal 20 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = function() {
      const img = new Image();
      img.onload = function() {
        try { resolve(socialImageToDataUrl(img, maxDim, SOCIAL_JPEG_QUALITY)); }
        catch (e) { reject(e); }
      };
      img.onerror = function() { reject(new Error('Gagal membaca gambar.')); };
      img.src = reader.result;
    };
    reader.onerror = function() { reject(new Error('Gagal membaca file.')); };
    reader.readAsDataURL(file);
  });
}

function socialImageToDataUrl(img, maxDim, quality) {
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const scale = Math.min(1, (maxDim || 1600) / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return cv.toDataURL('image/jpeg', quality || SOCIAL_JPEG_QUALITY);
}

// ── Kanvas ─────────────────────────────────────────────────────────────────

function socialCanvasSize() {
  return SOCIAL_FORMATS[(_socialEd && _socialEd.format) || 'portrait'] || SOCIAL_FORMATS.portrait;
}

function socialDrawPreview() {
  const cv = document.getElementById('social-preview');
  if (!cv || !_socialEd) return;
  const size = socialCanvasSize();
  socialDrawCanvas(cv, true, true);
  const meta = document.getElementById('social-preview-meta');
  if (meta) meta.textContent = size.w + ' × ' + size.h + ' px';
}

function socialDrawCanvas(cv, showSelection, isPreview) {
  if (!cv || !_socialEd) return;
  const size = socialCanvasSize();
  const W = size.w, H = size.h;
  if (cv.width !== W) cv.width = W;
  if (cv.height !== H) cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // Background warna
  ctx.fillStyle = _socialEd.bgColor || '#14532D';
  ctx.fillRect(0, 0, W, H);

  // Gambar latar + overlay
  const bgImg = _socialEd.bgImage && _socialEd.bgImage.img;
  if (bgImg) {
    socialDrawImageCover(ctx, bgImg, 0, 0, W, H, 0);
    ctx.fillStyle = 'rgba(0,0,0,' + (socialClamp(_socialEd.bgOverlay, 0, 80) / 100) + ')';
    ctx.fillRect(0, 0, W, H);
  } else {
    // Dekorasi lembut saat memakai warna solid
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#F97316';
    ctx.beginPath(); ctx.arc(W * 0.92, H * 0.12, W * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(W * 0.08, H * 0.88, W * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Gradasi bawah agar teks footer tetap terbaca
  const grad = ctx.createLinearGradient(0, H * 0.58, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Garis aksen atas
  ctx.fillStyle = '#F97316';
  ctx.fillRect(0, 0, W, Math.max(6, Math.round(W * 0.007)));

  // Foto menu (frame tetap, teks yang bisa digeser)
  socialDrawPhoto(ctx, W, H, isPreview);

  // Teks
  _socialEd.layers.forEach(function(l) {
    socialDrawLayer(ctx, l, W, H);
  });

  if (showSelection) {
    const l = socialSelectedLayer();
    if (l && l._bbox) {
      const b = l._bbox;
      ctx.save();
      ctx.strokeStyle = '#34D399';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.strokeRect(b.x - 10, b.y - 10, b.w + 20, b.h + 20);
      ctx.setLineDash([]);
      ctx.fillStyle = '#34D399';
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.fillText('Geser teks', b.x - 10, Math.max(24, b.y - 20));
      ctx.restore();
    }
  }
}

function socialDrawPhoto(ctx, W, H, isPreview) {
  const r = socialPhotoRect(W, H);
  const photo = _socialEd.photo && _socialEd.photo.img;
  if (photo) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    socialRoundRect(ctx, r.x, r.y, r.w, r.h, r.radius);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
    socialDrawImageCover(ctx, photo, r.x, r.y, r.w, r.h, r.radius);
    ctx.save();
    socialRoundRect(ctx, r.x, r.y, r.w, r.h, r.radius);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  } else if (isPreview) {
    ctx.save();
    ctx.setLineDash([14, 10]);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 3;
    socialRoundRect(ctx, r.x, r.y, r.w, r.h, r.radius);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '600 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Unggah foto menu', r.x + r.w / 2, r.y + r.h / 2);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}

function socialPhotoRect(W, H) {
  return {
    x: W * 0.07,
    y: H * 0.27,
    w: W * 0.86,
    h: H * 0.36,
    radius: Math.round(W * 0.026),
  };
}

function socialDrawLayer(ctx, l, W, H) {
  if (!l || !String(l.text || '').trim()) { l._bbox = null; return; }
  const size = socialClamp(l.size, 10, 200);
  const weight = Number(l.weight) || 600;
  const maxW = W * socialClamp(l.maxWidthPct || 0.86, 0.2, 1);
  ctx.save();
  ctx.font = weight + ' ' + size + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
  const lines = socialWrapText(ctx, l.text, maxW);
  const lineH = Math.round(size * 1.18);
  const anchorX = W * socialClamp(l.xPct, -0.2, 1.2);
  const y = H * socialClamp(l.yPct, -0.2, 1.2);
  let textW = 0;
  lines.forEach(function(line) { textW = Math.max(textW, ctx.measureText(line).width); });
  textW = Math.min(textW, maxW);
  let left = anchorX;
  if (l.align === 'center') left = anchorX + (maxW - textW) / 2;
  else if (l.align === 'right') left = anchorX + maxW - textW;
  l._bbox = { x: left, y: y, w: Math.max(textW, 12), h: Math.max(lines.length * lineH, size) };

  ctx.fillStyle = l.color || '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.32)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  lines.forEach(function(line, i) {
    ctx.fillText(line, left, y + i * lineH);
  });
  ctx.restore();
}

function socialWrapText(ctx, text, maxW) {
  const out = [];
  const paragraphs = String(text == null ? '' : text).split('\n');
  paragraphs.forEach(function(par) {
    const words = par.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); return; }
    let line = '';
    words.forEach(function(word) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) out.push(line);
  });
  return out.length ? out : [''];
}

function socialRoundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r || 0, w / 2, h / 2));
  ctx.beginPath();
  if (!rr) { ctx.rect(x, y, w, h); return; }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function socialDrawImageCover(ctx, img, x, y, w, h, radius) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const ir = iw / ih;
  const br = w / h;
  let dw, dh, dx, dy;
  if (ir > br) {
    dh = h; dw = h * ir; dx = x - (dw - w) / 2; dy = y;
  } else {
    dw = w; dh = w / ir; dx = x; dy = y - (dh - h) / 2;
  }
  ctx.save();
  socialRoundRect(ctx, x, y, w, h, radius || 0);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function socialBindCanvas() {
  const cv = document.getElementById('social-preview');
  if (!cv) return;
  cv.style.cursor = 'grab';
  let drag = null;

  function toCanvas(e) {
    const rect = cv.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * cv.width / Math.max(1, rect.width),
      y: (e.clientY - rect.top) * cv.height / Math.max(1, rect.height),
    };
  }

  cv.addEventListener('pointerdown', function(e) {
    if (!_socialEd) return;
    const p = toCanvas(e);
    let found = -1;
    for (let i = _socialEd.layers.length - 1; i >= 0; i--) {
      const b = _socialEd.layers[i]._bbox;
      if (b && p.x >= b.x - 12 && p.x <= b.x + b.w + 12 && p.y >= b.y - 12 && p.y <= b.y + b.h + 12) {
        found = i;
        break;
      }
    }
    if (found < 0) return;
    _socialEd.selected = found;
    const l = _socialEd.layers[found];
    drag = { idx: found, x: p.x, y: p.y, xPct: Number(l.xPct) || 0, yPct: Number(l.yPct) || 0 };
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    cv.style.cursor = 'grabbing';
    socialRenderLayerList();
    socialSyncLayerControls();
    socialDrawPreview();
    e.preventDefault();
  });

  cv.addEventListener('pointermove', function(e) {
    if (!drag || !_socialEd) return;
    const p = toCanvas(e);
    const l = _socialEd.layers[drag.idx];
    if (!l) return;
    l.xPct = Math.max(-0.2, Math.min(1.2, drag.xPct + (p.x - drag.x) / cv.width));
    l.yPct = Math.max(-0.2, Math.min(1.2, drag.yPct + (p.y - drag.y) / cv.height));
    socialDrawPreview();
    e.preventDefault();
  });

  function endDrag(e) {
    if (!drag) return;
    drag = null;
    cv.style.cursor = 'grab';
    try { if (e) cv.releasePointerCapture(e.pointerId); } catch (err) {}
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
}

// ── Simpan, unduh, bagikan ─────────────────────────────────────────────────

async function socialRenderBlob() {
  if (!_socialEd) throw new Error('Editor belum siap.');
  // Pastikan foto/background yang masih dimuat ikut masuk ke gambar final.
  await socialPreloadImages();
  const cv = document.createElement('canvas');
  socialDrawCanvas(cv, false, false);
  return await new Promise(function(resolve, reject) {
    cv.toBlob(function(blob) {
      if (blob) resolve(blob);
      else reject(new Error('Gagal membuat gambar JPEG.'));
    }, 'image/jpeg', SOCIAL_JPEG_QUALITY);
  });
}

function socialBlobToDataUrl(blob) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function() { resolve(reader.result); };
    reader.onerror = function() { reject(new Error('Gagal membaca hasil gambar.')); };
    reader.readAsDataURL(blob);
  });
}

async function socialBuildPayload(imageDataUrl) {
  const st = _socialEd;
  let photoBase64 = st.photo && st.photo.dataUrl ? st.photo.dataUrl : null;
  // Foto menu lama (mis. /uploads/menu/...) disalin ke folder social agar
  // penghapusan postingan tidak menghapus foto master menu.
  if (!photoBase64 && st.photo && st.photo.url && st.photo.img && !String(st.photo.url).startsWith('/uploads/social/')) {
    photoBase64 = socialImageToDataUrl(st.photo.img, 1600, SOCIAL_JPEG_QUALITY);
  }
  return {
    menu_id: (st.menu && st.menu.menu_id) || null,
    menu_nama: (st.menu && (st.menu.menu_nama || st.menu.nama)) || '',
    tanggal: socialIsoDate(st.menu && st.menu.tanggal),
    format: st.format,
    caption: st.caption,
    hashtags: st.hashtags,
    draft: {
      version: 1,
      menu: {
        menu_id: (st.menu && st.menu.menu_id) || null,
        menu_nama: (st.menu && (st.menu.menu_nama || st.menu.nama)) || '',
        tanggal: socialIsoDate(st.menu && st.menu.tanggal),
        kalori: (st.menu && st.menu.kalori) || 0,
        protein: (st.menu && st.menu.protein) || 0,
        karbohidrat: (st.menu && st.menu.karbohidrat) || 0,
        lemak: (st.menu && st.menu.lemak) || 0,
        serat: (st.menu && st.menu.serat) || 0,
        kategori: (st.menu && st.menu.kategori) || '',
      },
      bgColor: st.bgColor,
      bgOverlay: st.bgOverlay,
      layers: (st.layers || []).map(function(l) {
        return {
          id: l.id, text: l.text, xPct: l.xPct, yPct: l.yPct, size: l.size,
          color: l.color, weight: l.weight, align: l.align, maxWidthPct: l.maxWidthPct,
        };
      }),
    },
    image_base64: imageDataUrl,
    background_base64: st.bgImage && st.bgImage.dataUrl ? st.bgImage.dataUrl : null,
    photo_base64: photoBase64,
    remove_background: st.bgImage ? 0 : 1,
    remove_photo: st.photo ? 0 : 1,
  };
}

async function socialSave() {
  if (!_socialEd || _socialEd.saving) return;
  const btn = document.getElementById('social-save');
  const status = document.getElementById('social-save-status');
  _socialEd.saving = true;
  if (btn) { btn.disabled = true; btn.classList.add('opacity-60'); }
  if (status) status.textContent = 'Membuat gambar...';
  try {
    const blob = await socialRenderBlob();
    if (status) status.textContent = 'Menyimpan...';
    const dataUrl = await socialBlobToDataUrl(blob);
    const payload = await socialBuildPayload(dataUrl);
    const res = _socialEd.postId
      ? await api.put('/social-posts/' + _socialEd.postId, payload)
      : await api.post('/social-posts', payload);
    _socialEd.postId = res.id;
    _socialEd.imageUrl = res.image_url;
    _socialEd.bgImage = res.background_url
      ? { url: res.background_url, dataUrl: null, img: _socialEd.bgImage && _socialEd.bgImage.img }
      : null;
    _socialEd.photo = res.photo_url
      ? { url: res.photo_url, dataUrl: null, img: _socialEd.photo && _socialEd.photo.img }
      : null;
    socialUpdateImageUI();
    socialLoadHistory();
    if (status) status.textContent = 'Tersimpan · ' + Math.round(blob.size / 1024) + ' KB';
    showToast('Postingan tersimpan (' + Math.round(blob.size / 1024) + ' KB)', 'success');
  } catch (e) {
    if (status) status.textContent = 'Gagal menyimpan';
    showAlert(e.message || 'Gagal menyimpan postingan', 'error');
  } finally {
    _socialEd.saving = false;
    if (btn) { btn.disabled = false; btn.classList.remove('opacity-60'); }
  }
}

function socialDownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 4000);
}

async function socialDownload() {
  try {
    showToast('Menyiapkan gambar...', 'info');
    const blob = await socialRenderBlob();
    socialDownloadBlob(blob, 'postingan-menu-' + socialToday() + '.jpg');
    showToast('Gambar diunduh (' + Math.round(blob.size / 1024) + ' KB)', 'success');
  } catch (e) {
    showAlert(e.message || 'Gagal mengunduh gambar', 'error');
  }
}

function socialCaptionFull() {
  if (!_socialEd) return '';
  return [_socialEd.caption, _socialEd.hashtags].filter(function(s) { return String(s || '').trim(); }).join('\n\n');
}

async function socialCopyCaption() {
  const text = socialCaptionFull();
  if (!text) { showAlert('Caption masih kosong.', 'warning'); return; }
  try {
    if (!(navigator.clipboard && navigator.clipboard.writeText)) throw new Error('Clipboard tidak tersedia');
    await navigator.clipboard.writeText(text);
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (!ok) throw new Error('Clipboard tidak tersedia');
    } catch (e2) {
      showAlert('Gagal menyalin caption: ' + (e2.message || 'Clipboard tidak tersedia'), 'error');
      return;
    }
  }
  showToast('Caption disalin', 'success');
}

async function socialShare() {
  try {
    const blob = await socialRenderBlob();
    const filename = 'postingan-menu-' + socialToday() + '.jpg';
    const file = new File([blob], filename, { type: 'image/jpeg' });
    const text = socialCaptionFull();
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: text, title: (_socialEd.menu && _socialEd.menu.menu_nama) || 'Menu Bergizi' });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        // Browser bisa menolak share file (mis. desktop) → fallback unduh.
      }
    }
    socialDownloadBlob(blob, filename);
    showToast('Browser belum mendukung share file — gambar diunduh.', 'info');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    showAlert(e.message || 'Gagal membagikan gambar', 'error');
  }
}

function socialNewPost() {
  if (!_socialEd) return;
  const menu = _socialEd.menu;
  _socialEd = socialNewState(menu);
  _socialEd.notice = 'Postingan baru — perubahan belum disimpan.';
  if (menu && menu.foto) _socialEd.photo = { url: menu.foto, dataUrl: null, img: null };
  socialRenderEditor();
  socialPreloadImages();
}

// ── Riwayat ────────────────────────────────────────────────────────────────

async function socialLoadHistory() {
  const el = document.getElementById('social-history');
  if (!el) return;
  el.innerHTML = '<div class="flex items-center gap-2 text-stone-400"><svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Memuat riwayat...</div>';
  try {
    const res = await api.get('/social-posts?limit=40');
    socialRenderHistory(res.data || []);
  } catch (e) {
    el.innerHTML = '<div class="text-xs text-red-600">Gagal memuat riwayat: ' + socialEsc(e.message) + '</div>';
  }
}

function socialRenderHistory(items) {
  const el = document.getElementById('social-history');
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<div class="text-sm text-stone-400 py-4 text-center">Belum ada postingan tersimpan. Klik <b>Simpan ke Riwayat</b> setelah membuat gambar.</div>';
    return;
  }
  el.innerHTML = '<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">' + items.map(function(p) {
    return '<div class="flex gap-3 rounded-xl border border-stone-200 bg-stone-50 p-2.5">' +
      '<a href="' + socialEsc(p.image_url) + '" target="_blank" rel="noopener" class="shrink-0 w-16 h-20 rounded-lg overflow-hidden border border-stone-200 bg-white">' +
        '<img src="' + socialEsc(p.image_url) + '" alt="Postingan" class="w-full h-full object-cover" />' +
      '</a>' +
      '<div class="min-w-0 flex-1">' +
        '<div class="text-xs font-bold text-stone-800 truncate">' + socialEsc(p.menu_nama || 'Tanpa menu') + '</div>' +
        '<div class="text-[10px] text-stone-500 mt-0.5">' + socialEsc(socialFmtTanggal(p.tanggal)) + ' · ' + socialEsc(p.format || 'portrait') + '</div>' +
        '<div class="text-[10px] text-stone-400 mt-0.5">Disimpan ' + socialEsc(fmtDate(p.created_at)) + '</div>' +
        '<div class="text-[10px] text-stone-500 mt-1 line-clamp-2">' + socialEsc(p.caption || '') + '</div>' +
        '<div class="flex items-center gap-1.5 mt-2">' +
          '<button type="button" onclick="socialLoadPost(' + Number(p.id) + ')" class="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-md hover:bg-emerald-50">Muat</button>' +
          '<button type="button" onclick="socialDeletePost(' + Number(p.id) + ')" class="text-[10px] font-bold text-red-600 hover:text-red-700 px-2 py-1 rounded-md hover:bg-red-50">Hapus</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

async function socialLoadPost(id) {
  try {
    const row = await api.get('/social-posts/' + id);
    const draft = row.draft || {};
    const menu = draft.menu || {
      menu_id: row.menu_id,
      menu_nama: row.menu_nama,
      tanggal: row.tanggal,
    };
    const st = socialNewState(menu);
    st.postId = row.id;
    st.imageUrl = row.image_url || '';
    st.format = SOCIAL_FORMATS[row.format] ? row.format : 'portrait';
    st.bgColor = /^#[0-9a-fA-F]{6}$/.test(draft.bgColor || '') ? draft.bgColor.toUpperCase() : st.bgColor;
    st.bgOverlay = socialClamp(draft.bgOverlay == null ? st.bgOverlay : draft.bgOverlay, 0, 80);
    st.layers = Array.isArray(draft.layers) && draft.layers.length ? draft.layers : st.layers;
    st.selected = 0;
    st.caption = row.caption != null ? row.caption : st.caption;
    st.hashtags = row.hashtags != null ? row.hashtags : st.hashtags;
    st.bgImage = row.background_url ? { url: row.background_url, dataUrl: null, img: null } : null;
    st.photo = row.photo_url ? { url: row.photo_url, dataUrl: null, img: null } : (menu.foto ? { url: menu.foto, dataUrl: null, img: null } : null);
    st.notice = 'Memuat postingan tersimpan #' + row.id + '. Simpan lagi untuk memperbarui.';
    _socialEd = st;
    socialRenderEditor();
    await socialPreloadImages();
    showToast('Postingan dimuat', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    showAlert(e.message || 'Gagal memuat postingan', 'error');
  }
}

async function socialDeletePost(id) {
  const ok = await showConfirm('Hapus postingan ini? Baris database dan file gambar asli akan dihapus permanen.', 'Hapus', 'Batal', '', 'danger');
  if (!ok) return;
  try {
    await api.del('/social-posts/' + id);
    if (_socialEd && Number(_socialEd.postId) === Number(id)) {
      // File aset sudah dihapus server, jadi reset editor agar tidak menyimpan
      // URL lama yang sudah tidak ada.
      const menu = _socialEd.menu;
      _socialEd = socialNewState(menu);
      _socialEd.notice = 'Postingan dihapus. Editor direset sebagai postingan baru.';
      if (menu && menu.foto) _socialEd.photo = { url: menu.foto, dataUrl: null, img: null };
      socialRenderEditor();
      socialPreloadImages();
    } else {
      socialLoadHistory();
    }
    showToast('Postingan dan file gambar dihapus', 'success');
  } catch (e) {
    showAlert(e.message || 'Gagal menghapus postingan', 'error');
  }
}
