const data = require('/tmp/perenc.json');
console.log('KUNCI:', Object.keys(data).join(', '));
console.log('jenjang_list:', JSON.stringify(data.jenjang_list));
console.log('hari keys:', data.hari && data.hari.length ? Object.keys(data.hari[0]).join(', ') : 'n/a');
console.log('total hari:', (data.hari || []).length);

for (const h of (data.hari || [])) {
  const bahan = (h.bahan || []).map(b => b.nama);
  console.log('\nH' + h.hari_ke + ' ' + (h.hari_nama || '') + ' | ' + (h.menu_nama || '').slice(0, 45));
  console.log('   bahan (' + bahan.length + '): ' + bahan.join(', '));
  if (h.bahan && h.bahan.length) {
    console.log('   contoh: ' + JSON.stringify(h.bahan[0]).slice(0, 200));
  }
}
process.exit(0);
