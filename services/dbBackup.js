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
  restoreSqlDump,
};

