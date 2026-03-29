import path from 'path';

const DEFAULT_SOURCE_ROOT = process.env.REY30_SOURCE_PROJECT_DIR || process.cwd();
const DEFAULT_SCRIPTS_ROOT = path.join(DEFAULT_SOURCE_ROOT, 'scripts');
const DEFAULT_SCRIPT_BLOB_STORE = 'rey30-scripts';

export const SCRIPT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.lua'];
export type ScriptStorageBackend = 'filesystem' | 'netlify-blobs';
export type ScriptStorageScope = 'filesystem' | 'deploy' | 'global';

export interface ScriptListItem {
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
}

export class InvalidScriptPathError extends Error {
  constructor(message = 'Invalid script path') {
    super(message);
    this.name = 'InvalidScriptPathError';
  }
}

function trim(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getScriptsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.REY30_SCRIPT_ROOT || DEFAULT_SCRIPTS_ROOT);
}

export function isNetlifyRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return trim(env.NETLIFY) === 'true' || Boolean(trim(env.CONTEXT)) || Boolean(trim(env.DEPLOY_ID));
}

export function resolveScriptStorageBackend(
  env: NodeJS.ProcessEnv = process.env
): ScriptStorageBackend {
  const explicitBackend = trim(env.REY30_SCRIPT_STORAGE_BACKEND).toLowerCase();
  if (explicitBackend === 'filesystem' || explicitBackend === 'netlify-blobs') {
    return explicitBackend as ScriptStorageBackend;
  }

  return isNetlifyRuntime(env) ? 'netlify-blobs' : 'filesystem';
}

export function resolveScriptBlobStoreName(env: NodeJS.ProcessEnv = process.env): string {
  return trim(env.REY30_SCRIPT_BLOB_STORE) || DEFAULT_SCRIPT_BLOB_STORE;
}

export function resolveScriptStorageScope(env: NodeJS.ProcessEnv = process.env): ScriptStorageScope {
  if (resolveScriptStorageBackend(env) === 'filesystem') {
    return 'filesystem';
  }

  return trim(env.CONTEXT).toLowerCase() === 'production' ? 'global' : 'deploy';
}

export function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

export function normalizeScriptRelativePath(value: string): string {
  const normalized = normalizeRelativePath(value);
  if (!normalized) return '';
  if (normalized.toLowerCase() === 'scripts') return '';
  if (normalized.toLowerCase().startsWith('scripts/')) {
    return normalized.slice('scripts/'.length);
  }
  return normalized;
}

export function isInvalidScriptPathError(error: unknown): boolean {
  if (error instanceof InvalidScriptPathError) return true;
  return String(error).includes('Invalid script path');
}

export function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/[<>:"|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_');
}

export function normalizeScriptName(value: string): string {
  const cleaned = sanitizeFileName(value);
  if (!cleaned) return '';
  return path.extname(cleaned) ? cleaned : `${cleaned}.ts`;
}

export function isScriptFile(fileName: string): boolean {
  return SCRIPT_EXTENSIONS.includes(path.extname(fileName).toLowerCase());
}

export function assertValidScriptRelativePath(relativePath: string): string {
  const normalized = normalizeScriptRelativePath(relativePath);
  if (!normalized) {
    throw new InvalidScriptPathError();
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new InvalidScriptPathError();
  }

  return normalized;
}

export function resolveScriptPath(relativePath: string): { root: string; absolute: string; normalized: string } {
  const root = getScriptsRoot();
  const normalized = assertValidScriptRelativePath(relativePath);
  const absolute = path.resolve(root, normalized);

  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new InvalidScriptPathError();
  }

  return { root, absolute, normalized };
}
