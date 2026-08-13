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
  const { requireAuth, requireRole, trackActivity } = require('./middleware/auth');
  const authRoutes = require('./routes/auth');
  const apiRoutes = require('./routes/api');
  const db = require('./db');
  const app = express();
  const PORT = process.env.PORT || 3000;
  const isWorker = cluster.isWorker;

  if (isWorker) console.log(`⚡ Worker ${process.pid} started`);

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  // Cache template hanya di production — matikan di dev agar hot-reload works
  if (process.env.NODE_ENV !== 'production') app.disable('view cache');
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

  // 8) Rate limiting — proteksi abuse
  const rateLimit = require('express-rate-limit');

  // Limiter khusus untuk migrate/DML endpoints: 30 request per 15 menit
  const migrateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: 'Terlalu banyak request migrasi. Coba lagi 15 menit.' },
  });

  // API limiter umum: 200 request per menit per IP
  // Skip /api/public/* (tidak dilimit agar publik bisa akses), /api/migrate/* (punya limiter sendiri),
  // dan endpoint realtime ringan yang butuh auth (polling chat, online-users, online-history, notifikasi)
  const isRealtimePoll = (req) =>
    req.path.startsWith('/chat') ||
    req.path.startsWith('/dashboard/online-users') ||
    req.path.startsWith('/dashboard/online-history') ||
    req.path.startsWith('/notifikasi');
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.startsWith('/api/public') || req.path.startsWith('/api/migrate') || isRealtimePoll(req),
    message: { error: 'Terlalu banyak request. Coba lagi nanti.' },
  });

  // Pasang limiter migrate dulu (lebih spesifik)
  app.use('/api/migrate', migrateLimiter);

  // Pasang limiter umum untuk /api/* — public & migrate sudah di-skip
  app.use('/api', apiLimiter);

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
  app.use('/api', trackActivity, apiRoutes);

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
  app.get('/absen/dashboard', requireKaryawanAuth, (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    res.render('absen-karyawan');
  });

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

  // Cache-buster berbasis hash konten (MD5 8 hex). Sumber utama: manifest
  // `app.min.js.hash` yang ditulis scripts/build.js pada SETIAP build — jadi build
  // baru yang mengubah isi bundle langsung menghasilkan versi baru, bahkan jika
  // deploy preserve timestamp (rsync -t / tar / git) atau server tidak direstart.
  // statSync + baca file kecil per-request sangat murah (<0.1ms); hash besar hanya
  // dibaca ulang saat mtime manifest berubah. Fallback (tanpa manifest): hash
  // konten bundle, di-trigger oleh perubahan mtime ATAU ukuran file.
  const DIST_BUNDLE_PATH = path.join(__dirname, 'public', 'dist', 'app.min.js');
  const DIST_VER_PATH = path.join(__dirname, 'public', 'dist', 'app.min.js.hash');
  let distVerCache = { hashMtime: null, bundleMtime: null, bundleSize: null, ver: null };
  function hashBundle() {
    return require('crypto').createHash('md5').update(require('fs').readFileSync(DIST_BUNDLE_PATH)).digest('hex').slice(0, 8);
  }
  function getDistVer() {
    const fs = require('fs');
    // 1) Sumber utama: manifest `app.min.js.hash` yang ditulis scripts/build.js.
    //    Berbasis konten (bukan mtime) — setiap build baru dengan isi berbeda
    //    langsung menghasilkan versi baru, bahkan saat deploy preserve timestamp
    //    (rsync -t / tar / git) atau server tidak direstart.
    //    Signature cache = (mtime manifest, mtime bundle, size bundle); ketiganya
    //    direkam bareng setiap recompute agar tidak saling menimpa dengan data basi.
    try {
      const hmtime = fs.statSync(DIST_VER_PATH).mtimeMs;
      const bst = fs.statSync(DIST_BUNDLE_PATH);
      const bundleChanged = distVerCache.bundleMtime !== null
        && (distVerCache.bundleMtime !== bst.mtimeMs || distVerCache.bundleSize !== bst.size);
      const manifestChanged = distVerCache.hashMtime !== hmtime;
      if (distVerCache.ver === null || bundleChanged || manifestChanged) {
        distVerCache.hashMtime = hmtime;
        distVerCache.bundleMtime = bst.mtimeMs;
        distVerCache.bundleSize = bst.size;
        if (bundleChanged) {
          // Bundle diganti (build baru / deploy parsial tanpa update manifest)
          // → kebenaran ada di konten bundle itu sendiri.
          distVerCache.ver = hashBundle();
        } else {
          // Hanya manifest yang berubah → pakai hash-nya, dengan guard korup/kosong.
          const v = fs.readFileSync(DIST_VER_PATH, 'utf8').trim();
          distVerCache.ver = /^[0-9a-f]{8}$/.test(v) ? v : hashBundle();
        }
      }
      return distVerCache.ver;
    } catch {}
    // 2) Fallback tanpa manifest: hash konten bundle; re-hash hanya saat
    //    mtime ATAU size berubah (menangkap deploy yang preserve mtime
    //    tetapi mengubah ukuran file).
    try {
      const st = fs.statSync(DIST_BUNDLE_PATH);
      if (distVerCache.ver === null || distVerCache.bundleMtime !== st.mtimeMs || distVerCache.bundleSize !== st.size) {
        distVerCache.bundleMtime = st.mtimeMs;
        distVerCache.bundleSize = st.size;
        distVerCache.ver = hashBundle();
      }
      return distVerCache.ver;
    } catch {}
    return distVerCache.ver || Date.now();
  }
  // Halaman HTML selalu di-revalidate (Cache-Control: no-cache) agar `?v=` terbaru
  // langsung dimuat browser tanpa hard refresh; file bundle-nya sendiri tetap
  // disajikan immutable 7 hari (aman karena URL ber-version).
  app.get('/', requirePageAuth, (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.render('app', { distVer: getDistVer() });
  });
  app.get(/^\/(?!api).*/, requirePageAuth, (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.render('app', { distVer: getDistVer() });
  });

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

  // Endpoint fix Ayam Potong target belanja 250 kg (admin only).
  // /total-kebutuhan menghitung BERAT KOTOR (belanja) = bersih ÷ BDD, jadi
  // bersih/porsi yang di-resep tampil 2× lebih besar. Endpoint ini auto-detect
  // (by nama, bukan id) sehingga jalan di server mana pun:
  //   - bahan baku "Ayam Potong" milik tenant
  //   - semua resep menu yang memakainya
  //   - porsi dari siklus Aktif tenant (fallback: jumlah_porsi terbanyak menu)
  // Lalu set bersih/porsi agar total belanja pas TARGET_KG.
  app.get('/api/migrate/ayam-potong-target-250', requireAuth, requireRole('admin'), async (req, res) => {
    const tenantId = req.user.tenant_id;
    const TARGET_KG = 250, BDD = 50;
    const wrap = (title, ok, extra = '') => res.send(`
      <div style="font-family:sans-serif;padding:2rem;text-align:center">
        <h2 style="color:${ok ? '#16a34a' : '#dc2626'}">${ok ? '✅' : '❌'} ${title}</h2>
        <p style="color:#6b7280;margin-top:0.5rem">${extra}</p>
        <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;
           background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali ke Dashboard</a>
      </div>`);
    try {
      // 1) Bahan baku "Ayam Potong" milik tenant
      const [bbRows] = await db.query(
        `SELECT id, nama, berat_1_sp, persen_bdd FROM bahan_baku
         WHERE tenant_id=? AND (nama='Ayam Potong' OR nama LIKE 'Ayam Potong %' OR nama LIKE 'Ayam Potong 1 SP')
         ORDER BY (nama='Ayam Potong') DESC, id LIMIT 1`, [tenantId]);
      if (!bbRows.length) return wrap('Bahan "Ayam Potong" tidak ditemukan untuk tenant ini', false, 'Cek nama di Master Bahan Baku.');
      const BAHAN_ID = bbRows[0].id;

      // 2) Semua resep menu yang memakai Ayam Potong (milik tenant)
      const [mbRows] = await db.query(
        `SELECT mb.menu_id, mb.jumlah, m.nama AS menu_nama, m.jumlah_porsi
         FROM menu_bahan mb JOIN menu m ON m.id=mb.menu_id
         WHERE mb.bahan_baku_id=? AND m.tenant_id=?`, [BAHAN_ID, tenantId]);
      if (!mbRows.length) return wrap('Ayam Potong belum dipakai resep menu mana pun', false, 'Tambahkan dulu di resep menu yang dipakai siklus.');

      // 3) Porsi yang dipakai /total-kebutuhan = siklus Aktif tenant
      //    (fallback: jumlah_porsi terbesar dari menu yang memakai ayam)
      let porsi = 0;
      const [sik] = await db.query('SELECT jumlah_porsi FROM siklus_menu WHERE tenant_id=? AND status="Aktif" ORDER BY id LIMIT 1', [tenantId]);
      if (sik[0]) porsi = Number(sik[0].jumlah_porsi) || 0;
      if (!porsi) porsi = Math.max.apply(null, mbRows.map(r => Number(r.jumlah_porsi) || 0)) || 0;
      if (!porsi) return wrap('jumlah_porsi tidak ditemukan', false, 'Isi jumlah_porsi di siklus aktif / menu resep.');

      const bersih = Math.round((TARGET_KG * 1000 * (BDD / 100)) / porsi * 10000) / 10000; // g/porsi
      const kotor = Math.round(bersih / (BDD / 100) * 100) / 100;

      // Sudah sesuai? (semua resep menu tsb sudah bersih ≈ bersih)
      const sudah = mbRows.every(r => r.jumlah !== null && r.jumlah !== undefined && Math.abs(Number(r.jumlah) - bersih) < 0.001);
      const bddOk = Math.abs(Number(bbRows[0].persen_bdd || 0) - BDD) < 0.01;
      if (sudah && bddOk && req.query.force !== '1') {
        return wrap('Sudah sesuai target ' + TARGET_KG + ' kg', true,
          'bersih/porsi = ' + bersih + ' g (BDD ' + BDD + '%), dipakai di ' + mbRows.length + ' menu. Refresh /total-kebutuhan.');
      }

      // 4) Backup (hanya sekali — jangan menimpa backup asli yang sudah ada)
      const bak = async (tbl, buildSql, getSql, getP, insSql, insP) => {
        await db.query(`CREATE TABLE IF NOT EXISTS ${tbl} ${buildSql}`);
        const [[hit]] = await db.query(getSql, getP);
        if (!hit) await db.query(insSql, insP);
      };
      await bak('backup_ayam_potong_target250',
        'AS SELECT mb.*, m.tenant_id AS menu_tenant FROM menu_bahan mb JOIN menu m ON m.id=mb.menu_id WHERE 1=0',
        'SELECT id FROM backup_ayam_potong_target250 WHERE bahan_baku_id=? AND menu_tenant=? LIMIT 1', [BAHAN_ID, tenantId],
        'INSERT INTO backup_ayam_potong_target250 SELECT mb.*, m.tenant_id FROM menu_bahan mb JOIN menu m ON m.id=mb.menu_id WHERE mb.bahan_baku_id=? AND m.tenant_id=?', [BAHAN_ID, tenantId]);
      await bak('backup_bahan_baku_ayam_250',
        'AS SELECT * FROM bahan_baku WHERE 1=0',
        'SELECT id FROM backup_bahan_baku_ayam_250 WHERE id=? LIMIT 1', [BAHAN_ID],
        'INSERT INTO backup_bahan_baku_ayam_250 SELECT * FROM bahan_baku WHERE id=?', [BAHAN_ID]);
      await bak('backup_sp_ref_ayam_250',
        'AS SELECT * FROM sp_referensi_bahan WHERE 1=0',
        'SELECT id FROM backup_sp_ref_ayam_250 WHERE tenant_id=? LIMIT 1', [tenantId],
        'INSERT INTO backup_sp_ref_ayam_250 SELECT * FROM sp_referensi_bahan WHERE tenant_id=?', [tenantId]);

      // 5) Terapkan
      await db.query('UPDATE menu_bahan SET jumlah=? WHERE bahan_baku_id=? AND menu_id IN (SELECT id FROM menu WHERE tenant_id=?)', [bersih, BAHAN_ID, tenantId]);
      await db.query('UPDATE bahan_baku SET berat_1_sp=? WHERE id=? AND tenant_id=?', [bersih, BAHAN_ID, tenantId]);
      await db.query('UPDATE sp_referensi_bahan SET berat_bersih=?, berat_kotor=? WHERE tenant_id=? AND nama LIKE "Ayam Potong%"', [bersih, kotor, tenantId]);

      const menuNames = mbRows.map(r => r.menu_nama).filter(Boolean).slice(0, 3).join('; ');
      return wrap('Berhasil — Ayam Potong target belanja ' + TARGET_KG + ' kg', true,
        'Bahan id ' + BAHAN_ID + ' | bersih/porsi = ' + bersih + ' g → kotor ' + kotor + ' g × ' + porsi + ' porsi = ' + TARGET_KG + ' kg.' +
        ' Diterapkan di ' + mbRows.length + ' resep menu (' + (menuNames || '-') + ').');
    } catch (e) {
      return wrap(e.message, false, 'Lihat log server untuk detail.');
    }
  });

  // Endpoint hapus SEMUA data absensi (admin only)
  app.get('/api/migrate/hapus-absensi', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM absensi WHERE tenant_id=?', [req.user.tenant_id]);

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

      await db.query('DELETE FROM absensi WHERE tenant_id=?', [req.user.tenant_id]);

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

  // Endpoint migrasi: tambah composite index (tenant_id, id) untuk mempercepat query /menu dan /siklus
  app.get('/api/migrate/index-tenant-id', requireAuth, requireRole('admin'), async (req, res) => {
    const results = [];
    try {
      await db.query('ALTER TABLE menu ADD INDEX idx_tenant_id (tenant_id, id)');
      results.push('✅ menu.idx_tenant_id');
    } catch (e) { results.push(e.errno === 1061 ? '✅ menu.idx_tenant_id (already exists)' : '❌ menu: ' + e.message); }
    try {
      await db.query('ALTER TABLE siklus_menu ADD INDEX idx_siklus_tenant_id (tenant_id, id)');
      results.push('✅ siklus_menu.idx_siklus_tenant_id');
    } catch (e) { results.push(e.errno === 1061 ? '✅ siklus_menu.idx_siklus_tenant_id (already exists)' : '❌ siklus_menu: ' + e.message); }
    res.send(`<div style="font-family:sans-serif;padding:2rem;text-align:center">${results.map(r => `<div style="margin:0.25rem 0">${r}</div>`).join('')}<a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a></div>`);
  });

  // Endpoint migrasi: tambah kolom keterangan di menu_bahan
  app.get('/api/migrate/keterangan-menu-bahan', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const [c] = await db.query("SHOW COLUMNS FROM menu_bahan LIKE 'keterangan'");
      if (c.length) {
        return res.send(`<div style="font-family:sans-serif;padding:2rem;text-align:center"><h2 style="color:#16a34a">✅ Kolom keterangan sudah ada</h2><a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a></div>`);
      }
      await db.query("ALTER TABLE menu_bahan ADD COLUMN keterangan VARCHAR(255) DEFAULT '' AFTER jumlah");
      res.send(`<div style="font-family:sans-serif;padding:2rem;text-align:center"><h2 style="color:#16a34a">✅ Kolom keterangan berhasil ditambahkan</h2><a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a></div>`);
    } catch (e) {
      res.status(500).send(`<div style="font-family:sans-serif;padding:2rem;text-align:center"><h2 style="color:#dc2626">❌ Gagal</h2><p>${e.message}</p></div>`);
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

  // Endpoint jalankan FULL migrasi database (index, kolom, FK, tabel)
  app.get('/api/migrate/run', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const { runMigration } = require('./scripts/migrate');
      const logs = await runMigration();
      const escapedLogs = logs.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('\n');
      res.send(`
        <div style="font-family:sans-serif;padding:2rem;max-width:700px;margin:auto;background:#f5f5f4">
          <h2 style="color:#16a34a;margin-bottom:1rem">✅ Migrasi Selesai</h2>
          <pre style="background:#1c1917;color:#a3e635;padding:1rem;border-radius:0.5rem;overflow-x:auto;font-size:0.8rem;line-height:1.6">${escapedLogs}</pre>
          <div style="margin-top:1.5rem;display:flex;gap:0.75rem;flex-wrap:wrap">
            <a href="/api/migrate/cek-tabel" style="padding:0.5rem 1.25rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">📋 Cek Tabel</a>
            <a href="/" style="padding:0.5rem 1.25rem;background:#6b7280;color:white;text-decoration:none;border-radius:0.5rem">🏠 Dashboard</a>
          </div>
        </div>`);
    } catch (e) {
      res.status(500).send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center">
          <h2 style="color:#dc2626">❌ Migrasi Gagal</h2>
          <p style="color:#6b7280;margin-top:0.5rem">${e.message}</p>
          <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a>
        </div>`);
    }
  });

  // Endpoint tambah database indexes untuk optimasi JOIN & filter (admin only)
  app.get('/api/migrate/add-indexes', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const { addIndexes } = require('./scripts/add-indexes');
      const logs = await addIndexes();
      const escapedLogs = logs.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('\n');
      res.send(`
        <div style="font-family:sans-serif;padding:2rem;max-width:800px;margin:auto;background:#f5f5f4">
          <h2 style="color:#16a34a;margin-bottom:1rem">✅ Database Indexes Selesai</h2>
          <pre style="background:#1c1917;color:#a3e635;padding:1rem;border-radius:0.5rem;overflow-x:auto;font-size:0.8rem;line-height:1.6">${escapedLogs}</pre>
          <div style="margin-top:1.5rem;display:flex;gap:0.75rem;flex-wrap:wrap">
            <a href="/api/migrate/cek-tabel" style="padding:0.5rem 1.25rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">📋 Cek Tabel</a>
            <a href="/" style="padding:0.5rem 1.25rem;background:#6b7280;color:white;text-decoration:none;border-radius:0.5rem">🏠 Dashboard</a>
          </div>
        </div>`);
    } catch (e) {
      res.status(500).send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center">
          <h2 style="color:#dc2626">❌ Gagal</h2>
          <p style="color:#6b7280;margin-top:0.5rem">${e.message}</p>
          <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a>
        </div>`);
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

  // Endpoint add column tanggal_mulai ke siklus_menu (admin only)
  app.get('/api/migrate/tanggal-mulai-siklus', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const [cols] = await db.query("SHOW COLUMNS FROM siklus_menu LIKE 'tanggal_mulai'");
      if (cols.length > 0) {
        return res.send(`
          <div style="font-family:sans-serif;padding:2rem;text-align:center;background:#f5f5f4;min-height:100vh">
            <h2 style="color:#16a34a">✅ Kolom tanggal_mulai sudah ada</h2>
            <p style="color:#6b7280;margin-top:0.5rem">Tidak perlu diubah.</p>
            <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a>
          </div>`);
      }
      await db.query("ALTER TABLE siklus_menu ADD COLUMN tanggal_mulai DATE DEFAULT NULL AFTER catatan");
      res.send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center;background:#f5f5f4;min-height:100vh">
          <h2 style="color:#16a34a">✅ ALTER TABLE BERHASIL!</h2>
          <p style="color:#6b7280;margin-top:0.5rem">Kolom <code>tanggal_mulai</code> berhasil ditambahkan ke tabel <code>siklus_menu</code>.</p>
          <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali ke Dashboard</a>
        </div>`);
    } catch (e) {
      res.status(500).send(`<div style="font-family:sans-serif;padding:2rem;text-align:center"><h2 style="color:#dc2626">❌ Gagal</h2><p>${e.message}</p></div>`);
    }
  });

  // Endpoint migrasi: users.foto VARCHAR(255) → LONGTEXT untuk base64
  app.get('/api/migrate/foto-longtext', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const [ftCol] = await db.query(
        "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'foto'"
      );
      if (!ftCol.length) {
        return res.send(`
          <div style="font-family:sans-serif;padding:2rem;text-align:center;background:#f5f5f4;min-height:100vh">
            <h2 style="color:#dc2626">❌ Kolom foto tidak ditemukan</h2>
            <p style="color:#6b7280;margin-top:0.5rem">Tabel users belum memiliki kolom foto.</p>
            <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a>
          </div>`);
      }
      if (ftCol[0].DATA_TYPE === 'longtext') {
        return res.send(`
          <div style="font-family:sans-serif;padding:2rem;text-align:center;background:#f5f5f4;min-height:100vh">
            <h2 style="color:#16a34a">✅ Kolom foto sudah LONGTEXT</h2>
            <p style="color:#6b7280;margin-top:0.5rem">Tidak perlu diubah.</p>
            <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a>
          </div>`);
      }
      await db.query('ALTER TABLE users MODIFY foto LONGTEXT DEFAULT NULL');
      res.send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center;background:#f5f5f4;min-height:100vh">
          <h2 style="color:#16a34a">✅ ALTER TABLE BERHASIL!</h2>
          <p style="color:#6b7280;margin-top:0.5rem">Kolom <code>users.foto</code> telah diubah dari <code>VARCHAR(255)</code> → <code>LONGTEXT</code>.</p>
          <p style="color:#6b7280;margin-top:0.25rem;font-size:0.875rem">Sekarang bisa menyimpan foto base64 tanpa terpotong.</p>
          <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali ke Dashboard</a>
        </div>`);
    } catch (e) {
      res.status(500).send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center;background:#f5f5f4;min-height:100vh">
          <h2 style="color:#dc2626">❌ Gagal</h2>
          <p style="color:#6b7280;margin-top:0.5rem">${e.message}</p>
          <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a>
        </div>`);
    }
  });

  // Endpoint migrasi: budget → tambah porsi_besar, porsi_kecil, harga_besar, harga_kecil
  app.get('/api/migrate/budget-porsi-besar-kecil', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      // Cek per kolom (bukan hanya porsi_besar) agar migrasi parsial tetap terdeteksi
      const [budgetCols] = await db.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'budget' AND COLUMN_NAME IN ('porsi_besar','porsi_kecil','harga_besar','harga_kecil')"
      );
      const existingCols = new Set(budgetCols.map(c => c.COLUMN_NAME));
      const budgetAdds = [];
      if (!existingCols.has('porsi_besar')) budgetAdds.push('ADD COLUMN porsi_besar INT DEFAULT 0 AFTER kategori_penerima');
      if (!existingCols.has('porsi_kecil')) budgetAdds.push('ADD COLUMN porsi_kecil INT DEFAULT 0 AFTER porsi_besar');
      if (!existingCols.has('harga_besar')) budgetAdds.push('ADD COLUMN harga_besar DECIMAL(15,2) DEFAULT 0 AFTER harga_per_porsi');
      if (!existingCols.has('harga_kecil')) budgetAdds.push('ADD COLUMN harga_kecil DECIMAL(15,2) DEFAULT 0 AFTER harga_besar');
      if (!budgetAdds.length) {
        return res.send(`
          <div style="font-family:sans-serif;padding:2rem;text-align:center;background:#f5f5f4;min-height:100vh">
            <h2 style="color:#16a34a">✅ Kolom sudah ada</h2>
            <p style="color:#6b7280;margin-top:0.5rem">porsi_besar, porsi_kecil, harga_besar, harga_kecil sudah ada.</p>
            <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a>
          </div>`);
      }
      await db.query('ALTER TABLE budget ' + budgetAdds.join(', '));
      res.send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center;background:#f5f5f4;min-height:100vh">
          <h2 style="color:#16a34a">✅ ALTER TABLE BERHASIL!</h2>
          <p style="color:#6b7280;margin-top:0.5rem">Kolom <code>${budgetAdds.map(a => a.replace('ADD COLUMN ', '').split(' ')[0]).join('</code>, <code>')}</code> berhasil ditambahkan ke tabel <code>budget</code>.</p>
          <p style="color:#6b7280;margin-top:0.5rem;font-size:0.875rem"><code>jumlah_penerima</code> otomatis = porsi_besar + porsi_kecil</p>
          <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali ke Dashboard</a>
        </div>`);
    } catch (e) {
      res.status(500).send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center;background:#f5f5f4;min-height:100vh">
          <h2 style="color:#dc2626">❌ Gagal</h2>
          <p style="color:#6b7280;margin-top:0.5rem">${e.message}</p>
          <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a>
        </div>`);
    }
  });
  
  // Endpoint migrasi: tambah kolom last_activity ke users (untuk fitur Who's Online)
  app.get('/api/migrate/users-last-activity', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const [cols] = await db.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'last_activity'`
      );
      
      if (cols.length) {
        return res.send(`
          <div style="font-family:sans-serif;padding:2rem;text-align:center;background:#f5f5f4;min-height:100vh">
            <h2 style="color:#16a34a">✅ Kolom last_activity sudah ada</h2>
            <p style="color:#6b7280;margin-top:0.5rem">Tidak perlu diubah. Fitur Who's Online siap digunakan.</p>
            <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a>
          </div>`);
      }
      
      await db.query(
        `ALTER TABLE users ADD COLUMN last_activity DATETIME DEFAULT NULL AFTER karyawan_id`
      );
      
      res.send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center;background:#f5f5f4;min-height:100vh">
          <h2 style="color:#16a34a">✅ ALTER TABLE BERHASIL!</h2>
          <p style="color:#6b7280;margin-top:0.5rem">
            Kolom <code>last_activity</code> (DATETIME, NULL) berhasil ditambahkan ke tabel <code>users</code>
          </p>
          <p style="color:#6b7280;margin-top:0.5rem;font-size:0.875rem">
            Digunakan untuk tracking aktivitas user (fitur <strong>Who's Online</strong> di Dashboard)
          </p>
          <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali ke Dashboard</a>
        </div>`);
    } catch (e) {
      res.status(500).send(`
        <div style="font-family:sans-serif;padding:2rem;text-align:center;background:#f5f5f4;min-height:100vh">
          <h2 style="color:#dc2626">❌ Gagal</h2>
          <p style="color:#6b7280;margin-top:0.5rem">${e.message}</p>
          <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:0.5rem">Kembali</a>
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

    // Auto-arsip siklus menu yang sudah lewat tanggal_selesai (idempotent).
    // Selain berjalan berkala, juga dipanggil lazy saat GET /siklus & /menu/by-siklus.
    const { autoArchiveSiklus } = require('./routes/siklus/helpers');
    const archiveRun = () => autoArchiveSiklus().catch(() => {});
    setInterval(archiveRun, 60 * 60 * 1000).unref();
    setTimeout(archiveRun, 15 * 1000).unref();
  });
}
