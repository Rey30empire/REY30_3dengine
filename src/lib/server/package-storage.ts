import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { getDeployStore, getStore } from '@netlify/blobs';
import {
  assertValidPackageRelativePath,
  getPackagesRoot,
  normalizePackageFileName,
  resolvePackageBlobStoreName,
  resolvePackageStorageBackend,
  resolvePackageStorageScope,
  type PackageStorageBackend,
  type PackageStorageScope,
} from '@/app/api/packages/shared';
import type {
  StorageAdapter,
  StorageAdapterInfo,
  StorageAdapterStatus,
  StorageObjectRef,
} from '@/lib/server/storage-adapter';

export type PackageAsset = { id: string; name: string; type: string; path: string };

export interface StoredPackageManifest {
  name: string;
  kinds: string[];
  assets: PackageAsset[];
  createdAt: string;
  updatedAt: string;
  version: number;
  checksum: string;
  storageLocation: PackageStorageBackend;
}

interface StoredPackageBlobDocument {
  version: 2;
  relativePath: string;
  manifest: StoredPackageManifest;
}

type LegacyPackageDocument = {
  name?: unknown;
  kinds?: unknown;
  assets?: unknown;
  createdAt?: unknown;
  version?: unknown;
};

export interface StoredPackageRecord {
  name: string;
  relativePath: string;
  filePath: string;
  size: number;
  modifiedAt: string;
  package: StoredPackageManifest;
  storage: StorageObjectRef;
}

export interface PackageStorageInfo extends StorageAdapterInfo {
  backend: PackageStorageBackend;
  scope: PackageStorageScope;
}

export interface PackageStorageStatus extends StorageAdapterStatus, PackageStorageInfo {}

export interface UpsertStoredPackageInput {
  name: string;
  kinds?: string[];
  assets?: PackageAsset[];
}

function isFsError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function checksumForManifest(
  manifest: Omit<StoredPackageManifest, 'checksum'>
): string {
  return crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

function normalizePackageAsset(input: unknown): PackageAsset | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Partial<PackageAsset>;
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.type !== 'string' ||
    typeof value.path !== 'string'
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    type: value.type,
    path: value.path,
  };
}

function parseLegacyManifest(
  relativePath: string,
  raw: LegacyPackageDocument,
  storageLocation: PackageStorageBackend
): StoredPackageManifest | null {
  const packageName =
    typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : path.posix.basename(relativePath, '.package.json');
  const kinds = Array.isArray(raw.kinds)
    ? raw.kinds.filter((item): item is string => typeof item === 'string')
    : [];
  const assets = Array.isArray(raw.assets)
    ? raw.assets
        .map((item) => normalizePackageAsset(item))
        .filter((item): item is PackageAsset => Boolean(item))
    : [];
  const createdAt =
    typeof raw.createdAt === 'string' && raw.createdAt
      ? raw.createdAt
      : new Date(0).toISOString();
  const version = typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 1;
  const manifestBase = {
    name: packageName,
    kinds,
    assets,
    createdAt,
    updatedAt: createdAt,
    version,
    storageLocation,
  } satisfies Omit<StoredPackageManifest, 'checksum'>;

  return {
    ...manifestBase,
    checksum: checksumForManifest(manifestBase),
  };
}

