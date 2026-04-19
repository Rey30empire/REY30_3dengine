import path from 'path';

const DEFAULT_PACKAGE_ROOT =
  process.env.REY30_PACKAGE_ROOT || path.join(process.cwd(), 'download', 'packages');
const DEFAULT_PACKAGE_BLOB_STORE = 'rey30-packages';

export type PackageStorageBackend = 'filesystem' | 'netlify-blobs';
export type PackageStorageScope = 'filesystem' | 'deploy' | 'global';

export class InvalidPackagePathError extends Error {
  constructor(message = 'Invalid package path') {
    super(message);
    this.name = 'InvalidPackagePathError';
  }
}

function trim(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isNetlifyRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return trim(env.NETLIFY) === 'true' || Boolean(trim(env.CONTEXT)) || Boolean(trim(env.DEPLOY_ID));
}

export function getPackagesRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.REY30_PACKAGE_ROOT || DEFAULT_PACKAGE_ROOT);
}

export function resolvePackageStorageBackend(
  env: NodeJS.ProcessEnv = process.env
): PackageStorageBackend {
  const explicit = trim(env.REY30_PACKAGE_STORAGE_BACKEND).toLowerCase();
  if (explicit === 'filesystem' || explicit === 'netlify-blobs') {
    return explicit as PackageStorageBackend;
  }

  return isNetlifyRuntime(env) ? 'netlify-blobs' : 'filesystem';
}

export function resolvePackageBlobStoreName(env: NodeJS.ProcessEnv = process.env): string {
  return trim(env.REY30_PACKAGE_BLOB_STORE) || DEFAULT_PACKAGE_BLOB_STORE;
}

export function resolvePackageStorageScope(
  env: NodeJS.ProcessEnv = process.env
): PackageStorageScope {
  if (resolvePackageStorageBackend(env) === 'filesystem') {
    return 'filesystem';
  }

  return trim(env.CONTEXT).toLowerCase() === 'production' ? 'global' : 'deploy';
}

export function normalizePackageRelativePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

export function assertValidPackageRelativePath(relativePath: string): string {
  const normalized = normalizePackageRelativePath(relativePath);
  if (!normalized) {
    throw new InvalidPackagePathError();
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new InvalidPackagePathError();
  }

  return normalized;
}

export function sanitizePackageBaseName(value: string): string {
  const trimmed = value.trim().replace(/\.package\.json$/i, '');
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function normalizePackageFileName(value: string): string {
  const baseName = sanitizePackageBaseName(value);
  if (!baseName) return 'Package.package.json';
  return `${baseName}.package.json`;
}

export function isInvalidPackagePathError(error: unknown): boolean {
  if (error instanceof InvalidPackagePathError) return true;
  return String(error).includes('Invalid package path');
}
