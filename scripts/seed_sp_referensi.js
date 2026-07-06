const db = require('../db');
require('dotenv').config();

const data = [
  { "nama_bahan": "Beras 1 SP", "berat_bersih": 50.0, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Beras 1.25 SP", "berat_bersih": 62.5, "persen_bdd": 100.0, "energi": 223.13, "protein": 5.25, "lemak": 1.06, "karbohidrat": 48.19, "serat": 0.13 },
  { "nama_bahan": "Beras 1.75 SP", "berat_bersih": 87.5, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Beras 2 SP", "berat_bersih": 100.0, "persen_bdd": 100.0, "energi": 357.0, "protein": 8.4, "lemak": 1.7, "karbohidrat": 77.1, "serat": 0.2 },
  { "nama_bahan": "Beras 2.5 SP", "berat_bersih": 125.0, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Mie", "berat_bersih": 50.0, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Mie 1.25 SP", "berat_bersih": 62.5, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Mie 1.75 SP", "berat_bersih": 87.5, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Mie 2 SP", "berat_bersih": 100.0, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Jagung 1 SP", "berat_bersih": 50.0, "persen_bdd": 100.0, "energi": 183.0, "protein": 4.9, "lemak": 3.65, "karbohidrat": 24.55, "serat": 1.1 },
  { "nama_bahan": "Jagung 0.5 SP", "berat_bersih": 25.0, "persen_bdd": 100.0, "energi": 91.5, "protein": 2.45, "lemak": 1.825, "karbohidrat": 17.275, "serat": 0.55 },
  { "nama_bahan": "Jagung 1.25 SP", "berat_bersih": 62.5, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Jagung 2 SP", "berat_bersih": 100.0, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Jagung 2.5 SP", "berat_bersih": 150.0, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Ayam Potong 1 SP", "berat_bersih": 40.0, "persen_bdd": 50.0, "energi": 119.2, "protein": 7.28, "lemak": 10.0, "karbohidrat": 0.0, "serat": 0.0 },
  { "nama_bahan": "Ayam Potong 1.5 SP", "berat_bersih": 60.0, "persen_bdd": 50.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Ayam Potong 2 SP", "berat_bersih": 80.0, "persen_bdd": 50.0, "energi": 238.4, "protein": 14.56, "lemak": 20.0, "karbohidrat": 0.0, "serat": 0.0 },
  { "nama_bahan": "Telor Ayam 1 SP", "berat_bersih": 55.0, "persen_bdd": 90.0, "energi": 84.7, "protein": 6.82, "lemak": 5.94, "karbohidrat": 385.0, "serat": 0.0 },
  { "nama_bahan": "Telor Ayam 1.5 SP", "berat_bersih": 82.5, "persen_bdd": 90.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Telor Ayam 2 Sp", "berat_bersih": 110.0, "persen_bdd": 90.0, "energi": 169.4, "protein": 13.64, "lemak": 11.88, "karbohidrat": 0.77, "serat": 0.0 },
  { "nama_bahan": "Ayam Giling 1 SP", "berat_bersih": 40.0, "persen_bdd": 100.0, "energi": 119.2, "protein": 7.28, "lemak": 10.0, "karbohidrat": 0.0, "serat": 0.0 },
  { "nama_bahan": "Ayam Giling 1.5 SP", "berat_bersih": 60.0, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Ayam Giling 2 SP", "berat_bersih": 80.0, "persen_bdd": 100.0, "energi": 238.4, "protein": 14.56, "lemak": 20.0, "karbohidrat": 0.0, "serat": 0.0 },
  { "nama_bahan": "Ayam Fillet 1 SP", "berat_bersih": 40.0, "persen_bdd": 100.0, "energi": 97.5, "protein": 14.78, "lemak": 3.86, "karbohidrat": 0.0, "serat": 0.0 },
  { "nama_bahan": "Ayam Fillet 1.5 SP", "berat_bersih": 60.0, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Ayam Fillet 2 SP", "berat_bersih": 80.0, "persen_bdd": 100.0, "energi": 195.0, "protein": 29.55, "lemak": 7.72, "karbohidrat": 0.0, "serat": 0.0 },
  { "nama_bahan": "Ikan Patin Fillet 1 SP", "berat_bersih": 40.0, "persen_bdd": 100.0, "energi": 52.8, "protein": 6.8, "lemak": 2.64, "karbohidrat": 0.44, "serat": 0.0 },
  { "nama_bahan": "Ikan Patin Fillet 1.5 SP", "berat_bersih": 60.0, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Ikan Patin Fillet 2 SP", "berat_bersih": 80.0, "persen_bdd": 100.0, "energi": 105.6, "protein": 13.6, "lemak": 5.28, "karbohidrat": 0.88, "serat": 0.0 },
  { "nama_bahan": "Ikan Lele Fillet 1 SP", "berat_bersih": 40.0, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Ikan Lele Fillet 1.5 SP", "berat_bersih": 60.0, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Ikan Lele Fillet 2 SP", "berat_bersih": 80.0, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Ikan Nila 1 SP", "berat_bersih": 40.0, "persen_bdd": 80.0, "energi": 35.6, "protein": 7.48, "lemak": 0.4, "karbohidrat": 0.0, "serat": 0.0 },
  { "nama_bahan": "Ikan Nila 1.5 SP", "berat_bersih": 60.0, "persen_bdd": 80.0, "energi": 53.4, "protein": 11.22, "lemak": 0.6, "karbohidrat": 0.0, "serat": 0.0 },
  { "nama_bahan": "Ikan Nila 2 SP", "berat_bersih": 80.0, "persen_bdd": 80.0, "energi": 71.2, "protein": 14.96, "lemak": 0.8, "karbohidrat": 0.0, "serat": 0.0 },
  { "nama_bahan": "Tempe 0.25 SP", "berat_bersih": 12.5, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Tempe 0.5 SP", "berat_bersih": 25.0, "persen_bdd": 100.0, "energi": 50.25, "protein": 5.2, "lemak": 2.2, "karbohidrat": 3.0, "serat": 0.35 },
  { "nama_bahan": "Tempe", "berat_bersih": 13.0, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Ikan Dori 1 SP", "berat_bersih": 40.0, "persen_bdd": 100.0, "energi": 52.8, "protein": 6.8, "lemak": 2.64, "karbohidrat": 0.44, "serat": 0.0 },
  { "nama_bahan": "Tahu 0.25 SP", "berat_bersih": 27.5, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Tahu 0.5 SP", "berat_bersih": 55.0, "persen_bdd": 100.0, "energi": 44.0, "protein": 5.99, "lemak": 2.59, "karbohidrat": 0.44, "serat": 55.0 },
  { "nama_bahan": "Tahu", "berat_bersih": 50.0, "persen_bdd": 100.0, "energi": 40.0, "protein": 5.45, "lemak": 2.35, "karbohidrat": 0.4, "serat": 0.5 },
  { "nama_bahan": "Kacang Koro 0.5 SP", "berat_bersih": 25.0, "persen_bdd": 100.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Keripik Tempe 0.5 SP", "berat_bersih": 25.0, "persen_bdd": 100.0, "energi": 145.25, "protein": 3.025, "lemak": 10.15, "karbohidrat": 10.425, "serat": 0.55 },
  { "nama_bahan": "Wortel", "berat_bersih": 25.0, "persen_bdd": 80.0, "energi": 9.0, "protein": 0.25, "lemak": 0.15, "karbohidrat": 1.975, "serat": 0.25 },
  { "nama_bahan": "Wortel 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 80.0, "energi": 18.0, "protein": 0.5, "lemak": 0.3, "karbohidrat": 3.95, "serat": 0.5 },
  { "nama_bahan": "Toge", "berat_bersih": 25.0, "persen_bdd": 100.0, "energi": 9.25, "protein": 1.1, "lemak": 125.0, "karbohidrat": 0.95, "serat": 425.0 },
  { "nama_bahan": "Toge 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 100.0, "energi": 18.5, "protein": 2.2, "lemak": 0.25, "karbohidrat": 1.9, "serat": 0.85 },
  { "nama_bahan": "Buncis", "berat_bersih": 25.0, "persen_bdd": 90.0, "energi": 8.5, "protein": 0.6, "lemak": 75.0, "karbohidrat": 1.8, "serat": 475.0 },
  { "nama_bahan": "Buncis 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 90.0, "energi": 17.0, "protein": 1.2, "lemak": 0.15, "karbohidrat": 3.6, "serat": 0.95 },
  { "nama_bahan": "Sawi Putih", "berat_bersih": 25.0, "persen_bdd": 79.0, "energi": 2.25, "protein": 0.25, "lemak": 25.0, "karbohidrat": 425.0, "serat": 0.2 },
  { "nama_bahan": "Sawi Putih 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 79.0, "energi": 4.5, "protein": 0.5, "lemak": 0.05, "karbohidrat": 0.85, "serat": 0.4 },
  { "nama_bahan": "Sawi Putih 1 SP", "berat_bersih": 100.0, "persen_bdd": 79.0, "energi": 9.0, "protein": 1.0, "lemak": 0.1, "karbohidrat": 1.7, "serat": 0.8 },
  { "nama_bahan": "Timun", "berat_bersih": 25.0, "persen_bdd": 55.0, "energi": 2.0, "protein": 0.05, "lemak": 0.05, "karbohidrat": 0.35, "serat": 75.0 },
  { "nama_bahan": "Timun 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 55.0, "energi": 4.0, "protein": 0.1, "lemak": 0.1, "karbohidrat": 0.7, "serat": 0.15 },
  { "nama_bahan": "Tomat", "berat_bersih": 25.0, "persen_bdd": 100.0, "energi": 6.0, "protein": 325.0, "lemak": 125.0, "karbohidrat": 1.175, "serat": 375.0 },
  { "nama_bahan": "Tomat 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 100.0, "energi": 12.0, "protein": 0.65, "lemak": 0.25, "karbohidrat": 2.35, "serat": 0.75 },
  { "nama_bahan": "Pokcoy", "berat_bersih": 25.0, "persen_bdd": 87.0, "energi": 7.0, "protein": 575.0, "lemak": 75.0, "karbohidrat": 1.0, "serat": 625.0 },
  { "nama_bahan": "Pokcoy 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 87.0, "energi": 14.0, "protein": 1.15, "lemak": 0.15, "karbohidrat": 2.0, "serat": 1.25 },
  { "nama_bahan": "Pokcoy 1 SP", "berat_bersih": 100.0, "persen_bdd": 87.0, "energi": 28.0, "protein": 2.3, "lemak": 0.3, "karbohidrat": 4.0, "serat": 2.5 },
  { "nama_bahan": "Sawi Hijau", "berat_bersih": 25.0, "persen_bdd": 87.0, "energi": 7.0, "protein": 575.0, "lemak": 75.0, "karbohidrat": 1.0, "serat": 625.0 },
  { "nama_bahan": "Sawi Hijau 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 87.0, "energi": 14.0, "protein": 1.15, "lemak": 0.15, "karbohidrat": 2.0, "serat": 1.25 },
  { "nama_bahan": "Sawi Hijau 1 SP", "berat_bersih": 100.0, "persen_bdd": 87.0, "energi": 28.0, "protein": 2.3, "lemak": 0.3, "karbohidrat": 4.0, "serat": 2.5 },
  { "nama_bahan": "Putren", "berat_bersih": 25.0, "persen_bdd": 100.0, "energi": 36.75, "protein": 1.275, "lemak": 175.0, "karbohidrat": 7.875, "serat": 325.0 },
  { "nama_bahan": "Putren 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 100.0, "energi": 73.5, "protein": 2.55, "lemak": 0.35, "karbohidrat": 15.75, "serat": 0.65 },
  { "nama_bahan": "Brokoli", "berat_bersih": 25.0, "persen_bdd": 57.0, "energi": 6.25, "protein": 0.6, "lemak": 0.05, "karbohidrat": 1.225, "serat": 325.0 },
  { "nama_bahan": "Brokoli 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 57.0, "energi": 12.5, "protein": 1.2, "lemak": 0.1, "karbohidrat": 2.45, "serat": 0.65 },
  { "nama_bahan": "Kembang Kol", "berat_bersih": 25.0, "persen_bdd": 57.0, "energi": 6.25, "protein": 0.6, "lemak": 0.05, "karbohidrat": 1.225, "serat": 325.0 },
  { "nama_bahan": "Kembang Kol 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 57.0, "energi": 12.5, "protein": 1.2, "lemak": 0.1, "karbohidrat": 2.45, "serat": 0.65 },
  { "nama_bahan": "Kol", "berat_bersih": 25.0, "persen_bdd": 75.0, "energi": 7.25, "protein": 0.35, "lemak": 0.05, "karbohidrat": 1.325, "serat": 475.0 },
  { "nama_bahan": "Kol 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 75.0, "energi": 14.5, "protein": 0.7, "lemak": 0.1, "karbohidrat": 2.65, "serat": 0.95 },
  { "nama_bahan": "Labu Siam", "berat_bersih": 25.0, "persen_bdd": 83.0, "energi": 7.5, "protein": 0.15, "lemak": 25.0, "karbohidrat": 1.675, "serat": 1.555 },
  { "nama_bahan": "Labu Siam 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 83.0, "energi": 15.0, "protein": 0.3, "lemak": 0.05, "karbohidrat": 3.35, "serat": 3.1 },
  { "nama_bahan": "Labu Siam 1 SP", "berat_bersih": 100.0, "persen_bdd": 83.0, "energi": 30.0, "protein": 0.6, "lemak": 0.1, "karbohidrat": 6.7, "serat": 6.2 },
  { "nama_bahan": "Bayam", "berat_bersih": 25.0, "persen_bdd": 71.0, "energi": 4.0, "protein": 225.0, "lemak": 0.1, "karbohidrat": 725.0, "serat": 175.0 },
  { "nama_bahan": "Bayam 0.5 SP", "berat_bersih": 55.0, "persen_bdd": 71.0, "energi": 8.0, "protein": 0.45, "lemak": 0.2, "karbohidrat": 1.45, "serat": 0.35 },
  { "nama_bahan": "Salada bokor", "berat_bersih": 25.0, "persen_bdd": 69.0, "energi": 7.0, "protein": 0.6, "lemak": 0.1, "karbohidrat": 1.45, "serat": 0.6 },
  { "nama_bahan": "Salada bokor 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 69.0, "energi": 14.0, "protein": 1.2, "lemak": 0.2, "karbohidrat": 2.9, "serat": 1.2 },
  { "nama_bahan": "Minyak", "berat_bersih": 5.0, "persen_bdd": 100.0, "energi": 44.2, "protein": 0.0, "lemak": 5.0, "karbohidrat": 0.0, "serat": 0.0 },
  { "nama_bahan": "Minyak 1.5 SP", "berat_bersih": 7.5, "persen_bdd": 100.0, "energi": 66.3, "protein": 0.0, "lemak": 7.5, "karbohidrat": 0.0, "serat": 0.0 },
  { "nama_bahan": "Jeruk", "berat_bersih": 55.0, "persen_bdd": 72.0, "energi": 24.75, "protein": 495.0, "lemak": 0.11, "karbohidrat": 6.16, "serat": 0.77 },
  { "nama_bahan": "Anggur", "berat_bersih": 80.0, "persen_bdd": 100.0, "energi": 24.0, "protein": 0.4, "lemak": 0.16, "karbohidrat": 5.44, "serat": 0.96 },
  { "nama_bahan": "Kelengkeng", "berat_bersih": 35.0, "persen_bdd": 67.0, "energi": 24.03, "protein": 0.31, "lemak": 0.03, "karbohidrat": 6.3, "serat": 0.27 },
  { "nama_bahan": "Kelengkeng", "berat_bersih": 53.0, "persen_bdd": 40.0, "energi": 40.28, "protein": 265.0, "lemak": 106.0, "karbohidrat": 9.54, "serat": 2.014 },
  { "nama_bahan": "Rambutan", "berat_bersih": 75.0, "persen_bdd": 40.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Semangka", "berat_bersih": 90.0, "persen_bdd": 46.0, "energi": 25.2, "protein": 0.45, "lemak": 0.18, "karbohidrat": 6.21, "serat": 0.36 },
  { "nama_bahan": "Melon", "berat_bersih": 95.0, "persen_bdd": 58.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Pepaya", "berat_bersih": 55.0, "persen_bdd": 75.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Pisang Ambon", "berat_bersih": 55.0, "persen_bdd": 57.0, "energi": 59.4, "protein": 0.5, "lemak": 0.4, "karbohidrat": 12.15, "serat": 0.95 },
  { "nama_bahan": "Apel", "berat_bersih": 0.0, "persen_bdd": 88.0, "energi": null, "protein": null, "lemak": null, "karbohidrat": null, "serat": null },
  { "nama_bahan": "Edamame 1 SP", "berat_bersih": 100.0, "persen_bdd": 50.0, "energi": 81.0, "protein": 10.0, "lemak": 5.0, "karbohidrat": 8.0, "serat": 5.2 },
  { "nama_bahan": "Edamame 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 50.0, "energi": 40.5, "protein": 5.0, "lemak": 2.5, "karbohidrat": 4.0, "serat": 2.6 },
  { "nama_bahan": "Ikan Dori 2 SP", "berat_bersih": 80.0, "persen_bdd": 100.0, "energi": 105.6, "protein": 13.6, "lemak": 5.28, "karbohidrat": 0.88, "serat": 0.0 },
  { "nama_bahan": "Susu", "berat_bersih": 100.0, "persen_bdd": 100.0, "energi": 6.1, "protein": 3.2, "lemak": 3.5, "karbohidrat": 4.3, "serat": 0.0 },
  { "nama_bahan": "Naga", "berat_bersih": 90.0, "persen_bdd": 66.0, "energi": 71.0, "protein": 1.7, "lemak": 3.1, "karbohidrat": 9.1, "serat": 3.2 },
  { "nama_bahan": "Kacang Polong 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 91.0, "energi": 11.0, "protein": 0.55, "lemak": 0.5, "karbohidrat": 1.7, "serat": 0.55 },
  { "nama_bahan": "Kacang Polong 1 SP", "berat_bersih": 100.0, "persen_bdd": 91.0, "energi": 22.0, "protein": 1.1, "lemak": 1.0, "karbohidrat": 3.4, "serat": 1.1 },
  { "nama_bahan": "Kacang Panjang", "berat_bersih": 25.0, "persen_bdd": 100.0, "energi": 7.75, "protein": 0.58, "lemak": 0.03, "karbohidrat": 1.33, "serat": 0.68 },
  { "nama_bahan": "Kacang Panjang 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 100.0, "energi": 15.5, "protein": 1.15, "lemak": 0.05, "karbohidrat": 2.65, "serat": 1.35 },
  { "nama_bahan": "Kacang Panjang 1 SP", "berat_bersih": 100.0, "persen_bdd": 100.0, "energi": 31.0, "protein": 2.3, "lemak": 0.1, "karbohidrat": 5.3, "serat": 2.7 },
  { "nama_bahan": "Selada", "berat_bersih": 25.0, "persen_bdd": 69.0, "energi": 23.65, "protein": 4.5, "lemak": 0.3, "karbohidrat": 0.05, "serat": 0.45 },
  { "nama_bahan": "Selada 0.5 SP", "berat_bersih": 50.0, "persen_bdd": 69.0, "energi": 47.3, "protein": 9.0, "lemak": 0.6, "karbohidrat": 0.1, "serat": 0.9 },
  { "nama_bahan": "Selada 1 SP", "berat_bersih": 100.0, "persen_bdd": 69.0, "energi": 94.6, "protein": 18.0, "lemak": 1.2, "karbohidrat": 0.2, "serat": 1.8 },
  { "nama_bahan": "Ikan Lele 1 SP", "berat_bersih": 80.0, "persen_bdd": 80.0, "energi": 240.0, "protein": 17.57, "lemak": 14.53, "karbohidrat": 8.54, "serat": 0.5 },
  { "nama_bahan": "Ikan Lele 1.5 SP", "berat_bersih": 60.0, "persen_bdd": 80.0, "energi": 144.0, "protein": 10.5, "lemak": 8.72, "karbohidrat": 5.12, "serat": 0.3 },
  { "nama_bahan": "Ikan Lele 2 SP", "berat_bersih": 40.0, "persen_bdd": 80.0, "energi": 57.6, "protein": 4.2, "lemak": 3.49, "karbohidrat": 2.05, "serat": 0.12 },
  { "nama_bahan": "Kacang Koro", "berat_bersih": 30.0, "persen_bdd": 100.0, "energi": 99.6, "protein": 7.2, "lemak": 0.9, "karbohidrat": 16.5, "serat": 1.68 },
  { "nama_bahan": "Baby Corn", "berat_bersih": 15.0, "persen_bdd": 100.0, "energi": 5.25, "protein": 0.33, "lemak": 0.015, "karbohidrat": 1.11, "serat": 0.285 },
  { "nama_bahan": "Baby Corn 1 SP", "berat_bersih": 100.0, "persen_bdd": 100.0, "energi": 35.0, "protein": 2.2, "lemak": 0.1, "karbohidrat": 7.4, "serat": 1.9 },
  { "nama_bahan": "Brokoli 1 SP", "berat_bersih": 0.0, "persen_bdd": 0.0, "energi": 0.0, "protein": 0.0, "lemak": 0.0, "karbohidrat": 0.0, "serat": 0.0 }
];

function inferKategori(nama) {
  const n = nama.toLowerCase();
  if (n.includes('beras') || n.includes('mie') || n.includes('jagung') || n.includes('baby corn') || n.includes('putren')) return 'Karbohidrat';
  if (n.includes('ayam') || n.includes('telor') || n.includes('ikan') || n.includes('patin') || n.includes('lele') || n.includes('nila') || n.includes('dori')) return 'Protein Hewani';
  if (n.includes('tempe') || n.includes('tahu') || n.includes('kacang') || n.includes('edamame') || n.includes('keripik')) return 'Protein Nabati';
  if (n.includes('wortel') || n.includes('toge') || n.includes('buncis') || n.includes('sawi') || n.includes('timun') || n.includes('tomat') || n.includes('pokcoy') || n.includes('brokoli') || n.includes('kembang kol') || n.includes('kol ') || n.includes('labu siam') || n.includes('bayam') || n.includes('selada') || n.includes('salada') || n.includes('kacang panjang') || n.includes('kacang polong') || n.includes('kacang koro')) return 'Sayur';
  if (n.includes('jeruk') || n.includes('anggur') || n.includes('kelengkeng') || n.includes('rambutan') || n.includes('semangka') || n.includes('melon') || n.includes('pepaya') || n.includes('pisang') || n.includes('apel') || n.includes('naga')) return 'Buah';
  if (n.includes('susu')) return 'Susu';
  if (n.includes('minyak')) return 'Minyak';
  return 'Lainnya';
}

(async () => {
  try {
    const [tenants] = await db.query('SELECT id FROM tenants');
    for (const t of tenants) {
      await db.query('DELETE FROM sp_referensi_bahan WHERE tenant_id = ?', [t.id]);
      for (const d of data) {
        const bdd = d.persen_bdd > 0 ? Math.round((d.persen_bdd / 100) * 10000) / 10000 : 0;
        const beratKotor = bdd > 0 ? Math.round((d.berat_bersih / bdd) * 100) / 100 : 0;
        await db.query(
          `INSERT IGNORE INTO sp_referensi_bahan (tenant_id, nama, kategori, berat_bersih, bdd_persen, berat_kotor, energi, protein, lemak, karbohidrat, serat)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [t.id, d.nama_bahan, inferKategori(d.nama_bahan), d.berat_bersih, bdd, beratKotor, d.energi, d.protein, d.lemak, d.karbohidrat, d.serat]
        );
      }
      console.log(`  ✓ ${data.length} baris untuk tenant id=${t.id}`);
    }
    console.log('✓ Seed sp_referensi_bahan selesai');
    process.exit(0);
  } catch (e) {
    console.error('✗ Gagal:', e.message);
    process.exit(1);
  }
})();
