/**
 * QUERIES — Menu
 * GET endpoints untuk mengambil data menu.
 */
const db = require('../../db');

function registerQueryRoutes(router) {
  // GET /menu — daftar menu dengan pagination & search
  router.get('/menu', async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      let whereClause = 'WHERE m.tenant_id=?';
      const queryParams = [req.user.tenant_id];

      if (req.query.search) {
        whereClause += ' AND (m.nama LIKE ? OR m.kategori_penerima LIKE ? OR m.deskripsi LIKE ?)';
        const searchTerm = `%${req.query.search}%`;
        queryParams.push(searchTerm, searchTerm, searchTerm);
      }

      const [totalCountResult] = await db.query(
        `SELECT COUNT(*) as count FROM menu m ${whereClause}`,
        queryParams
      );
      const totalCount = totalCountResult[0].count;

      const [menus] = await db.query(
        `SELECT m.id, m.nama, m.kategori_penerima, m.deskripsi, m.gramasi_total, m.gramasi_besar, m.gramasi_kecil, m.kalori, m.protein, m.karbohidrat, m.lemak, m.serat, m.jumlah_porsi
         FROM menu m ${whereClause}
         ORDER BY m.id DESC LIMIT ? OFFSET ?`,
        [...queryParams, Number(limit), Number(offset)]
      );

      // Batch-fetch bahan
      const menuIds = menus.map(m => m.id);
      const bahanMap = {};
      if (menuIds.length > 0) {
        const [bahanRows] = await db.query(
          `SELECT mb.menu_id, mb.bahan_baku_id, bb.nama as bahan_nama, bb.satuan, bb.kategori_sp, bb.berat_1_sp, bb.persen_bdd, bb.berat_per_satuan, mb.jumlah, mb.keterangan
           FROM menu_bahan mb
           LEFT JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
           WHERE mb.menu_id IN (${menuIds.map(() => '?').join(',')})`,
          menuIds
        );
        bahanRows.forEach(row => {
          if (!bahanMap[row.menu_id]) bahanMap[row.menu_id] = [];
          bahanMap[row.menu_id].push({
            bahan_baku_id: row.bahan_baku_id,
            nama: row.bahan_nama, satuan: row.satuan, kategori_sp: row.kategori_sp,
            berat_1_sp: row.berat_1_sp, persen_bdd: row.persen_bdd,
            berat_per_satuan: row.berat_per_satuan, jumlah: row.jumlah,
            keterangan: row.keterangan || '',
          });
        });
      }

      const menuList = menus.map(m => ({ ...m, bahan: bahanMap[m.id] || [] }));

      res.json({
        data: menuList,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      });
    } catch (e) {
      console.error('GET /menu error:', e);
      res.status(500).json({ error: 'Gagal memuat menu: ' + e.message });
    }
  });

  // GET /menu/:id — detail menu + bahan
  router.get('/menu/:id', async (req, res) => {
    const [menus] = await db.query(
      `SELECT m.id, m.nama, m.kategori_penerima, m.deskripsi, m.gramasi_total, m.gramasi_besar, m.gramasi_kecil, m.kalori, m.protein, m.karbohidrat, m.lemak, m.serat, m.jumlah_porsi,
              mb.bahan_baku_id, bb.nama as bahan_nama, bb.satuan, bb.kategori_sp, bb.berat_1_sp, bb.persen_bdd, bb.berat_per_satuan, mb.jumlah, mb.keterangan
       FROM menu m
       LEFT JOIN menu_bahan mb ON mb.menu_id = m.id
       LEFT JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
       WHERE m.id=? AND m.tenant_id=?`,
      [req.params.id, req.user.tenant_id]
    );
    if (!menus.length) return res.status(404).json({ error: 'Menu tidak ditemukan' });

    const m = {
      id: menus[0].id, nama: menus[0].nama, kategori_penerima: menus[0].kategori_penerima,
      deskripsi: menus[0].deskripsi, gramasi_total: menus[0].gramasi_total,
      gramasi_besar: menus[0].gramasi_besar, gramasi_kecil: menus[0].gramasi_kecil,
      kalori: menus[0].kalori, protein: menus[0].protein, karbohidrat: menus[0].karbohidrat,
      lemak: menus[0].lemak, serat: menus[0].serat, jumlah_porsi: menus[0].jumlah_porsi, bahan: [],
    };
    menus.forEach(row => {
      if (row.bahan_baku_id) {
        m.bahan.push({
          bahan_baku_id: row.bahan_baku_id, nama: row.bahan_nama, satuan: row.satuan,
          kategori_sp: row.kategori_sp, berat_1_sp: row.berat_1_sp,
          persen_bdd: row.persen_bdd, berat_per_satuan: row.berat_per_satuan,
          jumlah: row.jumlah, keterangan: row.keterangan || '',
        });
      }
    });
    res.json(m);
  });

  // GET /menu/batch?ids=1,2,3 — batch load menu + bahan
  router.get('/menu/batch', async (req, res) => {
    const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean);
    if (!ids.length) return res.json({});
    const ph = ids.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT m.id, m.nama, m.kategori_penerima, m.deskripsi, m.gramasi_total, m.gramasi_besar, m.gramasi_kecil, m.kalori, m.protein, m.karbohidrat, m.lemak, m.serat,
              mb.bahan_baku_id, bb.nama as bahan_nama, bb.satuan, bb.kategori_sp, bb.berat_1_sp, bb.persen_bdd, bb.berat_per_satuan, mb.jumlah, mb.keterangan
       FROM menu m
       LEFT JOIN menu_bahan mb ON mb.menu_id = m.id
       LEFT JOIN bahan_baku bb ON bb.id = mb.bahan_baku_id
       WHERE m.id IN (${ph}) AND m.tenant_id=?`,
      [...ids, req.user.tenant_id]
    );
    const map = {};
    for (const row of rows) {
      if (!map[row.id]) {
        map[row.id] = {
          id: row.id, nama: row.nama, kategori_penerima: row.kategori_penerima,
          deskripsi: row.deskripsi, gramasi_total: row.gramasi_total,
          gramasi_besar: row.gramasi_besar, gramasi_kecil: row.gramasi_kecil,
          kalori: row.kalori, protein: row.protein, karbohidrat: row.karbohidrat,
          lemak: row.lemak, serat: row.serat, jumlah_porsi: row.jumlah_porsi, bahan: [],
        };
      }
      if (row.bahan_baku_id) {
        map[row.id].bahan.push({
          bahan_baku_id: row.bahan_baku_id, nama: row.bahan_nama, satuan: row.satuan,
          kategori_sp: row.kategori_sp, berat_1_sp: row.berat_1_sp,
          persen_bdd: row.persen_bdd, berat_per_satuan: row.berat_per_satuan,
          jumlah: row.jumlah, keterangan: row.keterangan || '',
        });
      }
    }
    res.json(map);
  });

  // GET /menu/by-siklus — menu dikelompokkan per siklus + standalone
  router.get('/menu/by-siklus', async (req, res) => {
    const [siklusList] = await db.query(
      'SELECT id, nama, kategori_penerima, jumlah_porsi, total_hari, status FROM siklus_menu WHERE tenant_id=? ORDER BY id DESC',
      [req.user.tenant_id]
    );

    const [allMenus] = await db.query(
      'SELECT id, nama, kategori_penerima, deskripsi, gramasi_total, kalori, protein, karbohidrat, lemak, serat FROM menu WHERE tenant_id=? ORDER BY nama ASC',
      [req.user.tenant_id]
    );

    const siklusIds = siklusList.map(s => s.id);
    const allItems = {};
    const usedMenuIds = new Set();
    if (siklusIds.length) {
      const ph = siklusIds.map(() => '?').join(',');
      const [rows] = await db.query(
        `SELECT si.siklus_id, si.hari_ke, si.hari_nama, si.menu_id, si.menu_nama, si.jumlah_porsi, si.kalori, si.protein, si.karbohidrat, si.lemak, si.serat,
                si.resep_map, m.nama AS menu_nama_lengkap, m.gramasi_total, m.kategori_penerima AS menu_kategori
         FROM siklus_menu_item si
         LEFT JOIN menu m ON m.id = si.menu_id
         WHERE si.siklus_id IN (${ph})
         ORDER BY si.siklus_id, si.hari_ke ASC`,
        siklusIds
      );
      for (const r of rows) {
        if (!allItems[r.siklus_id]) allItems[r.siklus_id] = [];
        allItems[r.siklus_id].push(r);
        if (r.menu_id) usedMenuIds.add(r.menu_id);
      }
    }

    // Grid bahan data
    let gridBahanBySiklus = {};
    if (siklusIds.length) {
      const ph = siklusIds.map(() => '?').join(',');
      const [gridRows] = await db.query(
        `SELECT sb.siklus_id, sb.hari_ke, sb.kategori_sp, COALESCE(b.nama, '(bahan dihapus)') AS bahan_nama
         FROM siklus_menu_item_bahan sb
         LEFT JOIN bahan_baku b ON b.id = sb.bahan_baku_id
         WHERE sb.siklus_id IN (${ph})`,
        siklusIds
      );
      for (const g of gridRows) {
        if (!gridBahanBySiklus[g.siklus_id]) gridBahanBySiklus[g.siklus_id] = {};
        if (!gridBahanBySiklus[g.siklus_id][g.hari_ke]) gridBahanBySiklus[g.siklus_id][g.hari_ke] = [];
        gridBahanBySiklus[g.siklus_id][g.hari_ke].push({ kategori_sp: g.kategori_sp, nama: g.bahan_nama });
      }
    }

    const KAT_ORDER = ['Karbohidrat', 'Protein Hewani', 'Protein Nabati', 'Sayur', 'Buah', 'Susu', 'Minyak'];
    const siklusGroups = [];
    for (const s of siklusList) {
      const items = allItems[s.id] || [];
      const days = items.map(it => {
        let menuNama = it.menu_id ? (it.menu_nama || it.menu_nama_lengkap || null) : null;
        let hasContent = !!it.menu_id;

        if (!it.menu_id) {
          if (it.resep_map) {
            try {
              const map = typeof it.resep_map === 'string' ? JSON.parse(it.resep_map) : it.resep_map;
              const names = Object.values(map).filter(v => v && v.trim());
              if (names.length) menuNama = names.join(' + ');
            } catch (e) { /* ignore */ }
          }
          if (!menuNama) {
            const dayBahan = (gridBahanBySiklus[s.id] || {})[it.hari_ke] || [];
            if (dayBahan.length) {
              const grouped = {};
              for (const b of dayBahan) {
                const kat = b.kategori_sp || 'Lainnya';
                if (!grouped[kat]) grouped[kat] = [];
                grouped[kat].push(b.nama);
              }
              const parts = [];
              for (const kat of KAT_ORDER) {
                if (grouped[kat] && grouped[kat].length) parts.push(grouped[kat].join(', '));
              }
              for (const [kat, names] of Object.entries(grouped)) {
                if (!KAT_ORDER.includes(kat)) parts.push(names.join(', ') + ' (' + kat + ')');
              }
              if (parts.length) menuNama = parts.join(' + ');
            }
          }
          if (menuNama) hasContent = true;
        }

        return {
          hari_ke: it.hari_ke, hari_nama: it.hari_nama, menu_id: it.menu_id,
          menu_nama: menuNama || '-', jumlah_porsi: Number(it.jumlah_porsi) || 0,
          kalori: Number(it.kalori || it.kalori) || 0,
          gramasi_total: Number(it.gramasi_total) || 0,
          _has_content: hasContent,
        };
      });

      siklusGroups.push({
        id: s.id, nama: s.nama, kategori_penerima: s.kategori_penerima,
        jumlah_porsi: Number(s.jumlah_porsi) || 0, total_hari: Number(s.total_hari) || 7,
        status: s.status, days,
        menu_count: new Set(items.filter(it => it.menu_id).map(it => it.menu_id)).size,
      });
    }

    const standaloneMenus = allMenus.filter(m => !usedMenuIds.has(m.id));

    res.json({
      siklus_groups: siklusGroups,
      standalone: standaloneMenus,
      total_menu: allMenus.length,
      used_in_siklus: usedMenuIds.size,
    });
  });
}

module.exports = { registerQueryRoutes };
