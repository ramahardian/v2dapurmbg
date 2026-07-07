// ===== Perhitungan Kebutuhan Bahan Pangan per Menu =====
async function renderKebutuhanBahanMenu() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/kebutuhan-bahan-menu', { credentials: 'include' });
    if (!r.ok) throw new Error((await r.json()).error || 'Gagal memuat');
    c.innerHTML = await r.text();
    await loadKbmData();
  } catch (err) {
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat: ${err.message}</div>`;
  }
}

async function loadKbmData() {
  const wrap = document.getElementById('kbm-content');
  wrap.innerHTML = '<div class="flex items-center justify-center py-16"><svg class="animate-spin h-8 w-8 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';

  try {
    const res = await api.get('/siklus/laporan/siklus-menu');
    const { siklus } = res;

    if (!siklus.length) {
      wrap.innerHTML = '<div class="text-center py-16 text-stone-400"><svg class="w-14 h-14 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"/><path d="M12 17v-6"/><circle cx="12" cy="21" r="2"/></svg><div class="text-sm">Tidak ada siklus aktif</div><div class="text-xs mt-1">Aktifkan siklus terlebih dahulu di menu Siklus Menu.</div></div>';
      return;
    }

    let html = '<div class="bg-white border border-stone-200 rounded-lg overflow-hidden">';
    html += '<div class="px-4 py-3 font-bold text-sm border-b border-stone-200 bg-emerald-50 text-emerald-800">PERHITUNGAN KEBUTUHAN BAHAN PANGAN</div>';
    html += renderKbmTable(siklus);
    html += '</div>';
    wrap.innerHTML = html;

  } catch (err) {
    wrap.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal: ${err.message}</div>`;
  }
}

function renderKbmTable(siklus) {
  const allDays = [];
  for (const s of siklus) {
    for (const d of s.days) {
      allDays.push({ ...d, siklus_nama: s.siklus_nama, siklus_id: s.siklus_id, kategori_penerima: s.kategori_penerima });
    }
  }
  allDays.sort((a, b) => a.hari_ke - b.hari_ke);

  if (!allDays.length) return '<div class="p-8 text-center text-stone-400">Belum ada data menu terisi</div>';

  let html = '<div class="overflow-x-auto"><table class="w-full text-xs">';
  let grandTotal = 0;

  for (const d of allDays) {
    const details = d.ingredient_details || [];
    html += `<tr class="bg-emerald-100"><td colspan="6" class="px-4 py-2.5 font-bold text-emerald-800">MENU ${d.hari_ke} — ${d.hari_nama}, ${d.menu_nama}</td></tr>`;

    if (!details.length) {
      html += '<tr><td colspan="6" class="px-4 py-4 text-center text-stone-400">Belum ada data bahan</td></tr>';
    } else {
      html += '<tr class="bg-stone-50 border-b border-stone-200">';
      html += '<th class="px-3 py-2 text-left font-semibold text-stone-600 whitespace-nowrap">Bahan Pangan</th>';
      html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Berat Bersih (gram)</th>';
      html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Persen BDD</th>';
      html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Berat Kotor (gram)</th>';
      html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Jumlah Penerima Manfaat</th>';
      html += '<th class="px-3 py-2 text-right font-semibold text-stone-600 whitespace-nowrap">Kebutuhan Bahan Pangan (kg)</th>';
      html += '</tr>';

      let menuTotal = 0;
      for (const b of details) {
        menuTotal += b.kebutuhan_kg;
        grandTotal += b.kebutuhan_kg;
        html += '<tr class="border-t border-stone-100">';
        html += `<td class="px-3 py-2 text-sm">${b.nama}</td>`;
        html += `<td class="px-3 py-2 text-sm text-right mono">${fmtNum2(b.berat_bersih)}</td>`;
        html += `<td class="px-3 py-2 text-sm text-right mono">${b.persen_bdd}%</td>`;
        html += `<td class="px-3 py-2 text-sm text-right mono">${fmtNum2(b.berat_kotor)}</td>`;
        html += `<td class="px-3 py-2 text-sm text-right mono font-semibold">${fmtNum(d.jumlah_porsi)}</td>`;
        html += `<td class="px-3 py-2 text-sm text-right mono font-semibold">${fmtNum2(b.kebutuhan_kg)}</td>`;
        html += '</tr>';
      }

      html += `<tr class="bg-emerald-50 border-t-2 border-emerald-300 font-semibold">`;
      html += '<td class="px-3 py-2 text-sm font-bold text-emerald-800">Subtotal</td>';
      html += '<td class="px-3 py-2 text-sm text-right" colspan="4"></td>';
      html += `<td class="px-3 py-2 text-sm text-right mono font-bold text-emerald-800">${fmtNum2(menuTotal)}</td>`;
      html += '</tr>';

      html += '<tr><td colspan="6" class="p-1"></td></tr>';
    }
  }

  html += '</table></div>';

  html += `<div class="px-4 py-3 text-right text-sm font-bold text-stone-700 border-t border-stone-200 bg-stone-50">
    Total Kebutuhan Seluruh Menu: <span class="text-emerald-700 mono">${fmtNum2(grandTotal)} kg</span>
  </div>`;

  return html;
}

function fmtNum2(v) {
  if (v == null || isNaN(v)) return '0,00';
  return Number(v).toFixed(2).replace('.', ',');
}
