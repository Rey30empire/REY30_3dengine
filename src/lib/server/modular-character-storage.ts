import { promises as fs } from 'fs';
import path from 'path';
import { getDeployStore, getStore } from '@netlify/blobs';
import {
  assertValidModularRelativePath,
  getModularCharactersRoot,
  resolveModularCharacterBlobStoreName,
  resolveModularCharacterStorageBackend,
  resolveModularCharacterStorageScope,
  type ModularCharacterStorageBackend,
  type ModularCharacterStorageScope,
} from '@/app/api/modular-characters/shared';

interface StoredBlobMetadata {
  contentType?: string;
  modifiedAt?: string;
}

export interface StoredModularFile {
  relativePath: string;
  size: number;
  modifiedAt: string;
  contentType?: string;
}

export interface ModularCharacterStorageInfo {
  backend: ModularCharacterStorageBackend;
  scope: ModularCharacterStorageScope;
  root?: string;
  storeName?: string;
}

function isFsError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function resolveBlobStore() {
  const info = getModularCharacterStorageInfo();
  if (info.backend !== 'netlify-blobs' || !info.storeName) {
    throw new Error('Modular character storage backend is not configured for Netlify Blobs.');
  }

  return info.scope === 'global' ? getStore(info.storeName) : getDeployStore(info.storeName);
}

export function getModularCharacterStorageInfo(
  env: NodeJS.ProcessEnv = process.env
): ModularCharacterStorageInfo {
  const backend = resolveModularCharacterStorageBackend(env);
  const scope = resolveModularCharacterStorageScope(env);

  if (backend === 'filesystem') {
    return {
      backend,
      scope,
      root: getModularCharactersRoot(env),
    };
  }

  return {
    backend,
    scope,
    storeName: resolveModularCharacterBlobStoreName(env),
  };
}

async function readLocalFile(relativePath: string) {
  const root = getModularCharactersRoot();
  const absolutePath = path.resolve(root, relativePath);
  const [data, stats] = await Promise.all([fs.readFile(absolutePath), fs.stat(absolutePath)]);

  return {
    buffer: data,
    metadata: {
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    },
  };
}

async function writeLocalFile(relativePath: string, data: Uint8Array, contentType?: string) {
  const root = getModularCharactersRoot();
  const absolutePath = path.resolve(root, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, data);
  const stats = await fs.stat(absolutePath);
  return {
    relativePath,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    contentType,
  } satisfies StoredModularFile;
}

async function listLocalFilesRecursive(root: string, currentRelative = ''): Promise<StoredModularFile[]> {
  const currentPath = path.join(root, currentRelative);
  const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch((error) => {
    if (isFsError(error, 'ENOENT')) return [];
    throw error;
  });
  const items: StoredModularFile[] = [];

  for (const entry of entries) {
    const relativePath = currentRelative
      ? path.posix.join(currentRelative.replace(/\\/g, '/'), entry.name)
      : entry.name;

    if (entry.isDirectory()) {
      const nested = await listLocalFilesRecursive(root, relativePath);
      items.push(...nested);
      continue;
    }

    const absolutePath = path.resolve(root, relativePath);
    const stats = await fs.stat(absolutePath);
    items.push({
      relativePath,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    });
  }

  return items;
}

async function readBlobFile(relativePath: string) {
  const store = resolveBlobStore();
  const result = await store.getWithMetadata(relativePath, { type: 'arrayBuffer' });
  if (!result) return null;

  return {
    buffer: Buffer.from(result.data),
    metadata: {
      size: result.data.byteLength,
      modifiedAt:
        typeof result.metadata.modifiedAt === 'string'
          ? result.metadata.modifiedAt
          : new Date(0).toISOString(),
      contentType:
        typeof result.metadata.contentType === 'string' ? result.metadata.contentType : undefined,
    },
  };
}

async function writeBlobFile(relativePath: string, data: Uint8Array, contentType?: string) {
  const store = resolveBlobStore();
  const modifiedAt = new Date().toISOString();
  const blob = new Blob([Uint8Array.from(data)], {
    type: contentType || 'application/octet-stream',
  });
  await store.set(relativePath, blob, {
    metadata: {
      contentType: contentType || 'application/octet-stream',
      modifiedAt,
    },
  });

  return {
    relativePath,
    size: data.byteLength,
    modifiedAt,
    contentType,
  } satisfies StoredModularFile;
}

export async function readModularBinary(relativePath: string): Promise<{
  buffer: Buffer;
  metadata: {
    size: number;
    modifiedAt: string;
    contentType?: string;
  };
} | null> {
  const normalized = assertValidModularRelativePath(relativePath);
  const info = getModularCharacterStorageInfo();

  if (info.backend === 'filesystem') {
    try {
      return await readLocalFile(normalized);
    } catch (error) {
      if (isFsError(error, 'ENOENT')) return null;
      throw error;
    }
  }

  return readBlobFile(normalized);
}

export async function readModularJson<T>(relativePath: string): Promise<T | null> {
  const file = await readModularBinary(relativePath);
  if (!file) return null;
  return JSON.parse(file.buffer.toString('utf8')) as T;
}

export async function writeModularBinary(params: {
  relativePath: string;
  data: Uint8Array | Buffer;
  contentType?: string;
}) {
  const normalized = assertValidModularRelativePath(params.relativePath);
  const data = params.data instanceof Buffer ? params.data : Buffer.from(params.data);
  const info = getModularCharacterStorageInfo();

  if (info.backend === 'filesystem') {
    return writeLocalFile(normalized, data, params.contentType);
  }

  return writeBlobFile(normalized, data, params.contentType);
}

export async function writeModularJson(params: {
  relativePath: string;
  data: unknown;
}) {
  return writeModularBinary({
    relativePath: params.relativePath,
    data: Buffer.from(JSON.stringify(params.data, null, 2), 'utf8'),
    contentType: 'application/json',
  });
}

export async function listModularFiles(prefix = ''): Promise<StoredModularFile[]> {
  const info = getModularCharacterStorageInfo();
  const normalizedPrefix = prefix ? assertValidModularRelativePath(prefix) : '';

  if (info.backend === 'filesystem' && info.root) {
    return listLocalFilesRecursive(info.root, normalizedPrefix);
  }

  const store = resolveBlobStore();
  const result = await store.list({
    prefix: normalizedPrefix || undefined,
  });

  return Promise.all(
    result.blobs.map(async (blob) => {
      const metadata = await store.getMetadata(blob.key);
      const resolved = metadata?.metadata as StoredBlobMetadata | undefined;
      const content = await store.get(blob.key, { type: 'arrayBuffer' });

      return {
        relativePath: blob.key,
        size: content.byteLength,
        modifiedAt: resolved?.modifiedAt || new Date(0).toISOString(),
        contentType: resolved?.contentType,
      };
    })
  );
}

export async function deleteModularFile(relativePath: string): Promise<void> {
  const normalized = assertValidModularRelativePath(relativePath);
  const info = getModularCharacterStorageInfo();

  if (info.backend === 'filesystem' && info.root) {
    const absolutePath = path.resolve(info.root, normalized);
    await fs.unlink(absolutePath).catch((error) => {
      if (isFsError(error, 'ENOENT')) return;
      throw error;
    });
    return;
  }

  const store = resolveBlobStore();
  await store.delete(normalized);
}
