// ===== SP Referensi Bahan =====
const CRUD_SP_REF = {
  endpoint: '/sp_referensi_bahan',
  title: 'Referensi SP Bahan',
  fields: [
    { k: 'nama', l: 'Nama Bahan (SP)', req: true },
    { k: 'kategori', l: 'Kategori SP', type: 'select', opts: ['Karbohidrat','Protein Hewani','Protein Nabati','Sayur','Buah','Susu','Minyak'] },
    { k: 'berat_bersih', l: 'Berat Bersih (gram)', type: 'number', fmt: 'num', decimals: 1 },
    { k: 'bdd_persen', l: 'BDD (%)', type: 'number', fmt: 'pct', step: '1' },
    { k: 'berat_kotor', l: 'Berat Kotor (gram)', type: 'number', fmt: 'num', decimals: 1, calc: { from: ['berat_bersih', 'bdd_persen'] } },
    { k: 'energi', l: 'Energi (kkal)', type: 'number', fmt: 'num', decimals: 1 },
    { k: 'protein', l: 'Protein (g)', type: 'number', fmt: 'num', decimals: 1 },
    { k: 'lemak', l: 'Lemak (g)', type: 'number', fmt: 'num', decimals: 1 },
    { k: 'karbohidrat', l: 'Karbohidrat (g)', type: 'number', fmt: 'num', decimals: 1 },
    { k: 'serat', l: 'Serat (g)', type: 'number', fmt: 'num', decimals: 1 },
  ],
  cols: ['nama', 'kategori', 'berat_bersih', 'bdd_persen', 'berat_kotor', 'energi', 'protein', 'lemak', 'karbohidrat', 'serat'],
};
