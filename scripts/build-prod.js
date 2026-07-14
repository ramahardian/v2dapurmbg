const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const JavaScriptObfuscator = require('javascript-obfuscator');

const SRC_DIRS = [
  'routes',
  'services',
  'middleware',
];

const SRC_ROOT = path.join(__dirname, '..');
const DIST_ROOT = path.join(__dirname, '..', 'dist');
const OBJ_ROOT = path.join(__dirname, '..', 'dist-obf');

const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: false,
  debugProtectionInterval: 0,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: true,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
};

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function obfuscateFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const obfuscated = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS);
  return obfuscated.getObfuscatedCode();
}

function processDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(destDir, entry.name);
    if (entry.isDirectory()) processDir(s, d);
    else if (entry.name.endsWith('.js')) {
      const obfCode = obfuscateFile(s);
      fs.writeFileSync(d, obfCode);
    } else fs.copyFileSync(s, d);
  }
}

async function build() {
  console.log('🧹 Cleaning dist folders...');
  fs.rmSync(DIST_ROOT, { recursive: true, force: true });
  fs.rmSync(OBJ_ROOT, { recursive: true, force: true });

  console.log('📦 Copying non-JS assets...');
  copyDir(path.join(SRC_ROOT, 'views'), path.join(DIST_ROOT, 'views'));
  copyDir(path.join(SRC_ROOT, 'public'), path.join(DIST_ROOT, 'public'));
  copyDir(path.join(SRC_ROOT, 'scripts'), path.join(DIST_ROOT, 'scripts'));
  fs.copyFileSync(path.join(SRC_ROOT, 'package.json'), path.join(DIST_ROOT, 'package.json'));
  fs.copyFileSync(path.join(SRC_ROOT, 'package-lock.json'), path.join(DIST_ROOT, 'package-lock.json'));
  fs.copyFileSync(path.join(SRC_ROOT, 'server.js'), path.join(DIST_ROOT, 'server.js'));
  fs.copyFileSync(path.join(SRC_ROOT, 'db.js'), path.join(DIST_ROOT, 'db.js'));
  if (fs.existsSync(path.join(SRC_ROOT, '.env.example')))
    fs.copyFileSync(path.join(SRC_ROOT, '.env.example'), path.join(DIST_ROOT, '.env.example'));

  console.log('🔐 Obfuscating JS source files...');
  for (const dir of SRC_DIRS) {
    processDir(path.join(SRC_ROOT, dir), path.join(OBJ_ROOT, dir));
  }

  console.log('📝 Merging obfuscated sources into dist...');
  for (const dir of SRC_DIRS) {
    copyDir(path.join(OBJ_ROOT, dir), path.join(DIST_ROOT, dir));
  }

  console.log('📦 Installing production dependencies...');
  const { execSync } = require('child_process');
  execSync('npm ci --omit=dev', { cwd: DIST_ROOT, stdio: 'inherit' });

  console.log('✅ Production build ready at ./dist');
  console.log('🚀 Run with: cd dist && NODE_ENV=production node server.js');
}

build().catch(e => { console.error('❌ Build failed:', e); process.exit(1); });
