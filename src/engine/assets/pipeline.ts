// ============================================
// Asset Pipeline - Import, normalize, version
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  getAssetSystemRoot,
  getAssetSystemStatePath,
  getLegacyAssetSystemStatePath,
  readJsonFileAtPath,
  runAssetSystemMutation,
  writeJsonFileAtomic,
} from '@/lib/server/asset-system-storage';
import {
  putStoredAssetBinary,
  type StoredAssetBinaryRecord,
} from '@/lib/server/asset-storage';
import type { StorageObjectRef } from '@/lib/server/storage-adapter';
import { fetchRemoteBytes } from '@/lib/security/remote-fetch';

export type PipelineAssetType =
  | 'mesh'
  | 'texture'
  | 'material'
  | 'modifier_preset'
  | 'character_preset'
  | 'audio'
  | 'video'
  | 'script'
  | 'prefab'
  | 'scene'
  | 'animation'
  | 'font'
  | 'other';

const PIPELINE_ASSET_TYPES: PipelineAssetType[] = [
  'mesh',
  'texture',
  'material',
  'modifier_preset',
  'character_preset',
  'audio',
  'video',
  'script',
  'prefab',
  'scene',
  'animation',
  'font',
  'other',
];

export interface PipelineAsset {
  id: string;
  name: string;
  type: PipelineAssetType;
  path: string;
  size: number;
  hash: string;
  version: number;
  createdAt: string;
  source?: string;
  adapted?: {
    normalized: boolean;
    originalName?: string;
    note?: string;
  };
  metadata?: Record<string, unknown>;
}

type PipelineAssetMetadata = Record<string, unknown> & {
  storageObject?: StorageObjectRef;
  storageBackend?: StorageObjectRef['backend'];
  storageScope?: StorageObjectRef['scope'];
  storageRoot?: string;
  storageKey?: string;
  storageChecksum?: string;
};

export interface PipelineAssetMetadataPatch {
  favorite?: boolean;
  tags?: string[];
  collections?: string[];
  notes?: string;
  versionGroupKey?: string;
}

interface AssetDB {
  schemaVersion?: number;
  assetRootNamespace?: string;
  assets: PipelineAsset[];
}

interface RuntimeRegistryAssetEntry {
  asset_id?: unknown;
  asset_path?: unknown;
  category?: unknown;
  preferred_runtime_entry?: unknown;
  runtime_ready?: unknown;
}

interface RuntimeRegistryDocument {
  assets?: RuntimeRegistryAssetEntry[];
}

const ASSET_DB_SCHEMA_VERSION = 2;
const ASSET_DB_FILE_NAME = 'assets-db.json';

function buildAssetRootNamespace(assetRoot = getAssetSystemRoot()) {
  return path.resolve(assetRoot).replace(/\\/g, '/').toLowerCase();
}

export function getAssetDbPath() {
  return getAssetSystemStatePath(ASSET_DB_FILE_NAME);
}

function getLegacyAssetDbPath() {
  return getLegacyAssetSystemStatePath(ASSET_DB_FILE_NAME);
}

function getRuntimeRegistryPath() {
  return (
    process.env.REY30_RUNTIME_REGISTRY_PATH ||
    path.join(process.cwd(), 'assets', 'registro_motor.json')
  );
}

export function getAssetRoot(): string {
  return getAssetSystemRoot();
}

export async function listAssets(): Promise<PipelineAsset[]> {
  const db = await readDB();
  const registryAssets = await readRuntimeRegistryAssets();
  const merged = new Map<string, PipelineAsset>();

  registryAssets.forEach((asset) => {
    merged.set(asset.path, asset);
  });
  db.assets.forEach((asset) => {
    const existing = merged.get(asset.path);
    if (!existing) {
      merged.set(asset.path, asset);
      return;
    }

    merged.set(asset.path, {
      ...existing,
      ...asset,
      source: asset.source ?? existing.source,
      adapted: asset.adapted ?? existing.adapted,
      metadata: {
        ...(existing.metadata ?? {}),
        ...(asset.metadata ?? {}),
      },
    });
  });

  return [...merged.values()];
}