function parseStoredPackageDocument(
  relativePath: string,
  raw: unknown,
  info: PackageStorageInfo
): StoredPackageBlobDocument | null {
  if (!raw || typeof raw !== 'object') return null;

  if ('manifest' in raw) {
    const manifestValue = (raw as { manifest?: unknown }).manifest;
    if (!manifestValue || typeof manifestValue !== 'object') {
      throw new Error(`Corrupted package blob at ${relativePath}`);
    }

    const manifestRaw = manifestValue as Partial<StoredPackageManifest>;
    if (
      typeof manifestRaw.name !== 'string' ||
      !Array.isArray(manifestRaw.kinds) ||
      !Array.isArray(manifestRaw.assets) ||
      typeof manifestRaw.createdAt !== 'string' ||
      typeof manifestRaw.updatedAt !== 'string' ||
      typeof manifestRaw.version !== 'number'
    ) {
      throw new Error(`Corrupted package blob at ${relativePath}`);
    }

    const assets = manifestRaw.assets
      .map((item) => normalizePackageAsset(item))
      .filter((item): item is PackageAsset => Boolean(item));
    const manifestBase = {
      name: manifestRaw.name,
      kinds: manifestRaw.kinds.filter((item): item is string => typeof item === 'string'),
      assets,
      createdAt: manifestRaw.createdAt,
      updatedAt: manifestRaw.updatedAt,
      version: manifestRaw.version,
      storageLocation:
        manifestRaw.storageLocation === 'filesystem' || manifestRaw.storageLocation === 'netlify-blobs'
          ? manifestRaw.storageLocation
          : info.backend,
    } satisfies Omit<StoredPackageManifest, 'checksum'>;

    return {
      version: 2,
      relativePath,
      manifest: {
        ...manifestBase,
        checksum:
          typeof manifestRaw.checksum === 'string' && manifestRaw.checksum
            ? manifestRaw.checksum
            : checksumForManifest(manifestBase),
      },
    };
  }

  const legacy = parseLegacyManifest(relativePath, raw as LegacyPackageDocument, info.backend);
  if (!legacy) return null;

  return {
    version: 2,
    relativePath,
    manifest: legacy,
  };
}

function serializeDocument(document: StoredPackageBlobDocument): string {
  return JSON.stringify(document, null, 2);
}

function normalizeStoredPackageManifest(
  manifest: StoredPackageManifest,
  backend: PackageStorageBackend
): StoredPackageManifest {
  const manifestBase = {
    ...manifest,
    storageLocation:
      manifest.storageLocation === 'filesystem' || manifest.storageLocation === 'netlify-blobs'
        ? manifest.storageLocation
        : backend,
  };

  return {
    ...manifestBase,
    checksum:
      typeof manifest.checksum === 'string' && manifest.checksum
        ? manifest.checksum
        : checksumForManifest({
            name: manifestBase.name,
            kinds: manifestBase.kinds,
            assets: manifestBase.assets,
            createdAt: manifestBase.createdAt,
            updatedAt: manifestBase.updatedAt,
            version: manifestBase.version,
            storageLocation: manifestBase.storageLocation,
          }),
  };
}

function resolveBlobStore() {
  const info = getPackageStorageInfo();
  if (info.backend !== 'netlify-blobs' || !info.storeName) {
    throw new Error('Package storage backend is not configured for Netlify Blobs.');
  }

  return info.scope === 'global' ? getStore(info.storeName) : getDeployStore(info.storeName);
}

function toStoredPackageRecord(params: {
  relativePath: string;
  document: StoredPackageBlobDocument;
  size: number;
  modifiedAt: string;
  info: PackageStorageInfo;
}): StoredPackageRecord {
  return {
    name: path.posix.basename(params.relativePath),
    relativePath: params.relativePath,
    filePath: resolvePackageVirtualFileName(params.relativePath),
    size: params.size,
    modifiedAt: params.modifiedAt,
    package: params.document.manifest,
    storage: {
      key: params.relativePath,
      backend: params.info.backend,
      scope: params.info.scope,
      root: params.info.root,
      storeName: params.info.storeName,
      checksum: params.document.manifest.checksum,
    },
  };
}

