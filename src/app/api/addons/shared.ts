import path from 'path';
import { isNetlifyRuntime } from '@/app/api/packages/shared';

const DEFAULT_ADDON_ROOT =
  process.env.REY30_ADDON_ROOT || path.join(process.cwd(), 'download', 'addons');
const DEFAULT_ADDON_BLOB_STORE = 'rey30-addons';

export type AddonStorageBackend = 'filesystem' | 'netlify-blobs';
export type AddonStorageScope = 'filesystem' | 'deploy' | 'global';

export class InvalidAddonPathError extends Error {
  constructor(message = 'Invalid addon path') {
    super(message);
    this.name = 'InvalidAddonPathError';
  }
}

function trim(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getAddonsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.REY30_ADDON_ROOT || DEFAULT_ADDON_ROOT);
}

export function resolveAddonStorageBackend(
  env: NodeJS.ProcessEnv = process.env
): AddonStorageBackend {
  const explicit = trim(env.REY30_ADDON_STORAGE_BACKEND).toLowerCase();
  if (explicit === 'filesystem' || explicit === 'netlify-blobs') {
    return explicit as AddonStorageBackend;
  }

  return isNetlifyRuntime(env) ? 'netlify-blobs' : 'filesystem';
}

export function resolveAddonBlobStoreName(env: NodeJS.ProcessEnv = process.env): string {
  return trim(env.REY30_ADDON_BLOB_STORE) || DEFAULT_ADDON_BLOB_STORE;
}

export function resolveAddonStorageScope(
  env: NodeJS.ProcessEnv = process.env
): AddonStorageScope {
  if (resolveAddonStorageBackend(env) === 'filesystem') {
    return 'filesystem';
  }

  return trim(env.CONTEXT).toLowerCase() === 'production' ? 'global' : 'deploy';
}

export function normalizeAddonRelativePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

export function assertValidAddonRelativePath(relativePath: string): string {
  const normalized = normalizeAddonRelativePath(relativePath);
  if (!normalized) {
    throw new InvalidAddonPathError();
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new InvalidAddonPathError();
  }

  return normalized;
}

export function sanitizeAddonBaseName(value: string): string {
  const trimmed = value.trim().replace(/\.addon\.json$/i, '');
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function normalizeAddonId(value: string): string {
  const baseName = sanitizeAddonBaseName(value);
  return baseName || 'addon';
}

export function normalizeAddonFileName(value: string): string {
  return `${normalizeAddonId(value)}.addon.json`;
}

export function isInvalidAddonPathError(error: unknown): boolean {
  if (error instanceof InvalidAddonPathError) return true;
  return String(error).includes('Invalid addon path');
}
