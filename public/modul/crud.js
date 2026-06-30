// ===== Generic CRUD =====
let _crudCfg = null;
let _crudState = { page: 1, limit: 25, search: '', total: 0, totalPages: 1 };

async function renderCrud(cfg) {
  _crudCfg = cfg;
  _crudState = { page: 1, limit: 25, search: '', total: 0, totalPages: 1 };
  const c = document.getElementById('content');
  c.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-2 mb-4">
    <div class="flex items-center gap-2">
      <input id="crud-search" placeholder="Cari..." class="h-10 px-3 border border-stone-200 rounded-md text-sm w-48">
      <button id="add-btn" class="bg-[#1e40af] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-md text-sm font-medium">+ Tambah</button>
    </div>
    <div class="flex gap-2">
      ${cfg.sync ? `<button id="sync-btn" onclick="syncCrudData()" class="border border-emerald-400 text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-md text-sm font-medium">${cfg.sync.label}</button>` : ''}
      <button onclick="exportXlsx()" class="border border-stone-300 text-stone-700 hover:bg-stone-50 px-4 py-2 rounded-md text-sm font-medium">Export XLSX</button>
    </div>
  </div>
  <div id="table-wrap" class="bg-white border border-stone-200 rounded-lg overflow-hidden"></div>
  <div id="crud-pagination" class="flex items-center justify-between mt-3"></div>`;
  document.getElementById('add-btn').onclick = () => openForm(cfg, null);

  const searchInput = document.getElementById('crud-search');
  let debounceTimer;
  searchInput.oninput = function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      _crudState.search = this.value;
      _crudState.page = 1;
      reloadCrud(cfg);
    }, 300);
  };

  await reloadCrud(cfg);
}

async function reloadCrud(cfg) {
  const params = new URLSearchParams({ page: _crudState.page, limit: _crudState.limit, search: _crudState.search });
  const res = await api.get(cfg.endpoint + '?' + params);
  const rows = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
  const pagination = res.pagination || { total: rows.length, totalPages: 1, page: 1 };
  _crudState = { ..._crudState, total: pagination.total, totalPages: pagination.totalPages, page: pagination.page };
  window._crudRows = rows;

  const w = document.getElementById('table-wrap');
  if (!rows.length) {
    w.innerHTML = '<div class="p-12 text-center text-stone-400"><svg class="w-16 h-16 mx-auto mb-4 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg><div>Belum ada data</div><div class="text-sm mt-1 text-stone-400">Klik "Tambah" untuk mulai.</div></div>';
    document.getElementById('crud-pagination').innerHTML = '';
    return;
  }

  const headers = cfg.cols.map(k => `<th class="text-left px-4 py-3 text-xs font-semibold text-stone-600 uppercase">${cfg.fields.find(f => f.k === k)?.l || k}</th>`).join('');
  const body = rows.map(r => `<tr class="border-t border-stone-100">
    ${cfg.cols.map(k => {
      const f = cfg.fields.find(x => x.k === k);
      const v = r[k];
      let cell = v == null || v === '' ? '-' : v;
      if (f?.fmt === 'idr') cell = `<span class="mono">${fmtIDR(v)}</span>`;
      else if (f?.fmt === 'num') cell = `<span class="mono">${f.decimals != null ? Number(v).toFixed(f.decimals) : fmtNum(v)}</span>`;
      else if (f?.fmt === 'pct') cell = `<span class="mono">${Math.round(v * 100)}</span>%`;
      else if (f?.type === 'date') cell = fmtDate(v);
      return `<td class="px-4 py-3 text-sm">${cell}</td>`;
    }).join('')}
    <td class="px-4 py-3 text-right whitespace-nowrap">
      <button onclick='editRow(${JSON.stringify(cfg).replace(/'/g, "\\'")}, ${JSON.stringify(r).replace(/'/g, "\\'")})' class="text-stone-500 hover:text-stone-900 p-1.5 inline-flex items-center" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button onclick='deleteRow("${cfg.endpoint}", ${r.id}, ${JSON.stringify(cfg).replace(/'/g, "\\'")})' class="text-red-600 hover:text-red-800 p-1.5 inline-flex items-center" title="Hapus"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
    </td></tr>`).join('');
  w.innerHTML = `<div class="overflow-x-auto"><table class="w-full"><thead class="bg-stone-50"><tr>${headers}<th class="px-4 py-3 text-right text-xs font-semibold text-stone-600 uppercase">Aksi</th></tr></thead><tbody>${body}</tbody></table></div>`;

  renderCrudPagination();
}

function renderCrudPagination() {
  const wrap = document.getElementById('crud-pagination');
  const { page, totalPages, total } = _crudState;
  if (totalPages <= 1) { wrap.innerHTML = total > 0 ? `<span class="text-sm text-stone-400">${total} data</span>` : ''; return; }
  const prev = page > 1 ? `<button onclick="crudGoToPage(${page - 1})" class="px-2 py-1 text-sm rounded border border-stone-200 hover:bg-stone-50">Prev</button>` : '';
  const next = page < totalPages ? `<button onclick="crudGoToPage(${page + 1})" class="px-2 py-1 text-sm rounded border border-stone-200 hover:bg-stone-50">Next</button>` : '';
  wrap.innerHTML = `<span class="text-sm text-stone-500">${total} data — Hal ${page} dari ${totalPages}</span><div class="flex gap-2">${prev}${next}</div>`;
}

function crudGoToPage(p) {
  _crudState.page = p;
  reloadCrud(_crudCfg);
}

function editRow(cfg, row) { openForm(cfg, row); }
async function deleteRow(endpoint, id, cfg) {
  if (!await showConfirm('Hapus data ini?')) return;
  await api.del(endpoint + '/' + id); reloadCrud(cfg);
}

async function syncCrudData() {
  const cfg = _crudCfg;
  if (!cfg || !cfg.sync) return;
  if (!await showConfirm(cfg.sync.confirm || 'Sync data ini?', 'Ya, Sync')) return;
  try {
    const res = await api.post(cfg.sync.endpoint, {});
    showToast(`${res.updated || res.recalculated} data diperbarui dari ${res.total}`, 'success');
    reloadCrud(cfg);
  } catch (e) {
    showAlert(e.message || 'Gagal sync', 'error');
  }
}

function exportXlsx() {
  const cfg = _crudCfg;
  if (!cfg) return;
  const rows = window._crudRows || [];
  if (!rows.length) { showAlert('Tidak ada data untuk diexport', 'warning'); return; }
  const headers = cfg.cols.map(k => cfg.fields.find(f => f.k === k)?.l || k);
  const data = rows.map(r => cfg.cols.map(k => r[k] == null ? '' : r[k]));
  data.unshift(headers);
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, (cfg.title || cfg.endpoint) + '.xlsx');
}

async function exportBahanBakuXlsx() {
  const cfg = getBahanCrud();
  const rows = await api.get('/bahan_baku');
  if (!rows.length) { showAlert('Tidak ada data untuk diexport', 'warning'); return; }
  const headers = cfg.cols.map(k => cfg.fields.find(f => f.k === k)?.l || k);
  const data = rows.map(r => cfg.cols.map(k => r[k] == null ? '' : r[k]));
  data.unshift(headers);
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bahan Baku');
  XLSX.writeFile(wb, 'bahan_baku.xlsx');
}

function renderField(f, editing) {
  if (f.type === 'hidden') {
    return `<input type="hidden" id="f-${f.k}" value="${editing?.[f.k] || ''}" />`;
  }
  const ro = f.readOnly;
  const roCls = ro ? 'bg-stone-100 text-stone-500 cursor-not-allowed' : '';
  const val = editing?.[f.k];
  let input;
  if (f.type === 'select') {
    input = `<select id="f-${f.k}" ${ro ? 'disabled' : ''} class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md text-sm ${roCls}">
      <option value="">— Pilih —</option>${f.opts.map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('')}
    </select>`;
  } else if (f.type === 'select-api') {
    input = `<select id="f-${f.k}" ${ro ? 'disabled' : ''} class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md text-sm ${roCls}"><option value="">— Memuat data... —</option></select>`;
  } else if (f.type === 'textarea') {
    input = `<textarea id="f-${f.k}" rows="2" ${ro ? 'readonly' : ''} class="mt-1 w-full px-3 py-2 border border-stone-200 rounded-md text-sm ${roCls}">${val || ''}</textarea>`;
  } else {
    const itype = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text';
    let ival = val != null ? (f.type === 'date' ? String(val).slice(0,10) : val) : '';
    if (f.fmt === 'pct' && val != null) ival = Math.round(val * 100);
    if (f.fmt === 'num' && f.decimals != null && val != null) ival = Number(val).toFixed(f.decimals);
    input = `<input id="f-${f.k}" type="${itype}" value="${ival}" ${ro ? 'readonly' : ''} class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md text-sm ${f.type === 'number' ? 'mono' : ''} ${roCls}" />`;
  }
  return `<div class="${f.type === 'hidden' ? '' : 'mb-3'}"><label class="text-sm text-stone-700">${f.l}${f.req ? ' <span class="text-red-500">*</span>' : ''}</label>${input}</div>`;
}

