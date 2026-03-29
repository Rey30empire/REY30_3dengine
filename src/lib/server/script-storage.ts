import { promises as fs } from 'fs';
import path from 'path';
import { getDeployStore, getStore } from '@netlify/blobs';
import {
  assertValidScriptRelativePath,
  getScriptsRoot,
  isScriptFile,
  resolveScriptBlobStoreName,
  resolveScriptStorageBackend,
  resolveScriptStorageScope,
  type ScriptListItem,
  type ScriptStorageBackend,
  type ScriptStorageScope,
} from '@/app/api/scripts/shared';

interface ScriptBlobDocument {
  version: 1;
  relativePath: string;
  content: string;
  modifiedAt: string;
}

export interface StoredScript extends ScriptListItem {
  content: string;
}

export interface ScriptStorageInfo {
  backend: ScriptStorageBackend;
  scope: ScriptStorageScope;
  root?: string;
  storeName?: string;
}

export interface ScriptStorageStatus extends ScriptStorageInfo {
  available: boolean;
  error?: string;
}

function isFsError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function toStoredScript(relativePath: string, content: string, modifiedAt: string): StoredScript {
  return {
    name: path.posix.basename(relativePath),
    relativePath,
    size: Buffer.byteLength(content, 'utf8'),
    modifiedAt,
    content,
  };
}

function resolveBlobStore() {
  const info = getScriptStorageInfo();
  if (info.backend !== 'netlify-blobs' || !info.storeName) {
    throw new Error('Script storage backend is not configured for Netlify Blobs.');
  }

  return info.scope === 'global' ? getStore(info.storeName) : getDeployStore(info.storeName);
}

function parseBlobDocument(relativePath: string, raw: unknown): StoredScript | null {
  if (!raw) return null;
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`Corrupted script blob at ${relativePath}`);
  }

  const content = 'content' in raw ? (raw as { content?: unknown }).content : undefined;
  const modifiedAt = 'modifiedAt' in raw ? (raw as { modifiedAt?: unknown }).modifiedAt : undefined;
  const storedRelativePath =
    'relativePath' in raw ? (raw as { relativePath?: unknown }).relativePath : undefined;

  if (typeof content !== 'string') {
    throw new Error(`Corrupted script blob at ${relativePath}`);
  }

  const normalizedRelativePath =
    typeof storedRelativePath === 'string' && storedRelativePath.trim()
      ? assertValidScriptRelativePath(storedRelativePath)
      : relativePath;

  return toStoredScript(
    normalizedRelativePath,
    content,
    typeof modifiedAt === 'string' && modifiedAt ? modifiedAt : new Date(0).toISOString()
  );
}

async function listLocalScriptsRecursive(rootDir: string, currentRelative = ''): Promise<StoredScript[]> {
  const currentPath = path.join(rootDir, currentRelative);
  const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch((error) => {
    if (isFsError(error, 'ENOENT')) return [];
    throw error;
  });
  const scripts: StoredScript[] = [];

  for (const entry of entries) {
    const relativePath = currentRelative
      ? path.posix.join(currentRelative.replace(/\\/g, '/'), entry.name)
      : entry.name;
    const normalized = assertValidScriptRelativePath(relativePath);
    const absolutePath = path.join(rootDir, normalized);

    if (entry.isDirectory()) {
      const nested = await listLocalScriptsRecursive(rootDir, normalized);
      scripts.push(...nested);
      continue;
    }

    if (!isScriptFile(entry.name)) continue;

    const [content, stats] = await Promise.all([
      fs.readFile(absolutePath, 'utf8'),
      fs.stat(absolutePath),
    ]);
    scripts.push(toStoredScript(normalized, content, stats.mtime.toISOString()));
  }

  return scripts;
}

