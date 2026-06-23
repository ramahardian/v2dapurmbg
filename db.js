const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST ||  'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'u778324865_dapur',
  password: process.env.DB_PASSWORD || '#dH9lSk6S:Fx',
  database: process.env.DB_NAME || 'u778324865_dapur' ,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
});

module.exports = pool;