function openForm(cfg, editing) {
  const title = (editing ? 'Edit ' : 'Tambah ') + MODULES[(location.pathname || '/dashboard').slice(1)].title;
  document.getElementById('modal-title').textContent = title;
  const body = document.getElementById('modal-body');

  const apiSelects = cfg.fields.filter(f => f.type === 'select-api');

  if (cfg.groups && Array.isArray(cfg.groups)) {
    let html = '';
    cfg.groups.forEach(g => {
      const gFields = cfg.fields.filter(f => f.group === g.key && f.type !== 'hidden');
      if (!gFields.length) return;
      html += `<div class="mb-6">
        <h4 class="text-sm font-semibold text-stone-700 mb-3 pb-2" style="border-bottom:1px solid var(--border)">${g.label}</h4>
        <div class="grid grid-cols-1 ${g.cols === 2 ? 'md:grid-cols-2' : ''} gap-x-4 gap-y-1">`;
      gFields.forEach(f => { html += renderField(f, editing); });
      html += `</div></div>`;
    });
    cfg.fields.filter(f => f.type === 'hidden').forEach(f => { html += renderField(f, editing); });
    body.innerHTML = html;
  } else {
    body.innerHTML = cfg.fields.map(f => renderField(f, editing)).join('');
  }

  apiSelects.forEach(f => {
    const sel = document.getElementById('f-' + f.k);
    api.get(f.source).then(rows => {
      const list = Array.isArray(rows) ? rows : (rows.data || []);
      sel.innerHTML = '<option value="">— Pilih ' + f.l + ' —</option>' +
        list.map(r => `<option value="${r[f.valueField || 'id']}" data-item='${encodeURIComponent(JSON.stringify(r))}' ${editing?.[f.k] == r[f.valueField || 'id'] ? 'selected' : ''}>${r[f.labelField || 'nama']}</option>`).join('');
      sel.onchange = function() {
        const opt = sel.options[sel.selectedIndex];
        if (opt && opt.dataset.item) {
          const item = JSON.parse(decodeURIComponent(opt.dataset.item));
          if (f.fill) Object.keys(f.fill).forEach(key => {
            const src = document.getElementById('f-' + key);
            if (src) src.value = item[f.fill[key]] || '';
          });
          if (f.fillApi && item[f.fillApi.param]) {
            api.get(f.fillApi.url + '?kategori=' + encodeURIComponent(item[f.fillApi.param])).then(r => {
              const tgt = document.getElementById('f-' + f.fillApi.target);
              if (tgt && r.total) tgt.value = r.total;
            });
          }
        }
      };
    });
  });

  // Auto-calc fields (e.g. berat_kotor = berat_bersih / bdd_persen)
  cfg.fields.filter(function(f) { return f.calc; }).forEach(function(f) {
    var target = document.getElementById('f-' + f.k);
    if (!target) return;
    var srcDefs = (f.calc.from || []).map(function(src) {
      var el = document.getElementById('f-' + src);
      var def = cfg.fields.find(function(x) { return x.k === src; });
      return { el: el, isPct: def && def.fmt === 'pct' };
    }).filter(function(s) { return s.el; });
    if (srcDefs.length < 2) return;
    var dec = f.decimals != null ? f.decimals : 2;
    function updateCalc() {
      var a = parseFloat(srcDefs[0].el.value) || 0;
      var b = parseFloat(srcDefs[1].el.value) || 0;
      if (srcDefs[1].isPct) b = b / 100;
      target.value = b !== 0 ? (a / b).toFixed(dec) : '0';
    }
    srcDefs.forEach(function(s) { s.el.addEventListener('input', updateCalc); });
    updateCalc();
  });

  document.getElementById('modal-save').onclick = async () => {
    var rules = cfg.fields.filter(function(f) { return f.req; }).map(function(f) {
      return { id: 'f-' + f.k, label: f.l, type: (f.type === 'select' || f.type === 'select-api') ? 'select' : (f.type === 'number' ? 'number' : 'text') };
    });
    if (!validateForm(rules)) return;
    const payload = {};
    cfg.fields.forEach(f => {
      const v = document.getElementById('f-' + f.k).value;
      let val = f.type === 'number' ? Number(v) || 0 : v;
      if (f.fmt === 'pct') val = val / 100;
      payload[f.k] = val;
    });
    if (editing) await api.put(cfg.endpoint + '/' + editing.id, payload);
    else await api.post(cfg.endpoint, payload);
    closeModal(); reloadCrud(cfg);
  };
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}
function showConfirm(msg, okLabel) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-message').textContent = msg;
    var okBtn = document.getElementById('confirm-ok');
    okBtn.textContent = okLabel || 'Hapus';
    okBtn.onclick = () => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      resolve(true);
    };
    document.getElementById('confirm-cancel').onclick = () => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      resolve(false);
    };
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  });
}

