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
    // Jika nama dikosongkan, pertahankan nama tenant yang sudah ada (jangan di-reset).
    let nama = (kop_nama || '').trim();
    if (!nama) {
      const [[t]] = await db.query('SELECT nama FROM tenants WHERE id=?', [req.user.tenant_id]);
      nama = (t && t.nama) ? t.nama : '';
    }
    await db.query('UPDATE tenants SET nama=?, alamat=?, telepon=? WHERE id=?', [
      nama,
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
        out.textContent += '\\nGagal: ' + e.message;
      }
      btn.disabled = false;
      btn.textContent = 'Jalankan Sinkronisasi';
    }
  </script>
</body>
</html>`);
});

// ============================================================
// POST /system/koreksi-rosmery — perbaiki menu_bahan rosmery dry → 0,175 g/anak
// (0,5 kg utk 2859 porsi) langsung dari URL, tanpa SSH/mysql.
// Mengikuti pola sync-produksi: admin-only, per tenant, transaksi atomik,
// log streaming, idempotent (aman dijalankan berulang).
// ============================================================
router.post('/system/koreksi-rosmery', requireRole('admin'), async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  });

  const t = req.user.tenant_id;
  const log = (msg) => { res.write(msg + '\n'); };

  log('══════════════════════════════════════════════');
  log('  KOREKSI ROSMERY DRY — via URL');
  log('  Tenant : id ' + t + ' (' + (req.user.nama || req.user.email || '') + ')');
  log('  Waktu  : ' + new Date().toLocaleString('id-ID'));
  log('══════════════════════════════════════════════\n');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // ── 1) Bahan & baris menu yang terdampak ────────────────
    const [rows] = await conn.query(
      `SELECT bb.id, bb.nama, bb.satuan, COUNT(mb.id) baris
       FROM bahan_baku bb
       LEFT JOIN menu_bahan mb ON mb.bahan_baku_id = bb.id
       LEFT JOIN menu m ON m.id = mb.menu_id
       WHERE bb.tenant_id=? AND LOWER(bb.nama) LIKE '%rosmery%'
       GROUP BY bb.id, bb.nama, bb.satuan`,
      [t]
    );
    log('1) BAHAN TERDAMPAK');
    if (!rows.length) {
      log('   ⚠ Tidak ada bahan bernama rosmery untuk tenant ini — selesai (tanpa perubahan).');
      await conn.commit();
      log('');
      log('✓ Selesai.');
      res.end();
      return;
    }
    for (const r of rows) {
      log('   • ' + r.nama + ' (id ' + r.id + ', satuan ' + (r.satuan || '-') + ') — ' + r.baris + ' baris di menu');
    }
    log('');

    // ── 2) Update jumlah → 0,175 g/anak (= 0,5 kg utk 2859 porsi) ──
    const [u] = await conn.query(
      `UPDATE menu_bahan mb
       JOIN menu m ON m.id = mb.menu_id
       JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
       SET mb.jumlah = 0.175
       WHERE m.tenant_id = ? AND LOWER(bb.nama) LIKE '%rosmery%'`,
      [t]
    );
    log('2) UPDATE JUMLAH');
    log('   menu_bahan.jumlah → 0,175 g/anak (Total Kebutuhan: 0,5 kg → tampil 1/2 kg)');
    log('   Baris diperbarui : ' + u.affectedRows);
    log('');

    // ── 3) Sinkronkan gramasi_total menu yang terdampak ───────
    const [menus] = await conn.query(
      `SELECT DISTINCT m.id FROM menu_bahan mb
       JOIN menu m ON m.id = mb.menu_id
       JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
       WHERE m.tenant_id=? AND LOWER(bb.nama) LIKE '%rosmery%'`,
      [t]
    );
    log('3) GRAMASI MENU TERDAMPAK');
    for (const mn of menus) {
      const [[g]] = await conn.query(
        'SELECT COALESCE(SUM(jumlah),0) s FROM menu_bahan WHERE menu_id=?', [mn.id]
      );
      const gramasi = Math.round(Number(g.s) * 100) / 100;
      await conn.query('UPDATE menu SET gramasi_total=? WHERE id=? AND tenant_id=?', [gramasi, mn.id, t]);
      log('   Menu id ' + mn.id + ': gramasi_total → ' + gramasi + ' g');
    }
    log('');

    await conn.commit();

    // ── Verifikasi akhir ──────────────────────────────────────
    const [[v]] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM menu_bahan mb JOIN menu m ON m.id=mb.menu_id JOIN bahan_baku bb ON bb.id=mb.bahan_baku_id
           WHERE m.tenant_id=? AND LOWER(bb.nama) LIKE '%rosmery%' AND mb.jumlah <> 0.175) AS belum,
         (SELECT COUNT(*) FROM menu_bahan mb JOIN menu m ON m.id=mb.menu_id JOIN bahan_baku bb ON bb.id=mb.bahan_baku_id
           WHERE m.tenant_id=? AND LOWER(bb.nama) LIKE '%rosmery%') AS total`,
      [t, t]
    );
    log('──────────────────────────────────────────────');
    log('  VERIFIKASI AKHIR (tenant id ' + t + ')');
    log('  Baris rosmery total   : ' + v.total);
    log('  Baris belum 0,175     : ' + v.belum + '  (harus 0)');
    log('──────────────────────────────────────────────');
    log('✓ Koreksi selesai — refresh /total-kebutuhan → rosmery dry tampil 1/2 kg.');
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

