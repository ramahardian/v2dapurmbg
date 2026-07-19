require('dotenv').config();
process.env.TZ = 'Asia/Jakarta';
const cluster = require('cluster');
const os = require('os');
const path = require('path');

// ─── CLUSTER MODE ────────────────────────────
// Manfaatkan semua CPU core untuk handle request paralel
const WORKERS = parseInt(process.env.CLUSTER_WORKERS) || 1;

if (cluster.isMaster && WORKERS > 1) {
  console.log(`🚀 Master PID ${process.pid} — Forking ${WORKERS} workers...`);
  for (let i = 0; i < WORKERS; i++) cluster.fork();

  // Restart worker yang mati
  cluster.on('exit', (worker, code, signal) => {
    console.warn(`⚰️ Worker ${worker.process.pid} exited (${signal || code}). Restarting...`);
    cluster.fork();
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    for (const id in cluster.workers) cluster.workers[id].kill();
    process.exit(0);
  });
} else {
  // ─── WORKER PROCESS ──────────────────────
  const express = require('express');
  const compression = require('compression');
  const helmet = require('helmet');
  const cookieParser = require('cookie-parser');
  const jwt = require('jsonwebtoken');
  const { requireAuth, requireRole } = require('./middleware/auth');
  const authRoutes = require('./routes/auth');
  const apiRoutes = require('./routes/api');
  const db = require('./db');
  const app = express();
  const PORT = process.env.PORT || 3000;
  const isWorker = cluster.isWorker;

  if (isWorker) console.log(`⚡ Worker ${process.pid} started`);

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

  // ── MIDDLEWARE ORDER (fast → slow) ─────
  // 1) Trust proxy dulu (production)
  if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
      if (!req.secure) return res.redirect('https://' + req.headers.host + req.originalUrl);
      next();
    });
  }

  // 2) Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdn.sheetjs.com", "https://fonts.googleapis.com"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "https://koperasi.mealify.id"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // 3) Kompresi response
  app.use(compression());

  // 4) Static files — ringan, sebelum body parser
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', immutable: true }));

  // 5) Cookie parser — ringan
  app.use(cookieParser());

  // 6) Body parsers — berat, hanya untuk non-static request
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 7) API headers — no-cache untuk dynamic content
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  });

  // ── ROUTES ──────────────────────────────

  // Public API
  app.get('/api/public/stats', async (req, res) => {
    try {
      const tenantId = 1;
      const [[menuCount]] = await db.query('SELECT COUNT(*) AS total FROM menu WHERE tenant_id=?', [tenantId]);
      const [[katCount]] = await db.query('SELECT COUNT(DISTINCT kategori_penerima) AS total FROM menu WHERE tenant_id=? AND kategori_penerima IS NOT NULL', [tenantId]);
      const [[prod]] = await db.query('SELECT COALESCE(SUM(jumlah_porsi),0) AS total, COUNT(DISTINCT DATE(tanggal_produksi)) AS days FROM produksi WHERE tenant_id=?', [tenantId]);
      const porsiPerHari = prod.days > 0 ? Math.round(prod.total / prod.days) : 0;
      res.json({
        porsi_per_hari: porsiPerHari,
        total_menu: Number(menuCount.total),
        total_kategori: Number(katCount.total)
      });
    } catch (e) {
      res.json({ porsi_per_hari: 0, total_menu: 0, total_kategori: 0 });
    }
  });

  // Auth & API
  app.use('/api/auth', authRoutes);
  app.use('/api', apiRoutes);

  // Pages
  app.get('/login', (req, res) => res.render('login'));
  app.get('/signup', (req, res) => res.render('signup'));

  app.get('/absen', (req, res) => {
    try {
      const token = req.cookies?.access_token;
      if (token) { jwt.verify(token, process.env.JWT_SECRET); return res.redirect('/absen/dashboard'); }
    } catch {}
    res.render('login-karyawan');
  });
  app.get('/absen/dashboard', requireKaryawanAuth, (req, res) => res.render('absen-karyawan'));

  function requirePageAuth(req, res, next) {
    const token = req.cookies?.access_token;
    if (!token) return res.redirect('/login');
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      return res.redirect('/login');
    }
  }

  function requireKaryawanAuth(req, res, next) {
    const token = req.cookies?.access_token;
    if (!token) return res.redirect('/absen');
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      return res.redirect('/absen');
    }
  }

  const distVer = (() => {
    try { return require('fs').statSync(path.join(__dirname, 'public', 'dist', 'app.min.js')).mtimeMs; } catch { return Date.now(); }
  })();
  app.get('/', requirePageAuth, (req, res) => res.render('app', { distVer }));
  app.get(/^\/(?!api).*/, requirePageAuth, (req, res) => res.render('app', { distVer }));

  // ── MIGRASI / UTILITY ──────────────────────
  // Endpoint untuk alter ENUM absensi via browser (admin only)
  app.get('/api/migrate/absensi-status-terlambat', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const [cols] = await db.query(
        `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'absensi'
           AND COLUMN_NAME = 'status'`
      );
      const currentType = cols[0]?.COLUMN_TYPE || '';
      if (currentType.includes("'Terlambat'")) {
        return res.send(`
          <div style="font-family:sans-serif;padding:2rem;text-align:center">
            <h2 style="color:#16a34a">✅ Status ENUM sudah mengandung Terlambat</h2>
            <p style="color:#6b7280;margin-top:0.5rem">Tidak perlu diubah.</p>
          </div>`);
      }

      await db.query(
        `ALTER TABLE absensi MODIFY COLUMN status
         ENUM('Hadir','Sakit','Izin','Cuti','Alpha','Terlambat') DEFAULT 'Hadir'`
      );

      res.send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center">
          <h2 style="color:#16a34a">✅ ALTER TABLE BERHASIL!</h2>
          <p style="color:#6b7280;margin-top:0.5rem">
            Status ENUM sekarang: <code>Hadir, Sakit, Izin, Cuti, Alpha, Terlambat</code>
          </p>
        </div>`);
    } catch (e) {
      res.status(500).send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center">
          <h2 style="color:#dc2626">❌ Gagal</h2>
          <p style="color:#6b7280;margin-top:0.5rem">${e.message}</p>
        </div>`);
    }
  });

  // Endpoint alter bahan_baku: tambah kolom sumber (admin only)
  app.get('/api/migrate/bahan-baku-sumber', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const [cols] = await db.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'bahan_baku'
           AND COLUMN_NAME = 'sumber'`
      );

      if (cols.length) {
        return res.send(`
          <div style="font-family:sans-serif;padding:2rem;text-align:center">
            <h2 style="color:#16a34a">✅ Kolom sumber sudah ada</h2>
            <p style="color:#6b7280;margin-top:0.5rem">Tidak perlu diubah.</p>
          </div>`);
      }

      await db.query(
        `ALTER TABLE bahan_baku
         ADD COLUMN sumber VARCHAR(20) DEFAULT NULL
         COMMENT 'sumber permintaan: ahli_gizi' AFTER stok_minimum`
      );

      res.send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center">
          <h2 style="color:#16a34a">✅ ALTER TABLE BERHASIL!</h2>
          <p style="color:#6b7280;margin-top:0.5rem">
            Kolom <code>sumber</code> berhasil ditambahkan ke <code>bahan_baku</code>
            (VARCHAR(20), NULL, AFTER stok_minimum)
          </p>
          <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;
             background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">
            Kembali ke Dashboard
          </a>
        </div>`);
    } catch (e) {
      res.status(500).send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center">
          <h2 style="color:#dc2626">❌ Gagal</h2>
          <p style="color:#6b7280;margin-top:0.5rem">${e.message}</p>
        </div>`);
    }
  });

  // Endpoint hapus SEMUA data absensi (admin only)
  app.get('/api/migrate/hapus-absensi', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM absensi');

      if (req.query.confirm !== '1') {
        return res.send(`
          <div style="font-family:sans-serif;padding:2rem;text-align:center;max-width:480px;margin:auto">
            <h2 style="color:#dc2626;margin-bottom:1rem">⚠️ Hapus Semua Data Absensi</h2>
            <p style="color:#6b7280;margin-bottom:0.5rem">
              Total data absensi: <strong style="font-size:1.5rem;color:#111827">${total}</strong> records
            </p>
            <p style="color:#9ca3af;font-size:0.875rem;margin-bottom:2rem">
              Tindakan ini <strong>tidak bisa dibatalkan</strong>.
              Semua data clock-in, clock-out, dan status absensi akan hilang permanen.
            </p>
            <a href="?confirm=1"
               style="display:inline-block;padding:0.75rem 2rem;background:#dc2626;color:white;
                      text-decoration:none;border-radius:0.5rem;font-weight:600">
              🗑️ Ya, Hapus Semua (${total} records)
            </a>
            <br><br>
            <a href="/" style="color:#6b7280;font-size:0.875rem">Batal</a>
          </div>`);
      }

      await db.query('DELETE FROM absensi');

      res.send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center">
          <h2 style="color:#16a34a">✅ Berhasil!</h2>
          <p style="color:#6b7280;margin-top:0.5rem">
            <strong>${total}</strong> data absensi telah dihapus.
          </p>
          <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;
             background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">
            Kembali ke Dashboard
          </a>
        </div>`);
    } catch (e) {
      res.status(500).send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center">
          <h2 style="color:#dc2626">❌ Gagal</h2>
          <p style="color:#6b7280;margin-top:0.5rem">${e.message}</p>
        </div>`);
    }
  });

  // Endpoint CREATE TABLE siklus_menu_item (admin only)
  app.get('/api/migrate/create-siklus-menu-item', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      // Cek apakah tabel sudah ada
      const [tables] = await db.query("SHOW TABLES LIKE 'siklus_menu_item'");
      if (tables.length > 0) {
        return res.send(`
          <div style="font-family:sans-serif;padding:2rem;text-align:center">
            <h2 style="color:#16a34a">✅ Tabel siklus_menu_item sudah ada</h2>
            <p style="color:#6b7280;margin-top:0.5rem">Tidak perlu dibuat ulang.</p>
            <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;
               background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">
              Kembali ke Dashboard
            </a>
          </div>`);
      }

      await db.query(`
        CREATE TABLE siklus_menu_item (
          id INT AUTO_INCREMENT PRIMARY KEY,
          siklus_id INT NOT NULL,
          hari_ke INT NOT NULL,
          hari_nama VARCHAR(20) NOT NULL,
          menu_id INT DEFAULT NULL,
          menu_nama VARCHAR(200) DEFAULT NULL,
          resep_map TEXT DEFAULT NULL,
          jumlah_porsi INT DEFAULT 0,
          kalori DECIMAL(10,2) DEFAULT 0.00,
          protein DECIMAL(10,2) DEFAULT 0.00,
          karbohidrat DECIMAL(10,2) DEFAULT 0.00,
          lemak DECIMAL(10,2) DEFAULT 0.00,
          serat DECIMAL(10,2) DEFAULT 0.00,
          foto VARCHAR(255) DEFAULT NULL,
          FOREIGN KEY (siklus_id) REFERENCES siklus_menu(id) ON DELETE CASCADE,
          FOREIGN KEY (menu_id) REFERENCES menu(id) ON DELETE SET NULL,
          INDEX idx_siklus (siklus_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      res.send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center">
          <h2 style="color:#16a34a">✅ CREATE TABLE BERHASIL!</h2>
          <p style="color:#6b7280;margin-top:0.5rem">
            Tabel <code>siklus_menu_item</code> berhasil dibuat dengan struktur:
          </p>
          <pre style="background:#f5f5f4;padding:1rem;border-radius:0.5rem;text-align:left;margin-top:1rem;font-size:0.75rem;overflow-x:auto">
CREATE TABLE siklus_menu_item (
  id INT AUTO_INCREMENT PRIMARY KEY,
  siklus_id INT NOT NULL,
  hari_ke INT NOT NULL,
  hari_nama VARCHAR(20) NOT NULL,
  menu_id INT DEFAULT NULL,
  menu_nama VARCHAR(200) DEFAULT NULL,
  resep_map TEXT DEFAULT NULL,
  jumlah_porsi INT DEFAULT 0,
  kalori DECIMAL(10,2) DEFAULT 0.00,
  protein DECIMAL(10,2) DEFAULT 0.00,
  karbohidrat DECIMAL(10,2) DEFAULT 0.00,
  lemak DECIMAL(10,2) DEFAULT 0.00,
  serat DECIMAL(10,2) DEFAULT 0.00,
  foto VARCHAR(255) DEFAULT NULL,
  FOREIGN KEY (siklus_id) REFERENCES siklus_menu(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_id) REFERENCES menu(id) ON DELETE SET NULL,
  INDEX idx_siklus (siklus_id)
) ENGINE=InnoDB CHARSET=utf8mb4
          </pre>
          <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;
             background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">
            Kembali ke Dashboard
          </a>
        </div>`);
    } catch (e) {
      res.status(500).send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center">
          <h2 style="color:#dc2626">❌ Gagal</h2>
          <p style="color:#6b7280;margin-top:0.5rem">${e.message}</p>
        </div>`);
    }
  });

  // Endpoint tambah kolom nutrisi ke bahan_baku + FK siklus_menu_item.menu_id (admin only)
  app.get('/api/migrate/nutrisi-dan-fk', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      let results = [];
      // 1. Tambah kolom nutrisi ke bahan_baku
      const [nutCols] = await db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bahan_baku' AND COLUMN_NAME = 'kalori'");
      if (!nutCols.length) {
        await db.query('ALTER TABLE bahan_baku ADD COLUMN kalori DECIMAL(10,2) DEFAULT 0 AFTER harga_satuan, ADD COLUMN protein DECIMAL(10,2) DEFAULT 0 AFTER kalori, ADD COLUMN karbohidrat DECIMAL(10,2) DEFAULT 0 AFTER protein, ADD COLUMN lemak DECIMAL(10,2) DEFAULT 0 AFTER karbohidrat, ADD COLUMN serat DECIMAL(10,2) DEFAULT 0 AFTER lemak');
        results.push('✓ Kolom nutrisi (kalori, protein, karbohidrat, lemak, serat) ditambahkan ke bahan_baku');
      } else {
        results.push('✓ Kolom nutrisi sudah ada di bahan_baku');
      }
      // 2. Bersihkan orphaned menu_id di siklus_menu_item
      await db.query('UPDATE siklus_menu_item SET menu_id=NULL WHERE menu_id IS NOT NULL AND menu_id NOT IN (SELECT id FROM menu)');
      results.push('✓ Orphaned menu_id dibersihkan');
      // 3. Tambah FK siklus_menu_item.menu_id → menu(id) ON DELETE SET NULL
      const [fkExists] = await db.query("SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'siklus_menu_item' AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_smi_menu'");
      if (!fkExists.length) {
        await db.query('ALTER TABLE siklus_menu_item ADD CONSTRAINT fk_smi_menu FOREIGN KEY (menu_id) REFERENCES menu(id) ON DELETE SET NULL');
        results.push('✓ FK siklus_menu_item.menu_id → menu(id) ON DELETE SET NULL ditambahkan');
      } else {
        results.push('✓ FK siklus_menu_item.menu_id sudah ada');
      }
      res.send(`<div style="font-family:sans-serif;padding:2rem;text-align:center"><h2 style="color:#16a34a">✅ Migrasi Selesai</h2>${results.map(r => '<p style="color:#374151;margin-top:0.5rem">' + r + '</p>').join('')}<a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali ke Dashboard</a></div>`);
    } catch (e) {
      res.status(500).send(`<div style="font-family:sans-serif;padding:2rem;text-align:center"><h2 style="color:#dc2626">❌ Gagal</h2><p style="color:#6b7280;margin-top:0.5rem">${e.message}</p></div>`);
    }
  });

  // Endpoint jalankan seed dummy data (admin only)
  app.get('/api/migrate/seed-dummy', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      if (req.query.confirm !== '1') {
        // Cek jumlah data yang akan terhapus
        const [menuCount] = await db.query('SELECT COUNT(*) AS total FROM menu');
        const [siklusCount] = await db.query('SELECT COUNT(*) AS total FROM siklus_menu');
        const [itemCount] = await db.query('SELECT COUNT(*) AS total FROM siklus_menu_item');
        const [bahanCount] = await db.query('SELECT COUNT(*) AS total FROM menu_bahan');

        return res.send(`
          <div style="font-family:sans-serif;padding:2rem;text-align:center;max-width:560px;margin:auto">
            <h2 style="color:#d97706;margin-bottom:1rem">⚠️ Seed Data Dummy</h2>
            <p style="color:#6b7280;margin-bottom:1.5rem">
              Aksi ini akan <strong>MENGHAPUS</strong> data yang ada dan mengisi data contoh:
            </p>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:0.75rem;padding:1rem;margin-bottom:1.5rem;text-align:left">
              <div style="display:flex;justify-content:space-between;padding:0.375rem 0">
                <span>📋 Menu existing:</span><b>${menuCount[0].total}</b>
              </div>
              <div style="display:flex;justify-content:space-between;padding:0.375rem 0">
                <span>📦 Menu bahan:</span><b>${bahanCount[0].total}</b>
              </div>
              <div style="display:flex;justify-content:space-between;padding:0.375rem 0">
                <span>🔄 Siklus:</span><b>${siklusCount[0].total}</b>
              </div>
              <div style="display:flex;justify-content:space-between;padding:0.375rem 0">
                <span>📅 Item siklus:</span><b>${itemCount[0].total}</b>
              </div>
            </div>
            <div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:0.75rem 1rem;border-radius:0.5rem;margin-bottom:1.5rem;font-size:0.875rem">
              ⚠️ Semua data menu, menu_bahan, siklus_menu, siklus_menu_item akan dihapus dan diganti data contoh!
            </div>
            <a href="?confirm=1"
               style="display:inline-block;padding:0.75rem 2rem;background:#d97706;color:white;
                      text-decoration:none;border-radius:0.5rem;font-weight:600">
              🚀 Ya, Jalankan Seed!
            </a>
            <br><br>
            <a href="/" style="color:#6b7280;font-size:0.875rem">Batal</a>
          </div>`);
      }

      // Jalankan seed inline (tanpa child_process, langsung di proses yang sama)
      const { runSeed } = require('./scripts/seed-dummy');

      const logs = await runSeed(1);
      const output = logs.join('\n');
      const escapedOutput = output
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      res.send(`
        <div style="font-family:sans-serif;padding:2rem;max-width:700px;margin:auto;background:#f5f5f4">
          <h2 style="color:#16a34a">✅ Seed Selesai!</h2>
          <pre style="background:#1c1917;color:#a3e635;padding:1rem;border-radius:0.5rem;overflow-x:auto;font-size:0.8rem;line-height:1.5;white-space:pre-wrap">${escapedOutput}</pre>
          <p style="color:#6b7280;margin-top:0.5rem">✅ ${logs.length - 1} langkah selesai. Data dummy berhasil dibuat.</p>
          <div style="margin-top:1.5rem;display:flex;gap:0.75rem;flex-wrap:wrap">
            <a href="/api/migrate/cek-data-siklus" style="padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">📊 Cek Data Siklus</a>
            <a href="/api/migrate/cek-tabel" style="padding:0.5rem 1.5rem;background:#6366f1;color:white;text-decoration:none;border-radius:0.5rem">📋 Cek Tabel</a>
            <a href="/" style="padding:0.5rem 1.5rem;background:#6b7280;color:white;text-decoration:none;border-radius:0.5rem">🏠 Dashboard</a>
          </div>
        </div>`);

    } catch (e) {
      res.status(500).send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center">
          <h2 style="color:#dc2626">❌ Gagal</h2>
          <p style="color:#6b7280;margin-top:0.5rem">${e.message}</p>
        </div>`);
    }
  });

  // Endpoint cek data siklus menu (admin only)
  app.get('/api/migrate/cek-data-siklus', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const [siklus] = await db.query('SELECT id, nama, kategori_penerima, jumlah_porsi, total_hari, status FROM siklus_menu ORDER BY id DESC LIMIT 10');
      
      let html = `
        <div style="font-family:sans-serif;padding:2rem;max-width:900px;margin:auto">
          <h2 style="margin-bottom:1rem">📊 Cek Data Siklus Menu</h2>
          <p style="color:#6b7280;margin-bottom:1.5rem">Total siklus: <b>${siklus.length}</b></p>`;

      if (siklus.length === 0) {
        html += `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:1rem;border-radius:0.5rem">❌ Tidak ada data siklus menu! Jalankan seed: <code>node scripts/seed-dummy.js</code></div>`;
      } else {
        for (const s of siklus) {
          const [items] = await db.query(
            'SELECT COUNT(*) as total, SUM(CASE WHEN menu_id IS NOT NULL THEN 1 ELSE 0 END) as filled FROM siklus_menu_item WHERE siklus_id=?',
            [s.id]
          );
          const total = Number(items[0].total);
          const filled = Number(items[0].filled);
          const pct = total > 0 ? Math.round(filled / total * 100) : 0;
          const color = pct >= 100 ? '#16a34a' : pct > 0 ? '#d97706' : '#dc2626';
          
          html += `
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:0.75rem;padding:1rem 1.25rem;margin-bottom:0.75rem">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
                <div>
                  <div style="font-weight:600;color:#111827">${s.nama}</div>
                  <div style="font-size:0.8rem;color:#6b7280;margin-top:0.25rem">
                    ${s.kategori_penerima || '-'} · ${s.jumlah_porsi} porsi · ${s.total_hari} hari · Status: <b>${s.status}</b>
                  </div>
                </div>
                <div style="text-align:right">
                  <div style="font-size:1.5rem;font-weight:700;color:${color}">${filled}/${total}</div>
                  <div style="font-size:0.8rem;color:#6b7280">menu terisi</div>
                </div>
              </div>
              <div style="margin-top:0.75rem;background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden">
                <div style="background:${color};height:100%;width:${pct}%;border-radius:999px;transition:width 0.3s"></div>
              </div>
              <div style="font-size:0.75rem;color:#6b7280;margin-top:0.25rem;text-align:right">${pct}% coverage</div>
            </div>`;
        }
      }
      
      html += `
          <div style="margin-top:1.5rem;display:flex;gap:0.75rem;flex-wrap:wrap">
            <a href="/api/migrate/cek-tabel" style="padding:0.5rem 1.25rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem;font-size:0.875rem">Cek Tabel</a>
            <a href="/" style="padding:0.5rem 1.25rem;background:#6b7280;color:white;text-decoration:none;border-radius:0.5rem;font-size:0.875rem">Dashboard</a>
          </div>
        </div>`;
      res.send(html);
    } catch (e) {
      res.status(500).send(`<div style="font-family:sans-serif;padding:2rem;text-align:center"><h2 style="color:#dc2626">❌ Error</h2><p style="color:#6b7280">${e.message}</p></div>`);
    }
  });

  // Endpoint cek kesesuaian tabel database (admin only)
  app.get('/api/migrate/cek-tabel', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const fs = require('fs');
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      const schemaTables = [];
      const regex = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?`?(\w+)`?\s*\(/gi;
      let match;
      while ((match = regex.exec(schemaContent)) !== null) {
        schemaTables.push(match[1]);
      }

      const [dbTables] = await db.query('SHOW TABLES');
      const dbTableNames = dbTables.map(r => Object.values(r)[0]);

      const adaFix = [];
      const tidakAdaFix = [];
      for (const t of schemaTables) {
        if (dbTableNames.includes(t)) adaFix.push(t);
        else tidakAdaFix.push(t);
      }
      const tambahan = dbTableNames.filter(t => !schemaTables.includes(t));

      const statusColor = tidakAdaFix.length === 0 ? '#16a34a' : '#dc2626';
      const statusIcon = tidakAdaFix.length === 0 ? '✅' : '⚠️';
      const statusMsg = tidakAdaFix.length === 0 ? 'Semua tabel sudah ada' : 'Ada tabel yang hilang!';

      let html = `
        <div style="font-family:sans-serif;padding:2rem;max-width:800px;margin:auto">
          <div style="text-align:center;margin-bottom:2rem">
            <h2 style="color:${statusColor}">${statusIcon} ${statusMsg}</h2>
            <p style="color:#6b7280;margin-top:0.5rem">
              Schema: <b>${schemaTables.length}</b> tabel &nbsp;|&nbsp; Database: <b>${dbTableNames.length}</b> tabel
            </p>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:0.875rem">
            <thead>
              <tr style="background:#f5f5f4">
                <th style="padding:0.625rem 1rem;text-align:left;border:1px solid #e7e5e4">#</th>
                <th style="padding:0.625rem 1rem;text-align:left;border:1px solid #e7e5e4">Nama Tabel</th>
                <th style="padding:0.625rem 1rem;text-align:center;border:1px solid #e7e5e4">Status</th>
              </tr>
            </thead>
            <tbody>`;

      const allTables = [...new Set([...schemaTables, ...dbTableNames])].sort();
      let no = 0;
      for (const t of allTables) {
        no++;
        const inSchema = schemaTables.includes(t);
        const inDb = dbTableNames.includes(t);
        let status, bg;
        if (inSchema && inDb) { status = '✅ Ada'; bg = '#f0fdf4'; }
        else if (inSchema && !inDb) { status = '❌ Hilang'; bg = '#fef2f2'; }
        else { status = '⚠️ Ekstra'; bg = '#fffbeb'; }
        html += `
              <tr style="background:${bg}">
                <td style="padding:0.5rem 1rem;border:1px solid #e7e5e4;text-align:center">${no}</td>
                <td style="padding:0.5rem 1rem;border:1px solid #e7e5e4;font-weight:500">${t}</td>
                <td style="padding:0.5rem 1rem;border:1px solid #e7e5e4;text-align:center">${status}</td>
              </tr>`;
      }

      html += `
            </tbody>
          </table>
          <div style="margin-top:1.5rem;display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">
            <span style="background:#f0fdf4;color:#166534;padding:0.375rem 1rem;border-radius:999px;font-size:0.8rem">✅ ${adaFix.length} Ada</span>
            <span style="background:#fef2f2;color:#991b1b;padding:0.375rem 1rem;border-radius:999px;font-size:0.8rem">❌ ${tidakAdaFix.length} Hilang</span>
            <span style="background:#fffbeb;color:#92400e;padding:0.375rem 1rem;border-radius:999px;font-size:0.8rem">⚠️ ${tambahan.length} Ekstra</span>
          </div>
          <div style="text-align:center;margin-top:2rem">
            <a href="/" style="display:inline-block;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali ke Dashboard</a>
          </div>
        </div>`;
      res.send(html);
    } catch (e) {
      res.status(500).send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center">
          <h2 style="color:#dc2626">❌ Gagal</h2>
          <p style="color:#6b7280;margin-top:0.5rem">${e.message}</p>
        </div>`);
    }
  });

  // Endpoint CREATE TABLE menu_bahan (admin only)
  app.get('/api/migrate/create-menu-bahan', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      // Cek apakah tabel sudah ada
      const [tables] = await db.query("SHOW TABLES LIKE 'menu_bahan'");
      if (tables.length > 0) {
        return res.send(`
          <div style="font-family:sans-serif;padding:2rem;text-align:center">
            <h2 style="color:#16a34a">✅ Tabel menu_bahan sudah ada</h2>
            <p style="color:#6b7280;margin-top:0.5rem">Tidak perlu dibuat ulang.</p>
            <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;
               background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">
              Kembali ke Dashboard
            </a>
          </div>`);
      }

      await db.query(`
        CREATE TABLE menu_bahan (
          id INT AUTO_INCREMENT PRIMARY KEY,
          menu_id INT NOT NULL,
          bahan_baku_id INT NOT NULL,
          jumlah DECIMAL(15,3) NOT NULL,
          FOREIGN KEY (menu_id) REFERENCES menu(id) ON DELETE CASCADE,
          FOREIGN KEY (bahan_baku_id) REFERENCES bahan_baku(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      res.send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center">
          <h2 style="color:#16a34a">✅ CREATE TABLE BERHASIL!</h2>
          <p style="color:#6b7280;margin-top:0.5rem">
            Tabel <code>menu_bahan</code> berhasil dibuat dengan struktur:
          </p>
          <pre style="background:#f5f5f4;padding:1rem;border-radius:0.5rem;text-align:left;margin-top:1rem;font-size:0.8rem;overflow-x:auto">
CREATE TABLE menu_bahan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  menu_id INT NOT NULL,
  bahan_baku_id INT NOT NULL,
  jumlah DECIMAL(15,3) NOT NULL,
  FOREIGN KEY (menu_id) REFERENCES menu(id) ON DELETE CASCADE,
  FOREIGN KEY (bahan_baku_id) REFERENCES bahan_baku(id) ON DELETE CASCADE
) ENGINE=InnoDB CHARSET=utf8mb4
          </pre>
          <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;
             background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">
            Kembali ke Dashboard
          </a>
        </div>`);
    } catch (e) {
      res.status(500).send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center">
          <h2 style="color:#dc2626">❌ Gagal</h2>
          <p style="color:#6b7280;margin-top:0.5rem">${e.message}</p>
        </div>`);
    }
  });

  // Endpoint migrasi: tambah kolom gramasi_besar & gramasi_kecil ke menu
  app.get('/api/migrate/gramasi-besar-kecil', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const [c1] = await db.query("SHOW COLUMNS FROM menu LIKE 'gramasi_besar'");
      const [c2] = await db.query("SHOW COLUMNS FROM menu LIKE 'gramasi_kecil'");
      if (c1.length && c2.length) {
        return res.send(`<div style="font-family:sans-serif;padding:2rem;text-align:center"><h2 style="color:#16a34a">✅ Kolom sudah ada</h2><a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a></div>`);
      }
      if (!c1.length) await db.query('ALTER TABLE menu ADD COLUMN gramasi_besar DECIMAL(10,2) DEFAULT 0 AFTER gramasi_total');
      if (!c2.length) await db.query('ALTER TABLE menu ADD COLUMN gramasi_kecil DECIMAL(10,2) DEFAULT 0 AFTER gramasi_besar');
      res.send(`<div style="font-family:sans-serif;padding:2rem;text-align:center"><h2 style="color:#16a34a">✅ Kolom berhasil ditambahkan</h2><a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a></div>`);
    } catch (e) {
      res.status(500).send(`<div style="font-family:sans-serif;padding:2rem;text-align:center"><h2 style="color:#dc2626">❌ Gagal</h2><p>${e.message}</p></div>`);
    }
  });

  // Endpoint migrasi: tambah kolom gramasi_besar & gramasi_kecil ke siklus_menu_item
  app.get('/api/migrate/gramasi-siklus-item', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const [c1] = await db.query("SHOW COLUMNS FROM siklus_menu_item LIKE 'gramasi_besar'");
      const [c2] = await db.query("SHOW COLUMNS FROM siklus_menu_item LIKE 'gramasi_kecil'");
      if (c1.length && c2.length) {
        return res.send(`<div style="font-family:sans-serif;padding:2rem;text-align:center"><h2 style="color:#16a34a">✅ Kolom sudah ada</h2><a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a></div>`);
      }
      if (!c1.length) await db.query('ALTER TABLE siklus_menu_item ADD COLUMN gramasi_besar DECIMAL(10,2) DEFAULT 0 AFTER jumlah_porsi');
      if (!c2.length) await db.query('ALTER TABLE siklus_menu_item ADD COLUMN gramasi_kecil DECIMAL(10,2) DEFAULT 0 AFTER gramasi_besar');
      res.send(`<div style="font-family:sans-serif;padding:2rem;text-align:center"><h2 style="color:#16a34a">✅ Kolom berhasil ditambahkan ke siklus_menu_item</h2><a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a></div>`);
    } catch (e) {
      res.status(500).send(`<div style="font-family:sans-serif;padding:2rem;text-align:center"><h2 style="color:#dc2626">❌ Gagal</h2><p>${e.message}</p></div>`);
    }
  });

  // Endpoint hapus duplikasi penerima_manfaat (admin only)
  app.get('/api/migrate/hapus-duplikat-penerima', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const [dups] = await db.query(
        `SELECT kategori_penerima, nama_kelompok, paket_besar, paket_kecil, lokasi,
                COUNT(*) cnt, SUBSTRING_INDEX(GROUP_CONCAT(id ORDER BY id), ',', 1) keep_id,
                GROUP_CONCAT(id ORDER BY id) ids
         FROM penerima_manfaat WHERE tenant_id=? AND kategori_penerima IS NOT NULL AND kategori_penerima != 'null'
         GROUP BY kategori_penerima, nama_kelompok, paket_besar, paket_kecil, lokasi HAVING cnt > 1`,
        [req.user.tenant_id]
      );
      if (!dups.length) {
        return res.send(`<div style="font-family:sans-serif;padding:2rem;text-align:center"><h2 style="color:#16a34a">✅ Tidak ada duplikat</h2><a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a></div>`);
      }
      var deleted = 0, html = '<div style="font-family:sans-serif;padding:2rem;max-width:600px;margin:auto"><h2 style="color:#d97706;margin-bottom:1rem">⚠️ Ditemukan ' + dups.length + ' kelompok duplikat</h2>';
      for (var r of dups) {
        var ids = r.ids.split(',').map(Number);
        var keep = ids[0];
        var delIds = ids.slice(1);
        var [result] = await db.query('DELETE FROM penerima_manfaat WHERE id IN (' + delIds.map(() => '?').join(',') + ') AND tenant_id=?', [...delIds, req.user.tenant_id]);
        deleted += result.affectedRows;
        html += '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:0.5rem;padding:0.75rem 1rem;margin-bottom:0.5rem;font-size:0.875rem">';
        html += '<b>' + r.nama_kelompok + '</b> (' + r.kategori_penerima + ') → keep id ' + keep + ', hapus ' + result.affectedRows + ' baris</div>';
      }
      html += '<div style="margin-top:1rem;padding:1rem;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:0.5rem;font-weight:600">✅ Total ' + deleted + ' baris duplikat dihapus</div>';
      html += '<a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a></div>';
      res.send(html);
    } catch (e) {
      res.status(500).send(`<div style="font-family:sans-serif;padding:2rem;text-align:center"><h2 style="color:#dc2626">❌ Gagal</h2><p>${e.message}</p></div>`);
    }
  });

  // Endpoint migrasi jurnal umum & double entry accounting (admin only)
  app.get('/api/migrate/jurnal', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const { runMigrasiJurnal } = require('./scripts/migrasi-jurnal');
      const logs = await runMigrasiJurnal(db);
      const escapedLogs = logs.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('\n');
      const success = logs.every(l => l.startsWith('✓'));
      res.send(`
        <div style="font-family:sans-serif;padding:2rem;max-width:600px;margin:auto;background:#f5f5f4">
          <h2 style="color:${success ? '#16a34a' : '#d97706'};margin-bottom:1rem">
            ${success ? '✅' : '⚠️'} Migrasi Jurnal ${success ? 'Selesai' : 'Sebagian'}
          </h2>
          <pre style="background:#1c1917;color:#a3e635;padding:1rem;border-radius:0.5rem;font-size:0.8rem;line-height:1.6;overflow-x:auto">${escapedLogs}</pre>
          <div style="margin-top:1rem;display:flex;gap:0.75rem;flex-wrap:wrap">
            <a href="/api/migrate/cek-tabel" style="padding:0.5rem 1.25rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">📋 Cek Tabel</a>
            <a href="/" style="padding:0.5rem 1.25rem;background:#6b7280;color:white;text-decoration:none;border-radius:0.5rem">🏠 Dashboard</a>
          </div>
        </div>`);
    } catch (e) {
      res.status(500).send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center">
          <h2 style="color:#dc2626">❌ Migrasi Gagal</h2>
          <p style="color:#6b7280;margin-top:0.5rem">${e.message}</p>
        </div>`);
    }
  });

  // Endpoint auto-repost jurnal dari kas_bank (admin only)
  app.post('/api/migrate/repost-jurnal', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const { autoPostKasBankToJurnal } = require('./routes/jurnal');
      const [kasList] = await db.query('SELECT * FROM kas_bank WHERE tenant_id=?', [req.user.tenant_id]);
      let posted = 0, skipped = 0;
      for (const kas of kasList) {
        try {
          await autoPostKasBankToJurnal(kas, req.user.tenant_id);
          posted++;
        } catch { skipped++; }
      }
      res.json({ ok: true, posted, skipped, total: kasList.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Endpoint isi berat_per_satuan bahan baku berdasarkan satuan (admin only)
  app.get('/api/migrate/berat-per-satuan', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      var results = [];
      var [r1] = await db.query("UPDATE bahan_baku SET berat_per_satuan = 1000 WHERE satuan = 'Kg' AND (berat_per_satuan IS NULL OR berat_per_satuan = 0)");
      if (r1.affectedRows) results.push('Kg → 1000g: ' + r1.affectedRows + ' bahan');
      var [r2] = await db.query("UPDATE bahan_baku SET berat_per_satuan = 1 WHERE (satuan = 'Gram' OR satuan = 'g' OR satuan = 'gr') AND (berat_per_satuan IS NULL OR berat_per_satuan = 0)");
      if (r2.affectedRows) results.push('Gram/g/gr → 1g: ' + r2.affectedRows + ' bahan');
      var [r3] = await db.query("UPDATE bahan_baku SET berat_per_satuan = 1000 WHERE satuan = 'Liter' AND (berat_per_satuan IS NULL OR berat_per_satuan = 0)");
      if (r3.affectedRows) results.push('Liter → 1000g: ' + r3.affectedRows + ' bahan');
      var [sisa] = await db.query("SELECT satuan, COUNT(*) cnt FROM bahan_baku WHERE (berat_per_satuan IS NULL OR berat_per_satuan = 0) AND satuan NOT IN ('Kg','Gram','g','gr','Liter') GROUP BY satuan");
      var total = (r1.affectedRows || 0) + (r2.affectedRows || 0) + (r3.affectedRows || 0);
      var html = '<div style="font-family:sans-serif;padding:2rem;max-width:600px;margin:auto">';
      html += '<h2 style="color:#16a34a;margin-bottom:1rem">✅ Berat per Satuan — ' + total + ' diisi</h2>';
      results.forEach(r => { html += '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:0.5rem;padding:0.75rem;margin-bottom:0.5rem">' + r + '</div>'; });
      if (sisa.length) {
        html += '<div style="margin-top:1rem;padding:0.75rem;background:#fffbeb;border:1px solid #fde68a;border-radius:0.5rem">';
        html += '<b style="color:#92400e">Sisa manual (' + sisa.reduce((s,r) => s+Number(r.cnt), 0) + ' bahan):</b><div style="margin-top:0.5rem;font-size:0.875rem">';
        sisa.forEach(r => { html += '<div style="padding:0.25rem 0">• ' + r.satuan + ': <b>' + r.cnt + '</b> bahan — isi manual</div>'; });
        html += '</div></div>';
      } else {
        html += '<div style="margin-top:1rem;padding:0.75rem;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:0.5rem;color:#166534">✅ Semua bahan sudah terisi</div>';
      }
      html += '<a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a></div>';
      res.send(html);
    } catch (e) {
      res.status(500).send(`<div style="font-family:sans-serif;padding:2rem;text-align:center"><h2 style="color:#dc2626">❌ Gagal</h2><p>${e.message}</p></div>`);
    }
  });

  // ── ERROR HANDLING ──────────────────────
  process.on('unhandledRejection', (err) => console.error('Unhandled Rejection:', err));
  app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  // Graceful shutdown — tutup koneksi DB dulu
  process.on('SIGTERM', () => {
    db.end().catch(() => {}).finally(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    db.end().catch(() => {}).finally(() => process.exit(0));
  });

  // ── START ────────────────────────────────
  app.listen(PORT, () => {
    const label = isWorker ? `⚡ Worker ${process.pid}` : '🚀 Server';
    console.log(`${label} — http://localhost:${PORT}`);

  });
}
