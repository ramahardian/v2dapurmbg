require('dotenv').config();
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdn.sheetjs.com", "https://fonts.googleapis.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    if (!req.secure) return res.redirect('https://' + req.headers.host + req.originalUrl);
    next();
  });
}

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', immutable: true }));

// Public API (no auth)
app.get('/api/public/stats', async (req, res) => {
  try {
    const tenantId = 1;
    const [[menuCount]] = await db.query('SELECT COUNT(*) AS total FROM menu WHERE tenant_id=?', [tenantId]);
    const [[katCount]] = await db.query('SELECT COUNT(DISTINCT kategori_penerima) AS total FROM menu WHERE tenant_id=? AND kategori_penerima IS NOT NULL', [tenantId]);
    const [[prod]] = await db.query('SELECT COALESCE(SUM(jumlah_porsi),0) AS total, COUNT(DISTINCT DATE(tanggal_produksi)) AS days FROM produksi WHERE tenant_id=?', [tenantId]);
    const porsiPerHari = prod.days > 0 ? Math.round(prod.total / prod.days) : 0;
    res.json({
      porsi_per_hari: porsiPerHari || 1000,
      total_menu: Number(menuCount.total) || 39,
      total_kategori: Number(katCount.total) || 5
    });
  } catch (e) {
    res.json({ porsi_per_hari: 1000, total_menu: 39, total_kategori: 5 });
  }
});

// API
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

// Pages (server-rendered shell, client-side fetch untuk data)
app.get('/login', (req, res) => res.render('login'));
app.get('/signup', (req, res) => res.render('signup'));

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

const distVer = (() => { try { return require('fs').statSync(path.join(__dirname, 'public', 'dist', 'app.min.js')).mtimeMs; } catch { return Date.now(); } })();
app.get('/', requirePageAuth, (req, res) => res.render('app', { distVer }));
app.get(/^\/(?!api).*/, requirePageAuth, (req, res) => res.render('app', { distVer }));

process.on('unhandledRejection', (err) => console.error('Unhandled Rejection:', err));
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: err.message || 'Internal server error' });
});
app.listen(PORT, () => console.log(`Dapur Sukaluyu berjalan di http://localhost:${PORT}`));
