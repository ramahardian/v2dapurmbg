const bcrypt = require('bcrypt');
const fs = require('fs');

const password = process.argv[2];

if (!password) {
  console.log('Usage: node scripts/hash-password.js <password>');
  process.exit(1);
}

bcrypt.hash(password, 10, function(err, hash) {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  fs.writeFileSync('/tmp/hash-output.txt', hash);
  console.log('Hash written to /tmp/hash-output.txt');
  console.log(hash);
});
