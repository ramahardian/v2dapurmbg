async function renderDashboard() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/dashboard', { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Gagal memuat dashboard');
    }
    c.innerHTML = await r.text();
    animateDashboardCounts(c);
    loadOnlineUsers();
    startOnlineUsersAutoRefresh();
    dashMenuRender();
  } catch (err) {
    console.error('Dashboard error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat dashboard: ${err.message}</div>`;
  }
}

/**
 * dashMenuRender + dashMenuNav — Navigasi prev/next "Menu Aktif Hari Ini".
 * Data semua hari disuntik sebagai JSON di <script type="application/json" id="dash-menu-data">.
 */
function escDashMenu(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function dashMenuGetList() {
  const el = document.getElementById('dash-menu-data');
  if (!el) return [];
  try { const p = JSON.parse(el.textContent || '[]'); return Array.isArray(p) ? p : []; } catch (e) { return []; }
}

function dashMenuNav(dir) {
  const list = dashMenuGetList();
  if (!list.length) return;
  if (window._dashMenuIdx == null) window._dashMenuIdx = 0;
  const next = window._dashMenuIdx + dir;
  if (next < 0 || next >= list.length) return;
  window._dashMenuIdx = next;
  dashMenuRender();
}

function dashMenuRender() {
  const list = dashMenuGetList();
  const body = document.getElementById('dash-menu-body');
  const hariEl = document.getElementById('dash-menu-hari');
  const totalEl = document.getElementById('dash-menu-total');
  const prevBtn = document.getElementById('dash-menu-prev');
  const nextBtn = document.getElementById('dash-menu-next');
  if (!body || !list.length) return;

  if (window._dashMenuIdx == null) {
    const curHari = parseInt((hariEl && hariEl.textContent) || '1', 10) || 1;
    window._dashMenuIdx = Math.max(0, Math.min(list.length - 1, curHari - 1));
  }
  let i = Math.max(0, Math.min(list.length - 1, window._dashMenuIdx));
  window._dashMenuIdx = i;
  const m = list[i];

  if (hariEl) hariEl.textContent = m.hari_ke;
  if (totalEl) totalEl.textContent = m.total_hari;
  if (prevBtn) prevBtn.disabled = i <= 0;
  if (nextBtn) nextBtn.disabled = i >= list.length - 1;

  let jn = [];
  try { const p = JSON.parse(m.kategori || '[]'); if (Array.isArray(p)) jn = p; } catch (e) {}
  const jnLabel = jn.length > 1 ? jn[0] + ' +' + (jn.length - 1) : (jn[0] || '');

  let h = '<div class="space-y-4"><div class="flex flex-col sm:flex-row gap-4">';
  if (m.foto) {
    h += '<div class="shrink-0 w-full sm:w-32 h-40 sm:h-28 rounded-xl overflow-hidden border border-stone-200 bg-stone-50">';
    h += '<img src="' + escDashMenu(m.foto) + '" alt="Foto menu" class="w-full h-full object-cover">';
    h += '</div>';
  }
  h += '<div class="flex flex-1 flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">';
  h += '<div class="min-w-0">';
  h += '<div class="flex items-center gap-2 flex-wrap mb-1.5">';
  h += '<span class="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-0.5">' + escDashMenu(m.siklus_nama || '') + '</span>';
  if (jnLabel) h += '<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">' + escDashMenu(jnLabel) + '</span>';
  h += '</div>';
  if (m.menu_nama) {
    h += '<div class="text-lg font-bold text-stone-800 leading-relaxed text-pretty">' + escDashMenu(m.menu_nama) + '</div>';
  } else {
    h += '<div class="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">';
    h += '<svg class="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>';
    h += '<span class="text-sm font-semibold text-amber-700">Menu belum diisi</span>';
    h += '<a href="/siklus" data-key="siklus" class="text-xs font-bold text-emerald-600 underline hover:no-underline ml-1">Isi sekarang →</a>';
    h += '</div>';
  }
  h += '</div>';
  h += '<div class="shrink-0">';
  h += '<div class="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1">Porsi</div>';
  h += '<div class="mono text-sm font-bold text-stone-700">' + Number(m.porsi_item || 0).toLocaleString('id-ID');
  if (Number(m.jumlah_porsi) > 0) h += ' / ' + Number(m.jumlah_porsi).toLocaleString('id-ID') + ' porsi';
  h += '</div>';
  h += '</div></div></div>';
  if (Number(m.kalori) > 0) {
    h += '<div class="grid grid-cols-4 gap-2 border-t border-stone-100 pt-3">';
    h += '<div class="text-center"><div class="mono text-sm font-bold text-orange-700">' + Number(m.kalori).toLocaleString('id-ID') + '</div><div class="text-[9px] text-stone-400 font-semibold uppercase tracking-wider mt-0.5">Kalori</div></div>';
    h += '<div class="text-center"><div class="mono text-sm font-bold text-blue-700">' + Number(m.protein || 0).toLocaleString('id-ID') + 'g</div><div class="text-[9px] text-stone-400 font-semibold uppercase tracking-wider mt-0.5">Protein</div></div>';
    h += '<div class="text-center"><div class="mono text-sm font-bold text-amber-700">' + Number(m.karbohidrat || 0).toLocaleString('id-ID') + 'g</div><div class="text-[9px] text-stone-400 font-semibold uppercase tracking-wider mt-0.5">Karbo</div></div>';
    h += '<div class="text-center"><div class="mono text-sm font-bold text-rose-700">' + Number(m.lemak || 0).toLocaleString('id-ID') + 'g</div><div class="text-[9px] text-stone-400 font-semibold uppercase tracking-wider mt-0.5">Lemak</div></div>';
    h += '</div>';
  }
  h += '</div>';
  body.innerHTML = h;
}

/**
 * dashMenuShare — Buat gambar post menu lalu langsung unduh PNG.
 */
function dashMenuCurrent() {
  const list = dashMenuGetList();
  if (!list.length) return null;
  if (window._dashMenuIdx == null) window._dashMenuIdx = 0;
  return list[Math.max(0, Math.min(list.length - 1, window._dashMenuIdx))];
}

function dashMenuJenjang(m) {
  let jn = [];
  try { const p = JSON.parse(m.kategori || '[]'); if (Array.isArray(p)) jn = p; } catch (e) {}
  return jn.length > 1 ? jn[0] + ' +' + (jn.length - 1) : (jn[0] || '');
}

async function dashMenuShare() {
  const m = dashMenuCurrent();
  if (!m) { showAlert('Belum ada menu untuk dibagikan.', 'warning'); return; }
  showToast('Membuat gambar menu...', 'info');
  try {
    const blob = await dashMenuGenImageBlob(m);
    if (!blob) throw new Error('Gagal membuat gambar');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'menu-hari-ini.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 4000);
  } catch (e) {
    showAlert('Gagal mengunduh gambar: ' + (e.message || 'Unknown error'), 'error');
  }
}

/**
 * dashMenuGenImageBlob — Buat gambar post (1080x1350) ala poster infografis gizi.
 * Layout: background putih + doodle tipis, header logo brand, judul + badge,
 * foto/tray menu, catatan + tabel gizi, dan footer brand (hijau tua + oranye).
 */
function dashMenuGenImageBlob(m) {
  m = m || dashMenuCurrent();
  return _dashLogoImg().then(function(logo) {
    return new Promise(function(resolve) {
    if (!m) { resolve(null); return; }
    const W = 1080, H = 1200, PAD = 64;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    const G9 = '#14532D', G7 = '#166534', G6 = '#15803D', OR = '#F97316', OR4 = '#FB923C',
          INK = '#1C1917', MUT = '#6B7280';
    const tenant = (typeof currentTenant !== 'undefined' && currentTenant && currentTenant.nama) || 'SPPG Sukaluyu Tamansari';
    const tenantShort = String(tenant);

    // ── Background putih + doodle makanan sangat tipis ──
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    _dashDoodle(ctx, PAD + 6, 96, 96, 0.35, 'rgba(21,101,45,0.05)');
    _dashDoodle(ctx, W - 150, 620, 92, -0.4, 'rgba(249,115,22,0.05)');
    _dashDoodle(ctx, PAD + 4, 660, 86, 0.22, 'rgba(21,101,45,0.05)');
    _dashDoodle(ctx, W - 160, 240, 104, -0.28, 'rgba(21,101,45,0.05)');

    // ── Header: logo kiri atas + tagline kanan atas ──
    if (logo) {
      ctx.drawImage(logo, PAD, 44, 92, 92);
      ctx.fillStyle = G9; ctx.font = '800 25px sans-serif'; ctx.fillText('SPPG', PAD + 108, 86);
      ctx.fillStyle = OR; ctx.font = '700 11px sans-serif'; ctx.fillText(tenantShort.toUpperCase(), PAD + 108, 106);
    } else {
      _dashDrawLogo(ctx, PAD, 52, 74);
      ctx.fillStyle = G9; ctx.font = '800 25px sans-serif'; ctx.fillText('SPPG', PAD + 90, 86);
      ctx.fillStyle = OR; ctx.font = '700 11px sans-serif'; ctx.fillText(tenantShort.toUpperCase(), PAD + 90, 106);
    }
    ctx.fillStyle = MUT; ctx.font = '600 12px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('Partner Nutrisi & Gaya Hidup Sehat', W - PAD, 88);
    ctx.textAlign = 'left';

    // ── Judul utama + badge ──
    ctx.fillStyle = G9; ctx.font = '800 54px sans-serif';
    ctx.fillText('Informasi Nilai Gizi', PAD, 208);
    const b1 = '✓   Menu MBG', b2 = 'Makanan Bergizi Gratis';
    ctx.font = '700 14px sans-serif';
    const bw1 = ctx.measureText(b1).width + 40;
    _dashRoundRect(ctx, PAD, 226, bw1, 44, 22);
    ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.strokeStyle = G6; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = G7; ctx.fillText(b1, PAD + 20, 255);
    const bx2 = PAD + bw1 + 14;
    const bw2 = ctx.measureText(b2).width + 60;
    const g2 = ctx.createLinearGradient(bx2, 0, bx2 + bw2, 0);
    g2.addColorStop(0, G6); g2.addColorStop(1, G9);
    _dashRoundRect(ctx, bx2, 226, bw2, 44, 22);
    ctx.fillStyle = g2; ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.fillText(b2, bx2 + 22, 255);
    ctx.fillStyle = OR4;
    ctx.beginPath(); ctx.arc(bx2 + 28, 248, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(bx2 + 28, 248, 3, 0, Math.PI * 2); ctx.fill();

    // ── Nama menu ──
    ctx.fillStyle = INK; ctx.font = '800 36px sans-serif';
    const nameLines = _dashWrapText(ctx, m.menu_nama || 'Menu hari ini', W - PAD * 2).slice(0, 2);
    nameLines.forEach(function(l, i) { ctx.fillText(l, PAD, 322 + i * 48); });
    const nameEnd = 322 + nameLines.length * 48;

    // ── Visual tengah: foto menu atau ilustrasi tray ──
    const visW = 700, visH = 430;
    const visX = (W - visW) / 2;
    const visY = nameEnd + 34;

    const drawLower = function() {
      // strip tanggal aktual menu
      ctx.fillStyle = MUT; ctx.font = '700 23px sans-serif';
      const tgl = _dashFmtTanggal(m.tanggal);
      ctx.fillText(tgl, PAD, visY + visH + 54);

      // kartu Catatan + tabel gizi
      const cardY = visY + visH + 84;
      const cardH = 180;
      const catW = Math.round((W - PAD * 2) * 0.52);
      const tblX = PAD + catW + 24;
      const tblW = W - PAD * 2 - catW - 24;

      _dashCard(ctx, PAD, cardY, catW, cardH);
      ctx.fillStyle = G9; ctx.font = '800 16px sans-serif'; ctx.fillText('Catatan', PAD + 22, cardY + 34);
      const bullets = [
        'Karbohidrat, lauk, sayur & buah dalam satu porsi',
        'Protein hewani & nabati untuk tumbuh kembang',
        'Serat tinggi membantu kesehatan pencernaan',
        'Diolah higienis sesuai standar gizi MBG',
      ];
      bullets.forEach(function(b, i) {
        const by = cardY + 58 + i * 29;
        ctx.fillStyle = OR; ctx.beginPath(); ctx.arc(PAD + 17, by - 5, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#44403C'; ctx.font = '600 13px sans-serif'; ctx.fillText(b, PAD + 31, by);
      });

      _dashCard(ctx, tblX, cardY, tblW, cardH);
      ctx.fillStyle = G9; ctx.font = '800 21px sans-serif'; ctx.fillText('Informasi Gizi', tblX + 22, cardY + 36);
      ctx.fillStyle = MUT; ctx.font = '600 12px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('per porsi', tblX + tblW - 22, cardY + 36); ctx.textAlign = 'left';
      const rows = [
        ['Energi', Number(m.kalori || 0).toLocaleString('id-ID') + ' kkal'],
        ['Protein', Number(m.protein || 0).toLocaleString('id-ID') + ' g'],
        ['Lemak', Number(m.lemak || 0).toLocaleString('id-ID') + ' g'],
        ['Karbohidrat', Number(m.karbohidrat || 0).toLocaleString('id-ID') + ' g'],
        ['Serat', Number(m.serat || 0).toLocaleString('id-ID') + ' g'],
      ];
      rows.forEach(function(r, i) {
        const y0 = cardY + 62 + i * 26;
        if (i > 0) {
          ctx.strokeStyle = '#F1EFEC'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(tblX + 22, y0 - 13); ctx.lineTo(tblX + tblW - 22, y0 - 13); ctx.stroke();
        }
        ctx.fillStyle = MUT; ctx.font = '600 13px sans-serif'; ctx.fillText(r[0], tblX + 22, y0);
        ctx.fillStyle = INK; ctx.font = '700 13px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(r[1], tblX + tblW - 22, y0); ctx.textAlign = 'left';
      });

      cv.toBlob(function(b) { resolve(b); }, 'image/png');
    };

    if (m.foto) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() {
        _dashDrawImageCover(ctx, img, visX, visY, visW, visH, 24);
        drawLower();
      };
      img.onerror = function() { _dashDrawTray(ctx, visX, visY, visW, visH); drawLower(); };
      img.src = m.foto;
    } else {
      _dashDrawTray(ctx, visX, visY, visW, visH);
      drawLower();
    }
    });
  });
}

// Logo asli dari public/asset/logo.png (cached)
var _dashLogoPromise = null;
function _dashLogoImg() {
  if (!_dashLogoPromise) {
    _dashLogoPromise = new Promise(function(resolve) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() { resolve(img); };
      img.onerror = function() { resolve(null); };
      img.src = '/asset/logo.png';
    });
  }
  return _dashLogoPromise;
}

// Format tanggal menu (YYYY-MM-DD) → "Senin, 27 Jul 2026"
function _dashFmtTanggal(iso) {
  if (!iso) return '';
  var parts = String(iso).split('-');
  if (parts.length !== 3) return String(iso);
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(d.getTime())) return String(iso);
  var hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][d.getDay()];
  var bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getMonth()];
  return hari + ', ' + d.getDate() + ' ' + bulan + ' ' + d.getFullYear();
}