// GET /system/koreksi-rosmery — halaman trigger koreksi (web UI)
router.get('/system/koreksi-rosmery', requireRole('admin'), (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><title>Koreksi Rosmery Dry</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-100 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-11 h-11 rounded-xl bg-rose-100 flex items-center justify-center">
        <svg class="w-6 h-6 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      </div>
      <div>
        <h1 class="text-xl font-bold text-stone-800">Koreksi Rosmery Dry</h1>
        <p class="text-xs text-stone-500">Perbaiki jumlah rosmery dry di semua menu via URL — tanpa SSH/mysql.</p>
      </div>
    </div>

    <p class="text-sm text-stone-600 leading-relaxed mb-4">
      Menyetel <code class="bg-stone-100 px-1.5 py-0.5 rounded text-xs">menu_bahan.jumlah</code> rosmery dry menjadi
      <b>0,175 g/anak</b> (= <b>0,5 kg</b> untuk 2.859 porsi) sehingga Total Kebutuhan menampilkan
      <b>1/2 kg</b> (bukan 1/5 kg / 0,51 kg). Aman & idempotent, hanya untuk tenant Anda.
    </p>

    <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-xs text-amber-800">
      <strong>⚠️ Disarankan:</strong> unduh backup dulu via <code class="bg-amber-100 px-1 rounded">/api/system/backup</code>.
    </div>

    <button onclick="runFix()" id="btn" class="w-full bg-rose-600 hover:bg-rose-700 text-white px-6 py-3 rounded-xl font-semibold transition shadow-md">
      Jalankan Koreksi Rosmery
    </button>
    <pre id="output" class="mt-4 bg-stone-900 text-green-400 p-4 rounded-xl text-xs font-mono leading-relaxed overflow-auto max-h-96 hidden"></pre>
  </div>
  <script>
    async function runFix() {
      if (!confirm('Set rosmery dry → 0,175 g/anak (0,5 kg) di semua menu sekarang?')) return;
      const btn = document.getElementById('btn');
      const out = document.getElementById('output');
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      out.classList.remove('hidden');
      out.textContent = '';
      try {
        const r = await fetch('/api/system/koreksi-rosmery', { method: 'POST', credentials: 'include' });
        if (!r.ok) { out.textContent += 'HTTP ' + r.status + ': ' + (await r.text()); return; }
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
      btn.textContent = 'Jalankan Koreksi Rosmery';
    }
  </script>
</body>
</html>`);
});

// ============================================================
// POST /system/koreksi-berat-satuan — isi berat_per_satuan yang masih 0/null
// untuk bahan belanja (Kg → 1000 g, g → 1 g, Minyak karton → 12.000 g).
// Baris SP referensi (nama mengandung ' SP') TIDAK disentuh.
// Mode: dry-run (default) / apply ({ apply: true }). Idempotent, per tenant.
// ============================================================
router.post('/system/koreksi-berat-satuan', requireRole('admin'), async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  });

  const t = req.user.tenant_id;
  const apply = !!(req.body && req.body.apply);
  const log = (msg) => { res.write(msg + '\n'); };

  log('══════════════════════════════════════════════');
  log('  KOREKSI BERAT PER SATUAN — via URL');
  log('  Tenant : id ' + t + ' (' + (req.user.nama || req.user.email || '') + ')');
  log('  Waktu  : ' + new Date().toLocaleString('id-ID'));
  log('  Mode   : ' + (apply ? 'APPLY (data diubah)' : 'DRY-RUN (hanya preview)'));
  log('══════════════════════════════════════════════\n');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Bahan belanja (bukan baris SP referensi) yang berat_per_satuan kosong/0
    const [rows] = await conn.query(
      `SELECT bb.id, bb.nama, bb.satuan, bb.kategori_sp, bb.berat_per_satuan
       FROM bahan_baku bb
       WHERE bb.tenant_id = ?
         AND (bb.berat_per_satuan IS NULL OR bb.berat_per_satuan = 0)
         AND LOWER(bb.nama) NOT LIKE '% sp%'
         AND LOWER(bb.satuan) IN ('kg','kilogram','g','gram','gr','liter','l','karton','ctn','kardus','dus')`,
      [t]
    );

    log('BAHAN DENGAN BERAT PER SATUAN KOSONG');
    if (!rows.length) {
      log('   ✓ Tidak ada — semua bahan belanja sudah punya berat_per_satuan.');
      await conn.commit();
      log('');
      log('✓ Selesai.');
      res.end();
      return;
    }

    let toFix = 0, skip = 0, fixed = 0;
    for (const r of rows) {
      const s = String(r.satuan || '').toLowerCase();
      let target = 0;
      if (s === 'kg' || s === 'kilogram') target = 1000;                 // 1 kg = 1000 g
      else if (s === 'g' || s === 'gram' || s === 'gr') target = 1;      // satuan gram = 1 g
      else if (s === 'liter' || s === 'l') target = 1000;                // ~1 L ≈ 1000 g
      else if (['karton','ctn','kardus','dus'].includes(s)) {
        if (String(r.kategori_sp || '').toLowerCase() === 'minyak') target = 12000; // 12 kg/karton
        else { skip++; log('   ⚠ SKIP (satuan karton non-minyak, tidak ditebak): ' + r.nama + ' (' + r.satuan + ')'); continue; }
      }
      if (target <= 0) { skip++; continue; }
      toFix++;
      if (apply) {
        await conn.query('UPDATE bahan_baku SET berat_per_satuan=? WHERE id=? AND tenant_id=?', [target, r.id, t]);
        fixed++;
      }
      log('   ' + (apply ? '✓' : '•') + ' ' + r.nama + ' (' + r.satuan + '): ' + (Number(r.berat_per_satuan) || 0) + ' → ' + target + ' g');
    }

    log('');
    if (apply) {
      log('Update: ' + fixed + ' bahan diisi (skip ' + skip + ')');
    } else {
      log('Dry-run: ' + toFix + ' bahan akan diisi (skip ' + skip + ')');
      log('Jalankan ulang dengan { "apply": true } untuk menyimpan.');
    }

    if (apply) await conn.commit();
    else await conn.rollback(); // dry-run: jangan simpan apa pun

    // Verifikasi: hanya hitung bahan yang SEHARUSNYA sudah terisi (karton
    // non-minyak sengaja di-skip, jadi tidak dihitung sebagai sisa masalah).
    const [[v]] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM bahan_baku WHERE tenant_id=? AND (berat_per_satuan IS NULL OR berat_per_satuan=0)
           AND LOWER(nama) NOT LIKE '% sp%'
           AND (LOWER(satuan) IN ('kg','kilogram','g','gram','gr','liter','l')
                OR (LOWER(satuan) IN ('karton','ctn','kardus','dus') AND LOWER(kategori_sp)='minyak'))) AS sisa`,
      [t]
    );
    log('──────────────────────────────────────────────');
    log('  VERIFIKASI (tenant id ' + t + ')');
    log('  Bahan belanja bps masih kosong : ' + v.sisa + (apply && v.sisa === 0 ? '  ✓ bersih' : ''));
    log('  (karton non-minyak sengaja dilewati, tidak dihitung)');
    log('──────────────────────────────────────────────');
    log(apply ? '✓ Koreksi selesai — perubahan tersimpan (commit).' : '✓ Dry-run selesai — tidak ada perubahan tersimpan.');
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

// GET /system/koreksi-berat-satuan — halaman trigger (web UI)
router.get('/system/koreksi-berat-satuan', requireRole('admin'), (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><title>Koreksi Berat Per Satuan</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-100 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-11 h-11 rounded-xl bg-sky-100 flex items-center justify-center">
        <svg class="w-6 h-6 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 3v18m-7-7l7 7 7-7"/></svg>
      </div>
      <div>
        <h1 class="text-xl font-bold text-stone-800">Koreksi Berat Per Satuan</h1>
        <p class="text-xs text-stone-500">Isi berat_per_satuan yang masih kosong via URL — tanpa SSH/mysql.</p>
      </div>
    </div>

    <p class="text-sm text-stone-600 leading-relaxed mb-4">
      Bahan belanja (bukan baris SP referensi) yang <code class="bg-stone-100 px-1.5 py-0.5 rounded text-xs">berat_per_satuan</code>-nya masih 0/null
      akan diisi sesuai satuan:
    </p>
    <ul class="text-sm text-stone-700 space-y-1.5 mb-5">
      <li class="flex items-start gap-2"><span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0"></span>
        <span><b>Kg</b> → 1000 g</span></li>
      <li class="flex items-start gap-2"><span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0"></span>
        <span><b>g / Liter</b> → 1 g / 1000 g</span></li>
      <li class="flex items-start gap-2"><span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0"></span>
        <span><b>Minyak karton/dus</b> → 12.000 g (12 kg/karton)</span></li>
      <li class="flex items-start gap-2"><span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-stone-300 shrink-0"></span>
        <span><b>Karton non-minyak</b> → dilewati (tidak ditebak)</span></li>
    </ul>

    <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-xs text-amber-800">
      <strong>⚠️ Disarankan:</strong> unduh backup dulu via <code class="bg-amber-100 px-1 rounded">/api/system/backup</code>.
      Jalankan <b>Dry Run</b> dulu untuk preview, lalu <b>Jalankan Koreksi</b>.
    </div>

    <div class="flex gap-3 mb-6">
      <button onclick="runFix(false)" id="btn-dry" class="flex-1 bg-sky-600 hover:bg-sky-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
        1. Dry Run (Preview)
      </button>
      <button onclick="runFix(true)" id="btn-apply" class="flex-1 bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
        2. Jalankan Koreksi
      </button>
    </div>

    <pre id="output" class="bg-stone-900 text-green-400 p-4 rounded-xl text-xs font-mono leading-relaxed overflow-auto max-h-96 hidden"></pre>
  </div>
  <script>
    async function runFix(apply) {
      const btn = apply ? document.getElementById('btn-apply') : document.getElementById('btn-dry');
      if (apply && !confirm('Isi berat_per_satuan yang kosong sekarang?')) return;
      const out = document.getElementById('output');
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      out.classList.remove('hidden');
      out.textContent = '';
      try {
        const r = await fetch('/api/system/koreksi-berat-satuan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apply }),
          credentials: 'include'
        });
        if (!r.ok) { out.textContent += 'HTTP ' + r.status + ': ' + (await r.text()); return; }
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

// ============================================================
// POST /system/koreksi-wijen — set Minyak Wijen di semua menu = 1 botol
// (menu_bahan.jumlah = berat_per_satuan ÷ jumlah_porsi) langsung dari URL.
// Mengikuti pola koreksi-rosmery: admin-only, per tenant, transaksi atomik,
// log streaming, idempotent. Bahan dicocokkan by nama (LIKE '%wijen%').
// ============================================================
router.post('/system/koreksi-wijen', requireRole('admin'), async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  });

  const t = req.user.tenant_id;
  const log = (msg) => { res.write(msg + '\n'); };

  log('══════════════════════════════════════════════');
  log('  KOREKSI MINYAK WIJEN — via URL');
  log('  Tenant : id ' + t + ' (' + (req.user.nama || req.user.email || '') + ')');
  log('  Waktu  : ' + new Date().toLocaleString('id-ID'));
  log('══════════════════════════════════════════════\n');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // ── 1) Bahan & baris menu yang terdampak ────────────────
    const [rows] = await conn.query(
      `SELECT bb.id AS bahan_id, bb.nama, bb.satuan, bb.berat_per_satuan,
              mb.id AS mb_id, mb.menu_id, mb.jumlah AS jumlah_lama,
              m.jumlah_porsi, m.nama AS menu_nama
       FROM bahan_baku bb
       JOIN menu_bahan mb ON mb.bahan_baku_id = bb.id
       JOIN menu m ON m.id = mb.menu_id
       WHERE bb.tenant_id=? AND LOWER(bb.nama) LIKE '%wijen%'
         AND LOWER(bb.nama) NOT LIKE '% sp%'`,
      [t]
    );
    log('1) BAHAN & BARIS TERDAMPAK');
    if (!rows.length) {
      log('   ⚠ Tidak ada bahan bernama wijen untuk tenant ini — selesai (tanpa perubahan).');
      await conn.commit();
      log('');
      log('✓ Selesai.');
      res.end();
      return;
    }

    let total = 0, ok = 0, skip = 0;
    const affectedMenus = new Set();
    for (const r of rows) {
      total++;
      const bps = Number(r.berat_per_satuan) || 170; // fallback 170 g/botol
      const porsi = Number(r.jumlah_porsi) || 0;
      if (porsi <= 0) {
        skip++;
        log('   ⚠ SKIP: ' + r.nama + ' → "' + (r.menu_nama || 'menu tanpa porsi') + '" (jumlah_porsi ' + r.jumlah_porsi + ')');
        continue;
      }
      // 1 botol = bps gram total utk porsi tsb → gram per anak = bps / porsi.
      // Kolom menu_bahan.jumlah hanya DECIMAL(15,3) (3 desimal), jadi target
      // dibulatkan ke 3 desimal agar tersimpan persis (0,05946 → 0,059) dan
      // verifikasi tidak salah hitung (0,059 masih ≈ 1 botol: 0,059×2859 = 168,7 g).
      const target = Math.round((bps / porsi) * 1000) / 1000;
      log('   • ' + r.nama + ' (' + r.satuan + ', bps ' + bps + ' g) → menu "' + (r.menu_nama || r.menu_id) + '" (' + porsi + ' porsi): ' + r.jumlah_lama + ' → ' + target + ' g/anak');
      await conn.query('UPDATE menu_bahan SET jumlah=? WHERE id=?', [target, r.mb_id]);
      affectedMenus.add(r.menu_id);
      ok++;
    }
    log('');
    log('2) UPDATE JUMLAH');
    log('   ' + ok + ' baris di-set = 1 botol (' + skip + ' di-skip karena porsi kosong)');
    log('');

    // ── 3) Sinkronkan gramasi_total menu yang terdampak ───────
    log('3) GRAMASI MENU TERDAMPAK (' + affectedMenus.size + ')');
    for (const menuId of affectedMenus) {
      const [[g]] = await conn.query(
        'SELECT COALESCE(SUM(jumlah),0) s FROM menu_bahan WHERE menu_id=?', [menuId]
      );
      const gramasi = Math.round(Number(g.s) * 100) / 100;
      await conn.query('UPDATE menu SET gramasi_total=? WHERE id=? AND tenant_id=?', [gramasi, menuId, t]);
      log('   Menu id ' + menuId + ': gramasi_total → ' + gramasi + ' g');
    }
    log('');

    await conn.commit();

    // ── Verifikasi akhir ──────────────────────────────────────
    const [[v]] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM menu_bahan mb JOIN menu m ON m.id=mb.menu_id JOIN bahan_baku bb ON bb.id=mb.bahan_baku_id
           WHERE m.tenant_id=? AND LOWER(bb.nama) LIKE '%wijen%' AND LOWER(bb.nama) NOT LIKE '% sp%'
             AND mb.jumlah <> ROUND(COALESCE(NULLIF(bb.berat_per_satuan,0),170) / NULLIF(m.jumlah_porsi,0), 3)) AS belum,
         (SELECT COUNT(*) FROM menu_bahan mb JOIN menu m ON m.id=mb.menu_id JOIN bahan_baku bb ON bb.id=mb.bahan_baku_id
           WHERE m.tenant_id=? AND LOWER(bb.nama) LIKE '%wijen%' AND LOWER(bb.nama) NOT LIKE '% sp%') AS total`,
      [t, t]
    );
    log('──────────────────────────────────────────────');
    log('  VERIFIKASI AKHIR (tenant id ' + t + ')');
    log('  Baris wijen total        : ' + v.total);
    log('  Baris belum = 1 botol    : ' + v.belum + '  (harus 0)');
    log('──────────────────────────────────────────────');
    log('✓ Koreksi selesai — refresh /total-kebutuhan → Minyak Wijen tampil 1 BOTOL.');
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

// GET /system/koreksi-wijen — halaman trigger koreksi (web UI)
router.get('/system/koreksi-wijen', requireRole('admin'), (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><title>Koreksi Minyak Wijen</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-100 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-11 h-11 rounded-xl bg-yellow-100 flex items-center justify-center">
        <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.4 7.2H22l-6 4.4 2.3 7.4-6.3-4.6-6.3 4.6L8 13.6 2 9.2h7.6z"/></svg>
      </div>
      <div>
        <h1 class="text-xl font-bold text-stone-800">Koreksi Minyak Wijen</h1>
        <p class="text-xs text-stone-500">Set Minyak Wijen di semua menu = 1 botol via URL — tanpa SSH/mysql.</p>
      </div>
    </div>

    <p class="text-sm text-stone-600 leading-relaxed mb-4">
      Menyetel <code class="bg-stone-100 px-1.5 py-0.5 rounded text-xs">menu_bahan.jumlah</code> Minyak Wijen sehingga kebutuhan
      total = <b>1 botol</b> per hari (gram per anak = berat_per_satuan ÷ jumlah porsi menu,
      mis. 170 g ÷ 2.859 porsi ≈ 0,0595 g/anak). Aman & idempotent, hanya untuk tenant Anda.
    </p>

    <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-xs text-amber-800">
      <strong>⚠️ Disarankan:</strong> unduh backup dulu via <code class="bg-amber-100 px-1 rounded">/api/system/backup</code>.
    </div>

    <button onclick="runFix()" id="btn" class="w-full bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-3 rounded-xl font-semibold transition shadow-md">
      Jalankan Koreksi Minyak Wijen
    </button>
    <pre id="output" class="mt-4 bg-stone-900 text-green-400 p-4 rounded-xl text-xs font-mono leading-relaxed overflow-auto max-h-96 hidden"></pre>
  </div>
  <script>
    async function runFix() {
      if (!confirm('Set Minyak Wijen = 1 botol di semua menu sekarang?')) return;
      const btn = document.getElementById('btn');
      const out = document.getElementById('output');
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      out.classList.remove('hidden');
      out.textContent = '';
      try {
        const r = await fetch('/api/system/koreksi-wijen', { method: 'POST', credentials: 'include' });
        if (!r.ok) { out.textContent += 'HTTP ' + r.status + ': ' + (await r.text()); return; }
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
      btn.textContent = 'Jalankan Koreksi Minyak Wijen';
    }
  </script>
</body>
</html>`);
});

