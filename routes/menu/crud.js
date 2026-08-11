/**
 * CRUD — Menu
 * Mutation endpoints: POST (create), PUT (update), DELETE, bulk-delete, recalculate-nutrisi.
 */
const db = require('../../db');
const {
  loadSpData, loadSpRefMap, loadBbNamaMap,
  processBahanItem, calculateNutrition, syncSiklusBahan,
} = require('./helpers');

function registerCrudRoutes(router) {
  // POST /menu — create menu + bahan
  router.post('/menu', async (req, res) => {
    const { nama, kategori_penerima, deskripsi, gramasi_total, gramasi_besar, gramasi_kecil, kalori, protein, karbohidrat, lemak, serat, jumlah_porsi, bahan } = req.body;

    if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama menu wajib diisi' });

    const [existing] = await db.query('SELECT id FROM menu WHERE nama=? AND tenant_id=?', [nama.trim(), req.user.tenant_id]);
    if (existing.length) return res.status(409).json({ error: 'Menu dengan nama "' + nama.trim() + '" sudah ada' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Pre-load SP & ref data
      const { spMap, jumlahPorsi } = await loadSpData(req.user.tenant_id, kategori_penerima);
      const spRefMap = await loadSpRefMap(req.user.tenant_id);
      const bbNamaMap = await loadBbNamaMap(req.user.tenant_id);

      // 1. Insert header menu
      const [r] = await conn.query(
        `INSERT INTO menu (tenant_id, nama, kategori_penerima, deskripsi, gramasi_total, gramasi_besar, gramasi_kecil, kalori, protein, karbohidrat, lemak, serat, jumlah_porsi)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [req.user.tenant_id, nama, kategori_penerima || null, deskripsi || null,
         gramasi_total || 0, gramasi_besar || 0, gramasi_kecil || 0,
         kalori || 0, protein || 0, karbohidrat || 0, lemak || 0, serat || 0, jumlah_porsi || 0]
      );

      // 2. Insert bahan
      let hasBahan = false;
      if (Array.isArray(bahan)) {
        for (const b of bahan) {
          const result = await processBahanItem(b, conn, req.user.tenant_id, spMap, jumlahPorsi, spRefMap, bbNamaMap);
          if (!result || result.jumlah <= 0) continue;
          await conn.query(
            'INSERT INTO menu_bahan (menu_id, bahan_baku_id, jumlah, keterangan) VALUES (?,?,?,?)',
            [r.insertId, result.idBahan, result.jumlah, b.keterangan || null]
          );
          hasBahan = true;
        }
      }

      // 3. Auto-calculate nutrition
      if (hasBahan) {
        await updateMenuNutrition(conn, r.insertId, req.user.tenant_id, spRefMap);
      }

      // 4. Sync siklus source
      await syncSiklusBahan(conn, req.body.siklus_source, bahan, req.user.tenant_id);

      await conn.commit();
      res.json({ id: r.insertId, ...req.body });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(400).json({ error: 'Gagal menyimpan menu: ' + (e.message || 'Terjadi kesalahan') });
    } finally {
      conn.release();
    }
  });

  // PUT /menu/:id — update menu + bahan (delete & re-insert)
  router.put('/menu/:id', async (req, res) => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const f = req.body;

      if (!f.nama || !f.nama.trim()) return res.status(400).json({ error: 'Nama menu wajib diisi' });

      const [existing] = await conn.query('SELECT id FROM menu WHERE nama=? AND tenant_id=? AND id!=?', [f.nama.trim(), req.user.tenant_id, req.params.id]);
      if (existing.length) {
        await conn.rollback();
        return res.status(409).json({ error: 'Menu dengan nama "' + f.nama.trim() + '" sudah ada' });
      }

      // Pre-load SP & ref data
      const { spMap, jumlahPorsi } = await loadSpData(req.user.tenant_id, f.kategori_penerima);
      const spRefMap = await loadSpRefMap(req.user.tenant_id);
      const bbNamaMap = await loadBbNamaMap(req.user.tenant_id);

      // 1. Update header
      await conn.query(
        `UPDATE menu SET nama=?, kategori_penerima=?, deskripsi=?, gramasi_total=?, gramasi_besar=?, gramasi_kecil=?, kalori=?, protein=?, karbohidrat=?, lemak=?, serat=?, jumlah_porsi=?
         WHERE id=? AND tenant_id=?`,
        [f.nama, f.kategori_penerima || null, f.deskripsi || null,
         f.gramasi_total || 0, f.gramasi_besar || 0, f.gramasi_kecil || 0,
         f.kalori || 0, f.protein || 0, f.karbohidrat || 0, f.lemak || 0, f.serat || 0, f.jumlah_porsi || 0,
         req.params.id, req.user.tenant_id]
      );

      // 2. Delete & re-insert bahan
      let hasBahan = false;
      if (Array.isArray(f.bahan)) {
        await conn.query('DELETE FROM menu_bahan WHERE menu_id=?', [req.params.id]);

        for (const b of f.bahan) {
          const result = await processBahanItem(b, conn, req.user.tenant_id, spMap, jumlahPorsi, spRefMap, bbNamaMap);
          if (!result || result.jumlah <= 0) continue;
          await conn.query(
            'INSERT INTO menu_bahan (menu_id, bahan_baku_id, jumlah, keterangan) VALUES (?,?,?,?)',
            [req.params.id, result.idBahan, result.jumlah, b.keterangan || null]
          );
          hasBahan = true;
        }
      }

      // 3. Auto-calculate nutrition
      if (hasBahan) {
        await updateMenuNutrition(conn, req.params.id, req.user.tenant_id, spRefMap);
      }

      // 4. Sync siklus source
      await syncSiklusBahan(conn, f.siklus_source, f.bahan, req.user.tenant_id);

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      res.status(400).json({ error: 'Gagal menyimpan menu: ' + (e.message || 'Terjadi kesalahan') });
    } finally {
      conn.release();
    }
  });

  // DELETE /menu/:id
  router.delete('/menu/:id', async (req, res) => {
    await db.query('DELETE FROM menu WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
    res.json({ ok: true });
  });

  // POST /menu/bulk-delete
  router.post('/menu/bulk-delete', async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'IDs wajib diisi' });
    const placeholders = ids.map(() => '?').join(',');
    await db.query(`DELETE FROM menu WHERE id IN (${placeholders}) AND tenant_id=?`, [...ids, req.user.tenant_id]);
    res.json({ ok: true, deleted: ids.length });
  });

  // POST /menu/recalculate-nutrisi — hitung ulang nutrisi semua menu
  router.post('/menu/recalculate-nutrisi', async (req, res) => {
    try {
      const tenantId = req.user.tenant_id;
      const spRefMap = await loadSpRefMap(tenantId);

      const [menuBahanJoin] = await db.query(
        `SELECT DISTINCT mb.menu_id, mb.jumlah, bb.nama, bb.kalori, bb.protein, bb.karbohidrat, bb.lemak, bb.serat
         FROM menu_bahan mb
         JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
         WHERE mb.menu_id IN (SELECT id FROM menu WHERE tenant_id=?)`,
        [tenantId]
      );
      const bahanByMenu = {};
      for (const b of menuBahanJoin) {
        if (!bahanByMenu[b.menu_id]) bahanByMenu[b.menu_id] = [];
        bahanByMenu[b.menu_id].push(b);
      }

      const [menus] = await db.query('SELECT id FROM menu WHERE tenant_id=?', [tenantId]);
      let recalculated = 0;
      for (const menu of menus) {
        const bahan = bahanByMenu[menu.id] || [];
        const nut = calculateNutrition(bahan, spRefMap);
        await db.query(
          `UPDATE menu SET gramasi_total=?, kalori=?, protein=?, karbohidrat=?, lemak=?, serat=? WHERE id=? AND tenant_id=?`,
          [nut.gramasi, nut.kalori, nut.protein, nut.karbohidrat, nut.lemak, nut.serat, menu.id, tenantId]
        );
        recalculated++;
      }
      res.json({ ok: true, recalculated, total: menus.length });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Gagal recalculate' });
    }
  });
}

/**
 * Hitung dan update nutrisi menu dari bahan-bahannya
 */
async function updateMenuNutrition(conn, menuId, tenantId, spRefMap) {
  try {
    const [menuBahanRows] = await conn.query(
      `SELECT mb.jumlah, bb.nama, bb.kalori, bb.protein, bb.karbohidrat, bb.lemak, bb.serat
       FROM menu_bahan mb JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
       WHERE mb.menu_id=?`,
      [menuId]
    );
    if (!menuBahanRows.length) return;

    const nut = calculateNutrition(menuBahanRows, spRefMap);
    if (nut.kalori > 0 || nut.protein > 0 || nut.karbohidrat > 0 || nut.lemak > 0 || nut.serat > 0) {
      await conn.query(
        'UPDATE menu SET gramasi_total=?, kalori=?, protein=?, karbohidrat=?, lemak=?, serat=? WHERE id=? AND tenant_id=?',
        [nut.gramasi, nut.kalori, nut.protein, nut.karbohidrat, nut.lemak, nut.serat, menuId, tenantId]
      );
    }
  } catch (e) {
    console.error('Gagal hitung nutrisi menu:', e.message);
  }
}

module.exports = { registerCrudRoutes };
