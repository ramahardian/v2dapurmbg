/**
 * Daftar role yang berhak tampil di kontak chat & riwayat online.
 * Dipakai konsisten oleh routes/chat.js dan routes/dashboard.js agar tidak terjadi
 * ketidak-konsistenan (mis. user tampil di widget online tapi tidak di kontak chat).
 * User di luar daftar ini — termasuk yang role-nya kosong ('') — tidak ditampilkan.
 */
const CHAT_ROLES = ['admin', 'ahli_gizi', 'keuangan', 'gudang'];

// Bentuk siap-sisip untuk klausa SQL: role IN ('admin','ahli_gizi',...)
const CHAT_ROLES_SQL = "(" + CHAT_ROLES.map(r => "'" + r + "'").join(',') + ")";

module.exports = { CHAT_ROLES, CHAT_ROLES_SQL };
