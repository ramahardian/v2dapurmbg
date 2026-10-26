CREATE TABLE IF NOT EXISTS sp_referensi_bahan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  nama VARCHAR(200) NOT NULL,
  kategori VARCHAR(100) DEFAULT NULL,
  berat_bersih DECIMAL(10,2) NOT NULL,
  bdd_persen DECIMAL(5,4) NOT NULL,
  berat_kotor DECIMAL(12,6) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE KEY uk_tenant_nama (tenant_id, nama),
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB;

INSERT IGNORE INTO sp_referensi_bahan (tenant_id, nama, berat_bersih, bdd_persen, berat_kotor) VALUES
(1, 'Beras 1,25 SP', 62.5, 1, 62.5)
(1, 'Beras', 50.0, 1.0, 50.0),
(1, 'Beras 1,5 SP', 75.0, 1.0, 75.0),
(1, 'Beras 1,75 SP', 87.5, 1, 87.5)
(1, 'Beras 2 SP', 100.0, 1.0, 100.0),
(1, 'Beras 2,5 SP', 125.0, 1.0, 125.0),
(1, 'Mie', 50.0, 1.0, 50.0),
(1, 'Mie 1,25 SP', 62.5, 1, 62.5)
(1, 'Mie 1,75 SP', 87.5, 1, 87.5)
(1, 'Mie 2 SP', 100.0, 1.0, 100.0),
(1, 'Jagung 0,5 SP', 50, 0.35, 142.857143)
(1, 'Jagung', 25, 0.35, 71.428571)
(1, 'Jagung 1,25 SP', 62.5, 0.35, 178.571429)
(1, 'Jagung 1,75 SP', 87.5, 0.35, 250)
(1, 'Jagung 2 SP', 100, 0.35, 285.714286)
(1, 'Jagung 2,5 SP', 125, 0.35, 357.142857)
(1, 'Jagung Pipil', 25.0, 1.0, 25.0),
(1, 'Jagung Pipil 0,5 SP', 50.0, 1.0, 50.0),
(1, 'Kentang 0,5 SP', 50.0, 1.0, 50.0),
(1, 'Kentang', 25.0, 1.0, 25.0),
(1, 'Kentang 1,25 SP', 62.5, 1, 62.5)
(1, 'Kacang Panjang', 25, 0.75, 33.333333)
(1, 'Kacang Panjang 0,5 SP', 50, 0.75, 66.666667)
(1, 'Kacang Panjang 1 SP', 100, 0.75, 133.333333)
(1, 'Kentang 2 SP', 100.0, 1.0, 100.0),
(1, 'Bihung 1,25 SP', 62.5, 1, 62.5)
(1, 'Bihun 2 SP', 100.0, 1.0, 100.0),
(1, 'Ayam Potong 1 SP', 40, 0.5, 80)
(1, 'Ayam Potong 1,5 SP', 60, 0.5, 120)
(1, 'Ayam Potong 2 SP', 80, 0.5, 160)
(1, 'Telor Ayam 1 SP', 55, 0.89, 61.797753)
(1, 'Telor Ayam 1,5 SP', 82.5, 0.89, 92.696629)
(1, 'Telor Ayam 2 Sp', 110, 0.89, 123.595506)
(1, 'Ayam Fillet 1 SP', 40.0, 1.0, 40.0),
(1, 'Ayam Fillet 1,5 SP', 60.0, 1.0, 60.0),
(1, 'Ayam Fillet 2 SP', 80.0, 1.0, 80.0),
(1, 'Daging Sapi 1 SP', 35.0, 1.0, 35.0),
(1, 'Daging Sapi 1,5 SP', 52.5, 1.0, 52.5),
(1, 'Daging Sapi 2 SP', 70.0, 1.0, 70.0),
(1, 'Ikan Patin Fillet 1 SP', 40.0, 0.5, 80.0),
(1, 'Ikan Patin Fillet 1,5 SP', 60.0, 0.5, 120.0),
(1, 'Ikan Patin Fillet 2 SP', 80.0, 0.5, 160.0),
(1, 'Ikan Nila 1 SP', 40.0, 0.8, 50.0),
(1, 'Ikan Nila 1,5 SP', 60.0, 0.8, 75.0),
(1, 'Ikan Nila 2 SP', 80.0, 0.8, 100.0),
(1, 'Tempe 0,25 SP', 12.5, 1, 12.5)
(1, 'Tempe 0,5 SP', 25.0, 1.0, 25.0),
(1, 'Tempe', 50.0, 1.0, 50.0),
(1, 'Tahu 0,25 SP', 27.5, 1, 27.5)
(1, 'Tahu 0,5 SP', 55.0, 1.0, 55.0),
(1, 'Tahu 1 SP', 110.0, 1.0, 110.0),
(1, 'Keripik Tempe 0,25 SP', 12.5, 1, 12.5)
(1, 'Keripik Tempe 0,5 SP', 25.0, 1.0, 25.0),
(1, 'Wortel', 25, 0.8, 31.25)
(1, 'Wortel 0,5 SP', 50, 0.8, 62.5)
(1, 'Toge', 25.0, 1.0, 25.0),
(1, 'Toge 0,5 SP', 50.0, 1.0, 50.0),
(1, 'Buncis', 25, 0.9, 27.777778)
(1, 'Buncis 0,5 SP', 50, 0.9, 55.555556)
(1, 'Sawi Putih', 25, 0.79, 31.64557)
(1, 'Sawi Putih 0,5 SP', 50, 0.79, 63.291139)
(1, 'Sawi Putih 1 SP', 100, 0.79, 126.582278)
(1, 'Timun', 25, 0.55, 45.454545)
(1, 'Timun 0,5 SP', 50, 0.55, 90.909091)
(1, 'Tomat', 25.0, 1.0, 25.0),
(1, 'Tomat 0,5 SP', 50.0, 1.0, 50.0),
(1, 'Putren', 25.0, 1.0, 25.0),
(1, 'Putren 0,5 SP', 50.0, 1.0, 50.0),
(1, 'Pokcoy', 25, 0.87, 28.735632)
(1, 'Pokcoy 1 SP', 100, 0.87, 114.942529)
(1, 'Pokcoy 0,5 SP', 50, 0.87, 57.471264)
(1, 'Sawi Hijau', 25, 0.87, 28.735632)
(1, 'Sawi Hijau 0,5 SP', 50, 0.87, 57.471264)
(1, 'Sawi Hijau 1 SP', 100, 0.87, 114.942529)
(1, 'Brokoli', 25, 0.57, 43.859649)
(1, 'Brokoli 0,5 SP', 50, 0.57, 87.719298)
(1, 'Kembang Kol', 25, 0.57, 43.859649)
(1, 'Kembang Kol 0,5 SP', 50, 0.57, 87.719298)
(1, 'Kubis', 25, 0.75, 33.333333)
(1, 'Bayam', 25, 0.71, 35.211268)
(1, 'Bayam 0,5 SP', 50, 0.71, 70.422535)
(1, 'Kubis 0,5 SP', 50, 0.75, 66.666667)
(1, 'Labu Siam', 25, 0.83, 30.120482)
(1, 'Labu Siam 0,5 SP', 50, 0.83, 60.240964)
(1, 'Labu Siam 1 SP', 100, 0.83, 120.481928)
(1, 'Minyak', 5.0, 1.0, 5.0),
(1, 'Minyak 1,5 SP', 7.5, 1, 7.5)
(1, 'Jeruk', 62, 0.72, 86.111111)
(1, 'Anggur', 80.0, 1.0, 80.0),
(1, 'Kelengkeng', 53, 0.7, 75.714286)
(1, 'Rambutan', 75, 0.4, 187.5)
(1, 'Pisang', 55.0, 0.66, 83.33333333),
(1, 'Semangka', 90.0, 0.46, 195.65),  -- BDD 46% (sinkron dgn scripts/seed_sp_referensi.js & bahan_baku)
(1, 'Melon', 90.0, 0.67, 134.3283582),
(1, 'Pepaya', 110.0, 0.75, 146.6666667),
(1, 'Naga', 90, 0.66, 136.363636)
(1, 'Apel', 120.0, 0.9, 133.3333333),
(1, 'Kacang Polong', 25, 0.91, 27.472527)
(1, 'Kacang Polong 0,5 SP', 50, 0.91, 54.945055)
(1, 'Kacang Polong 1 SP', 100, 0.91, 109.89011)
(1, 'Kol', 25, 0.75, 33.333333)
(1, 'Kol 0,5 SP', 50, 0.75, 66.666667)
(1, 'Selada', 25, 0.69, 36.231884)
(1, 'Selada 0,5 SP', 50, 0.69, 72.463768)
(1, 'Selada 1 SP', 100, 0.69, 144.927536)
(1, 'Edamame 1 SP', 100.0, 0.85, 117.6470588),
(1, 'Edamame 0,5 SP', 50.0, 0.85, 58.82352941),
(1, 'Ikan Lele 1 SP', 80.0, 0.8, 100.0),
(1, 'Ikan Lele 1,5 SP', 60.0, 0.8, 75.0),
(1, 'Ikan Lele 2 SP', 40.0, 0.8, 50.0),
(1, 'Timun SP', 16.6, 0.55, 30.181818)
(1, 'Tomat SP', 16.6, 1.0, 16.6),
(1, 'Kacang Koro', 30.0, 1.0, 30.0),
(1, 'Baby Corn 0,5 SP', 50.0, 1.0, 50.0),
(1, 'Sawi Putih SP', 16.6, 0.79, 21.01265823),
(1, 'Apel malang', 130.0, 0.88, 147.7272727),
(1, 'Red Bean', 30.0, 0.95, 31.57894737),
(1, 'Baby Kailan', 25.0, 1.0, 25.0),
(1, 'Baby Kailan 0,5 SP', 50.0, 1.0, 50.0),
(1, 'Baby Kailan 1 SP', 100.0, 1.0, 100.0),
(1, 'Ceriwis', 25, 0.8, 31.25)
(1, 'Ceriwis 0,5 SP', 50, 0.8, 62.5)
(1, 'Ceriwis 1 SP', 100, 0.8, 125)
(1, 'Roti', 60, 1, 60)
(1, 'Roti 1,5 SP', 100.0, 1.0, 100.0),
(1, 'Kacang Hijau 1 SP', 62.0, 1.0, 62.0),
(1, 'Kacang Hijau 1,5 SP', 100, 1, 100)
(1, 'Susu', 1.0, 1.0, 1.0),
(1, 'Telur Puyuh', 50.0, 0.798, 62.6566416),
(1, 'Telur Puyuh 1,5 SP', 80.0, 0.798, 100.2506266),
(1, 'Telur Puyuh 2 SP', 110.0, 0.798, 137.8446115),
(1, 'Salak', 60.0, 0.78, 76.92307692),
(1, 'Leci', 40.0, 0.85, 47.05882353),
(1, 'Selada SP', 16.6, 0.69, 24.05797101),
(1, 'Ayam Giling 2 SP', 80.0, 1.0, 80.0),
(1, 'Ayam Giling 1 SP', 40.0, 1.0, 40.0),
(1, 'Ayam Giling 1,5 SP', 60.0, 1.0, 60.0),
(1, 'Baby Corn', 20.0, 1.0, 20.0),
(1, 'Daun Bawang SP', 16.6, 0.67, 24.7761194),
(1, 'Wortel SP', 16.6, 0.8, 20.75),
(1, 'Buncis SP', 16.6, 0.9, 18.44444444),
(1, 'Brokoli SP', 16.6, 0.56, 29.64285714),
(1, 'Baby Corn SP', 16.6, 1.0, 16.6),