export async function importAssetFromUrl(input: { url: string; name?: string; type?: PipelineAssetType }): Promise<PipelineAsset> {
  await ensureDirs();
  const urlObj = parseHttpUrl(input.url);
  const { response, bytes } = await fetchRemoteBytes({
    provider: 'assets',
    url: urlObj.toString(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch asset: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(bytes);

  const hash = hashBuffer(buffer);
  const type = resolveAssetType(input.type, urlObj.pathname);
  const ext = normalizeExt(urlObj.pathname);
  const baseName = sanitizeName(input.name || path.basename(urlObj.pathname, ext)) || 'asset';

  return runAssetSystemMutation(async () => {
    const db = await readDB();
    const siblings = db.assets.filter((a) => a.name === baseName);
    const version = siblings.length > 0 ? Math.max(...siblings.map((a) => a.version)) + 1 : 1;

    const fileName = `${baseName}_v${version}${ext}`;
    const stored = await putStoredAssetBinary({
      relativePath: path.posix.join(type, fileName),
      data: buffer,
      checksum: hash,
      contentType: response.headers.get('content-type') || undefined,
    });

    const asset: PipelineAsset = {
      id: uuidv4(),
      name: baseName,
      type,
      path: toPipelineAssetPath(stored.filePath),
      size: buffer.length,
      hash,
      version,
      createdAt: new Date().toISOString(),
      source: input.url,
      adapted: {
        normalized: true,
        originalName: path.basename(input.url),
        note: ext !== path.extname(input.url) ? `Normalized ext to ${ext}` : undefined,
      },
      metadata: {
        scope: 'project',
        source: 'remote_import',
        originalName: path.basename(input.url),
        versionGroupKey: buildVersionGroupKey(type, baseName),
      },
    };

    asset.metadata = withManagedAssetStorageMetadata(asset.metadata, stored.storage);

    db.assets.push(asset);
    await writeDB(db);
    return asset;
  });
}

export async function registerAssetFromPath(input: {
  absPath: string;
  name?: string;
  type: PipelineAssetType;
  metadata?: Record<string, unknown>;
  source?: string;
}): Promise<PipelineAsset> {
  await ensureDirs();
  const sourceRelPath = toPipelineAssetPath(input.absPath);
  const buffer = await fs.readFile(input.absPath);
  const hash = hashBuffer(buffer);
  return runAssetSystemMutation(async () => {
    const db = await readDB();
    const stored = await persistManagedAssetBinary({
      absPath: input.absPath,
      buffer,
      checksum: hash,
      contentType: readString(input.metadata?.mimeType) ?? undefined,
      metadata: input.metadata,
    });
    const persistedPath = stored ? toPipelineAssetPath(stored.filePath) : sourceRelPath;
    const existing = db.assets.find(
      (asset) => asset.path === persistedPath || asset.path === sourceRelPath
    );
    if (existing) {
      existing.name = sanitizeName(input.name || existing.name || path.parse(input.absPath).name);
      existing.type = input.type;
      existing.size = buffer.length;
      existing.hash = hash;
      existing.source = input.source ?? existing.source;
      existing.metadata = withManagedAssetStorageMetadata({
        ...(existing.metadata ?? {}),
        ...(input.metadata ?? {}),
        versionGroupKey:
          readString(input.metadata?.versionGroupKey) ??
          readString(existing.metadata?.versionGroupKey) ??
          buildVersionGroupKey(input.type, existing.name),
      }, stored?.storage);
      existing.path = persistedPath;
      await writeDB(db);
      return existing;
    }

    const ext = path.extname(input.absPath).toLowerCase() || '.bin';
    const baseName = sanitizeName(input.name || path.basename(input.absPath, ext));
    const siblings = db.assets.filter((asset) => asset.name === baseName && asset.type === input.type);
    const version = siblings.length > 0 ? Math.max(...siblings.map((asset) => asset.version)) + 1 : 1;

    const asset: PipelineAsset = {
      id: uuidv4(),
      name: baseName,
      type: input.type,
      path: persistedPath,
      size: buffer.length,
      hash,
      version,
      createdAt: new Date().toISOString(),
      source: input.source,
      metadata: normalizeAssetMetadata({
        ...(input.metadata ?? {}),
        versionGroupKey:
          readString(input.metadata?.versionGroupKey) ?? buildVersionGroupKey(input.type, baseName),
      }),
    };

    asset.metadata = withManagedAssetStorageMetadata(asset.metadata, stored?.storage);

    db.assets.push(asset);
    await writeDB(db);
    return asset;
  });
}

export async function updateAssetMetadata(input: {
  assetId?: string;
  relPath?: string;
  metadata: PipelineAssetMetadataPatch;
  replaceEditableFields?: boolean;
}): Promise<PipelineAsset | null> {
  const relPath = input.relPath?.replace(/\\/g, '/').trim() || undefined;
  const assetId = input.assetId?.trim() || undefined;
  if (!relPath && !assetId) {
    return null;
  }

  return runAssetSystemMutation(async () => {
    const db = await readDB();
    let existing = db.assets.find(
      (asset) => (assetId && asset.id === assetId) || (relPath && asset.path === relPath)
    );

    if (!existing) {
      const mergedAssets = await listAssets();
      const sourceAsset = mergedAssets.find(
        (asset) => (assetId && asset.id === assetId) || (relPath && asset.path === relPath)
      );
      if (!sourceAsset) {
        return null;
      }

      existing = {
        ...sourceAsset,
        metadata: {
          ...(sourceAsset.metadata ?? {}),
        },
      };
      db.assets.push(existing);
    }

    const baseMetadata = input.replaceEditableFields
      ? stripEditableMetadataFields(existing.metadata)
      : { ...(existing.metadata ?? {}) };

    existing.metadata = normalizeAssetMetadata({
      ...baseMetadata,
      ...input.metadata,
    });

    await writeDB(db);
    return existing;
  });
}

export async function removeAssetByPath(input: { absPath?: string; relPath?: string }) {
  const relPath =
    input.relPath?.replace(/\\/g, '/') ??
    (input.absPath
      ? path.relative(process.cwd(), input.absPath).replace(/\\/g, '/')
      : null);
  if (!relPath) {
    return false;
  }

  return runAssetSystemMutation(async () => {
    const db = await readDB();
    const initialCount = db.assets.length;
    db.assets = db.assets.filter((asset) => asset.path !== relPath);
    if (db.assets.length === initialCount) {
      return false;
    }

    await writeDB(db);
    return true;
  });
}

// -----------------------------
// Helpers
// -----------------------------

function sanitizeName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
}

function buildVersionGroupKey(type: PipelineAssetType, name: string) {
  return `${type}:${sanitizeName(name).toLowerCase()}`;
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const seen = new Set<string>();
  const normalized = value
    .flatMap((entry) => (typeof entry === 'string' ? [entry] : []))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter((entry) => {
      const key = entry.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.localeCompare(b));

  return normalized;
}

function normalizeAssetMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (key === 'tags' || key === 'collections') {
      next[key] = normalizeStringList(value) ?? [];
      continue;
    }

    if (key === 'favorite') {
      next[key] = Boolean(value);
      continue;
    }

    if (key === 'notes') {
      const normalized = typeof value === 'string' ? value.trim() : '';
      if (normalized) {
        next[key] = normalized;
      }
      continue;
    }

    if (key === 'versionGroupKey') {
      const normalized = readString(value);
      if (normalized) {
        next[key] = normalized.toLowerCase();
      }
      continue;
    }

    next[key] = value;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function stripEditableMetadataFields(metadata: Record<string, unknown> | undefined) {
  const next = { ...(metadata ?? {}) };
  delete next.favorite;
  delete next.tags;
  delete next.collections;
  delete next.notes;
  delete next.versionGroupKey;
  return next;
}

function toPipelineAssetPath(filePath: string) {
  if (path.isAbsolute(filePath)) {
    return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  }

  return filePath.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function getManagedAssetStorageRelativePath(absPath: string): string | null {
  const assetRoot = path.resolve(getAssetRoot());
  const resolvedPath = path.resolve(absPath);
  const relativeToRoot = path.relative(assetRoot, resolvedPath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    return null;
  }

  return relativeToRoot.replace(/\\/g, '/');
}

async function persistManagedAssetBinary(input: {
  absPath: string;
  buffer: Buffer;
  checksum: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
}): Promise<StoredAssetBinaryRecord | null> {
  if (input.metadata?.library === true) {
    return null;
  }

  const relativePath = getManagedAssetStorageRelativePath(input.absPath);
  if (!relativePath) {
    return null;
  }

  return putStoredAssetBinary({
    relativePath,
    data: input.buffer,
    checksum: input.checksum,
    contentType: input.contentType,
  });
}

function buildManagedAssetStorageObject(
  absPath: string,
  checksum?: string
): StorageObjectRef | null {
  const relativePath = getManagedAssetStorageRelativePath(absPath);
  if (!relativePath) {
    return null;
  }

  return {
    key: relativePath,
    backend: 'filesystem',
    scope: 'filesystem',
    root: path.resolve(getAssetRoot()),
    checksum,
  };
}

function withManagedAssetStorageMetadata(
  metadata: Record<string, unknown> | undefined,
  storageObject?: StorageObjectRef | null
) {
  if (!storageObject) {
    return normalizeAssetMetadata(metadata);
  }

  return normalizeAssetMetadata({
    ...(metadata ?? {}),
    storageObject,
    storageBackend: storageObject.backend,
    storageScope: storageObject.scope,
    storageRoot: storageObject.root,
    storageKey: storageObject.key,
    storageChecksum: storageObject.checksum,
  });
}

function isStorageObjectRef(value: unknown): value is StorageObjectRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.key === 'string' &&
    (record.backend === 'filesystem' || record.backend === 'netlify-blobs') &&
    (record.scope === 'filesystem' || record.scope === 'deploy' || record.scope === 'global')
  );
}

export function resolveManagedAssetStorageObject(
  asset: Pick<PipelineAsset, 'path' | 'metadata'>
): StorageObjectRef | null {
  const metadata = (asset.metadata ?? {}) as PipelineAssetMetadata;
  if (isStorageObjectRef(metadata.storageObject)) {
    return {
      ...metadata.storageObject,
      checksum: readString(metadata.storageChecksum) ?? metadata.storageObject.checksum,
    };
  }

  return buildManagedAssetStorageObject(
    resolveManagedAssetAbsolutePath(asset),
    readString(metadata.storageChecksum) ?? undefined
  );
}

export function resolveManagedAssetAbsolutePath(asset: Pick<PipelineAsset, 'path' | 'metadata'>) {
  const metadata = (asset.metadata ?? {}) as PipelineAssetMetadata;
  if (isStorageObjectRef(metadata.storageObject)) {
    if (metadata.storageObject.backend !== 'filesystem') {
      throw new Error('Asset is not stored on the local filesystem');
    }

    const root = metadata.storageObject.root
      ? path.resolve(metadata.storageObject.root)
      : path.resolve(getAssetRoot());
    const filePath = path.resolve(root, metadata.storageObject.key);
    const relativeToRoot = path.relative(root, filePath);
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
      throw new Error('Invalid asset path');
    }
    return filePath;
  }

  const filePath = path.resolve(process.cwd(), asset.path);
  const assetRoot = path.resolve(getAssetRoot());
  const relativeToRoot = path.relative(assetRoot, filePath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error('Invalid asset path');
  }
  return filePath;
}

function normalizeExt(urlOrName: string): string {
  const ext = path.extname(urlOrName).toLowerCase();
  if (!ext) return '.bin';
  if (['.jpeg', '.jpg'].includes(ext)) return '.jpg';
  return ext;
}

function detectTypeFromUrl(url: string): PipelineAssetType {
  const ext = path.extname(url).toLowerCase();
  if (['.fbx', '.obj', '.glb', '.gltf', '.stl'].includes(ext)) return 'mesh';
  if (['.png', '.jpg', '.jpeg', '.tga', '.exr', '.hdr', '.webp'].includes(ext)) return 'texture';
  if (['.wav', '.mp3', '.ogg', '.flac'].includes(ext)) return 'audio';
  if (['.mp4', '.mov', '.webm'].includes(ext)) return 'video';
  if (['.anim', '.bvh'].includes(ext)) return 'animation';
  if (['.ts', '.js', '.lua'].includes(ext)) return 'script';
  if (['.prefab'].includes(ext)) return 'prefab';
  if (['.scene', '.json'].includes(ext)) return 'scene';
  if (['.ttf', '.otf', '.woff'].includes(ext)) return 'font';
  return 'other';
}

function resolveAssetType(type: PipelineAssetType | undefined, urlPath: string): PipelineAssetType {
  if (type) {
    if (!PIPELINE_ASSET_TYPES.includes(type)) {
      throw new Error('Invalid asset type');
    }
    return type;
  }
  return detectTypeFromUrl(urlPath);
}

function parseHttpUrl(rawUrl: string): URL {
  let urlObj: URL;
  try {
    urlObj = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!['http:', 'https:'].includes(urlObj.protocol)) {
    throw new Error('Only http/https URLs are allowed');
  }

  return urlObj;
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(getAssetRoot(), { recursive: true });
}

async function readRuntimeRegistryAssets(): Promise<PipelineAsset[]> {
  let parsed: RuntimeRegistryDocument;
  try {
    const raw = await fs.readFile(getRuntimeRegistryPath(), 'utf-8');
    parsed = JSON.parse(raw) as RuntimeRegistryDocument;
  } catch {
    return [];
  }

  const entries = Array.isArray(parsed.assets) ? parsed.assets : [];
  const resolved = await Promise.all(
    entries.map(async (entry) => mapRuntimeRegistryAsset(entry))
  );

  return resolved.flatMap((asset) => (asset ? [asset] : []));
}

async function mapRuntimeRegistryAsset(
  entry: RuntimeRegistryAssetEntry
): Promise<PipelineAsset | null> {
  if (entry.runtime_ready !== true) {
    return null;
  }

  const assetId = readString(entry.asset_id);
  const assetPath = readString(entry.asset_path);
  const category = readString(entry.category);
  const preferredRuntimeEntry = readString(entry.preferred_runtime_entry);
  if (!assetId || !assetPath || !preferredRuntimeEntry) {
    return null;
  }

  const absPath = path.resolve(process.cwd(), preferredRuntimeEntry);
  const relativeToCwd = path.relative(process.cwd(), absPath);
  if (relativeToCwd.startsWith('..') || path.isAbsolute(relativeToCwd)) {
    return null;
  }

  try {
    const stats = await fs.stat(absPath);
    if (!stats.isFile()) {
      return null;
    }

    const relPath = relativeToCwd.replace(/\\/g, '/');
    return {
      id: `lexury:${assetId}`,
      name: assetId,
      type: detectTypeFromUrl(relPath),
      path: relPath,
      size: stats.size,
      hash: createHash('sha256')
        .update(relPath)
        .update(String(stats.size))
        .update(String(stats.mtimeMs))
        .digest('hex'),
      version: 1,
      createdAt: new Date(stats.mtimeMs).toISOString(),
      source: 'lexury-runtime-registry',
      metadata: {
        library: true,
        scope: 'shared',
        provider: 'lexury',
        runtimeReady: true,
        assetId,
        assetPath,
        category,
        versionGroupKey: buildVersionGroupKey(detectTypeFromUrl(relPath), assetId),
        preferredRuntimeEntry,
        registryPath: path
          .relative(process.cwd(), getRuntimeRegistryPath())
          .replace(/\\/g, '/'),
      },
    };
  } catch {
    return null;
  }
}

async function readDB(): Promise<AssetDB> {
  const currentDb = await readDBAtPath(getAssetDbPath());
  if (currentDb) {
    return currentDb;
  }

  const legacyDb = await readDBAtPath(getLegacyAssetDbPath());
  if (legacyDb) {
    return legacyDb;
  }

  return createAssetDb();
}

async function writeDB(db: AssetDB): Promise<void> {
  const dbPath = getAssetDbPath();
  const normalizedDb = normalizeAssetDb(db);
  await writeJsonFileAtomic(dbPath, normalizedDb);
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function createAssetDb(): AssetDB {
  return {
    schemaVersion: ASSET_DB_SCHEMA_VERSION,
    assetRootNamespace: buildAssetRootNamespace(),
    assets: [],
  };
}

function normalizeAssetDb(db: AssetDB): AssetDB {
  return {
    schemaVersion:
      typeof db.schemaVersion === 'number' ? db.schemaVersion : ASSET_DB_SCHEMA_VERSION,
    assetRootNamespace: readString(db.assetRootNamespace) ?? buildAssetRootNamespace(),
    assets: Array.isArray(db.assets) ? db.assets : [],
  };
}

async function readDBAtPath(dbPath: string): Promise<AssetDB | null> {
  const raw = await readJsonFileAtPath<AssetDB>(dbPath);
  return raw ? normalizeAssetDb(raw) : null;
}
