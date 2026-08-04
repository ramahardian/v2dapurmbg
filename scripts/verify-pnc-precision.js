// Verifikasi presisi export Perencanaan Final (FINAL-PERENCANAAN.xlsx).
// 1. Jalankan kode produksi (route laporan-lanjutan) via Express mini.
// 2. Bandingkan setiap angka Excel vs data JSON endpoint.
// 3. Cek konsistensi internal JSON (kg = berat_kotor x siswa / 1000) + spot-check raw.
require('dotenv').config();
const http = require('http');
const express = require('express');
const ExcelJS = require('exceljs');
const fs = require('fs');
const db = require('../db');
const router = require('../routes/siklus/laporan-lanjutan');
const { resolveGridBeratPerSiswa } = require('../routes/siklus/helpers');
const { hitungBDD } = require('../services/spBddCalculator');

const TENANT = 1;
const TK_JENJANG = ['TK/PAUD', 'SD/MI (1-3)', 'SD/MI (4-6)', 'SMP/MTs, SMA/SMK', 'Bumil/Busui', 'Balita'];

function httpGet(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

// Parse merge string "A3:K3" -> {top,left,bottom,right}
function parseMerge(m) {
  const [a, b] = String(m).split(':');
  const c1 = a.match(/[A-Z]+/)[0]; const r1 = parseInt(a.match(/\d+/)[0], 10);
  const c2 = b.match(/[A-Z]+/)[0]; const r2 = parseInt(b.match(/\d+/)[0], 10);
  const col = s => { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n; };
  return { top: r1, bottom: r2, left: col(c1), right: col(c2) };
}

(async () => {
  const app = express();
  app.use((req, res, next) => { req.user = { tenant_id: TENANT }; next(); });
  app.use(router);
  const server = app.listen(0);
  await new Promise(r => server.on('listening', r));
  const port = server.address().port;

  const jr = await httpGet(port, '/siklus/laporan/perencanaan');
  if (jr.status !== 200) { console.error('JSON FAIL', jr.status, jr.body.toString()); process.exit(1); }
  const data = JSON.parse(jr.body.toString());
  console.log('JSON: jenjang=', JSON.stringify(data.jenjang_list), '| total_porsi=', data.total_porsi, '| hari=', data.hari.length, '| range=', data.tanggal_mulai, '->', data.tanggal_selesai);

  const er = await httpGet(port, '/siklus/laporan/perencanaan/export');
  if (er.status !== 200) { console.error('EXPORT FAIL', er.status, er.body.toString().slice(0, 300)); process.exit(1); }
  console.log('EXPORT: status=', er.status, 'size=', er.body.length);
  const outPath = '/tmp/FINAL-PERENCANAAN-verify.xlsx';
  fs.writeFileSync(outPath, er.body);
  server.close();

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(outPath);
  const ws = wb.getWorksheet('Format Final');
  const cells = [];
  for (let r = 1; r <= ws.actualRowCount; r++) {
    const row = ws.getRow(r);
    const vals = [];
    for (let c = 1; c <= 11; c++) vals.push(row.getCell(c).value);
    cells.push(vals);
  }
  const merges = (ws.model.merges || []).map(parseMerge);
  const labelRows = new Set();
  for (const m of merges) if (m.top === m.bottom && m.left === 1 && m.right === 11) labelRows.add(m.top);

  console.log('\n===== STRUKTUR EXCEL (ringkas) =====');
  for (let i = 0; i < cells.length; i++) {
    const r = i + 1; const a = cells[i][0];
    if (labelRows.has(r)) console.log('R' + r + ' [LABEL] ' + a);
    else if (a === 'TOTAL') console.log('R' + r + ' [TOTAL] ' + cells[i].slice(1, 10).map(v => Number(v) || 0).join(' | '));
    else if (r >= 3 && a != null && String(a).trim() !== '' && String(a) !== 'FORMAT FINAL PERENCANAAN' && a !== 'Bahan Pangan')
      console.log('R' + r + ' [BAHAN] ' + String(a) + ' kg/' + TK_JENJANG.map((_, j) => Number(cells[i][j + 1]) || 0).join(','));
  }

  // ===== Bandingkan Excel vs JSON =====
  console.log('\n===== BANDINGKAN EXCEL vs JSON =====');
  const issues = [];
  let nChecked = 0, maxDiff = 0;
  let rp = 3;
  for (let d = 0; d < data.hari.length; d++) {
    const day = data.hari[d];
    if (!day.bahan || !day.bahan.length) continue;
    if (!labelRows.has(rp)) { issues.push('Hari#' + d + ' tanggal ' + day.tanggal + ': baris ' + rp + ' bukan label'); }
    rp++;
    for (let bi = 0; bi < day.bahan.length; bi++) {
      const b = day.bahan[bi];
      const ev = cells[rp - 1];
      if (!ev) { issues.push('Hari#' + d + ' bahan ' + b.nama_display + ': baris Excel hilang'); rp++; continue; }
      let rowKg = 0;
      for (let jc = 0; jc < TK_JENJANG.length; jc++) {
        const jn = TK_JENJANG[jc];
        const jv = Number((b.per_jenjang || {})[jn]?.kebutuhan_kg || 0);
        const xv = Number(ev[jc + 1]) || 0;
        nChecked++; if (Math.abs(jv - xv) > 0.001) issues.push('  diff kg ' + jn + ' "' + b.nama_display + '": JSON=' + jv + ' Excel=' + xv);
        maxDiff = Math.max(maxDiff, Math.abs(jv - xv));
        rowKg += jv;
      }
      const rowKgR = Math.round(rowKg * 100) / 100;
      const porsiE = Number(ev[7]) || 0;
      const kgE = Number(ev[8]) || 0;
      if (Math.abs(porsiE - Number(data.total_porsi)) > 0.001) issues.push('  porsi "' + b.nama_display + '": expect ' + data.total_porsi + ' got ' + porsiE);
      if (Math.abs(kgE - rowKgR) > 0.001) issues.push('  kg-sum "' + b.nama_display + '": expect ' + rowKgR + ' got ' + kgE);
      const bufferPersen = Number(b.buffer_persen) || 0;
      const bufferKg = Math.round(rowKg * (1 + bufferPersen / 100) * 100) / 100;
      const bufE = Number(ev[9]) || 0;
      if (Math.abs(bufE - bufferKg) > 0.001) issues.push('  buffer "' + b.nama_display + '": expect ' + bufferKg + ' got ' + bufE);
      rp++;
    }
    if (cells[rp - 1] && cells[rp - 1][0] === 'TOTAL') {
      // cek total row vs akumulasi
      const tv = cells[rp - 1];
      let sumB = 0, sumKg = 0, sumBuf = 0;
      for (let jc = 0; jc < TK_JENJANG.length; jc++) {
        let cj = 0;
        for (let bi2 = 0; bi2 < day.bahan.length; bi2++) cj += Number((day.bahan[bi2].per_jenjang || {})[TK_JENJANG[jc]]?.kebutuhan_kg || 0);
        sumB += cj;
        if (Math.abs(Number(tv[jc + 1]) - Math.round(cj * 100) / 100) > 0.001) issues.push('  TOTAL perJenjang ' + TK_JENJANG[jc] + ': expect ' + Math.round(cj * 100) / 100 + ' got ' + tv[jc + 1]);
      }
      for (let bi2 = 0; bi2 < day.bahan.length; bi2++) {
        const b2 = day.bahan[bi2];
        let rk2 = 0; for (const jn of TK_JENJANG) rk2 += Number((b2.per_jenjang || {})[jn]?.kebutuhan_kg || 0);
        rk2 = Math.round(rk2 * 100) / 100;
        sumKg += rk2;
        sumBuf += Math.round(rk2 * (1 + (Number(b2.buffer_persen) || 0) / 100) * 100) / 100;
      }
      if (Math.abs(Number(tv[7]) - Number(data.total_porsi)) > 0.001) issues.push('  TOTAL porsi: expect ' + data.total_porsi + ' got ' + tv[7]);
      if (Math.abs(Number(tv[8]) - Math.round(sumKg * 100) / 100) > 0.001) issues.push('  TOTAL kg: expect ' + Math.round(sumKg * 100) / 100 + ' got ' + tv[8]);
      if (Math.abs(Number(tv[9]) - Math.round(sumBuf * 100) / 100) > 0.001) issues.push('  TOTAL buffer: expect ' + Math.round(sumBuf * 100) / 100 + ' got ' + tv[9]);
      rp++;
    } else {
      issues.push('  Hari#' + d + ': TOTAL row tidak ditemukan di baris ' + rp);
    }
  }
  console.log('nChecked per-jenjang cells:', nChecked, '| maxDiff Excel-vs-JSON:', maxDiff.toFixed(6));
  console.log(issues.length ? 'ISSUES:\n' + issues.join('\n') : '✔ SEMUA cell Excel == JSON (presisi konsisten)');

  // ===== Konsistensi internal JSON: kebutuhan_kg == round(berat_kotor * jumlah_siswa / 1000) =====
  console.log('\n===== KONSISTENSI INTERNAL JSON (kg = berat_kotor x siswa / 1000) =====');
  let bad = 0, checked = 0;
  for (const day of data.hari) {
    for (const b of day.bahan) {
      for (const [jn, pj] of Object.entries(b.per_jenjang || {})) {
        checked++;
        const expect = Math.round((Number(pj.berat_kotor) * Number(pj.jumlah_siswa) / 1000) * 100) / 100;
        if (Math.abs(expect - Number(pj.kebutuhan_kg)) > 0.001) { bad++; console.log('  DIFF', day.tanggal, b.nama_display, jn, 'expect', expect, 'got', pj.kebutuhan_kg); }
      }
    }
  }
  console.log(checked + ' kombinasi dicek, ' + bad + ' berbeda.' + (bad ? '' : ' ✔ konsisten'));

  // ===== Cek konsistensi label tanggal: hari_nama vs weekday tanggal =====
  console.log('\n===== CEK LABEL TANGGAL (hari_nama vs weekday) =====');
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  for (const day of data.hari) {
    const [y, m, dd] = String(day.header_tanggal).split('-').map(Number);
    const wd = dayNames[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()];
    const ok = wd.toLowerCase() === String(day.hari_nama).toLowerCase();
    console.log('  ' + day.tanggal + ' | label="' + day.hari_nama + ', ' + day.header_tanggal + '" | weekday sebenarnya=' + wd + (ok ? ' ✔' : '  <-- TIDAK COCOK (efek timezone tanggal_mulai)'));
  }

  // ===== Spot-check raw: berat_kotor dari bahan baku mentah =====
  console.log('\n===== SPOT-CHECK RAW (berat_kotor/siswa vs bahan_baku master + menu_bahan) =====');
  const d0 = data.hari[0];
  const [siklusList] = await db.query('SELECT * FROM siklus_menu WHERE tenant_id=? AND status="Aktif" ORDER BY id', [TENANT]);
  const siklusIds = siklusList.map(s => s.id);
  const [gridRows] = await db.query(`SELECT sb.*, b.nama, b.satuan, b.berat_1_sp, b.persen_bdd, b.buffer_persen FROM siklus_menu_item_bahan sb JOIN bahan_baku b ON b.id=sb.bahan_baku_id WHERE sb.siklus_id IN (${siklusIds.map(() => '?').join(',')})`, siklusIds);
  const byNamaGrid = {};
  for (const r of gridRows) if (!byNamaGrid[r.nama]) byNamaGrid[r.nama] = r;
  // Bahan yang di-resolve via nama menu (menu_bahan)
  const [itemsAll] = await db.query(`SELECT si.siklus_id, si.menu_nama FROM siklus_menu_item si WHERE si.siklus_id IN (${siklusIds.map(() => '?').join(',')}) AND si.menu_id IS NULL AND si.menu_nama IS NOT NULL`, siklusIds);
  const [menus] = await db.query(`SELECT id, nama FROM menu WHERE tenant_id=?`, [TENANT]);
  const menuIdByName = {};
  for (const m of menus) menuIdByName[m.nama] = m.id;
  const usedMenuIds = [...new Set(itemsAll.map(i => menuIdByName[String(i.menu_nama || '').trim()]).filter(Boolean))];
  const byNamaMenuBahan = {};
  if (usedMenuIds.length) {
    const [mbRows] = await db.query(`SELECT mb.*, b.nama, b.satuan, b.buffer_persen FROM menu_bahan mb JOIN bahan_baku b ON b.id=mb.bahan_baku_id WHERE mb.menu_id IN (${usedMenuIds.map(() => '?').join(',')})`, usedMenuIds);
    for (const r of mbRows) if (!byNamaMenuBahan[r.nama]) byNamaMenuBahan[r.nama] = r;
  }
  let rawOk = 0, rawBad = 0;
  for (const b of d0.bahan) {
    const raw = byNamaGrid[b.nama_display] || byNamaMenuBahan[b.nama_display];
    if (!raw) { console.log('  (lewat) ' + b.nama_display + ': tidak ditemukan di grid/master/menu_bahan'); continue; }
    const resolved = resolveGridBeratPerSiswa(raw, {});
    const bk = hitungBDD(resolved.beratPerSiswa, resolved.persenBdd);
    const firstJn = Object.entries(b.per_jenjang || {})[0];
    if (!firstJn) continue;
    const jn = firstJn[0];
    const jsonBK = Number(firstJn[1].berat_kotor) || 0;
    const ok = Math.abs(bk - jsonBK) < 0.011;
    if (ok) rawOk++; else rawBad++;
    console.log('  ' + b.nama_display + ' | sumber=' + (byNamaGrid[b.nama_display] ? 'grid' : 'menu_bahan') + ' | beratKotor/siswa: hitung=' + bk + ' JSON=' + jsonBK + (ok ? ' ✔' : '  <-- DIFF'));
  }
  console.log('rawOk=' + rawOk + ' rawBad=' + rawBad + (rawBad ? '' : ' ✔'));

  await db.end().catch(() => {});
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
