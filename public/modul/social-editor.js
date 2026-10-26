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

var SOCIAL_PHOTO_RECT = { xPct: 0.07, yPct: 0.27, wPct: 0.86, hPct: 0.36 };
var SOCIAL_OBJECT_TYPES = {
  rect: 'Kotak',
  ellipse: 'Lingkaran',
  line: 'Garis',
  arrow: 'Panah',
  triangle: 'Segitiga',
};

var SOCIAL_ARROW_STYLES = {
  classic: 'Klasik (garis)',
  cartoon: 'Kartun (melengkung)',
  block: 'Blok (tebal)',
  double: 'Dua arah',
};

var SOCIAL_FONTS = {
  system: { label: 'Sistem (default)', css: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
  comic: { label: 'Comic Neue (mirip Comic Sans)', css: '"Comic Neue", "Comic Sans MS", cursive' },
  baloo: { label: 'Baloo 2 (bulat lucu)', css: '"Baloo 2", cursive' },
  fredoka: { label: 'Fredoka (bulat lucu)', css: 'Fredoka, sans-serif' },
  grandstander: { label: 'Grandstander (lucu)', css: 'Grandstander, cursive' },
  luckiest: { label: 'Luckiest Guy (komik)', css: '"Luckiest Guy", cursive' },
  bangers: { label: 'Bangers (komik)', css: 'Bangers, cursive' },
  chewy: { label: 'Chewy (lucu)', css: 'Chewy, cursive' },
  sniglet: { label: 'Sniglet (lucu)', css: 'Sniglet, cursive' },
  patrick: { label: 'Patrick Hand (tulisan tangan)', css: '"Patrick Hand", cursive' },
  caveat: { label: 'Caveat (tulisan tangan)', css: 'Caveat, cursive' },
  pacifico: { label: 'Pacifico (script)', css: 'Pacifico, cursive' },
  lobster: { label: 'Lobster (script)', css: 'Lobster, cursive' },
  bungee: { label: 'Bungee (judul tebal)', css: 'Bungee, cursive' },
  righteous: { label: 'Righteous (judul)', css: 'Righteous, cursive' },
  montserrat: { label: 'Montserrat (modern)', css: 'Montserrat, sans-serif' },
  poppins: { label: 'Poppins (modern)', css: 'Poppins, sans-serif' },
  nunito: { label: 'Nunito (bulat)', css: 'Nunito, sans-serif' },
  quicksand: { label: 'Quicksand (bulat)', css: 'Quicksand, sans-serif' },
};

var SOCIAL_FONT_URL = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@400..800&family=Bangers&family=Bungee&family=Caveat:wght@400..700&family=Chewy&family=Comic+Neue:wght@400;700&family=Fredoka:wght@300..700&family=Grandstander:wght@400..800&family=Lobster&family=Luckiest+Guy&family=Montserrat:wght@400..800&family=Nunito:wght@400..800&family=Pacifico&family=Patrick+Hand&family=Poppins:wght@400..800&family=Quicksand:wght@400..700&family=Righteous&family=Sniglet:wght@400;800&display=swap';

var SOCIAL_CURVE_MAX_ANGLE = 1.75;

function socialFontCss(key) {
  return (SOCIAL_FONTS[key] || SOCIAL_FONTS.system).css;
}

var _socialFontsPromise = null;

function socialEnsureFonts() {
  if (_socialFontsPromise) return _socialFontsPromise;
  _socialFontsPromise = new Promise(function(resolve) {
    if (typeof document === 'undefined') { resolve(); return; }
    if (document.getElementById('social-google-fonts')) { resolve(); return; }
    const link = document.createElement('link');
    link.id = 'social-google-fonts';
    link.rel = 'stylesheet';
    link.href = SOCIAL_FONT_URL;
    link.onload = function() { resolve(); };
    link.onerror = function() { resolve(); };
    document.head.appendChild(link);
  });
  return _socialFontsPromise;
}

function socialLoadFont(key) {
  return socialEnsureFonts().then(function() {
    if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return null;
    const css = socialFontCss(key);
    return Promise.all([
      document.fonts.load('400 40px ' + css).catch(function() { return null; }),
      document.fonts.load('800 40px ' + css).catch(function() { return null; }),
    ]);
  });
}

async function socialPreloadFonts() {
  await socialEnsureFonts();
  if (!_socialEd || typeof document === 'undefined' || !document.fonts || !document.fonts.load) return;
  const keys = { system: true };
  (_socialEd.layers || []).forEach(function(l) { keys[l.font || 'system'] = true; });
  const jobs = Object.keys(keys).map(function(k) {
    return socialLoadFont(k).catch(function() { return null; });
  });
  try { await Promise.all(jobs); } catch (e) {}
  try { await document.fonts.ready; } catch (e) {}
}

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

function socialNormalizeLayer(l) {
  const out = {
    id: 'layer-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    text: '',
    xPct: 0.07,
    yPct: 0.1,
    size: 32,
    color: '#FFFFFF',
    weight: 600,
    align: 'left',
    maxWidthPct: 0.86,
    font: 'system',
    shadow: true,
    shadowColor: '#000000',
    shadowBlur: 10,
    shadowOffsetY: 3,
    stroke: false,
    strokeColor: '#000000',
    strokeWidth: 2,
    opacity: 100,
    lineHeight: 118,
    curve: 0,
  };
  const src = l || {};
  Object.keys(src).forEach(function(k) {
    if (src[k] !== undefined && src[k] !== null) out[k] = src[k];
  });
  if (!SOCIAL_FONTS[out.font]) out.font = 'system';
  out.curve = socialClamp(out.curve, -100, 100);
  return out;
}

function socialNormalizeObject(o) {
  const out = {
    id: 'object-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    type: 'rect',
    xPct: 0.6,
    yPct: 0.1,
    wPct: 0.26,
    hPct: 0.16,
    color: '#F97316',
    fill: false,
    strokeWidth: 8,
    rotation: 0,
    opacity: 100,
    arrowStyle: 'classic',
  };
  const src = o || {};
  Object.keys(src).forEach(function(k) {
    if (src[k] !== undefined && src[k] !== null) out[k] = src[k];
  });
  if (!SOCIAL_OBJECT_TYPES[out.type]) out.type = 'rect';
  if (!SOCIAL_ARROW_STYLES[out.arrowStyle]) out.arrowStyle = 'classic';
  return out;
}

function socialNormalizePhotoRect(r) {
  const src = r || {};
  return {
    xPct: socialClamp(src.xPct == null ? SOCIAL_PHOTO_RECT.xPct : src.xPct, -0.5, 1.2),
    yPct: socialClamp(src.yPct == null ? SOCIAL_PHOTO_RECT.yPct : src.yPct, -0.5, 1.2),
    wPct: socialClamp(src.wPct == null ? SOCIAL_PHOTO_RECT.wPct : src.wPct, 0.08, 1.2),
    hPct: socialClamp(src.hPct == null ? SOCIAL_PHOTO_RECT.hPct : src.hPct, 0.08, 1.2),
  };
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
    photoRect: socialNormalizePhotoRect(SOCIAL_PHOTO_RECT),
    objects: [],
    layers: socialDefaultLayers(menu).map(socialNormalizeLayer),
    selected: 0,
    selectedObject: -1,
    photoSelected: false,
    active: 'text',
    caption: socialDefaultCaption(menu),
    hashtags: '#MBG #MenuSehat #MakananBergizi',
    saving: false,
    notice: '',
  };
}

function socialSelectedLayer() {
  if (!_socialEd || _socialEd.active !== 'text' || !_socialEd.layers || !_socialEd.layers.length) return null;
  return _socialEd.layers[Math.max(0, Math.min(_socialEd.layers.length - 1, _socialEd.selected))] || null;
}

function socialSelectedObject() {
  if (!_socialEd || _socialEd.active !== 'object' || !_socialEd.objects) return null;
  return _socialEd.objects[_socialEd.selectedObject] || null;
}

