// ===== Laporan Perhitungan Kebutuhan Pangan =====
async function renderKebutuhanPangan() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/kebutuhan-pangan', { credentials: 'include' });
    if (!r.ok) throw new Error((await r.json()).error || 'Gagal memuat');
    c.innerHTML = await r.text();
    await loadSiklusList();
  } catch (err) {
    c.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat: ${err.message}</div>`;
  }
}

let _kpData = null;

async function loadSiklusList() {
  try {
    const list = await api.get('/siklus');
    const select = document.getElementById('kp-siklus-select');
    if (!select) return;
    select.innerHTML = '<option value="">— Pilih Siklus —</option>' +
      list.map(s => `<option value="${s.id}" data-kat="${s.kategori_penerima || ''}" data-porsi="${s.jumlah_porsi}">${s.nama} (${s.kategori_penerima || 'Semua'} · ${s.jumlah_porsi} porsi/hari)</option>`).join('');
    if (list.length) {
      document.getElementById('kp-info-siklus').textContent = list.length + ' siklus tersedia';
      document.getElementById('kp-info-siklus').classList.remove('hidden');
    }
  } catch (e) {
    showToast('Gagal memuat siklus: ' + e.message, 'error');
  }
}

async function hitungKebutuhanPangan() {
  const siklusId = document.getElementById('kp-siklus-select').value;
  const jumlahSiswa = parseInt(document.getElementById('kp-jumlah-siswa').value) || 0;

  if (!siklusId) return showAlert('Pilih siklus terlebih dahulu', 'warning');
  if (!jumlahSiswa || jumlahSiswa < 1) return showAlert('Masukkan jumlah siswa yang valid', 'warning');

  const btn = document.querySelector('#kp-step-siklus button');
  if (btn) { btn.disabled = true; btn.innerHTML = 'Menghitung...'; }

  try {
    const data = await api.get('/laporan/kebutuhan-pangan/' + siklusId + '?jumlah_siswa=' + jumlahSiswa);
    _kpData = data;
    renderHasil(data);
  } catch (e) {
    showToast('Gagal menghitung: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Hitung'; }
  }
}

function renderHasil(data) {
  const hasil = document.getElementById('kp-hasil');
  hasil.classList.remove('hidden');

  // Ringkasan
  const ringkasan = document.getElementById('kp-ringkasan');
  ringkasan.innerHTML = `
    <div class="bg-white border border-stone-200 rounded-xl p-4">
      <div class="text-xs uppercase tracking-wider text-stone-500 font-medium">Program Makan</div>
      <div class="text-sm font-bold text-stone-800 mt-1">${data.siklus.nama}</div>
      <div class="text-xs text-stone-400 mt-0.5">${data.siklus.kategori_penerima || '-'}</div>
    </div>
    <div class="bg-white border border-stone-200 rounded-xl p-4">
      <div class="text-xs uppercase tracking-wider text-stone-500 font-medium">Jumlah Siswa</div>
      <div class="text-xl font-bold text-stone-800 mt-1">${fmtNum(data.jumlah_siswa)}</div>
      <div class="text-xs text-stone-400 mt-0.5">penerima manfaat</div>
    </div>
    <div class="bg-white border border-stone-200 rounded-xl p-4">
      <div class="text-xs uppercase tracking-wider text-stone-500 font-medium">Total Kebutuhan</div>
      <div class="text-xl font-bold text-emerald-700 mt-1">${data.total_kebutuhan_kg} <span class="text-xs text-stone-400 font-normal">kg</span></div>
      <div class="text-xs text-stone-400 mt-0.5">${data.days.filter(d => d.bahan).length} hari menu</div>
    </div>
    <div class="bg-white border border-stone-200 rounded-xl p-4">
      <div class="text-xs uppercase tracking-wider text-stone-500 font-medium">Jenjang SP</div>
      <div class="text-sm font-bold text-stone-800 mt-1">${data.jenjang || '-'}</div>
      <div class="text-xs text-stone-400 mt-0.5">Standar Satuan Penukar</div>
    </div>
  `;

  // Tabel per Hari
  const tables = document.getElementById('kp-tables');
  let html = '';

  for (const day of data.days) {
    if (!day.menu_nama) {
      html += `<div class="bg-white border border-stone-200 rounded-xl overflow-hidden mb-4">
        <div class="px-5 py-3 font-bold text-sm bg-stone-50 border-b border-stone-200">Hari ${day.hari_ke} — ${day.hari_nama}</div>
        <div class="px-5 py-8 text-center text-stone-400 text-sm">Belum ada menu</div>
      </div>`;
      continue;
    }

    const subTotalKg = (day.bahan || []).reduce((s, b) => s + b.kebutuhan_kg, 0);

    html += `<div class="bg-white border border-stone-200 rounded-xl overflow-hidden mb-4">
      <div class="px-5 py-3 font-bold text-sm bg-emerald-50 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2">
        <span>Hari ${day.hari_ke} — ${day.hari_nama} · ${day.menu_nama}</span>
        <span class="text-xs font-normal text-stone-500">${fmtNum(day.jumlah_porsi)} porsi/hari · Gramasi: <span class="mono font-semibold">${fmt2(day.gramasi_bersih)}</span> g (bersih) / <span class="mono font-semibold">${fmt2(day.gramasi_kotor)}</span> g (kotor) · Subtotal: <span class="mono font-bold text-emerald-700">${fmt2(subTotalKg)} kg</span></span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-stone-50">
            <tr>
              <th class="text-left px-4 py-3 text-xs font-semibold uppercase whitespace-nowrap">Bahan Pangan</th>
              <th class="text-center px-3 py-3 text-xs font-semibold uppercase whitespace-nowrap">Kat. SP</th>
              <th class="text-center px-3 py-3 text-xs font-semibold uppercase whitespace-nowrap">SP</th>
              <th class="text-right px-3 py-3 text-xs font-semibold uppercase whitespace-nowrap">Berat Bersih (g)</th>
              <th class="text-center px-3 py-3 text-xs font-semibold uppercase whitespace-nowrap">BDD</th>
              <th class="text-right px-3 py-3 text-xs font-semibold uppercase whitespace-nowrap">Berat Kotor (g)</th>
              <th class="text-right px-3 py-3 text-xs font-semibold uppercase whitespace-nowrap">Jumlah Siswa</th>
              <th class="text-right px-3 py-3 text-xs font-semibold uppercase whitespace-nowrap">Kebutuhan (kg)</th>
            </tr>
          </thead>
          <tbody>
            ${(day.bahan || []).map(b => `<tr class="border-t border-stone-100 hover:bg-stone-50/50">
              <td class="px-4 py-3 text-sm font-medium whitespace-nowrap">${b.nama}${b.sp_value != null ? ' <span class="text-[10px] text-stone-400">' + b.sp_value + ' SP</span>' : ''}</td>
              <td class="px-3 py-3 text-xs text-center whitespace-nowrap">${b.kategori_sp || '-'}</td>
              <td class="px-3 py-3 text-xs text-center mono whitespace-nowrap">${b.sp_value != null ? b.sp_value : '-'}</td>
              <td class="px-3 py-3 text-sm text-right mono whitespace-nowrap">${fmt2(b.berat_bersih)}</td>
              <td class="px-3 py-3 text-sm text-center mono whitespace-nowrap">${b.persen_bdd}%</td>
              <td class="px-3 py-3 text-sm text-right mono whitespace-nowrap">${fmt2(b.berat_kotor)}</td>
              <td class="px-3 py-3 text-sm text-right mono whitespace-nowrap">${fmtNum(b.jumlah_siswa)}</td>
              <td class="px-3 py-3 text-sm text-right mono font-bold whitespace-nowrap">${fmt2(b.kebutuhan_kg)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr class="bg-stone-100 border-t border-stone-200">
              <td colspan="3" class="px-4 py-2.5 text-xs text-stone-500">Gramasi per Porsi</td>
              <td class="px-3 py-2.5 text-sm text-right mono font-bold text-stone-800">${fmt2(day.gramasi_bersih)} g</td>
              <td class="px-3 py-2.5 text-sm text-center text-stone-500">—</td>
              <td class="px-3 py-2.5 text-sm text-right mono font-bold text-stone-800">${fmt2(day.gramasi_kotor)} g</td>
              <td colspan="2" class="px-3 py-2.5"></td>
            </tr>
            <tr class="bg-amber-50 border-t-2 border-amber-400">
              <td colspan="6" class="px-4 py-3 text-sm font-bold text-right">TOTAL KEBUTUHAN per Menu ${day.menu_nama} × ${fmtNum(data.jumlah_siswa)} Siswa</td>
              <td class="px-3 py-3 text-sm text-right mono font-bold">${fmtNum(data.jumlah_siswa)}</td>
              <td class="px-3 py-3 text-sm text-right mono font-bold">${fmt2(subTotalKg)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;
  }

  // Grand Total
  html += `<div class="bg-emerald-50 border-2 border-emerald-400 rounded-xl overflow-hidden">
    <div class="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
      <div class="font-bold text-sm">GRAND TOTAL KEBUTUHAN BAHAN PANGAN</div>
      <div class="flex items-center gap-4">
        <span class="text-xs text-stone-600">${fmtNum(data.jumlah_siswa)} siswa × ${data.days.filter(d => d.bahan).length} hari menu</span>
        <span class="text-xl font-bold text-emerald-800">${fmt2(data.total_kebutuhan_kg)} <span class="text-sm font-normal text-stone-500">kg</span></span>
      </div>
    </div>
  </div>`;

  tables.innerHTML = html;
}

function exportKebutuhanPanganXlsx() {
  const data = _kpData;
  if (!data) return showAlert('Belum ada data, hitung terlebih dahulu', 'warning');

  const wsData = [];
  const colLabels = ['Program Makan:', data.siklus.nama, '', '', '', '', '', '', ''];
  const colLabels2 = ['Jenjang SP:', data.jenjang || '-', '', '', '', '', '', '', ''];
  const colLabels3 = ['Jumlah Siswa:', String(data.jumlah_siswa), '', '', '', '', '', '', ''];
  const headers = ['Bahan Pangan', 'Kat. SP', 'SP', 'Berat Bersih (g)', 'BDD', 'Berat Kotor (g)', 'Jumlah Siswa', 'Kebutuhan (kg)'];

  wsData.push(colLabels);
  wsData.push(colLabels2);
  wsData.push(colLabels3);
  wsData.push([]);
  wsData.push(headers);

  for (const day of data.days) {
    if (!day.menu_nama) continue;
      wsData.push([`Hari ${day.hari_ke} — ${day.hari_nama} · ${day.menu_nama}  |  Gramasi: ${fmt2(day.gramasi_bersih)}g bersih / ${fmt2(day.gramasi_kotor)}g kotor`, '', '', '', '', '', '', '']);
    for (const b of day.bahan || []) {
      wsData.push([
        b.nama + (b.sp_value != null ? ' ' + b.sp_value + ' SP' : ''),
        b.kategori_sp || '-',
        b.sp_value != null ? String(b.sp_value) : '-',
        fmt2(b.berat_bersih),
        b.persen_bdd + '%',
        fmt2(b.berat_kotor),
        String(b.jumlah_siswa),
        fmt2(b.kebutuhan_kg),
      ]);
    }
    const subKg = (day.bahan || []).reduce((s, b) => s + b.kebutuhan_kg, 0);
    wsData.push(['SUBTOTAL', '', '', '', '', '', '', fmt2(subKg)]);
    wsData.push([]);
  }

  wsData.push([]);
  wsData.push(['GRAND TOTAL', '', '', '', '', '', '', fmt2(data.total_kebutuhan_kg)]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [28, 12, 8, 16, 8, 16, 14, 16].map(w => ({ wch: w }));
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
  ];

  // Style title rows
  for (let r = 0; r < 3; r++) {
    const ref = XLSX.utils.encode_cell({ r, c: 0 });
    if (ws[ref]) ws[ref].s = { font: { bold: true, sz: 12, color: { rgb: '065F46' } } };
  }

  // Style headers
  for (let c = 0; c < 8; c++) {
    const ref = XLSX.utils.encode_cell({ r: 4, c });
    if (ws[ref]) {
      ws[ref].s = {
        font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '065F46' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } },
      };
    }
  }

  let r = 5;
  for (const day of data.days) {
    if (!day.menu_nama) continue;
    // Day header
    const dayRef = XLSX.utils.encode_cell({ r, c: 0 });
    if (ws[dayRef]) ws[dayRef].s = { font: { bold: true, sz: 10, color: { rgb: '065F46' } }, fill: { fgColor: { rgb: 'D1FAE5' } } };
    ws['!merges'].push({ s: { r, c: 0 }, e: { r, c: 7 } });
    r++;
    for (const b of day.bahan || []) {
      for (let c = 0; c < 8; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]) {
          ws[ref].s = {
            alignment: { horizontal: c === 0 ? 'left' : 'right', vertical: 'center' },
            border: c < 7 ? {} : { right: { style: 'thin' } },
          };
        }
      }
      r++;
    }
    // Subtotal
    const subRef = XLSX.utils.encode_cell({ r, c: 0 });
    if (ws[subRef]) ws[subRef].s = { font: { bold: true }, fill: { fgColor: { rgb: 'FEF3C7' } } };
    for (let c = 1; c < 8; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'FEF3C7' } }, alignment: { horizontal: 'right' } };
    }
    r++;
    r++;
  }

  // Grand Total
  const gtRef = XLSX.utils.encode_cell({ r: wsData.length - 1, c: 0 });
  if (ws[gtRef]) ws[gtRef].s = { font: { bold: true, sz: 11, color: { rgb: '065F46' } }, fill: { fgColor: { rgb: 'D1FAE5' } } };
  for (let c = 1; c < 8; c++) {
    const ref = XLSX.utils.encode_cell({ r: wsData.length - 1, c });
    if (ws[ref]) ws[ref].s = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: 'D1FAE5' } }, alignment: { horizontal: 'right' } };
  }

  ws['!pageSetup'] = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  ws['!printGrid'] = true;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Kebutuhan Pangan');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.days.flatMap(d => (d.bahan || []).map(b => ({
      'Program': data.siklus.nama,
      'Hari': `Hari ${d.hari_ke} · ${d.hari_nama}`,
      'Menu': d.menu_nama,
      'Bahan': b.nama,
      'Kategori SP': b.kategori_sp || '',
      'SP': b.sp_value,
      'Berat Bersih (g)': b.berat_bersih,
      'BDD': b.persen_bdd + '%',
      'Berat Kotor (g)': b.berat_kotor,
      'Jumlah Siswa': b.jumlah_siswa,
      'Kebutuhan (kg)': b.kebutuhan_kg,
    }))),
    { header: ['Program', 'Hari', 'Menu', 'Bahan', 'Kategori SP', 'SP', 'Berat Bersih (g)', 'BDD', 'Berat Kotor (g)', 'Jumlah Siswa', 'Kebutuhan (kg)'] }
  ), 'Detail');
  XLSX.writeFile(wb, `kebutuhan-pangan-${data.siklus.nama.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
}

function fmt2(v) {
  return Number(v || 0).toFixed(2);
}