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

// POST /system/bersihkan-log-aktivitas — hapus log aktivitas user online (admin).
// Body opsional: { user_id } hanya user tsb, { days } hanya yang lebih tua dari N hari.
router.post('/system/bersihkan-log-aktivitas', requireRole('admin'), async (req, res) => {
  const t = req.user.tenant_id;
  const uid = req.body && req.body.user_id ? parseInt(req.body.user_id, 10) : null;
  const days = req.body && req.body.days ? parseInt(req.body.days, 10) : null;
  try {
    let sql = 'DELETE FROM user_activity_log WHERE tenant_id = ?';
    const params = [t];
    if (uid) { sql += ' AND user_id = ?'; params.push(uid); }
    if (days) { sql += ' AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)'; params.push(days); }
    const [r] = await db.query(sql, params);
    res.json({ ok: true, deleted: r.affectedRows });
  } catch (e) {
    res.status(500).json({ error: 'Gagal membersihkan log: ' + e.message });
  }
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

// POST /system/koreksi-menu-bahan-jumlah — perbaiki menu_bahan.jumlah yang tidak wajar (terlalu besar)
router.post('/system/koreksi-menu-bahan-jumlah', requireRole('admin'), async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  });

  const log = (msg) => { res.write(msg + '\n'); };
  const { apply } = req.body || {};
  log('Memulai koreksi data menu_bahan.jumlah...\n');

  try {
    const { runKoreksiMenuBahanJumlah } = require('../scripts/koreksi-menu-bahan-jumlah');
    const result = await runKoreksiMenuBahanJumlah(!!apply, false, req.user.tenant_id);
    for (const line of result.logs) {
      log(line);
    }
    log('');
    if (apply) {
      log(`✓ ${result.corrected} dari ${result.total} baris menu_bahan diperbaiki`);
      if (result.corrected > 0) log('✓ Nutrisi menu telah diperbarui');
    } else {
      log(`✓ Dry-run selesai: ${result.total - result.skipped} baris akan diperbaiki, ${result.skipped} di-skip`);
    }
    log('');
    log('✓ Koreksi selesai!');
  } catch (err) {
    log('\n✗ Gagal: ' + err.message);
  }
  res.end();
});