function socialImageSrc(img) {
  if (!img) return '';
  return img.dataUrl || img.url || '';
}

// Sumber gambar dengan alpha (PNG/WEBP) harus tetap transparan.
function socialSourceHasAlpha(src) {
  if (!src) return false;
  if (/^data:image\/(png|webp)/i.test(src)) return true;
  return /\.(png|webp)(?:[?#].*)?$/i.test(String(src));
}

function socialProgressHtml(kind) {
  return '<div id="social-' + kind + '-progress" class="mt-2 hidden">' +
    '<div class="flex items-center justify-between text-[10px] text-stone-500 mb-1">' +
    '<span id="social-' + kind + '-progress-text">Menyiapkan...</span>' +
    '<span id="social-' + kind + '-progress-pct">0%</span>' +
    '</div>' +
    '<div class="h-1.5 w-full rounded-full bg-stone-200 overflow-hidden">' +
    '<div id="social-' + kind + '-progress-bar" class="h-full bg-emerald-500 transition-all duration-150" style="width:0%"></div>' +
    '</div>' +
    '</div>';
}

function socialSetProgress(kind, pct, text) {
  const wrap = document.getElementById('social-' + kind + '-progress');
  if (!wrap) return;
  const value = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  wrap.classList.remove('hidden');
  const bar = document.getElementById('social-' + kind + '-progress-bar');
  if (bar) bar.style.width = value + '%';
  const pctEl = document.getElementById('social-' + kind + '-progress-pct');
  if (pctEl) pctEl.textContent = value + '%';
  const textEl = document.getElementById('social-' + kind + '-progress-text');
  if (textEl && text) textEl.textContent = text;
}

function socialHideProgress(kind) {
  const wrap = document.getElementById('social-' + kind + '-progress');
  if (wrap) wrap.classList.add('hidden');
  const bar = document.getElementById('social-' + kind + '-progress-bar');
  if (bar) bar.style.width = '0%';
}

function socialNextFrame() {
  return new Promise(function(resolve) {
    let done = false;
    const finish = function() { if (!done) { done = true; resolve(); } };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function() { requestAnimationFrame(finish); });
    }
    // Jangan menggantung bila tab sedang tidak aktif (rAF di-throttle).
    setTimeout(finish, 40);
  });
}

function socialSetSaveProgress(pct, text) {
  const wrap = document.getElementById('social-save-progress');
  if (!wrap) return;
  const value = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  wrap.classList.remove('hidden');
  const bar = document.getElementById('social-save-progress-bar');
  if (bar) bar.style.width = value + '%';
  const pctEl = document.getElementById('social-save-progress-pct');
  if (pctEl) pctEl.textContent = value + '%';
  const textEl = document.getElementById('social-save-progress-text');
  if (textEl && text) textEl.textContent = text;
}

function socialHideSaveProgress() {
  const wrap = document.getElementById('social-save-progress');
  if (wrap) wrap.classList.add('hidden');
  const bar = document.getElementById('social-save-progress-bar');
  if (bar) bar.style.width = '0%';
}

