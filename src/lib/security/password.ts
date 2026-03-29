import crypto from 'crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

function serialize(parts: {
  salt: string;
  hash: string;
}): string {
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${parts.salt}$${parts.hash}`;
}

function parse(value: string): {
  n: number;
  r: number;
  p: number;
  salt: string;
  hash: string;
} {
  const [algo, n, r, p, salt, hash] = value.split('$');
  if (algo !== 'scrypt' || !n || !r || !p || !salt || !hash) {
    throw new Error('Invalid password hash format');
  }
  return {
    n: Number(n),
    r: Number(r),
    p: Number(p),
    salt,
    hash,
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return serialize({
    salt,
    hash: derived.toString('hex'),
  });
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const { n, r, p, salt, hash } = parse(storedHash);
  const derived = crypto.scryptSync(password, salt, KEYLEN, { N: n, r, p });
  const expected = Buffer.from(hash, 'hex');
  return crypto.timingSafeEqual(derived, expected);
}
