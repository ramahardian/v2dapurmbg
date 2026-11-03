const data = require('/tmp/grid53.json');
const byDay = data.byDay || {};
for (const hk of ['1', '2', '3']) {
  const cats = byDay[hk] || {};
  console.log('HARI ' + hk + ' kategoris: ' + Object.keys(cats).join(', '));
  const sayur = cats['Sayur'] || [];
  console.log('  Sayur (' + sayur.length + '): ' + sayur.map(b => b.id + ':' + b.nama).join(', '));
}
process.exit(0);
