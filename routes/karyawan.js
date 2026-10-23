const express = require('express');
const db = require('../db');
const fs = require('fs');
const path = require('path');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function saveBase64Photo(base64Data) {
  if (!base64Data || !base64Data.startsWith('data:image')) return base64Data || null;
  const matches = base64Data.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
  if (!matches) return null;
  try {
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const filepath = path.join(__dirname, '..', 'public', 'uploads', 'karyawan', filename);
    fs.writeFileSync(filepath, buffer);
    return '/uploads/karyawan/' + filename;
  } catch { return null; }
}

// Ambil nama jabatan dari tabel jabatan (dipakai untuk menjaga kolom legacy
// karyawan.jabatan tetap terisi). Aman jika tabel/kolom belum ada.
async function resolveJabatanName(jabatanId) {
  if (!jabatanId) return null;
  try {
    const [rows] = await db.query('SELECT name FROM jabatan WHERE id=?', [jabatanId]);
    return rows[0] ? rows[0].name : null;
  } catch { return null; }
}

router.get('/karyawan', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const { status, departemen, jabatan, search, page, limit, has_absensi } = req.query;
    let where = ' WHERE (k.tenant_id=? OR k.tenant_id IS NULL)';
    const params = [req.user.tenant_id];
    if (status) { where += ' AND k.status=?'; params.push(status); }
    if (departemen) { where += ' AND k.departemen=?'; params.push(departemen); }
    if (search) { where += ' AND (k.nama LIKE ? OR k.nik LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (has_absensi) { where += ' AND k.id IN (SELECT DISTINCT karyawan_id FROM absensi WHERE tenant_id=?)'; params.push(req.user.tenant_id); }

    // Simpan kondisi tanpa filter jabatan untuk fallback bila tabel jabatan
    // belum ada di DB lama. Filter jabatan hanya bisa dipakai dengan JOIN.
    const fallbackWhere = where;
    const fallbackParams = [...params];
    if (jabatan) { where += ' AND j.name LIKE ?'; params.push(`%${jabatan}%`); }

    const subquery = `(SELECT COUNT(*) FROM absensi a WHERE a.karyawan_id=k.id AND a.tanggal >= DATE_SUB(NOW(), INTERVAL 30 DAY)) as absensi_30hari`;
    const joinFrom = 'FROM karyawan k LEFT JOIN jabatan j ON j.id = k.jabatan_id';
    const plainFrom = 'FROM karyawan k';

    const fetchPaged = async (withJoin, limitNum, offset) => {
      const from = withJoin ? joinFrom : plainFrom;
      const w = withJoin ? where : fallbackWhere;
      const p = withJoin ? params : fallbackParams;
      const cols = withJoin ? `k.*, COALESCE(j.name, k.jabatan) as jabatan_nama` : `k.*`;
      const [countResult] = await db.query(`SELECT COUNT(*) as count ${from} ${w}`, p);
      const [rows] = await db.query(
        `SELECT ${cols}, ${subquery} ${from} ${w} ORDER BY k.nama ASC LIMIT ? OFFSET ?`,
        [...p, limitNum, offset]);
      return { total: countResult[0].count, rows };
    };

    const fetchAll = async (withJoin) => {
      const from = withJoin ? joinFrom : plainFrom;
      const w = withJoin ? where : fallbackWhere;
      const p = withJoin ? params : fallbackParams;
      const cols = withJoin ? `k.*, COALESCE(j.name, k.jabatan) as jabatan_nama` : `k.*`;
      const [rows] = await db.query(`SELECT ${cols}, ${subquery} ${from} ${w} ORDER BY k.nama ASC`, p);
      return rows;
    };

    const isSchemaError = (e) => e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR';

    if (page && limit) {
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;
      let result;
      try {
        result = await fetchPaged(true, limitNum, offset);
      } catch (e) {
        if (!isSchemaError(e)) throw e;
        console.warn('Karyawan GET: fallback tanpa join jabatan:', e.message);
        result = await fetchPaged(false, limitNum, offset);
      }
      const total = result.total;
      return res.json({ data: result.rows, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } });
    }

    let rows;
    try {
      rows = await fetchAll(true);
    } catch (e) {
      if (!isSchemaError(e)) throw e;
      console.warn('Karyawan GET: fallback tanpa join jabatan:', e.message);
      rows = await fetchAll(false);
    }
    res.json(rows);
  } catch (err) {
    console.error('Karyawan GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/karyawan', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const { nama, nik, jabatan_id, jabatan, departemen, gaji_pokok, status, tanggal_masuk, email, phone, address, photo } = req.body;
    if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama karyawan wajib diisi' });

    const [existing] = await db.query('SELECT id FROM karyawan WHERE nama=? AND (tenant_id=? OR tenant_id IS NULL)', [nama.trim(), req.user.tenant_id]);
    if (existing.length) return res.status(409).json({ error: 'Karyawan dengan nama "' + nama.trim() + '" sudah ada' });

    const photoUrl = saveBase64Photo(photo);
    const jabatanNama = jabatan || await resolveJabatanName(jabatan_id);
    const [r] = await db.query(
      `INSERT INTO karyawan (tenant_id, nama, nik, jabatan, jabatan_id, departemen, gaji_pokok, status, tanggal_masuk, email, phone, address, photo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.tenant_id, nama, nik || null, jabatanNama || null, jabatan_id || null, departemen || null, gaji_pokok || 0, status || 'Aktif', tanggal_masuk || null, email || '', phone || null, address || null, photoUrl]
    );
    const [rows] = await db.query(`SELECT k.*, COALESCE(j.name, k.jabatan) as jabatan_nama FROM karyawan k LEFT JOIN jabatan j ON j.id = k.jabatan_id WHERE k.id=? AND (k.tenant_id=? OR k.tenant_id IS NULL)`, [r.insertId, req.user.tenant_id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Karyawan POST error:', err);
    res.status(500).json({ error: err.message || 'Gagal menambah karyawan' });
  }
});

router.put('/karyawan/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const { nama, nik, jabatan_id, jabatan, departemen, gaji_pokok, status, tanggal_masuk, email, phone, address, photo } = req.body;
    if (nama !== undefined && (!nama || !nama.trim())) return res.status(400).json({ error: 'Nama karyawan wajib diisi' });

    if (nama !== undefined) {
      const [existing] = await db.query('SELECT id FROM karyawan WHERE nama=? AND id!=? AND (tenant_id=? OR tenant_id IS NULL)', [nama.trim(), req.params.id, req.user.tenant_id]);
      if (existing.length) return res.status(409).json({ error: 'Karyawan dengan nama "' + nama.trim() + '" sudah ada' });
    }

    const sets = []; const vals = [];
    if (nama !== undefined) { sets.push('nama=?'); vals.push(nama); }
    if (nik !== undefined) { sets.push('nik=?'); vals.push(nik || null); }
    if (jabatan_id !== undefined) {
      sets.push('jabatan_id=?'); vals.push(jabatan_id || null);
      const jabatanNama = jabatan || await resolveJabatanName(jabatan_id);
      sets.push('jabatan=?'); vals.push(jabatanNama || null);
    } else if (jabatan !== undefined) {
      sets.push('jabatan=?'); vals.push(jabatan || null);
    }
    if (departemen !== undefined) { sets.push('departemen=?'); vals.push(departemen || null); }
    if (gaji_pokok !== undefined) { sets.push('gaji_pokok=?'); vals.push(gaji_pokok); }
    if (status !== undefined) { sets.push('status=?'); vals.push(status); }
    if (tanggal_masuk !== undefined) { sets.push('tanggal_masuk=?'); vals.push(tanggal_masuk || null); }
    if (email !== undefined) { sets.push('email=?'); vals.push(email || ''); }
    if (phone !== undefined) { sets.push('phone=?'); vals.push(phone || null); }
    if (address !== undefined) { sets.push('address=?'); vals.push(address || null); }
    if (photo !== undefined) { sets.push('photo=?'); vals.push(saveBase64Photo(photo)); }
    if (!vals.length) return res.status(400).json({ error: 'Tidak ada perubahan' });
    vals.push(req.params.id, req.user.tenant_id);
    await db.query(`UPDATE karyawan SET ${sets.join(',')} WHERE id=? AND (tenant_id=? OR tenant_id IS NULL)`, vals);
    const [rows] = await db.query(`SELECT k.*, COALESCE(j.name, k.jabatan) as jabatan_nama FROM karyawan k LEFT JOIN jabatan j ON j.id = k.jabatan_id WHERE k.id=? AND (k.tenant_id=? OR k.tenant_id IS NULL)`, [req.params.id, req.user.tenant_id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Karyawan PUT error:', err);
    res.status(500).json({ error: err.message || 'Gagal menyimpan karyawan' });
  }
});

router.delete('/karyawan/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    await db.query(`DELETE FROM karyawan WHERE id=? AND (tenant_id=? OR tenant_id IS NULL)`, [req.params.id, req.user.tenant_id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Karyawan DELETE error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/departemen', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT DISTINCT departemen FROM karyawan WHERE (tenant_id=? OR tenant_id IS NULL) AND departemen IS NOT NULL ORDER BY departemen`, [req.user.tenant_id]);
    res.json(rows.map(r => r.departemen));
  } catch (err) {
    // DB lama tanpa kolom tenant_id.
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      try {
        const [rows] = await db.query(`SELECT DISTINCT departemen FROM karyawan WHERE departemen IS NOT NULL ORDER BY departemen`);
        return res.json(rows.map(r => r.departemen));
      } catch (err2) {
        console.error('Departemen GET fallback error:', err2);
      }
    }
    console.error('Departemen GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/jabatan', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM jabatan WHERE (tenant_id=? OR tenant_id IS NULL) ORDER BY id`, [req.user.tenant_id]);
    res.json(rows);
  } catch (err) {
    // DB lama: kolom jabatan.tenant_id belum dimigrasi. Fallback supaya halaman
    // karyawan tetap bisa memuat daftar jabatan.
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      try {
        const [rows] = await db.query(`SELECT * FROM jabatan ORDER BY id`);
        return res.json(rows);
      } catch (err2) {
        console.error('Jabatan GET fallback error:', err2);
      }
    }
    console.error('Jabatan GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/jabatan', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const { name, description, shift_id } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nama jabatan wajib diisi' });

    let r;
    try {
      [r] = await db.query('INSERT INTO jabatan (tenant_id, name, description, shift_id) VALUES (?,?,?,?)', [req.user.tenant_id, name.trim(), description || null, shift_id || null]);
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
      [r] = await db.query('INSERT INTO jabatan (name, description, shift_id) VALUES (?,?,?)', [name.trim(), description || null, shift_id || null]);
    }
    const [rows] = await db.query('SELECT * FROM jabatan WHERE id=?', [r.insertId]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Jabatan POST error:', err);
    res.status(500).json({ error: err.message || 'Gagal menambah jabatan' });
  }
});

router.put('/jabatan/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    const { name, description, shift_id } = req.body;
    const sets = []; const vals = [];
    if (name !== undefined) { sets.push('name=?'); vals.push(name); }
    if (description !== undefined) { sets.push('description=?'); vals.push(description); }
    if (shift_id !== undefined) { sets.push('shift_id=?'); vals.push(shift_id); }
    if (!vals.length) return res.status(400).json({ error: 'Tidak ada perubahan' });

    let rows;
    try {
      await db.query(`UPDATE jabatan SET ${sets.join(',')} WHERE id=? AND tenant_id=?`, [...vals, req.params.id, req.user.tenant_id]);
      [rows] = await db.query('SELECT * FROM jabatan WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
      await db.query(`UPDATE jabatan SET ${sets.join(',')} WHERE id=?`, [...vals, req.params.id]);
      [rows] = await db.query('SELECT * FROM jabatan WHERE id=?', [req.params.id]);
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Jabatan PUT error:', err);
    res.status(500).json({ error: err.message || 'Gagal menyimpan jabatan' });
  }
});

router.delete('/jabatan/:id', requireRole('admin', 'keuangan'), async (req, res) => {
  try {
    try {
      await db.query('DELETE FROM jabatan WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
      await db.query('DELETE FROM jabatan WHERE id=?', [req.params.id]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Jabatan DELETE error:', err);
    res.status(500).json({ error: err.message || 'Gagal menghapus jabatan' });
  }
});

module.exports = router;