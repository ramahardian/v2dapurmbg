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

// POST /system/koreksi-menu-bahan — perbaiki data menu_bahan.jumlah (double-counting bug)
router.post('/system/koreksi-menu-bahan', requireRole('admin'), async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  });

  const log = (msg) => { res.write(msg + '\n'); };
  log('Memulai koreksi data menu_bahan...\n');

  try {
    const { runKoreksiMenuBahan } = require('../scripts/koreksi-menu-bahan');
    const result = await runKoreksiMenuBahan(req.user.tenant_id);
    for (const line of result.logs) {
      log(line);
    }
    log('');
    log(`✓ ${result.corrected} dari ${result.total} baris menu_bahan diperbaiki`);
    log('✓ Nutrisi menu telah diperbarui');
    log('');
    log('✓ Koreksi selesai!');
  } catch (err) {
    log('\n✗ Gagal: ' + err.message);
  }
  res.end();
});

// GET /system/koreksi-menu-bahan — halaman trigger koreksi (web UI)
router.get('/system/koreksi-menu-bahan', requireRole('admin'), (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><title>Koreksi Menu Bahan</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-100 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full">
    <h1 class="text-2xl font-bold text-stone-800 mb-2">Koreksi Data Menu Bahan</h1>
    <p class="text-sm text-stone-500 mb-6">
      Memperbaiki data <code class="bg-stone-100 px-1 rounded">menu_bahan.jumlah</code> yang terlanjur tersimpan sebagai total (dikalikan jumlah siswa) akibat bug formula.
      Data akan dibagi dengan jumlah penerima manfaat per kategori, sehingga menjadi gram per siswa.
      Nutrisi menu juga akan dihitung ulang.
    </p>

    <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm text-amber-800">
      <strong>⚠️ Perhatian:</strong> Hanya untuk tenant yang sedang login. Jalankan setelah deploy fix
      <code class="bg-amber-100 px-1 rounded">processBahanItem</code>.
    </div>

    <button onclick="runKoreksi()" id="btn" class="bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
      Jalankan Koreksi
    </button>
    <pre id="output" class="mt-4 bg-stone-900 text-green-400 p-4 rounded-xl text-xs font-mono leading-relaxed overflow-auto max-h-96 hidden"></pre>
  </div>
  <script>
    async function runKoreksi() {
      const btn = document.getElementById('btn');
      const out = document.getElementById('output');
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      out.classList.remove('hidden');
      out.textContent = '';

      try {
        const r = await fetch('/api/system/koreksi-menu-bahan', { method: 'POST' });
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
      btn.textContent = 'Jalankan Koreksi';
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

// POST /system/create-notifikasi-table — buat tabel notifikasi
router.post('/system/create-notifikasi-table', requireRole('admin'), async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  });

  const log = (msg) => { res.write(msg + '\n'); };
  log('Membuat tabel notifikasi...\n');

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS notifikasi (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        pengirim_id INT DEFAULT NULL,
        penerima_id INT NOT NULL,
        judul VARCHAR(200) NOT NULL,
        pesan TEXT,
        link VARCHAR(500) DEFAULT NULL,
        is_read TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        FOREIGN KEY (pengirim_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (penerima_id) REFERENCES karyawan(id) ON DELETE CASCADE,
        INDEX idx_notif_tenant (tenant_id),
        INDEX idx_notif_penerima (penerima_id),
        INDEX idx_notif_read (penerima_id, is_read)
      ) ENGINE=InnoDB
    `);

    log('✓ Tabel notifikasi berhasil dibuat!');
    log('');
    log('Kolom yang tersedia:');
    log('  id, tenant_id, pengirim_id, penerima_id, judul, pesan, link, is_read, created_at');
    log('');
    log('✅ Selesai!');
  } catch (err) {
    log('\n✗ Gagal: ' + err.message);
  }
  res.end();
});

// GET /system/create-notifikasi-table — halaman trigger (web UI)
router.get('/system/create-notifikasi-table', requireRole('admin'), (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><title>Buat Tabel Notifikasi</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-100 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full">
    <h1 class="text-2xl font-bold text-stone-800 mb-2">Buat Tabel Notifikasi</h1>
    <p class="text-sm text-stone-500 mb-6">
      Membuat tabel <code class="bg-stone-100 px-1.5 py-0.5 rounded text-xs">notifikasi</code> untuk fitur pesan internal.
      Tabel akan dibuat jika belum ada.<br>
      <span class="text-amber-600">Hanya admin yang bisa menjalankan.</span>
    </p>

    <button onclick="runCreate()" id="btn" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
      Buat Tabel Notifikasi
    </button>
    <pre id="output" class="mt-4 bg-stone-900 text-green-400 p-4 rounded-xl text-xs font-mono leading-relaxed overflow-auto max-h-96 hidden"></pre>
  </div>
  <script>
    async function runCreate() {
      const btn = document.getElementById('btn');
      const out = document.getElementById('output');
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      out.classList.remove('hidden');
      out.textContent = '';

      try {
        const r = await fetch('/api/system/create-notifikasi-table', { method: 'POST' });
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
      btn.textContent = 'Buat Tabel Notifikasi';
    }
  </script>
</body>
</html>`);
});

module.exports = router;
