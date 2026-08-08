/**
 * NAMA KODE / FILE: chat.js
 * DESKRIPSI: Endpoint API chat antar user online.
 *            - Room 'umum' : obrolan bersama satu tenant.
 *            - Room 'uA:uB' : chat privat 1-on-1 antara dua user (urutan id naik).
 *            Tidak ada infrastruktur real-time; frontend melakukan polling berkala.
 */

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const ROOM_UMUM = 'umum';
// Jendela "online": user dianggap online jika last_activity ≤ 10 menit lalu.
// (Sebelumnya 5 menit — terlalu ketat sehingga user layak sering "hilang"
//  dari list chat walau sesinya masih aktif.)
const ONLINE_WINDOW_SEC = 600;

// ── Waktu WIB (UTC+7) — dihitung MANUAL di server agar konsisten,
//    tidak bergantung zona engine/browser. ──
const WIB_OFFSET_MS = 7 * 3600 * 1000;
const WIB_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const WIB_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Ubah nilai created_at (Date/string/ISO) menjadi objek WIB siap kirim.
function wibFields(d) {
  if (d == null) return {};
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return {};
  const w = new Date(x.getTime() + WIB_OFFSET_MS);
  const p = n => String(n).padStart(2, '0');
  return {
    created_at_wib_time: p(w.getUTCHours()) + '.' + p(w.getUTCMinutes()),
    created_at_wib_stamp: WIB_HARI[w.getUTCDay()] + ', ' + w.getUTCDate() + ' ' + WIB_BULAN[w.getUTCMonth()] + ' ' + w.getUTCFullYear() + ' ' + p(w.getUTCHours()) + '.' + p(w.getUTCMinutes()),
    created_at_wib_date: w.getUTCFullYear() + '-' + p(w.getUTCMonth() + 1) + '-' + p(w.getUTCDate()),
  };
}

function pairRoom(a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return 'u' + lo + ':u' + hi;
}

function isValidRoom(room) {
  return room === ROOM_UMUM || /^u\d+:u\d+$/.test(room);
}

/**
 * GET /chat/contacts
 * Daftar kontak: room 'umum' + seluruh user tenant (tandai online), beserta unread per room.
 */
