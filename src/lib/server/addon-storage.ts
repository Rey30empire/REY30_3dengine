import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { getDeployStore, getStore } from '@netlify/blobs';
import {
  assertValidAddonRelativePath,
  getAddonsRoot,
  normalizeAddonFileName,
  normalizeAddonId,
  resolveAddonBlobStoreName,
  resolveAddonStorageBackend,
  resolveAddonStorageScope,
  type AddonStorageBackend,
  type AddonStorageScope,
} from '@/app/api/addons/shared';
import type { Addon, AddonPermission } from '@/types/engine';
import type {
  StorageAdapter,
  StorageAdapterInfo,
  StorageAdapterStatus,
  StorageObjectRef,
} from '@/lib/server/storage-adapter';
import { getStoredPackage, listStoredPackages, type StoredPackageRecord } from '@/lib/server/package-storage';

export type AddonCategory =
  | 'animation'
  | 'modeling'
  | 'materials'
  | 'scripting'
  | 'ai'
  | 'workflow'
  | 'runtime'
  | 'general';

export interface StoredAddonManifest extends Addon {
  category: AddonCategory;
  workspaceHints: string[];
  installedAt: string;
  updatedAt: string;
  checksum: string;
  sourcePackagePath: string | null;
  assetCount: number;
  storageLocation: AddonStorageBackend;
}

interface StoredAddonDocument {
  version: 1;
  relativePath: string;
  manifest: StoredAddonManifest;
}

export interface StoredAddonRecord {
  name: string;
  relativePath: string;
  filePath: string;
  size: number;
  modifiedAt: string;
  addon: StoredAddonManifest;
  storage: StorageObjectRef;
}

export interface AddonStorageInfo extends StorageAdapterInfo {
  backend: AddonStorageBackend;
  scope: AddonStorageScope;
}

export interface AddonStorageStatus extends StorageAdapterStatus, AddonStorageInfo {}

export interface UpsertStoredAddonInput {
  id?: string;
  name?: string;
  version?: string;
  author?: string;
  description?: string;
  enabled?: boolean;
  entryPoint?: string;
  dependencies?: string[];
  permissions?: AddonPermission[];
  category?: AddonCategory;
  workspaceHints?: string[];
  sourcePackagePath?: string | null;
}

const VALID_PERMISSIONS: AddonPermission[] = [
  'filesystem',
  'network',
  'rendering',
  'scene',
  'assets',
  'ai',
];

function isFsError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function checksumForManifest(manifest: Omit<StoredAddonManifest, 'checksum'>): string {
  return crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

function sanitizePermissionList(input: unknown): AddonPermission[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is AddonPermission =>
    typeof item === 'string' && VALID_PERMISSIONS.includes(item as AddonPermission)
  );
}

function sanitizeStringList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCategory(input: unknown): AddonCategory {
  switch (input) {
    case 'animation':
    case 'modeling':
    case 'materials':
    case 'scripting':
    case 'ai':
    case 'workflow':
    case 'runtime':
      return input;
    default:
      return 'general';
  }
}

function inferCategoryFromPackage(pkg: StoredPackageRecord | null): AddonCategory {
  const kinds = pkg?.package.kinds ?? [];
  if (kinds.includes('animation')) return 'animation';
  if (kinds.includes('scene')) return 'workflow';
  if (kinds.includes('script')) return 'scripting';
  if (kinds.includes('texture')) return 'materials';
  if (kinds.includes('model') || kinds.includes('character')) return 'modeling';
  return 'general';
}

function inferWorkspaceHints(
  category: AddonCategory,
  pkg: StoredPackageRecord | null,
  explicit: string[]
): string[] {
  if (explicit.length > 0) {
    return Array.from(new Set(explicit));
  }

  const hints = new Set<string>();
  const kinds = pkg?.package.kinds ?? [];
  if (category === 'animation' || kinds.includes('animation')) hints.add('animation');
  if (category === 'modeling' || kinds.includes('character') || kinds.includes('model')) {
    hints.add('modeling');
    hints.add('scene');
  }
  if (category === 'materials' || kinds.includes('texture')) hints.add('materials');
  if (category === 'scripting' || kinds.includes('script')) hints.add('scripting');
  if (category === 'ai') hints.add('scripting');
  if (hints.size === 0) hints.add('scene');
  return Array.from(hints);
}

