import crypto from 'crypto';

const ENCRYPTION_SCHEME = 'v1';
const TEST_FALLBACK_KEY = 'rey30-test-encryption-key';
const MISSING_SECRET_ERROR_CODE = 'MISSING_ENCRYPTION_SECRET';

export class MissingEncryptionSecretError extends Error {
  readonly code = MISSING_SECRET_ERROR_CODE;

  constructor() {
    super(
      'Missing encryption secret. Define REY30_ENCRYPTION_KEY (recommended), APP_ENCRYPTION_KEY, or NEXTAUTH_SECRET.'
    );
    this.name = 'MissingEncryptionSecretError';
  }
}

let cachedEncryptionKey: Buffer | null = null;

function resolveKeySource(): string {
  const explicit = [
    process.env.REY30_ENCRYPTION_KEY,
    process.env.APP_ENCRYPTION_KEY,
    process.env.NEXTAUTH_SECRET,
  ]
    .map((value) => (value || '').trim())
    .find((value) => value.length > 0);

  if (explicit) return explicit;
  if (process.env.NODE_ENV === 'test') return TEST_FALLBACK_KEY;

  throw new MissingEncryptionSecretError();
}

function deriveKey(): Buffer {
  const source = resolveKeySource();

  if (/^[A-Za-z0-9+/=]+$/.test(source) && source.length >= 43) {
    try {
      const decoded = Buffer.from(source, 'base64');
      if (decoded.length >= 32) {
        return decoded.subarray(0, 32);
      }
    } catch {
      // Fall through to sha256.
    }
  }

  return crypto.createHash('sha256').update(source).digest().subarray(0, 32);
}

function getEncryptionKey(): Buffer {
  if (!cachedEncryptionKey) {
    cachedEncryptionKey = deriveKey();
  }
  return cachedEncryptionKey;
}

export function isEncryptionSecretConfigured(): boolean {
  try {
    void resolveKeySource();
    return true;
  } catch {
    return false;
  }
}

export function assertEncryptionSecretConfigured(): void {
  void getEncryptionKey();
}

export function isMissingEncryptionSecretError(error: unknown): boolean {
  if (error instanceof MissingEncryptionSecretError) return true;
  const message = String(error || '');
  return (
    message.includes(MISSING_SECRET_ERROR_CODE) ||
    message.includes('Missing encryption secret')
  );
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function encryptText(plainText: string): string {
  const encryptionKey = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTION_SCHEME}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptText(payload: string | null | undefined): string {
  if (!payload) return '';

  const [scheme, ivB64, tagB64, encryptedB64] = payload.split(':');
  if (scheme !== ENCRYPTION_SCHEME || !ivB64 || !tagB64 || !encryptedB64) {
    throw new Error('Encrypted payload format is invalid');
  }

  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
