const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Slugify subdomain (sama dengan saat signup)
function slugifySubdomain(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'dapur';
}

// GET /settings/subdomain — cek ketersediaan subdomain (public query param `s`)
// tanpa mengubah data. Admin: kembalikan subdomain tenant aktif.
router.get('/settings/subdomain', requireRole('admin'), async (req, res) => {
  try {
    if (req.query.s) {
      const slug = slugifySubdomain(req.query.s);
      const [rows] = await db.query(
        'SELECT id FROM tenants WHERE subdomain=? AND id!=?',
        [slug, req.user.tenant_id]
      );
      return res.json({ slug, available: !rows.length });
    }
    const [t] = await db.query('SELECT subdomain FROM tenants WHERE id=?', [req.user.tenant_id]);
    res.json({ subdomain: t[0]?.subdomain || null });
  } catch (e) {
    res.status(500).json({ error: 'Gagal memuat subdomain' });
  }
});

// PUT /settings/subdomain — ubah subdomain tenant (admin only)
router.put('/settings/subdomain', requireRole('admin'), async (req, res) => {
  const raw = (req.body.subdomain || '').trim().toLowerCase();
  if (!raw) return res.status(400).json({ error: 'Subdomain wajib diisi' });
  const slug = slugifySubdomain(raw);
  if (slug !== raw) return res.status(400).json({ error: 'Subdomain hanya boleh huruf kecil, angka, dan tanda strip (-)' });
  if (slug.length < 3) return res.status(400).json({ error: 'Subdomain minimal 3 karakter' });
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) return res.status(400).json({ error: 'Subdomain harus diawali & diakhiri huruf/angka' });
  try {
    const [dup] = await db.query('SELECT id FROM tenants WHERE subdomain=? AND id!=?', [slug, req.user.tenant_id]);
    if (dup.length) return res.status(409).json({ error: 'Subdomain sudah dipakai dapur lain' });
    await db.query('UPDATE tenants SET subdomain=? WHERE id=?', [slug, req.user.tenant_id]);
    res.json({ ok: true, subdomain: slug });
  } catch (e) {
    res.status(500).json({ error: 'Gagal mengubah subdomain' });
  }
});

module.exports = router;