// ============================================================
// POST /system/koreksi-berat-pcs — perbaiki berat_per_satuan bahan satuan unit
// (pcs/buah/biji/butir/ekor) menjadi berat KOTOR 1 unit = berat_1_sp ÷ (BDD/100),
// agar QTY di /total-kebutuhan menjadi = jumlah siswa (≈1 unit per siswa).
//
// Latar belakang: Jeruk berat_1_sp = 55 g (daging) & BDD = 72% → berat kotor
// 1 buah = 55 ÷ 0,72 = 76,39 g. Kalau berat_per_satuan diisi 55 g (berat bersih)
// QTY membengkak (3971 pcs); diisi 76 g (dibulatkan) QTY meleset (2874 pcs);
// baru diisi 76,39 g QTY tepat = jumlah siswa (2859 pcs).
//
// Mode: dry-run (default) / apply ({ apply: true }).
// Opsional filter { kata: 'jeruk' } → hanya bahan yang namanya mengandung kata tsb
// (bermanfaat untuk menargetkan bahan tertentu saja di server produksi).
// Keamanan: tanpa filter, apply HANYA mengubah pola error yang jelas (bps = 0
// atau bps = berat_1_sp persis). Baris SP referensi (nama mengandung ' SP')
// tidak disentuh. Idempotent, per tenant login.
// ============================================================
router.post('/system/koreksi-berat-pcs', requireRole('admin'), async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  });

  const t = req.user.tenant_id;
  const apply = !!(req.body && req.body.apply);
  const kata = (req.body && req.body.kata ? String(req.body.kata).trim() : '').toLowerCase();
  const log = (msg) => { res.write(msg + '\n'); };

  log('══════════════════════════════════════════════');
  log('  KOREKSI BERAT PER SATUAN (satuan unit) — via URL');
  log('  Tenant : id ' + t + ' (' + (req.user.nama || req.user.email || '') + ')');
  log('  Waktu  : ' + new Date().toLocaleString('id-ID'));
  log('  Mode   : ' + (apply ? 'APPLY (data diubah)' : 'DRY-RUN (hanya preview)'));
  if (kata) log('  Filter : nama mengandung "' + kata + '"');
  log('══════════════════════════════════════════════\n');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Bahan belanja satuan unit (bukan baris SP referensi)
    const [rows] = await conn.query(
      `SELECT bb.id, bb.nama, bb.satuan, bb.berat_1_sp, bb.persen_bdd, bb.berat_per_satuan
       FROM bahan_baku bb
       WHERE bb.tenant_id = ?
         AND LOWER(bb.satuan) IN ('pcs','buah','biji','butir','ekor')
         AND LOWER(bb.nama) NOT LIKE '% sp%'`,
      [t]
    );
    const list = kata
      ? rows.filter(r => String(r.nama || '').toLowerCase().includes(kata))
      : rows;

    log('BAHAN SATUAN UNIT (' + list.length + ' bahan' + (kata ? ' sesuai filter' : '') + ')');
    if (!list.length) {
      log('   ⚠ Tidak ada bahan yang cocok — selesai (tanpa perubahan).');
      await conn.commit();
      log('');
      log('✓ Selesai.');
      res.end();
      return;
    }

    let belumBisa = 0, sudahBenar = 0, toFix = 0, fixed = 0;
    for (const r of list) {
      const berat1sp = Number(r.berat_1_sp) || 0;
      const bdd = Number(r.persen_bdd) || 0;
      const cur = Number(r.berat_per_satuan) || 0;

      if (berat1sp <= 0 || bdd <= 0) {
        belumBisa++;
        log('   ⚠ SKIP (berat_1_sp/BDD belum diisi): ' + r.nama + ' (' + r.satuan + ')');
        continue;
      }
      // Berat kotor 1 unit agar 1 unit ≈ 1 porsi siswa: berat_1_sp ÷ (BDD/100)
      const target = Math.round((berat1sp / (bdd / 100)) * 100) / 100;
      const sudahBenarRow = cur > 0 && Math.abs(cur - target) < 0.005;
      // Pola error yang jelas & aman diubah tanpa filter: bps kosong / bps = berat bersih (berat_1_sp)
      const polaError = cur === 0 || (cur > 0 && Math.abs(cur - berat1sp) < 0.005);
      const akanDiubah = !sudahBenarRow && (kata ? true : polaError);

      const prev = cur > 0 ? cur : '(kosong)';
      if (sudahBenarRow) {
        sudahBenar++;
        log('   ✓ ' + r.nama + ' (' + r.satuan + '): bps ' + prev + ' g — sudah tepat ' + target + ' g');
        continue;
      }
      toFix++;
      if (apply && akanDiubah) {
        await conn.query('UPDATE bahan_baku SET berat_per_satuan=? WHERE id=? AND tenant_id=?', [target, r.id, t]);
        fixed++;
      }
      const tanda = apply && akanDiubah ? '✓' : (akanDiubah ? '•' : '○');
      log('   ' + tanda + ' ' + r.nama + ' (' + r.satuan + '): ' + prev + ' g → ' + target + ' g' +
        (akanDiubah ? '' : '  (butuh filter kata utk diterapkan)'));
    }

    log('');
    if (apply) {
      log('Update: ' + fixed + ' bahan disetel (' + sudahBenar + ' sudah benar, ' + belumBisa + ' tak bisa dihitung)');
    } else {
      log('Dry-run: ' + toFix + ' bahan perlu disetel (' + sudahBenar + ' sudah benar, ' + belumBisa + ' tak bisa dihitung)');
      log('Jalankan ulang dengan { "apply": true } untuk menyimpan.');
    }

    if (apply) await conn.commit();
    else await conn.rollback(); // dry-run: jangan simpan apa pun

    // Verifikasi akhir — hitung bahan satuan unit yang bps-nya belum = target.
    // Bila ada filter kata, verifikasi discope ke bahan tsb saja (agar angkanya
    // relevan dengan yang baru saja dikoreksi, bukan seluruh tenant).
    const kataLike = '%' + kata + '%';
    const kataWhere = kata ? ' AND LOWER(nama) LIKE ?' : '';
    const vParams = kata ? [t, kataLike, t, kataLike] : [t, t];
    const [[v]] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM bahan_baku WHERE tenant_id=? AND LOWER(satuan) IN ('pcs','buah','biji','butir','ekor')
            AND LOWER(nama) NOT LIKE '% sp%'${kataWhere}
            AND berat_1_sp>0 AND persen_bdd>0
            AND (berat_per_satuan IS NULL OR berat_per_satuan=0
                 OR ABS(berat_per_satuan - ROUND(berat_1_sp/(persen_bdd/100)*100)/100) >= 0.005)) AS belum_tepat,
         (SELECT COUNT(*) FROM bahan_baku WHERE tenant_id=? AND LOWER(satuan) IN ('pcs','buah','biji','butir','ekor')
            AND LOWER(nama) NOT LIKE '% sp%'${kataWhere} AND berat_1_sp>0 AND persen_bdd>0) AS total`,
      vParams
    );
    log('──────────────────────────────────────────────');
    log('  VERIFIKASI (tenant id ' + t + ')');
    log('  Bahan satuan unit total    : ' + v.total);
    log('  Belum tepat (bps ≠ target) : ' + v.belum_tepat + '  (tanpa filter hanya pola error yg diubah)');
    log('  Aturan: QTY pcs = jumlah siswa bila berat_per_satuan = berat_1_sp ÷ BDD.');
    log('──────────────────────────────────────────────');
    log(apply ? '✓ Koreksi selesai — perubahan tersimpan (commit).' : '✓ Dry-run selesai — tidak ada perubahan tersimpan.');
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

// GET /system/koreksi-berat-pcs — halaman trigger (web UI)
router.get('/system/koreksi-berat-pcs', requireRole('admin'), (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><title>Koreksi Berat Per Satuan (PCS)</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-100 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center">
        <svg class="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 3v18m-7-7l7 7 7-7"/></svg>
      </div>
      <div>
        <h1 class="text-xl font-bold text-stone-800">Koreksi Berat Per Satuan (PCS)</h1>
        <p class="text-xs text-stone-500">Set berat_per_satuan bahan satuan unit = berat kotor 1 unit — tanpa SSH/mysql.</p>
      </div>
    </div>

    <p class="text-sm text-stone-600 leading-relaxed mb-4">
      Agar <b>QTY pcs = jumlah siswa</b> di /total-kebutuhan, berat_per_satuan harus diisi
      <b>berat kotor 1 unit</b> (= <code class="bg-stone-100 px-1.5 py-0.5 rounded text-xs">berat_1_sp ÷ (BDD/100)</code>),
      bukan berat bersihnya. Contoh: Jeruk 55 g & BDD 72% → <b>76,39 g</b>.
      Bila diisi 55 g QTY membengkak (3971 pcs), bila 76 g meleset (2874 pcs).
    </p>
    <ul class="text-sm text-stone-700 space-y-1.5 mb-5">
      <li class="flex items-start gap-2"><span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0"></span>
        <span><b>PCS / Buah / Biji / Butir / Ekor</b> — dihitung otomatis dari berat_1_sp & BDD</span></li>
      <li class="flex items-start gap-2"><span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-stone-300 shrink-0"></span>
        <span>Baris SP referensi (nama berisi " SP") dan satuan lain (kg, karton, ikat, dst.) tidak disentuh</span></li>
      <li class="flex items-start gap-2"><span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-stone-300 shrink-0"></span>
        <span>Tanpa filter, hanya pola error jelas (bps kosong / bps = berat bersih) yang diubah</span></li>
    </ul>

    <div class="mb-4">
      <label class="block text-sm font-medium text-stone-700 mb-1">Filter nama bahan (opsional)</label>
      <input type="text" id="kataInput" placeholder="mis. jeruk — kosongkan utk semua satuan unit"
             class="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none">
      <p class="text-xs text-stone-400 mt-1">Jika diisi, semua bahan yang namanya mengandung kata tsb akan disetel (bukan hanya pola error).</p>
    </div>

    <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-xs text-amber-800">
      <strong>⚠️ Disarankan:</strong> unduh backup dulu via <code class="bg-amber-100 px-1 rounded">/api/system/backup</code>.
      Jalankan <b>Dry Run</b> dulu untuk preview, lalu <b>Jalankan Koreksi</b>.
    </div>

    <div class="flex gap-3 mb-6">
      <button onclick="runFix(false)" id="btn-dry" class="flex-1 bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
        1. Dry Run (Preview)
      </button>
      <button onclick="runFix(true)" id="btn-apply" class="flex-1 bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
        2. Jalankan Koreksi
      </button>
    </div>

    <pre id="output" class="bg-stone-900 text-green-400 p-4 rounded-xl text-xs font-mono leading-relaxed overflow-auto max-h-96 hidden"></pre>
  </div>
  <script>
    async function runFix(apply) {
      const btn = apply ? document.getElementById('btn-apply') : document.getElementById('btn-dry');
      if (apply && !confirm('Setel berat_per_satuan bahan satuan unit sekarang?')) return;
      const out = document.getElementById('output');
      const kata = document.getElementById('kataInput').value.trim();
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      out.classList.remove('hidden');
      out.textContent = '';
      try {
        const r = await fetch('/api/system/koreksi-berat-pcs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apply, kata: kata || undefined }),
          credentials: 'include'
        });
        if (!r.ok) { out.textContent += 'HTTP ' + r.status + ': ' + (await r.text()); return; }
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

// ============================================================
// POST /system/koreksi-menu-bahan-bersih — perbaiki menu_bahan.jumlah yang
// tersimpan sebagai berat KOTOR (mis. Jeruk 76,39 g) padahal kolom itu harus
// berat BERSIH (55 g = 1 SP). Akibatnya RAB membagi BDD dua kali → QTY Jeruk
// jadi 3971 pcs (bukan = jumlah siswa 2859).
//
// Latar: menu yang bahan-nya diambil dari siklus (data lama / versi lama)
// menyimpan jumlah = berat kotor. Bila dihapus & diisi ulang normal → 55 g →
// QTY = jumlah PM. Endpoint ini mengoreksi data yang tersimpan salah secara
// massal, lalu menghitung ulang nutrisi menu terdampak.
//
// Aman: hanya mengubah baris yang TERBUKTI pola kotor (jumlah ≈ berat_1_sp ÷ BDD
// ATAU ≈ berat_kotor referensi SP, dan ≠ berat bersih), dan hanya untuk bahan
// satuan unit (pcs/buah/biji/butir/ekor) — bahan satuan berat hanya dilaporkan.
// Mode: dry-run (default) / apply ({ apply: true }). Idempotent, per tenant.
// ============================================================
router.post('/system/koreksi-menu-bahan-bersih', requireRole('admin'), async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  });

  const t = req.user.tenant_id;
  const apply = !!(req.body && req.body.apply);
  const log = (msg) => { res.write(msg + '\n'); };

  log('══════════════════════════════════════════════');
  log('  KOREKSI JUMLAH MENU BAHAN (kotor → bersih) — via URL');
  log('  Tenant : id ' + t + ' (' + (req.user.nama || req.user.email || '') + ')');
  log('  Waktu  : ' + new Date().toLocaleString('id-ID'));
  log('  Mode   : ' + (apply ? 'APPLY (data diubah)' : 'DRY-RUN (hanya preview)'));
  log('══════════════════════════════════════════════\n');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { loadSpRefMap, calculateNutrition } = require('./menu/helpers');
    const spRefMap = await loadSpRefMap(t);

    // Referensi SP (berat bersih + kotor) utk bahan yang berat_1_sp master kosong
    const [refs] = await conn.query(
      'SELECT nama, berat_bersih, berat_kotor FROM sp_referensi_bahan WHERE tenant_id=?',
      [t]
    );
    const refByNama = {};
    for (const r of refs) {
      refByNama[String(r.nama).toLowerCase()] = {
        bersih: Number(r.berat_bersih) || 0,
        kotor: Number(r.berat_kotor) || 0,
      };
    }

    const SATUAN_UNIT = ['pcs', 'buah', 'biji', 'butir', 'ekor'];

    const [rows] = await conn.query(
      `SELECT mb.id, mb.menu_id, mb.jumlah, b.nama, b.satuan, b.berat_1_sp, b.persen_bdd, m.nama AS menu_nama
       FROM menu_bahan mb
       JOIN bahan_baku b ON b.id = mb.bahan_baku_id
       JOIN menu m ON m.id = mb.menu_id
       WHERE m.tenant_id = ?
       ORDER BY mb.id`,
      [t]
    );

    log('MEMINDAI ' + rows.length + ' BARIS MENU_BAHAN…\n');
    if (!rows.length) {
      log('   ⚠ Tidak ada baris menu_bahan untuk tenant ini — selesai.');
      await conn.commit();
      log('');
      log('✓ Selesai.');
      res.end();
      return;
    }

    const affectedMenus = new Set();
    let kotorUnit = 0, kotorNonUnit = 0, takBisa = 0, fixed = 0;
    for (const r of rows) {
      const jml = Number(r.jumlah) || 0;
      const b1 = Number(r.berat_1_sp) || 0;
      const bdd = Number(r.persen_bdd) || 100;
      const sat = String(r.satuan || '').toLowerCase();
      const ref = refByNama[String(r.nama).toLowerCase()] || {};

      const bersih = b1 > 0 ? b1 : (ref.bersih || 0);
      let kotor = 0;
      if (b1 > 0 && bdd > 0) kotor = Math.round((b1 / (bdd / 100)) * 100) / 100;
      else kotor = ref.kotor || 0;

      if (!bersih || !kotor) { takBisa++; continue; }

      // Pola salah: jumlah ≈ berat kotor TAPI ≠ berat bersih
      const isKotor = Math.abs(jml - kotor) < 0.02 && Math.abs(jml - bersih) > 0.02;
      if (!isKotor) continue;

      const label = r.nama + ' — "' + (r.menu_nama || 'menu ' + r.menu_id) + '" (menu ' + r.menu_id + ')';
      if (!SATUAN_UNIT.includes(sat)) {
        kotorNonUnit++;
        log('   ⚠ SATUAN BERAT (cek manual): ' + label + ' | jumlah=' + r.jumlah + ' (kotor ' + kotor + ', bersih ' + bersih + ')');
        continue;
      }

      kotorUnit++;
      if (apply) {
        await conn.query('UPDATE menu_bahan SET jumlah=? WHERE id=?', [bersih, r.id]);
        affectedMenus.add(r.menu_id);
        fixed++;
      }
      log('   ' + (apply ? '✓' : '•') + ' ' + label + ' | jumlah ' + r.jumlah + ' → ' + bersih + ' g (bersih)');
    }

    log('');
    if (apply) {
      log('Update: ' + fixed + ' baris dikoreksi ke berat bersih (skip ' + takBisa + ' tak bisa, ' + kotorNonUnit + ' satuan berat dicatat)');
      // Hitung ulang nutrisi menu terdampak
      if (affectedMenus.size) {
        const ph = [...affectedMenus].map(() => '?').join(',');
        const [bahanRows] = await conn.query(
          `SELECT mb.menu_id, mb.jumlah, bb.nama, bb.kalori, bb.protein, bb.karbohidrat, bb.lemak, bb.serat
           FROM menu_bahan mb JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
           WHERE mb.menu_id IN (${ph})`,
          [...affectedMenus]
        );
        const byMenu = {};
        for (const br of bahanRows) {
          if (!byMenu[br.menu_id]) byMenu[br.menu_id] = [];
          byMenu[br.menu_id].push(br);
        }
        for (const mid of affectedMenus) {
          const nut = calculateNutrition(byMenu[mid] || [], spRefMap);
          await conn.query(
            'UPDATE menu SET gramasi_total=?, kalori=?, protein=?, karbohidrat=?, lemak=?, serat=? WHERE id=? AND tenant_id=?',
            [nut.gramasi, nut.kalori, nut.protein, nut.karbohidrat, nut.lemak, nut.serat, mid, t]
          );
          log('   ↻ Nutrisi menu ' + mid + ' dihitung ulang (gramasi ' + nut.gramasi + ' g)');
        }
      }
    } else {
      log('Dry-run: ' + kotorUnit + ' baris perlu dikoreksi (skip ' + takBisa + ' tak bisa, ' + kotorNonUnit + ' satuan berat dicatat)');
      log('Jalankan ulang dengan { "apply": true } untuk menyimpan.');
    }

    if (apply) await conn.commit();
    else await conn.rollback();

    // Verifikasi akhir — sisa pola kotor utk bahan satuan unit
    const [checkRows] = await conn.query(
      `SELECT mb.id FROM menu_bahan mb
       JOIN bahan_baku b ON b.id = mb.bahan_baku_id
       JOIN menu m ON m.id = mb.menu_id
       LEFT JOIN sp_referensi_bahan r ON r.tenant_id = b.tenant_id AND LOWER(r.nama) = LOWER(b.nama)
       WHERE m.tenant_id = ? AND LOWER(b.satuan) IN ('pcs','buah','biji','butir','ekor')
         AND b.berat_1_sp > 0 AND b.persen_bdd > 0
         AND ABS(mb.jumlah - ROUND(b.berat_1_sp/(b.persen_bdd/100)*100)/100) < 0.02
         AND ABS(mb.jumlah - b.berat_1_sp) > 0.02`,
      [t]
    );
    log('──────────────────────────────────────────────');
    log('  VERIFIKASI (tenant id ' + t + ')');
    log('  Sisa pola jumlah=berat kotor (satuan unit) : ' + checkRows.length + (apply && checkRows.length === 0 ? '  ✓ bersih' : ''));
    log('  Aturan: menu_bahan.jumlah harus berat BERSIH (1 SP), bukan berat kotor.');
    log('──────────────────────────────────────────────');
    log(apply ? '✓ Koreksi selesai — perubahan tersimpan (commit).' : '✓ Dry-run selesai — tidak ada perubahan tersimpan.');
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

// GET /system/koreksi-menu-bahan-bersih — halaman trigger (web UI)
router.get('/system/koreksi-menu-bahan-bersih', requireRole('admin'), (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><title>Koreksi Jumlah Menu Bahan</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-100 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-11 h-11 rounded-xl bg-lime-100 flex items-center justify-center">
        <svg class="w-6 h-6 text-lime-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 3v18m-7-7l7 7 7-7"/></svg>
      </div>
      <div>
        <h1 class="text-xl font-bold text-stone-800">Koreksi Jumlah Menu Bahan</h1>
        <p class="text-xs text-stone-500">Perbaiki menu_bahan.jumlah yang tersimpan sebagai berat kotor — tanpa SSH/mysql.</p>
      </div>
    </div>

    <p class="text-sm text-stone-600 leading-relaxed mb-4">
      Saat bahan menu diambil dari siklus, <code class="bg-stone-100 px-1.5 py-0.5 rounded text-xs">menu_bahan.jumlah</code>
      sebagian tersimpan sebagai <b>berat kotor</b> (mis. Jeruk <b>76,39 g</b>) padahal kolom itu harus
      <b>berat bersih 1 SP</b> (55 g). Akibatnya RAB membagi BDD dua kali → QTY Jeruk <b>3971 pcs</b>
      (bukan = jumlah siswa 2859). Endpoint ini mengembalikan ke berat bersih + menghitung ulang nutrisi menu.
    </p>
    <ul class="text-sm text-stone-700 space-y-1.5 mb-5">
      <li class="flex items-start gap-2"><span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-lime-500 shrink-0"></span>
        <span>Hanya baris yang <b>terbukti pola kotor</b> (jumlah ≈ berat_1_sp ÷ BDD) yang diubah</span></li>
      <li class="flex items-start gap-2"><span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-stone-300 shrink-0"></span>
        <span>Khusus bahan <b>satuan unit</b> (PCS/Buah/Biji/Butir/Ekor); satuan berat hanya dicatat</span></li>
      <li class="flex items-start gap-2"><span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-stone-300 shrink-0"></span>
        <span>Setelahnya jalankan juga <code class="bg-stone-100 px-1 rounded">koreksi-berat-pcs</code> agar berat_per_satuan benar</span></li>
    </ul>

    <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-xs text-amber-800">
      <strong>⚠️ Disarankan:</strong> unduh backup dulu via <code class="bg-amber-100 px-1 rounded">/api/system/backup</code>.
      Jalankan <b>Dry Run</b> dulu untuk preview, lalu <b>Jalankan Koreksi</b>.
    </div>

    <div class="flex gap-3 mb-6">
      <button onclick="runFix(false)" id="btn-dry" class="flex-1 bg-lime-600 hover:bg-lime-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
        1. Dry Run (Preview)
      </button>
      <button onclick="runFix(true)" id="btn-apply" class="flex-1 bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
        2. Jalankan Koreksi
      </button>
    </div>

    <pre id="output" class="bg-stone-900 text-green-400 p-4 rounded-xl text-xs font-mono leading-relaxed overflow-auto max-h-96 hidden"></pre>
  </div>
  <script>
    async function runFix(apply) {
      const btn = apply ? document.getElementById('btn-apply') : document.getElementById('btn-dry');
      if (apply && !confirm('Perbaiki jumlah menu_bahan ke berat bersih sekarang? Nutrisi menu akan dihitung ulang.')) return;
      const out = document.getElementById('output');
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      out.classList.remove('hidden');
      out.textContent = '';
      try {
        const r = await fetch('/api/system/koreksi-menu-bahan-bersih', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apply }),
          credentials: 'include'
        });
        if (!r.ok) { out.textContent += 'HTTP ' + r.status + ': ' + (await r.text()); return; }
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

// ============================================================
// POST /system/cek-bahan — diagnosis data bahan (READ-ONLY, via URL)
// untuk memverifikasi mengapa angka di /menu (berat BERSIH) berbeda
// dari /total-kebutuhan (berat KOTOR + buffer). Contoh: Labu Siam
// 120 kg di /menu vs 145/149 kg di /total-kebutuhan.
//
// Tidak mengubah data apa pun — hanya laporan. Per bahan menampilkan:
//   1) master bahan_baku (berat_1_sp, persen_bdd, berat_per_satuan, buffer)
//   2) referensi SP (berat_bersih, bdd, berat_kotor) bila ada
//   3) semua baris menu_bahan (jumlah) + klasifikasi bersih/kotor
//   4) simulasi angka Total Kebutuhan (bersih → kotor → +buffer)
// Opsional filter body { kata: 'labu' } → hanya bahan yang namanya mengandung kata tsb.
// ============================================================
router.post('/system/cek-bahan', requireRole('admin'), async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  });

  const t = req.user.tenant_id;
  const kata = (req.body && req.body.kata ? String(req.body.kata).trim() : '').toLowerCase();
  const log = (msg) => { res.write(msg + '\n'); };

  log('══════════════════════════════════════════════');
  log('  DIAGNOSIS DATA BAHAN — via URL (READ-ONLY)');
  log('  Tenant : id ' + t + ' (' + (req.user.nama || req.user.email || '') + ')');
  log('  Waktu  : ' + new Date().toLocaleString('id-ID'));
  if (kata) log('  Filter : nama mengandung "' + kata + '"');
  log('══════════════════════════════════════════════\n');

  const conn = await db.getConnection();
  try {
    // Siklus aktif (utk simulasi jumlah porsi)
    const [siklus] = await conn.query(
      "SELECT id, nama, jumlah_porsi FROM siklus_menu WHERE tenant_id=? AND status<>'Arsip' ORDER BY id DESC LIMIT 1",
      [t]
    );
    const porsi = siklus.length ? Number(siklus[0].jumlah_porsi) || 0 : 0;
    log('Siklus aktif : ' + (siklus.length ? siklus[0].nama + ' (' + porsi + ' porsi)' : 'tidak ada'));
    log('');

    // Referensi SP (nama → bersih/bdd/kotor)
    const [refs] = await conn.query('SELECT nama, berat_bersih, bdd_persen, berat_kotor FROM sp_referensi_bahan WHERE tenant_id=?', [t]);
    const refMap = {};
    for (const r of refs) refMap[String(r.nama).toLowerCase()] = {
      bersih: Number(r.berat_bersih) || 0,
      bdd: Number(r.bdd_persen) || 0,
      kotor: Number(r.berat_kotor) || 0,
    };

    // Bahan yang cocok filter (tanpa filter: semua bahan satuan unit + bahan dengan b1sp>0, max 60)
    let rows;
    if (kata) {
      const [r] = await conn.query(
        `SELECT bb.id, bb.nama, bb.satuan, bb.kategori_sp, bb.berat_1_sp, bb.persen_bdd, bb.berat_per_satuan, bb.buffer_persen
         FROM bahan_baku bb
         WHERE bb.tenant_id=? AND LOWER(bb.nama) LIKE ?
         ORDER BY bb.nama LIMIT 60`,
        [t, '%' + kata + '%']
      );
      rows = r;
    } else {
      const [r] = await conn.query(
        `SELECT bb.id, bb.nama, bb.satuan, bb.kategori_sp, bb.berat_1_sp, bb.persen_bdd, bb.berat_per_satuan, bb.buffer_persen
         FROM bahan_baku bb
         WHERE bb.tenant_id=?
           AND (LOWER(bb.satuan) IN ('pcs','buah','biji','butir','ekor') OR bb.berat_1_sp>0)
         ORDER BY bb.nama LIMIT 60`,
        [t]
      );
      rows = r;
    }

    log('BAHAN DIPERIKSA: ' + rows.length + ' baris' + (rows.length === 60 ? ' (batas 60, perketat dengan filter kata)' : '') + '\n');
    if (!rows.length) {
      log('   ⚠ Tidak ada bahan yang cocok.');
      log('');
      log('✓ Selesai (read-only — tidak ada perubahan data).');
      res.end();
      return;
    }

    const SATUAN_UNIT = ['pcs', 'buah', 'biji', 'butir', 'ekor'];
    for (const bb of rows) {
      const nama = bb.nama;
      const sat = String(bb.satuan || '').toLowerCase();
      const b1sp = Number(bb.berat_1_sp) || 0;
      const bdd = Number(bb.persen_bdd) || 100;
      const bps = Number(bb.berat_per_satuan) || 0;
      const buffer = Number(bb.buffer_persen) || 0;
      const ref = refMap[String(nama).toLowerCase()] || {};

      log('──────────────────────────────────────────────');
      log('Bahan : ' + nama + ' (id ' + bb.id + ', ' + sat + ', ' + (bb.kategori_sp || '-') + ')');
      log('  master  : berat_1_sp=' + b1sp + ' g | BDD=' + bdd + '% | berat_per_satuan=' + bps + ' g | buffer=' + buffer + '%');
      if (ref.bersih) {
        log('  SP ref  : bersih=' + ref.bersih + ' g | BDD=' + Math.round(ref.bdd * 100) + '% | kotor=' + ref.kotor + ' g');
      } else {
        log('  SP ref  : (tidak ada baris referensi)' + (b1sp ? ' — master dipakai' : ' — ⚠ berat kosong'));
      }

      // Simulasi per porsi
      const bersihPerPorsi = b1sp > 0 ? b1sp : (ref.bersih || 0);
      const bddDec = bdd > 0 ? bdd / 100 : (ref.bdd || 1);
      const kotorPerPorsi = bersihPerPorsi > 0 && bddDec > 0 ? Math.round((bersihPerPorsi / bddDec) * 100) / 100 : 0;
      if (bersihPerPorsi > 0 && porsi > 0) {
        const totalBersih = bersihPerPorsi * porsi / 1000;
        const totalKotor = kotorPerPorsi * porsi / 1000;
        const totalBuffer = Math.round(totalKotor * (1 + buffer / 100) * 100) / 100;
        log('  simulasi : BERSIH ' + Math.round(totalBersih) + ' kg → KOTOR ' + Math.round(totalKotor) + ' kg' +
          (buffer > 0 ? ' → +' + buffer + '% buffer = ' + Math.ceil(totalBuffer) + ' kg' : '') +
          '  (utk ' + porsi + ' porsi/hari, bahan ini muncul 1 hari)');
      } else {
        log('  simulasi : (berat per porsi kosong — bahan tidak bisa dihitung)' + (sat === 'kg' ? ' — satuan Kg' : ''));
      }

      // Semua baris menu_bahan
      const [mb] = await conn.query(
        `SELECT mb.id, mb.menu_id, mb.jumlah, m.nama AS menu_nama,
           (SELECT COUNT(*) FROM siklus_menu_item si WHERE si.menu_id=mb.menu_id) AS hari_dipakai
         FROM menu_bahan mb
         JOIN menu m ON m.id = mb.menu_id
         WHERE mb.bahan_baku_id=? AND m.tenant_id=?`,
        [bb.id, t]
      );
      if (!mb.length) {
        log('  menu_bahan: (tidak dipakai menu mana pun)');
      } else {
        for (const r of mb) {
          const jml = Number(r.jumlah) || 0;
          let klas = '';
          if (SATUAN_UNIT.includes(sat)) {
            const kotorUnit = kotorPerPorsi; // berat kotor 1 unit
            if (jml > 0 && Math.abs(jml - kotorUnit) < 0.02 && Math.abs(jml - bersihPerPorsi) > 0.02) klas = ' ⚠ TERSIMPAN KOTOR (jalankan koreksi-menu-bahan-bersih)';
            else if (jml > 0 && Math.abs(jml - bersihPerPorsi) < 0.02) klas = ' ✓ benar (bersih)';
            else if (jml > 0) klas = ' (manual — cek manual)';
          } else {
            const refKotor1SP = ref.kotor || 0;
            if (jml > 0 && refKotor1SP > 0 && Math.abs(jml - refKotor1SP) < 0.02 && Math.abs(jml - (ref.bersih || 0)) > 0.02) klas = ' ⚠ ≈ kotor 1 SP dari referensi';
            else if (jml > 0) klas = ' ✓';
          }
          log('  menu_bahan id ' + r.id + ' | menu ' + r.menu_id + ' "' + (r.menu_nama || '').slice(0, 40) + '" | jumlah=' + r.jumlah + ' g' + klas + ' | dipakai ' + r.hari_dipakai + ' hari');
        }
      }
      log('');
    }

    log('══════════════════════════════════════════════');
    log('  CATATAN PEMBACAAN');
    log('  • /menu menampilkan berat BERSIH per porsi × porsi (yang dimakan).');
    log('  • /total-kebutuhan memakai berat KOTOR (= bersih ÷ BDD) utk belanja.');
    log('  • Selisih menu vs TK = faktor BDD (susut) + buffer — itu disengaja.');
    log('  • Kalau menu_bahan.jumlah ternyata ≈ kotor → jalankan koreksi-menu-bahan-bersih.');
    log('══════════════════════════════════════════════');
    log('✓ Selesai (read-only — tidak ada perubahan data).');
  } catch (err) {
    log('');
    log('✗ Gagal: ' + err.message);
  } finally {
    conn.release();
  }
  res.end();
});

// GET /system/cek-bahan — halaman trigger diagnosis (web UI)
router.get('/system/cek-bahan', requireRole('admin'), (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><title>Cek Data Bahan</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-100 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-8 max-w-3xl w-full">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center">
        <svg class="w-6 h-6 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
      </div>
      <div>
        <h1 class="text-xl font-bold text-stone-800">Cek Data Bahan</h1>
        <p class="text-xs text-stone-500">Diagnosis angka bahan (menu vs total-kebutuhan) via URL — read-only, tanpa SSH/mysql.</p>
      </div>
    </div>

    <p class="text-sm text-stone-600 leading-relaxed mb-4">
      Menampilkan master bahan, referensi SP, semua baris <code class="bg-stone-100 px-1.5 py-0.5 rounded text-xs">menu_bahan</code>,
      dan simulasi angka Total Kebutuhan (bersih → kotor → +buffer).
      Berguna untuk memverifikasi kasus seperti Labu Siam 120 kg di /menu vs 145/149 kg di /total-kebutuhan.
    </p>

    <div class="mb-4">
      <label class="block text-sm font-medium text-stone-700 mb-1">Filter nama bahan (opsional)</label>
      <input type="text" id="kataInput" placeholder="mis. labu, telur, jeruk — kosongkan utk semua bahan unit/berisi"
             class="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none">
    </div>

    <button onclick="runCek()" id="btn" class="w-full bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-xl font-semibold transition shadow-md">
      Jalankan Diagnosis
    </button>
    <pre id="output" class="mt-4 bg-stone-900 text-green-400 p-4 rounded-xl text-xs font-mono leading-relaxed overflow-auto max-h-[70vh] hidden"></pre>
  </div>
  <script>
    async function runCek() {
      const btn = document.getElementById('btn');
      const out = document.getElementById('output');
      const kata = document.getElementById('kataInput').value.trim();
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      out.classList.remove('hidden');
      out.textContent = '';
      try {
        const r = await fetch('/api/system/cek-bahan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kata: kata || undefined }),
          credentials: 'include'
        });
        if (!r.ok) { out.textContent += 'HTTP ' + r.status + ': ' + (await r.text()); return; }
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
      btn.textContent = 'Jalankan Diagnosis';
    }
  </script>
</body>
</html>`);
});

