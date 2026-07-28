/**
 * Konfigurasi Tabel (Whitelist)
 * Objek ini mendefinisikan tabel apa saja yang diizinkan untuk diakses secara dinamis,
 * sekaligus mendaftarkan kolom-kolom apa saja yang boleh diisi/diubah (Mass Assignment Protection).
 * Ini sangat penting untuk mencegah SQL Injection atau manipulasi data yang tidak diinginkan.
 */
const TABLES = {
  penerima_manfaat: ['nama_kelompok', 'paket_besar', 'paket_kecil', 'lokasi', 'keterangan', 'kategori_penerima', 'provinsi', 'kota', 'kecamatan', 'nomor_telepon', 'nama_kontak', 'email', 'status_kepemilikan'],
  bahan_baku: ['kode', 'nama', 'kategori', 'kategori_sp', 'berat_1_sp', 'persen_bdd', 'berat_per_satuan', 'satuan', 'harga_satuan', 'harga_sebelumnya', 'stok_saat_ini', 'stok_minimum', 'sumber', 'kalori', 'protein', 'karbohidrat', 'lemak', 'serat'],
  supplier: ['nama', 'kategori_supply', 'kontak_person', 'telepon', 'email', 'alamat', 'npwp'],
  purchase_order: ['no_po', 'tanggal', 'supplier_id', 'supplier_nama', 'item', 'total_nilai', 'status', 'unit_dapur', 'catatan'],
  penerimaan_barang: ['no_dokumen', 'tanggal_terima', 'supplier_id', 'ref_po', 'item', 'total_nilai', 'status_qc', 'catatan'],
  produksi: ['tanggal_produksi', 'menu_id', 'menu_nama', 'kategori_penerima', 'jumlah_porsi', 'status', 'catatan'],
  distribusi: ['tanggal_distribusi', 'titik_distribusi', 'penerima_manfaat_id', 'kategori_penerima', 'jumlah_porsi', 'kurir', 'status', 'catatan'],
  budget: ['periode', 'kategori_penerima', 'porsi_besar', 'porsi_kecil', 'jumlah_penerima', 'harga_per_porsi', 'harga_besar', 'harga_kecil', 'biaya_operasional', 'total_budget', 'realisasi', 'catatan'],
  kas_bank: ['tanggal', 'no_transaksi', 'tipe', 'kategori', 'akun', 'akun_id', 'deskripsi', 'jumlah'],
  divisi: ['nama'],
  sp_referensi_bahan: ['nama', 'kategori', 'berat_bersih', 'bdd_persen', 'berat_kotor', 'energi', 'protein', 'lemak', 'karbohidrat', 'serat'],
  akun: ['kode', 'nama', 'bp', 'tipe', 'is_active'],
  hari_libur: ['tanggal', 'nama', 'kategori'],
};

/**
 * Field yang wajib diisi (NOT NULL di database).
 * Digunakan agar input kosong tidak lolos ke query INSERT.
 */
const REQUIRED_FIELDS = {
  penerima_manfaat: ['nama_kelompok'],
  bahan_baku: ['nama', 'satuan'],
  supplier: ['nama'],
  purchase_order: ['no_po', 'tanggal'],
  penerimaan_barang: ['no_dokumen', 'tanggal_terima'],
  produksi: ['tanggal_produksi'],
  distribusi: ['tanggal_distribusi'],
  budget: ['periode'],
  kas_bank: ['tanggal', 'tipe', 'jumlah'],
  divisi: ['nama'],
  sp_referensi_bahan: ['nama', 'berat_bersih'],
  akun: ['kode', 'nama', 'bp'],
  hari_libur: ['tanggal', 'nama'],
};

/**
 * Field yang harus unik per-tenant (cek duplikat sebelum insert).
 * Format: { nama_tabel: { field_db: 'label_untuk_pesan_error' } }
 */
const UNIQUE_FIELDS = {
  penerima_manfaat: { nama_kelompok: 'Nama Kelompok' },
  bahan_baku: { nama: 'Nama Bahan' },
  supplier: { nama: 'Nama Supplier' },
  sp_referensi_bahan: { nama: 'Nama Bahan' },
  akun: { kode: 'Kode Akun', nama: 'Nama Akun' },
};

/**
 * Field yang bisa dicari (search) per tabel.
 */
const SEARCHABLE_FIELDS = {
  penerima_manfaat: ['nama_kelompok', 'lokasi', 'kategori_penerima', 'provinsi', 'kota', 'kecamatan', 'nama_kontak', 'email', 'status_kepemilikan'],
  bahan_baku: ['nama', 'kode', 'kategori'],
  supplier: ['nama', 'kategori_supply', 'kontak_person'],
  purchase_order: ['no_po', 'supplier_nama', 'status'],
  penerimaan_barang: ['no_dokumen', 'supplier_nama', 'status_qc'],
  produksi: ['menu_nama', 'kategori_penerima', 'status'],
  distribusi: ['titik_distribusi', 'kategori_penerima', 'status', 'kurir', 'pm_nama', 'pm_alamat'],
  budget: ['periode', 'kategori_penerima'],
  kas_bank: ['tipe', 'kategori', 'akun', 'deskripsi', 'no_transaksi'],
  akun: ['kode', 'nama', 'bp'],
  sp_referensi_bahan: ['nama', 'kategori'],
  hari_libur: ['nama', 'kategori', 'tanggal'],
};

/**
 * Role restrictions for specific tables
 */
const TABLE_ROLES = {
  budget: ['admin', 'keuangan', 'ahli_gizi'],
  kas_bank: ['admin', 'keuangan'],
  penerima_manfaat: ['admin', 'keuangan'],
  bahan_baku: ['admin', 'keuangan', 'gudang', 'ahli_gizi'],
  supplier: ['admin', 'keuangan', 'gudang'],
  purchase_order: ['admin', 'keuangan', 'gudang', 'ahli_gizi'],
  penerimaan_barang: ['admin', 'keuangan', 'gudang'],
  stok_masuk: ['admin', 'keuangan', 'gudang'],
  stok_keluar: ['admin', 'keuangan', 'gudang'],
  produksi: ['admin', 'produksi', 'gudang', 'keuangan', 'ahli_gizi'],
  distribusi: ['admin', 'produksi', 'gudang', 'keuangan', 'ahli_gizi'],
  sp_referensi_bahan: ['admin', 'ahli_gizi'],
  akun: ['admin', 'keuangan'],
};

module.exports = { TABLES, REQUIRED_FIELDS, UNIQUE_FIELDS, SEARCHABLE_FIELDS, TABLE_ROLES };