// Kirim JSON lewat XHR agar progress unggahan ke server bisa ditampilkan.
function socialSendJson(method, path, body, onProgress) {
  return new Promise(function(resolve, reject) {
    const xhr = new XMLHttpRequest();
    xhr.open(method, '/api' + path, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.upload.onprogress = function(e) {
      if (onProgress && e.lengthComputable && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = function() {
      let data = null;
      try { data = JSON.parse(xhr.responseText || 'null'); } catch (e) {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error((data && (data.error || data.message)) || ('Permintaan gagal (' + xhr.status + ')')));
    };
    xhr.onerror = function() { reject(new Error('Koneksi gagal saat menyimpan.')); };
    xhr.send(JSON.stringify(body));
  });
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
  socialEnsureFonts();
  socialBindCanvas();
  socialRenderLayerList();
  socialRenderObjectList();
  socialSyncLayerControls();
  socialSyncObjectControls();
  socialSyncPhotoControls();
  socialUpdateImageUI();
  socialDrawPreview();
  socialLoadHistory();
}

function socialEditorHtml(st) {
  const m = st.menu || {};
  const sel = socialSelectedLayer();
  const pr = socialNormalizePhotoRect(st.photoRect);
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
      <div>Buat gambar postingan menu untuk Instagram/media sosial. Geser teks, foto, dan objek langsung di preview, unggah background/foto, lalu <b>Simpan ke Riwayat</b> atau <b>Unduh JPEG</b>.</div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-5 gap-4">
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
          <div class="text-[11px] text-stone-400 mb-3">PNG transparan didukung. Gambar dikompres otomatis; garis panduan tengah di preview membantu posisi ompreng.</div>

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
              ${socialProgressHtml('background')}
            </div>
            <div class="rounded-xl border border-stone-200 p-3">
              <div class="flex items-center justify-between mb-2">
                <div class="text-xs font-semibold text-stone-700">Foto Menu</div>
                <button type="button" id="social-photo-remove" onclick="socialRemoveImage('photo')" class="text-[10px] font-semibold text-red-600 hover:text-red-700 hidden">Hapus</button>
              </div>
              <img id="social-photo-thumb" alt="Foto menu" class="w-full h-20 object-cover rounded-lg border border-stone-200 hidden" style="background-image:linear-gradient(45deg,#e7e5e4 25%,transparent 25%),linear-gradient(-45deg,#e7e5e4 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e7e5e4 75%),linear-gradient(-45deg,transparent 75%,#e7e5e4 75%);background-size:12px 12px;background-position:0 0,0 6px,6px -6px,-6px 0" />
              <div id="social-photo-empty" class="w-full h-20 rounded-lg border border-dashed border-stone-200 bg-stone-50 flex items-center justify-center text-[11px] text-stone-400">Belum ada foto menu</div>
              <input type="file" accept="image/png,image/jpeg,image/webp" onchange="socialPickImage('photo', this)" class="mt-2 block w-full text-[11px] text-stone-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer" />
              ${socialProgressHtml('photo')}
            </div>
          </div>

          <div class="mt-4 border-t border-stone-200 pt-3">
            <div class="flex items-center justify-between">
              <div class="text-xs font-semibold text-stone-700">Posisi &amp; Ukuran Foto</div>
              <button type="button" onclick="socialResetPhotoRect()" class="text-[10px] font-semibold text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-md hover:bg-emerald-50">Reset</button>
            </div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-2 mt-2">
              <label class="block text-[10px] font-medium text-stone-500">X <span id="social-photo-x-val" class="text-stone-400">${Math.round(pr.xPct * 100)}%</span>
                <input id="social-photo-x" type="range" min="-20" max="95" step="1" value="${Math.round(pr.xPct * 100)}" oninput="socialUpdatePhotoRect('xPct', this.value)" class="mt-1 w-full accent-emerald-600" />
              </label>
              <label class="block text-[10px] font-medium text-stone-500">Y <span id="social-photo-y-val" class="text-stone-400">${Math.round(pr.yPct * 100)}%</span>
                <input id="social-photo-y" type="range" min="-20" max="95" step="1" value="${Math.round(pr.yPct * 100)}" oninput="socialUpdatePhotoRect('yPct', this.value)" class="mt-1 w-full accent-emerald-600" />
              </label>
              <label class="block text-[10px] font-medium text-stone-500">Lebar <span id="social-photo-w-val" class="text-stone-400">${Math.round(pr.wPct * 100)}%</span>
                <input id="social-photo-w" type="range" min="10" max="110" step="1" value="${Math.round(pr.wPct * 100)}" oninput="socialUpdatePhotoRect('wPct', this.value)" class="mt-1 w-full accent-emerald-600" />
              </label>
              <label class="block text-[10px] font-medium text-stone-500">Tinggi <span id="social-photo-h-val" class="text-stone-400">${Math.round(pr.hPct * 100)}%</span>
                <input id="social-photo-h" type="range" min="10" max="110" step="1" value="${Math.round(pr.hPct * 100)}" oninput="socialUpdatePhotoRect('hPct', this.value)" class="mt-1 w-full accent-emerald-600" />
              </label>
            </div>
            <div class="text-[10px] text-stone-400 mt-1">Geser kotak foto langsung di preview.</div>
          </div>
        </div>

        <div class="${cardCls}">
          <div class="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 class="text-sm font-bold text-stone-800">Objek &amp; Bentuk</h3>
              <div class="text-[11px] text-stone-400">Tambah kotak, lingkaran, garis, panah, atau segitiga. Geser langsung di preview.</div>
            </div>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button type="button" onclick="socialAddObject('rect')" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-[11px] font-semibold text-stone-600 transition-colors">+ Kotak</button>
            <button type="button" onclick="socialAddObject('ellipse')" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-[11px] font-semibold text-stone-600 transition-colors">+ Lingkaran</button>
            <button type="button" onclick="socialAddObject('line')" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-[11px] font-semibold text-stone-600 transition-colors">+ Garis</button>
            <button type="button" onclick="socialAddObject('arrow')" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-[11px] font-semibold text-stone-600 transition-colors">+ Panah</button>
            <button type="button" onclick="socialAddObject('triangle')" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-[11px] font-semibold text-stone-600 transition-colors">+ Segitiga</button>
          </div>
          <div id="social-object-list" class="flex flex-wrap gap-1.5 mt-3"></div>
          <div id="social-object-controls" class="mt-3 border-t border-stone-200 pt-3 hidden">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="${labelCls}">Warna</label>
                <input id="social-object-color" type="color" oninput="socialUpdateObject('color', this.value)" class="mt-1 w-full h-10 rounded-lg border border-stone-200 bg-white cursor-pointer" />
              </div>
              <div>
                <label class="${labelCls}">Ketebalan</label>
                <input id="social-object-stroke" type="number" min="1" max="60" step="1" oninput="socialUpdateObject('strokeWidth', this.value)" class="${inputCls}" />
              </div>
              <div>
                <label class="${labelCls}">Lebar <span id="social-object-w-val" class="text-stone-400 normal-case">26%</span></label>
                <input id="social-object-w" type="range" min="4" max="110" step="1" oninput="socialUpdateObject('wPct', this.value)" class="mt-3 w-full accent-emerald-600" />
              </div>
              <div>
                <label class="${labelCls}">Tinggi <span id="social-object-h-val" class="text-stone-400 normal-case">16%</span></label>
                <input id="social-object-h" type="range" min="0" max="110" step="1" oninput="socialUpdateObject('hPct', this.value)" class="mt-3 w-full accent-emerald-600" />
              </div>
              <div>
                <label class="${labelCls}">Rotasi <span id="social-object-rot-val" class="text-stone-400 normal-case">0°</span></label>
                <input id="social-object-rotation" type="range" min="-180" max="180" step="1" oninput="socialUpdateObject('rotation', this.value)" class="mt-3 w-full accent-emerald-600" />
              </div>
              <div>
                <label class="${labelCls}">Opasitas <span id="social-object-opacity-val" class="text-stone-400 normal-case">100%</span></label>
                <input id="social-object-opacity" type="range" min="10" max="100" step="1" oninput="socialUpdateObject('opacity', this.value)" class="mt-3 w-full accent-emerald-600" />
              </div>
            </div>
            <div id="social-object-arrow-wrap" class="mt-3 hidden">
              <label class="${labelCls}">Gaya Panah</label>
              <select id="social-object-arrow-style" onchange="socialUpdateObject('arrowStyle', this.value)" class="${inputCls}">
                ${Object.keys(SOCIAL_ARROW_STYLES).map(function(k) { return socialFormatOption(k, 'classic', SOCIAL_ARROW_STYLES[k].label); }).join('')}
              </select>
            </div>
            <label class="inline-flex items-center gap-2 mt-3 text-xs font-medium text-stone-600"><input id="social-object-fill" type="checkbox" onchange="socialUpdateObject('fill', this.checked)" class="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500" /> Isi penuh (kotak/lingkaran/segitiga)</label>
            <button type="button" onclick="socialDeleteObject()" class="mt-3 text-[11px] font-semibold text-red-600 hover:text-red-700 px-2.5 py-1.5 rounded-lg hover:bg-red-50">Hapus objek ini</button>
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
            <div class="sm:col-span-2">
              <label class="${labelCls}">Font Teks</label>
              <select id="social-layer-font" onchange="socialUpdateLayer('font', this.value)" class="${inputCls}">
                ${Object.keys(SOCIAL_FONTS).map(function(k) { return socialFormatOption(k, sel && sel.font, SOCIAL_FONTS[k].label); }).join('')}
              </select>
              <div class="text-[10px] text-stone-400 mt-1">Font Google dimuat otomatis saat dipilih.</div>
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
            <div class="sm:col-span-2 border-t border-stone-200 pt-3 mt-1">
              <label class="inline-flex items-center gap-2 text-xs font-semibold text-stone-700">
                <input id="social-layer-shadow" type="checkbox" ${sel && sel.shadow ? 'checked' : ''} onchange="socialUpdateLayer('shadow', this.checked)" class="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500" />
                Bayangan teks
              </label>
              <div class="grid grid-cols-3 gap-2 mt-2">
                <div>
                  <label class="text-[10px] font-medium text-stone-500">Warna</label>
                  <input id="social-layer-shadow-color" type="color" value="${(sel && sel.shadowColor) || '#000000'}" oninput="socialUpdateLayer('shadowColor', this.value)" class="mt-1 w-full h-9 rounded-lg border border-stone-200 bg-white cursor-pointer" />
                </div>
                <div>
                  <label class="text-[10px] font-medium text-stone-500">Blur</label>
                  <input id="social-layer-shadow-blur" type="number" min="0" max="60" step="1" value="${sel ? Math.round(Number(sel.shadowBlur) || 0) : 10}" oninput="socialUpdateLayer('shadowBlur', this.value)" class="${inputCls}" />
                </div>
                <div>
                  <label class="text-[10px] font-medium text-stone-500">Offset Y</label>
                  <input id="social-layer-shadow-offset" type="number" min="-40" max="40" step="1" value="${sel ? Math.round(Number(sel.shadowOffsetY) || 0) : 3}" oninput="socialUpdateLayer('shadowOffsetY', this.value)" class="${inputCls}" />
                </div>
              </div>

              <label class="inline-flex items-center gap-2 mt-3 text-xs font-semibold text-stone-700">
                <input id="social-layer-stroke" type="checkbox" ${sel && sel.stroke ? 'checked' : ''} onchange="socialUpdateLayer('stroke', this.checked)" class="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500" />
                Garis tepi (outline)
              </label>
              <div class="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label class="text-[10px] font-medium text-stone-500">Warna tepi</label>
                  <input id="social-layer-stroke-color" type="color" value="${(sel && sel.strokeColor) || '#000000'}" oninput="socialUpdateLayer('strokeColor', this.value)" class="mt-1 w-full h-9 rounded-lg border border-stone-200 bg-white cursor-pointer" />
                </div>
                <div>
                  <label class="text-[10px] font-medium text-stone-500">Ketebalan</label>
                  <input id="social-layer-stroke-width" type="number" min="0" max="20" step="0.5" value="${sel ? Number(sel.strokeWidth) || 0 : 2}" oninput="socialUpdateLayer('strokeWidth', this.value)" class="${inputCls}" />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label class="${labelCls}">Opasitas <span id="social-layer-opacity-val" class="text-stone-400 normal-case">${sel ? Math.round(Number(sel.opacity) || 100) : 100}%</span></label>
                  <input id="social-layer-opacity" type="range" min="10" max="100" step="1" value="${sel ? Math.round(Number(sel.opacity) || 100) : 100}" oninput="socialUpdateLayer('opacity', this.value)" class="mt-3 w-full accent-emerald-600" />
                </div>
                <div>
                  <label class="${labelCls}">Jarak Baris <span id="social-layer-lineheight-val" class="text-stone-400 normal-case">${sel ? Math.round(Number(sel.lineHeight) || 118) : 118}%</span></label>
                  <input id="social-layer-lineheight" type="range" min="80" max="200" step="5" value="${sel ? Math.round(Number(sel.lineHeight) || 118) : 118}" oninput="socialUpdateLayer('lineHeight', this.value)" class="mt-3 w-full accent-emerald-600" />
                </div>
              </div>
              <div class="mt-3">
                <label class="${labelCls}">Lengkungan Teks <span id="social-layer-curve-val" class="text-stone-400 normal-case">${sel ? Math.round(Number(sel.curve) || 0) : 0}%</span></label>
                <input id="social-layer-curve" type="range" min="-100" max="100" step="1" value="${sel ? Math.round(Number(sel.curve) || 0) : 0}" oninput="socialUpdateLayer('curve', this.value)" class="mt-3 w-full accent-emerald-600" />
                <div class="text-[10px] text-stone-400 mt-1">Kanan = melengkung ke atas, kiri = ke bawah. 0% = lurus.</div>
              </div>
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
          <div id="social-save-progress" class="w-full mt-1 hidden">
            <div class="flex items-center justify-between text-[10px] text-stone-500 mb-1">
              <span id="social-save-progress-text">Menyiapkan...</span>
              <span id="social-save-progress-pct">0%</span>
            </div>
            <div class="h-1.5 w-full rounded-full bg-stone-200 overflow-hidden">
              <div id="social-save-progress-bar" class="h-full bg-emerald-500 transition-all duration-150" style="width:0%"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="xl:col-span-2">
        <div class="xl:sticky xl:top-20 bg-white rounded-xl border border-stone-200 p-4 xl:max-h-[calc(100vh_-_6rem)] xl:overflow-y-auto">
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
          <p class="text-[11px] text-stone-400 mt-2 leading-relaxed">Geser teks, foto, atau objek langsung di preview. Gambar final disimpan sebagai JPEG terkompresi.</p>
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
    const active = i === _socialEd.selected && _socialEd.active === 'text';
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
  const ids = ['social-layer-text', 'social-layer-size', 'social-layer-color',
    'social-layer-weight', 'social-layer-align', 'social-layer-width', 'social-layer-font',
    'social-layer-shadow', 'social-layer-shadow-color', 'social-layer-shadow-blur',
    'social-layer-shadow-offset', 'social-layer-stroke', 'social-layer-stroke-color',
    'social-layer-stroke-width', 'social-layer-opacity', 'social-layer-lineheight', 'social-layer-curve'];
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

  const font = document.getElementById('social-layer-font');
  if (font) font.value = l.font || 'system';

  const shadow = document.getElementById('social-layer-shadow');
  if (shadow) shadow.checked = !!l.shadow;
  const shadowColor = document.getElementById('social-layer-shadow-color');
  if (shadowColor) shadowColor.value = l.shadowColor || '#000000';
  const shadowBlur = document.getElementById('social-layer-shadow-blur');
  if (shadowBlur) shadowBlur.value = Math.round(Number(l.shadowBlur) || 0);
  const shadowOffset = document.getElementById('social-layer-shadow-offset');
  if (shadowOffset) shadowOffset.value = Math.round(Number(l.shadowOffsetY) || 0);
  const stroke = document.getElementById('social-layer-stroke');
  if (stroke) stroke.checked = !!l.stroke;
  const strokeColor = document.getElementById('social-layer-stroke-color');
  if (strokeColor) strokeColor.value = l.strokeColor || '#000000';
  const strokeWidth = document.getElementById('social-layer-stroke-width');
  if (strokeWidth) strokeWidth.value = Number(l.strokeWidth) || 0;
  const opacity = document.getElementById('social-layer-opacity');
  if (opacity) opacity.value = Math.round(Number(l.opacity) || 100);
  const opacityVal = document.getElementById('social-layer-opacity-val');
  if (opacityVal) opacityVal.textContent = Math.round(Number(l.opacity) || 100) + '%';
  const lineHeight = document.getElementById('social-layer-lineheight');
  if (lineHeight) lineHeight.value = Math.round(Number(l.lineHeight) || 118);
  const lineHeightVal = document.getElementById('social-layer-lineheight-val');
  if (lineHeightVal) lineHeightVal.textContent = Math.round(Number(l.lineHeight) || 118) + '%';
  const curve = document.getElementById('social-layer-curve');
  if (curve) curve.value = Math.round(Number(l.curve) || 0);
  const curveVal = document.getElementById('social-layer-curve-val');
  if (curveVal) curveVal.textContent = Math.round(Number(l.curve) || 0) + '%';
}

function socialSelectLayer(i) {
  if (!_socialEd || !_socialEd.layers[i]) return;
  _socialEd.selected = i;
  _socialEd.active = 'text';
  _socialEd.selectedObject = -1;
  _socialEd.photoSelected = false;
  socialRenderLayerList();
  socialRenderObjectList();
  socialSyncLayerControls();
  socialSyncObjectControls();
  socialDrawPreview();
}

function socialUpdatePhotoRect(key, value) {
  if (!_socialEd) return;
  const r = socialNormalizePhotoRect(_socialEd.photoRect);
  const v = Number(value);
  if (!Number.isFinite(v)) return;
  if (key === 'xPct' || key === 'yPct' || key === 'wPct' || key === 'hPct') {
    r[key] = v / 100;
  }
  _socialEd.photoRect = socialNormalizePhotoRect(r);
  _socialEd.active = 'photo';
  _socialEd.photoSelected = true;
  _socialEd.selectedObject = -1;
  socialSyncPhotoControls();
  socialRenderObjectList();
  socialRenderLayerList();
  socialSyncObjectControls();
  socialSyncLayerControls();
  socialDrawPreview();
}

function socialResetPhotoRect() {
  if (!_socialEd) return;
  _socialEd.photoRect = socialNormalizePhotoRect(SOCIAL_PHOTO_RECT);
  _socialEd.active = 'photo';
  _socialEd.photoSelected = true;
  _socialEd.selectedObject = -1;
  socialSyncPhotoControls();
  socialRenderLayerList();
  socialDrawPreview();
}

function socialSyncPhotoControls() {
  if (!_socialEd) return;
  const r = socialNormalizePhotoRect(_socialEd.photoRect);
  const map = { x: 'xPct', y: 'yPct', w: 'wPct', h: 'hPct' };
  Object.keys(map).forEach(function(k) {
    const key = map[k];
    const input = document.getElementById('social-photo-' + k);
    if (input) input.value = Math.round(r[key] * 100);
    const val = document.getElementById('social-photo-' + k + '-val');
    if (val) val.textContent = Math.round(r[key] * 100) + '%';
  });
}

function socialAddObject(type) {
  if (!_socialEd || !SOCIAL_OBJECT_TYPES[type]) return;
  const n = (_socialEd.objects || []).length;
  const isLine = type === 'line' || type === 'arrow';
  const o = socialNormalizeObject({
    type: type,
    xPct: isLine ? 0.2 : 0.1 + (n % 3) * 0.29,
    yPct: isLine ? 0.45 : 0.1 + (n % 3) * 0.23,
    wPct: isLine ? 0.3 : 0.26,
    hPct: isLine ? 0.1 : 0.16,
  });
  if (!_socialEd.objects) _socialEd.objects = [];
  _socialEd.objects.push(o);
  _socialEd.active = 'object';
  _socialEd.selectedObject = _socialEd.objects.length - 1;
  _socialEd.photoSelected = false;
  socialRenderObjectList();
  socialRenderLayerList();
  socialSyncObjectControls();
  socialSyncLayerControls();
  socialDrawPreview();
}

function socialRenderObjectList() {
  const el = document.getElementById('social-object-list');
  if (!el || !_socialEd) return;
  const items = _socialEd.objects || [];
  if (!items.length) {
    el.innerHTML = '<div class="text-[11px] text-stone-400">Belum ada objek.</div>';
    return;
  }
  el.innerHTML = items.map(function(o, i) {
    const active = _socialEd.active === 'object' && i === _socialEd.selectedObject;
    return '<button type="button" onclick="socialSelectObject(' + i + ')" class="inline-flex items-center gap-1.5 max-w-[190px] px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ' +
      (active ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50') + '">' +
      '<span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:' + socialEsc(o.color || '#F97316') + '"></span>' +
      '<span class="truncate">' + socialEsc(SOCIAL_OBJECT_TYPES[o.type] || o.type) + '</span>' +
      '</button>';
  }).join('');
}

function socialSelectObject(i) {
  if (!_socialEd || !_socialEd.objects || !_socialEd.objects[i]) return;
  _socialEd.active = 'object';
  _socialEd.selectedObject = i;
  _socialEd.photoSelected = false;
  socialRenderObjectList();
  socialRenderLayerList();
  socialSyncObjectControls();
  socialSyncLayerControls();
  socialDrawPreview();
}

function socialUpdateObject(key, value) {
  const o = socialSelectedObject();
  if (!o) return;
  if (key === 'fill') o.fill = !!value;
  else if (key === 'color') o.color = value || '#F97316';
  else if (key === 'strokeWidth') o.strokeWidth = socialClamp(value, 1, 60);
  else if (key === 'wPct') o.wPct = socialClamp(value, 4, 110) / 100;
  else if (key === 'hPct') o.hPct = socialClamp(value, 0, 110) / 100;
  else if (key === 'rotation') o.rotation = socialClamp(value, -180, 180);
  else if (key === 'opacity') o.opacity = socialClamp(value, 10, 100);
  else if (key === 'arrowStyle') o.arrowStyle = SOCIAL_ARROW_STYLES[value] ? value : 'classic';
  socialRenderObjectList();
  socialSyncObjectControls();
  socialDrawPreview();
}

function socialDeleteObject() {
  const o = socialSelectedObject();
  if (!o || !_socialEd) return;
  _socialEd.objects.splice(_socialEd.selectedObject, 1);
  if (_socialEd.objects.length) {
    _socialEd.selectedObject = Math.min(_socialEd.selectedObject, _socialEd.objects.length - 1);
  } else {
    _socialEd.selectedObject = -1;
    _socialEd.active = 'text';
  }
  socialRenderObjectList();
  socialRenderLayerList();
  socialSyncObjectControls();
  socialSyncLayerControls();
  socialDrawPreview();
}

function socialSyncObjectControls() {
  const box = document.getElementById('social-object-controls');
  const o = socialSelectedObject();
  if (box) box.classList.toggle('hidden', !o);
  if (!o) return;
  const setVal = function(id, v) { const el = document.getElementById(id); if (el) el.value = v; };
  const setText = function(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; };
  setVal('social-object-color', o.color || '#F97316');
  setVal('social-object-stroke', Math.round(Number(o.strokeWidth) || 8));
  setVal('social-object-w', Math.round((Number(o.wPct) || 0.26) * 100));
  setVal('social-object-h', Math.round((Number(o.hPct) || 0) * 100));
  setVal('social-object-rotation', Math.round(Number(o.rotation) || 0));
  setVal('social-object-opacity', Math.round(Number(o.opacity) || 100));
  const fill = document.getElementById('social-object-fill');
  if (fill) fill.checked = !!o.fill;
  const arrowWrap = document.getElementById('social-object-arrow-wrap');
  if (arrowWrap) arrowWrap.classList.toggle('hidden', o.type !== 'arrow');
  const arrowStyle = document.getElementById('social-object-arrow-style');
  if (arrowStyle) arrowStyle.value = o.arrowStyle || 'classic';
  setText('social-object-w-val', Math.round((Number(o.wPct) || 0.26) * 100) + '%');
  setText('social-object-h-val', Math.round((Number(o.hPct) || 0) * 100) + '%');
  setText('social-object-rot-val', Math.round(Number(o.rotation) || 0) + '°');
  setText('social-object-opacity-val', Math.round(Number(o.opacity) || 100) + '%');
}

function socialAddLayer() {
  if (!_socialEd) return;
  const n = _socialEd.layers.length + 1;
  _socialEd.layers.push(socialNormalizeLayer({
    id: 'custom-' + Date.now(),
    text: 'Teks baru ' + n,
    xPct: 0.1,
    yPct: Math.min(0.82, 0.42 + (n % 4) * 0.06),
    size: 40,
    color: '#FFFFFF',
    weight: 600,
    align: 'left',
    maxWidthPct: 0.8,
  }));
  _socialEd.selected = _socialEd.layers.length - 1;
  _socialEd.active = 'text';
  _socialEd.selectedObject = -1;
  _socialEd.photoSelected = false;
  socialRenderLayerList();
  socialRenderObjectList();
  socialSyncLayerControls();
  socialSyncObjectControls();
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
  else if (key === 'font') {
    l.font = SOCIAL_FONTS[value] ? value : 'system';
    socialLoadFont(l.font).then(function() { socialDrawPreview(); });
  }
  else if (key === 'width') {
    l.maxWidthPct = socialClamp(parseInt(value, 10) / 100, 0.2, 1);
    const wv = document.getElementById('social-layer-width-val');
    if (wv) wv.textContent = Math.round(l.maxWidthPct * 100) + '%';
  }
  else if (key === 'shadow') l.shadow = !!value;
  else if (key === 'shadowColor') l.shadowColor = value || '#000000';
  else if (key === 'shadowBlur') l.shadowBlur = socialClamp(value, 0, 60);
  else if (key === 'shadowOffsetY') l.shadowOffsetY = socialClamp(value, -40, 40);
  else if (key === 'stroke') l.stroke = !!value;
  else if (key === 'strokeColor') l.strokeColor = value || '#000000';
  else if (key === 'strokeWidth') l.strokeWidth = socialClamp(value, 0, 20);
  else if (key === 'opacity') {
    l.opacity = socialClamp(value, 10, 100);
    const ov = document.getElementById('social-layer-opacity-val');
    if (ov) ov.textContent = Math.round(l.opacity) + '%';
  }
  else if (key === 'lineHeight') {
    l.lineHeight = socialClamp(value, 80, 200);
    const lv = document.getElementById('social-layer-lineheight-val');
    if (lv) lv.textContent = Math.round(l.lineHeight) + '%';
  }
  else if (key === 'curve') {
    l.curve = socialClamp(value, -100, 100);
    const cv = document.getElementById('social-layer-curve-val');
    if (cv) cv.textContent = Math.round(l.curve) + '%';
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
  socialSetProgress(kind, 4, 'Menyiapkan...');
  await socialNextFrame();
  try {
    const dataUrl = await socialCompressFile(file, kind === 'background' ? 1920 : 1600, function(pct, text) {
      socialSetProgress(kind, pct, text);
    });
    socialSetProgress(kind, 92, 'Memuat pratinjau...');
    await socialNextFrame();
    const img = await socialLoadImage(dataUrl);
    if (!_socialEd) return;
    if (kind === 'background') _socialEd.bgImage = { url: '', dataUrl: dataUrl, img: img };
    else _socialEd.photo = { url: '', dataUrl: dataUrl, img: img };
    socialSetProgress(kind, 100, 'Selesai');
    socialUpdateImageUI();
    socialDrawPreview();
    showToast('Gambar siap dipakai', 'success');
    setTimeout(function() { socialHideProgress(kind); }, 900);
  } catch (e) {
    socialSetProgress(kind, 100, 'Gagal');
    setTimeout(function() { socialHideProgress(kind); }, 1500);
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
      if (img && _socialEd && _socialEd.bgImage === obj) { obj.img = img; }
      // Always redraw preview so background state is applied even if image fails to load
      if (_socialEd) socialDrawPreview();
    }).catch(function(e) {
      // Gambar gagal dimuat, tetap redraw preview agar UI tidak hancur
      if (_socialEd) socialDrawPreview();
    }));
  }
  if (_socialEd.photo && socialImageSrc(_socialEd.photo)) {
    const obj = _socialEd.photo;
    jobs.push(socialLoadImage(socialImageSrc(obj)).then(function(img) {
      if (img && _socialEd && _socialEd.photo === obj) { obj.img = img; }
      // Always redraw preview so photo state is applied even if image fails to load
      if (_socialEd) socialDrawPreview();
    }).catch(function(e) {
      // Gambar gagal dimuat, tetap redraw preview agar UI tidak hancur
      if (_socialEd) socialDrawPreview();
    }));
  }
  await Promise.all(jobs);
  await socialPreloadFonts();
  if (typeof document !== 'undefined' && document.getElementById('social-preview')) socialDrawPreview();
}

async function socialCompressFile(file, maxDim, onProgress) {
  const isImage = file && (/^image\/(png|jpe?g|webp)$/.test(file.type || '') || /\.(png|jpe?g|webp)$/i.test(file.name || ''));
  if (!isImage) throw new Error('File harus berupa gambar PNG, JPG, atau WEBP.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Ukuran file maksimal 20 MB.');

  // PNG/WEBP dipertahankan sebagai PNG agar latar transparan tidak menjadi putih.
  const keepAlpha = /^image\/(png|webp)$/i.test(file.type || '') || /\.(png|webp)$/i.test(file.name || '');

  const dataUrl = await new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onprogress = function(e) {
      if (!onProgress || !e.lengthComputable || !e.total) return;
      const pct = 6 + Math.round((e.loaded / e.total) * 58);
      onProgress(pct, 'Membaca file... ' + Math.round(e.loaded / 1024) + ' KB');
    };
    reader.onload = function() { resolve(reader.result); };
    reader.onerror = function() { reject(new Error('Gagal membaca file.')); };
    reader.readAsDataURL(file);
  });

  if (onProgress) onProgress(70, 'Mengompres gambar...');
  await socialNextFrame();

  const img = await new Promise(function(resolve, reject) {
    const im = new Image();
    im.onload = function() { resolve(im); };
    im.onerror = function() { reject(new Error('Gagal membaca gambar.')); };
    im.src = dataUrl;
  });

  if (onProgress) onProgress(86, 'Menyiapkan gambar...');
  await socialNextFrame();

  const out = socialImageToDataUrl(img, maxDim, SOCIAL_JPEG_QUALITY, keepAlpha);
  if (onProgress) onProgress(94, 'Menyelesaikan...');
  return out;
}

