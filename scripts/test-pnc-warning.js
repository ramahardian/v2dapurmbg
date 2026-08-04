// Uji peringatan inflasi (sync factor) pada endpoint /siklus/laporan/perencanaan.
// Kasus normal + simulasi jumlah_porsi membesar (UPDATE lalu revert aman).
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

async function callApi(port) {
  const jr = await httpGet(port, '/siklus/laporan/perencanaan');
  const d = JSON.parse(jr.body.toString());
  return d;
}

(async () => {
  const app = express();
  app.use((req, res, next) => { req.user = { tenant_id: TENANT }; next(); });
  app.use(router);
  const server = app.listen(0);
  await new Promise(r => server.on('listening', r));
  const port = server.address().port;

  // Ambil nilai asli jumlah_porsi
  const [siklusRows] = await db.query('SELECT id, jumlah_porsi FROM siklus_menu WHERE tenant_id=? AND status="Aktif"', [TENANT]);
  const original = Object.fromEntries(siklusRows.map(s => [s.id, s.jumlah_porsi]));

  try {
    // 1) Kasus normal
    const d1 = await callApi(port);
    console.log('KASUS NORMAL:');
    console.log('  sync =', JSON.stringify(d1.sync));
    console.log('  total_porsi =', d1.total_porsi, '| hari =', d1.hari.length);
    console.log('  inflating:', d1.sync.inflating ? '⚠ YA (warning tampil)' : '✔ tidak (warning tidak tampil)');

    // 2) Simulasi inflasi: set jumlah_porsi besar
    for (const [id, val] of Object.entries(original)) {
      await db.query('UPDATE siklus_menu SET jumlah_porsi=? WHERE id=?', [5000, id]);
    }
    const d2 = await callApi(port);
    console.log('\nKASUS INFLASI (jumlah_porsi=5000):');
    console.log('  sync =', JSON.stringify(d2.sync));
    console.log('  total_porsi =', d2.total_porsi, '| hari =', d2.hari.length);
    console.log('  inflating:', d2.sync.inflating ? '⚠ YA — banner peringatan akan tampil' : '✗ TIDAK (gagal)');
    if (d2.sync.inflating) {
      const pct = Math.round((d2.sync.factor - 1) * 100);
      console.log('  Pesan banner: "Angka kebutuhan berpotensi menggembung (' + pct + '% lebih tinggi)"');
    }
  } finally {
    // Revert jumlah_porsi
    for (const [id, val] of Object.entries(original)) {
      await db.query('UPDATE siklus_menu SET jumlah_porsi=? WHERE id=?', [val, id]);
    }
    console.log('\n✔ Data jumlah_porsi dikembalikan ke nilai semula:', JSON.stringify(original));
    server.close();
    await db.end().catch(() => {});
  }
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
