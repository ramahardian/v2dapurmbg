// ===== Generic CRUD =====
let _crudCfg = null;
let _crudState = { page: 1, limit: 25, search: '', total: 0, totalPages: 1 };

async function renderCrud(cfg) {
  _crudCfg = cfg;
  _crudState = { page: 1, limit: 25, search: '', total: 0, totalPages: 1 };
  const c = document.getElementById('content');
  c.innerHTML = `<div id="crud-stats" class="${cfg.stats ? '' : 'hidden'}">
    <div id="crud-stats-content" class="flex flex-wrap gap-3 mb-4"></div>
  </div>
  <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
    <div class="flex items-center gap-2">
      <button id="add-btn" class="h-11 px-5 bg-[#1e40af] hover:bg-[#1d4ed8] text-white rounded-xl text-sm font-semibold shadow-sm transition-all flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Tambah
      </button>
      <button id="crud-delete-selected" onclick="deleteSelectedCrud()" class="hidden h-10 px-4 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl items-center gap-1.5 shadow-sm transition-all">
        Hapus Terpilih <span id="crud-selected-count" class="font-bold">0</span>
      </button>
      ${cfg.helpContent ? `<button onclick="showCrudInfo()" class="w-9 h-9 flex items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-400 hover:text-stone-600 hover:bg-stone-50 shadow-sm transition-all" title="Info halaman ini">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
      </button>` : ''}
    </div>
    <div class="flex items-center gap-2">
      <div class="relative">
        <input id="crud-search" placeholder="Cari..." class="w-56 h-11 pl-10 pr-4 rounded-xl border border-stone-200 bg-white text-sm shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
        <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
      </div>
      ${cfg.sync ? `<button id="sync-btn" onclick="syncCrudData()" class="h-11 px-4 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-xl text-sm font-medium shadow-sm transition-all">${cfg.sync.label}</button>` : ''}
      ${cfg.extraButtons ? cfg.extraButtons.map(b => `<button onclick="${b.onclick}" class="h-11 px-4 border border-stone-200 text-stone-700 hover:bg-stone-50 rounded-xl text-sm font-medium shadow-sm transition-all">${b.label}</button>`).join('') : ''}
      <button onclick="exportXlsx()" class="h-11 px-4 border border-stone-200 text-stone-700 hover:bg-stone-50 rounded-xl text-sm font-medium shadow-sm transition-all">Export XLSX</button>
    </div>
  </div>
  <div id="table-wrap" class="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden"></div>
  <div id="crud-pagination" class="flex items-center justify-between mt-3"></div>`;
  window._crudInfoCfg = cfg;
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

  // Load stats jika dikonfigurasi
  if (cfg.stats) {
    (async () => {
      try {
        const statsRes = await api.get(cfg.stats.endpoint);
        const totalVal = Number(statsRes.total) || 0;
        const contentEl = document.getElementById('crud-stats-content');
        if (contentEl) {
          var cards = '';
          var fmt = cfg.stats.format === 'num' ? fmtNum(totalVal) : totalVal;
          cards += '<div class="flex-1 min-w-[140px] bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200/60 px-4 py-3 shadow-sm"><div class="text-[10px] font-semibold uppercase tracking-wider text-blue-700 mb-0.5">' + cfg.stats.label + '</div><div class="text-xl font-bold text-blue-800">' + fmt + '</div></div>';
          if (cfg.stats.extra && rows.length) {
            var sums = {};
            cfg.stats.extra.forEach(function(x) { sums[x.field] = 0; });
            rows.forEach(function(r) {
              cfg.stats.extra.forEach(function(x) { sums[x.field] += Number(r[x.field]) || 0; });
            });
            cfg.stats.extra.forEach(function(x) {
              var c = x.color || 'blue';
              cards += '<div class="flex-1 min-w-[140px] bg-gradient-to-br from-' + c + '-50 to-' + c + '-100/60 rounded-2xl border border-' + c + '-200/60 px-4 py-3 shadow-sm"><div class="text-[10px] font-semibold uppercase tracking-wider text-' + c + '-700 mb-0.5">' + x.label + '</div><div class="text-xl font-bold text-' + c + '-800">' + fmtNum(sums[x.field]) + '</div></div>';
            });
          }
          contentEl.innerHTML = cards;
        }
      } catch (e) {
        console.warn('Gagal load stats:', e.message);
      }
    })();
  }

  const w = document.getElementById('table-wrap');
  if (!rows.length) {
    w.innerHTML = '<div class="py-16 text-center text-stone-400"><svg class="w-12 h-12 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg><div class="text-sm">Belum ada data</div><div class="text-xs text-stone-400 mt-1">Klik "Tambah" untuk mulai.</div></div>';
    document.getElementById('crud-pagination').innerHTML = '';
    return;
  }

  const headers = cfg.cols.map(k => `<th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">${cfg.fields.find(f => f.k === k)?.l || k}</th>`).join('');
  const body = rows.map(r => `<tr class="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
    <td class="px-4 py-3">
      <input type="checkbox" value="${r.id}" onchange="updateSelectedCrudCount()" class="crud-checkbox cb-modern">
    </td>
    ${cfg.cols.map(k => {
      const f = cfg.fields.find(x => x.k === k);
      const v = r[k];
      let cell = v == null || v === '' ? '-' : v;
      if (f?.fmt === 'idr') cell = `<span class="mono">${fmtIDR(v)}</span>`;
      else if (f?.fmt === 'num') cell = `<span class="mono">${f.decimals != null ? Number(v).toFixed(f.decimals) : fmtNum(v)}</span>`;
      else if (f?.fmt === 'pct') cell = `<span class="mono">${Math.round(v * 100)}</span>%`;
      else if (f?.type === 'date') cell = fmtDate(v);
      return `<td class="px-4 py-3 text-xs text-stone-600">${cell}</td>`;
    }).join('')}
    <td class="px-4 py-3 text-right whitespace-nowrap">
      <button onclick='editRow(${JSON.stringify(cfg).replace(/'/g, "&#39;")}, ${JSON.stringify(r).replace(/'/g, "&#39;")})' class="w-7 h-7 inline-flex items-center justify-center rounded-lg text-stone-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button onclick='deleteRow("${cfg.endpoint}", ${r.id}, ${JSON.stringify(cfg).replace(/'/g, "&#39;")})' class="w-7 h-7 inline-flex items-center justify-center rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-all" title="Hapus"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
    </td></tr>`).join('');
  w.innerHTML = `<div class="overflow-x-auto"><table class="w-full"><thead><tr class="border-b border-stone-100">
    <th class="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-500 w-10">
      <input type="checkbox" id="crud-select-all" onchange="toggleSelectAllCrud(this)" class="cb-modern">
    </th>
    ${headers}<th class="px-4 py-3.5 text-right text-[10px] font-bold uppercase tracking-wider text-stone-500">Aksi</th></tr></thead><tbody>${body}</tbody></table></div>`;

  renderCrudPagination();
}

