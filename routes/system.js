const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { runMigration } = require('../scripts/migrate');

const router = express.Router();
router.use(requireAuth);

// POST /system/migrate — jalankan migrasi database dari URL (tanpa bash!)
router.post('/system/migrate', requireRole('admin'), async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  });
  res.write('Menjalankan migrasi database...\n\n');

  try {
    const logs = await runMigration();
    for (const line of logs) {
      res.write(line + '\n');
    }
    res.write('\n✓ Migrasi selesai!\n');
  } catch (err) {
    res.write('\n✗ Gagal: ' + err.message + '\n');
  }
  res.end();
});

// GET /system/migrate — halaman trigger migrasi (web UI)
router.get('/system/migrate', requireRole('admin'), (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><title>Migrasi Database</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-100 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full">
    <h1 class="text-2xl font-bold text-stone-800 mb-2">Migrasi Database</h1>
    <p class="text-sm text-stone-500 mb-6">Menambahkan kolom baru atau memperbaiki struktur database tanpa menghapus data.</p>
    <button onclick="runMigrate()" id="btn" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
      Jalankan Migrasi
    </button>
    <pre id="output" class="mt-4 bg-stone-900 text-green-400 p-4 rounded-xl text-xs font-mono leading-relaxed overflow-auto max-h-96 hidden"></pre>
  </div>
  <script>
    async function runMigrate() {
      const btn = document.getElementById('btn');
      const out = document.getElementById('output');
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      out.classList.remove('hidden');
      out.textContent = '';

      try {
        const r = await fetch('/api/system/migrate', { method: 'POST' });
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          out.textContent += decoder.decode(value);
          out.scrollTop = out.scrollHeight;
        }
      } catch (e) {
        out.textContent += '\\nGagal: ' + e.message;
      }
      btn.disabled = false;
      btn.textContent = 'Jalankan Migrasi';
    }
  </script>
</body>
</html>`);
});

// POST /system/seed-sp-referensi — seed SP referensi dari URL atau default
router.post('/system/seed-sp-referensi', requireRole('admin'), async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  });

  const { url } = req.body || {};
  const log = (msg) => { res.write(msg + '\n'); };

  log('Memulai seed SP Referensi Bahan...');
  log(url ? `  Sumber: URL eksternal` : '  Sumber: data default');
  log('');

  try {
    const { runSeedSpReferensi } = require('../scripts/seed_sp_referensi');
    const result = await runSeedSpReferensi(req.user.tenant_id, url || null);
    log(`  ✓ ${result.inserted} baris berhasil di-seed (dari ${result.total})`);
    log(`  Sumber: ${result.source}`);
    log('');
    log('✓ Seed SP Referensi Bahan selesai!');
  } catch (err) {
    log('\n✗ Gagal: ' + err.message);
  }
  res.end();
});

// GET /system/seed-sp-referensi — halaman trigger seed SP (web UI)
router.get('/system/seed-sp-referensi', requireRole('admin'), (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><title>Seed SP Referensi Bahan</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-100 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full">
    <h1 class="text-2xl font-bold text-stone-800 mb-2">Seed SP Referensi Bahan</h1>
    <p class="text-sm text-stone-500 mb-6">Mengisi atau memperbarui data referensi SP Bahan dari sumber data default atau URL eksternal (JSON/CSV/XLSX).</p>

    <div class="mb-4">
      <label class="block text-sm font-medium text-stone-700 mb-1">URL Data (opsional)</label>
      <input type="url" id="urlInput" placeholder="https://example.com/sp-referensi.json"
             class="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
      <p class="text-xs text-stone-400 mt-1">Kosongkan untuk menggunakan data default. Format: JSON, CSV, atau Excel (.xlsx)</p>
    </div>

    <button onclick="runSeed()" id="btn" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
      Jalankan Seed
    </button>
    <pre id="output" class="mt-4 bg-stone-900 text-green-400 p-4 rounded-xl text-xs font-mono leading-relaxed overflow-auto max-h-96 hidden"></pre>
  </div>
  <script>
    async function runSeed() {
      const btn = document.getElementById('btn');
      const out = document.getElementById('output');
      const url = document.getElementById('urlInput').value.trim();
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      out.classList.remove('hidden');
      out.textContent = '';

      try {
        const r = await fetch('/api/system/seed-sp-referensi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url || undefined })
        });
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          out.textContent += decoder.decode(value);
          out.scrollTop = out.scrollHeight;
        }
      } catch (e) {
        out.textContent += '\\nGagal: ' + e.message;
      }
      btn.disabled = false;
      btn.textContent = 'Jalankan Seed';
    }
  </script>
</body>
</html>`);
});

// GET /system/cek-budget — debug: lihat data budget
router.get('/system/cek-budget', requireRole('admin'), async (req, res) => {
  try {
    const { periode, kategori } = req.query;
    let sql = 'SELECT * FROM budget WHERE tenant_id=?';
    const params = [req.user.tenant_id];
    if (periode) { sql += ' AND periode=?'; params.push(periode); }
    if (kategori) { sql += ' AND kategori_penerima=?'; params.push(kategori); }
    sql += ' ORDER BY periode DESC';
    const [rows] = await db.query(sql, params);
    res.json({ ok: true, total: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
