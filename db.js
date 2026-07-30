const mysql = require('mysql2/promise');
require('dotenv').config();

const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_MS) || 300;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Math.min(parseInt(process.env.DB_POOL_LIMIT) || 5, 50),
  queueLimit: 0,
  decimalNumbers: true,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

const origQuery = pool.query.bind(pool);
pool.query = async function(sql, params) {
  const start = Date.now();
  try {
    const result = await origQuery(sql, params);
    const elapsed = Date.now() - start;
    if (elapsed > SLOW_QUERY_MS) {
      const sqlStr = typeof sql === 'string' ? sql : (sql.sql || '');
      console.warn(`[SLOW ${elapsed}ms] ${sqlStr.substring(0, 200)}`);
    }
    return result;
  } catch (err) {
    const sqlStr = typeof sql === 'string' ? sql : (sql.sql || '');
    console.error(`[DB_ERROR] ${sqlStr.substring(0, 200)}`, err.message);
    throw err;
  }
};

const origGetConnection = pool.getConnection.bind(pool);
pool.getConnection = async function() {
  const conn = await origGetConnection();
  const origConnQuery = conn.query.bind(conn);
  conn.query = async function(sql, params) {
    const start = Date.now();
    try {
      const result = await origConnQuery(sql, params);
      const elapsed = Date.now() - start;
      if (elapsed > SLOW_QUERY_MS) {
        const sqlStr = typeof sql === 'string' ? sql : (sql.sql || '');
        console.warn(`[SLOW ${elapsed}ms] ${sqlStr.substring(0, 200)}`);
      }
      return result;
    } catch (err) {
      const sqlStr = typeof sql === 'string' ? sql : (sql.sql || '');
      console.error(`[DB_ERROR] ${sqlStr.substring(0, 200)}`, err.message);
      throw err;
    }
  };
  return conn;
};

module.exports = pool;
