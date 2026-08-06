const jwt = require('jsonwebtoken');
const db = require('../db');

function sign(user) {
  return jwt.sign(
    {
      uid: user.id,
      tenant_id: user.tenant_id,
      role: user.role,
      email: user.email,
      nama: user.nama || '',
      phone: user.phone || '',
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

async function requireAuth(req, res, next) {
  const token = req.cookies?.access_token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Tidak terautentikasi' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await db.query('SELECT id, tenant_id, email, nama, role, foto, karyawan_id FROM users WHERE id=?', [payload.uid]);
    if (!rows.length) {
      return res.status(401).json({ error: 'User tidak ditemukan' });
    }
    req.user = rows[0];
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token tidak valid' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Tidak terautentikasi' });
    if (req.user.role === 'admin') return next();
    if (roles.includes(req.user.role)) return next();
    return res.status(403).json({ error: 'Akses ditolak' });
  };
}

// Riwayat aktivitas: throttle heartbeat per user (maks 1 baris per 5 menit).
// Disimpan di memory (per proses) agar tidak menambah query DB di tiap request.
const heartbeatLog = new Map();
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

function logUserActivity(tenantId, userId, nama, role, event) {
  // Riwayat PER KEJADIAN: setiap login & heartbeat dicatat sebagai BARIS BARU
  // (bukan merge 1 baris per user), sehingga modal "Riwayat User Online"
  // menampilkan kronologi aktivitas yang sebenarnya. Heartbeat tetap di-throttle
  // (maks 1 baris per 5 menit per user) di trackActivity, jadi tabel tidak membengkak.
  const isLogin = event === 'login';
  db.query(
    `INSERT INTO user_activity_log (tenant_id, user_id, nama, role, event, login_count, created_at)
     VALUES (?,?,?,?,?,?,NOW())`,
    [tenantId, userId, nama || '', role || '', event, isLogin ? 1 : 0]
  ).catch(() => {});
}

async function trackActivity(req, res, next) {
  // Middleware ini dipasang SEBELUM requireAuth (app.use('/api', trackActivity, apiRoutes)),
  // jadi req.user belum ada. Verifikasi JWT langsung di sini (field uid dari payload, sama
  // dengan requireAuth) lalu update last_activity — tanpa menunggu hasilnya agar request
  // tidak terblokir oleh write ini.
  const token = req.cookies?.access_token || (req.headers.authorization || '').replace('Bearer ', '');
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload && payload.uid) {
        db.query('UPDATE users SET last_activity = NOW() WHERE id = ?', [payload.uid]).catch(() => {});
        const now = Date.now();
        if ((heartbeatLog.get(payload.uid) || 0) <= now - HEARTBEAT_INTERVAL_MS) {
          heartbeatLog.set(payload.uid, now);
          logUserActivity(payload.tenant_id, payload.uid, payload.nama, payload.role, 'heartbeat');
        }
      }
    } catch { /* token tidak valid — abaikan */ }
  }
  next();
}

module.exports = { sign, requireAuth, requireRole, trackActivity, logUserActivity };