async function getLocalScript(normalized: string): Promise<StoredScript | null> {
  const root = getScriptsRoot();
  const absolutePath = path.resolve(root, normalized);

  try {
    const [content, stats] = await Promise.all([
      fs.readFile(absolutePath, 'utf8'),
      fs.stat(absolutePath),
    ]);
    return toStoredScript(normalized, content, stats.mtime.toISOString());
  } catch (error) {
    if (isFsError(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
}

async function putLocalScript(normalized: string, content: string): Promise<StoredScript> {
  const root = getScriptsRoot();
  const absolutePath = path.resolve(root, normalized);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, 'utf8');
  const stats = await fs.stat(absolutePath);
  return toStoredScript(normalized, content, stats.mtime.toISOString());
}

async function deleteLocalScript(normalized: string): Promise<void> {
  const root = getScriptsRoot();
  const absolutePath = path.resolve(root, normalized);
  await fs.unlink(absolutePath);
}

async function getBlobScript(normalized: string): Promise<StoredScript | null> {
  const store = resolveBlobStore();
  const document = await store.get(normalized, { type: 'json' });
  return parseBlobDocument(normalized, document);
}

async function putBlobScript(normalized: string, content: string): Promise<StoredScript> {
  const store = resolveBlobStore();
  const modifiedAt = new Date().toISOString();
  const document: ScriptBlobDocument = {
    version: 1,
    relativePath: normalized,
    content,
    modifiedAt,
  };

  await store.setJSON(normalized, document);
  return toStoredScript(normalized, content, modifiedAt);
}

async function deleteBlobScript(normalized: string): Promise<void> {
  const store = resolveBlobStore();
  await store.delete(normalized);
}

export function getScriptStorageInfo(env: NodeJS.ProcessEnv = process.env): ScriptStorageInfo {
  const backend = resolveScriptStorageBackend(env);
  const scope = resolveScriptStorageScope(env);

  if (backend === 'filesystem') {
    return {
      backend,
      scope,
      root: getScriptsRoot(env),
    };
  }

  return {
    backend,
    scope,
    storeName: resolveScriptBlobStoreName(env),
  };
}

export async function getScriptStorageStatus(): Promise<ScriptStorageStatus> {
  const info = getScriptStorageInfo();

  try {
    if (info.backend === 'filesystem' && info.root) {
      await fs.mkdir(info.root, { recursive: true });
      await fs.access(info.root);
    } else {
      const store = resolveBlobStore();
      await store.get('__healthcheck__');
    }

    return {
      ...info,
      available: true,
    };
  } catch (error) {
    return {
      ...info,
      available: false,
      error: String(error),
    };
  }
}

export function resolveScriptVirtualFileName(relativePath: string): string {
  const normalized = assertValidScriptRelativePath(relativePath);
  const info = getScriptStorageInfo();
  if (info.backend === 'filesystem' && info.root) {
    return path.resolve(info.root, normalized);
  }

  return path.posix.join('scripts', normalized);
}

export async function listStoredScripts(): Promise<StoredScript[]> {
  const info = getScriptStorageInfo();

  if (info.backend === 'filesystem' && info.root) {
    return listLocalScriptsRecursive(info.root);
  }

  const store = resolveBlobStore();
  const result = await store.list();
  const blobs = 'blobs' in result ? result.blobs : [];
  const scripts = await Promise.all(
    blobs
      .filter((blob) => isScriptFile(path.posix.basename(blob.key)))
      .map((blob) => getBlobScript(blob.key))
  );

  return scripts.filter((item): item is StoredScript => Boolean(item));
}

export async function getStoredScript(relativePath: string): Promise<StoredScript | null> {
  const normalized = assertValidScriptRelativePath(relativePath);
  const info = getScriptStorageInfo();

  if (info.backend === 'filesystem') {
    return getLocalScript(normalized);
  }

  return getBlobScript(normalized);
}

export async function upsertStoredScript(relativePath: string, content: string): Promise<StoredScript> {
  const normalized = assertValidScriptRelativePath(relativePath);
  const info = getScriptStorageInfo();

  if (info.backend === 'filesystem') {
    return putLocalScript(normalized, content);
  }

  return putBlobScript(normalized, content);
}

export async function deleteStoredScript(relativePath: string): Promise<void> {
  const normalized = assertValidScriptRelativePath(relativePath);
  const info = getScriptStorageInfo();

  if (info.backend === 'filesystem') {
    await deleteLocalScript(normalized);
    return;
  }

  await deleteBlobScript(normalized);
}
