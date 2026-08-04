// Diagnosa kewajaran angka kebutuhan per hari di /perencanaan.
// Cek: jumlah siswa aktual vs jumlah_porsi siklus (faktor skala sync),
// rata-rata gram/siswa/hari, dan apakah ada bahan dengan berat tak wajar.
require('dotenv').config();
const http = require('http');
const express = require('express');
const db = require('../db');
const router = require('../routes/siklus/laporan-lanjutan');
const { buildDbToDisplay } = require('../routes/siklus/helpers');

const TENANT = 1;

function httpGet(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

(async () => {
  const app = express();
  app.use((req, res, next) => { req.user = { tenant_id: TENANT }; next(); });
  app.use(router);
  const server = app.listen(0);
  await new Promise(r => server.on('listening', r));
  const port = server.address().port;

  const jr = await httpGet(port, '/siklus/laporan/perencanaan');
  const data = JSON.parse(jr.body.toString());
  server.close();

  console.log('===== SUMBER DAYA =====');
  // PM aktual dari penerima_manfaat
  const [pmRows] = await db.query('SELECT COALESCE(kategori_penerima,"Lainnya") jenjang, SUM(paket_besar+paket_kecil) total FROM penerima_manfaat WHERE tenant_id=? GROUP BY kategori_penerima', [TENANT]);
  const dbToDisplay = buildDbToDisplay();
  const pmActual = {};
  for (const p of pmRows) { const d = dbToDisplay[p.jenjang] || p.jenjang; pmActual[d] = (pmActual[d] || 0) + Number(p.total); }
  console.log('PM aktual per jenjang (penerima_manfaat):', pmActual);

  const [siklus] = await db.query('SELECT id, nama, jumlah_porsi, kategori_penerima, total_hari, status FROM siklus_menu WHERE tenant_id=? AND status="Aktif"', [TENANT]);
  console.log('\nSiklus aktif:');
  for (const s of siklus) console.log(`  #${s.id} "${s.nama}" jumlah_porsi=${s.jumlah_porsi} total_hari=${s.total_hari} kategori=${s.kategori_penerima}`);

  const pmTotal = Object.values(pmActual).reduce((a, b) => a + b, 0);
  const storedTotal = siklus.reduce((a, s) => a + (Number(s.jumlah_porsi) || 0), 0);
  console.log('\nPM aktual total:', pmTotal, '| jumlah_porsi siklus total:', storedTotal);
  if (storedTotal > 0 && pmTotal > 0) {
    const factor = storedTotal / pmTotal;
    console.log(`⚠ Faktor skala sync = jumlah_porsi/PM = ${factor.toFixed(3)}  (${factor > 1 ? 'MENGGELEMBUNGKAN angka ' + ((factor - 1) * 100).toFixed(0) + '%' : factor < 1 ? 'menyusutkan' : 'netral'})`);
  }

  console.log('\n===== PER HARI (dari JSON endpoint) =====');
  let grandAll = 0;
  for (const day of data.hari) {
    if (!day.bahan || !day.bahan.length) continue;
    let totKg = 0, totPorsi = 0;
    const gramsPerStudentList = [];
    for (const b of day.bahan) {
      let rk = 0;
      for (const [jn, pj] of Object.entries(b.per_jenjang || {})) rk += Number(pj.kebutuhan_kg) || 0;
      totKg += rk;
      // gram per siswa dari bahan ini (ambil jenjang pertama yang punya berat)
      const first = Object.values(b.per_jenjang || {})[0];
      if (first && first.berat_kotor) gramsPerStudentList.push({ nama: b.nama_display, gram: Number(first.berat_kotor) });
    }
    totPorsi = Number(data.total_porsi) || 0;
    grandAll += totKg;
    console.log(`  ${day.tanggal} (${day.hari_nama})  ${day.bahan.length} bahan  TOTAL ${totKg.toFixed(2)} kg  untuk ${totPorsi} porsi  -> rata-rata ${(totKg * 1000 / (totPorsi || 1)).toFixed(0)} g/siswa/hari`);
    if (day.tanggal === data.hari[0].tanggal) {
      console.log('  Rincian g/siswa (berat kotor per siswa):');
      for (const g of gramsPerStudentList) console.log(`    ${g.nama}: ${g.gram} g/siswa`);
    }
  }
  const daysWithData = data.hari.filter(d => d.bahan && d.bahan.length).length;
  console.log(`\nTotal seluruh hari: ${grandAll.toFixed(2)} kg dalam ${daysWithData} hari -> rata-rata ${(grandAll / Math.max(daysWithData, 1)).toFixed(0)} kg/hari`);

  // Cek bahan dengan berat_1_sp mencurigakan
  const [bahan] = await db.query('SELECT nama, berat_1_sp, persen_bdd, satuan FROM bahan_baku WHERE tenant_id=? AND (berat_1_sp > 200 OR berat_1_sp < 0) ORDER BY berat_1_sp DESC', [TENANT]);
  if (bahan.length) {
    console.log('\n⚠ Bahan dengan berat_1_sp > 200 g (berpotensi terlalu besar):');
    for (const b of bahan) console.log(`  ${b.nama}: berat_1_sp=${b.berat_1_sp} g, bdd=${b.persen_bdd}%, satuan=${b.satuan}`);
  } else {
    console.log('\nTidak ada bahan dengan berat_1_sp > 200 g.');
  }

  await db.end().catch(() => {});
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
