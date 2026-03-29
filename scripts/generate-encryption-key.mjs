import crypto from 'node:crypto';

const value = crypto.randomBytes(32).toString('base64');

process.stdout.write('\nREY30_ENCRYPTION_KEY (base64, 32 bytes):\n');
process.stdout.write(`${value}\n\n`);
process.stdout.write('Use this in production env:\n');
process.stdout.write(`REY30_ENCRYPTION_KEY=${value}\n\n`);
process.stdout.write(
  'Keep this key stable and private. Rotating it without migration will break decryption of stored user secrets.\n'
);
