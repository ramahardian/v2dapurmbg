/**
 * dbBackup.js — Generator backup database (.sql) murni Node.js.
 *
 * Tidak bergantung pada mysqldump binary; memakai koneksi mysql2 yang sudah ada:
 *   - enumerasi tabel via information_schema
 *   - SHOW CREATE TABLE → DROP TABLE IF EXISTS + CREATE TABLE
 *   - SELECT * → INSERT ber-batch dengan escaping via mysql2
 *
 * Hasilnya file SQL standar MySQL yang bisa di-restore di database lain
 * (termasuk CREATE DATABASE + USE supaya mudah diimpor).
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const mysqlPromise = require('mysql2/promise');

const escape = mysql.escape;

// Folder penyimpanan file backup (.sql) di root project
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// Hindari statement INSERT terlalu raksasa: 200 baris per statement
const INSERT_BATCH = 200;

// Escape nama identifier (tabel/kolom) — gandakan backtick di dalamnya
function escId(name) {
  return '`' + String(name).replace(/`/g, '``') + '`';
}

// Koneksi baca khusus backup:
//  - decimalNumbers:false  → DECIMAL diterima sebagai string (presisi uang terjaga)
//  - supportBigNumbers + bigNumberStrings → BIGINT > 2^53 tidak kehilangan digit
async function openDumpConnection() {
  return await mysqlPromise.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    decimalNumbers: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
}

async function generateSqlDump() {
  const dbName = process.env.DB_NAME || 'mbg_kitchen';
  const conn = await openDumpConnection();
  const out = [];

  try {
    // ── Header ──────────────────────────────────────────────
    out.push('-- ============================================================');
    out.push('-- MBG Kitchen Database Backup');
    out.push('-- Generated : ' + new Date().toISOString());
    out.push('-- Database  : ' + dbName);
    out.push('-- ============================================================');
    out.push('');
    out.push('SET NAMES utf8mb4;');
    out.push('SET FOREIGN_KEY_CHECKS = 0;');
    out.push('SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";');
    out.push('');

    // ── Buat & pilih database (mudah di-restore) ─────────────
    out.push('CREATE DATABASE IF NOT EXISTS ' + escId(dbName) + ' DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
    out.push('USE ' + escId(dbName) + ';');
    out.push('');

    // ── Enumerasi tabel ──────────────────────────────────────
    const [tables] = await conn.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name',
      [dbName]
    );

    for (const t of tables) {
      const tableName = t.TABLE_NAME || t.table_name;
      out.push('-- ------------------------------------------------------------');
      out.push('-- Table structure for ' + escId(tableName));
      out.push('-- ------------------------------------------------------------');

      const [createRows] = await conn.query('SHOW CREATE TABLE ' + escId(tableName));
      const createSql = createRows[0]['Create Table'];

      out.push('DROP TABLE IF EXISTS ' + escId(tableName) + ';');
      out.push(createSql + ';');
      out.push('');

      // ── Data ───────────────────────────────────────────────
      const [rows] = await conn.query('SELECT * FROM ' + escId(tableName));
      if (!rows.length) continue;

      out.push('-- ------------------------------------------------------------');
      out.push('-- Data for ' + escId(tableName) + ' (' + rows.length + ' baris)');
      out.push('-- ------------------------------------------------------------');

      const cols = Object.keys(rows[0]);
      const colList = cols.map(escId).join(', ');

      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        const slice = rows.slice(i, i + INSERT_BATCH);
        const values = slice.map(r => {
          return '(' + cols.map(c => {
            const v = r[c];
            if (v === undefined) return 'NULL';
            return escape(v);
          }).join(', ') + ')';
        }).join(',\n');

        out.push('INSERT INTO ' + escId(tableName) + ' (' + colList + ') VALUES');
        out.push(values + ';');
        out.push('');
      }
    }

    out.push('-- ============================================================');
    out.push('SET FOREIGN_KEY_CHECKS = 1;');
    out.push('-- End of backup');
    out.push('');
  } finally {
    await conn.end().catch(() => {});
  }

  return out.join('\n');
}

// ── Helper file backup ─────────────────────────────────────────────
function ensureBackupDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  return BACKUP_DIR;
}

// Validasi nama file: hanya nama file .sql sederhana (tolak traversal path).
function safeFileName(name) {
  const n = String(name || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.sql$/.test(n)) return null;
  if (n.includes('..')) return null;
  return n;
}

// Buat file backup baru dari dump DB saat ini → simpan ke backups/.
// prefix contoh: 'mbg-backup' atau 'pre-restore'.
async function createBackupFile(prefix) {
  const sql = await generateSqlDump();
  ensureBackupDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = (prefix || 'mbg-backup') + '-' + stamp + '.sql';
  const fp = path.join(BACKUP_DIR, name);
  await fs.promises.writeFile(fp, sql, 'utf8');
  const st = await fs.promises.stat(fp);
  return { name, size: st.size, created_at: st.mtime.toISOString() };
}

// Daftar file backup (terbaru di atas).
function listBackupFiles() {
  ensureBackupDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, size: st.size, created_at: st.mtime.toISOString() };
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

// Path absolut file backup — null bila nama tidak valid.
function getBackupPath(name) {
  const safe = safeFileName(name);
  if (!safe) return null;
  return path.join(BACKUP_DIR, safe);
}

async function deleteBackupFile(name) {
  const fp = getBackupPath(name);
  if (!fp) throw new Error('Nama file tidak valid');
  await fs.promises.unlink(fp);
}

// Validasi isi file .sql sebelum dijalankan (tolak statement destruktif
// di luar scope restore, mis. DROP DATABASE / GRANT).
function validateDumpSql(sql) {
  const s = String(sql || '');
  if (!s.trim()) return { ok: false, error: 'File kosong.' };
  if (!/CREATE\s+TABLE|INSERT\s+INTO|CREATE\s+DATABASE/i.test(s)) {
    return { ok: false, error: 'File bukan dump database MySQL (tidak ditemukan CREATE TABLE / INSERT INTO).' };
  }
  const blocked = [
    [/\bDROP\s+DATABASE\b/i, 'DROP DATABASE'],
    [/\bALTER\s+DATABASE\b/i, 'ALTER DATABASE'],
    [/\bCREATE\s+USER\b/i, 'CREATE USER'],
    [/\bDROP\s+USER\b/i, 'DROP USER'],
    [/\bGRANT\s+/i, 'GRANT'],
    [/\bSET\s+PASSWORD\b/i, 'SET PASSWORD'],
  ];
  for (const [re, label] of blocked) {
    if (re.test(s)) return { ok: false, error: 'File berisi statement terlarang: ' + label + '.' };
  }
  return { ok: true };
}

// ── Verifikasi isi dump SEBELUM restore ──────────────────────────
// Parse kasar file .sql: tabel apa saja yang disentuh + jenis statement-nya,
// lalu cocokkan dengan tabel yang ada di database saat ini.
function parseDumpTables(sql) {
  const s = String(sql || '');
  const map = new Map();
  const re = /\b(DROP\s+TABLE|CREATE\s+TABLE|INSERT\s+INTO)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([`"]?[\w$]+[`"]?)/gi;
  let m;
  while ((m = re.exec(s))) {
    const kind = m[1].toUpperCase().replace(/\s+/g, ' ');
    const name = m[2].replace(/[`"]/g, '');
    if (!name) continue;
    let e = map.get(name);
    if (!e) { e = { name, drop: false, create: false, insert: 0 }; map.set(name, e); }
    if (kind === 'DROP TABLE') e.drop = true;
    else if (kind === 'CREATE TABLE') e.create = true;
    else e.insert += 1;
  }
  return Array.from(map.values());
}

// Hitung kemunculan jenis statement (untuk ringkasan & peringatan).
// Statement non-dump (UPDATE/DELETE/ALTER/...) hanya dihitung bila benar-benar
// jadi AWAL statement (setelah ';') — supaya 'ON UPDATE current_timestamp'
// pada definisi kolom tidak dianggap UPDATE sungguhan.
function countStatementKinds(sql) {
  const s = String(sql || '');
  const count = (re) => (s.match(re) || []).length;
  const statements = s.split(';').map(x => x.trim().toUpperCase());
  const starts = (kw) => statements.filter(st => st.startsWith(kw)).length;
  return {
    'CREATE TABLE': count(/\bCREATE\s+TABLE\b/gi),
    'DROP TABLE': count(/\bDROP\s+TABLE\b/gi),
    'INSERT INTO': count(/\bINSERT\s+INTO\b/gi),
    'CREATE DATABASE': count(/\bCREATE\s+DATABASE\b/gi),
    'UPDATE': starts('UPDATE '),
    'DELETE FROM': starts('DELETE FROM'),
    'ALTER TABLE': starts('ALTER TABLE'),
    'TRUNCATE TABLE': starts('TRUNCATE '),
    'DROP DATABASE': starts('DROP DATABASE'),
    'GRANT': starts('GRANT '),
    'CREATE USER': starts('CREATE USER'),
    'SET PASSWORD': starts('SET PASSWORD'),
  };
}

// Cek keberadaan tabel di database (information_schema) + perkiraan jumlah baris.
async function lookupTablesInDb(names) {
  const found = new Map();
  if (!names.length) return found;
  const dbName = process.env.DB_NAME || 'mbg_kitchen';
  const conn = await openDumpConnection();
  try {
    const placeholders = names.map(() => '?').join(',');
    const [rows] = await conn.query(
      'SELECT table_name AS tbl, table_rows AS approx FROM information_schema.tables WHERE table_schema = ? AND table_name IN (' + placeholders + ')',
      [dbName, ...names]
    );
    for (const r of rows) {
      found.set(String(r.tbl).toLowerCase(), { exists: true, rows: r.approx == null ? null : Number(r.approx) });
    }
  } finally {
    await conn.end().catch(() => {});
  }
  return found;
}

// Verifikasi lengkap: validasi + daftar tabel + status di DB + ringkasan.
async function verifyDumpSql(sql) {
  const s = String(sql || '');
  const byteLen = Buffer.byteLength(s, 'utf8');
  const counts = countStatementKinds(s);
  const validation = validateDumpSql(s);
  const tables = parseDumpTables(s);
  const inDb = await lookupTablesInDb(tables.map(t => t.name));

  const list = tables.map(t => {
    const db = inDb.get(t.name.toLowerCase());
    const exists = !!(db && db.exists);
    let action = 'BARU';
    if (t.drop && t.create) action = exists ? 'GANTI (drop + create ulang)' : 'BARU (drop diabaikan)';
    else if (t.create) action = exists ? 'GANTI (create if not exists)' : 'BARU';
    else if (t.insert) action = exists ? 'TAMBAH DATA (insert)' : 'INSERT ke tabel yang belum ada';
    return {
      name: t.name,
      exists,
      current_rows: exists ? (db.rows == null ? null : db.rows) : null,
      has_drop: t.drop,
      has_create: t.create,
      insert_stmts: t.insert,
      action,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const warnings = [];
  if (counts['UPDATE'] || counts['DELETE FROM'] || counts['ALTER TABLE'] || counts['TRUNCATE TABLE']) {
    warnings.push('File berisi statement UPDATE/DELETE/ALTER/TRUNCATE di luar pola dump biasa — pastikan isinya memang diinginkan.');
  }
  if (!tables.length) {
    warnings.push('Tidak ditemukan statement CREATE TABLE / INSERT INTO — file mungkin bukan dump database.');
  }

  return {
    ok: validation.ok,
    error: validation.ok ? null : validation.error,
    size: byteLen,
    counts,
    tables: list,
    summary: {
      total_tables: list.length,
      existing: list.filter(t => t.exists).length,
      new_tables: list.filter(t => !t.exists).length,
      insert_stmts: counts['INSERT INTO'] || 0,
    },
    warnings,
  };
}

// Jalankan isi dump (.sql) ke database via satu koneksi dengan
// multipleStatements:true. Hanya dipanggil setelah validateDumpSql().
async function restoreSqlDump(sql) {
  const conn = await mysqlPromise.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    decimalNumbers: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: true,
  });
  try {
    const [result] = await conn.query(sql);
    return Array.isArray(result) ? result.length : 1;
  } finally {
    await conn.end().catch(() => {});
  }
}

module.exports = {
  generateSqlDump,
  BACKUP_DIR,
  safeFileName,
  createBackupFile,
  listBackupFiles,
  getBackupPath,
  deleteBackupFile,
  validateDumpSql,
  verifyDumpSql,
  restoreSqlDump,
};

