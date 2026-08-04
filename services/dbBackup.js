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

const mysql = require('mysql2');
const mysqlPromise = require('mysql2/promise');

const escape = mysql.escape;

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

module.exports = { generateSqlDump };