function socialImageToDataUrl(img, maxDim, quality, keepAlpha) {
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  let scale = Math.min(1, (maxDim || 1600) / Math.max(iw, ih));
  let out = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!keepAlpha) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    out = keepAlpha
      ? cv.toDataURL('image/png')
      : cv.toDataURL('image/jpeg', quality || SOCIAL_JPEG_QUALITY);
    // Batasi base64 PNG agar total payload (post + background + foto) tetap
    // di bawah limit JSON server 10 MB.
    if (!keepAlpha || out.length <= 3 * 1024 * 1024) break;
    scale *= 0.75;
  }
  return out;
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

  // Foto menu (bisa digeser & diatur ukurannya)
  socialDrawPhoto(ctx, W, H, isPreview);

  // Objek bentuk (kotak, panah, dll) di atas foto, di bawah teks
  (_socialEd.objects || []).forEach(function(o) {
    socialDrawObject(ctx, o, W, H);
  });

  // Teks
  _socialEd.layers.forEach(function(l) {
    socialDrawLayer(ctx, l, W, H);
  });

  if (showSelection) {
    if (_socialEd.active === 'text') {
      const l = socialSelectedLayer();
      if (l && l._bbox) socialDrawSelectionBox(ctx, l._bbox, 'Geser teks');
    } else if (_socialEd.active === 'object') {
      const o = socialSelectedObject();
      if (o && o._bbox) socialDrawSelectionBox(ctx, o._bbox, 'Geser objek', o._hitPad || 12);
    } else if (_socialEd.active === 'photo') {
      const r = socialPhotoRect(W, H);
      socialDrawSelectionBox(ctx, { x: r.x, y: r.y, w: r.w, h: r.h }, 'Geser foto');
    }
  }
}