router.get('/chat/contacts', async (req, res) => {
  const t = req.user.tenant_id;
  const me = req.user.id;
  try {
    const [users] = await db.query(
      `SELECT id, nama, role, foto, last_activity,
              TIMESTAMPDIFF(SECOND, last_activity, NOW()) AS seconds_ago
       FROM users
       WHERE tenant_id = ?
         AND id <> ?
         AND role IN ('admin','ahli_gizi','keuangan','gudang')
         AND last_activity IS NOT NULL
         AND TIMESTAMPDIFF(SECOND, last_activity, NOW()) <= ${ONLINE_WINDOW_SEC}
       ORDER BY nama ASC`,
      [t, me]
    );

    const rooms = [ROOM_UMUM, ...users.map(u => pairRoom(me, u.id))];

    const unread = {};
    for (const room of rooms) {
      const [[row]] = await db.query(
        `SELECT m.id
         FROM chat_messages m
         WHERE m.tenant_id = ? AND m.room = ?
           AND m.id > COALESCE((SELECT cr.last_read_id FROM chat_reads cr
                                WHERE cr.tenant_id = ? AND cr.user_id = ? AND cr.room = ?), 0)
         ORDER BY m.id ASC LIMIT 1`,
        [t, room, t, me, room]
      );
      if (row) {
        const [[{ cnt }]] = await db.query(
          `SELECT COUNT(*) AS cnt FROM chat_messages WHERE tenant_id = ? AND room = ? AND id >= ?`,
          [t, room, row.id]
        );
        unread[room] = cnt;
      }
    }

    const contacts = users.map(u => ({
      user_id: u.id,
      nama: u.nama,
      role: u.role || '',
      foto: u.foto || null,
      is_online: u.seconds_ago !== null && u.seconds_ago <= ONLINE_WINDOW_SEC,
      room: pairRoom(me, u.id),
      unread: unread[pairRoom(me, u.id)] || 0
    }));

    const onlineCount = contacts.filter(c => c.is_online).length;
    res.json({
      umum: {
        room: ROOM_UMUM,
        nama: 'Ngobrol Semua',
        is_online: true,
        unread: unread[ROOM_UMUM] || 0,
        online_count: onlineCount
      },
      contacts,
      online_count: onlineCount
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /chat/messages?room=...&after=...&limit=...
 * Ambil pesan room. Tanpa `after` -> 50 pesan terakhir; dengan `after` -> pesan id > after.
 */
router.get('/chat/messages', async (req, res) => {
  const t = req.user.tenant_id;
  const me = req.user.id;
  const room = String(req.query.room || ROOM_UMUM);
  if (!isValidRoom(room)) return res.status(400).json({ error: 'Room tidak valid' });
  const after = parseInt(req.query.after, 10) || 0;
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);

  // Validasi akses: room privat harus melibatkan user ini.
  if (room !== ROOM_UMUM) {
    const m = room.match(/^u(\d+):u(\d+)$/);
    const other = parseInt(m[1]) === me.id ? parseInt(m[2]) : parseInt(m[1]);
    const [[peer]] = await db.query('SELECT id FROM users WHERE id = ? AND tenant_id = ?', [other, t]);
    if (!peer) return res.status(403).json({ error: 'Tidak punya akses ke room ini' });
  }

  try {
    let rows;
    if (after > 0) {
      [rows] = await db.query(
        `SELECT id, room, sender_id, sender_nama, sender_role, body, created_at
         FROM chat_messages
         WHERE tenant_id = ? AND room = ? AND id > ?
         ORDER BY id ASC LIMIT ?`,
        [t, room, after, limit]
      );
    } else {
      [rows] = await db.query(
        `SELECT id, room, sender_id, sender_nama, sender_role, body, created_at
         FROM chat_messages
         WHERE tenant_id = ? AND room = ?
         ORDER BY id DESC LIMIT ?`,
        [t, room, limit]
      );
      rows.reverse();
    }
    rows = rows.map(r => ({ ...r, ...wibFields(r.created_at) }));
    // `server_now` = jam server (instan) — dipakai client sebagai acuan label
    // relatif ("x menit lalu") agar tidak bergantung jam perangkat yang bisa meleset.
    res.json({ room, server_now: new Date().toISOString(), messages: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /chat/messages
 * Body: { room, body }
 */
router.post('/chat/messages', async (req, res) => {
  const t = req.user.tenant_id;
  const me = req.user;
  const room = String((req.body && req.body.room) || ROOM_UMUM);
  const body = String((req.body && req.body.body) || '').trim();

  if (!isValidRoom(room)) return res.status(400).json({ error: 'Room tidak valid' });
  if (!body) return res.status(400).json({ error: 'Pesan kosong' });
  if (body.length > 2000) return res.status(400).json({ error: 'Pesan maksimal 2000 karakter' });

  // Validasi akses room privat.
  if (room !== ROOM_UMUM) {
    const m = room.match(/^u(\d+):u(\d+)$/);
    const a = parseInt(m[1]), b = parseInt(m[2]);
    if (a !== me.id && b !== me.id) return res.status(403).json({ error: 'Tidak punya akses ke room ini' });
    const other = a === me.id ? b : a;
    const [[peer]] = await db.query('SELECT id FROM users WHERE id = ? AND tenant_id = ?', [other, t]);
    if (!peer) return res.status(403).json({ error: 'User tidak ditemukan di tenant ini' });
  }

  try {
    const [r] = await db.query(
      `INSERT INTO chat_messages (tenant_id, room, sender_id, sender_nama, sender_role, body)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [t, room, me.id, me.nama, me.role || '', body]
    );
    const [[msg]] = await db.query(
      `SELECT id, room, sender_id, sender_nama, sender_role, body, created_at
       FROM chat_messages WHERE id = ?`,
      [r.insertId]
    );
    Object.assign(msg, wibFields(msg.created_at));
    // Tandai pesan sendiri sebagai sudah dibaca.
    await db.query(
      `INSERT INTO chat_reads (tenant_id, user_id, room, last_read_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE last_read_id = GREATEST(last_read_id, VALUES(last_read_id))`,
      [t, me.id, room, r.insertId]
    ).catch(() => {});
    // `server_now` dikirim agar pesan yang baru dikirim langsung tampil "Baru saja"
    // walau jam perangkat meleset.
    res.json({ server_now: new Date().toISOString(), message: msg });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /chat/read
 * Body: { room } — tandai semua pesan room sebagai sudah dibaca (sampai id terbaru).
 */
router.post('/chat/read', async (req, res) => {
  const t = req.user.tenant_id;
  const me = req.user.id;
  const room = String((req.body && req.body.room) || '');
  if (!isValidRoom(room)) return res.status(400).json({ error: 'Room tidak valid' });
  try {
    const [[{ latest }]] = await db.query(
      'SELECT COALESCE(MAX(id), 0) AS latest FROM chat_messages WHERE tenant_id = ? AND room = ?',
      [t, room]
    );
    await db.query(
      `INSERT INTO chat_reads (tenant_id, user_id, room, last_read_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE last_read_id = GREATEST(last_read_id, VALUES(last_read_id))`,
      [t, me, room, latest]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /chat/delete
 * Body: { room, msg_id } — hapus pesan sendiri (sender_id = user login).
 */
router.post('/chat/delete', async (req, res) => {
  const t = req.user.tenant_id;
  const me = req.user.id;
  const room = String((req.body && req.body.room) || '');
  const msgId = parseInt((req.body && req.body.msg_id), 10);
  if (!isValidRoom(room)) return res.status(400).json({ error: 'Room tidak valid' });
  if (!msgId) return res.status(400).json({ error: 'msg_id wajib' });
  try {
    const [r] = await db.query(
      'DELETE FROM chat_messages WHERE tenant_id = ? AND room = ? AND id = ? AND sender_id = ?',
      [t, room, msgId, me]
    );
    if (r.affectedRows === 0) return res.status(403).json({ error: 'Tidak bisa hapus pesan orang lain' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