async function listLocalPackagesRecursive(
  root: string,
  currentRelative = ''
): Promise<StoredPackageRecord[]> {
  const currentPath = path.join(root, currentRelative);
  const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch((error) => {
    if (isFsError(error, 'ENOENT')) return [];
    throw error;
  });
  const packages: StoredPackageRecord[] = [];
  const info = getPackageStorageInfo();

  for (const entry of entries) {
    const relativePath = currentRelative
      ? path.posix.join(currentRelative.replace(/\\/g, '/'), entry.name)
      : entry.name;

    if (entry.isDirectory()) {
      const nested = await listLocalPackagesRecursive(root, relativePath);
      packages.push(...nested);
      continue;
    }

    if (!entry.name.endsWith('.package.json')) continue;

    const absolutePath = path.resolve(root, relativePath);
    const [raw, stats] = await Promise.all([fs.readFile(absolutePath, 'utf8'), fs.stat(absolutePath)]);
    const document = parseStoredPackageDocument(relativePath, JSON.parse(raw), info);
    if (!document) continue;

    packages.push(
      toStoredPackageRecord({
        relativePath,
        document,
        size: Buffer.byteLength(raw, 'utf8'),
        modifiedAt: stats.mtime.toISOString(),
        info,
      })
    );
  }

  return packages;
}