function socialDrawPhoto(ctx, W, H, isPreview) {
  const r = socialPhotoRect(W, H);
  const photoObj = _socialEd.photo;
  const photo = photoObj && photoObj.img;
  const hasAlpha = !!photo && socialSourceHasAlpha(socialImageSrc(photoObj));
  if (photo) {
    // Jangan beri alas putih untuk PNG transparan — biarkan latar kanvas terlihat.
    if (!hasAlpha) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.28)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 10;
      socialRoundRect(ctx, r.x, r.y, r.w, r.h, r.radius);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore();
    }
    socialDrawImageCover(ctx, photo, r.x, r.y, r.w, r.h, r.radius);
    ctx.save();
    socialRoundRect(ctx, r.x, r.y, r.w, r.h, r.radius);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
    if (isPreview) socialDrawCenterGuide(ctx, r);
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

// Panduan tengah: hanya tampil di preview, tidak ikut ke gambar final.
function socialDrawCenterGuide(ctx, r) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const arm = Math.max(18, Math.min(r.w, r.h) * 0.11);
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 5;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy);
  ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(9, arm * 0.45), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function socialDrawSelectionBox(ctx, b, label, pad) {
  if (!b) return;
  const p = pad == null ? 10 : pad;
  ctx.save();
  ctx.strokeStyle = '#34D399';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(b.x - p, b.y - p, Math.max(1, b.w) + p * 2, Math.max(1, b.h) + p * 2);
  ctx.setLineDash([]);
  ctx.fillStyle = '#34D399';
  ctx.font = '600 18px system-ui, sans-serif';
  ctx.fillText(label, b.x - p, Math.max(24, b.y - p - 10));
  ctx.restore();
}

