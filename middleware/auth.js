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

module.exports = { sign, requireAuth, requireRole };
