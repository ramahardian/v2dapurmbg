module.exports = {
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
  shuffleStringArray: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 0.75,
  unicodeEscapeSequence: false,
  // Files/folders to exclude from obfuscation
  exclude: [
    '**/node_modules/**',
    '**/public/**',
    '**/views/**',
    '**/scripts/**',
    '**/*.sql',
    '**/*.json',
    '**/*.md',
    '**/*.sh',
    'server.js',  // entry point - keep readable for ncc entry
    'db.js',      // db config - may have dynamic requires
  ],
  // Target specific source directories
  target: 'node',
};
