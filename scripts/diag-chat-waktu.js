// Simulasi rantai penuh: DB -> mysql2 -> wibFields (server) -> JSON -> client chat.js
process.env.TZ = 'Asia/Jakarta';
const db = require('../db');

// ── SALINAN LOGIKA routes/chat.js (wibFields) ──
const WIB_OFFSET_MS = 7 * 3600 * 1000;
const WIB_HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const WIB_BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const p = n => String(n).padStart(2, '0');
function wibFields(d) {
  if (d == null) return {};
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return {};
  const w = new Date(x.getTime() + WIB_OFFSET_MS);
  return {
    created_at_wib_time: p(w.getUTCHours()) + '.' + p(w.getUTCMinutes()),
    created_at_wib_stamp: WIB_HARI[w.getUTCDay()] + ', ' + w.getUTCDate() + ' ' + WIB_BULAN[w.getUTCMonth()] + ' ' + w.getUTCFullYear() + ' ' + p(w.getUTCHours()) + '.' + p(w.getUTCMinutes()),
    created_at_wib_date: w.getUTCFullYear() + '-' + p(w.getUTCMonth() + 1) + '-' + p(w.getUTCDate()),
  };
}

// ── SALINAN LOGIKA public/modul/chat.js ──
const CHAT_WIB_OFFSET_MS = 7 * 3600 * 1000;
const CHAT_HARI_ID = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const CHAT_BULAN_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
function chatParseDate(d) {
  if (d == null) return null;
  let x;
  if (d instanceof Date) x = d;
  else {
    const s = String(d).trim();
    if (s.includes('T') || s.includes('Z') || s.includes('+') || s.endsWith(')')) x = new Date(s);
    else x = new Date(s + 'Z');
  }
  return isNaN(x.getTime()) ? null : x;
}
function chatToWib(x) { return new Date(x.getTime() + CHAT_WIB_OFFSET_MS); }
function chatWibDate(x) {
  const wib = chatToWib(x);
  return wib.getUTCFullYear() + '-' + String(wib.getUTCMonth()+1).padStart(2,'0') + '-' + String(wib.getUTCDate()).padStart(2,'0');
}
function chatTime(d) {
  const x = chatParseDate(d); if (!x) return '';
  const wib = chatToWib(x);
  return String(wib.getUTCHours()).padStart(2,'0') + '.' + String(wib.getUTCMinutes()).padStart(2,'0');
}
function chatFullStamp(d) {
  const x = chatParseDate(d); if (!x) return '';
  const wib = chatToWib(x);
  return CHAT_HARI_ID[wib.getUTCDay()] + ', ' + wib.getUTCDate() + ' ' + CHAT_BULAN_ID[wib.getUTCMonth()] + ' ' + wib.getUTCFullYear() + ' ' + chatTime(d);
}
let chatClockOffsetMs = 0;
function chatApplyServerNow(serverNow) {
  const ms = serverNow ? Date.parse(serverNow) : NaN;
  if (!isNaN(ms)) chatClockOffsetMs = ms - Date.now();
}
function chatNowMs() { return Date.now() + chatClockOffsetMs; }
function chatSmartTime(d) {
  const x = chatParseDate(d); if (!x) return '';
  const MIN = 60*1000, HOUR = 60*MIN, DAY = 24*HOUR;
  const diff = chatNowMs() - x.getTime();
  if (diff < MIN) return 'Baru saja';
  if (diff < HOUR) return Math.floor(diff/MIN) + ' menit lalu';
  if (diff < DAY) return Math.floor(diff/HOUR) + ' jam lalu';
  const now = new Date(chatNowMs());
  if (chatWibDate(x) === chatWibDate(new Date(now.getTime() - DAY))) return 'Kemarin';
  const wib = chatToWib(x);
  return CHAT_HARI_ID[wib.getUTCDay()] + ', ' + wib.getUTCDate() + ' ' + CHAT_BULAN_ID[wib.getUTCMonth()] + ' ' + wib.getUTCFullYear();
}

(async () => {
  try {
    const [rows] = await db.query(
      'SELECT id, CAST(created_at AS CHAR) raw, created_at FROM chat_messages ORDER BY id DESC LIMIT 8'
    );
    const serverNow = new Date().toISOString();
    chatApplyServerNow(serverNow);
    console.log('server_now (UTC ISO) :', serverNow);
    console.log('sekarang WIB          :', new Date(Date.parse(serverNow) + 7*3600*1000).toISOString());
    console.log('');
    console.log('┌─────┬──────────────────────┬────────────────┬──────────────────────────────┬──────────────────────────┐');
    console.log('│ id  │ tersimpan di DB      │ server wibFields │ TAMPIL DI CHAT (client)     │ tooltip (stempel penuh)  │');
    console.log('├─────┼──────────────────────┼────────────────┼──────────────────────────────┼──────────────────────────┤');
    for (const r of rows) {
      const msg = { id: r.id, created_at: r.created_at };        // seperti dari mysql2
      const withWib = { ...msg, ...wibFields(msg.created_at) };  // seperti routes/chat.js
      const json = JSON.parse(JSON.stringify({ messages: [withWib] })); // seperti res.json
      const m = json.messages[0];
      const time = chatSmartTime(m.created_at) || m.created_at_wib_time || '';
      const stamp = m.created_at_wib_stamp || chatFullStamp(m.created_at);
      const day = m.created_at_wib_date || chatWibDate(chatParseDate(m.created_at));
      console.log(
        `│ ${String(r.id).padEnd(3)} │ ${String(r.raw).padEnd(20)} │ ${String(m.created_at_wib_time).padEnd(14)} │ ${time.padEnd(28)} │ ${String(stamp).padEnd(24)} │`
      );
    }
    console.log('└─────┴──────────────────────┴────────────────┴──────────────────────────────┴──────────────────────────┘');
    console.log('');
    console.log('CATATAN: `tersimpan di DB` = wall-clock WIB (server MySQL TZ = Asia/Jakarta).');

    // Simulasi KONDISI LAMA (tanpa db.js timezone '+07:00' & TZ=UTC): mysql2 menginterpretasi
    // string DATETIME sebagai UTC → instan bergeser -7 jam → wibFields menampilkan +7 jam lagi.
    console.log('');
    console.log('─ Simulasi SEBELUM perbaikan (mysql2 default local + OS/container TZ=UTC) ─');
    console.log('  KONDISI LAMA: proses TZ=UTC & tanpa timezone:db, mysql2 membaca string DATETIME');
    console.log('  sebagai jam UTC padahal isinya wall-clock WIB → tampilan meleset 7 jam.');
    for (const r of rows) {
      const raw = r.raw; // "2026-08-06 15:28:22" (wall-clock WIB)
      // mysql2 lama: new Date('2026-08-06T15:28:22') dengan proses TZ=UTC → 15:28 dianggap UTC
      const misparsed = new Date(raw.replace(' ', 'T') + 'Z');
      const w = new Date(misparsed.getTime() + WIB_OFFSET_MS);
      const benar = new Date(Date.parse(raw.replace(' ', 'T') + '+07:00') + WIB_OFFSET_MS);
      console.log(
        `  msg#${String(r.id).padEnd(3)} | seharusnya tampil ${p(benar.getUTCHours())}.${p(benar.getUTCMinutes())}` +
        ` | TANPA fix tampil ${p(w.getUTCHours())}.${p(w.getUTCMinutes())} (meleset!)`
      );
    }
  } catch (e) { console.error('ERROR:', e.message); process.exit(1); }
  finally { await db.end(); process.exit(0); }
})();