function socialArrowHead(ctx, ex, ey, ang, head) {
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - Math.cos(ang - 0.45) * head, ey - Math.sin(ang - 0.45) * head);
  ctx.lineTo(ex - Math.cos(ang + 0.45) * head, ey - Math.sin(ang + 0.45) * head);
  ctx.closePath();
  ctx.fill();
}

function socialDrawArrow(ctx, o, x, y, w, h, sw) {
  const ex = x + w;
  const ey = y + h;
  const len = Math.hypot(w, h);
  if (len < 1) return;
  const style = o.arrowStyle || 'classic';
  const ang = Math.atan2(h, w);
  const head = Math.min(Math.max(18, sw * 2.6), Math.max(16, len * 0.36));

  if (style === 'block') {
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const px = -uy;
    const py = ux;
    const headLen = Math.min(Math.max(24, sw * 3.2), len * 0.42);
    const tail = Math.max(4, sw * 0.95);
    const wing = Math.max(tail * 2.1, sw * 2.6);
    const bx = ex - ux * headLen;
    const by = ey - uy * headLen;
    ctx.beginPath();
    ctx.moveTo(x + px * tail, y + py * tail);
    ctx.lineTo(bx + px * tail, by + py * tail);
    ctx.lineTo(bx + px * wing, by + py * wing);
    ctx.lineTo(ex, ey);
    ctx.lineTo(bx - px * wing, by - py * wing);
    ctx.lineTo(bx - px * tail, by - py * tail);
    ctx.lineTo(x - px * tail, y - py * tail);
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (style === 'cartoon') {
    const nx = -h / len;
    const ny = w / len;
    const bend = Math.min(70, Math.max(16, len * 0.24));
    const mx = x + w / 2 + nx * bend;
    const my = y + h / 2 + ny * bend;
    const cpx = 2 * mx - (x + ex) / 2;
    const cpy = 2 * my - (y + ey) / 2;
    const endAng = Math.atan2(ey - cpy, ex - cpx);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(cpx, cpy, ex - Math.cos(endAng) * head * 0.55, ey - Math.sin(endAng) * head * 0.55);
    ctx.stroke();
    socialArrowHead(ctx, ex, ey, endAng, head);
    return;
  }

  if (style === 'double') {
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    ctx.beginPath();
    ctx.moveTo(x + ux * head * 0.6, y + uy * head * 0.6);
    ctx.lineTo(ex - ux * head * 0.6, ey - uy * head * 0.6);
    ctx.stroke();
    socialArrowHead(ctx, ex, ey, ang, head);
    socialArrowHead(ctx, x, y, ang + Math.PI, head);
    return;
  }

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ex - Math.cos(ang) * head * 0.7, ey - Math.sin(ang) * head * 0.7);
  ctx.stroke();
  socialArrowHead(ctx, ex, ey, ang, head);
}