function showAlert(msg, type) {
  var modal = document.getElementById('alert-modal');
  if (!modal) return;
  var titleEl = document.getElementById('alert-title');
  var msgEl = document.getElementById('alert-message');
  var iconWrap = document.getElementById('alert-icon');
  var svgEl = document.getElementById('alert-svg');
  var okBtn = document.getElementById('alert-ok');
  var colors = {
    warning: { bg: 'bg-amber-100', text: 'text-amber-600', btn: 'bg-amber-600 hover:bg-amber-700', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', title: 'Perhatian' },
    error: { bg: 'bg-red-100', text: 'text-red-600', btn: 'bg-red-600 hover:bg-red-700', icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Error' },
    success: { bg: 'bg-emerald-100', text: 'text-emerald-600', btn: 'bg-emerald-600 hover:bg-emerald-700', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Berhasil' },
  };
  var isDark = document.documentElement.classList.contains('dark');
  var c = colors[type] || colors.warning;
  if (isDark) {
    var darkMap = { 'bg-amber-100': 'bg-[#451a03]', 'bg-red-100': 'bg-[#450a0a]', 'bg-emerald-100': 'bg-[#064e3b]' };
    var textDarkMap = { 'text-amber-600': 'text-amber-300', 'text-red-600': 'text-red-300', 'text-emerald-600': 'text-emerald-300' };
    iconWrap.className = 'w-10 h-10 rounded-full ' + (darkMap[c.bg] || c.bg) + ' flex items-center justify-center shrink-0';
    svgEl.className = 'w-5 h-5 ' + (textDarkMap[c.text] || c.text);
  } else {
    iconWrap.className = 'w-10 h-10 rounded-full ' + c.bg + ' flex items-center justify-center shrink-0';
    svgEl.className = 'w-5 h-5 ' + c.text;
  }
  (svgEl.querySelector('path') || svgEl).setAttribute('d', c.icon);
  titleEl.textContent = c.title;
  msgEl.textContent = msg;
  okBtn.className = 'px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors ' + c.btn;
  okBtn.onclick = function() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  };
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function validateForm(rules) {
  for (var i = 0; i < rules.length; i++) {
    var r = rules[i];
    var el = document.getElementById(r.id);
    if (!el) continue;
    var val = el.value;
    if (r.type === 'select' && !val) {
      showAlert(r.label + ' harus dipilih', 'warning');
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    if (r.type === 'number') {
      if (val === '' || Number(val) === 0) {
        showAlert(r.label + ' harus diisi', 'warning');
        el.focus();
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
      }
      continue;
    }
    if (!val || !val.trim()) {
      showAlert(r.label + ' harus diisi', 'warning');
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
  }
  return true;
}

function showToast(msg, type) {
  var c = document.getElementById('toast-container');
  if (!c) return;
  var colors = { success: 'bg-emerald-600', error: 'bg-red-600', warning: 'bg-amber-500' };
  var el = document.createElement('div');
  el.className = (colors[type] || 'bg-stone-800') + ' text-white px-4 py-2.5 rounded-lg text-sm shadow-lg pointer-events-auto animate-alert-in';
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(function() {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(function() { el.remove(); }, 300);
  }, 3000);
}

function closeModal(id) {
  // Restore modal footer if hidden by wizard
  var saveBtn = document.getElementById('modal-save');
  if (saveBtn) saveBtn.style.display = '';
  var footer = document.querySelector('#modal > div > div.border-t.flex.justify-end:last-child');
  if (footer) footer.style.display = '';
  
  var m = document.getElementById(id || 'modal');
  if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
}
