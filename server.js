require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', immutable: true }));

// API
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

// Pages (server-rendered shell, client-side fetch untuk data)
app.get('/login', (req, res) => res.render('login'));
app.get('/signup', (req, res) => res.render('signup'));
app.get('/', (req, res) => res.render('app'));
app.get(/^\/(?!api).*/, (req, res) => res.render('app'));

process.on('unhandledRejection', (err) => console.error('Unhandled Rejection:', err));
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: err.message || 'Internal server error' });
});
app.listen(PORT, () => console.log(`MBG Kitchen SaaS berjalan di http://localhost:${PORT}`));
