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
      }
    } catch { /* token tidak valid — abaikan */ }
  }
  next();
}

module.exports = { sign, requireAuth, requireRole, trackActivity };