function socialDrawObject(ctx, o, W, H) {
  if (!o) return;
  const x = W * Number(o.xPct || 0);
  const y = H * Number(o.yPct || 0);
  const w = W * Number(o.wPct || 0);
  const h = H * Number(o.hPct || 0);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const sw = socialClamp(o.strokeWidth == null ? 8 : o.strokeWidth, 1, 60);
  const type = o.type || 'rect';
  ctx.save();
  ctx.globalAlpha = socialClamp(o.opacity == null ? 100 : o.opacity, 0, 100) / 100;
  ctx.translate(cx, cy);
  ctx.rotate((Number(o.rotation) || 0) * Math.PI / 180);
  ctx.translate(-cx, -cy);
  ctx.strokeStyle = o.color || '#F97316';
  ctx.fillStyle = o.color || '#F97316';
  ctx.lineWidth = sw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(1, Math.abs(w) / 2), Math.max(1, Math.abs(h) / 2), 0, 0, Math.PI * 2);
    if (o.fill) ctx.fill();
    ctx.stroke();
  } else if (type === 'line') {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
  } else if (type === 'arrow') {
    socialDrawArrow(ctx, o, x, y, w, h, sw);
  } else if (type === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    if (o.fill) ctx.fill();
    ctx.stroke();
  } else {
    socialRoundRect(ctx, x, y, Math.max(1, Math.abs(w)), Math.max(1, Math.abs(h)), Math.min(Math.abs(w), Math.abs(h)) * 0.08);
    if (o.fill) ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  o._bbox = { x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) };
  o._hitPad = (type === 'line' || type === 'arrow') ? Math.max(24, sw + 14) : 12;
}

function socialPhotoRect(W, H) {
  const pr = socialNormalizePhotoRect(_socialEd && _socialEd.photoRect);
  return {
    x: W * pr.xPct,
    y: H * pr.yPct,
    w: W * pr.wPct,
    h: H * pr.hPct,
    radius: Math.round(W * 0.026),
  };
}

function socialCurveMetrics(lineWidth, curve) {
  const angle = SOCIAL_CURVE_MAX_ANGLE * socialClamp(Math.abs(Number(curve) || 0), 0, 100) / 100;
  if (!lineWidth || !angle) return { angle: 0, radius: 0, sagitta: 0 };
  const radius = lineWidth / angle;
  const sagitta = radius * (1 - Math.cos(angle / 2));
  return { angle: angle, radius: radius, sagitta: sagitta };
}

function socialDrawCurvedLine(ctx, text, left, centerY, curve, mode) {
  const lineW = ctx.measureText(text).width;
  const metrics = socialCurveMetrics(lineW, curve);
  if (!text || !lineW || !metrics.angle) return;
  const archUp = curve > 0;
  const midX = left + lineW / 2;
  const circleY = archUp ? centerY + metrics.radius : centerY - metrics.radius;
  const midAngle = archUp ? -Math.PI / 2 : Math.PI / 2;
  const start = midAngle + (archUp ? -1 : 1) * metrics.angle / 2;
  const step = archUp ? 1 : -1;
  let acc = 0;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  Array.from(text).forEach(function(ch) {
    const chW = ctx.measureText(ch).width;
    const a = start + step * ((acc + chW / 2) / metrics.radius);
    ctx.save();
    ctx.translate(midX + Math.cos(a) * metrics.radius, circleY + Math.sin(a) * metrics.radius);
    ctx.rotate(a + (archUp ? Math.PI / 2 : -Math.PI / 2));
    if (mode === 'stroke') ctx.strokeText(ch, 0, 0);
    else ctx.fillText(ch, 0, 0);
    ctx.restore();
    acc += chW;
  });
  ctx.restore();
}

