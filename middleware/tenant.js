// Resolve subdomain dari header Host → tenant. Memungkinkan akses per-dapur
// via subdomain (mis. sukaluyu.mbg.id). Digunakan untuk login-scoping dan
// pemilihan tenant otomatis. Aman dipasang global: tanpa subdomain (host utama)
// middleware ini hanya melewati request tanpa query DB.
const db = require('../db');

const APP_BASE_DOMAIN = (process.env.APP_BASE_DOMAIN || '').toLowerCase().replace(/^\.+/, '');
const DEV_BASE_DOMAIN = 'localhost';

// Ekstrak subdomain dari host. Contoh:
//   "sukaluyu.mbg.id:3000"  → "sukaluyu"  (jika APP_BASE_DOMAIN=mbg.id)
//   "sukaluyu.localhost"    → "sukaluyu"  (mode dev)
//   "mbg.id" / "localhost"  → null (host utama / tanpa subdomain)
function extractSubdomain(host) {
  if (!host) return null;
  const h = String(host).split(':')[0].toLowerCase();
  if (APP_BASE_DOMAIN && h.endsWith('.' + APP_BASE_DOMAIN)) {
    const sub = h.slice(0, -(APP_BASE_DOMAIN.length + 1));
    return sub || null;
  }
  if (h.endsWith('.' + DEV_BASE_DOMAIN)) {
    const sub = h.slice(0, -(DEV_BASE_DOMAIN.length + 1));
    return sub || null;
  }
  return null;
}

// Cache tenant per subdomain (TTL pendek agar perubahan subdomain cepat terlihat)
const tenantCache = new Map();
const TENANT_CACHE_TTL_MS = 30 * 1000;

async function resolveTenant(req, res, next) {
  const sub = extractSubdomain(req.headers.host);
  if (!sub) return next();
  const now = Date.now();
  const cached = tenantCache.get(sub);
  if (cached && cached.expires > now) {
    req.tenant = cached.tenant;
    req.tenantSubdomain = sub;
    return next();
  }
  try {
    const [rows] = await db.query(
      'SELECT id, nama, subdomain, is_active FROM tenants WHERE subdomain=? LIMIT 1',
      [sub]
    );
    const tenant = rows[0] || null;
    tenantCache.set(sub, { tenant, expires: now + TENANT_CACHE_TTL_MS });
    req.tenant = tenant;
    req.tenantSubdomain = sub;
  } catch {
    req.tenant = null;
  }
  next();
}

module.exports = { resolveTenant, extractSubdomain };
