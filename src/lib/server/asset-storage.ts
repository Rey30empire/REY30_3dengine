import { promises as fs } from 'fs';
import path from 'path';
import { getDeployStore, getStore } from '@netlify/blobs';
import {
  assertValidAssetStorageRelativePath,
  getAssetMimeType,
  getManagedAssetRoot,
  resolveAssetBlobStoreName,
  resolveAssetStorageBackend,
  resolveAssetStorageScope,
  type AssetStorageBackend,
  type AssetStorageScope,
} from '@/app/api/assets/shared';
import type {
  StorageAdapter,
  StorageAdapterInfo,
  StorageAdapterStatus,
  StorageObjectRef,
} from '@/lib/server/storage-adapter';

type StoredBlobMetadata = {
  contentType?: string;
  modifiedAt?: string;
  size?: string | number;
  checksum?: string;
};

export interface StoredAssetBinaryRecord {
  relativePath: string;
  filePath: string;
  size: number;
  modifiedAt: string;
  contentType: string;
  storage: StorageObjectRef;
  buffer: Buffer;
}

export interface AssetStorageInfo extends StorageAdapterInfo {
  backend: AssetStorageBackend;
  scope: AssetStorageScope;
}

export interface AssetStorageStatus extends StorageAdapterStatus, AssetStorageInfo {}

export interface UpsertStoredAssetBinaryInput {
  relativePath: string;
  data: Uint8Array;
  contentType?: string;
  checksum?: string;
}

function isFsError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function resolveBlobStore(info: AssetStorageInfo = getAssetStorageInfo()) {
  if (info.backend !== 'netlify-blobs' || !info.storeName) {
    throw new Error('Asset storage backend is not configured for Netlify Blobs.');
  }

  return info.scope === 'global' ? getStore(info.storeName) : getDeployStore(info.storeName);
}

function buildStorageObjectRef(
  relativePath: string,
  info: AssetStorageInfo,
  checksum?: string
): StorageObjectRef {
  const normalized = assertValidAssetStorageRelativePath(relativePath);
  return {
    key: normalized,
    backend: info.backend,
    scope: info.scope,
    root: info.root,
    storeName: info.storeName,
    checksum,
  };
}

function inferModifiedAt(value: unknown, fallback = new Date(0).toISOString()) {
  return typeof value === 'string' && value ? value : fallback;
}

function inferSize(value: unknown, fallback = 0) {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : fallback;
}

function toStoredAssetBinaryRecord(params: {
  relativePath: string;
  buffer: Buffer;
  modifiedAt: string;
  contentType?: string;
  storage: StorageObjectRef;
}): StoredAssetBinaryRecord {
  const normalized = assertValidAssetStorageRelativePath(params.relativePath);
  return {
    relativePath: normalized,
    filePath: resolveAssetVirtualFileNameForStorage(params.storage),
    size: params.buffer.byteLength,
    modifiedAt: params.modifiedAt,
    contentType: params.contentType || getAssetMimeType(normalized),
    storage: params.storage,
    buffer: params.buffer,
  };
}

