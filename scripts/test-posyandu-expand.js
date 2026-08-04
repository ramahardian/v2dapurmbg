// Uji ekspansi Posyandu -> Bumil/Busui + Balita pada /siklus/laporan/perencanaan.
// Mengubah kategori_penerima siklus sementara, lalu dikembalikan.
require('dotenv').config();
const http = require('http');
const express = require('express');
const db = require('../db');
const router = require('../routes/siklus/laporan-lanjutan');

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

  const [[s47]] = await db.query('SELECT id, kategori_penerima FROM siklus_menu WHERE id=47');
  const original = s47.kategori_penerima;
  console.log('Kategori asli siklus #47:', original);

  try {
    // 1) Sebelum (tanpa Posyandu)
    let d = JSON.parse((await httpGet(port, '/siklus/laporan/perencanaan')).body.toString());
    console.log('\nSEBELUM (tanpa Posyandu):');
    console.log('  jenjang_list:', JSON.stringify(d.jenjang_list));
    console.log('  pm_map:', JSON.stringify(d.pm_map));

    // 2) Aktifkan Posyandu
    const parsed = JSON.parse(original || '[]');
    if (!parsed.includes('Posyandu')) parsed.push('Posyandu');
    await db.query('UPDATE siklus_menu SET kategori_penerima=? WHERE id=47', [JSON.stringify(parsed)]);
    d = JSON.parse((await httpGet(port, '/siklus/laporan/perencanaan')).body.toString());
    console.log('\nSESUDAH (kategori + Posyandu):');
    console.log('  jenjang_list:', JSON.stringify(d.jenjang_list));
    console.log('  pm_map:', JSON.stringify(d.pm_map));
    const day0 = (d.hari || []).find(x => x.bahan && x.bahan.length);
    if (day0 && day0.bahan[0]) {
      const b = day0.bahan[0];
      console.log('\n  Bahan pertama hari', day0.tanggal, '=', b.nama_display);
      for (const [jn, pj] of Object.entries(b.per_jenjang || {})) {
        console.log('    ' + jn + ': kebutuhan_kg=' + pj.kebutuhan_kg + ' (siswa=' + pj.jumlah_siswa + ', berat_kotor=' + pj.berat_kotor + ')');
      }
      const hasBumil = b.per_jenjang && Number((b.per_jenjang['Bumil/Busui'] || {}).kebutuhan_kg) > 0;
      const hasBalita = b.per_jenjang && Number((b.per_jenjang['Balita'] || {}).kebutuhan_kg) > 0;
      console.log('\n  Kolom Bumil/Busui terisi:', hasBumil ? '✔ YA' : '✗ KOSONG');
      console.log('  Kolom Balita terisi   :', hasBalita ? '✔ YA' : '✗ KOSONG');
    } else {
      console.log('  (tidak ada data hari)');
    }
  } finally {
    await db.query('UPDATE siklus_menu SET kategori_penerima=? WHERE id=47', [original]);
    console.log('\n✔ Kategori siklus #47 dikembalikan ke:', original);
    server.close();
    await db.end().catch(() => {});
  }
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