// Logo custom SPPG (mangkuk + daun oranye + uap)
function _dashDrawLogo(ctx, x, y, s) {
  const r = s * 0.28;
  const g = ctx.createLinearGradient(x, y, x + s, y + s);
  g.addColorStop(0, '#15803D'); g.addColorStop(1, '#14532D');
  _dashRoundRect(ctx, x + s * 0.04, y + s * 0.04, s * 0.92, s * 0.92, r);
  ctx.fillStyle = g; ctx.fill();
  ctx.fillStyle = '#FDBA74';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.52, y + s * 0.30, s * 0.20, s * 0.13, -0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(x + s * 0.30, y + s * 0.64);
  ctx.lineTo(x + s * 0.70, y + s * 0.64);
  ctx.arc(x + s * 0.50, y + s * 0.64, s * 0.20, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(2, s * 0.05); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + s * 0.26, y + s * 0.64); ctx.lineTo(x + s * 0.74, y + s * 0.64); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1.5, s * 0.04);
  ctx.beginPath(); ctx.moveTo(x + s * 0.60, y + s * 0.16); ctx.quadraticCurveTo(x + s * 0.65, y + s * 0.10, x + s * 0.60, y + s * 0.02); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.71, y + s * 0.18); ctx.quadraticCurveTo(x + s * 0.76, y + s * 0.12, x + s * 0.71, y + s * 0.05); ctx.stroke();
}

