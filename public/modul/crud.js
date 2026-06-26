// ===== Generic CRUD =====
let _crudCfg = null;

async function renderCrud(cfg) {
  _crudCfg = cfg;
  const c = document.getElementById('content');
  c.innerHTML = `<div class="flex flex-wrap justify-between mb-4"><button id="add-btn" class="bg-[#1e40af] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-md text-sm font-medium">+ Tambah</button><button onclick="exportXlsx()" class="border border-stone-300 text-stone-700 hover:bg-stone-50 px-4 py-2 rounded-md text-sm font-medium">Export XLSX</button></div>
    <div id="table-wrap" class="bg-white border border-stone-200 rounded-lg overflow-hidden"></div>`;
  document.getElementById('add-btn').onclick = () => openForm(cfg, null);
  await reloadCrud(cfg);
}

async function reloadCrud(cfg) {
  const rows = await api.get(cfg.endpoint);
  window._crudRows = rows;
  const w = document.getElementById('table-wrap');
  if (!rows.length) { w.innerHTML = '<div class="p-12 text-center text-stone-400"><svg class="w-16 h-16 mx-auto mb-4 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg><div>Belum ada data</div><div class="text-sm mt-1 text-stone-400">Klik "Tambah" untuk mulai.</div></div>'; return; }
  const headers = cfg.cols.map(k => `<th class="text-left px-4 py-3 text-xs font-semibold text-stone-600 uppercase">${cfg.fields.find(f => f.k === k)?.l || k}</th>`).join('');
  const body = rows.map(r => `<tr class="border-t border-stone-100">
    ${cfg.cols.map(k => {
      const f = cfg.fields.find(x => x.k === k);
      const v = r[k];
      let cell = v == null || v === '' ? '-' : v;
      if (f?.fmt === 'idr') cell = `<span class="mono">${fmtIDR(v)}</span>`;
      else if (f?.fmt === 'num') cell = `<span class="mono">${fmtNum(v)}</span>`;
      else if (f?.type === 'date') cell = fmtDate(v);
      return `<td class="px-4 py-3 text-sm">${cell}</td>`;
    }).join('')}
    <td class="px-4 py-3 text-right">
      <button onclick='editRow(${JSON.stringify(cfg).replace(/'/g, "\\'")}, ${JSON.stringify(r).replace(/'/g, "\\'")})' class="text-stone-500 hover:text-stone-900 mr-2" title="Edit"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button onclick='deleteRow("${cfg.endpoint}", ${r.id}, ${JSON.stringify(cfg).replace(/'/g, "\\'")})' class="text-red-600 hover:text-red-800" title="Hapus"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
    </td></tr>`).join('');
  w.innerHTML = `<div class="overflow-x-auto"><table class="w-full"><thead class="bg-stone-50"><tr>${headers}<th class="px-4 py-3 text-right text-xs font-semibold text-stone-600 uppercase">Aksi</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function editRow(cfg, row) { openForm(cfg, row); }
async function deleteRow(endpoint, id, cfg) {
  if (!await showConfirm('Hapus data ini?')) return;
  await api.del(endpoint + '/' + id); reloadCrud(cfg);
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

function openForm(cfg, editing) {
  const title = (editing ? 'Edit ' : 'Tambah ') + MODULES[(location.pathname || '/dashboard').slice(1)].title;
  document.getElementById('modal-title').textContent = title;
  const body = document.getElementById('modal-body');

  const apiSelects = cfg.fields.filter(f => f.type === 'select-api');
  body.innerHTML = cfg.fields.map(f => f.type === 'hidden' ? `<input type="hidden" id="f-${f.k}" value="${editing?.[f.k] || ''}" />`
    : `
    <div class="mb-3"><label class="text-sm text-stone-700">${f.l}${f.req ? ' *' : ''}</label>
    ${f.type === 'select' ? `<select id="f-${f.k}" ${f.readOnly ? 'disabled' : ''} class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md ${f.readOnly ? 'bg-stone-100 text-stone-500' : ''}">
      <option value="">— Pilih —</option>${f.opts.map(o => `<option value="${o}" ${editing?.[f.k] === o ? 'selected' : ''}>${o}</option>`).join('')}
    </select>`
    : f.type === 'select-api' ? `<select id="f-${f.k}" ${f.readOnly ? 'disabled' : ''} class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md ${f.readOnly ? 'bg-stone-100 text-stone-500' : ''}"><option value="">— Memuat data... —</option></select>`
    : f.type === 'textarea' ? `<textarea id="f-${f.k}" rows="2" ${f.readOnly ? 'readonly' : ''} class="mt-1 w-full px-3 py-2 border border-stone-200 rounded-md ${f.readOnly ? 'bg-stone-100 text-stone-500' : ''}">${editing?.[f.k] || ''}</textarea>`
    : `<input id="f-${f.k}" type="${f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}" value="${editing?.[f.k] != null ? (f.type === 'date' ? String(editing[f.k]).slice(0,10) : editing[f.k]) : ''}" ${f.readOnly ? 'readonly' : ''} class="mt-1 w-full h-10 px-3 border border-stone-200 rounded-md ${f.type === 'number' ? 'mono' : ''} ${f.readOnly ? 'bg-stone-100 text-stone-500' : ''}" />`}
    </div>`).join('');

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

  document.getElementById('modal-save').onclick = async () => {
    // Validasi required fields
    var rules = cfg.fields.filter(function(f) { return f.req; }).map(function(f) {
      return { id: 'f-' + f.k, label: f.l, type: (f.type === 'select' || f.type === 'select-api') ? 'select' : (f.type === 'number' ? 'number' : 'text') };
    });
    if (!validateForm(rules)) return;
    const payload = {};
    cfg.fields.forEach(f => { const v = document.getElementById('f-' + f.k).value; payload[f.k] = f.type === 'number' ? Number(v) || 0 : v; });
    if (editing) await api.put(cfg.endpoint + '/' + editing.id, payload);
    else await api.post(cfg.endpoint, payload);
    closeModal(); reloadCrud(cfg);
  };
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}
function showConfirm(msg) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-message').textContent = msg;
    document.getElementById('confirm-ok').onclick = () => {
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
