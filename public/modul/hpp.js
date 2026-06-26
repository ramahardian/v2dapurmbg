// ===== HPP =====
async function renderHPP() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/hpp', { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Gagal memuat HPP');
    }
    c.innerHTML = await r.text();
  } catch (err) {
    console.error('HPP error:', err);
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat HPP: ${err.message}</div>`;
  }
}
async function calcHPP() {
  const menu_id = +document.getElementById('hpp-menu').value;
  if (!menu_id) return showAlert('Pilih menu dulu', 'warning');
  const data = await api.post('/hpp/calculate', {
    menu_id, jumlah_porsi: +document.getElementById('hpp-porsi').value,
    biaya_tenaga_kerja: +document.getElementById('hpp-tk').value, biaya_overhead: +document.getElementById('hpp-oh').value,
  });
  document.getElementById('hpp-result').innerHTML = `
    <div class="bg-white border border-stone-200 rounded-lg p-6 mb-4">
      <div class="flex justify-between items-baseline mb-4">
        <div><div class="text-xs uppercase text-stone-500">HPP per Porsi</div>
          <div class="mono text-3xl font-bold text-[#1e40af] mt-1">${fmtIDR(data.hpp_per_porsi)}</div></div>
        <div class="text-right"><div class="text-xs text-stone-500">${data.menu_nama}</div><div class="text-sm">${data.jumlah_porsi} porsi</div></div>
      </div>
      <div class="grid grid-cols-3 gap-3 border-t border-stone-200 pt-3">
        <div><div class="text-xs text-stone-500">Bahan Baku</div><div class="mono font-semibold">${fmtIDR(data.total_biaya_bahan)}</div></div>
        <div><div class="text-xs text-stone-500">Tenaga Kerja</div><div class="mono font-semibold">${fmtIDR(data.biaya_tenaga_kerja)}</div></div>
        <div><div class="text-xs text-stone-500">Overhead</div><div class="mono font-semibold">${fmtIDR(data.biaya_overhead)}</div></div>
      </div>
      <div class="border-t border-stone-200 pt-3 mt-3 flex justify-between">
        <div class="text-sm text-stone-600">Total HPP</div><div class="mono font-bold">${fmtIDR(data.total_hpp)}</div>
      </div>
    </div>
    <div class="bg-white border border-stone-200 rounded-lg overflow-hidden">
      <div class="px-4 py-3 font-bold border-b border-stone-200">Rincian Bahan</div>
      <div class="overflow-x-auto"><table class="w-full"><thead class="bg-stone-50"><tr>
        <th class="text-left px-4 py-2 text-xs uppercase whitespace-nowrap">Bahan</th>
        <th class="text-right px-4 py-2 text-xs uppercase whitespace-nowrap">Jumlah</th>
        <th class="text-right px-4 py-2 text-xs uppercase whitespace-nowrap">Harga</th>
        <th class="text-right px-4 py-2 text-xs uppercase whitespace-nowrap">Subtotal</th>
      </tr></thead><tbody>${data.detail_bahan.map(d => `<tr class="border-t border-stone-100">
        <td class="px-4 py-2 text-sm whitespace-nowrap">${d.nama}</td>
        <td class="px-4 py-2 text-sm text-right mono whitespace-nowrap">${d.jumlah} ${d.satuan}</td>
        <td class="px-4 py-2 text-sm text-right mono whitespace-nowrap">${fmtIDR(d.harga_satuan)}</td>
        <td class="px-4 py-2 text-sm text-right mono whitespace-nowrap">${fmtIDR(d.subtotal)}</td>
      </tr>`).join('') || '<tr><td colspan="4" class="text-center py-6 text-stone-400"><svg class="w-12 h-12 mx-auto mb-2 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><div>Menu belum punya bahan</div></td></tr>'}
      </tbody></table></div>
    </div>`;
}

