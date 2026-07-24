/**
 * Helper: Membangun query INSERT secara dinamis
 * Hanya memproses kolom yang ada di whitelist (TABLES) dan ada nilainya di req.body.
 */
function buildInsert(TABLES, table, body, tenant_id) {
  const allowed = TABLES[table];
  const cols = ['tenant_id']; // tenant_id disisipkan secara paksa demi keamanan (Multi-tenant)
  const vals = [tenant_id];
  const placeholders = ['?'];

  for (const k of allowed) {
    if (body[k] !== undefined && body[k] !== '') {
      cols.push(k);
      vals.push(body[k]);
      placeholders.push('?');
    }
  }
  return { sql: `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders.join(',')})`, vals };
}

/**
 * Helper: Membangun query UPDATE (SET) secara dinamis
 * Hanya memproses kolom yang ada di whitelist dan yang dikirim oleh client.
 */
function buildUpdate(TABLES, table, body) {
  const allowed = TABLES[table];
  const sets = [];
  const vals = [];

  for (const k of allowed) {
    if (body[k] !== undefined && body[k] !== '') {
      sets.push(`${k}=?`);
      vals.push(body[k]);
    }
  }
  return { sql: `SET ${sets.join(',')}`, vals };
}

module.exports = { buildInsert, buildUpdate };
