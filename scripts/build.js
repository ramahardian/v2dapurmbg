const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const FILES = [
  'utilitas.js',
  'crud.js',
  'beranda.js',
  'menu.js',
  'bahan-baku.js',
  'gudang.js',
  'laporan.js',
  'siklus.js',
  'karyawan.js',
  'absensi.js',
  'penggajian.js',
  'jadwal.js',
  'notifikasi.js',
  'akun.js',
  'kelola-user.js',
  'kelola-cabang.js',
  'pembelian.js',
  'bp-operasional.js',
  'sp-referensi.js',
  'panduan.js',
  'panduan-keuangan.js',
  'panduan-sdm.js',
  'perhitungan-bdd.js',
  'bdd-kalkulator.js',
  'perencanaan.js',
  'total-kebutuhan.js',
  'ijin-cuti.js',
  'hari-libur.js',
  'definisi.js',
  'idle-timeout.js',
  'ticker.js',
  'chat.js',
  'inti.js',
];

const isDev = process.argv.includes('--dev');
const modulDir = path.join(__dirname, '..', 'public', 'modul');
const outDir = path.join(__dirname, '..', 'public', 'dist');
const outFile = path.join(outDir, 'app.min.js');

async function build() {
  let code = '';
  for (const f of FILES) {
    const fp = path.join(modulDir, f);
    if (!fs.existsSync(fp)) {
      console.error(`File tidak ditemukan: ${fp}`);
      process.exit(1);
    }
    code += fs.readFileSync(fp, 'utf8') + '\n';
  }

  let output = code;
  let label = 'Concatenated';
  if (!isDev) {
    const result = await minify(code, { format: { comments: false } });
    if (result.error) throw result.error;
    output = result.code;
    label = 'Minified';
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, output, 'utf8');

  // Manifest versi: hash konten (MD5 8-hex) dari bundle yang baru ditulis.
  // server.js memakai file ini sebagai cache-buster `?v=`. Berbasis konten (bukan
  // mtime), jadi SETIAP build baru dengan isi berbeda langsung menghasilkan versi
  // baru — bahkan saat deploy preserve timestamp (rsync -t / tar / git).
  const ver = require('crypto').createHash('md5').update(output).digest('hex').slice(0, 8);
  fs.writeFileSync(path.join(outDir, 'app.min.js.hash'), ver, 'utf8');

  console.log(`✓ ${label} ${FILES.length} file → ${outFile}`);
  console.log(`  Size: ${(output.length / 1024).toFixed(1)} KB`);
  console.log(`  Ver:  ${ver}`);
}

build().catch(err => { console.error('Build gagal:', err); process.exit(1); });