// Kartu putih dengan garis tipis + bayangan halus
function _dashCard(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = 'rgba(20,83,45,0.08)';
  ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
  _dashRoundRect(ctx, x, y, w, h, 20);
  ctx.fillStyle = '#FFFFFF'; ctx.fill();
  ctx.strokeStyle = '#E7E5E4'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

// Doodle mangkuk + nasi (dekorasi background sangat tipis)
function _dashDoodle(ctx, cx, cy, size, rot, color) {
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(rot);
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.06);
  ctx.beginPath();
  ctx.moveTo(-size * 0.5, 0);
  ctx.lineTo(size * 0.5, 0);
  ctx.arc(0, 0, size * 0.5, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.18, size * 0.22, size * 0.10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Ilustrasi tray stainless 4 sekat (dipakai bila menu tanpa foto)
function _dashDrawTray(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = 'rgba(20,83,45,0.18)';
  ctx.shadowBlur = 26; ctx.shadowOffsetY = 12;
  const steel = ctx.createLinearGradient(0, y, 0, y + h);
  steel.addColorStop(0, '#F4F4F5'); steel.addColorStop(0.55, '#E4E4E7'); steel.addColorStop(1, '#D6D6D9');
  _dashRoundRect(ctx, x, y, w, h, h * 0.11);
  ctx.fillStyle = steel; ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = '#FBFBFB'; ctx.lineWidth = h * 0.035; ctx.stroke();
  _dashRoundRect(ctx, x + w * 0.045, y + h * 0.09, w * 0.91, h * 0.82, h * 0.08);
  ctx.fillStyle = '#DDDDE0'; ctx.fill();
  const cx = x + w / 2, cy = y + h / 2;
  ctx.strokeStyle = '#C7C7CB'; ctx.lineWidth = h * 0.035; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, y + h * 0.09); ctx.lineTo(cx, y + h * 0.91); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w * 0.07, cy); ctx.lineTo(x + w * 0.93, cy); ctx.stroke();

  // Nasi (kiri-atas)
  ctx.fillStyle = '#FDF6E3';
  ctx.beginPath(); ctx.ellipse(x + w * 0.275, y + h * 0.32, w * 0.145, h * 0.11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFFBF0';
  ctx.beginPath(); ctx.ellipse(x + w * 0.275, y + h * 0.26, w * 0.14, h * 0.105, 0, 0, Math.PI * 2); ctx.fill();
  // Ayam + telur (kiri-bawah)
  ctx.fillStyle = '#C97F36';
  ctx.beginPath(); ctx.arc(x + w * 0.36, y + h * 0.66, w * 0.064, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#E3AA63';
  ctx.beginPath(); ctx.ellipse(x + w * 0.36, y + h * 0.62, w * 0.042, h * 0.045, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#F6E8D4';
  ctx.beginPath(); ctx.ellipse(x + w * 0.34, y + h * 0.77, w * 0.022, h * 0.075, 0.45, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFFDF6';
  ctx.beginPath(); ctx.arc(x + w * 0.20, y + h * 0.76, w * 0.027, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#F4C33F';
  ctx.beginPath(); ctx.arc(x + w * 0.20, y + h * 0.76, w * 0.012, 0, Math.PI * 2); ctx.fill();
  // Sayur + wortel (kanan-atas)
  ctx.fillStyle = '#4C9A53';
  ctx.beginPath(); ctx.arc(x + w * 0.70, y + h * 0.29, w * 0.04, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#57A85F';
  ctx.beginPath(); ctx.arc(x + w * 0.74, y + h * 0.25, w * 0.045, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4C9A53';
  ctx.beginPath(); ctx.arc(x + w * 0.78, y + h * 0.29, w * 0.04, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3E7C45';
  _dashRoundRect(ctx, x + w * 0.695, y + h * 0.34, w * 0.085, h * 0.04, h * 0.02); ctx.fill();
  ctx.fillStyle = '#F97316';
  ctx.beginPath(); ctx.arc(x + w * 0.83, y + h * 0.27, w * 0.022, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FB8A3D';
  ctx.beginPath(); ctx.arc(x + w * 0.855, y + h * 0.31, w * 0.019, 0, Math.PI * 2); ctx.fill();
  // Buah (kanan-bawah)
  ctx.fillStyle = '#F5D24C';
  ctx.beginPath(); ctx.ellipse(x + w * 0.65, y + h * 0.65, w * 0.065, h * 0.045, -0.35, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#E3B93A'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(x + w * 0.65, y + h * 0.65, w * 0.065, h * 0.045, -0.35, 0, Math.PI); ctx.stroke();
  ctx.fillStyle = '#FBA64C';
  ctx.beginPath(); ctx.arc(x + w * 0.80, y + h * 0.70, w * 0.042, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFDCAF';
  ctx.beginPath(); ctx.arc(x + w * 0.80, y + h * 0.70, w * 0.03, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function _dashRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

function _dashWrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach(function(w) {
    const t = line ? line + ' ' + w : w;
    if (line && ctx.measureText(t).width > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = t;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function _dashDrawImageCover(ctx, img, x, y, w, h, r) {
  ctx.save();
  _dashRoundRect(ctx, x, y, w, h, r);
  ctx.clip();
  const ir = img.width / img.height;
  const ar = w / h;
  let sw, sh, sx = 0, sy = 0;
  if (ir > ar) {
    sh = img.height; sw = sh * ar; sx = (img.width - sw) / 2;
  } else {
    sw = img.width; sh = sw / ar; sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

/**
 * animateDashboardCounts - Animasi count-up untuk elemen dengan class .dash-count.
 * Mendukung format angka default dan format Rupiah (data-format="idr").
 */
function animateDashboardCounts(root) {
  const els = root.querySelectorAll('.dash-count');
  els.forEach(el => {
    const target = parseFloat(el.getAttribute('data-count')) || 0;
    const isIdr = el.getAttribute('data-format') === 'idr';
    const dur = 900;
    const start = performance.now();
    const fmt = (v) => {
      const n = Math.round(v);
      const s = n.toLocaleString('id-ID');
      return isIdr ? 'Rp ' + s : s;
    };
    el.textContent = fmt(0);
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
  * exportDashboardRabHarian - Export RAB Harian (XLSX) dari dashboard admin.
  * Mengunduh /api/laporan/rab-harian/export?tanggal=YYYY-MM-DD&tanggal_sampai=YYYY-MM-DD.
  */
function exportDashboardRabHarian() {
  const tgl = (document.getElementById('dash-rh-tanggal') || {}).value || '';
  const tglSampai = (document.getElementById('dash-rh-tanggal-sampai') || {}).value || '';
  if (!tgl) { showAlert('Pilih tanggal RAB Harian terlebih dahulu', 'warning'); return; }
  if (tglSampai && tglSampai < tgl) {
    showAlert('Tanggal akhir tidak boleh lebih awal dari tanggal mulai', 'warning');
    return;
  }

  // Check if there's data for the selected date(s)
  checkRabDataExists(tgl, tglSampai).then(hasData => {
    if (!hasData) {
      showAlert('Tidak ada data RAB untuk tanggal yang dipilih', 'warning');
      // Optional: Check accountant and nutritionist permissions
      if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'keuangan')) {
        checkProfessionalAccess().then(access => {
          if (!access.hasAnyData) {
            showProfessionalWarning(access);
          }
        });
      }
      return;
    }
    let url = '/api/laporan/rab-harian/export?tanggal=' + encodeURIComponent(tgl);
    if (tglSampai) url += '&tanggal_sampai=' + encodeURIComponent(tglSampai);
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showAlert('Export RAB Harian diproses, file akan terunduh', 'info');
  }).catch(err => {
    console.error('Error checking RAB data:', err);
    showAlert('Gagal memeriksa data RAB: ' + err.message, 'error');
  });
}

async function checkRabDataExists(startDate, endDate) {
  try {
    let url = '/api/laporan/rab-harian/check?tanggal=' + encodeURIComponent(startDate);
    if (endDate) url += '&tanggal_sampai=' + encodeURIComponent(endDate);
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return false;
    const data = await res.json();
    return data.hasData || false;
  } catch (err) {
    console.error('Error checking RAB data:', err);
    return false;
  }
}

async function checkProfessionalAccess() {
  try {
    // Check if accountant has data
    const accountantRes = await fetch('/api/laporan/rab-harian/check-akuntan', { credentials: 'include' });
    const accountantData = await accountantRes.json() || {};

    // Check if nutritionist has data
    const giziRes = await fetch('/api/laporan/rab-harian/check-ahli-gizi', { credentials: 'include' });
    const giziData = await giziRes.json() || {};

    return {
      hasAnyData: (accountantData.hasData || false) || (giziData.hasData || false),
      accountantData: accountantData,
      giziData: giziData
    };
  } catch (err) {
    console.error('Error checking professional access:', err);
    return { hasAnyData: false };
  }
}

function showProfessionalWarning(access) {
  let warningMsg = 'Tidak ada data RAB untuk tanggal yang dipilih';
  if (access.accountantData && access.accountantData.warning) {
    warningMsg += '\n';
    warningMsg += 'Perhatian Akuntan: ' + access.accountantData.warning;
  }
  if (access.giziData && access.giziData.warning) {
    warningMsg += '\n';
    warningMsg += 'Perhatian Ahli Gizi: ' + access.giziData.warning;
  }
  showAlert(warningMsg, 'warning');
}

/**
 * renderDashboardKeuangan - Dashboard Keuangan
 * Menampilkan ringkasan keuangan: saldo kas, pendapatan/biaya bulan ini, transaksi terbaru
 */
async function renderDashboardKeuangan() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-8 w-8 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';

  try {
    const d = await api.get('/dashboard/finance');

    const fmtIDR = (v) => 'Rp' + Number(v || 0).toLocaleString('id-ID');
    const fmtNum = (v) => Number(v || 0).toLocaleString('id-ID');
    const fmtDate = (s) => {
      if (!s) return '-';
      const d = new Date(s);
      return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    // Helper untuk badge growth
    const growthBadge = (pct) => {
      if (pct === null) return '<span class="text-[10px] text-stone-400">—</span>';
      const isPos = pct >= 0;
      return `<span class="text-[10px] font-medium ${isPos ? 'text-emerald-600' : 'text-red-600'}">${isPos ? '↑' : '↓'} ${Math.abs(pct)}%</span>`;
    };

    const labaClass = d.laba_rugi >= 0 ? 'text-emerald-600' : 'text-red-600';
    const labaLabel = d.laba_rugi >= 0 ? 'Laba' : 'Rugi';

    // Stat cards
    const statCards = [
      { label: 'Saldo Kas', value: fmtIDR(d.saldo_kas), gradient: 'from-emerald-50 to-emerald-100/60', border: 'border-emerald-200/60', icon: 'circle', iconColor: 'text-emerald-500', textColor: 'text-emerald-800', extra: '' },
      { label: 'Pendapatan Bulan Ini', value: fmtIDR(d.pendapatan_bulan_ini), gradient: 'from-blue-50 to-blue-100/60', border: 'border-blue-200/60', icon: 'arrow-up', iconColor: 'text-blue-500', textColor: 'text-blue-800', extra: `${growthBadge(d.pendapatan_growth)} <span class="text-[10px] text-stone-400">vs bulan lalu</span>` },
      { label: 'Biaya Bulan Ini', value: fmtIDR(d.biaya_bulan_ini), gradient: 'from-orange-50 to-orange-100/60', border: 'border-orange-200/60', icon: 'arrow-down', iconColor: 'text-orange-500', textColor: 'text-orange-800', extra: `${growthBadge(d.biaya_growth)} <span class="text-[10px] text-stone-400">vs bulan lalu</span>` },
      { label: `${labaLabel} Bulan Ini`, value: fmtIDR(Math.abs(d.laba_rugi)), gradient: d.laba_rugi >= 0 ? 'from-emerald-50 to-emerald-100/60' : 'from-red-50 to-red-100/60', border: d.laba_rugi >= 0 ? 'border-emerald-200/60' : 'border-red-200/60', icon: 'dollar', iconColor: labaClass, textColor: labaClass, extra: `<span class="text-[10px] text-stone-500">Margin: ${d.margin}%</span>` },
    ];
    let html = `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">`;
    statCards.forEach(c => {
      const iconSvg = {
        'circle': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
        'arrow-up': '<path d="M12 19V5m0 0l-7 7m7-7l7 7"/>',
        'arrow-down': '<path d="M12 5v14m0 0l7-7m-7 7l-7-7"/>',
        'dollar': '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
      }[c.icon];
      html += `
      <div class="bg-gradient-to-br ${c.gradient} rounded-2xl border ${c.border} p-4 sm:p-5 shadow-sm">
        <div class="flex items-center justify-between mb-2">
          <span class="text-[10px] font-semibold uppercase tracking-wider ${c.textColor}">${c.label}</span>
          <svg class="w-4 h-4 ${c.iconColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">${iconSvg}</svg>
        </div>
        <div class="mono text-xl sm:text-2xl font-bold ${c.textColor}">${c.value}</div>
        ${c.extra ? `<div class="mt-1">${c.extra}</div>` : ''}
      </div>`;
    });
    html += `</div>`;

    // Low stock alert
    if (d.stok_menipis > 0) {
      html += `
      <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-center gap-3 shadow-sm">
        <div class="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
          <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
        </div>
        <div class="text-sm">
          <span class="font-semibold text-amber-800">${d.stok_menipis} bahan baku</span>
          <span class="text-amber-700">dengan stok menipis. </span>
          <a href="/gudang" data-key="gudang" class="font-medium text-amber-800 underline hover:no-underline">Cek Gudang →</a>
        </div>
      </div>`;
    }

    // Recent transactions table
    const transaksi = d.transaksi_terbaru || [];
    html += `
    <div class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
      <div class="px-4 sm:px-5 py-3 sm:py-4 border-b border-stone-200 flex items-center justify-between">
        <h3 class="font-bold text-sm text-stone-800">Transaksi Terbaru</h3>
        <span class="text-[10px] font-medium text-stone-500">${d.bulan}/${d.tahun}</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-stone-100">
              <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Tanggal</th>
              <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Tipe</th>
              <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Kategori</th>
              <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Deskripsi</th>
              <th class="text-right px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">Jumlah</th>
            </tr>
          </thead>
          <tbody>`;

    if (transaksi.length === 0) {
      html += '<tr><td colspan="5" class="text-center py-12 text-stone-400">Belum ada transaksi</td></tr>';
    } else {
      transaksi.forEach(t => {
        const isMasuk = t.tipe === 'masuk';
        const tipeClass = isMasuk ? 'text-emerald-600' : 'text-red-600';
        const badgeBg = isMasuk ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700';
        html += `
          <tr class="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
            <td class="px-4 py-3 mono text-[10px] text-stone-600">${fmtDate(t.tanggal)}</td>
            <td class="px-4 py-3">
              <span class="inline-block px-2.5 py-0.5 text-[10px] font-semibold rounded-lg ${badgeBg}">${t.tipe}</span>
            </td>
            <td class="px-4 py-3 text-xs text-stone-600">${t.kategori || '-'}</td>
            <td class="px-4 py-3 text-xs text-stone-600 max-w-[200px] truncate">${escHtml(t.deskripsi || '-')}</td>
            <td class="px-4 py-3 text-right mono text-xs font-semibold ${tipeClass}">${fmtIDR(t.jumlah)}</td>
          </tr>`;
      });
    }

    html += `
          </tbody>
        </table>
      </div>
    </div>`;

    c.innerHTML = html;
  } catch (err) {
    console.error('Dashboard Keuangan error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat dashboard keuangan: ${err.message}</div>`;
  }
}

let onlineUsersRefreshInterval = null;

async function loadOnlineUsers() {
  try {
    const r = await fetch('/api/dashboard/online-users', { credentials: 'include' });
    if (!r.ok) throw new Error('Failed to fetch');
    const data = await r.json();
    
    const countEl = document.getElementById('online-count');
    const listEl = document.getElementById('online-users-list');
    
    if (countEl) countEl.textContent = data.count + ' user';
    
    if (!data.users || data.users.length === 0) {
      if (listEl) listEl.innerHTML = '<div class="text-sm text-stone-400 text-center py-4">Tidak ada user online</div>';
      return;
    }
    
    if (listEl) {
      listEl.innerHTML = data.users.map(u => {
        const initials = u.nama?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) || '?';
        const mins = Math.floor(u.seconds_ago / 60);
        const secs = u.seconds_ago % 60;
        const timeAgo = mins > 0 ? `${mins}m ${secs}s lalu` : `${secs}s lalu`;
        const roleLabel = { admin: 'Admin', ahli_gizi: 'Ahli Gizi', gudang: 'Gudang', keuangan: 'Keuangan', produksi: 'Produksi' }[u.role] || u.role;
        
        return `
          <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-50 transition-colors">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style="background: linear-gradient(135deg, #10b981, #059669);">
              ${initials}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-stone-800 truncate">${u.nama}</span>
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Online"></span>
              </div>
              <div class="text-[10px] text-stone-400 flex items-center gap-2">
                <span class="px-1.5 py-0.5 rounded bg-stone-100 text-[9px] font-medium">${roleLabel}</span>
                <span>${timeAgo}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Failed to load online users:', err);
    const listEl = document.getElementById('online-users-list');
    if (listEl) listEl.innerHTML = '<div class="text-sm text-red-500 text-center py-4">Gagal memuat</div>';
  }
}

function startOnlineUsersAutoRefresh() {
  if (onlineUsersRefreshInterval) clearInterval(onlineUsersRefreshInterval);
  onlineUsersRefreshInterval = setInterval(loadOnlineUsers, 30000);
}

function stopOnlineUsersAutoRefresh() {
  if (onlineUsersRefreshInterval) {
    clearInterval(onlineUsersRefreshInterval);
    onlineUsersRefreshInterval = null;
  }
}

// Expose for manual refresh button
window.loadOnlineUsers = loadOnlineUsers;
window.stopOnlineUsersAutoRefresh = stopOnlineUsersAutoRefresh;

// ===== Riwayat User Online =====

function ohInitials(n) {
  return (n || '?').split(' ').map(w => (w[0] || '')).join('').toUpperCase().slice(0, 2) || '?';
}
function ohRoleLabel(role) {
  return { admin: 'Admin', ahli_gizi: 'Ahli Gizi', gudang: 'Gudang', keuangan: 'Keuangan', produksi: 'Produksi' }[role] || role || '-';
}
function ohDateKey(d) {
  const x = new Date(d);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}
function ohDateLabel(d) {
  const x = new Date(d);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (ohDateKey(x) === ohDateKey(today)) return 'Hari ini';
  if (ohDateKey(x) === ohDateKey(y)) return 'Kemarin';
  return x.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}
function ohTime(d) {
  return new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function openOnlineHistory() {
  const m = document.getElementById('online-history-modal');
  if (!m) return;
  m.classList.remove('hidden');
  m.classList.add('flex');
  loadOnlineHistory();
}

function closeOnlineHistory() {
  const m = document.getElementById('online-history-modal');
  if (!m) return;
  m.classList.add('hidden');
  m.classList.remove('flex');
}

function populateOhUserFilter(users) {
  const sel = document.getElementById('oh-user');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Semua user</option>' + (users || []).map(u => `<option value="${u.user_id}">${escDashMenu(u.nama)}</option>`).join('');
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}

function renderOhSummary(d) {
  const users = d.users || [];
  const chips = users.slice(0, 8).map(u => `
    <div class="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-stone-50 border border-stone-200 whitespace-nowrap">
      <div class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style="background: linear-gradient(135deg, #10b981, #059669);">${ohInitials(u.nama)}</div>
      <div class="leading-tight min-w-0">
        <div class="text-xs font-medium text-stone-700 truncate">${escDashMenu(u.nama || '—')}</div>
        <div class="text-[9px] text-stone-400">${u.logins} login · ${u.last_activity ? 'aktif ' + ohTime(u.last_activity) : '—'}</div>
      </div>
    </div>`).join('');
  return `
    <div class="flex gap-2 flex-wrap mb-2">
      <div class="text-[10px] px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold">${d.total} aktivitas</div>
      <div class="text-[10px] px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-bold">${d.logins} login</div>
      <div class="text-[10px] px-2.5 py-1.5 rounded-lg bg-stone-100 text-stone-600 font-bold">${users.length} user</div>
    </div>
    <div class="flex gap-2 overflow-x-auto pb-1">${chips}${users.length > 8 ? `<span class="text-[10px] text-stone-400 self-center whitespace-nowrap">+${users.length - 8} lagi</span>` : ''}</div>`;
}

function renderOhEntries(entries) {
  if (!entries || !entries.length) return '<div class="text-sm text-stone-400 text-center py-8">Belum ada aktivitas pada rentang ini.</div>';
  const groups = {};
  entries.forEach(e => { const k = ohDateKey(e.created_at); (groups[k] = groups[k] || []).push(e); });
  let html = '';
  Object.keys(groups).sort((a, b) => (a < b ? 1 : -1)).forEach(k => {
    const rows = groups[k];
    html += `<div class="text-[10px] font-bold uppercase tracking-wider text-stone-400 mt-3 mb-1.5">${ohDateLabel(rows[0].created_at)}</div>`;
    rows.forEach(e => {
      const isLogin = e.event === 'login';
      html += `<div class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-stone-50 transition-colors">
        <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style="background: linear-gradient(135deg, #10b981, #059669);">${ohInitials(e.nama)}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium text-stone-800 truncate">${escDashMenu(e.nama || '—')}</span>
            <span class="px-1.5 py-0.5 rounded bg-stone-100 text-[9px] font-medium">${ohRoleLabel(e.role)}</span>
          </div>
          <div class="text-[10px] text-stone-400">${ohTime(e.created_at)}</div>
        </div>
        <span class="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${isLogin ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}">${isLogin ? 'Login' : 'Aktif'}</span>
      </div>`;
    });
  });
  return html;
}

async function loadOnlineHistory() {
  const listEl = document.getElementById('oh-list');
  const infoEl = document.getElementById('oh-range-info');
  const summaryEl = document.getElementById('oh-summary');
  if (listEl) listEl.innerHTML = '<div class="text-sm text-stone-400 text-center py-8">Memuat...</div>';

  const range = (document.getElementById('oh-range') || {}).value || '7';
  const uid = (document.getElementById('oh-user') || {}).value || '';
  try {
    const q = new URLSearchParams({ days: range });
    if (uid) q.set('user_id', uid);
    const r = await fetch('/api/dashboard/online-history?' + q.toString(), { credentials: 'include' });
    if (!r.ok) throw new Error('Failed');
    const d = await r.json();
    populateOhUserFilter(d.users);
    if (infoEl) infoEl.textContent = `${d.total} aktivitas · ${d.logins} login${d.mulai ? ` · ${d.mulai} s/d ${d.sampai}` : ''}`;
    if (summaryEl) summaryEl.innerHTML = renderOhSummary(d);
    if (listEl) listEl.innerHTML = renderOhEntries(d.entries);
  } catch (err) {
    if (listEl) listEl.innerHTML = '<div class="text-sm text-red-500 text-center py-8">Gagal memuat riwayat</div>';
  }
}

window.openOnlineHistory = openOnlineHistory;
window.closeOnlineHistory = closeOnlineHistory;
window.loadOnlineHistory = loadOnlineHistory;