// ============================================================
// POST /system/koreksi-bdd-100 — set persen_bdd = 100 (0% susut) utk bahan
// belanja tertentu via URL, agar angka /total-kebutuhan = angka /menu.
//
// Latar: /menu menampilkan berat BERSIH per porsi × porsi (mis. Labu Siam
// 41,973 g × 2859 = 120 kg), tapi /total-kebutuhan mengonversi ke berat KOTOR
// belanja dengan membagi BDD (mis. 41,973 ÷ 0,83 × 2859 = 145 kg). Selisih ini
// disengaja (susut), namun bila user menghendaki angka belanja = angka menu
// (mis. Labu Siam 120 kg), set BDD bahan tsb menjadi 100.
//
// Aman: filter kata WAJIB untuk apply ({ apply:true, kata:'labu' }) — tanpa
// filter hanya menampilkan daftar bahan belanja ber-BDD < 100. Baris SP
// referensi (nama mengandung ' SP') tidak disentuh. Idempotent, per tenant.
// ============================================================
router.post('/system/koreksi-bdd-100', requireRole('admin'), async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  });

  const t = req.user.tenant_id;
  const apply = !!(req.body && req.body.apply);
  const kata = (req.body && req.body.kata ? String(req.body.kata).trim() : '').toLowerCase();
  const log = (msg) => { res.write(msg + '\n'); };

  log('══════════════════════════════════════════════');
  log('  KOREKSI BDD → 100 (0% susut) — via URL');
  log('  Tenant : id ' + t + ' (' + (req.user.nama || req.user.email || '') + ')');
  log('  Waktu  : ' + new Date().toLocaleString('id-ID'));
  log('  Mode   : ' + (apply ? 'APPLY (data diubah)' : 'DRY-RUN (hanya preview)'));
  if (kata) log('  Filter : nama mengandung "' + kata + '"');
  log('══════════════════════════════════════════════\n');

  const conn = await db.getConnection();
  try {
    // Semua bahan belanja (bukan baris SP referensi) dengan BDD < 100
    const [rows] = await conn.query(
      `SELECT bb.id, bb.nama, bb.satuan, bb.berat_1_sp, bb.persen_bdd, bb.berat_per_satuan
       FROM bahan_baku bb
       WHERE bb.tenant_id = ? AND bb.persen_bdd > 0 AND bb.persen_bdd < 100
         AND LOWER(bb.nama) NOT LIKE '% sp%'
       ORDER BY bb.nama`,
      [t]
    );
    const list = kata ? rows.filter(r => String(r.nama || '').toLowerCase().includes(kata)) : rows;

    log('BAHAN BELANJA DENGAN BDD < 100: ' + rows.length + ' baris' + (kata ? ' (filter: ' + list.length + ')' : '') + '\n');
    if (!list.length) {
      log(kata
        ? '   ⚠ Tidak ada bahan belanja ber-BDD<100 yang namanya mengandung "' + kata + '".'
        : '   ✓ Semua bahan belanja sudah BDD = 100 — tidak ada yang perlu diubah.');
      log('');
      log(apply ? '✓ Selesai (tidak ada perubahan).' : '✓ Dry-run selesai.');
      res.end();
      return;
    }

    if (!kata) {
      // Tanpa filter: hanya laporan. Beri tahu cara apply.
      for (const r of list) {
        log('   • ' + r.nama + ' (' + r.satuan + '): BDD ' + r.persen_bdd + '% → akan jadi 100%' + (r.berat_1_sp > 0 ? ' (b1sp ' + r.berat_1_sp + ' g)' : ''));
      }
      log('');
      log('⚠ Apply membutuhkan filter kata ({ "apply": true, "kata": "labu" }) agar tidak mengubah semua bahan.');
      log('  BDD < 100 itu sah utk bahan bersusut (ayam, telur, ikan) — jangan disamakan semua.');
      log('  Dry-run selesai — tidak ada perubahan tersimpan.');
      res.end();
      return;
    }

    let toFix = 0, fixed = 0;
    for (const r of list) {
      if (Number(r.persen_bdd) === 100) { continue; }
      toFix++;
      if (apply) {
        await conn.query('UPDATE bahan_baku SET persen_bdd=100 WHERE id=? AND tenant_id=?', [r.id, t]);
        fixed++;
      }
      log('   ' + (apply ? '✓' : '•') + ' ' + r.nama + ' (' + r.satuan + '): BDD ' + r.persen_bdd + '% → 100%');
    }

    log('');
    if (apply) {
      log('Update: ' + fixed + ' bahan disetel BDD=100 (skip ' + (toFix - fixed) + ')');
      await conn.commit();
    } else {
      log('Dry-run: ' + toFix + ' bahan akan disetel BDD=100');
      log('Jalankan ulang dengan { "apply": true, "kata": "' + kata + '" } untuk menyimpan.');
      await conn.rollback();
    }

    // Verifikasi: sisa bahan belanja BDD<100 yang mengandung kata
    const [[v]] = await conn.query(
      `SELECT COUNT(*) AS sisa FROM bahan_baku
       WHERE tenant_id=? AND persen_bdd>0 AND persen_bdd<100
         AND LOWER(nama) NOT LIKE '% sp%' AND LOWER(nama) LIKE ?`,
      [t, '%' + kata + '%']
    );
    log('──────────────────────────────────────────────');
    log('  VERIFIKASI (tenant id ' + t + ')');
    log('  Sisa bahan "' + kata + '" ber-BDD<100 : ' + v.sisa + (apply && v.sisa === 0 ? '  ✓ bersih' : ''));
    log('  Catatan: angka /total-kebutuhan kini = angka /menu utk bahan tsb.');
    log('──────────────────────────────────────────────');
    log(apply ? '✓ Koreksi selesai — perubahan tersimpan (commit).' : '✓ Dry-run selesai — tidak ada perubahan tersimpan.');
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

// GET /system/koreksi-bdd-100 — halaman trigger (web UI)
router.get('/system/koreksi-bdd-100', requireRole('admin'), (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><title>Koreksi BDD 100</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-100 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-11 h-11 rounded-xl bg-teal-100 flex items-center justify-center">
        <svg class="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20 12H4M12 4v16"/></svg>
      </div>
      <div>
        <h1 class="text-xl font-bold text-stone-800">Koreksi BDD → 100</h1>
        <p class="text-xs text-stone-500">Samakan angka /total-kebutuhan dengan angka /menu via URL — tanpa SSH/mysql.</p>
      </div>
    </div>

    <p class="text-sm text-stone-600 leading-relaxed mb-4">
      <b>/menu</b> menampilkan berat <b>BERSIH</b> per porsi × porsi (mis. Labu Siam <b>120 kg</b>),
      sedangkan <b>/total-kebutuhan</b> mengonversi ke berat <b>KOTOR</b> belanja (÷ BDD <b>83%</b> → <b>145 kg</b>).
      Set <b>BDD = 100</b> (0% susut) agar angka TK = angka menu (<b>120 kg</b>).
    </p>

    <div class="mb-4">
      <label class="block text-sm font-medium text-stone-700 mb-1">Nama bahan (wajib utk apply)</label>
      <input type="text" id="kataInput" placeholder="mis. labu"
             class="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none">
      <p class="text-xs text-stone-400 mt-1">Apply membutuhkan filter kata agar bahan bersusut lain (ayam, telur, ikan) tidak ikut berubah.</p>
    </div>

    <div class="flex gap-3 mb-6">
      <button onclick="runFix(false)" id="btn-dry" class="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
        1. Dry Run (Preview)
      </button>
      <button onclick="runFix(true)" id="btn-apply" class="flex-1 bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
        2. Jalankan Koreksi
      </button>
    </div>

    <pre id="output" class="bg-stone-900 text-green-400 p-4 rounded-xl text-xs font-mono leading-relaxed overflow-auto max-h-96 hidden"></pre>
  </div>
  <script>
    async function runFix(apply) {
      const btn = apply ? document.getElementById('btn-apply') : document.getElementById('btn-dry');
      const kata = document.getElementById('kataInput').value.trim();
      if (!kata) { alert('Isi nama bahan dulu (mis. labu)'); return; }
      if (apply && !confirm('Set BDD=100 (0% susut) untuk bahan yang namanya mengandung "' + kata + '" sekarang?')) return;
      const out = document.getElementById('output');
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      out.classList.remove('hidden');
      out.textContent = '';
      try {
        const r = await fetch('/api/system/koreksi-bdd-100', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apply, kata }),
          credentials: 'include'
        });
        if (!r.ok) { out.textContent += 'HTTP ' + r.status + ': ' + (await r.text()); return; }
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

// ============================================================
// POST /system/koreksi-bdd — samakan persen_bdd bahan baku dengan nilai
// bdd_persen dari tabel referensi SP (sp_referensi_bahan) via URL.
//
// Latar: sp_referensi_bahan adalah sumber acuan BDD (tombol "Sync ke Bahan
// Baku" di menu SP Referensi memakai bdd_persen -> persen_bdd). Kadang master
// bahan_baku tertinggal (mis. Buncis/Labu Siam/Wortel masih 100% padahal
// referensi 90/83/80%), sehingga /total-kebutuhan meremehkan kebutuhan belanja
// (BDD 100% = tanpa susut). Endpoint ini menyamakan keduanya untuk semua bahan
// yang punya baris referensi.
//
// Mode: dry-run (default) / apply ({ apply: true }). Backup dibuat ke tabel
// backup_bahan_baku_sebelum_koreksi_bdd_<tenant_id>. Aman & idempotent: hanya
// bahan dengan selisih > 0.5 poin yang diubah; baris tanpa referensi tidak
// disentuh; dijalankan dalam SATU transaksi (rollback total jika gagal).
// ============================================================
router.post('/system/koreksi-bdd', requireRole('admin'), async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  });

  const t = req.user.tenant_id;
  const apply = !!(req.body && req.body.apply);
  const log = (msg) => { res.write(msg + '\n'); };

  log('══════════════════════════════════════════════');
  log('  KOREKSI PERSEN BDD (dari Referensi SP) — via URL');
  log('  Tenant : id ' + t + ' (' + (req.user.nama || req.user.email || '') + ')');
  log('  Waktu  : ' + new Date().toLocaleString('id-ID'));
  log('  Mode   : ' + (apply ? 'APPLY (data diubah)' : 'DRY-RUN (hanya preview)'));
  log('══════════════════════════════════════════════\n');

  const conn = await db.getConnection();
  const namaBackup = 'backup_bahan_baku_sebelum_koreksi_bdd_' + t;
  try {
    await conn.beginTransaction();

    // ── Diagnosa: bahan dgn referensi yg persen_bdd-nya beda dari bdd_persen ──
    const [diff] = await conn.query(
      `SELECT b.id, b.nama, b.satuan, b.persen_bdd AS sekarang, ROUND(s.bdd_persen*100) AS seharusnya
       FROM bahan_baku b
       JOIN sp_referensi_bahan s ON s.nama = b.nama AND s.tenant_id = b.tenant_id
       WHERE b.tenant_id = ? AND ABS(COALESCE(b.persen_bdd,0) - ROUND(s.bdd_persen*100)) > 0.5
       ORDER BY b.nama`,
      [t]
    );

    const [[tot]] = await conn.query(
      `SELECT COUNT(*) c FROM bahan_baku b
       JOIN sp_referensi_bahan s ON s.nama = b.nama AND s.tenant_id = b.tenant_id
       WHERE b.tenant_id = ?`,
      [t]
    );

    log('BAHAN DENGAN REFERENSI SP : ' + tot.c);
    log('INKONSISTENSI BDD          : ' + diff.length + '\n');

    if (!diff.length) {
      log('   ✓ Semua persen_bdd bahan baku sudah sesuai referensi SP — tidak ada yang perlu diubah.');
      await conn.commit();
      log('');
      log(apply ? '✓ Selesai (tidak ada perubahan).' : '✓ Dry-run selesai — tidak ada perubahan tersimpan.');
      res.end();
      return;
    }

    for (const r of diff) {
      log('   ' + (apply ? '✓' : '•') + ' ' + r.nama + ' (' + (r.satuan || '-') + '): ' + (Number(r.sekarang) || 0) + '% → ' + r.seharusnya + '%');
    }
    log('');

    if (!apply) {
      log('Dry-run: ' + diff.length + ' bahan akan disamakan ke referensi SP.');
      log('Jalankan ulang dengan { "apply": true } untuk menyimpan.');
      await conn.rollback();
      log('');
      log('✓ Dry-run selesai — tidak ada perubahan tersimpan.');
      res.end();
      return;
    }

    // ── Backup baris yang akan diubah ────────────────────────────
    await conn.query('DROP TABLE IF EXISTS ' + namaBackup);
    await conn.query(
      `CREATE TABLE ${namaBackup} AS
       SELECT b.* FROM bahan_baku b
       JOIN sp_referensi_bahan s ON s.nama = b.nama AND s.tenant_id = b.tenant_id
       WHERE b.tenant_id = ? AND ABS(COALESCE(b.persen_bdd,0) - ROUND(s.bdd_persen*100)) > 0.5`,
      [t]
    );
    const [[bk]] = await conn.query('SELECT COUNT(*) c FROM ' + namaBackup);
    log('BACKUP : ' + bk.c + ' baris → tabel ' + namaBackup);
    log('');

    // ── Update persen_bdd dari referensi ─────────────────────────
    const [u] = await conn.query(
      `UPDATE bahan_baku b
       JOIN sp_referensi_bahan s ON s.nama = b.nama AND s.tenant_id = b.tenant_id
       SET b.persen_bdd = ROUND(s.bdd_persen*100)
       WHERE b.tenant_id = ? AND ABS(COALESCE(b.persen_bdd,0) - ROUND(s.bdd_persen*100)) > 0.5`,
      [t]
    );
    log('Update : ' + u.affectedRows + ' baris persen_bdd disamakan ke referensi SP');
    log('');

    await conn.commit();

    // ── Verifikasi akhir ─────────────────────────────────────────
    const [sisa] = await conn.query(
      `SELECT COUNT(*) c FROM bahan_baku b
       JOIN sp_referensi_bahan s ON s.nama = b.nama AND s.tenant_id = b.tenant_id
       WHERE b.tenant_id = ? AND ABS(COALESCE(b.persen_bdd,0) - ROUND(s.bdd_persen*100)) > 0.5`,
      [t]
    );
    log('──────────────────────────────────────────────');
    log('  VERIFIKASI AKHIR (tenant id ' + t + ')');
    log('  Sisa inkonsistensi BDD : ' + sisa[0].c + '  ' + (sisa[0].c === 0 ? '✓ bersih' : '(periksa ulang)'));
    log('  Backup tersimpan di    : ' + namaBackup);
    log('  Dampak: /total-kebutuhan kini menghitung susut (BDD) sesuai referensi.');
    log('──────────────────────────────────────────────');
    log('✓ Koreksi selesai — perubahan tersimpan (commit).');
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

// GET /system/koreksi-bdd — halaman trigger koreksi (web UI)
router.get('/system/koreksi-bdd', requireRole('admin'), (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><title>Koreksi Persen BDD</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-100 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-11 h-11 rounded-xl bg-cyan-100 flex items-center justify-center">
        <svg class="w-6 h-6 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v16h16M8 16l4-4 4 4M8 10l4-4 4 4"/></svg>
      </div>
      <div>
        <h1 class="text-xl font-bold text-stone-800">Koreksi Persen BDD</h1>
        <p class="text-xs text-stone-500">Samakan persen_bdd bahan baku dengan referensi SP via URL — tanpa SSH/mysql.</p>
      </div>
    </div>

    <p class="text-sm text-stone-600 leading-relaxed mb-4">
      Tabel <code class="bg-stone-100 px-1.5 py-0.5 rounded text-xs">sp_referensi_bahan</code> adalah sumber acuan BDD.
      Bila <code class="bg-stone-100 px-1.5 py-0.5 rounded text-xs">bahan_baku.persen_bdd</code> tertinggal (mis. Buncis 100% vs referensi
      <b>90%</b>, Wortel 100% vs <b>80%</b>, Labu Siam 100% vs <b>83%</b>), kebutuhan belanja di
      <b>/total-kebutuhan</b> jadi meremehkan susut. Endpoint ini menyamakan semuanya ke nilai referensi.
    </p>

    <div class="bg-sky-50 border border-sky-200 rounded-lg p-3 mb-5 text-xs text-sky-800">
      <strong>Urutan yang benar:</strong> jalankan <strong>1. Dry Run</strong> dulu untuk melihat daftar bahan yang berbeda,
      periksa, lalu <strong>2. Jalankan Koreksi</strong>. Backup otomatis dibuat ke tabel
      <code class="bg-sky-100 px-1 rounded">backup_bahan_baku_sebelum_koreksi_bdd_&lt;tenant_id&gt;</code>.
    </div>

    <div class="flex gap-3 mb-6">
      <button onclick="runFix(false)" id="btn-dry" class="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
        1. Dry Run (Preview)
      </button>
      <button onclick="runFix(true)" id="btn-apply" class="flex-1 bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
        2. Jalankan Koreksi
      </button>
    </div>

    <pre id="output" class="bg-stone-900 text-green-400 p-4 rounded-xl text-xs font-mono leading-relaxed overflow-auto max-h-96 hidden"></pre>
  </div>
  <script>
    async function runFix(apply) {
      const btn = apply ? document.getElementById('btn-apply') : document.getElementById('btn-dry');
      if (apply && !confirm('Samakan persen_bdd semua bahan baku dengan referensi SP sekarang? Backup otomatis akan dibuat.')) return;
      const out = document.getElementById('output');
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      out.classList.remove('hidden');
      out.textContent = '';
      try {
        const r = await fetch('/api/system/koreksi-bdd', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apply }),
          credentials: 'include'
        });
        if (!r.ok) { out.textContent += 'HTTP ' + r.status + ': ' + (await r.text()); return; }
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

// ============================================================
// POST /system/koreksi-semangka — set porsi Semangka → 62,1 g/anak
// (BDD TETAP 46%) agar /total-kebutuhan menampilkan 386 kg belanja
// untuk 2.859 porsi. Mengikuti pola koreksi-bdd: dry-run/apply,
// backup, transaksi atomik, idempotent, per tenant, via URL tanpa
// SSH/mysql.
//
// Matematika: 62,1 g × 2859 = 177.543,9 g bersih ÷ 46% = 386 kg.
// Diterapkan di 3 tempat agar konsisten:
//   1) bahan_baku.berat_1_sp        → 62,1 g
//   2) sp_referensi_bahan.berat_bersih → 62,1 g & berat_kotor → 135 g
//      (135 = 62,1 ÷ 0,46)
//   3) menu_bahan.jumlah (gram per porsi di resep menu) → 62,1 g
//      PENTING: /total-kebutuhan memberi PRIORITAS pada menu_bahan.jumlah
//      (bukan berat_1_sp) saat bahan dipakai oleh resep menu (lihat
//      resolveGridBeratPerSiswa). Tanpa langkah 3, Semangka bisa tampil
//      beda: 386 kg di /menu vs 870 kg di /total-kebutuhan.
// ============================================================
router.post('/system/koreksi-semangka', requireRole('admin'), async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  });

  const t = req.user.tenant_id;
  const apply = !!(req.body && req.body.apply);
  const log = (msg) => { res.write(msg + '\n'); };
  const TARGET = 62.1;   // g/anak (berat bersih 1 porsi)
  const KOTOR  = 135.0;  // berat_kotor referensi = 62,1 ÷ 0,46

  log('══════════════════════════════════════════════');
  log('  KOREKSI SEMANGKA → 386 kg di Total Kebutuhan');
  log('  Tenant : id ' + t + ' (' + (req.user.nama || req.user.email || '') + ')');
  log('  Waktu  : ' + new Date().toLocaleString('id-ID'));
  log('  Mode   : ' + (apply ? 'APPLY (data diubah)' : 'DRY-RUN (hanya preview)'));
  log('══════════════════════════════════════════════\n');

  const conn = await db.getConnection();
  const namaBackup = 'backup_semangka_target386_' + t;
  try {
    await conn.beginTransaction();

    // Bahan belanja (bukan baris referensi "... SP")
    const [bb] = await conn.query(
      `SELECT id, nama, satuan, berat_1_sp, persen_bdd FROM bahan_baku
       WHERE tenant_id=? AND LOWER(nama) LIKE '%semangka%' AND LOWER(nama) NOT LIKE '% sp%'`,
      [t]
    );
    // Referensi SP
    const [ref] = await conn.query(
      `SELECT id, nama, berat_bersih, bdd_persen, berat_kotor FROM sp_referensi_bahan
       WHERE tenant_id=? AND LOWER(nama) LIKE '%semangka%'`,
      [t]
    );
    // Resep menu (grant per porsi) yang memakai Semangka tenant ini —
    // wajib disinkronkan karena /total-kebutuhan memberi prioritas
    // menu_bahan.jumlah atas berat_1_sp (resolveGridBeratPerSiswa).
    const [mbRows] = await conn.query(
      `SELECT mb.id, mb.menu_id, mb.jumlah, b.nama AS bahan_nama, m.nama AS menu_nama
       FROM menu_bahan mb
       JOIN menu m ON m.id = mb.menu_id
       JOIN bahan_baku b ON b.id = mb.bahan_baku_id
       WHERE m.tenant_id=? AND mb.bahan_baku_id IN
         (SELECT id FROM bahan_baku WHERE tenant_id=? AND LOWER(nama) LIKE '%semangka%' AND LOWER(nama) NOT LIKE '% sp%')`,
      [t, t]
    );
    // Porsi dari siklus aktif (utk simulasi angka akhir)
    const [sk] = await conn.query(
      `SELECT jumlah_porsi FROM siklus_menu WHERE tenant_id=? AND status='Aktif' ORDER BY id DESC LIMIT 1`,
      [t]
    );
    const porsi = sk.length ? (Number(sk[0].jumlah_porsi) || 0) : 0;

    log('BAHAN BELANJA  : ' + (bb.length ? bb.map(b => b.nama + ' (id ' + b.id + ')').join(', ') : '⚠ tidak ditemukan'));
    log('REFERENSI SP   : ' + (ref.length ? ref.map(r => r.nama + ' (id ' + r.id + ')').join(', ') : '⚠ tidak ditemukan'));
    log('RESEP MENU     : ' + (mbRows.length ? mbRows.map(r => r.menu_nama + ' → ' + (Number(r.jumlah) || 0) + ' g').join(', ') : '⚠ tidak dipakai resep apa pun'));
    log('Porsi siklus   : ' + porsi + (porsi === 2859 ? '  (target 386 kg)' : '  ⚠ bukan 2859 — angka akhir akan berbeda') + '\n');

    if (!bb.length && !ref.length) {
      log('   ⚠ Tidak ada bahan bernama Semangka untuk tenant ini — tidak ada yang bisa diubah.');
      await conn.commit();
      log('');
      log(apply ? '✓ Selesai (tidak ada perubahan).' : '✓ Dry-run selesai — tidak ada perubahan tersimpan.');
      res.end();
      return;
    }

    // ── Preview / Apply ───────────────────────────────────
    for (const b of bb) {
      log('   ' + (apply ? '✓' : '•') + ' bahan_baku   : ' + b.nama + ' — berat_1_sp ' + (Number(b.berat_1_sp) || 0) + ' → ' + TARGET + ' g (BDD ' + (Number(b.persen_bdd) || 0) + '%)');
      if (apply) await conn.query('UPDATE bahan_baku SET berat_1_sp=? WHERE id=? AND tenant_id=?', [TARGET, b.id, t]);
    }
    for (const r of ref) {
      log('   ' + (apply ? '✓' : '•') + ' sp_referensi : ' + r.nama + ' — berat_bersih ' + (Number(r.berat_bersih) || 0) + ' → ' + TARGET + ' g, berat_kotor ' + (Number(r.berat_kotor) || 0) + ' → ' + KOTOR + ' g');
      if (apply) await conn.query('UPDATE sp_referensi_bahan SET berat_bersih=?, berat_kotor=? WHERE id=? AND tenant_id=?', [TARGET, KOTOR, r.id, t]);
    }
    for (const mb of mbRows) {
      log('   ' + (apply ? '✓' : '•') + ' menu_bahan   : ' + mb.menu_nama + ' (menu ' + mb.menu_id + ') — jumlah ' + (Number(mb.jumlah) || 0) + ' g → ' + TARGET + ' g per porsi');
      if (apply) await conn.query('UPDATE menu_bahan SET jumlah=? WHERE id=?', [TARGET, mb.id]);
    }
    log('');

    if (!apply) {
      log('Dry-run: ' + bb.length + ' baris bahan_baku + ' + ref.length + ' baris referensi + ' + mbRows.length + ' baris resep menu akan disetel ke ' + TARGET + ' g.');
      log('Jalankan ulang dengan { "apply": true } untuk menyimpan.');
      await conn.rollback();
      log('');
      log('✓ Dry-run selesai — tidak ada perubahan tersimpan.');
      res.end();
      return;
    }

    // ── Backup (sebelum update) ────────────────────────────
    await conn.query('DROP TABLE IF EXISTS ' + namaBackup);
    await conn.query(
      'CREATE TABLE ' + namaBackup + ' AS SELECT * FROM bahan_baku WHERE id IN (' +
      (bb.length ? bb.map(() => '?').join(',') : 'NULL') + ')',
      bb.map(b => b.id)
    );
    const [[bk]] = await conn.query('SELECT COUNT(*) c FROM ' + namaBackup);
    log('BACKUP : ' + bk.c + ' baris bahan_baku → tabel ' + namaBackup);

    const namaBackupMb = 'backup_menu_bahan_semangka_' + t;
    await conn.query('DROP TABLE IF EXISTS ' + namaBackupMb);
    if (mbRows.length) {
      await conn.query(
        'CREATE TABLE ' + namaBackupMb + ' AS SELECT mb.*, m.tenant_id AS menu_tenant FROM menu_bahan mb JOIN menu m ON m.id = mb.menu_id WHERE mb.id IN (' +
        mbRows.map(() => '?').join(',') + ')',
        mbRows.map(mb => mb.id)
      );
      const [[bkMb]] = await conn.query('SELECT COUNT(*) c FROM ' + namaBackupMb);
      log('BACKUP : ' + bkMb.c + ' baris menu_bahan → tabel ' + namaBackupMb);
    } else {
      log('BACKUP : 0 baris menu_bahan (tidak ada resep pemakaian Semangka).');
    }
    log('');

    await conn.commit();

    // ── Verifikasi akhir ───────────────────────────────────
    const [[v]] = await conn.query(
      `SELECT id, nama, berat_1_sp, persen_bdd FROM bahan_baku
       WHERE tenant_id=? AND LOWER(nama) LIKE '%semangka%' AND LOWER(nama) NOT LIKE '% sp%'`,
      [t]
    );
    const bersih = Number(v.berat_1_sp) * porsi / 1000;
    const kotor = bersih / (Number(v.persen_bdd) / 100);
    log('──────────────────────────────────────────────');
    log('  VERIFIKASI AKHIR (tenant id ' + t + ')');
    log('  ' + v.nama + ' : berat_1_sp = ' + v.berat_1_sp + ' g, BDD = ' + v.persen_bdd + '%');
    log('  Porsi ' + porsi + ' → BERSIH ' + bersih.toFixed(1) + ' kg → KOTOR ' + kotor.toFixed(1) + ' kg → QTY ' + Math.ceil(kotor) + ' kg');
    log('  Backup tersimpan di : ' + namaBackup);
    log('──────────────────────────────────────────────');
    log('✓ Koreksi selesai — perubahan tersimpan (commit).');
    log('  Tambahkan Semangka ke menu/siklus, lalu refresh /total-kebutuhan.');
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

// GET /system/koreksi-semangka — halaman trigger koreksi (web UI)
router.get('/system/koreksi-semangka', requireRole('admin'), (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><title>Koreksi Semangka 386 kg</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-100 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-11 h-11 rounded-xl bg-rose-100 flex items-center justify-center">
        <svg class="w-6 h-6 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3 3-3M12 22V10"/></svg>
      </div>
      <div>
        <h1 class="text-xl font-bold text-stone-800">Koreksi Semangka → 386 kg</h1>
        <p class="text-xs text-stone-500">Set porsi Semangka 62,1 g/anak (BDD 46%) via URL — tanpa SSH/mysql.</p>
      </div>
    </div>

    <p class="text-sm text-stone-600 leading-relaxed mb-4">
      Menyetel <code class="bg-stone-100 px-1.5 py-0.5 rounded text-xs">berat_1_sp</code> Semangka menjadi
      <b>62,1 g/anak</b> dengan BDD tetap <b>46%</b> sehingga /total-kebutuhan menampilkan
      <b>386 kg</b> (untuk 2.859 porsi): 62,1 g × 2859 = 177,5 kg bersih ÷ 46% = 386 kg belanja.
      Referensi SP ikut disinkronkan (bersih 62,1 g, kotor 135 g).
    </p>

    <div class="bg-sky-50 border border-sky-200 rounded-lg p-3 mb-5 text-xs text-sky-800">
      <strong>Urutan yang benar:</strong> jalankan <strong>1. Dry Run</strong> dulu untuk melihat nilai sebelum/sesudah,
      lalu <strong>2. Jalankan Koreksi</strong>. Backup otomatis dibuat ke tabel
      <code class="bg-sky-100 px-1 rounded">backup_semangka_target386_&lt;tenant_id&gt;</code>.
      Setelah itu tambahkan Semangka ke menu/siklus agar muncul di Total Kebutuhan.
    </div>

    <div class="flex gap-3 mb-6">
      <button onclick="runFix(false)" id="btn-dry" class="flex-1 bg-rose-600 hover:bg-rose-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
        1. Dry Run (Preview)
      </button>
      <button onclick="runFix(true)" id="btn-apply" class="flex-1 bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-xl font-medium transition shadow-md">
        2. Jalankan Koreksi
      </button>
    </div>

    <pre id="output" class="bg-stone-900 text-green-400 p-4 rounded-xl text-xs font-mono leading-relaxed overflow-auto max-h-96 hidden"></pre>
  </div>
  <script>
    async function runFix(apply) {
      const btn = apply ? document.getElementById('btn-apply') : document.getElementById('btn-dry');
      if (apply && !confirm('Set porsi Semangka = 62,1 g/anak sekarang? Backup otomatis akan dibuat.')) return;
      const out = document.getElementById('output');
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      out.classList.remove('hidden');
      out.textContent = '';
      try {
        const r = await fetch('/api/system/koreksi-semangka', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apply }),
          credentials: 'include'
        });
        if (!r.ok) { out.textContent += 'HTTP ' + r.status + ': ' + (await r.text()); return; }
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

module.exports = router;
