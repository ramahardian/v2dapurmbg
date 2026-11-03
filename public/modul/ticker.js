// ── Ticker text: elemen .truncate (ellipsis) bergulir saat hover ──
(function() {
  var s = document.createElement('style');
  s.textContent = '.tk-wrap{overflow:hidden!important;white-space:nowrap!important;text-overflow:clip!important}.tk-wrap.tk-inline{display:inline-block}.tk-wrap .tk-track{display:inline-block;white-space:nowrap;will-change:transform;animation:tk-scroll var(--tk-dur,8s) linear infinite}.tk-wrap .tk-item{display:inline-block;padding-right:2em}@keyframes tk-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}';
  document.head.appendChild(s);

  var DATA_ORIG = 'data-tk-orig';
  var DATA_DISP = 'data-tk-display';

  function isTickerable(el) {
    if (!el || el.classList.contains('tk-wrap')) return false;
    if (el.scrollWidth <= el.clientWidth + 1) return false; // tidak terpotong → tak perlu ticker
    return true;
  }

  function activate(el) {
    var orig = el.innerHTML;
    if (!orig) return;
    var prevDisplay = window.getComputedStyle(el).display;
    var dur = Math.max(4, Math.ceil((el.scrollWidth || 100) / 40)) + 's';
    el.classList.add('tk-wrap');
    if (prevDisplay === 'inline') el.classList.add('tk-inline');
    el.setAttribute(DATA_ORIG, orig);
    el.setAttribute(DATA_DISP, prevDisplay);
    el.innerHTML = '<span class="tk-track" style="--tk-dur:' + dur + '"><span class="tk-item">' + orig + '</span><span class="tk-item" aria-hidden="true">' + orig + '</span></span>';
  }

  function restore(el) {
    if (!el.classList.contains('tk-wrap')) return;
    el.classList.remove('tk-wrap', 'tk-cell');
    el.innerHTML = el.getAttribute(DATA_ORIG) || '';
    el.removeAttribute(DATA_ORIG);
    el.removeAttribute(DATA_DISP);
  }

  document.addEventListener('mouseover', function(e) {
    var el = e.target && e.target.closest ? e.target.closest('.truncate') : null;
    if (!el) return;
    if (el._tkRestoreTimer) { clearTimeout(el._tkRestoreTimer); el._tkRestoreTimer = null; }
    if (isTickerable(el)) activate(el);
  });

  document.addEventListener('mouseout', function(e) {
    var el = e.target && e.target.closest ? e.target.closest('.truncate.tk-wrap') : null;
    if (!el) return;
    // kecilkan jendela agar perpindahan antar child tidak langsung me-restore
    if (el._tkRestoreTimer) clearTimeout(el._tkRestoreTimer);
    el._tkRestoreTimer = setTimeout(function() { restore(el); }, 150);
  });
})();
