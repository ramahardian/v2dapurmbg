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

app.get('/', requirePageAuth, (req, res) => res.render('app'));
app.get(/^\/(?!api).*/, requirePageAuth, (req, res) => res.render('app'));

process.on('unhandledRejection', (err) => console.error('Unhandled Rejection:', err));
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: err.message || 'Internal server error' });
});
app.listen(PORT, () => console.log(`Dapur Sukaluyu berjalan di http://localhost:${PORT}`));
