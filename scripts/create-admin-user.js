const crypto = require('crypto');

const username = process.argv[2]?.trim();
if (!username) {
  throw new Error('Usage: node scripts/create-admin-user.js <username>');
}
if (!process.stdin.isTTY || !process.stdin.setRawMode) {
  throw new Error('Run this command in an interactive terminal so the password can be entered without echo.');
}

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    let value = '';
    const input = process.stdin;
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();

    const finish = (error) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') return finish(new Error('Cancelled.'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      }
    };

    input.on('data', onData);
  });
}

(async () => {
  const password = await readHidden('Password (minimum 14 characters): ');
  const confirmation = await readHidden('Confirm password: ');
  if (password.length < 14) throw new Error('Password must be at least 14 characters.');
  if (password !== confirmation) throw new Error('Passwords do not match.');

  const salt = crypto.randomBytes(16);
  const passwordHash = crypto.scryptSync(password, salt, 64);
  process.stdout.write(`${JSON.stringify({
    username,
    salt: salt.toString('hex'),
    passwordHash: passwordHash.toString('hex')
  })}\n`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