function renderCrudPagination() {
  const wrap = document.getElementById('crud-pagination');
  const { page, totalPages, total } = _crudState;
  if (totalPages <= 1) { wrap.innerHTML = total > 0 ? `<span class="text-sm text-stone-400">${total} data</span>` : ''; return; }
  const prev = page > 1 ? `<button onclick="crudGoToPage(${page - 1})" class="px-3 py-1.5 text-sm font-medium rounded-lg border border-stone-200 hover:bg-stone-50 hover:border-stone-300 transition-all">Prev</button>` : '';
  const next = page < totalPages ? `<button onclick="crudGoToPage(${page + 1})" class="px-3 py-1.5 text-sm font-medium rounded-lg border border-stone-200 hover:bg-stone-50 hover:border-stone-300 transition-all">Next</button>` : '';
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

function toggleSelectAllCrud(master) {
  document.querySelectorAll('.crud-checkbox').forEach(cb => cb.checked = master.checked);
  updateSelectedCrudCount();
}
function updateSelectedCrudCount() {
  var checked = document.querySelectorAll('.crud-checkbox:checked').length;
  var btn = document.getElementById('crud-delete-selected');
  var countEl = document.getElementById('crud-selected-count');
  if (!btn || !countEl) return;
  if (checked > 0) {
    btn.classList.remove('hidden');
    btn.classList.add('inline-flex');
    countEl.textContent = checked;
  } else {
    btn.classList.add('hidden');
    btn.classList.remove('inline-flex');
  }
}
async function deleteSelectedCrud() {
  var cfg = _crudCfg;
  if (!cfg) return;
  var checked = document.querySelectorAll('.crud-checkbox:checked');
  var ids = Array.from(checked).map(cb => parseInt(cb.value)).filter(id => !isNaN(id));
  if (!ids.length) return showAlert('Pilih data yang akan dihapus', 'warning');
  if (!await showConfirm('Hapus ' + ids.length + ' data terpilih?')) return;
  try {
    await api.post(cfg.endpoint + '/bulk-delete', { ids });
    showToast(ids.length + ' data berhasil dihapus', 'success');
    reloadCrud(cfg);
  } catch (e) {
    showToast('Gagal menghapus: ' + (e.message || 'Unknown error'), 'error');
  }
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
  let actionHtml = '';
  if (f.action) {
      actionHtml = `<button type="button" onclick='${f.action.onclick}' class="text-[10px] border border-blue-300 text-blue-700 hover:bg-blue-50 px-2 py-1 rounded-lg flex items-center gap-1 font-semibold"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>${f.action.label}</button>`;
  }
  let input;
  if (f.type === 'select') {
    input = `<select id="f-${f.k}" ${ro ? 'disabled' : ''} class="mt-1.5 w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all ${roCls}">
      <option value="">— Pilih —</option>${f.opts.map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('')}
    </select>`;
  } else if (f.type === 'select-api') {
    input = `<select id="f-${f.k}" ${ro ? 'disabled' : ''} class="mt-1.5 w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all ${roCls}"><option value="">— Memuat data... —</option></select>`;
  } else if (f.type === 'textarea') {
    input = `<textarea id="f-${f.k}" rows="2" ${ro ? 'readonly' : ''} class="mt-1.5 w-full px-3 py-2.5 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all ${roCls}">${val || ''}</textarea>`;
  } else {
    const itype = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text';
    let ival = val != null ? (f.type === 'date' ? String(val).slice(0,10) : val) : '';
    if (f.fmt === 'pct' && val != null) ival = Math.round(val * 100);
    if (f.fmt === 'num' && f.decimals != null && val != null) ival = Number(val).toFixed(f.decimals);
    input = `<input id="f-${f.k}" type="${itype}" value="${ival}" ${ro ? 'readonly' : ''} class="mt-1.5 w-full h-11 px-3 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all ${f.type === 'number' ? 'mono' : ''} ${roCls}" />`;
  }
  const label = `<label class="text-xs font-semibold text-stone-600 uppercase tracking-wider">${f.l}${f.req ? ' <span class="text-red-500">*</span>' : ''}</label>`;
  const header = f.action ? `<div class="flex items-center justify-between">${label}${actionHtml}</div>` : label;
  return `<div class="${f.type === 'hidden' ? '' : 'mb-4'}">${header}${input}</div>`;
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
      html += `<div class="mb-5">
        <h4 class="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3 pb-2 border-b border-stone-200">${g.label}</h4>
        <div class="grid grid-cols-1 ${g.cols === 2 ? 'md:grid-cols-2' : ''} gap-x-4 gap-y-1">`;
      gFields.forEach(f => { html += renderField(f, editing); });
      html += `</div></div>`;
    });
    cfg.fields.filter(f => f.type === 'hidden').forEach(f => { html += renderField(f, editing); });
    body.innerHTML = html;
  } else {
    body.innerHTML = cfg.fields.map(f => renderField(f, editing)).join('');
  }

  // AI button for nutrition fields (sp-referensi) — disabled temporarily
  // var aiFields = cfg.fields.filter(function(f) { return f.ai; });
  // if (aiFields.length) {
  //   var aiBtn = document.createElement('div');
  //   aiBtn.className = 'flex items-center justify-between pt-2';
  //   aiBtn.innerHTML = '<div class="text-xs text-stone-400">Isi gizi dengan AI berdasarkan nama bahan</div>' +
  //     '<button type="button" onclick="fillAiNutrisiSp()" class="px-4 py-2 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100">Isi AI</button>';
  //   body.appendChild(aiBtn);
  //   window._aiFields = aiFields;
  // }

  apiSelects.forEach(f => {
    const sel = document.getElementById('f-' + f.k);
    api.get(f.source).then(rows => {
      const list = Array.isArray(rows) ? rows : (rows.data || []);
      sel.innerHTML = '<option value="">— Pilih ' + f.l + ' —</option>' +
        list.map(r => {
          var label = r[f.labelField || 'nama'];
          if (f.labelFormat) label = f.labelFormat.replace(/\{(\w+)\}/g, function(_, k) { return r[k] != null ? r[k] : ''; });
          return `<option value="${r[f.valueField || 'id']}" data-item='${encodeURIComponent(JSON.stringify(r))}' ${editing?.[f.k] == r[f.valueField || 'id'] ? 'selected' : ''}>${label}</option>`;
        }).join('');
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
      let val = v;
      if (f.type === 'number') {
        var _ns = String(v).trim();
        val = _ns.includes(',') ? Number(_ns.replace(/\./g, '').replace(',', '.')) : Number(_ns);
        if (isNaN(val)) val = 0;
      }
      if (f.fmt === 'pct') val = val / 100;
      payload[f.k] = val;
    });
    if (editing) await api.put(cfg.endpoint + '/' + editing.id, payload);
    else await api.post(cfg.endpoint, payload);
    closeModal();
    if (cfg.onSaved) cfg.onSaved();
    else reloadCrud(cfg);
  };
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
}
window.fillAiNutrisiSp = async function() {
  var namaEl = document.getElementById('f-nama');
  if (!namaEl || !namaEl.value.trim()) {
    showAlert('Isi Nama Bahan terlebih dahulu', 'warning');
    return;
  }
  var btn = document.querySelector('button[onclick="fillAiNutrisiSp()"]');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    var res = await api.post('/ai/suggest-nutrisi', { nama: namaEl.value.trim() });
    var mapping = { energi: 'kalori', protein: 'protein', lemak: 'lemak', karbohidrat: 'karbohidrat', serat: 'serat' };
    (window._aiFields || []).forEach(function(f) {
      var el = document.getElementById('f-' + f.k);
      var srcKey = mapping[f.k];
      if (el && res[srcKey] != null) el.value = Number(res[srcKey]).toFixed(f.decimals != null ? f.decimals : 1);
    });
    showToast('Gizi terisi dari AI', 'success');
  } catch (e) {
    showAlert('Gagal: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Isi AI'; }
  }
};