async function getLocalPackage(relativePath: string): Promise<StoredPackageRecord | null> {
  const info = getPackageStorageInfo();
  const root = getPackagesRoot();
  const absolutePath = path.resolve(root, relativePath);

  try {
    const [raw, stats] = await Promise.all([fs.readFile(absolutePath, 'utf8'), fs.stat(absolutePath)]);
    const document = parseStoredPackageDocument(relativePath, JSON.parse(raw), info);
    if (!document) return null;
    return toStoredPackageRecord({
      relativePath,
      document,
      size: Buffer.byteLength(raw, 'utf8'),
      modifiedAt: stats.mtime.toISOString(),
      info,
    });
  } catch (error) {
    if (isFsError(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
}

async function putLocalPackage(
  relativePath: string,
  document: StoredPackageBlobDocument
): Promise<StoredPackageRecord> {
  const info = getPackageStorageInfo();
  const root = getPackagesRoot();
  const absolutePath = path.resolve(root, relativePath);
  const serialized = serializeDocument(document);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, serialized, 'utf8');
  const stats = await fs.stat(absolutePath);
  return toStoredPackageRecord({
    relativePath,
    document,
    size: Buffer.byteLength(serialized, 'utf8'),
    modifiedAt: stats.mtime.toISOString(),
    info,
  });
}

async function deleteLocalPackage(relativePath: string): Promise<void> {
  const root = getPackagesRoot();
  const absolutePath = path.resolve(root, relativePath);
  await fs.unlink(absolutePath);
}

async function getBlobPackage(relativePath: string): Promise<StoredPackageRecord | null> {
  const info = getPackageStorageInfo();
  const store = resolveBlobStore();
  const raw = await store.get(relativePath, { type: 'json' });
  const document = parseStoredPackageDocument(relativePath, raw, info);
  if (!document) return null;
  const serialized = serializeDocument(document);
  return toStoredPackageRecord({
    relativePath,
    document,
    size: Buffer.byteLength(serialized, 'utf8'),
    modifiedAt: document.manifest.updatedAt,
    info,
  });
}

async function putBlobPackage(
  relativePath: string,
  document: StoredPackageBlobDocument
): Promise<StoredPackageRecord> {
  const info = getPackageStorageInfo();
  const store = resolveBlobStore();
  await store.setJSON(relativePath, document);
  const serialized = serializeDocument(document);
  return toStoredPackageRecord({
    relativePath,
    document,
    size: Buffer.byteLength(serialized, 'utf8'),
    modifiedAt: document.manifest.updatedAt,
    info,
  });
}

async function deleteBlobPackage(relativePath: string): Promise<void> {
  const store = resolveBlobStore();
  await store.delete(relativePath);
}

export function getPackageStorageInfo(
  env: NodeJS.ProcessEnv = process.env
): PackageStorageInfo {
  const backend = resolvePackageStorageBackend(env);
  const scope = resolvePackageStorageScope(env);

  if (backend === 'filesystem') {
    return {
      backend,
      scope,
      root: getPackagesRoot(env),
    };
  }

  return {
    backend,
    scope,
    storeName: resolvePackageBlobStoreName(env),
  };
}

export async function getPackageStorageStatus(): Promise<PackageStorageStatus> {
  const info = getPackageStorageInfo();

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

export function resolvePackageVirtualFileName(relativePath: string): string {
  const normalized = assertValidPackageRelativePath(relativePath);
  const info = getPackageStorageInfo();
  if (info.backend === 'filesystem' && info.root) {
    return path.resolve(info.root, normalized);
  }

  return path.posix.join('packages', normalized);
}

export async function listStoredPackages(): Promise<StoredPackageRecord[]> {
  const info = getPackageStorageInfo();

  if (info.backend === 'filesystem' && info.root) {
    return listLocalPackagesRecursive(info.root);
  }

  const store = resolveBlobStore();
  const result = await store.list();
  const records = await Promise.all(
    result.blobs
      .filter((blob) => blob.key.endsWith('.package.json'))
      .map((blob) => getBlobPackage(blob.key))
  );

  return records.filter((record): record is StoredPackageRecord => Boolean(record));
}

export async function getStoredPackage(relativePath: string): Promise<StoredPackageRecord | null> {
  const normalized = assertValidPackageRelativePath(relativePath);
  const info = getPackageStorageInfo();

  if (info.backend === 'filesystem') {
    return getLocalPackage(normalized);
  }

  return getBlobPackage(normalized);
}

export async function upsertStoredPackage(
  input: UpsertStoredPackageInput
): Promise<StoredPackageRecord> {
  const info = getPackageStorageInfo();
  const relativePath = assertValidPackageRelativePath(normalizePackageFileName(input.name));
  const createdAt = new Date().toISOString();
  const manifestBase = {
    name: path.posix.basename(relativePath, '.package.json'),
    kinds: Array.isArray(input.kinds) ? input.kinds.filter((item): item is string => typeof item === 'string') : [],
    assets: Array.isArray(input.assets)
      ? input.assets
          .map((item) => normalizePackageAsset(item))
          .filter((item): item is PackageAsset => Boolean(item))
      : [],
    createdAt,
    updatedAt: createdAt,
    version: 2,
    storageLocation: info.backend,
  } satisfies Omit<StoredPackageManifest, 'checksum'>;
  const document: StoredPackageBlobDocument = {
    version: 2,
    relativePath,
    manifest: {
      ...manifestBase,
      checksum: checksumForManifest(manifestBase),
    },
  };

  if (info.backend === 'filesystem') {
    return putLocalPackage(relativePath, document);
  }

  return putBlobPackage(relativePath, document);
}

export async function deleteStoredPackage(relativePath: string): Promise<void> {
  const normalized = assertValidPackageRelativePath(relativePath);
  const info = getPackageStorageInfo();

  if (info.backend === 'filesystem') {
    return deleteLocalPackage(normalized);
  }

  return deleteBlobPackage(normalized);
}

export function createStoredPackageDocument(params: {
  relativePath: string;
  manifest: StoredPackageManifest;
}): StoredPackageBlobDocument {
  const normalized = assertValidPackageRelativePath(params.relativePath);
  const backend = getPackageStorageInfo().backend;
  return {
    version: 2,
    relativePath: normalized,
    manifest: normalizeStoredPackageManifest(params.manifest, backend),
  };
}

export function serializeStoredPackageDocument(document: {
  relativePath: string;
  manifest: StoredPackageManifest;
}): string {
  return serializeDocument(createStoredPackageDocument(document));
}

export async function restoreStoredPackageDocument(params: {
  relativePath: string;
  manifest: StoredPackageManifest;
}): Promise<StoredPackageRecord> {
  const info = getPackageStorageInfo();
  const document = createStoredPackageDocument(params);
  if (info.backend === 'filesystem') {
    return putLocalPackage(document.relativePath, document);
  }

  return putBlobPackage(document.relativePath, document);
}

export const packageStorageAdapter: StorageAdapter<
  StoredPackageRecord,
  UpsertStoredPackageInput
> = {
  getInfo: getPackageStorageInfo,
  getStatus: getPackageStorageStatus,
  list: listStoredPackages,
  get: getStoredPackage,
  put: upsertStoredPackage,
  delete: deleteStoredPackage,
  resolveVirtualFileName: resolvePackageVirtualFileName,
};
