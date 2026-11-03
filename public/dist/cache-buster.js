const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// ── Cache-buster berbasis hash konten (MD5 8 hex) ──────────────────────
// Sumber utama: manifest `app.min.js.hash` yang ditulis scripts/build.js.
// Berbasis konten (bukan mtime) — setiap build baru dengan isi berbeda
// langsung menghasilkan versi baru, bahkan saat deploy preserve timestamp
// (rsync -t / tar / git) atau server tidak direstart.
// Signature cache = (mtime manifest, mtime bundle, size bundle)
// direkam bareng setiap recompute agar tidak saling menimpa dengan data basi.

let distVerCache = { hashMtime: null, bundleMtime: null, bundleSize: null, ver: null };

function hashBundle() {
  return crypto.createHash('md5').update(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'dist', 'app.min.js'))).digest('hex').slice(0, 8);
}

function getDistVer() {
  const verPath = path.join(__dirname, '..', '..', 'public', 'dist', 'app.min.js.hash');
  const bundlePath = path.join(__dirname, '..', '..', 'public', 'dist', 'app.min.js');

  try {
    const hmtime = fs.statSync(verPath).mtimeMs;
    const bst = fs.statSync(bundlePath);
    const bundleChanged = distVerCache.bundleMtime !== null
      && (distVerCache.bundleMtime !== bst.mtimeMs || distVerCache.bundleSize !== bst.size);
    const manifestChanged = distVerCache.hashMtime !== hmtime;

    if (distVerCache.ver === null || bundleChanged || manifestChanged) {
      distVerCache.hashMtime = hmtime;
      distVerCache.bundleMtime = bst.mtimeMs;
      distVerCache.bundleSize = bst.size;

      if (bundleChanged) {
        // Bundle diganti (build baru / deploy parsial tanpa update manifest)
        // → kebenaran ada di konten bundle itu sendiri.
        distVerCache.ver = hashBundle();
      } else {
        // Hanya manifest yang berubah → pakai hash-nya, dengan guard korup/kosong.
        const v = fs.readFileSync(verPath, 'utf8').trim();
        distVerCache.ver = /^[0-9a-f]{8}$/.test(v) ? v : hashBundle();
      }
    }
    return distVerCache.ver;
  } catch {
    // fallback ke metode kedua
  }

  // 2) Fallback tanpa manifest: hash konten bundle; re-hash hanya saat
  // mtime ATAU size berubah (menangkap deploy yang preserve mtime
  // tetapi mengubah ukuran file).
  try {
    const st = fs.statSync(bundlePath);
    if (distVerCache.ver === null || distVerCache.bundleMtime !== st.mtimeMs || distVerCache.bundleSize !== st.size) {
      distVerCache.bundleMtime = st.mtimeMs;
      distVerCache.bundleSize = st.size;
      distVerCache.ver = hashBundle();
    }
    return distVerCache.ver;
  } catch {}

  return distVerCache.ver || Date.now();
}

// ── Cache-buster logo: hash konten public/asset/logo.png (berbasis mtime+size,
// re-hash hanya saat file berubah). Dipakai sebagai `?v=` pada src logo agar
// browser yang meng-cache immutable tetap mendapat logo terbaru.

const LOGO_PATH = path.join(__dirname, '..', '..', 'public', 'asset', 'logo.png');
let logoVerCache = { mtime: null, size: null, ver: null };

function getLogoVer() {
  try {
    const st = fs.statSync(LOGO_PATH);
    if (logoVerCache.ver === null || logoVerCache.mtime !== st.mtimeMs || logoVerCache.size !== st.size) {
      logoVerCache.mtime = st.mtimeMs;
      logoVerCache.size = st.size;
      logoVerCache.ver = crypto.createHash('md5').update(fs.readFileSync(LOGO_PATH)).digest('hex').slice(0, 8);
    }
    return logoVerCache.ver;
  } catch {
    return logoVerCache.ver || Date.now();
  }
}

module.exports = { getDistVer, getLogoVer };