// GET /system/koreksi-menu-bahan-jumlah — halaman trigger koreksi via URL (web UI)
router.get('/system/koreksi-menu-bahan-jumlah', requireRole('admin'), (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><title>Koreksi Jumlah Menu Bahan</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-100 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-8 max-w-3xl w-full">
    <h1 class="text-2xl font-bold text-stone-800 mb-2">Koreksi Jumlah Menu Bahan</h1>
    <p class="text-sm text-stone-500 mb-6">
      Memperbaiki data <code class="bg-stone-100 px-1 rounded">menu_bahan.jumlah</code> yang tersimpan terlalu besar
      (gram per porsi, mis. Beras 8.800g — seharusnya ~50g) sehingga kebutuhan di /total-kebutuhan jadi berlipat.
      Nilai benar diambil dari <code class="bg-stone-100 px-1 rounded">berat_1_sp</code> master Bahan Baku (fallback: SP Referensi).
    </p>

    <div class="bg-sky-50 border border-sky-200 rounded-lg p-3 mb-4 text-xs text-sky-800">
      <strong>Urutan yang benar:</strong> jalankan <strong>1. Dry Run</strong> dulu untuk melihat preview,
      periksa hasilnya, lalu <strong>2. Jalankan Koreksi</strong> untuk memperbaiki data + hitung ulang nutrisi.
      Backup otomatis dibuat ke tabel <code class="bg-sky-100 px-1 rounded">backup_menu_bahan_sebelum_koreksi_&lt;tenant_id&gt;</code>
      (nama tabel akan tampil di log hasil koreksi).
    </div>

    <div class="flex gap-3 mb-6">
      <button onclick="runKoreksi(false)" id="btn-dry" class="flex-1 bg-sky-600 hover:bg-sky-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
        1. Dry Run (Preview)
      </button>
      <button onclick="runKoreksi(true)" id="btn-apply" class="flex-1 bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
        2. Jalankan Koreksi
      </button>
    </div>

    <pre id="output" class="bg-stone-900 text-green-400 p-4 rounded-xl text-xs font-mono leading-relaxed overflow-auto max-h-96 hidden"></pre>
  </div>
  <script>
    async function runKoreksi(apply) {
      const btn = apply ? document.getElementById('btn-apply') : document.getElementById('btn-dry');
      if (apply && !confirm('Perbaiki data menu_bahan.jumlah sekarang? Backup otomatis akan dibuat terlebih dahulu.')) return;
      const out = document.getElementById('output');
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      out.classList.remove('hidden');
      out.textContent = '';

      try {
        const r = await fetch('/api/system/koreksi-menu-bahan-jumlah', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apply }),
          credentials: 'include'
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
      btn.textContent = apply ? '2. Jalankan Koreksi' : '1. Dry Run (Preview)';
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

// GET/PUT /system/kop-surat — lihat & atur kop surat (nama, alamat, telepon tenant)
router.get('/system/kop-surat', async (req, res) => {
  try {
    const [[t]] = await db.query('SELECT id, nama, alamat, telepon FROM tenants WHERE id=?', [req.user.tenant_id]);
    if (!t) return res.status(404).json({ error: 'Tenant tidak ditemukan' });
    res.json({ kop_nama: t.nama, kop_alamat: t.alamat || '', kop_telepon: t.telepon || '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/system/kop-surat', requireRole('admin'), async (req, res) => {
  try {
    const { kop_nama, kop_alamat, kop_telepon } = req.body || {};
    await db.query('UPDATE tenants SET nama=?, alamat=?, telepon=? WHERE id=?', [
      (kop_nama || '').trim() || 'Dapur Sukaluyu',
      (kop_alamat || '').trim(),
      (kop_telepon || '').trim(),
      req.user.tenant_id
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET/PUT /system/koperasi — identitas unit dapur di sistem koperasi
// (id_unit_dapur & nama_dapur). Dipakai sebagai default filter Riwayat
// Koperasi dan pengiriman PO ke koperasi.
router.get('/system/koperasi', async (req, res) => {
  try {
    const [[t]] = await db.query('SELECT koperasi_id_unit_dapur, koperasi_nama_dapur FROM tenants WHERE id=?', [req.user.tenant_id]);
    if (!t) return res.status(404).json({ error: 'Tenant tidak ditemukan' });
    res.json({
      id_unit_dapur: t.koperasi_id_unit_dapur || '',
      nama_dapur: t.koperasi_nama_dapur || '',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/system/koperasi', requireRole('admin'), async (req, res) => {
  try {
    const { id_unit_dapur, nama_dapur } = req.body || {};
    await db.query('UPDATE tenants SET koperasi_id_unit_dapur=?, koperasi_nama_dapur=? WHERE id=?', [
      String(id_unit_dapur || '').trim(),
      String(nama_dapur || '').trim(),
      req.user.tenant_id
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /system/backup — unduh backup database sebagai file .sql
router.get('/system/backup', requireRole('admin'), async (req, res) => {
  try {
    const { generateSqlDump } = require('../services/dbBackup');
    const sql = await generateSqlDump();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mbg-backup-' + stamp + '.sql"');
    res.send(sql);
  } catch (err) {
    res.status(500).json({ error: 'Gagal membuat backup: ' + err.message });
  }
});

// GET /system/backup-page — halaman trigger unduh backup (web UI)
router.get('/system/backup-page', requireRole('admin'), (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><title>Backup Database</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-100 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-8 max-w-lg w-full">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center">
        <svg class="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
      </div>
      <div>
        <h1 class="text-xl font-bold text-stone-800">Backup Database</h1>
        <p class="text-xs text-stone-500">Unduh seluruh database sebagai file SQL.</p>
      </div>
    </div>
    <p class="text-sm text-stone-600 leading-relaxed mb-4">File <b>.sql</b> berisi struktur tabel + seluruh data, siap diimpor ke server MySQL lain (CREATE DATABASE + USE disertakan). Hanya bisa diakses oleh role <b>admin</b>.</p>
    <a href="/api/system/backup" id="btn" class="inline-flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-semibold transition shadow-md">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      Unduh Backup (.sql)
    </a>
    <div class="mt-4 text-[11px] text-stone-400 text-center">URL langsung: <code class="bg-stone-100 px-1.5 py-0.5 rounded">/api/system/backup</code></div>
  </div>
</body>
</html>`);
});

// ============================================================
// POST /system/sync-produksi — terapkan perbaikan data master langsung dari URL
// (tanpa SSH / mysql CLI). Menyamakan data bahan baku dengan hasil audit localhost:
//   1) buffer_persen = 0 untuk semua bahan
//   2) Minyak Goreng (karton/dus) -> berat_per_satuan = 12000 g (12 kg/karton)
//   3) Buncis & Wortel -> persen_bdd = 100 (0% susut)
// Aman: discope per tenant login, idempotent, dan mencocokkan bahan berdasarkan
// nama/kategori/satuan (bukan id) supaya tetap benar di DB produksi.
// ============================================================
router.post('/system/sync-produksi', requireRole('admin'), async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  });

  const t = req.user.tenant_id;
  const log = (msg) => { res.write(msg + '\n'); };

  log('══════════════════════════════════════════════');
  log('  SINKRONISASI DATA MASTER — via URL');
  log('  Tenant : id ' + t + ' (' + (req.user.nama || req.user.email || '') + ')');
  log('  Waktu  : ' + new Date().toLocaleString('id-ID'));
  log('══════════════════════════════════════════════\n');

  // Semua update dalam SATU transaksi: kalau ada error di tengah, rollback total
  // (tidak ada perubahan parsial yang tersimpan).
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // ── 1) Buffer persen -> 0 ─────────────────────────────────
    const [[b0]] = await conn.query(
      'SELECT COUNT(*) total, COALESCE(SUM(buffer_persen > 0),0) dgn FROM bahan_baku WHERE tenant_id=?',
      [t]
    );
    const [u0] = await conn.query('UPDATE bahan_baku SET buffer_persen = 0 WHERE tenant_id=?', [t]);
    const [[b1]] = await conn.query(
      'SELECT COALESCE(SUM(buffer_persen > 0),0) dgn FROM bahan_baku WHERE tenant_id=?',
      [t]
    );
    log('1) BUFFER PERSEN → 0');
    log('   Sebelum : ' + b0.dgn + ' bahan dgn buffer > 0 (dari ' + b0.total + ')');
    log('   Update  : ' + u0.affectedRows + ' baris dikosongkan');
    log('   Sesudah : ' + b1.dgn + ' bahan dgn buffer > 0 ✓');
    log('');

    // ── 2) Minyak (karton/dus) -> 12.000 g/karton ─────────────
    // Cari yang jelas-jelas minyak goreng dulu; kalau tidak ada, pakai semua
    // minyak bersatuan karton (fallback untuk DB produksi dengan penamaan lain).
    let daftarMinyak = null;
    const [minyakGoreng] = await conn.query(
      `SELECT id, nama, satuan, berat_per_satuan FROM bahan_baku
       WHERE tenant_id=? AND LOWER(kategori_sp)='minyak'
         AND LOWER(satuan) IN ('karton','ctn','kardus','dus')
         AND LOWER(nama) LIKE '%goreng%'`,
      [t]
    );
    if (minyakGoreng.length) {
      daftarMinyak = minyakGoreng;
    } else {
      const [m] = await conn.query(
        `SELECT id, nama, satuan, berat_per_satuan FROM bahan_baku
         WHERE tenant_id=? AND LOWER(kategori_sp)='minyak'
           AND LOWER(satuan) IN ('karton','ctn','kardus','dus')`,
        [t]
      );
      daftarMinyak = m;
    }
    log('2) MINYAK → 12.000 g/karton (12 kg)');
    if (!daftarMinyak.length) {
      log('   ⚠ Tidak ada bahan minyak bersatuan karton/dus — dilewati');
    } else {
      for (const row of daftarMinyak) {
        const [upd] = await conn.query(
          'UPDATE bahan_baku SET berat_per_satuan=12000 WHERE id=? AND tenant_id=?',
          [row.id, t]
        );
        log('   ' + row.nama + ' (id ' + row.id + ', ' + row.satuan + '): ' +
          (Number(row.berat_per_satuan) || 0) + ' → 12000 ' + (upd.affectedRows ? '✓' : '(tidak berubah)'));
      }
    }
    log('');

    // ── 3) Buncis & Wortel -> BDD 100 (0% susut) ───────────────
    log('3) BDD → 100 (0% susut) untuk Buncis & Wortel');
    const target = [{ kata: 'Buncis' }, { kata: 'Wortel' }];
    for (const tg of target) {
      // Hanya bahan belanja asli: nama mengandung kata target tapi BUKAN baris referensi SP
      // (mis. 'Buncis 0.5 SP') — baris SP dipakai sebagai referensi standar porsi.
      const [rows] = await conn.query(
        `SELECT id, nama, persen_bdd FROM bahan_baku
         WHERE tenant_id=? AND LOWER(nama) LIKE ? AND LOWER(nama) NOT LIKE '% sp%'`,
        [t, '%' + tg.kata.toLowerCase() + '%']
      );
      if (!rows.length) {
        log('   ' + tg.kata + ': ⚠ tidak ditemukan — dilewati');
        continue;
      }
      for (const row of rows) {
        const [upd] = await conn.query(
          'UPDATE bahan_baku SET persen_bdd=100 WHERE id=? AND tenant_id=?',
          [row.id, t]
        );
        log('   ' + row.nama + ' (id ' + row.id + '): ' + (Number(row.persen_bdd) || 0) +
          ' → 100 ' + (upd.affectedRows ? '✓' : '(tidak berubah)'));
      }
    }
    log('');

    await conn.commit();

    // ── Verifikasi akhir (setelah commit) ──────────────────────
    const [[v]] = await conn.query(
      `SELECT
         (SELECT COALESCE(SUM(buffer_persen>0),0) FROM bahan_baku WHERE tenant_id=?) AS sisa_buffer,
         (SELECT COUNT(*) FROM bahan_baku WHERE tenant_id=? AND LOWER(nama) LIKE '%buncis%' AND LOWER(nama) NOT LIKE '% sp%' AND persen_bdd<100) AS buncis_bdd,
         (SELECT COUNT(*) FROM bahan_baku WHERE tenant_id=? AND LOWER(nama) LIKE '%wortel%' AND LOWER(nama) NOT LIKE '% sp%' AND persen_bdd<100) AS wortel_bdd,
         (SELECT COALESCE(SUM(berat_per_satuan=12000),0) FROM bahan_baku WHERE tenant_id=? AND LOWER(kategori_sp)='minyak' AND LOWER(satuan) IN ('karton','ctn','kardus','dus')) AS minyak_12kg`,
      [t, t, t, t]
    );
    log('──────────────────────────────────────────────');
    log('  VERIFIKASI AKHIR (tenant id ' + t + ')');
    log('  Sisa buffer > 0  : ' + v.sisa_buffer + '  (harus 0)');
    log('  Buncis BDD < 100 : ' + v.buncis_bdd + '  (harus 0)');
    log('  Wortel BDD < 100 : ' + v.wortel_bdd + '  (harus 0)');
    log('  Minyak 12 kg     : ' + v.minyak_12kg + '  bahan (harus ≥ 1)');
    log('──────────────────────────────────────────────');
    log('✓ Sinkronisasi selesai — perubahan tersimpan (commit).');
    log('  Refresh /total-kebutuhan untuk melihat hasilnya.');
  } catch (err) {
    try { await conn.rollback(); } catch (e) { /* koneksi mungkin sudah putus */ }
    log('');
    log('✗ Gagal: ' + err.message);
    log('  Semua perubahan dibatalkan (rollback) — data tidak berubah.');
  } finally {
    conn.release();
  }
  res.end();
});

// GET /system/sync-produksi — halaman trigger sinkronisasi (web UI)
router.get('/system/sync-produksi', requireRole('admin'), (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><title>Sinkronisasi Data Master</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-100 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center">
        <svg class="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
      </div>
      <div>
        <h1 class="text-xl font-bold text-stone-800">Sinkronisasi Data Master</h1>
        <p class="text-xs text-stone-500">Terapkan perbaikan data bahan baku via URL — tanpa SSH/mysql.</p>
      </div>
    </div>

    <p class="text-sm text-stone-600 leading-relaxed mb-4">
      Menyamakan data master dengan hasil audit. Aman & idempotent (hanya untuk tenant Anda):
    </p>
    <ul class="text-sm text-stone-700 space-y-1.5 mb-5">
      <li class="flex items-start gap-2"><span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></span>
        <span><b>Buffer = 0</b> — hapus +10% stok aman (item = total kebutuhan)</span></li>
      <li class="flex items-start gap-2"><span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></span>
        <span><b>Minyak (karton/dus) = 12.000 g</b> — 12 kg per karton, QTY jadi wajar</span></li>
      <li class="flex items-start gap-2"><span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></span>
        <span><b>Buncis & Wortel BDD = 100</b> — 0% susut, total = item</span></li>
    </ul>

    <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-xs text-amber-800">
      <strong>⚠️ Disarankan:</strong> unduh backup dulu via <code class="bg-amber-100 px-1 rounded">/api/system/backup</code>
      sebelum menjalankan sinkronisasi.
    </div>

    <button onclick="runSync()" id="btn" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold transition shadow-md">
      Jalankan Sinkronisasi
    </button>
    <pre id="output" class="mt-4 bg-stone-900 text-green-400 p-4 rounded-xl text-xs font-mono leading-relaxed overflow-auto max-h-96 hidden"></pre>
  </div>
  <script>
    async function runSync() {
      if (!confirm('Terapkan perbaikan data master sekarang? (buffer=0, Minyak 12 kg, Buncis/Wortel BDD 100)')) return;
      const btn = document.getElementById('btn');
      const out = document.getElementById('output');
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      out.classList.remove('hidden');
      out.textContent = '';

      try {
        const r = await fetch('/api/system/sync-produksi', {
          method: 'POST',
          credentials: 'include'
        });
        if (!r.ok) {
          out.textContent += 'HTTP ' + r.status + ': ' + (await r.text());
          return;
        }
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          out.textContent += decoder.decode(value);
          out.scrollTop = out.scrollHeight;
        }
      } catch (e) {
        out.textContent += '\nGagal: ' + e.message;
      }
      btn.disabled = false;
      btn.textContent = 'Jalankan Sinkronisasi';
    }
  </script>
</body>
</html>`);
});

module.exports = router;
