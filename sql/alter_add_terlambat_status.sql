-- Menambahkan 'Terlambat' ke ENUM status tabel absensi
ALTER TABLE absensi MODIFY COLUMN status 
  ENUM('Hadir','Sakit','Izin','Cuti','Alpha','Terlambat') DEFAULT 'Hadir';
