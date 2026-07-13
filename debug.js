require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  try {
    // First check database structure
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'mbg_kitchen',
      connectTimeout: 5000
    });
    
    // Check karyawan table
    const [karyawan] = await conn.query('SHOW COLUMNS FROM karyawan');
    console.log('Karyawan columns:');
    karyawan.forEach(col => {
      console.log(`  ${col.Field}: ${col.Type}`);
    });
    
    // Add tenant_id if missing
    const hasTenantId = karyawan.some(col => col.Field === 'tenant_id');
    if (!hasTenantId) {
      console.log('\nAdding tenant_id column to karyawan...');
      await conn.query('ALTER TABLE karyawan ADD COLUMN tenant_id INT NULL AFTER departemen, ADD INDEX idx_karyawan_tenant (tenant_id)');
      console.log('Column added successfully');
    } else {
      console.log('\ntenant_id column already exists');
    }
    
    await conn.end();
    
    // Now check users table
    const conn2 = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'mbg_kitchen',
      connectTimeout: 5000
    });
    
    const [users] = await conn2.query('SELECT * FROM users LIMIT 5');
    console.log('\nUsers:', users.length, 'records found');
    
    await conn2.end();
    
    console.log('\nDatabase setup complete');
  } catch (e) {
    console.error('Error:', e.message);
  }
})();