function socialDrawLayer(ctx, l, W, H) {
  if (!l || !String(l.text || '').trim()) { l._bbox = null; return; }
  const size = socialClamp(l.size, 10, 200);
  const weight = Number(l.weight) || 600;
  const maxW = W * socialClamp(l.maxWidthPct || 0.86, 0.2, 1);
  const lineHPct = socialClamp(l.lineHeight == null ? 118 : l.lineHeight, 80, 200) / 100;
  const curve = socialClamp(l.curve == null ? 0 : l.curve, -100, 100);
  ctx.save();
  ctx.font = weight + ' ' + size + 'px ' + socialFontCss(l.font);
  const lines = socialWrapText(ctx, l.text, maxW);
  const lineH = Math.round(size * lineHPct);
  const anchorX = W * socialClamp(l.xPct, -0.2, 1.2);
  const y = H * socialClamp(l.yPct, -0.2, 1.2);
  let textW = 0;
  lines.forEach(function(line) { textW = Math.max(textW, ctx.measureText(line).width); });
  textW = Math.min(textW, maxW);
  let left = anchorX;
  if (l.align === 'center') left = anchorX + (maxW - textW) / 2;
  else if (l.align === 'right') left = anchorX + maxW - textW;

  if (curve && textW > 0) {
    const cm = socialCurveMetrics(textW, curve);
    const firstCenter = y + size / 2;
    const lastCenter = y + (lines.length - 1) * lineH + size / 2;
    const padY = cm.sagitta + size * 0.72;
    l._bbox = {
      x: left - size * 0.4,
      y: firstCenter - padY,
      w: Math.max(textW, 12) + size * 0.8,
      h: (lastCenter - firstCenter) + padY * 2,
    };
  } else {
    l._bbox = { x: left, y: y, w: Math.max(textW, 12), h: Math.max(lines.length * lineH, size) };
  }

  function drawLine(line, i, mode) {
    if (curve) socialDrawCurvedLine(ctx, line, left, y + i * lineH + size / 2, curve, mode);
    else if (mode === 'stroke') ctx.strokeText(line, left, y + i * lineH);
    else ctx.fillText(line, left, y + i * lineH);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.globalAlpha = socialClamp(l.opacity == null ? 100 : l.opacity, 0, 100) / 100;

  // Garis tepi (outline) digambar lebih dulu agar tidak menutupi isi teks.
  if (l.stroke && Number(l.strokeWidth) > 0) {
    ctx.strokeStyle = l.strokeColor || '#000000';
    ctx.lineWidth = socialClamp(l.strokeWidth, 0, 20);
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.shadowColor = 'transparent';
    lines.forEach(function(line, i) {
      drawLine(line, i, 'stroke');
    });
  }

  // Bayangan dapat diatur per layer.
  if (l.shadow) {
    ctx.shadowColor = l.shadowColor || 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = socialClamp(l.shadowBlur == null ? 10 : l.shadowBlur, 0, 60);
    ctx.shadowOffsetY = socialClamp(l.shadowOffsetY == null ? 3 : l.shadowOffsetY, -40, 40);
    ctx.shadowOffsetX = 0;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  ctx.fillStyle = l.color || '#FFFFFF';
  lines.forEach(function(line, i) {
    drawLine(line, i, 'fill');
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
  cv.style.touchAction = 'none';
  let drag = null;

  function toCanvas(e) {
    const rect = cv.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * cv.width / Math.max(1, rect.width),
      y: (e.clientY - rect.top) * cv.height / Math.max(1, rect.height),
    };
  }

  function findLayer(p) {
    if (!_socialEd || !_socialEd.layers) return -1;
    for (let i = _socialEd.layers.length - 1; i >= 0; i--) {
      const b = _socialEd.layers[i]._bbox;
      if (b && p.x >= b.x - 12 && p.x <= b.x + b.w + 12 && p.y >= b.y - 12 && p.y <= b.y + b.h + 12) {
        return i;
      }
    }
    return -1;
  }

  function findObject(p) {
    if (!_socialEd || !_socialEd.objects) return -1;
    for (let i = _socialEd.objects.length - 1; i >= 0; i--) {
      const o = _socialEd.objects[i];
      const b = o._bbox;
      if (!b) continue;
      const pad = o._hitPad || 12;
      if (p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad) {
        return i;
      }
    }
    return -1;
  }

  cv.addEventListener('pointerdown', function(e) {
    if (!_socialEd) return;
    const p = toCanvas(e);
    const li = findLayer(p);
    const oi = li < 0 ? findObject(p) : -1;
    if (li >= 0) {
      const l = _socialEd.layers[li];
      _socialEd.selected = li;
      _socialEd.active = 'text';
      _socialEd.selectedObject = -1;
      _socialEd.photoSelected = false;
      drag = { type: 'layer', idx: li, x: p.x, y: p.y, xPct: Number(l.xPct) || 0, yPct: Number(l.yPct) || 0 };
    } else if (oi >= 0) {
      const o = _socialEd.objects[oi];
      _socialEd.active = 'object';
      _socialEd.selectedObject = oi;
      _socialEd.photoSelected = false;
      drag = { type: 'object', idx: oi, x: p.x, y: p.y, xPct: Number(o.xPct) || 0, yPct: Number(o.yPct) || 0 };
    } else {
      const r = socialPhotoRect(cv.width, cv.height);
      if (!(p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)) return;
      const pr = socialNormalizePhotoRect(_socialEd.photoRect);
      _socialEd.active = 'photo';
      _socialEd.photoSelected = true;
      _socialEd.selectedObject = -1;
      drag = { type: 'photo', x: p.x, y: p.y, xPct: pr.xPct, yPct: pr.yPct };
    }
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    cv.style.cursor = 'grabbing';
    socialRenderLayerList();
    socialRenderObjectList();
    socialSyncLayerControls();
    socialSyncObjectControls();
    socialSyncPhotoControls();
    socialDrawPreview();
    e.preventDefault();
  });

  cv.addEventListener('pointermove', function(e) {
    if (!drag || !_socialEd) return;
    const p = toCanvas(e);
    const dx = (p.x - drag.x) / cv.width;
    const dy = (p.y - drag.y) / cv.height;
    if (drag.type === 'layer') {
      const l = _socialEd.layers[drag.idx];
      if (!l) return;
      l.xPct = Math.max(-0.2, Math.min(1.2, drag.xPct + dx));
      l.yPct = Math.max(-0.2, Math.min(1.2, drag.yPct + dy));
    } else if (drag.type === 'object') {
      const o = _socialEd.objects && _socialEd.objects[drag.idx];
      if (!o) return;
      o.xPct = Math.max(-0.5, Math.min(1.2, drag.xPct + dx));
      o.yPct = Math.max(-0.5, Math.min(1.2, drag.yPct + dy));
    } else if (drag.type === 'photo') {
      const r = socialNormalizePhotoRect(_socialEd.photoRect);
      r.xPct = socialClamp(drag.xPct + dx, -0.5, 1.2);
      r.yPct = socialClamp(drag.yPct + dy, -0.5, 1.2);
      _socialEd.photoRect = socialNormalizePhotoRect(r);
      socialSyncPhotoControls();
    }
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
    photoBase64 = socialImageToDataUrl(
      st.photo.img, 1600, SOCIAL_JPEG_QUALITY, socialSourceHasAlpha(socialImageSrc(st.photo))
    );
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
          font: l.font || 'system',
          shadow: l.shadow !== false, shadowColor: l.shadowColor, shadowBlur: l.shadowBlur,
          shadowOffsetY: l.shadowOffsetY, stroke: !!l.stroke, strokeColor: l.strokeColor,
          strokeWidth: l.strokeWidth, opacity: l.opacity, lineHeight: l.lineHeight,
          curve: Number(l.curve) || 0,
        };
      }),
      objects: (st.objects || []).map(function(o) {
        return {
          id: o.id, type: o.type, xPct: o.xPct, yPct: o.yPct, wPct: o.wPct, hPct: o.hPct,
          color: o.color, fill: !!o.fill, strokeWidth: o.strokeWidth,
          rotation: o.rotation, opacity: o.opacity, arrowStyle: o.arrowStyle || 'classic',
        };
      }),
      photoRect: socialNormalizePhotoRect(st.photoRect),
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
  socialSetSaveProgress(0, 'Membuat gambar...');
  try {
    const blob = await socialRenderBlob();
    if (status) status.textContent = 'Menyimpan...';
    const dataUrl = await socialBlobToDataUrl(blob);
    const payload = await socialBuildPayload(dataUrl);
    socialSetSaveProgress(0, 'Mengunggah gambar...');
    const onUpload = function(pct) {
      socialSetSaveProgress(pct, pct >= 100 ? 'Memproses di server...' : 'Mengunggah... ' + pct + '%');
    };
    const res = _socialEd.postId
      ? await socialSendJson('PUT', '/social-posts/' + _socialEd.postId, payload, onUpload)
      : await socialSendJson('POST', '/social-posts', payload, onUpload);
    _socialEd.postId = res.id;
    _socialEd.imageUrl = res.image_url;
    _socialEd.bgImage = res.background_url
      ? { url: res.background_url, dataUrl: null, img: _socialEd.bgImage && _socialEd.bgImage.img }
      : null;
    _socialEd.photo = res.photo_url
      ? { url: res.photo_url, dataUrl: null, img: _socialEd.photo && _socialEd.photo.img }
      : null;
    socialUpdateImageUI();
    // Save menu to sessionStorage for persistence across reloads
    if (_socialEd.menu && _socialEd.menu.menu_nama) {
      try {
        sessionStorage.setItem('social_editor_menu', JSON.stringify(_socialEd.menu));
      } catch (e) {}
    }
    socialLoadHistory();
    socialSetSaveProgress(100, 'Tersimpan');
    setTimeout(socialHideSaveProgress, 1200);
    if (status) status.textContent = 'Tersimpan · ' + Math.round(blob.size / 1024) + ' KB';
    showToast('Postingan tersimpan (' + Math.round(blob.size / 1024) + ' KB)', 'success');
  } catch (e) {
    socialSetSaveProgress(100, 'Gagal menyimpan');
    setTimeout(socialHideSaveProgress, 1800);
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
    st.layers = Array.isArray(draft.layers) && draft.layers.length ? draft.layers.map(socialNormalizeLayer) : st.layers;
    st.objects = Array.isArray(draft.objects) ? draft.objects.map(socialNormalizeObject) : [];
    st.photoRect = socialNormalizePhotoRect(draft.photoRect);
    st.selected = 0;
    st.selectedObject = -1;
    st.photoSelected = false;
    st.active = 'text';
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