function showConfirm(msg, okLabel, cancelLabel, okStyle, type) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const content = document.getElementById('confirm-content');
    const backdrop = modal.querySelector('.modal-backdrop');
    const iconWrap = document.getElementById('confirm-icon');
    const iconSvg = document.getElementById('confirm-icon-svg');
    const titleEl = document.getElementById('confirm-title');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');

    const types = {
      warning: { bg: 'bg-amber-100', text: 'text-amber-600', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', title: 'Perhatian', btn: 'bg-amber-600 hover:bg-amber-700' },
      danger: { bg: 'bg-red-100', text: 'text-red-600', icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Konfirmasi Hapus', btn: 'bg-red-600 hover:bg-red-700' },
      info: { bg: 'bg-blue-100', text: 'text-blue-600', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Informasi', btn: 'bg-blue-600 hover:bg-blue-700' },
      success: { bg: 'bg-emerald-100', text: 'text-emerald-600', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Konfirmasi', btn: 'bg-emerald-600 hover:bg-emerald-700' },
      question: { bg: 'bg-purple-100', text: 'text-purple-600', icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Konfirmasi', btn: 'bg-purple-600 hover:bg-purple-700' },
    };
    const t = types[type] || types.question;
    const isDark = document.documentElement.classList.contains('dark');
    const darkBg = { 'bg-amber-100': 'bg-[#451a03]', 'bg-red-100': 'bg-[#450a0a]', 'bg-blue-100': 'bg-[#1e3a5f]', 'bg-emerald-100': 'bg-[#064e3b]', 'bg-purple-100': 'bg-[#3b0764]' };
    const darkText = { 'text-amber-600': 'text-amber-300', 'text-red-600': 'text-red-300', 'text-blue-600': 'text-blue-300', 'text-emerald-600': 'text-emerald-300', 'text-purple-600': 'text-purple-300' };

    const open = () => {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      requestAnimationFrame(() => {
        backdrop.classList.remove('opacity-0');
        content.classList.remove('opacity-0', 'scale-95');
        content.classList.add('opacity-100', 'scale-100');
      });
      okBtn.focus();
      document.body.style.overflow = 'hidden';
    };

    const close = (result) => {
      backdrop.classList.add('opacity-0');
      content.classList.add('opacity-0', 'scale-95');
      content.classList.remove('opacity-100', 'scale-100');
      setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = '';
        resolve(result);
      }, 200);
    };

    const handleKeydown = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Tab') {
        const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.getElementById('confirm-message').textContent = msg;
    okBtn.textContent = okLabel || 'Hapus';
    cancelBtn.textContent = cancelLabel || 'Batal';

    if (okStyle) {
      okBtn.className = 'px-4 py-2 text-sm font-medium text-white rounded-lg transition-all duration-150 focus:ring-2 focus:ring-offset-2 ' + okStyle;
    } else {
      okBtn.className = 'px-4 py-2 text-sm font-medium text-white rounded-lg transition-all duration-150 focus:ring-2 focus:ring-offset-2 ' + (isDark ? t.btn.replace('hover:', 'hover:') : t.btn);
    }

    iconWrap.className = 'w-10 h-10 rounded-full flex items-center justify-center shrink-0 ' + (isDark ? darkBg[t.bg] : t.bg);
    iconSvg.className = 'w-5 h-5 ' + (isDark ? darkText[t.text] : t.text);
    iconSvg.querySelector('path').setAttribute('d', t.icon);
    titleEl.textContent = t.title;

    const cancelHandler = () => { modal.removeEventListener('keydown', handleKeydown); backdrop.removeEventListener('click', cancelHandler); close(false); };
    const okHandler = () => { modal.removeEventListener('keydown', handleKeydown); backdrop.removeEventListener('click', cancelHandler); close(true); };

    cancelBtn.onclick = cancelHandler;
    okBtn.onclick = okHandler;
    backdrop.onclick = cancelHandler;
    modal.addEventListener('keydown', handleKeydown);

    open();
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

function showCrudInfo() {
  var cfg = window._crudInfoCfg;
  if (!cfg || !cfg.helpContent) return;
  var existing = document.getElementById('crud-info-popup');
  if (existing) { existing.remove(); return; }
  var hc = cfg.helpContent;
  var div = document.createElement('div');
  div.id = 'crud-info-popup';
  div.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-black/30';
  div.innerHTML = '<div class="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6" onclick="event.stopPropagation()">' +
    '<div class="flex items-center justify-between mb-4">' +
      '<div class="flex items-center gap-3">' +
        '<div class="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">' + (cfg.icon || '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>') + '</div>' +
        '<div><h3 class="font-bold text-stone-700">' + (cfg.title || 'Halaman Ini') + '</h3><p class="text-xs text-stone-400">' + (cfg.subtitle || '') + '</p></div>' +
      '</div>' +
      '<button onclick="document.getElementById(\'crud-info-popup\').remove()" class="text-stone-400 hover:text-stone-600"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
    '</div>' +
    '<div class="space-y-4 text-sm text-stone-600">' +
      hc.map(function(item, idx) {
        return '<div class="flex gap-3 items-start">' +
          '<span class="shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">' + (idx + 1) + '</span>' +
          '<div><span class="font-semibold text-stone-700">' + item.title + '</span><br>' + item.text + '</div>' +
        '</div>';
      }).join('') +
    '</div>' +
    '<div class="mt-4 pt-3 border-t border-stone-100 flex justify-end">' +
      '<button onclick="document.getElementById(\'crud-info-popup\').remove()" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">Mengerti</button>' +
    '</div>' +
  '</div>';
  div.onclick = function() { div.remove(); };
  document.body.appendChild(div);
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

// Recalculate budget realisasi from actual transactions
async function recalculateRealisasi() {
  if (!await showConfirm('Hitung ulang realisasi budget dari transaksi kas bank?', 'Ya, Hitung')) return;
  try {
    const r = await api.post('/budget/recalculate-realisasi');
    showAlert(`Berhasil: ${r.updated} budget diupdate dari ${r.total_periode} periode`, 'success');
    if (typeof reloadCrud === 'function' && _crudCfg) reloadCrud(_crudCfg);
  } catch (e) {
    showAlert('Gagal: ' + e.message, 'error');
  }
}

// Backfill journal entries for existing paid PO & Payroll
async function backfillJournal() {
  if (!await showConfirm('Buat entry kas_bank untuk PO & Payroll yang sudah Dibayar sebelumnya?', 'Ya, Backfill')) return;
  try {
    const r = await api.post('/keuangan/backfill-journal');
    showAlert(`Berhasil: ${r.created} entry kas_bank dibuat`, 'success');
  } catch (e) {
    showAlert('Gagal: ' + e.message, 'error');
  }
}

// Tanya AI — generate teks dari field lain (misal nama) → isi textarea
window.tanyaAi = async function(fieldId, sourceField) {
  var nameEl = sourceField ? document.getElementById('f-' + sourceField) : null;
  var name = nameEl ? nameEl.value.trim() : '';
  var q;
  if (name) {
    q = 'Inti "' + name + '" dapur MBG:';
  } else {
    q = prompt('Apa yang ingin Anda tanyakan?');
    if (!q) return;
  }
  var textarea = document.getElementById('f-' + fieldId);
  if (!textarea) return;
  textarea.value = 'Menulis...';
  try {
    var resp = await api.post('/ai/tanya', { prompt: q });
    textarea.value = resp.text || '';
  } catch (e) {
    textarea.value = 'Error: ' + (e.message || 'Gagal');
  }
};
