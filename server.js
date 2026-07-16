require('dotenv').config();
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
  const whatsappBot = require('./services/whatsappBot');
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
      // Cek apakah 'Terlambat' sudah ada di ENUM
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
    // WA Bot hanya jalan di worker pertama
    if (process.env.WA_BOT_ENABLED === 'true' && (!isWorker || cluster.worker?.id === 1)) {
      whatsappBot.init().catch(e => console.error('Gagal init WA Bot:', e.message));
    }
  });
}