function inferPermissions(
  category: AddonCategory,
  pkg: StoredPackageRecord | null,
  explicit: AddonPermission[]
): AddonPermission[] {
  const permissions = new Set<AddonPermission>(explicit);
  const kinds = pkg?.package.kinds ?? [];
  if (kinds.length > 0) permissions.add('assets');
  if (category === 'animation' || category === 'modeling' || category === 'workflow') {
    permissions.add('scene');
  }
  if (category === 'materials') {
    permissions.add('rendering');
    permissions.add('assets');
  }
  if (category === 'scripting') {
    permissions.add('scene');
    permissions.add('assets');
  }
  if (category === 'ai') {
    permissions.add('ai');
    permissions.add('assets');
  }
  return Array.from(permissions);
}

function parseStoredAddonDocument(
  relativePath: string,
  raw: unknown,
  info: AddonStorageInfo
): StoredAddonDocument | null {
  if (!raw || typeof raw !== 'object' || !('manifest' in raw)) return null;
  const manifestRaw = (raw as { manifest?: unknown }).manifest;
  if (!manifestRaw || typeof manifestRaw !== 'object') {
    throw new Error(`Corrupted addon document at ${relativePath}`);
  }

  const value = manifestRaw as Partial<StoredAddonManifest>;
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.version !== 'string' ||
    typeof value.author !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.enabled !== 'boolean' ||
    typeof value.entryPoint !== 'string'
  ) {
    throw new Error(`Corrupted addon document at ${relativePath}`);
  }

  const manifestBase = {
    id: normalizeAddonId(value.id),
    name: value.name,
    version: value.version,
    author: value.author,
    description: value.description,
    enabled: value.enabled,
    entryPoint: value.entryPoint,
    dependencies: sanitizeStringList(value.dependencies),
    permissions: sanitizePermissionList(value.permissions),
    category: normalizeCategory(value.category),
    workspaceHints: sanitizeStringList(value.workspaceHints),
    installedAt:
      typeof value.installedAt === 'string' && value.installedAt
        ? value.installedAt
        : new Date(0).toISOString(),
    updatedAt:
      typeof value.updatedAt === 'string' && value.updatedAt
        ? value.updatedAt
        : new Date(0).toISOString(),
    sourcePackagePath:
      typeof value.sourcePackagePath === 'string' && value.sourcePackagePath.trim().length > 0
        ? value.sourcePackagePath.trim()
        : null,
    assetCount: typeof value.assetCount === 'number' && Number.isFinite(value.assetCount) ? value.assetCount : 0,
    storageLocation:
      value.storageLocation === 'filesystem' || value.storageLocation === 'netlify-blobs'
        ? value.storageLocation
        : info.backend,
  } satisfies Omit<StoredAddonManifest, 'checksum'>;

  return {
    version: 1,
    relativePath,
    manifest: {
      ...manifestBase,
      checksum:
        typeof value.checksum === 'string' && value.checksum
          ? value.checksum
          : checksumForManifest(manifestBase),
    },
  };
}

function serializeDocument(document: StoredAddonDocument): string {
  return JSON.stringify(document, null, 2);
}