async function getLocalAssetBinary(
  normalized: string,
  storage: StorageObjectRef
): Promise<StoredAssetBinaryRecord | null> {
  const root = storage.root ? path.resolve(storage.root) : getManagedAssetRoot();
  const absolutePath = path.resolve(root, normalized);

  try {
    const [buffer, stats] = await Promise.all([fs.readFile(absolutePath), fs.stat(absolutePath)]);
    return toStoredAssetBinaryRecord({
      relativePath: normalized,
      buffer,
      modifiedAt: stats.mtime.toISOString(),
      contentType: getAssetMimeType(normalized),
      storage: {
        ...storage,
        root,
      },
    });
  } catch (error) {
    if (isFsError(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
}

async function putLocalAssetBinary(
  normalized: string,
  data: Uint8Array,
  contentType: string,
  storage: StorageObjectRef
): Promise<StoredAssetBinaryRecord> {
  const root = storage.root ? path.resolve(storage.root) : getManagedAssetRoot();
  const absolutePath = path.resolve(root, normalized);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, data);
  const stats = await fs.stat(absolutePath);
  return toStoredAssetBinaryRecord({
    relativePath: normalized,
    buffer: Buffer.from(data),
    modifiedAt: stats.mtime.toISOString(),
    contentType,
    storage: {
      ...storage,
      root,
    },
  });
}

async function deleteLocalAssetBinary(normalized: string, storage: StorageObjectRef): Promise<void> {
  const root = storage.root ? path.resolve(storage.root) : getManagedAssetRoot();
  const absolutePath = path.resolve(root, normalized);
  await fs.unlink(absolutePath).catch((error) => {
    if (!isFsError(error, 'ENOENT')) {
      throw error;
    }
  });
}

async function getBlobAssetBinary(
  normalized: string,
  storage: StorageObjectRef
): Promise<StoredAssetBinaryRecord | null> {
  const info: AssetStorageInfo = {
    backend: 'netlify-blobs',
    scope: storage.scope === 'filesystem' ? 'deploy' : storage.scope,
    storeName: storage.storeName || resolveAssetBlobStoreName(),
  };
  const store = resolveBlobStore(info);
  const result = await store.getWithMetadata(normalized, { type: 'arrayBuffer' });
  if (!result) return null;

  const metadata = result.metadata as StoredBlobMetadata | undefined;
  return toStoredAssetBinaryRecord({
    relativePath: normalized,
    buffer: Buffer.from(result.data),
    modifiedAt: inferModifiedAt(metadata?.modifiedAt),
    contentType:
      typeof metadata?.contentType === 'string' && metadata.contentType
        ? metadata.contentType
        : getAssetMimeType(normalized),
    storage: {
      ...storage,
      backend: 'netlify-blobs',
      scope: info.scope,
      storeName: info.storeName,
      checksum:
        typeof metadata?.checksum === 'string' && metadata.checksum
          ? metadata.checksum
          : storage.checksum,
    },
  });
}

async function putBlobAssetBinary(
  normalized: string,
  data: Uint8Array,
  contentType: string,
  storage: StorageObjectRef
): Promise<StoredAssetBinaryRecord> {
  const info: AssetStorageInfo = {
    backend: 'netlify-blobs',
    scope: storage.scope === 'filesystem' ? 'deploy' : storage.scope,
    storeName: storage.storeName || resolveAssetBlobStoreName(),
  };
  const store = resolveBlobStore(info);
  const modifiedAt = new Date().toISOString();
  const blob = new Blob([Uint8Array.from(data)], { type: contentType });
  await store.set(normalized, blob, {
    metadata: {
      contentType,
      modifiedAt,
      size: data.byteLength,
      checksum: storage.checksum,
    },
  });

  return toStoredAssetBinaryRecord({
    relativePath: normalized,
    buffer: Buffer.from(data),
    modifiedAt,
    contentType,
    storage: {
      ...storage,
      backend: 'netlify-blobs',
      scope: info.scope,
      storeName: info.storeName,
    },
  });
}

async function deleteBlobAssetBinary(normalized: string, storage: StorageObjectRef): Promise<void> {
  const info: AssetStorageInfo = {
    backend: 'netlify-blobs',
    scope: storage.scope === 'filesystem' ? 'deploy' : storage.scope,
    storeName: storage.storeName || resolveAssetBlobStoreName(),
  };
  const store = resolveBlobStore(info);
  await store.delete(normalized);
}

function createStorageRefForCurrentBackend(
  relativePath: string,
  checksum?: string,
  env: NodeJS.ProcessEnv = process.env
) {
  return buildStorageObjectRef(relativePath, getAssetStorageInfo(env), checksum);
}

export function getAssetStorageInfo(env: NodeJS.ProcessEnv = process.env): AssetStorageInfo {
  const backend = resolveAssetStorageBackend(env);
  const scope = resolveAssetStorageScope(env);

  if (backend === 'filesystem') {
    return {
      backend,
      scope,
      root: getManagedAssetRoot(env),
    };
  }

  return {
    backend,
    scope,
    storeName: resolveAssetBlobStoreName(env),
  };
}

export async function getAssetStorageStatus(): Promise<AssetStorageStatus> {
  const info = getAssetStorageInfo();

  try {
    if (info.backend === 'filesystem' && info.root) {
      await fs.mkdir(info.root, { recursive: true });
      await fs.access(info.root);
    } else {
      const store = resolveBlobStore(info);
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

export function resolveAssetVirtualFileNameForStorage(storage: StorageObjectRef): string {
  const normalized = assertValidAssetStorageRelativePath(storage.key);
  if (storage.backend === 'filesystem') {
    const root = storage.root ? path.resolve(storage.root) : getManagedAssetRoot();
    return path.resolve(root, normalized);
  }

  return path.posix.join('download/assets', normalized);
}

export function buildAssetVirtualFileName(
  relativePath: string,
  env: NodeJS.ProcessEnv = process.env
) {
  return resolveAssetVirtualFileNameForStorage(
    createStorageRefForCurrentBackend(relativePath, undefined, env)
  );
}

export async function getStoredAssetBinary(
  relativePathOrStorage: string | StorageObjectRef
): Promise<StoredAssetBinaryRecord | null> {
  const storage =
    typeof relativePathOrStorage === 'string'
      ? createStorageRefForCurrentBackend(relativePathOrStorage)
      : {
          ...relativePathOrStorage,
          key: assertValidAssetStorageRelativePath(relativePathOrStorage.key),
        };

  if (storage.backend === 'filesystem') {
    return getLocalAssetBinary(storage.key, storage);
  }

  return getBlobAssetBinary(storage.key, storage);
}

export async function putStoredAssetBinary(
  input: UpsertStoredAssetBinaryInput
): Promise<StoredAssetBinaryRecord> {
  const normalized = assertValidAssetStorageRelativePath(input.relativePath);
  const storage = createStorageRefForCurrentBackend(normalized, input.checksum);
  const contentType = input.contentType || getAssetMimeType(normalized);

  if (storage.backend === 'filesystem') {
    return putLocalAssetBinary(normalized, input.data, contentType, storage);
  }

  return putBlobAssetBinary(normalized, input.data, contentType, storage);
}

export async function deleteStoredAssetBinary(
  relativePathOrStorage: string | StorageObjectRef
): Promise<void> {
  const storage =
    typeof relativePathOrStorage === 'string'
      ? createStorageRefForCurrentBackend(relativePathOrStorage)
      : {
          ...relativePathOrStorage,
          key: assertValidAssetStorageRelativePath(relativePathOrStorage.key),
        };

  if (storage.backend === 'filesystem') {
    await deleteLocalAssetBinary(storage.key, storage);
    return;
  }

  await deleteBlobAssetBinary(storage.key, storage);
}

async function listLocalAssetFilesRecursive(
  root: string,
  currentRelative = ''
): Promise<StoredAssetBinaryRecord[]> {
  const currentPath = path.join(root, currentRelative);
  const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch((error) => {
    if (isFsError(error, 'ENOENT')) return [];
    throw error;
  });
  const items: StoredAssetBinaryRecord[] = [];

  for (const entry of entries) {
    const relativePath = currentRelative
      ? path.posix.join(currentRelative.replace(/\\/g, '/'), entry.name)
      : entry.name;

    if (entry.isDirectory()) {
      items.push(...(await listLocalAssetFilesRecursive(root, relativePath)));
      continue;
    }

    const loaded = await getLocalAssetBinary(relativePath, {
      key: relativePath,
      backend: 'filesystem',
      scope: 'filesystem',
      root,
    });
    if (loaded) {
      items.push(loaded);
    }
  }

  return items;
}

async function listBlobAssetFiles(): Promise<StoredAssetBinaryRecord[]> {
  const info = getAssetStorageInfo();
  const store = resolveBlobStore(info);
  const result = await store.list();
  const items = await Promise.all(
    result.blobs.map(async (blob) => {
      const storage = buildStorageObjectRef(blob.key, info);
      return getBlobAssetBinary(blob.key, storage);
    })
  );
  return items.filter((item): item is StoredAssetBinaryRecord => Boolean(item));
}

export const assetBinaryStorageAdapter: StorageAdapter<
  StoredAssetBinaryRecord,
  UpsertStoredAssetBinaryInput
> = {
  getInfo: getAssetStorageInfo,
  getStatus: getAssetStorageStatus,
  list: async () => {
    const info = getAssetStorageInfo();
    if (info.backend === 'filesystem' && info.root) {
      return listLocalAssetFilesRecursive(info.root);
    }
    return listBlobAssetFiles();
  },
  get: async (key) => getStoredAssetBinary(key),
  put: putStoredAssetBinary,
  delete: async (key) => deleteStoredAssetBinary(key),
  resolveVirtualFileName: buildAssetVirtualFileName,
};