function toStoredAddonRecord(params: {
  relativePath: string;
  document: StoredAddonDocument;
  size: number;
  modifiedAt: string;
  info: AddonStorageInfo;
}): StoredAddonRecord {
  return {
    name: path.posix.basename(params.relativePath),
    relativePath: params.relativePath,
    filePath: resolveAddonVirtualFileName(params.relativePath),
    size: params.size,
    modifiedAt: params.modifiedAt,
    addon: params.document.manifest,
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

async function listLocalAddonsRecursive(root: string, currentRelative = ''): Promise<StoredAddonRecord[]> {
  const currentPath = path.join(root, currentRelative);
  const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch((error) => {
    if (isFsError(error, 'ENOENT')) return [];
    throw error;
  });
  const addons: StoredAddonRecord[] = [];
  const info = getAddonStorageInfo();

  for (const entry of entries) {
    const relativePath = currentRelative
      ? path.posix.join(currentRelative.replace(/\\/g, '/'), entry.name)
      : entry.name;

    if (entry.isDirectory()) {
      const nested = await listLocalAddonsRecursive(root, relativePath);
      addons.push(...nested);
      continue;
    }

    if (!entry.name.endsWith('.addon.json')) continue;

    const absolutePath = path.resolve(root, relativePath);
    const [raw, stats] = await Promise.all([fs.readFile(absolutePath, 'utf8'), fs.stat(absolutePath)]);
    const document = parseStoredAddonDocument(relativePath, JSON.parse(raw), info);
    if (!document) continue;

    addons.push(
      toStoredAddonRecord({
        relativePath,
        document,
        size: Buffer.byteLength(raw, 'utf8'),
        modifiedAt: stats.mtime.toISOString(),
        info,
      })
    );
  }

  return addons;
}

async function getLocalAddon(relativePath: string): Promise<StoredAddonRecord | null> {
  const info = getAddonStorageInfo();
  const root = getAddonsRoot();
  const absolutePath = path.resolve(root, relativePath);

  try {
    const [raw, stats] = await Promise.all([fs.readFile(absolutePath, 'utf8'), fs.stat(absolutePath)]);
    const document = parseStoredAddonDocument(relativePath, JSON.parse(raw), info);
    if (!document) return null;
    return toStoredAddonRecord({
      relativePath,
      document,
      size: Buffer.byteLength(raw, 'utf8'),
      modifiedAt: stats.mtime.toISOString(),
      info,
    });
  } catch (error) {
    if (isFsError(error, 'ENOENT')) return null;
    throw error;
  }
}

async function putLocalAddon(relativePath: string, document: StoredAddonDocument): Promise<StoredAddonRecord> {
  const info = getAddonStorageInfo();
  const root = getAddonsRoot();
  const absolutePath = path.resolve(root, relativePath);
  const serialized = serializeDocument(document);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, serialized, 'utf8');
  const stats = await fs.stat(absolutePath);
  return toStoredAddonRecord({
    relativePath,
    document,
    size: Buffer.byteLength(serialized, 'utf8'),
    modifiedAt: stats.mtime.toISOString(),
    info,
  });
}

async function deleteLocalAddon(relativePath: string): Promise<void> {
  const absolutePath = path.resolve(getAddonsRoot(), relativePath);
  await fs.unlink(absolutePath);
}

function resolveBlobStore() {
  const info = getAddonStorageInfo();
  if (info.backend !== 'netlify-blobs' || !info.storeName) {
    throw new Error('Addon storage backend is not configured for Netlify Blobs.');
  }

  return info.scope === 'global' ? getStore(info.storeName) : getDeployStore(info.storeName);
}

async function getBlobAddon(relativePath: string): Promise<StoredAddonRecord | null> {
  const info = getAddonStorageInfo();
  const store = resolveBlobStore();
  const raw = await store.get(relativePath, { type: 'json' });
  const document = parseStoredAddonDocument(relativePath, raw, info);
  if (!document) return null;
  const serialized = serializeDocument(document);
  return toStoredAddonRecord({
    relativePath,
    document,
    size: Buffer.byteLength(serialized, 'utf8'),
    modifiedAt: document.manifest.updatedAt,
    info,
  });
}

async function putBlobAddon(relativePath: string, document: StoredAddonDocument): Promise<StoredAddonRecord> {
  const info = getAddonStorageInfo();
  const store = resolveBlobStore();
  await store.setJSON(relativePath, document);
  const serialized = serializeDocument(document);
  return toStoredAddonRecord({
    relativePath,
    document,
    size: Buffer.byteLength(serialized, 'utf8'),
    modifiedAt: document.manifest.updatedAt,
    info,
  });
}

async function deleteBlobAddon(relativePath: string): Promise<void> {
  const store = resolveBlobStore();
  await store.delete(relativePath);
}

export function getAddonStorageInfo(env: NodeJS.ProcessEnv = process.env): AddonStorageInfo {
  const backend = resolveAddonStorageBackend(env);
  const scope = resolveAddonStorageScope(env);

  if (backend === 'filesystem') {
    return {
      backend,
      scope,
      root: getAddonsRoot(env),
    };
  }

  return {
    backend,
    scope,
    storeName: resolveAddonBlobStoreName(env),
  };
}

export async function getAddonStorageStatus(): Promise<AddonStorageStatus> {
  const info = getAddonStorageInfo();

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

export function resolveAddonVirtualFileName(relativePath: string): string {
  const normalized = assertValidAddonRelativePath(relativePath);
  const info = getAddonStorageInfo();
  if (info.backend === 'filesystem' && info.root) {
    return path.resolve(info.root, normalized);
  }

  return path.posix.join('addons', normalized);
}

export async function listStoredAddons(): Promise<StoredAddonRecord[]> {
  const info = getAddonStorageInfo();

  if (info.backend === 'filesystem' && info.root) {
    return listLocalAddonsRecursive(info.root);
  }

  const store = resolveBlobStore();
  const result = await store.list();
  const records = await Promise.all(
    result.blobs
      .filter((blob) => blob.key.endsWith('.addon.json'))
      .map((blob) => getBlobAddon(blob.key))
  );
  return records.filter((record): record is StoredAddonRecord => Boolean(record));
}

export async function getStoredAddon(idOrRelativePath: string): Promise<StoredAddonRecord | null> {
  const candidate = idOrRelativePath.endsWith('.addon.json')
    ? idOrRelativePath
    : normalizeAddonFileName(idOrRelativePath);
  const normalized = assertValidAddonRelativePath(candidate);
  const info = getAddonStorageInfo();

  if (info.backend === 'filesystem') {
    return getLocalAddon(normalized);
  }

  return getBlobAddon(normalized);
}

export async function listAddonInstallSources(): Promise<StoredPackageRecord[]> {
  return listStoredPackages();
}

export async function upsertStoredAddon(input: UpsertStoredAddonInput): Promise<StoredAddonRecord> {
  const info = getAddonStorageInfo();
  const sourcePackage =
    typeof input.sourcePackagePath === 'string' && input.sourcePackagePath.trim().length > 0
      ? await getStoredPackage(input.sourcePackagePath.trim())
      : null;

  if (input.sourcePackagePath && !sourcePackage) {
    throw new Error(`No se encontró el paquete ${input.sourcePackagePath}`);
  }

  const manifestId = normalizeAddonId(input.id || input.name || sourcePackage?.package.name || 'addon');
  const relativePath = assertValidAddonRelativePath(normalizeAddonFileName(manifestId));
  const previous = await getStoredAddon(relativePath);
  const now = new Date().toISOString();
  const category = input.category || inferCategoryFromPackage(sourcePackage);
  const workspaceHints = inferWorkspaceHints(category, sourcePackage, sanitizeStringList(input.workspaceHints));
  const permissions = inferPermissions(category, sourcePackage, sanitizePermissionList(input.permissions));
  const name = (input.name || sourcePackage?.package.name || manifestId).trim();
  const manifestBase = {
    id: manifestId,
    name,
    version: (input.version || previous?.addon.version || '1.0.0').trim(),
    author: (input.author || previous?.addon.author || 'Local Owner').trim(),
    description:
      (input.description ||
        previous?.addon.description ||
        (sourcePackage
          ? `Addon instalado desde el paquete ${sourcePackage.package.name}.`
          : `Addon local ${name}.`)).trim(),
    enabled: typeof input.enabled === 'boolean' ? input.enabled : previous?.addon.enabled ?? true,
    entryPoint:
      (input.entryPoint ||
        previous?.addon.entryPoint ||
        sourcePackage?.filePath ||
        relativePath).trim(),
    dependencies:
      sanitizeStringList(input.dependencies).length > 0
        ? sanitizeStringList(input.dependencies)
        : previous?.addon.dependencies ?? [],
    permissions,
    category,
    workspaceHints,
    installedAt: previous?.addon.installedAt ?? now,
    updatedAt: now,
    sourcePackagePath: sourcePackage?.relativePath ?? previous?.addon.sourcePackagePath ?? null,
    assetCount: sourcePackage?.package.assets.length ?? previous?.addon.assetCount ?? 0,
    storageLocation: info.backend,
  } satisfies Omit<StoredAddonManifest, 'checksum'>;

  const document: StoredAddonDocument = {
    version: 1,
    relativePath,
    manifest: {
      ...manifestBase,
      checksum: checksumForManifest(manifestBase),
    },
  };

  if (info.backend === 'filesystem') {
    return putLocalAddon(relativePath, document);
  }

  return putBlobAddon(relativePath, document);
}

export async function setStoredAddonEnabled(id: string, enabled: boolean): Promise<StoredAddonRecord> {
  const existing = await getStoredAddon(id);
  if (!existing) {
    throw new Error(`No se encontró el addon ${id}`);
  }

  return upsertStoredAddon({
    id: existing.addon.id,
    name: existing.addon.name,
    version: existing.addon.version,
    author: existing.addon.author,
    description: existing.addon.description,
    enabled,
    entryPoint: existing.addon.entryPoint,
    dependencies: existing.addon.dependencies,
    permissions: existing.addon.permissions,
    category: existing.addon.category,
    workspaceHints: existing.addon.workspaceHints,
    sourcePackagePath: existing.addon.sourcePackagePath,
  });
}

export async function deleteStoredAddon(idOrRelativePath: string): Promise<void> {
  const candidate = idOrRelativePath.endsWith('.addon.json')
    ? idOrRelativePath
    : normalizeAddonFileName(idOrRelativePath);
  const normalized = assertValidAddonRelativePath(candidate);
  const info = getAddonStorageInfo();

  if (info.backend === 'filesystem') {
    return deleteLocalAddon(normalized);
  }

  return deleteBlobAddon(normalized);
}

export const addonStorageAdapter: StorageAdapter<StoredAddonRecord, UpsertStoredAddonInput> = {
  getInfo: getAddonStorageInfo,
  getStatus: getAddonStorageStatus,
  list: listStoredAddons,
  get: getStoredAddon,
  put: upsertStoredAddon,
  delete: deleteStoredAddon,
  resolveVirtualFileName: resolveAddonVirtualFileName,
};
